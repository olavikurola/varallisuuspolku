'use strict';

/* Varallisuuspolku — Tulkki (julkinen taso + avainkoodi).
   AI-selittäjä, joka tulkkaa moottorin lukuja selkokielelle. Periaatteet:
   - Moottori (laskenta.js) on totuuden lähde: Tulkki ei laske, vain selittää.
     Lukusidonnat: malli viittaa kontekstin lukuihin [[polku]]-tokeneilla ja UI
     renderöi arvon moottorin tuloksesta — sidottu luku ei voi olla väärin.
     Pehmeä numerovalidointi liputtaa loput (tavallisina kirjoitetut luvut).
   - Tietosuoja: verkon yli kulkee vain suunnitelman anonyymi whitelist-muoto
     (sama buildDonationPayload kuin vertailudatassa), moottorin tunnusluvut
     ja kysymys. Palvelin (palvelin/server.js) on tilaton eikä lokita sisältöä.
   - Julkinen taso: ilman avainta 5 kysymystä/pv (asiakaslaskuri; palvelimella
     oma IP-takaraja). Avainkoodi ohittaa kiintiön ja avaa beta-/omistajakyvyt
     (NL-ramppi, evalityökalut): <sivu>#tulkki=KOODI  (poisto: #tulkki=pois).
   Ladataan classic-skriptinä app.js:n jälkeen — state/sim/yearRows/
   buildDonationPayload/simulate ovat globaaleja. */

(function () {
  const KEY_LS = 'vp-tulkki-key';
  const EVALS_LS = 'vp-tulkki-evals';
  const TAX_YEAR = 2026; // pidä samassa kuin validointi.html
  // Appi puhuu laitteesta, web selaimesta (tietosuojatekstit)
  const APPI = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  /* ---------- Avain ---------- */

  try {
    const m = location.hash.match(/^#tulkki=(.+)$/);
    if (m) {
      const v = decodeURIComponent(m[1]);
      if (v === 'pois') localStorage.removeItem(KEY_LS);
      else localStorage.setItem(KEY_LS, v);
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch (e) { /* localStorage estetty → Tulkki ei käytössä */ }

  let tkKey = null;
  try { tkKey = localStorage.getItem(KEY_LS); } catch (e) {}
  // Julkinen taso: Tulkki näkyy kaikille — avain vain ohittaa kiintiön ja
  // avaa beta-kyvyt. localStorage-esto → ei Tulkkia (kiintiötä ei voi laskea).
  try { localStorage.getItem(KEY_LS); } catch (e) { return; }
  if (typeof buildDonationPayload !== 'function' || typeof yearRows !== 'function') return;

  /* ---------- Julkinen päiväkiintiö (5 kysymystä / selain / pv) ---------- */
  // Asiakaspään laskuri on käyttöliittymän totuus; palvelimella on oma
  // IP-takaraja väärinkäytöksiä vastaan. Avain ohittaa molemmat.

  const QUOTA_LS = 'vp-tulkki-kiintio';
  const QUOTA_MAX = 5;
  const quotaDay = () => new Date().toISOString().slice(0, 10);
  function quotaUsed() {
    try {
      const q = JSON.parse(localStorage.getItem(QUOTA_LS)) || {};
      return q.d === quotaDay() ? (q.n || 0) : 0;
    } catch (e) { return 0; }
  }
  function quotaBump() {
    if (tkKey) return;
    try { localStorage.setItem(QUOTA_LS, JSON.stringify({ d: quotaDay(), n: quotaUsed() + 1 })); } catch (e) {}
    updateQuotaUi();
  }
  const quotaLeft = () => tkKey ? Infinity : Math.max(0, QUOTA_MAX - quotaUsed());

  /* ---------- Konteksti moottorista ---------- */

  const API_BASE = (typeof DATA_API === 'string' ? DATA_API : 'https://varallisuuspolku-data.up.railway.app');

  // HUOM heittomerkki: EI &#39; vaan &apos;. Numeerinen entiteetti sisältää
  // numerot 39, ja richHtml ajaa numSpansin ESCAPETULLE HTML:lle — se käärii
  // "39":n spaniin, jolloin entiteetti hajoaa ja ruudulle jää raaka "&#39;".
  // Oire on käytännössä englannin oire (You're, Here's, you'll) — suomessa
  // heittomerkkejä ei juuri ole. &apos; on numeroton eikä voi rikkoutua näin.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const fmtFi = (v) => v == null ? '–' : (typeof v === 'number' ? fmtLuku(v) : String(v));
  // Plausible-telemetria app.js:n apureilla — vain tapahtuman nimi (+ tila),
  // ei sisältöä, ei tunnisteita. Suppilon mittarointi: avattu → kysymys → pidetty.
  const tkTrack = (n, p) => { try { if (typeof track === 'function') track(n, p); } catch (e) {} };
  const tkTrackOnce = (n, p) => { try { if (typeof trackOnce === 'function') trackOnce(n, p); } catch (e) {} };

  /* ---------- Vertailudata: Vaurastumisen kartan aggregaatit ---------- */
  // Tulkki tuntee saman avoimen vertailudatan kuin analytiikkasivu: stats.json
  // haetaan kerran ja tiivistetään kontekstiin käyttäjän ikäryhmän avain-
  // luvuiksi. Data on palvelimella k-anonymisoitua julkista aggregaattia —
  // tässä ei lähde mitään, vain tuodaan. Haun epäonnistuminen ei estä Tulkkia:
  // vertailu-osio jää pois ja malli sanoo, ettei vertailulukua ole.

  const TK_GROUPS = [
    ['18-24', 18, 24], ['25-29', 25, 29], ['30-34', 30, 34], ['35-39', 35, 39],
    ['40-44', 40, 44], ['45-49', 45, 49], ['50-54', 50, 54], ['55-59', 55, 59],
    ['60-64', 60, 64], ['65+', 65, 120],
  ];
  const tkGroupOf = (age) => (TK_GROUPS.find(([, lo, hi]) => age >= lo && age <= hi) || [null])[0];
  // Leveät kaistat (palvelin laskee 18-34 / 35-49 / 50-64): jakaumat aukeavat
  // ennen 5-vuotisryhmiä — vastaus "minkäikäiset" karkeammin, ei hiljaa koko joukolla
  const TK_WIDE = [['18-34', 18, 34], ['35-49', 35, 49], ['50-64', 50, 64]];
  const tkWideOf = (age) => (TK_WIDE.find(([, lo, hi]) => age >= lo && age <= hi) || [null])[0];

  let vStats = null;   // stats.json sisältö (tai null: ei haettu / ei dataa)
  let vStatsP = null;  // yksi haku per sivulataus — ask() odottaa tätä lyhyesti
  // Suunnitelmien nimipeite: { 'Suunnitelma 1': 'Varovainen' }. Verkkoon menee
  // vain avain, käyttäjälle näytetään arvo. Ks. buildOmatSuunnitelmat.
  let planAliases = {};

  function loadStats() {
    if (!vStatsP) {
      vStatsP = fetch(API_BASE + '/stats.json')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { vStats = (j && j.groups) ? j : null; return vStats; })
        .catch(() => null);
    }
    return vStatsP;
  }

  function hasSharedPlan() {
    try { return !!(JSON.parse(localStorage.getItem('vp-donate-v1')) || {}).donatedHash; } catch (e) { return false; }
  }

  // Kvartiilit pyöristettynä — kontekstin luvut päätyvät myös numerovalidointiin
  const q3 = (q, f) => q ? { p25: f(q.p25), p50: f(q.p50), p75: f(q.p75) } : undefined;

  function buildVertailu() {
    if (!vStats) return null;
    const rnd = Math.round;
    // Porrastus: oma 5-vuotisryhmä → leveä kaista → koko joukko. Pudotus
    // kirjataan ikaryhmanTilanne-kenttään, jotta malli SANOO sen ääneen
    // (aiemmin pudotus oli hiljainen ja käyttäjä luuli saavansa ikäryhmävastauksen)
    const gName = tkGroupOf(state.ageNow);
    const wName = tkWideOf(state.ageNow);
    const own = gName && vStats.groups[gName];
    let g = own, ryhma = gName ? 'ikäryhmä ' + gName : null, taso = 'oma';
    if (!g || !g.monthly) { g = wName && vStats.groups[wName]; ryhma = wName ? 'ikäkaista ' + wName : null; taso = 'kaista'; }
    if (!g || !g.monthly) { g = vStats.groups.all; ryhma = 'kaikki ikäryhmät'; taso = 'kaikki'; }
    const tilanne = {
      omaRyhma: gName, omanRyhmanSuunnitelmia: own ? own.n : 0, julkaisukynnys: vStats.kAnon,
      kaytetty: taso, huom: taso === 'oma' ? undefined
        : `Oman ikäryhmän (${gName}) jakaumat julkaistaan vasta ${vStats.kAnon} suunnitelmasta (nyt ${own ? own.n : 0}) — vertailu on ${taso === 'kaista' ? 'leveämmästä ikäkaistasta ' + wName : 'koko joukosta'}. Sano tämä käyttäjälle.`,
    };
    if (!g || !g.monthly) {
      return {
        jaettujaYhteensa: vStats.total,
        huom: `Vertailudataa ei ole vielä kertynyt riittävästi — jakaumat julkaistaan vasta ${vStats.kAnon} suunnitelman ryhmistä.`,
        ikaryhmanTilanne: tilanne,
        kayttajaOnJakanutOman: hasSharedPlan(),
      };
    }
    const v = {
      selite: 'Palvelun käyttäjien anonyymisti jakamien SUUNNITELMIEN vertailuluvut (mediaani p50, kvartiilit p25/p75). Suunnitelmia, ei toteutunutta varallisuutta — ei normi eikä suositus.',
      ryhma, suunnitelmiaRyhmassa: g.n, jaettujaYhteensa: vStats.total, ikaryhmanTilanne: tilanne,
      kkSaastoEurKk: q3(g.monthly, rnd),
      varallisuusNytEur: q3(g.startCapital, rnd),
      osakepainoPct: q3(g.stocks, rnd),
    };
    if (g.retireAge) v.elakeikaTavoiteV = q3(g.retireAge, rnd);
    if (g.withdrawal) v.kuukausituloTarveEurKk = q3(g.withdrawal, rnd);
    if (g.penShare) v.tyoelakkeenOsuusTulostaPct = rnd(g.penShare.p50 * 100);
    if (g.successProb) v.onnistumistodennakoisyysPct = q3(g.successProb, (x) => rnd(x * 100));
    // Tapahtumien mediaani-iät KAIKISTA julkaistuista tyypeistä (ei vain omista):
    // "missä iässä muut ostavat asunnon" on vastattava, vaikka omassa
    // suunnitelmassa ei asuntoa ole
    if (vStats.eventAges) {
      const ages = {};
      for (const k in vStats.eventAges) { const d = vStats.eventAges[k]; if (d && d.p50 != null) ages[k] = rnd(d.p50); }
      if (Object.keys(ages).length) v.tapahtumienMediaaniIkaV = ages;
    }
    // Kaikkien julkaistujen ryhmien mediaanit ristivertailuun ("säästävätkö
    // 50-vuotiaat enemmän kuin 30-vuotiaat") — vain kynnyksen ylittäneet
    const ryhmat = {};
    for (const k in vStats.groups) {
      const r = vStats.groups[k];
      if (k === 'all' || !r || !r.monthly) continue;
      ryhmat[k] = { n: r.n, kkSaastoEurKk: rnd(r.monthly.p50), varallisuusNytEur: rnd(r.startCapital.p50), osakepainoPct: rnd(r.stocks.p50) };
      if (r.retireAge) ryhmat[k].elakeikaTavoiteV = rnd(r.retireAge.p50);
      if (r.successProb) ryhmat[k].onnistumistodennakoisyysPct = rnd(r.successProb.p50 * 100);
    }
    if (Object.keys(ryhmat).length) v.ryhmat = ryhmat;
    // Asuntolainan tunnusluvut vain jos omassa suunnitelmassa on asuntolaina
    const hl = vStats.homeLoan;
    if (hl && state.events.some((e) => e.type === 'home' && e.financing === 'loan')) {
      v.asuntolainaMediaanit = {
        hintaEur: rnd(hl.price.p50),
        kasirahaOsuusPct: hl.downShare ? rnd(hl.downShare.p50 * 100) : undefined,
        lainaAikaV: hl.years ? rnd(hl.years.p50) : undefined,
        korkoPct: hl.rate ? rnd(hl.rate.p50 * 10) / 10 : undefined,
      };
    }
    v.kayttajaOnJakanutOman = hasSharedPlan();
    return v;
  }

  function buildContext() {
    const s = sim || simulate(state);
    const plan = buildDonationPayload(state, s); // sama anonyymi whitelist kuin vertailudatassa
    // Porrastettu säästö mukaan kontekstiin (pelkkiä lukuja, ei tunnisteita)
    if (Array.isArray(state.savePhases) && state.savePhases.length) {
      plan.savePhases = state.savePhases.map((p) => ({ to: Math.round(p.to), amount: Math.round(p.amount) }));
    }
    const ret = state.events.find((e) => e.type === 'retirement');
    const stats = {
      verovuosi: TAX_YEAR,
      inflaatiokorjattu: !!state.real,
      onnistumistodennakoisyysPct: s.successProb != null ? Math.round(s.successProb * 100) : null,
      varatLoppuvatIka: s.depletionAge != null ? Math.round(s.depletionAge * 10) / 10 : null,
      kestavaKuukausituloEur: s.sustainableWd != null ? Math.round(s.sustainableWd) : null,
      loppuvarallisuusEur: Math.round(Math.max(0, s.wEnd || 0)),
      varallisuusElakkeellaEur: s.wAtRet != null ? Math.round(s.wAtRet) : null,
      verotYhteensaEur: Math.round(s.taxPaid || 0),
      elakeika: ret ? ret.age : null,
      tyoelakeEurKk: s.pension != null ? Math.round(s.pension) : (ret && ret.pension > 0 ? Math.round(ret.pension) : 0),
      tyoelakeArvioEurKk: ret && ret.pension > 0 ? Math.round(ret.pension) : 0,
      kuukausituloTarveEurKk: ret ? Math.round(ret.withdrawal || 0) : null,
    };
    // Vuosivirrat harvennettuna (~max 20 riviä): eläkevuosi ja viimeinen aina mukaan
    const rows = yearRows(s);
    const step = Math.max(1, Math.ceil(rows.length / 18));
    const years = [];
    rows.forEach((r, i) => {
      const isRet = ret && r.age === Math.round(ret.age);
      if (i % step === 0 || i === rows.length - 1 || isRet) {
        years.push([r.age, Math.round(r.inv), Math.round(r.contrib),
          Math.round(r.gross), Math.round(r.tax), Math.round(r.pen)]);
      }
    });
    const ctx = {
      plan, stats,
      years: { selite: '[ikä, sijoitukset €, säästöt €/v, nostot brutto €/v, verot €/v, työeläke €/v]', rivit: years },
    };
    try {
      const vertailu = buildVertailu();
      if (vertailu) ctx.vertailu = vertailu;
    } catch (e) { /* vertailu on rikaste — ei saa estää vastausta */ }
    try {
      const omat = buildOmatSuunnitelmat();
      if (omat) ctx.suunnitelmat = omat;
    } catch (e) { /* rikaste — ei saa estää vastausta */ }
    return ctx;
  }

  /* Profiilit: käyttäjän rinnakkaiset suunnitelmat (Suunnitelmani-sivu)
     tunnuslukuineen. Tulkki vertaa niitä NÄILLÄ moottorin luvuilla — ei
     vertaile-työkalulla, joka vertaa muutoksia aktiiviseen suunnitelmaan.
     planSim käyttää Suunnitelmani-sivun välimuistia, joten tämä on halpa. */
  function buildOmatSuunnitelmat() {
    if (typeof plans === 'undefined' || !Array.isArray(plans) || plans.length < 2) return null;
    const rivit = [];
    planAliases = {};
    for (const p of plans.slice(0, 8)) {
      const d = p.data || {};
      const ps = typeof planSim === 'function' ? planSim(p) : null;
      if (!ps) continue;
      const ret = (d.events || []).find((e) => e.type === 'retirement');
      // TIETOSUOJA: käyttäjän kirjoittama nimi EI lähde verkkoon (vapaa
      // tekstikenttä voi sisältää henkilönimiä). Malli saa geneerisen
      // tunnuksen, joka käännetään takaisin omaksi nimeksi vasta
      // renderöinnissä (localizePlanNames) — nimi pysyy selaimessa.
      const alias = 'Suunnitelma ' + (rivit.length + 1);
      planAliases[alias] = String(p.nimi || alias).slice(0, 40);
      rivit.push({
        nimi: alias,
        aktiivinen: p.id === planActiveId ? true : undefined,
        ikaNyt: d.ageNow,
        kkSaastoEurKk: Math.round(d.monthly || 0),
        elakeika: ret ? Math.round(ret.age) : null,
        onnistumistodennakoisyysPct: ps.successProb != null ? Math.round(ps.successProb * 100) : null,
        varallisuusElakkeellaEur: ps.wAtRet != null ? Math.round(ps.wAtRet) : null,
        kestavaKuukausituloEur: ps.sustainableWd != null ? Math.round(ps.sustainableWd) : null,
        loppuvarallisuusEur: Math.round(Math.max(0, ps.wEnd || 0)),
      });
    }
    if (rivit.length < 2) return null;
    return {
      selite: 'Käyttäjän omat rinnakkaiset suunnitelmat (Suunnitelmani-sivu), moottorin laskemat tunnusluvut. aktiivinen = keskustelun kohteena oleva suunnitelma. Nimet ovat geneerisiä tunnuksia tietosuojasyistä — viittaa niihin juuri näin ("Suunnitelma 1").',
      rivit,
    };
  }

  /* ---------- Pehmeä numerovalidointi ---------- */
  // Kerää kontekstin kaikki luvut; vastauksen luvut, joita ei löydy
  // (±1 tai ±1,5 %), liputetaan varoituksella. Kovat sidonnat myöhemmin.

  function collectNums(v, out) {
    if (typeof v === 'number' && isFinite(v)) out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => collectNums(x, out));
    else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectNums(x, out));
  }

  function numSpans(html, nums) {
    return html.replace(/(\d[\d   ]*(?:,\d+)?)(\s?(?:%|€|v\b))?/g, (m, numStr, unit, off, str) => {
      const val = parseFloat(numStr.replace(/[   ]/g, '').replace(',', '.'));
      if (!isFinite(val)) return m;
      // Vyö ja henkselit escapen rinnalle: numeerisen HTML-entiteetin (&#NNN;)
      // sisus ei ole tekstin luku — sen kääriminen spaniin rikkoisi entiteetin.
      if (off >= 2 && str.slice(off - 2, off) === '&#') return m;
      // vertaa itseisarvoihin: kontekstin −200 000 € vastaa tekstin "200 000 €"
      const ok = nums.some((n) => {
        const b = Math.abs(n);
        return Math.abs(b - val) <= Math.max(1, b * 0.015);
      });
      if (ok) return `<span class="tk-num">${m}</span>`;
      if (val < 10 && !unit) return m; // "kolme asiaa" -tyyppiset pikkuluvut rauhaan
      return `<span class="tk-num tk-doubt" title="${t('Lukua ei löydy moottorin luvuista — suhtaudu varauksella')}">${m}</span>`;
    });
  }

  // Kevyt muotoilu: mallin **lihavointi** renderöidään (raa'at tähdet olivat
  // iso osa "täyteisyyttä"), muu Markdown jää tekstiksi. Ajetaan escapen jälkeen.
  const mdLite = (html) => html.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');

  /* Lukusidonnat: malli kirjoittaa [[stats.polku]] ja UI renderöi arvon
     MOOTTORIN kontekstista — sidottu luku ei voi olla väärin, koska se ei
     koskaan tule mallin tekstistä. Litistetty polku→arvo-kartta rakennetaan
     stats- ja vertailu-osioista (samat, joihin kehote ohjaa viittaamaan). */

  function bindMap(ctx) {
    const map = {};
    const walk = (v, p) => {
      if (typeof v === 'number' && isFinite(v)) map[p] = v;
      else if (Array.isArray(v)) v.forEach((x, i) => walk(x, p + '.' + i));
      else if (v && typeof v === 'object') {
        for (const k in v) walk(v[k], p ? p + '.' + k : k);
      }
    };
    walk({ stats: ctx.stats, vertailu: ctx.vertailu, suunnitelmat: ctx.suunnitelmat }, '');
    // Salliva alias: malli pudottaa joskus etuliitteen (livenä nähty
    // [[verotYhteensaEur]] po. [[stats.verotYhteensaEur]]) — polun häntä
    // kelpaa, jos se on yksikäsitteinen. Ristiriita eri arvoilla → ei aliasta.
    const alias = {};
    for (const p in map) {
      const short = p.replace(/^(?:stats|vertailu)\./, '');
      if (short === p || short in map) continue;
      if (short in alias && alias[short] !== map[p]) alias[short] = null;
      else if (!(short in alias)) alias[short] = map[p];
    }
    for (const k in alias) if (alias[k] != null) map[k] = alias[k];
    return map;
  }

  // Tekstimuotoinen korvaus (ramppi ym. paikat ilman HTML-renderöintiä)
  const plainBinds = (t, map) => String(t).replace(/\[\[([\w.]+)\]\]/g, (m, p) =>
    (map && typeof map[p] === 'number') ? fmtLuku(map[p]) : '?');

  // Yhteinen renderöijä: escape → **b** → sidontatokenit talteen (PUA-merkein,
  // etteivät polkujen numerot osu numSpansiin) → numSpans → tokenit spaneiksi.
  function richHtml(text, nums, bmap) {
    return text.split(/\n{2,}/).map((p) => {
      const marks = [];
      let s = mdLite(esc(p)).replace(/\n/g, '<br>');
      s = s.replace(/\[\[([\w.]+)\]\]/g, (m, path) => {
        if (marks.length >= 96) return m; // varmuuskatto
        marks.push(path);
        return String.fromCharCode(0xE000 + marks.length - 1);
      });
      s = numSpans(s, nums);
      s = s.replace(/[\uE000-\uE05F]/g, (ch) => {
        const path = marks[ch.charCodeAt(0) - 0xE000];
        const v = bmap ? bmap[path] : undefined;
        return (typeof v === 'number')
          ? `<span class="tk-num tk-bound" title="${t('Moottorin luku ({0})', esc(path))}">${fmtLuku(v)}</span>`
          : `<span class="tk-num tk-doubt" title="${t('Viittausta ({0}) ei löydy moottorin luvuista', esc(path))}">?</span>`;
      });
      return `<p>${s}</p>`;
    }).join('');
  }

  /* Geneerinen tunnus takaisin käyttäjän omaksi nimeksi vasta näytöllä —
     nimi ei ole käynyt verkossa. Enintään 8 suunnitelmaa → yksi numero,
     joten "Suunnitelma 1" ei voi osua "Suunnitelma 12":n alkuun. */
  function localizePlanNames(text) {
    if (!text) return text;
    const keys = Object.keys(planAliases);
    if (!keys.length) return text;
    return text.replace(/\bSuunnitelma (\d)\b/g, (m) => planAliases[m] || m);
  }

  function renderAnswer(el, text, nums, bmap) {
    el.innerHTML = richHtml(localizePlanNames(text), nums, bmap);
    return el.querySelectorAll('.tk-doubt').length;
  }

  // Direktiivin (MUUTOS/VERTAILU) häntä ei näy suoratoiston aikana — se
  // jäsennetään ja renderöidään kortiksi vasta virran valmistuttua.
  function stripDirectiveTail(text) {
    const i = text.search(/\n(?:MUUTOS|VERTAILU):/);
    return i >= 0 ? text.slice(0, i) : text;
  }
  function renderStreaming(el, full, nums, bmap) {
    // Keskeneräinen sidontatoken piilotetaan virran hännästä ("[[stats.lop")
    const shown = localizePlanNames(stripDirectiveTail(full).replace(/\[{1,2}[\w.]*$/, ''));
    el.innerHTML = richHtml(shown, nums, bmap) +
      '<span class="tk-cursor" aria-hidden="true"></span>';
  }

  /* ---------- UI ---------- */

  const handle = document.createElement('button');
  handle.className = 'tk-handle';
  handle.type = 'button';
  handle.textContent = t('✦ Kysy AI');
  handle.title = t('Tulkki — kysy suunnitelmastasi');
  // Hiljainen katsastusmerkki: ei sykettä, ei ääntä (kunnioittaa tyyntä ilmettä)
  const badge = document.createElement('i');
  badge.className = 'tk-badge';
  badge.hidden = true;
  handle.appendChild(badge);

  const sheet = document.createElement('aside');
  sheet.className = 'tk-sheet';
  sheet.hidden = true;
  sheet.setAttribute('aria-label', t('Tulkki, tekoälyapuri — kysy suunnitelmastasi'));
  sheet.innerHTML =
    `<header class="tk-head">
      <span class="tk-dot" aria-hidden="true">✦</span>
      <b>Tulkki</b><small>${t('tekoälyapuri')}</small>
      <button type="button" class="tk-x" id="tkClose" aria-label="${t('Sulje Tulkki')}">✕</button>
    </header>
    <button type="button" class="tk-privacy" id="tkPrivacy" title="${t('Selitystä varten välitetään suunnitelmasi luvut nimettöminä ja kysymyksesi sellaisenaan. Nimiä, tunnisteita eikä muita kirjoittamiasi tekstejä ei lähetetä, eikä palvelin tallenna mitään. Napauta nähdäksesi täsmälleen lähtevät tiedot.')}">${t('🔒 Vain nimettömät luvut ja kysymyksesi välitetään — mitään ei tallenneta.')}</button>
    <div class="tk-log" id="tkLog" aria-live="polite"></div>
    <div class="tk-sugs" id="tkSugs"></div>
    <form class="tk-ask" id="tkForm">
      <input id="tkInput" type="text" maxlength="600" autocomplete="off"
        placeholder="${t('Kysy tai kokeile: ”kokeile eläkeikää 62”')}" aria-label="${t('Kysymys Tulkille')}" />
      <button type="submit" aria-label="${t('Lähetä kysymys')}">↑</button>
    </form>
    <div class="tk-foot">
      <button type="button" class="tk-mini" id="tkLogBtn">${t('Tulkin toimet ({0})', 0)}</button>
      <button type="button" class="tk-mini" id="tkEvalCopy"></button>
      <span class="tk-quota" id="tkQuota" title="${t('Ilmaiskäytön päiväkiintiö — nollautuu keskiyöllä')}"></span>
      <span class="tk-cost" id="tkCost"></span>
    </div>`;

  document.body.appendChild(handle);
  document.body.appendChild(sheet);

  // Julkisen tason pikkutyylit injektoidaan tästä tiedostosta (tulkki.js on
  // itsenäinen kerros — style.css:ään ei kosketa tässä erässä)
  const tkCss = document.createElement('style');
  tkCss.textContent =
    '.tk-bound{border-bottom:1px dotted rgba(45,212,191,.55)}' +
    '.tk-fb{display:inline-flex;gap:4px}' +
    '.tk-fb-b{padding:1px 6px;line-height:1.2}' +
    '.tk-quota{font-size:10.5px;color:var(--text-faint);font-variant-numeric:tabular-nums}' +
    '.tk-mailto{display:inline-block;margin-top:7px;padding:4px 12px;border:1px solid rgba(139,124,246,.45);' +
      'border-radius:999px;color:#b9aefc;text-decoration:none;font-size:12px}' +
    '.tk-mailto:hover{background:rgba(139,124,246,.15);color:#d9d2fd}' +
    // Mobiili: kehittäjätieto (malli · tokenit) pois — tila on kortteja varten.
    // Syötekentän fontti ≥16px: alle sen iOS Safari zoomaa sivua fokusoidessa
    // (juurisyy "Tulkki leviää sivuttain" -ilmiölle), 16px estää zoomin.
    '@media (max-width:560px){.tk-cost{display:none}.tk-ask input{font-size:16px}}';
  document.head.appendChild(tkCss);

  const $t = (id) => sheet.querySelector('#' + id);
  const log = $t('tkLog');
  const input = $t('tkInput');
  // Keskusteluhistoria {q, a} — vain muistissa, lähetetään enintään 3 viimeistä.
  // HUOM: nimi ei saa olla "history" — se varjostaisi window.historyn (TDZ)
  // ja rikkoisi avaimen sisäänoton replaceState-siivouksen.
  const chat = [];
  let busy = false;
  let katsastusDismissed = false;

  function openSheet(prefill) {
    sheet.hidden = false;
    handle.classList.add('tk-open');
    document.body.classList.add('tk-docked'); // leveällä näytöllä sisältö väistyy, ei peity
    badge.hidden = true; // nähty
    tkTrackOnce('Tulkki avattu');
    // Kertaesittely heti (kerran ikinä); vertailudata haetaan ensimmäisellä
    // avauksella ja kun se saapuu, chipit päivittyvät ja katsastus renderöityy
    // (näin katsastus voi sisältää myös vertailuhuomion — viive on ~sekunnin)
    renderSugs();
    if (!log.children.length && !introSeen()) renderIntro();
    const hadStats = !!vStats;
    loadStats().then(() => {
      if (sheet.hidden) return;
      if (!hadStats && vStats && !chat.length) renderSugs();
      if (!katsastusDismissed && !chat.length && !log.querySelector('.tk-kats')) renderKatsastus();
    });
    if (prefill) { input.value = prefill; }
    // Mobiilissa EI autofokusta: iOS zoomaa fokusoituun kenttään (→ koko
    // sivu levenee sivuttain pannattavaksi) ja näppäimistö peittäisi lehden
    if (!tkNarrow()) input.focus();
  }
  function closeSheet() {
    sheet.hidden = true;
    handle.classList.remove('tk-open');
    document.body.classList.remove('tk-docked');
  }
  handle.addEventListener('click', () => (sheet.hidden ? openSheet() : closeSheet()));
  $t('tkClose').addEventListener('click', closeSheet);
  $t('tkPrivacy').addEventListener('click', renderPrivacyView);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) closeSheet();
  });

  /* Ehdotuschipit lasketaan avattaessa moottorin tilasta. Ensiavauksella
     enintään kolme (mobiilissa kaksi): kysymykset, jotka EIVÄT toista
     Huomioita, ja yksi toimintochippi. Työkalut (markkinatesti, kysymys-
     lista) ilmestyvät vasta ensimmäisen vastauksen jälkeen — käyttäjä on
     silloin jo sisällä, eikä ensinäkymä täyty. */
  const tkNarrow = () => { try { return matchMedia('(max-width: 560px)').matches; } catch (e) { return false; } };

  function renderSugs() {
    const s = sim;
    const el = $t('tkSugs');
    const hasRet = state.events.some((e) => e.type === 'retirement');
    let html = '';
    if (!chat.length) {
      const sugs = [];
      // Sama asia näkyy Huomioissa Selitä-nappina — ei duplikaattia chippinä
      const huomioissa = s && (s.depletionAge != null || (s.successProb != null && s.successProb < 0.75));
      if (!huomioissa && s && s.successProb != null) sugs.push(t('Miksi onnistumistodennäköisyys on {0} %?', Math.round(s.successProb * 100)));
      // Vertailuchippi vasta kun aggregaattidataa on oikeasti julkaistu
      if (vStats && ((vStats.groups[tkGroupOf(state.ageNow)] || {}).monthly || (vStats.groups[tkWideOf(state.ageNow)] || {}).monthly || (vStats.groups.all || {}).monthly)) {
        sugs.push(t('Miten suunnitelmani vertautuu muihin?'));
      }
      sugs.push(t('Mikä suunnitelmassani on suurin epävarmuus?'));
      sugs.push(t('Mistä verot kertyvät?'));
      // Appissa tyhjä aloitusnäkymä täyttyy ehdotuskorteilla (3 + haasta) —
      // webissä kapea chippirivi kuten ennen
      html = sugs.slice(0, APPI ? 3 : (tkNarrow() ? 1 : 2)).map((q) => `<button type="button" class="tk-sug">${esc(q)}</button>`).join('') +
        `<button type="button" class="tk-sug tk-haasta">${t('🔍 Haasta suunnitelmani')}</button>`;
      if (APPI) html = `<div class="tk-alku-otsikko">${t('Kokeile näitä')}</div>` + html;
    } else {
      // Profiilichippi vain kun rinnakkaisia suunnitelmia oikeasti on
      const hasPlans = typeof plans !== 'undefined' && Array.isArray(plans) && plans.length > 1;
      // Vauhtipyörä: kun oma ikäryhmä ei vielä ylitä julkaisukynnystä eikä
      // käyttäjä ole jakanut, ikäryhmäkysymys on paras hetki pyytää jakoa —
      // deterministinen chippi, ei AI-kutsua (erä 6)
      const ownG = vStats && vStats.groups[tkGroupOf(state.ageNow)];
      const jakoChip = vStats && ownG && !ownG.monthly && !hasSharedPlan() && typeof openDonateModal === 'function'
        ? `<button type="button" class="tk-sug tk-jaa">${t('🤝 Jaa vertailudataan — ikäryhmäsi {0}/{1}', ownG.n, vStats.kAnon)}</button>` : '';
      html = (hasRet ? `<button type="button" class="tk-sug tk-market">${t('📉 Markkinatesti')}</button>` : '') +
        `<button type="button" class="tk-sug tk-haasta">${t('🔍 Haasta suunnitelmani')}</button>` +
        (hasPlans ? `<button type="button" class="tk-sug tk-plans">${t('🗂 Vertaa suunnitelmiani')}</button>` : '') +
        jakoChip +
        `<button type="button" class="tk-sug tk-adv">${t('📋 Kysymyslista varainhoitajalle')}</button>`;
    }
    el.innerHTML = html;
    el.classList.toggle('tk-sugs-alku', APPI && !chat.length);
    el.querySelectorAll('.tk-sug').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.classList.contains('tk-adv')) ask('', 'advisor');
        else if (b.classList.contains('tk-jaa')) { tkTrack('Tulkki jakokehote'); openDonateModal(); }
        else if (b.classList.contains('tk-plans')) ask(t('Vertaa suunnitelmiani keskenään'), 'explain');
        else if (b.classList.contains('tk-haasta')) ask('', 'haasta');
        else if (b.classList.contains('tk-market')) {
          tkTrack('Tulkki markkinatesti');
          const qEl = document.createElement('div');
          qEl.className = 'tk-q'; qEl.textContent = t('Markkinatesti');
          log.appendChild(qEl);
          renderMarketStress();
        } else ask(b.textContent, 'explain');
      });
    });
  }

  /* ---------- Kysely ---------- */

  const API = API_BASE + '/tulkki';

  const ERRORS = {
    bad_key: 'Avainkoodi ei kelpaa. Poista se avaamalla osoite #tulkki=pois ja syötä uusi.',
    rate_limit: 'Kysymyksiä tuli hetkeen liian monta — kokeile tunnin päästä.',
    daily_cap: 'Tulkin päiväraja on täynnä — se lepää huomiseen.',
    quota: 'Päivän ilmaiset kysymykset on käytetty — Tulkki jatkaa huomenna.',
    disabled: 'Tulkki ei ole vielä käytössä palvelimella (ympäristömuuttujat puuttuvat).',
    upstream: 'Tulkin malli ei vastannut — kokeile hetken päästä uudelleen.',
    unreachable: 'Yhteys Tulkkiin epäonnistui — tarkista verkko.',
  };

  // Tilat, jotka eivät tarvitse käyttäjän kysymystä (palvelin määrää tehtävän)
  const NOQ = { advisor: 'Kysymyslista varainhoitajalle', haasta: 'Haasta suunnitelmani' };

  /* ---------- Kiintiön näyttö ja kiinnostuskortti (julkinen taso) ---------- */

  function updateQuotaUi() {
    const el = $t('tkQuota');
    if (!el) return;
    if (tkKey) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = t('{0}/{1} tänään', Math.min(QUOTA_MAX, quotaUsed()), QUOTA_MAX);
  }

  // Kun päiväkiintiö täyttyy: kerrotaan tilanne ja tarjotaan kiinnostuksen
  // ilmaisu — pelkkä Plausible-tapahtuma, ei lomaketta eikä tunnisteita.
  function renderQuotaCard() {
    if (log.querySelector('.tk-quota-card')) { log.scrollTop = log.scrollHeight; return; }
    const card = document.createElement('div');
    card.className = 'tk-change tk-quota-card';
    card.innerHTML =
      `<div class="tk-ch-lab">${t('Päivän {0} ilmaista kysymystä on käytetty', QUOTA_MAX)}</div>` +
      `<div class="tk-ch-note">${t('Tulkki jatkaa huomenna — laskuri ja muut työkalut (markkinatesti, katsastus, vertailu) toimivat normaalisti ilman rajaa. Laajempi maksullinen versio on suunnitteilla: kiinnostuksen ilmaisu auttaa mitoittamaan sen.')}</div>` +
      `<div class="tk-ch-acts"><button type="button" class="tk-keep tk-interest">${t('Olen kiinnostunut laajemmasta käytöstä')}</button></div>`;
    card.querySelector('.tk-interest').addEventListener('click', (ev) => {
      tkTrack('Tukija kiinnostus');
      ev.target.textContent = t('Kiitos — kiinnostus kirjattu ✓');
      ev.target.disabled = true;
      // Sähköposti paljastuu vasta kiinnostuksen jälkeen: yksi ele ensin,
      // syvempi kanava sitä haluavalle — ei kahta kilpailevaa kehotetta
      const more = document.createElement('div');
      more.className = 'tk-ch-note';
      more.innerHTML = t('Halutessasi voit myös kertoa toiveistasi — se auttaa muotoilemaan laajemman version oikein:') + '<br>' +
        '<a class="tk-mailto" href="mailto:info@varallisuuspolku.com?subject=Tukija-kiinnostus">✉ info@varallisuuspolku.com</a>';
      card.appendChild(more);
      log.scrollTop = log.scrollHeight;
    });
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }

  async function ask(question, mode) {
    if (busy) return;
    if (quotaLeft() <= 0) { renderQuotaCard(); return; }
    const q = NOQ[mode] ? t(NOQ[mode]) : (question || input.value.trim());
    if (!NOQ[mode] && !q) return;
    tkTrack('Tulkki kysymys', { mode: mode || 'explain' });
    busy = true;
    input.value = '';
    input.disabled = true;
    handle.classList.add('tk-thinking'); // kahva hengittää työn ajan

    const qEl = document.createElement('div');
    qEl.className = 'tk-q';
    qEl.textContent = q;
    log.appendChild(qEl);
    const aEl = document.createElement('div');
    aEl.className = 'tk-a tk-busy';
    aEl.textContent = t('Tulkki miettii…');
    log.appendChild(aEl);
    log.scrollTop = log.scrollHeight;

    // Vertailudata mukaan jos se ehtii — katto 1,2 s, ettei vastaus odota verkkoa
    try { await Promise.race([loadStats(), new Promise((r) => setTimeout(r, 1200))]); } catch (e) {}

    let ctx = null;
    try { ctx = buildContext(); } catch (e) { /* alla */ }
    if (!ctx) {
      aEl.className = 'tk-a tk-err';
      aEl.textContent = t('Kontekstin rakentaminen moottorista epäonnistui.');
      busy = false; input.disabled = false;
      return;
    }

    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: tkKey, mode: mode || 'explain',
          lang: VP_KIELI, // palvelin valitsee promptin kielen (fi oletus)
          question: NOQ[mode] ? undefined : q,
          context: ctx,
          history: chat.slice(-3),
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        aEl.className = 'tk-a tk-err';
        aEl.textContent = t(ERRORS[data.error] || 'Tulkki-virhe ({0}).', r.status);
        if (data.error === 'quota') {
          // Palvelimen IP-takaraja täyttyi ennen paikallista laskuria (esim.
          // useampi selain samasta verkosta) — synkkaa laskuri ja kerro polku.
          try { localStorage.setItem(QUOTA_LS, JSON.stringify({ d: quotaDay(), n: QUOTA_MAX })); } catch (e) {}
          updateQuotaUi();
          renderQuotaCard();
        }
      } else {
        // Suoratoisto: luetaan NDJSON-virta, teksti ilmestyy token kerrallaan.
        // Direktiivit (MUUTOS/VERTAILU) ja korttien renderöinti vasta lopussa.
        const nums = [];
        collectNums(ctx, nums);
        const bmap = bindMap(ctx); // lukusidonnat: [[polku]] → moottorin arvo
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let sbuf = '', full = '', meta = null, streamErr = null, started = false, toolErr = false;
        const toolCalls = []; // {tool} = palvelimen jäsentämä työkalukutsu (ensisijainen kanava)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sbuf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = sbuf.indexOf('\n')) >= 0) {
            const line = sbuf.slice(0, idx); sbuf = sbuf.slice(idx + 1);
            if (!line.trim()) continue;
            let obj; try { obj = JSON.parse(line); } catch (e) { continue; }
            if (obj.delta) {
              if (!started) { started = true; aEl.className = 'tk-a'; }
              full += obj.delta;
              renderStreaming(aEl, full, nums, bmap);
              log.scrollTop = log.scrollHeight;
            } else if (obj.tool) toolCalls.push(obj.tool);
            else if (obj.toolError) toolErr = true;
            else if (obj.done) meta = obj;
            else if (obj.error) streamErr = obj.error;
          }
        }
        if (!full && !toolCalls.length && !toolErr) {
          aEl.className = 'tk-a tk-err';
          aEl.textContent = t(ERRORS[streamErr] || 'Tulkki ei vastannut — kokeile uudelleen.');
        } else {
          // Ensisijainen kanava: palvelimen jäsentämät työkalukutsut. Tekstiin
          // upotetut rivit jäävät varapoluksi (siirtymävaihe, vanha palvelin).
          // Sama validateChanges ajetaan molemmille — kanava ei ohita sisältöä.
          const tChg = toolCalls.find((t) => t.name === 'ehdota_muutos');
          const tCmpRaw = toolCalls.find((t) => t.name === 'vertaile');
          let toolChange = null, toolRejected = [];
          if (tChg && tChg.input) {
            const v = validateChanges(tChg.input.muutokset);
            toolRejected = v.rejected;
            if (v.list.length) toolChange = { muutokset: v.list, selite: String(tChg.input.selite || '').slice(0, 200) };
          }
          let toolCompare = null;
          if (tCmpRaw && tCmpRaw.input) {
            const opts = [];
            for (const v of (Array.isArray(tCmpRaw.input.vaihtoehdot) ? tCmpRaw.input.vaihtoehdot : []).slice(0, 4)) {
              const { list } = validateChanges(v && v.muutokset);
              if (list.length) opts.push({ nimi: String((v && v.nimi) || t('Vaihtoehto')).slice(0, 40), muutokset: list });
            }
            if (opts.length) toolCompare = { vaihtoehdot: opts, selite: String(tCmpRaw.input.selite || '').slice(0, 200) };
          }
          const cmp = extractCompare(full);
          const parsed = extractChange(full);
          const compare = toolCompare || (cmp && cmp.compare) || null;
          const change = toolChange || parsed.change || null;
          const rejected = toolRejected.length ? toolRejected : parsed.rejected;
          const viallinen = toolErr || (!toolCompare && cmp && cmp.viallinen) || (!toolChange && parsed.viallinen);
          let text = cmp ? cmp.text : parsed.text;
          if (!text) { // työkalukutsu ilman saatetekstiä — selite kelpaa vastaukseksi
            text = (change && change.selite) || (compare && compare.selite) || t('Kokeillaan — katso esikatselu.');
            aEl.className = 'tk-a';
          }
          const doubts = renderAnswer(aEl, text, nums, bmap); // lopullinen: ei kursoria
          quotaBump(); // onnistunut vastaus kuluttaa julkisen kiintiön
          chat.push({ q, a: text });
          renderSugs(); // kysymyschipit väistyvät, työkalut esiin
          const bound = aEl.querySelectorAll('.tk-bound').length;
          const mEl = document.createElement('div');
          mEl.className = 'tk-meta';
          mEl.innerHTML =
            `<span>${t('✓ luvut moottorista')}${bound ? ` · ${t('{0} sidottu', bound)}` : ''}${doubts ? ` · <b class="tk-doubt-n">${t('{0} tarkistamatonta', doubts)}</b>` : ''}</span>` +
            // Palaute: vain arvio Plausibleen (ylos/alas) — EI sisältöä, ei
            // tunnisteita. Avaimella arvio tallentuu myös paikalliseen evaliin.
            `<span class="tk-fb"><button type="button" class="tk-mini tk-fb-b" data-arvio="ylos" title="${t('Hyvä vastaus')}" aria-label="${t('Hyvä vastaus')}">👍</button>` +
            `<button type="button" class="tk-mini tk-fb-b" data-arvio="alas" title="${t('Huono tai epäselvä vastaus')}" aria-label="${t('Huono tai epäselvä vastaus')}">👎</button></span>` +
            (tkKey ? `<button type="button" class="tk-mini tk-eval-b">${t('Tallenna evaliksi')}</button>` : '');
          mEl.querySelectorAll('.tk-fb-b').forEach((b) => b.addEventListener('click', () => {
            tkTrack('Tulkki palaute', { arvio: b.dataset.arvio });
            if (tkKey) saveEval(q, full, ctx, b.dataset.arvio);
            mEl.querySelectorAll('.tk-fb-b').forEach((x) => { x.disabled = true; });
            b.textContent += ' ✓';
          }));
          const evalBtn = mEl.querySelector('.tk-eval-b');
          if (evalBtn) evalBtn.addEventListener('click', (ev) => {
            saveEval(q, full, ctx);
            ev.target.textContent = t('Tallennettu ✓');
            ev.target.disabled = true;
          });
          aEl.appendChild(mEl);
          if (compare) renderCompareCard(compare);
          else if (change) renderChangeCard(change, q);
          else if (viallinen) {
            const note = document.createElement('div');
            note.className = 'tk-change';
            const rr = (cmp && cmp.raakaRivi) || parsed.raakaRivi || '';
            note.innerHTML = `<div class="tk-ch-note">${t('Tulkin komentorivi oli viallinen — mitään ei muutettu. Sano sama hieman toisin, niin yritän uudelleen.')}</div>` +
              (rr ? `<div class="tk-ch-row tk-ch-skip"><code>${esc(rr)}</code></div>` : '');
            log.appendChild(note);
          }
          else if (rejected && rejected.length) {
            const note = document.createElement('div');
            note.className = 'tk-change';
            note.innerHTML = `<div class="tk-ch-note">${t('Tulkki yritti muuttaa kohdetta, jota esikatselu ei vielä tue ({0}) — mitään ei muutettu. Kokeile sanoa tarkemmin, tai tee muutos käsin napauttamalla tapahtumaa aikajanalla.', esc(rejected.join(', ')))}</div>`;
            log.appendChild(note);
          }
          if (meta && meta.usage) {
            // Päiväliite pois mallinimestä — kehittäjätieto tiiviinä
            $t('tkCost').textContent = `${String(meta.model || '').replace(/-\d{8}$/, '')} · ${meta.usage.in}→${meta.usage.out} tok`;
          }
        }
      }
    } catch (e) {
      aEl.className = 'tk-a tk-err';
      aEl.textContent = ERRORS.unreachable;
    }
    log.scrollTop = log.scrollHeight;
    busy = false;
    input.disabled = false;
    handle.classList.remove('tk-thinking');
    if (!tkNarrow()) input.focus(); // mobiilissa näppäimistö ei ponnahda vastauksen päälle
  }

  $t('tkForm').addEventListener('submit', (e) => { e.preventDefault(); ask(); });

  /* ---------- Puhu: muutoskomennot esikatseluna ---------- */
  // Tulkki ei koskaan muuta tilaa suoraan: mallin MUUTOS-rivi validoidaan
  // whitelistiä vasten, muutos ajetaan esikatseluna (vertailuhaamu = tilanne
  // ennen kokeilua) ja käyttäjä painaa Pidä tai Palauta. Epäonnistumistila
  // on aina "ei muutosta". Kentät ja rajat = samat kuin käyttöliittymän
  // säätimissä; skeeman ulkopuoliset kentät hylätään.

  const FIELDS = {
    ageNow:        { nimi: 'Ikä nyt', min: 16, max: 100, yks: VP_YKS_V },
    ageEnd:        { nimi: 'Suunnitelma päättyy', min: 40, max: 105, yks: VP_YKS_V },
    monthly:       { nimi: 'Kuukausisäästö', min: 0, max: 1e6, yks: VP_YKS_EKK },
    startCapital:  { nimi: 'Varallisuus nyt', min: 0, max: 1e9, yks: '€' },
    savingsGrowth: { nimi: 'Säästön vuosikasvu', min: 0, max: 15, yks: VP_YKS_PV },
    allocStocks:   { nimi: 'Osakepaino', min: 0, max: 100, yks: '%' },
    allocBonds:    { nimi: 'Korkopaino', min: 0, max: 100, yks: '%' },
    retAge:        { nimi: 'Eläkeikä', min: 18, max: 100, yks: VP_YKS_V, ret: 'age' },
    withdrawal:    { nimi: 'Kuukausitulon tarve', min: 0, max: 1e6, yks: VP_YKS_EKK, ret: 'withdrawal' },
    pension:       { nimi: 'Työeläke', min: 0, max: 1e6, yks: VP_YKS_EKK, ret: 'pension' },
    pensionAge:    { nimi: 'Työeläkkeen alkamisikä', min: 18, max: 105, yks: VP_YKS_V, ret: 'pensionAge' },
  };

  // Tapahtumien muutettavat ominaisuudet — rajat samat kuin popoverin kentissä.
  // Kohdennus: tyyppi + tarvittaessa tapahtumaIka (useita samaa tyyppiä).
  const EVENT_NAMES = {
    home: 'Asunto', car: 'Auto', cottage: 'Mökki', child: 'Lapsi', divorce: 'Ero',
    renovation: 'Remontti', travel: 'Matka', study: 'Opiskelu', wedding: 'Häät',
    inheritance: 'Perintö', bonus: 'Bonus', sidegig: 'Sivutulo',
    recurring: 'Kuukausierä', income_gap: 'Tulokatko', goal: 'Tavoite',
    ownHome: 'Oma asunto', ownFlat: 'Sijoitusasunto', ownCottage: 'Oma mökki / vene',
  };
  // Omistukset ovat nykytilaa: d-muoto pakottaa iän nykyhetkeen, loanLeft
  // kelpaa vain näille (applySaved normalisoi loput owned-kentät)
  const OWNED_SET = new Set(['ownHome', 'ownFlat', 'ownCottage']);
  const EVENT_PROPS = {
    age:    { nimi: 'ikä', min: 0, max: 105, yks: VP_YKS_V },
    amount: { nimi: 'summa', min: -1e9, max: 1e9, yks: '€' },
    appr:   { nimi: 'arvonnousu', min: -30, max: 15, yks: VP_YKS_PV },
    rate:   { nimi: 'lainan korko', min: 0, max: 25, yks: '%' },
    years:  { nimi: 'laina-aika', min: 1, max: 40, yks: VP_YKS_V },
    down:   { nimi: 'käsiraha', min: 0, max: 1e9, yks: '€' },
    loanLeft: { nimi: 'lainaa jäljellä', min: 0, max: 1e9, yks: '€' },
  };

  let previewBefore = null; // serialize()-kopio ennen kokeilua (null = ei aktiivista)

  // Salliva luku: numero sellaisenaan; merkkijonosta riisutaan välit, tuhat-
  // erottimet ja €, pilkku = desimaali ("3,5" → 3.5). Muu → null (hylätään).
  function luku(v) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(/[\s  €]/g, '').replace(',', '.'));
      if (isFinite(n)) return n;
    }
    return null;
  }

  // Validoi muutosalkioiden lista whitelistiä vasten. Yhteinen sekä MUUTOS-
  // (yksi kokeilu) että VERTAILU-poluille (usea vaihtoehto rinnakkain).
  function validateChanges(arr) {
    const list = [], rejected = [];
    // katto 12: NL-ramppi tuottaa kenttiä + tapahtumia yhtenä listana
    for (const c of (Array.isArray(arr) ? arr : []).slice(0, 12)) {
      // Uusi tapahtuma oletuksilla — summat säädetään saman listan b-alkioilla
      if (c && typeof c.uusi === 'string') {
        const ika = luku(c.ika);
        // Omistus ankkuroituu nykyhetkeen — ika saa puuttua, apply pakottaa sen
        if (EVENT_NAMES[c.uusi] && (ika != null || OWNED_SET.has(c.uusi))) {
          list.push({ uusi: c.uusi, ika: ika != null ? Math.min(105, Math.max(0, Math.round(ika))) : 0 });
        } else rejected.push(('uusi ' + c.uusi).slice(0, 40));
        continue;
      }
      // Tapahtuman poisto — sama kohdennus kuin b-muodossa (tyyppi + ikä)
      if (c && typeof c.poista === 'string') {
        if (EVENT_NAMES[c.poista]) {
          list.push({ poista: c.poista, tapahtumaIka: luku(c.tapahtumaIka) });
        } else rejected.push(('poista ' + c.poista).slice(0, 40));
        continue;
      }
      // Porrastettu säästöaikataulu: koko lista kerralla
      if (c && Array.isArray(c.aikataulu)) {
        const ph = c.aikataulu
          .map((r) => r && { to: luku(r.to), amount: luku(r.amount) })
          .filter((r) => r && r.to != null && r.amount != null)
          .map((r) => ({ to: Math.min(105, Math.max(1, Math.round(r.to))), amount: Math.min(1e6, Math.max(0, r.amount)) }))
          .slice(0, 8);
        if (ph.length) list.push({ aikataulu: ph });
        else rejected.push('aikataulu');
        continue;
      }
      const arvo = c ? luku(c.arvo) : null;
      if (arvo == null) {
        if (c && (c.kentta || c.tapahtuma)) rejected.push(String(c.kentta || c.tapahtuma).slice(0, 32));
        continue;
      }
      const f = FIELDS[c.kentta];
      const p = EVENT_PROPS[c.ominaisuus];
      if (f) {
        list.push({ kentta: c.kentta, arvo: Math.min(f.max, Math.max(f.min, arvo)) });
      } else if (EVENT_NAMES[c.tapahtuma] && p) {
        list.push({
          tapahtuma: c.tapahtuma,
          tapahtumaIka: luku(c.tapahtumaIka),
          ominaisuus: c.ominaisuus,
          arvo: Math.min(p.max, Math.max(p.min, arvo)),
        });
      } else {
        rejected.push(String(c.kentta || (c.tapahtuma ? c.tapahtuma + '.' + c.ominaisuus : 'tuntematon')).slice(0, 40));
      }
    }
    return { list, rejected };
  }

  // Etsii direktiivirivin ("MUUTOS:"/"VERTAILU:"): ensisijaisesti vastauksen
  // lopusta (JSON saa jatkua usealle riville), varalta mistä tahansa kohdasta
  // yhtenä rivinä (malli jatkoi joskus tekstiä rivin jälkeen). Rivi ei koskaan
  // päädy näkyviin sellaisenaan. Palauttaa {payload, text} tai null.
  function extractDirective(raw, nimi) {
    const m = raw.match(new RegExp('\\n' + nimi + ':\\s*(\\{[\\s\\S]*\\})\\s*$'));
    if (m) return { payload: m[1], text: raw.slice(0, m.index).trim() };
    const lines = raw.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (t.startsWith(nimi + ':')) {
        return { payload: t.slice(nimi.length + 1).trim(), text: lines.filter((_, j) => j !== i).join('\n').trim() };
      }
    }
    return null;
  }

  // Direktiivin JSON: suora jäsennys, epäonnistuessa kevyt korjausyritys —
  // malli kirjoittaa lukuja suomalaisittain ("500 000 €"), mikä ei ole JSONia.
  // Korjaukset ovat turvallisia: väli-/tuhaterotinvälit lukujen sisältä,
  // €-merkki luvun perästä, kaarevat lainausmerkit, roikkuva pilkku.
  function parseDirectivePayload(payload) {
    try { return JSON.parse(payload); } catch (e) { /* korjausyritys alla */ }
    const fixed = payload
      .replace(/[“”]/g, '"')
      .replace(/(\d)[   ]+(?=\d)/g, '$1')
      .replace(/(\d)[   ]*€/g, '$1')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(fixed); // heittää edelleen jos ei korjaannu
  }

  // Irrottaa MUUTOS-rivin; palauttaa {text, change|null, rejected, viallinen?}.
  // viallinen = rivi oli olemassa mutta JSON ei auennut — käyttäjälle kerrotaan,
  // ettei mitään tapahtunut (hiljainen nielaisu oli pahin vaihtoehto).
  function extractChange(raw) {
    const d = extractDirective(raw, 'MUUTOS');
    if (!d) return { text: raw, change: null, rejected: [] };
    try {
      const o = parseDirectivePayload(d.payload);
      const { list, rejected } = validateChanges(o.muutokset);
      if (!list.length) return { text: d.text, change: null, rejected };
      return { text: d.text, change: { muutokset: list, selite: String(o.selite || '').slice(0, 200) }, rejected };
    } catch (e) { return { text: d.text, change: null, rejected: [], viallinen: true, raakaRivi: d.payload.slice(0, 160) }; }
  }

  // Irrottaa VERTAILU-rivin: usea nimetty vaihtoehto rinnakkain. Palauttaa
  // {text, compare|null, viallinen?} tai null jos riviä ei ole lainkaan.
  // Vertailu on LUKUPOHJAINEN — ei kosketa tilaan. Viallinen rivi riisutaan
  // näkyvistä ja siitä kerrotaan (ei hiljaista vuotoa vastaustekstiin).
  function extractCompare(raw) {
    const d = extractDirective(raw, 'VERTAILU');
    if (!d) return null;
    try {
      const o = parseDirectivePayload(d.payload);
      const opts = [];
      for (const v of (Array.isArray(o.vaihtoehdot) ? o.vaihtoehdot : []).slice(0, 4)) {
        const { list } = validateChanges(v && v.muutokset);
        if (list.length) opts.push({ nimi: String((v && v.nimi) || t('Vaihtoehto')).slice(0, 40), muutokset: list });
      }
      if (!opts.length) return { text: d.text, compare: null, viallinen: true, raakaRivi: d.payload.slice(0, 160) };
      return { text: d.text, compare: { vaihtoehdot: opts, selite: String(o.selite || '').slice(0, 200) } };
    } catch (e) { return { text: d.text, compare: null, viallinen: true, raakaRivi: d.payload.slice(0, 160) }; }
  }

  // Soveltaa muutokset serialisoituun kopioon; palauttaa rivit näytölle
  function applyChanges(mod, list) {
    const rows = [];
    let ret = (mod.events || []).find((e) => e.type === 'retirement');
    for (const c of list) {
      // Porrastettu säästöaikataulu: korvaa koko aikataulun (ja tasaisen säästön)
      if (c.aikataulu) {
        mod.savePhases = c.aikataulu.slice().sort((a, b) => a.to - b.to);
        mod.monthly = mod.savePhases[0].amount; // perussäästö = 1. vaihe (poiston varalta)
        const n = mod.savePhases.length;
        const desc = mod.savePhases.map((p, i) => i < n - 1
          ? t('{0} €/kk → {1} v', fmtFi(Math.round(p.amount)), p.to)
          : t('{0} €/kk → loppu', fmtFi(Math.round(p.amount)))).join(', ');
        rows.push({ nimi: t('Säästöaikataulu'), desc });
        continue;
      }
      // Uusi tapahtuma: samat oletukset kuin paletista lisätessä (EVENT_TYPES).
      // Lainakentät (käsiraha ym.) täyttyvät applySavedissa LOPULLISESTA
      // summasta — siksi niitä ei aseteta tässä.
      if (c.uusi) {
        const def = EVENT_TYPES[c.uusi];
        mod.events = mod.events || [];
        // Omistus: nykytilan alkuehto — ikä aina nykyhetki, ei rahoituskenttiä
        if (def.owned) {
          const ev = {
            type: c.uusi, age: mod.ageNow, owned: true, amount: def.amount,
            isAsset: true, appr: def.asset.appr,
            loanLeft: def.own.loanLeft, rate: def.own.rate, years: def.own.years,
          };
          if (def.rec) { ev.recMonthly = def.rec.monthly; ev.recYears = def.rec.years; }
          mod.events.push(ev);
          rows.push({ nimi: t('{0} (uusi)', t(EVENT_NAMES[c.uusi])), desc: t('omistus nykyhetkessä — oletusarvot ja -laina') });
          continue;
        }
        const age = Math.min(mod.ageEnd, Math.max(mod.ageNow, c.ika));
        const ev = { type: c.uusi, age, amount: def.amount };
        if (!def.metric) {
          ev.financing = def.defaultFin || 'cash';
          if (def.asset) { ev.isAsset = true; ev.appr = def.asset.appr; }
          if (def.rec) { ev.recMonthly = def.rec.monthly; ev.recYears = def.rec.years; }
        }
        mod.events.push(ev);
        rows.push({ nimi: t('{0} (uusi)', t(EVENT_NAMES[c.uusi])), desc: t('lisätty ikään {0} v', age) });
        continue;
      }
      // Tapahtuman poisto: kohdennus kuten ominaisuusmuutoksessa
      if (c.poista) {
        const label = t('{0} · poisto', t(EVENT_NAMES[c.poista]));
        const cands = (mod.events || []).filter((e) => e.type === c.poista);
        if (!cands.length) { rows.push({ nimi: label, ohitettu: t('ei tällaista tapahtumaa') }); continue; }
        let ev = cands[0];
        if (cands.length > 1) {
          if (c.tapahtumaIka == null) { rows.push({ nimi: label, ohitettu: t('useita samaa tyyppiä — täsmennä ikä') }); continue; }
          ev = cands.reduce((a, b) => Math.abs(a.age - c.tapahtumaIka) <= Math.abs(b.age - c.tapahtumaIka) ? a : b);
        }
        mod.events = mod.events.filter((e) => e !== ev);
        rows.push({ nimi: t('{0} ({1} v)', t(EVENT_NAMES[c.poista]), Math.round(ev.age)), desc: t('poistettu') });
        continue;
      }
      // Tapahtuman ominaisuus: kohdenna tyyppiin, tarvittaessa ikään
      if (c.tapahtuma) {
        const p = EVENT_PROPS[c.ominaisuus];
        const label = t(EVENT_NAMES[c.tapahtuma]) + ' · ' + t(p.nimi);
        const cands = (mod.events || []).filter((e) => e.type === c.tapahtuma);
        if (!cands.length) { rows.push({ nimi: label, ohitettu: t('ei tällaista tapahtumaa') }); continue; }
        let ev = cands[0];
        if (cands.length > 1) {
          if (c.tapahtumaIka == null) { rows.push({ nimi: label, ohitettu: t('useita samaa tyyppiä — täsmennä ikä') }); continue; }
          ev = cands.reduce((a, b) => Math.abs(a.age - c.tapahtumaIka) <= Math.abs(b.age - c.tapahtumaIka) ? a : b);
        }
        // Omistuksen lainakentät elävät loanLeftin varassa, ei financing-lippua
        if ((c.ominaisuus === 'rate' || c.ominaisuus === 'years') && ev.financing !== 'loan' && !(ev.owned && (ev.loanLeft || 0) > 0)) {
          rows.push({ nimi: label, ohitettu: t('tapahtumassa ei ole lainaa') }); continue;
        }
        if (c.ominaisuus === 'down' && ev.financing !== 'loan') {
          rows.push({ nimi: label, ohitettu: t('tapahtumassa ei ole lainaa') }); continue;
        }
        if (c.ominaisuus === 'loanLeft' && !ev.owned) {
          rows.push({ nimi: label, ohitettu: t('vain omistukselle (own*)') }); continue;
        }
        if (c.ominaisuus === 'appr' && !ev.isAsset) {
          rows.push({ nimi: label, ohitettu: t('ei omaisuuserä') }); continue;
        }
        if (c.ominaisuus === 'age' && ev.owned) {
          rows.push({ nimi: label, ohitettu: t('omistus on aina nykyhetkessä') }); continue;
        }
        let arvo = c.arvo;
        if (c.ominaisuus === 'age') arvo = Math.min(mod.ageEnd, Math.max(mod.ageNow, Math.round(arvo)));
        // menotapahtuman summa on tilassa negatiivinen — käyttäjä puhuu positiivisina
        if (c.ominaisuus === 'amount' && typeof ev.amount === 'number' && ev.amount < 0 && arvo > 0) arvo = -arvo;
        const vanha = ev[c.ominaisuus];
        ev[c.ominaisuus] = arvo;
        rows.push({ nimi: t(EVENT_NAMES[c.tapahtuma]) + ' (' + (ev.owned ? t('nyt') : t('{0} v', ev.age)) + ') · ' + t(p.nimi), vanha, uusi: arvo, yks: p.yks });
        continue;
      }
      const f = FIELDS[c.kentta];
      let arvo = c.arvo;
      if (f.ret) {
        if (!ret) {
          // Eläkekenttä ilman eläketapahtumaa → luodaan oletustapahtuma, jotta
          // "kokeile eläkeikää 60" toimii myös tyhjästä (Olavin havainto 7.8.).
          // Esikatselu + Palauta suojaavat kokeilua kuten muitakin muutoksia.
          const def = EVENT_TYPES.retirement;
          ret = {
            type: 'retirement',
            age: Math.min(mod.ageEnd - 1, Math.max(mod.ageNow + 1, def.pensionAge)),
            withdrawal: def.withdrawal, pension: def.pension, pensionAge: def.pensionAge,
          };
          mod.events = mod.events || [];
          mod.events.push(ret);
          rows.push({ nimi: t('Eläkkeelle jäänti'), desc: t('lisätty suunnitelmaan oletuksin (nosto {0} €/kk, työeläke {1} €/kk {2} v alkaen)', def.withdrawal, def.pension, def.pensionAge) });
        }
        if (c.kentta === 'retAge') arvo = Math.min(mod.ageEnd - 1, Math.max(mod.ageNow + 1, Math.round(arvo)));
        const vanha = ret[f.ret];
        ret[f.ret] = arvo;
        rows.push({ nimi: f.nimi, vanha, uusi: arvo, yks: f.yks });
      } else {
        const vanha = mod[c.kentta];
        mod[c.kentta] = arvo;
        rows.push({ nimi: f.nimi, vanha, uusi: arvo, yks: f.yks });
      }
    }
    // osake- ja korkopaino eivät saa ylittää yhteensä sataa
    if (mod.allocStocks + mod.allocBonds > 100) mod.allocBonds = 100 - mod.allocStocks;
    return rows;
  }

  function renderChangeCard(change, cmdQ) {
    const card = document.createElement('div');
    card.className = 'tk-change';
    if (previewBefore) {
      card.innerHTML = `<div class="tk-ch-note">${t('Päätä ensin edellinen kokeilu (Pidä tai Palauta).')}</div>`;
      log.appendChild(card);
      return;
    }
    const before = JSON.parse(JSON.stringify(serialize()));
    const mod = JSON.parse(JSON.stringify(before));
    const rows = applyChanges(mod, change.muutokset);
    const applied = rows.filter((r) => !r.ohitettu);
    if (!applied.length) {
      // Kerro MIKSI mikään ei mennyt läpi — mykkä virhe ei auta ketään
      const miksi = rows.length
        ? rows.map((r) => `<div class="tk-ch-row tk-ch-skip">${esc(t(r.nimi))} · ${esc(r.ohitettu || '')}</div>`).join('')
        : '';
      const vihje = rows.some((r) => r.ohitettu === t('ei tällaista tapahtumaa'))
        ? `<div class="tk-ch-note">${t('Vinkki: pyydä ensin lisäämään tapahtuma (esim. “lisää mökki 65-vuotiaana 150 000 €”), niin luon sen ja säädän summat samalla.')}</div>`
        : '';
      card.innerHTML = `<div class="tk-ch-note">${t('Muutosta ei voitu soveltaa suunnitelmaan:')}</div>` + miksi + vihje;
      log.appendChild(card);
      log.scrollTop = log.scrollHeight;
      return;
    }
    previewBefore = before;
    setBaseline(t('Ennen Tulkin kokeilua')); // haamu = tilanne ennen muutosta
    applySaved(mod);
    syncInputs();
    renderAll();

    const fmt = fmtFi;
    card.innerHTML =
      `<div class="tk-ch-lab">${t('Kokeilu käytössä — vertailu haamuna graafissa')}</div>` +
      (change.selite ? `<div class="tk-ch-sel">${esc(change.selite)}</div>` : '') +
      rows.map((r) => r.ohitettu
        ? `<div class="tk-ch-row tk-ch-skip">${esc(t(r.nimi))} · ${t('ohitettu')} (${esc(r.ohitettu)})</div>`
        : r.desc
        ? `<div class="tk-ch-row">${esc(t(r.nimi))}: <b>${esc(r.desc)}</b></div>`
        : `<div class="tk-ch-row">${esc(t(r.nimi))}: <s>${fmt(r.vanha)}</s> → <b>${fmt(r.uusi)}</b> ${esc(r.yks)}</div>`).join('') +
      `<div class="tk-ch-acts">
        <button type="button" class="tk-keep">${t('Pidä muutos')}</button>
        <button type="button" class="tk-mini tk-revert" title="${t('Palauttaa tilanteen ennen kokeilua')}">${t('Palauta')}</button>
      </div>`;
    card.querySelector('.tk-keep').addEventListener('click', () => {
      // Kirjaa pidetty muutos paikalliseen lokiin ennen previewBeforen nollausta
      saveLogEntry({
        t: new Date().toISOString(),
        q: cmdQ || change.selite || t('Tulkin muutos'),
        selite: change.selite || '',
        rows: applied.map((r) => ({ nimi: r.nimi, vanha: r.vanha, uusi: r.uusi, yks: r.yks || '', desc: r.desc })),
        before: previewBefore,
      });
      previewBefore = null;
      tkTrack('Tulkki muutos pidetty');
      card.querySelector('.tk-ch-lab').textContent = t('Muutos pidetty ✓ — vertailukohta jäi graafiin');
      card.querySelector('.tk-ch-acts').remove();
    });
    card.querySelector('.tk-revert').addEventListener('click', () => {
      applySaved(JSON.parse(JSON.stringify(previewBefore)));
      previewBefore = null;
      syncInputs();
      renderAll();
      clearBaseline();
      card.querySelector('.tk-ch-lab').textContent = t('Palautettu ennalleen');
      card.querySelector('.tk-ch-acts').remove();
    });
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }

  /* ---------- Vertaile: usea vaihtoehto rinnakkain (lukupohjainen) ---------- */
  // Ajaa moottorin jokaiselle vaihtoehdolle kloonatussa tilassa ja näyttää
  // vertailutaulukon. EI kosketa oikeaan tilaan — ei esikatselua, ei perumista.

  function metricsOf(planObj) {
    const s = simulate(planObj, { sustainable: true });
    return {
      succ: s.successProb != null ? Math.round(s.successProb * 100) : null,
      dep: s.depletionAge != null ? Math.round(s.depletionAge) : null,
      sust: s.sustainableWd != null ? Math.round(s.sustainableWd) : null,
      wEnd: Math.round(Math.max(0, s.wEnd || 0)),
      tax: Math.round(s.taxPaid || 0),
    };
  }

  const CMP_ROWS = [
    { k: t('Onnistuminen'), get: (m) => m.succ, fmt: (v) => v == null ? '–' : v + ' %', best: 'max' },
    { k: t('Varat riittävät'), get: (m) => m.dep, fmt: (v) => v == null ? '✓' : t('{0} v', v), best: 'maxNull' },
    { k: t('Kestävä tulo, €/kk'), get: (m) => m.sust, fmt: (v) => v == null ? '–' : fmtFi(v), best: 'max' },
    // tiivis muoto (1,8 M€ / 86 t€): sarakkeet mahtuvat lehteen ilman vaakavieritystä
    { k: t('Loppuvarallisuus'), get: (m) => m.wEnd, fmt: (v) => fmtCompact(v), best: 'max' },
    { k: t('Verot yhteensä'), get: (m) => m.tax, fmt: (v) => fmtCompact(v), best: 'min' },
  ];

  function bestIndex(vals, mode) {
    let bi = -1, bv = null;
    vals.forEach((v, i) => {
      // "loppuun asti" (null depletion) on paras — käsitellään äärettömänä
      const x = (mode === 'maxNull') ? (v == null ? Infinity : v) : v;
      if (x == null) return;
      if (bv == null || (mode === 'min' ? x < bv : x > bv)) { bv = x; bi = i; }
    });
    // jos kaikki samat, ei korosteta mitään
    const distinct = new Set(vals.map((v) => v == null ? 'x' : v));
    return distinct.size > 1 ? bi : -1;
  }

  function renderCompareCard(compare) {
    const card = document.createElement('div');
    card.className = 'tk-cmp';
    let base;
    try {
      base = JSON.parse(JSON.stringify(serialize()));
      const cols = [{ nimi: t('Nykyinen'), m: metricsOf(base) }];
      for (const v of compare.vaihtoehdot) {
        const mod = JSON.parse(JSON.stringify(base));
        applyChanges(mod, v.muutokset);
        cols.push({ nimi: v.nimi, m: metricsOf(mod) });
      }
      const head = `<tr><th></th>${cols.map((c) => `<th>${esc(c.nimi)}</th>`).join('')}</tr>`;
      const body = CMP_ROWS.map((row) => {
        const vals = cols.map((c) => row.get(c.m));
        const bi = bestIndex(vals, row.best);
        const cells = vals.map((v, i) =>
          `<td class="${i === bi ? 'tk-cmp-best' : ''}">${esc(row.fmt(v))}</td>`).join('');
        return `<tr><th>${row.k}</th>${cells}</tr>`;
      }).join('');
      card.innerHTML =
        `<div class="tk-cmp-lab">${t('Vertailu — moottori laski jokaisen vaihtoehdon')}</div>` +
        (compare.selite ? `<div class="tk-ch-sel">${esc(compare.selite)}</div>` : '') +
        `<div class="tk-cmp-scroll"><table class="tk-cmp-tbl">${head}${body}</table></div>` +
        `<div class="tk-cmp-note">${t('Suunnitelmaasi ei muutettu. Ota jokin käyttöön sanomalla esim. “ota käyttöön {0}”.', esc(compare.vaihtoehdot[0].nimi))}</div>`;
    } catch (e) {
      card.innerHTML = `<div class="tk-ch-note">${t('Vertailun laskenta epäonnistui.')}</div>`;
    }
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }

  /* ---------- Tulkin toimet: paikallinen muutosloki ---------- */
  // Kirjaa jokaisen PIDETYN Tulkin muutoksen paikallisesti. EI koskaan lähetetä
  // mihinkään — käyttäjän oma kirjaus. Ei sääntelyvelvoitetta (paikallinen),
  // hyötynä läpinäkyvyys, palautus mihin tahansa hetkeen ja vienti tiedostona.

  const LOG_LS = 'vp-tulkki-log';
  function tkActions() {
    try { return JSON.parse(localStorage.getItem(LOG_LS) || '[]'); } catch (e) { return []; }
  }
  function saveLogEntry(entry) {
    const list = tkActions();
    list.push(entry);
    while (list.length > 60) list.shift(); // katto: vanhin pois
    try { localStorage.setItem(LOG_LS, JSON.stringify(list)); } catch (e) {}
    updateLogBtn();
  }
  function updateLogBtn() {
    const b = $t('tkLogBtn');
    if (b) b.textContent = t('Tulkin toimet ({0})', tkActions().length);
  }

  /* "Näytä mitä lähetetään" — sama läpinäkyvyys kuin vertailudatan
     esikatselussa: tietosuojarivin napautus näyttää täsmälleen sen
     kontekstin, joka kysymyksen mukana lähtisi. Kaikki lasketaan
     paikallisesti — tämän avaaminen EI lähetä mitään. */
  function renderPrivacyView() {
    const existing = log.querySelector('.tk-priv-view');
    if (existing) { existing.remove(); return; } // toggle
    const card = document.createElement('div');
    card.className = 'tk-priv-view';
    let json;
    try { json = JSON.stringify(buildContext(), null, 2); }
    catch (e) { json = t('Kontekstia ei voitu laskea — kokeile kun suunnitelmassa on lukuja.'); }
    card.innerHTML =
      `<div class="tk-kats-head"><span>${t('Mitä Tulkille lähtee?')}</span><button type="button" class="tk-kats-x" aria-label="${t('Sulje')}">✕</button></div>` +
      `<div class="tk-ch-note">${t('Tämä on täsmälleen se aineisto, joka lähtisi kysymyksesi mukana: moottorin laskemat nimettömät luvut. Rinnakkaisten suunnitelmien nimet on korvattu tunnuksilla (Suunnitelma 1) — oma nimesi näkyy vain sinulle. Mitään ei lähde ennen kuin kysyt.')}</div>` +
      `<pre class="tk-priv-json">${esc(json)}</pre>`;
    card.querySelector('.tk-kats-x').addEventListener('click', () => card.remove());
    log.appendChild(card);
    log.scrollTop = card.offsetTop;
    tkTrack('Tulkki tietosuojakatselu');
  }

  function renderLogView() {
    const existing = log.querySelector('.tk-actions');
    if (existing) { existing.remove(); return; } // toggle
    const list = tkActions();
    const card = document.createElement('div');
    card.className = 'tk-actions';
    let html = `<div class="tk-kats-head"><span>${t('Tulkin toimet')}</span><button type="button" class="tk-kats-x" aria-label="${t('Sulje')}">✕</button></div>`;
    if (!list.length) {
      html += '<div class="tk-ch-note">' + (APPI
        ? t('Tulkki ei ole vielä muuttanut suunnitelmaasi. Pidetyt muutokset kirjautuvat tähän — vain sinun laitteellesi, ei minnekään muualle.')
        : t('Tulkki ei ole vielä muuttanut suunnitelmaasi. Pidetyt muutokset kirjautuvat tähän — vain sinun selaimeesi, ei minnekään muualle.')) + '</div>';
    } else {
      html += `<div class="tk-act-tools"><button type="button" class="tk-mini tk-act-export">${t('Lataa loki')}</button><button type="button" class="tk-mini tk-act-clear">${t('Tyhjennä')}</button></div>`;
      html += list.slice().reverse().map((e, ri) => {
        const idx = list.length - 1 - ri;
        const when = e.t ? e.t.slice(0, 16).replace('T', t(' klo ')) : '';
        const chg = (e.rows || []).map((r) => r.desc
          ? `${esc(t(r.nimi))}: ${esc(r.desc)}`
          : `${esc(t(r.nimi))}: ${fmtFi(r.vanha)} → ${fmtFi(r.uusi)} ${esc(r.yks || '')}`).join('; ');
        return `<div class="tk-act-row"><div class="tk-act-top"><span class="tk-act-when">${esc(when)}</span>` +
          `<button type="button" class="tk-mini tk-act-revert" data-i="${idx}" title="${t('Palauta suunnitelma tätä muutosta edeltäneeseen tilaan')}">${t('Palauta tähän')}</button></div>` +
          `<div class="tk-act-q">${esc(e.q || '')}</div><div class="tk-act-chg">${chg}</div></div>`;
      }).join('');
    }
    card.innerHTML = html;
    card.querySelector('.tk-kats-x').addEventListener('click', () => card.remove());
    const exp = card.querySelector('.tk-act-export');
    if (exp) exp.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(tkActions(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tulkin-toimet.json';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    const clr = card.querySelector('.tk-act-clear');
    if (clr) clr.addEventListener('click', () => {
      try { localStorage.removeItem(LOG_LS); } catch (e) {}
      updateLogBtn();
      card.remove();
    });
    card.querySelectorAll('.tk-act-revert').forEach((b) => b.addEventListener('click', () => {
      const e = tkActions()[+b.dataset.i];
      if (!e || !e.before) return;
      previewBefore = null; // mahdollinen aktiivinen esikatselu väistyy
      applySaved(JSON.parse(JSON.stringify(e.before)));
      syncInputs();
      renderAll();
      clearBaseline();
      b.textContent = t('Palautettu ✓');
      b.disabled = true;
    }));
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }

  $t('tkLogBtn').addEventListener('click', renderLogView);
  updateLogBtn();
  updateQuotaUi();

  /* ---------- Markkinatesti: moottorin stressiskenaariot (lukupohjainen) ---------- */
  // Sekvenssiriski: mitä jos markkina käyttäytyy huonosti juuri eläkkeelle
  // jäädessä. Moottorin valmiit stressit ajetaan kloonilla — deterministinen,
  // EI AI-kutsua. bear/seqNow on opetuspari: sama karhu eläkkeen alussa vs.
  // heti tänään näyttää sekvenssiriskin suuruuden.

  const STRESS_KEYS = ['bear', 'seqNow', 'crash', 'lost', 'stagf', 'rates'];

  function runMarketStress() {
    const base = JSON.parse(JSON.stringify(serialize()));
    if (!(base.events || []).some((e) => e.type === 'retirement')) return null;
    const mod = JSON.parse(JSON.stringify(base));
    if (!mod.proOn || !mod.pro) {
      mod.proOn = true;
      mod.pro = { mc: { stress: STRESS_KEYS.slice() } };
    } else {
      mod.pro = JSON.parse(JSON.stringify(mod.pro));
      mod.pro.mc = Object.assign({}, mod.pro.mc, { stress: STRESS_KEYS.slice() });
    }
    // Oma inflaatio-oletus mukaan, jotta stressin pohja vastaa suunnitelmaa
    if (typeof base.inflation === 'number' && base.inflation !== 2) mod.pro.infl = base.inflation;
    let s;
    try { s = simulate(mod); } catch (e) { return null; }
    if (!Array.isArray(s.stress) || !s.stress.length) return null;
    const cols = [{
      nimi: t('Nykyinen'),
      wEnd: Math.round(Math.max(0, s.exp[s.months] || 0)),
      dep: s.depletionAge != null ? Math.round(s.depletionAge) : null,
    }];
    for (const st of s.stress) {
      cols.push({
        nimi: t(st.name),
        wEnd: Math.round(Math.max(0, st.arr[st.arr.length - 1] || 0)),
        dep: st.depletion != null ? Math.round(st.depletion) : null,
      });
    }
    return cols;
  }

  function renderMarketStress() {
    const card = document.createElement('div');
    card.className = 'tk-cmp';
    const cols = runMarketStress();
    if (!cols) {
      card.innerHTML = `<div class="tk-ch-note">${t('Markkinatesti tarvitsee eläketapahtuman — lisää se ensin, niin näet sekvenssiriskin.')}</div>`;
      log.appendChild(card); log.scrollTop = log.scrollHeight;
      return;
    }
    // Käännetty taulukko: skenaariot riveinä — pitkät nimet mahtuvat kapeaan lehteen
    const head = `<tr><th></th><th>${t('Loppuvarallisuus')}</th><th>${t('Varat riittävät')}</th></tr>`;
    const biW = bestIndex(cols.map((c) => c.wEnd), 'max');
    const biD = bestIndex(cols.map((c) => c.dep), 'maxNull');
    const body = cols.map((c, i) =>
      `<tr><th>${esc(c.nimi)}</th>` +
      `<td class="${i === biW ? 'tk-cmp-best' : ''}">${esc(fmtCompact(c.wEnd))}</td>` +
      `<td class="${i === biD ? 'tk-cmp-best' : ''}">${esc(c.dep == null ? '✓' : t('{0} v', c.dep))}</td></tr>`
    ).join('');
    card.innerHTML =
      `<div class="tk-cmp-lab">${t('Markkinatesti — moottori ajoi {0} stressiskenaariota', cols.length - 1)}</div>` +
      `<div class="tk-ch-sel">${t('Sekvenssiriski: sama suunnitelma, jos markkina käyttäytyy huonosti eläkkeelle jäädessäsi.')}</div>` +
      `<div class="tk-cmp-scroll"><table class="tk-cmp-tbl">${head}${body}</table></div>` +
      `<div class="tk-cmp-note">${t('Deterministiset skenaariot, eivät ennuste. Suunnitelmaasi ei muutettu. Kysy “miksi karhumarkkina osuu näin” niin selitän.')}</div>`;
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }

  /* ---------- Evalien keräys (golden-setti oikeasta käytöstä) ---------- */

  function evals() {
    try { return JSON.parse(localStorage.getItem(EVALS_LS) || '[]'); } catch (e) { return []; }
  }
  // arvio ('ylos'/'alas') tulee peukkupalautteesta — golden-settiä kootessa
  // alas-arviot ovat arvokkaimpia (regressiotapaus: näin EI saa vastata)
  function saveEval(q, a, ctx, arvio) {
    const list = evals();
    const e = { t: new Date().toISOString(), q, a, context: ctx };
    if (arvio) e.arvio = arvio;
    list.push(e);
    try { localStorage.setItem(EVALS_LS, JSON.stringify(list)); } catch (e2) {}
    updateEvalBtn();
  }
  function updateEvalBtn() {
    const b = $t('tkEvalCopy');
    if (!tkKey) { b.hidden = true; return; } // kehittäjätyökalu — vain avaimella
    b.textContent = t('Kopioi evalit ({0})', evals().length);
  }
  $t('tkEvalCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(evals(), null, 2)).then(() => {
      $t('tkEvalCopy').textContent = t('Kopioitu ✓');
      setTimeout(updateEvalBtn, 1500);
    });
  });
  updateEvalBtn();

  /* ---------- Kertaesittely (kerran ikinä, tyhjässä keskustelussa) ---------- */

  const INTRO_LS = 'vp-tulkki-intro';
  function introSeen() { try { return localStorage.getItem(INTRO_LS) === '1'; } catch (e) { return true; } }
  function renderIntro() {
    try { localStorage.setItem(INTRO_LS, '1'); } catch (e) {}
    const card = document.createElement('div');
    card.className = 'tk-intro';
    // Yksi lause riittää: chipit ja syötekentän vihje näyttävät kyvyt
    // esimerkein, ja tietosuoja lukee jo lukkorivillä — ei toistoa.
    // Tekoälymaininta (tässä ja otsikon tekoälyapuri-rivillä) on AI-asetuksen
    // art. 50 läpinäkyvyysvaatimus — ei saa pudottaa.
    card.innerHTML =
      `<div class="tk-kats-head"><span>${t('Tervetuloa — Tulkki')}</span><button type="button" class="tk-kats-x" aria-label="${t('Sulje')}">✕</button></div>` +
      `<div class="tk-intro-body">` +
      t('Olen tekoälyavustaja: selitän suunnitelmasi luvut selkokielellä ja autan kokeilemaan muutoksia — <b>en anna sijoitusneuvontaa</b>: moottori laskee, minä tulkkaan, ja voin erehtyä.') +
      (tkKey ? '' : ' ' + t('Ilmaiskäytössä {0} kysymystä päivässä.', QUOTA_MAX)) + `</div>`;
    card.querySelector('.tk-kats-x').addEventListener('click', () => card.remove());
    log.appendChild(card);
  }

  /* ---------- Katsastus: paikallinen terveystarkistus (ei AI-kutsua) ---------- */
  // Deterministinen kerros huomaa sokeat pisteet moottorin tilasta; AI-kerros
  // selittää pyydettäessä. Ei verkkoa, ei kustannusta, ei lokitusta.

  function runKatsastus() {
    let s;
    try { s = sim || simulate(state); } catch (e) { return []; }
    const items = [];
    const ret = state.events.find((e) => e.type === 'retirement');

    // 1. Lainanhoito jatkuu eläkkeelle → suurentaa alkuvuosien nostoja
    if (ret) {
      for (const e of state.events) {
        if (e.financing === 'loan' && e.years) {
          const endAge = e.age + e.years;
          if (endAge > ret.age + 0.5) {
            const nimi = t(EVENT_NAMES[e.type] || 'Laina').toLowerCase();
            items.push({ sev: 'info',
              text: t('{0} maksetaan vielä eläkkeellä (n. {1} v asti) — se suurentaa eläkeajan alkuvuosien nostoja.', t(EVENT_NAMES[e.type] || 'Lainaa'), Math.round(endAge)),
              q: t('Miten {0}n laina eläkkeen alkuvuosina vaikuttaa suunnitelmaani?', nimi) });
          }
        }
      }
    }

    // 2. Varat ehtyvät ennen suunnitelman loppua (tai %-tilassa tulo alittaa tarpeen)
    if (s.depletionAge != null && s.depletionAge < state.ageEnd - 0.5) {
      const kind = s.dryKind === 'floor' ? t('tulo alittaa tarpeen') : t('varat ehtyvät');
      items.push({ sev: 'warn',
        text: t('Suunnitelmassa {0} {1}-vuotiaana, ennen loppua ({2} v).', kind, Math.round(s.depletionAge), state.ageEnd),
        q: t('Miksi {0} {1}-vuotiaana ja mitä sille voisi tehdä?', kind, Math.round(s.depletionAge)) });
    } else if (s.successProb != null && s.successProb < 0.75) {
      // 3. Matala onnistumistodennäköisyys (vain jos ei jo ehtymisvaroitusta)
      items.push({ sev: 'warn',
        text: t('Onnistumistodennäköisyys on {0} % — markkinariski painaa suunnitelmaa.', Math.round(s.successProb * 100)),
        q: t('Miksi onnistumistodennäköisyys jää {0} %:iin?', Math.round(s.successProb * 100)) });
    }

    // 4. Ei eläketapahtumaa → lempeä opastus (näkyy vain tyhjennetyssä suunnitelmassa)
    if (!ret) {
      items.push({ sev: 'info',
        text: t('Suunnitelmassa ei ole eläketapahtumaa — lisää se nähdäksesi, riittävätkö varat eläkkeellä.'), q: null });
    }

    // 5. Vertailuhuomio jaetusta datasta (jos ehtinyt latautua): oma kk-säästö
    // suhteessa muiden suunnitelmiin — tietoa, ei normi eikä kehotus.
    if (vStats && state.monthly > 0 && !state.savePhases) {
      const gN = tkGroupOf(state.ageNow);
      const g = (gN && vStats.groups[gN] && vStats.groups[gN].monthly)
        ? vStats.groups[gN] : vStats.groups.all;
      const mq = g && g.monthly;
      if (mq && state.monthly < mq.p25) {
        items.push({ sev: 'info',
          text: t('Kuukausisäästösi {0} € on jaettujen suunnitelmien alakvartiilissa (mediaani {1} €/kk). Ei normi — mutta hyvä tiedostaa.', fmtFi(state.monthly), fmtFi(Math.round(mq.p50))),
          q: t('Miten kuukausisäästöni vertautuu muiden suunnitelmiin ja mitä se tarkoittaa omalleni?') });
      }
    }

    return items;
  }

  function renderKatsastus() {
    let items = runKatsastus();
    if (!items.length) return;
    // Mobiilissa tiiviimpi: vakavimmat ensin, enintään kaksi huomiota
    if (tkNarrow()) items = items.slice().sort((a, b) => (b.sev === 'warn') - (a.sev === 'warn')).slice(0, 2);
    tkTrackOnce('Tulkki katsastus'); // tapahtuman nimi säilyy (mittarijatkuvuus)
    const card = document.createElement('div');
    card.className = 'tk-kats';
    card.innerHTML =
      `<div class="tk-kats-head"><span>${t('Huomiot')}</span><button type="button" class="tk-kats-x" aria-label="${t('Piilota huomiot')}">✕</button></div>` +
      items.map((it, i) => `<div class="tk-kats-row tk-kats-${it.sev}">${esc(it.text)}` +
        (it.q ? ` <button type="button" class="tk-kats-ask" data-i="${i}">${t('Selitä')}</button>` : '') + `</div>`).join('');
    card.querySelector('.tk-kats-x').addEventListener('click', () => { card.remove(); katsastusDismissed = true; });
    card.querySelectorAll('.tk-kats-ask').forEach((b) => b.addEventListener('click', () => {
      const it = items[+b.dataset.i];
      if (it.q) ask(it.q, 'explain');
    }));
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }

  // Merkki kahvaan latauksessa, jos katsastuksessa on huomioita
  try {
    const items = runKatsastus();
    if (items.length) {
      badge.hidden = false;
      if (items.some((it) => it.sev === 'warn')) badge.classList.add('tk-badge-warn');
    }
  } catch (e) { /* katsastus on parasta-yritystä, ei saa kaataa Tulkkia */ }

  /* ---------- Miksi?-chipit tunnuslukukortteihin ---------- */
  // Ei kosketa app.js:n renderStatsiin: injektoidaan chipit korttien
  // ilmestyessä MutationObserverilla. Chippi avaa Tulkin valmiilla kysymyksellä.

  const statsEl = document.getElementById('stats');
  if (statsEl && typeof MutationObserver === 'function') {
    const inject = () => {
      statsEl.querySelectorAll('.stat').forEach((card) => {
        if (card.querySelector('.tk-why')) return;
        const k = card.querySelector('.k'), v = card.querySelector('.v');
        if (!k || !v) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tk-why';
        btn.textContent = '?';
        btn.title = t('Miksi? Tulkki selittää tämän luvun');
        btn.setAttribute('aria-label', t('Miksi? Tulkki selittää tämän luvun'));
        btn.addEventListener('click', () => {
          openSheet();
          // telakoituna näkyy tiivis arvo (v-alt) — kysymykseen aina täysi (v-full)
          const vEl = v.querySelector('.v-full') || v;
          ask(t('Miksi "{0}" on {1}?', k.textContent.trim(), vEl.textContent.trim().replace(/ /g, ' ')), 'explain');
        });
        card.appendChild(btn);
      });
    };
    new MutationObserver(inject).observe(statsEl, { childList: true });
    inject();
  }

  /* ---------- NL-ramppi: kerro tilanteesi omin sanoin (beta) ---------- */
  // Aloitusrampin vaihtoehtoinen polku vain avaimella: vapaa teksti → Tulkki
  // poimii luvut ja tapahtumat MUUTOS-rivinä → sama validointi ja applyChanges
  // kuin chatissa → moottori laskee tuloksen. Deterministinen kolmen kysymyksen
  // polku pysyy ensisijaisena eikä riipu tästä. Epäonnistuminen ei koske tilaan.

  // HUOM: $t hakee vain lehden sisältä — rampin elementit haetaan nl:stä.
  // Funktiona, koska Suunnitelmat-koti avaa rampin uudelleen (uusi rivi omin
  // sanoin) — silloin lomake on rakennettu uusiksi ja NL-osio pitää injektoida
  // uudelleen ('vp-ramppi-auki'-tapahtuma app.js:stä).
  const injectNlRamp = () => {
    const rampCard = document.getElementById('rampCard');
    if (!rampCard || document.getElementById('tkNlText')) return;
    const nl = document.createElement('div');
    nl.className = 'tk-nl';
    nl.innerHTML =
      `<label class="tk-nl-lab" for="tkNlText">${t('Tai kerro tilanteesi omin sanoin — Tulkki täyttää luvut puolestasi <em>beta</em>')}</label>` +
      `<textarea id="tkNlText" rows="3" maxlength="600" placeholder="${t('esim. Olen 38, sijoituksia 80 000 €, säästän 600 €/kk. Asunnossa 150 000 € lainaa jäljellä. Haluaisin eläkkeelle 62-vuotiaana.')}"></textarea>` +
      `<div class="tk-nl-acts"><button type="button" class="btn ghost" id="tkNlGo">${t('Rakenna suunnitelmani')}</button><span class="tk-nl-status" id="tkNlStatus" role="status"></span></div>`;
    rampCard.insertBefore(nl, rampCard.querySelector('.ramp-skip'));

    nl.querySelector('#tkNlGo').addEventListener('click', async () => {
      const ta = nl.querySelector('#tkNlText'), st = nl.querySelector('#tkNlStatus'), btn = nl.querySelector('#tkNlGo');
      const text = ta.value.trim();
      if (text.length < 10) { st.textContent = t('Kerro ainakin ikäsi ja säästötilanteesi.'); ta.focus(); return; }
      btn.disabled = true; ta.disabled = true;
      st.textContent = t('Tulkki lukee ja moottori laskee…');
      tkTrack('Ramppi NL käytetty');
      // Tyhjä aloituspohja — EI nykytilasta: ohitus ja kolme kysymystä ennallaan,
      // eikä mihinkään kosketa ennen kuin poiminta onnistuu
      const base = {
        ageNow: 30, ageEnd: 90, startCapital: 0, monthly: 0, savingsGrowth: 0,
        allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
        events: [{ type: 'retirement', age: 65, withdrawal: 2400, pension: 0, pensionAge: 65, goal: 'withdrawal' }],
      };
      let raw = null, nlTool = null;
      try {
        const r = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: tkKey, mode: 'ramppi', question: text,
            lang: VP_KIELI, // palvelin valitsee promptin kielen (fi oletus)
            context: { plan: base, stats: { verovuosi: new Date().getFullYear() } },
          }),
        });
        if (r.ok) {
          // Kootaan koko NDJSON-virta — rampissa ei inkrementaalista näyttöä.
          // Työkalukutsu ({tool}) on ensisijainen kanava, tekstirivi varapolku.
          let full = '', streamErr = null;
          for (const line of (await r.text()).split('\n')) {
            if (!line.trim()) continue;
            try {
              const o = JSON.parse(line);
              if (o.delta) full += o.delta;
              else if (o.tool && o.tool.name === 'ehdota_muutos') nlTool = o.tool.input || null;
              else if (o.error) streamErr = o.error;
            } catch (e) { /* ohita rikkinäinen rivi */ }
          }
          raw = full.trim() || null;
          if (!raw && !nlTool) st.textContent = t(ERRORS[streamErr] || 'Tulkki ei vastannut — kokeile uudelleen tai täytä kentät yllä.');
        } else {
          const data = await r.json().catch(() => ({}));
          st.textContent = t(ERRORS[data.error] || 'Tulkki-virhe ({0}).', r.status);
        }
      } catch (e) { st.textContent = ERRORS.unreachable; }

      if (raw || nlTool) {
        const parsed = nlTool
          ? (() => {
              const v = validateChanges(nlTool.muutokset);
              return { text: raw || '', change: v.list.length ? { muutokset: v.list, selite: String(nlTool.selite || '').slice(0, 200) } : null };
            })()
          : extractChange(raw);
        const mod = JSON.parse(JSON.stringify(base));
        const rows = parsed.change ? applyChanges(mod, parsed.change.muutokset) : [];
        const applied = rows.filter((r) => !r.ohitettu);
        if (applied.length) {
          applySaved(mod);
          syncInputs();
          renderAll();
          rampMark();
          tkTrack('Ramppi NL valmis');
          const ret = state.events.find((e) => e.type === 'retirement');
          rampResult(ret ? Math.round(ret.age) : 65); // korvaa kortin tulosnäkymällä
          const note = document.createElement('div');
          note.className = 'tk-nl-note';
          note.innerHTML =
            `<b>Tulkki:</b> ${esc(plainBinds((parsed.text || parsed.change.selite || ''), null).slice(0, 300))}` +
            `<div class="tk-nl-rows">${applied.slice(0, 8).map((r) =>
              esc(r.desc ? `${t(r.nimi)}: ${r.desc}` : `${t(r.nimi)}: ${fmtFi(r.uusi)} ${r.yks || ''}`)).join(' · ')}</div>` +
            `<div class="tk-nl-hint">${t('Kaikkea voi säätää työtilassa — mikään ei ole lukittu.')}</div>`;
          const acts = rampCard.querySelector('.ramp-acts2');
          if (acts) acts.parentNode.insertBefore(note, acts);
          return;
        }
        st.textContent = t('Tulkki ei saanut kuvauksesta suunnitelmaa kasaan — täytä kolme kenttää yllä, niin tarkennat työtilassa.');
        tkTrack('Ramppi NL virhe');
      }
      btn.disabled = false; ta.disabled = false;
    });
  };
  // NL-ramppi on beta ja jää avainkoodin taakse myös julkisella tasolla
  // (ramppikutsu maksaa kysymyksen verran — kiintiö palaisi huomaamatta).
  if (tkKey) {
    injectNlRamp();
    document.addEventListener('vp-ramppi-auki', injectNlRamp);
  }
})();
