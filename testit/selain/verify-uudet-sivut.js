'use strict';
/* Verifiointi: validointi.html, saavutettavuus.html, linkitys ja reduced-motion.
   Käyttää aiemman istunnon playwright-asennusta. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');

const norm = (s) => s.replace(/[  ]/g, ' ');
let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };

(async () => {
  const server = spawn('node', ['testit/selain/serve.js'], { cwd: require('path').join(__dirname, '..', '..') });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  console.log('validointi.html');
  await page.goto('http://localhost:8123/validointi.html');
  ok((await page.title()).includes('Laskennan validointi'), 'otsikko');
  const body = norm(await page.textContent('body'));
  ok(body.includes('98 357,57'), 'kertasijoituksen luku näkyy');
  ok(body.includes('15 180,78'), 'myyntivoittoveron luku näkyy');
  ok(body.includes('936,17'), 'annuiteettierä näkyy');
  ok(body.includes('verovuoden 2026'), 'verovuosi mainittu');
  ok(await page.locator('.an-card').count() >= 5, 'kortit renderöityvät');
  ok((await page.locator('.sum-table').count()) >= 4, 'taulukot renderöityvät');
  await page.screenshot({ path: 'validointi.png', fullPage: true });

  console.log('saavutettavuus.html');
  await page.goto('http://localhost:8123/saavutettavuus.html');
  ok((await page.title()).includes('Saavutettavuus'), 'otsikko');
  const body2 = norm(await page.textContent('body'));
  ok(body2.includes('prefers-reduced-motion'), 'reduced-motion mainittu');
  ok(body2.includes('Tunnetut puutteet'), 'puutteet-osio');
  await page.screenshot({ path: 'saavutettavuus.png', fullPage: true });

  console.log('linkitys index.html:stä');
  await page.goto('http://localhost:8123/');
  await page.evaluate(() => localStorage.setItem('vp-autotour-off', '1'));
  await page.goto('http://localhost:8123/');
  ok(await page.locator('a[href="validointi.html"]').count() >= 2, 'validointi-linkit paikallaan');
  ok(await page.locator('a[href="saavutettavuus.html"]').count() >= 1, 'saavutettavuus-linkki paikallaan');

  console.log('reduced-motion: sovellus toimii emuloituna');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://localhost:8123/');
  await page.waitForFunction(() => typeof state !== 'undefined' && document.querySelectorAll('#chart path').length > 0);
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.btn')).transitionDuration);
  ok(parseFloat(dur) <= 0.001, 'siirtymät nollattu (' + dur + ')');
  const anim = await page.evaluate(() => {
    const el = document.createElement('div'); el.className = 'guide-bob-y'; document.body.appendChild(el);
    const d = getComputedStyle(el).animationDuration; el.remove(); return d;
  });
  ok(parseFloat(anim) <= 0.001, 'animaatiot nollattu (' + anim + ')');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));
  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nKaikki tarkistukset läpi.');
  process.exit(failed ? 1 : 0);
})();
