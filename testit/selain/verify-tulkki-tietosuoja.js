/* Tulkin AI-payloadin tietosuojavartija.

   Periaate: käyttäjän KIRJOITTAMAA vapaata tekstiä ei lähetetä verkkoon —
   vain moottorin luvut ja käyttäjän oma kysymys. Testi kylvää tunnistettavan
   sentinel-merkkijonon jokaiseen nimettävään kenttään ja varmistaa, ettei se
   esiinny lähtevässä pyynnössä. Lisäksi: geneerinen tunnus käännetään
   takaisin omaksi nimeksi VASTA näytöllä (localizePlanNames).

   Tausta 8/2026: aiempi toteutus välitti p.nimi-kentän kontekstissa —
   nyt verkkoon menee vain geneerinen tunnus (ks. buildOmatSuunnitelmat),
   ja tämä sarja vartioi ettei vapaa teksti pääse takaisin payloadiin. */
// Playwright NODE_PATHin kautta (ks. testit/README.md)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const p = require('path');

const ROOT = p.join(__dirname, '..', '..');
const OUT = process.env.VP_OUT || require('os').tmpdir();
let fail = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond ? '' : '  [' + (extra || '') + ']')); if (!cond) fail++; };

// Sentinel: ei voi syntyä sattumalta eikä esiinny koodissa
const S = 'ZXQSENTINEL';

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

statik.listen(8134, async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fi-FI' });
  await ctx.addInitScript(() => {
    localStorage.setItem('vp-tour-done', '1');
    localStorage.setItem('vp-autotour-off', '1');
    localStorage.setItem('vp-veto-vihje', '1');
    localStorage.setItem('vp-tulkki-intro', '1');
  });
  const pg = await ctx.newPage();

  let captured = null;
  await pg.route('**/tulkki', (route) => {
    captured = route.request().postData();
    // Vastauksessa geneerinen tunnus → näytöllä pitää näkyä oma nimi
    route.fulfill({
      status: 200, contentType: 'application/x-ndjson',
      body: '{"delta":"Suunnitelma 2 kestää paremmin kuin Suunnitelma 1."}\n{"done":true}\n',
    });
  });

  await pg.goto('http://localhost:8134/');
  await pg.waitForTimeout(1800);

  // 1) Kylvä sentinel jokaiseen nimettävään kenttään
  const seeded = await pg.evaluate((S) => {
    plans[0].nimi = S + '_PLAN_A';
    const row = planRowFromCurrent(S + '_PLAN_B', 'oma');
    row.data.monthly = 900;
    const r = row.data.events.find((e) => e.type === 'retirement');
    if (r) r.age = 66;
    plans.push(row);
    persistPlans(true);
    // Pro: omien omaisuusluokkien nimet ovat myös vapaata tekstiä
    setPro(true);
    state.pro = state.pro || {};
    state.pro.assets = [{ key: 'x', name: S + '_ASSET', mu: 7, sigma: 16, weight: 5 }];
    return { plans: plans.length, asset: state.pro.assets[0].name };
  }, S);
  ok(seeded.plans >= 2, 'kaksi rinnakkaista suunnitelmaa kylvetty');

  // 2) "Mitä lähetetään" -esikatselu: rivin napautus näyttää täsmälleen
  // lähtevän kontekstin EIKÄ lähetä mitään
  await pg.click('.tk-handle');
  await pg.waitForTimeout(600);
  await pg.click('.tk-privacy');
  await pg.waitForTimeout(300);
  const prev = await pg.evaluate(() => {
    const v = document.querySelector('.tk-priv-view');
    return v ? { json: v.querySelector('.tk-priv-json').textContent } : null;
  });
  ok(!!prev, 'tietosuojarivin napautus avaa esikatselun');
  if (prev) {
    ok(prev.json.includes('Suunnitelma 1'), 'esikatselun JSON näyttää geneeriset tunnukset');
    ok(!prev.json.includes(S), 'sentinel ei näy esikatselun JSON:ssa');
    ok(prev.json.includes('onnistumistodennakoisyysPct'), 'esikatselu näyttää oikean kontekstin');
  }
  ok(captured === null, 'esikatselun avaaminen EI lähetä mitään');
  await pg.click('.tk-privacy'); // toggle kiinni
  await pg.waitForTimeout(200);
  ok(await pg.evaluate(() => !document.querySelector('.tk-priv-view')), 'toinen napautus sulkee esikatselun');

  // 3) Kysymys → pyyntö siepataan
  await pg.fill('.tk-ask input', 'Vertaa suunnitelmiani keskenään');
  await pg.evaluate(() => document.getElementById('tkForm').dispatchEvent(new Event('submit', { cancelable: true })));
  await pg.waitForTimeout(1200);

  ok(!!captured, 'Tulkki-pyyntö siepattu');
  if (captured) {
    // YDINVARTIJA: sentinel ei saa esiintyä missään muodossa
    ok(!captured.includes(S), 'sentinel EI esiinny lähtevässä payloadissa',
      captured.slice(Math.max(0, captured.indexOf(S) - 60), captured.indexOf(S) + 60));
    // Geneeriset tunnukset kuitenkin mukana, jotta vertailu toimii
    ok(captured.includes('Suunnitelma 1') && captured.includes('Suunnitelma 2'),
      'geneeriset tunnukset välitetään');
    // Luvut mukana — anonymisointi ei saa tyhjentää kontekstia
    ok(captured.includes('onnistumistodennakoisyysPct'), 'moottorin tunnusluvut mukana');
    ok(captured.includes('"aktiivinen":true'), 'aktiivinen suunnitelma merkitty');
    // Käyttäjän oma kysymys saa ja pitää lähteä
    ok(captured.includes('Vertaa suunnitelmiani'), 'käyttäjän kysymys välitetään');
  }

  // 4) Näytöllä oma nimi takaisin (localizePlanNames)
  const shown = await pg.evaluate(() => {
    const a = document.querySelector('.tk-a');
    return a ? a.textContent : '';
  });
  ok(shown.includes(S + '_PLAN_A') && shown.includes(S + '_PLAN_B'),
    'omat nimet palautetaan näytölle geneerisistä tunnuksista', shown.slice(0, 120));
  ok(!shown.includes('Suunnitelma 1') && !shown.includes('Suunnitelma 2'),
    'geneerinen tunnus ei jää näkyviin');

  // 5) Tietosuojateksti ei enää lupaa ettei mitään lähde
  const priv = await pg.evaluate(() => {
    const el = document.querySelector('.tk-privacy');
    return el ? { txt: el.textContent, title: el.getAttribute('title') || '' } : null;
  });
  ok(!!priv, 'tk-privacy löytyy');
  if (priv) {
    ok(!/ei lähde (selaimestasi|laitteeltasi)/.test(priv.txt),
      'ei väitetä että laskelma ei lähde', priv.txt);
    ok(/nimettöm/i.test(priv.txt), 'kerrotaan että luvut välitetään nimettöminä', priv.txt);
    ok(/ei lähetetä/.test(priv.title) && /[Nn]imi/.test(priv.title),
      'title kertoo mitä ei lähetetä', priv.title);
  }

  await pg.screenshot({ path: p.join(OUT, 'tulkki-tietosuoja.png') });

  await ctx.close();
  await b.close();
  statik.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
});
