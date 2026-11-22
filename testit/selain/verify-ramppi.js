'use strict';
/* Aloitusrampin eheysverifiointi: ramppi vs. kierros vs. jakolinkki vs. paluu. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const { norm } = require('./normi');

let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };

(async () => {
  const server = spawn('node', ['testit/selain/serve.js'], { cwd: require('path').join(__dirname, '..', '..') });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const freshFirstVisit = async () => {
    await page.goto('http://localhost:8123/?x=' + Math.random());
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:8123/?y=' + Math.random());
    await page.waitForFunction(() => typeof state !== 'undefined' && document.querySelectorAll('#chart path').length > 0);
    await page.waitForTimeout(900); // autostart-viive 600 ms
  };

  console.log('Ensivierailu: ramppi kierroksen sijaan');
  await freshFirstVisit();
  ok(await page.locator('.ramp').isVisible(), 'ramppi näkyy ensivierailulla');
  ok(await page.locator('#tour').isHidden(), 'kierros EI käynnisty rampin päälle');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'rampAge', 'fokus ikäkentässä');

  console.log('Validointi ja täyttö');
  await page.click('#rampGo');
  ok(!(await page.locator('#rampErr').isHidden()), 'puuttuva ikä → virheviesti, ei etenemistä');
  await page.fill('#rampAge', '34');
  await page.fill('#rampWealth', '15000');
  await page.fill('#rampMonthly', '300');
  await page.click('#rampGo');
  await page.waitForSelector('#rampOpen');
  const res = await page.evaluate(() => ({
    age: state.ageNow, w: state.startCapital, m: state.monthly,
    events: state.events.map((e) => e.type),
    goal: state.events[0].goal, pension: state.events[0].pension, retA: state.events[0].age,
  }));
  ok(res.age === 34 && res.w === 15000 && res.m === 300, 'kolme lukua tilaan', JSON.stringify(res));
  ok(res.events.length === 1 && res.events[0] === 'retirement', 'vain eläketapahtuma — ei esimerkkielämää');
  // Eläkeikä = oma alin vanhuuseläkeikä (34 v → 67,75 → 68), ei kiinteä 65
  const minA = await page.evaluate(() => Math.ceil(pensionAgeMin(34) - 1e-9));
  ok(res.goal === 'withdrawal' && res.pension === 0 && res.retA === minA && minA === 68,
    'eläke omassa alimmassa eläkeiässä (68 v), kestävä tulo ratkaistaan, työeläke 0', JSON.stringify(res));
  const statTxts = await page.locator('.ramp-stat .v').allTextContents();
  ok(statTxts.length === 2 && statTxts.every((t) => /\d/.test(t)), 'otsikkovastaus: kaksi lukua', JSON.stringify(statTxts));

  console.log('85 %:n varmuudella kestävä tulo rinnalla (worker)');
  await page.waitForFunction(() => /€/.test((document.getElementById('rampConf') || {}).textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const confTxt = norm(await page.locator('#rampConf').textContent());
  const confWd = Number((confTxt.match(/varmuudella ([\d ]+) €/) || [])[1]?.replace(/ /g, ''));
  const medWd = await page.evaluate(() => sim.solvedWithdrawal);
  ok(/^85 % varmuudella [\d ]+ €\/kk$/.test(confTxt), '85 %:n rivi täyttyy ilman kortin uudelleenrakennusta', confTxt);
  ok(confWd > 0 && confWd < medWd, '85 %:n tulo on mediaaniratkaisua pienempi', `${confWd} vs ${medWd}`);

  console.log('Tarve: kortti vastaa "riittävätkö rahat" ja onnistumis-% reagoi eläkeikään');
  await page.locator('#rampNeed').fill('700');
  await page.locator('#rampNeed').blur();
  await page.waitForFunction(() => document.querySelector('.ramp-stat .k').textContent.includes('Riittävätkö'));
  const needSt = await page.evaluate(() => ({ goal: state.events[0].goal, wd: state.events[0].withdrawal }));
  ok(needSt.goal === 'manual' && needSt.wd === 700, 'tarve kiinteäksi kuukausituloksi', JSON.stringify(needSt));
  ok(await page.locator('#rampConf').count() === 0, 'kestävän tulon 85 %:n rivi poistuu tarpeen myötä');
  await page.waitForFunction(() => sim.mcPaths >= 5000 && !sim.successStale, null, { timeout: 20000 });
  await page.waitForTimeout(200);
  const pShown = norm(await page.locator('#rampP').textContent());
  const pSim = await page.evaluate(() => Math.round(sim.successProb * 100));
  ok(pShown === `${pSim} %`, 'kortin onnistumis-% = workerin 5 000 polun tulos', `${pShown} vs ${pSim}`);
  ok(norm(await page.locator('.ramp-stat .s').first().textContent()).includes('ilman työeläkettä'), 'puuttuva työeläke kerrotaan');
  const pAt = await page.evaluate(() => {
    const r = state.events[0], a0 = r.age;
    const at = (a) => { r.age = a; r.pensionAge = Math.max(a, pensionAgeMin(state.ageNow)); return simulate(state).successProb; };
    const out = { p60: at(60), p68: at(a0) };
    r.age = a0; r.pensionAge = Math.max(a0, pensionAgeMin(state.ageNow));
    return out;
  });
  ok(pAt.p60 < pAt.p68 - 0.1, 'eläkeiän aikaistus laskee onnistumis-%:a, kun tarve on annettu', JSON.stringify(pAt));
  await page.locator('#rampNeed').fill('');
  await page.locator('#rampNeed').blur();
  await page.waitForFunction(() => document.querySelector('.ramp-stat .k').textContent.includes('Kestävä'));
  ok(await page.evaluate(() => state.events[0].goal) === 'withdrawal', 'tyhjä tarve palauttaa kestävän tulon ratkaisun');
  // Neljä toimintonappia mahtui aiemmin vain rivittymällä — vahdi ettei rivi
  // vuoda kortin reunan yli (deskarilla kortti on kapeampi kuin nappien summa)
  const overflow = await page.evaluate(() => {
    const card = document.querySelector('.ramp-card').getBoundingClientRect();
    return [...document.querySelectorAll('.ramp-acts2 .btn')]
      .map((b) => b.getBoundingClientRect())
      .filter((b) => b.right > card.right + 0.5 || b.left < card.left - 0.5).length;
  });
  ok(overflow === 0, 'toimintonapit pysyvät kortin sisällä', overflow + ' nappia yli reunan');

  // Kentän muutos ei saa rakentaa nappeja uudelleen: Tab pääsee eteenpäin, ja
  // kirjoitus + suora klikkaus nappiin osuu (aiemmin klikkaus katosi ja fokus
  // palautettiin kenttään — auditointi 11/2026)
  await page.click('#rampPension');
  await page.keyboard.type('1500');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.id) !== 'rampPension', 'Tab siirtyy työeläkekentästä eteenpäin');
  ok(await page.evaluate(() => state.events[0].pension) === 1500, 'työeläke kirjautui tilaan');

  console.log('Avaus työtilaan');
  // Kirjoitus tarvekenttään ja OIKEA hiiren klikkaus suoraan nappiin (mousedown → blur → change → click)
  await page.click('#rampNeed');
  await page.keyboard.type('2000');
  const openBox = await page.locator('#rampOpen').boundingBox();
  await page.mouse.click(openBox.x + openBox.width / 2, openBox.y + openBox.height / 2);
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => state.events[0].goal === 'manual' && state.events[0].withdrawal) === 2000, 'tarve kirjautui ennen sulkua');
  ok(await page.locator('.ramp').isHidden(), 'ramppi sulkeutuu');
  ok(await page.locator('#tour').isHidden(), 'kierros ei tunge väliin');
  ok(await page.evaluate(() => localStorage.getItem('vp-ramp-done')) === '1', 'ramppi merkitty tehdyksi');

  console.log('Veto-vihje: eläkemerkki sykkii kerran ja ohjaa raahaamaan');
  ok(await page.locator('.veto-hint').count() === 1, 'vihje näkyy rampin jälkeen');
  ok((await page.locator('.veto-hint').textContent()).includes('vedä'), 'vihje kehottaa vetämään');
  ok(await page.locator('#chart .marker.veto-pulse').count() === 1, 'eläkemerkki sykkii');
  const hintBox = await page.evaluate(() => {
    const t = document.querySelector('.veto-hint').getBoundingClientRect();
    const w = document.getElementById('chartWrap').getBoundingClientRect();
    return { inside: t.left >= w.left && t.right <= w.right && t.top >= w.top && t.bottom <= w.bottom };
  });
  ok(hintBox.inside, 'vihje pysyy piirtoalueen sisällä');
  await page.mouse.click(400, 400); // ensimmäinen kosketus piilottaa
  ok(await page.locator('.veto-hint').count() === 0, 'kosketus piilottaa vihjeen');
  ok(await page.evaluate(() => localStorage.getItem('vp-veto-vihje')) === '1', 'vihje merkitty näytetyksi');

  console.log('Paluukäynti: ei ramppia, ei kierrosta');
  await page.goto('http://localhost:8123/?z=1');
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  await page.waitForTimeout(900);
  ok(await page.locator('.ramp').isHidden(), 'ramppi ei toistu');
  ok(await page.locator('#tour').isHidden(), 'kierros ei käynnisty palaajalle');
  ok(await page.evaluate(() => state.ageNow) === 34, 'oma suunnitelma säilyi');
  ok(await page.locator('.veto-hint').count() === 0, 'veto-vihje ei toistu paluukäynnillä');

  console.log('Ohituspolku: esimerkkisuunnitelma + kierros');
  await freshFirstVisit();
  await page.click('#rampSkip');
  ok(await page.locator('.ramp').isHidden(), 'ohitus sulkee rampin');
  await page.waitForFunction(() => !document.getElementById('tour').hidden);
  ok(true, 'kierros käynnistyy ohittajalle');
  const skipSt = await page.evaluate(() => ({ m: state.monthly, n: state.events.length }));
  ok(skipSt.m === 1000 && skipSt.n === 3, 'esimerkkisuunnitelma säilyy ohittajalla', JSON.stringify(skipSt));

  console.log('Jakolinkki: ei ramppia');
  await page.goto('http://localhost:8123/?s=' + Math.random());
  await page.evaluate(() => localStorage.clear());
  const hash = await page.evaluate(() => btoa(unescape(encodeURIComponent(JSON.stringify(serialize())))));
  await page.goto('http://localhost:8123/#s=' + hash);
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  await page.waitForTimeout(900);
  // Jakolinkin avaaja ei näe aloituslomaketta — vaan jaetun suunnitelman
  // vastaanottokortin samassa säiliössä (imaisu-ohjelma A1, ks. verify-jaettu.js)
  ok(await page.locator('#rampAge').count() === 0, 'jakolinkillä saapuva ei näe ramppilomaketta');
  ok((await page.locator('#rampCard .ramp-title').textContent()).includes('jaettu'), 'jakolinkillä saapuva näkee vastaanottokortin');

  console.log('Testihiljennys (vp-autotour-off)');
  await page.goto('http://localhost:8123/?q=1');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); });
  await page.goto('http://localhost:8123/?q=2');
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  await page.waitForTimeout(900);
  ok(await page.locator('.ramp').isHidden(), 'vp-autotour-off hiljentää myös rampin');
  ok(await page.locator('#tour').isHidden(), 'ja kierroksen (kuten ennen)');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nKaikki ramppitarkistukset läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
