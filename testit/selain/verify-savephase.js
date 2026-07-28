'use strict';
/* Porrastetun säästön käyttöliittymän verifiointi. */
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

  await page.goto('http://localhost:8123/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-tour-done', '1'); });
  await page.goto('http://localhost:8123/');
  await page.waitForFunction(() => typeof state !== 'undefined' && document.querySelectorAll('#chart path').length > 0);

  console.log('Oletustila (ei aikataulua)');
  ok(await page.locator('#savePhaseBox').isHidden(), 'editori piilossa oletuksena');
  ok(await page.locator('#monthlyField').isVisible(), 'tasainen säästökenttä näkyy');
  ok(await page.evaluate(() => state.savePhases) === null, 'ei aikataulua oletuksena');

  console.log('Kytkin päälle');
  await page.click('#savePhaseLink');
  ok(!(await page.locator('#savePhaseBox').isHidden()), 'editori aukeaa');
  ok(await page.locator('.savephase-row').count() === 2, 'kaksi vaihetta seedattu');
  ok(await page.locator('#monthlyField').isHidden(), 'tasainen kenttä piiloutuu');
  ok(await page.evaluate(() => state.savePhases.length) === 2, 'state.savePhases = 2 vaihetta');

  console.log('Muokkaus, lisäys, poisto');
  const before = await page.evaluate(() => (sim || simulate(state)).wEnd);
  await page.locator('.sp-amt').nth(1).fill('1500');
  await page.waitForTimeout(100);
  ok(await page.evaluate(() => state.savePhases[1].amount) === 1500, 'vaiheen summa päivittyy tilaan');
  ok(await page.evaluate(() => (sim || simulate(state)).wEnd) !== before, 'graafi reagoi (loppuvarallisuus muuttui)');
  await page.click('#savePhaseAdd');
  ok(await page.locator('.savephase-row').count() === 3, '+ Lisää vaihe → 3 riviä');
  await page.locator('.sp-del').first().click();
  ok(await page.locator('.savephase-row').count() === 2, 'poista rivi → 2 riviä');

  console.log('Kertymä-raahaus estetty');
  const guard = await page.evaluate(() => {
    const b = state.monthly;
    const r = dragAcc({}, 40, 99999, false);
    return { c: r.constraint, changed: state.monthly !== b };
  });
  ok(guard.c === 'porrastettu' && !guard.changed, 'raahaus ohjaa editoriin eikä muuta tilaa', JSON.stringify(guard));

  console.log('Jakolinkin kierto');
  const rt = await page.evaluate(() => {
    const o = serialize();
    const hasP = Array.isArray(o.savePhases) && o.savePhases.length >= 2;
    applySaved(JSON.parse(JSON.stringify(o)));
    syncInputs();
    return { hasP, len: state.savePhases ? state.savePhases.length : 0, boxOpen: !document.getElementById('savePhaseBox').hidden };
  });
  ok(rt.hasP && rt.len >= 2 && rt.boxOpen, 'serialize→applySaved säilyttää aikataulun ja UI:n', JSON.stringify(rt));

  console.log('Kytkin pois');
  await page.click('#savePhaseOff');
  ok(await page.evaluate(() => state.savePhases) === null, 'poisto nollaa aikataulun');
  ok(await page.locator('#monthlyField').isVisible(), 'tasainen kenttä palaa');
  ok(await page.evaluate(() => state.monthly) === 1500, 'perussäästö = 1. vaiheen summa poiston jälkeen');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nKaikki porrastustarkistukset läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
