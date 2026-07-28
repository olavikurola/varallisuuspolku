// Sijoitustili (kuori) ja kulut: segmentti, selitteet, kulukentät,
// vertailulinkki, jakolinkki ja Suunnitelmani-oletukset
'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let failed = 0;
  const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-tour-done', '1'); localStorage.setItem('vp-pro-seen', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Oletus: arvo-osuustili, ei kuorikenttää, ei vertailulinkkiä
  ok(await page.evaluate(() => state.acct === 'aot'), 'oletus on arvo-osuustili');
  ok(await page.evaluate(() => document.getElementById('acctSel').value === 'aot'), 'segmentti näyttää AOT:n');
  ok(await page.evaluate(() => document.getElementById('wrapFeeField').hidden), 'kuoren kulu piilossa AOT:lla');
  ok(await page.evaluate(() => document.getElementById('acctCompareLink').hidden), 'vertailunappi piilossa AOT:lla');
  const wEnd0 = await page.evaluate(() => sim.wEnd);

  // OST: sama polku ilman osinkoja; talletuskaton arvio selitteessä
  await page.selectOption('#acctSel', 'ost');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => state.acct === 'ost'), 'OST valittu');
  ok((await page.evaluate(() => sim.wEnd)) === wEnd0, 'OST = AOT ilman osinkoja (sama voitto-osuusvero)');
  const note = await page.evaluate(() => document.getElementById('acctNote').textContent);
  ok(note.includes('Ei veroa tilillä'), 'selite kertoo tilin', note);
  ok(note.includes('ylittyy ~') || note.includes('100 000'), 'talletuskaton arvio näkyy', note);
  ok(await page.evaluate(() => !document.getElementById('acctCompareLink').hidden), 'vertailunappi esiin');

  // Osinkotuotto: AOT:lla jarru, OST:lla ei → kuoren hyöty näkyy vertailussa
  await page.fill('#divYield', '3.5');
  await page.dispatchEvent('#divYield', 'input');
  await page.waitForTimeout(400);
  const wOstDiv = await page.evaluate(() => sim.wEnd);
  ok(wOstDiv === wEnd0, 'OST:lla osingot verotta — polku ei muutu');
  await page.selectOption('#acctSel', 'aot');
  await page.waitForTimeout(400);
  const wAotDiv = await page.evaluate(() => sim.wEnd);
  ok(wAotDiv < wOstDiv, 'AOT:lla osinkovero jarruttaa', `${wAotDiv} vs ${wOstDiv}`);
  await page.selectOption('#acctSel', 'ost');
  await page.waitForTimeout(300);

  // Vertailulinkki: sama suunnitelma AOT:na haamuksi
  await page.click('#acctCompareLink');
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => baseline && (baseline.acct === 'aot' || baseline.acct === undefined)), 'haamu on AOT-versio');
  ok(await page.evaluate(() => !document.getElementById('legendCompare').hidden), 'vertailulegenda näkyy');
  await page.waitForFunction(() => typeof ghostSim !== 'undefined' && ghostSim, null, { timeout: 5000 }).catch(() => {});
  ok(await page.evaluate(() => ghostSim && ghostSim.wEnd < sim.wEnd), 'haamu (AOT+osingot) häviää kuorelle', 'ghost vs sim');

  // Kulut: yleiskulu jarruttaa; vakuutuskuorella lisäksi kuoren kulu
  const wBeforeFee = await page.evaluate(() => sim.wEnd);
  await page.fill('#feePct', '0.5');
  await page.dispatchEvent('#feePct', 'input');
  await page.waitForTimeout(400);
  const wAfterFee = await page.evaluate(() => sim.wEnd);
  ok(wAfterFee < wBeforeFee, 'sijoituskulu pienentää loppuvarallisuutta');
  await page.selectOption('#acctSel', 'ins');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.getElementById('wrapFeeField').hidden), 'kuoren kulukenttä esiin vakuutuskuorella');
  await page.fill('#wrapFee', '0.45');
  await page.dispatchEvent('#wrapFee', 'input');
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => sim.wEnd)) < wAfterFee, 'kuoren kulu jarruttaa lisää');

  // Jakolinkki kantaa tilin ja kulut
  const url = await page.evaluate(() => makeShareUrl());
  const page2 = await browser.newPage();
  await page2.goto(url.replace(/^https?:\/\/[^/]+/, 'http://localhost:8123'), { waitUntil: 'networkidle' });
  await page2.waitForTimeout(600);
  ok(await page2.evaluate(() => state.acct === 'ins' && state.wrapFee === 0.45 && state.feePct === 0.5 && state.divYield === 3.5),
    'jakolinkki kantaa tilin ja kulut');
  await page2.close();

  // Suunnitelmani-oletukset mainitsevat kuoren ja kulut
  await page.evaluate(() => openSummary());
  await page.waitForTimeout(400);
  const sumT = await page.evaluate(() => document.getElementById('sumSheet').textContent);
  ok(sumT.includes('vakuutuskuori'), 'oletuksissa vakuutuskuori', '');
  ok(sumT.includes('kuoren kulu'), 'oletuksissa kuoren kulu');
  ok(sumT.includes('sijoituskulut'), 'oletuksissa sijoituskulut');
  await page.evaluate(() => closeSummary());

  // Vertailudata-payload: kuori ja kokonaiskulut mukana, ei ylimääräisiä
  const pl = await page.evaluate(() => buildDonationPayload(state, sim));
  ok(pl.acct === 'ins' && Math.abs(pl.feePct - 0.95) < 1e-9, 'payload kantaa kuoren ja kokonaiskulut', JSON.stringify({ a: pl.acct, f: pl.feePct }));
  ok(pl.wrapFee === undefined && pl.divYield === undefined, 'osakentät eivät vuoda payloadiin');

  // Vanha tallenne ilman kenttiä → neutraalit oletukset
  await page.evaluate(() => applySaved({ ageNow: 30, ageEnd: 90, startCapital: 0, monthly: 500, allocStocks: 70, allocBonds: 20, events: [] }));
  ok(await page.evaluate(() => state.acct === 'aot' && state.feePct === 0 && state.wrapFee === 0 && state.divYield === 0),
    'vanha tallenne → AOT ja nollakulut');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} KUORI-SMOKE-TESTIÄ EPÄONNISTUI` : '\nKuori-smoke läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
