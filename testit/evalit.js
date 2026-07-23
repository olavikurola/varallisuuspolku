'use strict';

/* Tulkin golden-eval-ajuri — ajaa evalit-golden.json-tapaukset OIKEAA mallia
   vasten oman palvelimen läpi (sama polku kuin tuotannossa: kehote, työkalut,
   suoratoisto). Tarkoitus: kehote- tai mallimuutoksen jälkeen yksi ajo kertoo,
   vastaako Tulkki yhä oikein (työkalukuri, neuvontakiellot, numerokuri).

   Ajo:      ANTHROPIC_API_KEY=sk-... node testit/evalit.js [tapauksen-nimi]
   Kustannus: ~10 tapausta × Haiku ≈ muutama sentti / ajo (raportoidaan lopuksi).
   Ilman avainta ajuri kertoo ohjeen ja poistuu koodilla 0 (ei riko testiketjua).

   Tapausten kuraatio: paras lähde on käyttöliittymän 👎-palaute avaimella —
   se tallentuu paikalliseen evallistaan (Kopioi evalit) kysymyksineen ja
   konteksteineen; poimi sieltä epäonnistunut vaihto ja kirjaa tänne odote,
   joka olisi tehnyt siitä hyvän. */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const SERVER = path.join(__dirname, '..', 'palvelin', 'server.js');
const GOLDEN = JSON.parse(fs.readFileSync(path.join(__dirname, 'evalit-golden.json'), 'utf8'));
const PORT = 8797;

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('evalit: ANTHROPIC_API_KEY puuttuu — golden-ajo ohitetaan.');
  console.log('Aja:  ANTHROPIC_API_KEY=sk-... node testit/evalit.js');
  process.exit(0);
}

const filter = process.argv[2] || null;

/* Kontekstin luvut numerokuria varten (sama idea kuin tulkki.js:n collectNums) */
function collectNums(v, out) {
  if (typeof v === 'number' && isFinite(v)) out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectNums(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectNums(x, out));
}

// Litistetty polkukartta sidontaviittausten tarkistukseen
function bindPaths(v, p, out) {
  if (typeof v === 'number' && isFinite(v)) out.add(p);
  else if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k in v) bindPaths(v[k], p ? p + '.' + k : k, out);
  }
  return out;
}

async function drain(r) {
  const text = await r.text();
  let answer = '', usage = null, error = null;
  const tools = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch (e) { continue; }
    if (o.delta) answer += o.delta;
    else if (o.tool) tools.push(o.tool);
    else if (o.done) usage = o.usage;
    else if (o.error) error = o.error;
  }
  return { answer, tools, usage, error };
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-evalit-'));
  const srv = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dir,
      TULKKI_KEYS: 'eval-avain', TULKKI_DAILY_MAX: '200',
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break; } catch (e) {}
    await new Promise((r) => setTimeout(r, 100));
  }

  const ctxNums = [];
  collectNums(GOLDEN.konteksti, ctxNums);
  const paths = bindPaths({ stats: GOLDEN.konteksti.stats, vertailu: GOLDEN.konteksti.vertailu }, '', new Set());

  let failed = 0, totIn = 0, totOut = 0, ran = 0;
  for (const t of GOLDEN.tapaukset) {
    if (filter && t.nimi !== filter) continue;
    ran++;
    const ctx = t.kontekstiOhita
      ? { plan: { ageNow: 30, monthly: 0, events: [] }, stats: { verovuosi: 2026 } }
      : GOLDEN.konteksti;
    let res;
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/tulkki`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'eval-avain', mode: t.mode, question: t.question, context: ctx }),
      });
      if (!r.ok) { console.error(`✗ ${t.nimi} — HTTP ${r.status}`); failed++; continue; }
      res = await drain(r);
    } catch (e) { console.error(`✗ ${t.nimi} — ${e.message}`); failed++; continue; }
    if (res.usage) { totIn += res.usage.in || 0; totOut += res.usage.out || 0; }

    const errs = [];
    const o = t.odota || {};
    const toolNames = res.tools.map((x) => x.name);

    // Työkalukuri
    if (o.tyokalu === null && res.tools.length) errs.push(`odotettiin EI työkalua, kutsui: ${toolNames.join(',')}`);
    if (typeof o.tyokalu === 'string' && !toolNames.includes(o.tyokalu)) errs.push(`odotettiin työkalua ${o.tyokalu}, kutsui: ${toolNames.join(',') || 'ei mitään'}`);
    const chg = res.tools.find((x) => x.name === 'ehdota_muutos');
    const muutokset = (chg && chg.input && Array.isArray(chg.input.muutokset)) ? chg.input.muutokset : [];
    if (o.muutosKentta) {
      const m = muutokset.find((c) => c && c.kentta === o.muutosKentta);
      if (!m) errs.push(`muutoksista puuttuu kentta=${o.muutosKentta}`);
      else if (o.muutosArvo != null && Math.abs(Number(String(m.arvo).replace(/[^\d.,-]/g, '').replace(',', '.')) - o.muutosArvo) > 0.01) {
        errs.push(`kentta=${o.muutosKentta} arvo ${m.arvo} ≠ ${o.muutosArvo}`);
      }
    }
    if (o.muutosUusi && !muutokset.some((c) => c && c.uusi === o.muutosUusi)) errs.push(`muutoksista puuttuu uusi=${o.muutosUusi}`);
    if (o.vaihtoehtojaVahintaan) {
      const cmp = res.tools.find((x) => x.name === 'vertaile');
      const n = (cmp && cmp.input && Array.isArray(cmp.input.vaihtoehdot)) ? cmp.input.vaihtoehdot.length : 0;
      if (n < o.vaihtoehtojaVahintaan) errs.push(`vaihtoehtoja ${n} < ${o.vaihtoehtojaVahintaan}`);
    }

    // Tekstisäännöt
    for (const re of o.tekstissa || []) {
      if (!new RegExp(re, 'i').test(res.answer)) errs.push(`tekstistä puuttuu /${re}/`);
    }
    for (const re of o.eiTekstissa || []) {
      if (new RegExp(re, 'i').test(res.answer)) errs.push(`tekstissä kielletty /${re}/`);
    }

    // Sidontaviittaukset: jokaisen [[polku]]-viittauksen pitää osua kontekstiin
    for (const m of res.answer.matchAll(/\[\[([\w.]+)\]\]/g)) {
      if (!paths.has(m[1])) errs.push(`keksitty sidontapolku [[${m[1]}]]`);
    }

    // Numerokuri: tekstin luvut (≥10, ei sidontoja) löydyttävä kontekstista
    // ±1,5 % tai kysymyksestä (sama toleranssi kuin UI:n pehmeä validointi)
    if (o.numerokuri) {
      const qNums = [];
      collectNums({ q: (t.question.match(/\d[\d ]*/g) || []).map((s) => parseFloat(s.replace(/[ ]/g, ''))) }, qNums);
      const plain = res.answer.replace(/\[\[[\w.]+\]\]/g, '');
      for (const m of plain.matchAll(/(\d[\d   ]*(?:,\d+)?)/g)) {
        const val = parseFloat(m[1].replace(/[   ]/g, '').replace(',', '.'));
        if (!isFinite(val) || val < 10) continue;
        const okNum = [...ctxNums, ...qNums, 2026].some((n) => Math.abs(Math.abs(n) - val) <= Math.max(1, Math.abs(n) * 0.015));
        if (!okNum) errs.push(`luku ${m[1].trim()} ei löydy kontekstista`);
      }
    }

    if (errs.length) {
      failed++;
      console.error(`✗ ${t.nimi}`);
      for (const e of errs) console.error(`    ${e}`);
      console.error(`    vastaus: ${res.answer.slice(0, 220).replace(/\n/g, ' ')}`);
    } else {
      console.log(`✓ ${t.nimi}`);
    }
  }

  srv.kill();
  // Haiku 4.5: ~1 $/M in, 5 $/M out — karkea kustannusarvio ajolle
  const cost = (totIn / 1e6) * 1 + (totOut / 1e6) * 5;
  console.log(`\n${ran} tapausta · ${totIn}→${totOut} tok · ~${(cost * 100).toFixed(1)} snt`);
  console.log(failed ? `${failed} EVALIA EPÄONNISTUI` : 'Kaikki evalit läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('evalit kaatui:', e); process.exit(1); });
