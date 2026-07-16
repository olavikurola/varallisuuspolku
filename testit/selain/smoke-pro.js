// Pro-smoke: vipu + esittelysivu, oletusidentiteetti, markkinaoletukset,
// korrelaatiot, TER, strategiat, vaiheistus, MC-lab, stressit, analyysit,
// skenaariohaamut, Pro-raporttiliite, jakolinkki-roundtrip, vipu pois
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
  const settle = async (paths) => {
    await page.waitForFunction((p) => sim && sim.mcPaths === p && !sim.successStale, paths, { timeout: 10000 }).catch(() => {});
  };

  await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-tour-done', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); // pois piirtopöydältä
  await page.waitForTimeout(300);

  // 1) Perustila: vipu näkyy, pro-kortit piilossa
  ok(await page.locator('#proSwitch').isVisible(), 'Pro-vipu kojelaudalla');
  ok((await page.evaluate(() => [...document.querySelectorAll('.pro-card')].filter((c) => !c.hidden).length)) === 0, 'pro-kortit piilossa perustilassa');
  await settle(5000);
  const baseP = await page.evaluate(() => sim.successProb);
  const baseWEnd = await page.evaluate(() => sim.wEnd);

  // 2) Ensimmäinen kytkentä avaa esittelysivun; Ota käyttöön aktivoi
  await page.evaluate(() => document.getElementById('proSwitch').scrollIntoView());
  await page.click('#proSwitch .switch'); // checkbox on visuaalisesti piilotettu
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => !document.getElementById('proModal').hidden), 'ensimmäinen kytkentä avaa esittelysivun');
  ok(await page.evaluate(() => !state.proOn), 'Pro ei vielä päällä');
  const modalTxt = await page.evaluate(() => document.querySelector('#proModal .sum-sheet').textContent);
  ok(modalTxt.includes('Korrelaatiomatriisi') && modalTxt.includes('sijoitusneuvontaa'), 'esittelysivu kertoo sisällön ja rajauksen');
  await page.click('#proEnable');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => state.proOn && document.body.classList.contains('pro')), 'Ota käyttöön aktivoi Pron');
  ok((await page.evaluate(() => [...document.querySelectorAll('.pro-card')].filter((c) => !c.hidden).length)) === 5, 'viisi Pro-korttia näkyvissä');

  // 3) Oletusidentiteetti: Pro oletuksilla ei muuta lukuja
  await settle(5000);
  ok(await page.evaluate(() => sim.successProb) === baseP, 'oletuksilla onnistumis-% ennallaan');
  ok(Math.abs((await page.evaluate(() => sim.wEnd)) - baseWEnd) < 1, 'oletuksilla loppuvarallisuus ennallaan');

  // 4) Markkinaoletus: osaketuotto 7 → 9 % kasvattaa loppuvarallisuutta
  await page.fill('[data-pp="mu.stocks"]', '9');
  await page.dispatchEvent('[data-pp="mu.stocks"]', 'input');
  await page.waitForTimeout(400);
  const wEnd9 = await page.evaluate(() => sim.wEnd);
  ok(wEnd9 > baseWEnd, 'suurempi tuotto-odotus näkyy heti', `${Math.round(baseWEnd)} → ${Math.round(wEnd9)}`);

  // 5) Korrelaatiomatriisi: hajautushyöty parantaa onnistumista
  await page.evaluate(() => { document.querySelector('[data-pact="corr-on"]').click(); });
  await page.waitForTimeout(500);
  ok((await page.locator('.cin').count()) === 3, 'korrelaatiomatriisi (3 paria) näkyy');
  await settle(5000);
  const pCorr = await page.evaluate(() => sim.successProb);
  ok(pCorr >= baseP, 'hajautushyöty ei heikennä onnistumista', `${pCorr} vs ${baseP}`);

  // 6) TER syö tuottoa
  await page.fill('[data-pp="ter"]', '1');
  await page.dispatchEvent('[data-pp="ter"]', 'input');
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => sim.wEnd)) < wEnd9, 'TER pienentää loppuvarallisuutta');
  await page.fill('[data-pp="ter"]', '0');
  await page.dispatchEvent('[data-pp="ter"]', 'input');
  await page.waitForTimeout(300);

  // 7) Nostostrategia: % salkusta → ei ehdy, huomautus näkyy; takaisin kiinteään
  await page.evaluate(() => { document.querySelector('[data-pact="wd-mode"][data-mode="pct"]').click(); });
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.getElementById('proWd').textContent.includes('mittareita, eivät ratkaisuja')), '%-strategian huomautus ratkaisijoista');
  ok(await page.evaluate(() => sim.depletionAge == null), '%-strategia ei ehdy');
  await page.evaluate(() => { document.querySelector('[data-pact="wd-mode"][data-mode="guard"]').click(); });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => isFinite(sim.wEnd)), 'guardrails laskee');
  await page.evaluate(() => { document.querySelector('[data-pact="wd-mode"][data-mode="fixed"]').click(); });
  await page.waitForTimeout(400);

  // 8) Kulutuksen vaiheistus kasvattaa loppuvarallisuutta
  const wBefore = await page.evaluate(() => sim.wEnd);
  await page.evaluate(() => { document.querySelector('[data-pact="phases-on"]').click(); });
  await page.waitForTimeout(500);
  ok((await page.evaluate(() => sim.wEnd)) > wBefore, 'go-go/slow-go kasvattaa loppuvarallisuutta');
  await page.evaluate(() => { document.querySelector('[data-pact="phases-on"]').click(); });
  await page.waitForTimeout(400);

  // 9) MC-lab: polkumäärä ja persentiilit
  await page.selectOption('[data-pact="paths"]', '1000');
  await settle(1000);
  ok(await page.evaluate(() => sim.mcPaths === 1000), 'polkumäärä vaihtuu (worker)');
  // 20 000: tulos jää voimaan myös kun layout elää (ResizeObserver-regressio)
  await page.selectOption('[data-pact="paths"]', '20000');
  await settle(20000);
  ok(await page.evaluate(() => sim.mcPaths === 20000), '20 000 polkua pysyy voimassa');
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => sim.mcPaths === 20000 && !sim.successStale), 'tulos ei pyyhkiydy uudella renderillä');
  await page.selectOption('[data-pact="paths"]', '5000');
  await settle(5000);
  await page.selectOption('[data-pact="pcts"]', '5-95');
  await settle(1000);
  ok(await page.evaluate(() => sim.pctLo === 5 && sim.pctHi === 95), 'viuhkan persentiilit vaihtuvat');
  ok((await page.evaluate(() => document.getElementById('legendBandTxt').textContent)).includes('P5–P95'), 'legenda kertoo persentiilit');

  // 10) Stressiskenaario piirtyy graafiin
  await page.evaluate(() => { document.querySelector('[data-pact="stress"][data-key="bear"]').click(); });
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => sim.stress && sim.stress.length === 1), 'stressipolku lasketaan');
  ok((await page.locator('.stress-label').count()) === 1, 'stressiviiva ja nimi graafissa');

  // 11) Analyysit
  await page.waitForTimeout(700); // scheduleProAna
  ok((await page.locator('#ruinSvg path').count()) >= 2, 'ehtymiskäyrä piirtyy');
  ok((await page.locator('.tor-row').count()) >= 6, 'tornado-herkkyys listautuu');
  ok((await page.locator('#susSvg path').count()) >= 1, 'kestävä tulo eläkei\'ittäin piirtyy');

  // 12) Skenaariohaamu
  await page.fill('#scenName', 'Rohkea');
  await page.evaluate(() => { document.querySelector('[data-pact="scen-save"]').click(); });
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => proScenarios.length === 1 && proScenarios[0].name === 'Rohkea'), 'skenaario tallentuu');
  ok((await page.locator('.scen-row').count()) === 1, 'skenaario listautuu');

  // 13) Suunnitelmani: Pro-oletusliite
  await page.evaluate(() => openSummary());
  await page.waitForTimeout(400);
  const sumTxt = await page.evaluate(() => document.getElementById('sumSheet').textContent);
  ok(sumTxt.includes('Pro-oletukset'), 'raporttiin tulostuu Pro-oletusliite');
  ok(sumTxt.includes('tuotto-odotus') && sumTxt.includes('9'), 'poikkeama (osakkeet 9 %) kirjattu');
  ok(sumTxt.includes('Karhu heti eläkkeellä'), 'stressitulos kirjattu');
  await page.evaluate(() => closeSummary());

  // 14) Jakolinkki kantaa Pro-asetukset
  const url = await page.evaluate(() => makeShareUrl());
  const page2 = await browser.newPage();
  await page2.goto(url.replace(/^https?:\/\/[^/]+/, 'http://localhost:8123'), { waitUntil: 'networkidle' });
  await page2.waitForTimeout(600);
  ok(await page2.evaluate(() => state.proOn === true && state.pro.mu.stocks === 9), 'jakolinkki kantaa Pro-asetukset');
  await page2.close();

  // 15) Vipu pois: perustila palaa, asetukset säilyvät passiivisina
  await page.evaluate(() => { document.getElementById('proToggle').click(); });
  await page.waitForTimeout(400);
  await settle(5000);
  ok(await page.evaluate(() => !state.proOn && !document.body.classList.contains('pro')), 'vipu pois palauttaa perustilan');
  ok(await page.evaluate(() => sim.successProb) === baseP, 'perustilan luvut ennallaan (asetukset passiivisia)');
  ok(await page.evaluate(() => state.pro && state.pro.mu.stocks === 9), 'Pro-asetukset säilyvät muistissa');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} PRO-SMOKE-TESTIÄ EPÄONNISTUI` : '\nPro-smoke läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
