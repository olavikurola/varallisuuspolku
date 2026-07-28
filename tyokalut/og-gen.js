// og.png: kuvaa mekaniikan — käyrä piirtopöydällä, chippi (+120 €/kk) ja
// HUD-deltat haamua vasten. 1200×630.
'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(() => enterFs()); // laskeutuminen on nyt kojelaudalla — fs avataan itse
  await page.waitForTimeout(400);
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    // Ensivierailu avasi piirtopöydän valmiiksi — lavasta haamu (450 €/kk)
    // ja nykytila (570 €/kk), jotta HUD näyttää vihreät deltat
    state.monthly = 850;
    renderAll();
    setBaseline();
    state.monthly = 1000;
    document.getElementById('monthly').value = 1000;
    renderAll();
    drawDismissHint();
  });
  await page.waitForFunction(() => sim && sim.mcPaths === 5000 && !sim.successStale, null, { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => {
    drawSelect('acc', null, true);
    // Chippi kuin kesken vedon: vanha → uusi, delta
    const m = Math.round(((sim.a0 + sim.retireAge) / 2 - sim.a0) * 12);
    const px = scaleX(sim.a0 + m / 12), py = scaleY(sim.exp[m]);
    chipShowAt(chipWrap(chipRow('Kuukausisäästö', 850, 1000, '€/kk')), px, py, false);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: require('path').join(__dirname, '..', 'og.png') });
  console.log('og.png kirjoitettu');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
