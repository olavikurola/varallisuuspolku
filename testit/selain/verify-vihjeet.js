// Vihjeketju-smoke: veto → oma tapahtuma → Tulkki, yksi vihje per istunto,
// kukin kerran ikinä, vaihe ohi jos asia jo tehty. Ajo: node testit/selain/serve.js
// taustalle ja node testit/selain/verify-vihjeet.js
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
  // Vihje ajastuu +4 s lataukseen — odotus reilusti yli
  const reloadAndWait = async () => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(4800); };

  // Pohjustus: suunnitelma jossa vain eläketapahtuma (pension 0), ramppi ja
  // kierros merkitty nähdyiksi — vihjeketjun latauspolku aukeaa
  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  if (await page.evaluate(() => document.body.classList.contains('fs'))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => {
    state.events = state.events.filter((e) => e.type === 'retirement');
    if (!state.events.length) state.events.push({ id: idSeq++, type: 'retirement', age: 65, withdrawal: 2400, pension: 0, pensionAge: 65 });
    state.events[0].pension = 0;
    saveState();
    localStorage.setItem('vp-ramp-done', '1');
    localStorage.setItem('vp-tour-done', '1');
    localStorage.removeItem('vp-autotour-off');
  });

  console.log('Istunto 1: vetovihje (vetoa ei tehty, vihjettä ei näytetty)');
  await reloadAndWait();
  ok(await page.locator('.veto-hint').count() === 1, 'veto-vihje näkyy');
  ok(await page.locator('.polku-hint').count() === 0, 'tapahtumavihje EI näy samassa istunnossa');
  ok(await page.evaluate(() => localStorage.getItem('vp-veto-vihje') === '1'), 'vetovihje merkitty nähdyksi');

  console.log('Istunto 2: tapahtumasirut + ohituskosketus');
  await reloadAndWait();
  ok(await page.locator('.veto-hint').count() === 0, 'vetovihjettä ei toisteta');
  ok(await page.locator('.polku-hint').count() === 1, 'sirupalkki näkyy');
  ok(await page.locator('.ph-chip').count() === 3, 'kolme sirua (työeläke, asunto, lapsi)');
  ok(await page.evaluate(() => localStorage.getItem('vp-vihje-tapahtuma') === '1'), 'tapahtumavihje merkitty nähdyksi');
  await page.mouse.click(30, 300); // muualle-kosketus
  await page.waitForTimeout(200);
  ok(await page.locator('.polku-hint').count() === 0, 'kosketus muualle sulkee palkin');

  console.log('Istunto 3: työeläke-siru avaa eläkepopoverin kenttään');
  await page.evaluate(() => localStorage.removeItem('vp-vihje-tapahtuma'));
  await reloadAndWait();
  await page.locator('.ph-chip', { hasText: 'Työeläkkeeni' }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('.polku-hint').count() === 0, 'palkki poistuu valinnasta');
  ok(await page.locator('#pv-pen').count() === 1, 'eläkepopover auki');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'pv-pen'), 'fokus työeläkekentässä');

  console.log('Istunto 4: asuntosiru lisää tapahtuman');
  await page.evaluate(() => localStorage.removeItem('vp-vihje-tapahtuma'));
  await reloadAndWait();
  await page.locator('.ph-chip', { hasText: 'Asunnon osto' }).click();
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => state.events.some((e) => e.type === 'home')), 'asunto lisätty suunnitelmaan');
  ok(await page.evaluate(() => state.events.find((e) => e.type === 'home').age === state.ageNow + 5), 'oletusikä +5 v');

  console.log('Istunto 5: Tulkki-vihje (oma tapahtuma on jo)');
  await reloadAndWait();
  ok(await page.locator('.polku-hint').count() === 0, 'tapahtumavihje ohitetaan (tapahtuma on)');
  ok(await page.locator('.tk-nudge').count() === 1, 'Tulkki-vihje näkyy');
  ok(await page.evaluate(() => document.querySelector('.tk-handle').classList.contains('tk-pulse')), 'kieleke hehkuu');
  ok(await page.evaluate(() => localStorage.getItem('vp-vihje-tulkki') === '1'), 'Tulkki-vihje merkitty nähdyksi');
  await page.mouse.click(30, 300);
  await page.waitForTimeout(200);
  ok(await page.locator('.tk-nudge').count() === 0, 'kosketus sulkee Tulkki-vihjeen');

  console.log('Istunto 6: ketju kulutettu — ei vihjeitä');
  await reloadAndWait();
  ok(await page.locator('.veto-hint, .polku-hint, .tk-nudge').count() === 0, 'ei vihjeitä');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));
  await browser.close();
  if (failed) { console.error(failed + ' TESTIÄ EPÄONNISTUI'); process.exit(1); }
  console.log('Kaikki vihjeketjun testit ok');
})();
