// Syötteen turvallisuus ja käynnistyksen kestävyys (koko projektin auditointi 11/2026):
// (1) jakolinkin Pro-data ei pääse HTML:ksi (pin()-attribuutti, jakaumalegenda)
//     eikä viallinen omaisuusluokkarivi (null) kaada käynnistystä;
// (2) #yhteenveto-syvälinkki ei kaada käynnistystä (vpNativeApp oli TDZ:ssä);
// (3) sovelluksensisäisen selaimen "Kopioi linkki" kopioi jakolinkin
//     (kutsui olematonta buildShareLink-funktiota);
// (4) vastaanottokortti näyttää kestävän tulon tavoitteessa ratkaistun tulon,
//     ei paikkamerkkiä 2400.
'use strict';
const { chromium } = require('playwright');
require('./eristys').asenna(chromium); // ei pyyntöjä tuotantoon (Plausible, Railway)
const http = require('http');
const fs = require('fs');
const p = require('path');
const { norm } = require('./normi');

const ROOT = p.join(__dirname, '..', '..');
let failed = 0;
const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2', json: 'application/json' };
const statik = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (f === '/') f = '/index.html';
  fs.readFile(p.join(ROOT, f), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[p.extname(f).slice(1)] || 'application/octet-stream' });
    res.end(d);
  });
});
const linkki = (plan) => '#s=' + Buffer.from(JSON.stringify(plan), 'utf8').toString('base64');

// Ulkoiset pyynnöt estää eristys.js (asennettu yllä)
const eristetty = async (b, opts = {}) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return { ctx, page, errors };
};

statik.listen(0, '127.0.0.1', async () => {
  const BASE = 'http://127.0.0.1:' + statik.address().port + '/';
  const b = await chromium.launch();
  try {
    console.log('1) Jakolinkin Pro-data: ei HTML-injektiota, viallinen rivi ei kaada');
    {
      const { ctx, page, errors } = await eristetty(b);
      const plan = { ageNow: 40, ageEnd: 90, startCapital: 50000, monthly: 500, allocStocks: 60, allocBonds: 20, glide: false, real: true, tax: true,
        proOn: true,
        pro: { assets: [
          { name: '<img src=y onerror=f()>', mu: '1"><img src=x onerror="window.__xss=1">', sigma: 1, weight: 10 },
          null,
        ] },
        events: [{ id: 1, type: 'retirement', age: 67, withdrawal: 1500, pension: 1200, pensionAge: 67 }] };
      await page.goto(BASE + linkki(plan), { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => ({
        xss: window.__xss === 1,
        imgX: !!document.querySelector('img[src="x"]'),
        imgY: !!document.querySelector('img[src="y"]'),
        pro: !!(state.proOn && state.pro),
        mkt: document.getElementById('proMkt') ? document.getElementById('proMkt').querySelectorAll('.pgrid').length : -1,
        bound: typeof bindActions === 'function' && !!document.getElementById('summaryBtn'),
      }));
      ok(!r.xss && !r.imgX, 'pin()-attribuutti ei avaa HTML:ää (mu-kenttä)', JSON.stringify(r));
      ok(!r.imgY, 'omaisuusluokan nimi ei avaa HTML:ää jakaumalegendassa', JSON.stringify(r));
      ok(r.pro && r.mkt >= 5, 'Pro-kortti renderöityi (3 perusluokkaa + otsake + 2 omaa riviä)', JSON.stringify(r));
      ok(errors.length === 0, 'ei sivuvirheitä (null-rivi ei kaada proOf:ia)', errors.join(' | '));
      await ctx.close();
    }

    console.log('2) #yhteenveto-syvälinkki');
    {
      const { ctx, page, errors } = await eristetty(b);
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); });
      // about:blank välissä: pelkkä hash-vaihto samalla sivulla ei lataisi sivua uudelleen
      await page.goto('about:blank');
      await page.goto(BASE + '#yhteenveto', { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const r = await page.evaluate(() => ({ open: !document.getElementById('summary').hidden, native: typeof vpNativeApp }));
      ok(r.open, 'yhteenveto aukeaa syvälinkistä', JSON.stringify(r));
      ok(r.native === 'boolean', 'vpNativeApp alustettu ennen käynnistyskoodia', r.native);
      ok(errors.length === 0, 'ei sivuvirheitä', errors.join(' | '));
      await page.evaluate(() => closeSummary());
      await page.click('#summaryBtn');
      await page.waitForTimeout(300);
      ok(await page.evaluate(() => !document.getElementById('summary').hidden) && errors.length === 0, 'Suunnitelmani-nappi toimii syvälinkin jälkeen', errors.join(' | '));
      await ctx.close();
    }

    console.log('3) Sovelluksensisäinen selain: Kopioi linkki');
    {
      const { ctx, page, errors } = await eristetty(b, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0' });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (s) => { window.__copied = s; return Promise.resolve(); } } });
      });
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); sessionStorage.clear(); });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('.inapp-hint .inapp-copy', { timeout: 6000 });
      await page.click('.inapp-hint .inapp-copy');
      await page.waitForTimeout(300);
      const copied = await page.evaluate(() => window.__copied || '');
      ok(/#[sf]=/.test(copied), 'kopioi jakolinkin suunnitelmaan', copied.slice(0, 60));
      ok(errors.length === 0, 'ei sivuvirheitä', errors.join(' | '));
      await ctx.close();
    }

    console.log('4) Vastaanottokortti: kestävän tulon tavoite');
    {
      const { ctx, page, errors } = await eristetty(b);
      // vp-autotour-off hiljentäisi myös vastaanottokortin — ei aseteta
      const plan = { ageNow: 34, ageEnd: 90, startCapital: 20000, monthly: 300, allocStocks: 70, allocBonds: 20, glide: false, real: true, tax: true,
        events: [{ id: 1, type: 'retirement', age: 68, goal: 'withdrawal', withdrawal: 2400, pension: 0, pensionAge: 68 }] };
      await page.goto(BASE + linkki(plan), { waitUntil: 'networkidle' });
      await page.waitForSelector('#rampCard .ramp-stat', { timeout: 6000 });
      const r = await page.evaluate(() => ({
        wd: sim && sim.solvedWithdrawal != null ? Math.round(sim.solvedWithdrawal) : null,
        txt: [...document.querySelectorAll('#rampCard .ramp-stat')].map((e) => e.textContent).join(' | '),
      }));
      const t = norm(r.txt);
      ok(r.wd != null && r.wd !== 2400, 'moottori ratkaisi kestävän tulon', String(r.wd));
      ok(r.wd != null && t.includes(norm(r.wd.toLocaleString('fi-FI'))), 'kortti näyttää ratkaistun tulon', t);
      ok(!/2\s?400\s?€\/kk/.test(t), 'paikkamerkki 2 400 €/kk ei näy', t);
      ok(errors.length === 0, 'ei sivuvirheitä', errors.join(' | '));
      await ctx.close();
    }
  } catch (e) {
    failed++;
    console.error('  ✗ poikkeus: ' + (e && e.stack || e));
  } finally {
    await b.close();
    statik.close();
  }
  console.log(failed ? `\n${failed} epäonnistui` : '\nKaikki läpi');
  process.exit(failed ? 1 : 0);
});
