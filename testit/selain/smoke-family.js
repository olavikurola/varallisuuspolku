// Perhevirta v1 + Säästökyky-apuri: chipit, profiilivaihto, yhteiskäyrä,
// perhe-MC, #f=-linkki, poisto; apuri, säästöaste, eläkeoletus, Sivutulo
'use strict';
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let failed = 0;
  const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-tour-done', '1'); localStorage.setItem('vp-pro-seen', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // --- Säästökyky-apuri ---
  ok(await page.locator('#saverLink').isVisible(), 'apurilinkki näkyy huomaamattomana');
  ok(await page.evaluate(() => document.getElementById('saverBox').hidden), 'apurilaatikko kiinni oletuksena');
  await page.click('#saverLink');
  await page.fill('#savIncome', '4200');
  await page.dispatchEvent('#savIncome', 'input');
  await page.fill('#savExpenses', '2800');
  await page.dispatchEvent('#savExpenses', 'input');
  await page.waitForTimeout(200);
  const note = (await page.evaluate(() => document.getElementById('savNote').textContent)).replace(/[  ]/g, ' ');
  ok(note.includes('1 400'), 'säästövara lasketaan', note);
  ok(/säästöaste\s*\d+\s*%/.test(note.replace(/ /g, ' ')), 'säästöaste näkyy', note);
  await page.click('#savApply');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => state.monthly === 1400), 'säästövara kirjautuu kuukausisäästöksi');

  // eläketarpeen oletus menoista: poista eläke ja lisää uudelleen
  await page.evaluate(() => {
    state.events = state.events.filter((e) => e.type !== 'retirement');
    addEvent('retirement', 65);
    closePopover();
  });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => state.events.find((e) => e.type === 'retirement').withdrawal === 2800),
    'eläketarpeen oletus = nykyiset menot');

  // Sivutulo-chip paletissa
  ok((await page.locator('#palette .chip', { hasText: 'Sivutulo' }).count()) === 1, 'Sivutulo paletissa');
  await page.evaluate(() => { addEvent('sidegig', 40); closePopover(); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => {
    const e = state.events.find((x) => x.type === 'sidegig');
    return e && e.recMonthly === 300;
  }), 'Sivutulo on toistuva plus-erä');
  await page.evaluate(() => { state.events = state.events.filter((x) => x.type !== 'sidegig'); renderAll(); });

  // --- Perhevirta ---
  ok((await page.locator('#familyChips .fam-add').count()) === 1, 'yksin-tilassa vain pieni ＋-chip');
  const soloP = await page.evaluate(() => sim.successProb);
  await page.click('#familyChips .fam-add');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => familyOn() && family.persons.length === 2), 'puoliso lisätty');
  ok(await page.evaluate(() => family.active === 1), 'vaihto puolisoon lisättäessä');
  ok((await page.locator('#familyChips .fam-chip').count()) === 2, 'henkilöchipit näkyvät');

  // puolison muokkaus ei vuoda henkilöön 1
  await page.fill('#monthly', '600');
  await page.dispatchEvent('#monthly', 'input');
  await page.fill('#ageNow', '28');
  await page.dispatchEvent('#ageNow', 'input');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => state.monthly === 600 && state.ageNow === 28), 'puolison tiedot muokattu');
  await page.click('#familyChips .fam-chip:nth-child(1)');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => state.monthly === 1400 && family.active === 0), 'henkilön 1 tiedot koskemattomat');
  await page.click('#familyChips .fam-chip:nth-child(2)');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => state.monthly === 600), 'vaihto säilyttää puolison muutokset');
  await page.click('#familyChips .fam-chip:nth-child(1)');
  await page.waitForTimeout(400);

  // yhteiskäyrä ja legenda
  ok(await page.evaluate(() => !document.getElementById('legendFamily').hidden), 'perhelegenda näkyy');
  ok(await page.evaluate(() => {
    const os = getOtherSim();
    if (!os) return false;
    const tot = householdExp([sim, os]);
    return Math.abs(tot[0] - (sim.exp[0] + os.exp[0])) < 1;
  }), 'yhteiskäyrä = summa');

  // perheen onnistumis-% workerista
  await page.waitForFunction(() => jointMc && jointMc.successProb != null, null, { timeout: 10000 }).catch(() => {});
  const jp = await page.evaluate(() => jointMc && jointMc.successProb);
  ok(jp != null && jp > 0 && jp <= 1, 'perheen onnistumis-% laskettu', String(jp));
  ok(jp <= soloP + 1e-9, 'perheen onnistuminen ≤ henkilön 1', `${jp} vs ${soloP}`);
  const statTxt = await page.evaluate(() => document.getElementById('stats').textContent);
  ok(statTxt.includes('Perheen onnistumis-%'), 'perhekortti tunnusluvuissa');

  // siirrot: pari syntyy, peilautuu ja siivoutuu
  ok((await page.locator('#palette .chip', { hasText: 'Siirto puolisolle' }).count()) === 1, 'siirtochipit paletissa perhetilassa');
  await page.evaluate(() => { addEvent('transferOut', 45); closePopover(); });
  await page.waitForTimeout(400);
  const pair = await page.evaluate(() => {
    const me = state.events.find((e) => e.type === 'transferOut');
    const ot = me && family.persons[otherIdx()].data.events.find((e) => e.type === 'transferIn' && e.linkId === me.linkId);
    return { me: !!me, ot: !!ot, sum: me && ot ? me.amount + ot.amount : null };
  });
  ok(pair.me && pair.ot && pair.sum === 0, 'siirto syntyy parina (summat peilikuvat)', JSON.stringify(pair));
  await page.evaluate(() => { state.events.find((e) => e.type === 'transferOut').age = 50; renderAll(); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => {
    const me = state.events.find((e) => e.type === 'transferOut');
    const ot = family.persons[otherIdx()].data.events.find((x) => x.linkId === me.linkId);
    return ot && ot.age === 50 - state.ageNow + family.persons[otherIdx()].data.ageNow;
  }), 'iän muutos peilautuu samaan kalenterihetkeen');
  ok(await page.evaluate(() => !buildDonationPayload(state, sim).events.some((e) => e.type && e.type.startsWith('transfer'))),
    'siirrot eivät päädy vertailudataan');
  await page.evaluate(() => { state.events = state.events.filter((e) => e.type !== 'transferOut'); renderAll(); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !family.persons[otherIdx()].data.events.some((e) => e.type === 'transferIn')),
    'poisto siivoaa parin puolisolta');

  // Suunnitelmani: perheosio + leskiturva; Vuoristo-näkymä
  await page.evaluate(() => openSummary());
  await page.waitForTimeout(500);
  const sumT = await page.evaluate(() => document.getElementById('sumSheet').textContent);
  ok(sumT.includes('Perheen suunnitelma'), 'Suunnitelmani sisältää perheosion');
  ok(sumT.includes('Leskiturvatarkastelu'), 'leskiturvatarkastelu mukana');
  await page.evaluate(() => closeSummary());
  await page.evaluate(() => document.getElementById('famMountainBtn').click());
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.getElementById('mountainModal').hidden), 'Perhevuoristo avautuu');
  ok((await page.locator('#mountainSvg path').count()) === 3, 'kolme virtaa vuoristossa');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // #f=-perhelinkki roundtrip
  const url = await page.evaluate(() => makeShareUrl());
  ok(url.includes('#f='), 'perhelinkki käyttää omaa etuliitettä (versiovahti)');
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page2.goto(url.replace(/^https?:\/\/[^/]+/, 'http://localhost:8123'), { waitUntil: 'networkidle' });
  await page2.waitForTimeout(700);
  ok(await page2.evaluate(() => familyOn() && family.persons.length === 2), 'perhelinkki avaa molemmat henkilöt');
  ok(await page2.evaluate(() => family.persons[1].data.monthly === 600), 'puolison tiedot linkissä');
  await page2.close();

  // vanha #s=-yksilölinkki toimii yhä
  const solo = await page.evaluate(() => btoa(unescape(encodeURIComponent(JSON.stringify(serialize())))));
  const page3 = await browser.newPage();
  await page3.goto('http://localhost:8123/#s=' + solo, { waitUntil: 'networkidle' });
  await page3.waitForTimeout(600);
  ok(await page3.evaluate(() => state.monthly === 1400), 'vanha #s=-linkki toimii ennallaan');
  await page3.close();

  // piirtopöytä perheessä: aktiivisen henkilön vedot toimivat, perhekäyrät piirtyvät
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.body.classList.contains('fs')), 'piirtopöytä aukeaa perhetilassa');
  // skaala asettuu ennen geometriaan nojaavia klikkejä
  await page.waitForFunction(() => sim && sim.mcPaths === 5000 && !sim.successStale, null, { timeout: 8000 }).catch(() => {});
  const m0 = await page.evaluate(() => state.monthly);
  const pC = await page.evaluate(() => {
    const r = document.getElementById('chart').getBoundingClientRect();
    const m = Math.round((47 - sim.a0) * 12);
    return { x: r.left + scaleX(47), y: r.top + scaleY(sim.exp[m]) };
  });
  await page.mouse.click(pC.x, pC.y);
  await page.waitForTimeout(200);
  await page.mouse.move(pC.x, pC.y);
  await page.mouse.down();
  await page.mouse.move(pC.x, pC.y - 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => state.monthly) > m0, 'käyrän veto toimii perhetilassa');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // perheratkaisija: tartu yhteiskäyrään — molempien säästöt joustavat samalla
  ok(await page.evaluate(() => document.getElementById('hudMetrics').textContent.includes('Perheen onnistumis-%')),
    'HUD näyttää perheen onnistumisen');
  const mMe0 = await page.evaluate(() => state.monthly);
  const mOt0 = await page.evaluate(() => family.persons[otherIdx()].data.monthly);
  const pT = await page.evaluate(() => {
    const r = document.getElementById('chart').getBoundingClientRect();
    const m = Math.round((50 - sim.a0) * 12);
    return { x: r.left + scaleX(50), y: r.top + scaleY(famTotalCache[m]) };
  });
  await page.mouse.click(pT.x, pT.y);
  await page.waitForTimeout(250);
  ok(await page.evaluate(() => drawState.sel && drawState.sel.kind === 'famtotal'), 'yhteiskäyrä valittavissa piirtopöydällä');
  await page.mouse.move(pT.x, pT.y);
  await page.mouse.down();
  await page.mouse.move(pT.x, pT.y - 60, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const mMe1 = await page.evaluate(() => state.monthly);
  const mOt1 = await page.evaluate(() => family.persons[otherIdx()].data.monthly);
  ok(mMe1 > mMe0 && (mMe1 - mMe0) === (mOt1 - mOt0), 'perheratkaisija joustaa molempia yhtä paljon',
    `minä ${mMe0}→${mMe1}, puoliso ${mOt0}→${mOt1}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // poisto: kaksi napautusta, paluu yksin-tilaan
  await page.click('#familyChips .fam-del');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => familyOn()), 'ensimmäinen ✕ ei vielä poista');
  await page.click('#familyChips .fam-del');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !familyOn() && family === null), 'toinen ✕ palauttaa yksin-tilaan');
  ok(await page.evaluate(() => !!document.querySelector('#familyChips .fam-add')), '＋-chip palaa');
  ok(await page.evaluate(() => document.getElementById('legendFamily').hidden), 'perhelegenda piiloutuu');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} PERHE-SMOKE-TESTIÄ EPÄONNISTUI` : '\nPerhe-smoke läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
