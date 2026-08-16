'use strict';
// Osa entistä app.js:ää — tiedostot jakavat globaalin skoopin (classic scriptit);
// latausjärjestys index.html:ssä on sitova. Jaettu 25.7.2026, ei sisältömuutoksia.

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
    // Omistus ankkuroituu nykyhetkeen (vasen reuna) tallennetusta iästä riippumatta
    const age = ev.owned ? a0 : clamp(ev.age, a0, a1);
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
    } else if (ev.owned) {
      const left = Math.max(0, ev.loanLeft || 0);
      tdesc = `arvo ${fmtEur(-ev.amount)}` +
        (left > 0 ? ` · lainaa ${fmtEur(left)} (${fmtEur(loanPayment(left, ev.rate || 0, Math.max(1, ev.years || 10)))}/kk)` : '');
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
    title.textContent = `${evLabel(ev)} · ${ev.owned ? 'omistan nyt' : Math.round(ev.age) + ' v'} · ${tdesc}`;

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
    if (ev.owned) return; // omistus ankkuroituu nykyhetkeen — ei ikävetoa
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
    chip.dataset.type = type; // rakenteellinen kahva (testit, ei kielisidontaa)
    chip.title = t(def.label);
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    chip.innerHTML = `<span class="ic" aria-hidden="true">${def.icon}</span><span>${t(def.label)}</span>`;
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
  ghost.innerHTML = `<span class="ic">${def.icon}</span><span>${t(def.label)}</span>`;
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
    } else if (def.owned) {
      // Omistus: nykytilan alkuehto — ikä aina nykyhetki, ei rahoitusvalintaa
      ev.age = state.ageNow;
      ev.owned = true;
      ev.amount = def.amount;
      ev.isAsset = true;
      ev.appr = def.asset.appr;
      ev.loanLeft = def.own.loanLeft;
      ev.rate = def.own.rate;
      ev.years = def.own.years;
      if (def.rec) { ev.recMonthly = def.rec.monthly; ev.recYears = def.rec.years; }
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

// Jaettu puolison kanssa -kytkin: sama lohko hankinnoille ja omistuksille
// (omistuksella selite puhuu koko arvosta ja yhteislainasta)
function sharedToggleHtml(ev) {
  if (!(familyOn() && shareable(ev) && !family.persons[family.active].child
    && (ev.shared || adultPeerIdx() >= 0))) return '';
  const ti = ev.peerPid != null ? idxOfPid(ev.peerPid) : adultPeerIdx();
  const peerName = ti >= 0 ? family.persons[ti].name : 'puoliso';
  return `<label class="toggle" style="margin-top:2px"><input id="pv-shared" type="checkbox" ${ev.shared ? 'checked' : ''} /><span class="switch"></span>` +
    `<span>Jaettu puolison kanssa <small>puolet kummallekin — kentissä oma osuutesi</small></span></label>` +
    (ev.shared
      ? (ev.owned
        ? `<p class="note">Koko arvo ${fmtEur(Math.abs(ev.amount) * 2)}${(ev.loanLeft || 0) > 0 ? ` · lainaa yhteensä ${fmtEur(ev.loanLeft * 2)}` : ''} — toinen puolikas on kirjattu: ${escapeHtml(peerName)}. Muutokset synkataan molemmille.</p>`
        : `<p class="note">Koko summa ${fmtEur(Math.abs(ev.amount) * 2)}${ev.recMonthly ? ` + ${fmtEur(Math.abs(ev.recMonthly) * 2)}/kk` : ''} — toinen puolikas on kirjattu: ${escapeHtml(peerName)}. Muutokset synkataan molemmille.</p>`)
      : '');
}

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
  } else if (ev.owned) {
    // Omistus: nykytila kolmella luvulla — ei ikää (aina nyt), ei rahoitusta.
    // pv-appr/pv-sell/pv-sellage/pv-selltf/pv-rec uusiokäyttävät yleiset listenerit.
    const hasLoan = (ev.loanLeft || 0) > 0;
    const selling = ev.sellAge != null;
    fields =
      `<p class="note">Omistat jo — arvo lasketaan varallisuuteen ja lainanhoito kassavirtaan nykyhetkestä alkaen. Luvut löytyvät verkkopankista.</p>` +
      `<div class="row2">` +
      `<label class="field"><span class="field-label">Nykyarvo</span>` +
      `<span class="input"><input id="pv-own-val" type="number" min="0" step="5000" value="${Math.round(-ev.amount)}" /><em>€</em></span></label>` +
      `<label class="field"><span class="field-label">Arvonmuutos</span>` +
      `<span class="input"><input id="pv-appr" type="number" min="-30" max="15" step="0.5" value="${ev.appr != null ? ev.appr : 2}" /><em>%/v</em></span></label>` +
      `</div>` +
      `<label class="field"><span class="field-label">Lainaa jäljellä</span>` +
      `<span class="input"><input id="pv-own-loan" type="number" min="0" step="5000" value="${Math.round(ev.loanLeft || 0)}" /><em>€</em></span></label>`;
    if (hasLoan) {
      fields +=
        `<div class="row2">` +
        `<label class="field"><span class="field-label">Korko</span>` +
        `<span class="input"><input id="pv-rate" type="number" min="0" max="25" step="0.1" value="${ev.rate != null ? ev.rate : 3.5}" /><em>%/v</em></span></label>` +
        `<label class="field"><span class="field-label">Vuosia jäljellä</span>` +
        `<span class="input"><input id="pv-years" type="number" min="1" max="40" step="1" value="${ev.years != null ? ev.years : 10}" /><em>v</em></span></label>` +
        `</div>` +
        `<p class="note loan-note" id="pv-loan-note"></p>`;
    }
    fields +=
      `<label class="toggle" style="margin-top:10px"><input id="pv-sell" type="checkbox" ${selling ? 'checked' : ''} /><span class="switch"></span>` +
      `<span>Myyn kohteen <small>arvo sijoituksiin, laina pois, vero voitosta</small></span></label>`;
    if (selling) {
      fields +=
        `<label class="field" style="margin-top:10px"><span class="field-label">Myynti-ikä</span>` +
        `<span class="input"><input id="pv-sellage" type="number" min="${Math.ceil(ev.age) + 1}" max="${state.ageEnd}" step="1" value="${Math.round(ev.sellAge)}" /><em>v</em></span></label>` +
        `<label class="toggle"><input id="pv-selltf" type="checkbox" ${ev.sellTaxFree ? 'checked' : ''} /><span class="switch"></span>` +
        `<span>Verovapaa myynti <small>esim. oma asunto, asuttu ≥ 2 v</small></span></label>` +
        (!ev.sellTaxFree
          ? `<label class="field" style="margin-top:10px"><span class="field-label">Ostovuosi <small>hankintameno-olettamaan</small></span>` +
            `<span class="input"><input id="pv-own-year" type="number" min="1950" max="${new Date().getFullYear()}" step="1" value="${ev.boughtYear || ''}" placeholder="esim. 2019" /></span></label>`
          : '') +
        `<p class="note sale-note" id="pv-sale-note"></p>`;
    }
    // Vuokratulo tms. toistuva erä — sama lohko kuin hankinnoilla
    const hasRecO = ev.recMonthly != null;
    fields +=
      `<label class="toggle" style="margin-top:10px"><input id="pv-rec" type="checkbox" ${hasRecO ? 'checked' : ''} /><span class="switch"></span>` +
      `<span>Toistuva kuukausierä <small>esim. vuokratulo tai vastike</small></span></label>`;
    if (hasRecO) {
      fields +=
        `<div class="row2" style="margin-top:10px">` +
        `<label class="field"><span class="field-label">Erä (− meno, + tulo)</span>` +
        `<span class="input"><input id="pv-recm" type="number" step="50" value="${ev.recMonthly}" /><em>€/kk</em></span></label>` +
        `<label class="field"><span class="field-label">Kesto</span>` +
        `<span class="input"><input id="pv-recy" type="number" min="1" max="60" step="1" value="${Math.round(ev.recYears != null ? ev.recYears : 10)}" /><em>v</em></span></label>` +
        `</div>`;
    }
    // Jaettu omistus: puolet arvosta ja lainasta kummallekin aikuiselle
    fields += sharedToggleHtml(ev);
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
    fields += sharedToggleHtml(ev);

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
    `<span class="input"><input id="pv-name" type="text" maxlength="${NAME_MAX}" placeholder="${escapeHtml(t(def.label))}" /></span></label>`;

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
    copy.age = copy.owned ? state.ageNow : clamp(Math.round(ev.age) + 1, state.ageNow, state.ageEnd);
    if (copy.sellAge != null) copy.sellAge = clamp(copy.sellAge + 1, copy.age + 1, state.ageEnd);
    state.events.push(copy);
    renderAll();
    openPopover(copy.id);
  });
  const ageI = $('pv-age'); // omistuksilla ei ikäkenttää (aina nykyhetki)
  if (ageI) {
    ageI.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      // Keskeneräinen syöte (esim. "6" matkalla lukuun 65) ei muuta tilaa
      if (isNaN(v) || v < state.ageNow || v > state.ageEnd) return;
      ev.age = v;
      renderAllKeepPopover();
    });
    ageI.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) ev.age = clamp(v, state.ageNow, state.ageEnd);
      if (ev.sellAge != null && ev.sellAge <= ev.age) ev.sellAge = ev.age + 1;
      e.target.value = Math.round(ev.age * 10) / 10;
      renderAllKeepPopover();
    });
  }
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
  // Omistuksen kentät: nykyarvo, lainaa jäljellä, ostovuosi
  const ownVal = $('pv-own-val');
  if (ownVal) ownVal.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    if (!isNaN(v)) { ev.amount = -clamp(v, 0, 1e9); updateSaleNote(); renderAllKeepPopover(); }
  });
  const ownLoan = $('pv-own-loan');
  if (ownLoan) {
    ownLoan.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) { ev.loanLeft = clamp(v, 0, 1e9); updateLoanNote(); renderAllKeepPopover(); }
    });
    // 0 ↔ >0: korko- ja aikakentät ilmestyvät tai poistuvat
    ownLoan.addEventListener('change', () => openPopover(id));
  }
  const ownYear = $('pv-own-year');
  if (ownYear) ownYear.addEventListener('change', (e) => {
    const v = parseInt(e.target.value, 10);
    const yNow = new Date().getFullYear();
    if (!isNaN(v) && v >= 1950 && v <= yNow) { ev.boughtYear = v; ev.ownYears = clamp(yNow - v, 0, 90); }
    else { delete ev.boughtYear; ev.ownYears = 0; e.target.value = ''; }
    renderAllKeepPopover();
    updateSaleNote();
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
    // Omistukselle pääoma on jäljellä oleva laina, ostolle hinta − käsiraha
    const price = Math.max(0, -ev.amount);
    const principal = ev.owned
      ? Math.max(0, ev.loanLeft || 0)
      : Math.max(0, price - clamp(ev.down || 0, 0, price));
    const pmt = loanPayment(principal, ev.rate || 0, ev.years || 10);
    const interest = pmt * Math.round((ev.years || 10) * 12) - principal;
    // Erät maksetaan säästövirrasta (laskenta.js runPath) — kerro se tässä,
    // ettei käyttäjä syötä kuukausisäästöksi vain rahasto-osuutta. Eläkkeellä
    // erät katetaan nostoista, joten vihje koskee vain työuralle osuvaa lainaa.
    const retire = state.events.find((x) => x.type === 'retirement');
    let saveHint = '';
    if (!retire || ev.age < retire.age) {
      let base = state.monthly;
      if (Array.isArray(state.savePhases) && state.savePhases.length) {
        const ph = state.savePhases.slice().sort((a, b) => a.to - b.to);
        const row = ph.find((r) => ev.age <= r.to) || ph[ph.length - 1];
        base = Math.max(0, (row && row.amount) || 0);
      }
      const save = base * Math.pow(1 + (state.savingsGrowth || 0) / 100, Math.max(0, ev.age - state.ageNow));
      saveHint = pmt > save + 0.5
        ? `<br><small>Erä ylittää kuukausisäästösi (~${fmtEur(save)}/kk) — ylittävä osa myydään sijoituksista. Jos maksat lainaa palkasta kulutusta karsimalla, korota kuukausisäästöä laina-ajaksi.</small>`
        : '<br><small>Erä maksetaan kuukausisäästöstä — mitoita säästö niin, että se kattaa myös lainanhoidon.</small>';
    }
    note.innerHTML = `Laina <b>${fmtEur(principal)}</b> · maksuerä <b>${fmtEur(pmt)}/kk</b> · korkoa yhteensä <b>${fmtEur(interest)}</b>` + saveHint;
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
      ev.sellTaxFree = ev.type === 'home' || ev.type === 'ownHome';
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
    if (ev.owned) { openPopover(id); return; } // Ostovuosi-kenttä näkyviin/piiloon
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

