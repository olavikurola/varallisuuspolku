'use strict';
/* Tilastot-sivun varanäkymät harvalla datalla (vain all-ryhmä auki, kuten
   lanseerauksessa): histogrammi-fallbackit, uudet kortit, degeneraatiosiivous
   ja basis-maininta. Peili live-tilanteesta 28.7.2026. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');

let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };
const norm = (s) => (s || '').replace(/[  ]/g, ' ');

const q = (a, b, c) => ({ p25: a, p50: b, p75: c });
const STATS = {
  updated: '2026-07-28T00:00:00Z', v: 3, kAnon: 30, total: 43, editedN: 17, basis: 'all',
  groups: {
    all: {
      n: 43,
      monthly: q(500, 1000, 1000), startCapital: q(30000, 120000, 370000), stocks: q(70, 75, 100),
      retireAge: q(55, 65, 65), withdrawal: q(2400, 2400, 2500), pension: q(1500, 1500, 1500),
      penShare: q(0, 0.5, 0.63), wAtRet: q(640000, 900000, 1400000), successProb: q(0.36, 0.79, 0.99),
      goals: { manual: 0.51, withdrawal: 0.4, age: 0.02, saving: 0.07 },
      confs: { none: 0.95, c75: 0, c85: 0, c95: 0.05 },
      shares: { glide: 0.07, real: 0.23, tax: 0.98 },
      events: { home: 0.44, car: 0.33, inheritance: 0.14, goal: 0.09, study: 0.05, child: 0.05, retirement: 1 },
      hist: {
        retireAge: { edges: [40, 45, 50, 55, 60, 65, 70, 75, 80], counts: [2, 2, 5, 4, 2, 23, 4, 1] },
        monthly: { edges: [0, 100, 500, 1000, 1500, 2000, 5000, 10000], counts: [7, 2, 11, 16, 4, 3, 0] },
        stocks: { edges: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], counts: [0, 0, 0, 0, 0, 0, 1, 21, 1, 20] },
        startCapital: { edges: [0, 5000, 10000, 25000, 50000, 100000, 150000, 250000, 400000, 600000, 1000000, 2000000], counts: [4, 3, 4, 6, 5, 5, 6, 5, 3, 1, 1] },
      },
    },
    '30-34': { n: 16 }, '45-49': { n: 7 }, '35-39': { n: 6 },
  },
  eventAges: { retirement: { edges: [18, 27, 36, 45, 54, 63, 72, 81], counts: [0, 0, 0, 9, 8, 25, 1], n: 43, p50: 65 } },
  homeLoan: null, owned: { n: 43, share: 0.02 },
  timeline: [{ m: '2026-07', n: 43 }],
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

  await page.goto('http://localhost:8123/analytiikka.html');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('varallisuuspolku-v1', JSON.stringify({
      ageNow: 34, ageEnd: 90, startCapital: 40000, monthly: 500, allocStocks: 70, allocBonds: 20,
      events: [{ id: 1, type: 'retirement', age: 62, withdrawal: 2400, pension: 1500, pensionAge: 65 },
               { id: 2, type: 'home', age: 33, amount: -200000, financing: 'loan', down: 30000, rate: 3.5, years: 25 }],
    }));
    localStorage.setItem('vp-donate-v1', JSON.stringify({ donatedHash: 'testihash' }));
  });
  await page.goto('http://localhost:8123/analytiikka.html?t=1');
  await page.waitForFunction(() => document.querySelectorAll('.an-card svg').length >= 3);

  console.log('Histogrammi-fallbackit (ikäryhmät kiinni, koko joukko auki)');
  ok(await page.locator('#heroChart svg path.hbar').count() >= 8, 'pääkaavio piirtää koko joukon histogrammin');
  ok(norm(await page.locator('#heroChart').locator('xpath=preceding-sibling::h2').textContent()).includes('kaikki jakajat'),
    'pääkaavion otsikko kertoo varanäkymästä');
  ok(await page.locator('#savingsChart svg path.hbar').count() >= 4, 'kk-säästö piirtyy histogrammina');
  ok(await page.locator('#stocksChart svg path.hbar').count() >= 3, 'osakepaino piirtyy histogrammina');
  // Trimmaus: osakepainon data alkaa 60 %:sta → vasin nimiö ≥ 50 % (ei tyhjää alkua)
  const stockTicks = await page.locator('#stocksChart svg text').allTextContents();
  ok(!stockTicks.some((t) => norm(t).startsWith('0 %')), 'osakepainon tyhjä alku trimmattu', stockTicks.join(','));
  ok(stockTicks.some((t) => /%$/.test(norm(t).trim())), 'y-akselin %-ruudukko piirtyy');
  ok(await page.locator('.an-empty').count() <= 1, 'enintään yksi tyhjäkortti (asuntolaina)', String(await page.locator('.an-empty').count()));
  const heroTake = norm(await page.locator('#heroChart ~ .an-take').textContent().catch(() => ''));
  ok(heroTake.includes('Kaikkien jakajien'), 'poimintalause koko joukosta', heroTake);
  ok(await page.locator('#heroChart').locator('xpath=preceding-sibling::h2').locator('.an-youchip').count() === 1, 'oma merkki selitteessä');

  console.log('Uudet kortit');
  ok(await page.locator('#retirePlan .an-hl-row').count() === 3, 'eläkeajan talous: kolme riviä', String(await page.locator('#retirePlan .an-hl-row').count()));
  ok(norm(await page.locator('#retirePlan').textContent()).includes('Varallisuus eläkkeelle jäädessä'), 'wAtRet näkyy');
  const rank = page.locator('#eventRank .an-share');
  ok(await rank.count() === 6, 'tapahtumaranking: kuusi riviä', String(await rank.count()));
  ok(norm(await rank.first().textContent()).includes('Asunnon osto'), 'yleisin ensin (asunto)');
  ok(norm(await rank.first().textContent()).includes('sinullakin'), 'oma tapahtuma merkitty');
  ok(norm(await page.locator('#penCoverage').textContent()).includes('kaikki'), 'työeläkekate: koko joukon rivi');

  console.log('Degeneraatiot ja meta');
  ok(await page.locator('#confDonut svg').count() === 0 && await page.locator('#confDonut .an-share').count() === 2,
    'varmuustaso palkkeina kun 95 % yhdessä siivussa');
  ok(await page.locator('#goalDonut svg').count() === 1, 'tavoitedonitsi ennallaan (jakauma tasainen)');
  ok(norm(await page.locator('#confDonut').textContent()).includes('Varmuus 95 %'), 'varmuusselite lukukelpoinen');
  ok(await page.locator('#timeline svg').count() === 0 && norm(await page.locator('#timeline').textContent()).includes('43'),
    'aikajana tekstinä yhdellä kuukaudella');
  const basis = norm(await page.locator('#anBasisNote').textContent());
  ok(basis.includes('17') && basis.includes('43'), 'basis-maininta muokatuista näkyy', basis);
  const tiles = norm(await page.locator('#anTiles').textContent());
  ok(tiles.includes('900 t€'), 'tiili: mediaani varallisuus eläkkeellä', tiles);
  ok(tiles.toLowerCase().includes('asunnon osto'), 'yleisin tapahtuma sanallisena', tiles);

  console.log('Suurennus ja hover fallback-kaaviossa');
  await page.locator('#savingsChart').locator('xpath=ancestor::section').locator('.an-zoom').click();
  ok(await page.locator('.an-light svg').count() >= 1, 'suurennos avautuu klooniin');
  const box = await page.locator('.an-light svg').first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.7);
  await page.waitForTimeout(120);
  ok(await page.locator('.an-tip').isVisible().catch(() => false), 'hover toimii suurennoksessa');
  await page.keyboard.press('Escape');

  ok(errors.length === 0, 'ei sivuvirheitä', errors.join('; '));
  await browser.close();
  server.kill();
  process.exit(failed ? 1 : 0);
})();
