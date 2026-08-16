'use strict';
// Osa entistä app.js:ää — tiedostot jakavat globaalin skoopin (classic scriptit);
// latausjärjestys index.html:ssä on sitova. Jaettu 25.7.2026, ei sisältömuutoksia.

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
    // HUOM: monthly on säästö ENNEN lainanhoitoa — moottori maksaa erän
    // kuukausisäästöstä ja myy alijäämän salkusta (ks. 24.7. korjaus)
    name: 'Asunnonomistaja (40 v)', desc: 'Asunto ja laina jo hankittu — riittääkö loppupolku?',
    data: {
      ageNow: 40, ageEnd: 90, startCapital: 20000, monthly: 1200, savingsGrowth: 1.5,
      allocStocks: 75, allocBonds: 15, glide: false, real: false, tax: true,
      events: [
        { type: 'ownHome', age: 40, amount: -280000, loanLeft: 140000, rate: 3.5, years: 17, isAsset: true, appr: 2, boughtYear: 2021 },
        { type: 'retirement', age: 65, withdrawal: 3100, pension: 1800, pensionAge: 65 },
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
  {
    // Julkisen "milloin miljonäärin rahat loppuvat" -keskustelun vastalasku.
    // Kalibroitu moottoria vasten 28.7.2026: jakolasku sanoo 55 v 5 kk;
    // simulaatio (tuotto − verot − työeläke, nykyrahassa) mediaanissa ~57 v,
    // huonoimmassa kymmenyksessä ~54 v — ja kestävä taso ~3 600 €/kk.
    name: 'Exit-miljonääri (45 v)', desc: 'Miljoona tilillä, 8 000 €/kk menoa — milloin rahat oikeasti loppuvat?',
    data: {
      ageNow: 45, ageEnd: 92, startCapital: 1000000, monthly: 0, savingsGrowth: 0,
      allocStocks: 60, allocBonds: 30, glide: false, real: true, tax: true,
      events: [
        { type: 'retirement', age: 45, withdrawal: 8000, pension: 1800, pensionAge: 68 },
      ],
    },
  },
  {
    name: 'Miljoona loppuelämäksi (45 v)', desc: 'Paljonko miljoonasta voi käyttää joka kuukausi 85 % varmuudella?',
    data: {
      ageNow: 45, ageEnd: 92, startCapital: 1000000, monthly: 0, savingsGrowth: 0,
      allocStocks: 60, allocBonds: 30, glide: false, real: true, tax: true,
      events: [
        { type: 'retirement', age: 45, withdrawal: 2700, pension: 1800, pensionAge: 68, goal: 'withdrawal', conf: 0.85 },
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

/* ===================== Jaettava tuloskuva ===================== */
// Somekuva (1200×630) suunnitelman päätuloksista: canvas-piirto ilman
// riippuvuuksia. Aina tumma brändi-ilme teemasta riippumatta — kuva elää
// syötteissä omillaan eikä peri sivun teemaa.

function buildShareImage() {
  if (!sim || !sim.exp || sim.months == null) return null;
  const W = 1200, H = 630;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const F = '"Inter", system-ui, sans-serif';

  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0e1424');
  bg.addColorStop(1, '#0a0e1a');
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  // Käyräalue alaosaan: odotuspolku + P10–P90-viuhka samasta simistä kuin graafi
  const L = 70, R = W - 70, T = 250, B = 566;
  const n = sim.months;
  const hi = Math.max(...sim.exp, ...(sim.opt ? [sim.opt[n] || 0] : [0]), 1);
  const px = (m) => L + (m / n) * (R - L);
  const py = (v) => B - Math.min(1, Math.max(0, v / hi)) * (B - T);
  if (sim.pess && sim.opt) {
    x.beginPath();
    for (let m = 0; m <= n; m++) x[m ? 'lineTo' : 'moveTo'](px(m), py(sim.opt[m]));
    for (let m = n; m >= 0; m--) x.lineTo(px(m), py(sim.pess[m]));
    x.closePath();
    x.fillStyle = 'rgba(45, 212, 191, 0.09)';
    x.fill();
  }
  const area = x.createLinearGradient(0, T, 0, B);
  area.addColorStop(0, 'rgba(45, 212, 191, 0.28)');
  area.addColorStop(1, 'rgba(45, 212, 191, 0.02)');
  x.beginPath();
  x.moveTo(L, B);
  for (let m = 0; m <= n; m++) x.lineTo(px(m), py(sim.exp[m]));
  x.lineTo(R, B);
  x.closePath();
  x.fillStyle = area;
  x.fill();
  x.beginPath();
  for (let m = 0; m <= n; m++) x[m ? 'lineTo' : 'moveTo'](px(m), py(sim.exp[m]));
  x.strokeStyle = '#2dd4bf';
  x.lineWidth = 5;
  x.lineJoin = 'round';
  x.stroke();

  // Eläkeikäviiva — sama violetti virstanpylväskieli kuin graafissa
  if (sim.retireAge != null) {
    const rx = px((sim.retireAge - sim.a0) * 12);
    x.setLineDash([7, 7]);
    x.strokeStyle = 'rgba(139, 124, 246, 0.75)';
    x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(rx, T - 26); x.lineTo(rx, B); x.stroke();
    x.setLineDash([]);
    x.fillStyle = '#b9aefa';
    x.font = `600 20px ${F}`;
    x.textAlign = rx > W / 2 ? 'right' : 'left';
    x.fillText(`Eläkkeelle ${Math.round(sim.retireAge)} v`, rx + (rx > W / 2 ? -10 : 10), T - 6);
  }
  x.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  x.lineWidth = 1;
  x.beginPath(); x.moveTo(L, B); x.lineTo(R, B); x.stroke();
  // Ikämerkinnät piirtoalueen sisään — alalaidassa ne ahtautuisivat footeriin
  x.fillStyle = '#66738f';
  x.font = `500 18px ${F}`;
  x.textAlign = 'left';
  x.fillText(`${state.ageNow} v`, L + 2, B - 10);
  x.textAlign = 'right';
  x.fillText(`${state.ageEnd} v`, R - 2, B - 10);

  // Brändi: merkki (käyrä + piste) liukuvärilaatalla + nimi
  const mg = x.createLinearGradient(40, 36, 92, 88);
  mg.addColorStop(0, '#2dd4bf');
  mg.addColorStop(1, '#8b7cf6');
  x.fillStyle = mg;
  if (x.roundRect) { x.beginPath(); x.roundRect(40, 36, 52, 52, 13); x.fill(); }
  else x.fillRect(40, 36, 52, 52);
  x.strokeStyle = '#fff';
  x.lineWidth = 3.4;
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(52, 74);
  x.bezierCurveTo(62, 73, 67, 59, 80, 51);
  x.stroke();
  x.beginPath(); x.arc(80, 51, 4.3, 0, 7); x.fillStyle = '#fff'; x.fill();
  x.fillStyle = '#e8edf8';
  x.font = `600 30px ${F}`;
  x.textAlign = 'left';
  x.fillText('Varallisuuspolku', 108, 71);

  // Pääluku seuraa suunnitelman tavoitetta — kestävän tulon ratkaisussa
  // onnistumis-% on määritelmällisesti ~50 % (raha loppuu juuri lopussa),
  // joten se olisi otsikkona harhaanjohtava (sama oppi kuin og-kuvassa)
  const ret = state.events.find((e) => e.type === 'retirement');
  const eur0 = (v) => fmtEur(Math.round(v));
  const age1 = (v) => fmtLuku(Math.round(v * 10) / 10);
  const succRow = ['Onnistumistodennäköisyys', sim.successProb != null ? `${Math.round(sim.successProb * 100)} %` : '–'];
  let label, big, rows;
  if (ret && sim.goal === 'withdrawal' && sim.solvedWithdrawal != null) {
    label = sim.conf ? `Kestävä kuukausitulo (varmuus ${Math.round(sim.conf * 100)} %)` : 'Kestävä kuukausitulo eläkkeellä';
    big = `${eur0(sim.solvedWithdrawal)}/kk`;
    rows = [
      ['Eläkkeelle', `${age1(sim.retireAge)} v`],
      ['Sijoitukset eläkeiässä', sim.wAtRet != null ? fmtCompact(sim.wAtRet) : '–'],
      ['Kuukausisäästö nyt', `${eur0(state.monthly)}/kk`],
    ];
    if (sim.conf) rows[0] = succRow;
  } else if (ret && sim.goal === 'age' && sim.solvedRetireAge != null) {
    label = 'Aikaisin eläkeikä';
    big = `${age1(sim.solvedRetireAge)} v`;
    rows = [
      ['Kuukausitulo eläkkeellä', `${eur0(ret.withdrawal)}/kk`],
      ['Sijoitukset eläkeiässä', sim.wAtRet != null ? fmtCompact(sim.wAtRet) : '–'],
      ['Kuukausisäästö nyt', `${eur0(state.monthly)}/kk`],
    ];
  } else if (ret && sim.goal === 'saving' && sim.requiredMonthly != null) {
    label = 'Tarvittava kuukausisäästö';
    big = `${eur0(sim.requiredMonthly)}/kk`;
    rows = [
      ['Eläkkeelle', `${age1(sim.retireAge)} v`],
      ['Kuukausitulo eläkkeellä', `${eur0(ret.withdrawal)}/kk`],
      sim.conf ? succRow : ['Sijoitukset eläkeiässä', sim.wAtRet != null ? fmtCompact(sim.wAtRet) : '–'],
    ];
  } else if (ret && sim.successProb != null) {
    label = 'Onnistumistodennäköisyys';
    big = `${Math.round(sim.successProb * 100)} %`;
    rows = [
      ['Kuukausitulo eläkkeellä', `${eur0(ret.withdrawal)}/kk`],
      ['Sijoitukset eläkeiässä', sim.wAtRet != null ? fmtCompact(sim.wAtRet) : '–'],
      ['Kuukausisäästö nyt', `${eur0(state.monthly)}/kk`],
    ];
  } else {
    label = `Sijoitusvarallisuus ${state.ageEnd} vuoden iässä`;
    big = fmtCompact(sim.wEnd);
    rows = [];
  }
  x.textAlign = 'left';
  x.fillStyle = '#9aa7c4';
  x.font = `500 24px ${F}`;
  x.fillText(label, 70, 145);
  const pg = x.createLinearGradient(70, 150, 520, 220);
  pg.addColorStop(0, '#2dd4bf');
  pg.addColorStop(1, '#8b7cf6');
  x.fillStyle = pg;
  x.font = `700 80px ${F}`;
  x.fillText(big, 66, 222);
  let ry = 138;
  for (const [k, v] of rows) {
    x.fillStyle = '#9aa7c4'; x.font = `500 22px ${F}`; x.fillText(k, 640, ry);
    x.fillStyle = '#e8edf8'; x.font = `600 26px ${F}`; x.fillText(v, 950, ry);
    ry += 40;
  }
  if (state.real) {
    x.fillStyle = '#66738f';
    x.font = `500 18px ${F}`;
    x.fillText('reaalieuroina (inflaatiokorjattu)', 70, 176);
  }

  x.fillStyle = '#2dd4bf';
  x.font = `600 22px ${F}`;
  x.textAlign = 'left';
  x.fillText('Piirrä oma polkusi — varallisuuspolku.com', 70, H - 18);
  x.fillStyle = '#66738f';
  x.font = `500 16px ${F}`;
  x.textAlign = 'right';
  x.fillText('Havainnollistus, ei sijoitusneuvontaa', W - 70, H - 18);
  return c;
}

async function shareResultImage(lahde) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
  const c = buildShareImage();
  if (!c) { toast('Ei vielä laskettua suunnitelmaa'); return; }
  track('Tuloskuva', { lahde });
  c.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], 'varallisuuspolku-tulos.png', { type: 'image/png' });
    // Mobiilissa natiivi jakoarkki; muuten lataus — molemmat ilman palvelinta
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Varallisuuspolku', text: 'Minun polkuni — varallisuuspolku.com' });
        return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'varallisuuspolku-tulos.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Tuloskuva ladattu — jaa se mistä haluat');
  }, 'image/png');
}

/* ===================== Teema ===================== */
// Vaalea teema = html.light-luokka; headin inline-skripti lukee saman avaimen
// ennen ensimmäistä maalausta, joten valinta ei välähdä latauksessa.
const THEME_KEY = 'vp-theme';

function isLightTheme() { return document.documentElement.classList.contains('light'); }

function applyTheme(light) {
  document.documentElement.classList.toggle('light', light);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', light ? '#eef1f8' : '#0a0e1a');
  try { localStorage.setItem(THEME_KEY, light ? 'light' : 'dark'); } catch (e) {}
}

// Nollaus koskee vain aktiivista suunnitelmariviä — muut säilyvät ja seuraava
// rivi aktivoituu latauksessa (initPlans palauttaa sen tilaan). Globaali,
// jotta myös appin alapalkkivalikko (alapalkki.js) käyttää samaa logiikkaa.
function nollaaAktiivinen() {
  try {
    if (plans) {
      localStorage.setItem(PLANS_KEY, JSON.stringify(plans.filter((p) => p.id !== planActiveId)));
      localStorage.removeItem(PLAN_ACTIVE_KEY);
    }
  } catch (e) {}
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(BASELINE_KEY); localStorage.removeItem(FAMILY_KEY); localStorage.removeItem(SCEN_KEY); } catch (e) {}
  // Nollaaja ei ole ensivierailija: paluu dashboardille, ei piirtopöydälle
  try { sessionStorage.setItem('vp-reset', '1'); } catch (e) {}
  location.hash = '';
  location.reload();
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
  // Väliotsikot ryhmittävät rivit lajeittain — kytkimet erottuvat siirtymistä
  // (Olavin laitehavainto 5.8.: valikossa monta eri lajia sekaisin)
  const sect = (label) => {
    const s = document.createElement('div');
    s.className = 'msect';
    s.textContent = label;
    menu.appendChild(s);
  };

  sect('Toiminnot');
  add('mi-compare',
    baseline ? 'Vertailu päällä ✓' : 'Vertaile',
    baseline ? 'Poista vertailukohta' : 'Tallenna nykyinen suunnitelma haamukäyräksi',
    () => {
      if (baseline) { clearBaseline(); toast('Vertailu poistettu'); }
      else { setBaseline(); toast('Vertailukohta tallennettu — erot näkyvät, kun muutat suunnitelmaa'); }
    });
  add('mi-tour', 'Esittelykierros', 'Palvelun läpikäynti yhdeksällä klikkauksella',
    () => startTour());

  sect('Sivut');
  add('mi-analytics', 'Tilastot', 'Miten muut suunnittelevat vaurastumista — avoin data',
    () => { location.href = 'analytiikka.html'; });
  add('mi-agents', 'Agentit', 'Kytke oma tekoälyavustajasi laskentamoottoriin (MCP)',
    () => { location.href = 'agentit.html'; });
  add('mi-info', 'Tietoa palvelusta', 'Oletukset, tietosuoja ja vinkit',
    () => { $('infoModal').hidden = false; });

  sect('Asetukset');
  add('mi-theme',
    isLightTheme() ? 'Tumma teema' : 'Vaalea teema',
    'Vaihda värimaailma — valinta muistetaan',
    () => applyTheme(!isLightTheme()));

  // Nollaus vaatii toisen klikkauksen — valikko pysyy auki vahvistusta varten
  const reset = add('mi-reset', 'Nollaa suunnitelma', 'Poistaa avoinna olevan suunnitelman — muut rivit säilyvät', null, true);
  reset.addEventListener('click', () => {
    if (reset.dataset.armed) {
      nollaaAktiivinen();
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
  // Omistukset ankkuroituvat nykyhetkeen — tallenteen ikä pidetään ajan tasalla,
  // vaikka ageNow olisi muuttunut lisäyksen jälkeen
  for (const e of state.events) if (e.owned) e.age = state.ageNow;
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
  // Pro päällä: moottori käyttää pro.infl:iä — peruskenttä näyttää saman arvon
  // eikä valehtele (yksi inflaatiototuus; vain proOn-tallenteille, jottei
  // passiivinen pro-objekti muuta perustilan käytöstä)
  if (state.proOn && state.pro && typeof state.pro.infl === 'number' && isFinite(state.pro.infl)) {
    state.inflation = clamp(state.pro.infl, 0, 15);
  }
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
      // Omistukset: owned-lippu VAIN own*-tyypeille — käsin muokattu linkki ei
      // saa kytkeä ostotapahtumaa nollakassavirtaiseksi (owned ohittaa lumpin)
      const odef = EVENT_TYPES[e.type];
      if (odef.owned) {
        e.owned = true;
        e.age = state.ageNow; // ankkuroituu aina nykyhetkeen
        delete e.financing; delete e.down;
        if (!numOk(e.amount) || e.amount > 0) e.amount = odef.amount;
        e.isAsset = true;
        if (!numOk(e.appr)) e.appr = odef.asset.appr;
        e.loanLeft = numOk(e.loanLeft) ? clamp(e.loanLeft, 0, 1e9) : 0;
        if (e.loanLeft > 0) {
          e.rate = numOk(e.rate) ? clamp(e.rate, 0, 25) : odef.own.rate;
          e.years = numOk(e.years) ? clamp(e.years, 1, 40) : odef.own.years;
        }
        const yNow = new Date().getFullYear();
        if (!numOk(e.boughtYear) || e.boughtYear < 1950 || e.boughtYear > yNow) delete e.boughtYear;
        e.ownYears = e.boughtYear != null ? clamp(yNow - e.boughtYear, 0, 90) : 0;
        if (e.sellAge != null && e.sellAge <= state.ageNow) { delete e.sellAge; delete e.sellTaxFree; }
      } else {
        delete e.owned; delete e.loanLeft; delete e.boughtYear; delete e.ownYears;
      }
    }
    idSeq = maxId + 1;
  }
  return true;
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize())); } catch (e) { /* yksityistila tms. */ }
  if (family) { reconcileTransfers(); saveActiveIntoFamily(); persistFamily(); }
  syncActivePlan(); // aktiivinen suunnitelmarivi seuraa työtilaa automaattisesti
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
  // Appi: laitteen oma jakoarkki (Viestit, sähköposti, AirDrop…) — kopiointi
  // leikepöydälle on arkin oma vaihtoehto. Peruutus ei pudota leikepöydälle.
  if (vpNativeApp && window.vpNatiivi && window.vpNatiivi.jaa) {
    const jaettiin = await window.vpNatiivi.jaa({
      title: 'Varallisuuspolku-suunnitelma',
      text: 'Suunnitelmani Varallisuuspolussa — linkki kantaa koko suunnitelman:',
      url,
    });
    if (jaettiin) return;
  }
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
  // appin taitetut osiot auki tulosteeseen — kiinni oleva <details> ei tulostu
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('details.sum-taite').forEach((d) => { d.open = true; });
  });
  $('sumShare').addEventListener('click', (e) => copyShareUrl(e.target));
  $('moreBtn').addEventListener('click', () => openMoreMenu($('moreBtn')));
  // Natiiviappi: alapalkin "Lisää" tilastosivulta saapuu lipun kanssa → avataan valikko perillä
  try {
    if (sessionStorage.getItem('vp-avaa-valikko')) {
      sessionStorage.removeItem('vp-avaa-valikko');
      setTimeout(() => openMoreMenu($('moreBtn')), 350);
    }
  } catch (e) { /* yksityistila tms. */ }
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
  try {
    const s = localStorage.getItem('vp-balance-collapsed');
    // Appi: tase kiinni ensiavauksessa — graafi ja tunnusluvut hallitsevat
    // ensinäkymää; napautus avaa ja valinta muistetaan (webissä auki kuten ennen)
    balCollapsed = s != null ? s === '1'
      : !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (e) {}
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
    const grow = state.savingsGrowth > 0 ? `, kasvatan säästöä ${fmtLuku(state.savingsGrowth)} %/v` : '';
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
    { k: 'Kuukausisäästö', v: `${fmtEur(state.monthly)}/kk`, s: state.savingsGrowth > 0 ? `kasvu ${fmtLuku(state.savingsGrowth)} %/v` : '' },
    { k: s.goal === 'age' ? 'Aikaisin eläkeikä' : 'Eläkeikä',
      v: s.retireAge != null ? (s.goal === 'age' && s.solvedRetireAge != null ? fmtAge(s.solvedRetireAge) : `${Math.round(s.retireAge)} v`) : '—',
      s: s.retireAge != null ? yearOf(s.retireAge) : 'ei eläketapahtumaa' },
    { k: 'Kuukausitulo eläkkeellä', v: retire ? `${fmtEur(s.withdrawal)}/kk` : '—',
      s: retire ? (s.pension > 0 ? `sis. työeläke ${fmtEur(s.pension)}/kk` : (s.goal === 'withdrawal' ? 'kestävä tulo — varat loppuun' : 'sijoituksista')) : '' },
    { k: 'Varallisuus eläkkeellä', v: s.wAtRet != null ? fmtEur(s.wAtRet) : '—', cls: 'accent' },
    // appissa lyhyt label — täysi sana rivittyi rumasti kapeassa tiilessä
    { k: vpNativeApp ? 'Onnistumis-%' : 'Onnistumistodennäköisyys', v: p != null ? `${p} %` : '—', cls: p >= 80 ? 'ok' : p >= 55 ? '' : 'bad', s: `${fmtLuku(s.mcPaths || MC_LIVE)} markkinapolkua` },
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
    } else if (e.owned) {
      const left = Math.max(0, e.loanLeft || 0);
      sum = fmtEur(-e.amount);
      fin = left > 0
        ? `omistan — lainaa ${fmtEur(left)}, erä ${fmtEur(loanPayment(left, e.rate || 0, Math.max(1, e.years || 10)))}/kk · ${Math.round(e.years || 10)} v · ${fmtLuku(e.rate || 0)} %`
        : 'omistan velattomana';
    } else if (e.amount < 0 && e.financing === 'loan') {
      const price = -e.amount;
      const down = clamp(e.down || 0, 0, price);
      const pmt = loanPayment(price - down, e.rate || 0, e.years || 10);
      sum = fmtEur(e.amount);
      fin = `laina: käsiraha ${fmtEur(down)}, erä ${fmtEur(pmt)}/kk · ${Math.round(e.years || 10)} v · ${fmtLuku(e.rate || 0)} %`;
    } else {
      sum = (e.amount >= 0 ? '+' : '') + fmtEur(e.amount);
      fin = e.amount < 0 ? 'säästöistä' : 'tulo';
    }
    if (e.isAsset) note = `omaisuuseräksi, arvonmuutos ${fmtLuku(e.appr || 0)} %/v`;
    if (e.type !== 'retirement' && e.recMonthly) note += `${note ? '; ' : ''}toistuva ${e.recMonthly > 0 ? '+' : ''}${fmtEur(e.recMonthly)}/kk ${Math.round(e.recYears || 0)} v`;
    if (e.sellAge != null && e.isAsset) note += `${note ? '; ' : ''}myynti ${Math.round(e.sellAge)} v iässä${e.sellTaxFree ? ' (verovapaa)' : ''}`;
    return `<tr><td>${def.icon} ${escapeHtml(evLabel(e))}</td>` +
      `<td class="num">${e.owned ? 'nyt' : Math.round(e.age) + ' v · ' + yearOf(e.age).slice(1)}</td>` +
      `<td class="num">${sum}</td><td>${fin}</td><td>${note}</td></tr>`;
  }).join('');

  const li = (x) => `<li${x.warn ? ' class="warn"' : ''}>${x.html}</li>`;

  // Appi: osiot <details>-taitteina — dokumentti on tulostusparadigma, appissa
  // pitkä vieritys. Kehitys (käyrä) auki oletuksena, muut avataan tarpeeseen.
  // Webissä ja tulosteessa kaikki auki kuten ennen (beforeprint avaa taitteet).
  const osio = (otsikko, sisalto, auki) => vpNativeApp
    ? `<details class="sum-taite"${auki ? ' open' : ''}><summary><h2>${otsikko}</h2></summary>${sisalto}</details>`
    : `<h2>${otsikko}</h2>${sisalto}`;

  $('sumSheet').innerHTML =
    `<div class="sum-head">` +
    `<div><h1>Varallisuussuunnitelma</h1><div class="sum-sub">Tavoitteeni ja suunnitelmani elämäni taloudelle</div></div>` +
    `<div class="sum-meta">${fmtPvm(new Date())}<br>Ikä ${state.ageNow} v · suunnitelma ${Math.round(s.a1)} v ikään asti<br>${state.real ? 'inflaatiokorjattu, nykyrahassa' : 'nimellisarvoin'}</div>` +
    `</div>` +
    `<div class="sum-tiles">${tiles.map((c) =>
      `<div class="sum-tile"><div class="k">${c.k}</div><div class="v ${c.cls || ''}">${c.v}</div>${c.s ? `<div class="s">${c.s}</div>` : ''}</div>`).join('')}</div>` +
    osio('Varallisuuden odotettu kehitys',
      `<div class="sum-chart">${summaryChartSVG(s)}</div>` +
      `<div class="sum-legend"><span><i class="sw sum-lg-line"></i>Sijoitusvarallisuus</span><span><i class="sw sum-lg-band"></i>Vaihteluväli</span><span><i class="sw sum-lg-inv"></i>Sijoitettu pääoma</span></div>`, true) +
    osio('Suunnitelmani kulmakivet',
      `<ol class="sum-points">${summaryPoints(s).map(li).join('')}</ol>`, false) +
    osio('Elämäntapahtumat aikajanalla',
      `<div class="table-scroll"><table class="sum-table"><thead><tr><th>Tapahtuma</th><th>Ajankohta</th><th>Summa</th><th>Rahoitus</th><th>Huom.</th></tr></thead><tbody>${evRows}</tbody></table></div>`, false) +
    osio('Keskusteltavaa esim. varainhoitajan kanssa',
      `<ul class="sum-points">${summaryTalks(s).map(li).join('')}</ul>`, false) +
    (familyOn() ? familySummaryHtml() : '') +
    (state.proOn ? proSummaryHtml(s) : '') +
    `<p class="sum-assump">Oletukset: osakkeet 7 %, korot 3 %, käteinen 1,5 % vuodessa${state.savingsGrowth > 0 ? `; säästön kasvu ${fmtLuku(state.savingsGrowth)} %/v` : ''}${state.real ? `; inflaatio ${fmtLuku(state.inflation)} %/v, luvut nykyrahassa` : ''}${state.glide ? '; ikäsidonnainen allokaatio' : ''}${s.pension > 0 ? '; lakisääteinen työeläke huomioitu eläketulona' : ''}${state.tax ? '; myyntivoittovero 30/34 % nostojen voitto-osuudesta' : ''}${state.acct === 'ost' ? '; osakesäästötili (osingot ja myynnit tilillä verotta, nostosta vero voitto-osuudesta)' : state.acct === 'ins' ? `; vakuutuskuori (tuotot kuoressa verotta, nostosta vero voitto-osuudesta${state.wrapFee > 0 ? `, kuoren kulu ${fmtLuku(state.wrapFee)} %/v` : ''})` : ''}${state.feePct > 0 ? `; sijoituskulut ${fmtLuku(state.feePct)} %/v` : ''}${state.acct === 'aot' && state.tax && state.divYield > 0 ? `; suorien osakkeiden osinkotuotto ${fmtLuku(state.divYield)} %/v verotettuna vuosittain` : ''}${(s.saleInfos || []).some((x) => x.tax > 0.5) ? '; omaisuuden myynnissä hankintameno-olettama' : ''}. ` +
    `Lainat annuiteettilainoina. Onnistumistodennäköisyys perustuu ${fmtLuku(s.mcPaths || MC_LIVE)} satunnaiseen markkinapolkuun${s.conf ? `; tavoitteet mitoitettu ${Math.round(s.conf * 100)} % onnistumisvarmuudelle` : ''}. Laadittu Varallisuuspolku-työkalulla.</p>` +
    `<p class="sum-disclaimer">Tämä yhteenveto kuvaa laatijansa omia tavoitteita, valintoja ja oletuksia. Se ei ole sijoitusneuvontaa eikä sijoitussuositus — sen voi antaa esimerkiksi varainhoitajalle keskustelun pohjaksi.</p>`;
}

function openSummary() {
  trackOnce('Suunnitelmani avattu');
  renderPlans(); // suunnitelmakoti dokumentin yläpuolelle
  renderSummary();
  renderDonateSlot();
  $('summary').hidden = false;
  document.body.classList.add('summary-open');
}

function closeSummary() {
  closePlanMenu();
  $('summary').hidden = true;
  document.body.classList.remove('summary-open');
}

/* ===================== Suunnitelmat (profiilit) ===================== */
// Suunnitelmani-näkymän yläosa on koti kaikille suunnitelmille: omat skenaariot
// ja lähipiirin suunnitelmat riveinä, yksi rivi per suunnitelma. Aktiivinen
// suunnitelma ON työtilan tila — STORAGE_KEY säilyy sen peilinä (vanha polku
// ja kaikki vanhat asiakkaat ennallaan), vp-plans kantaa rivit ja vp-active
// osoittaa aktiivisen. Perhetila kulkee rivin sisällä (family-kenttä).
// Jakolinkki EI enää korvaa omaa suunnitelmaa vaan tallentuu omaksi rivikseen.

const PLANS_KEY = 'vp-plans';
const PLAN_ACTIVE_KEY = 'vp-active';
const PLAN_MAX = 20;

// Oletustila talteen ennen loadStatea — "Tyhjä pohja" ja rampin uusi rivi
const DEFAULT_PLAN_JSON = JSON.stringify(serialize());
// Rampin lomake talteen ennen kuin tulosnäkymä korvaa sen (tulkki.js lisää
// NL-osionsa vasta tämän jälkeen, joten kaappaus on puhdas)
const RAMP_FORM_HTML = $('rampCard') ? $('rampCard').innerHTML : '';

const PLAN_SRC_LABELS = {
  oma: 'oma', ramppi: 'kolmella kysymyksellä', nl: 'omin sanoin kuvattu',
  kopio: 'kopio', tyhja: 'tyhjästä pohjasta', linkki: 'tuotu jakolinkistä', tiedosto: 'tuotu tiedostosta',
};

let plans = null;
let planActiveId = null;
let plansPersistT = null;
let planCmpSel = [];   // vertailuun ruksitut rivit (max 2, istunnon mittainen)
let planMenuEl = null;
let plansFillToken = 0;
const planSimCache = new Map(); // id -> { json, sim } — rivi lasketaan vain muuttuessaan

const planNow = () => Date.now();
const planClone = (o) => (o == null ? null : JSON.parse(JSON.stringify(o)));
function planId() { return 'p' + planNow().toString(36) + Math.random().toString(36).slice(2, 7); }
function activePlan() { return plans ? plans.find((p) => p.id === planActiveId) || null : null; }

function persistPlans(now) {
  clearTimeout(plansPersistT);
  const write = () => {
    try {
      localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
      if (planActiveId) localStorage.setItem(PLAN_ACTIVE_KEY, planActiveId);
    } catch (e) { /* yksityistila tms. */ }
  };
  if (now) write(); else plansPersistT = setTimeout(write, 400);
}

// saveState kutsuu joka muutoksella — rivi päivittyy muistissa heti,
// levylle debouncella (raahaus ei kirjoita jokaista framea)
function syncActivePlan() {
  if (!plans) return;
  const p = activePlan();
  if (!p) return;
  p.data = planClone(serialize());
  p.family = planClone(family);
  p.muokattu = planNow();
  persistPlans();
}

function planUniqueName(base) {
  let n = base, i = 2;
  while (plans.some((p) => p.nimi === n)) n = `${base} ${i++}`;
  return n;
}

function planRowFromCurrent(nimi, alkupera) {
  return {
    id: planId(), nimi, data: planClone(serialize()), family: planClone(family),
    luotu: planNow(), muokattu: planNow(), alkupera: alkupera || 'oma',
  };
}

function addPlanRow(data, fam, nimi, alkupera) {
  if (plans.length >= PLAN_MAX) { toast(`Enintään ${PLAN_MAX} suunnitelmaa — poista jokin ensin`); return null; }
  const row = { id: planId(), nimi, data, family: fam || null, luotu: planNow(), muokattu: planNow(), alkupera: alkupera || 'oma' };
  plans.push(row);
  persistPlans(true);
  track('Suunnitelma luotu', { tapa: row.alkupera });
  return row;
}

function initPlans() {
  try {
    const raw = JSON.parse(localStorage.getItem(PLANS_KEY));
    if (Array.isArray(raw)) plans = raw.filter((p) => p && p.id && p.nimi && p.data && Array.isArray(p.data.events));
  } catch (e) { /* viallinen — aloitetaan puhtaalta */ }
  if (!Array.isArray(plans)) plans = [];
  const hadStored = plans.length > 0;
  try { planActiveId = localStorage.getItem(PLAN_ACTIVE_KEY); } catch (e) {}

  if (visitKind === 'shared' && hadStored) {
    // Jakolinkki ei korvaa mitään olemassa olevaa — linkin sisältö omaksi
    // rivikseen (tarvittaessa katon yli: käyttäjä siivoaa itse)
    const row = planRowFromCurrent(planUniqueName('Tuotu suunnitelma'), 'linkki');
    plans.push(row);
    planActiveId = row.id;
  } else if (!plans.length) {
    // Migraatio ja ensivierailu: nykyinen tila ensimmäiseksi riviksi äänettömästi
    const row = planRowFromCurrent(visitKind === 'shared' ? 'Tuotu suunnitelma' : 'Oma suunnitelma',
      visitKind === 'shared' ? 'linkki' : 'oma');
    plans = [row];
    planActiveId = row.id;
  } else if (!activePlan()) {
    planActiveId = plans[0].id;
  }

  // Peili (STORAGE_KEY) puuttuu mutta rivejä on tallella — esim. nollauksen
  // jälkeen: seuraava rivi aktivoituu eikä käyttäjä näytä ensivierailijalta
  let mirror = null;
  try { mirror = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  if (hadStored && !mirror && visitKind !== 'shared') {
    const p = activePlan();
    family = planClone(p.family);
    if (family) migrateFamily();
    persistFamily();
    applySaved(planClone(p.data));
    visitKind = 'returning';
  }

  persistPlans(true);
  bindPlansHome();
  // Pysyvä tallennustila: selain ei siivoa localStoragea yhtä herkästi
  // (Safari voi muuten poistaa ~7 pv käyttämättömyyden jälkeen)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
}

/* --- Suunnitelman vaihto --- */

function activatePlan(id, opts = {}) {
  const p = plans.find((x) => x.id === id);
  if (!p) return;
  if (p.id !== planActiveId) {
    syncActivePlan(); // nykyinen talteen ennen vaihtoa
    planActiveId = p.id;
    family = planClone(p.family);
    if (family) migrateFamily();
    persistFamily();
    famSimCache.clear();
    jointMc = null;
    undoSuppress = true;
    try {
      applySaved(planClone(p.data));
      closePopover();
      syncInputs();
      renderFamilyChips();
      renderAll();
    } finally { undoSuppress = false; }
    // Kumoamishistoria ei saa vuotaa suunnitelmasta toiseen
    undoStack.length = 0;
    pushUndoNow();
    persistPlans(true);
    track('Suunnitelma avattu');
  }
  if (opts.stay) { renderPlans(); renderSummary(); }
  else closeSummary();
}

function deletePlan(id) {
  const wasActive = id === planActiveId;
  plans = plans.filter((x) => x.id !== id);
  planCmpSel = planCmpSel.filter((x) => x !== id);
  planSimCache.delete(id);
  if (!plans.length) {
    plans = [{ id: planId(), nimi: 'Oma suunnitelma', data: JSON.parse(DEFAULT_PLAN_JSON), family: null, luotu: planNow(), muokattu: planNow(), alkupera: 'oma' }];
  }
  if (wasActive) {
    planActiveId = null;
    activatePlan(plans[0].id, { stay: true });
  } else {
    persistPlans(true);
    renderPlans();
  }
  toast('Suunnitelma poistettu');
}

/* --- Rivien tunnusluvut --- */

function planSim(p) {
  const j = JSON.stringify(p.data);
  const c = planSimCache.get(p.id);
  if (c && c.json === j) return c.sim;
  let s = null;
  try { s = simulate(JSON.parse(j), { sustainable: true }); } catch (e) { /* viallinen rivi — näytetään viivat */ }
  planSimCache.set(p.id, { json: j, sim: s });
  return s;
}

// Riittävyys odotetulla polulla: ✓ loppuikään tai ~ikä jossa varat ehtyvät
function planAdequacy(p, s) {
  if (!s || !s.exp || !(p.data.events || []).some((e) => e.type === 'retirement')) return null;
  const a0 = p.data.ageNow;
  const retAge = s.retireAge != null ? s.retireAge : null;
  if (retAge == null) return null;
  const m0 = Math.max(0, Math.round((retAge - a0) * 12));
  for (let m = m0; m < s.exp.length; m++) {
    if (s.exp[m] <= 0.5) return { ok: false, age: a0 + m / 12 };
  }
  return { ok: true, age: s.a1 != null ? s.a1 : p.data.ageEnd };
}

function planSparkSvg(p, s, adq) {
  const exp = s && s.exp;
  if (!exp || exp.length < 2) return '';
  const n = exp.length, N = 22;
  let max = 1;
  for (let i = 0; i < n; i++) if (exp[i] > max) max = exp[i];
  const X = (m) => 2 + 84 * m / (n - 1);
  const Y = (m) => 24 - Math.max(0, exp[m]) / max * 20;
  const pts = [];
  for (let k = 0; k < N; k++) {
    const m = Math.round(k * (n - 1) / (N - 1));
    pts.push(X(m).toFixed(1) + ',' + Y(m).toFixed(1));
  }
  const warn = adq && !adq.ok;
  const col = warn ? '#fbbf24' : '#2dd4bf';
  const fill = warn ? 'rgba(251,191,36,0.1)' : 'rgba(45,212,191,0.12)';
  let dot = '';
  if (s.retireAge != null) {
    const m = clamp(Math.round((s.retireAge - p.data.ageNow) * 12), 0, n - 1);
    dot = `<circle cx="${X(m).toFixed(1)}" cy="${Y(m).toFixed(1)}" r="2.4" fill="#8b7cf6"/>`;
  }
  const line = pts.join(' ');
  return `<svg width="88" height="26" viewBox="0 0 88 26" aria-hidden="true">` +
    `<polygon points="${line} 86,26 2,26" fill="${fill}"/>` +
    `<polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round"/>${dot}</svg>`;
}

function fillPlanRow(p, rowEl) {
  const s = planSim(p);
  const set = (sel, html) => { const el = rowEl.querySelector(sel); if (el) el.innerHTML = html; };
  if (!s) { set('.m-wret', '—'); set('.m-wd', '—'); set('.m-p', '—'); set('.m-adq', '—'); return; }
  const ret = (p.data.events || []).find((e) => e.type === 'retirement');
  if (s.goal === 'age' && s.solvedRetireAge != null) set('.m-ret', fmtAge(s.solvedRetireAge));
  set('.m-wret', s.wAtRet != null ? `<b>${fmtCompact(s.wAtRet)}</b>` : '—');
  const wd = s.sustainableWd != null ? s.sustainableWd : (ret ? s.withdrawal : null);
  set('.m-wd', wd != null ? fmtEur(wd) + '/kk' : '—');
  const pr = s.successProb != null ? Math.round(s.successProb * 100) : null;
  const pEl = rowEl.querySelector('.m-p');
  if (pEl) { pEl.textContent = pr != null ? pr + ' %' : '—'; pEl.classList.toggle('warn', pr != null && pr < 55); }
  const adq = planAdequacy(p, s);
  const aEl = rowEl.querySelector('.m-adq');
  if (aEl) {
    if (!adq) aEl.textContent = '—';
    else {
      aEl.textContent = adq.ok ? `✓ ${Math.round(adq.age)} v` : `~${Math.floor(adq.age)} v`;
      aEl.classList.add(adq.ok ? 'ok' : 'warn');
    }
  }
  set('.m-spark', planSparkSvg(p, s, adq));
}

/* --- Suunnitelmakodin renderöinti --- */

function renderPlans() {
  const host = $('plansHome');
  if (!host || !plans) return;
  closePlanMenu();
  const token = ++plansFillToken;
  let hasTulkki = false;
  try { hasTulkki = !!localStorage.getItem('vp-tulkki-key'); } catch (e) {}

  let cmpbar = '';
  if (planCmpSel.length === 2) {
    const [a, b] = planCmpSel.map((id) => plans.find((x) => x.id === id));
    if (a && b) {
      cmpbar = `<div class="ph-cmpbar">⚖️ Vertailuun valittu: <b>${escapeHtml(a.nimi)}</b> ja <b>${escapeHtml(b.nimi)}</b>` +
        `<button type="button" class="btn ph-cmp-open" title="${escapeHtml(a.nimi)} avautuu työtilaan ja ${escapeHtml(b.nimi)} piirtyy haamukäyräksi — erot euroina tunnusluvuissa">Avaa rinnakkain →</button></div>`;
    }
  }

  const rows = plans.map((p) => {
    const active = p.id === planActiveId;
    const checked = planCmpSel.includes(p.id);
    const famBadge = p.family && p.family.persons && p.family.persons.length > 1
      ? `<span class="src" title="Perhesuunnitelma · ${p.family.persons.length} henkilöä">👥</span>` : '';
    const srcBadge = p.alkupera === 'linkki' || p.alkupera === 'tiedosto'
      ? `<span class="src" title="${p.alkupera === 'linkki' ? 'Tuotu jakolinkistä' : 'Tuotu tiedostosta'}">⇣</span>` : '';
    const ret = (p.data.events || []).find((e) => e.type === 'retirement');
    return `<div class="ph-row${active ? ' active' : ''}" data-id="${p.id}">` +
      `<label class="ph-check" title="Valitse vertailuun"><input type="checkbox"${checked ? ' checked' : ''}></label>` +
      `<div class="ph-name">${active ? '<span class="dot" title="Auki työtilassa"></span>' : ''}<span class="nm">${escapeHtml(p.nimi)}</span>${famBadge}${srcBadge}<button type="button" class="p-edit" title="Nimeä uudelleen">✎</button></div>` +
      `<div class="num c-ika">${Math.round(p.data.ageNow)} v</div>` +
      `<div class="num m-ret">${ret ? Math.round(ret.age) + ' v' : '—'}</div>` +
      `<div class="num c-saasto"${p.data.savePhases ? ' title="porrastettu säästö — summa elää elämänvaiheittain"' : ''}>${fmtEur(p.data.monthly)}${p.data.savePhases ? '*' : ''}</div>` +
      `<div class="num accent c-wret m-wret">…</div>` +
      `<div class="num violet c-kestava m-wd">…</div>` +
      `<div class="num c-onn m-p">…</div>` +
      `<div class="num m-adq">…</div>` +
      `<div class="ph-spark c-spark m-spark"></div>` +
      `<div class="ph-acts"><button type="button" class="ph-act ph-open"${active ? ' title="Tämä suunnitelma on auki työtilassa"' : ''}>Avaa</button><button type="button" class="ph-more" title="Lisää toimintoja">⋯</button></div>` +
      `</div>`;
  }).join('');

  const thead = `<div class="ph-thead"><span></span><span>Suunnitelma</span>` +
    `<span class="num c-ika">Ikä</span><span class="num">Eläkeikä</span><span class="num c-saasto">Säästö/kk</span>` +
    `<span class="num c-wret">Eläkkeellä</span><span class="num c-kestava">Tulo/kk</span><span class="num c-onn">Onnist.</span>` +
    `<span class="num">Riittävyys</span><span class="num c-spark">Kehitys</span><span></span></div>`;

  const newInner = `<div class="ph-opts">` +
    `<button type="button" class="ph-opt" data-act="ramppi"><b>Kolme kysymystä</b><span>Sama tuttu aloitus — ikä, varallisuus, säästö. Sopii läheisen suunnitelman pohjaksi.</span></button>` +
    (hasTulkki ? `<button type="button" class="ph-opt" data-act="nl"><b>Kerro omin sanoin <em class="beta">BETA</em></b><span>Kuvaile tilanne vapaasti — Tulkki täyttää luvut ja tapahtumat puolestasi.</span></button>` : '') +
    `<button type="button" class="ph-opt" data-act="kopio"><b>Kopio nykyisestä</b><span>Skenaariokokeiluun: sama suunnitelma, eri valinnat rinnakkain.</span></button>` +
    `<button type="button" class="ph-opt" data-act="tyhja"><b>Tyhjä pohja</b><span>Aloita puhtaalta pöydältä oletuspohjalla.</span></button>` +
    `</div><div class="ph-io">` +
    `<input type="text" id="phLinkIn" placeholder="Liitä jakolinkki tähän — suunnitelma tallentuu omaksi rivikseen…">` +
    `<button type="button" class="btn ghost" data-act="tuolinkki">Tuo linkistä</button>` +
    `<button type="button" class="btn ghost" data-act="tuotiedosto">Tuo tiedostosta…</button>` +
    `<button type="button" class="btn ghost" data-act="vie">Vie kaikki varmuuskopioksi</button>` +
    `</div>`;
  // Appi: vaihtoehdot ja tuonti/vienti napin takana — sivu pysyy tiiviinä,
  // ohjeet näkyvät vasta kun uutta suunnitelmaa oikeasti tehdään
  const newSec = vpNativeApp
    ? `<div class="ph-new"><button type="button" class="btn ghost ph-new-toggle">➕ Uusi suunnitelma</button><div class="ph-new-body" hidden>${newInner}</div></div>`
    : `<div class="ph-new"><h3>➕ Uusi suunnitelma</h3>${newInner}</div>`;

  let bytes = 0;
  try { bytes = JSON.stringify(plans).length; } catch (e) {}
  const foot = vpNativeApp
    ? `<div class="ph-foot"><span><b>${plans.length} suunnitelma${plans.length === 1 ? '' : 'a'}</b> · tallessa tällä laitteella</span>` +
      `<span>Jakolinkki kantaa koko suunnitelman: linkki toiselle laitteelle = siirto ja varmuuskopio</span></div>`
    : `<div class="ph-foot">` +
      `<span><b>${plans.length} suunnitelma${plans.length === 1 ? '' : 'a'}</b> · ~${Math.max(1, Math.round(bytes / 1024))} kt · selaimen omassa muistissa</span>` +
      `<span>Yksityisselaimessa tiedot katoavat ikkunan sulkeutuessa — ota varmuuskopio</span>` +
      `<span>Jakolinkki kantaa koko suunnitelman: linkki toiselle laitteelle = siirto</span></div>`;

  host.innerHTML =
    `<div class="ph-head"><h2>Suunnitelmat</h2><p>` +
    (vpNativeApp
      ? `Omat ja lähipiirin suunnitelmat, tallessa <b>vain tällä laitteella</b> — ruksi kaksi riviä vertailuun.`
      : `Omat ja lähipiirin suunnitelmat — kaikki tallessa <b>vain tässä selaimessa</b>. ` +
        `Ruksi kaksi riviä vertailuun, <b>Avaa</b> ottaa suunnitelman työtilaan.`) +
    `</p></div>` +
    cmpbar + `<div class="ph-grid">${thead}${rows}</div>` + newSec + foot;

  // Tunnusluvut täytetään rivi kerrallaan — iso lista ei jumita avausta
  const fillNext = (i) => {
    if (token !== plansFillToken || i >= plans.length) return;
    const p = plans[i];
    const rowEl = host.querySelector(`.ph-row[data-id="${p.id}"]`);
    if (rowEl) fillPlanRow(p, rowEl);
    setTimeout(() => fillNext(i + 1), 0);
  };
  setTimeout(() => fillNext(0), 0);
}

let plansHomeBound = false;
function bindPlansHome() {
  const host = $('plansHome');
  if (!host || plansHomeBound) return;
  plansHomeBound = true;
  host.addEventListener('click', (e) => {
    const nt = e.target.closest('.ph-new-toggle');
    if (nt) {
      const body = host.querySelector('.ph-new-body');
      if (body) body.hidden = !body.hidden;
      return; // ei haptiikkaa — napsu vain piirtopöydän snapeissa
    }
    const opt = e.target.closest('[data-act]');
    if (opt) { handlePlanAct(opt.dataset.act); return; }
    if (e.target.closest('.ph-cmp-open')) { openPlanCompare(); return; }
    const rowEl = e.target.closest('.ph-row');
    if (!rowEl) return;
    const p = plans.find((x) => x.id === rowEl.dataset.id);
    if (!p) return;
    if (e.target.closest('.ph-open')) activatePlan(p.id);
    else if (e.target.closest('.ph-more')) openPlanMenu(e.target.closest('.ph-more'), p, rowEl);
    else if (e.target.closest('.p-edit')) startPlanRename(rowEl, p);
  });
  host.addEventListener('change', (e) => {
    const cb = e.target.closest('.ph-check input');
    if (!cb) return;
    const rowEl = e.target.closest('.ph-row');
    if (rowEl) togglePlanCmp(rowEl.dataset.id, cb.checked);
  });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'phLinkIn') { e.preventDefault(); importPlanLink(e.target.value); }
  });
}

function togglePlanCmp(id, on) {
  planCmpSel = planCmpSel.filter((x) => x !== id);
  if (on) {
    planCmpSel.push(id);
    if (planCmpSel.length > 2) planCmpSel.shift();
  }
  renderPlans();
}

function openPlanCompare() {
  const [aId, bId] = planCmpSel;
  const a = plans.find((x) => x.id === aId), b = plans.find((x) => x.id === bId);
  if (!a || !b) return;
  activatePlan(a.id); // sulkee yhteenvedon
  baseline = planClone(b.data);
  baseline.cmpName = b.nimi;
  ghostDirty = true;
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline)); } catch (e) {}
  renderChart();
  renderStats();
  track('Suunnitelmavertailu');
  toast(`Vertailussa: ${b.nimi} — erot näkyvät käyrällä ja tunnusluvuissa`);
}

function handlePlanAct(act) {
  if (act === 'ramppi') newPlanViaRamp(false);
  else if (act === 'nl') newPlanViaRamp(true);
  else if (act === 'kopio') {
    syncActivePlan();
    const a = activePlan();
    if (!a) return;
    const c = addPlanRow(planClone(a.data), planClone(a.family), planUniqueName('Kopio: ' + a.nimi).slice(0, 40), 'kopio');
    if (c) { activatePlan(c.id); toast('Kopio avattu työtilaan — kokeile eri valintoja, alkuperäinen on tallessa'); }
  } else if (act === 'tyhja') {
    const c = addPlanRow(JSON.parse(DEFAULT_PLAN_JSON), null, planUniqueName('Uusi suunnitelma'), 'tyhja');
    if (c) { activatePlan(c.id); toast('Uusi suunnitelma avattu työtilaan'); }
  } else if (act === 'tuolinkki') {
    const inEl = $('phLinkIn');
    importPlanLink(inEl ? inEl.value : '');
  } else if (act === 'tuotiedosto') pickPlanFile();
  else if (act === 'vie') exportAllPlans();
}

/* --- Nimeäminen ja ⋯-valikko --- */

function startPlanRename(rowEl, p) {
  closePlanMenu();
  const nameEl = rowEl.querySelector('.ph-name');
  if (!nameEl || nameEl.classList.contains('name-edit')) return;
  nameEl.classList.add('name-edit');
  nameEl.innerHTML = `<input type="text" maxlength="40" title="Enter tallentaa · Esc peruu">`;
  const inp = nameEl.querySelector('input');
  inp.value = p.nimi;
  inp.focus();
  inp.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    if (save) {
      const v = inp.value.trim().slice(0, 40);
      if (v && v !== p.nimi) { p.nimi = v; p.muokattu = planNow(); persistPlans(true); }
    }
    renderPlans();
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
}

function closePlanMenu() {
  if (!planMenuEl) return;
  planMenuEl.remove();
  planMenuEl = null;
  document.removeEventListener('pointerdown', onPlanMenuDown, true);
}
function onPlanMenuDown(e) {
  if (planMenuEl && !planMenuEl.contains(e.target) && !e.target.closest('.ph-more')) closePlanMenu();
}

function openPlanMenu(btn, p, rowEl) {
  if (planMenuEl) {
    const same = planMenuEl.dataset.pid === p.id;
    closePlanMenu();
    if (same) return;
  }
  const menu = document.createElement('div');
  menu.className = 'ph-menu';
  menu.dataset.pid = p.id;
  const d = new Date(p.muokattu || p.luotu || planNow());
  menu.innerHTML = `<div class="info">${escapeHtml(p.nimi)} · ${PLAN_SRC_LABELS[p.alkupera] || 'oma'} · muokattu ${d.getDate()}.${d.getMonth() + 1}.</div>`;
  const add = (act, label, fn, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.act = act; // rakenteellinen kahva (testit, ei kielisidontaa)
    if (cls) b.className = cls;
    b.textContent = label;
    b.addEventListener('click', () => { closePlanMenu(); fn(); });
    menu.appendChild(b);
  };
  add('raportti', 'Raportti / PDF', () => {
    activatePlan(p.id, { stay: true });
    const sh = $('sumSheet');
    if (sh) sh.scrollIntoView({ behavior: 'smooth' });
  });
  add('jaa-linkki', 'Jaa linkkinä', async () => {
    const url = planShareUrl(p);
    try { await navigator.clipboard.writeText(url); toast('Linkki kopioitu — koko suunnitelma kulkee linkissä'); }
    catch (e) { window.prompt('Kopioi linkki', url); }
    track('Jakolinkki luotu', { tyyppi: p.family && p.family.persons && p.family.persons.length > 1 ? 'perhe' : 'oma' });
  });
  add('jaa-kuva', 'Jaa tuloskuvana', () => {
    // Kuva piirtyy aktiivisesta simulaatiosta — aktivoidaan rivi ensin
    // (sama malli kuin Raportissa; stay pitää käyttäjän suunnitelmakodissa)
    activatePlan(p.id, { stay: true });
    shareResultImage('suunnitelmat');
  });
  add('kopio', 'Kopioi skenaarioksi', () => {
    const c = addPlanRow(planClone(p.data), planClone(p.family), planUniqueName('Kopio: ' + p.nimi).slice(0, 40), 'kopio');
    if (c) { renderPlans(); toast('Kopio luotu — Avaa ottaa sen työtilaan'); }
  });
  add('lataa', 'Lataa tiedostona', () => {
    downloadJson(planFileName(p), { vp: 'suunnitelma', v: 1, nimi: p.nimi, data: p.data, family: p.family || undefined });
  });
  add('nimea', 'Nimeä uudelleen', () => startPlanRename(rowEl, p));
  const sep = document.createElement('div');
  sep.className = 'sep';
  menu.appendChild(sep);
  add('poista', 'Poista…', () => confirmDeletePlan(p, rowEl), 'danger');
  rowEl.querySelector('.ph-acts').appendChild(menu);
  planMenuEl = menu;
  document.addEventListener('pointerdown', onPlanMenuDown, true);
}

function confirmDeletePlan(p, rowEl) {
  closePlanMenu();
  const menu = document.createElement('div');
  menu.className = 'ph-menu confirm';
  menu.dataset.pid = p.id;
  menu.innerHTML = `<div class="q">Poistetaanko <b>${escapeHtml(p.nimi)}</b>? Tietoja ei voi palauttaa.</div><div class="row"></div>`;
  const row = menu.querySelector('.row');
  const mk = (label, cls, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    row.appendChild(b);
  };
  mk('Poista', 'btn danger-btn', () => { closePlanMenu(); deletePlan(p.id); });
  mk('Peruuta', 'btn ghost', closePlanMenu);
  rowEl.querySelector('.ph-acts').appendChild(menu);
  planMenuEl = menu;
  document.addEventListener('pointerdown', onPlanMenuDown, true);
}

/* --- Jakaminen, tuonti ja vienti --- */

function planShareUrl(p) {
  if (p.family && p.family.persons && p.family.persons.length > 1) {
    return location.origin + location.pathname + '#f=' + btoa(unescape(encodeURIComponent(JSON.stringify(p.family))));
  }
  return location.origin + location.pathname + '#s=' + btoa(unescape(encodeURIComponent(JSON.stringify(p.data))));
}

function planFileName(p) {
  const slug = p.nimi.toLowerCase().replace(/[^a-z0-9äöå]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'suunnitelma';
  return `varallisuuspolku-${slug}.json`;
}

function downloadJson(name, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Tuodun datan validointi täydellä applySaved-siivouksella ilman että työtila
// muuttuu: kierrätetään tila sen läpi ja palautetaan heti ennalleen
function sanitizePlanData(o) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.events)) return null;
  const cur = JSON.stringify(serialize());
  let out = null;
  try { if (applySaved(o)) out = planClone(serialize()); } catch (e) { out = null; }
  applySaved(JSON.parse(cur));
  return out;
}

function importPlanLink(txt) {
  const m = String(txt || '').match(/#(s|f)=([A-Za-z0-9+/=]+)/);
  if (!m) { toast('Linkistä ei löytynyt suunnitelmaa — liitä koko jakolinkki'); return; }
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(m[2]))));
    let row = null;
    if (m[1] === 'f') {
      if (!(validFamily(o) && o.persons.length >= 2)) throw new Error('fam');
      const fam = {
        persons: o.persons.map((q) => ({ pid: q.pid, name: String(q.name || 'Henkilö').slice(0, 16), role: q.role, child: !!q.child, data: q.data })),
        active: clamp(Math.round(o.active || 0), 0, o.persons.length - 1),
      };
      row = addPlanRow(planClone(fam.persons[fam.active].data), fam, planUniqueName('Tuotu suunnitelma'), 'linkki');
    } else {
      const clean = sanitizePlanData(o);
      if (!clean) throw new Error('data');
      row = addPlanRow(clean, null, planUniqueName('Tuotu suunnitelma'), 'linkki');
    }
    if (row) {
      const inEl = $('phLinkIn');
      if (inEl) inEl.value = '';
      renderPlans();
      toast('Suunnitelma tuotu omaksi rivikseen');
    }
  } catch (e) { toast('Linkin sisältöä ei voitu lukea'); }
}

function pickPlanFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.addEventListener('change', () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const o = JSON.parse(String(r.result));
        let n = 0;
        const addOne = (data, fam, nimi) => {
          const clean = sanitizePlanData(data);
          if (!clean) return false;
          const okFam = fam && validFamily(fam) ? planClone(fam) : null;
          return !!addPlanRow(clean, okFam, planUniqueName(String(nimi || 'Tuotu suunnitelma').slice(0, 40)), 'tiedosto');
        };
        if (o && o.vp === 'varmuuskopio' && Array.isArray(o.plans)) {
          for (const q of o.plans) {
            if (!q || !q.data) continue;
            if (addOne(q.data, q.family, q.nimi)) n++;
            else if (plans.length >= PLAN_MAX) break;
          }
        } else if (o && o.vp === 'suunnitelma' && o.data) {
          if (addOne(o.data, o.family, o.nimi)) n = 1;
        } else if (o && Array.isArray(o.events)) {
          if (addOne(o, null, null)) n = 1;
        }
        if (n) { renderPlans(); toast(n === 1 ? 'Suunnitelma tuotu' : `${n} suunnitelmaa tuotu`); }
        else toast('Tiedostosta ei löytynyt suunnitelmaa');
      } catch (e) { toast('Tiedostoa ei voitu lukea'); }
    };
    r.readAsText(f);
  });
  inp.click();
}

function exportAllPlans() {
  syncActivePlan();
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  downloadJson(`varallisuuspolku-varmuuskopio-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`,
    { vp: 'varmuuskopio', v: 1, viety: d.toISOString(), plans });
  toast('Varmuuskopio ladattu — tuo se toisella laitteella "Tuo tiedostosta…"');
  track('Suunnitelmat viety');
}

/* --- Uusi suunnitelma rampin kautta (kolme kysymystä / omin sanoin) --- */
// Uusi rivi luodaan ja aktivoidaan ENNEN rampin avaamista, jotta rampSubmit
// ja Tulkin NL-polku kirjoittavat sen tilaan (ei nykyisen päälle). Peruutus
// poistaa väliaikaisen rivin ja palauttaa edellisen suunnitelman.

let rampFromPlans = false;
let rampPlanPrevId = null;
let rampPlanTempId = null;

function newPlanViaRamp(focusNl) {
  const row = addPlanRow(JSON.parse(DEFAULT_PLAN_JSON), null, planUniqueName('Uusi suunnitelma'), focusNl ? 'nl' : 'ramppi');
  if (!row) return;
  rampPlanPrevId = planActiveId;
  rampPlanTempId = row.id;
  activatePlan(row.id); // sulkee yhteenvedon
  rampFromPlans = true;
  $('rampCard').innerHTML = RAMP_FORM_HTML;
  bindRampForm();
  const skip = $('rampSkip');
  if (skip) skip.textContent = 'Peruuta — takaisin suunnitelmiin';
  // Tulkki injektoi "kerro omin sanoin" -osion uudelleen (vain avaimella)
  document.dispatchEvent(new CustomEvent('vp-ramppi-auki'));
  showRamp();
  if (focusNl) setTimeout(() => { const t = document.getElementById('tkNlText'); if (t) t.focus(); }, 90);
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
initPlans(); // suunnitelmarivit: migraatio, jakolinkki omaksi riviksi, peilin palautus
loadBaseline();

// Paneelin leveys muistetaan: leventäminen palvelee Pro-analyysien pitkiä
// rivejä (X-palaute 24.7.2026). Talteen vain leveällä asettelulla — mobiilin
// automaattileveys ei saa tallentua kiinteäksi.
(() => {
  const panel = document.querySelector('.panel');
  if (!panel) return;
  try {
    const w = parseInt(localStorage.getItem('vp-panel-w'), 10);
    if (w >= 300 && w <= 600) panel.style.width = w + 'px';
  } catch (e) {}
  let t = null;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (!window.matchMedia('(min-width: 981px)').matches) return;
      try { localStorage.setItem('vp-panel-w', String(Math.round(panel.getBoundingClientRect().width))); } catch (e) {}
    }, 300);
  }).observe(panel);
})();
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
  if (rampFromPlans) {
    // Suunnitelmakodista avattu: peruutus poistaa väliaikaisen rivin ja
    // palauttaa edellisen suunnitelman — ei kierrosta, ei suppilotelemetriaa
    rampFromPlans = false;
    plans = plans.filter((p) => p.id !== rampPlanTempId);
    planSimCache.delete(rampPlanTempId);
    persistPlans(true);
    if (rampPlanPrevId && plans.some((p) => p.id === rampPlanPrevId)) activatePlan(rampPlanPrevId);
    rampPlanTempId = rampPlanPrevId = null;
    openSummary();
    return;
  }
  track('Ramppi ohitettu');
  startTour(); // vanha ensivierailupolku: esimerkkisuunnitelma + kierros
}

function showRamp() {
  $('ramp').hidden = false;
  document.addEventListener('keydown', rampEsc, true);
  if (!rampFromPlans) track('Ramppi näytetty');
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
  if (!rampFromPlans) track('Ramppi valmis'); // suunnitelmakodin uusinnat eivät kuulu suppiloon
  rampFromPlans = false;
  rampPlanTempId = rampPlanPrevId = null;
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
  track('Vihje näytetty', { vihje: 'veto' });
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

// Vihjeketju analytiikan aktivointikuiluun: veto → oma tapahtuma → Tulkki.
// Korkeintaan yksi vihje istuntoa kohti ja jokainen kerran ikinä; vaihe
// ohitetaan, jos käyttäjä on jo tehnyt asian itse. Ramppi- ja kierros-
// istunnoissa ketju ei elä — niillä on oma ohjauksensa.
const HINT_EVENT_KEY = 'vp-vihje-tapahtuma';
const HINT_TULKKI_KEY = 'vp-vihje-tulkki';

// Vaihe 2: konkreettiset sirut yleiskehotteen sijaan — rampin "Omistan jo"
// -napin oppi: valmis valinta puree, pelkkä tekstikehote ei. Työeläke ensin,
// koska rampin otsikkoluku näytetään korostetusti ilman sitä.
// Poistuu ensimmäisestä muualle-kosketuksesta tai ajastaan — ei jää tielle.
function showEventHint() {
  const ret = state.events.find((ev) => ev.type === 'retirement');
  const bar = document.createElement('div');
  bar.className = 'polku-hint';
  bar.innerHTML = '<span class="ph-lb">Tarkenna kuvaasi:</span>';
  let tmo = 0;
  const off = () => { clearTimeout(tmo); bar.remove(); document.removeEventListener('pointerdown', outside, true); };
  const outside = (e) => { if (!bar.contains(e.target)) off(); };
  const chip = (txt, valinta, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ph-chip';
    b.dataset.vihje = valinta; // rakenteellinen kahva (testit, ei kielisidontaa)
    b.textContent = txt;
    b.addEventListener('click', () => { track('Vihje käytetty', { vihje: 'tapahtuma', valinta }); off(); fn(); });
    bar.appendChild(b);
  };
  if (ret && !(ret.pension > 0)) chip('🌴 Työeläkkeeni', 'työeläke', () => {
    openPopover(ret.id);
    const f = $('pv-pen');
    if (f) { f.focus(); f.select(); }
  });
  chip('🏠 Asunnon osto', 'asunto', () => addEvent('home', clamp(state.ageNow + 5, state.ageNow, state.ageEnd)));
  chip('👶 Lapsi', 'lapsi', () => addEvent('child', clamp(state.ageNow + 3, state.ageNow, state.ageEnd)));
  wrap.appendChild(bar);
  document.addEventListener('pointerdown', outside, true);
  tmo = setTimeout(off, 15000);
}

// Vaihe 3: ✦-kieleke hehkahtaa kolmesti ja saa ohimenevän tekstin. Tulkin
// avaajat kysyvät keskimäärin 3+ kysymystä mutta vain harva löytää kielekkeen
// — löydettävyysongelma, ei laatuongelma. Reduced-motion: ei hehkua, teksti
// näkyy silti. Sijoitus lasketaan kielekkeestä, jonka asento vaihtelee
// (leveällä pystynä oikeassa reunassa, kapealla vaakana alanurkassa).
function showTulkkiHint() {
  const handle = document.querySelector('.tk-handle');
  if (!handle || document.body.classList.contains('tk-docked')) return false;
  handle.classList.add('tk-pulse');
  const tip = document.createElement('div');
  tip.className = 'tk-nudge';
  tip.textContent = 'Tulkki selittää lukusi selkokielellä — kysy mitä vain';
  const r = handle.getBoundingClientRect();
  if (getComputedStyle(handle).writingMode.startsWith('vertical')) {
    tip.classList.add('side');
    tip.style.right = Math.round(window.innerWidth - r.left + 10) + 'px';
    tip.style.top = Math.round(r.top + r.height / 2) + 'px';
  } else {
    tip.style.right = Math.round(window.innerWidth - r.right) + 'px';
    tip.style.bottom = Math.round(window.innerHeight - r.top + 10) + 'px';
  }
  document.body.appendChild(tip);
  const off = () => {
    tip.remove();
    handle.classList.remove('tk-pulse');
    document.removeEventListener('pointerdown', off, true);
  };
  document.addEventListener('pointerdown', off, true);
  setTimeout(off, 8000);
  return true;
}

// Ketjun askellus: seuraava tekemätön vaihe, yksi per istunto. Kutsutaan
// vain palaavan käyttäjän latauspolulta (ei rampin/kierroksen istunnoissa).
function nextHint() {
  if (fsOn || tourStep >= 0 || !$('ramp').hidden || !$('summary').hidden) return;
  const seen = (k) => { try { return localStorage.getItem(k) === '1'; } catch (e) { return true; } };
  const mark = (k) => { try { localStorage.setItem(k, '1'); } catch (e) {} };
  if (!seen(VETO_HINT_KEY) && !seen(DRAW_TUTOR_KEY)) { showVetoHint(); return; }
  // "Oma tapahtuma jo lisätty" päätellään tilasta: rampista syntyy vain
  // eläketapahtuma, joten mikä tahansa muu kertoo itsenäisestä käytöstä
  if (!seen(HINT_EVENT_KEY) && !state.events.some((ev) => ev.type !== 'retirement')) {
    mark(HINT_EVENT_KEY);
    track('Vihje näytetty', { vihje: 'tapahtuma' });
    showEventHint();
    return;
  }
  if (!seen(HINT_TULKKI_KEY) && !seen('vp-tulkki-intro') && showTulkkiHint()) {
    mark(HINT_TULKKI_KEY);
    track('Vihje näytetty', { vihje: 'tulkki' });
  }
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
    `<button class="btn ghost" id="rampOwn">🔑 Omistan jo asunnon</button>` +
    `<button class="btn ghost" id="rampShare">📸 Jaa tuloskuva</button>` +
    `<button class="btn ghost" id="rampTour">Esittelykierros</button>` +
    `</div>`;
  $('rampOpen').addEventListener('click', () => { closeRamp(); showVetoHint(); toast(`Vinkki: Esittelykierros löytyy ${vpNativeApp ? 'Lisää' : '☰'}-valikosta`); });
  // Jakonappi ei sulje ramppia — jakoarkki avautuu päälle ja käyttäjä jatkaa siitä
  $('rampShare').addEventListener('click', () => shareResultImage('ramppi'));
  // Omistuksen sisäänkäynti: jo omistettu asunto lainoineen puuttuu muuten
  // helposti kokonaan — polku vie suoraan popoveriin täyttämään nykyarvot
  $('rampOwn').addEventListener('click', () => {
    closeRamp();
    track('Omistan jo rampista');
    addEvent('ownHome');
    toast('Täytä asunnon nykyarvo ja jäljellä oleva laina');
  });
  $('rampTour').addEventListener('click', () => { closeRamp(); startTour(); });
}

// Sidonnat funktiona: suunnitelmakoti rakentaa lomakkeen uudelleen (uusi rivi
// kolmella kysymyksellä) ja tarvitsee samat kuuntelijat tuoreisiin elementteihin
function bindRampForm() {
  if ($('rampGo')) $('rampGo').addEventListener('click', rampSubmit);
  if ($('rampSkip')) $('rampSkip').addEventListener('click', (e) => { e.preventDefault(); rampSkip(); });
  for (const id of ['rampAge', 'rampWealth', 'rampMonthly']) {
    if ($(id)) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rampSubmit(); } });
  }
}
bindRampForm();

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
} else if (!autoTourOff && $('summary').hidden) {
  // Palaava käyttäjä ilman ramppia/kierrosta: vihjeketjun vuoro. Viive antaa
  // ensimmäisen laskennan ja käyrän asettua ennen kuin mitään ehdotetaan.
  setTimeout(nextHint, 4000);
}

// Koon muutos vaatii vain geometrian uusiksi — sim ei riipu koosta.
// (Täysi render tässä loisi silmukan: workerin tulos muuttaa tunnuslukujen
// rivitystä → korkeus värähtää → täysi render pyyhkisi tuloksen ja tilaisi uuden.)
new ResizeObserver(() => { if (sim) renderChart(true); }).observe(wrap);

// Offline-tuki: service worker välimuistittaa sovelluksen (verkko ensin,
// välimuisti varalla) — asennettuna PWA toimii ilman verkkoyhteyttä
/* Natiiviappi (Capacitor) lataa tiedostot paikallisesti — SW olisi siellä pelkkä riski */
const vpNativeApp = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
if (!vpNativeApp && 'serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* ei estä käyttöä */ });
}
