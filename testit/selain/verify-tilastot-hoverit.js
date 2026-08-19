// Verifiointi: tilastosivun yläosa, sinä-selitteet, hover-pystyviiva, paluunavigointi, valikon järjestys
'use strict';
const { chromium } = require('playwright');

const Q = (name, cond) => {
  if (!cond) { console.error('FAIL: ' + name); process.exitCode = 1; }
  else console.log('ok: ' + name);
};

const quart = (p50) => ({ p25: p50 * 0.6, p50, p75: p50 * 1.7 });
const groupData = (n, cap, mon, stk) => ({
  n,
  startCapital: quart(cap), monthly: quart(mon), stocks: quart(stk),
  retireAge: quart(63), penShare: quart(0.55),
  hist: { retireAge: { edges: [50, 55, 60, 65, 70, 75], counts: [2, 8, 14, 20, 5, 1] } },
  shares: { tax: 0.6, glide: 0.4, real: 0.7 }, successProb: quart(0.8),
  goals: { manual: 0.3, withdrawal: 0.3, age: 0.25, saving: 0.15 },
  confs: { none: 0.4, c75: 0.2, c85: 0.3, c95: 0.1 },
  events: { home: 0.42, car: 0.3, travel: 0.2 },
});
const STATS = {
  updated: '2026-07-20', total: 412, kAnon: 30,
  groups: {
    all: groupData(412, 60000, 450, 70),
    '25-29': groupData(64, 22000, 350, 80),
    '30-34': groupData(88, 48000, 450, 75),
    '35-39': groupData(71, 90000, 500, 70),
    '40-44': groupData(55, 140000, 550, 65),
  },
  eventAges: {
    home: { edges: [22, 26, 30, 34, 38, 42], counts: [3, 18, 30, 22, 8], p50: 31 },
    child: { edges: [24, 28, 32, 36, 40], counts: [5, 20, 25, 10], p50: 31 },
    retirement: { edges: [50, 55, 60, 65, 70, 75], counts: [2, 10, 25, 30, 6], p50: 63 },
  },
  homeLoan: { price: quart(260000), downShare: quart(0.2), years: quart(22), rate: quart(3.1), n: 120 },
  timeline: [{ m: '2026-03', n: 40 }, { m: '2026-04', n: 90 }, { m: '2026-05', n: 120 }, { m: '2026-06', n: 162 }],
};

const PLAN = {
  ageNow: 30, ageEnd: 90, startCapital: 25000, monthly: 400,
  allocStocks: 80, allocBonds: 15, glide: false, real: true, tax: true,
  events: [
    { type: 'retirement', age: 62 },
    { type: 'home', age: 34, amount: -250000, financing: 'loan', years: 20, rate: 3, down: 50000 },
  ],
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**/plausible.io/**', (r) => r.fulfill({ status: 200, body: '' }));
  await page.route('**/stats.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATS) }));

  // Siemen: oma suunnitelma + jaettu → portti auki
  await page.goto('http://localhost:8123/index.html');
  await page.evaluate((plan) => {
    localStorage.clear();
    localStorage.setItem('vp-autotour-off', '1');
    localStorage.setItem('varallisuuspolku-v1', JSON.stringify(plan));
    localStorage.setItem('vp-donate-v1', JSON.stringify({ donatedHash: 'abc' }));
  }, PLAN);

  /* --- Valikko: järjestys ja siirtymä Tilastoihin --- */
  await page.reload();
  await page.click('#moreBtn');
  const ids = await page.$$eval('.menu button', (bs) => bs.map((b) => b.id));
  // Ryhmitelty valikko (5.8.2026): Toiminnot (vertaile, kierros) → Sivut
  // (tilastot, agentit, tietoa) → Asetukset (teema) → nollaus viimeisenä
  Q('valikon järjestys: vertaile → kierros → tilastot → agentit → tietoa → kieli → teema → nollaus',
    JSON.stringify(ids) === JSON.stringify(['mi-compare', 'mi-tour', 'mi-analytics', 'mi-agents', 'mi-info', 'mi-kieli', 'mi-theme', 'mi-reset']));
  Q('väliotsikot: Toiminnot / Sivut / Asetukset',
    JSON.stringify(await page.$$eval('.menu .msect', (ss) => ss.map((s) => s.textContent))) === JSON.stringify(['Toiminnot', 'Sivut', 'Asetukset']));
  await page.click('#mi-analytics');
  await page.waitForURL('**/analytiikka.html');
  await page.waitForSelector('#heroChart svg');

  /* --- Yläosa: yksi lohko, ei irrallista selitettä --- */
  Q('an-head sisältää intron, tiilet ja sisällysluettelon',
    await page.$('.an-head .an-intro') && await page.$('.an-head #anTiles .sum-tile') && (await page.$$('.an-head .an-nav a')).length === 3);
  Q('irrallinen an-legend poistettu', !(await page.$('.an-legend')));
  Q('porttia ei näy (suunnitelma + jako)', !(await page.$('.an-lock')));
  const updated = await page.textContent('#anUpdated');
  Q('päivitetty-päiväys intron sisällä', /Päivitetty/.test(updated));

  /* --- Sinä-merkinnät: selite otsikossa, ei irtotekstiä svg:ssä --- */
  const chips = await page.$$eval('.an-youchip', (cs) => cs.map((c) => c.closest('h2,h3').textContent.replace(/\s+/g, ' ')));
  Q('sinä-selite hero-, säästö-, osakepaino-, elämänkartta- ja eläkekorteissa (' + chips.length + ')', chips.length === 5);
  const svgSina = await page.$$eval('.an-card svg text', (ts) => ts.filter((t) => t.textContent === 'sinä').length);
  Q('svg:issä ei enää irrallisia sinä-tekstejä', svgSina === 0);
  Q('keltainen oma merkki piirtyy heroon', !!(await page.$('#heroChart circle[fill="#fbbf24"]')));

  /* --- Hover: vihje + pystykatkoviiva --- */
  const hero = await page.$('#heroChart svg');
  const hb = await hero.boundingBox();
  await page.mouse.move(hb.x + hb.width * 0.35, hb.y + hb.height * 0.5);
  await page.waitForTimeout(120);
  Q('hover-vihje näkyy', await page.$eval('.an-tip', (t) => !t.hidden && /Mediaani/.test(t.textContent)));
  Q('pystykatkoviiva näkyy herossa', await page.$eval('#heroChart .an-xline', (l) => l.getAttribute('visibility') === 'visible'));
  await page.mouse.move(hb.x - 40, hb.y - 40);
  await page.waitForTimeout(80);
  Q('viiva piiloutuu kun osoitin poistuu', await page.$eval('#heroChart .an-xline', (l) => l.getAttribute('visibility') === 'hidden'));

  // sama suurennoksessa
  await page.hover('#g-sina + .an-card');
  await page.click('#g-sina + .an-card .an-zoom');
  const zsvg = await page.$('.an-light svg');
  const zb = await zsvg.boundingBox();
  await page.mouse.move(zb.x + zb.width * 0.5, zb.y + zb.height * 0.5);
  await page.waitForTimeout(120);
  Q('suurennoksen hover: vihje ja viiva', await page.$eval('.an-tip', (t) => !t.hidden)
    && await page.$eval('.an-light .an-xline', (l) => l.getAttribute('visibility') === 'visible'));
  await page.keyboard.press('Escape');

  /* --- Paluunavigointi --- */
  const back = await page.$$eval('a.an-return', (as) => as.map((a) => [a.textContent.trim(), a.getAttribute('href')]));
  Q('paluulinkit ylä- ja alaosassa, teksti "Palaa suunnitelmaasi"',
    back.length === 2 && back.every(([t, h]) => t === '← Palaa suunnitelmaasi' && h === './'));
  await page.click('header.topbar a.an-return');
  await page.waitForSelector('#chartWrap');
  Q('paluu suunnitelmalle toimii', /index\.html|8123\/$/.test(page.url()) || page.url().endsWith('8123/'));

  /* --- Ilman omaa suunnitelmaa: portti + neutraali linkkiteksti --- */
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://localhost:8123/analytiikka.html');
  await page.waitForSelector('.an-lock');
  Q('portti näkyy ilman suunnitelmaa', !!(await page.$('.an-lock-card')));
  Q('linkkiteksti neutraali ilman suunnitelmaa',
    (await page.textContent('header.topbar a.an-return')).trim() === 'Avaa suunnittelutyökalu');
  Q('an-head jää lukituksessa lukukelpoiseksi (ei blurria)',
    await page.$eval('.an-head', (n) => getComputedStyle(n).filter === 'none'));

  await browser.close();
  console.log(process.exitCode ? 'JOKIN PETTI' : 'KAIKKI OK');
})().catch((e) => { console.error(e); process.exit(1); });
