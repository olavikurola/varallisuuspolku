// ~14 s demolooppi: dashboard (tunnusluvut + tooltip-pyyhkäisy) →
// piirtopöytä → käyrän veto (chippi+HUD) → eläkeiän siirto.
// Tallennus webm → muunnos gif/mp4 erikseen.
'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: 'video', size: { width: 1280, height: 720 } },
  });
  await ctx.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => sim && sim.mcPaths === 5000, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900); // dashboard: paneeli + tunnusluvut + graafi

  // 1) Tooltip-pyyhkäisy dashboardin graafilla — luvut elävät iän mukana
  const box = await page.locator('#chartWrap').boundingBox();
  const y = box.y + box.height * 0.55;
  await page.mouse.move(box.x + box.width * 0.15, y);
  for (let i = 0; i <= 26; i++) {
    await page.mouse.move(box.x + box.width * (0.15 + 0.65 * (i / 26)), y, { steps: 2 });
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(700);

  // 2) Piirtopöytään ⛶-napista
  await page.click('#fsOpen');
  await page.waitForTimeout(1100); // haamunuoliopasteet ehtivät näkyä

  const curvePt = (age) => page.evaluate((a) => {
    const r = document.getElementById('chart').getBoundingClientRect();
    const m = Math.round((a - sim.a0) * 12);
    return { x: r.left + scaleX(a), y: r.top + scaleY(sim.exp[m]) };
  }, age);

  // 3) Tartu käyrään: valinta + hidas ylösveto (chippi + HUD-deltat)
  const p = await curvePt(47);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(600);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(p.x, p.y - i * 4, { steps: 2 });
    await page.waitForTimeout(85);
  }
  await page.mouse.up();
  await page.waitForTimeout(1400); // HUD tarkentuu

  // 4) Vedä eläkepäiviä lähemmäs: eläkemerkin valinta + veto vasemmalle
  const marker = page.locator('g.marker').nth(2);
  let mb = await marker.boundingBox();
  await page.mouse.click(mb.x + mb.width / 2, mb.y + 10);
  await page.waitForTimeout(500);
  mb = await marker.boundingBox();
  await page.mouse.move(mb.x + mb.width / 2, mb.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(mb.x + mb.width / 2 - i * 6, mb.y + 10, { steps: 2 });
    await page.waitForTimeout(85);
  }
  await page.mouse.up();
  await page.waitForTimeout(1600);

  await ctx.close(); // video valmistuu
  const path = await page.video().path();
  console.log('video:', path);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
