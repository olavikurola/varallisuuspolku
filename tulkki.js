'use strict';

/* Varallisuuspolku — Tulkki (vaihe 1: omistaja-avaimen takana).
   AI-selittäjä, joka tulkkaa moottorin lukuja selkokielelle. Periaatteet:
   - Moottori (laskenta.js) on totuuden lähde: Tulkki ei laske, vain selittää.
     Pehmeä validointi vertaa vastauksen lukuja kontekstin lukuihin ja liputtaa
     poikkeamat (kovat sidonnat tulevat ennen julkista avausta).
   - Tietosuoja: verkon yli kulkee vain suunnitelman anonyymi whitelist-muoto
     (sama buildDonationPayload kuin vertailudatassa), moottorin tunnusluvut
     ja kysymys. Palvelin (palvelin/server.js) on tilaton eikä lokita sisältöä.
   - Ilman localStorage-avainta tämä tiedosto ei lisää käyttöliittymään mitään.
     Avain: avaa kerran osoite  <sivu>#tulkki=KOODI  (poisto: #tulkki=pois).
   Ladataan classic-skriptinä app.js:n jälkeen — state/sim/yearRows/
   buildDonationPayload/simulate ovat globaaleja. */

(function () {
  const KEY_LS = 'vp-tulkki-key';
  const EVALS_LS = 'vp-tulkki-evals';
  const TAX_YEAR = 2026; // pidä samassa kuin validointi.html

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
  if (!tkKey) return; // ei avainta → ei Tulkkia
  if (typeof buildDonationPayload !== 'function' || typeof yearRows !== 'function') return;

  /* ---------- Konteksti moottorista ---------- */

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function buildContext() {
    const s = sim || simulate(state);
    const plan = buildDonationPayload(state, s); // sama anonyymi whitelist kuin vertailudatassa
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
      tyoelakeEurKk: ret && ret.pension > 0 ? Math.round(ret.pension) : 0,
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
    return {
      plan, stats,
      years: { selite: '[ikä, sijoitukset €, säästöt €/v, nostot brutto €/v, verot €/v, työeläke €/v]', rivit: years },
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
    return html.replace(/(\d[\d   ]*(?:,\d+)?)(\s?(?:%|€|v\b))?/g, (m, numStr, unit) => {
      const val = parseFloat(numStr.replace(/[   ]/g, '').replace(',', '.'));
      if (!isFinite(val)) return m;
      const ok = nums.some((n) => Math.abs(n - val) <= Math.max(1, Math.abs(n) * 0.015));
      if (ok) return `<span class="tk-num">${m}</span>`;
      if (val < 10 && !unit) return m; // "kolme asiaa" -tyyppiset pikkuluvut rauhaan
      return `<span class="tk-num tk-doubt" title="Lukua ei löydy moottorin luvuista — suhtaudu varauksella">${m}</span>`;
    });
  }

  function renderAnswer(el, text, nums) {
    const paras = text.split(/\n{2,}/);
    el.innerHTML = paras.map((p) =>
      `<p>${numSpans(esc(p).replace(/\n/g, '<br>'), nums)}</p>`).join('');
    return el.querySelectorAll('.tk-doubt').length;
  }

  /* ---------- UI ---------- */

  const handle = document.createElement('button');
  handle.className = 'tk-handle';
  handle.type = 'button';
  handle.textContent = '✦ Kysy';
  handle.title = 'Tulkki — kysy suunnitelmastasi';

  const sheet = document.createElement('aside');
  sheet.className = 'tk-sheet';
  sheet.hidden = true;
  sheet.setAttribute('aria-label', 'Tulkki — kysy suunnitelmastasi');
  sheet.innerHTML =
    `<header class="tk-head">
      <span class="tk-dot" aria-hidden="true">?</span>
      <b>Tulkki</b><small>selittää — sinä päätät</small>
      <button type="button" class="tk-x" id="tkClose" aria-label="Sulje Tulkki">✕</button>
    </header>
    <div class="tk-privacy">🔒 Laskelmasi ei lähde selaimestasi — vain suunnitelman anonyymi muoto ja kysymys välitetään selitystä varten. Palvelin ei tallenna mitään.</div>
    <div class="tk-log" id="tkLog" aria-live="polite"></div>
    <div class="tk-sugs" id="tkSugs"></div>
    <form class="tk-ask" id="tkForm">
      <input id="tkInput" type="text" maxlength="600" autocomplete="off"
        placeholder="Kysy suunnitelmastasi…" aria-label="Kysymys Tulkille" />
      <button type="submit" aria-label="Lähetä kysymys">↑</button>
    </form>
    <div class="tk-foot">
      <button type="button" class="tk-mini" id="tkEvalCopy"></button>
      <span class="tk-cost" id="tkCost"></span>
    </div>`;

  document.body.appendChild(handle);
  document.body.appendChild(sheet);

  const $t = (id) => sheet.querySelector('#' + id);
  const log = $t('tkLog');
  const input = $t('tkInput');
  // Keskusteluhistoria {q, a} — vain muistissa, lähetetään enintään 3 viimeistä.
  // HUOM: nimi ei saa olla "history" — se varjostaisi window.historyn (TDZ)
  // ja rikkoisi avaimen sisäänoton replaceState-siivouksen.
  const chat = [];
  let busy = false;

  function openSheet(prefill) {
    sheet.hidden = false;
    handle.classList.add('tk-open');
    renderSugs();
    if (prefill) { input.value = prefill; }
    input.focus();
  }
  function closeSheet() {
    sheet.hidden = true;
    handle.classList.remove('tk-open');
  }
  handle.addEventListener('click', () => (sheet.hidden ? openSheet() : closeSheet()));
  $t('tkClose').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) closeSheet();
  });

  /* Ehdotuschipit lasketaan avattaessa moottorin tilasta */
  function renderSugs() {
    const s = sim;
    const sugs = [];
    if (s && s.successProb != null) sugs.push(`Miksi onnistumistodennäköisyys on ${Math.round(s.successProb * 100)} %?`);
    if (s && s.depletionAge != null) sugs.push(`Miksi varat loppuvat ${Math.round(s.depletionAge)} vuoden iässä?`);
    else sugs.push('Mikä suunnitelmassani on suurin epävarmuus?');
    sugs.push('Mistä verot kertyvät?');
    const el = $t('tkSugs');
    el.innerHTML = sugs.map((q) => `<button type="button" class="tk-sug">${esc(q)}</button>`).join('') +
      '<button type="button" class="tk-sug tk-adv">📋 Kysymyslista varainhoitajalle</button>';
    el.querySelectorAll('.tk-sug').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.classList.contains('tk-adv')) ask('', 'advisor');
        else ask(b.textContent, 'explain');
      });
    });
  }

  /* ---------- Kysely ---------- */

  const API = (typeof DATA_API === 'string' ? DATA_API : 'https://varallisuuspolku-data.up.railway.app') + '/tulkki';

  const ERRORS = {
    bad_key: 'Avainkoodi ei kelpaa. Poista se avaamalla osoite #tulkki=pois ja syötä uusi.',
    rate_limit: 'Kysymyksiä tuli hetkeen liian monta — kokeile tunnin päästä.',
    daily_cap: 'Tulkin päiväraja on täynnä — se lepää huomiseen.',
    disabled: 'Tulkki ei ole vielä käytössä palvelimella (ympäristömuuttujat puuttuvat).',
    upstream: 'Tulkin malli ei vastannut — kokeile hetken päästä uudelleen.',
    unreachable: 'Yhteys Tulkkiin epäonnistui — tarkista verkko.',
  };

  async function ask(question, mode) {
    if (busy) return;
    const q = mode === 'advisor' ? 'Kysymyslista varainhoitajalle' : (question || input.value.trim());
    if (mode !== 'advisor' && !q) return;
    busy = true;
    input.value = '';
    input.disabled = true;

    const qEl = document.createElement('div');
    qEl.className = 'tk-q';
    qEl.textContent = q;
    log.appendChild(qEl);
    const aEl = document.createElement('div');
    aEl.className = 'tk-a tk-busy';
    aEl.textContent = 'Tulkki miettii…';
    log.appendChild(aEl);
    log.scrollTop = log.scrollHeight;

    let ctx = null;
    try { ctx = buildContext(); } catch (e) { /* alla */ }
    if (!ctx) {
      aEl.className = 'tk-a tk-err';
      aEl.textContent = 'Kontekstin rakentaminen moottorista epäonnistui.';
      busy = false; input.disabled = false;
      return;
    }

    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: tkKey, mode: mode || 'explain',
          question: mode === 'advisor' ? undefined : q,
          context: ctx,
          history: chat.slice(-3),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        aEl.className = 'tk-a tk-err';
        aEl.textContent = ERRORS[data.error] || `Tulkki-virhe (${r.status}).`;
      } else {
        const nums = [];
        collectNums(ctx, nums);
        aEl.className = 'tk-a';
        const parsed = extractChange(data.answer);
        const doubts = renderAnswer(aEl, parsed.text, nums);
        chat.push({ q, a: parsed.text });
        const meta = document.createElement('div');
        meta.className = 'tk-meta';
        meta.innerHTML =
          `<span>✓ luvut moottorista${doubts ? ` · <b class="tk-doubt-n">${doubts} tarkistamatonta</b>` : ''}</span>` +
          `<button type="button" class="tk-mini">Tallenna evaliksi</button>`;
        meta.querySelector('button').addEventListener('click', (ev) => {
          saveEval(q, data.answer, ctx);
          ev.target.textContent = 'Tallennettu ✓';
          ev.target.disabled = true;
        });
        aEl.appendChild(meta);
        if (parsed.change) renderChangeCard(parsed.change);
        if (data.usage) {
          $t('tkCost').textContent = `${data.model} · ${data.usage.in}→${data.usage.out} tok`;
        }
      }
    } catch (e) {
      aEl.className = 'tk-a tk-err';
      aEl.textContent = ERRORS.unreachable;
    }
    log.scrollTop = log.scrollHeight;
    busy = false;
    input.disabled = false;
    input.focus();
  }

  $t('tkForm').addEventListener('submit', (e) => { e.preventDefault(); ask(); });

  /* ---------- Puhu: muutoskomennot esikatseluna ---------- */
  // Tulkki ei koskaan muuta tilaa suoraan: mallin MUUTOS-rivi validoidaan
  // whitelistiä vasten, muutos ajetaan esikatseluna (vertailuhaamu = tilanne
  // ennen kokeilua) ja käyttäjä painaa Pidä tai Palauta. Epäonnistumistila
  // on aina "ei muutosta". Kentät ja rajat = samat kuin käyttöliittymän
  // säätimissä; skeeman ulkopuoliset kentät hylätään.

  const FIELDS = {
    monthly:       { nimi: 'Kuukausisäästö', min: 0, max: 1e6, yks: '€/kk' },
    startCapital:  { nimi: 'Varallisuus nyt', min: 0, max: 1e9, yks: '€' },
    savingsGrowth: { nimi: 'Säästön vuosikasvu', min: 0, max: 15, yks: '%/v' },
    allocStocks:   { nimi: 'Osakepaino', min: 0, max: 100, yks: '%' },
    allocBonds:    { nimi: 'Korkopaino', min: 0, max: 100, yks: '%' },
    retAge:        { nimi: 'Eläkeikä', min: 18, max: 100, yks: 'v', ret: 'age' },
    withdrawal:    { nimi: 'Kuukausitulon tarve', min: 0, max: 1e6, yks: '€/kk', ret: 'withdrawal' },
    pension:       { nimi: 'Työeläke', min: 0, max: 1e6, yks: '€/kk', ret: 'pension' },
    pensionAge:    { nimi: 'Työeläkkeen alkamisikä', min: 18, max: 105, yks: 'v', ret: 'pensionAge' },
  };

  let previewBefore = null; // serialize()-kopio ennen kokeilua (null = ei aktiivista)

  // Irrottaa vastauksen lopusta MUUTOS-rivin; palauttaa {text, change|null}
  function extractChange(raw) {
    const m = raw.match(/\nMUUTOS:\s*(\{[\s\S]*\})\s*$/);
    if (!m) return { text: raw, change: null };
    const text = raw.slice(0, m.index).trim();
    try {
      const o = JSON.parse(m[1]);
      const list = [];
      for (const c of (Array.isArray(o.muutokset) ? o.muutokset : []).slice(0, 6)) {
        const f = FIELDS[c && c.kentta];
        if (!f || typeof c.arvo !== 'number' || !isFinite(c.arvo)) continue;
        list.push({ kentta: c.kentta, arvo: Math.min(f.max, Math.max(f.min, c.arvo)) });
      }
      if (!list.length) return { text: raw, change: null };
      return { text, change: { muutokset: list, selite: String(o.selite || '').slice(0, 200) } };
    } catch (e) { return { text: raw, change: null }; }
  }

  // Soveltaa muutokset serialisoituun kopioon; palauttaa rivit näytölle
  function applyChanges(mod, list) {
    const rows = [];
    const ret = (mod.events || []).find((e) => e.type === 'retirement');
    for (const c of list) {
      const f = FIELDS[c.kentta];
      let arvo = c.arvo;
      if (f.ret) {
        if (!ret) { rows.push({ nimi: f.nimi, ohitettu: 'ei eläketapahtumaa' }); continue; }
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

  function renderChangeCard(change) {
    const card = document.createElement('div');
    card.className = 'tk-change';
    if (previewBefore) {
      card.innerHTML = '<div class="tk-ch-note">Päätä ensin edellinen kokeilu (Pidä tai Palauta).</div>';
      log.appendChild(card);
      return;
    }
    const before = JSON.parse(JSON.stringify(serialize()));
    const mod = JSON.parse(JSON.stringify(before));
    const rows = applyChanges(mod, change.muutokset);
    const applied = rows.filter((r) => !r.ohitettu);
    if (!applied.length) {
      card.innerHTML = '<div class="tk-ch-note">Muutosta ei voitu soveltaa suunnitelmaan.</div>';
      log.appendChild(card);
      return;
    }
    previewBefore = before;
    setBaseline('Ennen Tulkin kokeilua'); // haamu = tilanne ennen muutosta
    applySaved(mod);
    syncInputs();
    renderAll();

    const fmt = (v) => typeof v === 'number' ? v.toLocaleString('fi-FI') : String(v);
    card.innerHTML =
      `<div class="tk-ch-lab">Kokeilu käytössä — vertailu haamuna graafissa</div>` +
      (change.selite ? `<div class="tk-ch-sel">${esc(change.selite)}</div>` : '') +
      rows.map((r) => r.ohitettu
        ? `<div class="tk-ch-row tk-ch-skip">${esc(r.nimi)} · ohitettu (${esc(r.ohitettu)})</div>`
        : `<div class="tk-ch-row">${esc(r.nimi)}: <s>${fmt(r.vanha)}</s> → <b>${fmt(r.uusi)}</b> ${esc(r.yks)}</div>`).join('') +
      `<div class="tk-ch-acts">
        <button type="button" class="tk-keep">Pidä muutos</button>
        <button type="button" class="tk-mini tk-revert" title="Palauttaa tilanteen ennen kokeilua">Palauta</button>
      </div>`;
    card.querySelector('.tk-keep').addEventListener('click', () => {
      previewBefore = null;
      card.querySelector('.tk-ch-lab').textContent = 'Muutos pidetty ✓ — vertailukohta jäi graafiin';
      card.querySelector('.tk-ch-acts').remove();
    });
    card.querySelector('.tk-revert').addEventListener('click', () => {
      applySaved(JSON.parse(JSON.stringify(previewBefore)));
      previewBefore = null;
      syncInputs();
      renderAll();
      clearBaseline();
      card.querySelector('.tk-ch-lab').textContent = 'Palautettu ennalleen';
      card.querySelector('.tk-ch-acts').remove();
    });
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }

  /* ---------- Evalien keräys (golden-setti oikeasta käytöstä) ---------- */

  function evals() {
    try { return JSON.parse(localStorage.getItem(EVALS_LS) || '[]'); } catch (e) { return []; }
  }
  function saveEval(q, a, ctx) {
    const list = evals();
    list.push({ t: new Date().toISOString(), q, a, context: ctx });
    try { localStorage.setItem(EVALS_LS, JSON.stringify(list)); } catch (e) {}
    updateEvalBtn();
  }
  function updateEvalBtn() {
    $t('tkEvalCopy').textContent = `Kopioi evalit (${evals().length})`;
  }
  $t('tkEvalCopy').addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(evals(), null, 2)).then(() => {
      $t('tkEvalCopy').textContent = 'Kopioitu ✓';
      setTimeout(updateEvalBtn, 1500);
    });
  });
  updateEvalBtn();

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
        btn.textContent = 'Miksi?';
        btn.title = 'Tulkki selittää tämän luvun';
        btn.addEventListener('click', () => {
          openSheet();
          ask(`Miksi "${k.textContent.trim()}" on ${v.textContent.trim().replace(/ /g, ' ')}?`, 'explain');
        });
        card.appendChild(btn);
      });
    };
    new MutationObserver(inject).observe(statsEl, { childList: true });
    inject();
  }
})();
