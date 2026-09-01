/* Jaetun linkin vastaanotto (imaisu-ohjelma A1, 1.9.2026).

   Jakolinkin avaaja sai aiemmin 10-askeleisen yleisesittelyn jaetun
   suunnitelman päälle. Nyt: vastaanottokortti avainluvuin + kaksi polkua.
   Tarkistaa: (1) ensikävijä: kortti näkyy, kierros EI; luvut linkistä;
   "Kokeile" → veto-vihje; (2) palaava käyttäjä omalla suunnitelmalla: linkki
   omaksi rivikseen, kortti kertoo sen; "Tee oma polkuni" → ramppilomake
   uudelle riville; (3) kierros yhä saatavilla kortin napista. */
// Playwright NODE_PATHin kautta (ks. testit/README.md)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const p = require('path');

const ROOT = p.join(__dirname, '..', '..');
const OUT = process.env.VP_OUT || require('os').tmpdir();
let fail = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond ? '' : '  [' + (extra || '') + ']')); if (!cond) fail++; };

const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
const statik = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (f === '/') f = '/index.html';
  fs.readFile(p.join(ROOT, f), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[p.extname(f).slice(1)] || 'application/octet-stream' });
    res.end(d);
  });
});

const PLAN = { ageNow: 41, ageEnd: 90, startCapital: 120000, monthly: 900, savingsGrowth: 1.5,
  allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
  events: [
    { id: 1, type: 'home', age: 44, amount: -250000, financing: 'loan', down: 50000, rate: 3.5, years: 25, isAsset: true, appr: 2 },
    { id: 2, type: 'retirement', age: 63, withdrawal: 2500, pension: 1700, pensionAge: 65 },
  ] };
const LINK = '#s=' + Buffer.from(JSON.stringify(PLAN), 'utf8').toString('base64');

statik.listen(8138, async () => {
  const b = await chromium.launch();

  // 1) Ensikävijä avaa jaetun linkin
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fi-FI' });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://localhost:8138/' + LINK);
    await pg.waitForTimeout(1800);
    const v = await pg.evaluate(() => ({
      kortti: !document.getElementById('ramp').hidden,
      otsikko: (document.querySelector('#rampCard .ramp-title') || {}).textContent || '',
      sub: (document.querySelector('#rampCard .ramp-sub') || {}).textContent || '',
      stats: [...document.querySelectorAll('#rampCard .ramp-stat .v')].map((x) => x.textContent),
      kierros: !document.getElementById('tour').hidden,
      lomake: !!document.getElementById('rampAge'),
      napit: [...document.querySelectorAll('#rampCard .btn')].map((x) => x.id),
    }));
    ok(v.kortti, 'vastaanottokortti näkyy jaetulle linkille');
    ok(v.otsikko.includes('jaettu'), 'otsikko kertoo että suunnitelma on jaettu', v.otsikko);
    ok(!v.kierros, 'yleisesittelykierros EI käynnisty jaetulle linkille');
    ok(!v.lomake, 'ramppilomaketta ei näytetä (luvut tulevat linkistä)');
    ok(v.sub.includes('41') && v.sub.includes('63') && v.sub.includes('1 elämäntapahtumaa'), 'kuvausrivi: ikä, eläkeikä, tapahtumat linkistä', v.sub);
    ok(v.stats.length === 2 && v.stats[1].includes('2') && v.stats[1].includes('/kk'), 'avainluvut: varallisuus eläkkeellä + kuukausitulo', v.stats.join(' | '));
    ok(v.napit.includes('jaettuKokeile') && v.napit.includes('jaettuOma') && v.napit.includes('jaettuTour'), 'kolme polkua: kokeile / oma / kierros');
    ok(errs.length === 0, 'ei konsolivirheitä', errs[0]);
    await pg.screenshot({ path: p.join(OUT, 'jaettu-kortti.png') });

    // Kokeile → kortti kiinni, veto-vihje näkyy
    await pg.click('#jaettuKokeile');
    await pg.waitForTimeout(700);
    const k = await pg.evaluate(() => ({
      kortti: !document.getElementById('ramp').hidden,
      vihje: !!document.querySelector('.veto-hint'),
      kierros: !document.getElementById('tour').hidden,
    }));
    ok(!k.kortti, 'Kokeile sulkee kortin');
    ok(k.vihje, 'Kokeile näyttää veto-vihjeen (tartu merkkiin)');
    ok(!k.kierros, 'kierros ei käynnisty Kokeilen jälkeen');
    await ctx.close();
  }

  // 2) Palaava käyttäjä omalla suunnitelmalla avaa linkin
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fi-FI' });
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8138/');
    await pg.waitForTimeout(1500);
    // Oma suunnitelma talteen rampin kautta
    await pg.fill('#rampAge', '30'); await pg.fill('#rampWealth', '5000'); await pg.fill('#rampMonthly', '200');
    await pg.click('#rampGo');
    await pg.waitForTimeout(900);
    await pg.click('#rampOpen');
    await pg.waitForTimeout(600);
    // Nyt jaettu linkki — about:blank välissä: pelkkä hash-muutos samaan
    // URL:iin ei lataa sivua uudelleen, oikea linkin avaus on aina täysi lataus
    await pg.goto('about:blank');
    await pg.goto('http://localhost:8138/' + LINK);
    await pg.waitForTimeout(1800);
    const v = await pg.evaluate(() => ({
      kortti: !document.getElementById('ramp').hidden,
      note: (document.querySelector('#rampCard .ramp-note') || {}).textContent || '',
      rivit: plans.length,
      aktiivinen: (plans.find((x) => x.id === planActiveId) || {}).alkupera,
      ageNow: state.ageNow,
    }));
    ok(v.kortti, 'palaava käyttäjä: kortti näkyy');
    ok(v.rivit === 2 && v.aktiivinen === 'linkki', 'linkki avattiin omaksi rivikseen (2 riviä, aktiivinen = linkki)', v.rivit + '/' + v.aktiivinen);
    ok(v.note.includes('tallessa'), 'kortti kertoo että oma suunnitelma on tallessa', v.note.slice(0, 80));
    ok(v.ageNow === 41, 'linkin suunnitelma on aktiivinen (ikä 41)');

    // Tee oma polkuni → uusi rivi + ramppilomake
    await pg.click('#jaettuOma');
    await pg.waitForTimeout(700);
    const o = await pg.evaluate(() => ({
      lomake: !!document.getElementById('rampAge') && !document.getElementById('ramp').hidden,
      rivit: plans.length,
    }));
    ok(o.lomake, 'Tee oma polkuni avaa ramppilomakkeen');
    ok(o.rivit === 3, 'uusi rivi luotiin omaa polkua varten (3 riviä)', String(o.rivit));
    await ctx.close();
  }

  // 3) Kierros on yhä saatavilla kortin napista
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fi-FI' });
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8138/' + LINK);
    await pg.waitForTimeout(1800);
    await pg.click('#jaettuTour');
    await pg.waitForTimeout(600);
    const t = await pg.evaluate(() => ({ kierros: !document.getElementById('tour').hidden, kortti: !document.getElementById('ramp').hidden }));
    ok(t.kierros && !t.kortti, 'Esittelykierros-nappi käynnistää kierroksen ja sulkee kortin');
    await ctx.close();
  }

  // 4) In-app-selain (imaisu-ohjelma A5): vihje + linkin kopiointi; ei normaalissa selaimessa
  {
    const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0;]';
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fi-FI', userAgent: UA });
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8138/' + LINK);
    await pg.waitForTimeout(3200);
    const v = await pg.evaluate(() => {
      const h = document.querySelector('.inapp-hint');
      return { vihje: !!h, teksti: h ? h.textContent : '', kopioi: !!(h && h.querySelector('.inapp-copy')), kortti: !document.getElementById('ramp').hidden };
    });
    ok(v.vihje, 'in-app-selaimessa näytetään vihje');
    ok(/selaimessa/.test(v.teksti) && v.kopioi, 'vihje kehottaa avaamaan selaimessa ja tarjoaa linkin kopioinnin', v.teksti.slice(0, 60));
    ok(v.kortti, 'vastaanottokortti näkyy in-app-selaimessakin');
    await pg.click('.inapp-hint .inapp-x');
    ok(await pg.evaluate(() => !document.querySelector('.inapp-hint')), 'vihjeen voi sulkea');
    await pg.reload();
    await pg.waitForTimeout(3200);
    ok(await pg.evaluate(() => !document.querySelector('.inapp-hint')), 'vihje näytetään vain kerran istunnossa');
    await ctx.close();
    const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fi-FI' });
    const pg2 = await ctx2.newPage();
    await pg2.goto('http://localhost:8138/' + LINK);
    await pg2.waitForTimeout(3200);
    ok(await pg2.evaluate(() => !document.querySelector('.inapp-hint')), 'normaalissa selaimessa ei in-app-vihjettä');
    await ctx2.close();
  }

  await b.close();
  statik.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
});
