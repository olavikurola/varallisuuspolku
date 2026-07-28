'use strict';
/* Verifiointi: Tulkki tuntee vertailudatan (stats.json) ja lähettää sen
   kontekstissa mallille; vertailuchippi ilmestyy. Stubataan verkko. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

const FAKE_STATS = {
  updated: '2026-07-23T00:00:00Z', v: 2, kAnon: 30, total: 123,
  groups: {
    all: { n: 123, monthly: { p25: 350, p50: 700, p75: 1300 }, startCapital: { p25: 4000, p50: 30000, p75: 90000 }, stocks: { p25: 55, p50: 70, p75: 90 } },
    '30-34': {
      n: 42, monthly: { p25: 400, p50: 800, p75: 1200 },
      startCapital: { p25: 5000, p50: 25000, p75: 60000 },
      stocks: { p25: 60, p50: 75, p75: 90 },
      retireAge: { p25: 60, p50: 63, p75: 65 },
      withdrawal: { p25: 1800, p50: 2400, p75: 3000 },
      penShare: { p25: 0.4, p50: 0.55, p75: 0.7 },
      successProb: { p25: 0.6, p50: 0.75, p75: 0.9 },
    },
  },
  eventAges: { retirement: { p50: 63.4, n: 40 }, home: { p50: 34.2, n: 35 } },
  homeLoan: { n: 35, price: { p25: 150000, p50: 220000, p75: 300000 }, downShare: { p25: 0.1, p50: 0.15, p75: 0.25 }, years: { p25: 18, p50: 22, p75: 25 }, rate: { p25: 2.8, p50: 3.2, p75: 3.8 } },
};

(async () => {
  const server = http.createServer((rq, rs) => {
    let p = rq.url.split('?')[0];
    if (p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    fs.readFile(f, (err, data) => {
      if (err) { rs.writeHead(404); rs.end('nope'); return; }
      rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      rs.end(data);
    });
  }).listen(8099);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  let tulkkiBody = null;

  await page.route('**/stats.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_STATS),
  }));
  await page.route('**/tulkki', (route) => {
    tulkkiBody = JSON.parse(route.request().postData());
    route.fulfill({
      status: 200, contentType: 'application/x-ndjson; charset=utf-8',
      body: JSON.stringify({ delta: 'Ikäryhmäsi mediaanisäästö on 800 €/kk.' }) + '\n' +
        JSON.stringify({ done: true, model: 'claude-haiku-4-5', usage: { in: 1200, out: 40 } }) + '\n',
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem('vp-tulkki-key', 'testikoodi');
    localStorage.setItem('vp-ramp-done', '1');
    localStorage.setItem('vp-autotour-off', '1');
    localStorage.setItem('vp-tulkki-intro', '1');
  });

  await page.goto('http://127.0.0.1:8099/');
  await page.waitForSelector('.tk-handle', { timeout: 8000 });
  await page.click('.tk-handle');

  // Chippi ilmestyy kun stats-stubi on saapunut ja renderSugs ajettu uudelleen
  const chip = await page.waitForSelector('.tk-sug:has-text("vertautuu muihin")', { timeout: 5000 });
  console.log('OK: vertailuchippi näkyy:', (await chip.textContent()).trim());

  await chip.click();
  await page.waitForSelector('.tk-a:not(.tk-busy)', { timeout: 5000 });
  await page.waitForFunction(() => !!document.querySelector('.tk-a .tk-meta'), null, { timeout: 5000 });

  const v = tulkkiBody && tulkkiBody.context && tulkkiBody.context.vertailu;
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg, JSON.stringify(v)); process.exitCode = 1; } else console.log('OK:', msg); };
  assert(!!v, 'kontekstissa on vertailu-osio');
  if (v) {
    assert(v.ryhma === 'ikäryhmä 30-34', 'ryhmä on käyttäjän ikäryhmä (30-34), sai: ' + v.ryhma);
    assert(v.kkSaastoEurKk && v.kkSaastoEurKk.p50 === 800, 'kk-säästön mediaani 800');
    assert(v.varallisuusNytEur && v.varallisuusNytEur.p75 === 60000, 'varallisuuden p75 60000');
    assert(v.elakeikaTavoiteV && v.elakeikaTavoiteV.p50 === 63, 'eläkeikätavoitteen mediaani 63');
    assert(v.onnistumistodennakoisyysPct && v.onnistumistodennakoisyysPct.p50 === 75, 'onnistumis-% skaalattu prosenteiksi');
    assert(v.tyoelakkeenOsuusTulostaPct === 55, 'työeläkeosuus prosentteina');
    assert(v.kayttajaOnJakanutOman === false, 'jakamattomuus näkyy lipussa');
    assert(v.suunnitelmiaRyhmassa === 42 && v.jaettujaYhteensa === 123, 'lukumäärät mukana');
    assert(v.tapahtumienMediaaniIkaV == null || typeof v.tapahtumienMediaaniIkaV === 'object', 'tapahtumaiät kelvollinen muoto');
    console.log('vertailu-osio:', JSON.stringify(v, null, 1));
  }
  const ans = await page.textContent('.tk-a');
  assert(/800/.test(ans), 'vastaus renderöityi (sisältää 800)');
  const doubts = await page.$$eval('.tk-a .tk-doubt', (els) => els.length);
  assert(doubts === 0, 'vertailuluku 800 läpäisi numerovalidoinnin (ei epäilymerkintää)');

  await browser.close();
  server.close();
  console.log(process.exitCode ? 'VIRHEITÄ.' : 'Kaikki verifioinnit läpi.');
})().catch((e) => { console.error('KAATUI:', e); process.exit(1); });
