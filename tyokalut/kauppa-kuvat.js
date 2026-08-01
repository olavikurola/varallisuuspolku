// Kauppojen kuvakaappaukset (App Store + Play) appinäkymästä Capacitor-stubilla:
// alapalkki näkyy, Plausible-erolla ei väliä (vain kuva). Koot ja sisällöt
// dokumentoitu appi/kauppa/kuvaukset.md:ssä. Kertaluonteinen generaattori —
// EI kuulu testipatteristoon. Ajo: node tyokalut/kauppa-kuvat.js
// (Playwright NODE_PATHin kautta kuten testit; käynnistää oman palvelimen).
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const p = require('path');

const ROOT = p.join(__dirname, '..');
const OUT = p.join(ROOT, 'appi', 'kauppa', 'kuvat');
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };

// viewport × deviceScaleFactor = kaupan vaatima pikselikoko
const LAITTEET = [
  { nimi: 'iphone69', w: 440, h: 956, dsf: 3 },   // 1320×2868 (6,9" pakollinen)
  { nimi: 'iphone67', w: 430, h: 932, dsf: 3 },   // 1290×2796 (6,7")
  { nimi: 'ipad13', w: 1032, h: 1376, dsf: 2 },   // 2064×2752 (iPad 13")
  { nimi: 'play', w: 360, h: 800, dsf: 3 },       // 1080×2400 (Play-puhelin)
];

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (f === '/') f = '/index.html';
  fs.readFile(p.join(ROOT, f), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[p.extname(f).slice(1)] || 'application/octet-stream' });
    res.end(d);
  });
});

server.listen(8135, async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();

  async function sivu(laite, vaalea) {
    const ctx = await b.newContext({
      viewport: { width: laite.w, height: laite.h },
      deviceScaleFactor: laite.dsf,
      locale: 'fi-FI',
    });
    await ctx.addInitScript((light) => {
      localStorage.setItem('vp-tour-done', '1');
      localStorage.setItem('vp-autotour-off', '1');
      localStorage.setItem('vp-veto-vihje', '1');
      if (light) localStorage.setItem('vp-theme', 'light');
      window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
    }, !!vaalea);
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8135/', { waitUntil: 'networkidle' });
    // Lavastus: esimerkkipersoona "Perhe ja asunto (35 v)"
    await pg.evaluate(() => {
      applySaved(JSON.parse(JSON.stringify(EXAMPLES[1].data)));
      renderAll();
    });
    await pg.waitForFunction(() => typeof sim !== 'undefined' && sim && sim.successProb != null && !sim.successStale, null, { timeout: 10000 }).catch(() => {});
    await pg.waitForTimeout(600);
    return { ctx, pg };
  }

  for (const laite of LAITTEET) {
    // 1) Kojelauta (tumma)
    let { ctx, pg } = await sivu(laite, false);
    await pg.screenshot({ path: p.join(OUT, laite.nimi + '-1-koti.png') });

    // 2) Piirtopöytä kokoruudussa
    await pg.evaluate(() => enterFs());
    await pg.waitForTimeout(1200);
    await pg.screenshot({ path: p.join(OUT, laite.nimi + '-2-piirtopoyta.png') });
    await pg.evaluate(() => exitFs());
    await pg.waitForTimeout(600);

    // 4) ☰-valikko: natiivirivit (muistutukset + lukitus) näkyvissä
    await pg.click('#moreBtn');
    await pg.waitForTimeout(400);
    await pg.screenshot({ path: p.join(OUT, laite.nimi + '-4-valikko.png') });
    await ctx.close();

    // 3) Kojelauta vaaleassa teemassa
    ({ ctx, pg } = await sivu(laite, true));
    await pg.screenshot({ path: p.join(OUT, laite.nimi + '-3-koti-vaalea.png') });
    await ctx.close();

    console.log(laite.nimi + ': 4 kuvaa (' + laite.w * laite.dsf + '×' + laite.h * laite.dsf + ')');
  }

  // Play feature graphic 1024×500
  const fctx = await b.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const fpg = await fctx.newPage();
  await fpg.goto('http://localhost:8135/appi/kauppa/feature.html', { waitUntil: 'networkidle' });
  await fpg.waitForTimeout(400);
  await fpg.screenshot({ path: p.join(OUT, 'play-feature.png') });
  await fctx.close();
  console.log('play-feature.png (1024×500)');

  await b.close();
  server.close();
  console.log('Valmis: ' + OUT);
})
