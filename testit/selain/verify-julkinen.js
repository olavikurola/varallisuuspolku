'use strict';
/* Verifiointi: Tulkin julkinen taso — näkyvyys ilman avainta, 5/pv-kiintiö,
   kiinnostuskortti, lukusidonnat ([[polku]] → moottorin luku), 👍/👎,
   katsastuksen vertailuhuomio. Juuri = committoitu tila + oma tulkki.js. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

let failed = 0;
const ok = (c, name, d = '') => {
  if (c) console.log('OK: ' + name);
  else { failed++; console.error('FAIL: ' + name + (d ? ' — ' + d : '')); }
};

const FAKE_STATS = {
  updated: 'x', v: 2, kAnon: 30, total: 150,
  groups: {
    all: { n: 150, monthly: { p25: 1100, p50: 1400, p75: 2000 }, startCapital: { p25: 5000, p50: 40000, p75: 120000 }, stocks: { p25: 55, p50: 70, p75: 90 } },
    '30-34': {
      n: 40, monthly: { p25: 1200, p50: 1500, p75: 2200 },
      startCapital: { p25: 6000, p50: 30000, p75: 90000 },
      stocks: { p25: 60, p50: 75, p75: 90 },
      retireAge: { p25: 60, p50: 63, p75: 65 },
    },
  },
  eventAges: { retirement: { p50: 63.2, n: 40 } },
};

// NDJSON-vastaus: sidottu token + keksitty token + tavallinen kontekstin luku
const NDJSON =
  JSON.stringify({ delta: 'Onnistumistodennäköisyytesi on [[stats.onnistumistodennakoisyysPct]] % ja ' }) + '\n' +
  JSON.stringify({ delta: 'keksitty viittaus [[stats.eiOlemassa]] — mediaani 1500 €/kk.' }) + '\n' +
  JSON.stringify({ done: true, model: 'claude-haiku-4-5', usage: { in: 3000, out: 60 } }) + '\n';

(async () => {
  const server = http.createServer((rq, rs) => {
    let p = rq.url.split('?')[0]; if (p === '/') p = '/index.html';
    fs.readFile(path.join(ROOT, p), (err, data) => {
      if (err) { rs.writeHead(404); rs.end(); return; }
      rs.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      rs.end(data);
    });
  }).listen(8097);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  let lastBody = null;

  await page.route('**/stats.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_STATS) }));
  await page.route('**/tulkki', (r) => {
    lastBody = JSON.parse(r.request().postData());
    r.fulfill({ status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: NDJSON });
  });

  // EI avainta — julkinen taso. Ramppi ja kierros hiljennetään testiin.
  await page.addInitScript(() => {
    localStorage.setItem('vp-ramp-done', '1');
    localStorage.setItem('vp-autotour-off', '1');
    localStorage.setItem('vp-tour-done', '1');
  });
  await page.goto('http://127.0.0.1:8097/');

  /* 1. Kahva näkyy ilman avainta */
  const handle = await page.waitForSelector('.tk-handle', { timeout: 8000 }).catch(() => null);
  ok(!!handle, 'kahva näkyy ilman avainta (julkinen taso)');
  if (!handle) { await browser.close(); server.close(); process.exit(1); }

  await page.click('.tk-handle');
  await page.waitForTimeout(600);

  /* 2. Kertaesittely mainitsee kiintiön; footerissa 0/5; ei eval-nappia */
  const intro = await page.textContent('.tk-intro').catch(() => '');
  ok(/5 kysymystä päivässä/.test(intro || ''), 'kertaesittely mainitsee 5/pv-kiintiön');
  const quotaTxt = await page.textContent('#tkQuota');
  ok(/0\/5/.test(quotaTxt || ''), 'footerissa kiintiölaskuri 0/5', quotaTxt);
  ok(await page.$eval('#tkEvalCopy', (el) => el.hidden), 'Kopioi evalit piilossa ilman avainta');

  /* 3. Katsastuksen vertailuhuomio (monthly 1000 < P25 1200) */
  const kats = await page.textContent('.tk-kats').catch(() => '');
  ok(/alakvartiilissa/.test(kats || ''), 'katsastuksessa vertailuhuomio (alakvartiili)', (kats || '').slice(0, 120));

  /* 4. Kysymys: sidonnat renderöityvät, kiintiö kuluu, peukut näkyvät */
  await page.fill('#tkInput', 'Miksi onnistumistodennäköisyys on tämä?');
  await page.click('.tk-ask button[type=submit]');
  await page.waitForSelector('.tk-a .tk-meta', { timeout: 5000 });
  ok(lastBody && lastBody.key == null, 'pyyntö lähti ilman avainta');
  const bound = await page.$$eval('.tk-a .tk-bound', (els) => els.map((e) => e.textContent));
  ok(bound.length === 1, 'sidottu luku renderöityi moottorista', JSON.stringify(bound));
  const boundVal = bound[0] || '';
  const ctxProb = lastBody && lastBody.context && lastBody.context.stats && lastBody.context.stats.onnistumistodennakoisyysPct;
  ok(String(ctxProb) === boundVal.replace(/\s/g, ''), `sidottu arvo = kontekstin arvo (${ctxProb})`, boundVal);
  const doubts = await page.$$eval('.tk-a .tk-doubt', (els) => els.map((e) => e.textContent));
  ok(doubts.some((t) => t === '?'), 'keksitty sidontapolku → ?-epäilymerkintä', JSON.stringify(doubts));
  const meta = await page.textContent('.tk-a .tk-meta');
  ok(/1 sidottu/.test(meta), 'meta kertoo sidottujen määrän', meta);
  const q1 = await page.textContent('#tkQuota');
  ok(/1\/5/.test(q1 || ''), 'kiintiö kului 1/5', q1);
  const fb = await page.$$('.tk-a .tk-fb-b');
  ok(fb.length === 2, 'peukkunapit näkyvät');
  ok(!(await page.$('.tk-a .tk-eval-b')), 'Tallenna evaliksi EI näy ilman avainta');
  await fb[0].click();
  ok(await page.$eval('.tk-a .tk-fb-b', (el) => el.disabled), 'peukku lukittuu klikkauksen jälkeen');

  /* 5. Kiintiö täyteen → kiinnostuskortti */
  await page.evaluate(() => localStorage.setItem('vp-tulkki-kiintio', JSON.stringify({ d: new Date().toISOString().slice(0, 10), n: 5 })));
  await page.fill('#tkInput', 'vielä yksi kysymys');
  await page.click('.tk-ask button[type=submit]');
  await page.waitForSelector('.tk-quota-card', { timeout: 3000 });
  const qc = await page.textContent('.tk-quota-card');
  ok(/käytetty/.test(qc) && /kiinnostunut/i.test(qc), 'kiintiökortti kertoo tilanteen ja tarjoaa kiinnostusnapin');
  await page.click('.tk-interest');
  const qc2 = await page.textContent('.tk-interest');
  ok(/Kiitos/.test(qc2), 'kiinnostus kirjattu -kuittaus', qc2);

  /* 6. Avaimella: ei kiintiönäyttöä, eval-työkalut esillä */
  const page2 = await ctx.newPage();
  await page2.route('**/stats.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_STATS) }));
  await page2.route('**/tulkki', (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: NDJSON }));
  await page2.addInitScript(() => {
    localStorage.setItem('vp-tulkki-key', 'testikoodi');
    localStorage.setItem('vp-ramp-done', '1');
    localStorage.setItem('vp-autotour-off', '1');
    localStorage.setItem('vp-tour-done', '1');
    localStorage.setItem('vp-tulkki-intro', '1');
  });
  await page2.goto('http://127.0.0.1:8097/');
  await page2.click('.tk-handle');
  await page2.waitForTimeout(400);
  ok(await page2.$eval('#tkQuota', (el) => el.hidden), 'avaimella ei kiintiönäyttöä');
  ok(!(await page2.$eval('#tkEvalCopy', (el) => el.hidden)), 'avaimella Kopioi evalit näkyy');
  await page2.fill('#tkInput', 'kysymys avaimella');
  await page2.click('.tk-ask button[type=submit]');
  await page2.waitForSelector('.tk-a .tk-meta', { timeout: 5000 });
  ok(!!(await page2.$('.tk-a .tk-eval-b')), 'avaimella Tallenna evaliksi näkyy');
  // 👎 avaimella → tallentuu evaliin arviolla
  const downBtn = (await page2.$$('.tk-a .tk-fb-b'))[1];
  await downBtn.click();
  const evals = await page2.evaluate(() => JSON.parse(localStorage.getItem('vp-tulkki-evals') || '[]'));
  ok(evals.length === 1 && evals[0].arvio === 'alas', '👎 avaimella tallentaa evalin arviolla', JSON.stringify(evals.map((e) => e.arvio)));

  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nKaikki julkisen tason verifioinnit läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('KAATUI:', e); process.exit(1); });
