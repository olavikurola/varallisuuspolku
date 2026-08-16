// Profiilit V1 -verifiointi: suunnitelmakoti Suunnitelmani-näkymässä.
// Vaatii: node testit/selain/serve.js (portti 8123) + NODE_PATH playwrightiin.
'use strict';
const { chromium } = require('playwright');

const BASE = process.env.VP_BASE || 'http://localhost:8123';
const nb = require('./normi').norm;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let failed = 0;
  const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };
  const plansLS = () => page.evaluate(() => JSON.parse(localStorage.getItem('vp-plans') || '[]'));
  const activeLS = () => page.evaluate(() => localStorage.getItem('vp-active'));
  const openHome = async () => { await page.click('#summaryBtn'); await page.waitForTimeout(250); };

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-tour-done', '1'); localStorage.setItem('vp-autotour-off', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1) Migraatio: yksi rivi äänettömästi, aktiivinen
  let ls = await plansLS();
  ok(ls.length === 1 && ls[0].nimi === 'Oma suunnitelma', 'migraatio: nykyinen tila ensimmäiseksi riviksi', JSON.stringify(ls.map((p) => p.nimi)));
  ok((await activeLS()) === ls[0].id, 'vp-active osoittaa riviin');

  await openHome();
  ok(await page.locator('#plansHome .ph-grid').isVisible(), 'suunnitelmakoti näkyy Suunnitelmani-näkymässä');
  ok((await page.locator('.ph-row').count()) === 1, 'yksi rivi');
  ok(await page.locator('.ph-row.active .dot').isVisible(), 'aktiivisen rivin merkki');

  // 2) Tunnusluvut täyttyvät
  await page.waitForFunction(() => {
    const el = document.querySelector('.ph-row .m-wret');
    return el && el.textContent !== '…';
  }, null, { timeout: 8000 });
  const wret = nb(await page.locator('.ph-row .m-wret').textContent());
  ok(/[tM]€/.test(wret), 'Eläkkeellä-arvo tiivismuodossa', wret);
  ok(/%/.test(await page.locator('.ph-row .m-p').textContent()), 'onnistumis-% täyttyy');
  ok(/✓|~/.test(await page.locator('.ph-row .m-adq').textContent()), 'riittävyys täyttyy');
  ok((await page.locator('.ph-row .m-spark svg').count()) === 1, 'sparkline piirtyy');

  // 3) Nimeäminen
  await page.click('.ph-row .p-edit');
  await page.fill('.ph-name.name-edit input', 'Oma polkuni');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  ok((await page.locator('.ph-row .nm').textContent()) === 'Oma polkuni', 'nimeäminen päivittää rivin');
  ls = await plansLS();
  ok(ls[0].nimi === 'Oma polkuni', 'nimi tallentuu levylle');

  // 4) Kopio nykyisestä → aktivoituu ja sulkee näkymän
  await page.click('.ph-opt[data-act="kopio"]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.getElementById('summary').hidden), 'kopio sulkee näkymän työtilaan');
  ls = await plansLS();
  ok(ls.length === 2 && ls[1].nimi.startsWith('Kopio: Oma polkuni'), 'kopiorivi syntyi', JSON.stringify(ls.map((p) => p.nimi)));
  ok((await activeLS()) === ls[1].id, 'kopio on aktiivinen');

  // 5) Muokkaus valuu vain aktiiviseen riviin
  await page.fill('#monthly', '555');
  await page.dispatchEvent('#monthly', 'input');
  await page.waitForTimeout(700); // debounce-persist
  ls = await plansLS();
  ok(ls[1].data.monthly === 555 && ls[0].data.monthly !== 555, 'autotallennus vain aktiiviseen riviin');

  // 6) Vaihto takaisin palauttaa tilan; kumoaminen ei vuoda yli
  await openHome();
  await page.locator('.ph-row', { hasText: 'Oma polkuni' }).first().locator('.ph-open').click();
  await page.waitForTimeout(400);
  ok((await page.inputValue('#monthly')) === '1000', 'vaihto palauttaa suunnitelman tilan', await page.inputValue('#monthly'));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  ok((await page.inputValue('#monthly')) === '1000', 'Ctrl+Z ei tuo toisen suunnitelman tilaa');

  // 7) Vertailuliuska: kaksi ruksia → Avaa rinnakkain → haamu
  await openHome();
  const rows = page.locator('.ph-row');
  await rows.nth(0).locator('.ph-check input').check();
  await page.waitForTimeout(150);
  await page.locator('.ph-row').nth(1).locator('.ph-check input').check();
  await page.waitForTimeout(250);
  ok(await page.locator('.ph-cmpbar').isVisible(), 'vertailuliuska ilmestyy kahdella valinnalla');
  await page.click('.ph-cmp-open');
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => document.getElementById('summary').hidden), 'rinnakkain sulkee näkymän');
  const cmpName = await page.evaluate(() => baseline && baseline.cmpName);
  ok(/Kopio: Oma polkuni/.test(cmpName || ''), 'haamuna toinen valittu suunnitelma', String(cmpName));
  ok(await page.evaluate(() => !document.getElementById('cmpPill').hidden), 'vertailupilleri näkyy (erot ≥ 500 €)');

  // 8) Tyhjä pohja
  await openHome();
  await page.click('.ph-opt[data-act="tyhja"]');
  await page.waitForTimeout(400);
  ls = await plansLS();
  ok(ls.length === 3 && ls[2].nimi === 'Uusi suunnitelma', 'tyhjä pohja omaksi rivikseen');
  ok((await page.inputValue('#monthly')) === '1000', 'tyhjä pohja = oletustila');

  // 9) Kolme kysymystä: ramppi uudelleen uudelle riville
  await openHome();
  await page.click('.ph-opt[data-act="ramppi"]');
  await page.waitForTimeout(400);
  ok(await page.locator('#rampAge').isVisible(), 'ramppilomake aukeaa uudelleen');
  ok(/Peruuta/.test(await page.locator('#rampSkip').textContent()), 'ohituslinkki muuttuu peruutukseksi');
  await page.fill('#rampAge', '40');
  await page.fill('#rampWealth', '50000');
  await page.fill('#rampMonthly', '400');
  await page.click('#rampGo');
  await page.waitForTimeout(900);
  ok(await page.locator('#rampOpen').isVisible(), 'rampin tulosnäkymä');
  await page.click('#rampOpen');
  await page.waitForTimeout(300);
  ls = await plansLS();
  ok(ls.length === 4 && ls[3].data.ageNow === 40 && ls[3].data.monthly === 400, 'rampin vastaukset uuden rivin tilaan', JSON.stringify(ls.map((p) => [p.nimi, p.data.ageNow])));

  // 10) Rampin peruutus poistaa väliaikaisen rivin ja palauttaa edellisen
  const beforeCancel = (await plansLS()).length;
  const activeBefore = await activeLS();
  await openHome();
  await page.click('.ph-opt[data-act="ramppi"]');
  await page.waitForTimeout(400);
  await page.click('#rampSkip');
  await page.waitForTimeout(500);
  ls = await plansLS();
  ok(ls.length === beforeCancel, 'peruutus poistaa väliaikaisen rivin', String(ls.length));
  ok((await activeLS()) === activeBefore, 'edellinen suunnitelma palaa aktiiviseksi');
  ok(await page.locator('#plansHome .ph-grid').isVisible(), 'peruutus palaa suunnitelmakotiin');

  // 11) Tuonti linkistä
  const shareUrl = await page.evaluate(() => {
    const o = { ageNow: 28, ageEnd: 90, startCapital: 5000, monthly: 321, savingsGrowth: 0, allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: false, events: [{ type: 'retirement', age: 65, withdrawal: 2000, pension: 0, pensionAge: 65 }] };
    return location.origin + '/#s=' + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  });
  await page.fill('#phLinkIn', shareUrl);
  await page.click('[data-act="tuolinkki"]');
  await page.waitForTimeout(400);
  ls = await plansLS();
  const tuotu = ls.find((p) => p.nimi === 'Tuotu suunnitelma');
  ok(!!tuotu && tuotu.data.monthly === 321, 'linkkituonti omaksi rivikseen', JSON.stringify(ls.map((p) => p.nimi)));
  ok(await page.locator('.ph-row', { hasText: 'Tuotu suunnitelma' }).locator('.src').first().isVisible(), 'tuontimerkki ⇣ rivillä');
  ok((await activeLS()) !== tuotu.id, 'tuonti ei kaappaa työtilaa');

  // 12) Vienti (varmuuskopio) ja rivin lataus tiedostona
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="vie"]')]);
  ok(/varallisuuspolku-varmuuskopio-\d{4}/.test(dl.suggestedFilename()), 'varmuuskopion tiedostonimi', dl.suggestedFilename());
  await page.locator('.ph-row').first().locator('.ph-more').click();
  await page.waitForTimeout(150);
  ok(await page.locator('.ph-menu').isVisible(), '⋯-valikko aukeaa');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.locator('.ph-menu button[data-act="lataa"]').click()]);
  ok(/varallisuuspolku-.*\.json/.test(dl2.suggestedFilename()), 'rivin tiedostonimi', dl2.suggestedFilename());

  // 13) Jaa linkkinä (leikepöytä)
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('.ph-row', { hasText: 'Tuotu suunnitelma' }).locator('.ph-more').click();
  await page.waitForTimeout(150);
  await page.locator('.ph-menu button[data-act="jaa-linkki"]').click();
  await page.waitForTimeout(250);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(/#s=/.test(clip), 'jakolinkki leikepöydälle', clip.slice(0, 50));

  // 14) Poisto varmistuksella; aktiivisen poisto vaihtaa seuraavaan
  const nBefore = (await plansLS()).length;
  await page.locator('.ph-row', { hasText: 'Tuotu suunnitelma' }).locator('.ph-more').click();
  await page.waitForTimeout(150);
  await page.locator('.ph-menu button[data-act="poista"]').click();
  await page.waitForTimeout(150);
  ok(await page.locator('.ph-menu.confirm').isVisible(), 'poisto kysyy varmistuksen');
  await page.locator('.ph-menu.confirm .danger-btn').click();
  await page.waitForTimeout(300);
  ok((await plansLS()).length === nBefore - 1, 'rivi poistuu varmistuksesta');
  const actId = await activeLS();
  const actRow = (await plansLS()).find((p) => p.id === actId);
  await page.locator(`.ph-row.active .ph-more`).click();
  await page.waitForTimeout(150);
  await page.locator('.ph-menu button[data-act="poista"]').click();
  await page.waitForTimeout(150);
  await page.locator('.ph-menu.confirm .danger-btn').click();
  await page.waitForTimeout(500);
  const actId2 = await activeLS();
  ok(actId2 && actId2 !== actId, 'aktiivisen poisto vaihtaa seuraavaan', String(actId2));
  ok(!(await plansLS()).some((p) => p.id === actId), 'poistettu rivi ei palaa');

  // 15) Jakolinkkivierailu EI korvaa mitään — uusi rivi
  const nShared = (await plansLS()).length;
  // HUOM: hash-navigointi samaan URL:iin ei lataa sivua — kierto about:blankin kautta
  await page.goto('about:blank');
  await page.goto(shareUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  ls = await plansLS();
  ok(ls.length === nShared + 1, 'jakolinkki tallentuu omaksi rivikseen', String(ls.length));
  ok((await page.evaluate(() => state.monthly)) === 321, 'linkin suunnitelma aukeaa työtilaan');
  const shActive = await activeLS();
  const shRow = ls.find((p) => p.id === shActive);
  ok(shRow && shRow.alkupera === 'linkki', 'alkuperä: linkki');

  // 16) Nollaus poistaa vain aktiivisen — seuraava rivi palaa tilaan
  const keepIds = ls.filter((p) => p.id !== shRow.id).map((p) => p.id);
  await page.click('#moreBtn');
  await page.waitForTimeout(200);
  await page.click('#mi-reset');
  await page.waitForTimeout(150);
  await page.click('#mi-reset');
  await page.waitForFunction(() => document.readyState === 'complete');
  await page.waitForTimeout(900);
  ls = await plansLS();
  ok(ls.length === keepIds.length && ls.every((p) => keepIds.includes(p.id)), 'nollaus poistaa vain aktiivisen rivin', JSON.stringify(ls.map((p) => p.nimi)));
  const resActive = await activeLS();
  const restored = ls.find((p) => p.id === resActive);
  ok(!!restored, 'seuraava rivi aktivoituu nollauksen jälkeen');
  ok((await page.evaluate(() => state.monthly)) === restored.data.monthly, 'työtila = aktivoituneen rivin tila');
  ok(await page.evaluate(() => !document.getElementById('ramp') || document.getElementById('ramp').hidden), 'nollaaja ei näytä ensivierailijalta');

  // 17) Tulostus piilottaa suunnitelmakodin
  await page.click('#summaryBtn');
  await page.waitForTimeout(250);
  await page.emulateMedia({ media: 'print' });
  ok((await page.evaluate(() => getComputedStyle(document.getElementById('plansHome')).display)) === 'none', 'print: suunnitelmakoti piilossa');
  await page.emulateMedia({ media: 'screen' });

  // 18) Mobiili 390 px: rivi ei vuoda yli
  const mob = await ctx.newPage();
  await mob.goto(BASE + '/', { waitUntil: 'networkidle' });
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.evaluate(() => { localStorage.setItem('vp-tour-done', '1'); localStorage.setItem('vp-autotour-off', '1'); });
  await mob.reload({ waitUntil: 'networkidle' });
  await mob.waitForTimeout(500);
  await mob.click('#summaryBtn');
  await mob.waitForTimeout(400);
  const over = await mob.evaluate(() => {
    const g = document.querySelector('.ph-grid');
    return g ? g.scrollWidth - g.clientWidth : -1;
  });
  ok(over <= 0, 'mobiili: taulukko ei vuoda yli', String(over));
  ok(await mob.evaluate(() => getComputedStyle(document.querySelector('.ph-row .c-saasto')).display === 'none'), 'mobiili: sarakkeet väistyvät');
  await mob.screenshot({ path: require('path').join(require('os').tmpdir(), 'profiilit-mobile.png') });
  await mob.close();

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} PROFIILIT-TARKISTUSTA EPÄONNISTUI` : '\nProfiilit-verifiointi läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
