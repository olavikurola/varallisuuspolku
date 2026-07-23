'use strict';

/* ===================== Vakiot ===================== */
// Laskentavakiot ja -ydin (simulate, ratkaisijat, MC): laskenta.js —
// ladataan ennen tätä tiedostoa ja jaetaan mc-workerin kanssa.

// loan: oletusrahoitus lainalla { share: käsirahan osuus, rate: %/v, years: laina-aika }
const CONSUMER_LOAN = { share: 0.3, rate: 8.0, years: 5 };
const EVENT_TYPES = {
  study:       { icon: '🎓', label: 'Opiskelu',            amount: -15000,  loan: { share: 0,    rate: 1.0, years: 10 }, defaultFin: 'loan' },
  home:        { icon: '🏠', label: 'Asunnon osto',        amount: -220000, loan: { share: 0.15, rate: 3.5, years: 25 }, defaultFin: 'loan', asset: { appr: 2.0 } },
  car:         { icon: '🚗', label: 'Auton osto',          amount: -25000,  loan: { share: 0.2,  rate: 4.5, years: 6 },  defaultFin: 'loan', asset: { appr: -10.0 } },
  wedding:     { icon: '💍', label: 'Häät',                amount: -20000,  loan: CONSUMER_LOAN, defaultFin: 'cash' },
  child:       { icon: '👶', label: 'Lapsi',               amount: -3000,   loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: -300, years: 18 } },
  renovation:  { icon: '🛠️', label: 'Remontti',            amount: -30000,  loan: { share: 0.1,  rate: 4.5, years: 10 }, defaultFin: 'loan' },
  travel:      { icon: '✈️', label: 'Unelmamatka',         amount: -8000,   loan: CONSUMER_LOAN, defaultFin: 'cash' },
  recurring:   { icon: '💳', label: 'Kuukausimeno',        amount: 0,       loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: -200, years: 10 } },
  sidegig:     { icon: '💼', label: 'Sivutulo',            amount: 0,       loan: CONSUMER_LOAN, defaultFin: 'cash', rec: { monthly: 300, years: 10 } },
  cottage:     { icon: '🏡', label: 'Mökki / vene',        amount: -120000, loan: { share: 0.25, rate: 4.0, years: 15 }, defaultFin: 'loan', asset: { appr: 2.0 } },
  inheritance: { icon: '💎', label: 'Perintö / lahja',     amount: 60000 },
  bonus:       { icon: '💰', label: 'Bonus / myyntivoitto', amount: 20000 },
  // Tavoitepiste on mittari, ei kassavirta (metric): simulaattori ohittaa sen,
  // graafi näyttää vajeet ja MC-ylitysosuuden, Ratkaise hakee säästön
  goal:        { icon: '🎯', label: 'Tavoite',             amount: 100000, metric: true },
  // Siirrot puolisolle/puolisolta: näkyvät vain perhetilassa ja pysyvät
  // pareina synkassa molempien suunnitelmissa (linkId)
  transferOut: { icon: '📤', label: 'Siirto läheiselle',   amount: -5000, familyOnly: true },
  transferIn:  { icon: '📥', label: 'Siirto läheiseltä',   amount: 5000,  familyOnly: true },
  retirement:  { icon: '🌴', label: 'Eläkkeelle jäänti',   withdrawal: 2400, pension: 1500, pensionAge: 65, unique: true },
};

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
  savingsGrowth: 1.5, // säästön vuosikasvu % (palkkakehitys)
  savePhases: null,   // porrastettu säästö [{to, amount}] tai null = tasainen
  allocStocks: 70,
  allocBonds: 20,
  glide: false,
  real: false,
  inflation: 2,       // inflaatio-oletus %/v (käytössä kun real=true; 2 % = ennallaan)
  tax: true,          // myyntivoittovero nostoissa (oletuksena päällä uusille)
  acct: 'aot',        // sijoitustili: aot | ost (osakesäästötili) | ins (vakuutuskuori)
  feePct: 0,          // sijoituskulut %/v (rahastojen TER, kaupankäynti)
  wrapFee: 0,         // vakuutuskuoren vuosikulu %/v (vain acct 'ins')
  divYield: 0,        // suorien osakkeiden osinkotuotto %/v (0 = kasvurahastot)
  proOn: false,       // Pro-tila: ammattilaissäädöt (laskenta.js/proOf)
  pro: null,
  income: null,       // Säästökyky-apuri: nettotulot €/kk (valinnainen)
  expenses: null,     // ja menot €/kk — eläketarpeen oletus ja säästöaste
  events: [
    { id: idSeq++, type: 'home', age: 35, amount: -220000, financing: 'loan', down: 33000, rate: 3.5, years: 25, isAsset: true, appr: 2.0 },
    { id: idSeq++, type: 'car',  age: 45, amount: -25000,  financing: 'loan', down: 5000,  rate: 4.5, years: 6,  isAsset: true, appr: -10.0 },
    { id: idSeq++, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 },
  ],
};

/* ===================== Apurit ===================== */

const $ = (id) => document.getElementById(id);

const eurFmt = new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtEur = (v) => eurFmt.format(Math.round(v));

function fmtCompact(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return sign + (a / 1e6).toLocaleString('fi-FI', { maximumFractionDigits: a >= 1e7 ? 0 : 1 }) + ' M€';
  if (a >= 1e3) return sign + Math.round(a / 1e3) + ' t€';
  return sign + Math.round(a) + ' €';
}

const pctFmt = (v) => (v * 100).toLocaleString('fi-FI', { maximumFractionDigits: 1 }) + ' %';

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

/* ===================== Anonyymi datalahjoitus: paketti ===================== */
// Lahjoituspaketti rakennetaan alusta tiukalla whitelistillä — tapahtumien
// omat nimet tai muut henkilökohtaiset kentät eivät voi päätyä mukaan.
// Summat pyöristetään kahteen merkitsevään numeroon.

const DATA_API = 'https://varallisuuspolku-data.up.railway.app';

function buildDonationPayload(st, s) {
  const events = [];
  for (const e of [...st.events].sort((a, b) => a.age - b.age)) {
    // Perheen sisäiset siirrot eivät kuulu vertailudataan
    if (EVENT_TYPES[e.type] && EVENT_TYPES[e.type].familyOnly) continue;
    if (e.type === 'retirement') {
      const ev = {
        type: 'retirement', age: Math.round(e.age),
        withdrawal: round2sig(e.withdrawal || 0),
        pension: round2sig(e.pension || 0),
      };
      if (e.pensionAge != null) ev.pensionAge = Math.round(e.pensionAge);
      if (e.goal) ev.goal = e.goal;
      if (e.conf != null) ev.conf = e.conf;
      events.push(ev);
    } else {
      const ev = { type: e.type, age: Math.round(e.age) };
      if (e.amount) ev.amount = round2sig(e.amount);
      if (e.financing === 'loan') {
        ev.financing = 'loan';
        if (e.down != null) ev.down = round2sig(e.down);
        if (e.rate != null) ev.rate = Math.round(e.rate * 10) / 10;
        if (e.years != null) ev.years = Math.round(e.years);
      }
      if (e.isAsset) {
        ev.isAsset = true;
        if (e.appr != null) ev.appr = Math.round(e.appr * 10) / 10;
        if (e.sellAge != null) { ev.sellAge = Math.round(e.sellAge); ev.sellTaxFree = !!e.sellTaxFree; }
      }
      if (e.recMonthly) {
        ev.recMonthly = round2sig(e.recMonthly);
        ev.recYears = Math.round(clamp(e.recYears || 10, 1, 60));
      }
      events.push(ev);
    }
  }
  const payload = {
    v: 1,
    ageNow: Math.round(st.ageNow), ageEnd: Math.round(st.ageEnd),
    startCapital: round2sig(st.startCapital),
    monthly: round2sig(st.monthly),
    savingsGrowth: Math.round((st.savingsGrowth || 0) * 10) / 10,
    alloc: { stocks: Math.round(st.allocStocks), bonds: Math.round(st.allocBonds) },
    glide: !!st.glide, real: !!st.real, tax: !!st.tax,
    events,
  };
  // Sijoitustili ja kokonaiskulut mukaan vertailuun (ei oletusarvoja turhaan)
  if (st.acct === 'ost' || st.acct === 'ins') payload.acct = st.acct;
  const feeTot = (st.feePct || 0) + (st.acct === 'ins' ? st.wrapFee || 0 : 0);
  if (feeTot > 0) payload.feePct = Math.round(feeTot * 100) / 100;
  if (s) {
    payload.derived = { wEnd: round2sig(Math.max(0, s.wEnd)) };
    if (s.wAtRet != null) payload.derived.wAtRet = round2sig(Math.max(0, s.wAtRet));
    if (s.successProb != null) payload.derived.successProb = Math.round(s.successProb * 100) / 100;
    if (s.retireAge != null) payload.derived.retireAge = Math.round(s.retireAge * 10) / 10;
    if (s.taxPaid > 0) payload.derived.taxPaid = round2sig(s.taxPaid);
  }
  return payload;
}

// Plausible-ydintapahtumat: piirtopöytä avattu, veto tehty, jakolinkki
// luotu, vertailujako. Vain tapahtuman nimi (+ vedon tyyppi) — ei sisältöä,
// ei tunnisteita. Goalit lisätään Plausible-hallinnassa samoilla nimillä.
function track(name, props) {
  try {
    if (window.plausible) window.plausible(name, props ? { props } : undefined);
  } catch (e) { /* analytiikka ei saa koskaan haitata käyttöä */ }
}

// Kerran istunnossa: usein toistuvat eleet (vedot) eivät paisuta tapahtumamäärää —
// Plausiblen uniques-luku on joka tapauksessa suppilon mittari
const trackedOnce = new Set();
function trackOnce(name, props) {
  if (trackedOnce.has(name)) return;
  trackedOnce.add(name);
  track(name, props);
}

// djb2 — kevyt tiiviste "sama suunnitelma jo lahjoitettu" -muistiin
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ===================== Laskenta ja MC-tarkennus ===================== */
// simulate(), runPath ja ratkaisijat: laskenta.js. Tässä worker-asiakas, joka
// tarkentaa onnistumis-%:n, viuhkan ja tavoiteosuudet MC_FULL-polkumäärällä
// irrotuksen jälkeen (periaate: deterministinen per frame, stokastinen
// irrotettaessa). Ilman Workeria jäädään MC_LIVE-tarkkuuteen — kaikki toimii,
// luvut ovat vain karkeampia.

let mcWorker = null, mcSeq = 0, mcTimer = null;
let ghostMc = null; // haamun tarkennus samalla polkumäärällä — deltat reiluja

// Tavoitepisteet MC:lle: osuus poluista, joilla varallisuus ylittää pisteen
function simGoals() {
  const gs = state.events.filter((e) => e.type === 'goal');
  return gs.length ? gs.map((g) => ({ id: g.id, age: g.age, value: g.amount })) : null;
}

function initMcWorker() {
  if (typeof Worker === 'undefined') return;
  try {
    mcWorker = new Worker('mc-worker.js');
  } catch (e) { mcWorker = null; return; }
  mcWorker.addEventListener('error', () => { mcWorker = null; });
  mcWorker.addEventListener('message', (e) => {
    const d = e.data;
    if (d.task === 'solveGoals') { onSolveGoalsMsg(d); return; }
    if (d.task === 'mcJoint') {
      if (d.ok && d.seq === mcSeq) { jointMc = d; renderStats(); }
      return;
    }
    if (!d.ok || d.task !== 'mc') return;
    if (d.kind === 'ghost') {
      if (ghostSim && d.months === ghostSim.months) {
        ghostMc = d;
        updateHud();
        renderStats(); // deltat samalla polkumäärällä myös kojelaudan kortteihin
      }
      return;
    }
    // Vanhentunut vastaus (tila ehti muuttua) hylätään. Kesken raahauksen
    // tulos hylätään myös — muuten viuhkan päivitys skaalaisi koordinaatiston
    // uusiksi sormen alla; tuore pyyntö lähtee joka tapauksessa irrotuksessa.
    if (d.seq !== mcSeq || !sim || d.months !== sim.months) return;
    if (dragLight || drawState.drag) return;
    sim.successProb = d.successProb;
    sim.successStale = false;
    sim.opt = d.p90;
    sim.pess = d.p10;
    sim.goalShares = d.goalShares;
    sim.mcPaths = d.paths;
    sim.ruinCurve = d.ruin;
    sim.pctLo = d.pctLo;
    sim.pctHi = d.pctHi;
    lastFullSim = sim;
    renderChart(true);
    renderStats();
    updateHud();
    if (state.proOn) scheduleProAna();
  });
}

function requestMcRefresh() {
  if (!mcWorker || !sim) return;
  clearTimeout(mcTimer);
  const snapshot = serialize();
  const wd = sim.withdrawal, ra = sim.retireAge;
  mcTimer = setTimeout(() => {
    mcSeq++;
    const pCur = proOf(state);
    mcWorker.postMessage({
      task: 'mc', kind: 'cur', seq: mcSeq, st: snapshot,
      paths: pCur ? pCur.mc.paths : MC_FULL, withdrawal: wd, retireAge: ra, goals: simGoals(),
    });
    if (baseline && ghostSim && !ghostMc) {
      const pG = proOf(baseline);
      mcWorker.postMessage({
        task: 'mc', kind: 'ghost', seq: mcSeq, st: JSON.parse(JSON.stringify(baseline)),
        paths: pG ? pG.mc.paths : MC_FULL, withdrawal: ghostSim.withdrawal, retireAge: ghostSim.retireAge,
      });
    }
    if (familyOn()) {
      // Perheen yhteinen MC: kaikki henkilöt samaan maailmaan
      saveActiveIntoFamily();
      mcWorker.postMessage({
        task: 'mcJoint', seq: mcSeq,
        states: family.persons.map((p) => JSON.parse(JSON.stringify(p.data))),
        paths: pCur ? pCur.mc.paths : MC_FULL,
      });
    }
  }, 200);
}

// HUD (V1) ja tavoiteratkaisu (V3) — määritellään myöhemmissä osioissa;
// stubit pitävät worker-käsittelijän eheänä.
let updateHud = () => {};
let onSolveGoalsMsg = () => {};

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
let scaleX = null, scaleY = null, invX = null, invY = null;
let plot = { l: 64, r: 26, t: 20, b: 48, w: 0, h: 0, W: 0, H: 0 };
let openPopoverId = null;
let draggingId = null;
let hoverLine = null, hoverDot = null, balHoverLine = null;
// Skenaariovertailu: tallennettu suunnitelma haamukäyräksi (irrallinen syväkopio)
let baseline = null;
let ghostSim = null;
let ghostDirty = true;  // haamu lasketaan vain kun vertailukohta vaihtuu
let famTotalCache = null; // perheen yhteiskäyrä piirtopöydän osumia varten
let lastFullSim = null; // viimeisin täysi sim — kevyen raahausframen jäädytetyt arvot
let dragLight = false;  // piirtotilan raahaus käynnissä → kevyt frame (ei MC:tä)
let fsOn = false;       // kokoruudun piirtotila päällä

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

function simOpts() {
  const o = { sustainable: fsOn, goals: simGoals() };
  if (dragLight && lastFullSim) { o.light = true; o.frozen = lastFullSim; }
  return o;
}

// Haamu ei muutu säädöissä — lasketaan vain kun vertailukohta vaihtuu
function getGhost() {
  if (ghostDirty) { ghostSim = computeGhost(); ghostDirty = false; ghostMc = null; }
  return ghostSim;
}

function renderChart(reuse = false) {
  if (!reuse) {
    sim = simulate(state, simOpts());
    if (!sim.successStale) lastFullSim = sim;
    ghostSim = getGhost();
    if (!dragLight) requestMcRefresh();
  }
  renderCompare();
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (W < 50 || H < 50) return;
  plot.W = W; plot.H = H;
  plot.w = W - plot.l - plot.r;
  plot.h = H - plot.t - plot.b;

  const { a0, a1, months } = sim;
  // Perheen yhteiskäyrä: raahauksen aikana muiden polut tulevat suoraan
  // perheratkaisijalta (othersLive), muuten välimuistista
  let famTotal = null, famOthers = null;
  if (familyOn()) {
    const live = drawState.drag && (drawState.drag.othersLive || drawState.drag.otherExpLive);
    famOthers = live || othersOf().map((o) => ({ i: o.i, arr: personSim(o.i).exp }));
    if (famOthers.length) {
      famTotal = new Float64Array(months + 1);
      for (let i = 0; i <= months; i++) {
        let s = sim.exp[Math.min(i, sim.months)];
        for (const o of famOthers) s += o.arr[Math.min(i, o.arr.length - 1)];
        famTotal[i] = s;
      }
    }
  }
  famTotalCache = famTotal;
  const yMax = Math.max(10000, famTotal ? famTotal[months] * 1.02 : 0,
    Math.max(...sim.opt, ...sim.invested, ...(ghostSim ? ghostSim.exp : []))) * 1.08;

  scaleX = (age) => plot.l + ((age - a0) / (a1 - a0)) * plot.w;
  scaleY = (v) => plot.t + plot.h - (v / yMax) * plot.h;
  invX = (px) => a0 + ((px - plot.l) / plot.w) * (a1 - a0);
  invY = (py) => ((plot.t + plot.h - py) / plot.h) * yMax;

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

  /* ehtymisvyöhykkeet: sijoitukset nollissa */
  for (const z of sim.dryZones || []) {
    const x0 = scaleX(Math.max(z.from, a0)), x1 = scaleX(Math.min(z.to, a1));
    if (x1 - x0 < 1) continue;
    el('rect', { x: x0, y: plot.t, width: x1 - x0, height: plot.h, fill: 'rgba(248,113,113,0.06)' }, svg);
    if (x1 - x0 > 90) {
      const tt = el('text', { x: (x0 + x1) / 2, y: plot.t + 16, 'text-anchor': 'middle', class: 'dry-label' }, svg);
      tt.textContent = sim.dryKind === 'floor' ? '⚠ tulo alle tarpeen' : '⚠ varat ehtyneet';
    }
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

  /* vertailukohdan haamukäyrä (piirretään pääkäyrän alle, ikään sidottuna) */
  if (ghostSim) {
    let gp = '';
    for (let i = 0; i <= ghostSim.months; i++) {
      const ga = ghostSim.a0 + i / 12;
      if (ga < a0 || ga > a1) continue;
      gp += `${gp ? ' L' : 'M'} ${scaleX(ga).toFixed(1)},${scaleY(ghostSim.exp[i]).toFixed(1)}`;
    }
    if (gp) el('path', { d: gp, fill: 'none', stroke: '#9aa7c4', 'stroke-width': 2, 'stroke-dasharray': '2 4', opacity: 0.7, 'stroke-linejoin': 'round' }, svg);
  }

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

  /* stressiskenaariot (Pro): deterministiset polut viuhkan päälle */
  if (sim.stress && sim.stress.length) {
    const colors = { bear: '#f87171', stagf: '#fb923c', lost: '#facc15' };
    sim.stress.forEach((sc, idx) => {
      let d = '';
      for (let i = 0; i <= months; i++) d += `${i ? ' L' : 'M'} ${scaleX(a0 + i / 12).toFixed(1)},${scaleY(sc.arr[i]).toFixed(1)}`;
      el('path', { d, fill: 'none', stroke: colors[sc.key] || '#f87171', 'stroke-width': 1.4, 'stroke-dasharray': '6 4', opacity: 0.7, 'pointer-events': 'none' }, svg);
      const t = el('text', { x: plot.l + plot.w - 6, y: clamp(scaleY(sc.arr[months]) - 6 - idx * 13, plot.t + 10, plot.t + plot.h - 4), 'text-anchor': 'end', class: 'stress-label', fill: colors[sc.key] || '#f87171' }, svg);
      t.textContent = sc.name;
    });
  }

  /* nimetyt skenaariohaamut (Pro) */
  if (state.proOn && proScenarios.length) {
    proScenarios.forEach((sc, i) => {
      const gs = scenSim(i);
      let gp = '';
      for (let k = 0; k <= gs.months; k++) {
        const ga = gs.a0 + k / 12;
        if (ga < a0 || ga > a1) continue;
        gp += `${gp ? ' L' : 'M'} ${scaleX(ga).toFixed(1)},${scaleY(gs.exp[k]).toFixed(1)}`;
      }
      if (gp) el('path', { d: gp, fill: 'none', stroke: SCEN_COLORS[i % 3], 'stroke-width': 1.6, 'stroke-dasharray': '5 4', opacity: 0.6, 'pointer-events': 'none' }, svg);
    });
  }

  /* Perhevirta: muiden henkilöiden käyrät ja perheen yhteiskäyrä */
  const legFam = $('legendFamily');
  if (famOthers && famOthers.length && famTotal) {
    for (const o of famOthers) {
      const per = family.persons[o.i];
      const kidIdx = family.persons.slice(0, o.i).filter((x) => x.child).length;
      const col = per && per.child ? kidColor(kidIdx) : '#64748b';
      const oM = Math.min(o.arr.length - 1, months);
      let op = '';
      for (let i = 0; i <= oM; i++) op += `${i ? ' L' : 'M'} ${scaleX(a0 + i / 12).toFixed(1)},${scaleY(o.arr[i]).toFixed(1)}`;
      el('path', { d: op, fill: 'none', stroke: col, 'stroke-width': 1.5, opacity: 0.75, 'pointer-events': 'none' }, svg);
    }
    let tp = '';
    for (let i = 0; i <= months; i++) tp += `${i ? ' L' : 'M'} ${scaleX(a0 + i / 12).toFixed(1)},${scaleY(famTotal[i]).toFixed(1)}`;
    el('path', { d: tp, fill: 'none', stroke: '#e8edf8', 'stroke-width': 2, opacity: 0.85, 'pointer-events': 'none' }, svg);
    if (legFam) legFam.hidden = false;
  } else if (legFam) legFam.hidden = true;

  /* viuhkan persentiilit legendaan */
  const lbt = $('legendBandTxt');
  if (lbt) {
    lbt.textContent = sim.pctLo != null && (sim.pctLo !== 10 || sim.pctHi !== 90)
      ? `Vaihteluväli (P${sim.pctLo}–P${sim.pctHi})` : 'Vaihteluväli';
  }

  /* eläkeviiva */
  if (sim.retireAge != null && sim.retireAge >= a0 && sim.retireAge <= a1) {
    const rx = scaleX(sim.retireAge);
    el('line', { x1: rx, y1: plot.t, x2: rx, y2: plot.t + plot.h, stroke: 'rgba(139,124,246,0.5)', 'stroke-width': 1.5, 'stroke-dasharray': '3 5' }, svg);
  }

  /* hover-taso tooltipille (markereiden alle) */
  const overlay = el('rect', { x: plot.l, y: plot.t, width: plot.w, height: plot.h, fill: 'transparent' }, svg);
  overlay.addEventListener('pointermove', (e) => {
    if (draggingId != null || drawState.drag) return;
    const rect = svg.getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, plot.l, plot.l + plot.w);
    updateCrosshair(px, e.clientY - wrap.getBoundingClientRect().top);
  });
  overlay.addEventListener('pointerleave', hideCrosshair);
  // Napautus tyhjään piirtotilassa: valinta pois + ikäkursori napautuskohtaan
  overlay.addEventListener('pointerdown', (e) => {
    if (!fsOn) return;
    if (drawState.sel) drawDeselect(true);
    const rect = svg.getBoundingClientRect();
    updateCrosshair(clamp(e.clientX - rect.left, plot.l, plot.l + plot.w), e.clientY - wrap.getBoundingClientRect().top);
  });

  hoverLine = el('line', { x1: 0, y1: plot.t, x2: 0, y2: plot.t + plot.h, stroke: 'rgba(232,237,248,0.25)', 'stroke-width': 1, opacity: 0, 'pointer-events': 'none' }, svg);
  hoverDot = el('circle', { r: 4.5, fill: '#2dd4bf', stroke: '#0a0e1a', 'stroke-width': 2, opacity: 0, 'pointer-events': 'none' }, svg);

  /* piirtotilan valinta- ja osumakerrokset (markereiden alle) */
  if (fsOn) drawLayers();

  /* tapahtumamerkit — päällekkäisyys pinotaan ylöspäin
     (tavoitepisteet piirretään omina tähtäiminään arvokoordinaatteihinsa) */
  const sorted = [...state.events].sort((x, y) => x.age - y.age);
  let lastX = -1e9, level = 0;
  for (const ev of sorted) {
    if (ev.type === 'goal') continue;
    const def = EVENT_TYPES[ev.type];
    const age = clamp(ev.age, a0, a1);
    const m = clamp(Math.round((age - a0) * 12), 0, months);
    const x = scaleX(age);
    const cy = scaleY(sim.exp[m]);
    level = x - lastX < 40 ? level + 1 : 0;
    lastX = x;
    const y = Math.max(plot.t + 22, cy - 34 - level * 42);

    const selMark = drawState.sel && ((drawState.sel.kind === 'event' && drawState.sel.id === ev.id)
      || (drawState.sel.kind === 'retline' && ev.type === 'retirement'));
    const g = el('g', { class: 'marker' + (selMark ? ' sel' : ''), 'data-id': ev.id }, svg);
    // Yhdysviiva ja jalkapiste eivät ole tartuntapintaa — merkkiin tartutaan
    // ikonista (jalka peittäisi muuten esim. käyrällä istuvan tavoitepisteen)
    el('line', { x1: x, y1: y + 17, x2: x, y2: cy, stroke: 'rgba(148,168,220,0.35)', 'stroke-width': 1.2, 'pointer-events': 'none' }, g);
    el('circle', { cx: x, cy: cy, r: 3.5, fill: ev.type === 'retirement' ? '#8b7cf6' : '#2dd4bf', 'pointer-events': 'none' }, g);
    el('circle', {
      class: 'bg', cx: x, cy: y, r: 17,
      fill: '#141c33',
      stroke: selMark || ev.id === openPopoverId ? '#2dd4bf' : (ev.type === 'retirement' ? 'rgba(139,124,246,0.7)' : 'rgba(148,168,220,0.35)'),
      'stroke-width': selMark ? 2.5 : 1.5,
    }, g);
    const ico = el('text', { x, y: y + 5.5, 'text-anchor': 'middle', 'font-size': 15 }, g);
    ico.textContent = def.icon;
    if (ev.shared) {
      // ½-tunnus: hankinta on jaettu puolison kanssa
      el('circle', { cx: x + 13, cy: y - 11, r: 7, fill: '#141c33', stroke: 'rgba(45,212,191,0.6)', 'stroke-width': 1, 'pointer-events': 'none' }, g);
      const half = el('text', { x: x + 13, y: y - 8, 'text-anchor': 'middle', 'font-size': 9, fill: '#2dd4bf', 'pointer-events': 'none' }, g);
      half.textContent = '½';
    }
    const title = el('title', {}, g);
    let tdesc;
    if (ev.type === 'retirement') {
      const g = retGoal(ev);
      const wd = g === 'withdrawal' && sim.solvedWithdrawal != null ? sim.solvedWithdrawal : ev.withdrawal;
      const penTxt = ev.pension > 0 ? ` · työeläke ${fmtEur(ev.pension)}/kk` : '';
      tdesc = fmtEur(wd) + '/kk tuloa' + penTxt + (g === 'withdrawal' ? ' (kestävä)' : g === 'age' ? ' (aikaisin eläkeikä)' : '');
    } else if (ev.amount < 0 && ev.financing === 'loan') {
      const pmt = loanPayment(Math.max(0, -ev.amount - (ev.down || 0)), ev.rate || 0, ev.years || 10);
      tdesc = `${fmtEur(ev.amount)} · lainalla ${fmtEur(pmt)}/kk`;
    } else {
      tdesc = ev.amount ? fmtEur(ev.amount) : '';
    }
    if (ev.type !== 'retirement') {
      if (ev.recMonthly && ev.recYears > 0) tdesc += `${tdesc ? ' · ' : ''}${ev.recMonthly > 0 ? '+' : ''}${fmtEur(ev.recMonthly)}/kk ${Math.round(ev.recYears)} v`;
      if (ev.isAsset && ev.sellAge != null) tdesc += ` · myynti ${Math.round(ev.sellAge)} v`;
      if (ev.shared) tdesc += ' · jaettu puoliksi (oma osuus)';
    }
    title.textContent = `${evLabel(ev)} · ${Math.round(ev.age)} v · ${tdesc}`;

    g.addEventListener('pointerdown', (e) => {
      // Piirtotilassa valintamalli: napautus valitsee, veto valitusta säätää.
      // Eläkemerkki karttuu eläkeikäviivan valinnaksi (sama parametri).
      if (fsOn) drawPointerDown(e, ev.type === 'retirement' ? 'retline' : 'event', ev.type === 'retirement' ? null : ev.id);
      else startMarkerDrag(e, ev);
    });
  }

  /* tavoitepisteet normaalitilassa (piirtotilassa drawLayers hoitaa osumineen) */
  if (!fsOn) drawGoalMarkers(false);

  /* aloitusopasteet päällimmäiseksi — väistyvät ensimmäisestä tartunnasta */
  if (fsOn) drawGuides();

  renderBalance();
  if (openPopoverId != null) positionPopover();
  if (fsOn) {
    updateHud();
    if (drawState.sel && !drawState.drag) updateSelChip();
  }
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

  // Vertailu päällä: haamun arvo ja ero tässä iässä — "milloin ero syntyy"
  // löytyy liu'uttamalla
  let gRow = '';
  if (baseline && ghostSim) {
    const gv = ghostSim.exp[Math.min(m, ghostSim.months)];
    const d = sim.exp[m] - gv;
    if (Math.abs(d) >= 500) {
      gRow = `<div class="tt-row"><span>Vertailu</span><b>${fmtCompact(gv)} · <span class="${d >= 0 ? 'ok' : 'dbt'}">${d >= 0 ? '+' : '−'}${fmtCompact(Math.abs(d))}</span></b></div>`;
    }
  }

  tooltip.innerHTML =
    `<div class="tt-age">Ikä ${Math.round(age)} v · ${yearNow + Math.round(age - a0)}</div>` +
    `<div class="tt-row"><span>Sijoitukset</span><b class="hl">${fmtEur(sim.exp[m])}</b></div>` +
    gRow +
    `<div class="tt-row"><span>Vaihteluväli</span><b>${fmtCompact(sim.pess[m])} – ${fmtCompact(sim.opt[m])}</b></div>` +
    `<div class="tt-row"><span>Sijoitettu</span><b>${fmtEur(sim.invested[m])}</b></div>` +
    (sim.assets[m] > 0.5 ? `<div class="tt-row"><span>Omaisuus</span><b class="ast">${fmtEur(sim.assets[m])}</b></div>` : '') +
    (sim.debt[m] > 0.5 ? `<div class="tt-row"><span>Velkaa</span><b class="dbt">−${fmtEur(sim.debt[m])}</b></div>` : '') +
    (Math.abs(sim.payments[m]) > 0.5
      ? `<div class="tt-row"><span>Kk-erät</span><b class="${sim.payments[m] > 0 ? 'dbt' : 'ok'}">${sim.payments[m] > 0 ? fmtEur(sim.payments[m]) : '+' + fmtEur(-sim.payments[m])}/kk</b></div>` : '') +
    (sim.retireAge != null && age > sim.retireAge && sim.pension > 0 && age >= sim.pensionAge
      ? `<div class="tt-row"><span>Työeläke</span><b class="ok">+${fmtEur(sim.pension)}/kk</b></div>` : '') +
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
  zl.textContent = '0 €';

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

  const inv = sim.exp[m];
  const cats = sim.assetCats;
  let invSlices;
  const proP = proOf(state);
  if (proP) {
    // Pro: viipale per omaisuusluokka (myös omat luokat)
    const classes = classesOf(state);
    const w = weightsAt(age, retireAge, state);
    const proColors = ['#2dd4bf', '#8b7cf6', '#8fa0c4', '#f59e0b', '#22d3ee', '#a3e635'];
    invSlices = classes.map((c, i) => ({ l: c.name, v: inv * w[i], c: proColors[i % proColors.length] }));
  } else {
    const alloc = allocationAt(age, retireAge, state);
    invSlices = [
      { l: 'Osakkeet', v: inv * alloc.s, c: '#2dd4bf' },
      { l: 'Korot',    v: inv * alloc.b, c: '#8b7cf6' },
      { l: 'Käteinen', v: inv * alloc.c, c: '#8fa0c4' },
    ];
  }
  const slices = [
    ...invSlices,
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
    `<span class="dl">${s.l}</span><span class="dp">${Math.round((s.v / total) * 100)} %</span>` +
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
      if (ev.sellAge != null && ev.sellAge <= ev.age) ev.sellAge = ev.age + 1;
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
    if (def.familyOnly && !familyOn()) continue; // siirrot vain perhetilassa
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.title = def.label;
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    chip.innerHTML = `<span class="ic" aria-hidden="true">${def.icon}</span><span>${def.label}</span>`;
    chip.addEventListener('pointerdown', (e) => startPaletteDrag(e, type));
    // Näppäimistöllä: Enter/välilyönti lisää tapahtuman kuten napautus
    chip.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const existing = def.unique && state.events.find((ev) => ev.type === type);
      if (existing) {
        openPopover(existing.id);
      } else {
        const defAge = type === 'retirement' ? 65
          : type === 'goal' && sim && sim.retireAge != null ? Math.round(sim.retireAge)
          : state.ageNow + 5;
        addEvent(type, clamp(defAge, state.ageNow, state.ageEnd));
      }
    });
    pal.appendChild(chip);
  }
}

function startPaletteDrag(e, type) {
  e.preventDefault();
  const def = EVENT_TYPES[type];
  const startX = e.clientX, startY = e.clientY;
  let moved = false;
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
    if (Math.abs(e2.clientX - startX) + Math.abs(e2.clientY - startY) > 6) moved = true;
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
    } else if (!moved) {
      // Napautus lisää oletusikään — mobiilissa paletti ja graafi eivät
      // mahdu ruudulle yhtä aikaa, joten raahaus ei ole ainoa tapa
      const existing = def.unique && state.events.find((ev) => ev.type === type);
      if (existing) {
        openPopover(existing.id);
      } else {
        const defAge = type === 'retirement' ? 65
          : type === 'goal' && sim && sim.retireAge != null ? Math.round(sim.retireAge)
          : state.ageNow + 5;
        addEvent(type, clamp(defAge, state.ageNow, state.ageEnd));
      }
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
      // Eläketarpeen paras oletus on nykyinen kulutus, jos se on annettu
      ev.withdrawal = state.expenses
        ? clamp(Math.round(state.expenses / 100) * 100, 100, 1e6)
        : def.withdrawal;
      ev.pension = def.pension != null ? def.pension : 0;
      ev.pensionAge = def.pensionAge != null ? def.pensionAge : 65;
    } else if (def.metric) {
      // Tavoite: ei menneisyyteen; oletussumma = käyrän lähin pyöreä summa
      ev.age = clamp(Math.round(age), state.ageNow + 1, state.ageEnd);
      const m = sim ? clamp(Math.round((ev.age - sim.a0) * 12), 0, sim.months) : null;
      ev.amount = Math.max(5000, snapTo(m != null ? sim.exp[m] : def.amount, 5000));
    } else {
      ev.amount = def.amount;
      ev.financing = def.defaultFin || 'cash';
      if (ev.financing === 'loan') initLoanFields(ev);
      if (def.asset) { ev.isAsset = true; ev.appr = def.asset.appr; }
      if (def.rec) { ev.recMonthly = def.rec.monthly; ev.recYears = def.rec.years; }
    }
    state.events.push(ev);
    // Siirto syntyy parina: peilikappale puolison suunnitelmaan (linkId)
    if (def.familyOnly && familyOn()) {
      ev.linkId = 'tr' + (idSeq++) + '-' + Math.floor(Math.random() * 1e6);
      mirrorTransfer(ev);
    }
  }
  track('Tapahtuma lisätty', { tyyppi: EVENT_TYPES[type].label });
  renderAll();
  openPopover(ev.id);
  return ev;
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
      ['manual', 'Kokeilen itse'], ['withdrawal', 'Kestävä tulo'],
      ['age', 'Eläkeikä'], ['saving', 'Tarvittava säästö'],
    ].map(([k, lbl]) => `<button type="button" data-goal="${k}" class="${g === k ? 'on' : ''}">${lbl}</button>`).join('');
    const goalNotes = {
      manual: 'Säädä ikää ja kuukausituloa vapaasti ja katso riittävätkö varat.',
      withdrawal: 'Ikä lukittu — kuukausitulo mitoitetaan niin, että sijoitukset ovat 0&nbsp;€ suunnitelman lopussa.',
      age: 'Kuukausitulo lukittu — lasketaan aikaisin eläkeikä, jolla varat riittävät suunnitelman loppuun.',
      saving: 'Ikä ja kuukausitulo lukittu — lasketaan kuukausisäästö, jolla varat riittävät suunnitelman loppuun.',
    };
    const penVal = ev.pension != null ? ev.pension : 0;
    const penAgeVal = ev.pensionAge != null ? Math.round(ev.pensionAge) : 65;
    fields =
      `<p class="note">Kuukausisäästäminen päättyy ja eläkeaika alkaa tästä iästä.</p>` +
      `<div class="field"><span class="field-label">Tavoite</span><div class="seg seg-goal" id="pv-goals">${goalBtns}</div></div>` +
      `<p class="note">${goalNotes[g]}</p>` +
      `<label class="field"><span class="field-label">${ageSolved ? 'Aikaisin eläkeikä (laskettu)' : 'Eläkkeelle jäänti-ikä'}</span>` +
      `<span class="input"><input id="pv-age" type="number" min="${state.ageNow}" max="${state.ageEnd}" step="1" value="${ageVal}" ${ageSolved ? 'disabled' : ''} /><em>v</em></span></label>` +
      `<label class="field"><span class="field-label">${wdSolved ? 'Kestävä kuukausitulo (laskettu)' : 'Kuukausitulon tarve'} <small>koko kulutus eläkkeellä</small></span>` +
      `<span class="input"><input id="pv-wd" type="number" min="0" step="100" value="${wdVal}" ${wdSolved ? 'disabled' : ''} /><em>€/kk</em></span></label>` +
      // Varmuustaso: ratkaisu mitoitetaan Monte Carlo -onnistumisosuudelle
      (g !== 'manual'
        ? `<div class="field"><span class="field-label">Varmuustaso <small>osuus markkinapoluista, joilla tavoite onnistuu</small></span>` +
          `<div class="seg seg-goal" id="pv-confs">` +
          [[null, 'Odotettu'], [0.75, '75 %'], [0.85, '85 %'], [0.95, '95 %']]
            .map(([k, lbl]) => `<button type="button" data-conf="${k == null ? '' : k}" class="${(ev.conf || null) === k ? 'on' : ''}">${lbl}</button>`).join('') +
          `</div></div>`
        : '') +
      `<div class="row2">` +
      `<label class="field"><span class="field-label">Työeläke (arvio)</span>` +
      `<span class="input"><input id="pv-pen" type="number" min="0" step="100" value="${penVal}" /><em>€/kk</em></span></label>` +
      `<label class="field"><span class="field-label">Eläke alkaa</span>` +
      `<span class="input"><input id="pv-penage" type="number" min="${state.ageNow}" max="${state.ageEnd}" step="1" value="${penAgeVal}" /><em>v</em></span></label>` +
      `</div>` +
      `<p class="note pen-note" id="pv-pen-note"></p>` +
      (g === 'saving' || g === 'age' ? `<p class="note req-note" id="pv-req"></p>` : '');
  } else if (def.metric) {
    // Tavoitepiste: mittari, ei kassavirtaa — vain ikä ja tavoitesumma
    fields =
      `<p class="note">Tavoitepiste on mittari — se ei siirrä rahaa. Piirtopöydän Ratkaise hakee kuukausisäästön, jolla polku osuu pisteeseen.</p>` +
      `<label class="field"><span class="field-label">Ikä</span>` +
      `<span class="input"><input id="pv-age" type="number" min="${state.ageNow + 1}" max="${state.ageEnd}" step="1" value="${Math.round(ev.age)}" /><em>v</em></span></label>` +
      `<label class="field"><span class="field-label">Tavoitesumma</span>` +
      `<span class="input"><input id="pv-amount" type="number" min="0" step="5000" value="${ev.amount}" /><em>€</em></span></label>`;
  } else if (def.familyOnly && familyOn()) {
    // Siirto: pari kirjautuu molempien suunnitelmiin — kohde valittavissa
    const out = ev.type === 'transferOut';
    const ti = ev.peerPid != null && idxOfPid(ev.peerPid) >= 0 ? idxOfPid(ev.peerPid) : otherIdx();
    const peers = othersOf();
    fields =
      `<p class="note">Siirto kirjautuu molempien suunnitelmiin samaan kalenterihetkeen — vastapuolelle peilikuvana.</p>` +
      `<label class="field"><span class="field-label">Ikä (oma)</span>` +
      `<span class="input"><input id="pv-age" type="number" min="${state.ageNow}" max="${state.ageEnd}" step="1" value="${Math.round(ev.age)}" /><em>v</em></span></label>` +
      `<label class="field"><span class="field-label">Summa</span>` +
      `<span class="input"><input id="pv-amount" type="number" step="1000" value="${ev.amount}" /><em>€</em></span></label>` +
      (peers.length > 1
        ? `<label class="field"><span class="field-label">${out ? 'Saaja' : 'Antaja'}</span>` +
          `<span class="input"><select id="pv-peer">${peers.map((x) => `<option value="${x.p.pid}"${x.i === ti ? ' selected' : ''}>${escapeHtml(x.p.name)}</option>`).join('')}</select></span></label>`
        : `<p class="note">${out ? 'Saaja' : 'Antaja'}: <b>${escapeHtml(family.persons[ti] ? family.persons[ti].name : '?')}</b></p>`);
  } else {
    fields =
      `<label class="field"><span class="field-label">Ikä</span>` +
      `<span class="input"><input id="pv-age" type="number" min="${state.ageNow}" max="${state.ageEnd}" step="1" value="${Math.round(ev.age)}" /><em>v</em></span></label>` +
      `<label class="field"><span class="field-label">Summa (− kulu, + tulo)</span>` +
      `<span class="input"><input id="pv-amount" type="number" step="1000" value="${ev.amount}" /><em>€</em></span></label>`;

    // Toistuva kuukausierä: esim. lapsen kulut, harrastus tai vuokratulo
    const hasRec = ev.recMonthly != null;
    fields +=
      `<label class="toggle" style="margin-top:2px"><input id="pv-rec" type="checkbox" ${hasRec ? 'checked' : ''} /><span class="switch"></span>` +
      `<span>Toistuva kuukausierä <small>vaikuttaa joka kuukausi tietyn ajan</small></span></label>`;
    if (hasRec) {
      fields +=
        `<div class="row2" style="margin-top:10px">` +
        `<label class="field"><span class="field-label">Erä (− meno, + tulo)</span>` +
        `<span class="input"><input id="pv-recm" type="number" step="50" value="${ev.recMonthly}" /><em>€/kk</em></span></label>` +
        `<label class="field"><span class="field-label">Kesto</span>` +
        `<span class="input"><input id="pv-recy" type="number" min="1" max="60" step="1" value="${Math.round(ev.recYears != null ? ev.recYears : 10)}" /><em>v</em></span></label>` +
        `</div>`;
    }

    // Jaettu hankinta: puolet kummallekin aikuiselle (vain perhetilassa)
    if (familyOn() && shareable(ev) && !family.persons[family.active].child
      && (ev.shared || adultPeerIdx() >= 0)) {
      const ti = ev.peerPid != null ? idxOfPid(ev.peerPid) : adultPeerIdx();
      const peerName = ti >= 0 ? family.persons[ti].name : 'puoliso';
      fields +=
        `<label class="toggle" style="margin-top:2px"><input id="pv-shared" type="checkbox" ${ev.shared ? 'checked' : ''} /><span class="switch"></span>` +
        `<span>Jaettu puolison kanssa <small>puolet kummallekin — kentissä oma osuutesi</small></span></label>` +
        (ev.shared
          ? `<p class="note">Koko summa ${fmtEur(Math.abs(ev.amount) * 2)}${ev.recMonthly ? ` + ${fmtEur(Math.abs(ev.recMonthly) * 2)}/kk` : ''} — toinen puolikas on kirjattu: ${escapeHtml(peerName)}. Muutokset synkataan molemmille.</p>`
          : '');
    }

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
        // Myynti: omaisuuserä realisoidaan sijoitusvarallisuudeksi
        const selling = ev.sellAge != null;
        fields +=
          `<label class="toggle" style="margin-top:10px"><input id="pv-sell" type="checkbox" ${selling ? 'checked' : ''} /><span class="switch"></span>` +
          `<span>Myyn kohteen <small>arvo sijoituksiin, laina pois, vero voitosta</small></span></label>`;
        if (selling) {
          fields +=
            `<label class="field" style="margin-top:10px"><span class="field-label">Myynti-ikä</span>` +
            `<span class="input"><input id="pv-sellage" type="number" min="${Math.ceil(ev.age) + 1}" max="${state.ageEnd}" step="1" value="${Math.round(ev.sellAge)}" /><em>v</em></span></label>` +
            `<label class="toggle"><input id="pv-selltf" type="checkbox" ${ev.sellTaxFree ? 'checked' : ''} /><span class="switch"></span>` +
            `<span>Verovapaa myynti <small>esim. oma asunto, asuttu ≥ 2 v</small></span></label>` +
            `<p class="note sale-note" id="pv-sale-note"></p>`;
        }
      }
    }
  }

  const nameField =
    `<label class="field"><span class="field-label">Nimi</span>` +
    `<span class="input"><input id="pv-name" type="text" maxlength="${NAME_MAX}" placeholder="${escapeHtml(def.label)}" /></span></label>`;

  popover.innerHTML =
    `<h3><span aria-hidden="true">${def.icon}</span><span id="pv-title">${escapeHtml(evLabel(ev))}</span><button class="close" id="pv-close" aria-label="Sulje">✕</button></h3>` +
    nameField +
    fields +
    `<div class="actions">` +
    (def.unique ? '' : `<button class="dup" id="pv-dup">Monista</button>`) +
    `<button class="del" id="pv-del">Poista</button></div>`;
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
  const dup = $('pv-dup');
  if (dup) dup.addEventListener('click', () => {
    // Monista tapahtuma vuotta myöhemmäksi (esim. toinen lapsi tai auto)
    const copy = JSON.parse(JSON.stringify(ev));
    copy.id = idSeq++;
    copy.age = clamp(Math.round(ev.age) + 1, state.ageNow, state.ageEnd);
    if (copy.sellAge != null) copy.sellAge = clamp(copy.sellAge + 1, copy.age + 1, state.ageEnd);
    state.events.push(copy);
    renderAll();
    openPopover(copy.id);
  });
  $('pv-age').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    // Keskeneräinen syöte (esim. "6" matkalla lukuun 65) ei muuta tilaa
    if (isNaN(v) || v < state.ageNow || v > state.ageEnd) return;
    ev.age = v;
    renderAllKeepPopover();
  });
  $('pv-age').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) ev.age = clamp(v, state.ageNow, state.ageEnd);
    if (ev.sellAge != null && ev.sellAge <= ev.age) ev.sellAge = ev.age + 1;
    e.target.value = Math.round(ev.age * 10) / 10;
    renderAllKeepPopover();
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
  // Siirron etumerkki seuraa suuntaa: läheiselle − , läheiseltä +
  if (def.familyOnly && am) am.addEventListener('change', (e) => {
    const v = Math.abs(parseFloat(e.target.value) || 0);
    ev.amount = ev.type === 'transferOut' ? -v : v;
    e.target.value = ev.amount;
    renderAllKeepPopover();
  });
  const sh = $('pv-shared');
  if (sh) sh.addEventListener('change', (e) => {
    if (e.target.checked) {
      // puolita osuudet; pari peilautuu puolisolle tallennuksessa
      ev.shared = true;
      ev.linkId = newLinkId('sh');
      ev.peerPid = family.persons[adultPeerIdx()].pid;
      halveShared(ev);
    } else {
      // pari pois puolisolta, oma osuus takaisin täydeksi
      const ti = ev.peerPid != null ? idxOfPid(ev.peerPid) : -1;
      if (ti >= 0) family.persons[ti].data.events = family.persons[ti].data.events.filter((x) => x.linkId !== ev.linkId);
      unshareEvent(ev);
    }
    renderAllKeepPopover(); // tallennus peilaa parin
    openPopover(id); // kentät näyttävät uudet osuudet
  });
  const peerSel = $('pv-peer');
  if (peerSel) peerSel.addEventListener('change', (e) => {
    // vanha pari pois vanhalta kohteelta; reconcile peilaa uudelle
    const oldTi = ev.peerPid != null ? idxOfPid(ev.peerPid) : -1;
    if (oldTi >= 0 && ev.linkId) {
      const od = family.persons[oldTi].data;
      od.events = od.events.filter((x) => x.linkId !== ev.linkId);
    }
    ev.peerPid = e.target.value;
    renderAllKeepPopover();
  });
  const wd = $('pv-wd');
  if (wd) wd.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.withdrawal = Math.max(0, v); updatePenNote(); renderAllKeepPopover(); }
  });
  const pen = $('pv-pen');
  if (pen) pen.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.pension = Math.max(0, v); updatePenNote(); renderAllKeepPopover(); }
  });
  const penAge = $('pv-penage');
  if (penAge) {
    penAge.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (isNaN(v) || v < state.ageNow || v > state.ageEnd) return; // kirjoitus kesken
      ev.pensionAge = v;
      updatePenNote();
      renderAllKeepPopover();
    });
    penAge.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) ev.pensionAge = clamp(v, state.ageNow, state.ageEnd);
      e.target.value = Math.round(ev.pensionAge);
      updatePenNote();
      renderAllKeepPopover();
    });
  }
  // Työeläkkeen erittely: paljonko tulosta katetaan eläkkeellä, paljonko sijoituksista
  const updatePenNote = () => {
    const note = $('pv-pen-note');
    if (!note) return;
    const p = Math.max(0, ev.pension || 0);
    const wdEff = retGoal(ev) === 'withdrawal' && sim && sim.solvedWithdrawal != null ? sim.solvedWithdrawal : (ev.withdrawal || 0);
    if (p <= 0) {
      note.innerHTML = 'Ei työeläkettä — koko kuukausitulo nostetaan sijoituksista.';
      return;
    }
    const draw = Math.max(0, wdEff - p);
    const paStr = Math.round(ev.pensionAge != null ? ev.pensionAge : 65);
    note.innerHTML = `Työeläke kattaa <b>${fmtEur(p)}/kk</b> (alk. ${paStr} v). ` +
      (draw > 0 ? `Sijoituksista noin <b>${fmtEur(draw)}/kk</b>${state.tax ? ' + vero' : ''}.` : 'Sijoituksia ei tarvitse nostaa.');
  };
  updatePenNote();
  const goalsBox = $('pv-goals');
  if (goalsBox) for (const b of goalsBox.querySelectorAll('button')) {
    b.addEventListener('click', () => {
      ev.goal = b.dataset.goal;
      renderAllKeepPopover();
      openPopover(id);
    });
  }
  const confsBox = $('pv-confs');
  if (confsBox) for (const b of confsBox.querySelectorAll('button')) {
    b.addEventListener('click', () => {
      const v = parseFloat(b.dataset.conf);
      if (isNaN(v)) delete ev.conf; else ev.conf = v;
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
    if (!ev.isAsset) { delete ev.sellAge; delete ev.sellTaxFree; }
    renderAllKeepPopover();
    openPopover(id);
  });
  const appr = $('pv-appr');
  if (appr) appr.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.appr = clamp(v, -30, 15); updateSaleNote(); renderAllKeepPopover(); }
  });

  // Myyntitiedot: tarkat luvut tulevat simulaattorin saleInfos-listasta
  const updateSaleNote = () => {
    const note = $('pv-sale-note');
    if (!note) return;
    const info = sim && (sim.saleInfos || []).find((x) => x.id === ev.id);
    if (!info) { note.textContent = 'Myynti osuu suunnitelman ulkopuolelle.'; return; }
    note.innerHTML = `Myynti ~<b>${fmtEur(info.value)}</b>` +
      (info.payoff > 0.5 ? ` · lainaa pois ${fmtEur(info.payoff)}` : '') +
      (info.tax > 0.5 ? ` · vero ${fmtEur(info.tax)}` : '') +
      ` → sijoituksiin <b>${fmtEur(info.value - info.payoff - info.tax)}</b>`;
  };
  const sellToggle = $('pv-sell');
  if (sellToggle) sellToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      ev.sellAge = clamp(Math.round(ev.age) + 10, ev.age + 1, state.ageEnd);
      ev.sellTaxFree = ev.type === 'home';
    } else {
      delete ev.sellAge; delete ev.sellTaxFree;
    }
    renderAllKeepPopover();
    openPopover(id);
  });
  const sellAgeI = $('pv-sellage');
  if (sellAgeI) {
    sellAgeI.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (isNaN(v) || v <= ev.age || v > state.ageEnd) return; // kirjoitus kesken
      ev.sellAge = v;
      renderAllKeepPopover();
      updateSaleNote();
    });
    sellAgeI.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) ev.sellAge = clamp(v, ev.age + 1, state.ageEnd);
      e.target.value = Math.round(ev.sellAge);
      renderAllKeepPopover();
      updateSaleNote();
    });
  }
  const sellTf = $('pv-selltf');
  if (sellTf) sellTf.addEventListener('change', (e) => {
    ev.sellTaxFree = e.target.checked;
    renderAllKeepPopover();
    updateSaleNote();
  });
  updateSaleNote();

  const recToggle = $('pv-rec');
  if (recToggle) recToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      const rdef = EVENT_TYPES[ev.type].rec;
      if (ev.recMonthly == null) ev.recMonthly = rdef ? rdef.monthly : -200;
      if (ev.recYears == null) ev.recYears = rdef ? rdef.years : 10;
    } else {
      delete ev.recMonthly; delete ev.recYears;
    }
    renderAllKeepPopover();
    openPopover(id);
  });
  const recM = $('pv-recm');
  if (recM) recM.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.recMonthly = clamp(v, -1e5, 1e5); renderAllKeepPopover(); }
  });
  const recY = $('pv-recy');
  if (recY) recY.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.recYears = clamp(v, 1, 60); renderAllKeepPopover(); }
  });

  updateSolvedFields();
  positionPopover();

  // Mobiilissa tapahtumalista on graafin alapuolella — popover avautuu
  // graafin sisään, joten rullataan se tarvittaessa näkyviin
  const pr = popover.getBoundingClientRect();
  if (pr.top < 0 || pr.bottom > window.innerHeight) {
    popover.scrollIntoView({ block: 'nearest' });
  }
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
      : 'Tavoite ei toteudu — tulotavoite on liian suuri millään realistisella säästöllä.';
  } else if (sim.goal === 'age') {
    req.innerHTML = sim.solvedRetireAge != null
      ? `Aikaisin eläkeikä <b>${fmtAge(sim.solvedRetireAge)}</b> kuukausitulolla ${fmtEur(sim.withdrawal)}/kk`
      : 'Tavoite ei toteudu — tulotavoite ei onnistu edes suunnitelman lopussa.';
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
  if (tourStep >= 0) { endTour(); return; }
  if (fsOn) {
    // Piirtopöydässä Esc purkaa yhden kerroksen kerrallaan
    if (!drawEsc()) exitFs();
    return;
  }
  closePopover();
  closeSummary();
  $('infoModal').hidden = true;
  $('tableModal').hidden = true;
  $('donateModal').hidden = true;
  $('compareModal').hidden = true;
  $('proModal').hidden = true;
  $('mountainModal').hidden = true;
  closeExamplesMenu();
  closeMoreMenu();
});

/* ===================== Piirtopöytä: kokoruudun piirtotila ===================== */
// CSS-valtaus, ei Fullscreen API:a (iOS Safari ei tue puhelimessa).
// Sisään: ⛶-nappi graafin kulmassa tai F. Ulos: Esc, ✕ tai selaimen back —
// history.pushState pitää back-eleen hallussa. Tila ei katoa kumpaankaan
// suuntaan: sama state, sama undo-pino, haamu jää voimaan poistuttaessa.

function announce(msg) {
  const el = $('ariaLive');
  if (el) { el.textContent = ''; el.textContent = msg; }
}

// Kerroksittainen Esc piirtotilassa — palauttaa true jos kerros purettiin:
// raahaus → dialogi → valinta → (false = kutsuja poistuu piirtotilasta)
function drawEsc() {
  if (fsAddMenuEl) { closeFsAddMenu(); return true; }
  if (drawState.drag) { drawCancelDrag(); return true; }
  if (openPopoverId != null) { closePopover(); return true; }
  if (drawState.sel) { drawDeselect(); return true; }
  return false;
}

function enterFs() {
  if (fsOn) return;
  fsOn = true;
  track('Piirtopöytä avattu');
  document.body.classList.add('fs');
  try { history.pushState({ fs: 1 }, ''); } catch (e) { /* esim. sandbox */ }
  // Haamu vertailukohdaksi automaattisesti, jotta HUD-deltat elävät heti
  if (!baseline) setBaseline('Lähtötilanne');
  closePopover();
  $('hud').hidden = false;
  wrap.setAttribute('role', 'application');
  wrap.setAttribute('aria-label', 'Piirtopöytä: valitse käyrän osa, tapahtuma tai viiva ja säädä raahaamalla tai nuolinäppäimillä');
  wrap.tabIndex = 0;
  renderChart();
  updateHud();
  drawShowHint();
  try { wrap.focus({ preventScroll: true }); } catch (e) {}
  announce('Piirtopöytä avattu');
}

function exitFs(fromPop = false) {
  if (!fsOn) return;
  closeFsAddMenu();
  if (drawState.drag) drawCancelDrag();
  drawDeselect(true);
  drawDismissHint();
  fsOn = false;
  document.body.classList.remove('fs');
  $('hud').hidden = true;
  wrap.removeAttribute('role');
  wrap.removeAttribute('aria-label');
  wrap.removeAttribute('tabindex');
  // Oma poistuminen kuluttaa pushStaten pois; back-ele tulee popstatesta,
  // jolloin historia on jo kelattu
  if (!fromPop && history.state && history.state.fs) { try { history.back(); } catch (e) {} }
  renderChart();
  announce('Piirtopöytä suljettu');
}

window.addEventListener('popstate', () => { if (fsOn) exitFs(true); });

// HUD: syy on sormessa (chippi), seuraus näkyy täällä. Kolme lukua + deltat
// haamukäyrää vasten. Onnistumis-% himmennetään raahauksen ajaksi (stale) ja
// tarkentuu workerista irrotuksen jälkeen.
updateHud = function () {
  if (!fsOn || !sim) return;
  const box = $('hudMetrics');
  const g = ghostSim;
  // Delta samalla polkumäärällä molemmin puolin — muuten vertailu on vino
  const ghostP = g ? (ghostMc && sim.mcPaths === ghostMc.paths ? ghostMc.successProb : g.successProb) : null;
  const curP = sim.successProb;
  const items = [];
  const metric = (k, v, d, eps, fmt, cls) => {
    let dh = '';
    if (d != null && Math.abs(d) >= eps) {
      const up = d > 0;
      dh = `<div class="d ${up ? 'up' : 'down'}">${up ? '▲ +' : '▼ −'}${fmt(Math.abs(d))}</div>`;
    }
    items.push(`<div class="hud-m${cls || ''}"><div class="k">${k}</div><div class="v">${v}</div>${dh}</div>`);
  };
  metric('Onnistuminen',
    curP != null ? Math.round(curP * 100) + ' %' : '–',
    curP != null && ghostP != null ? Math.round(curP * 100) - Math.round(ghostP * 100) : null,
    1, (x) => `${x} %-yks`, sim.successStale ? ' stale' : '');
  metric('Varallisuus eläkeiässä',
    sim.wAtRet != null ? fmtCompact(sim.wAtRet) : '–',
    sim.wAtRet != null && g && g.wAtRet != null ? sim.wAtRet - g.wAtRet : null,
    500, fmtCompact, '');
  metric('Kestävä tulo',
    sim.sustainableWd != null ? `${Math.round(sim.sustainableWd).toLocaleString('fi-FI')} €/kk` : '–',
    sim.sustainableWd != null && g && g.sustainableWd != null ? sim.sustainableWd - g.sustainableWd : null,
    20, (x) => `${Math.round(x).toLocaleString('fi-FI')} €/kk`, '');
  if (familyOn()) {
    metric('Perheen onnistumis-%',
      jointMc ? Math.round(jointMc.successProb * 100) + ' %' : '…',
      null, 1, (x) => x, sim.successStale ? ' stale' : '');
  }
  box.innerHTML = items.join('');
};

/* --- Valinta ja suora manipulaatio --- */
// Tilakone: idle → selected → dragging → selected. Napautus valitsee
// (korostus + chippi), raahaus valitusta objektista säätää parametria
// käänteisratkaisijalla. Raahaus valitsemattomalla graafilla = scrub.

const drawState = { sel: null, drag: null };
// Opastus kuitataan opituksi vasta ensimmäisestä onnistuneesta vedosta —
// siihen asti haamunuolet näytetään joka avauksella (kuten pelien tutoriaalit)
const DRAW_TUTOR_KEY = 'vp-draw-tutored';
let drawGuideOn = false;
let nudgeTimer = null;
let delArm = null;
let lastTapT = 0, lastTapKey = '';

const retireEv = () => state.events.find((e) => e.type === 'retirement') || null;
const fmtNum = (v) => Math.round(v).toLocaleString('fi-FI');

/* Chippi: syy sormessa — muuttuva parametri, vanha → uusi, delta */

function chipShowAt(html, px, py, warn) {
  const c = $('dchip');
  c.innerHTML = html;
  c.hidden = false;
  c.classList.toggle('warn', !!warn);
  // Telakoitu graafin yläreunaan: ei peitä käyrää eikä hyppelehdi osoittimen
  // mukana — kohteen sijainnin näyttävät korostus, pystyviiva ja ikä akselilla
  c.style.transform = `translate(${Math.round(plot.l + plot.w / 2)}px, ${Math.round(plot.t + 8)}px) translateX(-50%)`;
}

function chipHide() { $('dchip').hidden = true; }

function chipRow(label, from, to, unit) {
  const d = to - from;
  const dTxt = Math.abs(d) < 0.5 ? '±0' : `${d > 0 ? '+' : '−'}${fmtNum(Math.abs(d))}`;
  return `<div class="dchip-row"><b>${label}</b> ${fmtNum(from)} → ${fmtNum(to)} ${unit} <em class="${d >= 0 ? 'up' : 'down'}">${dTxt}</em></div>`;
}

const chipWrap = (rows, constraint, note) => rows
  + (note ? `<div class="dchip-note">${note}</div>` : '')
  + (constraint ? `<div class="dchip-constraint">⚠ ${constraint}</div>` : '');

// Valitun objektin ankkuri, chipin sisältö ja ruudunlukijakuvaus
function selInfo() {
  const s = drawState.sel;
  if (!s || !sim) return null;
  const { a0, months } = sim;
  const retA = sim.retireAge;
  const mRet = retA != null ? clamp(Math.round((retA - a0) * 12), 0, months) : months;
  const at = (m) => ({ x: scaleX(a0 + m / 12), y: scaleY(sim.exp[clamp(m, 0, months)]) });
  const hint = '<div class="dchip-note">Raahaa — tai nuolet, Enter muokkaa</div>';
  if (s.kind === 'acc') {
    return { ...at(Math.max(6, Math.round(mRet / 2))),
      aria: `Kuukausisäästö ${fmtNum(state.monthly)} euroa kuukaudessa`,
      html: `<div class="dchip-row"><b>Kuukausisäästö</b> ${fmtNum(state.monthly)} €/kk</div>${hint}` };
  }
  if (s.kind === 'wd') {
    return { ...at(mRet + Math.round((months - mRet) / 2)),
      aria: `Kuukausitulo eläkkeellä ${fmtNum(sim.withdrawal)} euroa kuukaudessa`,
      html: `<div class="dchip-row"><b>Kuukausitulo</b> ${fmtNum(sim.withdrawal)} €/kk</div>${hint}` };
  }
  if (s.kind === 'end') {
    return { ...at(months),
      aria: `Pääomaa jäljellä suunnitelman lopussa ${fmtNum(sim.wEnd)} euroa`,
      html: `<div class="dchip-row"><b>Pääomaa jäljellä</b> ${fmtCompact(sim.wEnd)}</div>`
        + '<div class="dchip-note">Raahaa pystysuunnassa — kuukausitulo joustaa</div>' };
  }
  if (s.kind === 'retline' && retA != null) {
    return { x: scaleX(retA), y: plot.t + 64,
      aria: `Eläkeikä ${Math.round(retA)} vuotta`,
      html: `<div class="dchip-row"><b>Eläkeikä</b> ${Math.round(retA)} v</div>${hint}` };
  }
  if (s.kind === 'famtotal' && famTotalCache) {
    const m = Math.max(6, Math.round(mRet / 2));
    return { x: scaleX(a0 + m / 12), y: scaleY(famTotalCache[m]),
      aria: 'Perheen yhteiskäyrä valittu — raahaus joustaa molempien kuukausisäästöjä',
      html: '<div class="dchip-row"><b>Perheen yhteiskäyrä</b></div>'
        + '<div class="dchip-note">Raahaa — molempien kuukausisäästöt joustavat yhtä paljon</div>' };
  }
  if (s.kind === 'event' || s.kind === 'goal') {
    const ev = state.events.find((x) => x.id === s.id);
    if (!ev) return null;
    const p = at(clamp(Math.round((ev.age - a0) * 12), 0, months));
    if (s.kind === 'goal') return goalSelInfo(ev);
    return { ...p,
      aria: `${evLabel(ev)}, ikä ${Math.round(ev.age)} vuotta${ev.amount != null ? `, summa ${fmtNum(ev.amount)} euroa` : ''}`,
      html: `<div class="dchip-row"><b>${escapeHtml(evLabel(ev))}</b> ${Math.round(ev.age)} v${ev.amount != null ? ` · ${fmtCompact(ev.amount)}` : ''}</div>`
        + '<div class="dchip-note">←→ ikä · ↑↓ summa · Enter muokkaa · Delete poistaa</div>' };
  }
  return null;
}

function updateSelChip() {
  if (!fsOn || !drawState.sel || drawState.drag) { if (!drawState.drag) chipHide(); return; }
  // Muokkausdialogi kertoo jo saman — päällekkäinen chippi pois tieltä
  if (openPopoverId != null) { chipHide(); return; }
  const info = selInfo();
  if (!info) { chipHide(); return; }
  chipShowAt(info.html, info.x, info.y, false);
  wireChipActions();
}

/* Tilakoneen siirtymät */

function drawSelect(kind, id, silent) {
  drawState.sel = { kind, id: id == null ? null : id };
  delArm = null;
  renderChart(true); // korostus — sim ei muuttunut
  updateSelChip();
  if (!silent) {
    const info = selInfo();
    announce(info ? 'Valittu: ' + info.aria : 'Valittu');
  }
}

function drawDeselect(silent) {
  if (!drawState.sel) return;
  drawState.sel = null;
  delArm = null;
  chipHide();
  renderChart(true);
  if (!silent) announce('Valinta poistettu');
}

function drawPointerDown(e, kind, id) {
  if (!fsOn) return;
  e.preventDefault();
  e.stopPropagation();
  drawDismissHint();
  if (openPopoverId != null) closePopover();
  const s = drawState.sel;
  const same = s && s.kind === kind && s.id === (id == null ? null : id);
  if (!same) { drawSelect(kind, id); return; } // valinta ensin, raahaus sitten
  drawStartDrag(e, kind, id);
}

function drawStartDrag(e, kind, id) {
  pushUndoNow(); // raahausta edeltävä tila → Ctrl+Z kumoaa koko vedon kerralla
  const rect = svg.getBoundingClientRect();
  const ev = kind === 'event' || kind === 'goal' ? state.events.find((x) => x.id === id) : retireEv();
  const needSolver = kind === 'acc' || kind === 'wd' || kind === 'end';
  drawState.drag = {
    kind, id: id == null ? null : id, ev,
    // Esikäsittely kerran — per frame vain runPath-bisektio
    solver: needSolver ? makeDragSolver(state, lastFullSim || sim) : null,
    famSolver: kind === 'famtotal' ? makeFamilySolver() : null,
    cancelSnap: JSON.stringify(serialize()),
    startX: e.clientX, startY: e.clientY,
    startPy: clamp(e.clientY - rect.top, plot.t, plot.t + plot.h),
    startMonthly: state.monthly,
    startWd: ev && ev.type === 'retirement' && retGoal(ev) === 'withdrawal' && sim.solvedWithdrawal != null
      ? sim.solvedWithdrawal : (ev && ev.withdrawal != null ? ev.withdrawal : 0),
    startAge: ev ? ev.age : null,
    startAmount: ev ? ev.amount : null,
    moved: false, lastConstraint: null,
  };
  dragLight = true;
  tooltip.hidden = true;
  hideCrosshair();
  document.addEventListener('pointermove', drawDragMove);
  document.addEventListener('pointerup', drawDragUp);
}

// Käsin säätö ohittaa tavoitetilan — tehollinen ratkaistu arvo lähtöpisteeksi
function dragGoalManual(d) {
  const ev = d.ev;
  if (!ev || ev.type !== 'retirement') return;
  if ((d.kind === 'wd' || d.kind === 'end') && retGoal(ev) === 'withdrawal') {
    ev.withdrawal = d.startWd;
    ev.goal = 'manual';
  }
  if (d.kind === 'retline' && retGoal(ev) === 'age') ev.goal = 'manual';
}

function drawDragMove(e2) {
  const d = drawState.drag;
  if (!d) return;
  if (!d.moved && Math.abs(e2.clientX - d.startX) + Math.abs(e2.clientY - d.startY) < 4) return;
  if (!d.moved) { d.moved = true; dragGoalManual(d); }
  const rect = svg.getBoundingClientRect();
  const px = clamp(e2.clientX - rect.left, plot.l, plot.l + plot.w);
  const py = clamp(e2.clientY - rect.top, plot.t, plot.t + plot.h);
  // Shift ohittaa snapin työpöydällä; kosketuksella snap aina
  const noSnap = e2.shiftKey && e2.pointerType !== 'touch';
  let chip = null;
  if (d.kind === 'acc') chip = dragAcc(d, invX(px), invY(py), noSnap);
  else if (d.kind === 'wd') chip = dragWd(d, invX(px), invY(py), noSnap);
  else if (d.kind === 'end') chip = dragEnd(d, invY(py), noSnap);
  else if (d.kind === 'retline') chip = dragRetline(d, invX(px), noSnap);
  else if (d.kind === 'event') chip = dragEvent(d, invX(px), py, noSnap);
  else if (d.kind === 'goal') chip = dragGoal(d, invX(px), invY(py), noSnap);
  else if (d.kind === 'famtotal') chip = dragFamTotal(d, invX(px), invY(py), noSnap);
  if (chip) {
    chipShowAt(chip.html, px, py, !!chip.constraint);
    // Raja vastustaa: värinä kun osutaan rajaan (Android; iOS ei tue vibratea)
    if (chip.constraint && chip.constraint !== d.lastConstraint && navigator.vibrate) navigator.vibrate(10);
    d.lastConstraint = chip.constraint || null;
  }
  scheduleRender(); // rAF-throttlattu kevyt frame — ei MC:tä pointermovessa
}

/* Raahauskielioppi: kohde → parametri (suunnitelman 5.2-taulukko) */

// Kertymäsegmentti: käyrä on naru — tartuntapiste seuraa osoitinta,
// bisektio hakee kuukausisäästön, jolla odotuspolku kulkee pisteen kautta
function dragAcc(d, age, val, noSnap) {
  // Porrastettu säästö: raahaus ei ratkaise yhtä summaa — ohjaa editoriin
  if (Array.isArray(state.savePhases) && state.savePhases.length) {
    return { html: chipWrap(chipRow('Kuukausisäästö', state.monthly, state.monthly, '€/kk'),
      'Säästö on porrastettu — muokkaa Perustiedoista'), constraint: 'porrastettu' };
  }
  const s = d.solver;
  const hiAge = sim.retireAge != null ? sim.retireAge : sim.a1;
  const a = clamp(age, sim.a0 + 1 / 12, hiAge);
  let solved = solveParam((ms) => s.wealthAtMonthly(ms, a), Math.max(0, val), 0, 1e6, true);
  solved = noSnap ? Math.round(solved) : snapTo(solved, 10);
  let constraint = null;
  if (solved <= 0) { solved = 0; constraint = 'Säästö ei voi olla negatiivinen'; }
  else if (solved >= 1e6) { solved = 1e6; constraint = 'Yläraja vastassa'; }
  if (state.monthly !== solved) { state.monthly = solved; $('monthly').value = solved; }
  return { html: chipWrap(chipRow('Kuukausisäästö', d.startMonthly, solved, '€/kk'), constraint), constraint };
}

// Nostosegmentti: bisektio kuukausituloon
function dragWd(d, age, val, noSnap) {
  if (!d.ev) return null;
  const pm = proOf(state);
  if (pm && pm.wd.mode === 'pct') {
    return { html: chipWrap('<div class="dchip-row"><b>%-strategia käytössä</b></div>', null,
      'Tulo joustaa salkun mukana — säädä prosenttia Nostostrategia-kortista'), constraint: null };
  }
  const lo = (sim.retireAge != null ? sim.retireAge : sim.a0) + 1 / 12;
  const a = clamp(age, lo, sim.a1);
  let solved = solveParam((x) => d.solver.wealthAtWd(x, a), Math.max(0, val), 0, 1e7, false);
  solved = noSnap ? Math.round(solved) : snapTo(solved, 10);
  let constraint = null;
  if (solved <= 0) { solved = 0; constraint = 'Kuukausitulo ei voi olla negatiivinen'; }
  d.ev.withdrawal = solved;
  return { html: chipWrap(chipRow('Kuukausitulo', d.startWd, solved, '€/kk'), constraint), constraint };
}

// Loppupiste: jäljelle jäävä pääoma — bisektio kuukausituloon taaksepäin
function dragEnd(d, val, noSnap) {
  if (!d.ev) return null;
  const pm = proOf(state);
  if (pm && pm.wd.mode === 'pct') {
    return { html: chipWrap('<div class="dchip-row"><b>%-strategia käytössä</b></div>', null,
      'Säädä prosenttia Nostostrategia-kortista'), constraint: null };
  }
  let solved = solveParam((x) => d.solver.wealthAtWd(x, sim.a1), Math.max(0, val), 0, 1e7, false);
  solved = noSnap ? Math.round(solved) : snapTo(solved, 10);
  let constraint = null;
  if (solved <= 0) { solved = 0; constraint = 'Kuukausitulo ei voi olla negatiivinen'; }
  d.ev.withdrawal = solved;
  return { html: chipWrap(chipRow('Kuukausitulo', d.startWd, solved, '€/kk'), constraint,
    `pääomaa jäljellä ~${fmtCompact(Math.max(0, val))}`), constraint };
}

// Eläkeikäviiva: suora ikäsäätö
function dragRetline(d, age, noSnap) {
  if (!d.ev) return null;
  let a = noSnap ? Math.round(age * 12) / 12 : Math.round(age);
  let constraint = null;
  const lo = state.ageNow + 1;
  if (a < lo) { a = lo; constraint = 'Eläkeikä ei voi olla alle nykyikä + 1 v'; }
  if (a > state.ageEnd) { a = state.ageEnd; constraint = 'Suunnitelma päättyy tähän ikään'; }
  d.ev.age = a;
  return { html: chipWrap(chipRow('Eläkeikä', d.startAge, a, 'v'), constraint), constraint };
}

// Perheen yhteiskäyrä: yhtä suuri lisäys jokaisen aikuisen kuukausisäästöön
function dragFamTotal(d, age, val, noSnap) {
  const s = d.famSolver;
  if (!s) return null;
  const m = s.monthFor(clamp(age, sim.a0 + 1 / 12, sim.a1));
  let dEur = solveParam((x) => s.totalAt(x, m), Math.max(0, val), s.loD, 1e6, true);
  dEur = noSnap ? Math.round(dEur) : snapTo(dEur, 10);
  let constraint = null;
  if (dEur <= s.loD) { dEur = s.loD; constraint = 'Säästö ei voi olla negatiivinen'; }
  else if (dEur >= 1e6) { dEur = 1e6; constraint = 'Yläraja vastassa'; }
  s.apply(dEur);
  d.othersLive = s.liveOthers(dEur); // muiden polut elävät samassa framessa
  return { html: chipWrap(
    chipRow('Perheen säästö', s.m0sum, s.sumWith(dEur), '€/kk'),
    constraint, s.splitNote(dEur)), constraint };
}

// Elämäntapahtuma: vaaka = ikä, pysty = summa (käyrän skaalalla)
function dragEvent(d, age, py, noSnap) {
  const ev = d.ev;
  if (!ev) return null;
  let a = noSnap ? Math.round(age * 12) / 12 : Math.round(age);
  let constraint = null;
  if (a < state.ageNow) { a = state.ageNow; constraint = 'Menneisyyteen ei pääse'; }
  if (a > state.ageEnd) { a = state.ageEnd; constraint = 'Suunnitelma päättyy tähän ikään'; }
  ev.age = a;
  if (ev.sellAge != null && ev.sellAge <= ev.age) ev.sellAge = ev.age + 1;
  let rows = chipRow('Ikä', d.startAge, a, 'v');
  if (ev.amount != null) {
    const dv = invY(py) - invY(d.startPy);
    let amt = d.startAmount + dv;
    amt = clamp(noSnap ? Math.round(amt) : snapTo(amt, 1000), -1e9, 1e9);
    if (ev.financing === 'loan') ev.down = clamp(ev.down || 0, 0, Math.max(0, -amt));
    ev.amount = amt;
    rows = chipRow(escapeHtml(evLabel(ev)) + ' · ikä', d.startAge, a, 'v') + chipRow('Summa', d.startAmount, amt, '€');
  }
  return { html: chipWrap(rows, constraint), constraint };
}

function drawDragUp() {
  document.removeEventListener('pointermove', drawDragMove);
  document.removeEventListener('pointerup', drawDragUp);
  const d = drawState.drag;
  drawState.drag = null;
  dragLight = false;
  if (!d) return;
  if (d.moved) {
    drawMarkTutored(); // ensimmäinen onnistunut veto kuittaa opastuksen
    renderAll(); // täysi laskenta + tallennus + MC-tarkennuspyyntö (debounce)
    updateSelChip();
    announce(dragAnnounce(d));
  } else {
    // Napautus jo valitulla: kaksoisnapautus avaa muokkausdialogin
    const key = d.kind + ':' + d.id;
    const now = Date.now();
    if (now - lastTapT < 400 && lastTapKey === key) drawEnter();
    lastTapT = now; lastTapKey = key;
    updateSelChip();
  }
}

function dragAnnounce(d) {
  const p = sim && sim.successProb != null && !sim.successStale
    ? `, onnistumistodennäköisyys ${Math.round(sim.successProb * 100)} prosenttia` : '';
  if (d.kind === 'famtotal') return `Perheen säästö ${fmtNum(familyOn() ? family.persons.reduce((s, pp, pi) => s + (pi === family.active ? state : pp.data).monthly, 0) : state.monthly)} euroa kuukaudessa${p}`;
  if (d.kind === 'acc') return `Kuukausisäästö ${fmtNum(state.monthly)} euroa kuukaudessa${p}`;
  if (d.kind === 'wd' || d.kind === 'end') return `Kuukausitulo ${fmtNum(d.ev ? d.ev.withdrawal : 0)} euroa kuukaudessa${p}`;
  if (d.kind === 'retline') return `Eläkeikä ${fmtNum(d.ev ? d.ev.age : 0)} vuotta${p}`;
  if (d.ev) return `${evLabel(d.ev)}: ikä ${fmtNum(d.ev.age)} vuotta${d.ev.amount != null ? `, summa ${fmtNum(d.ev.amount)} euroa` : ''}${p}`;
  return 'Muutos tehty' + p;
}

function drawCancelDrag() {
  document.removeEventListener('pointermove', drawDragMove);
  document.removeEventListener('pointerup', drawDragUp);
  const d = drawState.drag;
  drawState.drag = null;
  dragLight = false;
  if (d && d.moved) {
    try { applySaved(JSON.parse(d.cancelSnap)); syncInputs(); } catch (err) {}
    if (d.famSolver) d.famSolver.apply(0); // muiden säästöt takaisin lähtöarvoihin
  }
  renderAll();
  updateSelChip();
  announce('Raahaus peruttu');
}

/* Valinta- ja osumakerrokset — renderChart kutsuu joka framella fs-tilassa */

function drawLayers() {
  const { a0, a1, months } = sim;
  const retA = sim.retireAge;
  const mRet = retA != null ? clamp(Math.round((retA - a0) * 12), 0, months) : months;
  const pt = (i) => `${scaleX(a0 + i / 12).toFixed(1)},${scaleY(sim.exp[i]).toFixed(1)}`;
  const pathOf = (from, to) => {
    let dd = `M ${pt(from)}`;
    for (let i = from + 1; i <= to; i++) dd += ` L ${pt(i)}`;
    return dd;
  };
  const sel = drawState.sel;

  // Valinnan korostus käyrälle
  if (sel && sel.kind === 'acc') el('path', { d: pathOf(0, mRet), class: 'sel-stroke', fill: 'none' }, svg);
  if (sel && sel.kind === 'wd' && mRet < months) el('path', { d: pathOf(mRet, months), class: 'sel-stroke sel-wd', fill: 'none' }, svg);
  if (sel && sel.kind === 'retline' && retA != null) {
    el('line', { x1: scaleX(retA), y1: plot.t, x2: scaleX(retA), y2: plot.t + plot.h, class: 'sel-line' }, svg);
  }
  drawAgeIndicator();

  // Loppupisteen kahva
  const ex = scaleX(a1), ey = scaleY(sim.exp[months]);
  el('circle', { cx: ex, cy: ey, r: sel && sel.kind === 'end' ? 7 : 4.5, class: 'end-handle' + (sel && sel.kind === 'end' ? ' on' : '') }, svg);

  // Hover-esikatselu: kaikki tartuttava syttyy osoittimen alla — yhtenäinen
  // kieli (koko käyrä on tartuntapintaa, ei vain yksi piste; myös viiva)
  const hoverFor = (dd, wd) => el('path', { d: dd, class: 'hover-stroke' + (wd ? ' wd' : ''), fill: 'none' }, svg);
  const hovAcc = hoverFor(pathOf(0, mRet), false);
  const hovWd = retA != null && mRet < months ? hoverFor(pathOf(mRet, months), true) : null;
  const hovRet = retA != null
    ? el('line', { x1: scaleX(retA), y1: plot.t, x2: scaleX(retA), y2: plot.t + plot.h, class: 'hover-line' }, svg)
    : null;

  // Osumakerrokset: näkymätön leveä stroke — prioriteetti maalausjärjestyksellä
  // (alin ensin): segmentit < eläkeikäviiva < tavoitepisteet < tapahtumamerkit.
  // Poikkeama suunnitelman 5.1-järjestykseen (viiva > pisteet): oletuspaikka
  // on eläkeiässä eli viivan päällä — pieni tähtäin voittaa leveän viivan
  // omalla kiekollaan, muuten pistettä ei saisi koskaan kiinni.
  const hit = (dd, kind, id, hoverEl) => {
    const p = el('path', { d: dd, class: 'hit', fill: 'none', stroke: 'transparent', 'stroke-width': 38, 'pointer-events': 'stroke' }, svg);
    p.addEventListener('pointerdown', (e) => drawPointerDown(e, kind, id));
    if (hoverEl) {
      p.addEventListener('pointerenter', () => { if (!drawState.drag) hoverEl.style.opacity = 1; });
      p.addEventListener('pointerleave', () => { hoverEl.style.opacity = 0; });
    }
    return p;
  };
  hit(pathOf(0, mRet), 'acc', null, hovAcc);
  if (retA != null && mRet < months) hit(pathOf(mRet, months), 'wd', null, hovWd);
  // Perheen yhteiskäyrä: veto joustaa molempien säästöjä (perheratkaisija)
  if (familyOn() && famTotalCache) {
    const pf = (i) => `${scaleX(a0 + i / 12).toFixed(1)},${scaleY(famTotalCache[i]).toFixed(1)}`;
    let fd = `M ${pf(0)}`;
    for (let i = 1; i <= months; i++) fd += ` L ${pf(i)}`;
    hit(fd, 'famtotal', null);
  }
  if (retA != null) hit(`M ${scaleX(retA).toFixed(1)} ${plot.t} L ${scaleX(retA).toFixed(1)} ${plot.t + plot.h}`, 'retline', null, hovRet);
  drawGoalMarkers(true); // tavoitepisteet: osuma viivan yläpuolella
  const endHit = el('circle', { cx: ex, cy: ey, r: 20, class: 'hit', fill: 'transparent', 'pointer-events': 'all' }, svg);
  endHit.addEventListener('pointerdown', (e) => drawPointerDown(e, 'end', null));
  const endHandle = svg.querySelector('circle.end-handle');
  if (endHandle) {
    endHit.addEventListener('pointerenter', () => { if (!drawState.drag) endHandle.classList.add('hov'); });
    endHit.addEventListener('pointerleave', () => endHandle.classList.remove('hov'));
  }
}

// Valitun kohteen sijainti aikajanalla: pystykatkoviiva + korostettu ikä
// x-akselilla — elää raahauksen mukana, chippi saa pysyä yläreunassa
function drawAgeIndicator() {
  const s = drawState.sel;
  if (!s || !sim) return;
  let age = null;
  if (s.kind === 'event' || s.kind === 'goal') {
    const ev = state.events.find((x) => x.id === s.id);
    if (ev) age = ev.age;
  } else if (s.kind === 'retline') age = sim.retireAge;
  else if (s.kind === 'end') age = sim.a1;
  if (age == null) return;
  const x = scaleX(clamp(age, sim.a0, sim.a1));
  // eläkeviivalla ja tavoitepisteellä on jo oma viivansa — muille piirretään
  if (s.kind === 'event') el('line', { x1: x, y1: plot.t, x2: x, y2: plot.t + plot.h, class: 'age-line' }, svg);
  const t = el('text', { x, y: plot.t + plot.h + 20, 'text-anchor': 'middle', class: 'age-tick' }, svg);
  t.textContent = Number.isInteger(age) ? age + ' v' : fmtAge(age);
}

/* Näppäinmalli: Tab kiertää, nuolet säätävät, Enter muokkaa, Delete poistaa */

function drawCycleList() {
  const items = [{ kind: 'acc', id: null, age: (sim.a0 + (sim.retireAge != null ? sim.retireAge : sim.a1)) / 2 }];
  for (const ev of state.events) {
    if (ev.type === 'retirement') continue;
    items.push({ kind: ev.type === 'goal' ? 'goal' : 'event', id: ev.id, age: ev.age });
  }
  if (sim.retireAge != null) {
    items.push({ kind: 'retline', id: null, age: sim.retireAge });
    items.push({ kind: 'wd', id: null, age: (sim.retireAge + sim.a1) / 2 });
  }
  items.push({ kind: 'end', id: null, age: sim.a1 });
  if (familyOn() && famTotalCache) {
    items.push({ kind: 'famtotal', id: null, age: sim.a0 + (sim.retireAge != null ? (sim.retireAge - sim.a0) / 3 : 10) });
  }
  return items.sort((a, b) => a.age - b.age);
}

function drawCycle(dir) {
  const list = drawCycleList();
  if (!list.length) return;
  let i = drawState.sel ? list.findIndex((x) => x.kind === drawState.sel.kind && x.id === drawState.sel.id) : -1;
  i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
  drawSelect(list[i].kind, list[i].id);
}

// Nuolisäädön debounce: kevyet framet painallusten aikana, täysi laskenta
// + kuulutus kun sarja päättyy (sama periaate kuin raahauksessa)
function nudgeCommit(text) {
  drawMarkTutored(); // näppäimistösäätökin lasketaan opituksi
  dragLight = true;
  scheduleRender();
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => {
    dragLight = false;
    renderAll();
    updateSelChip();
    const p = sim && sim.successProb != null ? `, onnistumistodennäköisyys ${Math.round(sim.successProb * 100)} prosenttia` : '';
    if (text) announce(text + p);
  }, 350);
}

function drawNudge(axis, dir, big) {
  const s = drawState.sel;
  if (!s) return;
  const mult = big ? 10 : 1; // Shift = 10× askel
  const ev = s.kind === 'event' || s.kind === 'goal' ? state.events.find((x) => x.id === s.id) : retireEv();
  let text = null;
  if (axis === 'x') {
    if (s.kind !== 'event' && s.kind !== 'goal' && s.kind !== 'retline') return;
    if (!ev) return;
    if (s.kind === 'retline' && retGoal(ev) === 'age') ev.goal = 'manual';
    const lo = s.kind === 'event' ? state.ageNow : state.ageNow + 1;
    ev.age = clamp(Math.round(ev.age) + dir * mult, lo, state.ageEnd);
    if (ev.sellAge != null && ev.sellAge <= ev.age) ev.sellAge = ev.age + 1;
    text = `${s.kind === 'retline' ? 'Eläkeikä' : evLabel(ev)} ${Math.round(ev.age)} vuotta`;
  } else if (s.kind === 'acc') {
    state.monthly = clamp(snapTo(state.monthly + dir * 10 * mult, 10), 0, 1e6);
    $('monthly').value = state.monthly;
    text = `Kuukausisäästö ${fmtNum(state.monthly)} euroa kuukaudessa`;
  } else if (s.kind === 'famtotal') {
    // sama askel jokaiselle aikuiselle
    let sum = 0;
    family.persons.forEach((p, pi) => {
      const data = pi === family.active ? state : p.data;
      if (!p.child) data.monthly = clamp(snapTo(data.monthly + dir * 10 * mult, 10), 0, 1e6);
      sum += data.monthly;
    });
    $('monthly').value = state.monthly;
    text = `Perheen säästö ${fmtNum(sum)} euroa kuukaudessa`;
  } else if (s.kind === 'wd' || s.kind === 'end') {
    if (!ev) return;
    const pmN = proOf(state);
    if (pmN && pmN.wd.mode === 'pct') { announce('Prosenttistrategia käytössä — säädä prosenttia Nostostrategia-kortista'); return; }
    if (retGoal(ev) === 'withdrawal') {
      if (sim.solvedWithdrawal != null) ev.withdrawal = sim.solvedWithdrawal;
      ev.goal = 'manual';
    }
    ev.withdrawal = clamp(snapTo(ev.withdrawal + dir * 10 * mult, 10), 0, 1e7);
    text = `Kuukausitulo ${fmtNum(ev.withdrawal)} euroa kuukaudessa`;
  } else if (s.kind === 'goal' && ev) {
    ev.amount = clamp(snapTo(ev.amount + dir * 5000 * mult, 5000), 0, 1e9);
    text = `Tavoite ${fmtNum(ev.amount)} euroa`;
  } else if (s.kind === 'event' && ev && ev.amount != null) {
    ev.amount = clamp(snapTo(ev.amount + dir * 1000 * mult, 1000), -1e9, 1e9);
    if (ev.financing === 'loan') ev.down = clamp(ev.down || 0, 0, Math.max(0, -ev.amount));
    text = `${evLabel(ev)} summa ${fmtNum(ev.amount)} euroa`;
  } else return;
  nudgeCommit(text);
}

function drawEnter() {
  const s = drawState.sel;
  if (!s) return;
  if (s.kind === 'event' || s.kind === 'goal') { openPopover(s.id); return; }
  if (s.kind === 'retline' || s.kind === 'wd' || s.kind === 'end') {
    const ev = retireEv();
    if (ev) openPopover(ev.id);
    return;
  }
  announce(`Kuukausisäästö ${fmtNum(state.monthly)} euroa kuukaudessa — säädä nuolinäppäimillä ylös ja alas`);
}

// Poisto vahvistetaan toisella Delete-painalluksella (3 s ikkuna)
function drawDelete() {
  const s = drawState.sel;
  if (!s || (s.kind !== 'event' && s.kind !== 'goal')) return;
  const ev = state.events.find((x) => x.id === s.id);
  if (!ev) return;
  if (delArm !== s.id) {
    delArm = s.id;
    const info = selInfo();
    if (info) chipShowAt(`<div class="dchip-row"><b>Poistetaanko ${escapeHtml(evLabel(ev))}?</b></div>`
      + '<div class="dchip-note">Paina Delete uudestaan vahvistaaksesi</div>', info.x, info.y, true);
    announce(`Poistetaanko ${evLabel(ev)}? Paina Delete uudestaan vahvistaaksesi.`);
    setTimeout(() => { if (delArm === s.id) { delArm = null; updateSelChip(); } }, 3000);
    return;
  }
  delArm = null;
  state.events = state.events.filter((x) => x.id !== s.id);
  drawState.sel = null;
  chipHide();
  renderAll();
  announce(`${evLabel(ev)} poistettu`);
}

function drawKeydown(e) {
  if (!fsOn) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  // Tab kiertää valittavat ikäjärjestyksessä — samalla focus pysyy piirtopöydällä
  if (e.key === 'Tab') { e.preventDefault(); drawDismissHint(); drawCycle(e.shiftKey ? -1 : 1); return; }
  if (!drawState.sel) return;
  switch (e.key) {
    case 'Enter': e.preventDefault(); drawEnter(); break;
    case 'Delete': case 'Backspace': e.preventDefault(); drawDelete(); break;
    case 'ArrowLeft': e.preventDefault(); drawNudge('x', -1, e.shiftKey); break;
    case 'ArrowRight': e.preventDefault(); drawNudge('x', 1, e.shiftKey); break;
    case 'ArrowUp': e.preventDefault(); drawNudge('y', 1, e.shiftKey); break;
    case 'ArrowDown': e.preventDefault(); drawNudge('y', -1, e.shiftKey); break;
  }
}
document.addEventListener('keydown', drawKeydown);

/* Affordanssi: pelimäinen aloitusruutu — haamunuolet ja opasteet
   tartuntakohdissa ennen ensimmäistäkään klikkausta. Väistyvät heti kun
   käyttäjä tarttuu mihin tahansa, ja lakkaavat näkymästä pysyvästi vasta
   kun ensimmäinen veto on viety maaliin (DRAW_TUTOR_KEY). */

function drawShowHint() {
  let tutored = false;
  try { tutored = localStorage.getItem(DRAW_TUTOR_KEY) === '1'; } catch (e) {}
  if (tutored) return;
  drawGuideOn = true;
  renderChart(true); // haamunuolet näkyviin
}

function drawDismissHint() {
  if (!drawGuideOn) return;
  drawGuideOn = false;
  if (fsOn) renderChart(true);
}

function drawMarkTutored() {
  trackOnce('Veto tehty'); // aito säätöele (raahaus tai näppäimistö), kerran/istunto
  try { localStorage.setItem(DRAW_TUTOR_KEY, '1'); } catch (e) {}
}

// Haamunuolet: tartuntakahva käyrällä ja kaksipäinen nuoli KOHTEEN LÄPI —
// nuoli, kahva ja teksti pysyvät kiinni toisissaan. Ei nappaa osoitinta.
function drawGuides() {
  if (!drawGuideOn || drawState.sel || drawState.drag || !sim) return;
  const { a0, months } = sim;
  const retA = sim.retireAge;
  const mRet = retA != null ? clamp(Math.round((retA - a0) * 12), 0, months) : months;
  // Tartuntakohta 2/3 matkaa eläkeikään: yleensä vapaana oletusmerkeistä
  // ja tarpeeksi korkealla, jotta nuoli ja teksti mahtuvat
  const mG = Math.max(6, Math.round(mRet * 2 / 3));
  const gx = scaleX(a0 + mG / 12);
  const gy = clamp(scaleY(sim.exp[mG]), plot.t + 44, plot.t + plot.h - 36);

  const arrow = (parent, d) => el('path', { d, class: 'guide-arrow-path' }, parent);
  // Kapealla kuvaajalla opasteet voivat osua toistensa päälle — väistetään ylös
  const placedLabels = [];
  const label = (parent, x, y, txt) => {
    const t = el('text', {
      x: clamp(x, plot.l + 100, plot.l + plot.w - 100), y,
      class: 'guide-label', 'text-anchor': 'middle',
    }, parent);
    t.textContent = txt;
    let b = t.getBBox();
    const hits = () => placedLabels.some((p) =>
      b.x < p.x + p.width + 10 && p.x < b.x + b.width + 10 &&
      b.y < p.y + p.height + 6 && p.y < b.y + b.height + 6);
    for (let i = 0; hits() && i < 10 && y - 16 > plot.t + 14; i++) {
      y -= 16;
      t.setAttribute('y', y);
      b = t.getBBox();
    }
    placedLabels.push(b);
  };

  // Kertymäkäyrä: kahvarengas käyräpisteessä + pystynuoli sen läpi
  const g1 = el('g', { class: 'guide' }, svg);
  el('circle', { cx: gx, cy: gy, r: 6, class: 'guide-handle' }, g1);
  const g1a = el('g', { class: 'guide-bob-y' }, g1);
  arrow(g1a, `M ${gx} ${gy - 30} L ${gx} ${gy - 11} M ${gx} ${gy + 11} L ${gx} ${gy + 30}`
    + ` M ${gx - 5} ${gy - 24} L ${gx} ${gy - 31} L ${gx + 5} ${gy - 24}`
    + ` M ${gx - 5} ${gy + 24} L ${gx} ${gy + 31} L ${gx + 5} ${gy + 24}`);
  label(g1, gx, gy - 46 < plot.t + 18 ? gy + 54 : gy - 46, 'Tartu käyrään ja vedä — säästö joustaa');

  // Eläkeikäviiva: vaakanuoli viivan poikki, merkkipinon alapuolella
  if (retA != null) {
    const rx = scaleX(retA);
    const ry = plot.t + Math.min(150, plot.h * 0.3);
    const g2 = el('g', { class: 'guide' }, svg);
    const g2a = el('g', { class: 'guide-bob-x' }, g2);
    arrow(g2a, `M ${rx - 30} ${ry} L ${rx - 8} ${ry} M ${rx + 8} ${ry} L ${rx + 30} ${ry}`
      + ` M ${rx - 24} ${ry - 5} L ${rx - 31} ${ry} L ${rx - 24} ${ry + 5}`
      + ` M ${rx + 24} ${ry - 5} L ${rx + 31} ${ry} L ${rx + 24} ${ry + 5}`);
    label(g2, rx, ry - 18, 'Tartu viivaan ja vedä — eläkeikä siirtyy');
  }

  // Kolmas arketyyppi: napautettavat kohteet. Kaikki valittavat (merkit,
  // tavoitepisteet, loppupiste) välähtävät vuorotellen — "nämä ovat eläviä" —
  // ja ensimmäinen merkki saa tekstiopasteen. Opasteet piirretään markereiden
  // jälkeen, joten kohteiden paikat voi lukea suoraan DOMista.
  const tapTargets = [
    ...svg.querySelectorAll('g.marker circle.bg'),
    ...svg.querySelectorAll('g.goal-marker .goal-ring'),
    ...svg.querySelectorAll('circle.end-handle'),
  ];
  tapTargets.forEach((c, i) => {
    const p = el('circle', {
      cx: c.getAttribute('cx'), cy: c.getAttribute('cy'),
      r: (parseFloat(c.getAttribute('r')) || 8) + 3,
      class: 'tap-pulse',
    }, svg);
    p.style.animationDelay = (i * 0.45) + 's';
  });
  const firstMark = svg.querySelector('g.marker circle.bg');
  if (firstMark) {
    const fx = parseFloat(firstMark.getAttribute('cx'));
    const fy = parseFloat(firstMark.getAttribute('cy'));
    const g3 = el('g', { class: 'guide' }, svg);
    label(g3, fx, fy - 34 > plot.t + 16 ? fy - 34 : fy + 40, 'Napauta ja vedä — tapahtuman ikä ja summa');
  }
}

/* --- Tavoitepisteet: mittari ensin, ratkaisu vasta pyynnöstä --- */

// Tähtäinmerkit pisteen omiin koordinaatteihin (ikä, summa). Valitulle
// pisteelle piirretään vajeviivat: pysty käyrään, vaaka saavutusikään.
function drawGoalMarkers(interactive) {
  const goals = state.events.filter((e) => e.type === 'goal');
  if (!goals.length || !sim) return;
  const { a0, a1, months } = sim;
  for (const ev of goals) {
    const x = scaleX(clamp(ev.age, a0, a1));
    const y = Math.max(plot.t - 2, scaleY(ev.amount));
    const m = clamp(Math.round((ev.age - a0) * 12), 0, months);
    const selG = drawState.sel && drawState.sel.kind === 'goal' && drawState.sel.id === ev.id;
    // Pystykatkoviiva kuten eläkeiässä — piste on virstanpylväs aikajanalla
    el('line', { x1: x, y1: plot.t, x2: x, y2: plot.t + plot.h, class: 'goal-line' + (selG ? ' on' : '') }, svg);
    if (selG) {
      let reach = null;
      for (let i = 0; i <= months; i++) if (sim.exp[i] >= ev.amount) { reach = i; break; }
      if (reach != null) el('line', { x1: x, y1: y, x2: scaleX(a0 + reach / 12), y2: y, class: 'goal-gap' }, svg);
    }
    const g = el('g', { class: 'goal-marker' + (selG ? ' sel' : ''), 'data-id': ev.id }, svg);
    el('circle', { cx: x, cy: y, r: selG ? 11 : 9, class: 'goal-ring' }, g);
    el('circle', { cx: x, cy: y, r: 5.5, class: 'goal-ring2' }, g);
    el('circle', { cx: x, cy: y, r: 2, class: 'goal-dot' }, g);
    const title = el('title', {}, g);
    title.textContent = `${evLabel(ev)} · ${fmtEur(ev.amount)} · ${Math.round(ev.age)} v`;
    if (interactive) {
      const hitC = el('circle', { cx: x, cy: y, r: 19, fill: 'transparent', class: 'hit', 'pointer-events': 'all' }, g);
      hitC.addEventListener('pointerdown', (e) => drawPointerDown(e, 'goal', ev.id));
    } else {
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => openPopover(ev.id));
    }
  }
}

// Pisteen kolme lukemaa + toiminnot: pystyvaje, vaakavaje, MC-ylitysosuus
function goalSelInfo(ev) {
  const { a0, months } = sim;
  const m = clamp(Math.round((ev.age - a0) * 12), 0, months);
  const x = scaleX(clamp(ev.age, a0, sim.a1));
  const y = Math.max(plot.t - 2, scaleY(ev.amount));
  const gap = ev.amount - sim.exp[m];
  let reach = null;
  for (let i = 0; i <= months; i++) if (sim.exp[i] >= ev.amount) { reach = a0 + i / 12; break; }
  const gs = state.events.filter((e) => e.type === 'goal');
  const share = sim.goalShares ? sim.goalShares[gs.findIndex((g) => g.id === ev.id)] : null;
  const html =
    `<div class="dchip-row"><b>${escapeHtml(evLabel(ev))}</b> ${fmtCompact(ev.amount)} · ${Math.round(ev.age)} v</div>` +
    `<div class="dchip-row">${gap > 500
      ? `iässä ${Math.round(ev.age)} puuttuu <b>${fmtCompact(gap)}</b>`
      : `tavoite ylittyy <b>${fmtCompact(Math.max(0, -gap))}</b>:lla`}</div>` +
    `<div class="dchip-row">${reach != null
      ? `saavutat summan iässä <b>${fmtAge(reach)}</b>`
      : 'odotuspolku ei saavuta summaa suunnitelmassa'}</div>` +
    (share != null ? `<div class="dchip-row"><b>${Math.round(share * 100)} %</b> poluista ylittää tämän${sim.successStale ? ' (päivittyy…)' : ''}</div>` : '') +
    '<div class="dchip-actions"><button data-act="solve">Ratkaise</button>' +
    '<button data-act="edit">Muokkaa</button><button data-act="del" class="danger">Poista</button></div>';
  return { x, y,
    aria: `${evLabel(ev)}: tavoite ${fmtNum(ev.amount)} euroa iässä ${Math.round(ev.age)}` +
      (share != null ? `, ${Math.round(share * 100)} prosenttia poluista ylittää` : ''),
    html };
}

// Raahaus: vaaka = tavoiteikä (vuosisnap, ei menneisyyteen), pysty = summa (5 000 €)
function dragGoal(d, age, val, noSnap) {
  const ev = d.ev;
  if (!ev) return null;
  let a = noSnap ? Math.round(age * 12) / 12 : Math.round(age);
  let constraint = null;
  if (a < state.ageNow + 1) { a = state.ageNow + 1; constraint = 'Tavoite ei voi olla menneisyydessä'; }
  if (a > state.ageEnd) { a = state.ageEnd; constraint = 'Suunnitelma päättyy tähän ikään'; }
  ev.age = a;
  ev.amount = clamp(Math.max(0, noSnap ? Math.round(val) : snapTo(val, 5000)), 0, 1e9);
  return { html: chipWrap(
    chipRow('Tavoiteikä', d.startAge, a, 'v') + chipRow('Tavoitesumma', d.startAmount, ev.amount, '€'),
    constraint), constraint };
}

function wireChipActions() {
  const c = $('dchip');
  const act = (name, fn) => {
    const b = c.querySelector(`[data-act="${name}"]`);
    if (b) b.addEventListener('click', fn);
  };
  act('solve', goalSolve);
  act('edit', () => { if (drawState.sel) openPopover(drawState.sel.id); });
  act('del', () => {
    const s = drawState.sel;
    if (!s) return;
    const ev = state.events.find((x) => x.id === s.id);
    state.events = state.events.filter((x) => x.id !== s.id);
    drawState.sel = null;
    chipHide();
    renderAll();
    if (ev) { toast(`${evLabel(ev)} poistettu — Ctrl+Z palauttaa`); announce(`${evLabel(ev)} poistettu`); }
  });
}

/* Ratkaise: säätää VAIN kuukausisäästöä (ei koskaan tuottoa). Useammasta
   pisteestä tiukin sitoo — suurin vaadittu säästö; muut jäävät mittareiksi. */

let goalSolvePendingConf = null;

function goalSolve() {
  const goals = state.events.filter((e) => e.type === 'goal');
  if (!goals.length) return;
  const points = goals.map((g) => ({ age: g.age, value: g.amount }));
  const retire = retireEv();
  const conf = retire && retire.conf >= 0.5 && retire.conf < 1 ? retire.conf : null;
  if (conf && mcWorker) {
    // Varmuustasomoodi: MC per bisektioiteraatio — workerissa, progress näkyviin
    goalSolvePendingConf = conf;
    const info = selInfo();
    if (info) chipShowAt(`<div class="dchip-row"><b>Ratkaistaan…</b> ${Math.round(conf * 100)} % varmuudella</div>`
      + '<div class="dchip-note">0 %</div>', info.x, info.y, false);
    announce('Ratkaistaan varmuustasolla — tämä kestää hetken');
    mcWorker.postMessage({ task: 'solveGoals', seq: ++mcSeq, st: serialize(), points, conf, paths: MC_FULL });
    return;
  }
  // Oletusmoodi: bisektio niin, että odotuspolku kulkee pisteen kautta
  applyGoalSolution(solveGoalsMonthly(state, points, lastFullSim || sim), null, goals);
}

function applyGoalSolution(r, conf, goals) {
  if (!r) {
    toast('Tavoite ei ratkea kuukausisäästöllä — nostovaiheen piste voi olla liian korkealla.');
    updateSelChip();
    return;
  }
  pushUndoNow();
  // Pyöristys ylöspäin snap-askeleeseen — tavoite pysyy täytettynä
  state.monthly = clamp(Math.ceil(r.monthly / 10) * 10, 0, 1e6);
  $('monthly').value = state.monthly;
  renderAll();
  updateSelChip();
  const binding = goals && r.bindingIndex >= 0 ? goals[r.bindingIndex] : null;
  const msg = `Kuukausisäästö ${fmtNum(state.monthly)} €/kk` +
    (conf ? ` (${Math.round(conf * 100)} % varmuus)` : '') +
    (binding && goals.length > 1 ? ` — tiukin: ${evLabel(binding)} ${fmtCompact(binding.amount)} · ${Math.round(binding.age)} v` : '');
  toast(msg);
  announce(msg);
}

onSolveGoalsMsg = function (d) {
  if (d.progress != null) {
    const note = $('dchip').querySelector('.dchip-note');
    if (note && !$('dchip').hidden) note.textContent = Math.round(d.progress * 100) + ' %';
    return;
  }
  const conf = goalSolvePendingConf;
  goalSolvePendingConf = null;
  if (!d.ok) { toast('Ratkaisu epäonnistui — yritä uudelleen.'); updateSelChip(); return; }
  applyGoalSolution(d.result, conf, state.events.filter((e) => e.type === 'goal'));
};

/* ＋ Lisää -valikko: paletti on piilossa fs-tilassa — valikosta lisätään
   tavoitepiste tai mikä tahansa elämäntapahtuma poistumatta piirtopöydältä.
   Lisätty kohde valitaan heti, jotta sen voi raahata suoraan paikoilleen. */

let fsAddMenuEl = null;

function closeFsAddMenu() {
  if (fsAddMenuEl) { fsAddMenuEl.remove(); fsAddMenuEl = null; }
}

function addFromFs(type) {
  closeFsAddMenu();
  const defAge = type === 'retirement' ? 65
    : type === 'goal' && sim && sim.retireAge != null ? Math.round(sim.retireAge)
    : state.ageNow + 5;
  const ev = addEvent(type, clamp(defAge, type === 'goal' ? state.ageNow + 1 : state.ageNow, state.ageEnd));
  if (fsOn && ev) {
    closePopover();
    drawSelect(ev.type === 'retirement' ? 'retline' : ev.type === 'goal' ? 'goal' : 'event',
      ev.type === 'retirement' ? null : ev.id);
    announce(`${evLabel(ev)} lisätty — raahaa paikoilleen`);
  }
}

function openFsAddMenu(anchor) {
  if (fsAddMenuEl) { closeFsAddMenu(); return; }
  const menu = document.createElement('div');
  menu.className = 'menu fs-add-menu';
  const add = (icon, name, fn) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="ic" aria-hidden="true">${icon}</span>${name}`;
    b.addEventListener('click', fn);
    menu.appendChild(b);
    return b;
  };
  add('🎯', 'Varallisuustavoite', () => addFromFs('goal')).classList.add('wide');
  for (const [type, def] of Object.entries(EVENT_TYPES)) {
    if (type === 'goal') continue;
    if (def.familyOnly && !familyOn()) continue; // siirrot vain perhetilassa
    if (def.unique && state.events.some((e) => e.type === type)) continue; // esim. eläke jo graafilla
    add(def.icon, def.label, () => addFromFs(type));
  }
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = r.bottom + 8 + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 10)) + 'px';
  fsAddMenuEl = menu;
}

function bindDraw() {
  $('fsOpen').addEventListener('click', enterFs);
  $('fsClose').addEventListener('click', () => exitFs());
  $('fsAddBtn').addEventListener('click', () => openFsAddMenu($('fsAddBtn')));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (tourStep >= 0) return; // kierroksen aikana kerros pysyy paikallaan
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    if (fsOn) exitFs(); else enterFs();
  });
}

/* ===================== Tunnusluvut ===================== */

function renderStats() {
  const s = sim || simulate(state);
  const cards = [];

  // Vertailu päällä: kortit näyttävät eron haamuun. Onnistumis-%:n delta
  // lasketaan samalla polkumäärällä molemmin puolin (muuten vertailu on vino).
  const g = baseline ? ghostSim : null;
  const ghostP = g ? (ghostMc && s.mcPaths === ghostMc.paths ? ghostMc.successProb : g.successProb) : null;
  const dRow = (cur, base, fmt, eps, goodUp = true) => {
    if (!g || cur == null || base == null) return '';
    const d = cur - base;
    if (Math.abs(d) < eps) return ''; // sama arvo = ei kohinaa (fs asettaa haamun aina)
    const up = d > 0;
    return `<div class="d ${up === goodUp ? 'up' : 'down'}">${up ? '▲ +' : '▼ −'}${fmt(Math.abs(d))} vertailuun</div>`;
  };

  cards.push({
    k: 'Varallisuus eläkkeellä',
    v: s.wAtRet != null ? fmtEur(s.wAtRet) : '–',
    va: s.wAtRet != null ? fmtCompact(s.wAtRet) : null, // tiivis arvo kapeaan telakkanäkymään
    cls: 'accent',
    s: s.retireAge != null ? `${Math.round(s.retireAge)} v iässä` : 'ei eläketapahtumaa',
    d: dRow(s.wAtRet, g && g.wAtRet, fmtCompact, 500),
  });
  // Perheen yhteinen onnistuminen: sama markkinahistoria molemmille,
  // molempien varojen on riitettävä
  if (familyOn()) {
    cards.push({
      k: 'Perheen onnistumis-%',
      v: jointMc ? Math.round(jointMc.successProb * 100) + ' %' : '…',
      cls: 'accent',
      s: 'sama markkinamyrsky molemmille · molempien varat riittävät',
    });
  }
  // Loppuvarallisuus yhtenä korttina: netto kun taseessa on omaisuutta tai
  // velkaa (sijoitukset alarivillä), muuten pelkät sijoitukset
  if (s.hasNet) {
    cards.push({
      k: `Netto ${Math.round(s.a1)} v iässä`,
      v: fmtEur(s.net[s.months]),
      va: fmtCompact(s.net[s.months]),
      cls: 'net',
      s: `sis. sijoitukset ${fmtCompact(s.wEnd)} · ${state.real ? 'nykyrahassa' : 'nimellisarvoin'}`,
      d: dRow(s.net[s.months], g && (g.net ? g.net[g.months] : g.wEnd), fmtCompact, 500),
    });
  } else {
    cards.push({
      k: `Sijoitukset ${Math.round(s.a1)} v iässä`,
      v: fmtEur(s.wEnd),
      va: fmtCompact(s.wEnd),
      cls: '',
      s: state.real ? 'nykyrahassa' : 'nimellisarvoin',
      d: dRow(s.wEnd, g && g.wEnd, fmtCompact, 500),
    });
  }
  cards.push({
    k: 'Sijoitettu yhteensä',
    v: fmtEur(s.deposits),
    va: fmtCompact(s.deposits),
    cls: '',
    s: `${fmtEur(state.monthly)}/kk${state.savingsGrowth > 0 ? ` (+${state.savingsGrowth.toLocaleString('fi-FI')} %/v)` : ''} + alkupääoma`,
  });
  const confTxt = s.conf ? `${Math.round(s.conf * 100)} % varmuudella` : null;
  const p = s.successProb != null ? Math.round(s.successProb * 100) : null;
  const pTxt = p != null ? `onnistumis-% ${p}` : null;
  if (s.goal === 'age') {
    cards.push(s.solvedRetireAge != null
      ? { k: 'Aikaisin eläkeikä', v: fmtAge(s.solvedRetireAge), cls: 'accent', s: `kuukausitulolla ${fmtEur(s.withdrawal)}/kk` + (confTxt ? ` · ${confTxt}` : '') }
      : { k: 'Aikaisin eläkeikä', v: 'Ei toteudu', cls: 'bad', s: confTxt ? `tulotarve ei onnistu ${confTxt}` : 'tulotarve ei onnistu edes suunnitelman lopussa' });
  }
  if (s.goal === 'saving') {
    cards.push(s.requiredMonthly != null
      ? { k: 'Tarvittava säästö', v: `${fmtEur(s.requiredMonthly)}/kk`, cls: s.requiredMonthly > state.monthly ? 'accent' : 'ok', s: `nyt ${fmtEur(state.monthly)}/kk` + (confTxt ? ` · ${confTxt}` : '') }
      : { k: 'Tarvittava säästö', v: 'Ei toteudu', cls: 'bad', s: 'tulotavoite on liian suuri tälle eläkeiälle' });
  }
  // Riittävyys ja onnistumis-% samassa kortissa — kertovat samaa asiaa
  const pDelta = p != null && ghostP != null ? dRow(p, Math.round(ghostP * 100), (x) => `${x} %-yks`, 1) : '';
  if (s.goal === 'withdrawal' && s.goalUnreachable) {
    cards.push({ k: 'Kestävä kuukausitulo', v: 'Ei toteudu', cls: 'bad', s: `edes 0 €/kk ei riitä ${confTxt || ''}`.trim() });
  } else if (s.solvedWithdrawal != null && (s.depletionAge == null || s.depletionAge >= s.a1 - 1)) {
    cards.push({ k: 'Kestävä kuukausitulo', v: `${fmtEur(s.solvedWithdrawal)}/kk`, cls: 'accent',
      s: [s.pension > 0 ? `sis. työeläke ${fmtEur(s.pension)}/kk` : null, confTxt || pTxt].filter(Boolean).join(' · ') || `varat loppuun ${Math.round(s.a1)} v mennessä`,
      d: dRow(s.solvedWithdrawal, g && (g.solvedWithdrawal != null ? g.solvedWithdrawal : g.sustainableWd), (x) => `${Math.round(x).toLocaleString('fi-FI')} €/kk`, 20) });
  } else if (s.depletionAge != null) {
    // %-nostossa "ehtyminen" tarkoittaa tulotarpeen alittumista (salkku ei ehdy)
    const pmWd = proOf(state);
    const pctMode = pmWd && pmWd.wd.mode === 'pct';
    cards.push({
      k: 'Riittävyys',
      v: pctMode ? `Tulo alittaa tarpeen ~${Math.round(s.depletionAge)} v` : `Ehtyy ~${Math.round(s.depletionAge)} v`,
      cls: 'bad',
      s: pctMode
        ? [pTxt, 'nosto + työeläke ei kata kuukausitulon tarvetta'].filter(Boolean).join(' · ')
        : [pTxt, 'kokeile lisätä säästöä'].filter(Boolean).join(' · '),
      d: pDelta,
    });
  } else {
    cards.push({ k: 'Riittävyys', v: 'Varat riittävät ✓', cls: 'ok',
      s: [`${Math.round(s.a1)} v ikään asti`, pTxt].filter(Boolean).join(' · '), d: pDelta });
  }

  if (s.taxPaid > 0.5) {
    // sama nimi kuin Tulkin vertailurivillä; lyhyet sanat rivittyvät siististi
    cards.push({ k: 'Verot yhteensä', v: fmtEur(s.taxPaid), va: fmtCompact(s.taxPaid), cls: '', s: 'arvio nostoista ja myynneistä',
      d: dRow(s.taxPaid, g && g.taxPaid, fmtCompact, 500, false) });
  }

  // va = tiivis rinnakkaisarvo (esim. 7,1 M€): CSS näyttää sen täyden sijaan
  // vain kapeassa telakkanäkymässä, jotta viisi korttia mahtuu yhdelle riville
  $('stats').innerHTML = cards.map((c) =>
    `<div class="stat"><div class="k">${c.k}</div><div class="v ${c.cls}">${c.va ? `<span class="v-full">${c.v}</span><span class="v-alt">${c.va}</span>` : c.v}</div><div class="s">${c.s}</div>${c.d || ''}</div>`
  ).join('');
  updateCmpPill();
}

/* --- Vertailupilleri: nimetty vertailukohta ja tärkein euroero graafilla --- */

function updateCmpPill() {
  const pill = $('cmpPill');
  if (!pill) return;
  const g = baseline ? ghostSim : null;
  if (!g || !sim || fsOn) { pill.hidden = true; return; }
  const both = sim.wAtRet != null && g.wAtRet != null;
  const d = both ? sim.wAtRet - g.wAtRet : sim.wEnd - g.wEnd;
  // Identtinen suunnitelma (esim. piirtopöydän automaattihaamu ilman
  // muutoksia) ei tarvitse pilleriä — se ilmestyy kun eroa syntyy
  if (Math.abs(d) < 500) { pill.hidden = true; return; }
  const dTxt = `${both ? 'eläkeiässä' : 'lopussa'} <b class="${d > 0 ? 'pos' : 'neg'}">${d > 0 ? '+' : '−'}${fmtCompact(Math.abs(d))}</b>`;
  $('cmpPillTxt').innerHTML = `Vertailussa: <b>${escapeHtml(baseline.cmpName || 'oma vertailukohta')}</b> · ${dTxt}`;
  pill.hidden = false;
}

function bindCmpPill() {
  $('cmpPillU').addEventListener('click', () => {
    setBaseline(baseline && baseline.cmpName); // nimi säilyy päivityksessä
    renderStats();
    toast('Vertailukohta päivitetty nykyiseen suunnitelmaan');
    announce('Vertailukohta päivitetty');
  });
  $('cmpPillX').addEventListener('click', () => {
    clearBaseline();
    updateCompareBtn();
    renderStats();
    toast('Vertailu lopetettu');
    announce('Vertailu lopetettu');
  });
}

/* ===================== Skenaariovertailu ===================== */
// Tallennettu suunnitelma piirtyy haamukäyräksi ja tunnusluvut näyttävät eron
// nykyiseen. Vertailukohta on paikallinen — sitä ei jaeta jakolinkissä.

const BASELINE_KEY = 'vp-baseline-v1';

function computeGhost() {
  if (!baseline || !Array.isArray(baseline.events)) return null;
  try {
    return simulate(JSON.parse(JSON.stringify(baseline)), { sustainable: true });
  } catch (e) {
    baseline = null;
    try { localStorage.removeItem(BASELINE_KEY); } catch (_) {}
    return null;
  }
}

function setBaseline(name) {
  baseline = JSON.parse(JSON.stringify(serialize()));
  if (name) baseline.cmpName = name;
  ghostDirty = true;
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline)); } catch (e) {}
  renderChart();
}

function clearBaseline() {
  baseline = null;
  ghostSim = null;
  ghostDirty = true;
  try { localStorage.removeItem(BASELINE_KEY); } catch (e) {}
  renderChart();
}

function loadBaseline() {
  try {
    const raw = localStorage.getItem(BASELINE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (o && typeof o === 'object' && Array.isArray(o.events)) { baseline = o; ghostDirty = true; }
  } catch (e) { /* viallinen vertailukohta — ohitetaan */ }
}

function updateCompareBtn() {
  // Vertailun tila näkyy ⋯-valikon kohdassa, jos valikko on auki
  const mi = $('mi-compare');
  if (!mi) return;
  mi.querySelector('div').textContent = baseline ? 'Vertailu päällä ✓' : 'Vertaile';
  const d = mi.querySelector('.mdesc');
  if (d) d.textContent = baseline ? 'Poista vertailukohta' : 'Tallenna nykyinen suunnitelma haamukäyräksi';
}

// Erillinen vertailupalkki poistettu: erot asuvat tunnuslukukorttien
// delta-riveillä ja graafin vertailupillerissä. Tässä vain legenda.
function renderCompare() {
  updateCompareBtn();
  const legend = $('legendCompare');
  if (!legend) return;
  const active = !!(baseline && ghostSim && sim);
  const diff = active && (
    Math.abs((sim.wAtRet || 0) - (ghostSim.wAtRet || 0)) >= 500
    || Math.abs(sim.wEnd - ghostSim.wEnd) >= 500
    || (sim.successProb != null && ghostSim.successProb != null
      && Math.abs(sim.successProb - ghostSim.successProb) >= 0.005));
  legend.hidden = !diff;
}

/* ===================== Vuositaulukko ja CSV ===================== */
// Vuosikohtaiset luvut odotetulla polulla: rahavirrat vuosisummina,
// varallisuustilanne ikävuoden alussa. Sama data CSV:nä taulukkolaskentaan.

function yearRows(s) {
  const yearNow = new Date().getFullYear();
  const fl = s.flows || {};
  const sum12 = (arr, mEnd) => {
    if (!arr) return 0;
    let t = 0;
    for (let k = Math.max(1, mEnd - 11); k <= mEnd; k++) t += arr[k];
    return t;
  };
  const rows = [];
  for (let A = Math.ceil(s.a0); A <= Math.floor(s.a1); A++) {
    const m = clamp(Math.round((A - s.a0) * 12), 0, s.months);
    let saleTax = 0;
    for (const si of s.saleInfos || []) if (Math.ceil(si.age) === A) saleTax += si.tax;
    rows.push({
      age: A,
      year: yearNow + Math.round(A - s.a0),
      inv: s.exp[m],
      contrib: sum12(fl.contrib, m),
      gross: sum12(fl.gross, m),
      tax: sum12(fl.tax, m) + saleTax,
      pen: sum12(fl.pen, m),
      assets: s.assets[m],
      debt: s.debt[m],
      net: s.net[m],
    });
  }
  return rows;
}

function buildCsv() {
  const s = sim || simulate(state);
  const hasNet = s.hasNet;
  const head = ['Ikä', 'Vuosi', 'Sijoitukset €', 'Säästöt €/v', 'Nostot (brutto) €/v', 'Vero €/v', 'Työeläke €/v']
    .concat(hasNet ? ['Omaisuus €', 'Velka €', 'Netto €'] : []);
  const lines = [head.join(';')];
  for (const r of yearRows(s)) {
    const row = [r.age, r.year, Math.round(r.inv), Math.round(r.contrib), Math.round(r.gross), Math.round(r.tax), Math.round(r.pen)]
      .concat(hasNet ? [Math.round(r.assets), Math.round(r.debt), Math.round(r.net)] : []);
    lines.push(row.join(';'));
  }
  return '﻿' + lines.join('\r\n'); // BOM: Excel tunnistaa UTF-8:n
}

function renderYearTable() {
  const s = sim || simulate(state);
  const hasNet = s.hasNet;
  $('tableSub').textContent = `${state.real ? 'Nykyrahassa (inflaatiokorjattu)' : 'Nimellisarvoin'} · odotettu kehityspolku`;
  const th = ['Ikä', 'Vuosi', 'Sijoitukset', 'Säästöt/v', 'Nostot/v', 'Vero/v', 'Työeläke/v']
    .concat(hasNet ? ['Omaisuus', 'Velka', 'Netto'] : []);
  const num = (v, cls) => `<td class="num${cls ? ' ' + cls : ''}">${Math.abs(v) < 0.5 ? '–' : fmtCompact(v)}</td>`;
  let html = `<thead><tr>${th.map((h) => `<th${h === 'Ikä' || h === 'Vuosi' ? '' : ' class="num"'}>${h}</th>`).join('')}</tr></thead><tbody>`;
  for (const r of yearRows(s)) {
    html += `<tr><td>${r.age} v</td><td>${r.year}</td>` +
      num(r.inv) + num(r.contrib) + num(r.gross) + num(r.tax, r.tax > 0.5 ? 'dbt' : '') + num(r.pen) +
      (hasNet ? num(r.assets) + num(-r.debt, r.debt > 0.5 ? 'dbt' : '') + num(r.net, 'net') : '') +
      '</tr>';
  }
  $('yearTable').innerHTML = html + '</tbody>';
}

function downloadCsv() {
  const blob = new Blob([buildCsv()], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'varallisuuspolku-vuositaulukko.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ===================== Anonyymi datalahjoitus: UI ===================== */
// Vapaaehtoinen, tapauskohtainen lupa: mitään ei lähetetä ilman että käyttäjä
// näkee paketin sisällön ja painaa Lähetä. Vastineeksi aukeaa vertailunäkymä.

const DONATE_KEY = 'vp-donate-v1';

function donateState() {
  try { return JSON.parse(localStorage.getItem(DONATE_KEY)) || {}; } catch (e) { return {}; }
}
function setDonateState(patch) {
  const cur = donateState();
  try { localStorage.setItem(DONATE_KEY, JSON.stringify(Object.assign(cur, patch))); } catch (e) {}
}

const AGE_GROUPS_UI = [
  ['18-24', 18, 24], ['25-29', 25, 29], ['30-34', 30, 34], ['35-39', 35, 39],
  ['40-44', 40, 44], ['45-49', 45, 49], ['50-54', 50, 54], ['55-59', 55, 59],
  ['60-64', 60, 64], ['65+', 65, 120],
];
const ageGroupOf = (age) => (AGE_GROUPS_UI.find(([, lo, hi]) => age >= lo && age <= hi) || [null])[0];

function renderDonateSlot() {
  const slot = $('donateSlot');
  const ds = donateState();
  if (ds.declined) { slot.innerHTML = ''; return; }
  const payload = buildDonationPayload(state, sim || simulate(state));
  const h = hashStr(JSON.stringify(payload));
  if (ds.donatedHash === h) {
    slot.innerHTML =
      `<div class="donate-card slim"><span>📊 Suunnitelmasi on mukana anonyymissä vertailudatassa.</span>` +
      `<button class="btn" id="donateCompareBtn">Katso vertailu ikäryhmääsi</button></div>`;
  } else if (ds.donatedHash) {
    slot.innerHTML =
      `<div class="donate-card slim"><span>📊 Suunnitelmasi on muuttunut — vertailutiedot voi halutessa päivittää.</span>` +
      `<button class="btn ghost" id="donateOpenBtn">Päivitä</button>` +
      `<button class="btn" id="donateCompareBtn">Katso vertailu</button></div>`;
  } else {
    slot.innerHTML =
      `<div class="donate-card"><div class="dc-text"><b>📊 Haluatko nähdä, miten eri ikäiset suunnittelevat talouttaan ja etenevät vaurastumisen matkalla?</b>` +
      `<span>Vertailu perustuu käyttäjien anonyymeihin suunnitelmiin. Näet ensin täsmälleen, mitä suunnitelmastasi jaetaan — data on anonyymiä eikä velvoita mihinkään.</span>` +
      `<span class="dc-progress" id="dcProgress"></span></div>` +
      `<div class="dc-actions"><button class="btn" id="donateOpenBtn">Kyllä, näytä</button>` +
      `<button class="btn ghost" id="donateNeverBtn">Ei kiitos</button></div></div>`;
    fillDonateProgress();
  }
  const open = $('donateOpenBtn');
  if (open) open.addEventListener('click', openDonateModal);
  const never = $('donateNeverBtn');
  if (never) never.addEventListener('click', () => { setDonateState({ declined: true }); renderDonateSlot(); toast('Selvä — ei kysytä uudestaan. Valinnan voi muuttaa Tietoa-sivulta.'); });
  const cmp = $('donateCompareBtn');
  if (cmp) cmp.addEventListener('click', openCompareModal);
}

// Kutsukortin edistymisrivi: yhteinen tavoite tekee jakamisesta osallistumista.
// Tilasto haetaan kerran istunnossa; virhe jättää rivin hiljaa pois.
let donateStatsCache = null;
async function fillDonateProgress() {
  const el2 = $('dcProgress');
  if (!el2) return;
  try {
    if (!donateStatsCache) donateStatsCache = await (await fetch(DATA_API + '/stats.json')).json();
    const s = donateStatsCache;
    const target = $('dcProgress'); // slotin sisältö on voitu piirtää uusiksi odotuksen aikana
    if (!target || !s || !s.kAnon) return;
    const bestN = Math.max(0, ...Object.entries(s.groups || {})
      .filter(([g]) => g !== 'all').map(([, v]) => v.n || 0));
    if (bestN >= s.kAnon) return; // kartta jo auki — kutsu riittää ilman mittaria
    target.textContent = `Kartta aukeaa yhdessä: suurimmassa ikäryhmässä ${bestN}/${s.kAnon} suunnitelmaa — ole yksi avaajista.`;
  } catch (e) { /* datapalvelin ei tavoitettavissa — ei riviä */ }
}

let pendingPayload = null;

function openDonateModal() {
  pendingPayload = buildDonationPayload(state, sim || simulate(state));
  const p = pendingPayload;
  const row = (k, v) => `<div class="dp-row"><span>${k}</span><b>${v}</b></div>`;
  let html = `<h2>Perustiedot</h2>` +
    row('Ikä nyt / suunnitelman loppu', `${p.ageNow} v / ${p.ageEnd} v`) +
    row('Varallisuus nyt', fmtEur(p.startCapital)) +
    row('Kuukausisäästö', `${fmtEur(p.monthly)}/kk` + (p.savingsGrowth ? ` (+${p.savingsGrowth.toLocaleString('fi-FI')} %/v)` : '')) +
    row('Allokaatio', `${p.alloc.stocks} % osakkeet · ${p.alloc.bonds} % korot`) +
    row('Kytkimet', [p.glide && 'ikäsidonnainen', p.real && 'inflaatiokorjattu', p.tax && 'myyntivoittovero'].filter(Boolean).join(' · ') || '—');
  html += `<h2>Tapahtumat (vain tyyppi, ikä ja summat — ei nimiä)</h2>`;
  for (const e of p.events) {
    const def = EVENT_TYPES[e.type];
    let desc;
    if (e.type === 'retirement') {
      desc = `tulotarve ${fmtEur(e.withdrawal)}/kk · työeläke ${fmtEur(e.pension)}/kk` +
        (e.goal && e.goal !== 'manual' ? ` · tavoite: ${{ withdrawal: 'kestävä tulo', age: 'eläkeikä', saving: 'säästö' }[e.goal]}` : '') +
        (e.conf ? ` · ${Math.round(e.conf * 100)} %` : '');
    } else {
      desc = [
        e.amount ? fmtEur(e.amount) : null,
        e.financing === 'loan' ? 'lainalla' : null,
        e.recMonthly ? `${e.recMonthly > 0 ? '+' : ''}${fmtEur(e.recMonthly)}/kk ${e.recYears} v` : null,
        e.sellAge != null ? `myynti ${e.sellAge} v` : null,
      ].filter(Boolean).join(' · ') || '—';
    }
    html += row(`${def.icon} ${def.label} · ${e.age} v`, desc);
  }
  if (p.derived) {
    html += `<h2>Laskennan tulokset</h2>` +
      (p.derived.wAtRet != null ? row('Varallisuus eläkkeellä', fmtEur(p.derived.wAtRet)) : '') +
      row('Sijoitukset lopussa', fmtEur(p.derived.wEnd)) +
      (p.derived.successProb != null ? row('Onnistumistodennäköisyys', Math.round(p.derived.successProb * 100) + ' %') : '');
  }
  $('donatePreview').innerHTML = html;
  $('donateJson').textContent = JSON.stringify(pendingPayload, null, 2);
  $('donateModal').hidden = false;
}

async function sendDonation() {
  if (!pendingPayload) return;
  const btn = $('donateSend');
  btn.disabled = true;
  btn.textContent = 'Lähetetään…';
  try {
    // Päivitys korvaa saman selaimen aiemman rivin tilastoissa (rid-ketjutus) —
    // yksi selain = enintään yksi voimassa oleva rivi vertailudatassa
    const prevRid = donateState().donatedRid;
    const body = prevRid ? Object.assign({}, pendingPayload, { replaces: prevRid }) : pendingPayload;
    const res = await fetch(DATA_API + '/donate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('http ' + res.status);
    track('Vertailujako');
    let rid = null;
    try { rid = (await res.json()).rid || null; } catch (e) { /* vanha palvelin */ }
    setDonateState({ donatedHash: hashStr(JSON.stringify(pendingPayload)), donatedRid: rid, declined: false });
    $('donateModal').hidden = true;
    renderDonateSlot();
    toast('Kiitos! Suunnitelmasi on nyt anonyymisti mukana vertailudatassa.');
    openCompareModal();
  } catch (e) {
    toast('Jakaminen ei onnistunut — palvelin ei ehkä ole tavoitettavissa. Yritä myöhemmin.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Jaa anonyymisti ja avaa vertailu';
  }
}

/* --- Vertailunäkymä --- */

// Jakaumapalkki: [P25..P75]-laatikko, P50-viiva ja ▲ = sinä
function distBarSVG(q, user) {
  const lo = Math.min(q.p25, user) * 0.92 - 1;
  const hi = Math.max(q.p75, user) * 1.08 + 1;
  const W = 190, H = 30, pad = 6;
  const x = (v) => pad + ((v - lo) / (hi - lo)) * (W - 2 * pad);
  return `<svg viewBox="0 0 ${W} ${H}" class="dist-bar">` +
    `<line x1="${pad}" y1="19" x2="${W - pad}" y2="19" stroke="rgba(148,168,220,0.25)" stroke-width="1.5"/>` +
    `<rect x="${x(q.p25).toFixed(1)}" y="13" width="${Math.max(2, x(q.p75) - x(q.p25)).toFixed(1)}" height="12" rx="3" fill="rgba(45,212,191,0.25)"/>` +
    `<line x1="${x(q.p50).toFixed(1)}" y1="11" x2="${x(q.p50).toFixed(1)}" y2="27" stroke="#2dd4bf" stroke-width="2"/>` +
    `<path d="M ${x(user).toFixed(1)} 10 l 5 -8 l -10 0 Z" fill="#fbbf24"/>` +
    `</svg>`;
}

function positionTxt(q, user) {
  if (user < q.p25) return 'alin neljännes';
  if (user < q.p50) return 'alle mediaanin';
  if (user <= q.p75) return 'yli mediaanin';
  return 'ylin neljännes';
}

async function openCompareModal() {
  const body = $('compareBody');
  const sub = $('compareSub');
  $('openDataLink').href = DATA_API + '/stats.json';
  $('compareModal').hidden = false;
  sub.textContent = '';
  body.innerHTML = '<p class="donate-note">Haetaan avointa dataa…</p>';
  let stats;
  try {
    stats = await (await fetch(DATA_API + '/stats.json')).json();
  } catch (e) {
    body.innerHTML = '<p class="donate-note">Avoimen datan palvelin ei ole juuri nyt tavoitettavissa. Yritä myöhemmin.</p>';
    return;
  }
  const gname = ageGroupOf(state.ageNow);
  const own = gname && stats.groups[gname];
  const all = stats.groups.all;
  const g = own && own.monthly ? own : (all && all.monthly ? all : null);
  const gLabel = own && own.monthly ? `Ikäryhmäsi ${gname} v` : 'Kaikki käyttäjät';
  sub.textContent = `Jaettuja suunnitelmia yhteensä ${stats.total}` + (own ? ` · ikäryhmässäsi ${own.n}` : '');

  if (!g) {
    body.innerHTML = `<p class="donate-note">Suunnitelmia on jaettu vasta ${stats.total}. Vertailu julkaistaan, kun ` +
      `ryhmässä on vähintään ${stats.kAnon} suunnitelmaa — kutsu kaverisikin mukaan!</p>`;
    return;
  }

  const s = sim || simulate(state);
  const retire = state.events.find((e) => e.type === 'retirement');
  const rows = [];
  const add = (label, q, user, fmt) => {
    if (!q || user == null) return;
    rows.push(`<div class="cmp-row"><span class="cl">${label}</span>${distBarSVG(q, user)}` +
      `<span class="cv">${fmt(user)}</span><span class="cp">${positionTxt(q, user)}</span>` +
      `<span class="cm">mediaani ${fmt(q.p50)}</span></div>`);
  };
  add('Kuukausisäästö', g.monthly, state.monthly, (v) => `${fmtEur(v)}/kk`);
  add('Varallisuus nyt', g.startCapital, state.startCapital, fmtCompact);
  add('Osakepaino', g.stocks, state.allocStocks, (v) => Math.round(v) + ' %');
  if (retire) {
    add('Eläkeikätavoite', g.retireAge, Math.round(retire.age), (v) => Math.round(v) + ' v');
    add('Kuukausitulo eläkkeellä', g.withdrawal, retire.withdrawal, (v) => `${fmtEur(v)}/kk`);
    if (retire.pension > 0) add('Työeläkearvio', g.pension, retire.pension, (v) => `${fmtEur(v)}/kk`);
  }
  if (g.wAtRet && s.wAtRet != null) add('Varallisuus eläkkeellä', g.wAtRet, s.wAtRet, fmtCompact);

  let evHtml = '';
  if (g.events) {
    const top = Object.entries(g.events)
      .filter(([t, share]) => share > 0 && t !== 'retirement')
      .sort((a, b) => b[1] - a[1]).slice(0, 6);
    evHtml = `<h2>Yleisimmät suunnitelmien tapahtumat (${gLabel.toLowerCase()})</h2><div class="cmp-events">` +
      top.map(([t, share]) => `<span class="cmp-chip">${EVENT_TYPES[t].icon} ${EVENT_TYPES[t].label} <b>${Math.round(share * 100)} %</b></span>`).join('') +
      `</div>`;
  }

  body.innerHTML =
    `<h2>${gLabel} (n = ${g === own ? own.n : all.n}) — ▲ = sinä, palkki = P25–P75, viiva = mediaani</h2>` +
    `<div class="cmp-rows">${rows.join('')}</div>` + evHtml;
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
    let amount = ev.type === 'retirement' ? -effWd : ev.amount;
    let amStr = ev.type === 'retirement' ? `−${fmtCompact(effWd)}/kk` : fmtCompact(ev.amount);
    if (ev.type !== 'retirement' && !ev.amount && ev.recMonthly) {
      amount = ev.recMonthly;
      amStr = `${fmtCompact(ev.recMonthly)}/kk`;
    }
    let loanBadge = ev.amount < 0 && ev.financing === 'loan' ? '<span class="loan-badge">laina</span>' : '';
    if (ev.shared) loanBadge += '<span class="loan-badge share-badge">½ jaettu</span>';
    if (ev.type !== 'retirement' && ev.recMonthly) loanBadge += '<span class="loan-badge rec-badge">toistuva</span>';
    if (ev.isAsset && ev.sellAge != null) loanBadge += `<span class="loan-badge sale-badge">myynti ${Math.round(ev.sellAge)} v</span>`;
    const goalBadge = { withdrawal: '→ 0 €', age: 'aikaisin', saving: 'tavoite' }[g];
    if (goalBadge) loanBadge = `<span class="loan-badge zero-badge">${goalBadge}</span>`;
    if (ev.type === 'goal') loanBadge = '<span class="loan-badge goal-badge">🎯 tavoite</span>';
    row.innerHTML =
      `<span class="ic">${def.icon}</span><span class="nm" title="${escapeHtml(evLabel(ev))}">${escapeHtml(evLabel(ev))}</span>` +
      loanBadge +
      `<span class="ag">${Math.round(ev.age)} v</span>` +
      `<span class="am ${amount >= 0 ? 'pos' : 'neg'}">${amStr}</span>` +
      `<button class="rm" title="Poista">✕</button>`;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('rm')) {
        state.events = state.events.filter((x) => x.id !== ev.id);
        if (openPopoverId === ev.id) closePopover();
        renderAll();
      } else {
        openPopover(ev.id);
      }
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPopover(ev.id); }
    });
    box.appendChild(row);
  }
}

/* ===================== Syötteet ===================== */

function updateAllocUI() {
  const a = baseAlloc(state);
  $('stocksVal').textContent = Math.round(a.s * 100) + ' %';
  $('bondsVal').textContent = Math.round(a.b * 100) + ' %';
  const pAl = proOf(state);
  let mu, sigma, extra = '';
  if (pAl) {
    // Pro: omat luokat vähentävät käteisjäännöstä; μ/σ kovarianssilla ja TER:llä
    const cs = proCustomSum();
    $('cashVal').textContent = Math.max(0, Math.round(100 - a.s * 100 - a.b * 100 - cs)) + ' %';
    const classes = classesOf(state);
    const corrM = pAl.corr ? ensurePSD(corrMatrixOf(classes.length, pAl.corr)).M : null;
    ({ mu, sigma } = portfolioStatsPro(weightsAt(state.ageNow, null, state), classes, corrM, pAl.ter));
    if (cs > 0) extra = ` · omat luokat ${Math.round(cs)} %`;
  } else {
    $('cashVal').textContent = Math.round(a.c * 100) + ' %';
    ({ mu, sigma } = portfolioStats(a));
  }
  const txt = `Tuotto-odotus <b>${pctFmt(mu)}/v</b> · heilunta ±${pctFmt(sigma)}${extra}`;
  $('allocSummary').innerHTML = txt;
  for (const id of ['allocStocks', 'allocBonds']) {
    const inp = $(id);
    inp.style.setProperty('--fill', inp.value + '%');
  }
}

function bindInputs() {
  // Numerokentät: kirjoituksen aikana (input) tila päivittyy vain, jos arvo
  // on jo sellaisenaan kelvollinen — keskeneräinen syöte (esim. "8" matkalla
  // lukuun 85) ei muuta tilaa eikä ylikirjoita kenttää. Normalisointi ja
  // riippuvuudet (ikärajat, tapahtumien siirto) ajetaan vasta blurissa/
  // Enterissä (change), jolloin kirjoittaminen ei katkea kesken.
  const num = (id, key, lo, hi) => {
    const inp = $(id);
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (isNaN(v) || v < lo || v > hi) return;
      if (key === 'ageEnd' && v <= state.ageNow + 1) return; // kirjoitus kesken
      if (key === 'ageNow' && v >= state.ageEnd - 1) return;
      state[key] = v;
      renderAll();
    });
    inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      state[key] = clamp(isNaN(v) ? state[key] : v, lo, hi);
      if (key === 'ageNow' || key === 'ageEnd') {
        if (state.ageEnd <= state.ageNow + 1) state.ageEnd = clamp(state.ageNow + 2, 2, 105);
        for (const ev of state.events) {
          ev.age = clamp(ev.age, state.ageNow, state.ageEnd);
          if (ev.sellAge != null) ev.sellAge = clamp(ev.sellAge, ev.age + 1, Math.max(state.ageEnd, ev.age + 1));
        }
        $('ageNow').value = state.ageNow;
        $('ageEnd').value = state.ageEnd;
      } else {
        inp.value = state[key];
      }
      renderAll();
    });
  };
  num('ageNow', 'ageNow', 0, 80);
  num('ageEnd', 'ageEnd', 2, 105);
  num('startCapital', 'startCapital', 0, 1e9);
  num('monthly', 'monthly', 0, 1e6);
  num('savingsGrowth', 'savingsGrowth', 0, 15);
  num('feePct', 'feePct', 0, 10);
  num('wrapFee', 'wrapFee', 0, 10);
  num('divYield', 'divYield', 0, 10);

  $('allocStocks').addEventListener('input', (e) => {
    const cs = state.proOn ? proCustomSum() : 0; // omat luokat vievät osansa
    state.allocStocks = Math.min(+e.target.value, 100 - cs);
    e.target.value = state.allocStocks;
    state.allocBonds = Math.min(state.allocBonds, 100 - state.allocStocks - cs);
    $('allocBonds').value = state.allocBonds;
    renderAll();
  });
  $('allocBonds').addEventListener('input', (e) => {
    const cs = state.proOn ? proCustomSum() : 0;
    state.allocBonds = Math.min(+e.target.value, 100 - state.allocStocks - cs);
    e.target.value = state.allocBonds;
    renderAll();
  });
  $('glide').addEventListener('change', (e) => { state.glide = e.target.checked; renderAll(); });
  $('real').addEventListener('change', (e) => {
    state.real = e.target.checked;
    $('inflationField').hidden = !state.real; // kenttä näkyy vain korjauksen ollessa päällä
    renderAll();
  });
  $('tax').addEventListener('change', (e) => { state.tax = e.target.checked; renderAll(); });
  num('inflation', 'inflation', 0, 15);
}

/* ===================== Esittelykierros ===================== */
// Spotlight-kierros ensikertalaiselle: tummennettu kerros, valokeila kohteen
// ympärillä ja kortti, joka kuljettaa kahdeksalla klikkauksella palvelun läpi.
// Käynnistyy kerran, kun ensivierailija poistuu piirtopöydältä kojelaudalle;
// uusintakierros löytyy ☰-valikosta. Korvasi aiemman aloitusvinkkipalkin.

const TOUR_KEY = 'vp-tour-done';
let tourStep = -1;

const TOUR_STEPS = [
  { t: 'Tervetuloa Varallisuuspolkuun', s: null,
    x: 'Koko elinkaaresi talous yhdellä näkymällä: säästöt, isot hankinnat ja eläke. Kaikki laskenta ja data pysyvät omassa selaimessasi. Kierros kestää alle minuutin.' },
  { t: 'Perustiedot', s: '.card[data-card="basics"]',
    x: 'Ikä, nykyinen varallisuus ja kuukausisäästö. Jokainen muutos päivittää koko laskennan heti.' },
  { t: 'Elämäntapahtumat', s: '.card[data-card="events"]',
    x: 'Raahaa tapahtuma graafille tai napauta sitä: asunto, lapsi, perintö… Lainallisissa on korko ja kuukausierä mukana. Valmiit pohjat löytyvät Esimerkeistä.' },
  { t: 'Elinkaarigraafi', s: '#chartWrap',
    x: 'Viiva on odotettu kehitys ja vyöhyke markkinoiden vaihteluväli tuhansista satunnaisista poluista. Liikuta kohdistinta, niin näet luvut missä tahansa iässä.' },
  { t: 'Tunnusluvut', s: '#stats',
    x: 'Seuraukset yhdellä rivillä — tärkeimpänä onnistumistodennäköisyys: kuinka suuri osa markkinapoluista riittää suunnitelman loppuun asti.' },
  { t: 'Pro-tila', s: '#proSwitch',
    x: 'Kytkin avaa ammattilaissäädöt: omat tuotto-oletukset ja korrelaatiot, kulut, nostostrategiat ja syvemmät analyysit. Perusversio riittää pitkälle — Pro odottaa, kun tarvitset sitä.' },
  { t: 'Piirtopöytä', s: '#fsOpen',
    x: 'Kun perustietosi ovat valmiit, tämä on työpöytäsi: tästä (tai F) aukeaa kokoruudun piirtotila — tartu käyrään, tapahtumaan tai eläkeikäviivaan ja vedä, kone laskee jokaisen vedon hinnan.' },
  { t: 'Suunnitelmani', s: '#summaryBtn',
    x: 'Suunnitelmasi tulostettavana dokumenttina — vaikka varainhoitajalle. Jakolinkki kopioi koko suunnitelman talteen tai kaverille. Täältä näet myös, miten ikätoverisi suunnittelevat talouttaan.' },
  { t: 'Valikko', s: '#moreBtn',
    x: 'Vertailu tallentaa nykyisen suunnitelman haamukäyräksi muutosten taakse. Täältä löytyvät myös Tilastot ja palvelun tiedot.' },
];

function tourShow(i) {
  tourStep = i;
  const st = TOUR_STEPS[i];
  const tour = $('tour'), hole = $('tourHole'), card = $('tourCard');
  tour.hidden = false;
  const target = st.s ? document.querySelector(st.s) : null;
  if (target) target.scrollIntoView({ block: 'center' });

  const last = i === TOUR_STEPS.length - 1;
  card.innerHTML =
    `<div class="tour-dots">${TOUR_STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` +
    `<h3>${st.t}</h3><p>${st.x}</p>` +
    `<div class="tour-actions">` +
    `<button class="btn ghost" id="tourSkip">${last ? 'Sulje' : 'Ohita kierros'}</button>` +
    `<button class="btn" id="tourNext">${last ? 'Aloita: täytä omat tietosi' : `Seuraava (${i + 1}/${TOUR_STEPS.length})`}</button>` +
    `</div>`;
  $('tourSkip').addEventListener('click', (e) => { e.stopPropagation(); endTour(); });
  $('tourNext').addEventListener('click', (e) => {
    e.stopPropagation();
    if (last) { endTour(); focusBasics(); } else tourShow(i + 1);
  });

  // Mittaus vasta kun scrollIntoView on asettunut
  requestAnimationFrame(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (target) {
      const r = target.getBoundingClientRect();
      const pad = 8;
      hole.style.left = (r.left - pad) + 'px';
      hole.style.top = (r.top - pad) + 'px';
      hole.style.width = (r.width + pad * 2) + 'px';
      hole.style.height = (r.height + pad * 2) + 'px';
      hole.classList.remove('none');
    } else {
      hole.style.left = vw / 2 + 'px';
      hole.style.top = vh / 2 + 'px';
      hole.style.width = '0px';
      hole.style.height = '0px';
      hole.classList.add('none');
    }
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let top, left;
    if (target) {
      const r = target.getBoundingClientRect();
      top = r.bottom + 16;
      if (top + ch > vh - 12) top = r.top - ch - 16;   // ei mahdu alle → ylle
      if (top < 12) top = Math.max(12, vh - ch - 16);  // ei ylle → alalaitaan
      left = clamp(r.left + r.width / 2 - cw / 2, 12, Math.max(12, vw - cw - 12));
    } else {
      top = vh * 0.42 - ch / 2;
      left = (vw - cw) / 2;
    }
    card.style.top = Math.round(top) + 'px';
    card.style.left = Math.round(left) + 'px';
  });
  announce(`${st.t}. ${st.x}`);
}

// Kierroksen päätös: työ alkaa Perustiedoista — vieritetään korttiin,
// kohdistetaan ikäkenttään ja hehkautetaan kortti hetkeksi
function focusBasics() {
  const card = document.querySelector('.card[data-card="basics"]');
  if (!card) return;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
  card.classList.add('basics-glow');
  setTimeout(() => card.classList.remove('basics-glow'), 2400);
  setTimeout(() => { try { $('ageNow').focus({ preventScroll: true }); } catch (e) {} }, 450);
  announce('Aloita täyttämällä perustiedot: ikä, varallisuus ja kuukausisäästö');
}

function startTour() {
  closePopover();
  closeMoreMenu();
  closeExamplesMenu();
  closeSummary();
  if (fsOn) exitFs();
  try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {}
  tourShow(0);
}

function endTour() {
  $('tour').hidden = true;
  tourStep = -1;
  try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) {}
}

// (Kierros käynnistyy automaattisesti joka latauksella — käynnistys
// asuu bootissa; ☰-valikon "Esittelykierros" toistaa sen milloin vain.)

function bindTour() {
  // Klikkaus tummennettuun alueeseen vie eteenpäin
  $('tour').addEventListener('click', () => {
    if (tourStep < 0) return;
    if (tourStep === TOUR_STEPS.length - 1) endTour();
    else tourShow(tourStep + 1);
  });
  window.addEventListener('resize', () => { if (tourStep >= 0) tourShow(tourStep); });
  document.addEventListener('keydown', (e) => {
    if (tourStep < 0) return;
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (tourStep === TOUR_STEPS.length - 1) endTour();
      else tourShow(tourStep + 1);
    }
  });
}

/* ===================== Pro-tila ===================== */
// Pro on tila, ei tuote: vipu avaa ammattilaissäädöt samaan moottoriin.
// Kaikki kulkee setPro-kytkimen ja esittelysivun läpi — mahdollinen
// portti (kirjautuminen/osto) on myöhemmin pudotettavissa tähän saumaan.

const PRO_SEEN_KEY = 'vp-pro-seen';
const SCEN_COLORS = ['#f472b6', '#38bdf8', '#a3e635'];
let proScenarios = []; // nimetyt skenaariohaamut: {name, data}
const scenSimCache = new Map();
let proAnaTimer = null;

function proSeen() {
  try { return localStorage.getItem(PRO_SEEN_KEY) === '1'; } catch (e) { return false; }
}
function markProSeen() {
  try { localStorage.setItem(PRO_SEEN_KEY, '1'); } catch (e) {}
}

// Täydennä puuttuvat kentät oletuksilla — data-pp-polut osuvat aina
function ensureProShape() {
  const d = defaultPro();
  if (!state.pro) { state.pro = d; return; }
  const fill = (t, s) => {
    for (const k in s) {
      if (t[k] == null) t[k] = s[k];
      else if (typeof s[k] === 'object' && !Array.isArray(s[k]) && typeof t[k] === 'object') fill(t[k], s[k]);
    }
  };
  fill(state.pro, d);
}

function setPro(on) {
  state.proOn = !!on;
  if (on) ensureProShape();
  applyProUI();
  renderAll();
  announce(on ? 'Pro-tila käytössä — uudet kortit paneelissa' : 'Pro-tila pois käytöstä');
}

function applyProUI() {
  const on = !!state.proOn;
  document.body.classList.toggle('pro', on);
  const t = $('proToggle');
  if (t) t.checked = on;
  for (const c of document.querySelectorAll('.pro-card')) c.hidden = !on;
  if (on) { ensureProShape(); renderProCards(); }
}

function openProModal() {
  markProSeen();
  $('proModal').hidden = false;
}

/* --- Asetuspolut ja apurit --- */

function setProPath(path, v) {
  ensureProShape();
  const segs = path.split('.');
  let o = state.pro;
  for (let i = 0; i < segs.length - 1; i++) o = o[segs[i]];
  o[segs[segs.length - 1]] = v;
}

const proCustomSum = () => (state.pro && Array.isArray(state.pro.assets)
  ? state.pro.assets.reduce((s, a) => s + (a.weight || 0), 0) : 0);

// Korrelaatioiden oletukset: osake–korko 0,2 · osake–käteinen 0 ·
// korko–käteinen 0,2 · omat luokat 0,25 muita vastaan
function initCorrTri(n, oldTri) {
  const oldN = oldTri ? Math.round((1 + Math.sqrt(1 + 8 * oldTri.length)) / 2) : 0;
  const oldM = oldTri ? corrMatrixOf(oldN, oldTri) : null;
  const defFor = (i, j) => (i === 0 && j === 1 ? 0.2 : i === 0 && j === 2 ? 0 : i === 1 && j === 2 ? 0.2 : 0.25);
  const tri = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      tri.push(oldM && i < oldN && j < oldN ? oldM[i][j] : defFor(i, j));
    }
  }
  return tri;
}

function updatePsdNote() {
  const note = $('psdNote');
  if (!note) return;
  const p = proOf(state);
  if (!p || !p.corr) { note.textContent = ''; return; }
  const { shrunk } = ensurePSD(corrMatrixOf(classesOf(state).length, p.corr));
  note.textContent = shrunk
    ? '⚠ Matriisi ei ollut matemaattisesti kelvollinen — laskennassa käytetään lähintä kelvollista (kutistettu kohti riippumattomuutta).'
    : '';
}

/* --- Korttien rakentaminen --- */

const pin = (pp, val, min, max, step, extra = '') => `<input class="pin" type="number" value="${val}" min="${min}" max="${max}" step="${step}" data-pp="${pp}" ${extra} />`;

function buildProMkt() {
  const p = proOf(state) || defaultPro();
  const classes = classesOf(state);
  const custom = state.pro.assets || [];
  const wC = Math.max(0, 100 - state.allocStocks - state.allocBonds - proCustomSum());
  let h = '<div class="pgrid phead"><span>Luokka</span><span>Tuotto %</span><span>Heilunta %</span><span>Paino %</span><span></span></div>';
  const baseW = [state.allocStocks + '', state.allocBonds + '', wC + ''];
  ['stocks', 'bonds', 'cash'].forEach((k, i) => {
    h += `<div class="pgrid"><span class="pl">${classes[i].name}</span>`
      + pin(`mu.${k}`, p.mu[k], -10, 25, 0.1)
      + pin(`sigma.${k}`, p.sigma[k], 0, 60, 0.5)
      + `<span class="pw" title="${i === 2 ? 'jäännös' : 'Allokaatio-kortin liukurista'}">${baseW[i]}${i === 2 ? '·' : '↖'}</span><span></span></div>`;
  });
  custom.forEach((a, i) => {
    h += `<div class="pgrid"><input class="pin pname" type="text" maxlength="24" value="${escapeHtml(a.name)}" data-ppt="assets.${i}.name" />`
      + pin(`assets.${i}.mu`, a.mu, -10, 25, 0.1)
      + pin(`assets.${i}.sigma`, a.sigma, 0, 60, 0.5)
      + pin(`assets.${i}.weight`, a.weight, 0, 100, 1)
      + `<button class="pdel" data-pact="class-del" data-i="${i}" title="Poista luokka">✕</button></div>`;
  });
  if (custom.length < 3) h += '<button class="btn ghost btn-mini" data-pact="class-add">＋ Oma omaisuusluokka</button>';

  h += `<div class="prow"><label class="pinline">Inflaatio-oletus ${pin('infl', p.infl, 0, 10, 0.1)} %/v</label>`
    + `<label class="pinline">Jakauma <select class="pin psel" data-pact="dist">`
    + `<option value="normal"${p.mc.dist === 'normal' ? ' selected' : ''}>Normaali</option>`
    + `<option value="t"${p.mc.dist === 't' ? ' selected' : ''}>Paksuhäntäinen (t)</option></select></label>`
    + (p.mc.dist === 't' ? `<label class="pinline">Vapausasteet ${pin('mc.df', p.mc.df, 3, 30, 1)}</label>` : '')
    + '</div>';

  h += `<label class="toggle ptog"><input type="checkbox" ${state.pro.glide ? 'checked' : ''} data-pact="glide-on" /><span class="switch"></span>`
    + '<span>Oma glidepath <small>korvaa Allokaatio-kortin ikäsidonnaisen kytkimen</small></span></label>';
  if (state.pro.glide) {
    const g = p.glide;
    h += `<div class="prow"><label class="pinline">Alkaa ${pin('glide.from', g.from, 18, 100, 1)} v</label>`
      + `<label class="pinline">Päättyy ${pin('glide.to', g.to, 19, 105, 1)} v</label>`
      + `<label class="pinline">Osakepainosta jäljellä ${pin('glide.endF', g.endF, 0, 100, 5)} %</label></div>`;
  }

  h += `<label class="toggle ptog"><input type="checkbox" ${state.pro.corr ? 'checked' : ''} data-pact="corr-on" /><span class="switch"></span>`
    + '<span>Hajautushyöty <small>korrelaatiomatriisi — perustila olettaa täyskorrelaation</small></span></label>';
  if (state.pro.corr && p.corr) {
    const n = classes.length;
    let k = 0;
    h += `<div class="cgrid" style="grid-template-columns: 46px repeat(${n}, 46px)"><span></span>`
      + classes.map((c) => `<span class="ch">${escapeHtml(c.name.slice(0, 4))}</span>`).join('');
    for (let i = 0; i < n; i++) {
      h += `<span class="ch">${escapeHtml(classes[i].name.slice(0, 4))}</span>`;
      for (let j = 0; j < n; j++) {
        if (j < i) h += '<span class="cd">·</span>';
        else if (j === i) h += '<span class="cd">1</span>';
        else { h += `<input class="pin cin" type="number" step="0.05" min="-0.5" max="1" value="${p.corr[k]}" data-pp="corr.${k}" data-psd="1" />`; k++; }
      }
    }
    h += '</div><p class="note" id="psdNote"></p>';
  }
  $('proMkt').innerHTML = h;
  updatePsdNote();
}

function buildProTax() {
  const p = proOf(state) || defaultPro();
  $('proTax').innerHTML =
    `<div class="prow"><label class="pinline">Juoksevat kulut (TER) ${pin('ter', p.ter, 0, 3, 0.05)} %/v</label></div>`
    + `<div class="prow"><label class="pinline">Pääomatulovero ${pin('tax.low', p.tax.low, 0, 70, 1)} %</label>`
    + `<label class="pinline">korotettu ${pin('tax.high', p.tax.high, 0, 70, 1)} %</label>`
    + `<label class="pinline">rajalta ${pin('tax.bracket', p.tax.bracket, 0, 1000000, 1000)} €/v</label></div>`
    + `<label class="toggle ptog"><input type="checkbox" ${p.tax.acq ? 'checked' : ''} data-pp="tax.acq" /><span class="switch"></span>`
    + '<span>Hankintameno-olettama nostoihin <small>verotettavaa voittoa rajaa 40/20 %-olettama — vain arvo-osuustilillä</small></span></label>';
}

function buildProWd() {
  const p = proOf(state) || defaultPro();
  const seg = [['fixed', 'Kiinteä'], ['pct', '% salkusta'], ['guard', 'Guardrails']]
    .map(([k, l]) => `<button type="button" class="${p.wd.mode === k ? 'on' : ''}" data-pact="wd-mode" data-mode="${k}">${l}</button>`).join('');
  let h = `<div class="field"><span class="field-label">Strategia</span><div class="seg seg-goal">${seg}</div></div>`;
  if (p.wd.mode === 'pct') {
    h += `<div class="prow"><label class="pinline">Nosto ${pin('wd.pct', p.wd.pct, 0.5, 20, 0.1)} % salkusta /v</label></div>`
      + '<p class="note">Tulo joustaa markkinoiden mukana eikä salkku ehdy. Onnistumis-% mittaa siksi tulotarpeen täyttymistä: suunnitelma epäonnistuu, jos nosto + työeläke alittaa eläketapahtuman kuukausitulon tarpeen. Tarve 0 € = ei rajaa. Eläketavoitteet ja Kestävä tulo ovat tässä strategiassa mittareita, eivät ratkaisuja.</p>';
  } else if (p.wd.mode === 'guard') {
    h += `<div class="prow"><label class="pinline">Putki ±${pin('wd.band', p.wd.band, 5, 50, 1)} %</label>`
      + `<label class="pinline">Säätöaskel ${pin('wd.adj', p.wd.adj, 1, 30, 1)} %</label></div>`
      + '<p class="note">Kuukausituloa leikataan tai korotetaan kerran vuodessa, jos nostoprosentti karkaa aloitustason putkesta. Perustaso on eläketapahtuman kuukausitulo.</p>';
  } else {
    h += '<p class="note">Kiinteä kuukausitulo — perusversion käytös. Eläketavoitteet ja piirtopöydän vedot toimivat täysillään.</p>';
  }
  h += `<label class="toggle ptog"><input type="checkbox" ${state.pro.phases ? 'checked' : ''} data-pact="phases-on" /><span class="switch"></span>`
    + '<span>Kulutuksen vaiheistus <small>go-go · slow-go · no-go</small></span></label>';
  if (state.pro.phases) {
    const labels = ['Aktiivivuodet', 'Rauhallisemmat', 'Loppuvuodet'];
    (proOf(state).phases || []).forEach((r, i) => {
      h += `<div class="prow"><span class="pl phl">${labels[i] || ''}</span>`
        + (i < 2 ? `<label class="pinline">ikään ${pin(`phases.${i}.to`, r.to, 18, 200, 1)} v</label>` : '<span class="pinline">siitä eteenpäin</span>')
        + `<label class="pinline">taso ${pin(`phases.${i}.mult`, r.mult, 10, 150, 5)} %</label></div>`;
    });
  }
  $('proWd').innerHTML = h;
}

function buildProMc() {
  const p = proOf(state) || defaultPro();
  const pathsOpt = [300, 1000, 5000, 10000, 20000]
    .map((n) => `<option value="${n}"${p.mc.paths === n ? ' selected' : ''}>${n.toLocaleString('fi-FI')}</option>`).join('');
  const pctVal = `${p.mc.pctLo}-${p.mc.pctHi}`;
  const pctsOpt = [['10-90', 'P10–P90'], ['5-95', 'P5–P95'], ['25-75', 'P25–P75']]
    .map(([v, l]) => `<option value="${v}"${pctVal === v ? ' selected' : ''}>${l}</option>`).join('');
  let h = `<div class="prow"><label class="pinline">Polkuja <select class="pin psel" data-pact="paths">${pathsOpt}</select></label>`
    + `<label class="pinline">Viuhka <select class="pin psel" data-pact="pcts">${pctsOpt}</select></label></div>`
    + `<div class="prow"><label class="pinline">Siemen ${pin('mc.seed', p.mc.seed, 1, 999999999, 1)}</label>`
    + '<button class="btn ghost btn-mini" data-pact="seed-new">Uusi siemen</button></div>'
    + '<p class="note">Sama siemen antaa aina samat markkinapolut — siksi viuhka ei väpätä säätöjen välillä. Uusi siemen näyttää toisen "maailmanhistorian".</p>'
    + '<div class="field"><span class="field-label">Stressiskenaariot graafiin</span></div>';
  for (const [key, def] of Object.entries(STRESS_DEFS)) {
    h += `<label class="toggle ptog"><input type="checkbox" ${p.mc.stress.includes(key) ? 'checked' : ''} data-pact="stress" data-key="${key}" /><span class="switch"></span>`
      + `<span>${def.name} <small>${def.months / 12} v · ${Math.round(def.annual * 100)} %/v eläkkeelle jäännistä</small></span></label>`;
  }
  $('proMc').innerHTML = h;
}

function buildProAna() {
  let h = '<div class="field"><span class="field-label">Skenaariot <small>enintään 3 haamukäyrää nykyisen rinnalle</small></span></div>';
  proScenarios.forEach((sc, i) => {
    h += `<div class="scen-row"><span class="scen-dot" style="background:${SCEN_COLORS[i % 3]}"></span>`
      + `<span class="scen-name">${escapeHtml(sc.name)}</span>`
      + `<button class="pdel" data-pact="scen-del" data-i="${i}" title="Poista skenaario">✕</button></div>`;
  });
  if (proScenarios.length < 3) {
    h += `<div class="scen-add"><input class="pin pname" id="scenName" type="text" maxlength="20" placeholder="esim. Varovainen" />`
      + '<button class="btn ghost btn-mini" data-pact="scen-save">Tallenna nykyinen skenaarioksi</button></div>';
  }
  h += '<h3 class="ana-h">Ehtymiskäyrä <small>P(varat lopussa ikään mennessä)</small></h3><svg id="ruinSvg" viewBox="0 0 300 92"></svg>'
    + '<h3 class="ana-h">Herkkyys <small>vaikutus loppuvarallisuuteen</small></h3><div id="tornadoBox"></div>'
    + '<h3 class="ana-h">Kestävä tulo eläkei\'ittäin</h3><svg id="susSvg" viewBox="0 0 300 92"></svg>';
  $('proAna').innerHTML = h;
}

function renderProCards() {
  buildProMkt();
  buildProTax();
  buildProWd();
  buildProMc();
  buildProAna();
  scheduleProAna();
}

/* --- Toiminnot (rakenteelliset muutokset rakentavat kortit uudelleen) --- */

function proAction(act, el) {
  ensureProShape();
  const p = state.pro;
  const rebuild = () => { renderProCards(); renderAll(); };
  if (act === 'class-add') {
    p.assets = p.assets || [];
    if (p.assets.length < 3) p.assets.push({ name: 'Oma luokka', mu: 5, sigma: 10, weight: 5 });
    if (p.corr) p.corr = initCorrTri(3 + p.assets.length, p.corr);
    rebuild();
  } else if (act === 'class-del') {
    p.assets.splice(+el.dataset.i, 1);
    if (p.corr) p.corr = initCorrTri(3 + p.assets.length, p.corr);
    rebuild();
  } else if (act === 'glide-on') {
    const retire = state.events.find((e) => e.type === 'retirement');
    const to = retire ? Math.round(retire.age) : 70;
    p.glide = el.checked ? { from: Math.max(state.ageNow, to - 15), to, endF: 35 } : null;
    rebuild();
  } else if (act === 'corr-on') {
    p.corr = el.checked ? initCorrTri(3 + (p.assets ? p.assets.length : 0), null) : null;
    rebuild();
  } else if (act === 'dist') {
    p.mc.dist = el.value === 't' ? 't' : 'normal';
    rebuild();
  } else if (act === 'wd-mode') {
    p.wd.mode = el.dataset.mode;
    rebuild();
  } else if (act === 'phases-on') {
    p.phases = el.checked ? [{ to: 75, mult: 100 }, { to: 85, mult: 85 }, { to: 200, mult: 70 }] : null;
    rebuild();
  } else if (act === 'paths') {
    p.mc.paths = +el.value;
    renderAll();
  } else if (act === 'pcts') {
    const [lo, hi] = el.value.split('-').map(Number);
    p.mc.pctLo = lo; p.mc.pctHi = hi;
    renderAll();
  } else if (act === 'seed-new') {
    p.mc.seed = 1 + Math.floor(Math.random() * 1e6);
    buildProMc();
    renderAll();
  } else if (act === 'stress') {
    const key = el.dataset.key;
    const set = new Set(p.mc.stress || []);
    if (el.checked) set.add(key); else set.delete(key);
    p.mc.stress = [...set];
    renderAll();
  } else if (act === 'scen-save') {
    const name = ($('scenName') && $('scenName').value.trim()) || `Skenaario ${proScenarios.length + 1}`;
    proScenarios.push({ name: name.slice(0, 20), data: JSON.parse(JSON.stringify(serialize())) });
    saveScenarios();
    buildProAna();
    renderAll();
    toast(`Skenaario "${name}" tallennettu haamukäyräksi`);
  } else if (act === 'scen-del') {
    proScenarios.splice(+el.dataset.i, 1);
    scenSimCache.clear();
    saveScenarios();
    buildProAna();
    renderAll();
  }
}

function bindPro() {
  $('proToggle').addEventListener('change', (e) => {
    if (e.target.checked && !proSeen()) {
      e.target.checked = false;
      openProModal(); // ensimmäinen kytkentä esittelyn kautta
      return;
    }
    setPro(e.target.checked);
  });
  $('proInfoLink').addEventListener('click', (e) => { e.preventDefault(); openProModal(); });
  $('proEnable').addEventListener('click', () => { $('proModal').hidden = true; setPro(true); });
  $('proCancel').addEventListener('click', () => { $('proModal').hidden = true; });

  for (const id of ['proMkt', 'proTax', 'proWd', 'proMc', 'proAna']) {
    const box = $(id);
    // Numerokentät: arvo suoraan polkuun, ei kortin uudelleenrakennusta
    box.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.ppt != null) { // tekstikenttä (luokan nimi)
        setProPath(t.dataset.ppt, t.value.slice(0, 24));
        saveState();
        return;
      }
      if (!t.dataset || t.dataset.pp == null || t.type === 'checkbox' || t.tagName === 'SELECT') return;
      let v = parseFloat(t.value);
      if (isNaN(v)) return;
      // omien luokkien painot eivät saa ylittää sataa yhdessä liukurien kanssa
      if (/^assets\.\d+\.weight$/.test(t.dataset.pp)) {
        const i = +t.dataset.pp.split('.')[1];
        const others = (state.pro.assets || []).reduce((s, a, k) => s + (k === i ? 0 : a.weight || 0), 0);
        v = clamp(v, 0, Math.max(0, 100 - state.allocStocks - state.allocBonds - others));
        t.value = v;
      }
      setProPath(t.dataset.pp, v);
      renderAll();
      if (t.dataset.psd != null) updatePsdNote();
    });
    box.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.pact) { proAction(t.dataset.pact, t); return; }
      if (t.dataset && t.dataset.pp != null && t.type === 'checkbox') {
        setProPath(t.dataset.pp, t.checked);
        renderAll();
      }
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-pact]');
      if (b) { e.preventDefault(); proAction(b.dataset.pact, b); }
    });
  }
}

/* --- Skenaariohaamut --- */

const SCEN_KEY = 'vp-scenarios-v1';

function loadScenarios() {
  try {
    const raw = JSON.parse(localStorage.getItem(SCEN_KEY));
    if (Array.isArray(raw)) proScenarios = raw.filter((s) => s && s.data && Array.isArray(s.data.events)).slice(0, 3);
  } catch (e) { /* ohitetaan */ }
}
function saveScenarios() {
  try { localStorage.setItem(SCEN_KEY, JSON.stringify(proScenarios)); } catch (e) {}
}
function scenSim(i) {
  const sc = proScenarios[i];
  const j = JSON.stringify(sc.data);
  const c = scenSimCache.get(i);
  if (c && c.json === j) return c.sim;
  const s = simulate(JSON.parse(j));
  scenSimCache.set(i, { json: j, sim: s });
  return s;
}

/* --- Analyysit --- */

function scheduleProAna() {
  clearTimeout(proAnaTimer);
  proAnaTimer = setTimeout(renderProAna, 350);
}

function renderProAna() {
  if (!state.proOn || !sim) return;
  const card = document.querySelector('.card[data-card="proana"]');
  if (!card || card.classList.contains('collapsed')) return;

  // Ehtymiskäyrä
  const ruinSvg = $('ruinSvg');
  if (ruinSvg && sim.ruinCurve) {
    const W = 300, H = 92, l = 30, b = 16, t = 6;
    const { a0, a1, months } = sim;
    const maxR = Math.max(0.05, sim.ruinCurve[months] * 1.15);
    const xs = (m) => l + (m / months) * (W - l - 6);
    const ys = (v) => t + (1 - v / maxR) * (H - t - b);
    let d = `M ${xs(0)} ${ys(0)}`;
    for (let m = 1; m <= months; m += 3) d += ` L ${xs(m).toFixed(1)} ${ys(sim.ruinCurve[m]).toFixed(1)}`;
    ruinSvg.innerHTML =
      `<line x1="${l}" y1="${ys(0)}" x2="${W - 6}" y2="${ys(0)}" class="ana-axis"/>`
      + `<text x="${l - 4}" y="${ys(maxR / 1.15) + 3}" class="ana-tick" text-anchor="end">${Math.round(maxR / 1.15 * 100)} %</text>`
      + `<text x="${l - 4}" y="${ys(0) + 3}" class="ana-tick" text-anchor="end">0</text>`
      + `<text x="${xs(0)}" y="${H - 3}" class="ana-tick">${Math.round(a0)} v</text>`
      + `<text x="${xs(months)}" y="${H - 3}" class="ana-tick" text-anchor="end">${Math.round(a1)} v</text>`
      + `<path d="${d} L ${xs(months)} ${ys(0)} Z" fill="rgba(248,113,113,0.15)" stroke="none"/>`
      + `<path d="${d}" fill="none" stroke="#f87171" stroke-width="1.6"/>`;
  }

  // Tornado (merkityksettömät ±0-rivit pois)
  const box = $('tornadoBox');
  if (box) {
    const rows = tornado(state).filter((r) => Math.abs(r.delta) > 500);
    const maxD = Math.max(1, ...rows.map((r) => Math.abs(r.delta)));
    box.innerHTML = rows.map((r) => {
      const pct = Math.round(Math.abs(r.delta) / maxD * 100);
      const pos = r.delta >= 0;
      return `<div class="tor-row"><span class="tor-l">${r.label}</span>`
        + `<span class="tor-bar"><i class="${pos ? 'pos' : 'neg'}" style="width:${pct}%"></i></span>`
        + `<span class="tor-v ${pos ? 'pos' : 'neg'}">${pos ? '+' : '−'}${fmtCompact(Math.abs(r.delta))}</span></div>`;
    }).join('');
  }

  // Kestävä tulo eläkei'ittäin
  const susSvg = $('susSvg');
  if (susSvg) {
    const pts = sustainableByAge(state, 2);
    if (pts.length > 1) {
      const W = 300, H = 92, l = 38, b = 16, t = 6;
      const maxW = Math.max(...pts.map((p) => p.wd)) * 1.1 || 1;
      const x0 = pts[0].age, x1 = pts[pts.length - 1].age;
      const xs = (a) => l + ((a - x0) / (x1 - x0)) * (W - l - 6);
      const ys = (v) => t + (1 - v / maxW) * (H - t - b);
      let d = '';
      pts.forEach((p, i) => { d += `${i ? ' L' : 'M'} ${xs(p.age).toFixed(1)} ${ys(p.wd).toFixed(1)}`; });
      const retire = retireEv();
      const cur = retire ? clamp(retire.age, x0, x1) : null;
      susSvg.innerHTML =
        `<line x1="${l}" y1="${ys(0)}" x2="${W - 6}" y2="${ys(0)}" class="ana-axis"/>`
        + `<text x="${l - 4}" y="${ys(maxW / 1.1) + 3}" class="ana-tick" text-anchor="end">${fmtCompact(maxW / 1.1)}</text>`
        + `<text x="${xs(x0)}" y="${H - 3}" class="ana-tick">${x0} v</text>`
        + `<text x="${xs(x1)}" y="${H - 3}" class="ana-tick" text-anchor="end">${x1} v</text>`
        + (cur != null ? `<line x1="${xs(cur)}" y1="${t}" x2="${xs(cur)}" y2="${H - b}" class="ana-cur"/>` : '')
        + `<path d="${d}" fill="none" stroke="#2dd4bf" stroke-width="1.8"/>`;
    }
  }
}

// Pro-oletukset Suunnitelmani-dokumenttiin: jokainen poikkeama auki
function proSummaryHtml(s) {
  const p = proOf(state);
  if (!p) return '';
  const d = defaultPro();
  const rows = [];
  const dev = (label, val, defVal, unit = '') => {
    if (String(val) !== String(defVal)) rows.push(`<tr><td>${label}</td><td class="num">${val}${unit}</td><td class="num">${defVal}${unit}</td></tr>`);
  };
  const names = { stocks: 'Osakkeet', bonds: 'Korot', cash: 'Käteinen' };
  for (const k of ['stocks', 'bonds', 'cash']) {
    dev(`${names[k]}: tuotto-odotus`, p.mu[k].toLocaleString('fi-FI'), d.mu[k].toLocaleString('fi-FI'), ' %/v');
    dev(`${names[k]}: heilunta`, p.sigma[k].toLocaleString('fi-FI'), d.sigma[k].toLocaleString('fi-FI'), ' %');
  }
  p.assets.forEach((a) => {
    rows.push(`<tr><td>Oma luokka: ${escapeHtml(a.name)}</td><td class="num">${a.mu} %/v · ±${a.sigma} % · paino ${a.weight} %</td><td class="num">—</td></tr>`);
  });
  dev('Inflaatio-oletus', p.infl.toLocaleString('fi-FI'), d.infl.toLocaleString('fi-FI'), ' %/v');
  dev('Juoksevat kulut (TER)', p.ter.toLocaleString('fi-FI'), '0', ' %/v');
  dev('Pääomatulovero', `${p.tax.low}/${p.tax.high}`, '30/34', ' %');
  dev('Veroraja', p.tax.bracket.toLocaleString('fi-FI'), '30 000', ' €');
  if (p.tax.acq) rows.push('<tr><td>Hankintameno-olettama nostoihin</td><td class="num">käytössä</td><td class="num">ei</td></tr>');
  if (p.glide) rows.push(`<tr><td>Oma glidepath</td><td class="num">${p.glide.from}–${p.glide.to} v → ${p.glide.endF} %</td><td class="num">—</td></tr>`);
  if (p.corr) {
    const { shrunk } = ensurePSD(corrMatrixOf(classesOf(state).length, p.corr));
    rows.push(`<tr><td>Korrelaatiomatriisi</td><td class="num">käytössä${shrunk ? ' (kutistettu)' : ''}</td><td class="num">täyskorrelaatio</td></tr>`);
  }
  if (p.wd.mode !== 'fixed') {
    rows.push(`<tr><td>Nostostrategia</td><td class="num">${p.wd.mode === 'pct' ? p.wd.pct + ' % salkusta/v' : `guardrails ±${p.wd.band} % / ${p.wd.adj} %`}</td><td class="num">kiinteä</td></tr>`);
  }
  if (p.phases) rows.push(`<tr><td>Kulutuksen vaiheistus</td><td class="num">${p.phases.map((r) => `${r.mult} %${r.to < 150 ? ' → ' + r.to + ' v' : ''}`).join(' · ')}</td><td class="num">—</td></tr>`);
  dev('MC-polkuja', p.mc.paths.toLocaleString('fi-FI'), '5 000');
  if (p.mc.dist === 't') rows.push(`<tr><td>Tuottojakauma</td><td class="num">Studentin t (df ${p.mc.df})</td><td class="num">normaali</td></tr>`);
  dev('MC-siemen', p.mc.seed, '1337');
  dev('Viuhka', `P${p.mc.pctLo}–P${p.mc.pctHi}`, 'P10–P90');

  let stressHtml = '';
  if (s.stress && s.stress.length) {
    stressHtml = '<p><b>Stressiskenaariot:</b> ' + s.stress.map((sc) =>
      `${sc.name}: ${sc.depletion != null ? `varat ehtyvät ~${Math.round(sc.depletion)} v` : 'kestää suunnitelman loppuun'}`).join(' · ') + '.</p>';
  }
  return '<h2>Pro-oletukset</h2>'
    + (rows.length
      ? `<table class="sum-table"><thead><tr><th>Oletus</th><th>Arvo</th><th>Perusversio</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
      : '<p>Pro-tila käytössä ilman poikkeamia perusoletuksista.</p>')
    + stressHtml
    + '<p class="sum-disclaimer">Pro-oletukset ovat laatijan omia — eivät palvelun suosituksia.</p>';
}

/* ===================== Perhevirta v1: puoliso ja yhteiskäyrä ===================== */
// Profiilivaihtomalli: aktiivinen henkilö on täsmälleen nykyinen state —
// yksikään olemassa oleva polku ei muutu, ja yksin käyttävälle näkyy vain
// pieni ＋-chip Perustiedoissa. Perhe on kääre, joka säilöö henkilöiden
// tilannekuvat ja vaihtaa ne paikalleen. Yhteiskäyrä ja perheen
// onnistumis-% lasketaan koherentilla kotitalous-MC:llä: sama
// markkinahistoria osuu molempiin, kukin salkku reagoi omalla riskillään.

const FAMILY_KEY = 'vp-family-v1';
const FAM_MAX = 4; // 2 aikuista + 2 lasta
let family = null;    // { persons: [{pid, name, role: me|spouse|child, child, data}], active }
let jointMc = null;   // workerin perhe-MC (onnistumis-% + viuhka)
let famRemoveArm = false;
let famAddMenuEl = null;
const famSimCache = new Map(); // henkilöiden simit (avain: idx, validointi: data-json)

const familyOn = () => !!(family && family.persons.length > 1);
// Kahden hengen polut ja testit: "se toinen" = ensimmäinen ei-aktiivinen
const otherIdx = () => family.persons.findIndex((_, i) => i !== family.active);
const currentName = () => (family ? family.persons[family.active].name : 'Minä');
const activePid = () => (family ? family.persons[family.active].pid : null);
const idxOfPid = (pid) => (family ? family.persons.findIndex((p) => p.pid === pid) : -1);
const hasSpouse = () => !!(family && family.persons.some((p) => p.role === 'spouse'));
const kidColor = (i) => ['#e879f9', '#38bdf8', '#a3e635'][i % 3];

// Vanhat tallenteet (v1: 2 henkilöä ilman pid/roolia) → nykymuoto
function migrateFamily() {
  if (!family) return;
  family.persons.forEach((p, i) => {
    if (!p.pid) p.pid = 'p' + i;
    if (!p.role) p.role = i === 0 ? 'me' : (p.data && p.data.ageNow < 18 ? 'child' : 'spouse');
    p.child = p.role === 'child';
  });
}

function personSim(i) {
  const j = JSON.stringify(family.persons[i].data);
  const c = famSimCache.get(i);
  if (c && c.json === j) return c.sim;
  const s = simulate(JSON.parse(j));
  famSimCache.set(i, { json: j, sim: s });
  return s;
}
const othersOf = () => family.persons.map((p, i) => ({ p, i })).filter((x) => x.i !== family.active);
function getOtherSim() { return familyOn() ? personSim(otherIdx()) : null; }

function saveActiveIntoFamily() {
  if (family) family.persons[family.active].data = JSON.parse(JSON.stringify(serialize()));
}

function persistFamily() {
  try {
    if (family) localStorage.setItem(FAMILY_KEY, JSON.stringify(family));
    else localStorage.removeItem(FAMILY_KEY);
  } catch (e) {}
}

function validFamily(o) {
  return o && Array.isArray(o.persons) && o.persons.length >= 1 && o.persons.length <= FAM_MAX
    && o.persons.every((p) => p && p.data && typeof p.data === 'object' && Array.isArray(p.data.events));
}

function loadFamily() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAMILY_KEY));
    if (validFamily(raw)) {
      family = {
        persons: raw.persons.map((p) => ({ pid: p.pid, name: String(p.name || 'Henkilö').slice(0, 16), role: p.role, child: !!p.child, data: p.data })),
        active: clamp(Math.round(raw.active || 0), 0, raw.persons.length - 1),
      };
      migrateFamily();
    }
  } catch (e) { /* viallinen — ohitetaan */ }
}

// ＋ avaa valikon: puoliso (jos ei jo ole) tai lapsi (jo syntynyt —
// oma käyrä ja perustiedot heti; syntymättömät lapset ovat F6-työtä)
function addPerson(role) {
  closeFamAddMenu();
  if (family && family.persons.length >= FAM_MAX) { toast('Perheessä on jo neljä henkilöä.'); return; }
  if (role === 'spouse' && hasSpouse()) return;
  pushUndoNow();
  if (!family) {
    family = { persons: [{ pid: 'p0', name: 'Minä', role: 'me', child: false, data: JSON.parse(JSON.stringify(serialize())) }], active: 0 };
  }
  const d = JSON.parse(JSON.stringify(serialize()));
  d.startCapital = 0;
  d.income = null; d.expenses = null;
  if (role === 'spouse') {
    d.events = [{ id: 1, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 }];
  } else {
    // Lapsi: oma pieni virta — ikä, lahjarahat ja pitkä horisontti
    d.ageNow = 10;
    d.ageEnd = 90;
    d.monthly = 50;
    d.savingsGrowth = 0;
    d.events = [];
    d.proOn = false;
    d.pro = null;
  }
  const kidCount = family.persons.filter((p) => p.child).length;
  const ownerIdx = family.active; // jakodialogin tarjoaja = lisääjä
  family.persons.push({
    pid: 'p' + (Date.now() % 1e8),
    name: role === 'spouse' ? 'Puoliso' : (kidCount ? `Lapsi ${kidCount + 1}` : 'Lapsi'),
    role, child: role === 'child', data: d,
  });
  saveActiveIntoFamily();
  persistFamily();
  switchPerson(family.persons.length - 1);
  toast(role === 'spouse'
    ? 'Puoliso lisätty — täytä hänen tietonsa. Yhteiskäyrä piirtyy graafiin.'
    : 'Lapsi lisätty — aseta ikä ja säästö (esim. lahjarahat). Siirrot löytyvät paletista.');
  if (role === 'spouse') maybeOfferShareSplit(ownerIdx);
}

/* --- Jakodialogi: puolitetaanko olemassa olevat hankinnat puolisolle? --- */

// Näytetään kerran puolison lisäyksen yhteydessä, jos lisääjällä on
// kulutapahtumia. Sama asia hoituu myöhemmin tapahtuman Jaettu-kytkimestä.
function maybeOfferShareSplit(ownerIdx) {
  const owner = family && family.persons[ownerIdx];
  if (!owner || owner.child) return;
  const cands = owner.data.events.filter((e) => shareable(e) && !e.shared && (e.amount < 0 || (e.recMonthly || 0) < 0));
  if (!cands.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'share-ask';
  wrap.innerHTML = `<div class="share-card" role="dialog" aria-label="Jaetaanko yhteiset hankinnat">
    <h3>Jaetaanko yhteiset hankinnat?</h3>
    <p class="note">Valitut kulut puolitetaan teille kahdelle — puolikkaat pysyvät synkassa
    ja näkyvät molempien suunnitelmissa samassa kalenterihetkessä. Valintaa voi muuttaa
    myöhemmin tapahtuman Jaettu-kytkimestä.</p>
    ${cands.map((e) => `<label class="toggle"><input type="checkbox" data-share="${e.id}" ${SHARE_PRESET.has(e.type) ? 'checked' : ''} /><span class="switch"></span>
      <span>${EVENT_TYPES[e.type].icon} ${escapeHtml(evLabel(e))} <small>${Math.round(e.age)} v · ${fmtEur(Math.abs(e.amount))}${e.recMonthly ? ` + ${fmtEur(Math.abs(e.recMonthly))}/kk` : ''}</small></span></label>`).join('')}
    <div class="actions"><button class="btn" id="shareApply">Jaa valitut puoliksi</button>
    <button class="btn ghost" id="shareSkip">Ei kiitos</button></div>
  </div>`;
  document.body.appendChild(wrap);
  $('shareSkip').addEventListener('click', () => wrap.remove());
  $('shareApply').addEventListener('click', () => {
    const ids = [...wrap.querySelectorAll('[data-share]:checked')].map((x) => +x.dataset.share);
    wrap.remove();
    if (ids.length) applyShareSplit(ownerIdx, ids);
  });
}

// Aktiivinen henkilö on juuri lisätty puoliso (state); omistaja on toinen.
// Puolikas kirjoitetaan suoraan stateen — reconcile pitää parin synkassa
// tästä eteenpäin kummalta puolelta tahansa muokattaessa.
function applyShareSplit(ownerIdx, ids) {
  pushUndoNow();
  const owner = family.persons[ownerIdx];
  const ownerActive = ownerIdx === family.active;
  const oEvents = ownerActive ? state.events : owner.data.events;
  let n = 0;
  for (const id of ids) {
    const e = oEvents.find((x) => x.id === id);
    if (!e || e.shared) continue;
    e.shared = true;
    e.linkId = newLinkId('sh');
    e.peerPid = ownerActive ? family.persons[adultPeerIdx()].pid : activePid();
    halveShared(e);
    if (!ownerActive) {
      // puolikas aktiiviselle (puolisolle) heti; jatkossa reconcile synkkaa
      const age = clamp(e.age - owner.data.ageNow + state.ageNow, state.ageNow, state.ageEnd);
      const tw = { id: idSeq++, linkId: e.linkId, type: e.type, shared: true, peerPid: owner.pid, age, amount: e.amount };
      for (const k of SHARE_FIELDS) if (e[k] != null) tw[k] = e[k];
      if (e.sellAge != null) tw.sellAge = clamp(e.sellAge - owner.data.ageNow + state.ageNow, age + 1, state.ageEnd);
      if (e.name) tw.name = e.name;
      state.events.push(tw);
    }
    n++;
  }
  persistFamily();
  renderAll();
  toast(`${n} hankintaa jaettu puoliksi — puolikkaat näkyvät molempien suunnitelmissa`);
  announce(`${n} hankintaa jaettu puoliksi`);
}

function openFamAddMenu(anchor) {
  if (famAddMenuEl) { closeFamAddMenu(); return; }
  if (family && family.persons.length >= FAM_MAX) { toast('Perheessä on jo neljä henkilöä.'); return; }
  const menu = document.createElement('div');
  menu.className = 'menu';
  const add = (icon, name, desc, fn) => {
    const b = document.createElement('button');
    b.innerHTML = `<div>${icon} ${name}</div><div class="mdesc">${desc}</div>`;
    b.addEventListener('click', fn);
    menu.appendChild(b);
  };
  if (!hasSpouse()) add('🧑‍🤝‍🧑', 'Puoliso', 'Oma suunnitelma ja yhteinen käyrä', () => addPerson('spouse'));
  add('🧒', 'Lapsi', 'Oma käyrä jo syntyneelle — lahjarahat ja siirrot', () => addPerson('child'));
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = r.bottom + 8 + 'px';
  menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 10)) + 'px';
  famAddMenuEl = menu;
}

function closeFamAddMenu() {
  if (famAddMenuEl) { famAddMenuEl.remove(); famAddMenuEl = null; }
}

function switchPerson(i) {
  if (!family || i === family.active || !family.persons[i]) return;
  saveActiveIntoFamily();
  family.active = i;
  applySaved(JSON.parse(JSON.stringify(family.persons[i].data)));
  syncInputs();
  closePopover();
  jointMc = null;
  persistFamily();
  renderFamilyChips();
  renderAll();
  announce(`${family.persons[i].name} valittu`);
}

// ✕ poistaa AKTIIVISEN henkilön (paitsi ensimmäisen) — vaihda ensin
// poistettavaan; siirtoparit siivotaan kaikilta
function removePerson() {
  if (!familyOn() || family.active === 0) return;
  const me = family.persons[family.active];
  if (!famRemoveArm) {
    famRemoveArm = true;
    renderFamilyChips();
    toast(`Poistetaanko ${me.name}? Napauta ✕ uudestaan.`);
    setTimeout(() => { famRemoveArm = false; renderFamilyChips(); }, 3000);
    return;
  }
  famRemoveArm = false;
  const pid = me.pid;
  family.persons.splice(family.active, 1);
  for (const p of family.persons) {
    // poistuneen siirtoparit pois; jaetut hankinnat palautuvat täysiksi
    p.data.events = p.data.events.filter((e) => !(EVENT_TYPES[e.type] && EVENT_TYPES[e.type].familyOnly && e.peerPid === pid));
    for (const e of p.data.events) if (e.shared && e.peerPid === pid) unshareEvent(e);
  }
  family.active = 0;
  famSimCache.clear();
  jointMc = null;
  applySaved(JSON.parse(JSON.stringify(family.persons[0].data)));
  syncInputs();
  if (family.persons.length === 1) family = null; // takaisin yksin-tilaan
  persistFamily();
  renderFamilyChips();
  renderAll();
  toast(`${me.name} poistettu — jakolinkki palauttaa tarvittaessa`);
  announce(`${me.name} poistettu`);
}

function renderFamilyChips() {
  const box = $('familyChips');
  if (!box) return;
  buildPalette(); // siirtochipit näkyvät vain perhetilassa
  if (!familyOn()) {
    box.innerHTML = '<button class="fam-add" data-fam="add" title="Lisää puoliso tai lapsi — perheen yhteiskäyrä piirtyy graafiin">＋</button>';
    return;
  }
  box.innerHTML = family.persons.map((p, ci) => {
    const kidIdx = family.persons.slice(0, ci).filter((x) => x.child).length;
    const style = p.child ? ` style="--kid:${kidColor(kidIdx)}"` : '';
    return `<button class="fam-chip${ci === family.active ? ' on' : ''}${p.child ? ' kid' : ''}" data-fam="p${ci}"${style} title="${ci === family.active ? 'Kaksoisnapautus nimeää' : 'Vaihda: ' + escapeHtml(p.name)}">${escapeHtml(p.name)}</button>`;
  }).join('')
    + (family.persons.length < FAM_MAX ? '<button class="fam-add" data-fam="add" title="Lisää puoliso tai lapsi">＋</button>' : '')
    + (family.active > 0 ? `<button class="fam-del${famRemoveArm ? ' armed' : ''}" data-fam="del" title="Poista ${escapeHtml(currentName())}">✕</button>` : '');
}

function bindFamily() {
  const box = $('familyChips');
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fam]');
    if (!b) return;
    e.stopPropagation(); // h2-klikki taittaisi kortin
    e.preventDefault();
    const k = b.dataset.fam;
    if (k === 'add') openFamAddMenu(b);
    else if (k === 'del') removePerson();
    else {
      const i = +k.slice(1);
      if (i !== family.active) switchPerson(i);
    }
  });
  $('famMountainBtn').addEventListener('click', openMountain);
  $('mountainClose').addEventListener('click', () => { $('mountainModal').hidden = true; });
  box.addEventListener('dblclick', (e) => {
    const b = e.target.closest('[data-fam]');
    if (!b || !family) return;
    e.stopPropagation();
    const k = b.dataset.fam;
    if (!k.startsWith('p')) return;
    const i = +k.slice(1);
    const name = prompt('Nimi:', family.persons[i].name);
    if (name && name.trim()) {
      family.persons[i].name = name.trim().slice(0, 16);
      persistFamily();
      renderFamilyChips();
    }
  });
}

/* --- Siirrot ja jaetut tapahtumat: pari pysyy synkassa osapuolilla --- */

// Sama kalenterihetki, eri iät: kohdehenkilön ikä samana kuukautena
const peerAgeOf = (age, od) => clamp(age - state.ageNow + od.ageNow, od.ageNow, od.ageEnd);

// Jaettu hankinta: kulu puoliksi molemmille aikuisille. Kumpikin puolikas on
// tavallinen tapahtuma omassa suunnitelmassa (moottori ei tiedä jaosta mitään);
// linkId+peerPid pitävät parin synkassa täsmälleen kuten siirroissa.
const SHARE_FIELDS = ['financing', 'down', 'rate', 'years', 'recMonthly', 'recYears', 'isAsset', 'appr', 'sellTaxFree'];
const SHARE_PRESET = new Set(['home', 'car', 'cottage', 'renovation', 'wedding']); // dialogin esivalinta
const shareable = (e) => {
  const def = EVENT_TYPES[e.type];
  return !!def && !def.familyOnly && !def.metric && e.type !== 'retirement';
};
const isPaired = (e) => !!e.linkId && (e.shared || (EVENT_TYPES[e.type] && EVENT_TYPES[e.type].familyOnly));
const adultPeerIdx = () => family.persons.findIndex((p, i) => i !== family.active && !p.child);
const newLinkId = (pfx) => pfx + (idSeq++) + '-' + Math.floor(Math.random() * 1e6);
function halveShared(e) {
  e.amount = Math.round(e.amount / 2);
  if (e.down != null) e.down = Math.round(e.down / 2);
  if (e.recMonthly != null) e.recMonthly = Math.round(e.recMonthly / 2);
}
function unshareEvent(e) {
  e.amount = Math.round(e.amount * 2);
  if (e.down != null) e.down = Math.round(e.down * 2);
  if (e.recMonthly != null) e.recMonthly = Math.round(e.recMonthly * 2);
  delete e.shared; delete e.linkId; delete e.peerPid;
}

function mirrorTransfer(ev) {
  if (!familyOn() || !ev.linkId) return;
  // kohde: peerPid tai (kahden hengen perheessä / puuttuessa) se toinen
  let ti = ev.peerPid != null ? idxOfPid(ev.peerPid) : -1;
  if (ti < 0 || ti === family.active) ti = ev.shared ? adultPeerIdx() : otherIdx();
  if (ti < 0) return;
  ev.peerPid = family.persons[ti].pid;
  const od = family.persons[ti].data;
  let tw = od.events.find((x) => x.linkId === ev.linkId);
  if (!tw) {
    tw = { id: 800000 + Math.floor(Math.random() * 1e5), linkId: ev.linkId };
    od.events.push(tw);
  }
  tw.age = peerAgeOf(ev.age, od);
  tw.peerPid = activePid(); // parin toinen pää osoittaa takaisin
  if (ev.name) tw.name = ev.name; else delete tw.name;
  if (ev.shared) {
    // sama tapahtuma, sama osuus — vain iät mapataan kalenteriin
    tw.type = ev.type;
    tw.amount = ev.amount;
    tw.shared = true;
    for (const k of SHARE_FIELDS) { if (ev[k] != null) tw[k] = ev[k]; else delete tw[k]; }
    if (ev.sellAge != null) tw.sellAge = clamp(peerAgeOf(ev.sellAge, od), tw.age + 1, od.ageEnd);
    else delete tw.sellAge;
  } else {
    tw.type = ev.type === 'transferOut' ? 'transferIn' : 'transferOut';
    tw.amount = -ev.amount;
  }
}

// Ajetaan tallennuksen yhteydessä: aktiivisen parilliset tapahtumat (siirrot
// ja jaetut) peilataan kohteilleen, ja muilta poistetaan NE parit, joiden
// vastinkappale kuuluisi aktiiviselle mutta on poistettu. Muiden keskinäisiin
// pareihin ei kosketa.
function reconcileTransfers() {
  if (!familyOn()) return;
  const me = activePid();
  const activeLinks = new Set();
  for (const e of state.events) {
    if (isPaired(e)) {
      activeLinks.add(e.linkId);
      mirrorTransfer(e);
    }
  }
  const two = family.persons.length === 2;
  for (const { p } of othersOf()) {
    p.data.events = p.data.events.filter((e) => {
      if (!isPaired(e)) return true;
      const peer = e.peerPid || (two ? me : null);
      return peer !== me || activeLinks.has(e.linkId);
    });
  }
}

/* --- Perheratkaisija: tartu yhteiskäyrään, molempien säästöt joustavat --- */

// Esikäsittely kerran per veto; per frame vain N runPathia.
// Jakosääntö: sama euromäärä jokaiselle AIKUISELLE — lasten säästöt
// (lahjarahat) eivät jousta perhevedosta.
function makeFamilySolver() {
  const built = family.persons.map((p, i) => {
    const data = i === family.active ? state : JSON.parse(JSON.stringify(p.data));
    const ctx = prepareSim(data);
    const ret = ctx.retire ? ctx.retire.age : null;
    return {
      i, child: !!p.child, data, ctx, ret,
      mu: buildMu(ctx, data, ret).muM,
      wd: ctx.retire ? ctx.retire.withdrawal : 0,
      m0: data.monthly,
    };
  });
  const adults = built.filter((b) => !b.child);
  const wAt = (b, save, m) =>
    runPath(b.ctx, b.data, b.wd, b.ret, b.mu, { clamp0: true, monthlySave: save, stopAt: Math.max(0, Math.min(m, b.ctx.months)) }).stopW;
  const saveOf = (b, d) => Math.max(0, b.m0 + (b.child ? 0 : d));
  return {
    m0sum: built.reduce((s, b) => s + b.m0, 0),
    loD: -Math.min(...adults.map((b) => b.m0)),
    monthFor: (age) => clamp(Math.round((age - state.ageNow) * 12), 0, Math.max(...built.map((b) => b.ctx.months))),
    totalAt: (d, m) => built.reduce((s, b) => s + wAt(b, saveOf(b, d), m), 0),
    apply: (d) => built.forEach((b) => {
      const v = saveOf(b, d);
      if (b.i === family.active) { state.monthly = v; $('monthly').value = v; }
      else family.persons[b.i].data.monthly = v;
    }),
    liveOthers: (d) => built.filter((b) => b.i !== family.active).map((b) => ({
      i: b.i,
      arr: runPath(b.ctx, b.data, b.wd, b.ret, b.mu, { clamp0: true, monthlySave: saveOf(b, d), collect: true }).arr,
    })),
    sumWith: (d) => built.reduce((s, b) => s + saveOf(b, d), 0),
    splitNote: (d) => built.map((b) =>
      `${escapeHtml(family.persons[b.i].name)} ${fmtNum(saveOf(b, d))}`).join(' · ') + ' €/kk',
  };
}

/* --- Leskiturva: deterministinen tarkastelu Suunnitelmani-dokumenttiin --- */

// "Jos henkilö kuolee iässä X": lesken suunnitelmaan lisätään perintönä
// vainajan sijoitusvarallisuus kuolinhetkellä; tulos = riittävyys.
// Tarkastelu tehdään aikuisten välillä (perintö puolisolle, ei lapsille).
function widowCheck(deadIdx, deathAgeOfDead, survIdx) {
  const persons = family.persons;
  if (survIdx == null) survIdx = persons.findIndex((p, i) => i !== deadIdx && !p.child);
  const dead = JSON.parse(JSON.stringify(persons[deadIdx].data));
  const surv = JSON.parse(JSON.stringify(persons[survIdx].data));
  const dSim = simulate(dead);
  const mD = clamp(Math.round((deathAgeOfDead - dead.ageNow) * 12), 0, dSim.months);
  const inherit = Math.max(0, dSim.exp[mD]);
  const survAge = clamp(deathAgeOfDead - dead.ageNow + surv.ageNow, surv.ageNow, surv.ageEnd - 1);
  surv.events = surv.events.filter((e) => !(EVENT_TYPES[e.type] && EVENT_TYPES[e.type].familyOnly));
  surv.events.push({ id: 899999, type: 'inheritance', age: survAge, amount: Math.round(inherit) });
  const sSim = simulate(surv);
  return { inherit, survAge, depletionAge: sSim.depletionAge, a1: sSim.a1 };
}

/* --- Suunnitelmani: perheosio --- */

function familySummaryHtml() {
  if (!familyOn()) return '';
  saveActiveIntoFamily();
  const sims = family.persons.map((p) => simulate(JSON.parse(JSON.stringify(p.data))));
  const joint = mcHousehold(family.persons.map((p) => JSON.parse(JSON.stringify(p.data))), { paths: 300 });
  const total = householdExp(sims);
  const yearNow = new Date().getFullYear();

  let rows = '';
  family.persons.forEach((p, i) => {
    const s = sims[i];
    rows += `<tr><td>${escapeHtml(p.name)}</td>`
      + `<td class="num">${fmtEur(p.data.monthly)}/kk</td>`
      + `<td class="num">${s.retireAge != null ? Math.round(s.retireAge) + ' v' : '—'}</td>`
      + `<td class="num">${s.wAtRet != null ? fmtCompact(s.wAtRet) : '—'}</td>`
      + `<td class="num">${s.successProb != null ? Math.round(s.successProb * 100) + ' %' : '—'}</td></tr>`;
  });

  // siirrot (dedupe linkId:llä, suunta antajalta saajalle)
  const seen = new Set();
  let trRows = '';
  family.persons.forEach((p, i) => {
    for (const e of p.data.events) {
      if (e.type !== 'transferOut' || !e.linkId || seen.has(e.linkId)) continue;
      seen.add(e.linkId);
      const ti = e.peerPid != null ? idxOfPid(e.peerPid) : family.persons.findIndex((_, j) => j !== i);
      const to = family.persons[ti] ? family.persons[ti].name : '?';
      const year = yearNow + Math.round(e.age - p.data.ageNow);
      trRows += `<tr><td>${escapeHtml(p.name)} → ${escapeHtml(to)}</td>`
        + `<td class="num">${Math.round(e.age)} v · ~${year}</td><td class="num">${fmtEur(-e.amount)}</td></tr>`;
    }
  });

  // leskiturva: aikuisparin tarkastelu, kuolema eläkeiässä (tai 70 v)
  let widowRows = '';
  const adults = family.persons.map((p, i) => ({ p, i })).filter((x) => !x.p.child);
  if (adults.length >= 2) {
    adults.forEach(({ p, i }) => {
      const ret = p.data.events.find((e) => e.type === 'retirement');
      const dAge = ret ? Math.round(ret.age) : 70;
      const surv = adults.find((x) => x.i !== i);
      const w = widowCheck(i, dAge, surv.i);
      widowRows += `<li>Jos <b>${escapeHtml(p.name)}</b> kuolee ${dAge} v iässä: ${escapeHtml(surv.p.name)} perii sijoitusvarallisuuden ~<b>${fmtCompact(w.inherit)}</b> — `
        + (w.depletionAge != null && w.depletionAge < w.a1 - 1
          ? `lesken varat ehtyvät noin <b class="wr">${Math.round(w.depletionAge)} v</b> iässä.`
          : `lesken varat riittävät suunnitelman loppuun.`) + '</li>';
    });
  }

  return `<h2>Perheen suunnitelma</h2>`
    + `<div class="sum-tiles">`
    + `<div class="sum-tile"><div class="k">Perheen onnistumistodennäköisyys</div><div class="v accent">${Math.round(joint.successProb * 100)} %</div><div class="s">sama markkinahistoria molemmille</div></div>`
    + `<div class="sum-tile"><div class="k">Yhteisvarallisuus lopussa</div><div class="v">${fmtCompact(total[total.length - 1])}</div><div class="s">koko perheen sijoitukset yhteensä</div></div>`
    + `</div>`
    + `<table class="sum-table"><thead><tr><th>Henkilö</th><th>Säästö</th><th>Eläkeikä</th><th>Eläkkeellä</th><th>Onnistumis-%</th></tr></thead><tbody>${rows}</tbody></table>`
    + (trRows ? `<h2>Siirrot perheessä</h2><table class="sum-table"><thead><tr><th>Siirto</th><th>Ajankohta</th><th>Summa</th></tr></thead><tbody>${trRows}</tbody></table>` : '')
    + (widowRows ? `<h2>Leskiturvatarkastelu</h2><ul class="sum-points">${widowRows}</ul>`
      + `<p class="sum-disclaimer">Leskiturva on karkea tarkastelu: perintö siirtyy leskelle sellaisenaan, perhe-eläkettä tai perintöveroa ei mallinneta. Jaetut hankinnat säilyvät leskellä omana osuutenaan.</p>` : '');
}

/* --- Perhevuoristo: 2.5D-katselunäkymä --- */

function openMountain() {
  saveActiveIntoFamily();
  const sims = family.persons.map((p) => simulate(JSON.parse(JSON.stringify(p.data))));
  const total = householdExp(sims);
  const months = total.length - 1;
  const W = 760, rowH = 130, pad = 46, offX = 26, offY = 34;
  const series = [
    { name: 'Yhteensä', arr: total, color: '#e8edf8' },
    ...family.persons.map((p, i) => {
      const kidIdx = family.persons.slice(0, i).filter((x) => x.child).length;
      return { name: p.name, arr: sims[i].exp, color: i === family.active ? '#2dd4bf' : (p.child ? kidColor(kidIdx) : '#64748b') };
    }),
  ].reverse(); // taaimmainen ensin
  const H = pad * 2 + rowH + offY * (series.length - 1);
  const maxV = Math.max(...total) || 1;
  let g = '';
  series.forEach((s, i) => {
    const baseY = H - pad - i * offY;
    const x0 = pad + (series.length - 1 - i) * offX;
    const w = W - pad * 2 - offX * (series.length - 1);
    const xs = (m) => x0 + (Math.min(m, s.arr.length - 1) / months) * w;
    const ys = (v) => baseY - (v / maxV) * rowH;
    let d = `M ${xs(0).toFixed(1)} ${baseY}`;
    const step = Math.max(1, Math.round(months / 240));
    for (let m = 0; m <= months; m += step) d += ` L ${xs(m).toFixed(1)} ${ys(s.arr[Math.min(m, s.arr.length - 1)]).toFixed(1)}`;
    d += ` L ${xs(months).toFixed(1)} ${baseY} Z`;
    g += `<path d="${d}" fill="rgba(10,14,26,0.88)" stroke="${s.color}" stroke-width="1.8"/>`
      + `<text x="${x0 + 8}" y="${baseY - 7}" class="mtn-name" fill="${s.color}">${escapeHtml(s.name)}</text>`;
  });
  const yearNow = new Date().getFullYear();
  g += `<text x="${pad}" y="${H - 8}" class="mtn-tick">${yearNow}</text>`
    + `<text x="${W - pad}" y="${H - 8}" text-anchor="end" class="mtn-tick">${yearNow + Math.round(months / 12)}</text>`;
  $('mountainSvg').setAttribute('viewBox', `0 0 ${W} ${H}`);
  $('mountainSvg').innerHTML = g;
  $('mountainModal').hidden = false;
}
/* ===================== Säästökyky-apuri (tulot ja menot) ===================== */
// Rajaus: tulot ja menot ovat PÄÄTÖKSEN apuväline, eivät kirjanpitoa.
// Apuri laskee säästövaran ja -asteen ja kirjoittaa tuloksen olemassa
// olevaan kuukausisäästöön — moottori näkee edelleen vain nettovirrat.
// Menot antavat myös eläkeajan tulotarpeelle järkevän oletuksen.

function updateSaverNote() {
  const note = $('savNote');
  if (!note) return;
  const inc = state.income, exp = state.expenses;
  if (inc == null && exp == null) { note.textContent = 'Vapaaehtoinen: lukuja ei jaeta mihinkään.'; return; }
  const parts = [];
  if (inc != null && exp != null) {
    const room = Math.max(0, inc - exp);
    parts.push(`Säästövara <b>${fmtEur(room)}/kk</b>`);
  }
  if (inc > 0) parts.push(`nykyinen säästöaste <b>${Math.round(state.monthly / inc * 100)} %</b> nettotuloista`);
  note.innerHTML = parts.join(' · ') || 'Täytä molemmat kentät.';
}

function bindSaver() {
  $('saverLink').addEventListener('click', (e) => {
    e.preventDefault();
    const box = $('saverBox');
    box.hidden = !box.hidden;
    if (!box.hidden) updateSaverNote();
  });
  const num = (id, key) => {
    $(id).addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      state[key] = isNaN(v) ? null : clamp(v, 0, 1e6);
      updateSaverNote();
      saveState();
    });
  };
  num('savIncome', 'income');
  num('savExpenses', 'expenses');
  $('savApply').addEventListener('click', () => {
    if (state.income == null || state.expenses == null) { toast('Täytä nettotulot ja menot ensin.'); return; }
    const room = Math.max(0, Math.round((state.income - state.expenses) / 10) * 10);
    pushUndoNow();
    state.monthly = clamp(room, 0, 1e6);
    $('monthly').value = state.monthly;
    renderAll();
    updateSaverNote();
    toast(`Kuukausisäästö ${fmtEur(state.monthly)}/kk säästövarasta`);
  });

  // Porrastettu säästö: kytkin, lisäys, poisto
  $('savePhaseLink').addEventListener('click', (e) => { e.preventDefault(); enableSavePhases(); });
  $('savePhaseOff').addEventListener('click', disableSavePhases);
  $('savePhaseAdd').addEventListener('click', () => {
    const ph = state.savePhases || [];
    const last = ph[ph.length - 1];
    ph.push({ to: clamp(last ? last.to : state.ageEnd, 1, 105), amount: last ? last.amount : (state.monthly || 500) });
    renderSavePhaseRows();
    renderAll();
  });
}

/* ===================== Porrastettu säästö (savePhases) ===================== */
// Säästö elää elämänvaiheittain ylös ja alas. state.savePhases = [{to, amount}]
// | null. Kun aktiivinen: tasainen kuukausisäästökenttä piilotetaan ja käyrän
// kertymä-raahaus ohjataan editoriin (moottori käyttää aikataulua, ei yhtä summaa).

function savePhaseActive() { return Array.isArray(state.savePhases) && state.savePhases.length > 0; }

function renderSavePhaseRows() {
  const box = $('savePhaseRows');
  const ph = state.savePhases || [];
  box.innerHTML = ph.map((p, i) =>
    `<div class="savephase-row">` +
    `<span class="sp-lab">alle</span>` +
    `<span class="input sp-age"><input type="number" class="sp-to" data-i="${i}" min="1" max="105" step="1" value="${p.to}" /><em>v</em></span>` +
    `<span class="input sp-amt-w"><input type="number" class="sp-amt" data-i="${i}" min="0" step="50" value="${Math.round(p.amount)}" /><em>€/kk</em></span>` +
    (ph.length > 1 ? `<button type="button" class="sp-del" data-i="${i}" aria-label="Poista vaihe" title="Poista vaihe">✕</button>` : '<span class="sp-del-x"></span>') +
    `</div>`).join('');
  box.querySelectorAll('.sp-to').forEach((el) => el.addEventListener('input', (e) => {
    const i = +e.target.dataset.i, v = parseFloat(e.target.value);
    if (isFinite(v)) { state.savePhases[i].to = clamp(Math.round(v), 1, 105); renderAll(); }
  }));
  box.querySelectorAll('.sp-amt').forEach((el) => el.addEventListener('input', (e) => {
    const i = +e.target.dataset.i, v = parseFloat(e.target.value);
    state.savePhases[i].amount = isFinite(v) ? clamp(v, 0, 1e6) : 0;
    renderAll();
  }));
  box.querySelectorAll('.sp-del').forEach((el) => el.addEventListener('click', (e) => {
    state.savePhases.splice(+e.currentTarget.dataset.i, 1);
    if (!state.savePhases.length) disableSavePhases();
    else { renderSavePhaseRows(); renderAll(); }
  }));
  const g = state.savingsGrowth || 0;
  $('savePhaseGrowth').textContent = g > 0
    ? `Summat kasvavat lisäksi ${pctFmt(g / 100)} vuodessa (palkkakehitys). Aseta säästön vuosikasvu 0 %:iin, jos haluat tarkat summat.`
    : 'Viimeinen vaihe jatkuu suunnitelman loppuun.';
}

function syncSavePhaseUI() {
  const on = savePhaseActive();
  const box = $('savePhaseBox');
  if (box) box.hidden = !on;
  const mf = $('monthlyField'); if (mf) mf.style.display = on ? 'none' : '';
  const link = $('savePhaseLink'); if (link) link.style.display = on ? 'none' : '';
  if (on) renderSavePhaseRows();
}

function enableSavePhases() {
  pushUndoNow();
  const m = state.monthly || 500;
  const mid = clamp(Math.round((state.ageNow + state.ageEnd) / 2), state.ageNow + 1, state.ageEnd - 1);
  state.savePhases = [{ to: mid, amount: m }, { to: state.ageEnd, amount: m }];
  track('Porrastus käyttöön'); // erottautumisominaisuus — käyttö kiinnostaa
  syncSavePhaseUI();
  renderAll();
}

function disableSavePhases() {
  pushUndoNow();
  if (savePhaseActive()) state.monthly = clamp(Math.round(state.savePhases[0].amount), 0, 1e6);
  state.savePhases = null;
  syncSavePhaseUI();
  $('monthly').value = state.monthly;
  renderAll();
}

/* ===================== Toast ===================== */

let toastEl = null, toastTimer = null;
function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

/* ===================== Kumoa (Ctrl+Z) ===================== */
// Kevyt peruutushistoria: tilannekuva jokaisen muutoksen jälkeen (debounce),
// Ctrl+Z palauttaa edellisen. Ei talleteta levylle — istunnon mittainen.

const undoStack = [];
let undoTimer = null, undoSuppress = false;

function pushUndoNow() {
  const snap = JSON.stringify(serialize());
  if (undoStack[undoStack.length - 1] !== snap) {
    undoStack.push(snap);
    if (undoStack.length > 100) undoStack.shift();
  }
}
function pushUndoDebounced() {
  if (undoSuppress) return;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(pushUndoNow, 500);
}
function doUndo() {
  clearTimeout(undoTimer);
  const cur = JSON.stringify(serialize());
  while (undoStack.length && undoStack[undoStack.length - 1] === cur) undoStack.pop();
  const prev = undoStack.pop();
  if (!prev) { toast('Ei kumottavaa'); return; }
  undoSuppress = true;
  try {
    applySaved(JSON.parse(prev));
    syncInputs();
    closePopover();
    renderAll();
  } finally {
    undoSuppress = false;
  }
  undoStack.push(prev); // jää historian huipuksi = nykytila
  toast('Kumottu');
}

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  const t = e.target;
  // Tekstikentässä annetaan selaimen oman kumoamisen hoitaa kirjoitus
  if (t && t.tagName === 'INPUT' && (t.type === 'text' || t.type === 'number') && t === document.activeElement) return;
  e.preventDefault();
  doUndo();
});

/* ===================== Esimerkkisuunnitelmat ===================== */
// Valmiit pohjat eri elämäntilanteisiin — korvaa nykyisen suunnitelman
// (Ctrl+Z palauttaa). Luvut ovat kuvitteellisia esimerkkejä, eivät suosituksia.

const EXAMPLES = [
  {
    name: 'Aloittaja (25 v)', desc: 'Ensiasunto edessä, säästäminen alussa',
    data: {
      ageNow: 25, ageEnd: 90, startCapital: 3000, monthly: 1100, savingsGrowth: 2.5,
      allocStocks: 90, allocBonds: 5, glide: false, real: false, tax: true,
      events: [
        { type: 'home', age: 33, amount: -180000, financing: 'loan', down: 27000, rate: 3.5, years: 25, isAsset: true, appr: 2 },
        { type: 'retirement', age: 68, withdrawal: 2300, pension: 1500, pensionAge: 68 },
      ],
    },
  },
  {
    name: 'Perhe ja asunto (35 v)', desc: 'Lapsia, isompi asunto, arjen erät',
    data: {
      ageNow: 35, ageEnd: 90, startCapital: 40000, monthly: 2300, savingsGrowth: 1.5,
      allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
      events: [
        { type: 'home', age: 36, amount: -280000, financing: 'loan', down: 42000, rate: 3.5, years: 25, isAsset: true, appr: 2 },
        { type: 'child', age: 36, amount: -3000, financing: 'cash', recMonthly: -350, recYears: 18 },
        { type: 'child', age: 38, amount: -3000, financing: 'cash', recMonthly: -350, recYears: 18 },
        { type: 'car', age: 40, amount: -30000, financing: 'loan', down: 6000, rate: 4.5, years: 6, isAsset: true, appr: -10 },
        { type: 'retirement', age: 66, withdrawal: 3000, pension: 1900, pensionAge: 66 },
      ],
    },
  },
  {
    name: 'Kiri eläkkeelle (45 v)', desc: 'Paljonko pitää säästää, jotta eläke riittää?',
    data: {
      ageNow: 45, ageEnd: 92, startCapital: 90000, monthly: 1200, savingsGrowth: 1,
      allocStocks: 60, allocBonds: 30, glide: true, real: false, tax: true,
      events: [
        { type: 'renovation', age: 50, amount: -40000, financing: 'loan', down: 4000, rate: 4.5, years: 10 },
        { type: 'retirement', age: 61, withdrawal: 3200, pension: 1900, pensionAge: 65, goal: 'saving', conf: 0.85 },
      ],
    },
  },
  {
    name: 'FIRE-haaveilija (32 v)', desc: 'Kuinka aikaisin voi irrottautua 85 % varmuudella?',
    data: {
      ageNow: 32, ageEnd: 95, startCapital: 60000, monthly: 2600, savingsGrowth: 2,
      allocStocks: 95, allocBonds: 5, glide: false, real: true, tax: true,
      events: [
        { type: 'retirement', age: 50, withdrawal: 2200, pension: 1300, pensionAge: 65, goal: 'age', conf: 0.85 },
      ],
    },
  },
];

let examplesMenuEl = null;

function closeExamplesMenu() {
  if (examplesMenuEl) { examplesMenuEl.remove(); examplesMenuEl = null; }
}

function openExamplesMenu(anchor) {
  if (examplesMenuEl) { closeExamplesMenu(); return; }
  const menu = document.createElement('div');
  menu.className = 'menu';
  for (const ex of EXAMPLES) {
    const b = document.createElement('button');
    b.innerHTML = `<div>${ex.name}</div><div class="mdesc">${ex.desc}</div>`;
    b.addEventListener('click', () => {
      closeExamplesMenu();
      pushUndoNow(); // nykyinen suunnitelma talteen ennen korvaamista
      applySaved(JSON.parse(JSON.stringify(ex.data)));
      syncInputs();
      closePopover();
      renderAll();
      toast(`Esimerkki ladattu — Ctrl+Z palauttaa omasi`);
    });
    menu.appendChild(b);
  }
  const note = document.createElement('div');
  note.className = 'mnote';
  note.textContent = 'Korvaa nykyisen suunnitelman — Ctrl+Z palauttaa.';
  menu.appendChild(note);
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = r.bottom + 8 + 'px';
  menu.style.left = Math.min(r.left, window.innerWidth - menu.offsetWidth - 10) + 'px';
  examplesMenuEl = menu;
}

document.addEventListener('pointerdown', (e) => {
  if (examplesMenuEl && !examplesMenuEl.contains(e.target) && !(e.target.closest && e.target.closest('.examples-trigger'))) closeExamplesMenu();
  if (moreMenuEl && !moreMenuEl.contains(e.target) && e.target.id !== 'moreBtn') closeMoreMenu();
  if (fsAddMenuEl && !fsAddMenuEl.contains(e.target) && e.target.id !== 'fsAddBtn') closeFsAddMenu();
  if (famAddMenuEl && !famAddMenuEl.contains(e.target) && !(e.target.closest && e.target.closest('[data-fam="add"]'))) closeFamAddMenu();
});

/* ===================== ⋯-valikko ===================== */
// Harvoin tarvittavat toiminnot yhdessä paikassa — yläpalkkiin jää vain
// päätoiminto. Valikko rakennetaan avattaessa, jotta tilat ovat tuoreet.

let moreMenuEl = null;

function closeMoreMenu() {
  if (moreMenuEl) { moreMenuEl.remove(); moreMenuEl = null; }
}

function openMoreMenu(anchor) {
  if (moreMenuEl) { closeMoreMenu(); return; }
  closeExamplesMenu();
  const menu = document.createElement('div');
  menu.className = 'menu';

  const add = (id, name, desc, fn, danger) => {
    const b = document.createElement('button');
    b.id = id;
    if (danger) b.classList.add('danger');
    b.innerHTML = `<div>${name}</div><div class="mdesc">${desc}</div>`;
    if (fn) b.addEventListener('click', () => { closeMoreMenu(); fn(); });
    menu.appendChild(b);
    return b;
  };

  add('mi-compare',
    baseline ? 'Vertailu päällä ✓' : 'Vertaile',
    baseline ? 'Poista vertailukohta' : 'Tallenna nykyinen suunnitelma haamukäyräksi',
    () => {
      if (baseline) { clearBaseline(); toast('Vertailu poistettu'); }
      else { setBaseline(); toast('Vertailukohta tallennettu — erot näkyvät, kun muutat suunnitelmaa'); }
    });
  add('mi-analytics', 'Tilastot', 'Miten muut suunnittelevat vaurastumista — avoin data',
    () => { location.href = 'analytiikka.html'; });
  add('mi-info', 'Tietoa palvelusta', 'Oletukset, tietosuoja ja vinkit',
    () => { $('infoModal').hidden = false; });
  add('mi-tour', 'Esittelykierros', 'Palvelun läpikäynti yhdeksällä klikkauksella',
    () => startTour());

  // Nollaus vaatii toisen klikkauksen — valikko pysyy auki vahvistusta varten
  const reset = add('mi-reset', 'Nollaa suunnitelma', 'Aloita puhtaalta pöydältä', null, true);
  reset.addEventListener('click', () => {
    if (reset.dataset.armed) {
      try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(BASELINE_KEY); localStorage.removeItem(FAMILY_KEY); localStorage.removeItem(SCEN_KEY); } catch (e) {}
      // Nollaaja ei ole ensivierailija: paluu dashboardille, ei piirtopöydälle
      try { sessionStorage.setItem('vp-reset', '1'); } catch (e) {}
      location.hash = '';
      location.reload();
      return;
    }
    reset.dataset.armed = '1';
    reset.classList.add('armed-item');
    reset.querySelector('div').textContent = 'Vahvista nollaus';
    setTimeout(() => {
      if (!reset.isConnected) return;
      delete reset.dataset.armed;
      reset.classList.remove('armed-item');
      reset.querySelector('div').textContent = 'Nollaa suunnitelma';
    }, 3000);
  });

  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = r.bottom + 8 + 'px';
  menu.style.left = Math.max(8, Math.min(r.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 10)) + 'px';
  moreMenuEl = menu;
}

/* ===================== Tallennus ja jakaminen ===================== */

const STORAGE_KEY = 'varallisuuspolku-v1';

function serialize() {
  const o = {
    ageNow: state.ageNow, ageEnd: state.ageEnd,
    startCapital: state.startCapital, monthly: state.monthly,
    savingsGrowth: state.savingsGrowth,
    allocStocks: state.allocStocks, allocBonds: state.allocBonds,
    glide: state.glide, real: state.real, tax: state.tax,
    events: state.events,
    // Inflaatio mukaan vain kun poikkeaa oletuksesta — vanhat linkit ennallaan
    ...(state.inflation !== 2 ? { inflation: state.inflation } : {}),
  };
  // Pro- ja apurikentät vain kun niitä on — vanhat linkit ennallaan
  if (state.proOn || state.pro) {
    o.proOn = !!state.proOn;
    if (state.pro) o.pro = state.pro;
  }
  if (state.income != null) o.income = state.income;
  if (state.expenses != null) o.expenses = state.expenses;
  // Porrastettu säästö vain kun asetettu — vanhat linkit ennallaan
  if (Array.isArray(state.savePhases) && state.savePhases.length) o.savePhases = state.savePhases;
  // Kuori- ja kulukentät vain kun poikkeavat oletuksesta — vanhat linkit ennallaan
  if (state.acct !== 'aot') o.acct = state.acct;
  if (state.feePct > 0) o.feePct = state.feePct;
  if (state.wrapFee > 0) o.wrapFee = state.wrapFee;
  if (state.divYield > 0) o.divYield = state.divYield;
  return o;
}

function applySaved(data) {
  if (!data || typeof data !== 'object') return false;
  for (const k of ['ageNow', 'ageEnd', 'startCapital', 'monthly', 'allocStocks', 'allocBonds']) {
    if (typeof data[k] === 'number' && isFinite(data[k])) state[k] = data[k];
  }
  state.glide = !!data.glide;
  state.real = !!data.real;
  state.inflation = typeof data.inflation === 'number' && isFinite(data.inflation) ? clamp(data.inflation, 0, 15) : 2;
  // Pro: raakadata talteen — proOf normalisoi ja kiristää rajat käytössä
  state.proOn = !!data.proOn;
  state.pro = data.pro && typeof data.pro === 'object' ? data.pro : null;
  state.income = typeof data.income === 'number' && isFinite(data.income) ? clamp(data.income, 0, 1e6) : null;
  state.expenses = typeof data.expenses === 'number' && isFinite(data.expenses) ? clamp(data.expenses, 0, 1e6) : null;
  // Uudet kentät: vanhat tallennukset/linkit eivät saa muuttua — jos kenttä
  // puuttuu, käytetään neutraalia arvoa (kasvu 0 %, ei veroa), ei uutta oletusta.
  state.savingsGrowth = typeof data.savingsGrowth === 'number' && isFinite(data.savingsGrowth)
    ? clamp(data.savingsGrowth, 0, 15) : 0;
  // Porrastettu säästö: validoi kaistat [{to, amount}], nouseva to-järjestys.
  // Puuttuva/viallinen → null = tasainen perussäästö (vanhat linkit ennallaan).
  if (Array.isArray(data.savePhases) && data.savePhases.length) {
    const numOk = (v) => typeof v === 'number' && isFinite(v);
    const ph = data.savePhases
      .filter((r) => r && numOk(r.to) && numOk(r.amount))
      .map((r) => ({ to: clamp(Math.round(r.to), 1, 105), amount: clamp(r.amount, 0, 1e6) }))
      .sort((a, b) => a.to - b.to)
      .slice(0, 8);
    state.savePhases = ph.length ? ph : null;
  } else state.savePhases = null;
  state.tax = !!data.tax;
  // Sijoitustili ja kulut: puuttuva kenttä = neutraali (AOT, 0 kulua)
  state.acct = data.acct === 'ost' || data.acct === 'ins' ? data.acct : 'aot';
  const fee = (v) => (typeof v === 'number' && isFinite(v) ? clamp(v, 0, 10) : 0);
  state.feePct = fee(data.feePct);
  state.wrapFee = fee(data.wrapFee);
  state.divYield = fee(data.divYield);
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
        // Työeläke: puuttuva = 0 (vanhat linkit ennallaan), ei uutta oletusta
        e.pension = numOk(e.pension) ? Math.max(0, e.pension) : 0;
        e.pensionAge = numOk(e.pensionAge) ? clamp(e.pensionAge, 0, 120) : 65;
      } else {
        if (!numOk(e.amount)) e.amount = EVENT_TYPES[e.type].amount || 0;
        if (e.financing !== 'loan') delete e.financing;
        for (const k of ['down', 'rate', 'years', 'appr']) if (e[k] != null && !numOk(e[k])) delete e[k];
        if (e.financing === 'loan') initLoanFields(e);
        // Toistuva erä: nolla tai viallinen arvo = ei toistoa
        if (e.recMonthly != null && (!numOk(e.recMonthly) || e.recMonthly === 0)) delete e.recMonthly;
        if (e.recMonthly != null) {
          e.recMonthly = clamp(e.recMonthly, -1e5, 1e5);
          e.recYears = numOk(e.recYears) ? clamp(e.recYears, 1, 60) : 10;
        } else delete e.recYears;
        // Myynti: vain omaisuuserälle ja oston jälkeen
        if (e.sellAge != null && (!numOk(e.sellAge) || !e.isAsset || e.sellAge <= e.age)) {
          delete e.sellAge; delete e.sellTaxFree;
        }
        if (e.sellAge != null) e.sellTaxFree = !!e.sellTaxFree; else delete e.sellTaxFree;
      }
      // Vanhat tallennukset: dieWithZero → tavoitetila. Oletusta (manual) ei
      // kirjata, jotta jakolinkin kierros säilyttää tilan täsmälleen samana.
      if (e.type === 'retirement') {
        if (e.goal == null && e.dieWithZero) e.goal = 'withdrawal';
        delete e.dieWithZero;
        if (e.goal != null && !['manual', 'withdrawal', 'age', 'saving'].includes(e.goal)) delete e.goal;
        if (e.conf != null && (!numOk(e.conf) || e.conf < 0.5 || e.conf >= 1)) delete e.conf;
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
  if (family) { reconcileTransfers(); saveActiveIntoFamily(); persistFamily(); }
  pushUndoDebounced();
}

// Ensivierailu ja jakolinkki avaavat piirtopöydän suoraan (lanseerausflow);
// palaava käyttäjä saa normaalinäkymän kuten ennen. Nollaus näyttää
// ensivierailulta (tallenne puuttuu) — sessionStorage-lippu erottaa sen,
// jotta paluu on dashboardille eikä piirtopöydälle.
let visitKind = 'returning'; // 'first' | 'shared' | 'returning'
let resetVisit = false;

function loadState() {
  try {
    if (location.hash.startsWith('#f=')) {
      const o = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(3)))));
      if (validFamily(o) && o.persons.length >= 2) {
        family = {
          persons: o.persons.map((p) => ({ pid: p.pid, name: String(p.name || 'Henkilö').slice(0, 16), role: p.role, child: !!p.child, data: p.data })),
          active: clamp(Math.round(o.active || 0), 0, o.persons.length - 1),
        };
        migrateFamily();
        if (applySaved(JSON.parse(JSON.stringify(family.persons[family.active].data)))) {
          history.replaceState(null, '', location.pathname);
          persistFamily();
          saveState();
          visitKind = 'shared';
          return;
        }
        family = null;
      }
    }
  } catch (e) { /* viallinen perhelinkki — ohitetaan */ }
  try {
    if (location.hash.startsWith('#s=')) {
      const json = decodeURIComponent(escape(atob(location.hash.slice(3))));
      if (applySaved(JSON.parse(json))) {
        history.replaceState(null, '', location.pathname);
        saveState();
        visitKind = 'shared';
        return;
      }
    }
  } catch (e) { /* viallinen linkki — ohitetaan */ }
  try {
    resetVisit = sessionStorage.getItem('vp-reset') === '1';
    if (resetVisit) sessionStorage.removeItem('vp-reset');
  } catch (e) {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applySaved(JSON.parse(raw));
    else visitKind = resetVisit ? 'returning' : 'first';
  } catch (e) { /* viallinen tallennus — ohitetaan */ }
}

function syncInputs() {
  $('ageNow').value = state.ageNow;
  $('ageEnd').value = state.ageEnd;
  $('startCapital').value = state.startCapital;
  $('monthly').value = state.monthly;
  $('savingsGrowth').value = state.savingsGrowth;
  $('allocStocks').value = state.allocStocks;
  $('allocBonds').value = state.allocBonds;
  $('glide').checked = state.glide;
  $('real').checked = state.real;
  $('inflation').value = state.inflation;
  $('inflationField').hidden = !state.real;
  $('tax').checked = state.tax;
  $('savIncome').value = state.income != null ? state.income : '';
  $('savExpenses').value = state.expenses != null ? state.expenses : '';
  $('feePct').value = state.feePct;
  $('wrapFee').value = state.wrapFee;
  $('divYield').value = state.divYield;
  updateAcctUI();
  updateSaverNote();
  syncSavePhaseUI(); // porrastus-editori seuraa tilaa (jakolinkki, undo, esimerkit)
  applyProUI(); // vipu, kortit ja body.pro seuraavat tilaa (myös undo/esimerkit)
}

/* --- Sijoitustili (kuori): valinta, tiivis selite ja vertailunappi --- */

const ACCT_NOTES = {
  aot: 'Nostoista vero voiton osuudesta · suorien osakkeiden osingoista vero vuosittain.',
  ost: 'Ei veroa tilillä · nostosta vero voiton osuudesta · talletuskatto 100 000 €',
  ins: 'Ei veroa kuoressa · nostosta vero voiton osuudesta · kuoren kulu vähentää tuottoa.',
};

function updateAcctUI() {
  const sel = $('acctSel');
  if (!sel) return;
  sel.value = state.acct;
  $('wrapFeeField').hidden = state.acct !== 'ins';
  let note = ACCT_NOTES[state.acct];
  if (state.acct === 'ost') {
    // Talletuskatto 100 000 €: karkea arvio ylitysvuodesta (talletukset, ei tuotto)
    const g = (state.savingsGrowth || 0) / 100;
    let cum = Math.max(0, state.startCapital), yr = null;
    for (let y = 0; y < state.ageEnd - state.ageNow && cum < 100000; y++) {
      cum += state.monthly * 12 * Math.pow(1 + g, y);
      if (cum >= 100000) yr = new Date().getFullYear() + y + 1;
    }
    if (cum >= 100000) note += yr ? ` · ylittyy ~${yr}` : ' · talletuksesi ylittävät katon';
    note += '.';
  }
  $('acctNote').textContent = note;
  $('acctCompareLink').hidden = state.acct === 'aot';
}

function bindAcct() {
  $('acctSel').addEventListener('change', (e) => {
    if (e.target.value === state.acct) return;
    state.acct = e.target.value;
    updateAcctUI();
    renderAll();
    announce(`Sijoitustili: ${e.target.options[e.target.selectedIndex].text}`);
  });
  $('acctCompareLink').addEventListener('click', (e) => {
    e.preventDefault();
    // Sama suunnitelma arvo-osuustilinä haamukäyräksi — kuoren hyöty/haitta
    // näkyy deltoina (kulut vs verottomat osingot)
    const b = JSON.parse(JSON.stringify(serialize()));
    b.acct = 'aot';
    delete b.wrapFee;
    b.cmpName = 'Arvo-osuustili'; // vertailupilleri nimeää katkoviivan
    baseline = b;
    ghostDirty = true;
    try { localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline)); } catch (err) {}
    updateCompareBtn();
    renderAll();
    toast('Vertailu päällä: sama suunnitelma arvo-osuustilinä haamukäyränä');
  });
}

// Perhelinkki käyttää omaa #f=-etuliitettä: vanha versio ei tunnista sitä
// eikä siten typistä perhesuunnitelmaa hiljaa omakseen (§9 versiovahti)
const makeShareUrl = () => {
  if (familyOn()) {
    saveActiveIntoFamily();
    return location.origin + location.pathname + '#f=' + btoa(unescape(encodeURIComponent(JSON.stringify(family))));
  }
  return location.origin + location.pathname + '#s=' + btoa(unescape(encodeURIComponent(JSON.stringify(serialize()))));
};

async function copyShareUrl(btn) {
  const url = makeShareUrl();
  track('Jakolinkki luotu', { tyyppi: familyOn() ? 'perhe' : 'oma' });
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
  $('summaryBtn').addEventListener('click', openSummary);
  $('sumClose').addEventListener('click', closeSummary);
  $('sumPrint').addEventListener('click', () => window.print());
  $('sumShare').addEventListener('click', (e) => copyShareUrl(e.target));
  $('moreBtn').addEventListener('click', () => openMoreMenu($('moreBtn')));
  $('infoClose').addEventListener('click', () => { $('infoModal').hidden = true; });
  $('disclaimerInfo').addEventListener('click', (e) => { e.preventDefault(); $('infoModal').hidden = false; });

  // Esimerkkisuunnitelmat: avautuu aloitusvinkistä ja tapahtumakortin linkistä
  for (const trigger of document.querySelectorAll('.examples-trigger')) {
    trigger.addEventListener('click', (e) => { e.preventDefault(); openExamplesMenu(trigger); });
  }

  // Vuositaulukko
  $('tableBtn').addEventListener('click', () => { renderYearTable(); $('tableModal').hidden = false; });
  $('tableClose').addEventListener('click', () => { $('tableModal').hidden = true; });
  $('tableCsv').addEventListener('click', downloadCsv);

  // Anonyymi vertailudata
  $('donateSend').addEventListener('click', sendDonation);
  $('donateCancel').addEventListener('click', () => { $('donateModal').hidden = true; });
  $('donateNever').addEventListener('click', () => {
    setDonateState({ declined: true });
    $('donateModal').hidden = true;
    renderDonateSlot();
    toast('Selvä — ei kysytä uudestaan. Valinnan voi muuttaa Tietoa-sivulta.');
  });
  $('compareClose').addEventListener('click', () => { $('compareModal').hidden = true; });
  // Tietoa-sivun valinnan nollaus
  const dr = $('donateReset');
  if (dr) dr.addEventListener('click', (e) => {
    e.preventDefault();
    setDonateState({ declined: false });
    toast('Valinta nollattu — kysymys näytetään taas Suunnitelmani-sivulla.');
  });

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
    const grow = state.savingsGrowth > 0 ? `, kasvatan säästöä ${state.savingsGrowth.toLocaleString('fi-FI')} %/v` : '';
    pts.push({ html: `Sijoitan <b>${fmtEur(state.monthly)}/kk</b>${s.retireAge != null ? ' eläkkeelle jäämiseen asti' : ' koko suunnitelman ajan'}${grow} (alkupääoma ${fmtEur(state.startCapital)}).` });
  }

  const a = baseAlloc(state);
  const { mu } = portfolioStats(a);
  pts.push({ html: `Riskiprofiilini: <b>${Math.round(a.s * 100)} % osakkeita</b>, ${Math.round(a.b * 100)} % korkoja, ${Math.round(a.c * 100)} % käteistä — tuotto-oletus ${pctFmt(mu)}/v${state.glide ? '; riskiä vähennetään eläkettä lähestyttäessä' : ''}.` });

  for (const e of [...state.events].sort((x, y) => x.age - y.age)) {
    if (e.type === 'retirement') continue;
    const age = `<b>${Math.round(e.age)} v</b> (${yearOf(e.age)})`;
    const nm = escapeHtml(evLabel(e));
    if (e.type === 'goal') {
      pts.push({ html: `Tavoitteeni: <b>${fmtEur(e.amount)}</b> varallisuutta iässä ${age}.` });
      continue;
    }
    if (e.amount < 0 && e.financing === 'loan') {
      const price = -e.amount;
      const down = clamp(e.down || 0, 0, price);
      const pmt = loanPayment(price - down, e.rate || 0, e.years || 10);
      pts.push({ html: `Ikään ${age} mennessä: käsiraha <b>${fmtEur(down)}</b> — ${nm} ${fmtEur(price)}; lainanhoito ${fmtEur(pmt)}/kk ${Math.round(e.years || 10)} v ajan.` });
    } else if (e.amount < 0) {
      pts.push({ html: `Iässä ${age}: ${nm} <b>${fmtEur(-e.amount)}</b> — irrotetaan sijoituksista.` });
    } else if (e.amount > 0) {
      pts.push({ html: `Iässä ${age}: ${nm} <b>+${fmtEur(e.amount)}</b> — sijoitetaan salkkuun.` });
    } else if (e.recMonthly) {
      pts.push({ html: `Iästä ${age} alkaen: ${nm} <b>${e.recMonthly > 0 ? '+' : ''}${fmtEur(e.recMonthly)}/kk</b> ${Math.round(e.recYears || 0)} vuoden ajan.` });
    }
    if (e.recMonthly && e.amount) {
      pts.push({ html: `${nm} lisäksi <b>${e.recMonthly > 0 ? '+' : ''}${fmtEur(e.recMonthly)}/kk</b> ${Math.round(e.recYears || 0)} vuoden ajan.` });
    }
    const si = e.sellAge != null && (s.saleInfos || []).find((x) => x.id === e.id);
    if (si) {
      pts.push({ html: `Iässä <b>${Math.round(si.age)} v</b> (${yearOf(si.age)}) myyn: ${nm} ~<b>${fmtEur(si.value)}</b>` +
        `${si.payoff > 0.5 ? `, lainaa pois ${fmtEur(si.payoff)}` : ''}${si.tax > 0.5 ? `, vero ${fmtEur(si.tax)}` : ''} — sijoituksiin ${fmtEur(si.value - si.payoff - si.tax)}.` });
    }
  }

  if (s.retireAge != null) {
    const wd = `<b>${fmtEur(s.withdrawal)}/kk</b>`;
    const ageStr = `<b>${s.goal === 'age' && s.solvedRetireAge != null ? fmtAge(s.solvedRetireAge) : Math.round(s.retireAge) + ' v'}</b> (${yearOf(s.retireAge)})`;
    const confSuffix = s.conf ? ` — mitoitettu ${Math.round(s.conf * 100)} % onnistumisvarmuudelle` : '';
    if (s.goal === 'withdrawal') pts.push({ html: `Jään eläkkeelle iässä ${ageStr} ja käytän sijoitusvarat tasaisesti loppuun — kestävä kuukausitulo ${wd}${confSuffix}.` });
    else if (s.goal === 'age') pts.push({ html: `Jään eläkkeelle heti kun kuukausituloni ${wd} on kestävä — laskennallisesti iässä ${ageStr}${confSuffix}.` });
    else pts.push({ html: `Jään eläkkeelle iässä ${ageStr}, tavoitteena ${wd} kuukausitulo${confSuffix}.` });
    if (s.pension > 0) {
      const draw = Math.max(0, s.withdrawal - s.pension);
      pts.push({ html: `Lakisääteinen työeläkkeeni on <b>${fmtEur(s.pension)}/kk</b> (alk. ${Math.round(s.pensionAge)} v) — sijoituksista nostan noin <b>${fmtEur(draw)}/kk</b>${state.tax ? ' (+ myyntivoittovero)' : ''}.` });
    }
    if (state.tax && s.taxPaid > 0.5) {
      pts.push({ html: `Varaudun eläkeaikana yhteensä noin <b>${fmtEur(s.taxPaid)}</b> myyntivoittoveroon (30/34&nbsp;% nostojen voitto-osuudesta).` });
    }
  }
  return pts;
}

function summaryTalks(s) {
  const talks = [];
  const p = Math.round((s.successProb || 0) * 100);
  if (s.goalUnreachable) {
    const confNote = s.conf ? ` ${Math.round(s.conf * 100)} % varmuustavoitteella` : '';
    talks.push({ warn: true, html: s.goal === 'age'
      ? `Eläkeikätavoitteeni ei toteudu nykyisillä oletuksilla${confNote} — tulotavoite ei onnistu edes suunnitelman lopussa.`
      : s.goal === 'withdrawal'
        ? `Kestävää kuukausituloa ei löydy${confNote} — suunnitelma kaipaa lisää säästöä tai myöhemmän eläkeiän.`
        : `Säästötavoitteeni ei toteudu nykyisillä oletuksilla${confNote} — tulotavoite on liian suuri.` });
  }
  if (s.requiredMonthly != null && s.requiredMonthly > state.monthly) {
    talks.push({ warn: true, html: `Säästökykyni ja tavoitteeni välillä on <b>${fmtEur(s.requiredMonthly - state.monthly)}/kk</b> ero — miten se katetaan?` });
  }
  if (s.depletionAge != null && s.depletionAge < s.a1 - 1) {
    talks.push({ warn: true, html: `Laskelmassa varani ehtyvät noin <b>${Math.round(s.depletionAge)} v</b> iässä — miten loppuvuodet katetaan?` });
  }
  if (s.successProb != null && p < 65) {
    talks.push({ html: `Onnistumistodennäköisyys on <b>${p} %</b> — haluan keskustella keinoista: suurempi säästö, maltillisempi nosto tai myöhäisempi eläköityminen.` });
  }
  if (!state.events.some((e) => e.type === 'retirement')) {
    talks.push({ html: 'Suunnitelmastani puuttuu vielä eläketavoite — haluan hahmottaa, milloin ja millaisella kuukausitulolla voisin jäädä eläkkeelle.' });
  }
  if (!talks.length) {
    talks.push({ html: `Suunnitelmani on laskennallisesti kestävä loppuun asti (onnistumistodennäköisyys <b>${p} %</b>) — haluan varmistaa, että toteutus vastaa sitä.` });
  }
  return talks;
}

function renderSummary() {
  const s = simulate(state, { goals: simGoals() });
  const yearNow = new Date().getFullYear();
  const yearOf = (age) => `~${yearNow + Math.round(age - state.ageNow)}`;
  const retire = state.events.find((e) => e.type === 'retirement') || null;
  const p = s.successProb != null ? Math.round(s.successProb * 100) : null;

  const tiles = [
    { k: 'Nykyinen varallisuus', v: fmtEur(state.startCapital) },
    { k: 'Kuukausisäästö', v: `${fmtEur(state.monthly)}/kk`, s: state.savingsGrowth > 0 ? `kasvu ${state.savingsGrowth.toLocaleString('fi-FI')} %/v` : '' },
    { k: s.goal === 'age' ? 'Aikaisin eläkeikä' : 'Eläkeikä',
      v: s.retireAge != null ? (s.goal === 'age' && s.solvedRetireAge != null ? fmtAge(s.solvedRetireAge) : `${Math.round(s.retireAge)} v`) : '—',
      s: s.retireAge != null ? yearOf(s.retireAge) : 'ei eläketapahtumaa' },
    { k: 'Kuukausitulo eläkkeellä', v: retire ? `${fmtEur(s.withdrawal)}/kk` : '—',
      s: retire ? (s.pension > 0 ? `sis. työeläke ${fmtEur(s.pension)}/kk` : (s.goal === 'withdrawal' ? 'kestävä tulo — varat loppuun' : 'sijoituksista')) : '' },
    { k: 'Varallisuus eläkkeellä', v: s.wAtRet != null ? fmtEur(s.wAtRet) : '—', cls: 'accent' },
    { k: 'Onnistumistodennäköisyys', v: p != null ? `${p} %` : '—', cls: p >= 80 ? 'ok' : p >= 55 ? '' : 'bad', s: `${(s.mcPaths || MC_LIVE).toLocaleString('fi-FI')} markkinapolkua` },
  ];

  const evRows = [...state.events].sort((x, y) => x.age - y.age).map((e) => {
    const def = EVENT_TYPES[e.type];
    let sum, fin = '', note = '';
    if (e.type === 'retirement') {
      sum = `−${fmtEur(s.goal === 'withdrawal' && s.solvedWithdrawal != null ? s.solvedWithdrawal : e.withdrawal)}/kk`;
      fin = { manual: 'kuukausitulon tarve', withdrawal: 'kestävä tulo — varat loppuun', age: 'aikaisin mahdollinen ikä', saving: 'säästötavoite' }[retGoal(e)];
      if (e.pension > 0) note = `työeläke ${fmtEur(e.pension)}/kk alk. ${Math.round(e.pensionAge != null ? e.pensionAge : 65)} v`;
    } else if (e.type === 'goal') {
      sum = fmtEur(e.amount);
      fin = 'tavoitepiste';
      note = 'mittari — ei kassavirtaa';
    } else if (e.amount < 0 && e.financing === 'loan') {
      const price = -e.amount;
      const down = clamp(e.down || 0, 0, price);
      const pmt = loanPayment(price - down, e.rate || 0, e.years || 10);
      sum = fmtEur(e.amount);
      fin = `laina: käsiraha ${fmtEur(down)}, erä ${fmtEur(pmt)}/kk · ${Math.round(e.years || 10)} v · ${(e.rate || 0).toLocaleString('fi-FI')} %`;
    } else {
      sum = (e.amount >= 0 ? '+' : '') + fmtEur(e.amount);
      fin = e.amount < 0 ? 'säästöistä' : 'tulo';
    }
    if (e.isAsset) note = `omaisuuseräksi, arvonmuutos ${(e.appr || 0).toLocaleString('fi-FI')} %/v`;
    if (e.type !== 'retirement' && e.recMonthly) note += `${note ? '; ' : ''}toistuva ${e.recMonthly > 0 ? '+' : ''}${fmtEur(e.recMonthly)}/kk ${Math.round(e.recYears || 0)} v`;
    if (e.sellAge != null && e.isAsset) note += `${note ? '; ' : ''}myynti ${Math.round(e.sellAge)} v iässä${e.sellTaxFree ? ' (verovapaa)' : ''}`;
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
    `<div class="table-scroll"><table class="sum-table"><thead><tr><th>Tapahtuma</th><th>Ajankohta</th><th>Summa</th><th>Rahoitus</th><th>Huom.</th></tr></thead><tbody>${evRows}</tbody></table></div>` +
    `<h2>Keskusteltavaa esim. varainhoitajan kanssa</h2>` +
    `<ul class="sum-points">${summaryTalks(s).map(li).join('')}</ul>` +
    (familyOn() ? familySummaryHtml() : '') +
    (state.proOn ? proSummaryHtml(s) : '') +
    `<p class="sum-assump">Oletukset: osakkeet 7 %, korot 3 %, käteinen 1,5 % vuodessa${state.savingsGrowth > 0 ? `; säästön kasvu ${state.savingsGrowth.toLocaleString('fi-FI')} %/v` : ''}${state.real ? `; inflaatio ${state.inflation.toLocaleString('fi-FI')} %/v, luvut nykyrahassa` : ''}${state.glide ? '; ikäsidonnainen allokaatio' : ''}${s.pension > 0 ? '; lakisääteinen työeläke huomioitu eläketulona' : ''}${state.tax ? '; myyntivoittovero 30/34 % nostojen voitto-osuudesta' : ''}${state.acct === 'ost' ? '; osakesäästötili (osingot ja myynnit tilillä verotta, nostosta vero voitto-osuudesta)' : state.acct === 'ins' ? `; vakuutuskuori (tuotot kuoressa verotta, nostosta vero voitto-osuudesta${state.wrapFee > 0 ? `, kuoren kulu ${state.wrapFee.toLocaleString('fi-FI')} %/v` : ''})` : ''}${state.feePct > 0 ? `; sijoituskulut ${state.feePct.toLocaleString('fi-FI')} %/v` : ''}${state.acct === 'aot' && state.tax && state.divYield > 0 ? `; suorien osakkeiden osinkotuotto ${state.divYield.toLocaleString('fi-FI')} %/v verotettuna vuosittain` : ''}${(s.saleInfos || []).some((x) => x.tax > 0.5) ? '; omaisuuden myynnissä hankintameno-olettama' : ''}. ` +
    `Lainat annuiteettilainoina. Onnistumistodennäköisyys perustuu ${(s.mcPaths || MC_LIVE).toLocaleString('fi-FI')} satunnaiseen markkinapolkuun${s.conf ? `; tavoitteet mitoitettu ${Math.round(s.conf * 100)} % onnistumisvarmuudelle` : ''}. Laadittu Varallisuuspolku-työkalulla.</p>` +
    `<p class="sum-disclaimer">Tämä yhteenveto kuvaa laatijansa omia tavoitteita, valintoja ja oletuksia. Se ei ole sijoitusneuvontaa eikä sijoitussuositus — sen voi antaa esimerkiksi varainhoitajalle keskustelun pohjaksi.</p>`;
}

function openSummary() {
  trackOnce('Suunnitelmani avattu');
  renderSummary();
  renderDonateSlot();
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
    const defCollapsed = key === 'dist' || key === 'about'; // passiiviset osiot kiinni (sisältö silti DOMissa hakukoneille)
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
  updateAcctUI(); // OST-katon arvio elää säästön/pääoman mukana
  renderChart();
  renderStats();
  renderEventList();
  renderDist();
  if (state.proOn) scheduleProAna();
  saveState();
}

buildPalette();
initMcWorker();
loadFamily();
loadState();
loadBaseline();
syncInputs();
bindInputs();
bindActions();
bindDraw();
bindPanelCards();
bindTour();
bindPro();
bindFamily();
bindSaver();
bindAcct();
bindCmpPill();
loadScenarios();
renderFamilyChips();
renderAll();
pushUndoNow(); // lähtötila kumoamishistorian pohjaksi

// Suora linkki yhteenvetoon (esim. analytiikkasivun kehotteesta)
if (location.hash === '#yhteenveto') {
  history.replaceState(null, '', location.pathname);
  openSummary();
}

// Ensivierailu avaa piirtopöydän esimerkkisuunnitelmalla (pulssivihje ohjaa
// tarttumaan), jakolinkki linkin suunnitelmalla — Esc paljastaa koko sivun.
// SEO ei kärsi: piirtotila on CSS-kerros, sisältö pysyy DOMissa.
// Laskeutuminen aina kojelaudalle; opastus käynnistyy automaattisesti,
// kunnes käyttäjällä on oma tallennettu suunnitelma TAI kierros on
// kertaalleen nähty (E4 15.7.2026 — palaajat ovat todennäköisimmät
// suunnitelman loppuunviejät, eikä heitä pysäytetä joka käynnillä).
// Uusinta aina ☰-valikosta. Suora #yhteenveto-linkki saa dokumentin
// ilman kierrosta. Testit ja generaattorit hiljentävät automaatin
// avaimella vp-autotour-off.
if (resetVisit) toast('Aloitettu puhtaalta pöydältä — täytä Perustiedot tai avaa piirtopöytä ⛶');

/* ===================== Aloitusramppi ===================== */
// Ensivierailun kolme kysymystä: oma käyrä ja otsikkovastaus ennen työtilaa —
// ensimmäinen käyrä on käyttäjän oma, ei esimerkkielämä. Deterministinen ja
// ilmainen (ei AI:ta; sanelukerros tulee myöhemmin samaan ramppiin).
// Eheys kierroksen kanssa: ensivierailija saa rampin AUTOKIERROKSEN SIJAAN;
// ohitus vie vanhalle polulle (esimerkkisuunnitelma + kierros); tulosnäkymä
// tarjoaa kierroksen napista. Jakolinkki (shared) ja palaavat: ennallaan.
// Testihiljennys: sama vp-autotour-off kuin kierroksella.

const RAMP_KEY = 'vp-ramp-done';
const rampMark = () => { try { localStorage.setItem(RAMP_KEY, '1'); } catch (e) {} };

function rampEsc(e) { if (e.key === 'Escape') { e.stopPropagation(); rampSkip(); } }

function closeRamp() {
  $('ramp').hidden = true;
  document.removeEventListener('keydown', rampEsc, true);
}

function rampSkip() {
  rampMark();
  closeRamp();
  track('Ramppi ohitettu');
  startTour(); // vanha ensivierailupolku: esimerkkisuunnitelma + kierros
}

function showRamp() {
  $('ramp').hidden = false;
  document.addEventListener('keydown', rampEsc, true);
  track('Ramppi näytetty');
  setTimeout(() => { try { $('rampAge').focus(); } catch (e) {} }, 50);
}

function rampSubmit() {
  const age = Math.round(parseFloat($('rampAge').value));
  if (!isFinite(age) || age < 16 || age > 80) { $('rampErr').hidden = false; $('rampAge').focus(); return; }
  const wealth = clamp(parseFloat($('rampWealth').value) || 0, 0, 1e9);
  const monthly = clamp(parseFloat($('rampMonthly').value) || 0, 0, 1e6);
  const retA = Math.max(65, age + 1);
  state.ageNow = age;
  state.ageEnd = Math.max(90, retA + 10);
  state.startCapital = wealth;
  state.monthly = monthly;
  // Vain eläketapahtuma — esimerkkielämä (asunto, auto) ei ole käyttäjän elämä.
  // goal 'withdrawal': moottori mitoittaa kestävän kuukausitulon → rehellinen
  // otsikkovastaus ilman keksittyjä oletuksia. Työeläke 0: lisätään itse.
  state.events = [{ id: idSeq++, type: 'retirement', age: retA, withdrawal: 2400, pension: 0, pensionAge: retA, goal: 'withdrawal' }];
  syncInputs();
  renderAll();
  rampMark();
  track('Ramppi valmis');
  rampResult(retA);
}

// Veto-löydettävyys: raahaus on palvelun ydinele, mutta analytiikan mukaan
// harva löytää sen itse. Rampin jälkeen ensimmäisellä työtilakerralla
// eläkemerkki sykkii hetken ja saa ohimenevän vihjeen. Kerran ikinä;
// ensimmäinen kosketus tai 8 s piilottaa. Reduced-motion: ei sykettä,
// vihjeteksti näkyy silti (yleissääntö nollaa animaatiot).
const VETO_HINT_KEY = 'vp-veto-vihje';
function showVetoHint() {
  try {
    if (localStorage.getItem(VETO_HINT_KEY) === '1') return;
    localStorage.setItem(VETO_HINT_KEY, '1');
  } catch (e) {}
  const ret = state.events.find((e) => e.type === 'retirement');
  if (!ret) return;
  if (!document.querySelector(`#chart .marker[data-id="${ret.id}"]`)) return;
  const tip = document.createElement('div');
  tip.className = 'veto-hint';
  tip.textContent = 'Tartu merkkiin ja vedä — luvut päivittyvät heti';
  wrap.appendChild(tip);
  let alive = true;
  // Seuraa merkkiä joka ruudunpäivityksellä: MC-workerin valmistuminen
  // piirtää graafin (ja merkin) uusiksi hetkeä myöhemmin — kiinteä sijainti
  // jäisi väärään kohtaan ja pyyhitty sykeluokka palautetaan samalla.
  const place = () => {
    if (!alive) return;
    const g = document.querySelector(`#chart .marker[data-id="${ret.id}"]`);
    if (g) {
      g.classList.add('veto-pulse');
      const wr = wrap.getBoundingClientRect();
      const mr = g.getBoundingClientRect();
      // pysy piirtoalueen sisällä: vaakaklampit + ylälaidassa vihje merkin alle
      const cx = clamp(mr.left - wr.left + mr.width / 2, 115, Math.max(115, wr.width - 115));
      const above = mr.top - wr.top - 8;
      tip.classList.toggle('below', above < 34);
      tip.style.top = Math.round(above < 34 ? mr.bottom - wr.top + 8 : above) + 'px';
      tip.style.left = Math.round(cx) + 'px';
    }
    requestAnimationFrame(place);
  };
  place();
  const off = () => {
    alive = false;
    tip.remove();
    const g = document.querySelector(`#chart .marker[data-id="${ret.id}"]`);
    if (g) g.classList.remove('veto-pulse');
    document.removeEventListener('pointerdown', off, true);
  };
  document.addEventListener('pointerdown', off, true);
  setTimeout(off, 8000);
}

function rampResult(retA) {
  const s = sim;
  const wd = s && s.solvedWithdrawal != null ? Math.round(s.solvedWithdrawal) : null;
  const wr = s && s.wAtRet != null ? Math.round(s.wAtRet) : null;
  $('rampCard').innerHTML =
    `<h1 class="ramp-title">Polkusi on piirretty</h1>` +
    `<div class="ramp-res">` +
    `<div class="ramp-stat"><div class="k">Sijoituksesi ${retA} vuoden iässä</div><div class="v">${wr != null ? fmtEur(wr) : '–'}</div><div class="s">odotetulla kehityksellä</div></div>` +
    `<div class="ramp-stat"><div class="k">Kestävä kuukausitulo eläkkeellä</div><div class="v">${wd != null ? fmtEur(wd) + '/kk' : '–'}</div><div class="s">sijoituksistasi ${retA} v alkaen — ilman työeläkettä</div></div>` +
    `</div>` +
    `<p class="ramp-note">Tarkenna kuvaa työtilassa: lisää työeläkkeesi ja elämäsi isot hankinnat, ja kokeile eläkeikää vetämällä käyrästä.</p>` +
    `<div class="ramp-acts2">` +
    `<button class="btn" id="rampOpen">Avaa suunnitelmani</button>` +
    `<button class="btn ghost" id="rampTour">Esittelykierros</button>` +
    `</div>`;
  $('rampOpen').addEventListener('click', () => { closeRamp(); showVetoHint(); toast('Vinkki: Esittelykierros löytyy ☰-valikosta'); });
  $('rampTour').addEventListener('click', () => { closeRamp(); startTour(); });
}

$('rampGo').addEventListener('click', rampSubmit);
$('rampSkip').addEventListener('click', (e) => { e.preventDefault(); rampSkip(); });
for (const id of ['rampAge', 'rampWealth', 'rampMonthly']) {
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rampSubmit(); } });
}

let autoTourOff = false;
let tourSeen = false;
let rampSeen = false;
try {
  autoTourOff = localStorage.getItem('vp-autotour-off') === '1';
  tourSeen = localStorage.getItem(TOUR_KEY) === '1';
  rampSeen = localStorage.getItem(RAMP_KEY) === '1';
} catch (e) {}
if (!autoTourOff && visitKind === 'first' && !rampSeen && $('summary').hidden) {
  setTimeout(() => { if (!fsOn && tourStep < 0 && $('summary').hidden) showRamp(); }, 600);
} else if (!autoTourOff && !tourSeen && visitKind !== 'returning' && $('summary').hidden) {
  setTimeout(() => { if (!fsOn && tourStep < 0 && $('summary').hidden) startTour(); }, 600);
}

// Koon muutos vaatii vain geometrian uusiksi — sim ei riipu koosta.
// (Täysi render tässä loisi silmukan: workerin tulos muuttaa tunnuslukujen
// rivitystä → korkeus värähtää → täysi render pyyhkisi tuloksen ja tilaisi uuden.)
new ResizeObserver(() => { if (sim) renderChart(true); }).observe(wrap);

// Offline-tuki: service worker välimuistittaa sovelluksen (verkko ensin,
// välimuisti varalla) — asennettuna PWA toimii ilman verkkoyhteyttä
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* ei estä käyttöä */ });
}
