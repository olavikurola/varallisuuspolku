'use strict';
/* Kieliversio (KIELIVERSIO.md): ?lang=en avaa englannin, oletus pysyy suomena.
   Vartioi: VP_KIELI-resoluutio, sanaston lataus, html lang, chippien ja
   korttien kieli molempiin suuntiin, paluu ?lang=fi:llä. Oma palvelin 8143. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8143;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

let failed = 0;
const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT);

(async () => {
  const b = await chromium.launch();

  // EN: ?lang=en
  const ctx1 = await b.newContext();
  const p1 = await ctx1.newPage();
  const errs = [];
  p1.on('pageerror', (e) => errs.push(e.message));
  await p1.goto(`http://localhost:${PORT}/?lang=en`);
  await p1.waitForTimeout(2500);
  ok(p1.url().includes('index-en.html'), '?lang=en ohjaa en-sivulle', p1.url());
  const kieli = await p1.evaluate(() => ({ vk: VP_KIELI, lang: document.documentElement.lang, sanasto: Object.keys(VP_SANASTO).length }));
  ok(kieli.vk === 'en', 'VP_KIELI=en', JSON.stringify(kieli));
  ok(kieli.sanasto > 450, `sanasto ladattu (${kieli.sanasto})`);
  ok(kieli.lang === 'en', 'html lang=en');
  const chip = await p1.locator('#palette .chip[data-type="study"] span').last().textContent().catch(() => null);
  ok(chip === 'Studies', 'paletin chippi englanniksi', JSON.stringify(chip));
  const statsTxt = await p1.locator('#stats').textContent();
  ok(/Invested|Success|Will it last/i.test(statsTxt), 'kortit englanniksi', statsTxt.slice(0, 120));
  ok(errs.length === 0, 'ei sivuvirheitä (en)', errs.join('; '));

  // FI: puhdas konteksti ilman parametria — sanasto ei saa latautua
  const ctx2 = await b.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`http://localhost:${PORT}/`);
  await p2.waitForTimeout(2000);
  const kieli2 = await p2.evaluate(() => ({ vk: VP_KIELI, sanasto: Object.keys(VP_SANASTO).length }));
  ok(kieli2.vk === 'fi' && kieli2.sanasto === 0, 'fi-oletus ja tyhjä sanasto', JSON.stringify(kieli2));
  const chip2 = await p2.locator('#palette .chip[data-type="study"] span').last().textContent();
  ok(chip2 === 'Opiskelu', 'paletin chippi suomeksi', JSON.stringify(chip2));
  ok(await p2.locator('#vpKieliEhdotus').count() === 0, 'ei banneria fi-selaimelle');

  // Banneri en-selaimelle: eksplisiittinen locale (oletus perii koneen kielen)
  const ctx3 = await b.newContext({ locale: 'en-US' });
  const p3 = await ctx3.newPage();
  await p3.goto(`http://localhost:${PORT}/`);
  await p3.waitForTimeout(2000);
  ok(await p3.locator('#vpKieliEhdotus').count() === 1, 'kielibanneri en-selaimelle fi-etusivulla');
  await p3.reload();
  await p3.waitForTimeout(1500);
  ok(await p3.locator('#vpKieliEhdotus').count() === 0, 'banneri vain kerran (vp-kieli-ehdotettu)');

  // Paluu: ?lang=fi nollaa en-valinnan pysyvästi
  await p1.goto(`http://localhost:${PORT}/?lang=fi`);
  await p1.waitForTimeout(1500);
  ok((await p1.evaluate(() => VP_KIELI)) === 'fi', '?lang=fi palauttaa suomen');

  await b.close();
  server.close();
  if (failed) { console.error(`\n${failed} TARKISTUSTA EPÄONNISTUI`); process.exit(1); }
  console.log('\nKaikki läpi');
})();
