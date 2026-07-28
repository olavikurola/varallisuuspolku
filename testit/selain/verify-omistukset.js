// Omistukset-verify: paletti-chip, popover-kentät, moottorivaikutus, myynti,
// jakolinkki-roundtrip, piirtopöydän ankkurointi, vertailupaketti, mobiili.
// Ajo: NODE_PATH=<playwright-node_modules> node verify-omistukset.js
'use strict';
const { chromium } = require('playwright');
const BASE = process.env.VP_BASE || 'http://localhost:8123/';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  let failed = 0;
  const ok = (c, n, d = '') => { if (c) console.log('  ✓ ' + n); else { failed++; console.error('  ✗ ' + n + (d ? ' — ' + d : '')); } };

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-tour-done', '1'); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-ramp-done', '1'); });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 1) Paletissa Oma asunto -chip; napautus lisää nykyhetkeen ja avaa popoverin
  const chip = page.locator('#palette .chip', { hasText: 'Oma asunto' });
  ok(await chip.count() === 1, 'paletissa 🔑 Oma asunto');
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  await page.waitForTimeout(400);
  const ev0 = await page.evaluate(() => { const e = state.events.find((x) => x.owned); return e ? { ...e, atNow: e.age === state.ageNow } : null; });
  ok(!!ev0 && ev0.type === 'ownHome' && ev0.atNow, 'tapahtuma syntyi nykyhetkeen owned-lipulla', JSON.stringify(ev0));
  ok(ev0.loanLeft === 120000 && ev0.isAsset && ev0.amount === -250000, 'oletukset: arvo 250 t€, lainaa 120 t€');
  ok(await page.evaluate(() => !document.getElementById('popover').hidden), 'popover aukesi');
  ok(await page.evaluate(() => !document.getElementById('pv-age')), 'ei ikäkenttää (aina nyt)');
  ok(await page.evaluate(() => !!document.getElementById('pv-own-val') && !!document.getElementById('pv-own-loan')), 'nykyarvo- ja lainakentät');
  const noteTxt = await page.evaluate(() => (document.getElementById('pv-loan-note') || {}).textContent || '');
  ok(/Laina/.test(noteTxt) && /kk/.test(noteTxt), 'lainanote kertoo erän', noteTxt);

  // 2) Nykyarvon muokkaus päivittää tilan (amount = −arvo)
  await page.fill('#pv-own-val', '300000');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => state.events.find((e) => e.owned).amount === -300000), 'nykyarvo 300 t€ → amount −300 t€');

  // 3) Moottori: velka ja omaisuus alkavat kuukaudesta 0
  const eng = await page.evaluate(() => {
    const ctx = prepareSim(state);
    return { debt0: ctx.debt[0], asset0: ctx.assets[0], lump0: ctx.lump.get(0) || 0 };
  });
  ok(Math.abs(eng.debt0 - 120000) < 1, 'velkasaldo alkaa 120 t€:sta', String(eng.debt0));
  ok(Math.abs(eng.asset0 - 300000) < 1, 'omaisuus alkaa 300 t€:sta', String(eng.asset0));
  ok(Math.abs(eng.lump0) < 1e-6, 'ei ostohetken kassavirtaa', String(eng.lump0));

  // 4) Myynti: kytkin → verovapaa oletuksena (oma asunto); pois → ostovuosi näkyviin
  await page.click('#pv-sell + .switch');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const e = state.events.find((x) => x.owned); return e.sellAge != null && e.sellTaxFree === true; }), 'myynti päälle: verovapaa oletuksena');
  ok(await page.evaluate(() => !document.getElementById('pv-own-year')), 'verovapaana ei ostovuosikenttää');
  await page.click('#pv-selltf + .switch');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !!document.getElementById('pv-own-year')), 'verollisena ostovuosikenttä näkyviin');
  await page.fill('#pv-own-year', '2016');
  await page.dispatchEvent('#pv-own-year', 'change');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const e = state.events.find((x) => x.owned); return e.boughtYear === 2016 && e.ownYears === new Date().getFullYear() - 2016; }), 'ostovuosi → ownYears');
  const sale = await page.evaluate(() => { const ctx = prepareSim(state); return ctx.saleInfos.find((s) => s.id === state.events.find((x) => x.owned).id); });
  ok(sale && sale.tax > 0 && sale.payoff > 0, 'verollinen myynti: vero ja lainan poismaksu mukana', JSON.stringify(sale));

  // 5) Tapahtumalista: "nyt", omistan-badge, positiivinen summa
  const rowTxt = await page.evaluate(() => [...document.querySelectorAll('.event-row')].map((r) => r.textContent).find((t) => t.includes('Oma asunto')) || '');
  ok(rowTxt.includes('nyt') && rowTxt.includes('omistan'), 'listarivi: nyt + omistan-badge', rowTxt);
  ok(!rowTxt.includes('−300'), 'summa ei näy kuluna', rowTxt);

  // 6) Vertailupaketti kantaa omistuksen (owned + loanLeft), ei nimeä
  const pay = await page.evaluate(() => buildDonationPayload(state, sim));
  const pev = pay.events.find((e) => e.type === 'ownHome');
  ok(pev && pev.owned === true && pev.loanLeft === 120000 && pev.name === undefined, 'payload: owned + lainakentät whitelistillä', JSON.stringify(pev));

  // 7) Jakolinkki-roundtrip
  await page.keyboard.press('Escape'); // popover kiinni
  const hash = await page.evaluate(() => btoa(unescape(encodeURIComponent(JSON.stringify(serialize())))));
  await page.goto(BASE + '#s=' + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  const rt = await page.evaluate(() => state.events.find((e) => e.owned));
  ok(rt && rt.type === 'ownHome' && rt.amount === -300000 && rt.loanLeft === 120000 && rt.boughtYear === 2016 && rt.sellAge != null, 'roundtrip säilyttää omistuksen kentät', JSON.stringify(rt));

  // 8) Piirtopöytä: markkeri valittavissa, ikäveto EI siirrä, pystyveto säätää arvoa
  await page.keyboard.press('f');
  await page.waitForTimeout(800);
  const mark = page.locator(`#chart .marker[data-id="${rt.id}"] circle.bg`);
  ok(await mark.count() === 1, 'markkeri piirtopöydällä');
  const bb = await mark.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + 200, bb.y + bb.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const e = state.events.find((x) => x.owned); return e.age === state.ageNow; }), 'vaakaveto ei siirrä ikää');
  const before = await page.evaluate(() => state.events.find((x) => x.owned).amount);
  const bb2 = await mark.boundingBox();
  await page.mouse.move(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb2.x + bb2.width / 2, bb2.y - 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => state.events.find((x) => x.owned).amount);
  ok(after < before, 'pystyveto ylös kasvattaa nykyarvoa', `${before} → ${after}`);
  // ＋ Lisää -valikko ei listaa omistuksia
  await page.click('#fsAddBtn');
  await page.waitForTimeout(300);
  const menuTxt = await page.evaluate(() => (document.querySelector('.fs-add-menu') || {}).textContent || '');
  ok(!menuTxt.includes('Oma asunto') && !menuTxt.includes('Sijoitusasunto'), '＋ Lisää ei listaa omistuksia');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // 9) Mobiili 390 px: ei vaakavuotoa omistuksen kanssa
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 0, 'ei vaakavuotoa 390 px:ssä', String(overflow));

  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nOmistukset-verify läpi.');
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
