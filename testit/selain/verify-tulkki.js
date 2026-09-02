'use strict';
/* Tulkki-selainverifiointi: avainportti, lehti, pehmeä validointi, evalit, fs-väistö. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');

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

  let lastReq = null;
  await page.route('**/tulkki', (route) => {
    lastReq = JSON.parse(route.request().postData());
    const q = lastReq.question || '';
    const retTyhjasta = /eläkeikää 58/i.test(q); // eläkekenttä ilman eläketapahtumaa → luodaan oletuksin
    const cmd = /kokeile/i.test(q);
    const evChange = /arvonnousu/i.test(q);
    const badField = /marginaali/i.test(q);
    const compare = /vertaa/i.test(q);
    const haasta = lastReq.mode === 'haasta';
    const aikataulu = /porrasta/i.test(q);
    const ramppi = lastReq.mode === 'ramppi';
    const luonti = /mökki/i.test(q);
    const poisto = /poista auto/i.test(q);
    const eiOle = /häät/i.test(q); // b-muoto tapahtumaan jota ei ole → syyt näkyviin
    const keskella = /perintö/i.test(q); // direktiivi EI viimeisenä rivinä → varaskanneri
    const rikki = /sivutulo/i.test(q); // viallinen JSON → kerrotaan, ei nielaista
    const heitto = /heittomerkki/i.test(q); // englannin apostrofit: entiteetti ei saa hajota
    const korjattava = /remontti/i.test(q); // suomalainen lukumuoto JSONissa → korjausyritys
    // ENSISIJAINEN kanava (tool use): cmd/vertaa/haasta/ramppi tulevat {tool}-
    // rivinä kuten uusi palvelin ne lähettää. Muut jäävät tekstiriveiksi ja
    // testaavat varapolkua (vanha palvelin / siirtymävaihe).
    let toolLine = null;
    let answer;
    if (ramppi) {
      answer = 'Poimin: 38 v, 80 000 € sijoituksia, 600 €/kk säästö, eläke 62, lapsi 40 v.';
      toolLine = { tool: { name: 'ehdota_muutos', input: { muutokset: [{ kentta: 'ageNow', arvo: 38 }, { kentta: 'startCapital', arvo: 80000 }, { kentta: 'monthly', arvo: 600 }, { kentta: 'retAge', arvo: 62 }, { uusi: 'child', ika: 40 }], selite: 'Aloitussuunnitelma kuvauksesta' } } };
    } else if (haasta) {
      answer = 'Suunnitelmassa on kaksi selvää riskiä: pakotettu varhaiseläke ja työttömyysjakso.';
      toolLine = { tool: { name: 'vertaile', input: { vaihtoehdot: [{ nimi: 'Eläke pakotettuna 60', muutokset: [{ kentta: 'retAge', arvo: 60 }] }, { nimi: 'Työttömyys: säästö 400', muutokset: [{ kentta: 'monthly', arvo: 400 }] }], selite: 'Kaksi keskeistä riskiä' } } };
    } else if (compare) {
      answer = 'Katso vertailu alta.';
      toolLine = { tool: { name: 'vertaile', input: { vaihtoehdot: [{ nimi: 'Eläkeikä 60', muutokset: [{ kentta: 'retAge', arvo: 60 }] }, { nimi: 'Eläkeikä 65', muutokset: [{ kentta: 'retAge', arvo: 65 }] }], selite: 'Eläkeiän vaikutus' } } };
    } else if (retTyhjasta) {
      answer = 'Kokeillaan — katso esikatselu.';
      toolLine = { tool: { name: 'ehdota_muutos', input: { muutokset: [{ kentta: 'retAge', arvo: 58 }], selite: 'Eläkeikä 58 v' } } };
    } else if (cmd) {
      answer = 'Kokeillaan — katso esikatselu.';
      toolLine = { tool: { name: 'ehdota_muutos', input: { muutokset: [{ kentta: 'monthly', arvo: 1200 }, { kentta: 'retAge', arvo: 62 }], selite: 'Säästö 1 200 €/kk ja eläkeikä 62 v' } } };
    } else {
      answer = korjattava
      ? 'Kokeillaan remonttia.\nMUUTOS: {"muutokset":[{"uusi":"renovation","ika":55},{"tapahtuma":"renovation","tapahtumaIka":55,"ominaisuus":"amount","arvo":45 000 €}],"selite":"Remontti 45 000 €"}'
      : keskella
      ? 'Lisätään perintö.\nMUUTOS: {"muutokset":[{"uusi":"inheritance","ika":50}],"selite":"Perintö 50 v"}\nHuomaathan että tämä on esikatselu.'
      : rikki
      ? 'Kokeillaan sivutuloa.\nMUUTOS: {"muutokset":[{"uusi":"sidegig"'
      : eiOle
      ? 'Kokeillaan häiden summaa.\nMUUTOS: {"muutokset":[{"tapahtuma":"wedding","tapahtumaIka":null,"ominaisuus":"amount","arvo":10000}],"selite":"Häät 10 000 €"}'
      : luonti
      ? 'Lisätään mökki.\nMUUTOS: {"muutokset":[{"uusi":"cottage","ika":45},{"tapahtuma":"cottage","tapahtumaIka":45,"ominaisuus":"amount","arvo":150000}],"selite":"Mökki 45 v, 150 000 €"}'
      : poisto
      ? 'Poistetaan auto.\nMUUTOS: {"muutokset":[{"poista":"car","tapahtumaIka":null}],"selite":"Auto pois suunnitelmasta"}'
      : aikataulu
      ? 'Porrastetaan säästö.\nMUUTOS: {"muutokset":[{"aikataulu":[{"to":40,"amount":300},{"to":90,"amount":1500}]}],"selite":"Säästö 300 → 1500"}'
      : badField
      ? 'Kokeillaan.\nMUUTOS: {"muutokset":[{"kentta":"home_margin","arvo":0}],"selite":"Marginaali nollaan"}'
      : evChange
      ? 'Kokeillaan — katso esikatselu.\nMUUTOS: {"muutokset":[{"tapahtuma":"home","tapahtumaIka":35,"ominaisuus":"appr","arvo":0}],"selite":"Asunnon arvonnousu nollaan"}'
      : heitto
      ? "Here's what stands out: you're on track and you'll end with 99 % success."
      : 'Onnistumistodennäköisyys on 99 %, koska **säästöaika on pitkä** ja nostotarve maltillinen.\n\nKeksitty vertailu: 123 456 € olisi tarvittu muuhun.';
    }
    // NDJSON-virta: teksti kahdessa palassa + mahdollinen {tool} + lopetusrivi
    const half = Math.ceil(answer.length / 2);
    const nd = JSON.stringify({ delta: answer.slice(0, half) }) + '\n' +
      JSON.stringify({ delta: answer.slice(half) }) + '\n' +
      (toolLine ? JSON.stringify(toolLine) + '\n' : '') +
      JSON.stringify({ done: true, model: 'claude-haiku-4-5', usage: { in: 1500, out: 80 } }) + '\n';
    route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: nd });
  });

  console.log('Julkinen taso ilman avainta (23.7. alkaen kahva näkyy kaikille)');
  await page.goto('http://localhost:8123/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-tour-done', '1'); });
  await page.goto('http://localhost:8123/');
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  ok(await page.locator('.tk-handle').count() === 1, 'kahva näkyy ilman avainta (julkinen taso)');
  await page.waitForSelector('.tk-why', { timeout: 8000 }).catch(() => {});
  ok((await page.locator('.tk-why').count()) >= 1, 'Miksi?-chipit myös ilman avainta');

  console.log('Avain sisään hashilla');
  await page.goto('http://localhost:8123/?avain=1#tulkki=testikoodi'); // eri URL → oikea uudelleenlataus
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  ok(await page.locator('.tk-handle').count() === 1, 'kahva ilmestyy avaimella');
  ok(await page.evaluate(() => location.hash) === '', 'hash siivottu osoitteesta');
  ok(await page.evaluate(() => localStorage.getItem('vp-tulkki-key')) === 'testikoodi', 'avain tallessa');
  await page.waitForSelector('.stat .tk-why');
  ok(await page.locator('.stat .tk-why').count() >= 1, 'Miksi?-chipit tunnusluvuissa');
  ok(!(await page.locator('.tk-badge').isVisible().catch(() => false)), 'oletussuunnitelmassa ei katsastusmerkkiä');

  console.log('Lehti, kysymys ja pehmeä validointi');
  await page.click('.tk-handle');
  ok(await page.locator('.tk-sheet').isVisible(), 'lehti avautuu');
  ok(await page.evaluate(() => document.body.classList.contains('tk-docked')), 'telakointiluokka päällä');
  await page.waitForTimeout(350); // siirtymä (0.2 s) loppuun ennen mittausta
  const mr = await page.evaluate(() => getComputedStyle(document.querySelector('.layout')).marginRight);
  ok(mr === '430px', 'sisältö väistyy telakoinnissa (1280 px → 430 px marginaali)', mr);
  ok(await page.locator('.tk-intro').count() === 1, 'kertaesittely ensimmäisellä avauksella');
  ok(await page.evaluate(() => localStorage.getItem('vp-tulkki-intro')) === '1', 'esittely merkitty nähdyksi');
  // Tietosuojateksti kertoo täsmällisesti mitä välitetään (nimettömät luvut
  // + kysymys) — "ei lähde" -muotoa ei saa palauttaa (täsmennetty 8/2026)
  {
    const pv = await page.locator('.tk-privacy').textContent();
    ok(pv.includes('nimettöm') && !/ei lähde (selaimestasi|laitteeltasi)/.test(pv),
      'tietosuojarivi näkyy ja on rehellinen', pv);
  }
  ok(await page.locator('.tk-sug').count() >= 3, 'ehdotuschipit laskettu');
  await page.locator('.tk-sug').first().click();
  await page.waitForSelector('.tk-a:not(.tk-busy)');
  const okNums = await page.locator('.tk-a .tk-num:not(.tk-doubt)').count();
  const doubts = await page.locator('.tk-a .tk-doubt').count();
  ok(okNums >= 1, 'moottorista löytyvä luku merkitty (99 %)', String(okNums));
  ok(doubts === 1, 'keksitty luku liputettu varoituksella', String(doubts));
  ok(await page.locator('.tk-a b').count() >= 1 && !(await page.locator('.tk-a').first().textContent()).includes('**'), 'lihavointi renderöityy, ei raakoja tähtiä');
  ok(await page.locator('.tk-sug:not(.tk-adv):not(.tk-haasta):not(.tk-market):not(.tk-plans):not(.tk-jaa)').count() === 0, 'kysymyschipit piiloutuvat keskustelun alettua (toimintochipit saavat jäädä)');
  ok(await page.locator('.tk-sug').count() >= 2, 'toimintochipit jäävät');
  ok((await page.locator('.tk-meta').textContent()).includes('tarkistamatonta'), 'validointiyhteenveto näkyy');

  console.log('Payload proxyyn');
  ok(lastReq.key === 'testikoodi', 'avain mukana');
  ok(lastReq.context && lastReq.context.plan && lastReq.context.stats && lastReq.context.years, 'konteksti: plan+stats+years');
  ok(Array.isArray(lastReq.context.years.rivit) && lastReq.context.years.rivit.length <= 22, 'vuosirivit harvennettu');
  const raw = JSON.stringify(lastReq.context);
  ok(!/"name"/.test(raw) && !/"id"/.test(raw), 'ei nimiä eikä tunnisteita kontekstissa');
  ok(lastReq.context.stats.verovuosi === 2026, 'verovuosi mukana');

  console.log('Evalien keräys');
  await page.click('.tk-meta button');
  const evals = await page.evaluate(() => JSON.parse(localStorage.getItem('vp-tulkki-evals') || '[]'));
  ok(evals.length === 1 && evals[0].q && evals[0].a && evals[0].context, 'eval tallentui rakenteineen');
  ok((await page.locator('#tkEvalCopy').textContent()).includes('(1)'), 'eval-laskuri päivittyi');

  console.log('Heittomerkit (englannin oire: &#39; näkyi raakana)');
  await page.fill('#tkInput', 'heittomerkkitesti');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.tk-a:not(.tk-busy)').length >= 2);
  const hTxt = await page.locator('.tk-a').last().textContent();
  const hHtml = await page.locator('.tk-a').last().innerHTML();
  ok(hTxt.includes("Here's") && hTxt.includes("you're") && hTxt.includes("you'll"), 'heittomerkit renderöityvät merkkeinä', hTxt.slice(0, 80));
  ok(!hTxt.includes('&#') && !/&amp;#/.test(hHtml), 'ei raakoja HTML-entiteettejä vastauksessa', hTxt.slice(0, 80));
  ok(!/tk-num[^>]*>39</.test(hHtml), 'numSpans ei kääri entiteetin numeroa (39) spaniin');

  console.log('Advisor-nappi');
  await page.locator('.tk-adv').click();
  await page.waitForFunction(() => document.querySelectorAll('.tk-a:not(.tk-busy)').length >= 2);
  ok(lastReq.mode === 'advisor' && lastReq.question === undefined, 'advisor-tila ilman kysymystä');

  console.log('Muutoskomento esikatseluna (Puhu)');
  await page.fill('#tkInput', 'kokeile säästöä 1200 ja eläkeikää 62');
  await page.press('#tkInput', 'Enter');
  await page.waitForSelector('.tk-change');
  ok((await page.locator('.tk-ch-lab').last().textContent()).includes('Kokeilu käytössä'), 'esikatselukortti ilmestyy');
  ok(await page.locator('.tk-ch-row').count() === 2, 'kaksi muutosriviä (vanha → uusi)');
  let st = await page.evaluate(() => ({ m: state.monthly, a: state.events.find((e) => e.type === 'retirement').age, b: baseline ? baseline.cmpName : null }));
  ok(st.m === 1200 && st.a === 62, 'tila muuttui esikatseluun (1200 €/kk, 62 v)', JSON.stringify(st));
  ok(st.b === 'Ennen Tulkin kokeilua', 'vertailuhaamu = tilanne ennen kokeilua', String(st.b));
  await page.locator('.tk-revert').last().click();
  st = await page.evaluate(() => ({ m: state.monthly, a: state.events.find((e) => e.type === 'retirement').age, b: baseline }));
  ok(st.m === 1000 && st.a === 65 && st.b === null, 'Palauta palauttaa tilan ja poistaa haamun', JSON.stringify(st));
  await page.fill('#tkInput', 'kokeile uudestaan');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.tk-change').length >= 2);
  await page.locator('.tk-keep').last().click();
  st = await page.evaluate(() => ({ m: state.monthly, b: baseline ? baseline.cmpName : null }));
  ok(st.m === 1200 && st.b === 'Ennen Tulkin kokeilua', 'Pidä säilyttää muutoksen ja vertailukohdan', JSON.stringify(st));
  ok((await page.locator('.tk-ch-lab').last().textContent()).includes('pidetty'), 'kortti kuittaa pidetyksi');

  console.log('Tapahtuman ominaisuus (asunnon arvonnousu)');
  await page.fill('#tkInput', 'muuta asunnon arvonnousu nollaan');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.tk-change').length >= 3);
  ok((await page.locator('.tk-ch-lab').last().textContent()).includes('Kokeilu käytössä'), 'tapahtumamuutos esikatseluun');
  const evRow = await page.locator('.tk-ch-row').last().textContent();
  ok(evRow.includes('Asunto (35 v)') && evRow.includes('arvonnousu'), 'rivi kohdennettu oikeaan tapahtumaan', evRow);
  st = await page.evaluate(() => ({ appr: state.events.find((e) => e.type === 'home').appr }));
  ok(st.appr === 0, 'asunnon arvonnousu 0 esikatselussa', JSON.stringify(st));
  await page.locator('.tk-revert').last().click();
  st = await page.evaluate(() => ({ appr: state.events.find((e) => e.type === 'home').appr }));
  ok(st.appr === 2, 'Palauta palautti arvonnousun', JSON.stringify(st));

  console.log('Skeeman ulkopuolinen kenttä (home_margin)');
  await page.fill('#tkInput', 'muuta lainan marginaali nollaan');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('.tk-change').length >= 4);
  const noteTxt = await page.locator('.tk-change').last().textContent();
  ok(noteTxt.includes('ei vielä tue') && noteTxt.includes('home_margin'), 'selkeä selite hylätystä kentästä', noteTxt);
  const lastA = await page.locator('.tk-a').last().textContent();
  ok(!lastA.includes('MUUTOS:'), 'raaka MUUTOS-rivi ei näy vastauksessa');
  st = await page.evaluate(() => ({ m: state.monthly }));
  ok(st.m === 1200, 'tila ei muuttunut hylätystä kentästä', JSON.stringify(st));

  console.log('Rinnakkaisvertailu (lukupohjainen)');
  const stBefore = await page.evaluate(() => ({ a: state.events.find((e) => e.type === 'retirement').age, m: state.monthly, base: baseline }));
  await page.fill('#tkInput', 'vertaa eläkeikiä 60 ja 65');
  await page.press('#tkInput', 'Enter');
  await page.waitForSelector('.tk-cmp');
  ok((await page.locator('.tk-cmp-lab').textContent()).includes('moottori laski'), 'vertailukortti ilmestyy');
  const cols = await page.locator('.tk-cmp-tbl tr:first-child th').count();
  ok(cols === 4, 'otsikkorivi: kulma + Nykyinen + 2 vaihtoehtoa', String(cols));
  const heads = await page.locator('.tk-cmp-tbl tr:first-child th').allTextContents();
  ok(heads[1] === 'Nykyinen' && heads[2] === 'Eläkeikä 60' && heads[3] === 'Eläkeikä 65', 'sarakeotsikot oikein', JSON.stringify(heads));
  ok(await page.locator('.tk-cmp-tbl tbody tr, .tk-cmp-tbl tr').count() >= 6, 'metriikkarivit renderöityvät');
  ok(await page.locator('.tk-cmp-best').count() >= 1, 'paras arvo korostettu jollain rivillä');
  const stAfter = await page.evaluate(() => ({ a: state.events.find((e) => e.type === 'retirement').age, m: state.monthly, base: baseline }));
  ok(stAfter.a === stBefore.a && stAfter.m === stBefore.m && stAfter.base === stBefore.base, 'vertailu EI muuttanut tilaa eikä haamua', JSON.stringify(stAfter));

  console.log('Haasta (stressiskenaariot vertailuna)');
  await page.locator('.tk-haasta').click();
  await page.waitForFunction(() => document.querySelectorAll('.tk-cmp-tbl').length >= 2);
  const hHeads = await page.locator('.tk-cmp-tbl').last().locator('tr:first-child th').allTextContents();
  ok(hHeads.includes('Eläke pakotettuna 60') && hHeads.includes('Työttömyys: säästö 400'), 'stressiskenaariot vertailutaulukossa', JSON.stringify(hHeads));
  ok(await page.evaluate(() => state.monthly) === 1200, 'Haasta ei muuttanut tilaa (lukupohjainen)');

  console.log('Markkinatesti (moottorin stressiskenaariot, ei AI)');
  const stM = await page.evaluate(() => state.monthly);
  const nBefore = await page.locator('.tk-cmp-tbl').count();
  await page.locator('.tk-market').click();
  await page.waitForFunction((n) => document.querySelectorAll('.tk-cmp-tbl').length > n, nBefore);
  // Käännetty taulukko: skenaariot riveinä, metriikat sarakkeina
  const mCols = await page.locator('.tk-cmp-tbl').last().locator('tr:first-child th').allTextContents();
  ok(mCols.length === 3 && /Loppuvar/.test(mCols[1]) && /riittävät/.test(mCols[2]), 'metriikkasarakkeet (loppuvarallisuus, riittävyys)', JSON.stringify(mCols));
  const mRows = await page.locator('.tk-cmp-tbl').last().locator('tr:not(:first-child) th').allTextContents();
  ok(mRows.length === 7 && mRows[0] === 'Nykyinen', 'Nykyinen + 6 stressiskenaariota riveinä (korkoshokki 2.9.2026)', JSON.stringify(mRows));
  ok(mRows.some((h) => /karhu/i.test(h)), 'karhumarkkina-skenaario mukana');
  ok(await page.evaluate(() => state.monthly) === stM, 'markkinatesti ei muuttanut tilaa (lukupohjainen)');

  console.log('Tulkin toimet (paikallinen muutosloki)');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('vp-tulkki-log') || '[]').length) === 1,
    'vain pidetty muutos kirjautui (luku- ja perutut eivät)');
  ok((await page.locator('#tkLogBtn').textContent()).includes('(1)'), 'lokinappi näyttää määrän');
  await page.click('#tkLogBtn');
  ok(await page.locator('.tk-actions').count() === 1, 'lokinäkymä avautuu');
  ok(await page.locator('.tk-act-row').count() === 1, 'yksi lokirivi');
  const chg = (await page.locator('.tk-act-chg').first().textContent()).replace(/[\s  ]/g, '');
  ok(chg.includes('1000→1200') && chg.includes('65→62'), 'muutos näkyy rivillä (vanha → uusi)', chg);
  ok(await page.locator('.tk-act-export').count() === 1, 'vientinappi on olemassa');
  await page.locator('.tk-act-revert').first().click();
  ok(await page.evaluate(() => state.monthly) === 1000, 'Palauta tähän palautti tilan ennen muutosta');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('vp-tulkki-log') || '[]').length) === 1, 'palautus ei poista lokimerkintää (kirjaus säilyy)');

  console.log('Säästöaikataulu Tulkin kautta (Puhu)');
  await page.fill('#tkInput', 'porrasta säästö: 300 alle 40 ja 1500 loppuun');
  await page.press('#tkInput', 'Enter');
  await page.waitForSelector('.tk-keep');
  const sp = await page.evaluate(() => state.savePhases);
  ok(Array.isArray(sp) && sp.length === 2 && sp[0].amount === 300 && sp[1].amount === 1500, 'aikataulu asettui esikatseluun', JSON.stringify(sp));
  ok(!(await page.locator('#savePhaseBox').isHidden()), 'porrastus-editori aukesi esikatselussa');
  ok((await page.locator('.tk-ch-row').last().textContent()).includes('Säästöaikataulu'), 'aikataulurivi näkyy kortissa');
  await page.locator('.tk-keep').last().click();
  ok(await page.evaluate(() => state.savePhases && state.savePhases.length) === 2, 'Pidä säilytti aikataulun');

  console.log('Tapahtuman luonti Tulkin kautta (Puhu)');
  await page.fill('#tkInput', 'lisää mökki 45-vuotiaana, 150 000 €');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.tk-change')].some((c) => c.textContent.includes('Mökki')));
  const cot = await page.evaluate(() => state.events.find((e) => e.type === 'cottage'));
  ok(cot && cot.age === 45 && cot.amount === -150000, 'mökki syntyi esikatseluun (ikä + summa, etumerkki normalisoitu)', JSON.stringify(cot));
  ok(cot && cot.financing === 'loan' && cot.isAsset === true && cot.down === 37500, 'oletuslaina; käsiraha lasketaan LOPULLISESTA summasta', JSON.stringify(cot));
  await page.locator('.tk-keep').last().click();
  ok(await page.evaluate(() => !!state.events.find((e) => e.type === 'cottage')), 'Pidä säilytti uuden tapahtuman');

  console.log('Tapahtuman poisto Tulkin kautta (Puhu)');
  ok(await page.evaluate(() => !!state.events.find((e) => e.type === 'car')), 'autotapahtuma on olemassa ennen poistoa');
  await page.fill('#tkInput', 'poista auto suunnitelmasta');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.tk-change')].some((c) => c.textContent.includes('poistettu')));
  ok(await page.evaluate(() => !state.events.find((e) => e.type === 'car')), 'auto poistui esikatselussa');
  await page.locator('.tk-revert').last().click();
  ok(await page.evaluate(() => !!state.events.find((e) => e.type === 'car')), 'Palauta toi auton takaisin');

  console.log('Soveltumaton muutos: syyt näkyviin');
  await page.fill('#tkInput', 'muuta häät 10 000 euroon');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.tk-change')].some((c) => c.textContent.includes('ei voitu soveltaa')));
  const skipCard = await page.locator('.tk-change').last().textContent();
  ok(skipCard.includes('ei tällaista tapahtumaa'), 'ohitussyy kerrotaan käyttäjälle', skipCard);
  ok(skipCard.includes('Vinkki'), 'vihje ohjaa luontikomentoon', skipCard);
  ok(await page.evaluate(() => !state.events.find((e) => e.type === 'wedding')), 'mitään ei muutettu');

  console.log('Direktiivi keskellä vastausta (varaskanneri)');
  await page.fill('#tkInput', 'lisää perintö 50-vuotiaana');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.tk-change')].some((c) => c.textContent.includes('Perintö')));
  ok(await page.evaluate(() => !!state.events.find((e) => e.type === 'inheritance')), 'muutos sovellettiin vaikka rivi ei ollut viimeisenä');
  const midA = await page.locator('.tk-a').last().textContent();
  ok(midA.includes('Huomaathan') && !midA.includes('MUUTOS:'), 'jälkiteksti näkyy, direktiivi ei', midA.slice(0, 80));
  await page.locator('.tk-revert').last().click();
  ok(await page.evaluate(() => !state.events.find((e) => e.type === 'inheritance')), 'Palauta siivosi perinnön');

  console.log('Suomalainen lukumuoto JSONissa (korjausyritys)');
  await page.fill('#tkInput', 'lisää remontti 55-vuotiaana');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.tk-change')].some((c) => c.textContent.includes('Remontti')));
  const rem = await page.evaluate(() => state.events.find((e) => e.type === 'renovation'));
  ok(rem && rem.age === 55 && rem.amount === -45000, '"45 000 €" korjautui luvuksi ja muutos sovellettiin', JSON.stringify(rem));
  await page.locator('.tk-revert').last().click();
  ok(await page.evaluate(() => !state.events.find((e) => e.type === 'renovation')), 'Palauta siivosi remontin');

  console.log('Viallinen komentorivi (ei hiljaista nielaisua)');
  await page.fill('#tkInput', 'lisää sivutulo ensi vuonna');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.tk-change')].some((c) => c.textContent.includes('viallinen')));
  ok(true, 'viallisesta rivistä kerrotaan käyttäjälle');
  ok(await page.evaluate(() => !state.events.find((e) => e.type === 'sidegig')), 'mitään ei muutettu viallisella rivillä');
  const rikkiCard = await page.locator('.tk-change').last().textContent();
  ok(rikkiCard.includes('"sidegig"'), 'viallinen rivi näytetään kortissa vianetsintää varten', rikkiCard.slice(0, 120));
  const rikkiA = await page.locator('.tk-a').last().textContent();
  ok(!rikkiA.includes('MUUTOS:'), 'viallinenkin rivi riisutaan näkyvistä');

  console.log('Katsastus (paikallinen, ei AI-kutsua)');
  // Tallenna ehtyvä suunnitelma ja lataa se tuoreesti → merkki latauksessa
  await page.evaluate(() => {
    state.savePhases = null; // siivoa aikataulu edellisestä testistä
    state.monthly = 0; state.startCapital = 2000;
    const r = state.events.find((e) => e.type === 'retirement');
    r.withdrawal = 4000; r.pension = 0;
    renderAll();
  });
  await page.goto('http://localhost:8123/?k=1');
  await page.waitForFunction(() => typeof state !== 'undefined' && document.querySelectorAll('#chart path').length > 0);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('vp-tulkki-log') || '[]').length) >= 2, 'muutosloki (2 pidettyä) säilyi sivun latauksen yli');
  ok(await page.locator('.tk-badge').isVisible().catch(() => false), 'katsastusmerkki näkyy ehtyvässä suunnitelmassa');
  ok(await page.locator('.tk-badge.tk-badge-warn').count() === 1, 'merkki keltainen (varoitus)');
  await page.click('.tk-handle');
  ok(await page.locator('.tk-intro').count() === 0, 'kertaesittely ei toistu latauksen jälkeen');
  // Huomiot renderöityvät vasta loadStatsin ratkettua (23.7.) — odota kortti
  await page.waitForSelector('.tk-kats', { timeout: 8000 }).catch(() => {});
  ok(await page.locator('.tk-kats').count() === 1, 'katsastuskortti avautuu lehteen');
  ok(await page.locator('.tk-kats-warn').count() >= 1, 'varoitusrivi (ehtyminen)');
  ok(!(await page.locator('.tk-badge').isVisible().catch(() => false)), 'merkki katoaa avaamisen jälkeen');
  await page.locator('.tk-kats-ask').first().click();
  await page.waitForFunction(() => [...document.querySelectorAll('.tk-a:not(.tk-busy)')].length >= 1);
  ok(await page.locator('.tk-q').count() >= 1, 'Selitä käynnistää Tulkin selityksen');
  await page.evaluate(() => { state.monthly = 1000; state.startCapital = 20000; const r = state.events.find((e) => e.type === 'retirement'); r.withdrawal = 2400; r.pension = 1500; renderAll(); });

  console.log('Piirtopöytä ja sulkeminen');
  await page.keyboard.press('Escape'); // lehti kiinni
  ok(await page.locator('.tk-sheet').isHidden(), 'Esc sulkee lehden');
  ok(!(await page.evaluate(() => document.body.classList.contains('tk-docked'))), 'telakointi purkautuu suljettaessa');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('f');
  await page.waitForFunction(() => document.body.classList.contains('fs'));
  ok(await page.locator('.tk-handle').isHidden(), 'kahva väistyy piirtopöydässä');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('fs'));
  ok(await page.locator('.tk-handle').isVisible(), 'kahva palaa piirtopöydästä');

  console.log('NL-ramppi (kerro omin sanoin, avaimen takana)');
  // Ensivierailu: ei tallennetta → ramppi aukeaa; avain suoraan localStorageen
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-tulkki-key', 'testikoodi'); });
  await page.goto('http://localhost:8123/?nl=1');
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  await page.waitForSelector('#ramp:not([hidden])');
  ok(await page.locator('.tk-nl').count() === 1, 'NL-osio näkyy rampissa avaimella');
  await page.fill('#tkNlText', 'Olen 38, sijoituksia 80 000 €, säästän 600 €/kk. Lapsi tulossa 40-vuotiaana. Haluaisin eläkkeelle 62-vuotiaana.');
  await page.click('#tkNlGo');
  await page.waitForSelector('#rampOpen');
  const nlState = await page.evaluate(() => ({
    age: state.ageNow, cap: state.startCapital, m: state.monthly,
    ret: state.events.find((e) => e.type === 'retirement').age,
    child: !!state.events.find((e) => e.type === 'child'),
  }));
  ok(nlState.age === 38 && nlState.cap === 80000 && nlState.m === 600, 'perusluvut poimittu kuvauksesta', JSON.stringify(nlState));
  ok(nlState.ret === 62 && nlState.child, 'eläkeikä ja lapsitapahtuma asettuivat', JSON.stringify(nlState));
  ok((await page.locator('.tk-nl-note').textContent()).includes('Tulkki:'), 'poimintakortti tulosnäkymässä');
  ok(await page.evaluate(() => localStorage.getItem('vp-ramp-done')) === '1', 'ramppi merkitty tehdyksi');
  await page.click('#rampOpen');
  ok(await page.evaluate(() => document.getElementById('ramp').hidden), 'Avaa suunnitelmani sulkee rampin');

  console.log('Eläkekenttä ilman eläketapahtumaa → tapahtuma luodaan oletuksin (7.8. korjaus)');
  await page.evaluate(() => {
    state.events = state.events.filter((e) => e.type !== 'retirement');
    renderAll();
  });
  ok(await page.evaluate(() => !state.events.find((e) => e.type === 'retirement')), 'lähtötila: ei eläketapahtumaa');
  // kahva togglaa — avataan vain jos lehti on kiinni
  await page.evaluate(() => { const s = document.querySelector('.tk-sheet'); if (s && s.hidden) document.querySelector('.tk-handle').click(); });
  await page.fill('#tkInput', 'kokeile eläkeikää 58');
  await page.press('#tkInput', 'Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.tk-change')].some((c) => c.textContent.includes('lisätty suunnitelmaan oletuksin')));
  const luotuRet = await page.evaluate(() => state.events.find((e) => e.type === 'retirement'));
  ok(luotuRet && luotuRet.age === 58, 'eläketapahtuma luotiin ja ikä asettui (58 v)', JSON.stringify(luotuRet));
  ok(luotuRet && luotuRet.withdrawal === 2400 && luotuRet.pension === 1500 && luotuRet.pensionAge === 65, 'oletusnosto ja työeläke tapahtumasta', JSON.stringify(luotuRet));
  const luontiKortti = await page.locator('.tk-change').last().textContent();
  ok(!luontiKortti.includes('ei voitu soveltaa'), 'ohituskorttia ei enää synny');
  await page.locator('.tk-revert').last().click();
  ok(await page.evaluate(() => !state.events.find((e) => e.type === 'retirement')), 'Palauta poisti luodun tapahtuman');

  console.log('Avaimen poisto');
  await page.goto('http://localhost:8123/?pois=1#tulkki=pois');
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  ok(await page.evaluate(() => localStorage.getItem('vp-tulkki-key')) === null, '#tulkki=pois poistaa avaimen');
  ok(await page.locator('.tk-handle').count() === 1, 'julkinen kahva jää avaimen poiston jälkeen');

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'tulkki-suljettu.png') });
  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nKaikki selaintarkistukset läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
