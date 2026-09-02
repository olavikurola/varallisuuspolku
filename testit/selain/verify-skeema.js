/* Skeemaversio selaimessa (erä 7): versioton (v1) jakolinkki latautuu,
   uudelleensarjoitus lisää sv=2, ja tulevaisuuden versio ei kaada latausta
   (eteenpäin-yhteensopivuus: varoitus konsoliin, sisältö parhaan kyvyn mukaan). */
// Playwright NODE_PATHin kautta (ks. testit/README.md)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const p = require('path');

const ROOT = p.join(__dirname, '..', '..');
let fail = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond ? '' : '  [' + (extra || '') + ']')); if (!cond) fail++; };

const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
const statik = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (f === '/') f = '/index.html';
  fs.readFile(p.join(ROOT, f), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[p.extname(f).slice(1)] || 'application/octet-stream' });
    res.end(d);
  });
});

const V1 = { ageNow: 41, ageEnd: 90, startCapital: 120000, monthly: 900, savingsGrowth: 1.5, allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
  events: [{ id: 2, type: 'retirement', age: 63, withdrawal: 2500, pension: 1700, pensionAge: 65 }] };
const link = (o) => '#s=' + Buffer.from(JSON.stringify(o), 'utf8').toString('base64');

statik.listen(8141, async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fi-FI' });
  await ctx.addInitScript(() => { localStorage.setItem('vp-tour-done', '1'); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-veto-vihje', '1'); });
  const pg = await ctx.newPage();
  const warns = [];
  pg.on('console', (m) => { if (m.type() === 'warning') warns.push(m.text()); });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));

  await pg.goto('http://localhost:8141/' + link(V1));
  await pg.waitForTimeout(1500);
  const v1 = await pg.evaluate(() => ({ age: state.ageNow, sv: serialize().sv, ret: state.events.find((e) => e.type === 'retirement').age }));
  ok(v1.age === 41 && v1.ret === 63, 'versioton (v1) linkki latautuu');
  ok(v1.sv === 2, 'uudelleensarjoitus lisää sv = 2', String(v1.sv));

  // eri query → täysi lataus (about:blank kieltäisi localStoragen init-skriptiltä)
  await pg.goto('http://localhost:8141/?v9' + link(Object.assign({ sv: 9, tulevaisuudenKentta: { x: 1 } }, V1)));
  await pg.waitForTimeout(1500);
  const v9 = await pg.evaluate(() => ({ age: state.ageNow, monthly: state.monthly }));
  ok(v9.age === 41 && v9.monthly === 900, 'tuntematon uudempi versio latautuu parhaan kyvyn mukaan');
  ok(warns.some((w) => /skeemaversio 9/.test(w)), 'uudemmasta versiosta varoitetaan konsolissa', warns.join(' | ').slice(0, 120));
  ok(errs.length === 0, 'ei konsolivirheitä', errs[0]);

  await b.close();
  statik.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
});
