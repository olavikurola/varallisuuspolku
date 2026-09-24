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

  console.log('Julkaisuraja lopulliselle joukolle (auditointi 5.9.2026 D-01, liite B)');
  {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      v: 1, rid: String(i).padStart(16, '0'), date: '2026-09',
      ageNow: 40, ageEnd: 90, startCapital: 50000 + i * 100, monthly: 500 + i, savingsGrowth: 0,
      alloc: { stocks: 70, bonds: 20 }, real: false, tax: true, glide: false,
      events: [
        { type: 'retirement', age: 65, withdrawal: 2700, pension: i === 0 ? 1234 : 0, pensionAge: 65 },
        ...(i === 0 ? Array.from({ length: 30 }, (_, j) => ({ type: 'home', age: 45, amount: -200000, financing: 'loan', ...(j === 0 ? { down: 40000, years: 20, rate: 3.5 } : {}) })) : []),
      ],
    }));
    const s = await statsFrom(8799, rows);
    ok(s.groups.all.n === 30, 'ryhmä julkaistaan (30 suunnitelmaa)', String(s.groups.all.n));
    ok(!s.groups.all.pension, '1 positiivinen eläke 30:stä → eläkekvartiileja EI julkaista', JSON.stringify(s.groups.all.pension));
    ok(!s.eventAges || !s.eventAges.home, 'yhden suunnitelman 30 asuntoa eivät täytä tapahtumaporttia', JSON.stringify(s.eventAges && s.eventAges.home));
    ok(s.homeLoan == null, 'asuntolainatilastoa ei julkaista yhdestä suunnitelmasta', JSON.stringify(s.homeLoan));
    ok(!!s.eventAges && !!s.eventAges.retirement && s.eventAges.retirement.n === 30, 'eläketapahtuman ikäjakauma julkaistaan (30 suunnitelmaa)');
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

  console.log('Kestävä tulo: paikkamerkki 2400 pois kuukausitulon jakaumasta, ratkaistu taso mukaan');
  {
    const wdEv = (i, over) => [Object.assign({ type: 'retirement', age: 60, withdrawal: 2400, pension: 1000, pensionAge: 65, goal: 'withdrawal' }, over)];
    // 30 manuaalista (2600…2890) + 20 vanhaa paikkamerkkiriviä → jakauma vain manuaalisista
    const old = [...Array(30)].map((_, i) => edited(i)).concat([...Array(20)].map((_, i) => edited(i + 30, { events: wdEv(i) })));
    const s1 = await statsFrom(8801, old);
    ok(s1.groups.all.withdrawal && s1.groups.all.withdrawal.p25 > 2400, 'paikkamerkkirivit eivät vedä jakaumaa 2400:aan', JSON.stringify(s1.groups.all.withdrawal));
    ok(s1.groups.all.goals.withdrawal > 0.35, 'tavoiteosuus lasketaan silti kaikista');
    // 15 manuaalista + 15 vanhaa → 15 aitoa < k-anon → ei jakaumaa
    const few = [...Array(15)].map((_, i) => edited(i)).concat([...Array(15)].map((_, i) => edited(i + 15, { events: wdEv(i) })));
    const s2 = await statsFrom(8802, few);
    ok(!s2.groups.all.withdrawal && !s2.groups.all.penShare, 'alle 30 aitoa tasoa → ei kuukausitulo- eikä kateosuusjakaumaa');
    // 30 ratkaistua tasoa (4000…) lipulla → mukaan jakaumaan
    const solved = [...Array(30)].map((_, i) => edited(i, { events: wdEv(i, { withdrawal: 4000 + i * 10, wdSolved: true }) }));
    const s3 = await statsFrom(8803, solved);
    ok(s3.groups.all.withdrawal && s3.groups.all.withdrawal.p50 >= 4000, 'wdSolved-rivit mukana jakaumassa', JSON.stringify(s3.groups.all.withdrawal));
  }

  console.log('Pohjatunnistus: ratkaistu tulo ei tee oletuspohjasta muokattua');
  {
    // Miljoona loppuelämäksi -pohja: tulo ratkaistaan, joten withdrawal ≠ 2700
    const tpl = () => row({ ageNow: 45, startCapital: 1000000, monthly: 0,
      events: [{ type: 'retirement', age: 45, withdrawal: 3300, pension: 1800, pensionAge: 68, goal: 'withdrawal', conf: 0.85, wdSolved: true }] });
    const s = await statsFrom(8804, [...Array(5)].map(tpl).concat([...Array(30)].map((_, i) => edited(i))));
    ok(s.editedN === 30, 'ratkaistun tulon pohjarivit tunnistetaan pohjiksi', String(s.editedN));
  }

  process.exit(failed ? 1 : 0);
})();
