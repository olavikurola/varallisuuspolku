// Vertailu-UX: pilleri (nimi + euroero + paivita/lopeta), korttideltat,
// tooltipin vertailurivi, automaattihaamun kohinanesto
'use strict';
const { chromium } = require('playwright');
const BASE = process.env.VP_BASE || 'http://localhost:8123/';

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  let failed = 0;
  const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); sessionStorage.clear(); localStorage.setItem('vp-tour-done', '1'); localStorage.setItem('vp-pro-seen', '1'); });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(1200);

  ok(await p.evaluate(() => document.getElementById('cmpPill').hidden), 'pilleri piilossa kun ei eroa (automaattihaamu)');
  ok(await p.evaluate(() => !document.querySelector('#stats .stat .d')), 'ei delta-riveja kun ei eroa');

  // Lähtötilanne-haamu syntyy ensimmäisellä piirtopöytäkäynnillä (13.7. flow)
  await p.keyboard.press('f');
  await p.waitForTimeout(400);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await p.fill('#monthly', '1400');
  await p.dispatchEvent('#monthly', 'input');
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => !document.getElementById('cmpPill').hidden), 'pilleri ilmestyy kun eroa syntyy');
  const pt0 = await p.evaluate(() => document.getElementById('cmpPillTxt').textContent);
  ok(pt0.includes('Lähtötilanne'), 'automaattihaamu nimetty', pt0);
  ok(await p.evaluate(() => document.querySelectorAll('#stats .stat .d').length >= 2), 'delta-rivit korteissa');

  await p.selectOption('#acctSel', 'ost');
  await p.fill('#divYield', '4');
  await p.dispatchEvent('#divYield', 'input');
  await p.waitForTimeout(300);
  await p.click('#acctCompareLink');
  await p.waitForTimeout(800);
  const pt1 = await p.evaluate(() => document.getElementById('cmpPillTxt').textContent);
  ok(pt1.includes('Arvo-osuustili'), 'kuorivertailu nimeaa pillerin', pt1);
  ok(/eläkeiässä|lopussa/.test(pt1), 'pilleri kertoo euroeron', pt1);

  const r = await p.evaluate(() => { const c = document.getElementById('chartWrap').getBoundingClientRect(); return { x: c.left + c.width * 0.6, y: c.top + c.height * 0.5 }; });
  await p.mouse.move(r.x, r.y);
  await p.waitForTimeout(300);
  ok((await p.evaluate(() => document.getElementById('tooltip').textContent)).includes('Vertailu'), 'tooltipissa vertailurivi');

  // Paivita: nykyinen suunnitelma uudeksi vertailukohdaksi -> ero haviaa
  await p.click('#cmpPillU');
  await p.waitForTimeout(800);
  ok(await p.evaluate(() => baseline && baseline.cmpName === 'Arvo-osuustili'), 'paivitys sailyttaa nimen');
  ok(await p.evaluate(() => document.getElementById('cmpPill').hidden), 'paivityksen jalkeen ei eroa -> pilleri piiloon');

  // Uusi ero + lopetus
  await p.fill('#monthly', '1800');
  await p.dispatchEvent('#monthly', 'input');
  await p.waitForTimeout(600);
  ok(await p.evaluate(() => !document.getElementById('cmpPill').hidden), 'pilleri palaa erosta');
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('f');
  await p.waitForTimeout(400);
  ok(await p.evaluate(() => getComputedStyle(document.getElementById('cmpPill')).display === 'none'), 'pilleri piilossa piirtopoydalla');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  await p.click('#cmpPillX');
  await p.waitForTimeout(500);
  ok(await p.evaluate(() => baseline === null && document.getElementById('cmpPill').hidden), 'lopetus toimii');
  ok(await p.evaluate(() => !document.querySelector('#stats .stat .d')), 'deltat poistuvat');
  ok(await p.evaluate(() => !document.getElementById('compareBar')), 'vanha vertailupalkki poistettu');
  ok(errors.length === 0, 'ei virheita', errors.join('|'));

  await browser.close();
  console.log(failed ? `\n${failed} VERTAILU-SMOKE-TESTIA EPAONNISTUI` : '\nVertailu-smoke lapi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
