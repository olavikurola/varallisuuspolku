'use strict';
// Osa entistä app.js:ää — tiedostot jakavat globaalin skoopin (classic scriptit);
// latausjärjestys index.html:ssä on sitova. Jaettu 25.7.2026, ei sisältömuutoksia.

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
  // opt: askel ohitetaan, jos kohdetta ei ole (tulkki.js ei latautunut)
  { t: 'Kysy AI — Tulkki', s: '.tk-handle', opt: true,
    x: 'Tulkki selittää lukusi selkokielellä ja kokeilee muutoksia puolestasi — sano vaikka ”kokeile eläkeikää 62”, niin näet vaikutuksen esikatseluna ennen kuin mikään muuttuu. Moottori laskee, Tulkki tulkkaa: sijoitusneuvoja se ei anna. Ilmaiskäytössä 5 kysymystä päivässä.' },
  { t: 'Pro-tila', s: '#proSwitch',
    x: 'Kytkin avaa ammattilaissäädöt: omat tuotto-oletukset ja korrelaatiot, kulut, nostostrategiat ja syvemmät analyysit. Perusversio riittää pitkälle — Pro odottaa, kun tarvitset sitä.' },
  { t: 'Piirtopöytä', s: '#fsOpen',
    x: 'Kun perustietosi ovat valmiit, tämä on työpöytäsi: tästä (tai F) aukeaa kokoruudun piirtotila — tartu käyrään, tapahtumaan tai eläkeikäviivaan ja vedä, kone laskee jokaisen vedon hinnan.' },
  { t: 'Suunnitelmani', s: '#summaryBtn',
    x: 'Suunnitelmasi tulostettavana dokumenttina — vaikka varainhoitajalle. Jakolinkki kopioi koko suunnitelman talteen tai kaverille. Täältä näet myös, miten ikätoverisi suunnittelevat talouttaan.' },
  { t: 'Valikko', s: '#moreBtn',
    x: 'Vertailu tallentaa nykyisen suunnitelman haamukäyräksi muutosten taakse. Täältä löytyvät myös Tilastot ja palvelun tiedot.' },
];

// Appissa (Capacitor) navigointi elää alapalkissa: kierros osoittaa tabeihin
// webin piilotettujen nappien sijaan (kelluke, Pro-rivi, yläpalkki, ☰), ja
// tekstit puhuvat laitteesta, eivät selaimesta. Webissä lohko ei tee mitään.
// Tabien ID:t (#vpTabAi ym.) syntyvät alapalkki.js:ssä ennen kierroksen alkua.
if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
  TOUR_STEPS[0].x = TOUR_STEPS[0].x.replace('omassa selaimessasi', 'omalla laitteellasi');
  for (const st of TOUR_STEPS) {
    if (st.s === '.tk-handle') st.s = '#vpTabAi';
    else if (st.s === '#summaryBtn') st.s = '#vpTabSuunnitelma';
    else if (st.s === '#proSwitch') {
      st.s = '#vpTabLisaa';
      st.x = 'Lisää-valikon Asetuksista löytyvä Pro-kytkin avaa ammattilaissäädöt: omat tuotto-oletukset ja korrelaatiot, kulut, nostostrategiat ja syvemmät analyysit. Perusversio riittää pitkälle — Pro odottaa, kun tarvitset sitä.';
    } else if (st.s === '#moreBtn') {
      st.t = 'Lisää';
      st.s = '#vpTabLisaa';
      st.x = 'Lisää-valikosta löytyvät Vuositaulukko, Vertailu ja palvelun tiedot — sekä asetukset: teema, Pro, muistutukset ja sovelluksen lukitus.';
    }
  }
}

function tourShow(i) {
  if (i >= TOUR_STEPS.length) return endTour();
  const st = TOUR_STEPS[i];
  // Valinnainen askel ohitetaan, jos kohde puuttuu — kierros kulkee vain
  // eteenpäin, joten hyppy seuraavaan on turvallinen
  if (st.opt && st.s && !document.querySelector(st.s)) return tourShow(i + 1);
  tourStep = i;
  const tour = $('tour'), hole = $('tourHole'), card = $('tourCard');
  tour.hidden = false;
  const target = st.s ? document.querySelector(st.s) : null;
  // appin taitettu kortti auki ennen valokeilaa (vp-kiinni on vain appissa)
  if (target && target.closest) {
    const taitettu = target.closest('.card.vp-kiinni');
    if (taitettu) taitettu.classList.remove('vp-kiinni');
  }
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
    // appin alapalkki varaa ruudun alaosan — kortti ei saa jäädä sen taakse
    // (laitehavainto 8.8.); webissä palkkia ei ole ja alaraja = ruudun pohja
    const palkki = document.querySelector('.vp-tabbar');
    const alaraja = palkki ? Math.min(vh, palkki.getBoundingClientRect().top) : vh;
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
      if (top + ch > alaraja - 12) top = r.top - ch - 16;   // ei mahdu alle → ylle
      if (top < 12) top = Math.max(12, alaraja - ch - 16);  // ei ylle → alalaitaan
      left = clamp(r.left + r.width / 2 - cw / 2, 12, Math.max(12, vw - cw - 12));
    } else {
      top = Math.min(vh * 0.42 - ch / 2, alaraja - ch - 12);
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

// Täydennä puuttuvat kentät oletuksilla — data-pp-polut osuvat aina.
// Inflaatio peritään Allokaatio-kortin kentästä (yksi totuus, ei hiljaista 2 %:a).
function ensureProShape() {
  const d = defaultPro();
  if (typeof state.inflation === 'number' && isFinite(state.inflation)) d.infl = clamp(state.inflation, 0, 10);
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
  // Yksi inflaatiototuus toiseen suuntaan: Pro-kenttä päivittää peruskentän
  if (path === 'infl' && typeof v === 'number' && isFinite(v)) {
    state.inflation = clamp(v, 0, 15);
    const el = $('inflation');
    if (el) el.value = state.inflation;
  }
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
    .map((n) => `<option value="${n}"${p.mc.paths === n ? ' selected' : ''}>${fmtLuku(n)}</option>`).join('');
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
      + `<span>${t(def.name)} <small>${def.months / 12} v · ${Math.round(def.annual * 100)} %/v ${def.from === 'now' ? t('heti nykyhetkestä') : t('eläkkeelle jäännistä')}</small></span></label>`;
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
      return `<div class="tor-row"><span class="tor-l" title="${escapeHtml(t(r.label))}">${t(r.label)}</span>`
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
    dev(`${names[k]}: tuotto-odotus`, fmtLuku(p.mu[k]), fmtLuku(d.mu[k]), ' %/v');
    dev(`${names[k]}: heilunta`, fmtLuku(p.sigma[k]), fmtLuku(d.sigma[k]), ' %');
  }
  p.assets.forEach((a) => {
    rows.push(`<tr><td>Oma luokka: ${escapeHtml(a.name)}</td><td class="num">${a.mu} %/v · ±${a.sigma} % · paino ${a.weight} %</td><td class="num">—</td></tr>`);
  });
  dev('Inflaatio-oletus', fmtLuku(p.infl), fmtLuku(d.infl), ' %/v');
  dev('Juoksevat kulut (TER)', fmtLuku(p.ter), '0', ' %/v');
  dev('Pääomatulovero', `${p.tax.low}/${p.tax.high}`, '30/34', ' %');
  dev('Veroraja', fmtLuku(p.tax.bracket), '30 000', ' €');
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
  dev('MC-polkuja', fmtLuku(p.mc.paths), '5 000');
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
  const add = (rooli, icon, name, desc, fn) => {
    const b = document.createElement('button');
    b.dataset.rooli = rooli; // rakenteellinen kahva (testit, ei kielisidontaa)
    b.innerHTML = `<div>${icon} ${name}</div><div class="mdesc">${desc}</div>`;
    b.addEventListener('click', fn);
    menu.appendChild(b);
  };
  if (!hasSpouse()) add('spouse', '🧑‍🤝‍🧑', 'Puoliso', 'Oma suunnitelma ja yhteinen käyrä', () => addPerson('spouse'));
  add('child', '🧒', 'Lapsi', 'Oma käyrä jo syntyneelle — lahjarahat ja siirrot', () => addPerson('child'));
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
    // Poistorasti asuu aktiivisen chipin sisällä — rivin viimeisenä nappina se
    // valui kortin reunan yli kolmella henkilöllä eikä koskaan näkynyt
    const del = ci === family.active && ci > 0
      ? `<span class="fam-del${famRemoveArm ? ' armed' : ''}" data-fam="del" role="button" tabindex="0" aria-label="Poista ${escapeHtml(p.name)}" title="Poista ${escapeHtml(p.name)}">✕</span>`
      : '';
    return `<button class="fam-chip${ci === family.active ? ' on' : ''}${p.child ? ' kid' : ''}" data-fam="p${ci}"${style} title="${ci === family.active ? 'Kaksoisnapautus nimeää' : 'Vaihda: ' + escapeHtml(p.name)}">${escapeHtml(p.name)}${del}</button>`;
  }).join('')
    + (family.persons.length < FAM_MAX ? '<button class="fam-add" data-fam="add" title="Lisää puoliso tai lapsi">＋</button>' : '');
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
  // Poistorasti on span chipin sisällä — Enter/välilyönti ei laukea natiivisti
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const b = e.target.closest && e.target.closest('[data-fam="del"]');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    removePerson();
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
const SHARE_FIELDS = ['financing', 'down', 'rate', 'years', 'recMonthly', 'recYears', 'isAsset', 'appr', 'sellTaxFree', 'owned', 'loanLeft', 'boughtYear'];
const SHARE_PRESET = new Set(['home', 'car', 'cottage', 'renovation', 'wedding', 'ownHome', 'ownCottage']); // dialogin esivalinta
const shareable = (e) => {
  const def = EVENT_TYPES[e.type];
  // Omistuksetkin jaetaan: halveShared puolittaa nykyarvon JA jäljellä olevan
  // lainan — kahden puolikkaan annuiteetit summautuvat täyteen erään
  return !!def && !def.familyOnly && !def.metric && e.type !== 'retirement';
};
const isPaired = (e) => !!e.linkId && (e.shared || (EVENT_TYPES[e.type] && EVENT_TYPES[e.type].familyOnly));
const adultPeerIdx = () => family.persons.findIndex((p, i) => i !== family.active && !p.child);
const newLinkId = (pfx) => pfx + (idSeq++) + '-' + Math.floor(Math.random() * 1e6);
function halveShared(e) {
  e.amount = Math.round(e.amount / 2);
  if (e.down != null) e.down = Math.round(e.down / 2);
  if (e.recMonthly != null) e.recMonthly = Math.round(e.recMonthly / 2);
  if (e.loanLeft != null) e.loanLeft = Math.round(e.loanLeft / 2);
}
function unshareEvent(e) {
  e.amount = Math.round(e.amount * 2);
  if (e.down != null) e.down = Math.round(e.down * 2);
  if (e.recMonthly != null) e.recMonthly = Math.round(e.recMonthly * 2);
  if (e.loanLeft != null) e.loanLeft = Math.round(e.loanLeft * 2);
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

