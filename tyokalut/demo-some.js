// Somedemovideo (~45 s, 1280×720): kojelauta → piirtopöydän vedot →
// profiilivertailu (uusi!) → Tulkki (mock-vastaus; vertailutaulukon luvut
// laskee AITO moottori asiakaspäässä) → lopputeksti.
// Tulkki mockataan reitityksellä — ei API-kutsuja eikä kustannuksia.
'use strict';
const { chromium } = require('playwright');

const OUT = process.env.VP_OUT || require('path').join(require('os').tmpdir(), 'vp-video');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
    serviceWorkers: 'block', // reititys ei sieppaa SW:n läpi meneviä pyyntöjä
  });

  // Mock-Tulkki: teksti + vertaile-työkalukutsu. Taulukon luvut laskee
  // asiakaspään moottori — juuri se on demottava arkkitehtuuri.
  await ctx.route('https://varallisuuspolku-data.up.railway.app/**', (route) => {
    const url = route.request().url();
    if (url.endsWith('/tulkki') && route.request().method() === 'POST') {
      const lines = [
        JSON.stringify({ delta: 'Katsotaan moottorillasi — **vertailin kolme eläkeikää** samalla suunnitelmalla. Varhaisempi eläke lyhentää säästövuosia ja pidentää nostovuosia, joten kestävä kuukausitulo joustaa alaspäin. Taulukossa tarkat luvut:' }),
        JSON.stringify({ tool: { name: 'vertaile', input: { vaihtoehdot: [
          { nimi: 'Eläke 60', muutokset: [{ kentta: 'retAge', arvo: 60 }] },
          { nimi: 'Eläke 63', muutokset: [{ kentta: 'retAge', arvo: 63 }] },
          { nimi: 'Eläke 65', muutokset: [{ kentta: 'retAge', arvo: 65 }] },
        ], selite: 'Eläkeiän vaikutus — sama suunnitelma, kolme ikää' } } }),
        JSON.stringify({ done: true, model: 'claude-haiku-4-5', usage: { in: 2100, out: 160 } }),
      ].join('\n') + '\n';
      route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines });
    } else {
      route.fulfill({ status: 404, body: '{}' });
    }
  });

  // Lavastus: kolme nimettyä suunnitelmaa + Tulkki-avain, opastukset pois
  // (paitsi piirtopöydän haamunuolet — ne kuuluvat demoon).
  await ctx.addInitScript(() => {
    try {
      localStorage.clear();
      const t = Date.now();
      const base = {
        ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 1000, savingsGrowth: 1.5,
        allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
        events: [
          { id: 1, type: 'home', age: 35, amount: -220000, financing: 'loan', down: 33000, rate: 3.5, years: 25, isAsset: true, appr: 2.0 },
          { id: 2, type: 'car', age: 45, amount: -25000, financing: 'loan', down: 5000, rate: 4.5, years: 6, isAsset: true, appr: -10.0 },
          { id: 3, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 },
        ],
      };
      const scen = JSON.parse(JSON.stringify(base));
      scen.monthly = 1400;
      scen.events[2].age = 58;
      const aiti = {
        ageNow: 58, ageEnd: 92, startCapital: 130000, monthly: 200, savingsGrowth: 0,
        allocStocks: 50, allocBonds: 35, glide: false, real: false, tax: true,
        events: [{ id: 1, type: 'retirement', age: 65, withdrawal: 2200, pension: 1700, pensionAge: 65 }],
      };
      localStorage.setItem('varallisuuspolku-v1', JSON.stringify(base));
      localStorage.setItem('vp-plans', JSON.stringify([
        { id: 'pl1', nimi: 'Oma polkuni', data: base, family: null, luotu: t, muokattu: t, alkupera: 'oma' },
        { id: 'pl2', nimi: 'Skenaario: eläke 58', data: scen, family: null, luotu: t, muokattu: t, alkupera: 'kopio' },
        { id: 'pl3', nimi: 'Äiti', data: aiti, family: null, luotu: t, muokattu: t, alkupera: 'linkki' },
      ]));
      localStorage.setItem('vp-active', 'pl1');
      for (const k of ['vp-tour-done', 'vp-autotour-off', 'vp-ramp-done', 'vp-tulkki-intro', 'vp-veto-vihje']) localStorage.setItem(k, '1');
      localStorage.setItem('vp-tulkki-key', 'demo');
      localStorage.setItem('vp-donate-v1', JSON.stringify({ declined: true }));
    } catch (e) {}
    // Feikkikursori: tallenne ei näytä oikeaa osoitinta
    addEventListener('DOMContentLoaded', () => {
      const c = document.createElement('div');
      c.id = 'demoCursor';
      c.style.cssText = 'position:fixed;z-index:99999;width:22px;height:22px;border-radius:50%;' +
        'border:2.5px solid rgba(45,212,191,0.95);background:rgba(45,212,191,0.25);pointer-events:none;' +
        'transform:translate(-50%,-50%);transition:width .12s,height .12s;left:-50px;top:-50px;' +
        'box-shadow:0 0 12px rgba(45,212,191,0.5)';
      document.body.appendChild(c);
      const mv = (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; };
      document.addEventListener('mousemove', mv, true);
      document.addEventListener('pointermove', mv, true);
      document.addEventListener('mousedown', () => { c.style.width = '30px'; c.style.height = '30px'; c.style.background = 'rgba(45,212,191,0.45)'; }, true);
      document.addEventListener('mouseup', () => { c.style.width = '22px'; c.style.height = '22px'; c.style.background = 'rgba(45,212,191,0.25)'; }, true);
    });
  });

  const page = await ctx.newPage();
  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof sim !== 'undefined' && sim && sim.mcPaths === 5000, null, { timeout: 9000 }).catch(() => {});

  /* 0) Otsikkokortti — valkoinen latausruutu leikataan pois tätä edeltä,
     joten videon (ja feedin pysäytyskuvan) ensimmäinen kuva on tämä. */
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'introCard';
    d.style.cssText = 'position:fixed;inset:0;z-index:100000;display:grid;place-items:center;' +
      'background:#0a0e1a;transition:opacity .6s';
    d.innerHTML = '<div style="text-align:center;font-family:system-ui,sans-serif">' +
      '<div style="font-size:44px;font-weight:800;letter-spacing:-0.5px;color:#e8edf8">Varallisuus<span style="color:#2dd4bf">polku</span></div>' +
      '<div style="margin-top:12px;font-size:20px;color:#9fb0d8">Näe, riittävätkö rahasi koko elämäksi</div>' +
      '<div style="margin-top:20px;font-size:14.5px;color:#6b7ba4">Vedä käyrää · vertaile suunnitelmia · kysy Tulkilta</div></div>';
    document.body.appendChild(d);
  });
  await page.waitForTimeout(2800);
  await page.evaluate(() => { document.getElementById('introCard').style.opacity = '0'; });
  await page.waitForTimeout(800);
  await page.evaluate(() => { document.getElementById('introCard').remove(); });
  await page.waitForTimeout(400);

  /* 1) Kojelauta: tooltip-pyyhkäisy — luvut elävät iän mukana */
  const box = await page.locator('#chartWrap').boundingBox();
  const y = box.y + box.height * 0.55;
  await page.mouse.move(box.x + box.width * 0.15, y);
  for (let i = 0; i <= 22; i++) {
    await page.mouse.move(box.x + box.width * (0.15 + 0.6 * (i / 22)), y, { steps: 2 });
    await page.waitForTimeout(45);
  }
  await page.waitForTimeout(600);

  /* 2) Piirtopöytä: käyrän veto ylös + eläkeikä 65→60 */
  await page.click('#fsOpen');
  await page.waitForTimeout(1400); // haamunuolet ehtivät näkyä

  const p = await page.evaluate(() => {
    const r = document.getElementById('chart').getBoundingClientRect();
    const m = Math.round((47 - sim.a0) * 12);
    return { x: r.left + scaleX(47), y: r.top + scaleY(sim.exp[m]) };
  });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(600);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(p.x, p.y - i * 4, { steps: 2 });
    await page.waitForTimeout(90);
  }
  await page.mouse.up();
  await page.waitForTimeout(1500); // HUD tarkentuu

  const marker = page.locator('g.marker').nth(2);
  let mb = await marker.boundingBox();
  await page.mouse.click(mb.x + mb.width / 2, mb.y + 10);
  await page.waitForTimeout(500);
  mb = await marker.boundingBox();
  await page.mouse.move(mb.x + mb.width / 2, mb.y + 10);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(mb.x + mb.width / 2 - i * 6, mb.y + 10, { steps: 2 });
    await page.waitForTimeout(85);
  }
  await page.mouse.up();
  await page.waitForTimeout(1700);
  // Ensimmäinen Esc poistaa valinnan, toinen sulkee piirtopöydän
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  if (await page.evaluate(() => document.body.classList.contains('fs'))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(500);

  /* 3) Profiilit: suunnitelmakoti → kaksi vertailuun → rinnakkain */
  await page.click('#summaryBtn');
  await page.waitForTimeout(1600); // rivit + tunnusluvut täyttyvät
  const rows = page.locator('.ph-row');
  await rows.nth(2).hover();
  await page.waitForTimeout(500);
  await rows.nth(0).locator('.ph-check input').check();
  await page.waitForTimeout(500);
  await rows.nth(1).locator('.ph-check input').check();
  await page.waitForTimeout(900); // vertailuliuska
  await page.click('.ph-cmp-open');
  await page.waitForTimeout(2200); // haamukäyrä + pilleri + deltat

  /* 4) Tulkki: kysymys → vastaus + moottorin vertailutaulukko */
  await page.click('.tk-handle');
  await page.waitForTimeout(1100); // telakointi, graafi sovittuu
  await page.click('#tkInput');
  await page.type('#tkInput', 'Onko minulla varaa jäädä eläkkeelle jo 60-vuotiaana?', { delay: 34 });
  await page.waitForTimeout(350);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.tk-cmp', { timeout: 9000 });
  await page.waitForTimeout(5600); // katsoja ehtii lukea taulukon

  /* 5) Lopputeksti */
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:100000;display:grid;place-items:center;' +
      'background:rgba(6,10,20,0.88);backdrop-filter:blur(6px);opacity:0;transition:opacity .6s';
    d.innerHTML = '<div style="text-align:center;font-family:system-ui,sans-serif">' +
      '<div style="font-size:40px;font-weight:800;letter-spacing:-0.5px;color:#e8edf8">Varallisuus<span style="color:#2dd4bf">polku</span></div>' +
      '<div style="margin-top:10px;font-size:19px;color:#9fb0d8">Näe, riittävätkö rahasi koko elämäksi</div>' +
      '<div style="margin-top:22px;font-size:16px;color:#2dd4bf;font-weight:700">varallisuuspolku.com</div>' +
      '<div style="margin-top:8px;font-size:13.5px;color:#6b7ba4">Ilmainen · Ei rekisteröitymistä · Kaikki data omassa selaimessasi</div></div>';
    document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = '1'; });
  });
  await page.waitForTimeout(3000);

  await ctx.close();
  const vid = await page.video().path();
  console.log('video:', vid);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
