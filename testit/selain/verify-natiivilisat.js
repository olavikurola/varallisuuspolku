/* Natiivilisät (muistutukset, lukitus, widget-silta): Capacitor-stubilla
   natiivipolut, ilman stubia web-noop. Playwright NODE_PATHin kautta. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const p = require('path');

const ROOT = p.join(__dirname, '..', '..');
const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2', txt: 'text/plain' };

const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (f === '/') f = '/index.html';
  fs.readFile(p.join(ROOT, f), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[p.extname(f).slice(1)] || 'application/octet-stream' });
    res.end(d);
  });
});

server.listen(8134, async () => {
  const b = await chromium.launch();
  let fail = 0;
  const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fail++; };

  async function page(opts = {}) {
    const ctx = await b.newContext({ viewport: { width: opts.w || 1440, height: opts.h || 900 }, locale: 'fi-FI' });
    await ctx.addInitScript((o) => {
      localStorage.setItem('vp-tour-done', '1');
      localStorage.setItem('vp-autotour-off', '1');
      localStorage.setItem('vp-veto-vihje', '1');
      if (o.lukitus) localStorage.setItem('vp-lukitus', '1');
      if (!o.native) return;
      window.__lnSchedule = [];
      window.__lnCancel = [];
      window.__prefs = {};
      window.__bio = [];
      window.__bioFail = !!o.bioFail;
      window.Capacitor = {
        isNativePlatform: () => true,
        Plugins: {
          LocalNotifications: {
            checkPermissions: () => Promise.resolve({ display: 'granted' }),
            requestPermissions: () => Promise.resolve({ display: window.__lupaEvatty ? 'denied' : 'granted' }),
            getPending: () => Promise.resolve({ notifications: window.__lnSchedule.flatMap((s) => s.notifications.map((n) => ({ id: n.id }))) }),
            cancel: (x) => { window.__lnCancel.push(x); return Promise.resolve(); },
            schedule: (x) => { window.__lnSchedule.push(JSON.parse(JSON.stringify(x))); return Promise.resolve(); },
          },
          Preferences: {
            set: (x) => { window.__prefs[x.key] = x.value; return Promise.resolve(); },
          },
          NativeBiometric: {
            isAvailable: () => Promise.resolve({ isAvailable: true }),
            verifyIdentity: (x) => { window.__bio.push(x); return window.__bioFail ? Promise.reject(new Error('peruttu')) : Promise.resolve(); },
          },
        },
      };
    }, opts);
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8134' + (opts.url || '/'));
    await pg.waitForTimeout(opts.wait != null ? opts.wait : 1800);
    return { ctx, pg };
  }

  // 1) Natiivi: valikkorivit ja muistutusten kytkentä päälle/pois
  let { ctx, pg } = await page({ native: true });
  await pg.click('#moreBtn');
  await pg.waitForTimeout(300);
  ok(await pg.locator('#mi-muistutukset').count() === 1, 'valikossa Muistutukset-rivi (natiivi)');
  ok(await pg.locator('#mi-lukitus').count() === 1, 'valikossa Lukitus-rivi (natiivi)');
  await pg.click('#mi-muistutukset');
  await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => localStorage.getItem('vp-muistutukset')) === '1', 'muistutukset päälle: avain talteen');
  let ajastukset = await pg.evaluate(() => window.__lnSchedule);
  let viimeisin = ajastukset[ajastukset.length - 1];
  ok(!!viimeisin && viimeisin.notifications.some((n) => n.id === 1 && n.schedule && n.schedule.on && n.schedule.on.day === 1), 'kuukausikatsaus ajastettu (id 1, kuun 1. päivä)');
  const tapahtumat = viimeisin ? viimeisin.notifications.filter((n) => n.id >= 100) : [];
  ok(tapahtumat.length >= 1, 'suunnitelman tapahtumia ajastettu (' + tapahtumat.length + ' kpl)');
  ok(tapahtumat.every((n) => n.schedule && n.schedule.at && new Date(n.schedule.at) > new Date()), 'tapahtumamuistutukset tulevaisuudessa');
  ok(tapahtumat.every((n) => n.title && n.title.length > 0), 'tapahtumilla otsikko (evLabel)');
  // uusi avaus näyttää tilan ja pois-kytkentä peruu ajastukset
  await pg.click('#moreBtn');
  await pg.waitForTimeout(300);
  ok(await pg.textContent('#mi-muistutukset').then((t) => t.includes('päällä ✓')), 'valikkorivi näyttää tilan');
  await pg.click('#mi-muistutukset');
  await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => localStorage.getItem('vp-muistutukset')) === null, 'muistutukset pois: avain poistettu');
  ok(await pg.evaluate(() => window.__lnCancel.length) >= 1, 'odottavat ilmoitukset peruttiin');

  // 2) Widget-silta: tiivistelmä Preferencesiin
  await pg.evaluate(() => window.vpNatiivi.widgetPaivita());
  await pg.waitForTimeout(300);
  const widget = await pg.evaluate(() => window.__prefs['vp-widget']);
  ok(!!widget, 'widget-tiivistelmä kirjoitettu');
  if (widget) {
    const w = JSON.parse(widget);
    ok(!!w.otsikko && !!w.arvo && !!w.paivitetty, 'widget-kentät: ' + w.otsikko + ' / ' + w.arvo + ' / ' + w.alarivi);
    ok(/%|€/.test(w.arvo), 'widget-arvo muotoiltu (' + w.arvo + ')');
  }
  await ctx.close();

  // 3) Ilmoituslupa evätty → ei kytkeydy päälle
  ({ ctx, pg } = await page({ native: true }));
  await pg.evaluate(() => { window.__lupaEvatty = true; });
  await pg.click('#moreBtn');
  await pg.waitForTimeout(300);
  await pg.click('#mi-muistutukset');
  await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => localStorage.getItem('vp-muistutukset')) === null, 'lupa evätty: muistutukset eivät kytkeydy');
  await ctx.close();

  // 4) Lukitus: käynnistyslukitus avautuu automaattisella tunnistuksella
  //    (peitteen piirtyminen todetaan kohdassa 5, jossa tunnistus ei läpäise —
  //    onnistuva tunnistus ehtii avata peitteen ennen kuin testi ehtii katsoa)
  ({ ctx, pg } = await page({ native: true, lukitus: true, wait: 1200 }));
  ok(await pg.locator('#vpLukko').count() === 0, 'käynnistyslukitus avautui tunnistuksella');
  ok(await pg.evaluate(() => window.__bio.length) >= 1, 'verifyIdentity kutsuttiin');
  await ctx.close();

  // 5) Lukitus: peruttu tunnistus jättää peitteen, Avaa yrittää uudestaan
  ({ ctx, pg } = await page({ native: true, lukitus: true, bioFail: true, wait: 1200 }));
  ok(await pg.locator('#vpLukko').count() === 1, 'lukituspeite piirtyy ja jää kun tunnistus perutaan');
  await pg.evaluate(() => { window.__bioFail = false; });
  await pg.click('#vpAvaaLukko');
  await pg.waitForTimeout(500);
  ok(await pg.locator('#vpLukko').count() === 0, 'Avaa-nappi avaa uudella yrityksellä');
  await ctx.close();

  // 6) Lukituksen käyttöönotto valikosta vaatii onnistuneen tunnistuksen
  ({ ctx, pg } = await page({ native: true }));
  await pg.click('#moreBtn');
  await pg.waitForTimeout(300);
  await pg.click('#mi-lukitus');
  await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => localStorage.getItem('vp-lukitus')) === '1', 'lukitus päälle tunnistuksen jälkeen');
  ok(await pg.evaluate(() => window.__bio.length) >= 1, 'käyttöönotto vahvistettiin tunnistuksella');
  await ctx.close();

  // 7) Lukitus toimii myös Tilastot-sivulla
  ({ ctx, pg } = await page({ native: true, lukitus: true, bioFail: true, url: '/analytiikka.html', wait: 1200 }));
  ok(await pg.locator('#vpLukko').count() === 1, 'lukituspeite myös analytiikkasivulla');
  await pg.evaluate(() => { window.__bioFail = false; });
  await pg.click('#vpAvaaLukko');
  await pg.waitForTimeout(500);
  ok(await pg.locator('#vpLukko').count() === 0, 'avaus toimii analytiikkasivulla');
  await ctx.close();

  // 8) Web ilman Capacitoria: ei mitään natiivilisiä
  ({ ctx, pg } = await page({ native: false }));
  ok(await pg.evaluate(() => !window.vpNativeMenu), 'webissä ei valikkokoukkua');
  ok(await pg.locator('#vpLukko').count() === 0, 'webissä ei lukituspeitettä');
  await pg.click('#moreBtn');
  await pg.waitForTimeout(300);
  ok(await pg.locator('#mi-muistutukset').count() === 0, 'webissä ei Muistutukset-riviä');
  ok(await pg.locator('#mi-theme').count() === 1, 'webin valikko ennallaan');
  await ctx.close();

  await b.close();
  server.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
});
