'use strict';
/* Kieliversio (KIELIVERSIO.md): ?lang=en avaa englannin, oletus pysyy suomena.
   Vartioi: VP_KIELI-resoluutio, sanaston lataus, html lang, chippien ja
   korttien kieli molempiin suuntiin, paluu ?lang=fi:llä. Oma palvelin 8143. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 8143;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

let failed = 0;
const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT);

(async () => {
  const b = await chromium.launch();

  // EN: ?lang=en
  const ctx1 = await b.newContext();
  const p1 = await ctx1.newPage();
  const errs = [];
  p1.on('pageerror', (e) => errs.push(e.message));
  await p1.goto(`http://localhost:${PORT}/?lang=en`);
  await p1.waitForTimeout(2500);
  ok(p1.url().includes('index-en.html'), '?lang=en ohjaa en-sivulle', p1.url());
  const kieli = await p1.evaluate(() => ({ vk: VP_KIELI, lang: document.documentElement.lang, sanasto: Object.keys(VP_SANASTO).length }));
  ok(kieli.vk === 'en', 'VP_KIELI=en', JSON.stringify(kieli));
  ok(kieli.sanasto > 450, `sanasto ladattu (${kieli.sanasto})`);
  ok(kieli.lang === 'en', 'html lang=en');
  const chip = await p1.locator('#palette .chip[data-type="study"] span').last().textContent().catch(() => null);
  ok(chip === 'Studies', 'paletin chippi englanniksi', JSON.stringify(chip));
  const statsTxt = await p1.locator('#stats').textContent();
  ok(/Invested|Success|Will it last/i.test(statsTxt), 'kortit englanniksi', statsTxt.slice(0, 120));
  ok(errs.length === 0, 'ei sivuvirheitä (en)', errs.join('; '));

  // FI: puhdas konteksti ilman parametria — sanasto ei saa latautua
  const ctx2 = await b.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto(`http://localhost:${PORT}/`);
  await p2.waitForTimeout(2000);
  const kieli2 = await p2.evaluate(() => ({ vk: VP_KIELI, sanasto: Object.keys(VP_SANASTO).length }));
  ok(kieli2.vk === 'fi' && kieli2.sanasto === 0, 'fi-oletus ja tyhjä sanasto', JSON.stringify(kieli2));
  const chip2 = await p2.locator('#palette .chip[data-type="study"] span').last().textContent();
  ok(chip2 === 'Opiskelu', 'paletin chippi suomeksi', JSON.stringify(chip2));
  ok(await p2.locator('#vpKieliEhdotus').count() === 0, 'ei banneria fi-selaimelle');

  // Banneri en-selaimelle: eksplisiittinen locale (oletus perii koneen kielen)
  const ctx3 = await b.newContext({ locale: 'en-US' });
  const p3 = await ctx3.newPage();
  await p3.goto(`http://localhost:${PORT}/`);
  await p3.waitForTimeout(2000);
  ok(await p3.locator('#vpKieliEhdotus').count() === 1, 'kielibanneri en-selaimelle fi-etusivulla');
  await p3.reload();
  await p3.waitForTimeout(1500);
  ok(await p3.locator('#vpKieliEhdotus').count() === 0, 'banneri vain kerran (vp-kieli-ehdotettu)');

  // Paluu: ?lang=fi nollaa en-valinnan pysyvästi
  await p1.goto(`http://localhost:${PORT}/?lang=fi`);
  await p1.waitForTimeout(1500);
  ok((await p1.evaluate(() => VP_KIELI)) === 'fi', '?lang=fi palauttaa suomen');

  /* Elämäntapahtumien lomakkeet englanniksi (Olavin havainto: /kk- ja v-yksiköt
     jäivät suomeksi popoverissa). Käydään JOKAINEN tyyppi läpi ja etsitään
     suomea sekä <em>-yksiköistä että näkyvistä teksteistä. */
  const ctxL = await b.newContext({ locale: 'en-US', viewport: { width: 1440, height: 950 } });
  const pl = await ctxL.newPage();
  await pl.goto(`http://localhost:${PORT}/index-en.html`);
  await pl.evaluate(() => {
    localStorage.setItem('vp-tour-done', '1');
    localStorage.setItem('vp-autotour-off', '1');
    localStorage.setItem('vp-kieli', 'en');
  });
  await pl.reload();
  await pl.waitForTimeout(2200);
  const tyypit = await pl.evaluate(() => Object.keys(EVENT_TYPES).filter((k) => !EVENT_TYPES[k].familyOnly));
  ok(tyypit.length >= 15, `tapahtumatyyppejä löytyi (${tyypit.length})`);
  const suomiLoydot = [];
  for (const tyyppi of tyypit) {
    const avattu = await pl.evaluate((tp) => {
      const ika = tp === 'retirement' ? 65 : Math.min(state.ageNow + 5, state.ageEnd - 1);
      let ev = state.events.find((e) => e.type === tp);
      if (!ev) { addEvent(tp, ika); ev = state.events.find((e) => e.type === tp); }
      if (!ev) return false;
      openPopover(ev.id);
      return true;
    }, tyyppi);
    if (!avattu) { suomiLoydot.push(tyyppi + ': popoveria ei voitu avata'); continue; }
    await pl.waitForTimeout(320);
    const loydot = await pl.evaluate(() => {
      const pop = document.querySelector('.popover, #popover, .pv-wrap');
      if (!pop) return ['popover puuttuu'];
      const out = [];
      pop.querySelectorAll('em').forEach((em) => {
        const s = (em.textContent || '').trim();
        if (/^(?:v|kk|€\/kk|%\/v|€\/v)$/.test(s)) out.push('yksikkö: ' + s);
      });
      const w = document.createTreeWalker(pop, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const teksti = (n.textContent || '').trim();
        if (teksti.length > 2 && /[äöåÄÖÅ]/.test(teksti)) out.push('teksti: ' + teksti.slice(0, 60));
      }
      return [...new Set(out)];
    });
    loydot.forEach((l) => suomiLoydot.push(tyyppi + ' » ' + l));
    await pl.evaluate(() => { try { closePopover(); } catch (e) {} });
  }
  ok(suomiLoydot.length === 0, 'kaikkien tapahtumatyyppien lomakkeet englanniksi',
    suomiLoydot.slice(0, 6).join(' | '));

  /* Appitabit en-sivuilla (Olavin 1.1-beta-havainto): alapalkin onStats/onIndex
     tunnistivat vain fi-tiedostonimet → en-tilastosivulla tabit jumittivat.
     Natiivitila stubataan kuten verify-natiivilisat; lukkopeite pois tieltä. */
  const ctxN = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  await ctxN.addInitScript(() => {
    window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
    try {
      localStorage.setItem('vp-tour-done', '1');
      localStorage.setItem('vp-autotour-off', '1');
      localStorage.setItem('vp-kieli', 'en');
    } catch (e) {}
  });
  const pn = await ctxN.newPage();
  const poistaLukko = () => pn.evaluate(() => { const el = document.getElementById('vpLukko'); if (el) el.remove(); });
  await pn.goto(`http://localhost:${PORT}/analytiikka-en.html`);
  await pn.waitForTimeout(2000);
  const akt = await pn.evaluate(() => {
    const t2 = [...document.querySelectorAll('.vp-tab')].find((x) => x.classList.contains('act'));
    return t2 ? (t2.textContent || '').trim() : '';
  });
  ok(/stat/i.test(akt), 'en-tilastosivu: Stats-tabi aktiivinen (onStats tunnistaa -en)', JSON.stringify(akt));
  await poistaLukko();
  await pn.click('.vp-tab:nth-child(1)');
  await pn.waitForTimeout(1800);
  ok(/index-en\.html$/.test(pn.url()), 'en: Path-tabi vie en-etusivulle', pn.url());
  await poistaLukko();
  await pn.click('.vp-tab:nth-child(2)');
  await pn.waitForTimeout(1800);
  ok(/analytiikka-en\.html$/.test(pn.url()), 'en: Stats-tabi vie en-tilastosivulle', pn.url());

  await b.close();
  server.close();
  if (failed) { console.error(`\n${failed} TARKISTUSTA EPÄONNISTUI`); process.exit(1); }
  console.log('\nKaikki läpi');
})();
