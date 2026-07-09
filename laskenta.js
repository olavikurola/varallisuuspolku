'use strict';

/* Varallisuuspolku — laskentaydin.
   Ladataan sivulle (classic script ennen app.js:ää), Web Workeriin
   (mc-worker.js: importScripts) ja testeihin (module.exports-vahti lopussa).
   Ei DOM-viittauksia — sama moottori kaikkialla, laskentaa ei duplikoida. */

/* ===================== Vakiot ===================== */

const ASSETS = {
  stocks: { mu: 0.07,  sigma: 0.16 },
  bonds:  { mu: 0.03,  sigma: 0.05 },
  cash:   { mu: 0.015, sigma: 0.01 },
};
const INFLATION = 0.02;

// Suomalainen pääomatulovero (myyntivoittovero): 30 % vuotuisista voitoista
// 30 000 €:oon asti, 34 % ylimenevältä osalta. Nostoista verotetaan vain
// voitto-osuus (arvon ja jäljellä olevan hankintahinnan erotus).
const TAX_LOW = 0.30, TAX_HIGH = 0.34, TAX_BRACKET = 30000;

// Monte Carlo: kiinteät polkukohtaiset siemenet = yhteiset satunnaisluvut
// (CRN). Polku i saa aina saman shokkijonon parametreista riippumatta, joten
// viuhka ja onnistumis-% eivät väpätä säätöjen välillä ja deltat ovat reiluja.
// ÄLÄ sido siementä istuntoon tai suunnitelmaan — se rikkoisi tämän.
const MC_SEED = (i) => 1337 + i * 7919;
const MC_LIVE = 300;   // synkroninen laskenta päälangassa
const MC_FULL = 5000;  // worker-tarkennus irrotuksen jälkeen

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Annuiteettilainan kuukausierä
function loanPayment(principal, annualRate, years) {
  const n = Math.max(1, Math.round(years * 12));
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / n;
  return principal * r / (1 - Math.pow(1 + r, -n));
}

// Siemennetty satunnaisgeneraattori — sama tulos joka renderöinnillä
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pyöristys kahteen merkitsevään numeroon (anonyymi vertailudata)
function round2sig(v) {
  if (!isFinite(v) || v === 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
  return Math.round(v / mag) * mag;
}

// UI-snap: pyöristys askeleen tarkkuuteen
const snapTo = (v, step) => Math.round(v / step) * step;

/* ===================== Allokointimoottori ===================== */

function baseAlloc(st) {
  const s = st.allocStocks / 100;
  const b = Math.min(st.allocBonds / 100, 1 - s);
  return { s, b, c: Math.max(0, 1 - s - b) };
}

// Allokaatio tietyssä iässä: glidepath siirtää osakepainoa korkoihin
// 15 viimeisen työvuoden aikana (pohjakerroin 0.35).
function allocationAt(age, retireAge, st) {
  let { s, b, c } = baseAlloc(st);
  if (st.glide && retireAge != null) {
    const f = clamp((retireAge - age) / 15, 0.35, 1);
    const ns = s * f;
    b += s - ns;
    s = ns;
  }
  return { s, b, c };
}

function portfolioStats(alloc) {
  const mu = alloc.s * ASSETS.stocks.mu + alloc.b * ASSETS.bonds.mu + alloc.c * ASSETS.cash.mu;
  const sigma = alloc.s * ASSETS.stocks.sigma + alloc.b * ASSETS.bonds.sigma + alloc.c * ASSETS.cash.sigma;
  return { mu, sigma };
}

/* ===================== Esikäsittely ===================== */
// Tapahtumista johdetut kuukausisarjat, jotka EIVÄT riipu päätösmuuttujista
// (kuukausisäästö, nostotaso): kertaerät, lainanhoito, velka, omaisuuserät.
// Raahauksen bisektio valmistelee tämän kerran ja ajaa vain runPathia.

function prepareSim(st) {
  const a0 = st.ageNow;
  const a1 = Math.max(st.ageEnd, a0 + 2);
  const months = Math.round((a1 - a0) * 12);

  const retire = st.events.find((e) => e.type === 'retirement') || null;
  const retireAge0 = retire ? retire.age : null;
  // Lakisääteinen työeläke: kuukausitulo, joka pienentää sijoituksista
  // tarvittavaa nostoa. Voi alkaa eri iässä kuin eläkkeelle jäänti.
  const pension = retire && retire.pension > 0 ? Math.max(0, retire.pension) : 0;
  const pensionAge = pension > 0 && retire.pensionAge != null
    ? clamp(retire.pensionAge, a0, a1)
    : (retireAge0 != null ? retireAge0 : a1);
  const taxOn = !!st.tax;
  // Säästön vuosikasvu (palkkakehitys): kuukausisijoitus kasvaa vuosittain
  const g = (st.savingsGrowth || 0) / 100;
  const growth = new Float64Array(months + 1);
  for (let m = 1; m <= months; m++) growth[m] = Math.pow(1 + g, (m - 1) / 12);

  // Kertavaikutukset, lainanhoitoerät ja velkasaldo kuukausittain.
  // Omaisuuserän myynti katkaisee lainan: jäljellä oleva saldo maksetaan
  // myyntihinnasta (salePayoff), eikä eriä makseta myynnin jälkeen.
  // Tavoitepisteet (type 'goal') ovat mittareita — eivät kassavirtaa.
  const lump = new Map();
  const payments = new Float64Array(months + 1);
  const debt = new Float64Array(months + 1);
  const salePayoff = new Map();
  const sellMonthOf = (e) => e.isAsset && e.sellAge != null && e.sellAge > e.age
    ? Math.round((e.sellAge - a0) * 12) : null;
  for (const e of st.events) {
    if (e.type === 'retirement' || e.type === 'goal') continue;
    const m0 = Math.round((e.age - a0) * 12);
    if (m0 < 0 || m0 > months) continue;

    if (e.amount < 0 && e.financing === 'loan') {
      const price = -e.amount;
      const down = clamp(e.down || 0, 0, price);
      lump.set(m0, (lump.get(m0) || 0) - down);
      const principal = price - down;
      const rate = Math.max(0, e.rate || 0);
      const years = Math.max(1, e.years || 10);
      const n = Math.round(years * 12);
      const pmt = loanPayment(principal, rate, years);
      const rm = rate / 100 / 12;
      const mSell = sellMonthOf(e);
      let bal = principal;
      debt[m0] += bal;
      for (let k = 1; k <= n; k++) {
        const m = m0 + k;
        if (mSell != null && m >= mSell) { salePayoff.set(e.id, bal); break; }
        if (m > months) break;
        payments[m] += pmt;
        bal = Math.max(0, bal * (1 + rm) - pmt);
        debt[m] += bal;
      }
    } else {
      lump.set(m0, (lump.get(m0) || 0) + e.amount);
    }

    // Toistuva kuukausivaikutus (esim. lapsen kulut, vuokratulo)
    if (e.recMonthly && e.recYears > 0) {
      const nRec = Math.round(Math.min(e.recYears, 90) * 12);
      for (let k = 1; k <= nRec; k++) {
        const m = m0 + k;
        if (m > months) break;
        payments[m] -= e.recMonthly;
      }
    }
  }

  // Omaisuuserät: ostettu kohde kirjautuu varallisuudeksi ja kehittyy omalla arvonmuutoksellaan
  const assets = new Float64Array(months + 1);
  const assetCats = {
    realEstate: new Float64Array(months + 1),
    vehicles: new Float64Array(months + 1),
    other: new Float64Array(months + 1),
  };
  let hasAssets = false;
  const saleInfos = [];
  for (const e of st.events) {
    if (e.type === 'retirement' || e.type === 'goal' || e.amount >= 0 || !e.isAsset) continue;
    const m0 = Math.round((e.age - a0) * 12);
    if (m0 < 0 || m0 > months) continue;
    hasAssets = true;
    const cat = e.type === 'home' || e.type === 'cottage' ? assetCats.realEstate
      : e.type === 'car' ? assetCats.vehicles
      : assetCats.other;
    const yearly = (1 + (e.appr || 0) / 100) / (st.real ? 1 + INFLATION : 1);
    const apprM = Math.pow(Math.max(0.01, yearly), 1 / 12);
    const mSell = sellMonthOf(e);
    const mEnd = mSell != null ? Math.min(mSell - 1, months) : months;
    let v = -e.amount;
    for (let m = m0; m <= mEnd; m++) {
      assets[m] += v;
      cat[m] += v;
      v *= apprM;
    }
    // Myynti: arvo sijoituksiin, laina pois, myyntivoittovero voitosta.
    // Verotettavaa voittoa rajaa hankintameno-olettama (40 % ≥ 10 v
    // omistuksesta, muuten 20 %) — oma asunto voi olla kokonaan verovapaa.
    if (mSell != null && mSell <= months) {
      const saleValue = v;
      const payoff = salePayoff.get(e.id) || 0;
      let saleTax = 0;
      if (taxOn && !e.sellTaxFree) {
        const gain = Math.max(0, saleValue - (-e.amount));
        const heldY = (mSell - m0) / 12;
        const taxable = Math.min(gain, (heldY >= 10 ? 0.6 : 0.8) * saleValue);
        saleTax = taxable <= TAX_BRACKET
          ? taxable * TAX_LOW
          : TAX_BRACKET * TAX_LOW + (taxable - TAX_BRACKET) * TAX_HIGH;
      }
      lump.set(mSell, (lump.get(mSell) || 0) + saleValue - payoff - saleTax);
      saleInfos.push({ id: e.id, age: a0 + mSell / 12, value: saleValue, payoff, tax: saleTax });
    }
  }
  const hasNet = hasAssets || debt.some((d) => d > 0.5);

  return { a0, a1, months, retire, pension, pensionAge, taxOn, growth, lump, payments, debt, assets, assetCats, saleInfos, hasNet };
}

// Kuukausittaiset tuotto-oletukset annetulla eläkeiällä
// (glidepath voi muuttaa allokaatiota iän myötä)
function buildMu(ctx, st, retAge) {
  const { months, a0 } = ctx;
  const muM = new Float64Array(months + 1);
  const sigA = new Float64Array(months + 1);
  for (let m = 1; m <= months; m++) {
    const { mu, sigma } = portfolioStats(allocationAt(a0 + m / 12, retAge, st));
    muM[m] = Math.pow(1 + mu - (st.real ? INFLATION : 0), 1 / 12) - 1;
    sigA[m] = sigma;
  }
  return { muM, sigA };
}

/* ===================== Kehityspolku ===================== */
// Yksi polku annetulla eläkeiällä, kuukausitulon tarpeella ja säästöllä.
// Työeläke pienentää nostoa; nostoista peritään myyntivoittovero (voitto-osuus).
// clamp0=false sallii negatiivisen varallisuuden (ratkaisimia varten),
// shockFn(m) antaa Monte Carlon satunnaisheiton (muuten deterministinen),
// stopAt=m palauttaa varallisuuden kuukauden m kohdalla (bisektiota varten),
// record(m, w) kirjaa polun MC-matriisiin.

function runPath(ctx, st, withdrawal, retAge, muM, { clamp0 = false, monthlySave = st.monthly, shockFn = null, collect = false, stopAt = null, record = null } = {}) {
  const { a0, months, lump, payments, growth, pension, pensionAge, taxOn } = ctx;
  let w = st.startCapital;
  let basis = st.startCapital; // salkun hankintahinta myyntivoittoveroa varten
  let ytdGain = 0;             // kuluvana vuonna realisoidut voitot (30/34 % raja)
  let taxPaid = 0;
  if (stopAt === 0) return { stopW: w };
  const arr = collect ? [w] : null;
  // Rahavirrat vuositaulukkoa varten (vain collect-ajossa)
  const fl = collect ? {
    contrib: new Float64Array(months + 1), gross: new Float64Array(months + 1),
    tax: new Float64Array(months + 1), pen: new Float64Array(months + 1),
  } : null;
  let depletion = null;
  // Myynti salkusta: pienentää hankintahintaa suhteessa ja palauttaa realisoidun voiton
  const sell = (gross) => {
    if (w <= 0) { w -= gross; return 0; }
    const s = Math.min(gross, w);
    const gain = Math.max(0, (w - basis) / w) * s;
    basis -= basis * (s / w);
    w -= gross;
    return gain;
  };
  for (let m = 1; m <= months; m++) {
    const age = a0 + m / 12;
    if (m % 12 === 1) ytdGain = 0;
    w *= 1 + muM[m] + (shockFn ? shockFn(m) : 0); // tuotto ei muuta hankintahintaa
    if (retAge == null || age <= retAge) {
      // Työuralla lainanhoito vähentää kuukausisäästöä (loput maksetaan palkasta)
      const contrib = Math.max(0, monthlySave * growth[m] - payments[m]);
      w += contrib; basis += contrib;
      if (fl) fl.contrib[m] = contrib;
    } else {
      // Eläkkeellä: kuukausitulon tarve + lainanhoito, josta työeläke kattaa osan
      const pen = age >= pensionAge ? pension : 0;
      const need = withdrawal + payments[m] - pen;
      if (fl) fl.pen[m] = pen;
      if (need <= 0) {
        w -= need; basis -= need; // ylijäämä (eläke > tarve) takaisin salkkuun
        if (fl) fl.contrib[m] = -need;
      } else if (taxOn) {
        const rate = ytdGain >= TAX_BRACKET ? TAX_HIGH : TAX_LOW;
        const gainRatio = w > 0 ? Math.max(0, (w - basis) / w) : 0;
        const gross = need / Math.max(0.35, 1 - gainRatio * rate); // brutto → netto = need veron jälkeen
        const gain = sell(gross);
        taxPaid += gain * rate;
        ytdGain += gain;
        if (fl) { fl.gross[m] = gross; fl.tax[m] = gross - need; }
      } else {
        sell(need);
        if (fl) fl.gross[m] = need;
      }
    }
    if (lump.has(m)) {
      const L = lump.get(m);
      if (L >= 0) { w += L; basis += L; } else sell(-L); // menon rahoitus verotta (kertaerä)
    }
    if (clamp0 && w < 0) { if (depletion == null) depletion = age; w = 0; }
    if (arr) arr.push(w);
    if (record) record(m, w);
    if (stopAt === m) return { stopW: w };
  }
  return { arr, depletion, endW: w, taxPaid, flows: fl };
}

/* ===================== Monte Carlo ===================== */

const SQRT12 = Math.sqrt(12);

// Polun i shokkijono: Box–Muller siemenestä MC_SEED(i). Jonoa kulutetaan
// tasan yksi heitto per kuukausi — CRN säilyy kaikilla parametreilla.
function makeShock(sigA, i) {
  const rand = mulberry32(MC_SEED(i));
  let spare = null;
  const gauss = () => {
    if (spare != null) { const v = spare; spare = null; return v; }
    let u;
    do { u = rand(); } while (u === 0);
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * rand();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
  return (m) => (sigA[m] / SQRT12) * gauss();
}

// Osuus satunnaisista markkinapoluista, joissa varat eivät ehdy.
// Onnistumis-% on monotoninen nostotason ja säästön suhteen (kiinteät
// siemenet), joten bisektio toimii.
function mcSuccess(ctx, st, wd, retAge, muM, sigA, monthlySave, paths) {
  let ok = 0;
  for (let i = 0; i < paths; i++) {
    const shockFn = makeShock(sigA, i);
    if (runPath(ctx, st, wd, retAge, muM, { clamp0: true, monthlySave, shockFn }).depletion == null) ok++;
  }
  return ok / paths;
}

// k. pienin arvo (quickselect, Hoare) — persentiilit ilman täyttä lajittelua
function kthSmallest(a, k) {
  let lo = 0, hi = a.length - 1;
  while (hi > lo) {
    const p = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < p) i++;
      while (a[j] > p) j--;
      if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else return a[k];
  }
  return a[lo];
}

// Täysi MC-ajo: onnistumis-%, viuhka (P10/P90) ja tavoitepisteiden ylitys-
// osuudet SAMASTA polkujoukosta (yhtenäinen malli, CRN).
// goals: [{ age, value }] → osuus poluista, joilla varallisuus ≥ value iässä age.
function mcCollect(ctx, st, wd, retAge, muM, sigA, monthlySave, paths, goals) {
  const { months, a0 } = ctx;
  const buf = new Float32Array((months + 1) * paths); // kk-major: sarake = kuukausi
  let ok = 0;
  for (let i = 0; i < paths; i++) {
    const shockFn = makeShock(sigA, i);
    const record = (m, w) => { buf[m * paths + i] = w; };
    if (runPath(ctx, st, wd, retAge, muM, { clamp0: true, monthlySave, shockFn, record }).depletion == null) ok++;
  }
  for (let i = 0; i < paths; i++) buf[i] = st.startCapital;

  const p10 = new Float64Array(months + 1);
  const p90 = new Float64Array(months + 1);
  const col = new Float32Array(paths);
  const k10 = Math.floor(0.10 * (paths - 1));
  const k90 = Math.ceil(0.90 * (paths - 1));
  for (let m = 0; m <= months; m++) {
    col.set(buf.subarray(m * paths, (m + 1) * paths));
    p10[m] = kthSmallest(col, k10);
    p90[m] = kthSmallest(col, k90);
  }

  let goalShares = null;
  if (goals && goals.length) {
    goalShares = goals.map((gp) => {
      const m = clamp(Math.round((gp.age - a0) * 12), 0, months);
      let c = 0;
      for (let i = 0; i < paths; i++) if (buf[m * paths + i] >= gp.value) c++;
      return c / paths;
    });
  }
  return { successProb: ok / paths, p10, p90, goalShares };
}

/* ===================== Ratkaisijat ===================== */

// Kestävä kuukausitulo: sijoitusvarallisuus 0 € suunnitelman lopussa
// (deterministinen odotuspolku)
function solveSustainable(ctx, st, retAge, muM) {
  const okAt = (x) => runPath(ctx, st, x, retAge, muM, { monthlySave: st.monthly }).endW > 0;
  let lo = 0, hi = 1000;
  while (okAt(hi) && hi < 1e7) hi *= 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (okAt(mid)) lo = mid;
    else hi = mid;
  }
  return Math.max(0, Math.round((lo + hi) / 2));
}

// Yleinen bisektio: hae param, jolla evalAt(param) ≈ target.
// increasing = evalAt kasvava paramin suhteen.
function solveParam(evalAt, target, lo, hi, increasing = true, iters = 24) {
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if ((evalAt(mid) < target) === increasing) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Raahauksen käänteisratkaisija: esikäsittely kerran, per frame vain runPath.
// Palauttaa evaluaattorit odotuspolun arvolle mielivaltaisilla päätösarvoilla.
function makeDragSolver(st, sim) {
  const ctx = prepareSim(st);
  const retAge = sim ? sim.retireAge : (ctx.retire ? ctx.retire.age : null);
  const wd0 = sim ? sim.withdrawal : (ctx.retire ? ctx.retire.withdrawal : 0);
  const { muM } = buildMu(ctx, st, retAge);
  const monthFor = (age) => clamp(Math.round((age - ctx.a0) * 12), 0, ctx.months);
  return {
    ctx, retAge,
    monthFor,
    // varallisuus iässä age säästöllä monthly (nostotaso kiinteä)
    wealthAtMonthly: (monthly, age) =>
      runPath(ctx, st, wd0, retAge, muM, { clamp0: true, monthlySave: monthly, stopAt: monthFor(age) }).stopW,
    // varallisuus iässä age nostotasolla wd (säästö kiinteä)
    wealthAtWd: (wd, age) =>
      runPath(ctx, st, wd, retAge, muM, { clamp0: true, stopAt: monthFor(age) }).stopW,
  };
}

// Tavoitepisteiden deterministinen Ratkaise: pienin kuukausisäästö, jolla
// odotuspolku kulkee jokaisen pisteen kautta — tiukin piste sitoo (suurin
// vaadittu säästö). Palauttaa { monthly, bindingIndex } tai null jos ei
// ratkea rajoissa (esim. piste nostovaiheessa jota säästö ei tavoita).
function solveGoalsMonthly(st, points, sim) {
  if (!points || !points.length) return null;
  const s = makeDragSolver(st, sim);
  const HI = 1e6;
  let req = 0, binding = -1;
  for (let idx = 0; idx < points.length; idx++) {
    const p = points[idx];
    if (s.wealthAtMonthly(0, p.age) >= p.value) continue; // toteutuu ilman säästöä
    if (s.wealthAtMonthly(HI, p.age) < p.value) return null; // ei ratkea rajoissa
    const solved = solveParam((ms) => s.wealthAtMonthly(ms, p.age), p.value, 0, HI, true);
    if (solved > req) { req = solved; binding = idx; }
  }
  return { monthly: Math.max(0, Math.round(req)), bindingIndex: binding };
}

// Varmuustasomoodi: pienin säästö, jolla vähintään conf-osuus MC-poluista
// ylittää pisteen. Karkea haku pienellä polkumäärällä, tarkennus täydellä —
// pysyy alle 3 s:n workerissa. onProgress(0..1) raportoi etenemisen.
function solveGoalsMonthlyConf(st, points, conf, paths, onProgress) {
  if (!points || !points.length) return null;
  const ctx = prepareSim(st);
  const retire = ctx.retire;
  const retAge = retire ? retire.age : null;
  const wd = retire ? retire.withdrawal : 0;
  const { muM, sigA } = buildMu(ctx, st, retAge);
  const coarse = Math.min(500, paths);
  const shareAt = (ms, p, n) => {
    const m = clamp(Math.round((p.age - ctx.a0) * 12), 0, ctx.months);
    let c = 0;
    for (let i = 0; i < n; i++) {
      const shockFn = makeShock(sigA, i);
      if (runPath(ctx, st, wd, retAge, muM, { clamp0: true, monthlySave: ms, shockFn, stopAt: m }).stopW >= p.value) c++;
    }
    return c / n;
  };
  const HI = 1e6;
  const coarseIters = 12, fineIters = 5;
  const total = points.length * (coarseIters + fineIters);
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(done / total); };
  let req = 0, binding = -1;
  for (let idx = 0; idx < points.length; idx++) {
    const p = points[idx];
    if (shareAt(0, p, coarse) >= conf) { done += coarseIters + fineIters; if (onProgress) onProgress(done / total); continue; }
    if (shareAt(HI, p, coarse) < conf) return null;
    // karkea haarukka pienellä polkumäärällä
    let lo = 0, hi = HI;
    for (let i = 0; i < coarseIters; i++) {
      const mid = (lo + hi) / 2;
      if (shareAt(mid, p, coarse) < conf) lo = mid; else hi = mid;
      tick();
    }
    // tarkennus täydellä polkumäärällä karkean haarukan sisällä
    const pad = (hi - lo) * 2;
    let flo = Math.max(0, lo - pad), fhi = Math.min(HI, hi + pad);
    if (shareAt(fhi, p, paths) < conf) { flo = fhi; fhi = HI; }
    for (let i = 0; i < fineIters; i++) {
      const mid = (flo + fhi) / 2;
      if (shareAt(mid, p, paths) < conf) flo = mid; else fhi = mid;
      tick();
    }
    if (fhi > req) { req = fhi; binding = idx; }
  }
  return { monthly: Math.max(0, Math.round(req)), bindingIndex: binding };
}

/* ===================== Simulaattori ===================== */
// opts:
//   paths        MC-polkumäärä (oletus MC_LIVE)
//   light        kevyt raahausframe: ei MC:tä eikä ratkaisijoita — ratkaistut
//                arvot jäädytetään frozen-simistä (periaate: deterministinen
//                per frame, stokastinen irrotettaessa)
//   frozen       edellinen täysi sim, josta jäädytetyt arvot ja viuhka
//   sustainable  laske kestävä kuukausitulo HUDia varten (deterministinen)
//   goals        [{ age, value }] tavoitepisteiden ylitysosuuksia varten

function simulate(st, opts = {}) {
  const paths = opts.paths || MC_LIVE;
  const frozen = opts.frozen || null;
  const light = !!opts.light && !!frozen;

  const ctx = prepareSim(st);
  const { a0, a1, months, retire } = ctx;
  let retireAge = retire ? retire.age : null;

  const out = {
    a0, a1, months, retireAge,
    payments: ctx.payments, debt: ctx.debt,
    pension: ctx.pension, pensionAge: ctx.pensionAge,
    assets: ctx.assets, assetCats: ctx.assetCats,
    saleInfos: ctx.saleInfos, hasNet: ctx.hasNet,
  };

  // Tavoitetila: yksi suure ratkaistaan, muut on lukittu.
  // Varmuustaso (conf) vaihtaa kriteerin odotetusta polusta Monte Carloon.
  const goal = retire ? (retire.goal || 'manual') : 'manual';
  let withdrawal = retire ? retire.withdrawal : 0;
  const conf = retire && goal !== 'manual' && retire.conf >= 0.5 && retire.conf < 1 ? retire.conf : null;
  out.goal = retire ? goal : null;
  out.conf = conf;
  out.solvedWithdrawal = null;
  out.solvedRetireAge = null;
  out.requiredMonthly = null;
  out.goalUnreachable = false;

  if (light) {
    // Raahauksen aikana ratkaistut arvot pysyvät paikoillaan — uusi ratkaisu
    // ajetaan vasta irrotettaessa (pointerup), jotta frame on deterministinen.
    out.solvedWithdrawal = frozen.solvedWithdrawal;
    out.solvedRetireAge = frozen.solvedRetireAge;
    out.requiredMonthly = frozen.requiredMonthly;
    out.goalUnreachable = frozen.goalUnreachable;
    if (goal === 'withdrawal' && frozen.solvedWithdrawal != null) withdrawal = frozen.solvedWithdrawal;
    // goal 'age': retire.age sisältää jo viimeksi ratkaistun iän
  } else if (retire && goal === 'withdrawal') {
    // Kestävä kuukausitulo: sijoitusvarallisuus 0 € suunnitelman lopussa
    // (tai varmuustasolla: suurin nosto jolla onnistumis-% ≥ tavoite)
    const { muM, sigA } = buildMu(ctx, st, retireAge);
    const okAt = conf
      ? (x) => mcSuccess(ctx, st, x, retireAge, muM, sigA, st.monthly, paths) >= conf
      : (x) => runPath(ctx, st, x, retireAge, muM, {}).endW > 0;
    if (conf && !okAt(0)) {
      out.goalUnreachable = true;
      withdrawal = 0;
      out.solvedWithdrawal = 0;
    } else {
      let lo = 0, hi = 1000;
      while (okAt(hi) && hi < 1e7) hi *= 2;
      for (let i = 0; i < (conf ? 18 : 40); i++) {
        const mid = (lo + hi) / 2;
        if (okAt(mid)) lo = mid;
        else hi = mid;
      }
      withdrawal = Math.max(0, Math.round(conf ? lo : (lo + hi) / 2));
      out.solvedWithdrawal = withdrawal;
    }
  } else if (retire && goal === 'age') {
    // Aikaisin eläkeikä: myöhempi eläköityminen kasvattaa loppuvarallisuutta
    // monotonisesti, joten aikaisin kelvollinen kuukausi löytyy binäärihaulla.
    const rMax = months - 12;
    const feasible = (r) => {
      const ra = a0 + r / 12;
      const { muM, sigA } = buildMu(ctx, st, ra);
      return conf
        ? mcSuccess(ctx, st, withdrawal, ra, muM, sigA, st.monthly, paths) >= conf
        : runPath(ctx, st, withdrawal, ra, muM, {}).endW >= 0;
    };
    if (!feasible(rMax)) {
      out.goalUnreachable = true;
    } else {
      let lo = 0, hi = rMax;
      if (feasible(0)) hi = 0;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (feasible(mid)) hi = mid;
        else lo = mid + 1;
      }
      retireAge = a0 + hi / 12;
      retire.age = retireAge; // merkki ja lista seuraavat ratkaisua
      out.solvedRetireAge = retireAge;
    }
  } else if (retire && goal === 'saving') {
    // Tarvittava kuukausisäästö annetulla eläkeiällä ja nostolla
    const { muM, sigA } = buildMu(ctx, st, retireAge);
    const okAt = conf
      ? (ms) => mcSuccess(ctx, st, withdrawal, retireAge, muM, sigA, ms, paths) >= conf
      : (ms) => runPath(ctx, st, withdrawal, retireAge, muM, { monthlySave: ms }).endW >= 0;
    if (okAt(0)) {
      out.requiredMonthly = 0;
    } else {
      let hi = Math.max(100, st.monthly);
      while (!okAt(hi) && hi < 1e6) hi *= 2;
      if (!okAt(hi)) {
        out.goalUnreachable = true;
      } else {
        let lo = 0;
        for (let i = 0; i < (conf ? 18 : 40); i++) {
          const mid = (lo + hi) / 2;
          if (!okAt(mid)) lo = mid;
          else hi = mid;
        }
        out.requiredMonthly = Math.round(hi);
      }
    }
  }
  out.retireAge = retireAge;
  out.withdrawal = withdrawal;

  const { muM, sigA } = buildMu(ctx, st, retireAge);
  const final = runPath(ctx, st, withdrawal, retireAge, muM, { clamp0: true, collect: true });
  const exp = final.arr;
  const depletionAge = final.depletion;
  out.exp = exp;
  out.flows = final.flows;
  out.taxPaid = final.taxPaid + ctx.saleInfos.reduce((a, x) => a + x.tax, 0);

  // Ehtymisjaksot graafin varoitusvyöhykkeiksi
  const dryZones = [];
  if (depletionAge != null) {
    let zs = null;
    for (let m = 1; m <= months; m++) {
      const dry = exp[m] < 0.5;
      if (dry && zs == null) zs = m;
      if (zs != null && (!dry || m === months)) {
        const ze = dry ? m : m - 1;
        if (ze - zs >= 2) dryZones.push({ from: a0 + zs / 12, to: a0 + ze / 12 });
        zs = null;
      }
    }
  }
  out.dryZones = dryZones;

  // Nettovarallisuus = sijoitukset + omaisuuserät − velat
  const net = new Array(months + 1);
  for (let m = 0; m <= months; m++) net[m] = exp[m] + ctx.assets[m] - ctx.debt[m];
  out.net = net;

  // Kestävä kuukausitulo HUDia varten (deterministinen — toimii myös raahatessa)
  if (opts.sustainable && retire) {
    out.sustainableWd = goal === 'withdrawal' && out.solvedWithdrawal != null
      ? out.solvedWithdrawal
      : solveSustainable(ctx, st, retireAge, muM);
  }

  // Viuhka (P10/P90), onnistumis-% ja tavoitepisteiden ylitysosuudet lasketaan
  // SAMASTA MC-polkujoukosta (yhtenäinen malli). Kevyessä framessa käytetään
  // jäädytettyjä arvoja — HUD merkitsee ne vanhentuneiksi.
  if (light && frozen.months === months && frozen.opt && frozen.pess) {
    out.opt = frozen.opt;
    out.pess = frozen.pess;
    out.successProb = frozen.successProb;
    out.successStale = true;
    out.goalShares = frozen.goalShares || null;
    out.mcPaths = frozen.mcPaths;
  } else {
    const mc = mcCollect(ctx, st, withdrawal, retireAge, muM, sigA, st.monthly, paths, opts.goals || null);
    out.successProb = mc.successProb;
    out.successStale = false;
    out.opt = mc.p90;
    out.pess = mc.p10;
    out.goalShares = mc.goalShares;
    out.mcPaths = paths;
  }

  // Sijoitettu pääoma kumulatiivisesti (alkusijoitus + kk-sijoitukset työuralla)
  const invested = [st.startCapital];
  let cum = st.startCapital;
  for (let m = 1; m <= months; m++) {
    const age = a0 + m / 12;
    if (retireAge == null || age <= retireAge) cum += Math.max(0, st.monthly * ctx.growth[m] - ctx.payments[m]);
    invested.push(cum);
  }
  out.invested = invested;
  out.deposits = cum;
  out.depletionAge = depletionAge;

  const retM = retireAge != null ? clamp(Math.round((retireAge - a0) * 12), 0, months) : null;
  out.wAtRet = retM != null ? out.exp[retM] : null;
  out.wEnd = out.exp[months];
  return out;
}

// Workerin MC-tarkennus: onnistumis-%, viuhka ja tavoiteosuudet KIINTEILLÄ
// päätösarvoilla (päälangan ratkaisema withdrawal/retireAge) — ei ratkaisijoita,
// joten kesto skaalautuu lineaarisesti polkumäärään.
function mcBand(st, { paths, withdrawal, retireAge, goals }) {
  const ctx = prepareSim(st);
  const { muM, sigA } = buildMu(ctx, st, retireAge);
  const r = mcCollect(ctx, st, withdrawal, retireAge, muM, sigA, st.monthly, paths, goals || null);
  return { successProb: r.successProb, p10: r.p10, p90: r.p90, goalShares: r.goalShares, months: ctx.months, paths };
}

/* Node-testit */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ASSETS, INFLATION, TAX_LOW, TAX_HIGH, TAX_BRACKET, MC_SEED, MC_LIVE, MC_FULL,
    clamp, loanPayment, mulberry32, round2sig, snapTo,
    baseAlloc, allocationAt, portfolioStats,
    prepareSim, buildMu, runPath, mcSuccess, mcCollect, kthSmallest,
    solveSustainable, solveParam, makeDragSolver, solveGoalsMonthly, solveGoalsMonthlyConf,
    simulate, mcBand,
  };
}
