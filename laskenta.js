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

/* ===================== Pro-tila ===================== */
// Pro avaa oletukset säädettäviksi. proOf(st) palauttaa normalisoidun
// konfiguraation TAI null (perustila). Kaikilla oletusarvoilla laskenta
// on bitilleen sama kuin perustilassa — determinismitestit vartioivat tätä.

const PRO_BASE_ASSETS = [
  { key: 'stocks', name: 'Osakkeet', mu: 7,   sigma: 16 },
  { key: 'bonds',  name: 'Korot',    mu: 3,   sigma: 5 },
  { key: 'cash',   name: 'Käteinen', mu: 1.5, sigma: 1 },
];

// Stressiskenaariot: deterministinen kuukausituotto ikkunan ajan.
// from: 'retire' = alkaa eläkkeelle jäännistä (sekvenssiriski).
const STRESS_DEFS = {
  bear:  { name: 'Karhu heti eläkkeellä',   months: 24,  annual: -0.20, from: 'retire' },
  stagf: { name: 'Stagflaation vuosikymmen', months: 120, annual: 0.02,  from: 'retire' },
  lost:  { name: 'Menetetty vuosikymmen',    months: 120, annual: 0.00,  from: 'retire' },
};

function defaultPro() {
  return {
    assets: [],            // omat lisäluokat: {name, mu, sigma, weight}
    mu: { stocks: 7, bonds: 3, cash: 1.5 },
    sigma: { stocks: 16, bonds: 5, cash: 1 },
    corr: null,            // null = täyskorrelaatio (perusmoottorin käytös)
    infl: 2,
    ter: 0,
    glide: null,           // {from, to, endF} — oma glidepath (ikä→ikä, loppukerroin %)
    tax: { low: 30, high: 34, bracket: 30000, acq: false },
    wd: { mode: 'fixed', pct: 4, band: 20, adj: 10 },
    phases: null,          // [{to, mult}] — kulutuksen vaiheistus (% perustasosta)
    mc: { paths: 5000, pctLo: 10, pctHi: 90, seed: 1337, dist: 'normal', df: 5, stress: [] },
  };
}

const numOr = (v, d, lo, hi) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : d);

// Normalisoi tallennettu pro-objekti täydeksi konfiguraatioksi
function proOf(st) {
  if (!st.proOn || !st.pro) return null;
  const p = st.pro, d = defaultPro();
  const out = defaultPro();
  for (const k of ['stocks', 'bonds', 'cash']) {
    out.mu[k] = numOr(p.mu && p.mu[k], d.mu[k], -10, 25);
    out.sigma[k] = numOr(p.sigma && p.sigma[k], d.sigma[k], 0, 60);
  }
  if (Array.isArray(p.assets)) {
    out.assets = p.assets.slice(0, 3).map((a, i) => ({
      name: typeof a.name === 'string' ? a.name.slice(0, 24) : 'Oma luokka ' + (i + 1),
      mu: numOr(a.mu, 5, -10, 25),
      sigma: numOr(a.sigma, 10, 0, 60),
      weight: numOr(a.weight, 0, 0, 100),
    }));
  }
  const n = 3 + out.assets.length;
  if (Array.isArray(p.corr) && p.corr.length === n * (n - 1) / 2) {
    out.corr = p.corr.map((v) => numOr(v, 0, -0.5, 1));
  }
  out.infl = numOr(p.infl, d.infl, 0, 10);
  out.ter = numOr(p.ter, 0, 0, 3);
  if (p.glide && typeof p.glide === 'object') {
    out.glide = {
      from: numOr(p.glide.from, 50, 18, 100),
      to: numOr(p.glide.to, 70, 18, 105),
      endF: numOr(p.glide.endF, 35, 0, 100),
    };
    if (out.glide.to <= out.glide.from) out.glide.to = out.glide.from + 1;
  }
  if (p.tax) {
    out.tax.low = numOr(p.tax.low, d.tax.low, 0, 70);
    out.tax.high = numOr(p.tax.high, d.tax.high, 0, 70);
    out.tax.bracket = numOr(p.tax.bracket, d.tax.bracket, 0, 1e6);
    out.tax.acq = !!p.tax.acq;
  }
  if (p.wd) {
    out.wd.mode = ['fixed', 'pct', 'guard'].includes(p.wd.mode) ? p.wd.mode : 'fixed';
    out.wd.pct = numOr(p.wd.pct, 4, 0.5, 20);
    out.wd.band = numOr(p.wd.band, 20, 5, 50);
    out.wd.adj = numOr(p.wd.adj, 10, 1, 30);
  }
  if (Array.isArray(p.phases) && p.phases.length) {
    out.phases = p.phases.slice(0, 3).map((r) => ({
      to: numOr(r.to, 200, 18, 200),
      mult: numOr(r.mult, 100, 10, 150),
    })).sort((a, b) => a.to - b.to);
  }
  if (p.mc) {
    out.mc.paths = Math.round(numOr(p.mc.paths, 5000, 300, 20000));
    out.mc.pctLo = numOr(p.mc.pctLo, 10, 1, 49);
    out.mc.pctHi = numOr(p.mc.pctHi, 90, 51, 99);
    out.mc.seed = Math.round(numOr(p.mc.seed, 1337, 1, 1e9));
    out.mc.dist = p.mc.dist === 't' ? 't' : 'normal';
    out.mc.df = Math.round(numOr(p.mc.df, 5, 3, 30));
    out.mc.stress = Array.isArray(p.mc.stress) ? p.mc.stress.filter((k) => STRESS_DEFS[k]).slice(0, 3) : [];
  }
  return out;
}

const inflOf = (st) => {
  const p = proOf(st);
  return p ? p.infl / 100 : INFLATION;
};

// Omaisuusluokat riveinä: 3 perusluokkaa (+ pro-lisäluokat)
function classesOf(st) {
  const p = proOf(st);
  if (!p) return PRO_BASE_ASSETS.map((a) => ({ ...a }));
  return [
    { key: 'stocks', name: 'Osakkeet', mu: p.mu.stocks, sigma: p.sigma.stocks },
    { key: 'bonds',  name: 'Korot',    mu: p.mu.bonds,  sigma: p.sigma.bonds },
    { key: 'cash',   name: 'Käteinen', mu: p.mu.cash,   sigma: p.sigma.cash },
    ...p.assets.map((a, i) => ({ key: 'c' + i, name: a.name, mu: a.mu, sigma: a.sigma })),
  ];
}

// Korrelaatiomatriisi yläkolmiosta; null = täyskorrelaatio (ρ=1 kaikille)
function corrMatrixOf(n, tri) {
  const M = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : (tri ? 0 : 1))));
  if (tri) {
    let k = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { M[i][j] = M[j][i] = tri[k++]; }
  }
  return M;
}

// Positiividefiniittisyys Choleskylla; ei-PSD kutistetaan kohti diagonaalia
function ensurePSD(M) {
  const n = M.length;
  const isPSD = (A) => {
    const L = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 1e-10) return false;
          L[i][i] = Math.sqrt(s);
        } else L[i][j] = s / L[j][j];
      }
    }
    return true;
  };
  let lambda = 1, shrunk = false;
  let A = M;
  while (!isPSD(A) && lambda > 0.05) {
    lambda -= 0.05;
    shrunk = true;
    A = M.map((row, i) => row.map((v, j) => (i === j ? 1 : v * lambda)));
  }
  return { M: A, shrunk };
}

// Painovektori iässä age: glidepath siirtää osakepainoa korkoihin;
// omat luokat pitävät painonsa, käteinen on jäännös
function weightsAt(age, retAge, st) {
  const p = proOf(st);
  let s = st.allocStocks / 100;
  let b = Math.min(st.allocBonds / 100, 1 - s);
  let f = 1;
  if (p && p.glide) {
    const g = p.glide;
    f = age <= g.from ? 1 : age >= g.to ? g.endF / 100
      : 1 - (1 - g.endF / 100) * ((age - g.from) / (g.to - g.from));
  } else if (st.glide && retAge != null) {
    f = clamp((retAge - age) / 15, 0.35, 1);
  }
  const ns = s * f;
  b += s - ns;
  s = ns;
  const custom = p ? p.assets.map((a) => a.weight / 100) : [];
  const cSum = custom.reduce((x, y) => x + y, 0);
  const c = Math.max(0, 1 - s - b - cSum);
  return [s, b, c, ...custom];
}

// Salkun μ ja σ painoilla w: kovarianssi kun korrelaatiot annettu,
// muuten painotettu summa (ρ=1 — perusmoottorin käytös)
function portfolioStatsPro(w, classes, corrM, ter) {
  let mu = 0;
  for (let i = 0; i < w.length; i++) mu += w[i] * classes[i].mu / 100;
  mu -= (ter || 0) / 100;
  let sigma = 0;
  if (corrM) {
    let v = 0;
    for (let i = 0; i < w.length; i++) {
      for (let j = 0; j < w.length; j++) {
        v += w[i] * w[j] * (classes[i].sigma / 100) * (classes[j].sigma / 100) * corrM[i][j];
      }
    }
    sigma = Math.sqrt(Math.max(0, v));
  } else {
    for (let i = 0; i < w.length; i++) sigma += w[i] * classes[i].sigma / 100;
  }
  return { mu, sigma };
}

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

  // Pro: veroparametrit, nostostrategia ja kulutuksen vaiheistus kontekstiin
  const pro = proOf(st);
  const inflO = inflOf(st);
  const taxLow = pro ? pro.tax.low / 100 : TAX_LOW;
  const taxHigh = pro ? pro.tax.high / 100 : TAX_HIGH;
  const taxBracket = pro ? pro.tax.bracket : TAX_BRACKET;
  const taxAcq = !!(pro && pro.tax.acq);
  const wdMode = pro ? pro.wd.mode : 'fixed';
  const wdPctM = pro ? pro.wd.pct / 100 / 12 : 0;
  const wdBand = pro ? pro.wd.band / 100 : 0.2;
  const wdAdj = pro ? pro.wd.adj / 100 : 0.1;
  let phaseMul = null;
  if (pro && pro.phases) {
    phaseMul = new Float64Array(months + 1);
    for (let m = 0; m <= months; m++) {
      const age = a0 + m / 12;
      const row = pro.phases.find((r) => age <= r.to) || pro.phases[pro.phases.length - 1];
      phaseMul[m] = row.mult / 100;
    }
  }

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
    const yearly = (1 + (e.appr || 0) / 100) / (st.real ? 1 + inflO : 1);
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
        saleTax = taxable <= taxBracket
          ? taxable * taxLow
          : taxBracket * taxLow + (taxable - taxBracket) * taxHigh;
      }
      lump.set(mSell, (lump.get(mSell) || 0) + saleValue - payoff - saleTax);
      saleInfos.push({ id: e.id, age: a0 + mSell / 12, value: saleValue, payoff, tax: saleTax });
    }
  }
  const hasNet = hasAssets || debt.some((d) => d > 0.5);

  return { a0, a1, months, retire, pension, pensionAge, taxOn, growth, lump, payments, debt, assets, assetCats, saleInfos, hasNet,
    pro, taxLow, taxHigh, taxBracket, taxAcq, wdMode, wdPctM, wdBand, wdAdj, phaseMul };
}

// Kuukausittaiset tuotto-oletukset annetulla eläkeiällä
// (glidepath voi muuttaa allokaatiota iän myötä). Pro: omat luokat,
// kovarianssi, oma glidepath, TER ja inflaatio-oletus.
function buildMu(ctx, st, retAge) {
  const { months, a0 } = ctx;
  const muM = new Float64Array(months + 1);
  const sigA = new Float64Array(months + 1);
  const p = proOf(st);
  const infl = st.real ? inflOf(st) : 0;
  if (p) {
    const classes = classesOf(st);
    const corrM = p.corr ? ensurePSD(corrMatrixOf(classes.length, p.corr)).M : null;
    for (let m = 1; m <= months; m++) {
      const w = weightsAt(a0 + m / 12, retAge, st);
      const { mu, sigma } = portfolioStatsPro(w, classes, corrM, p.ter);
      muM[m] = Math.pow(1 + mu - infl, 1 / 12) - 1;
      sigA[m] = sigma;
    }
  } else {
    for (let m = 1; m <= months; m++) {
      const { mu, sigma } = portfolioStats(allocationAt(a0 + m / 12, retAge, st));
      muM[m] = Math.pow(1 + mu - infl, 1 / 12) - 1;
      sigA[m] = sigma;
    }
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
  const { a0, months, lump, payments, growth, pension, pensionAge, taxOn,
    taxLow, taxHigh, taxBracket, taxAcq, wdMode, wdPctM, wdBand, wdAdj, phaseMul } = ctx;
  let w = st.startCapital;
  let basis = st.startCapital; // salkun hankintahinta myyntivoittoveroa varten
  let ytdGain = 0;             // kuluvana vuonna realisoidut voitot (30/34 % raja)
  let taxPaid = 0;
  let gw = null, gr0 = 0;      // guardrails: nostotaso ja aloitusprosentti
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
      // Eläkkeellä: kuukausitulo strategian mukaan + lainanhoito, josta
      // työeläke kattaa osan; kulutuksen vaiheistus skaalaa tulotarpeen
      const pen = age >= pensionAge ? pension : 0;
      let income;
      if (wdMode === 'pct') {
        income = Math.max(0, w) * wdPctM; // prosentti salkusta — tulo joustaa
      } else if (wdMode === 'guard') {
        // Guardrails: perustasoa leikataan/korotetaan kun nostoprosentti
        // karkaa aloitusputkesta (tarkistus kerran vuodessa)
        if (gw == null) { gw = withdrawal; gr0 = w > 0 ? (gw * 12) / w : 0; }
        else if (m % 12 === 0 && w > 0 && gr0 > 0) {
          const r = (gw * 12) / w;
          if (r > gr0 * (1 + wdBand)) gw *= 1 - wdAdj;
          else if (r < gr0 * (1 - wdBand)) gw *= 1 + wdAdj;
        }
        income = gw;
      } else income = withdrawal;
      const need = income * (phaseMul ? phaseMul[m] : 1) + payments[m] - pen;
      if (fl) fl.pen[m] = pen;
      if (need <= 0) {
        w -= need; basis -= need; // ylijäämä (eläke > tarve) takaisin salkkuun
        if (fl) fl.contrib[m] = -need;
      } else if (taxOn) {
        const rate = ytdGain >= taxBracket ? taxHigh : taxLow;
        let gainRatio = w > 0 ? Math.max(0, (w - basis) / w) : 0;
        // Hankintameno-olettama nostoihin (Pro): verotettavaa voittoa rajaa
        // 40/20 %-olettama, omistusaika ≈ kuukausia suunnitelman alusta
        if (taxAcq) gainRatio = Math.min(gainRatio, m >= 120 ? 0.6 : 0.8);
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

// Polun i shokkijono siemenestä seed + i·7919. Jonoa kulutetaan
// deterministisesti — CRN säilyy kaikilla parametreilla. Pro: siemen
// vaihdettavissa ja jakaumaksi paksuhäntäinen Studentin t (Baileyn
// polaarimenetelmä, skaalattu yksikkövarianssiin).
function makeShock(st, sigA, i) {
  const p = proOf(st);
  const rand = mulberry32(((p ? p.mc.seed : 1337) + i * 7919) >>> 0);
  if (p && p.mc.dist === 't') {
    const df = p.mc.df;
    const scale = Math.sqrt((df - 2) / df); // var(t_df) = df/(df−2)
    return (m) => {
      let u;
      do { u = rand(); } while (u === 0);
      const t = Math.sqrt(df * (Math.pow(u, -2 / df) - 1)) * Math.cos(2 * Math.PI * rand());
      return (sigA[m] / SQRT12) * t * scale;
    };
  }
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
    const shockFn = makeShock(st, sigA, i);
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
  const pro = proOf(st);
  const buf = new Float32Array((months + 1) * paths); // kk-major: sarake = kuukausi
  const ruin = new Float64Array(months + 1); // ehtymiskäyrä: P(varat ehtyneet ikään mennessä)
  let ok = 0;
  for (let i = 0; i < paths; i++) {
    const shockFn = makeShock(st, sigA, i);
    const record = (m, w) => { buf[m * paths + i] = w; };
    const r = runPath(ctx, st, wd, retAge, muM, { clamp0: true, monthlySave, shockFn, record });
    if (r.depletion == null) ok++;
    else ruin[clamp(Math.round((r.depletion - a0) * 12), 0, months)]++;
  }
  for (let i = 0; i < paths; i++) buf[i] = st.startCapital;
  let cum = 0;
  for (let m = 0; m <= months; m++) { cum += ruin[m]; ruin[m] = cum / paths; }

  const pctLo = pro ? pro.mc.pctLo : 10;
  const pctHi = pro ? pro.mc.pctHi : 90;
  const p10 = new Float64Array(months + 1);
  const p90 = new Float64Array(months + 1);
  const col = new Float32Array(paths);
  const k10 = Math.floor((pctLo / 100) * (paths - 1));
  const k90 = Math.ceil((pctHi / 100) * (paths - 1));
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
  return { successProb: ok / paths, p10, p90, goalShares, ruin, pctLo, pctHi };
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
      const shockFn = makeShock(st, sigA, i);
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
  } else if (retire && goal !== 'manual' && ctx.wdMode === 'pct') {
    // Prosenttistrategiassa salkku ei ehdy → tavoiteratkaisijat eivät ole
    // mielekkäitä; tavoite jää mittariksi ja taso säädetään Pro-kortista
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
  if (opts.sustainable && retire && ctx.wdMode !== 'pct') {
    out.sustainableWd = goal === 'withdrawal' && out.solvedWithdrawal != null
      ? out.solvedWithdrawal
      : solveSustainable(ctx, st, retireAge, muM);
  }

  // Stressiskenaariot: deterministiset polut viuhkan päälle (Pro) — halpoja,
  // joten ne elävät myös raahauksen kevyissä frameissa
  if (ctx.pro && ctx.pro.mc.stress.length && retireAge != null) {
    const m0 = clamp(Math.round((retireAge - a0) * 12), 0, months);
    out.stress = ctx.pro.mc.stress.map((key) => {
      const def = STRESS_DEFS[key];
      const rM = Math.pow(1 + def.annual, 1 / 12) - 1;
      const shockFn = (m) => (m > m0 && m <= m0 + def.months ? rM - muM[m] : 0);
      const r = runPath(ctx, st, withdrawal, retireAge, muM, { clamp0: true, collect: true, shockFn });
      return { key, name: def.name, arr: r.arr, depletion: r.depletion };
    });
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
    out.ruinCurve = frozen.ruinCurve || null;
    out.pctLo = frozen.pctLo;
    out.pctHi = frozen.pctHi;
  } else {
    const mc = mcCollect(ctx, st, withdrawal, retireAge, muM, sigA, st.monthly, paths, opts.goals || null);
    out.successProb = mc.successProb;
    out.successStale = false;
    out.opt = mc.p90;
    out.pess = mc.p10;
    out.goalShares = mc.goalShares;
    out.mcPaths = paths;
    out.ruinCurve = mc.ruin;
    out.pctLo = mc.pctLo;
    out.pctHi = mc.pctHi;
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
  return { successProb: r.successProb, p10: r.p10, p90: r.p90, goalShares: r.goalShares,
    ruin: r.ruin, pctLo: r.pctLo, pctHi: r.pctHi, months: ctx.months, paths };
}

// Kestävä kuukausitulo eläkei'ittäin (Pro-analyysi): deterministinen
// bisektio jokaiselle iälle — "jos jäät eläkkeelle iässä X, kestävä tulo on Y"
function sustainableByAge(st, step = 2) {
  const ctx = prepareSim(st);
  const pts = [];
  const lo = Math.ceil(ctx.a0 + 2);
  const hi = Math.floor(ctx.a1 - 2);
  for (let age = lo; age <= hi; age += step) {
    const { muM } = buildMu(ctx, st, age);
    pts.push({ age, wd: solveSustainable(ctx, st, age, muM) });
  }
  return pts;
}

// Tornado-herkkyys (Pro-analyysi): parametrien tönäisyt ja vaikutus
// loppuvarallisuuteen odotuspolulla. Palauttaa suurimmasta pienimpään.
function tornado(st) {
  const wEnd0 = baseWEnd(st);
  const bump = (mut, label) => {
    const c = JSON.parse(JSON.stringify(st));
    mut(c);
    return { label, delta: baseWEnd(c) - wEnd0 };
  };
  const rows = [];
  const retire = st.events.find((e) => e.type === 'retirement');
  rows.push(bump((c) => { proMuBump(c, 1); }, 'Tuotto-odotus +1 %-yks'));
  rows.push(bump((c) => { proMuBump(c, -1); }, 'Tuotto-odotus −1 %-yks'));
  rows.push(bump((c) => { c.monthly *= 1.1; }, 'Kuukausisäästö +10 %'));
  rows.push(bump((c) => { c.monthly *= 0.9; }, 'Kuukausisäästö −10 %'));
  if (retire) {
    rows.push(bump((c) => { const r = c.events.find((e) => e.type === 'retirement'); r.age = clamp(r.age + 2, c.ageNow + 1, c.ageEnd); }, 'Eläkeikä +2 v'));
    rows.push(bump((c) => { const r = c.events.find((e) => e.type === 'retirement'); r.age = clamp(r.age - 2, c.ageNow + 1, c.ageEnd); }, 'Eläkeikä −2 v'));
    rows.push(bump((c) => { const r = c.events.find((e) => e.type === 'retirement'); r.withdrawal *= 1.1; }, 'Kuukausitulo +10 %'));
    rows.push(bump((c) => { const r = c.events.find((e) => e.type === 'retirement'); r.withdrawal *= 0.9; }, 'Kuukausitulo −10 %'));
  }
  if (st.real || (st.proOn && st.pro)) {
    rows.push(bump((c) => { proInflBump(c, 1); }, 'Inflaatio +1 %-yks'));
  }
  return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// Odotuspolun loppuvarallisuus ilman MC:tä (tornadon evaluointi)
function baseWEnd(st) {
  const ctx = prepareSim(st);
  const retire = ctx.retire;
  const retAge = retire ? retire.age : null;
  const wd = retire ? retire.withdrawal : 0;
  const { muM } = buildMu(ctx, st, retAge);
  return runPath(ctx, st, wd, retAge, muM, { clamp0: true }).endW;
}

// Tuotto-odotuksen tönäisy: Pro-tilassa kaikkiin luokkiin, muuten
// väliaikaisen pro-konfiguraation kautta (perusoletukset + delta)
function proMuBump(c, d) {
  if (!c.proOn || !c.pro) { c.proOn = true; c.pro = defaultPro(); }
  if (!c.pro.mu) c.pro.mu = { stocks: 7, bonds: 3, cash: 1.5 };
  for (const k of ['stocks', 'bonds', 'cash']) c.pro.mu[k] = (c.pro.mu[k] != null ? c.pro.mu[k] : defaultPro().mu[k]) + d;
  if (Array.isArray(c.pro.assets)) for (const a of c.pro.assets) a.mu = (a.mu || 0) + d;
}

function proInflBump(c, d) {
  if (!c.proOn || !c.pro) { c.proOn = true; c.pro = defaultPro(); }
  c.pro.infl = (c.pro.infl != null ? c.pro.infl : 2) + d;
}

/* ===================== Kotitalous (Perhevirta v1) ===================== */
// Koherentti kotitalous-MC: SAMA markkinahistoria kaikille — henkilön 1
// siemen ja jakauma jaetaan, joten polku i antaa saman shokkijonon z_m
// jokaiselle kuukaudelle, ja kukin salkku reagoi omalla σ:llaan.
// Molempien simulaatiot alkavat tästä hetkestä → kuukausi-indeksi m on
// sama kalenterikuukausi kaikille (ei uudelleengridausta).
// Henkilön horisontin jälkeen varallisuus jäädytetään viimeiseen arvoon.

function mcHousehold(states, { paths = MC_LIVE } = {}) {
  const ctxs = states.map((st) => prepareSim(st));
  const mus = ctxs.map((c, k) => buildMu(c, states[k], c.retire ? c.retire.age : null));
  const months = Math.max(...ctxs.map((c) => c.months));
  // Yhteinen maailma: shokit henkilön 1 asetuksilla (siemen, jakauma)
  const shockSt = states[0];
  const buf = new Float32Array((months + 1) * paths);
  const last = new Float64Array(states.length);
  let ok = 0;
  for (let i = 0; i < paths; i++) {
    let allSurvive = true;
    for (let k = 0; k < states.length; k++) {
      const shockFn = makeShock(shockSt, mus[k].sigA, i);
      last[k] = states[k].startCapital;
      const record = (m, w) => { buf[m * paths + i] += w; last[k] = w; };
      const wd = ctxs[k].retire ? ctxs[k].retire.withdrawal : 0;
      const retAge = ctxs[k].retire ? ctxs[k].retire.age : null;
      const r = runPath(ctxs[k], states[k], wd, retAge, mus[k].muM, { clamp0: true, shockFn, record });
      if (r.depletion != null) allSurvive = false;
      // horisontin jälkeen: jäädytetty loppuarvo mukaan summaan
      for (let m = ctxs[k].months + 1; m <= months; m++) buf[m * paths + i] += last[k];
    }
    if (allSurvive) ok++;
  }
  const startSum = states.reduce((s, st) => s + st.startCapital, 0);
  for (let i = 0; i < paths; i++) buf[i] = startSum;

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
  return { successProb: ok / paths, p10, p90, months };
}

// Perheen deterministinen yhteiskäyrä: odotuspolkujen summa, horisontin
// jälkeen henkilön viimeinen arvo jäädytettynä
function householdExp(sims) {
  const months = Math.max(...sims.map((s) => s.months));
  const total = new Float64Array(months + 1);
  for (const s of sims) {
    for (let m = 0; m <= months; m++) total[m] += s.exp[Math.min(m, s.months)];
  }
  return total;
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
    defaultPro, proOf, inflOf, classesOf, weightsAt, portfolioStatsPro,
    corrMatrixOf, ensurePSD, STRESS_DEFS, PRO_BASE_ASSETS,
    sustainableByAge, tornado, baseWEnd,
    mcHousehold, householdExp,
  };
}
