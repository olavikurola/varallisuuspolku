'use strict';

/* Aggregointitestit: oletuspohjien suodatus (basis edited/all), startCapital-
   histogrammi ja uudet metakentät. Palvelin käynnistetään aliprosessina
   valmiiksi kirjoitetulla lahjoitustiedostolla. Ajo: node testit/palvelin-stats.test.js */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const SERVER = path.join(__dirname, '..', 'palvelin', 'server.js');

let failed = 0;
const ok = (c, name, d = '') => {
  if (c) console.log('  ✓ ' + name);
  else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); }
};

// Muokkaamaton aloitustila lahjoitusmuodossa (sanitize-tuloksen kentät)
let ridSeq = 0;
function row(over) {
  const r = {
    v: 1, date: '2026-07', ageNow: 30, ageEnd: 90,
    startCapital: 20000, monthly: 1000, savingsGrowth: 1.5,
    alloc: { stocks: 70, bonds: 20 }, glide: false, real: false, tax: true,
    events: [{ type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 }],
    rid: 'r' + String(ridSeq++).padStart(15, '0'),
  };
  return Object.assign(r, over);
}
// Muokattu suunnitelma: luvut poikkeavat kaikista sormenjäljistä
const edited = (i, over) => row(Object.assign({
  ageNow: 30 + (i % 5), startCapital: 15000 + i * 1000, monthly: 600 + i * 25,
  events: [{ type: 'retirement', age: 60 + (i % 6), withdrawal: 2600 + i * 10, pension: 1400, pensionAge: 65 }],
}, over));

async function statsFrom(port, rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-stats-'));
  fs.writeFileSync(path.join(dir, 'lahjoitukset.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 50; i++) {
      try { await fetch(`http://127.0.0.1:${port}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
    }
    return await (await fetch(`http://127.0.0.1:${port}/stats.json`)).json();
  } finally { proc.kill(); }
}

(async () => {
  console.log('Muokattuja alle k-anon-rajan → basis all, oletuspohjat mukana');
  {
    const rows = [...Array(25)].map(() => row()).concat([...Array(10)].map((_, i) => edited(i)));
    const s = await statsFrom(8795, rows);
    ok(s.total === 35, 'total = kaikki jaetut (35)', String(s.total));
    ok(s.editedN === 10, 'editedN = 10', String(s.editedN));
    ok(s.basis === 'all', 'basis = all', s.basis);
    ok(s.groups.all.n === 35, 'jakaumien pohjana kaikki rivit', String(s.groups.all.n));
    ok(s.groups.all.monthly.p50 === 1000, 'oletuspiikki näkyy vielä mediaanissa', String(s.groups.all.monthly.p50));
    ok(!!s.groups.all.hist.startCapital, 'startCapital-histogrammi julkaistaan');
    const sum = s.groups.all.hist.startCapital.counts.reduce((a, b) => a + b, 0);
    ok(sum === 35, 'histogrammin lukumäärät täsmäävät pohjaan', String(sum));
  }

  console.log('Muokattuja ≥ k-anon → basis edited, oletuspohjat pois jakaumista');
  {
    const rows = [...Array(12)].map(() => row()).concat([...Array(32)].map((_, i) => edited(i)));
    const s = await statsFrom(8796, rows);
    ok(s.total === 44, 'total laskee silti kaikki (44)', String(s.total));
    ok(s.editedN === 32, 'editedN = 32', String(s.editedN));
    ok(s.basis === 'edited', 'basis = edited', s.basis);
    ok(s.groups.all.n === 32, 'jakaumien pohjana vain muokatut', String(s.groups.all.n));
    ok(s.groups.all.monthly.p50 !== 1000, 'oletuspiikki poistui mediaanista', String(s.groups.all.monthly.p50));
    ok(s.timeline[0].n === 44, 'aikajana laskee kaikki jaetut', JSON.stringify(s.timeline));
  }

  console.log('Sormenjälki vaatii täyden osuman');
  {
    // monthly 1000 mutta oma varallisuus → EI oletuspohja; myös esimerkkiprofiili tunnistetaan
    const near = row({ startCapital: 87000 });
    const fire = row({ ageNow: 32, startCapital: 60000, monthly: 2600, alloc: { stocks: 95, bonds: 5 },
      events: [{ type: 'retirement', age: 50, withdrawal: 2200, pension: 1300, pensionAge: 65, goal: 'age', conf: 0.85 }] });
    const s = await statsFrom(8797, [near, fire].concat([...Array(3)].map(() => row())));
    ok(s.editedN === 1, 'vain aidosti muokattu jää (1/5)', String(s.editedN));
  }

  console.log('Vienti (/vienti): avaimella koko tiedosto, ilman avainta 403, ilman envia 404');
  {
    const rows = [...Array(7)].map((_, i) => edited(i));
    const withServer = async (port, env, fn) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-vienti-'));
      fs.writeFileSync(path.join(dir, 'lahjoitukset.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      const proc = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, ...env }, stdio: 'ignore' });
      try {
        for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/health`); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); } }
        await fn(`http://127.0.0.1:${port}`);
      } finally { proc.kill(); }
    };
    await withServer(8798, { VIENTI_AVAIN: 'testiavain-123' }, async (base) => {
      const r0 = await fetch(`${base}/vienti`);
      ok(r0.status === 403, 'ilman avainta 403', String(r0.status));
      const r1 = await fetch(`${base}/vienti`, { headers: { 'x-vp-vienti': 'vaara' } });
      ok(r1.status === 403, 'väärällä avaimella 403', String(r1.status));
      const r2 = await fetch(`${base}/vienti`, { headers: { 'x-vp-vienti': 'testiavain-123' } });
      const txt = await r2.text();
      const lines = txt.split('\n').filter(Boolean);
      ok(r2.status === 200 && (r2.headers.get('content-type') || '').includes('x-ndjson'), 'oikealla avaimella 200 + NDJSON', String(r2.status));
      ok(lines.length === 7 && lines.every((l) => JSON.parse(l).ageNow > 0), 'kaikki 7 riviä tulevat sellaisinaan', String(lines.length));
      ok((r2.headers.get('cache-control') || '').includes('no-store'), 'vientiä ei välimuistiteta');
    });
    await withServer(8799, { VIENTI_AVAIN: '' }, async (base) => {
      const r = await fetch(`${base}/vienti`, { headers: { 'x-vp-vienti': 'mikä-tahansa' } });
      ok(r.status === 404, 'ilman VIENTI_AVAIN-envia pääte on pois päältä (404)', String(r.status));
    });
  }

  console.log('Leveät ikäkaistat: 18-34 julkaisee jakaumat ennen 5-vuotisryhmiä');
  {
    // 12 × 25-29 + 20 × 30-34 = 32 muokattua 18-34-kaistassa; kumpikaan alaryhmä ei ylitä 30:tä
    const rows = [...Array(12)].map((_, i) => edited(i, { ageNow: 25 + (i % 5) }))
      .concat([...Array(20)].map((_, i) => edited(i + 12, { ageNow: 30 + (i % 5) })));
    const s = await statsFrom(8800, rows);
    ok(s.groups['18-34'] && s.groups['18-34'].n === 32, 'kaista 18-34 laskettu (n=32)', JSON.stringify(s.groups['18-34'] && s.groups['18-34'].n));
    ok(!!s.groups['18-34'].monthly, 'kaista ylittää k-anon 30 → jakaumat julki');
    ok(s.groups['25-29'] && !s.groups['25-29'].monthly && s.groups['30-34'] && !s.groups['30-34'].monthly, '5-vuotisryhmät yhä vain n (alle 30)');
    ok(!s.groups['35-49'] || !s.groups['35-49'].monthly, 'tyhjä/pieni kaista ei julkaise');
    ok(s.groups.all.n === 32, 'all ei tuplaa kaistalaskentaa');
  }

  process.exit(failed ? 1 : 0);
})();
