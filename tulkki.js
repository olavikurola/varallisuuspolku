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
  const fmtFi = (v) => v == null ? '–' : (typeof v === 'number' ? v.toLocaleString('fi-FI') : String(v));
  // Plausible-telemetria app.js:n apureilla — vain tapahtuman nimi (+ tila),
  // ei sisältöä, ei tunnisteita. Suppilon mittarointi: avattu → kysymys → pidetty.
  const tkTrack = (n, p) => { try { if (typeof track === 'function') track(n, p); } catch (e) {} };
  const tkTrackOnce = (n, p) => { try { if (typeof trackOnce === 'function') trackOnce(n, p); } catch (e) {} };

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
      // vertaa itseisarvoihin: kontekstin −200 000 € vastaa tekstin "200 000 €"
      const ok = nums.some((n) => {
        const b = Math.abs(n);
        return Math.abs(b - val) <= Math.max(1, b * 0.015);
      });
      if (ok) return `<span class="tk-num">${m}</span>`;
      if (val < 10 && !unit) return m; // "kolme asiaa" -tyyppiset pikkuluvut rauhaan
      return `<span class="tk-num tk-doubt" title="Lukua ei löydy moottorin luvuista — suhtaudu varauksella">${m}</span>`;
    });
  }

  // Kevyt muotoilu: mallin **lihavointi** renderöidään (raa'at tähdet olivat
  // iso osa "täyteisyyttä"), muu Markdown jää tekstiksi. Ajetaan escapen jälkeen.
  const mdLite = (html) => html.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');

  function renderAnswer(el, text, nums) {
    const paras = text.split(/\n{2,}/);
    el.innerHTML = paras.map((p) =>
      `<p>${numSpans(mdLite(esc(p)).replace(/\n/g, '<br>'), nums)}</p>`).join('');
    return el.querySelectorAll('.tk-doubt').length;
  }

  // Direktiivin (MUUTOS/VERTAILU) häntä ei näy suoratoiston aikana — se
  // jäsennetään ja renderöidään kortiksi vasta virran valmistuttua.
  function stripDirectiveTail(text) {
    const i = text.search(/\n(?:MUUTOS|VERTAILU):/);
    return i >= 0 ? text.slice(0, i) : text;
  }
  function renderStreaming(el, full, nums) {
    const shown = stripDirectiveTail(full);
    el.innerHTML = shown.split(/\n{2,}/).map((p) =>
      `<p>${numSpans(mdLite(esc(p)).replace(/\n/g, '<br>'), nums)}</p>`).join('') +
      '<span class="tk-cursor" aria-hidden="true"></span>';
  }

  /* ---------- UI ---------- */

  const handle = document.createElement('button');
  handle.className = 'tk-handle';
  handle.type = 'button';
  handle.textContent = '✦ Kysy';
  handle.title = 'Tulkki — kysy suunnitelmastasi';
  // Hiljainen katsastusmerkki: ei sykettä, ei ääntä (kunnioittaa tyyntä ilmettä)
  const badge = document.createElement('i');
  badge.className = 'tk-badge';
  badge.hidden = true;
  handle.appendChild(badge);

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
    <div class="tk-privacy" title="Vain suunnitelman anonyymi muoto ja kysymys välitetään selitystä varten — ei nimiä eikä tunnisteita.">🔒 Laskelmasi ei lähde selaimestasi — palvelin ei tallenna mitään.</div>
    <div class="tk-log" id="tkLog" aria-live="polite"></div>
    <div class="tk-sugs" id="tkSugs"></div>
    <form class="tk-ask" id="tkForm">
      <input id="tkInput" type="text" maxlength="600" autocomplete="off"
        placeholder="Kysy suunnitelmastasi…" aria-label="Kysymys Tulkille" />
      <button type="submit" aria-label="Lähetä kysymys">↑</button>
    </form>
    <div class="tk-foot">
      <button type="button" class="tk-mini" id="tkLogBtn">Tulkin toimet (0)</button>
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
  let katsastusDismissed = false;

  function openSheet(prefill) {
    sheet.hidden = false;
    handle.classList.add('tk-open');
    document.body.classList.add('tk-docked'); // leveällä näytöllä sisältö väistyy, ei peity
    badge.hidden = true; // nähty
    tkTrackOnce('Tulkki avattu');
    renderSugs();
    // Tyhjässä keskustelussa: kertaesittely (kerran ikinä) + katsastus (per istunto)
    if (!log.children.length) {
      if (!introSeen()) renderIntro();
      if (!katsastusDismissed) renderKatsastus();
    }
    if (prefill) { input.value = prefill; }
    input.focus();
  }
  function closeSheet() {
    sheet.hidden = true;
    handle.classList.remove('tk-open');
    document.body.classList.remove('tk-docked');
  }
  handle.addEventListener('click', () => (sheet.hidden ? openSheet() : closeSheet()));
  $t('tkClose').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.hidden) closeSheet();
  });

  /* Ehdotuschipit lasketaan avattaessa moottorin tilasta. Kysymyschipit
     näytetään vain kun keskustelu on tyhjä (löydettävyys) — sen jälkeen
     jäljelle jäävät toimintochipit, ettei lehti täyty. */
  function renderSugs() {
    const s = sim;
    const sugs = [];
    if (!chat.length) {
      if (s && s.successProb != null) sugs.push(`Miksi onnistumistodennäköisyys on ${Math.round(s.successProb * 100)} %?`);
      if (s && s.depletionAge != null) sugs.push(`Miksi varat loppuvat ${Math.round(s.depletionAge)} vuoden iässä?`);
      else sugs.push('Mikä suunnitelmassani on suurin epävarmuus?');
      sugs.push('Mistä verot kertyvät?');
      if (state.events.some((e) => e.type === 'retirement')) sugs.push('Vertaa eläkeikiä 60, 63 ja 65');
    }
    const el = $t('tkSugs');
    const hasRet = state.events.some((e) => e.type === 'retirement');
    el.innerHTML = sugs.map((q) => `<button type="button" class="tk-sug">${esc(q)}</button>`).join('') +
      (hasRet ? '<button type="button" class="tk-sug tk-market">📉 Markkinatesti</button>' : '') +
      '<button type="button" class="tk-sug tk-haasta">🔍 Haasta suunnitelmani</button>' +
      '<button type="button" class="tk-sug tk-adv">📋 Kysymyslista varainhoitajalle</button>';
    el.querySelectorAll('.tk-sug').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.classList.contains('tk-adv')) ask('', 'advisor');
        else if (b.classList.contains('tk-haasta')) ask('', 'haasta');
        else if (b.classList.contains('tk-market')) {
          tkTrack('Tulkki markkinatesti');
          const qEl = document.createElement('div');
          qEl.className = 'tk-q'; qEl.textContent = 'Markkinatesti';
          log.appendChild(qEl);
          renderMarketStress();
        } else ask(b.textContent, 'explain');
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

  // Tilat, jotka eivät tarvitse käyttäjän kysymystä (palvelin määrää tehtävän)
  const NOQ = { advisor: 'Kysymyslista varainhoitajalle', haasta: 'Haasta suunnitelmani' };

  async function ask(question, mode) {
    if (busy) return;
    const q = NOQ[mode] || (question || input.value.trim());
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
          question: NOQ[mode] ? undefined : q,
          context: ctx,
          history: chat.slice(-3),
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        aEl.className = 'tk-a tk-err';
        aEl.textContent = ERRORS[data.error] || `Tulkki-virhe (${r.status}).`;
      } else {
        // Suoratoisto: luetaan NDJSON-virta, teksti ilmestyy token kerrallaan.
        // Direktiivit (MUUTOS/VERTAILU) ja korttien renderöinti vasta lopussa.
        const nums = [];
        collectNums(ctx, nums);
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
              renderStreaming(aEl, full, nums);
              log.scrollTop = log.scrollHeight;
            } else if (obj.tool) toolCalls.push(obj.tool);
            else if (obj.toolError) toolErr = true;
            else if (obj.done) meta = obj;
            else if (obj.error) streamErr = obj.error;
          }
        }
        if (!full && !toolCalls.length && !toolErr) {
          aEl.className = 'tk-a tk-err';
          aEl.textContent = ERRORS[streamErr] || 'Tulkki ei vastannut — kokeile uudelleen.';
        } else {
          // Kysymyschipit pois ensimmäisen vaihdon jälkeen (toimintochipit jäävät)
          $t('tkSugs').querySelectorAll('.tk-sug:not(.tk-adv):not(.tk-haasta):not(.tk-market)')
            .forEach((b) => b.remove());
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
              if (list.length) opts.push({ nimi: String((v && v.nimi) || 'Vaihtoehto').slice(0, 40), muutokset: list });
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
            text = (change && change.selite) || (compare && compare.selite) || 'Kokeillaan — katso esikatselu.';
            aEl.className = 'tk-a';
          }
          const doubts = renderAnswer(aEl, text, nums); // lopullinen: ei kursoria, numSpans
          chat.push({ q, a: text });
          const mEl = document.createElement('div');
          mEl.className = 'tk-meta';
          mEl.innerHTML =
            `<span>✓ luvut moottorista${doubts ? ` · <b class="tk-doubt-n">${doubts} tarkistamatonta</b>` : ''}</span>` +
            `<button type="button" class="tk-mini">Tallenna evaliksi</button>`;
          mEl.querySelector('button').addEventListener('click', (ev) => {
            saveEval(q, full, ctx);
            ev.target.textContent = 'Tallennettu ✓';
            ev.target.disabled = true;
          });
          aEl.appendChild(mEl);
          if (compare) renderCompareCard(compare);
          else if (change) renderChangeCard(change, q);
          else if (viallinen) {
            const note = document.createElement('div');
            note.className = 'tk-change';
            const rr = (cmp && cmp.raakaRivi) || parsed.raakaRivi || '';
            note.innerHTML = '<div class="tk-ch-note">Tulkin komentorivi oli viallinen — mitään ei muutettu. Sano sama hieman toisin, niin yritän uudelleen.</div>' +
              (rr ? `<div class="tk-ch-row tk-ch-skip"><code>${esc(rr)}</code></div>` : '');
            log.appendChild(note);
          }
          else if (rejected && rejected.length) {
            const note = document.createElement('div');
            note.className = 'tk-change';
            note.innerHTML = `<div class="tk-ch-note">Tulkki yritti muuttaa kohdetta, jota esikatselu ei vielä tue (${esc(rejected.join(', '))}) — mitään ei muutettu. Kokeile sanoa tarkemmin, tai tee muutos käsin napauttamalla tapahtumaa aikajanalla.</div>`;
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
    ageNow:        { nimi: 'Ikä nyt', min: 16, max: 100, yks: 'v' },
    ageEnd:        { nimi: 'Suunnitelma päättyy', min: 40, max: 105, yks: 'v' },
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

  // Tapahtumien muutettavat ominaisuudet — rajat samat kuin popoverin kentissä.
  // Kohdennus: tyyppi + tarvittaessa tapahtumaIka (useita samaa tyyppiä).
  const EVENT_NAMES = {
    home: 'Asunto', car: 'Auto', cottage: 'Mökki', child: 'Lapsi',
    renovation: 'Remontti', travel: 'Matka', study: 'Opiskelu', wedding: 'Häät',
    inheritance: 'Perintö', bonus: 'Bonus', sidegig: 'Sivutulo',
    recurring: 'Kuukausierä', goal: 'Tavoite',
  };
  const EVENT_PROPS = {
    age:    { nimi: 'ikä', min: 0, max: 105, yks: 'v' },
    amount: { nimi: 'summa', min: -1e9, max: 1e9, yks: '€' },
    appr:   { nimi: 'arvonnousu', min: -30, max: 15, yks: '%/v' },
    rate:   { nimi: 'lainan korko', min: 0, max: 25, yks: '%' },
    years:  { nimi: 'laina-aika', min: 1, max: 40, yks: 'v' },
    down:   { nimi: 'käsiraha', min: 0, max: 1e9, yks: '€' },
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
        if (EVENT_NAMES[c.uusi] && ika != null) {
          list.push({ uusi: c.uusi, ika: Math.min(105, Math.max(0, Math.round(ika))) });
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
        if (list.length) opts.push({ nimi: String((v && v.nimi) || 'Vaihtoehto').slice(0, 40), muutokset: list });
      }
      if (!opts.length) return { text: d.text, compare: null, viallinen: true, raakaRivi: d.payload.slice(0, 160) };
      return { text: d.text, compare: { vaihtoehdot: opts, selite: String(o.selite || '').slice(0, 200) } };
    } catch (e) { return { text: d.text, compare: null, viallinen: true, raakaRivi: d.payload.slice(0, 160) }; }
  }

  // Soveltaa muutokset serialisoituun kopioon; palauttaa rivit näytölle
  function applyChanges(mod, list) {
    const rows = [];
    const ret = (mod.events || []).find((e) => e.type === 'retirement');
    for (const c of list) {
      // Porrastettu säästöaikataulu: korvaa koko aikataulun (ja tasaisen säästön)
      if (c.aikataulu) {
        mod.savePhases = c.aikataulu.slice().sort((a, b) => a.to - b.to);
        mod.monthly = mod.savePhases[0].amount; // perussäästö = 1. vaihe (poiston varalta)
        const n = mod.savePhases.length;
        const desc = mod.savePhases.map((p, i) =>
          `${fmtFi(Math.round(p.amount))} €/kk ${i < n - 1 ? '→ ' + p.to + ' v' : '→ loppu'}`).join(', ');
        rows.push({ nimi: 'Säästöaikataulu', desc });
        continue;
      }
      // Uusi tapahtuma: samat oletukset kuin paletista lisätessä (EVENT_TYPES).
      // Lainakentät (käsiraha ym.) täyttyvät applySavedissa LOPULLISESTA
      // summasta — siksi niitä ei aseteta tässä.
      if (c.uusi) {
        const def = EVENT_TYPES[c.uusi];
        const age = Math.min(mod.ageEnd, Math.max(mod.ageNow, c.ika));
        const ev = { type: c.uusi, age, amount: def.amount };
        if (!def.metric) {
          ev.financing = def.defaultFin || 'cash';
          if (def.asset) { ev.isAsset = true; ev.appr = def.asset.appr; }
          if (def.rec) { ev.recMonthly = def.rec.monthly; ev.recYears = def.rec.years; }
        }
        mod.events = mod.events || [];
        mod.events.push(ev);
        rows.push({ nimi: `${EVENT_NAMES[c.uusi]} (uusi)`, desc: `lisätty ikään ${age} v` });
        continue;
      }
      // Tapahtuman poisto: kohdennus kuten ominaisuusmuutoksessa
      if (c.poista) {
        const label = `${EVENT_NAMES[c.poista]} · poisto`;
        const cands = (mod.events || []).filter((e) => e.type === c.poista);
        if (!cands.length) { rows.push({ nimi: label, ohitettu: 'ei tällaista tapahtumaa' }); continue; }
        let ev = cands[0];
        if (cands.length > 1) {
          if (c.tapahtumaIka == null) { rows.push({ nimi: label, ohitettu: 'useita samaa tyyppiä — täsmennä ikä' }); continue; }
          ev = cands.reduce((a, b) => Math.abs(a.age - c.tapahtumaIka) <= Math.abs(b.age - c.tapahtumaIka) ? a : b);
        }
        mod.events = mod.events.filter((e) => e !== ev);
        rows.push({ nimi: `${EVENT_NAMES[c.poista]} (${Math.round(ev.age)} v)`, desc: 'poistettu' });
        continue;
      }
      // Tapahtuman ominaisuus: kohdenna tyyppiin, tarvittaessa ikään
      if (c.tapahtuma) {
        const p = EVENT_PROPS[c.ominaisuus];
        const label = `${EVENT_NAMES[c.tapahtuma]} · ${p.nimi}`;
        const cands = (mod.events || []).filter((e) => e.type === c.tapahtuma);
        if (!cands.length) { rows.push({ nimi: label, ohitettu: 'ei tällaista tapahtumaa' }); continue; }
        let ev = cands[0];
        if (cands.length > 1) {
          if (c.tapahtumaIka == null) { rows.push({ nimi: label, ohitettu: 'useita samaa tyyppiä — täsmennä ikä' }); continue; }
          ev = cands.reduce((a, b) => Math.abs(a.age - c.tapahtumaIka) <= Math.abs(b.age - c.tapahtumaIka) ? a : b);
        }
        if ((c.ominaisuus === 'rate' || c.ominaisuus === 'years' || c.ominaisuus === 'down') && ev.financing !== 'loan') {
          rows.push({ nimi: label, ohitettu: 'tapahtumassa ei ole lainaa' }); continue;
        }
        if (c.ominaisuus === 'appr' && !ev.isAsset) {
          rows.push({ nimi: label, ohitettu: 'ei omaisuuserä' }); continue;
        }
        let arvo = c.arvo;
        if (c.ominaisuus === 'age') arvo = Math.min(mod.ageEnd, Math.max(mod.ageNow, Math.round(arvo)));
        // menotapahtuman summa on tilassa negatiivinen — käyttäjä puhuu positiivisina
        if (c.ominaisuus === 'amount' && typeof ev.amount === 'number' && ev.amount < 0 && arvo > 0) arvo = -arvo;
        const vanha = ev[c.ominaisuus];
        ev[c.ominaisuus] = arvo;
        rows.push({ nimi: `${EVENT_NAMES[c.tapahtuma]} (${ev.age} v) · ${p.nimi}`, vanha, uusi: arvo, yks: p.yks });
        continue;
      }
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

  function renderChangeCard(change, cmdQ) {
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
      // Kerro MIKSI mikään ei mennyt läpi — mykkä virhe ei auta ketään
      const miksi = rows.length
        ? rows.map((r) => `<div class="tk-ch-row tk-ch-skip">${esc(r.nimi)} · ${esc(r.ohitettu || '')}</div>`).join('')
        : '';
      const vihje = rows.some((r) => r.ohitettu === 'ei tällaista tapahtumaa')
        ? '<div class="tk-ch-note">Vinkki: pyydä ensin lisäämään tapahtuma (esim. “lisää mökki 65-vuotiaana 150 000 €”), niin luon sen ja säädän summat samalla.</div>'
        : '';
      card.innerHTML = '<div class="tk-ch-note">Muutosta ei voitu soveltaa suunnitelmaan:</div>' + miksi + vihje;
      log.appendChild(card);
      log.scrollTop = log.scrollHeight;
      return;
    }
    previewBefore = before;
    setBaseline('Ennen Tulkin kokeilua'); // haamu = tilanne ennen muutosta
    applySaved(mod);
    syncInputs();
    renderAll();

    const fmt = fmtFi;
    card.innerHTML =
      `<div class="tk-ch-lab">Kokeilu käytössä — vertailu haamuna graafissa</div>` +
      (change.selite ? `<div class="tk-ch-sel">${esc(change.selite)}</div>` : '') +
      rows.map((r) => r.ohitettu
        ? `<div class="tk-ch-row tk-ch-skip">${esc(r.nimi)} · ohitettu (${esc(r.ohitettu)})</div>`
        : r.desc
        ? `<div class="tk-ch-row">${esc(r.nimi)}: <b>${esc(r.desc)}</b></div>`
        : `<div class="tk-ch-row">${esc(r.nimi)}: <s>${fmt(r.vanha)}</s> → <b>${fmt(r.uusi)}</b> ${esc(r.yks)}</div>`).join('') +
      `<div class="tk-ch-acts">
        <button type="button" class="tk-keep">Pidä muutos</button>
        <button type="button" class="tk-mini tk-revert" title="Palauttaa tilanteen ennen kokeilua">Palauta</button>
      </div>`;
    card.querySelector('.tk-keep').addEventListener('click', () => {
      // Kirjaa pidetty muutos paikalliseen lokiin ennen previewBeforen nollausta
      saveLogEntry({
        t: new Date().toISOString(),
        q: cmdQ || change.selite || 'Tulkin muutos',
        selite: change.selite || '',
        rows: applied.map((r) => ({ nimi: r.nimi, vanha: r.vanha, uusi: r.uusi, yks: r.yks || '', desc: r.desc })),
        before: previewBefore,
      });
      previewBefore = null;
      tkTrack('Tulkki muutos pidetty');
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
    { k: 'Onnistuminen', get: (m) => m.succ, fmt: (v) => v == null ? '–' : v + ' %', best: 'max' },
    { k: 'Varat riittävät', get: (m) => m.dep, fmt: (v) => v == null ? '✓' : v + ' v', best: 'maxNull' },
    { k: 'Kestävä tulo, €/kk', get: (m) => m.sust, fmt: (v) => v == null ? '–' : fmtFi(v), best: 'max' },
    // tiivis muoto (1,8 M€ / 86 t€): sarakkeet mahtuvat lehteen ilman vaakavieritystä
    { k: 'Loppuvarallisuus', get: (m) => m.wEnd, fmt: (v) => fmtCompact(v), best: 'max' },
    { k: 'Verot yhteensä', get: (m) => m.tax, fmt: (v) => fmtCompact(v), best: 'min' },
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
      const cols = [{ nimi: 'Nykyinen', m: metricsOf(base) }];
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
        `<div class="tk-cmp-lab">Vertailu — moottori laski jokaisen vaihtoehdon</div>` +
        (compare.selite ? `<div class="tk-ch-sel">${esc(compare.selite)}</div>` : '') +
        `<div class="tk-cmp-scroll"><table class="tk-cmp-tbl">${head}${body}</table></div>` +
        `<div class="tk-cmp-note">Suunnitelmaasi ei muutettu. Ota jokin käyttöön sanomalla esim. “ota käyttöön ${esc(compare.vaihtoehdot[0].nimi)}”.</div>`;
    } catch (e) {
      card.innerHTML = '<div class="tk-ch-note">Vertailun laskenta epäonnistui.</div>';
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
    if (b) b.textContent = `Tulkin toimet (${tkActions().length})`;
  }

  function renderLogView() {
    const existing = log.querySelector('.tk-actions');
    if (existing) { existing.remove(); return; } // toggle
    const list = tkActions();
    const card = document.createElement('div');
    card.className = 'tk-actions';
    let html = `<div class="tk-kats-head"><span>Tulkin toimet</span><button type="button" class="tk-kats-x" aria-label="Sulje">✕</button></div>`;
    if (!list.length) {
      html += '<div class="tk-ch-note">Tulkki ei ole vielä muuttanut suunnitelmaasi. Pidetyt muutokset kirjautuvat tähän — vain sinun selaimeesi, ei minnekään muualle.</div>';
    } else {
      html += `<div class="tk-act-tools"><button type="button" class="tk-mini tk-act-export">Lataa loki</button><button type="button" class="tk-mini tk-act-clear">Tyhjennä</button></div>`;
      html += list.slice().reverse().map((e, ri) => {
        const idx = list.length - 1 - ri;
        const when = e.t ? e.t.slice(0, 16).replace('T', ' klo ') : '';
        const chg = (e.rows || []).map((r) => r.desc
          ? `${esc(r.nimi)}: ${esc(r.desc)}`
          : `${esc(r.nimi)}: ${fmtFi(r.vanha)} → ${fmtFi(r.uusi)} ${esc(r.yks || '')}`).join('; ');
        return `<div class="tk-act-row"><div class="tk-act-top"><span class="tk-act-when">${esc(when)}</span>` +
          `<button type="button" class="tk-mini tk-act-revert" data-i="${idx}" title="Palauta suunnitelma tätä muutosta edeltäneeseen tilaan">Palauta tähän</button></div>` +
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
      b.textContent = 'Palautettu ✓';
      b.disabled = true;
    }));
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
  }

  $t('tkLogBtn').addEventListener('click', renderLogView);
  updateLogBtn();

  /* ---------- Markkinatesti: moottorin stressiskenaariot (lukupohjainen) ---------- */
  // Sekvenssiriski: mitä jos markkina käyttäytyy huonosti juuri eläkkeelle
  // jäädessä. Moottorin valmiit stressit (karhu heti eläkkeellä, menetetty
  // vuosikymmen, stagflaatio) ajetaan kloonilla — deterministinen, EI AI-kutsua.

  const STRESS_KEYS = ['bear', 'lost', 'stagf'];

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
      nimi: 'Nykyinen',
      wEnd: Math.round(Math.max(0, s.exp[s.months] || 0)),
      dep: s.depletionAge != null ? Math.round(s.depletionAge) : null,
    }];
    for (const st of s.stress) {
      cols.push({
        nimi: st.name,
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
      card.innerHTML = '<div class="tk-ch-note">Markkinatesti tarvitsee eläketapahtuman — lisää se ensin, niin näet sekvenssiriskin.</div>';
      log.appendChild(card); log.scrollTop = log.scrollHeight;
      return;
    }
    // Käännetty taulukko: skenaariot riveinä — pitkät nimet mahtuvat kapeaan lehteen
    const head = `<tr><th></th><th>Loppuvarallisuus</th><th>Varat riittävät</th></tr>`;
    const biW = bestIndex(cols.map((c) => c.wEnd), 'max');
    const biD = bestIndex(cols.map((c) => c.dep), 'maxNull');
    const body = cols.map((c, i) =>
      `<tr><th>${esc(c.nimi)}</th>` +
      `<td class="${i === biW ? 'tk-cmp-best' : ''}">${esc(fmtCompact(c.wEnd))}</td>` +
      `<td class="${i === biD ? 'tk-cmp-best' : ''}">${esc(c.dep == null ? '✓' : c.dep + ' v')}</td></tr>`
    ).join('');
    card.innerHTML =
      `<div class="tk-cmp-lab">Markkinatesti — moottori ajoi kolme stressiskenaariota</div>` +
      `<div class="tk-ch-sel">Sekvenssiriski: sama suunnitelma, jos markkina käyttäytyy huonosti eläkkeelle jäädessäsi.</div>` +
      `<div class="tk-cmp-scroll"><table class="tk-cmp-tbl">${head}${body}</table></div>` +
      `<div class="tk-cmp-note">Deterministiset skenaariot, eivät ennuste. Suunnitelmaasi ei muutettu. Kysy “miksi karhumarkkina osuu näin” niin selitän.</div>`;
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

  /* ---------- Kertaesittely (kerran ikinä, tyhjässä keskustelussa) ---------- */

  const INTRO_LS = 'vp-tulkki-intro';
  function introSeen() { try { return localStorage.getItem(INTRO_LS) === '1'; } catch (e) { return true; } }
  function renderIntro() {
    try { localStorage.setItem(INTRO_LS, '1'); } catch (e) {}
    const card = document.createElement('div');
    card.className = 'tk-intro';
    card.innerHTML =
      `<div class="tk-kats-head"><span>Tervetuloa — Tulkki</span><button type="button" class="tk-kats-x" aria-label="Sulje">✕</button></div>` +
      `<div class="tk-intro-body">Selitän suunnitelmasi luvut selkokielellä ja autan kokeilemaan muutoksia. ` +
      `<b>En anna sijoitusneuvontaa enkä laske itse</b> — moottori laskee, minä tulkkaan. Voit:` +
      `<ul>` +
      `<li><b>Kysyä:</b> “miksi rahani riittävät vain 82-vuotiaaksi?”</li>` +
      `<li><b>Kokeilla:</b> “kokeile eläkeikää 62” — näet muutoksen esikatseluna</li>` +
      `<li><b>Vertailla:</b> “vertaa säästöä 800, 1000 ja 1200”</li>` +
      `<li><b>Haastaa:</b> 🔍-napilla etsin suunnitelmasi riskit</li>` +
      `</ul>Laskelmasi pysyy selaimessasi.</div>`;
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
            const nimi = (EVENT_NAMES[e.type] || 'Laina').toLowerCase();
            items.push({ sev: 'info',
              text: `${EVENT_NAMES[e.type] || 'Lainaa'} maksetaan vielä eläkkeellä (n. ${Math.round(endAge)} v asti) — se suurentaa eläkeajan alkuvuosien nostoja.`,
              q: `Miten ${nimi}n laina eläkkeen alkuvuosina vaikuttaa suunnitelmaani?` });
          }
        }
      }
    }

    // 2. Varat ehtyvät ennen suunnitelman loppua (tai %-tilassa tulo alittaa tarpeen)
    if (s.depletionAge != null && s.depletionAge < state.ageEnd - 0.5) {
      const kind = s.dryKind === 'floor' ? 'tulo alittaa tarpeen' : 'varat ehtyvät';
      items.push({ sev: 'warn',
        text: `Suunnitelmassa ${kind} ${Math.round(s.depletionAge)}-vuotiaana, ennen loppua (${state.ageEnd} v).`,
        q: `Miksi ${kind} ${Math.round(s.depletionAge)}-vuotiaana ja mitä sille voisi tehdä?` });
    } else if (s.successProb != null && s.successProb < 0.75) {
      // 3. Matala onnistumistodennäköisyys (vain jos ei jo ehtymisvaroitusta)
      items.push({ sev: 'warn',
        text: `Onnistumistodennäköisyys on ${Math.round(s.successProb * 100)} % — markkinariski painaa suunnitelmaa.`,
        q: `Miksi onnistumistodennäköisyys jää ${Math.round(s.successProb * 100)} %:iin?` });
    }

    // 4. Ei eläketapahtumaa → lempeä opastus (näkyy vain tyhjennetyssä suunnitelmassa)
    if (!ret) {
      items.push({ sev: 'info',
        text: 'Suunnitelmassa ei ole eläketapahtumaa — lisää se nähdäksesi, riittävätkö varat eläkkeellä.', q: null });
    }

    return items;
  }

  function renderKatsastus() {
    const items = runKatsastus();
    if (!items.length) return;
    tkTrackOnce('Tulkki katsastus');
    const card = document.createElement('div');
    card.className = 'tk-kats';
    card.innerHTML =
      `<div class="tk-kats-head"><span>Katsastus</span><button type="button" class="tk-kats-x" aria-label="Piilota katsastus">✕</button></div>` +
      items.map((it, i) => `<div class="tk-kats-row tk-kats-${it.sev}">${esc(it.text)}` +
        (it.q ? ` <button type="button" class="tk-kats-ask" data-i="${i}">Selitä</button>` : '') + `</div>`).join('');
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
        btn.title = 'Miksi? Tulkki selittää tämän luvun';
        btn.setAttribute('aria-label', 'Miksi? Tulkki selittää tämän luvun');
        btn.addEventListener('click', () => {
          openSheet();
          // telakoituna näkyy tiivis arvo (v-alt) — kysymykseen aina täysi (v-full)
          const vEl = v.querySelector('.v-full') || v;
          ask(`Miksi "${k.textContent.trim()}" on ${vEl.textContent.trim().replace(/ /g, ' ')}?`, 'explain');
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

  // HUOM: $t hakee vain lehden sisältä — rampin elementit haetaan nl:stä
  const rampCard = document.getElementById('rampCard');
  if (rampCard && !document.getElementById('tkNlText')) {
    const nl = document.createElement('div');
    nl.className = 'tk-nl';
    nl.innerHTML =
      `<label class="tk-nl-lab" for="tkNlText">Tai kerro tilanteesi omin sanoin — Tulkki täyttää luvut puolestasi <em>beta</em></label>` +
      `<textarea id="tkNlText" rows="3" maxlength="600" placeholder="esim. Olen 38, sijoituksia 80 000 €, säästän 600 €/kk. Asunnossa 150 000 € lainaa jäljellä. Haluaisin eläkkeelle 62-vuotiaana."></textarea>` +
      `<div class="tk-nl-acts"><button type="button" class="btn ghost" id="tkNlGo">Rakenna suunnitelmani</button><span class="tk-nl-status" id="tkNlStatus" role="status"></span></div>`;
    rampCard.insertBefore(nl, rampCard.querySelector('.ramp-skip'));

    nl.querySelector('#tkNlGo').addEventListener('click', async () => {
      const ta = nl.querySelector('#tkNlText'), st = nl.querySelector('#tkNlStatus'), btn = nl.querySelector('#tkNlGo');
      const text = ta.value.trim();
      if (text.length < 10) { st.textContent = 'Kerro ainakin ikäsi ja säästötilanteesi.'; ta.focus(); return; }
      btn.disabled = true; ta.disabled = true;
      st.textContent = 'Tulkki lukee ja moottori laskee…';
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
          if (!raw && !nlTool) st.textContent = ERRORS[streamErr] || 'Tulkki ei vastannut — kokeile uudelleen tai täytä kentät yllä.';
        } else {
          const data = await r.json().catch(() => ({}));
          st.textContent = ERRORS[data.error] || `Tulkki-virhe (${r.status}).`;
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
            `<b>Tulkki:</b> ${esc((parsed.text || parsed.change.selite || '').slice(0, 300))}` +
            `<div class="tk-nl-rows">${applied.slice(0, 8).map((r) =>
              esc(r.desc ? `${r.nimi}: ${r.desc}` : `${r.nimi}: ${fmtFi(r.uusi)} ${r.yks || ''}`)).join(' · ')}</div>` +
            `<div class="tk-nl-hint">Kaikkea voi säätää työtilassa — mikään ei ole lukittu.</div>`;
          const acts = rampCard.querySelector('.ramp-acts2');
          if (acts) acts.parentNode.insertBefore(note, acts);
          return;
        }
        st.textContent = 'Tulkki ei saanut kuvauksesta suunnitelmaa kasaan — täytä kolme kenttää yllä, niin tarkennat työtilassa.';
        tkTrack('Ramppi NL virhe');
      }
      btn.disabled = false; ta.disabled = false;
    });
  }
})();
