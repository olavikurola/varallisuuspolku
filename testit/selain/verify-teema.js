/* Vaalean teeman verifiointi: ruutukaappaukset + kytkimen toiminta.
   Käyttää 9db77d62-scratchpadin playwright-asennusta. */
// Playwright NODE_PATHin kautta (ks. testit/README.md)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const p = require('path');

const ROOT = p.join(__dirname, '..', '..');
const OUT = process.env.VP_OUT || require('os').tmpdir();
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

server.listen(8131, async () => {
  const b = await chromium.launch();
  let fail = 0;
  const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fail++; };

  async function page(opts = {}) {
    const ctx = await b.newContext({ viewport: { width: opts.w || 1440, height: opts.h || 900 }, locale: 'fi-FI' });
    await ctx.addInitScript((theme) => {
      localStorage.setItem('vp-tour-done', '1');
      localStorage.setItem('vp-autotour-off', '1');
      localStorage.setItem('vp-veto-vihje', '1');
      if (theme === 'light') localStorage.setItem('vp-theme', 'light');
    }, opts.theme || 'dark');
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8131' + (opts.url || '/'));
    await pg.waitForTimeout(1800);
    return { ctx, pg };
  }

  // 1) Vaalea työpöytä
  let { ctx, pg } = await page({ theme: 'light' });
  ok(await pg.evaluate(() => document.documentElement.classList.contains('light')), 'light-luokka headin skriptistä');
  ok(await pg.evaluate(() => document.querySelector('meta[name=theme-color]').content) === '#eef1f8', 'theme-color vaalea');
  const bg = await pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(/238, 241, 248/.test(bg), 'body-tausta vaalea (' + bg + ')');
  await pg.screenshot({ path: p.join(OUT, 'light-desktop.png') });
  // ☰-valikko auki: teemakohta näkyvissä
  await pg.click('#moreBtn');
  await pg.waitForTimeout(300);
  ok(await pg.textContent('#mi-theme').then(t => t.includes('Tumma teema')), 'valikossa "Tumma teema" kun vaalea päällä');
  await pg.screenshot({ path: p.join(OUT, 'light-menu.png') });
  // Kytkin takaisin tummaan
  await pg.click('#mi-theme');
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => !document.documentElement.classList.contains('light')), 'kytkin vaihtaa tummaan');
  ok(await pg.evaluate(() => localStorage.getItem('vp-theme')) === 'dark', 'valinta talteen');
  await ctx.close();

  // 1b) Kaavion tooltip vaalealla: perustyyli kovakoodaa tumman lasin,
  //     html.light-ohituksen pitää kääntää se valkoiseksi
  ({ ctx, pg } = await page({ theme: 'light' }));
  const chartBox = await pg.locator('#chart').boundingBox();
  await pg.mouse.move(chartBox.x + chartBox.width / 2, chartBox.y + chartBox.height / 2);
  await pg.waitForTimeout(400);
  const ttBg = await pg.evaluate(() => {
    const el = document.getElementById('tooltip');
    return el && !el.hidden ? getComputedStyle(el).backgroundColor : null;
  });
  ok(ttBg && /255, 255, 255/.test(ttBg), 'tooltip valkoinen vaalealla (' + ttBg + ')');
  await ctx.close();

  // 2) Tumma työpöytä (regressio)
  ({ ctx, pg } = await page({ theme: 'dark' }));
  ok(await pg.evaluate(() => !document.documentElement.classList.contains('light')), 'tumma oletuksena');
  const dbg = await pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(/10, 14, 26/.test(dbg), 'tumma tausta ennallaan (' + dbg + ')');
  await pg.screenshot({ path: p.join(OUT, 'dark-desktop.png') });
  await ctx.close();

  // 3) Vaalea mobiili 390px + ylivuototarkistus
  ({ ctx, pg } = await page({ theme: 'light', w: 390, h: 844 }));
  const overX = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overX <= 0, 'ei vaakaylivuotoa 390px (' + overX + 'px)');
  await pg.screenshot({ path: p.join(OUT, 'light-mobile.png') });
  await ctx.close();

  // 4) Vaalea piirtopöytä
  ({ ctx, pg } = await page({ theme: 'light' }));
  await pg.click('.fs-open').catch(() => {});
  await pg.waitForTimeout(1200);
  const isFs = await pg.evaluate(() => document.body.classList.contains('fs'));
  ok(isFs, 'piirtopöytä aukesi');
  await pg.screenshot({ path: p.join(OUT, 'light-fs.png') });
  await ctx.close();

  // 5) Vaalea Tilastot-sivu
  ({ ctx, pg } = await page({ theme: 'light', url: '/analytiikka.html' }));
  await pg.screenshot({ path: p.join(OUT, 'light-tilastot.png'), fullPage: false });
  await ctx.close();

  // 6) Vaalea validointisivu
  ({ ctx, pg } = await page({ theme: 'light', url: '/validointi.html' }));
  await pg.screenshot({ path: p.join(OUT, 'light-validointi.png') });
  await ctx.close();

  await b.close();
  server.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
});
