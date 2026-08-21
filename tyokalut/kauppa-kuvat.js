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

// Kielet: fi-listaukselle suomenkieliset, en-US-listaukselle englanninkieliset
// kuvat (Apple ja Play ottavat kuvat lokalisoinnittain).
const KIELET = [
  { koodi: 'fi', sivu: '/index.html', locale: 'fi-FI' },
  { koodi: 'en', sivu: '/index-en.html', locale: 'en-GB' },
];

/* Kuvasarja kertoo tarinan: näe → muokkaa → ymmärrä → säilytä → säädä.
   Kaikki TUMMASSA teemassa (Olavin linjaus 21.8.2026) — vaalea teema oli
   ennen kolmantena ja rikkoi sarjan ilmeen kaupan esikatselussa.
   Kaupassa 3 ensimmäistä näkyy hakutuloksissa, joten kärki on tärkein. */
const KUVAT = [
  { nimi: 'koti', tabi: null },          // 1 kojelauta: koko elinkaari yhdellä silmäyksellä
  { nimi: 'piirtopoyta', fs: true },     // 2 erottautuja: tartu käyrään ja vedä
  { nimi: 'tulkki', tabi: 3 },           // 3 tekoälyapuri ja huomiot
  { nimi: 'suunnitelma', tabi: 4 },      // 4 suunnitelmat ja tulostettava dokumentti
  { nimi: 'valikko', tabi: 5 },          // 5 asetukset: muistutukset, lukitus, kieli
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
  // Vanhat kuvat pois: nimeämismalli vaihtui (kieli mukaan) ja vaalea kuva
  // poistui sarjasta — muuten hakemistoon jäisi sekaisin kahta sukupolvea.
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();

  async function sivu(laite, kieli) {
    const ctx = await b.newContext({
      viewport: { width: laite.w, height: laite.h },
      deviceScaleFactor: laite.dsf,
      locale: kieli.locale,
    });
    await ctx.addInitScript((kk) => {
      localStorage.setItem('vp-tour-done', '1');
      localStorage.setItem('vp-autotour-off', '1');
      localStorage.setItem('vp-veto-vihje', '1');
      localStorage.setItem('vp-kieli', kk);          // appin kielivalinta kuvaan
      localStorage.setItem('vp-kieli-ehdotettu', '1'); // ei kielibanneria kuviin
      sessionStorage.setItem('vp-lukko-auki', '1'); // logoruutu ohi kuvia varten
      sessionStorage.setItem('vp-intro-ok', '1');   // piirtoanimaatio ohi — terävät kuvat
      // kauppakuviin suunnitelma näkyviin: Perustiedot ja tapahtumat auki
      localStorage.setItem('vp-kortit-auki-v1', JSON.stringify(['basics', 'events']));
      window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
    }, kieli.koodi);
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8135' + kieli.sivu, { waitUntil: 'networkidle' });
    // Lavastus: esimerkkipersoona "Perhe ja asunto (35 v)"
    await pg.evaluate(() => {
      applySaved(JSON.parse(JSON.stringify(EXAMPLES[1].data)));
      syncInputs(); // lomakekentät samaan tilaan graafin kanssa
      renderAll();
    });
    await pg.waitForFunction(() => typeof sim !== 'undefined' && sim && sim.successProb != null && !sim.successStale, null, { timeout: 10000 }).catch(() => {});
    await pg.waitForTimeout(600);
    return { ctx, pg };
  }

  for (const laite of LAITTEET) {
    for (const kieli of KIELET) {
      const { ctx, pg } = await sivu(laite, kieli);
      for (let i = 0; i < KUVAT.length; i++) {
        const kuva = KUVAT[i];
        if (kuva.fs) {
          await pg.evaluate(() => enterFs());
          await pg.waitForTimeout(1200);
        } else if (kuva.tabi) {
          await pg.click('.vp-tab:nth-child(' + kuva.tabi + ')');
          await pg.waitForTimeout(700);
        }
        const nimi = `${laite.nimi}-${kieli.koodi}-${i + 1}-${kuva.nimi}.png`;
        await pg.screenshot({ path: p.join(OUT, nimi) });
        if (kuva.fs) { await pg.evaluate(() => exitFs()); await pg.waitForTimeout(500); }
      }
      await ctx.close();
      console.log(`${laite.nimi} ${kieli.koodi}: ${KUVAT.length} kuvaa (${laite.w * laite.dsf}×${laite.h * laite.dsf})`);
    }
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
