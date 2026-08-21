'use strict';
/* Allokaatioliukurit: osakkeet ja korot ovat symmetriset — kumpikin saa kasvaa
   täyteen, ja jousto tulee ensin käteisestä (laskettu jäännös) ja vasta sen
   loputtua toisesta luokasta. Summa pysyy aina 100 %:ssa.
   Taustaa: ennen 21.8.2026 korot oli kovakattoinen osakepainoon, jolloin
   käteisen ollessa 0 korkoliukuri ei reagoinut vetoon lainkaan. Oma palvelin 8144. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8144;
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

// Liukurin veto: asetetaan arvo ja laukaistaan input-tapahtuma kuten selain
const veda = (pg, id, arvo) => pg.evaluate(([i, v]) => {
  const el = document.getElementById(i);
  el.value = String(v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [id, arvo]);

const tila = (pg) => pg.evaluate(() => ({
  s: state.allocStocks,
  b: state.allocBonds,
  c: 100 - state.allocStocks - state.allocBonds,
  sSlider: +document.getElementById('allocStocks').value,
  bSlider: +document.getElementById('allocBonds').value,
}));

(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const virheet = [];
  pg.on('pageerror', (e) => virheet.push(e.message));
  await pg.goto(`http://localhost:${PORT}/`);
  await pg.evaluate(() => {
    localStorage.setItem('vp-tour-done', '1');
    localStorage.setItem('vp-autotour-off', '1');
  });
  await pg.reload();
  await pg.waitForTimeout(1800);

  // Lähtötilanne: käteistä jäljellä (70/20/10)
  await veda(pg, 'allocStocks', 70);
  await veda(pg, 'allocBonds', 20);
  let x = await tila(pg);
  ok(x.s === 70 && x.b === 20 && x.c === 10, 'lähtötila 70/20/10', JSON.stringify(x));

  // 1) Korot kasvavat käteisen kustannuksella — osakkeet eivät liiku
  await veda(pg, 'allocBonds', 30);
  x = await tila(pg);
  ok(x.s === 70 && x.b === 30 && x.c === 0, 'korot syövät ensin käteisen (70/30/0)', JSON.stringify(x));

  // 2) Käteinen loppu → korot joustavat osakkeista (ENNEN: veto ei tehnyt mitään)
  await veda(pg, 'allocBonds', 45);
  x = await tila(pg);
  ok(x.b === 45, 'korkoliukuri reagoi vaikka käteinen on 0', JSON.stringify(x));
  ok(x.s === 55, 'osakkeet joustavat alaspäin (55)', JSON.stringify(x));
  ok(x.s + x.b === 100, 'summa pysyy 100 %:ssa', JSON.stringify(x));
  ok(x.sSlider === 55, 'osakeliukurin asento päivittyy näkyvästi', JSON.stringify(x));

  // 3) Symmetria toiseen suuntaan: osakkeet syövät korot kun käteistä ei ole
  await veda(pg, 'allocStocks', 80);
  x = await tila(pg);
  ok(x.s === 80 && x.b === 20 && x.c === 0, 'osakkeet joustavat koroista (80/20/0)', JSON.stringify(x));
  ok(x.bSlider === 20, 'korkoliukurin asento päivittyy näkyvästi', JSON.stringify(x));

  // 4) Kumpikaan ei ylitä sataa
  await veda(pg, 'allocBonds', 100);
  x = await tila(pg);
  ok(x.b === 100 && x.s === 0, 'korot 100 % → osakkeet 0', JSON.stringify(x));
  await veda(pg, 'allocStocks', 100);
  x = await tila(pg);
  ok(x.s === 100 && x.b === 0, 'osakkeet 100 % → korot 0', JSON.stringify(x));

  ok(virheet.length === 0, 'ei sivuvirheitä', virheet.join('; '));

  await b.close();
  server.close();
  if (failed) { console.error(`\n${failed} TARKISTUSTA EPÄONNISTUI`); process.exit(1); }
  console.log('\nKaikki läpi');
})();
