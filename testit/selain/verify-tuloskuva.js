'use strict';
/* Tuloskuvan verifiointi: kuva syntyy, oikea koko, valikkokohta ja ramppinappi
   toimivat, lataus laukeaa. Ajo: NODE_PATH=<playwright> node verify-tuloskuva.js */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.VP_BASE || 'http://localhost:8123';
let failed = 0;
const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();

  // 1) Työtila: valikon kautta + suora canvas-tarkistus
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('vp-autotour-off', '1');
    localStorage.setItem('vp-tour-done', '1');
    localStorage.setItem('vp-ramp-done', '1');
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const info = await page.evaluate(() => {
    const c = buildShareImage();
    return c ? { w: c.width, h: c.height, data: c.toDataURL('image/png') } : null;
  });
  ok(info && info.w === 1200 && info.h === 630, 'canvas 1200×630 syntyy oletussuunnitelmasta');
  if (info) {
    const png = Buffer.from(info.data.split(',')[1], 'base64');
    ok(png.length > 30000, 'PNG ei ole tyhjä (> 30 kB)', String(png.length));
    fs.writeFileSync(path.join(require('os').tmpdir(), 'tuloskuva-tyotila.png'), png);
  }

  // ☰-valikossa EI enää tuloskuvaa (siirretty suunnitelmarivin ⋯-valikkoon)
  await page.click('#moreBtn');
  ok(await page.locator('#mi-share-img').count() === 0, '☰-valikossa ei tuloskuvaa (siirretty)');
  await page.keyboard.press('Escape');

  // Suunnitelmani → rivin ⋯ → Jaa tuloskuvana
  await page.click('#summaryBtn');
  await page.waitForSelector('.ph-more', { timeout: 8000 });
  await page.click('.ph-more');
  const kohta = page.locator('.ph-menu button[data-act="jaa-kuva"]');
  ok(await kohta.count() === 1, 'rivin ⋯-valikossa Jaa tuloskuvana');
  const menuBox = await page.locator('.ph-menu').boundingBox();
  const vp = page.viewportSize();
  ok(menuBox && menuBox.y >= 0 && menuBox.y + menuBox.height <= vp.height, '⋯-valikko mahtuu ruutuun', JSON.stringify(menuBox));
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await kohta.click();
  const d = await dl;
  ok(!!d, '⋯-valikosta klikkaus lataa PNG:n');
  ok(d && d.suggestedFilename() === 'varallisuuspolku-tulos.png', 'tiedostonimi oikein');
  await page.click('#sumClose');

  // 2) Ramppi: tuore käyttäjä → tulosnäkymän jakonappi
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#rampGo', { timeout: 5000 });
  await page.fill('#rampAge', '34');
  await page.fill('#rampWealth', '15000');
  await page.fill('#rampMonthly', '600');
  await page.click('#rampGo');
  // Tuloskortti odottaa MC-ratkaisijaa: kuormitetulla koneella 8 s ei riitä
  // (sama oppi kuin verify-omistus-jatkot #rampOwn -odotuksessa) → 15 s + uusinta
  try { await page.waitForSelector('#rampShare', { timeout: 15000 }); } catch (e) { await page.click('#rampGo'); await page.waitForSelector('#rampShare', { timeout: 15000 }); }
  ok(true, 'rampin tulosnäkymässä jakonappi');
  const dl2 = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('#rampShare');
  const d2 = await dl2;
  ok(!!d2, 'ramppijako lataa PNG:n');
  ok(await page.locator('#rampCard').isVisible(), 'ramppi jää auki jaon jälkeen');
  const rinfo = await page.evaluate(() => {
    const c = buildShareImage();
    return c ? c.toDataURL('image/png') : null;
  });
  if (rinfo) fs.writeFileSync(path.join(require('os').tmpdir(), 'tuloskuva-ramppi.png'), Buffer.from(rinfo.split(',')[1], 'base64'));

  // 3) Ilman eläketapahtumaa: loppuvarallisuus-haara ei kaadu
  const noRet = await page.evaluate(() => {
    state.events = state.events.filter((e) => e.type !== 'retirement');
    renderAll();
    const c = buildShareImage();
    return c ? c.width : null;
  });
  ok(noRet === 1200, 'ilman eläketapahtumaa kuva syntyy (loppuvarallisuus-haara)');

  // 4) Mobiili 390px: nappi ei riko ramppia
  const mp = await ctx.newPage();
  await mp.setViewportSize({ width: 390, height: 844 });
  await mp.goto(BASE, { waitUntil: 'networkidle' });
  await mp.evaluate(() => localStorage.clear());
  await mp.goto(BASE, { waitUntil: 'networkidle' });
  await mp.waitForSelector('#rampGo', { timeout: 5000 });
  await mp.fill('#rampAge', '30');
  await mp.fill('#rampWealth', '5000');
  await mp.fill('#rampMonthly', '300');
  await mp.click('#rampGo');
  try { await mp.waitForSelector('#rampShare', { timeout: 8000 }); } catch (e) { await mp.click('#rampGo'); await mp.waitForSelector('#rampShare', { timeout: 8000 }); }
  const over = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, 'mobiili 390px: ei vaakavuotoa rampissa', String(over));
  await mp.screenshot({ path: path.join(require('os').tmpdir(), 'tuloskuva-ramppi-mobiili.png') });

  await browser.close();
  console.log(failed ? `${failed} PUNAISENA` : 'Tuloskuva-verifiointi läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
