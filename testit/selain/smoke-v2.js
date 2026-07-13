// V2-smoke: valintamalli, bisektioraahaus, chippi, näppäimistö, rajoitteet
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

  // Käyräpisteen client-koordinaatit iässä age
  const curvePt = (age) => page.evaluate((a) => {
    const r = document.getElementById('chart').getBoundingClientRect();
    const m = Math.round((a - sim.a0) * 12);
    return { x: r.left + scaleX(a), y: r.top + scaleY(sim.exp[m]) };
  }, age);

  // Odota worker-tarkennuksen laskeutuminen ennen geometriaan nojaavia askeleita
  // (käyttäjä näkee saman: skaala asettuu ennen seuraavaa tarttumista)
  const settleMc = async () => {
    await page.waitForFunction(() => sim && sim.mcPaths === 5000 && !sim.successStale, null, { timeout: 5000 }).catch(() => {});
  };

  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-tour-done', '1'); }); // kierros testataan erikseen
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // Ensivierailu avaa piirtopöydän automaattisesti (V4) — palataan normaalitilaan
  if (await page.evaluate(() => document.body.classList.contains('fs'))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Piirtopöytä auki; opastus näkyy (ei vielä yhtään suoritettua vetoa)
  await page.evaluate(() => localStorage.removeItem('vp-draw-tutored'));
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.body.classList.contains('fs')), 'piirtopöytä auki (F)');
  ok((await page.locator('.guide').count()) >= 2, 'haamunuoliopasteet näkyvät');
  ok((await page.locator('.guide-handle').count()) === 1, 'tartuntakahva käyrällä');
  ok((await page.locator('.hit').count()) >= 3, 'osumakerrokset piirretty');

  // 1) Kertymäsegmentti: napautus valitsee — ei vielä säädä
  await settleMc();
  const p47 = await curvePt(47);
  await page.mouse.click(p47.x, p47.y);
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => drawState.sel && drawState.sel.kind === 'acc'), 'napautus valitsee kertymäsegmentin');
  ok(await page.evaluate(() => !document.getElementById('dchip').hidden), 'chippi näkyy valinnassa');
  const monthly0 = await page.evaluate(() => state.monthly);
  ok(monthly0 === 1000, 'säästö ennallaan valinnan jälkeen', String(monthly0));

  // 2) Raahaus valitulla: käyrä seuraa, chippi kertoo parametrin, HUD stale
  await page.mouse.move(p47.x, p47.y);
  await page.mouse.down();
  await page.mouse.move(p47.x, p47.y - 30, { steps: 4 });
  const midStale = await page.evaluate(() => sim.successStale === true);
  const midChip = await page.evaluate(() => document.getElementById('dchip').textContent);
  await page.mouse.move(p47.x, p47.y - 80, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  ok(midStale, 'raahauksen framet kevyitä (successStale)');
  ok(midChip.includes('Kuukausisäästö'), 'chippi näyttää muuttuvan parametrin', midChip);
  const monthly1 = await page.evaluate(() => state.monthly);
  ok(monthly1 > monthly0, 'ylösveto kasvattaa kuukausisäästöä', `${monthly0} → ${monthly1}`);
  ok(monthly1 % 10 === 0, 'snap 10 €/kk', String(monthly1));
  ok(await page.evaluate(() => sim.successStale === false), 'täysi laskenta irrotuksessa');
  ok(await page.evaluate(() => document.getElementById('monthly').value == state.monthly), 'syöttökenttä synkassa');

  // 3) Ctrl+Z kumoaa koko vedon yhtenä askeleena
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => state.monthly) === monthly0, 'Ctrl+Z palauttaa vedon kerralla');

  // 4) Rajoite: veto pohjaan → säästö 0 ja chippi selittää
  await settleMc();
  const pLow = await curvePt(47);
  await page.mouse.click(pLow.x, pLow.y);
  await page.waitForTimeout(150);
  await page.mouse.move(pLow.x, pLow.y);
  await page.mouse.down();
  await page.mouse.move(pLow.x, pLow.y + 400, { steps: 8 });
  const chipWarn = await page.evaluate(() => ({
    warn: document.getElementById('dchip').classList.contains('warn'),
    txt: document.getElementById('dchip').textContent,
  }));
  await page.mouse.up();
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => state.monthly) === 0, 'pohjaveto pysähtyy nollaan');
  ok(chipWarn.warn && chipWarn.txt.includes('negatiivinen'), 'rajoitechippi selittää syyn', chipWarn.txt);
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);

  // 5) Eläkeikäviiva: eläkemerkin napautus valitsee viivan, veto siirtää ikää
  await settleMc();
  const retAge0 = await page.evaluate(() => state.events.find((e) => e.type === 'retirement').age);
  const marker = page.locator('g.marker').nth(2); // retirement @ 65
  let mb = await marker.boundingBox();
  await page.mouse.click(mb.x + mb.width / 2, mb.y + 10);
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => drawState.sel && drawState.sel.kind === 'retline'), 'eläkemerkki valitsee eläkeikäviivan');
  ok(await page.evaluate(() => state.events.find((e) => e.type === 'retirement').age) === retAge0, 'valinta ei siirrä ikää');
  mb = await marker.boundingBox();
  await page.mouse.move(mb.x + mb.width / 2, mb.y + 10);
  await page.mouse.down();
  await page.mouse.move(mb.x + mb.width / 2 - 90, mb.y + 10, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const retAge1 = await page.evaluate(() => state.events.find((e) => e.type === 'retirement').age);
  ok(retAge1 < retAge0 && retAge1 === Math.round(retAge1), 'viivan veto siirtää eläkeikää vuosisnapilla', `${retAge0} → ${retAge1}`);

  // 6) Nostosegmentti: valinta + ylösveto kasvattaa kuukausituloa
  await settleMc();
  const wdAge = (retAge1 + 90) / 2;
  const wd0 = await page.evaluate(() => state.events.find((e) => e.type === 'retirement').withdrawal);
  const pWd = await curvePt(wdAge);
  await page.mouse.click(pWd.x, pWd.y);
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => drawState.sel && drawState.sel.kind === 'wd'), 'nostosegmentti valittavissa');
  await page.mouse.move(pWd.x, pWd.y);
  await page.mouse.down();
  await page.mouse.move(pWd.x, pWd.y + 60, { steps: 6 }); // alaspäin = varallisuus laskee = suurempi nosto
  await page.mouse.up();
  await page.waitForTimeout(300);
  const wd1 = await page.evaluate(() => state.events.find((e) => e.type === 'retirement').withdrawal);
  ok(wd1 > wd0, 'alasveto nostovaiheessa kasvattaa kuukausituloa', `${wd0} → ${wd1}`);

  // 7) Näppäimistö: Tab kiertää, nuolet säätävät, Esc purkaa kerroksittain
  await page.keyboard.press('Escape'); // valinta pois
  await page.waitForTimeout(100);
  ok(await page.evaluate(() => drawState.sel === null), 'Esc purkaa valinnan');
  ok(await page.evaluate(() => document.body.classList.contains('fs')), 'piirtopöytä yhä auki');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  const sel1 = await page.evaluate(() => drawState.sel && drawState.sel.kind);
  ok(sel1 === 'event', 'Tab valitsee ensimmäisen kohteen ikäjärjestyksessä', sel1);
  ok((await page.locator('.age-line').count()) === 1, 'valitulla kohteella pystykatkoviiva');
  ok((await page.locator('.age-tick').count()) === 1, 'ikä näkyy korostettuna x-akselilla');
  const homeAge0 = await page.evaluate(() => state.events.find((e) => e.type === 'home').age);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  const homeAge1 = await page.evaluate(() => state.events.find((e) => e.type === 'home').age);
  ok(homeAge1 === homeAge0 + 1, 'nuoli oikealle siirtää ikää +1 v', `${homeAge0} → ${homeAge1}`);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(500);
  const homeAmt = await page.evaluate(() => state.events.find((e) => e.type === 'home').amount);
  ok(homeAmt === -219000, 'nuoli ylös kasvattaa summaa snap-askeleen', String(homeAmt));
  const live = await page.evaluate(() => document.getElementById('ariaLive').textContent);
  ok(live.length > 0, 'aria-live kuuluttaa muutokset', live);

  // 8) Delete vaatii vahvistuksen
  await page.keyboard.press('Delete');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => state.events.some((e) => e.type === 'home')), 'ensimmäinen Delete ei vielä poista');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !state.events.some((e) => e.type === 'home')), 'toinen Delete poistaa');
  await page.waitForTimeout(700);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => state.events.some((e) => e.type === 'home')), 'poisto kumoutuu');

  // 9) Enter avaa muokkausdialogin (poisto nollasi valinnan — Tab valitsee taas)
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => drawState.sel && drawState.sel.kind === 'event'), 'Tab palauttaa valinnan poiston jälkeen');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.getElementById('popover').hidden), 'Enter avaa muokkausdialogin');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.getElementById('popover').hidden), 'Esc sulkee dialogin (kerros 1)');
  ok(await page.evaluate(() => document.body.classList.contains('fs')), 'piirtopöytä yhä auki (kerros ei ohita)');

  // 10) Scrub tyhjällä: valinta pois + kohdistin liikkuu
  await page.keyboard.press('Escape'); // sel pois jos jäi
  await page.waitForTimeout(100);
  const pEmpty = await page.evaluate(() => {
    const r = document.getElementById('chart').getBoundingClientRect();
    return { x: r.left + scaleX(sim.a0 + 20), y: r.top + plot.t + 30 }; // ylhäällä, kaukana käyrästä
  });
  await page.mouse.move(pEmpty.x, pEmpty.y);
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => !document.getElementById('tooltip').hidden), 'scrub-kohdistin toimii piirtotilassa');

  // 11) Normaalitila: merkkiraahaus suoraan ilman valintaa (ei regressiota)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.body.classList.contains('fs')), 'Esc idle-tilassa poistuu piirtopöydältä');
  const carAge0 = await page.evaluate(() => state.events.find((e) => e.type === 'car').age);
  const carMarker = page.locator('g.marker').nth(1);
  const cb = await carMarker.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + 10);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 80, cb.y + 10, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const carAge1 = await page.evaluate(() => state.events.find((e) => e.type === 'car').age);
  ok(carAge1 > carAge0, 'normaalitilan merkkiraahaus ennallaan', `${carAge0} → ${carAge1}`);

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} V2-SMOKE-TESTIÄ EPÄONNISTUI` : '\nV2-smoke läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
