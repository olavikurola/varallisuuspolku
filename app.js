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
  cottage:     { icon: '🏡', label: 'Mökki / vene',        amount: -120000, loan: { share: 0.25, rate: 4.0, years: 15 }, defaultFin: 'loan', asset: { appr: 2.0 } },
  inheritance: { icon: '💎', label: 'Perintö / lahja',     amount: 60000 },
  bonus:       { icon: '💰', label: 'Bonus / myyntivoitto', amount: 20000 },
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
  allocStocks: 70,
  allocBonds: 20,
  glide: false,
  real: false,
  tax: true,          // myyntivoittovero nostoissa (oletuksena päällä uusille)
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

/* ===================== Anonyymi datalahjoitus: paketti ===================== */
// Lahjoituspaketti rakennetaan alusta tiukalla whitelistillä — tapahtumien
// omat nimet tai muut henkilökohtaiset kentät eivät voi päätyä mukaan.
// Summat pyöristetään kahteen merkitsevään numeroon.

const DATA_API = 'https://varallisuuspolku-data.up.railway.app';

function buildDonationPayload(st, s) {
  const events = [];
  for (const e of [...st.events].sort((a, b) => a.age - b.age)) {
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
  if (s) {
    payload.derived = { wEnd: round2sig(Math.max(0, s.wEnd)) };
    if (s.wAtRet != null) payload.derived.wAtRet = round2sig(Math.max(0, s.wAtRet));
    if (s.successProb != null) payload.derived.successProb = Math.round(s.successProb * 100) / 100;
    if (s.retireAge != null) payload.derived.retireAge = Math.round(s.retireAge * 10) / 10;
    if (s.taxPaid > 0) payload.derived.taxPaid = round2sig(s.taxPaid);
  }
  return payload;
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
    if (!d.ok || d.task !== 'mc') return;
    if (d.kind === 'ghost') {
      if (ghostSim && d.months === ghostSim.months) {
        ghostMc = d;
        updateHud();
      }
      return;
    }
    // Vanhentunut vastaus (tila ehti muuttua) hylätään
    if (d.seq !== mcSeq || !sim || d.months !== sim.months) return;
    sim.successProb = d.successProb;
    sim.successStale = false;
    sim.opt = d.p90;
    sim.pess = d.p10;
    sim.goalShares = d.goalShares;
    sim.mcPaths = d.paths;
    lastFullSim = sim;
    renderChart(true);
    renderStats();
    updateHud();
  });
}

function requestMcRefresh() {
  if (!mcWorker || !sim) return;
  clearTimeout(mcTimer);
  const snapshot = serialize();
  const wd = sim.withdrawal, ra = sim.retireAge;
  mcTimer = setTimeout(() => {
    mcSeq++;
    mcWorker.postMessage({
      task: 'mc', kind: 'cur', seq: mcSeq, st: snapshot,
      paths: MC_FULL, withdrawal: wd, retireAge: ra, goals: simGoals(),
    });
    if (baseline && ghostSim && !ghostMc) {
      mcWorker.postMessage({
        task: 'mc', kind: 'ghost', seq: mcSeq, st: JSON.parse(JSON.stringify(baseline)),
        paths: MC_FULL, withdrawal: ghostSim.withdrawal, retireAge: ghostSim.retireAge,
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
let scaleX = null, scaleY = null, invX = null;
let plot = { l: 64, r: 26, t: 20, b: 48, w: 0, h: 0, W: 0, H: 0 };
let openPopoverId = null;
let draggingId = null;
let hoverLine = null, hoverDot = null, balHoverLine = null;
// Skenaariovertailu: tallennettu suunnitelma haamukäyräksi (irrallinen syväkopio)
let baseline = null;
let ghostSim = null;
let ghostDirty = true;  // haamu lasketaan vain kun vertailukohta vaihtuu
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
  const yMax = Math.max(10000, Math.max(...sim.opt, ...sim.invested, ...(ghostSim ? ghostSim.exp : []))) * 1.08;

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

  /* ehtymisvyöhykkeet: sijoitukset nollissa */
  for (const z of sim.dryZones || []) {
    const x0 = scaleX(Math.max(z.from, a0)), x1 = scaleX(Math.min(z.to, a1));
    if (x1 - x0 < 1) continue;
    el('rect', { x: x0, y: plot.t, width: x1 - x0, height: plot.h, fill: 'rgba(248,113,113,0.06)' }, svg);
    if (x1 - x0 > 90) {
      const tt = el('text', { x: (x0 + x1) / 2, y: plot.t + 16, 'text-anchor': 'middle', class: 'dry-label' }, svg);
      tt.textContent = '⚠ varat ehtyneet';
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

  const alloc = allocationAt(age, retireAge, state);
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
        const defAge = type === 'retirement' ? 65 : state.ageNow + 5;
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
        const defAge = type === 'retirement' ? 65 : state.ageNow + 5;
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
      ev.withdrawal = def.withdrawal;
      ev.pension = def.pension != null ? def.pension : 0;
      ev.pensionAge = def.pensionAge != null ? def.pensionAge : 65;
    } else {
      ev.amount = def.amount;
      ev.financing = def.defaultFin || 'cash';
      if (ev.financing === 'loan') initLoanFields(ev);
      if (def.asset) { ev.isAsset = true; ev.appr = def.asset.appr; }
      if (def.rec) { ev.recMonthly = def.rec.monthly; ev.recYears = def.rec.years; }
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
  dismissOnboard(); // käyttäjä on jo vauhdissa — vinkki pois
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
          [[null, 'Odotettu'], [0.75, '75 %'], [0.85, '85 %'], [0.95, '95 %']]
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
  closePopover();
  closeSummary();
  $('infoModal').hidden = true;
  $('tableModal').hidden = true;
  $('donateModal').hidden = true;
  $('compareModal').hidden = true;
  closeExamplesMenu();
  closeMoreMenu();
});

/* ===================== Tunnusluvut ===================== */

function renderStats() {
  const s = sim || simulate(state);
  const cards = [];

  cards.push({
    k: 'Varallisuus eläkkeellä',
    v: s.wAtRet != null ? fmtEur(s.wAtRet) : '–',
    cls: 'accent',
    s: s.retireAge != null ? `${Math.round(s.retireAge)} v iässä` : 'ei eläketapahtumaa',
  });
  // Loppuvarallisuus yhtenä korttina: netto kun taseessa on omaisuutta tai
  // velkaa (sijoitukset alarivillä), muuten pelkät sijoitukset
  if (s.hasNet) {
    cards.push({
      k: `Netto ${Math.round(s.a1)} v iässä`,
      v: fmtEur(s.net[s.months]),
      cls: 'net',
      s: `sis. sijoitukset ${fmtCompact(s.wEnd)} · ${state.real ? 'nykyrahassa' : 'nimellisarvoin'}`,
    });
  } else {
    cards.push({
      k: `Sijoitukset ${Math.round(s.a1)} v iässä`,
      v: fmtEur(s.wEnd),
      cls: '',
      s: state.real ? 'nykyrahassa' : 'nimellisarvoin',
    });
  }
  cards.push({
    k: 'Sijoitettu yhteensä',
    v: fmtEur(s.deposits),
    cls: '',
    s: `${fmtEur(state.monthly)}/kk${state.savingsGrowth > 0 ? ` (+${state.savingsGrowth.toLocaleString('fi-FI')} %/v)` : ''} + alkupääoma`,
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
  if (s.goal === 'withdrawal' && s.goalUnreachable) {
    cards.push({ k: 'Kestävä kuukausitulo', v: 'Ei toteudu', cls: 'bad', s: `edes 0 €/kk ei riitä ${confTxt || ''}`.trim() });
  } else if (s.solvedWithdrawal != null && (s.depletionAge == null || s.depletionAge >= s.a1 - 1)) {
    cards.push({ k: 'Kestävä kuukausitulo', v: `${fmtEur(s.solvedWithdrawal)}/kk`, cls: 'accent',
      s: [s.pension > 0 ? `sis. työeläke ${fmtEur(s.pension)}/kk` : null, confTxt || pTxt].filter(Boolean).join(' · ') || `varat loppuun ${Math.round(s.a1)} v mennessä` });
  } else if (s.depletionAge != null) {
    cards.push({ k: 'Riittävyys', v: `Ehtyy ~${Math.round(s.depletionAge)} v`, cls: 'bad',
      s: [pTxt, 'kokeile lisätä säästöä'].filter(Boolean).join(' · ') });
  } else {
    cards.push({ k: 'Riittävyys', v: 'Varat riittävät ✓', cls: 'ok',
      s: [`${Math.round(s.a1)} v ikään asti`, pTxt].filter(Boolean).join(' · ') });
  }

  if (s.taxPaid > 0.5) {
    cards.push({ k: 'Myyntivoittovero', v: fmtEur(s.taxPaid), cls: '', s: 'arvio nostoista ja myynneistä' });
  }

  $('stats').innerHTML = cards.map((c) =>
    `<div class="stat"><div class="k">${c.k}</div><div class="v ${c.cls}">${c.v}</div><div class="s">${c.s}</div></div>`
  ).join('');
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

function setBaseline() {
  baseline = JSON.parse(JSON.stringify(serialize()));
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

function renderCompare() {
  const bar = $('compareBar');
  const legend = $('legendCompare');
  updateCompareBtn();
  const active = !!(baseline && ghostSim && sim);

  const chips = [];
  let anyDelta = false;
  // higher-is-better -metriikoille up = vihreä, down = punainen
  const add = (label, cur, base, eps, fmt) => {
    if (cur == null || base == null) return;
    const d = cur - base;
    const dir = Math.abs(d) < eps ? 'flat' : d > 0 ? 'up' : 'down';
    if (dir !== 'flat') anyDelta = true;
    const val = dir === 'flat' ? '±0' : (d > 0 ? '+' : '−') + fmt(Math.abs(d));
    chips.push(`<span class="cmp-chip"><span class="ck">${label}</span><span class="cv ${dir}">${val}</span></span>`);
  };
  if (!active) {
    bar.hidden = true;
    if (legend) legend.hidden = true;
    return;
  }
  add('Eläkevarallisuus', sim.wAtRet, ghostSim.wAtRet, 500, fmtCompact);
  // Vertaa samaa suuretta molemmilta: netto vs. netto tai sijoitukset vs. sijoitukset
  const useNet = sim.hasNet;
  const curEnd = useNet ? sim.net[sim.months] : sim.wEnd;
  const baseEnd = useNet ? ghostSim.net[ghostSim.months] : ghostSim.wEnd;
  add(useNet ? 'Nettovarallisuus lopussa' : 'Loppuvarallisuus', curEnd, baseEnd, 500, fmtCompact);
  if (sim.solvedWithdrawal != null && ghostSim.solvedWithdrawal != null)
    add('Kestävä tulo', sim.solvedWithdrawal, ghostSim.solvedWithdrawal, 20, (x) => `${Math.round(x).toLocaleString('fi-FI')} €/kk`);
  add('Onnistuminen', sim.successProb != null ? Math.round(sim.successProb * 100) : null,
    ghostSim.successProb != null ? Math.round(ghostSim.successProb * 100) : null, 0.5, (x) => `${Math.round(x)} %-yks`);

  // Palkki näkyy vain kun on jotain kerrottavaa — ±0-rivi olisi pelkkää kohinaa
  bar.hidden = !anyDelta;
  if (legend) legend.hidden = !anyDelta;
  if (anyDelta) $('cmpDeltas').innerHTML = chips.join('');
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
      `<span>Vertailu perustuu käyttäjien anonyymeihin suunnitelmiin. Näet ensin täsmälleen, mitä suunnitelmastasi jaetaan — data on anonyymiä eikä velvoita mihinkään.</span></div>` +
      `<div class="dc-actions"><button class="btn" id="donateOpenBtn">Kyllä, näytä</button>` +
      `<button class="btn ghost" id="donateNeverBtn">Ei kiitos</button></div></div>`;
  }
  const open = $('donateOpenBtn');
  if (open) open.addEventListener('click', openDonateModal);
  const never = $('donateNeverBtn');
  if (never) never.addEventListener('click', () => { setDonateState({ declined: true }); renderDonateSlot(); toast('Selvä — ei kysytä uudestaan. Valinnan voi muuttaa Tietoa-sivulta.'); });
  const cmp = $('donateCompareBtn');
  if (cmp) cmp.addEventListener('click', openCompareModal);
}

let pendingPayload = null;

function openDonateModal() {
  pendingPayload = buildDonationPayload(state, sim || simulate(state));
  const p = pendingPayload;
  const row = (k, v) => `<div class="dp-row"><span>${k}</span><b>${v}</b></div>`;
  let html = `<h2>Perustiedot</h2>` +
    row('Ikä nyt / suunnitelman loppu', `${p.ageNow} v / ${p.ageEnd} v`) +
    row('Varallisuus nyt', fmtEur(p.startCapital)) +
    row('Kuukausisäästö', `${fmtEur(p.monthly)}/kk` + (p.savingsGrowth ? ` (+${p.savingsGrowth.toLocaleString('fi-FI')} %/v)` : '')) +
    row('Allokaatio', `${p.alloc.stocks} % osakkeet · ${p.alloc.bonds} % korot`) +
    row('Kytkimet', [p.glide && 'ikäsidonnainen', p.real && 'inflaatiokorjattu', p.tax && 'myyntivoittovero'].filter(Boolean).join(' · ') || '—');
  html += `<h2>Tapahtumat (vain tyyppi, ikä ja summat — ei nimiä)</h2>`;
  for (const e of p.events) {
    const def = EVENT_TYPES[e.type];
    let desc;
    if (e.type === 'retirement') {
      desc = `tulotarve ${fmtEur(e.withdrawal)}/kk · työeläke ${fmtEur(e.pension)}/kk` +
        (e.goal && e.goal !== 'manual' ? ` · tavoite: ${{ withdrawal: 'kestävä tulo', age: 'eläkeikä', saving: 'säästö' }[e.goal]}` : '') +
        (e.conf ? ` · ${Math.round(e.conf * 100)} %` : '');
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
      (p.derived.successProb != null ? row('Onnistumistodennäköisyys', Math.round(p.derived.successProb * 100) + ' %') : '');
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
    const res = await fetch(DATA_API + '/donate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingPayload),
    });
    if (!res.ok) throw new Error('http ' + res.status);
    setDonateState({ donatedHash: hashStr(JSON.stringify(pendingPayload)), declined: false });
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
  add('Osakepaino', g.stocks, state.allocStocks, (v) => Math.round(v) + ' %');
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
      top.map(([t, share]) => `<span class="cmp-chip">${EVENT_TYPES[t].icon} ${EVENT_TYPES[t].label} <b>${Math.round(share * 100)} %</b></span>`).join('') +
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
    if (ev.type !== 'retirement' && ev.recMonthly) loanBadge += '<span class="loan-badge rec-badge">toistuva</span>';
    if (ev.isAsset && ev.sellAge != null) loanBadge += `<span class="loan-badge sale-badge">myynti ${Math.round(ev.sellAge)} v</span>`;
    const goalBadge = { withdrawal: '→ 0 €', age: 'aikaisin', saving: 'tavoite' }[g];
    if (goalBadge) loanBadge = `<span class="loan-badge zero-badge">${goalBadge}</span>`;
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
  const { mu, sigma } = portfolioStats(a);
  $('stocksVal').textContent = Math.round(a.s * 100) + ' %';
  $('bondsVal').textContent = Math.round(a.b * 100) + ' %';
  $('cashVal').textContent = Math.round(a.c * 100) + ' %';
  const txt = `Tuotto-odotus <b>${pctFmt(mu)}/v</b> · heilunta ±${pctFmt(sigma)}`;
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
  $('tax').addEventListener('change', (e) => { state.tax = e.target.checked; renderAll(); });
}

/* ===================== Aloitusvinkki ===================== */
// Näytetään vain ensikäynnillä; poistuu kuittauksesta tai heti kun käyttäjä
// alkaa oikeasti käyttää sovellusta (avaa tapahtuman tai lataa esimerkin).

const ONBOARD_KEY = 'vp-onboarded';

function dismissOnboard() {
  const el = $('onboard');
  if (el && !el.hidden) el.hidden = true;
  for (const b of document.querySelectorAll('.step-badge')) b.remove();
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) {}
}

function initOnboard() {
  let seen = false;
  try { seen = localStorage.getItem(ONBOARD_KEY) === '1'; } catch (e) {}
  if (seen) return;
  $('onboard').hidden = false;
  $('onboardClose').addEventListener('click', dismissOnboard);
  // Askelnumerot piirtävät polun näkymään: ① Perustiedot → ② Elämäntapahtumat → ③ Yhteenveto
  const put = (el, n) => { if (el) el.insertAdjacentHTML('afterbegin', `<i class="step-badge" aria-hidden="true">${n}</i>`); };
  put(document.querySelector('.card[data-card="basics"] h2'), 1);
  put(document.querySelector('.card[data-card="events"] h2'), 2);
  put($('summaryBtn'), 3);
  // Askel on oikopolku kohteeseensa — tärkeä etenkin mobiilissa, jossa
  // kortit ovat graafin alapuolella
  for (const s of document.querySelectorAll('.onboard .ob-steps span')) {
    const go = () => {
      const t = s.dataset.step;
      if (t === 'summary') { openSummary(); return; }
      const card = document.querySelector(`.card[data-card="${t}"]`);
      if (card) {
        card.classList.remove('collapsed');
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    s.addEventListener('click', go);
    s.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  }
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
      dismissOnboard();
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
  add('mi-analytics', 'Vaurastumisen kartta', 'Miten eri ikäiset suunnittelevat — avoin analytiikka',
    () => { location.href = 'analytiikka.html'; });
  add('mi-info', 'Tietoa palvelusta', 'Oletukset, tietosuoja ja vinkit',
    () => { $('infoModal').hidden = false; });

  // Nollaus vaatii toisen klikkauksen — valikko pysyy auki vahvistusta varten
  const reset = add('mi-reset', 'Nollaa suunnitelma', 'Aloita puhtaalta pöydältä', null, true);
  reset.addEventListener('click', () => {
    if (reset.dataset.armed) {
      try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(BASELINE_KEY); } catch (e) {}
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
  return {
    ageNow: state.ageNow, ageEnd: state.ageEnd,
    startCapital: state.startCapital, monthly: state.monthly,
    savingsGrowth: state.savingsGrowth,
    allocStocks: state.allocStocks, allocBonds: state.allocBonds,
    glide: state.glide, real: state.real, tax: state.tax,
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
  // Uudet kentät: vanhat tallennukset/linkit eivät saa muuttua — jos kenttä
  // puuttuu, käytetään neutraalia arvoa (kasvu 0 %, ei veroa), ei uutta oletusta.
  state.savingsGrowth = typeof data.savingsGrowth === 'number' && isFinite(data.savingsGrowth)
    ? clamp(data.savingsGrowth, 0, 15) : 0;
  state.tax = !!data.tax;
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
  pushUndoDebounced();
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
  $('savingsGrowth').value = state.savingsGrowth;
  $('allocStocks').value = state.allocStocks;
  $('allocBonds').value = state.allocBonds;
  $('glide').checked = state.glide;
  $('real').checked = state.real;
  $('tax').checked = state.tax;
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
    toast('Valinta nollattu — kysymys näytetään taas yhteenvedossa.');
  });

  $('cmpUpdate').addEventListener('click', () => setBaseline());
  $('cmpClear').addEventListener('click', () => clearBaseline());
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
    const grow = state.savingsGrowth > 0 ? `, kasvatan säästöä ${state.savingsGrowth.toLocaleString('fi-FI')} %/v` : '';
    pts.push({ html: `Sijoitan <b>${fmtEur(state.monthly)}/kk</b>${s.retireAge != null ? ' eläkkeelle jäämiseen asti' : ' koko suunnitelman ajan'}${grow} (alkupääoma ${fmtEur(state.startCapital)}).` });
  }

  const a = baseAlloc(state);
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
  const s = simulate(state, { goals: simGoals() });
  const yearNow = new Date().getFullYear();
  const yearOf = (age) => `~${yearNow + Math.round(age - state.ageNow)}`;
  const retire = state.events.find((e) => e.type === 'retirement') || null;
  const p = s.successProb != null ? Math.round(s.successProb * 100) : null;

  const tiles = [
    { k: 'Nykyinen varallisuus', v: fmtEur(state.startCapital) },
    { k: 'Kuukausisäästö', v: `${fmtEur(state.monthly)}/kk`, s: state.savingsGrowth > 0 ? `kasvu ${state.savingsGrowth.toLocaleString('fi-FI')} %/v` : '' },
    { k: s.goal === 'age' ? 'Aikaisin eläkeikä' : 'Eläkeikä',
      v: s.retireAge != null ? (s.goal === 'age' && s.solvedRetireAge != null ? fmtAge(s.solvedRetireAge) : `${Math.round(s.retireAge)} v`) : '—',
      s: s.retireAge != null ? yearOf(s.retireAge) : 'ei eläketapahtumaa' },
    { k: 'Kuukausitulo eläkkeellä', v: retire ? `${fmtEur(s.withdrawal)}/kk` : '—',
      s: retire ? (s.pension > 0 ? `sis. työeläke ${fmtEur(s.pension)}/kk` : (s.goal === 'withdrawal' ? 'kestävä tulo — varat loppuun' : 'sijoituksista')) : '' },
    { k: 'Varallisuus eläkkeellä', v: s.wAtRet != null ? fmtEur(s.wAtRet) : '—', cls: 'accent' },
    { k: 'Onnistumistodennäköisyys', v: p != null ? `${p} %` : '—', cls: p >= 80 ? 'ok' : p >= 55 ? '' : 'bad', s: `${(s.mcPaths || MC_LIVE).toLocaleString('fi-FI')} markkinapolkua` },
  ];

  const evRows = [...state.events].sort((x, y) => x.age - y.age).map((e) => {
    const def = EVENT_TYPES[e.type];
    let sum, fin = '', note = '';
    if (e.type === 'retirement') {
      sum = `−${fmtEur(s.goal === 'withdrawal' && s.solvedWithdrawal != null ? s.solvedWithdrawal : e.withdrawal)}/kk`;
      fin = { manual: 'kuukausitulon tarve', withdrawal: 'kestävä tulo — varat loppuun', age: 'aikaisin mahdollinen ikä', saving: 'säästötavoite' }[retGoal(e)];
      if (e.pension > 0) note = `työeläke ${fmtEur(e.pension)}/kk alk. ${Math.round(e.pensionAge != null ? e.pensionAge : 65)} v`;
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
    `<table class="sum-table"><thead><tr><th>Tapahtuma</th><th>Ajankohta</th><th>Summa</th><th>Rahoitus</th><th>Huom.</th></tr></thead><tbody>${evRows}</tbody></table>` +
    `<h2>Keskusteltavaa esim. varainhoitajan kanssa</h2>` +
    `<ul class="sum-points">${summaryTalks(s).map(li).join('')}</ul>` +
    `<p class="sum-assump">Oletukset: osakkeet 7 %, korot 3 %, käteinen 1,5 % vuodessa${state.savingsGrowth > 0 ? `; säästön kasvu ${state.savingsGrowth.toLocaleString('fi-FI')} %/v` : ''}${state.real ? `; inflaatio ${pctFmt(INFLATION)}/v, luvut nykyrahassa` : ''}${state.glide ? '; ikäsidonnainen allokaatio' : ''}${s.pension > 0 ? '; lakisääteinen työeläke huomioitu eläketulona' : ''}${state.tax ? '; myyntivoittovero 30/34 % nostojen voitto-osuudesta' : ''}${(s.saleInfos || []).some((x) => x.tax > 0.5) ? '; omaisuuden myynnissä hankintameno-olettama' : ''}. ` +
    `Lainat annuiteettilainoina. Onnistumistodennäköisyys perustuu ${(s.mcPaths || MC_LIVE).toLocaleString('fi-FI')} satunnaiseen markkinapolkuun${s.conf ? `; tavoitteet mitoitettu ${Math.round(s.conf * 100)} % onnistumisvarmuudelle` : ''}. Laadittu Varallisuuspolku-työkalulla.</p>` +
    `<p class="sum-disclaimer">Tämä yhteenveto kuvaa laatijansa omia tavoitteita, valintoja ja oletuksia. Se ei ole sijoitusneuvontaa eikä sijoitussuositus — sen voi antaa esimerkiksi varainhoitajalle keskustelun pohjaksi.</p>`;
}

function openSummary() {
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
initMcWorker();
loadState();
loadBaseline();
syncInputs();
bindInputs();
bindActions();
bindPanelCards();
initOnboard();
renderAll();
pushUndoNow(); // lähtötila kumoamishistorian pohjaksi

// Suora linkki yhteenvetoon (esim. analytiikkasivun kehotteesta)
if (location.hash === '#yhteenveto') {
  history.replaceState(null, '', location.pathname);
  openSummary();
}

new ResizeObserver(() => { renderChart(); }).observe(wrap);

// Offline-tuki: service worker välimuistittaa sovelluksen (verkko ensin,
// välimuisti varalla) — asennettuna PWA toimii ilman verkkoyhteyttä
if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* ei estä käyttöä */ });
}
