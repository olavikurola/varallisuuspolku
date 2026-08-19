'use strict';
// Osa entistä app.js:ää — tiedostot jakavat globaalin skoopin (classic scriptit);
// latausjärjestys index.html:ssä on sitova. Jaettu 25.7.2026, ei sisältömuutoksia.

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
    s: s.retireAge != null ? t('{0} v iässä', Math.round(s.retireAge)) : 'ei eläketapahtumaa',
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
      k: t('Netto {0} v iässä', Math.round(s.a1)),
      v: fmtEur(s.net[s.months]),
      va: fmtCompact(s.net[s.months]),
      cls: 'net',
      s: t('sis. sijoitukset {0} · {1}', fmtCompact(s.wEnd), state.real ? t('nykyrahassa') : t('nimellisarvoin')),
      d: dRow(s.net[s.months], g && (g.net ? g.net[g.months] : g.wEnd), fmtCompact, 500),
    });
  } else {
    cards.push({
      k: t('Sijoitukset {0} v iässä', Math.round(s.a1)),
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
    s: t('{0}/kk{1} + alkupääoma{2}', fmtEur(state.monthly), state.savingsGrowth > 0 ? t(' (+{0} %/v)', fmtLuku(state.savingsGrowth)) : '', s.investedPay > 0.5 ? t(' − lainanhoito {0}', fmtCompact(s.investedPay)) : ''),
  });
  const confTxt = s.conf ? t('{0} % varmuudella', Math.round(s.conf * 100)) : null;
  const p = s.successProb != null ? Math.round(s.successProb * 100) : null;
  const pTxt = p != null ? t('onnistumis-% {0}', p) : null;
  if (s.goal === 'age') {
    cards.push(s.solvedRetireAge != null
      ? { k: 'Aikaisin eläkeikä', v: fmtAge(s.solvedRetireAge), cls: 'accent', s: t('kuukausitulolla {0}/kk', fmtEur(s.withdrawal)) + (confTxt ? ` · ${confTxt}` : '') }
      : { k: 'Aikaisin eläkeikä', v: 'Ei toteudu', cls: 'bad', s: confTxt ? t('tulotarve ei onnistu {0}', confTxt) : 'tulotarve ei onnistu edes suunnitelman lopussa' });
  }
  if (s.goal === 'saving') {
    cards.push(s.requiredMonthly != null
      ? { k: 'Tarvittava säästö', v: `${fmtEur(s.requiredMonthly)}/kk`, cls: s.requiredMonthly > state.monthly ? 'accent' : 'ok', s: `nyt ${fmtEur(state.monthly)}/kk` + (confTxt ? ` · ${confTxt}` : '') }
      : { k: 'Tarvittava säästö', v: 'Ei toteudu', cls: 'bad', s: 'tulotavoite on liian suuri tälle eläkeiälle' });
  }
  // Riittävyys ja onnistumis-% samassa kortissa — kertovat samaa asiaa
  const pDelta = p != null && ghostP != null ? dRow(p, Math.round(ghostP * 100), (x) => `${x} %-yks`, 1) : '';
  if (s.goal === 'withdrawal' && s.goalUnreachable) {
    cards.push({ k: 'Kestävä kuukausitulo', v: 'Ei toteudu', cls: 'bad', s: t('edes 0 €/kk ei riitä {0}', confTxt || '').trim() });
  } else if (s.solvedWithdrawal != null && (s.depletionAge == null || s.depletionAge >= s.a1 - 1)) {
    cards.push({ k: 'Kestävä kuukausitulo', v: `${fmtEur(s.solvedWithdrawal)}/kk`, cls: 'accent',
      s: [s.pension > 0 ? t('sis. työeläke {0}/kk', fmtEur(s.pension)) : null, confTxt || pTxt].filter(Boolean).join(' · ') || t('varat loppuun {0} v mennessä', Math.round(s.a1)),
      d: dRow(s.solvedWithdrawal, g && (g.solvedWithdrawal != null ? g.solvedWithdrawal : g.sustainableWd), (x) => `${fmtLuku(Math.round(x))} €/kk`, 20) });
  } else if (s.depletionAge != null) {
    // %-nostossa "ehtyminen" tarkoittaa tulotarpeen alittumista (salkku ei ehdy)
    const pmWd = proOf(state);
    const pctMode = pmWd && pmWd.wd.mode === 'pct';
    cards.push({
      k: 'Riittävyys',
      v: pctMode ? t('Tulo alittaa tarpeen ~{0} v', Math.round(s.depletionAge)) : t('Ehtyy ~{0} v', Math.round(s.depletionAge)),
      cls: 'bad',
      s: pctMode
        ? [pTxt, t('nosto + työeläke ei kata kuukausitulon tarvetta')].filter(Boolean).join(' · ')
        : [pTxt, t('kokeile lisätä säästöä')].filter(Boolean).join(' · '),
      d: pDelta,
    });
  } else {
    cards.push({ k: 'Riittävyys', v: 'Varat riittävät ✓', cls: 'ok',
      s: [t('{0} v ikään asti', Math.round(s.a1)), pTxt].filter(Boolean).join(' · '), d: pDelta });
  }

  if (s.taxPaid > 0.5) {
    // sama nimi kuin Tulkin vertailurivillä; lyhyet sanat rivittyvät siististi
    cards.push({ k: 'Verot yhteensä', v: fmtEur(s.taxPaid), va: fmtCompact(s.taxPaid), cls: '', s: 'arvio nostoista ja myynneistä',
      d: dRow(s.taxPaid, g && g.taxPaid, fmtCompact, 500, false) });
  }

  // va = tiivis rinnakkaisarvo (esim. 7,1 M€): CSS näyttää sen täyden sijaan
  // vain kapeassa telakkanäkymässä, jotta viisi korttia mahtuu yhdelle riville
  $('stats').innerHTML = cards.map((c) =>
    `<div class="stat"><div class="k">${t(c.k)}</div><div class="v ${c.cls}">${c.va ? `<span class="v-full">${t(c.v)}</span><span class="v-alt">${c.va}</span>` : t(c.v)}</div><div class="s">${t(c.s)}</div>${c.d || ''}</div>`
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
  // Vertailun tila näkyy ⋯-valikon kohdassa, jos valikko on auki.
  // Appin Lisää-sivulla sama id on kytkinrivi, jonka tila elää switchissä —
  // tekstiä ei saa ylikirjoittaa (rikkoisi rivin rakenteen).
  const mi = $('mi-compare');
  if (!mi || mi.classList.contains('vp-kytkinrivi')) return;
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
    row('Kuukausisäästö', `${fmtEur(p.monthly)}/kk` + (p.savingsGrowth ? ` (+${fmtLuku(p.savingsGrowth)} %/v)` : '')) +
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
    html += row(`${def.icon} ${t(def.label)} · ${e.age} v`, desc);
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
      top.map(([tp, share]) => `<span class="cmp-chip">${EVENT_TYPES[tp].icon} ${t(EVENT_TYPES[tp].label)} <b>${Math.round(share * 100)} %</b></span>`).join('') +
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
    if (ev.owned) {
      // Omistus on varallisuutta, ei kulua — summa positiivisena
      amount = -ev.amount;
      amStr = fmtCompact(-ev.amount);
    }
    let loanBadge = ev.amount < 0 && ev.financing === 'loan' ? '<span class="loan-badge">laina</span>' : '';
    if (ev.owned) loanBadge += `<span class="loan-badge">omistan${(ev.loanLeft || 0) > 0 ? ` · lainaa ${fmtCompact(ev.loanLeft)}` : ''}</span>`;
    if (ev.shared) loanBadge += '<span class="loan-badge share-badge">½ jaettu</span>';
    if (ev.type !== 'retirement' && ev.recMonthly) loanBadge += '<span class="loan-badge rec-badge">toistuva</span>';
    if (ev.isAsset && ev.sellAge != null) loanBadge += `<span class="loan-badge sale-badge">myynti ${Math.round(ev.sellAge)} v</span>`;
    const goalBadge = { withdrawal: '→ 0 €', age: 'aikaisin', saving: 'tavoite' }[g];
    if (goalBadge) loanBadge = `<span class="loan-badge zero-badge">${goalBadge}</span>`;
    if (ev.type === 'goal') loanBadge = '<span class="loan-badge goal-badge">🎯 tavoite</span>';
    row.innerHTML =
      `<span class="ic">${def.icon}</span><span class="nm" title="${escapeHtml(evLabel(ev))}">${escapeHtml(evLabel(ev))}</span>` +
      loanBadge +
      `<span class="ag">${ev.owned ? 'nyt' : Math.round(ev.age) + ' v'}</span>` +
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
  // Yksi inflaatiototuus: Pro-tilassa peruskenttä kirjoittaa myös pro.infl:iin.
  // Muuten Pro-oletus ohittaisi kentän hiljaa — "inflaatiolla ei ole vaikutusta"
  // (X-palaute @ArjenArvonnousu 24.7.2026).
  $('inflation').addEventListener('input', (e) => {
    if (!state.pro) return;
    const v = parseFloat(e.target.value);
    if (isNaN(v) || v < 0 || v > 15) return;
    state.pro.infl = clamp(v, 0, 10);
    if (state.proOn) renderProCards(); // Pro-kortin kenttä seuraa heti
  });
}

