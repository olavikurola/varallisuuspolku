// Ero / iso muutos -tapahtuma: paletti, napautuslisäys oletuksineen (kertakulu +
// toistuva kulunlisäys), popoverin rec-kentät, kassavirtavaikutus, lainarahoitus,
// tallennus-roundtrip ja anonyymin jaon payload
'use strict';
const { chromium } = require('playwright');
const { norm } = require('./normi');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let failed = 0;
  const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-tour-done', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  if (await page.evaluate(() => document.body.classList.contains('fs'))) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // 1) Paletti: chip näkyy ja napautus lisää tapahtuman oletuksilla
  ok((await page.locator('#palette .chip[data-type="divorce"]').count()) === 1, 'Ero / iso muutos paletissa');
  await page.evaluate(() => document.querySelector('.panel .card[data-card="events"]').scrollIntoView());
  await page.locator('#palette .chip[data-type="divorce"]').click();
  await page.waitForTimeout(400);
  const ev = await page.evaluate(() => state.events.find((e) => e.type === 'divorce'));
  ok(!!ev, 'napautus lisää ero-tapahtuman');
  ok(ev && ev.amount === -20000, 'oletussumma −20 000 €', String(ev && ev.amount));
  ok(ev && ev.financing === 'cash', 'oletusrahoitus käteinen', String(ev && ev.financing));
  ok(ev && ev.recMonthly === -300 && ev.recYears === 5, 'toistuva kulunlisäys −300 €/kk 5 v', JSON.stringify(ev && [ev.recMonthly, ev.recYears]));
  const defAge = await page.evaluate(() => { const e = state.events.find((x) => x.type === 'divorce'); return { age: e.age, expected: state.ageNow + 5 }; });
  ok(defAge.age === defAge.expected, 'oletusikä = nykyikä + 5', JSON.stringify(defAge));

  // 2) Popover aukesi ja rec-kentät ovat muokattavissa
  ok(await page.evaluate(() => !document.getElementById('popover').hidden), 'muokkausdialogi aukesi');
  ok(await page.evaluate(() => { const i = document.getElementById('pv-recm'); return !!i && Number(i.value) === -300; }), 'toistuva summa näkyy popoverissa');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 3) Aikajana: rivi näkyy toistuvan kulun kera
  const tl = norm(await page.evaluate(() => document.getElementById('eventList').textContent));
  ok(/Ero \/ iso muutos/.test(tl), 'aikajanarivi näkyy');
  ok(/Ero \/ iso muutos\s*toistuva/.test(tl), 'toistuva-merkintä kuvauksessa', tl.slice(0, 200));

  // 4) Kassavirta: ero pienentää loppuvarallisuutta, ja sekä kertakulu että
  // toistuva osuus vaikuttavat (rec pois → pudotus pienempi)
  const w = await page.evaluate(() => {
    const st = JSON.parse(JSON.stringify(serialize()));
    const base = JSON.parse(JSON.stringify(st));
    base.events = base.events.filter((e) => e.type !== 'divorce');
    const noRec = JSON.parse(JSON.stringify(st));
    const d = noRec.events.find((e) => e.type === 'divorce');
    delete d.recMonthly; delete d.recYears;
    return { full: simulate(st).wEnd, noRec: simulate(noRec).wEnd, base: simulate(base).wEnd };
  });
  ok(w.full < w.noRec && w.noRec < w.base, 'kertakulu ja toistuva kulu molemmat pienentävät loppuvarallisuutta',
    JSON.stringify({ full: Math.round(w.full), noRec: Math.round(w.noRec), base: Math.round(w.base) }));

  // 5) Lainarahoitus: velkasaldo kasvaa summa − käsiraha -määrällä tapahtuma-
  // kuukautena (delta käteisversioon — oletussuunnitelman asuntolaina alkaa
  // samana kuukautena, joten absoluuttinen saldo ei kelpaa mittariksi)
  const loan = await page.evaluate(() => {
    const cash = JSON.parse(JSON.stringify(serialize()));
    const st = JSON.parse(JSON.stringify(cash));
    const d = st.events.find((e) => e.type === 'divorce');
    d.financing = 'loan'; d.down = 4000; d.rate = 4.5; d.years = 10;
    const m0 = Math.round((d.age - st.ageNow) * 12);
    return { delta: simulate(st).debt[m0] - simulate(cash).debt[m0] };
  });
  ok(Math.abs(loan.delta - 16000) < 1, 'lainarahoitus: velkaa +16 000 € (summa − käsiraha)', String(Math.round(loan.delta)));

  // 6) Tallennus-roundtrip: applySaved säilyttää tapahtuman kenttineen
  const rt = await page.evaluate(() => {
    const snap = JSON.parse(JSON.stringify(serialize()));
    applySaved(snap);
    const e = state.events.find((x) => x.type === 'divorce');
    return e && { amount: e.amount, recMonthly: e.recMonthly, recYears: e.recYears, financing: e.financing || null };
  });
  // applySaved normalisoi käteisen pois (financing puuttuu = käteinen)
  ok(rt && rt.amount === -20000 && rt.recMonthly === -300 && rt.recYears === 5 && rt.financing !== 'loan',
    'applySaved-roundtrip säilyttää kentät', JSON.stringify(rt));

  // 7) Anonyymi jako: divorce mukana payloadissa toistuvine kuluineen
  const pl = await page.evaluate(() => {
    const p = buildDonationPayload(state, sim);
    return p.events.find((e) => e.type === 'divorce');
  });
  ok(pl && pl.amount === -20000 && pl.recMonthly === -300 && pl.recYears === 5, 'lahjoituspaketti sisältää tapahtuman', JSON.stringify(pl));

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
