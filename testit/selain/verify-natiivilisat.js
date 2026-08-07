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
      // logoruutu näkyy vain kylmäkäynnistyksessä — testit simuloivat oletuksena
      // jo avattua istuntoa, paitsi kun logoruutua tai lukitusta testataan
      if (o.native && !o.lukitus && !o.tervetuloa) sessionStorage.setItem('vp-lukko-auki', '1');
      if (o.plan) {
        localStorage.setItem('varallisuuspolku-v1', JSON.stringify({ ageNow: 30, ageEnd: 90, startCapital: 10000, monthly: 500, allocStocks: 70, allocBonds: 20, events: [] }));
        localStorage.setItem('vp-donate-v1', JSON.stringify({ donatedHash: 'abc' }));
      }
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
  await pg.click('.vp-tab:nth-child(5)');
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
  await pg.click('.vp-tab:nth-child(5)');
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
  await pg.click('.vp-tab:nth-child(5)');
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
  // sivunvaihto appin sisällä (Polku ↔ Tilastot) ei saa lukita uudestaan:
  // istunnon avaus elää sessionStoragessa, joka säilyy saman välilehden latauksissa
  await pg.reload();
  await pg.waitForTimeout(800);
  ok(await pg.locator('#vpLukko').count() === 0, 'sivunvaihto ei lukitse uudestaan (istunnon avaus voimassa)');
  ok(await pg.evaluate(() => window.__bio.length) === 0, 'tunnistusta ei kysytty uudestaan sivunvaihdossa');
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
  await pg.click('.vp-tab:nth-child(5)');
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

  // 8) Kaupassa elävä appiversio lukee tulevan webin dataa kuukausia:
  //    tuntemattomat kentät eivät saa kaataa applySavedia eikä laskentaa
  ({ ctx, pg } = await page({ native: true }));
  const tuleva = await pg.evaluate(() => {
    const okApply = applySaved({
      ageNow: 34, ageEnd: 91, startCapital: 12000, monthly: 900,
      allocStocks: 80, allocBonds: 10,
      tulevaKentta: { syvempi: [1, 2, 3] }, toinenUusi: 'x',
      events: [{ type: 'retirement', age: 64, withdrawal: 2500, pension: 1700, pensionAge: 65, uusiTapahtumaKentta: true }],
    });
    renderAll();
    const s = serialize();
    return { okApply, ageNow: state.ageNow, ev: state.events.length, puhdas: !('tulevaKentta' in s), simOk: !!sim && sim.months > 0 };
  });
  ok(tuleva.puhdas, 'tuleva skeema: serialize ei kanna tuntemattomia kenttiä eteenpäin');
  ok(tuleva.okApply === true && tuleva.ageNow === 34 && tuleva.ev === 1, 'tuleva skeema: tunnetut kentät sisään, tuntemattomat eivät kaada');
  ok(tuleva.simOk, 'tuleva skeema: simulaatio laskee normaalisti');
  await ctx.close();

  // 9) Alapalkki ei peitä sivun häntää (havaittu laitteella: paneelin
  //    disclaimer jäi palkin alle — paneelia padataan palkin verran)
  ({ ctx, pg } = await page({ native: true, w: 390, h: 844 }));
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await pg.waitForTimeout(500);
  const pohja = await pg.evaluate(() => {
    const bar = document.querySelector('.vp-tabbar').getBoundingClientRect();
    const d = document.querySelector('.panel .disclaimer').getBoundingClientRect();
    return { dBottom: Math.round(d.bottom), barTop: Math.round(bar.top) };
  });
  ok(pohja.dBottom <= pohja.barTop, 'disclaimer palkin yläpuolella pohjaskrollissa (' + pohja.dBottom + ' ≤ ' + pohja.barTop + ')');
  await ctx.close();

  // 10) Appin tiivis etusivu (Olavin laitehavainnot): UKK-kortti ja Pro-rivi
  //     piilossa, tase kiinni oletuksena, Pro-kytkin valikossa, valikko sheetinä
  ({ ctx, pg } = await page({ native: true }));
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.card[data-card=about]')).display) === 'none', 'UKK-kortti piilossa appissa');
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.pro-switch')).display) === 'none', 'Pro-rivi piilossa appissa');
  ok(await pg.evaluate(() => document.getElementById('balancePanel').classList.contains('collapsed')), 'tase kiinni oletuksena appissa');
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.topbar-right')).display) === 'none', 'yläpalkin napit piilossa appissa (toiminnot alapalkissa)');
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.tk-handle')).display) === 'none', 'Kysy AI -kelluke piilossa appissa (oma tabi)');
  ok(await pg.evaluate(() => getComputedStyle(document.getElementById('tableBtn')).display) === 'none', 'Vuositaulukko-nappi piilossa appissa (valikossa)');
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.stats')).gridTemplateColumns.split(' ').length) === 2, 'tunnusluvut 2×2-ruudukkona appissa');
  await pg.click('.vp-tab:nth-child(5)');
  await pg.waitForTimeout(300);
  ok(await pg.locator('#mi-pro').count() === 1, 'Pro-kytkin valikossa appissa');
  ok(await pg.locator('#mi-taulukko').count() === 1, 'Vuositaulukko valikossa appissa');
  const sheetR = await pg.evaluate(() => {
    const r = document.querySelector('.menu').getBoundingClientRect();
    return {
      top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), ih: window.innerHeight,
      act: document.querySelectorAll('.vp-tab')[4].classList.contains('act'),
      lukko: document.body.classList.contains('vp-sivu-auki') && getComputedStyle(document.body).overflow === 'hidden',
      otsikko: (document.querySelector('.menu .vp-sivuotsikko') || {}).textContent,
    };
  });
  ok(sheetR.top === 0 && sheetR.bottom === sheetR.ih - 64 && sheetR.left === 0, 'Lisää avautuu kokosivuna (' + sheetR.top + '–' + sheetR.bottom + ')');
  ok(sheetR.act, 'Lisää-tabi valittuna kun sivu auki');
  ok(sheetR.lukko, 'avoin sivu lukitsee taustan skrollauksen');
  ok(sheetR.otsikko === 'Lisää', 'sivulla oma otsikko');
  await pg.click('#mi-taulukko');
  await pg.waitForTimeout(400);
  ok(await pg.evaluate(() => !document.getElementById('tableModal').hidden), 'Vuositaulukko avautuu valikosta');
  // modaali on appissa täysi sivu: opaakki tausta (webissä läpikuultava rgba)
  ok(await pg.evaluate(() => !getComputedStyle(document.getElementById('tableModal')).backgroundColor.includes('rgba')), 'modaali täytenä sivuna appissa (opaakki tausta)');
  await ctx.close();

  // 10b) Alapalkin viisi tabia: Kysy AI ja Suunnitelma toimivat etusivulla
  ({ ctx, pg } = await page({ native: true }));
  ok(await pg.locator('.vp-tab').count() === 5, 'alapalkissa viisi tabia');
  await pg.click('.vp-tab:nth-child(4)'); // Suunnitelma
  await pg.waitForTimeout(600);
  ok(await pg.evaluate(() => !document.getElementById('summary').hidden), 'Suunnitelma-tabi avaa Suunnitelmani');
  // täysi sivu: modaali päättyy alapalkin yläreunaan ja tabi näkyy valittuna
  const sumR = await pg.evaluate(() => ({
    b: Math.round(document.getElementById('summary').getBoundingClientRect().bottom),
    ih: window.innerHeight,
    act: document.querySelectorAll('.vp-tab')[3].classList.contains('act'),
  }));
  ok(sumR.b === sumR.ih - 64, 'Suunnitelmani päättyy alapalkin yläreunaan (' + sumR.b + ')');
  ok(sumR.act, 'Suunnitelma-tabi valittuna kun sivu auki');
  // aito sivu: ei Sulje-nappia — tabit hoitavat poistumisen
  ok(await pg.evaluate(() => getComputedStyle(document.getElementById('sumClose')).display) === 'none', 'Suunnitelmani ilman Sulje-nappia appissa');
  await pg.click('.vp-tab:nth-child(1)'); // Polku sulkee sivun
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => document.getElementById('summary').hidden), 'Polku-tabi sulkee Suunnitelman');
  ok(await pg.evaluate(() => document.querySelectorAll('.vp-tab')[0].classList.contains('act')), 'Polku-tabi palaa valituksi suljettaessa');
  await pg.click('.vp-tab:nth-child(3)'); // Kysy AI
  await pg.waitForTimeout(600);
  ok(await pg.evaluate(() => !document.querySelector('.tk-sheet').hidden), 'Kysy AI -tabi avaa Tulkin');
  const tkR = await pg.evaluate(() => {
    const r = document.querySelector('.tk-sheet').getBoundingClientRect();
    return { t: Math.round(r.top), b: Math.round(r.bottom), ih: window.innerHeight, act: document.querySelectorAll('.vp-tab')[2].classList.contains('act'), x: getComputedStyle(document.querySelector('.tk-x')).display };
  });
  ok(tkR.t === 0 && tkR.b === tkR.ih - 64, 'Tulkki täytenä sivuna alapalkin yllä (' + tkR.t + '–' + tkR.b + ')');
  ok(tkR.act, 'Kysy AI -tabi valittuna kun Tulkki auki');
  ok(tkR.x === 'none', 'Tulkki ilman ✕-nappia appissa');
  ok(await pg.evaluate(() => document.body.classList.contains('vp-sivu-auki')), 'Tulkki lukitsee taustan skrollauksen');
  // Suunnitelma-tabi sulkee Tulkin ja avaa oman sivunsa (keskinäinen poissulku)
  await pg.click('.vp-tab:nth-child(4)');
  await pg.waitForTimeout(400);
  ok(await pg.evaluate(() => document.querySelector('.tk-sheet').hidden && !document.getElementById('summary').hidden), 'Suunnitelma-tabi sulkee Tulkin ja avaa sivunsa');
  await ctx.close();

  // 10c) Logoruutu myös ilman lukitusta: Avaa vie sisään ilman tunnistusta
  ({ ctx, pg } = await page({ native: true, tervetuloa: true, wait: 800 }));
  ok(await pg.locator('#vpLukko').count() === 1, 'logoruutu näkyy kylmäkäynnistyksessä ilman lukitusta');
  ok(await pg.evaluate(() => window.__bio.length) === 0, 'tunnistusta ei käynnistetä kun lukitus on pois');
  await pg.click('#vpAvaaLukko');
  await pg.waitForTimeout(500);
  ok(await pg.locator('#vpLukko').count() === 0, 'Avaa vie suoraan sisään');
  ok(await pg.evaluate(() => window.__bio.length) === 0, 'Avaa ei kysynyt tunnistusta');
  await pg.reload();
  await pg.waitForTimeout(600);
  ok(await pg.locator('#vpLukko').count() === 0, 'logoruutu ei palaa sivunvaihdossa (istuntolippu)');
  await ctx.close();

  // 10d) Suunnitelmat-sivun yhtenäinen ilme: otsikko logolla ylhäällä,
  //      toimintonapit sisällön lopussa
  ({ ctx, pg } = await page({ native: true }));
  await pg.click('.vp-tab:nth-child(4)');
  await pg.waitForTimeout(600);
  const sumTyyli = await pg.evaluate(() => ({
    suunta: getComputedStyle(document.getElementById('summary')).flexDirection,
    jarjestys: getComputedStyle(document.querySelector('#summary .sum-bar')).order,
    logo: getComputedStyle(document.querySelector('.ph-head h2'), '::before').width,
  }));
  ok(sumTyyli.suunta === 'column' && sumTyyli.jarjestys === '9', 'Suunnitelmat: toimintonapit sisällön lopussa (' + sumTyyli.jarjestys + ')');
  ok(sumTyyli.logo === '42px', 'Suunnitelmat-otsikossa logo yläpalkin koossa (42 px)');
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.tk-dot') || document.body).backgroundImage) === 'none', 'Tulkin oma ✦-symboli ennallaan');
  await ctx.close();

  // 10e) Agentit-sivu: alapalkki mukana (ei umpikujaa) ja tabit toimivat
  ({ ctx, pg } = await page({ native: true, url: '/agentit.html' }));
  ok(await pg.locator('.vp-tab').count() === 5, 'Agentit-sivulla alapalkki');
  await pg.click('.vp-tab:nth-child(4)'); // Suunnitelma → etusivulle lipulla
  await pg.waitForTimeout(1500);
  ok(/index\.html|\/$/.test(pg.url().split('?')[0]), 'Suunnitelma-tabi vie etusivulle Agenteista');
  ok(await pg.evaluate(() => !document.getElementById('summary').hidden), 'Suunnitelmat avautui perillä');
  await ctx.close();

  // 10f) Tilastot-sivun avaustiilet 2 sarakkeessa kapealla näytöllä
  ({ ctx, pg } = await page({ native: true, url: '/analytiikka.html', plan: true, w: 390, h: 844 }));
  ok(await pg.evaluate(() => getComputedStyle(document.getElementById('anTiles')).gridTemplateColumns.split(' ').length) === 2, 'tilastotiilet 2 sarakkeessa mobiilissa');
  await ctx.close();

  // 11) Tilastot-sivun Lisää avaa sheetin paikan päällä — ei hyppyä etusivulle
  //     (suunnitelma + jako kylvetty: ilman niitä sivun portti peittäisi palkin)
  ({ ctx, pg } = await page({ native: true, url: '/analytiikka.html', plan: true }));
  await pg.click('.vp-tab:nth-child(5)');
  await pg.waitForTimeout(400);
  ok(/analytiikka\.html/.test(pg.url()), 'Lisää ei vaihda sivua Tilastoissa');
  ok(await pg.locator('.menu #mi-theme').count() === 1 && await pg.locator('.menu #mi-muistutukset').count() === 1, 'sheetissä teema ja natiivirivit');
  // yhtenäinen valikko: sama sisältö joka sivulla (Toiminnot → Nollaa)
  ok(await pg.locator('.menu #mi-compare').count() === 1 && await pg.locator('.menu #mi-taulukko').count() === 1 && await pg.locator('.menu #mi-reset').count() === 1, 'Tilastot-sheetissä sama sisältö kuin etusivulla');
  await pg.click('.menu #mi-muistutukset');
  await pg.waitForTimeout(400);
  ok(await pg.evaluate(() => localStorage.getItem('vp-muistutukset')) === '1', 'muistutukset kytkeytyvät Tilastot-sivulta');
  ok(await pg.locator('.toast.show').count() === 1, 'varatoast antaa palautteen Tilastot-sivulla');
  await ctx.close();

  // 12) Web ilman Capacitoria: ei mitään natiivilisiä
  ({ ctx, pg } = await page({ native: false }));
  ok(await pg.evaluate(() => !window.vpNativeMenu), 'webissä ei valikkokoukkua');
  ok(await pg.locator('#vpLukko').count() === 0, 'webissä ei lukituspeitettä');
  await pg.click('#moreBtn');
  await pg.waitForTimeout(300);
  ok(await pg.locator('#mi-muistutukset').count() === 0, 'webissä ei Muistutukset-riviä');
  ok(await pg.locator('#mi-pro').count() === 0, 'webissä ei Pro-valikkoriviä (rivi paneelissa)');
  ok(await pg.locator('#mi-theme').count() === 1, 'webin valikko ennallaan');
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.card[data-card=about]')).display) !== 'none', 'UKK-kortti näkyy webissä');
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.pro-switch')).display) !== 'none', 'Pro-rivi näkyy webissä');
  ok(await pg.evaluate(() => !document.getElementById('balancePanel').classList.contains('collapsed')), 'tase auki oletuksena webissä');
  ok(await pg.evaluate(() => getComputedStyle(document.querySelector('.topbar-right')).display) !== 'none', 'yläpalkin napit näkyvät webissä');
  ok(await pg.evaluate(() => getComputedStyle(document.getElementById('tableBtn')).display) !== 'none', 'Vuositaulukko-nappi näkyy webissä');
  ok(await pg.locator('#mi-taulukko').count() === 0, 'webin valikossa ei Vuositaulukko-riviä');
  await ctx.close();

  await b.close();
  server.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
});
