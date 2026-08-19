/* Ikäkohdistimen verifiointi: synkattu hover-viiva molemmissa kaavioissa
   (osoitettu täydellä, toinen himmennettynä) + mobiilin kosketusveto
   (touch-action pitää pointer-tapahtumat elossa, ei pointercancel-pätkintää). */
// Playwright NODE_PATHin kautta (ks. testit/README.md)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const p = require('path');

const ROOT = p.join(__dirname, '..', '..');
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2', txt: 'text/plain' };

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (f === '/') f = '/index.html';
  fs.readFile(p.join(ROOT, f), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[p.extname(f).slice(1)] || 'application/octet-stream' });
    res.end(d);
  });
});

// Hover-viivat tunnistetaan strokesta — niillä ei ole id:tä
const LINE = 'line[stroke="rgba(232,237,248,0.25)"]';

server.listen(8134, async () => {
  const b = await chromium.launch();
  let fail = 0;
  const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fail++; };

  async function page(opts = {}) {
    const ctx = await b.newContext({
      viewport: { width: opts.w || 1440, height: opts.h || 900 },
      locale: 'fi-FI',
      hasTouch: !!opts.touch, isMobile: !!opts.touch,
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('vp-tour-done', '1');
      localStorage.setItem('vp-autotour-off', '1');
      localStorage.setItem('vp-veto-vihje', '1');
    });
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8134/');
    await pg.waitForTimeout(1800);
    return { ctx, pg };
  }

  const lineState = (pg) => pg.evaluate((sel) => ({
    main: +document.querySelector('#chart ' + sel).getAttribute('opacity'),
    bal: +document.querySelector('#balanceChart ' + sel).getAttribute('opacity'),
  }), LINE);

  // 1) Työpöytä: hover pääkaaviossa → viiva molemmissa, tase himmennettynä
  let { ctx, pg } = await page();
  const cb = await pg.locator('#chart').boundingBox();
  await pg.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await pg.waitForTimeout(300);
  let st = await lineState(pg);
  ok(st.main === 1, 'pääkaavion viiva täysi kun sitä osoitetaan (' + st.main + ')');
  ok(st.bal > 0 && st.bal < 1, 'taseviiva näkyy himmennettynä (' + st.bal + ')');
  ok(await pg.evaluate(() => !document.getElementById('tooltip').hidden), 'tooltip näkyy');

  // 2) Hover tasekaaviossa → roolit vaihtuvat
  await pg.locator('#balanceChart').scrollIntoViewIfNeeded();
  await pg.waitForTimeout(200);
  const bb = await pg.locator('#balanceChart').boundingBox();
  await pg.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await pg.waitForTimeout(300);
  st = await lineState(pg);
  ok(st.bal === 1, 'taseviiva täysi kun tasetta osoitetaan (' + st.bal + ')');
  ok(st.main > 0 && st.main < 1, 'pääkaavion viiva himmennettynä (' + st.main + ')');
  await ctx.close();

  // 3) Mobiili: touch-action päällä ja kosketusveto ei katkea pointercanceliin
  ({ ctx, pg } = await page({ w: 390, h: 844, touch: true }));
  const ta = await pg.evaluate(() => [
    getComputedStyle(document.getElementById('chart')).touchAction,
    getComputedStyle(document.getElementById('balanceChart')).touchAction,
  ]);
  ok(ta[0] === 'pan-y pinch-zoom', '#chart touch-action (' + ta[0] + ')');
  ok(ta[1] === 'pan-y pinch-zoom', '#balanceChart touch-action (' + ta[1] + ')');

  await pg.evaluate(() => {
    window.__ev = { move: 0, cancel: 0, ttSeen: 0 };
    const svg = document.getElementById('chart');
    svg.addEventListener('pointermove', () => {
      window.__ev.move++;
      if (!document.getElementById('tooltip').hidden) window.__ev.ttSeen++;
    }, true);
    svg.addEventListener('pointercancel', () => { window.__ev.cancel++; }, true);
  });
  const mb = await pg.locator('#chart').boundingBox();
  const cdp = await ctx.newCDPSession(pg);
  // Loiva vino veto keskeltä (overlayn päältä — kosketuksen pointer capture
  // menee pointerdown-kohteelle, reunan akselialue ei kelpaa)
  const y0 = mb.y + mb.height * 0.5;
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push({ x: mb.x + mb.width * (0.35 + 0.45 * (i / 20)), y: y0 + 0.8 * i });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
  for (const pt of pts.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt] });
    await pg.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const ev = await pg.evaluate(() => window.__ev);
  ok(ev.cancel === 0, 'ei pointercancelia vedossa (' + ev.cancel + ')');
  ok(ev.move >= 10, 'pointermovet kulkevat läpi (' + ev.move + '/20)');
  ok(ev.ttSeen >= 10, 'tooltip pysyi näkyvissä vedon ajan (' + ev.ttSeen + ')');
  await ctx.close();

  await b.close();
  server.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
});
