// V3-smoke: tavoitepisteet — lisäys, vajeet, persentiili, raahaus, Ratkaise,
// tiukin sitoo, jakolinkki-roundtrip, anonyymin jaon payload, conf-moodi
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
  const settleMc = async () => {
    await page.waitForFunction(() => sim && sim.mcPaths === 5000 && !sim.successStale, null, { timeout: 5000 }).catch(() => {});
  };

  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // Ensivierailu avaa piirtopöydän automaattisesti (V4) — palataan normaalitilaan
  if (await page.evaluate(() => document.body.classList.contains('fs'))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // 1) Paletti: Tavoite-chip näkyy ja lisää pisteen oletuksiin (eläkeikä, pyöreä summa)
  ok((await page.locator('#palette .chip', { hasText: 'Tavoite' }).count()) === 1, 'Tavoite paletissa');
  await page.evaluate(() => document.querySelector('.panel .card[data-card="events"]').scrollIntoView());
  await page.locator('#palette .chip', { hasText: 'Tavoite' }).click();
  await page.waitForTimeout(400);
  const g1 = await page.evaluate(() => state.events.find((e) => e.type === 'goal'));
  ok(!!g1, 'napautus lisää tavoitepisteen');
  ok(g1 && g1.age === 65, 'oletusikä = eläkeikä', String(g1 && g1.age));
  ok(g1 && g1.amount % 5000 === 0 && g1.amount > 0, 'oletussumma pyöreä (5 000 € askel)', String(g1 && g1.amount));
  ok(await page.evaluate(() => !document.getElementById('popover').hidden), 'muokkausdialogi aukesi');
  await page.keyboard.press('Escape');

  // goal ei muuta kassavirtaa: wEnd sama kuin ilman pistettä
  const wEndWith = await page.evaluate(() => sim.wEnd);
  const wEndBase = await page.evaluate(() => {
    const st = JSON.parse(JSON.stringify(serialize()));
    st.events = st.events.filter((e) => e.type !== 'goal');
    return simulate(st).wEnd;
  });
  ok(Math.abs(wEndWith - wEndBase) < 1, 'piste on mittari — ei kassavirtavaikutusta');

  // 2) Piirtopöytä: tähtäin näkyy, valinta näyttää vajeet + persentiilin + toiminnot
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  await settleMc();
  ok((await page.locator('.goal-marker').count()) === 1, 'tähtäinmerkki piirtyy');
  const gpt = await page.evaluate(() => {
    const ev = state.events.find((e) => e.type === 'goal');
    const r = document.getElementById('chart').getBoundingClientRect();
    return { x: r.left + scaleX(ev.age), y: r.top + scaleY(ev.amount) };
  });
  await page.mouse.click(gpt.x, gpt.y);
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => drawState.sel && drawState.sel.kind === 'goal'), 'piste valittavissa');
  const chipTxt = await page.evaluate(() => document.getElementById('dchip').textContent);
  ok(/puuttuu|ylittyy/.test(chipTxt), 'pystyvaje näkyy', chipTxt);
  ok(/saavutat|ei saavuta/.test(chipTxt), 'vaakavaje näkyy');
  ok(/% poluista ylittää/.test(chipTxt), 'MC-ylitysosuus näkyy');
  ok(/Ratkaise/.test(chipTxt) && /Poista/.test(chipTxt), 'chipin toiminnot: Ratkaise · Muokkaa · Poista');
  ok((await page.locator('.goal-gap').count()) >= 1, 'vajeviivat piirretty valitulle');

  // 3) Raahaus: ylösveto kasvattaa summaa 5 000 € snapilla, vaakaveto ikää
  await page.mouse.move(gpt.x, gpt.y);
  await page.mouse.down();
  await page.mouse.move(gpt.x - 60, gpt.y - 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const g2 = await page.evaluate(() => state.events.find((e) => e.type === 'goal'));
  ok(g2.amount > g1.amount && g2.amount % 5000 === 0, 'pystyveto kasvattaa summaa snapilla', `${g1.amount} → ${g2.amount}`);
  ok(g2.age < g1.age && g2.age === Math.round(g2.age), 'vaakaveto siirtää ikää vuosisnapilla', `${g1.age} → ${g2.age}`);

  // 4) Ratkaise (deterministinen): odotuspolku kulkee pisteen kautta
  const monthly0 = await page.evaluate(() => state.monthly);
  await page.evaluate(() => { document.querySelector('#dchip [data-act="solve"]').click(); });
  await page.waitForTimeout(600);
  const solved = await page.evaluate(() => {
    const ev = state.events.find((e) => e.type === 'goal');
    const m = Math.round((ev.age - sim.a0) * 12);
    return { monthly: state.monthly, wealth: sim.exp[m], target: ev.amount };
  });
  ok(solved.monthly > monthly0, 'Ratkaise kasvattaa säästöä', `${monthly0} → ${solved.monthly}`);
  ok(solved.wealth >= solved.target - 100, 'polku kulkee pisteen kautta', JSON.stringify(solved));
  ok(solved.monthly % 10 === 0, 'ratkaisu snapattu 10 €/kk');

  // 5) Useampi piste: tiukin sitoo, molemmat toteutuvat
  await page.evaluate(() => {
    state.events.push({ id: 9001, type: 'goal', age: 50, amount: 100000 }); // löysä
    renderAll();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { drawSelect('goal', 9001); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.querySelector('#dchip [data-act="solve"]').click(); });
  await page.waitForTimeout(600);
  const multi = await page.evaluate(() => {
    const gs = state.events.filter((e) => e.type === 'goal');
    return gs.map((g) => {
      const m = Math.round((g.age - sim.a0) * 12);
      return { target: g.amount, wealth: Math.round(sim.exp[m]) };
    });
  });
  ok(multi.every((x) => x.wealth >= x.target - 100), 'tiukin sitoo — kaikki pisteet toteutuvat', JSON.stringify(multi));

  // 6) Jakolinkki-roundtrip: pisteet säilyvät
  const url = await page.evaluate(() => makeShareUrl());
  const page2 = await browser.newPage();
  await page2.goto(url.replace(/^https?:\/\/[^/]+/, 'http://localhost:8123'), { waitUntil: 'networkidle' });
  await page2.waitForTimeout(400);
  const goals2 = await page2.evaluate(() => state.events.filter((e) => e.type === 'goal').map((g) => ({ age: g.age, amount: g.amount })));
  ok(goals2.length === 2, 'jakolinkki kantaa pisteet', JSON.stringify(goals2));
  await page2.close();

  // 7) Anonyymi jako: pisteet mukana karkeistettuna
  const payload = await page.evaluate(() => buildDonationPayload(state, sim));
  const pGoals = payload.events.filter((e) => e.type === 'goal');
  ok(pGoals.length === 2 && pGoals.every((g) => Number.isInteger(g.age) && g.amount != null), 'payload sisältää pisteet', JSON.stringify(pGoals));

  // 8) Varmuustasomoodi: Ratkaise MC:llä workerissa, progress + tulos
  await page.evaluate(() => {
    state.events = state.events.filter((e) => e.id !== 9001);
    const ret = state.events.find((e) => e.type === 'retirement');
    ret.goal = 'manual';
    ret.conf = 0.85;
    state.monthly = 500;
    document.getElementById('monthly').value = 500;
    renderAll();
  });
  await page.waitForTimeout(300);
  const gId = await page.evaluate(() => state.events.find((e) => e.type === 'goal').id);
  await page.evaluate((id) => { drawSelect('goal', id); }, gId);
  await page.waitForTimeout(200);
  const t0 = Date.now();
  await page.evaluate(() => { document.querySelector('#dchip [data-act="solve"]').click(); });
  await page.waitForFunction(() => state.monthly !== 500, null, { timeout: 15000 });
  const confMs = Date.now() - t0;
  const confRes = await page.evaluate(() => state.monthly);
  ok(confRes > 500, 'varmuustasoratkaisu asettaa säästön', String(confRes));
  ok(confMs < 5000, `varmuustasoratkaisu < 5 s (${confMs} ms)`);
  await settleMc();
  const share85 = await page.evaluate(() => sim.goalShares && sim.goalShares[0]);
  ok(share85 >= 0.84, 'vähintään ~85 % poluista ylittää pisteen ratkaisun jälkeen', String(share85));

  // 9) Poista chipistä
  await page.evaluate((id) => { drawSelect('goal', id); }, gId);
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.querySelector('#dchip [data-act="del"]').click(); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !state.events.some((e) => e.type === 'goal')), 'Poista-toiminto poistaa pisteen');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} V3-SMOKE-TESTIÄ EPÄONNISTUI` : '\nV3-smoke läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
