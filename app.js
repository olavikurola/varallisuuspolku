'use strict';

/* ===================== Vakiot ===================== */

const ASSETS = {
  stocks: { mu: 0.07,  sigma: 0.16 },
  bonds:  { mu: 0.03,  sigma: 0.05 },
  cash:   { mu: 0.015, sigma: 0.01 },
};
const INFLATION = 0.02;
const BAND_Z = 0.5; // skenaariohaarukan leveys: ±z·σ·√t

// loan: oletusrahoitus lainalla { share: käsirahan osuus, rate: %/v, years: laina-aika }
const CONSUMER_LOAN = { share: 0.3, rate: 8.0, years: 5 };
const EVENT_TYPES = {
  study:       { icon: '🎓', label: 'Opiskelu',            amount: -15000,  loan: { share: 0,    rate: 1.0, years: 10 }, defaultFin: 'loan' },
  home:        { icon: '🏠', label: 'Asunnon osto',        amount: -220000, loan: { share: 0.15, rate: 3.5, years: 25 }, defaultFin: 'loan', asset: { appr: 2.0 } },
  car:         { icon: '🚗', label: 'Auton osto',          amount: -25000,  loan: { share: 0.2,  rate: 4.5, years: 6 },  defaultFin: 'loan', asset: { appr: -10.0 } },
  wedding:     { icon: '💍', label: 'Häät',                amount: -20000,  loan: CONSUMER_LOAN, defaultFin: 'cash' },
  child:       { icon: '👶', label: 'Lapsi',               amount: -10000,  loan: CONSUMER_LOAN, defaultFin: 'cash' },
  renovation:  { icon: '🛠️', label: 'Remontti',            amount: -30000,  loan: { share: 0.1,  rate: 4.5, years: 10 }, defaultFin: 'loan' },
  travel:      { icon: '✈️', label: 'Unelmamatka',         amount: -8000,   loan: CONSUMER_LOAN, defaultFin: 'cash' },
  cottage:     { icon: '🏡', label: 'Mökki / vene',        amount: -120000, loan: { share: 0.25, rate: 4.0, years: 15 }, defaultFin: 'loan', asset: { appr: 2.0 } },
  inheritance: { icon: '💎', label: 'Perintö / lahja',     amount: 60000 },
  bonus:       { icon: '💰', label: 'Bonus / myyntivoitto', amount: 20000 },
  retirement:  { icon: '🌴', label: 'Eläkkeelle jäänti',   withdrawal: 1800, unique: true },
};

// Annuiteettilainan kuukausierä
function loanPayment(principal, annualRate, years) {
  const n = Math.max(1, Math.round(years * 12));
  const r = annualRate / 100 / 12;
  if (r === 0) return principal / n;
  return principal * r / (1 - Math.pow(1 + r, -n));
}

function initLoanFields(ev) {
  const def = EVENT_TYPES[ev.type].loan || CONSUMER_LOAN;
  const price = Math.max(0, -ev.amount);
  if (ev.down == null) ev.down = Math.round(price * def.share);
  if (ev.rate == null) ev.rate = def.rate;
  if (ev.years == null) ev.years = def.years;
}

let idSeq = 1;

const state = {
  ageNow: 30,
  ageEnd: 90,
  startCapital: 20000,
  monthly: 1000,
  allocStocks: 70,
  allocBonds: 20,
  glide: false,
  real: false,
  events: [
    { id: idSeq++, type: 'home', age: 35, amount: -220000, financing: 'loan', down: 33000, rate: 3.5, years: 25, isAsset: true, appr: 2.0 },
    { id: idSeq++, type: 'car',  age: 45, amount: -25000,  financing: 'loan', down: 5000,  rate: 4.5, years: 6,  isAsset: true, appr: -10.0 },
    { id: idSeq++, type: 'retirement', age: 65, withdrawal: 1800 },
  ],
};

/* ===================== Apurit ===================== */

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const eurFmt = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtEur = (v) => eurFmt.format(Math.round(v));

function fmtCompact(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return sign + (a / 1e6).toLocaleString('fi-FI', { maximumFractionDigits: a >= 1e7 ? 0 : 1 }) + ' M€';
  if (a >= 1e3) return sign + Math.round(a / 1e3) + ' t€';
  return sign + Math.round(a) + ' €';
}

const pctFmt = (v) => (v * 100).toLocaleString('fi-FI', { maximumFractionDigits: 1 }) + ' %';

const NAME_MAX = 40;
// Tapahtuman näyttönimi: oma nimi tai tyypin oletusnimi
const evLabel = (ev) => (ev.name && ev.name.trim()) || EVENT_TYPES[ev.type].label;

// Eläketapahtuman tavoitetila: manual | withdrawal | age | saving
const retGoal = (ev) => ev.goal || 'manual';

function fmtAge(a) {
  const y = Math.floor(a);
  const mo = Math.round((a - y) * 12);
  if (mo >= 12) return `${y + 1} v`;
  return mo === 0 ? `${y} v` : `${y} v ${mo} kk`;
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

/* ===================== Allokointimoottori ===================== */

function baseAlloc() {
  const s = state.allocStocks / 100;
  const b = Math.min(state.allocBonds / 100, 1 - s);
  return { s, b, c: Math.max(0, 1 - s - b) };
}

// Allokaatio tietyssä iässä: glidepath siirtää osakepainoa korkoihin
// 15 viimeisen työvuoden aikana (pohjakerroin 0.35).
function allocationAt(age, retireAge) {
  let { s, b, c } = baseAlloc();
  if (state.glide && retireAge != null) {
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

/* ===================== Simulaattori ===================== */
// Kuukausitason simulointi: korkoa korolle, kuukausisijoitukset,
// kertaluonteiset tapahtumat ja eläkeajan nostot.

function simulate() {
  const a0 = state.ageNow;
  const a1 = Math.max(state.ageEnd, a0 + 2);
  const months = Math.round((a1 - a0) * 12);

  const retire = state.events.find((e) => e.type === 'retirement') || null;
  let retireAge = retire ? retire.age : null;

  // Kertavaikutukset, lainanhoitoerät ja velkasaldo kuukausittain
  const lump = new Map();
  const payments = new Float64Array(months + 1);
  const debt = new Float64Array(months + 1);
  for (const e of state.events) {
    if (e.type === 'retirement') continue;
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
      let bal = principal;
      debt[m0] += bal;
      for (let k = 1; k <= n; k++) {
        const m = m0 + k;
        if (m > months) break;
        payments[m] += pmt;
        bal = Math.max(0, bal * (1 + rm) - pmt);
        debt[m] += bal;
      }
    } else {
      lump.set(m0, (lump.get(m0) || 0) + e.amount);
    }
  }
  const out = { a0, a1, months, retireAge, payments, debt };

  // Omaisuuserät: ostettu kohde kirjautuu varallisuudeksi ja kehittyy omalla arvonmuutoksellaan
  const assets = new Float64Array(months + 1);
  const assetCats = {
    realEstate: new Float64Array(months + 1),
    vehicles: new Float64Array(months + 1),
    other: new Float64Array(months + 1),
  };
  let hasAssets = false;
  for (const e of state.events) {
    if (e.type === 'retirement' || e.amount >= 0 || !e.isAsset) continue;
    const m0 = Math.round((e.age - a0) * 12);
    if (m0 < 0 || m0 > months) continue;
    hasAssets = true;
    const cat = e.type === 'home' || e.type === 'cottage' ? assetCats.realEstate
      : e.type === 'car' ? assetCats.vehicles
      : assetCats.other;
    const yearly = (1 + (e.appr || 0) / 100) / (state.real ? 1 + INFLATION : 1);
    const apprM = Math.pow(Math.max(0.01, yearly), 1 / 12);
    let v = -e.amount;
    for (let m = m0; m <= months; m++) {
      assets[m] += v;
      cat[m] += v;
      v *= apprM;
    }
  }
  out.assets = assets;
  out.assetCats = assetCats;
  out.hasNet = hasAssets || debt.some((d) => d > 0.5);

  // Kuukausittaiset tuotto-oletukset annetulla eläkeiällä
  // (glidepath voi muuttaa allokaatiota iän myötä)
  function buildMu(retAge) {
    const muM = new Float64Array(months + 1);
    const sigA = new Float64Array(months + 1);
    for (let m = 1; m <= months; m++) {
      const { mu, sigma } = portfolioStats(allocationAt(a0 + m / 12, retAge));
      muM[m] = Math.pow(1 + mu - (state.real ? INFLATION : 0), 1 / 12) - 1;
      sigA[m] = sigma;
    }
    return { muM, sigA };
  }

  // Odotettu kehityspolku annetulla eläkeiällä, nostolla ja kuukausisäästöllä.
  // clamp0=false sallii negatiivisen varallisuuden (ratkaisimia varten).
  function runPath(withdrawal, retAge, muM, clamp0, monthlySave) {
    let w = state.startCapital;
    const arr = [w];
    let depletion = null;
    for (let m = 1; m <= months; m++) {
      const age = a0 + m / 12;
      w *= 1 + muM[m];
      if (retAge == null || age <= retAge) {
        // Työuralla lainanhoito vähentää kuukausisäästöä (loput maksetaan palkasta)
        w += Math.max(0, monthlySave - payments[m]);
      } else {
        // Eläkkeellä nostot ja lainanhoito maksetaan sijoituksista
        w -= withdrawal + payments[m];
      }
      if (lump.has(m)) w += lump.get(m);

      if (clamp0 && w < 0) {
        if (depletion == null) depletion = age;
        w = 0;
      }
      arr.push(w);
    }
    return { arr, depletion, endW: arr[months] };
  }

  // Tavoitetila: yksi suure ratkaistaan, muut on lukittu
  const goal = retire ? retGoal(retire) : 'manual';
  let withdrawal = retire ? retire.withdrawal : 0;
  out.goal = retire ? goal : null;
  out.solvedWithdrawal = null;
  out.solvedRetireAge = null;
  out.requiredMonthly = null;
  out.goalUnreachable = false;

  if (retire && goal === 'withdrawal') {
    // Kestävä nosto: varallisuus 0 € suunnitelman lopussa
    const { muM } = buildMu(retireAge);
    let lo = 0, hi = 1000;
    while (runPath(hi, retireAge, muM, false, state.monthly).endW > 0 && hi < 1e7) hi *= 2;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (runPath(mid, retireAge, muM, false, state.monthly).endW > 0) lo = mid;
      else hi = mid;
    }
    withdrawal = Math.max(0, Math.round((lo + hi) / 2));
    out.solvedWithdrawal = withdrawal;
  } else if (retire && goal === 'age') {
    // Aikaisin eläkeikä: myöhempi eläköityminen kasvattaa loppuvarallisuutta
    // monotonisesti, joten aikaisin kelvollinen kuukausi löytyy binäärihaulla.
    // Eläkkeen on kestettävä vähintään vuosi — muuten "ratkaisu" olisi
    // eläköityminen suunnitelman viime hetkillä ilman yhtään nostoa.
    const rMax = months - 12;
    const feasible = (r) => {
      const ra = a0 + r / 12;
      return runPath(withdrawal, ra, buildMu(ra).muM, false, state.monthly).endW >= 0;
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
    const { muM } = buildMu(retireAge);
    const endW = (ms) => runPath(withdrawal, retireAge, muM, false, ms).endW;
    if (endW(0) >= 0) {
      out.requiredMonthly = 0;
    } else {
      let hi = Math.max(100, state.monthly);
      while (endW(hi) < 0 && hi < 1e6) hi *= 2;
      if (endW(hi) < 0) {
        out.goalUnreachable = true;
      } else {
        let lo = 0;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2;
          if (endW(mid) < 0) lo = mid;
          else hi = mid;
        }
        out.requiredMonthly = Math.round(hi);
      }
    }
  }
  out.retireAge = retireAge;
  out.withdrawal = withdrawal;

  const { muM, sigA } = buildMu(retireAge);
  const final = runPath(withdrawal, retireAge, muM, true, state.monthly);
  const exp = final.arr;
  const depletionAge = final.depletion;
  out.exp = exp;

  // Nettovarallisuus = sijoitukset + omaisuuserät − velat
  const net = new Array(months + 1);
  for (let m = 0; m <= months; m++) net[m] = exp[m] + assets[m] - debt[m];
  out.net = net;

  // Vaihteluväli: epävarmuus kasvaa ajan neliöjuuressa (±z·σ·√t)
  const opt = [exp[0]], pess = [exp[0]];
  for (let m = 1; m <= months; m++) {
    const spread = BAND_Z * sigA[m] * Math.sqrt(m / 12);
    opt.push(exp[m] * Math.exp(spread));
    pess.push(exp[m] * Math.exp(-spread));
  }
  out.opt = opt;
  out.pess = pess;

  // Monte Carlo: osuus satunnaisista markkinapoluista, joissa varat eivät ehdy
  const N_MC = 300;
  const SQRT12 = Math.sqrt(12);
  const rand = mulberry32(1337);
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
  let okCount = 0;
  for (let i = 0; i < N_MC; i++) {
    let w = state.startCapital;
    let alive = true;
    for (let m = 1; m <= months; m++) {
      const age = a0 + m / 12;
      w *= 1 + muM[m] + (sigA[m] / SQRT12) * gauss();
      if (retireAge == null || age <= retireAge) {
        w += Math.max(0, state.monthly - payments[m]);
      } else {
        w -= withdrawal + payments[m];
      }
      if (lump.has(m)) w += lump.get(m);
      if (w < 0) { alive = false; break; }
    }
    if (alive) okCount++;
  }
  out.successProb = okCount / N_MC;

  // Sijoitettu pääoma kumulatiivisesti (alkusijoitus + kk-sijoitukset työuralla)
  const invested = [state.startCapital];
  let cum = state.startCapital;
  for (let m = 1; m <= months; m++) {
    const age = a0 + m / 12;
    if (retireAge == null || age <= retireAge) cum += Math.max(0, state.monthly - payments[m]);
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

/* ===================== Graafi ===================== */

const wrap = $('chartWrap');
const svg = $('chart');
const tooltip = $('tooltip');
const popover = $('popover');
const balPanel = $('balancePanel');
const balWrap = $('balanceWrap');
const balSvg = $('balanceChart');
const SVG_NS = 'http://www.w3.org/2000/svg';

let sim = null;
let scaleX = null, scaleY = null, invX = null;
let plot = { l: 64, r: 26, t: 20, b: 48, w: 0, h: 0, W: 0, H: 0 };
let openPopoverId = null;
let draggingId = null;
let hoverLine = null, hoverDot = null, balHoverLine = null;

function el(name, attrs, parent) {
  const n = document.createElementNS(SVG_NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

function arcPath(cx, cy, r0, r1, ang0, ang1) {
  const large = ang1 - ang0 > Math.PI ? 1 : 0;
  const p = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(r1, ang0)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, ang1)} L ${p(r0, ang1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, ang0)} Z`;
}

function niceStep(range, target) {
  const raw = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (pow * m >= raw) return pow * m;
  }
  return pow * 10;
}

function renderChart() {
  sim = simulate();
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (W < 50 || H < 50) return;
  plot.W = W; plot.H = H;
  plot.w = W - plot.l - plot.r;
  plot.h = H - plot.t - plot.b;

  const { a0, a1, months } = sim;
  const yMax = Math.max(10000, Math.max(...sim.opt, ...sim.invested)) * 1.08;

  scaleX = (age) => plot.l + ((age - a0) / (a1 - a0)) * plot.w;
  scaleY = (v) => plot.t + plot.h - (v / yMax) * plot.h;
  invX = (px) => a0 + ((px - plot.l) / plot.w) * (a1 - a0);

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  /* defs */
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'lineGrad', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
  el('stop', { offset: '0%', 'stop-color': '#2dd4bf' }, grad);
  el('stop', { offset: '100%', 'stop-color': '#8b7cf6' }, grad);
  const agrad = el('linearGradient', { id: 'areaGrad', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
  el('stop', { offset: '0%', 'stop-color': 'rgba(45,212,191,0.22)' }, agrad);
  el('stop', { offset: '100%', 'stop-color': 'rgba(45,212,191,0)' }, agrad);

  /* eläkevyöhyke */
  if (sim.retireAge != null && sim.retireAge < a1) {
    const rx = scaleX(sim.retireAge);
    el('rect', {
      x: rx, y: plot.t, width: plot.l + plot.w - rx, height: plot.h,
      fill: 'rgba(139,124,246,0.055)',
    }, svg);
  }

  /* ruudukko + akselit */
  const yStep = niceStep(yMax, 5);
  for (let v = 0; v <= yMax; v += yStep) {
    const y = scaleY(v);
    el('line', { x1: plot.l, y1: y, x2: plot.l + plot.w, y2: y, class: 'grid-line' }, svg);
    const t = el('text', { x: plot.l - 10, y: y + 4, 'text-anchor': 'end', class: 'axis-text' }, svg);
    t.textContent = fmtCompact(v);
  }
  const span = a1 - a0;
  const xStep = span > 45 ? 10 : span > 20 ? 5 : span > 10 ? 2 : 1;
  const yearNow = new Date().getFullYear();
  for (let age = Math.ceil(a0 / xStep) * xStep; age <= a1; age += xStep) {
    const x = scaleX(age);
    el('line', { x1: x, y1: plot.t, x2: x, y2: plot.t + plot.h, class: 'grid-line-x' }, svg);
    const t1 = el('text', { x, y: plot.t + plot.h + 20, 'text-anchor': 'middle', class: 'axis-text' }, svg);
    t1.textContent = age + ' v';
    const t2 = el('text', { x, y: plot.t + plot.h + 34, 'text-anchor': 'middle', class: 'axis-text axis-year' }, svg);
    t2.textContent = yearNow + Math.round(age - a0);
  }

  const pt = (arr, i) => `${scaleX(a0 + i / 12).toFixed(1)},${scaleY(arr[i]).toFixed(1)}`;

  /* vaihteluväli */
  let band = `M ${pt(sim.opt, 0)}`;
  for (let i = 1; i <= months; i++) band += ` L ${pt(sim.opt, i)}`;
  for (let i = months; i >= 0; i--) band += ` L ${pt(sim.pess, i)}`;
  el('path', { d: band + ' Z', fill: 'rgba(45,212,191,0.10)', stroke: 'none' }, svg);

  /* odotetun kehityksen alue + viiva */
  let line = `M ${pt(sim.exp, 0)}`;
  for (let i = 1; i <= months; i++) line += ` L ${pt(sim.exp, i)}`;
  el('path', {
    d: line + ` L ${scaleX(a1).toFixed(1)},${scaleY(0)} L ${scaleX(a0).toFixed(1)},${scaleY(0)} Z`,
    fill: 'url(#areaGrad)', stroke: 'none',
  }, svg);

  /* sijoitettu pääoma */
  let inv = `M ${pt(sim.invested, 0)}`;
  for (let i = 1; i <= months; i++) inv += ` L ${pt(sim.invested, i)}`;
  el('path', { d: inv, fill: 'none', stroke: '#8fa0c4', 'stroke-width': 1.6, 'stroke-dasharray': '5 5', opacity: 0.75 }, svg);

  el('path', { d: line, fill: 'none', stroke: 'url(#lineGrad)', 'stroke-width': 3, 'stroke-linejoin': 'round' }, svg);

  /* eläkeviiva */
  if (sim.retireAge != null && sim.retireAge >= a0 && sim.retireAge <= a1) {
    const rx = scaleX(sim.retireAge);
    el('line', { x1: rx, y1: plot.t, x2: rx, y2: plot.t + plot.h, stroke: 'rgba(139,124,246,0.5)', 'stroke-width': 1.5, 'stroke-dasharray': '3 5' }, svg);
  }

  /* hover-taso tooltipille (markereiden alle) */
  const overlay = el('rect', { x: plot.l, y: plot.t, width: plot.w, height: plot.h, fill: 'transparent' }, svg);
  overlay.addEventListener('pointermove', (e) => {
    if (draggingId != null) return;
    const rect = svg.getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, plot.l, plot.l + plot.w);
    updateCrosshair(px, e.clientY - wrap.getBoundingClientRect().top);
  });
  overlay.addEventListener('pointerleave', hideCrosshair);

  hoverLine = el('line', { x1: 0, y1: plot.t, x2: 0, y2: plot.t + plot.h, stroke: 'rgba(232,237,248,0.25)', 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' }, svg);
  hoverDot = el('circle', { r: 4.5, fill: '#2dd4bf', stroke: '#0a0e1a', 'stroke-width': 2, opacity: 0, 'pointer-events': 'none' }, svg);

  /* tapahtumamerkit — päällekkäisyys pinotaan ylöspäin */
  const sorted = [...state.events].sort((x, y) => x.age - y.age);
  let lastX = -1e9, level = 0;
  for (const ev of sorted) {
    const def = EVENT_TYPES[ev.type];
    const age = clamp(ev.age, a0, a1);
    const m = clamp(Math.round((age - a0) * 12), 0, months);
    const x = scaleX(age);
    const cy = scaleY(sim.exp[m]);
    level = x - lastX < 40 ? level + 1 : 0;
    lastX = x;
    const y = Math.max(plot.t + 22, cy - 34 - level * 42);

    const g = el('g', { class: 'marker', 'data-id': ev.id }, svg);
    el('line', { x1: x, y1: y + 17, x2: x, y2: cy, stroke: 'rgba(148,168,220,0.35)', 'stroke-width': 1.2 }, g);
    el('circle', { cx: x, cy: cy, r: 3.5, fill: ev.type === 'retirement' ? '#8b7cf6' : '#2dd4bf' }, g);
    el('circle', {
      class: 'bg', cx: x, cy: y, r: 17,
      fill: '#141c33',
      stroke: ev.id === openPopoverId ? '#2dd4bf' : (ev.type === 'retirement' ? 'rgba(139,124,246,0.7)' : 'rgba(148,168,220,0.35)'),
      'stroke-width': 1.5,
    }, g);
    const ico = el('text', { x, y: y + 5.5, 'text-anchor': 'middle', 'font-size': 15 }, g);
    ico.textContent = def.icon;
    const title = el('title', {}, g);
    let tdesc;
    if (ev.type === 'retirement') {
      const g = retGoal(ev);
      const wd = g === 'withdrawal' && sim.solvedWithdrawal != null ? sim.solvedWithdrawal : ev.withdrawal;
      tdesc = '−' + fmtEur(wd) + '/kk' + (g === 'withdrawal' ? ' (varat loppuun)' : g === 'age' ? ' (aikaisin eläkeikä)' : '');
    } else if (ev.amount < 0 && ev.financing === 'loan') {
      const pmt = loanPayment(Math.max(0, -ev.amount - (ev.down || 0)), ev.rate || 0, ev.years || 10);
      tdesc = `${fmtEur(ev.amount)} · lainalla ${fmtEur(pmt)}/kk`;
    } else {
      tdesc = fmtEur(ev.amount);
    }
    title.textContent = `${evLabel(ev)} · ${Math.round(ev.age)} v · ${tdesc}`;

    g.addEventListener('pointerdown', (e) => startMarkerDrag(e, ev));
  }

  renderBalance();
  if (openPopoverId != null) positionPopover();
}

/* ===================== Jaettu kohdistin ===================== */

function updateCrosshair(px, localY) {
  if (!sim || !hoverLine) return;
  const { a0, months } = sim;
  const m = clamp(Math.round((invX(px) - a0) * 12), 0, months);
  const age = a0 + m / 12;
  const x = scaleX(age);
  const yearNow = new Date().getFullYear();

  hoverLine.setAttribute('x1', x); hoverLine.setAttribute('x2', x); hoverLine.setAttribute('opacity', 1);
  hoverDot.setAttribute('cx', x); hoverDot.setAttribute('cy', scaleY(sim.exp[m])); hoverDot.setAttribute('opacity', 1);
  if (balHoverLine) { balHoverLine.setAttribute('x1', x); balHoverLine.setAttribute('x2', x); balHoverLine.setAttribute('opacity', 1); }

  tooltip.innerHTML =
    `<div class="tt-age">Ikä ${Math.round(age)} v · ${yearNow + Math.round(age - a0)}</div>` +
    `<div class="tt-row"><span>Sijoitukset</span><b class="hl">${fmtEur(sim.exp[m])}</b></div>` +
    `<div class="tt-row"><span>Vaihteluväli</span><b>${fmtCompact(sim.pess[m])} – ${fmtCompact(sim.opt[m])}</b></div>` +
    `<div class="tt-row"><span>Sijoitettu</span><b>${fmtEur(sim.invested[m])}</b></div>` +
    (sim.assets[m] > 0.5 ? `<div class="tt-row"><span>Omaisuus</span><b class="ast">${fmtEur(sim.assets[m])}</b></div>` : '') +
    (sim.debt[m] > 0.5 ? `<div class="tt-row"><span>Velkaa</span><b class="dbt">−${fmtEur(sim.debt[m])}</b></div>` : '') +
    (sim.payments[m] > 0.5 ? `<div class="tt-row"><span>Lainanhoito</span><b class="dbt">${fmtEur(sim.payments[m])}/kk</b></div>` : '') +
    (sim.hasNet ? `<div class="tt-row tt-net"><span>Netto yhteensä</span><b class="net">${fmtEur(sim.net[m])}</b></div>` : '');
  tooltip.hidden = false;
  const tw = tooltip.offsetWidth;
  let tx = x + 16;
  if (tx + tw > plot.W - 10) tx = x - tw - 16;
  tooltip.style.left = clamp(tx, 8, Math.max(8, plot.W - tw - 8)) + 'px';
  tooltip.style.top = clamp(localY != null ? localY - 30 : 14, 10, Math.max(10, plot.H - 150)) + 'px';

  if (distMonth !== m) {
    distMonth = m;
    renderDist();
  }
}

function hideCrosshair() {
  tooltip.hidden = true;
  for (const n of [hoverLine, hoverDot, balHoverLine]) if (n) n.setAttribute('opacity', 0);
}

/* ===================== Tase-paneeli ===================== */
// Vuositason pylväät: sijoitukset + omaisuus nollaviivan yläpuolella,
// velka alapuolella, nettovarallisuus käyränä.

function renderBalance() {
  if (!sim) return;
  balHoverLine = null;
  balPanel.hidden = !sim.hasNet;
  if (!sim.hasNet || balPanel.classList.contains('collapsed')) return;

  const W = balWrap.clientWidth, H = balWrap.clientHeight;
  if (W < 50 || H < 40) return;
  const { a0, a1, months } = sim;
  const t = 8, b = 6;
  const plotH = H - t - b;

  let posMax = 10000, negMax = 0;
  for (let m = 0; m <= months; m++) {
    posMax = Math.max(posMax, sim.exp[m] + sim.assets[m]);
    negMax = Math.max(negMax, sim.debt[m]);
  }
  const total = posMax + negMax;
  const k = plotH / total;
  const zeroY = t + posMax * k;

  balSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  balSvg.innerHTML = '';

  /* vaakaviivat: nolla + yksi taso ylös */
  const step = niceStep(posMax, 2);
  for (let v = step; v <= posMax; v += step) {
    const y = zeroY - v * k;
    el('line', { x1: plot.l, y1: y, x2: plot.l + plot.w, y2: y, class: 'grid-line' }, balSvg);
    const lbl = el('text', { x: plot.l - 10, y: y + 4, 'text-anchor': 'end', class: 'axis-text' }, balSvg);
    lbl.textContent = fmtCompact(v);
  }
  el('line', { x1: plot.l, y1: zeroY, x2: plot.l + plot.w, y2: zeroY, stroke: 'rgba(148,168,220,0.35)', 'stroke-width': 1 }, balSvg);
  const zl = el('text', { x: plot.l - 10, y: zeroY + 4, 'text-anchor': 'end', class: 'axis-text' }, balSvg);
  zl.textContent = '0 €';

  /* vuosipylväät */
  const y0 = Math.ceil(a0), y1 = Math.floor(a1);
  const nYears = Math.max(1, y1 - y0 + 1);
  const barW = clamp((plot.w / nYears) * 0.62, 2, 14);
  for (let y = y0; y <= y1; y++) {
    const m = clamp(Math.round((y - a0) * 12), 0, months);
    const x = scaleX(y) - barW / 2;
    const hInv = sim.exp[m] * k;
    const hAst = sim.assets[m] * k;
    const hDebt = sim.debt[m] * k;
    if (hInv > 0.4) el('rect', { x, y: zeroY - hInv, width: barW, height: hInv, fill: 'rgba(45,212,191,0.7)' }, balSvg);
    if (hAst > 0.4) el('rect', { x, y: zeroY - hInv - hAst, width: barW, height: hAst, fill: 'rgba(96,165,250,0.7)' }, balSvg);
    if (hDebt > 0.4) el('rect', { x, y: zeroY, width: barW, height: hDebt, fill: 'rgba(248,113,113,0.7)' }, balSvg);
  }

  /* nettokäyrä */
  let netPath = '';
  for (let m = 0; m <= months; m++) {
    netPath += `${m === 0 ? 'M' : ' L'} ${scaleX(a0 + m / 12).toFixed(1)},${(zeroY - sim.net[m] * k).toFixed(1)}`;
  }
  el('path', { d: netPath, fill: 'none', stroke: '#fbbf24', 'stroke-width': 2, 'stroke-linejoin': 'round', opacity: 0.9 }, balSvg);

  /* kohdistin + hover */
  balHoverLine = el('line', { x1: 0, y1: t, x2: 0, y2: t + plotH, stroke: 'rgba(232,237,248,0.25)', 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' }, balSvg);
  const overlay = el('rect', { x: plot.l, y: 0, width: plot.w, height: H, fill: 'transparent' }, balSvg);
  overlay.addEventListener('pointermove', (e) => {
    const rect = balSvg.getBoundingClientRect();
    updateCrosshair(clamp(e.clientX - rect.left, plot.l, plot.l + plot.w), null);
  });
  overlay.addEventListener('pointerleave', hideCrosshair);
  balSvg.insertBefore(overlay, balHoverLine);
}

/* ===================== Varallisuusjakauma ===================== */
// Donitsikaavio omaisuusluokittain valitussa iässä; seuraa kohdistinta.

let distMonth = null;

function renderDist() {
  if (!sim) return;
  const distSvg = $('distChart');
  const list = $('distList');
  const { a0, months, retireAge } = sim;
  const m = distMonth != null
    ? clamp(distMonth, 0, months)
    : retireAge != null ? clamp(Math.round((retireAge - a0) * 12), 0, months) : months;
  const age = a0 + m / 12;

  const alloc = allocationAt(age, retireAge);
  const inv = sim.exp[m];
  const cats = sim.assetCats;
  const slices = [
    { l: 'Osakkeet',     v: inv * alloc.s,       c: '#2dd4bf' },
    { l: 'Korot',        v: inv * alloc.b,       c: '#8b7cf6' },
    { l: 'Käteinen',     v: inv * alloc.c,       c: '#8fa0c4' },
    { l: 'Kiinteistöt',  v: cats.realEstate[m],  c: '#60a5fa' },
    { l: 'Ajoneuvot',    v: cats.vehicles[m],    c: '#fb923c' },
    { l: 'Muu omaisuus', v: cats.other[m],       c: '#f472b6' },
  ].filter((s) => s.v > 0.5);
  const total = slices.reduce((sum, s) => sum + s.v, 0);

  distSvg.innerHTML = '';
  if (total <= 0) {
    list.innerHTML = '<div class="event-empty">Ei varallisuutta valitussa iässä.</div>';
    return;
  }

  const cx = 70, cy = 70, r1 = 66, r0 = 45;
  if (slices.length === 1) {
    el('circle', { cx, cy, r: (r0 + r1) / 2, fill: 'none', stroke: slices[0].c, 'stroke-width': r1 - r0, opacity: 0.9 }, distSvg);
  } else {
    let a = -Math.PI / 2;
    const gap = 0.035;
    for (const s of slices) {
      const a1 = a + (s.v / total) * Math.PI * 2;
      const from = a + gap / 2;
      const to = Math.max(from + 0.005, a1 - gap / 2);
      el('path', { d: arcPath(cx, cy, r0, r1, from, to), fill: s.c, opacity: 0.9 }, distSvg);
      a = a1;
    }
  }
  const t1 = el('text', { x: cx, y: cy - 1, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#e8edf8' }, distSvg);
  t1.textContent = fmtCompact(total);
  const t2 = el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', 'font-size': 11, fill: '#9aa7c4' }, distSvg);
  t2.textContent = Math.round(age) + ' v';

  let html = slices.map((s) =>
    `<div class="dist-row"><span class="dist-dot" style="background:${s.c}"></span>` +
    `<span class="dl">${s.l}</span><span class="dp">${Math.round((s.v / total) * 100)} %</span>` +
    `<span class="dv">${fmtCompact(s.v)}</span></div>`
  ).join('');
  if (sim.debt[m] > 0.5) {
    html += `<div class="dist-row dist-extra"><span class="dist-dot" style="background:rgba(248,113,113,0.7)"></span>` +
      `<span class="dl">Velka</span><span class="dv dbt">−${fmtCompact(sim.debt[m])}</span></div>` +
      `<div class="dist-row"><span class="dist-dot" style="background:#fbbf24"></span>` +
      `<span class="dl">Netto</span><span class="dv net">${fmtCompact(sim.net[m])}</span></div>`;
  }
  list.innerHTML = html;
}

/* ===================== Merkin raahaus ===================== */

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; renderChart(); renderStats(); renderEventList(); renderDist(); });
}

function startMarkerDrag(e, ev) {
  e.preventDefault();
  e.stopPropagation();
  const startPX = e.clientX;
  let moved = false;
  draggingId = ev.id;
  tooltip.hidden = true;

  const onMove = (e2) => {
    if (Math.abs(e2.clientX - startPX) > 4) moved = true;
    if (!moved) return;
    const rect = svg.getBoundingClientRect();
    const age = Math.round(invX(clamp(e2.clientX - rect.left, plot.l, plot.l + plot.w)));
    if (age !== ev.age) {
      // Käsin siirretty ikä ohittaa eläkeikätavoitteen
      if (ev.type === 'retirement' && retGoal(ev) === 'age') ev.goal = 'manual';
      ev.age = clamp(age, state.ageNow, state.ageEnd);
      scheduleRender();
    }
  };
  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    draggingId = null;
    if (!moved) openPopover(ev.id);
    else renderAll();
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

/* ===================== Paletin raahaus ===================== */

function buildPalette() {
  const pal = $('palette');
  pal.innerHTML = '';
  for (const [type, def] of Object.entries(EVENT_TYPES)) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.title = def.label;
    chip.innerHTML = `<span class="ic">${def.icon}</span><span>${def.label}</span>`;
    chip.addEventListener('pointerdown', (e) => startPaletteDrag(e, type));
    pal.appendChild(chip);
  }
}

function startPaletteDrag(e, type) {
  e.preventDefault();
  const def = EVENT_TYPES[type];
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.innerHTML = `<span class="ic">${def.icon}</span><span>${def.label}</span>`;
  document.body.appendChild(ghost);
  const dropHint = $('dropHint');

  const overPlot = (e2) => {
    const r = svg.getBoundingClientRect();
    const x = e2.clientX - r.left, y = e2.clientY - r.top;
    return x >= plot.l && x <= plot.l + plot.w && y >= 0 && y <= plot.H;
  };

  const onMove = (e2) => {
    ghost.style.left = e2.clientX + 'px';
    ghost.style.top = e2.clientY + 'px';
    wrap.classList.toggle('drop-target', overPlot(e2));
  };
  onMove(e);
  dropHint.hidden = false;

  const onUp = (e2) => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    ghost.remove();
    dropHint.hidden = true;
    wrap.classList.remove('drop-target');
    if (overPlot(e2)) {
      const r = svg.getBoundingClientRect();
      const age = clamp(Math.round(invX(e2.clientX - r.left)), state.ageNow, state.ageEnd);
      addEvent(type, age);
    }
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

function addEvent(type, age) {
  const def = EVENT_TYPES[type];
  let ev;
  if (def.unique) {
    ev = state.events.find((e) => e.type === type);
    if (ev) {
      if (retGoal(ev) === 'age') ev.goal = 'manual';
      ev.age = age;
    }
  }
  if (!ev) {
    ev = { id: idSeq++, type, age };
    if (def.withdrawal != null) {
      ev.withdrawal = def.withdrawal;
    } else {
      ev.amount = def.amount;
      ev.financing = def.defaultFin || 'cash';
      if (ev.financing === 'loan') initLoanFields(ev);
      if (def.asset) { ev.isAsset = true; ev.appr = def.asset.appr; }
    }
    state.events.push(ev);
  }
  renderAll();
  openPopover(ev.id);
}

/* ===================== Popover ===================== */

function openPopover(id) {
  const ev = state.events.find((e) => e.id === id);
  if (!ev) return;
  openPopoverId = id;
  const def = EVENT_TYPES[ev.type];

  let fields;
  if (ev.type === 'retirement') {
    const g = retGoal(ev);
    const wdSolved = g === 'withdrawal';
    const ageSolved = g === 'age';
    const wdVal = wdSolved && sim && sim.solvedWithdrawal != null ? sim.solvedWithdrawal : ev.withdrawal;
    const ageVal = ageSolved ? Math.round(ev.age * 10) / 10 : Math.round(ev.age);
    const goalBtns = [
      ['manual', 'Kokeilen itse'], ['withdrawal', 'Kestävä nosto'],
      ['age', 'Eläkeikä'], ['saving', 'Tarvittava säästö'],
    ].map(([k, lbl]) => `<button type="button" data-goal="${k}" class="${g === k ? 'on' : ''}">${lbl}</button>`).join('');
    const goalNotes = {
      manual: 'Säädä ikää ja nostoa vapaasti ja katso riittävätkö varat.',
      withdrawal: 'Ikä lukittu — nosto mitoitetaan niin, että varallisuus on 0&nbsp;€ suunnitelman lopussa.',
      age: 'Nosto lukittu — lasketaan aikaisin eläkeikä, jolla varat riittävät suunnitelman loppuun.',
      saving: 'Ikä ja nosto lukittu — lasketaan kuukausisäästö, jolla varat riittävät suunnitelman loppuun.',
    };
    fields =
      `<p class="note">Kuukausisijoitukset päättyvät ja nostot alkavat tästä iästä.</p>` +
      `<div class="field"><span class="field-label">Tavoite</span><div class="seg seg-goal" id="pv-goals">${goalBtns}</div></div>` +
      `<p class="note">${goalNotes[g]}</p>` +
      `<label class="field"><span class="field-label">${ageSolved ? 'Aikaisin eläkeikä (laskettu)' : 'Eläkkeelle jäänti-ikä'}</span>` +
      `<span class="input"><input id="pv-age" type="number" min="${state.ageNow}" max="${state.ageEnd}" step="1" value="${ageVal}" ${ageSolved ? 'disabled' : ''} /><em>v</em></span></label>` +
      `<label class="field"><span class="field-label">${wdSolved ? 'Kestävä nosto (laskettu)' : 'Nosto sijoituksista'}</span>` +
      `<span class="input"><input id="pv-wd" type="number" min="0" step="100" value="${wdVal}" ${wdSolved ? 'disabled' : ''} /><em>€/kk</em></span></label>` +
      (g === 'saving' || g === 'age' ? `<p class="note req-note" id="pv-req"></p>` : '');
  } else {
    fields =
      `<label class="field"><span class="field-label">Ikä</span>` +
      `<span class="input"><input id="pv-age" type="number" min="${state.ageNow}" max="${state.ageEnd}" step="1" value="${Math.round(ev.age)}" /><em>v</em></span></label>` +
      `<label class="field"><span class="field-label">Vaikutus varallisuuteen (− kulu, + tulo)</span>` +
      `<span class="input"><input id="pv-amount" type="number" step="1000" value="${ev.amount}" /><em>€</em></span></label>`;

    if (ev.amount < 0) {
      const isLoan = ev.financing === 'loan';
      fields +=
        `<div class="field"><span class="field-label">Rahoitus</span>` +
        `<div class="seg"><button type="button" id="pv-fin-cash" class="${isLoan ? '' : 'on'}">Säästöistä</button>` +
        `<button type="button" id="pv-fin-loan" class="${isLoan ? 'on' : ''}">Lainalla</button></div></div>`;
      if (isLoan) {
        initLoanFields(ev);
        fields +=
          `<label class="field"><span class="field-label">Käsiraha (säästöistä)</span>` +
          `<span class="input"><input id="pv-down" type="number" min="0" step="1000" value="${ev.down}" /><em>€</em></span></label>` +
          `<div class="row2">` +
          `<label class="field"><span class="field-label">Korko</span>` +
          `<span class="input"><input id="pv-rate" type="number" min="0" max="25" step="0.1" value="${ev.rate}" /><em>%/v</em></span></label>` +
          `<label class="field"><span class="field-label">Laina-aika</span>` +
          `<span class="input"><input id="pv-years" type="number" min="1" max="40" step="1" value="${ev.years}" /><em>v</em></span></label>` +
          `</div>` +
          `<p class="note loan-note" id="pv-loan-note"></p>`;
      }
      fields +=
        `<label class="toggle" style="margin-top:12px"><input id="pv-asset" type="checkbox" ${ev.isAsset ? 'checked' : ''} /><span class="switch"></span>` +
        `<span>Kertyy omaisuudeksi <small>arvo lasketaan mukaan nettovarallisuuteen</small></span></label>`;
      if (ev.isAsset) {
        fields +=
          `<label class="field" style="margin-top:10px"><span class="field-label">Arvonmuutos</span>` +
          `<span class="input"><input id="pv-appr" type="number" min="-30" max="15" step="0.5" value="${ev.appr != null ? ev.appr : 2}" /><em>%/v</em></span></label>`;
      }
    }
  }

  const nameField =
    `<label class="field"><span class="field-label">Nimi</span>` +
    `<span class="input"><input id="pv-name" type="text" maxlength="${NAME_MAX}" placeholder="${escapeHtml(def.label)}" /></span></label>`;

  popover.innerHTML =
    `<h3><span>${def.icon}</span><span id="pv-title">${escapeHtml(evLabel(ev))}</span><button class="close" id="pv-close">✕</button></h3>` +
    nameField +
    fields +
    `<div class="actions"><button class="del" id="pv-del">Poista</button></div>`;
  popover.hidden = false;

  $('pv-name').value = ev.name || '';
  $('pv-name').addEventListener('input', (e) => {
    const v = e.target.value.trim().slice(0, NAME_MAX);
    if (v) ev.name = v; else delete ev.name;
    $('pv-title').textContent = evLabel(ev);
    renderEventList();
    saveState();
  });
  $('pv-close').addEventListener('click', closePopover);
  $('pv-del').addEventListener('click', () => {
    state.events = state.events.filter((e) => e.id !== id);
    closePopover();
    renderAll();
  });
  $('pv-age').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.age = clamp(v, state.ageNow, state.ageEnd); renderAllKeepPopover(); }
  });
  const am = $('pv-amount');
  if (am) am.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) {
      ev.amount = v;
      if (ev.financing === 'loan') ev.down = clamp(ev.down || 0, 0, Math.max(0, -v));
      updateLoanNote();
      renderAllKeepPopover();
    }
  });
  const wd = $('pv-wd');
  if (wd) wd.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.withdrawal = Math.max(0, v); renderAllKeepPopover(); }
  });
  const goalsBox = $('pv-goals');
  if (goalsBox) for (const b of goalsBox.querySelectorAll('button')) {
    b.addEventListener('click', () => {
      ev.goal = b.dataset.goal;
      renderAllKeepPopover();
      openPopover(id);
    });
  }

  const updateLoanNote = () => {
    const note = $('pv-loan-note');
    if (!note) return;
    const price = Math.max(0, -ev.amount);
    const principal = Math.max(0, price - clamp(ev.down || 0, 0, price));
    const pmt = loanPayment(principal, ev.rate || 0, ev.years || 10);
    const interest = pmt * Math.round((ev.years || 10) * 12) - principal;
    note.innerHTML = `Laina <b>${fmtEur(principal)}</b> · maksuerä <b>${fmtEur(pmt)}/kk</b> · korkoa yhteensä <b>${fmtEur(interest)}</b>`;
  };
  updateLoanNote();

  const finCash = $('pv-fin-cash');
  if (finCash) finCash.addEventListener('click', () => {
    ev.financing = 'cash';
    renderAllKeepPopover();
    openPopover(id);
  });
  const finLoan = $('pv-fin-loan');
  if (finLoan) finLoan.addEventListener('click', () => {
    ev.financing = 'loan';
    initLoanFields(ev);
    renderAllKeepPopover();
    openPopover(id);
  });
  const down = $('pv-down');
  if (down) down.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.down = clamp(v, 0, Math.max(0, -ev.amount)); updateLoanNote(); renderAllKeepPopover(); }
  });
  const rate = $('pv-rate');
  if (rate) rate.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.rate = clamp(v, 0, 25); updateLoanNote(); renderAllKeepPopover(); }
  });
  const years = $('pv-years');
  if (years) years.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.years = clamp(v, 1, 40); updateLoanNote(); renderAllKeepPopover(); }
  });
  const assetToggle = $('pv-asset');
  if (assetToggle) assetToggle.addEventListener('change', (e) => {
    ev.isAsset = e.target.checked;
    if (ev.isAsset && ev.appr == null) {
      const adef = EVENT_TYPES[ev.type].asset;
      ev.appr = adef ? adef.appr : 2.0;
    }
    renderAllKeepPopover();
    openPopover(id);
  });
  const appr = $('pv-appr');
  if (appr) appr.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.appr = clamp(v, -30, 15); renderAllKeepPopover(); }
  });

  updateSolvedFields();
  positionPopover();
}

// Ratkaistut arvot avoimen popoverin lukittuihin kenttiin ja tulosriville
function updateSolvedFields() {
  if (!sim) return;
  const wd = $('pv-wd');
  if (wd && wd.disabled && sim.solvedWithdrawal != null) wd.value = sim.solvedWithdrawal;
  const ag = $('pv-age');
  if (ag && ag.disabled && sim.solvedRetireAge != null) ag.value = Math.round(sim.solvedRetireAge * 10) / 10;
  const req = $('pv-req');
  if (!req) return;
  if (sim.goal === 'saving') {
    req.innerHTML = sim.requiredMonthly != null
      ? `Tavoitteeseen tarvitaan <b>${fmtEur(sim.requiredMonthly)}/kk</b> · nyt säästät ${fmtEur(state.monthly)}/kk`
      : 'Tavoite ei toteudu — nosto on liian suuri millään realistisella säästöllä.';
  } else if (sim.goal === 'age') {
    req.innerHTML = sim.solvedRetireAge != null
      ? `Aikaisin eläkeikä <b>${fmtAge(sim.solvedRetireAge)}</b> nostolla ${fmtEur(sim.withdrawal)}/kk`
      : 'Tavoite ei toteudu — nosto ei onnistu edes suunnitelman lopussa.';
  }
}

function positionPopover() {
  const ev = state.events.find((e) => e.id === openPopoverId);
  if (!ev || !scaleX) return;
  const x = scaleX(clamp(ev.age, sim.a0, sim.a1));
  let left = x + 26;
  if (left + 260 > plot.W) left = x - 276;
  popover.style.left = clamp(left, 8, plot.W - 258) + 'px';
  popover.style.top = '14px';
}

function closePopover() {
  openPopoverId = null;
  popover.hidden = true;
  renderChart();
}

function renderAllKeepPopover() {
  renderChart();
  renderStats();
  renderEventList();
  renderDist();
  updateSolvedFields();
  saveState();
}

document.addEventListener('pointerdown', (e) => {
  if (openPopoverId == null) return;
  if (popover.contains(e.target)) return;
  if (e.target.closest && e.target.closest('.marker, .event-row')) return;
  closePopover();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  closePopover();
  closeSummary();
  $('infoModal').hidden = true;
});

/* ===================== Tunnusluvut ===================== */

function renderStats() {
  const s = sim || simulate();
  const cards = [];

  cards.push({
    k: 'Varallisuus eläkkeellä',
    v: s.wAtRet != null ? fmtEur(s.wAtRet) : '–',
    cls: 'accent',
    s: s.retireAge != null ? `${Math.round(s.retireAge)} v iässä` : 'ei eläketapahtumaa',
  });
  cards.push({
    k: `Sijoitukset ${Math.round(s.a1)} v iässä`,
    v: fmtEur(s.wEnd),
    cls: '',
    s: state.real ? 'nykyrahassa' : 'nimellisarvo',
  });
  if (s.hasNet) {
    cards.push({
      k: `Netto ${Math.round(s.a1)} v iässä`,
      v: fmtEur(s.net[s.months]),
      cls: 'net',
      s: 'sijoitukset + omaisuus − velat',
    });
  }
  cards.push({
    k: 'Sijoitettu yhteensä',
    v: fmtEur(s.deposits),
    cls: '',
    s: `${fmtEur(state.monthly)}/kk + alkupääoma`,
  });
  if (s.goal === 'age') {
    cards.push(s.solvedRetireAge != null
      ? { k: 'Aikaisin eläkeikä', v: fmtAge(s.solvedRetireAge), cls: 'accent', s: `nostolla ${fmtEur(s.withdrawal)}/kk` }
      : { k: 'Aikaisin eläkeikä', v: 'Ei toteudu', cls: 'bad', s: 'nosto ei onnistu edes suunnitelman lopussa' });
  }
  if (s.goal === 'saving') {
    cards.push(s.requiredMonthly != null
      ? { k: 'Tarvittava säästö', v: `${fmtEur(s.requiredMonthly)}/kk`, cls: s.requiredMonthly > state.monthly ? 'accent' : 'ok', s: `nyt ${fmtEur(state.monthly)}/kk` }
      : { k: 'Tarvittava säästö', v: 'Ei toteudu', cls: 'bad', s: 'nosto on liian suuri tällä eläkeiällä' });
  }
  if (s.solvedWithdrawal != null && (s.depletionAge == null || s.depletionAge >= s.a1 - 1)) {
    cards.push({ k: 'Kestävä nosto', v: `${fmtEur(s.solvedWithdrawal)}/kk`, cls: 'accent', s: `varat käytetty loppuun ${Math.round(s.a1)} v mennessä` });
  } else if (s.depletionAge != null) {
    cards.push({ k: 'Riittävyys', v: `Ehtyy ~${Math.round(s.depletionAge)} v`, cls: 'bad', s: 'kokeile siirtää tapahtumia tai lisätä säästöä' });
  } else {
    cards.push({ k: 'Riittävyys', v: 'Varat riittävät ✓', cls: 'ok', s: `suunnitelman loppuun (${Math.round(s.a1)} v)` });
  }

  if (s.successProb != null) {
    const p = Math.round(s.successProb * 100);
    cards.push({
      k: 'Onnistumistodennäköisyys',
      v: `${p} %`,
      cls: p >= 80 ? 'ok' : p >= 55 ? '' : 'bad',
      s: 'osuus 300 satunnaisesta markkinapolusta',
    });
  }

  $('stats').innerHTML = cards.map((c) =>
    `<div class="stat"><div class="k">${c.k}</div><div class="v ${c.cls}">${c.v}</div><div class="s">${c.s}</div></div>`
  ).join('');
}

/* ===================== Tapahtumalista ===================== */

function renderEventList() {
  const box = $('eventList');
  const sorted = [...state.events].sort((a, b) => a.age - b.age);
  if (!sorted.length) {
    box.innerHTML = '<div class="event-empty">Ei tapahtumia — raahaa yllä olevista.</div>';
    return;
  }
  box.innerHTML = '';
  for (const ev of sorted) {
    const def = EVENT_TYPES[ev.type];
    const row = document.createElement('div');
    row.className = 'event-row';
    const g = ev.type === 'retirement' ? retGoal(ev) : null;
    const effWd = ev.type === 'retirement'
      ? (g === 'withdrawal' && sim && sim.solvedWithdrawal != null ? sim.solvedWithdrawal : ev.withdrawal)
      : 0;
    const amount = ev.type === 'retirement' ? -effWd : ev.amount;
    const amStr = ev.type === 'retirement' ? `−${fmtCompact(effWd)}/kk` : fmtCompact(ev.amount);
    let loanBadge = ev.amount < 0 && ev.financing === 'loan' ? '<span class="loan-badge">laina</span>' : '';
    const goalBadge = { withdrawal: '→ 0 €', age: 'aikaisin', saving: 'tavoite' }[g];
    if (goalBadge) loanBadge = `<span class="loan-badge zero-badge">${goalBadge}</span>`;
    row.innerHTML =
      `<span class="ic">${def.icon}</span><span class="nm" title="${escapeHtml(evLabel(ev))}">${escapeHtml(evLabel(ev))}</span>` +
      loanBadge +
      `<span class="ag">${Math.round(ev.age)} v</span>` +
      `<span class="am ${amount >= 0 ? 'pos' : 'neg'}">${amStr}</span>` +
      `<button class="rm" title="Poista">✕</button>`;
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('rm')) {
        state.events = state.events.filter((x) => x.id !== ev.id);
        if (openPopoverId === ev.id) closePopover();
        renderAll();
      } else {
        openPopover(ev.id);
      }
    });
    box.appendChild(row);
  }
}

/* ===================== Syötteet ===================== */

function updateAllocUI() {
  const a = baseAlloc();
  const { mu, sigma } = portfolioStats(a);
  $('stocksVal').textContent = Math.round(a.s * 100) + ' %';
  $('bondsVal').textContent = Math.round(a.b * 100) + ' %';
  $('cashVal').textContent = Math.round(a.c * 100) + ' %';
  const txt = `Tuotto-odotus <b>${pctFmt(mu)}/v</b> · volatiliteetti ${pctFmt(sigma)}`;
  $('allocSummary').innerHTML = txt;
  $('allocSummaryTop').innerHTML = `Salkun tuotto-odotus <b>${pctFmt(mu)}/v</b>`;
  for (const id of ['allocStocks', 'allocBonds']) {
    const inp = $(id);
    inp.style.setProperty('--fill', inp.value + '%');
  }
}

function bindInputs() {
  const num = (id, key, lo, hi) => {
    $(id).addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (isNaN(v)) return;
      state[key] = clamp(v, lo, hi);
      if (key === 'ageNow' || key === 'ageEnd') {
        if (state.ageEnd <= state.ageNow + 1) {
          state.ageEnd = state.ageNow + 2;
          $('ageEnd').value = state.ageEnd;
        }
        for (const ev of state.events) ev.age = clamp(ev.age, state.ageNow, state.ageEnd);
      }
      renderAll();
    });
  };
  num('ageNow', 'ageNow', 18, 80);
  num('ageEnd', 'ageEnd', 40, 105);
  num('startCapital', 'startCapital', 0, 1e9);
  num('monthly', 'monthly', 0, 1e6);

  $('allocStocks').addEventListener('input', (e) => {
    state.allocStocks = +e.target.value;
    state.allocBonds = Math.min(state.allocBonds, 100 - state.allocStocks);
    $('allocBonds').value = state.allocBonds;
    renderAll();
  });
  $('allocBonds').addEventListener('input', (e) => {
    state.allocBonds = Math.min(+e.target.value, 100 - state.allocStocks);
    e.target.value = state.allocBonds;
    renderAll();
  });
  $('glide').addEventListener('change', (e) => { state.glide = e.target.checked; renderAll(); });
  $('real').addEventListener('change', (e) => { state.real = e.target.checked; renderAll(); });
}

/* ===================== Tallennus ja jakaminen ===================== */

const STORAGE_KEY = 'varallisuuspolku-v1';

function serialize() {
  return {
    ageNow: state.ageNow, ageEnd: state.ageEnd,
    startCapital: state.startCapital, monthly: state.monthly,
    allocStocks: state.allocStocks, allocBonds: state.allocBonds,
    glide: state.glide, real: state.real,
    events: state.events,
  };
}

function applySaved(data) {
  if (!data || typeof data !== 'object') return false;
  for (const k of ['ageNow', 'ageEnd', 'startCapital', 'monthly', 'allocStocks', 'allocBonds']) {
    if (typeof data[k] === 'number' && isFinite(data[k])) state[k] = data[k];
  }
  state.glide = !!data.glide;
  state.real = !!data.real;
  if (state.ageEnd <= state.ageNow + 1) state.ageEnd = state.ageNow + 2;
  if (Array.isArray(data.events)) {
    const numOk = (v) => typeof v === 'number' && isFinite(v);
    state.events = data.events.filter((e) => e && EVENT_TYPES[e.type] && numOk(e.age));
    // Vain yksi kutakin unique-tyyppiä (esim. eläke)
    const seen = new Set();
    state.events = state.events.filter((e) => {
      if (!EVENT_TYPES[e.type].unique) return true;
      if (seen.has(e.type)) return false;
      seen.add(e.type);
      return true;
    });
    let maxId = 0;
    for (const e of state.events) {
      if (typeof e.id !== 'number') e.id = maxId + 1001;
      maxId = Math.max(maxId, e.id);
      if (typeof e.name === 'string' && e.name.trim()) e.name = e.name.trim().slice(0, NAME_MAX);
      else delete e.name;
      // Viallinen data (esim. käsin muokattu jakolinkki) ei saa päästä
      // simulaattoriin NaN:eina — paikataan oletuksilla
      if (e.type === 'retirement') {
        e.withdrawal = numOk(e.withdrawal) ? Math.max(0, e.withdrawal) : EVENT_TYPES.retirement.withdrawal;
      } else {
        if (!numOk(e.amount)) e.amount = EVENT_TYPES[e.type].amount || 0;
        if (e.financing !== 'loan') delete e.financing;
        for (const k of ['down', 'rate', 'years', 'appr']) if (e[k] != null && !numOk(e[k])) delete e[k];
        if (e.financing === 'loan') initLoanFields(e);
      }
      // Vanhat tallennukset: dieWithZero → tavoitetila. Oletusta (manual) ei
      // kirjata, jotta jakolinkin kierros säilyttää tilan täsmälleen samana.
      if (e.type === 'retirement') {
        if (e.goal == null && e.dieWithZero) e.goal = 'withdrawal';
        delete e.dieWithZero;
        if (e.goal != null && !['manual', 'withdrawal', 'age', 'saving'].includes(e.goal)) delete e.goal;
      }
      // Vanhat tallennukset: omaisuuserätiedot puuttuvat
      const adef = EVENT_TYPES[e.type].asset;
      if (e.isAsset == null && adef && typeof e.amount === 'number' && e.amount < 0) {
        e.isAsset = true;
        e.appr = adef.appr;
      }
    }
    idSeq = maxId + 1;
  }
  return true;
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize())); } catch (e) { /* yksityistila tms. */ }
}

function loadState() {
  try {
    if (location.hash.startsWith('#s=')) {
      const json = decodeURIComponent(escape(atob(location.hash.slice(3))));
      if (applySaved(JSON.parse(json))) {
        history.replaceState(null, '', location.pathname);
        saveState();
        return;
      }
    }
  } catch (e) { /* viallinen linkki — ohitetaan */ }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applySaved(JSON.parse(raw));
  } catch (e) { /* viallinen tallennus — ohitetaan */ }
}

function syncInputs() {
  $('ageNow').value = state.ageNow;
  $('ageEnd').value = state.ageEnd;
  $('startCapital').value = state.startCapital;
  $('monthly').value = state.monthly;
  $('allocStocks').value = state.allocStocks;
  $('allocBonds').value = state.allocBonds;
  $('glide').checked = state.glide;
  $('real').checked = state.real;
}

const makeShareUrl = () =>
  location.origin + location.pathname + '#s=' + btoa(unescape(encodeURIComponent(JSON.stringify(serialize()))));

async function copyShareUrl(btn) {
  const url = makeShareUrl();
  const orig = btn.textContent;
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'Kopioitu ✓';
    setTimeout(() => { btn.textContent = orig; }, 1600);
  } catch (e) {
    prompt('Kopioi linkki:', url);
  }
}

function bindActions() {
  const shareBtn = $('shareBtn');
  shareBtn.addEventListener('click', () => copyShareUrl(shareBtn));
  $('summaryBtn').addEventListener('click', openSummary);
  $('sumClose').addEventListener('click', closeSummary);
  $('sumPrint').addEventListener('click', () => window.print());
  $('sumShare').addEventListener('click', (e) => copyShareUrl(e.target));
  $('infoBtn').addEventListener('click', () => { $('infoModal').hidden = false; });
  $('infoClose').addEventListener('click', () => { $('infoModal').hidden = true; });
  $('disclaimerInfo').addEventListener('click', (e) => { e.preventDefault(); $('infoModal').hidden = false; });
  // Tase-paneelin supistus
  const balanceToggle = $('balanceToggle');
  let balCollapsed = false;
  try { balCollapsed = localStorage.getItem('vp-balance-collapsed') === '1'; } catch (e) {}
  if (balCollapsed) { balPanel.classList.add('collapsed'); balanceToggle.textContent = '▸'; }
  balanceToggle.addEventListener('click', () => {
    const c = balPanel.classList.toggle('collapsed');
    balanceToggle.textContent = c ? '▸' : '▾';
    try { localStorage.setItem('vp-balance-collapsed', c ? '1' : '0'); } catch (e) {}
    if (!c) renderBalance();
  });

  // Nollaus vaatii toisen klikkauksen vahvistukseksi
  const resetBtn = $('resetBtn');
  let resetArmed = null;
  resetBtn.addEventListener('click', () => {
    if (resetArmed) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      location.hash = '';
      location.reload();
      return;
    }
    resetBtn.textContent = 'Vahvista nollaus';
    resetBtn.classList.add('armed');
    resetArmed = setTimeout(() => {
      resetArmed = null;
      resetBtn.textContent = 'Nollaa';
      resetBtn.classList.remove('armed');
    }, 3000);
  });
}

/* ===================== Yhteenveto ===================== */
// Tulostettava ja jaettava tavoitedokumentti: käyttäjän omat tavoitteet ja
// suunnitelman edellytykset — esim. varainhoitajalle keskustelun pohjaksi.
// Ei sijoitusneuvontaa: kaikki on minä-muodossa laatijan omina valintoina.

function summaryChartSVG(s) {
  const W = 760, H = 240, l = 50, r = 10, t = 30, b = 34;
  const w = W - l - r, h = H - t - b;
  const { a0, a1, months } = s;
  let maxV = 0;
  for (let m = 0; m <= months; m++) maxV = Math.max(maxV, s.opt[m], s.invested[m]);
  maxV = maxV || 1;
  const xs = (age) => l + ((age - a0) / (a1 - a0)) * w;
  const ys = (v) => t + h - (clamp(v, 0, maxV) / maxV) * h;

  const step = Math.max(1, Math.round(months / 200));
  const idx = [];
  for (let m = 0; m <= months; m += step) idx.push(m);
  if (idx[idx.length - 1] !== months) idx.push(months);
  const pt = (m, arr) => `${xs(a0 + m / 12).toFixed(1)},${ys(arr[m]).toFixed(1)}`;

  const line = idx.map((m) => pt(m, s.exp)).join(' ');
  const inv = idx.map((m) => pt(m, s.invested)).join(' ');
  const band = idx.map((m) => pt(m, s.opt)).join(' ') + ' ' +
    [...idx].reverse().map((m) => pt(m, s.pess)).join(' ');

  let g = '';
  const yStep = niceStep(maxV, 4);
  for (let v = yStep; v <= maxV; v += yStep) {
    g += `<line class="sum-grid" x1="${l}" y1="${ys(v)}" x2="${l + w}" y2="${ys(v)}"/>` +
      `<text class="sum-tick" x="${l - 6}" y="${ys(v) + 3}" text-anchor="end">${fmtCompact(v)}</text>`;
  }
  const yearNow = new Date().getFullYear();
  for (let age = Math.ceil(a0 / 10) * 10; age <= a1; age += 10) {
    g += `<text class="sum-tick" x="${xs(age)}" y="${t + h + 14}" text-anchor="middle">${age} v</text>` +
      `<text class="sum-tick" x="${xs(age)}" y="${t + h + 26}" text-anchor="middle">${yearNow + Math.round(age - a0)}</text>`;
  }

  let marks = '';
  const sorted = [...state.events].sort((x, y) => x.age - y.age);
  let lastX = -1e9, level = 0;
  for (const ev of sorted) {
    const x = xs(clamp(ev.age, a0, a1));
    const m = clamp(Math.round((ev.age - a0) * 12), 0, months);
    level = x - lastX < 26 ? level + 1 : 0;
    lastX = x;
    const icoY = t - 8 - (level % 2) * 14;
    marks += `<circle class="${ev.type === 'retirement' ? 'sum-mark-ret' : 'sum-mark-dot'}" cx="${x}" cy="${ys(s.exp[m])}" r="3"/>` +
      `<line class="sum-grid" x1="${x}" y1="${icoY + 4}" x2="${x}" y2="${ys(s.exp[m])}"/>` +
      `<text class="sum-ev-ico" x="${x}" y="${icoY}" text-anchor="middle">${EVENT_TYPES[ev.type].icon}</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${g}` +
    `<polygon class="sum-band" points="${band}"/>` +
    `<polyline class="sum-inv" points="${inv}"/>` +
    `<polyline class="sum-line" points="${line}"/>${marks}</svg>`;
}

function summaryPoints(s) {
  const yearNow = new Date().getFullYear();
  const yearOf = (age) => `~${yearNow + Math.round(age - state.ageNow)}`;
  const pts = [];

  if (s.goal === 'saving' && s.requiredMonthly != null && s.requiredMonthly > state.monthly) {
    pts.push({ warn: true, html: `Säästän <b>${fmtEur(s.requiredMonthly)}/kk</b> — nykyinen ${fmtEur(state.monthly)}/kk ei riitä tavoitteeseeni.` });
  } else if (s.goal === 'saving' && s.requiredMonthly != null) {
    pts.push({ html: `Säästän <b>${fmtEur(state.monthly)}/kk</b> — tavoitteeni laskennallinen minimi on ${fmtEur(s.requiredMonthly)}/kk.` });
  } else {
    pts.push({ html: `Sijoitan <b>${fmtEur(state.monthly)}/kk</b>${s.retireAge != null ? ' eläkkeelle jäämiseen asti' : ' koko suunnitelman ajan'} (alkupääoma ${fmtEur(state.startCapital)}).` });
  }

  const a = baseAlloc();
  const { mu } = portfolioStats(a);
  pts.push({ html: `Riskiprofiilini: <b>${Math.round(a.s * 100)} % osakkeita</b>, ${Math.round(a.b * 100)} % korkoja, ${Math.round(a.c * 100)} % käteistä — tuotto-oletus ${pctFmt(mu)}/v${state.glide ? '; riskiä vähennetään eläkettä lähestyttäessä' : ''}.` });

  for (const e of [...state.events].sort((x, y) => x.age - y.age)) {
    if (e.type === 'retirement') continue;
    const age = `<b>${Math.round(e.age)} v</b> (${yearOf(e.age)})`;
    const nm = escapeHtml(evLabel(e));
    if (e.amount < 0 && e.financing === 'loan') {
      const price = -e.amount;
      const down = clamp(e.down || 0, 0, price);
      const pmt = loanPayment(price - down, e.rate || 0, e.years || 10);
      pts.push({ html: `Ikään ${age} mennessä: käsiraha <b>${fmtEur(down)}</b> — ${nm} ${fmtEur(price)}; lainanhoito ${fmtEur(pmt)}/kk ${Math.round(e.years || 10)} v ajan.` });
    } else if (e.amount < 0) {
      pts.push({ html: `Iässä ${age}: ${nm} <b>${fmtEur(-e.amount)}</b> — irrotetaan sijoituksista.` });
    } else {
      pts.push({ html: `Iässä ${age}: ${nm} <b>+${fmtEur(e.amount)}</b> — sijoitetaan salkkuun.` });
    }
  }

  if (s.retireAge != null) {
    const wd = `<b>${fmtEur(s.withdrawal)}/kk</b>`;
    const ageStr = `<b>${s.goal === 'age' && s.solvedRetireAge != null ? fmtAge(s.solvedRetireAge) : Math.round(s.retireAge) + ' v'}</b> (${yearOf(s.retireAge)})`;
    if (s.goal === 'withdrawal') pts.push({ html: `Jään eläkkeelle iässä ${ageStr} ja käytän varat tasaisesti loppuun — kestävä nosto ${wd}.` });
    else if (s.goal === 'age') pts.push({ html: `Jään eläkkeelle heti kun nostoni ${wd} on kestävä — laskennallisesti iässä ${ageStr}.` });
    else pts.push({ html: `Jään eläkkeelle iässä ${ageStr} ja nostan sijoituksistani ${wd}.` });
  }
  return pts;
}

function summaryTalks(s) {
  const talks = [];
  const p = Math.round((s.successProb || 0) * 100);
  if (s.goalUnreachable) {
    talks.push({ warn: true, html: s.goal === 'age'
      ? 'Eläkeikätavoitteeni ei toteudu nykyisillä oletuksilla — nosto ei onnistu edes suunnitelman lopussa.'
      : 'Säästötavoitteeni ei toteudu nykyisillä oletuksilla — nosto on liian suuri.' });
  }
  if (s.requiredMonthly != null && s.requiredMonthly > state.monthly) {
    talks.push({ warn: true, html: `Säästökykyni ja tavoitteeni välillä on <b>${fmtEur(s.requiredMonthly - state.monthly)}/kk</b> ero — miten se katetaan?` });
  }
  if (s.depletionAge != null && s.depletionAge < s.a1 - 1) {
    talks.push({ warn: true, html: `Laskelmassa varani ehtyvät noin <b>${Math.round(s.depletionAge)} v</b> iässä — miten loppuvuodet katetaan?` });
  }
  if (s.successProb != null && p < 65) {
    talks.push({ html: `Onnistumistodennäköisyys on <b>${p} %</b> — haluan keskustella keinoista: suurempi säästö, maltillisempi nosto tai myöhäisempi eläköityminen.` });
  }
  if (!state.events.some((e) => e.type === 'retirement')) {
    talks.push({ html: 'Suunnitelmastani puuttuu vielä eläketavoite — haluan hahmottaa, milloin ja millaisella kuukausitulolla voisin jäädä eläkkeelle.' });
  }
  if (!talks.length) {
    talks.push({ html: `Suunnitelmani on laskennallisesti kestävä loppuun asti (onnistumistodennäköisyys <b>${p} %</b>) — haluan varmistaa, että toteutus vastaa sitä.` });
  }
  return talks;
}

function renderSummary() {
  const s = simulate();
  const yearNow = new Date().getFullYear();
  const yearOf = (age) => `~${yearNow + Math.round(age - state.ageNow)}`;
  const retire = state.events.find((e) => e.type === 'retirement') || null;
  const p = s.successProb != null ? Math.round(s.successProb * 100) : null;

  const tiles = [
    { k: 'Nykyinen varallisuus', v: fmtEur(state.startCapital) },
    { k: 'Kuukausisäästö', v: `${fmtEur(state.monthly)}/kk` },
    { k: s.goal === 'age' ? 'Aikaisin eläkeikä' : 'Eläkeikä',
      v: s.retireAge != null ? (s.goal === 'age' && s.solvedRetireAge != null ? fmtAge(s.solvedRetireAge) : `${Math.round(s.retireAge)} v`) : '—',
      s: s.retireAge != null ? yearOf(s.retireAge) : 'ei eläketapahtumaa' },
    { k: 'Nosto eläkkeellä', v: retire ? `${fmtEur(s.withdrawal)}/kk` : '—',
      s: s.goal === 'withdrawal' ? 'kestävä nosto — varat loppuun' : '' },
    { k: 'Varallisuus eläkkeellä', v: s.wAtRet != null ? fmtEur(s.wAtRet) : '—', cls: 'accent' },
    { k: 'Onnistumistodennäköisyys', v: p != null ? `${p} %` : '—', cls: p >= 80 ? 'ok' : p >= 55 ? '' : 'bad', s: '300 markkinapolkua' },
  ];

  const evRows = [...state.events].sort((x, y) => x.age - y.age).map((e) => {
    const def = EVENT_TYPES[e.type];
    let sum, fin = '', note = '';
    if (e.type === 'retirement') {
      sum = `−${fmtEur(s.goal === 'withdrawal' && s.solvedWithdrawal != null ? s.solvedWithdrawal : e.withdrawal)}/kk`;
      fin = { manual: 'nostot sijoituksista', withdrawal: 'kestävä nosto — varat loppuun', age: 'aikaisin mahdollinen ikä', saving: 'säästötavoite' }[retGoal(e)];
    } else if (e.amount < 0 && e.financing === 'loan') {
      const price = -e.amount;
      const down = clamp(e.down || 0, 0, price);
      const pmt = loanPayment(price - down, e.rate || 0, e.years || 10);
      sum = fmtEur(e.amount);
      fin = `laina: käsiraha ${fmtEur(down)}, erä ${fmtEur(pmt)}/kk · ${Math.round(e.years || 10)} v · ${(e.rate || 0).toLocaleString('fi-FI')} %`;
    } else {
      sum = (e.amount >= 0 ? '+' : '') + fmtEur(e.amount);
      fin = e.amount < 0 ? 'säästöistä' : 'tulo';
    }
    if (e.isAsset) note = `omaisuuseräksi, arvonmuutos ${(e.appr || 0).toLocaleString('fi-FI')} %/v`;
    return `<tr><td>${def.icon} ${escapeHtml(evLabel(e))}</td>` +
      `<td class="num">${Math.round(e.age)} v · ${yearOf(e.age).slice(1)}</td>` +
      `<td class="num">${sum}</td><td>${fin}</td><td>${note}</td></tr>`;
  }).join('');

  const li = (x) => `<li${x.warn ? ' class="warn"' : ''}>${x.html}</li>`;

  $('sumSheet').innerHTML =
    `<div class="sum-head">` +
    `<div><h1>Varallisuussuunnitelma</h1><div class="sum-sub">Tavoitteeni ja suunnitelmani elämäni taloudelle</div></div>` +
    `<div class="sum-meta">${new Date().toLocaleDateString('fi-FI')}<br>Ikä ${state.ageNow} v · suunnitelma ${Math.round(s.a1)} v ikään asti<br>${state.real ? 'inflaatiokorjattu, nykyrahassa' : 'nimellisarvoin'}</div>` +
    `</div>` +
    `<div class="sum-tiles">${tiles.map((c) =>
      `<div class="sum-tile"><div class="k">${c.k}</div><div class="v ${c.cls || ''}">${c.v}</div>${c.s ? `<div class="s">${c.s}</div>` : ''}</div>`).join('')}</div>` +
    `<h2>Varallisuuden odotettu kehitys</h2>` +
    `<div class="sum-chart">${summaryChartSVG(s)}</div>` +
    `<div class="sum-legend"><span><i class="sw sum-lg-line"></i>Sijoitusvarallisuus</span><span><i class="sw sum-lg-band"></i>Vaihteluväli</span><span><i class="sw sum-lg-inv"></i>Sijoitettu pääoma</span></div>` +
    `<h2>Suunnitelmani kulmakivet</h2>` +
    `<ol class="sum-points">${summaryPoints(s).map(li).join('')}</ol>` +
    `<h2>Elämäntapahtumat aikajanalla</h2>` +
    `<table class="sum-table"><thead><tr><th>Tapahtuma</th><th>Ajankohta</th><th>Summa</th><th>Rahoitus</th><th>Huom.</th></tr></thead><tbody>${evRows}</tbody></table>` +
    `<h2>Keskusteltavaa esim. varainhoitajan kanssa</h2>` +
    `<ul class="sum-points">${summaryTalks(s).map(li).join('')}</ul>` +
    `<p class="sum-assump">Oletukset: osakkeet 7 %, korot 3 %, käteinen 1,5 % vuodessa${state.real ? `; inflaatio ${pctFmt(INFLATION)}/v, luvut nykyrahassa` : ''}${state.glide ? '; ikäsidonnainen allokaatio' : ''}. ` +
    `Lainat annuiteettilainoina. Onnistumistodennäköisyys perustuu 300 satunnaiseen markkinapolkuun. Laadittu Varallisuuspolku-työkalulla.</p>` +
    `<p class="sum-disclaimer">Tämä yhteenveto kuvaa laatijansa omia tavoitteita, valintoja ja oletuksia. Se ei ole sijoitusneuvontaa eikä sijoitussuositus — sen voi antaa esimerkiksi varainhoitajalle keskustelun pohjaksi.</p>`;
}

function openSummary() {
  renderSummary();
  $('summary').hidden = false;
  document.body.classList.add('summary-open');
}

function closeSummary() {
  $('summary').hidden = true;
  document.body.classList.remove('summary-open');
}

/* ===================== Paneelin taittuvat kortit ===================== */

const PANEL_KEY = 'vp-panel-collapsed';

function bindPanelCards() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PANEL_KEY)) || {}; } catch (e) {}
  for (const card of document.querySelectorAll('.panel .card[data-card]')) {
    const key = card.dataset.card;
    const defCollapsed = key === 'dist'; // jakauma oletuksena kiinni — passiivisin osio
    if (saved[key] != null ? saved[key] : defCollapsed) card.classList.add('collapsed');
    card.querySelector('h2').addEventListener('click', () => {
      const c = card.classList.toggle('collapsed');
      saved[key] = c;
      try { localStorage.setItem(PANEL_KEY, JSON.stringify(saved)); } catch (e) {}
      if (!c && key === 'dist') renderDist();
    });
  }
}

/* ===================== Käynnistys ===================== */

function renderAll() {
  updateAllocUI();
  renderChart();
  renderStats();
  renderEventList();
  renderDist();
  saveState();
}

buildPalette();
loadState();
syncInputs();
bindInputs();
bindActions();
bindPanelCards();
renderAll();

new ResizeObserver(() => { renderChart(); }).observe(wrap);
