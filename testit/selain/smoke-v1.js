// V1-smoke: piirtopöytä auki/kiinni, HUD, worker-tarkennus, regressiot
'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let failed = 0;
  const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-tour-done', '1'); }); // kierros testataan erikseen
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // Ensivierailu avaa piirtopöydän automaattisesti (V4) — palataan normaalitilaan
  if (await page.evaluate(() => document.body.classList.contains('fs'))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  ok((await page.locator('#chart > *').count()) > 20, 'graafi renderöityy');
  ok(await page.evaluate(() => sim && sim.exp && sim.exp.length > 700), 'sim laskettu');

  // Worker-tarkennus: mcPaths 300 → 5000
  await page.waitForTimeout(1500);
  const paths = await page.evaluate(() => sim.mcPaths);
  ok(paths === 5000, 'worker tarkensi 5000 polkuun', 'mcPaths=' + paths);
  ok(await page.evaluate(() => sim.successProb != null && !sim.successStale), 'onnistumis-% tuore');

  // Piirtopöytä auki napista
  await page.click('#fsOpen');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.body.classList.contains('fs')), 'body.fs päällä');
  ok(await page.evaluate(() => !document.getElementById('hud').hidden), 'HUD näkyy');
  ok((await page.locator('.hud-m').count()) === 3, 'HUD: 3 tunnuslukua');
  ok(await page.evaluate(() => !!baseline), 'haamu otettiin automaattisesti');
  ok(await page.evaluate(() => sim.sustainableWd != null), 'kestävä tulo laskettu HUDiin');

  // Chartin koko täyttää ruudun
  const box = await page.locator('#chartWrap').boundingBox();
  ok(box.height > 600, 'graafi täyttää korkeuden', JSON.stringify(box));

  // Esc sulkee
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.body.classList.contains('fs')), 'Esc sulkee piirtopöydän');

  // F avaa ja sulkee
  await page.keyboard.press('f');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.body.classList.contains('fs')), 'F avaa');
  // back-ele sulkee
  await page.goBack();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.body.classList.contains('fs')), 'selaimen back sulkee');
  ok(await page.evaluate(() => location.pathname === '/'), 'URL ennallaan');

  // Tapahtuman siirto piirtotilassa V2-mallilla: valinta ensin, veto sitten
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  const ageBefore = await page.evaluate(() => state.events.find((e) => e.type === 'car').age);
  const marker = page.locator('g.marker').nth(1); // car @ 45
  let mb = await marker.boundingBox();
  await page.mouse.click(mb.x + mb.width / 2, mb.y + 10); // valinta
  await page.waitForTimeout(200);
  mb = await marker.boundingBox();
  await page.mouse.move(mb.x + mb.width / 2, mb.y + 10);
  await page.mouse.down();
  await page.mouse.move(mb.x + mb.width / 2 + 120, mb.y + 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const ageAfter = await page.evaluate(() => state.events.find((e) => e.type === 'car').age);
  ok(ageAfter > ageBefore, 'tapahtuman siirto toimii fs-tilassa (valinta + veto)', `${ageBefore} → ${ageAfter}`);
  await page.keyboard.press('Escape'); // valinta pois ennen sulkua

  // X-nappi sulkee
  await page.click('#fsClose');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.body.classList.contains('fs')), '✕ sulkee');

  // Ctrl+Z kumoaa raahauksen
  await page.waitForTimeout(700); // undo-debounce
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const ageUndone = await page.evaluate(() => state.events.find((e) => e.type === 'car').age);
  ok(ageUndone === ageBefore, 'Ctrl+Z palauttaa raahauksen', `${ageUndone} vs ${ageBefore}`);

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} SMOKE-TESTIÄ EPÄONNISTUI` : '\nV1-smoke läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
