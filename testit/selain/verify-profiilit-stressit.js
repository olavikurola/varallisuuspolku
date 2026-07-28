/* Profiilit×Tulkki + markkinashokki-laajennus: selainverifiointi.
   Tulkin verkkopyyntö siepataan (ei oikeaa AI-kutsua) ja kontekstista
   tarkistetaan suunnitelmat-osio; Pro-panelista stressilista. */
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

statik.listen(8133, async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fi-FI' });
  await ctx.addInitScript(() => {
    localStorage.setItem('vp-tour-done', '1');
    localStorage.setItem('vp-autotour-off', '1');
    localStorage.setItem('vp-veto-vihje', '1');
    localStorage.setItem('vp-tulkki-intro', '1');
  });
  const pg = await ctx.newPage();

  // Tulkki-pyynnön sieppaus: konteksti talteen, vastaus 503 (ei AI-kutsua)
  let captured = null;
  await pg.route('**/tulkki', (route) => {
    captured = route.request().postData();
    // NDJSON-virta sidontatokeneilla: testaa samalla suunnitelmat.rivit.N-polkujen
    // lukusidonnan (bindMapin taulukkokävely) päästä päähän
    route.fulfill({
      status: 200, contentType: 'application/x-ndjson',
      body: '{"delta":"Oma polku: [[suunnitelmat.rivit.0.onnistumistodennakoisyysPct]] % — Varovainen: [[suunnitelmat.rivit.1.onnistumistodennakoisyysPct]] %."}\n{"done":true}\n',
    });
  });

  await pg.goto('http://localhost:8133/');
  await pg.waitForTimeout(1800);

  // 1) Kaksi rinnakkaista suunnitelmaa
  await pg.evaluate(() => {
    plans[0].nimi = 'Oma polku';
    const row = planRowFromCurrent('Varovainen', 'oma');
    row.data.monthly = 900;
    const r = row.data.events.find((e) => e.type === 'retirement');
    if (r) r.age = 66;
    plans.push(row);
    persistPlans(true);
  });

  // 2) Tulkki auki ja kysymys → pyynnön konteksti sisältää suunnitelmat
  await pg.click('.tk-handle');
  await pg.waitForTimeout(600);
  await pg.fill('.tk-ask input', 'Vertaa suunnitelmiani keskenään');
  await pg.evaluate(() => document.getElementById('tkForm').dispatchEvent(new Event('submit', { cancelable: true })));
  await pg.waitForTimeout(1200);
  ok(!!captured, 'Tulkki-pyyntö siepattu');
  if (captured) {
    ok(captured.includes('"suunnitelmat"') && captured.includes('rivit'), 'kontekstissa suunnitelmat-osio');
    ok(captured.includes('Oma polku') && captured.includes('Varovainen'), 'suunnitelmien nimet mukana');
    ok(captured.includes('onnistumistodennakoisyysPct'), 'tunnusluvut mukana');
    ok(captured.includes('"aktiivinen":true'), 'aktiivinen suunnitelma merkitty');
  }

  // 3) Vastaus renderöityi: sidontatokenit taulukkopoluista → moottorin luvut
  const bound = await pg.evaluate(() => {
    const spans = [...document.querySelectorAll('.tk-a .tk-bound')];
    const doubts = [...document.querySelectorAll('.tk-a .tk-doubt')];
    return { n: spans.length, txt: spans.map((s) => s.textContent).join('|'), doubts: doubts.length };
  });
  ok(bound.n === 2 && bound.doubts === 0, 'suunnitelmat.rivit.N-sidonnat renderöityvät (' + bound.txt + ')');
  const chip = await pg.evaluate(() => !!document.querySelector('.tk-plans'));
  ok(chip, 'Vertaa suunnitelmiani -chippi ehdotuksissa');
  await pg.screenshot({ path: p.join(OUT, 'profiilit-tulkki.png') });

  // 4) Pro-stressilista: 5 skenaariota, uudet nimet ja from:'now'-selite
  const pro = await pg.evaluate(() => {
    setPro(true);
    buildProMc();
    const boxes = [...document.querySelectorAll('[data-pact="stress"]')];
    const labels = boxes.map((x) => x.closest('label').textContent);
    return { n: boxes.length, txt: labels.join(' | ') };
  });
  ok(pro.n === 5, 'Pro-panelissa 5 stressiskenaariota (' + pro.n + ')');
  ok(pro.txt.includes('Sama karhu jo tänään') && pro.txt.includes('heti nykyhetkestä'), 'seqNow-selite oikein');
  ok(pro.txt.includes('Romahdus −50'), 'crash-skenaario listassa');

  // 5) Markkinatestin taulukko: 5 stressiä + dynaaminen otsikko (moottoriajo suoraan)
  const mt = await pg.evaluate(() => {
    const mod = JSON.parse(JSON.stringify(serialize()));
    mod.proOn = true;
    mod.pro = { mc: { stress: ['bear', 'seqNow', 'crash', 'lost', 'stagf'] } };
    const s = simulate(mod);
    return { n: s.stress.length, names: s.stress.map((x) => x.name).join(' | ') };
  });
  ok(mt.n === 5, 'moottori ajaa 5 stressiä selaimessa');
  ok(mt.names.includes('Sama karhu jo tänään'), 'uudet skenaariot moottorissa');

  await ctx.close();
  await b.close();
  statik.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
});
