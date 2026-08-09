'use strict';
/* Tilastot-sivun verifiointi: nimenvaihto, lohkot, poimintalauseet, suurennus. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');

let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };

const q = (a, b, c) => ({ p25: a, p50: b, p75: c });
const groupData = (n) => ({
  n,
  monthly: q(250, 500, 900), startCapital: q(8000, 35000, 100000), stocks: q(55, 75, 90),
  retireAge: q(55, 62, 65),
  hist: { retireAge: { edges: [40, 45, 50, 55, 60, 65, 70, 75, 80], counts: [1, 2, 5, 12, 25, 30, 8, 2] } },
  penShare: q(0.3, 0.5, 0.7),
  goals: { manual: 0.4, withdrawal: 0.3, age: 0.2, saving: 0.1 },
  confs: { none: 0.6, c75: 0.15, c85: 0.15, c95: 0.1 },
  shares: { tax: 0.8, glide: 0.3, real: 0.4 },
  successProb: q(0.6, 0.85, 0.95),
  events: { home: 0.5, car: 0.3, retirement: 0.9 },
});
const STATS = {
  updated: '2026-07-22T00:00:00Z', total: 120, kAnon: 30,
  // vähintään 2 ryhmää dataa: ikäryhmäkäyrät (hero, kvartiilipylväät) piirtyvät
  groups: { all: groupData(120), '25-29': groupData(32), '30-34': groupData(41), '35-39': groupData(38), '40-44': groupData(30) },
  eventAges: {
    home: { edges: [20, 25, 30, 35, 40, 45, 50], counts: [1, 5, 12, 8, 3, 1], p50: 33 },
    car: { edges: [20, 25, 30, 35, 40, 45, 50], counts: [2, 6, 8, 5, 2, 1], p50: 32 },
    retirement: { edges: [50, 55, 60, 65, 70, 75], counts: [2, 8, 25, 30, 4], p50: 63 },
  },
  homeLoan: { n: 35, price: q(180000, 240000, 320000), downShare: q(0.1, 0.15, 0.25), years: q(20, 25, 28), rate: q(3, 3.5, 4) },
  timeline: [{ m: '2026-06', n: 40 }, { m: '2026-07', n: 80 }],
};

(async () => {
  const server = spawn('node', ['testit/selain/serve.js'], { cwd: require('path').join(__dirname, '..', '..') });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/stats.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATS) }));

  // Oma suunnitelma + jako tehty → portti auki, "sinä"-kerros käytössä
  await page.goto('http://localhost:8123/analytiikka.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('varallisuuspolku-v1', JSON.stringify({
      ageNow: 34, ageEnd: 90, startCapital: 40000, monthly: 500, allocStocks: 70, allocBonds: 20,
      events: [{ id: 1, type: 'retirement', age: 62, withdrawal: 2400, pension: 1500, pensionAge: 65 },
               { id: 2, type: 'home', age: 33, amount: -200000, financing: 'loan', down: 30000, rate: 3.5, years: 25, isAsset: true, appr: 2 }],
    }));
    localStorage.setItem('vp-donate-v1', JSON.stringify({ donatedHash: 'testihash' }));
  });
  await page.goto('http://localhost:8123/analytiikka.html?t=1');
  await page.waitForFunction(() => document.querySelectorAll('.an-card svg').length >= 3);

  console.log('Nimenvaihto');
  ok((await page.title()).includes('Tilastot'), 'title on Tilastot', await page.title());
  ok((await page.locator('.brand-name').textContent()) === 'Tilastot', 'brändinimi Tilastot');
  ok((await page.locator('.brand-tag').textContent()).includes('avoin vertailudata'), 'alaotsikko paikallaan');
  const bodyText = await page.evaluate(() => document.body.textContent);
  ok(!bodyText.includes('Vaurastumisen kartta'), 'vanha nimi ei esiinny sivulla');

  console.log('Lohkot ja navigaatio');
  ok(await page.locator('.an-nav a').count() === 3, 'kolme ankkurichippiä');
  ok(await page.locator('.an-gt').count() === 3, 'kolme lohko-otsikkoa');
  ok((await page.locator('.an-youchip').count()) >= 1, 'keltaisen pisteen selite korttiotsikoissa');
  ok(!(await page.locator('.an-lock').count()), 'portti auki (oma suunnitelma + jako)');

  console.log('Poimintalauseet');
  const takes = await page.locator('.an-take').allTextContents();
  ok(takes.length >= 4, 'vähintään neljä poimintalausetta', String(takes.length));
  ok(takes.some((t) => t.includes('mediaanivarallisuus') && t.includes('n = 41')), 'varallisuuspoiminta + n-luku', takes[0]);
  ok(takes.some((t) => t.includes('mediaanisäästö') && t.includes('500')), 'säästöpoiminta ryhmästä');
  ok(takes.some((t) => t.includes('eläkeikätavoite')), 'eläkepoiminta');
  ok(takes.some((t) => t.includes('mediaanin yläpuolella') || t.includes('neljänneksessä') || t.includes('mediaanin alapuolella')), 'kvartiilikieli käytössä');

  console.log('Suurennus');
  ok(await page.locator('.an-zoom').count() >= 5, 'suurennusnappi korteissa', String(await page.locator('.an-zoom').count()));
  await page.locator('.an-zoom').first().click();
  ok(await page.locator('.an-light').count() === 1, 'kehys aukeaa');
  ok(await page.locator('.an-light svg').count() >= 1, 'kaavio kehyksessä (SVG skaalautuu)');
  const w = await page.evaluate(() => document.querySelector('.an-light .an-card').getBoundingClientRect().width);
  ok(w > 1000, 'suurennettu kortti on iso', w + 'px');
  await page.keyboard.press('Escape');
  ok(await page.locator('.an-light').count() === 0, 'Esc sulkee');
  await page.locator('.an-zoom').first().click();
  await page.locator('.an-light-x').click();
  ok(await page.locator('.an-light').count() === 0, '✕ sulkee');

  console.log('Hoverit: arvot osoittimen alle');
  const hb = await page.locator('#heroChart svg').boundingBox();
  await page.mouse.move(hb.x + hb.width * 0.35, hb.y + hb.height * 0.5);
  await page.waitForFunction(() => { const t = document.querySelector('.an-tip'); return t && !t.hidden; });
  const tip1 = await page.locator('.an-tip').textContent();
  ok(tip1.includes('Mediaani') && tip1.includes('P25') && tip1.includes('P75'), 'hero-hover kertoo kvartiilit', tip1);
  ok(tip1.includes('n = '), 'hover näyttää n-luvun');
  await page.locator('#retireHist').scrollIntoViewIfNeeded();
  const rb = await page.locator('#retireHist svg').boundingBox();
  await page.mouse.move(rb.x + rb.width * 0.55, rb.y + rb.height * 0.6);
  await page.waitForFunction(() => { const t = document.querySelector('.an-tip'); return t && !t.hidden && t.textContent.includes('suunnitelmaa'); });
  ok(true, 'histogrammihover kertoo lukumäärän ja osuuden');
  await page.mouse.move(5, 5);
  ok(await page.evaluate(() => document.querySelector('.an-tip').hidden), 'vihje piiloutuu kaavion ulkopuolella');
  await page.locator('.an-zoom').first().click();
  const zb = await page.locator('.an-light svg').boundingBox();
  await page.mouse.move(zb.x + zb.width * 0.35, zb.y + zb.height * 0.5);
  await page.waitForFunction(() => { const t = document.querySelector('.an-tip'); return t && !t.hidden && t.textContent.includes('Mediaani'); });
  ok(true, 'hover toimii myös suurennoksessa (klooni perii resolverin)');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.querySelector('.an-tip').hidden), 'suurennoksen sulku piilottaa vihjeen');

  console.log('Yläosan selkeytys');
  ok(!(await page.locator('#youBanner').count()), 'erillinen selitebanneri poistettu');
  ok((await page.locator('.an-youchip').count()) === 5, 'sinä-selitteet korteissa kun oma suunnitelma on');
  const intro = await page.locator('.an-intro').textContent();
  ok(!intro.includes('vähintään 30'), 'k-anon-selitys pois ingressistä (on menetelmälohkossa)');

  console.log('Työtilan viittaukset');
  await page.goto('http://localhost:8123/?t=2');
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  const idx = await page.evaluate(() => document.body.innerHTML);
  ok(!idx.includes('Vaurastumisen kartta'), 'vanha nimi poissa työtilasta');
  ok(idx.includes('Tilastot'), 'uusi nimi työtilan linkeissä');

  console.log('Sulava avaus: välimuisti ensin, luurangot ensikäynnillä (8.8. korjaus)');
  // (a) välimuistilla sivu on täysi heti vaikka verkko viipyy
  const hidas = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await hidas.route('**/stats.json', async (route) => {
    await new Promise((r) => setTimeout(r, 900));
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATS) });
  });
  await hidas.addInitScript((s) => { localStorage.setItem('vp-stats-cache', JSON.stringify(s)); }, STATS);
  await hidas.goto('http://localhost:8123/analytiikka.html');
  await hidas.waitForTimeout(250);
  ok(await hidas.evaluate(() => document.querySelectorAll('#anTiles .sum-tile:not(.an-luuranko)').length) >= 4,
    'välimuistilla tiilet täynnä heti (250 ms, verkko 900 ms)');
  await hidas.waitForTimeout(1200);
  ok(await hidas.evaluate(() => document.querySelectorAll('.an-me-toggle').length) <= 1, 'taustapäivitys ei monista kytkintä');
  await hidas.close();
  // (b) ilman välimuistia luurangot varaavat tilan eikä sisältö töki alaspäin
  const eka = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await eka.route('**/stats.json', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATS) });
  });
  await eka.goto('http://localhost:8123/analytiikka.html');
  await eka.waitForTimeout(250);
  const lu = await eka.evaluate(() => ({
    n: document.querySelectorAll('#anTiles .an-luuranko').length,
    navY: Math.round(document.querySelector('.an-nav').getBoundingClientRect().top),
  }));
  ok(lu.n === 5, 'luurankotiilet heti ensikäynnillä (' + lu.n + ')');
  await eka.waitForTimeout(1200);
  const navY2 = await eka.evaluate(() => Math.round(document.querySelector('.an-nav').getBoundingClientRect().top));
  // pieni toleranssi: fonttimetriikat eroavat moottoreittain — alle rivin-
  // korkeuden jäävä ero häviää 0,18 s häivytykseen (WebKitissä mitattu 0 px)
  ok(Math.abs(navY2 - lu.navY) <= 12, 'data täyttyy ilman havaittavaa pystysiirtymää (' + lu.navY + '→' + navY2 + ')');
  ok(await eka.evaluate(() => localStorage.getItem('vp-stats-cache') !== null), 'tuore data talteen välimuistiin');
  await eka.close();

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nKaikki Tilastot-tarkistukset läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
