// Mobiili 390×844: HUD yhtenä rivinä, graafi täyttää, ei vaakascrollia +
// raahauksen fps-mittaus (V2-kriteeri: 60 fps, ei MC:tä pointermovessa)
'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  let failed = 0;
  const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

  // --- Mobiili ---
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await mob.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await mob.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-tour-done', '1'); });
  await mob.reload({ waitUntil: 'networkidle' });
  await mob.waitForTimeout(800);
  ok(await mob.evaluate(() => document.body.classList.contains('fs')), 'mobiili: ensivierailu avaa piirtopöydän');
  const hudBox = await mob.locator('#hud').boundingBox();
  ok(hudBox && hudBox.height < 70, 'mobiili: HUD yhtenä kompaktina rivinä', JSON.stringify(hudBox));
  const chartBox = await mob.locator('#chartWrap').boundingBox();
  ok(chartBox && chartBox.height > 500 && chartBox.y + chartBox.height <= 844, 'mobiili: graafi täyttää ruudun', JSON.stringify(chartBox));
  ok(await mob.evaluate(() => document.documentElement.scrollWidth <= 391), 'mobiili: ei vaakascrollia');
  await mob.screenshot({ path: 'mobile-fs.png' });
  // normaalinäkymä: graafin yläreuna näkyvissä ensiruudussa (Olavin linjaus)
  await mob.keyboard.press('Escape');
  await mob.waitForTimeout(400);
  const cw = await mob.locator('#chartWrap').boundingBox();
  ok(cw && cw.y < 560, 'mobiili: graafi näkyy ensiruudussa normaalitilassa', JSON.stringify(cw));
  await mob.screenshot({ path: 'mobile-normal.png' });
  await mob.close();

  // --- Suorituskyky: raahauksen framet ---
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-tour-done', '1'); }); // kierros testataan erikseen
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.waitForFunction(() => sim && sim.mcPaths === 5000, null, { timeout: 6000 }).catch(() => {});

  const p = await page.evaluate(() => {
    const r = document.getElementById('chart').getBoundingClientRect();
    const m = Math.round((47 - sim.a0) * 12);
    return { x: r.left + scaleX(47), y: r.top + scaleY(sim.exp[m]) };
  });
  await page.mouse.click(p.x, p.y); // valinta
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    window.__rafOn = true;
    const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__rafOn) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 60; i++) {
    await page.mouse.move(p.x, p.y - i * 2, { steps: 1 });
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const stats = await page.evaluate(() => {
    window.__rafOn = false;
    const f = window.__frames.slice(5, -5).sort((a, b) => a - b);
    const q = (p) => f[Math.floor(p * (f.length - 1))];
    return { n: f.length, med: q(0.5), p90: q(0.9), max: f[f.length - 1] };
  });
  console.log(`  frame-ajat raahauksessa: med ${stats.med.toFixed(1)} ms, p90 ${stats.p90.toFixed(1)} ms, max ${stats.max.toFixed(1)} ms (${stats.n} framea)`);
  ok(stats.med < 17.5, 'raahaus ~60 fps (mediaaniframe < 17,5 ms)', stats.med.toFixed(1));
  ok(stats.p90 < 34, 'ei pitkiä pysähdyksiä (p90 < 2 framea)', stats.p90.toFixed(1));

  await browser.close();
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nMobiili + suorituskyky läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
