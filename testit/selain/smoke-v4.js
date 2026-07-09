// V4-smoke: ensivierailuflow, palaava käyttäjä, jakolinkki→piirtopöytä, copy
'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let failed = 0;
  const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

  // 1) Ensivierailu: piirtopöytä aukeaa esimerkillä, pulssivihje näkyy
  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => document.body.classList.contains('fs')), 'ensivierailu avaa piirtopöydän');
  ok(await page.evaluate(() => !document.getElementById('drawHint').hidden), 'pulssivihje näkyy');
  ok(await page.evaluate(() => state.events.length >= 3), 'esimerkkisuunnitelma ladattu');

  // Aloitusopasteet: haamunuolet näkyvät ennen ensimmäistäkään klikkausta,
  // väistyvät tartunnasta ja kuittautuvat pysyvästi vasta suoritetusta vedosta
  ok((await page.locator('.guide').count()) >= 2, 'haamunuolet näkyvät heti avattaessa');
  const pC = await page.evaluate(() => {
    const r = document.getElementById('chart').getBoundingClientRect();
    const m = Math.round((47 - sim.a0) * 12);
    return { x: r.left + scaleX(47), y: r.top + scaleY(sim.exp[m]) };
  });
  await page.mouse.click(pC.x, pC.y); // tartunta → opasteet pois
  await page.waitForTimeout(250);
  ok((await page.locator('.guide').count()) === 0, 'tartunta piilottaa opasteet');
  ok(await page.evaluate(() => document.getElementById('drawHint').hidden), 'ohjerivi piiloutuu samalla');
  // ilman suoritettua vetoa opastus palaa seuraavalla avauksella
  await page.keyboard.press('Escape'); // valinta pois
  await page.keyboard.press('Escape'); // ulos
  await page.waitForTimeout(300);
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  ok((await page.locator('.guide').count()) >= 2, 'opastus palaa, kunnes veto on suoritettu');
  // suoritettu veto kuittaa tutoriaalin pysyvästi
  await page.mouse.click(pC.x, pC.y);
  await page.waitForTimeout(200);
  await page.mouse.move(pC.x, pC.y);
  await page.mouse.down();
  await page.mouse.move(pC.x, pC.y - 50, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); // valinta pois
  await page.keyboard.press('Escape'); // ulos
  await page.waitForTimeout(300);
  await page.keyboard.press('f');
  await page.waitForTimeout(400);
  ok((await page.locator('.guide').count()) === 0, 'suoritettu veto kuittaa opastuksen pysyvästi');

  // Esc paljastaa koko sivun — SEO-sisältö on DOMissa koko ajan
  ok(await page.evaluate(() => !!document.querySelector('.panel .card[data-card="basics"]')), 'sivun sisältö DOMissa piirtotilassa (SEO)');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.body.classList.contains('fs')), 'Esc paljastaa koko sivun');
  ok(await page.locator('.panel').isVisible(), 'paneeli näkyy poistumisen jälkeen');

  // 2) Palaava käyttäjä: normaalinäkymä
  await page.evaluate(() => { state.monthly = 1200; renderAll(); });
  await page.waitForTimeout(700); // tallennus-debounce
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => !document.body.classList.contains('fs')), 'palaava käyttäjä saa normaalinäkymän');
  ok(await page.evaluate(() => state.monthly === 1200), 'oma suunnitelma säilyi');

  // 3) Jakolinkki avaa piirtopöydän linkin suunnitelmalla
  const url = await page.evaluate(() => {
    state.monthly = 777;
    return makeShareUrl();
  });
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page2.goto(url.replace(/^https?:\/\/[^/]+/, 'http://localhost:8123'), { waitUntil: 'networkidle' });
  await page2.waitForTimeout(600);
  ok(await page2.evaluate(() => document.body.classList.contains('fs')), 'jakolinkki avaa piirtopöydän');
  ok(await page2.evaluate(() => state.monthly === 777), 'linkin suunnitelma käytössä', String(await page2.evaluate(() => state.monthly)));
  await page2.close();

  // 4) Copy: title molemmilla nimillä
  const title = await page.title();
  ok(title.includes('Varallisuuspolku') && title.includes('Wealth Path'), 'title: Varallisuuspolku · Wealth Path', title);
  const og = await page.evaluate(() => document.querySelector('meta[property="og:title"]').content);
  ok(og.includes('Wealth Path'), 'og:title päivitetty', og);

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} V4-SMOKE-TESTIÄ EPÄONNISTUI` : '\nV4-smoke läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
