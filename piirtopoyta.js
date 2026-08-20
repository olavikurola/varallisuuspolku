'use strict';
// Osa entistä app.js:ää — tiedostot jakavat globaalin skoopin (classic scriptit);
// latausjärjestys index.html:ssä on sitova. Jaettu 25.7.2026, ei sisältömuutoksia.

/* ===================== Piirtopöytä: kokoruudun piirtotila ===================== */
// CSS-valtaus, ei Fullscreen API:a (iOS Safari ei tue puhelimessa).
// Sisään: ⛶-nappi graafin kulmassa tai F. Ulos: Esc, ✕ tai selaimen back —
// history.pushState pitää back-eleen hallussa. Tila ei katoa kumpaankaan
// suuntaan: sama state, sama undo-pino, haamu jää voimaan poistuttaessa.

function announce(msg) {
  const el = $('ariaLive');
  if (el) { el.textContent = ''; el.textContent = t(msg); } // nielukäärintä: staattiset viestit kääntyvät, valmiiksi käännetyt palautuvat sellaisinaan
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
    items.push(`<div class="hud-m${cls || ''}"><div class="k">${t(k)}</div><div class="v">${t(v)}</div>${dh}</div>`);
  };
  metric('Onnistuminen',
    curP != null ? Math.round(curP * 100) + ' %' : '–',
    curP != null && ghostP != null ? Math.round(curP * 100) - Math.round(ghostP * 100) : null,
    1, (x) => t('{0} %-yks', x), sim.successStale ? ' stale' : '');
  metric('Varallisuus eläkeiässä',
    sim.wAtRet != null ? fmtCompact(sim.wAtRet) : '–',
    sim.wAtRet != null && g && g.wAtRet != null ? sim.wAtRet - g.wAtRet : null,
    500, fmtCompact, '');
  metric('Kestävä tulo',
    sim.sustainableWd != null ? `${fmtNum(sim.sustainableWd)} €/kk` : '–',
    sim.sustainableWd != null && g && g.sustainableWd != null ? sim.sustainableWd - g.sustainableWd : null,
    20, (x) => `${fmtNum(x)} €/kk`, '');
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
const fmtNum = (v) => fmtLuku(Math.round(v)); // pyöristävä pikakäsi (kieli.js)

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
  return `<div class="dchip-row"><b>${t(label)}</b> ${fmtNum(from)} → ${fmtNum(to)} ${unit} <em class="${d >= 0 ? 'up' : 'down'}">${dTxt}</em></div>`;
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
      aria: t('Kuukausisäästö {0} euroa kuukaudessa', fmtNum(state.monthly)),
      html: `<div class="dchip-row"><b>Kuukausisäästö</b> ${fmtNum(state.monthly)} €/kk</div>${hint}` };
  }
  if (s.kind === 'wd') {
    return { ...at(mRet + Math.round((months - mRet) / 2)),
      aria: t('Kuukausitulo eläkkeellä {0} euroa kuukaudessa', fmtNum(sim.withdrawal)),
      html: `<div class="dchip-row"><b>Kuukausitulo</b> ${fmtNum(sim.withdrawal)} €/kk</div>${hint}` };
  }
  if (s.kind === 'end') {
    return { ...at(months),
      aria: t('Pääomaa jäljellä suunnitelman lopussa {0} euroa', fmtNum(sim.wEnd)),
      html: `<div class="dchip-row"><b>Pääomaa jäljellä</b> ${fmtCompact(sim.wEnd)}</div>`
        + '<div class="dchip-note">Raahaa pystysuunnassa — kuukausitulo joustaa</div>' };
  }
  if (s.kind === 'retline' && retA != null) {
    return { x: scaleX(retA), y: plot.t + 64,
      aria: t('Eläkeikä {0} vuotta', Math.round(retA)),
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
      aria: t('{0}, ikä {1} vuotta', evLabel(ev), Math.round(ev.age)) + (ev.amount != null ? t(', summa {0} euroa', fmtNum(ev.amount)) : ''),
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
  // appissa vuosisnap tuntuu sormissa (webissä vpHaptic ei ole olemassa)
  if (!noSnap && a !== d.ev.age && window.vpHaptic) window.vpHaptic('Light');
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
  if (ev.owned) {
    a = state.ageNow; // omistus ankkuroituu nykyhetkeen — vain arvo joustaa
  } else {
    if (a < state.ageNow) { a = state.ageNow; constraint = 'Menneisyyteen ei pääse'; }
    if (a > state.ageEnd) { a = state.ageEnd; constraint = 'Suunnitelma päättyy tähän ikään'; }
  }
  if (!noSnap && !ev.owned && a !== ev.age && window.vpHaptic) window.vpHaptic('Light');
  ev.age = a;
  if (ev.sellAge != null && ev.sellAge <= ev.age) ev.sellAge = ev.age + 1;
  let rows = ev.owned ? '' : chipRow('Ikä', d.startAge, a, 'v');
  if (ev.amount != null) {
    const dv = invY(py) - invY(d.startPy);
    // Omistuksella pystyveto säätää nykyarvoa (ylös = arvokkaampi)
    let amt = d.startAmount + (ev.owned ? -dv : dv);
    amt = clamp(noSnap ? Math.round(amt) : snapTo(amt, 1000), -1e9, ev.owned ? 0 : 1e9);
    if (ev.financing === 'loan') ev.down = clamp(ev.down || 0, 0, Math.max(0, -amt));
    ev.amount = amt;
    rows = ev.owned
      ? chipRow(escapeHtml(evLabel(ev)) + ' · nykyarvo', -d.startAmount, -amt, '€')
      : chipRow(escapeHtml(evLabel(ev)) + ' · ikä', d.startAge, a, 'v') + chipRow('Summa', d.startAmount, amt, '€');
    if (ev.owned && !constraint) constraint = 'Omistus on nykyhetkessä — pystyveto säätää arvoa';
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
  if (d.kind === 'famtotal') return t('Perheen säästö {0} euroa kuukaudessa', fmtNum(familyOn() ? family.persons.reduce((s, pp, pi) => s + (pi === family.active ? state : pp.data).monthly, 0) : state.monthly)) + p;
  if (d.kind === 'acc') return t('Kuukausisäästö {0} euroa kuukaudessa', fmtNum(state.monthly)) + p;
  if (d.kind === 'wd' || d.kind === 'end') return t('Kuukausitulo {0} euroa kuukaudessa', fmtNum(d.ev ? d.ev.withdrawal : 0)) + p;
  if (d.kind === 'retline') return t('Eläkeikä {0} vuotta', fmtNum(d.ev ? d.ev.age : 0)) + p;
  if (d.ev) return evLabel(d.ev) + t(': ikä {0} vuotta', fmtNum(d.ev.age)) + (d.ev.amount != null ? t(', summa {0} euroa', fmtNum(d.ev.amount)) : '') + p;
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
    if (ev.owned) { announce('Omistus on nykyhetkessä — arvoa säädät ylös- ja alas-nuolilla'); return; }
    if (s.kind === 'retline' && retGoal(ev) === 'age') ev.goal = 'manual';
    const lo = s.kind === 'event' ? state.ageNow : state.ageNow + 1;
    ev.age = clamp(Math.round(ev.age) + dir * mult, lo, state.ageEnd);
    if (ev.sellAge != null && ev.sellAge <= ev.age) ev.sellAge = ev.age + 1;
    text = t('{0} {1} vuotta', s.kind === 'retline' ? t('Eläkeikä') : evLabel(ev), Math.round(ev.age));
  } else if (s.kind === 'acc') {
    state.monthly = clamp(snapTo(state.monthly + dir * 10 * mult, 10), 0, 1e6);
    $('monthly').value = state.monthly;
    text = t('Kuukausisäästö {0} euroa kuukaudessa', fmtNum(state.monthly));
  } else if (s.kind === 'famtotal') {
    // sama askel jokaiselle aikuiselle
    let sum = 0;
    family.persons.forEach((p, pi) => {
      const data = pi === family.active ? state : p.data;
      if (!p.child) data.monthly = clamp(snapTo(data.monthly + dir * 10 * mult, 10), 0, 1e6);
      sum += data.monthly;
    });
    $('monthly').value = state.monthly;
    text = t('Perheen säästö {0} euroa kuukaudessa', fmtNum(sum));
  } else if (s.kind === 'wd' || s.kind === 'end') {
    if (!ev) return;
    const pmN = proOf(state);
    if (pmN && pmN.wd.mode === 'pct') { announce('Prosenttistrategia käytössä — säädä prosenttia Nostostrategia-kortista'); return; }
    if (retGoal(ev) === 'withdrawal') {
      if (sim.solvedWithdrawal != null) ev.withdrawal = sim.solvedWithdrawal;
      ev.goal = 'manual';
    }
    ev.withdrawal = clamp(snapTo(ev.withdrawal + dir * 10 * mult, 10), 0, 1e7);
    text = t('Kuukausitulo {0} euroa kuukaudessa', fmtNum(ev.withdrawal));
  } else if (s.kind === 'goal' && ev) {
    ev.amount = clamp(snapTo(ev.amount + dir * 5000 * mult, 5000), 0, 1e9);
    text = t('Tavoite {0} euroa', fmtNum(ev.amount));
  } else if (s.kind === 'event' && ev && ev.amount != null) {
    if (ev.owned) {
      // Ylös = arvokkaampi: nuolet säätävät nykyarvoa, eivät kulusummaa
      ev.amount = -clamp(snapTo(-ev.amount + dir * 1000 * mult, 1000), 0, 1e9);
      text = t('{0} nykyarvo {1} euroa', evLabel(ev), fmtNum(-ev.amount));
    } else {
      ev.amount = clamp(snapTo(ev.amount + dir * 1000 * mult, 1000), -1e9, 1e9);
      if (ev.financing === 'loan') ev.down = clamp(ev.down || 0, 0, Math.max(0, -ev.amount));
      text = t('{0} summa {1} euroa', evLabel(ev), fmtNum(ev.amount));
    }
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
  announce(t('Kuukausisäästö {0} euroa kuukaudessa — säädä nuolinäppäimillä ylös ja alas', fmtNum(state.monthly)));
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
    aria: evLabel(ev) + t(': tavoite {0} euroa iässä {1}', fmtNum(ev.amount), Math.round(ev.age)) +
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
    if (def.owned) continue; // nykytilan syöttö kuuluu kojelaudalle, ei tulevaisuuspintaan
    if (def.familyOnly && !familyOn()) continue; // siirrot vain perhetilassa
    if (def.unique && state.events.some((e) => e.type === type)) continue; // esim. eläke jo graafilla
    add(def.icon, t(def.label), () => addFromFs(type));
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

