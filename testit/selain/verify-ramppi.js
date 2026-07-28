'use strict';
/* Aloitusrampin eheysverifiointi: ramppi vs. kierros vs. jakolinkki vs. paluu. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');

let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };

(async () => {
  const server = spawn('node', ['testit/selain/serve.js'], { cwd: require('path').join(__dirname, '..', '..') });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const freshFirstVisit = async () => {
    await page.goto('http://localhost:8123/?x=' + Math.random());
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:8123/?y=' + Math.random());
    await page.waitForFunction(() => typeof state !== 'undefined' && document.querySelectorAll('#chart path').length > 0);
    await page.waitForTimeout(900); // autostart-viive 600 ms
  };

  console.log('Ensivierailu: ramppi kierroksen sijaan');
  await freshFirstVisit();
  ok(await page.locator('.ramp').isVisible(), 'ramppi näkyy ensivierailulla');
  ok(await page.locator('#tour').isHidden(), 'kierros EI käynnisty rampin päälle');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'rampAge', 'fokus ikäkentässä');

  console.log('Validointi ja täyttö');
  await page.click('#rampGo');
  ok(!(await page.locator('#rampErr').isHidden()), 'puuttuva ikä → virheviesti, ei etenemistä');
  await page.fill('#rampAge', '34');
  await page.fill('#rampWealth', '15000');
  await page.fill('#rampMonthly', '300');
  await page.click('#rampGo');
  await page.waitForSelector('#rampOpen');
  const res = await page.evaluate(() => ({
    age: state.ageNow, w: state.startCapital, m: state.monthly,
    events: state.events.map((e) => e.type),
    goal: state.events[0].goal, pension: state.events[0].pension, retA: state.events[0].age,
  }));
  ok(res.age === 34 && res.w === 15000 && res.m === 300, 'kolme lukua tilaan', JSON.stringify(res));
  ok(res.events.length === 1 && res.events[0] === 'retirement', 'vain eläketapahtuma — ei esimerkkielämää');
  ok(res.goal === 'withdrawal' && res.pension === 0 && res.retA === 65, 'eläke 65 v, kestävä tulo ratkaistaan, työeläke 0');
  const statTxts = await page.locator('.ramp-stat .v').allTextContents();
  ok(statTxts.length === 2 && statTxts.every((t) => /\d/.test(t)), 'otsikkovastaus: kaksi lukua', JSON.stringify(statTxts));

  console.log('Avaus työtilaan');
  await page.click('#rampOpen');
  ok(await page.locator('.ramp').isHidden(), 'ramppi sulkeutuu');
  ok(await page.locator('#tour').isHidden(), 'kierros ei tunge väliin');
  ok(await page.evaluate(() => localStorage.getItem('vp-ramp-done')) === '1', 'ramppi merkitty tehdyksi');

  console.log('Veto-vihje: eläkemerkki sykkii kerran ja ohjaa raahaamaan');
  ok(await page.locator('.veto-hint').count() === 1, 'vihje näkyy rampin jälkeen');
  ok((await page.locator('.veto-hint').textContent()).includes('vedä'), 'vihje kehottaa vetämään');
  ok(await page.locator('#chart .marker.veto-pulse').count() === 1, 'eläkemerkki sykkii');
  const hintBox = await page.evaluate(() => {
    const t = document.querySelector('.veto-hint').getBoundingClientRect();
    const w = document.getElementById('chartWrap').getBoundingClientRect();
    return { inside: t.left >= w.left && t.right <= w.right && t.top >= w.top && t.bottom <= w.bottom };
  });
  ok(hintBox.inside, 'vihje pysyy piirtoalueen sisällä');
  await page.mouse.click(400, 400); // ensimmäinen kosketus piilottaa
  ok(await page.locator('.veto-hint').count() === 0, 'kosketus piilottaa vihjeen');
  ok(await page.evaluate(() => localStorage.getItem('vp-veto-vihje')) === '1', 'vihje merkitty näytetyksi');

  console.log('Paluukäynti: ei ramppia, ei kierrosta');
  await page.goto('http://localhost:8123/?z=1');
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  await page.waitForTimeout(900);
  ok(await page.locator('.ramp').isHidden(), 'ramppi ei toistu');
  ok(await page.locator('#tour').isHidden(), 'kierros ei käynnisty palaajalle');
  ok(await page.evaluate(() => state.ageNow) === 34, 'oma suunnitelma säilyi');
  ok(await page.locator('.veto-hint').count() === 0, 'veto-vihje ei toistu paluukäynnillä');

  console.log('Ohituspolku: esimerkkisuunnitelma + kierros');
  await freshFirstVisit();
  await page.click('#rampSkip');
  ok(await page.locator('.ramp').isHidden(), 'ohitus sulkee rampin');
  await page.waitForFunction(() => !document.getElementById('tour').hidden);
  ok(true, 'kierros käynnistyy ohittajalle');
  const skipSt = await page.evaluate(() => ({ m: state.monthly, n: state.events.length }));
  ok(skipSt.m === 1000 && skipSt.n === 3, 'esimerkkisuunnitelma säilyy ohittajalla', JSON.stringify(skipSt));

  console.log('Jakolinkki: ei ramppia');
  await page.goto('http://localhost:8123/?s=' + Math.random());
  await page.evaluate(() => localStorage.clear());
  const hash = await page.evaluate(() => btoa(unescape(encodeURIComponent(JSON.stringify(serialize())))));
  await page.goto('http://localhost:8123/#s=' + hash);
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  await page.waitForTimeout(900);
  ok(await page.locator('.ramp').isHidden(), 'jakolinkillä saapuva ei näe ramppia');

  console.log('Testihiljennys (vp-autotour-off)');
  await page.goto('http://localhost:8123/?q=1');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); });
  await page.goto('http://localhost:8123/?q=2');
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  await page.waitForTimeout(900);
  ok(await page.locator('.ramp').isHidden(), 'vp-autotour-off hiljentää myös rampin');
  ok(await page.locator('#tour').isHidden(), 'ja kierroksen (kuten ennen)');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nKaikki ramppitarkistukset läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
