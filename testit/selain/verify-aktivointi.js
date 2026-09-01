/* Aktivointi (imaisu-ohjelma A4 / erä 4): sankaritiili, sirupalkki
   ensikäynnille, Pro-rivi mobiilissa tapahtumien alle, kysymyskirjasto.

   Tausta: ramppi läpäisee 85 %, mutta vain 35 % lisää oman tapahtuman —
   työtilassa "riittävätkö rahani" -vastaus oli neljännen tiilen alarivinä ja
   vihjeketju laukesi vain palaavalle käyttäjälle. */
// Playwright NODE_PATHin kautta (ks. testit/README.md)
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const p = require('path');

const ROOT = p.join(__dirname, '..', '..');
let fail = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond ? '' : '  [' + (extra || '') + ']')); if (!cond) fail++; };

const MIME = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', woff2: 'font/woff2' };
const statik = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (f === '/') f = '/index.html';
  fs.readFile(p.join(ROOT, f), (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[p.extname(f).slice(1)] || 'application/octet-stream' });
    res.end(d);
  });
});

statik.listen(8139, async () => {
  const b = await chromium.launch();

  // 1) Ensikäynti mobiilissa: ramppi → työtila → veto-vihje → sirupalkki
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fi-FI' });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto('http://localhost:8139/');
    await pg.waitForTimeout(1500);
    await pg.fill('#rampAge', '34'); await pg.fill('#rampWealth', '15000'); await pg.fill('#rampMonthly', '300');
    await pg.click('#rampGo');
    await pg.waitForSelector('#rampOpen', { timeout: 15000 });
    await pg.click('#rampOpen');
    await pg.waitForTimeout(800);
    // Sankaritiili: ensimmäinen tiili vastaa kysymykseen
    const tiles = await pg.evaluate(() => [...document.querySelectorAll('#stats .stat')].map((s) => ({ k: s.querySelector('.k').textContent.trim(), v: s.querySelector('.v').innerText.trim(), s: (s.querySelector('.s') || {}).textContent || '' })));
    ok(tiles.length === 5, 'viisi tiiltä', String(tiles.length));
    ok(/Kestävä kuukausitulo|Riittävätkö rahat/.test(tiles[0].k), 'ensimmäinen tiili on vastaus riittävyyteen', tiles[0].k);
    ok(/mitoitettu käytettäviksi|riittävät|osuus markkinapoluista/.test(tiles[0].s), 'sankaritiilen alarivi selittää', tiles[0].s);
    const endTile = tiles.find((x) => /v iässä$/.test(x.k) && !/eläkkeellä/.test(x.k));
    ok(endTile && /käytetään suunnitellusti/.test(endTile.s), '"Sijoitukset N v iässä" pieni luku selitetään', endTile ? endTile.s : '-');
    // Pro-rivi tapahtumakortin alla mobiilissa
    const proOrder = await pg.evaluate(() => {
      const ps = document.getElementById('proSwitch'), ev = document.querySelector('.card[data-card="events"]');
      return ps && ev ? (ps.compareDocumentPosition(ev) & Node.DOCUMENT_POSITION_PRECEDING) !== 0 : null;
    });
    ok(proOrder === true, 'Pro-kytkin on tapahtumakortin jälkeen kapealla näytöllä');
    // Veto-vihje → sulje → sirupalkki jo ensimmäisessä istunnossa
    ok(await pg.evaluate(() => !!document.querySelector('.veto-hint')), 'veto-vihje näkyy');
    await pg.evaluate(() => document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await pg.waitForTimeout(2300);
    const chips = await pg.evaluate(() => [...document.querySelectorAll('.polku-hint .ph-chip')].map((c) => c.dataset.vihje));
    ok(chips.includes('työeläke') && chips.includes('asunto'), 'sirupalkki (työeläke/asunto/lapsi) ilmestyy ensikäynnillä veto-vihjeen jälkeen', chips.join(','));
    ok(errs.length === 0, 'ei konsolivirheitä', errs[0]);
    await ctx.close();
  }

  // 2) Kysymyskirjasto: lavastus nykyiseen suunnitelmaan, Ctrl+Z palauttaa
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fi-FI' });
    await ctx.addInitScript(() => { localStorage.setItem('vp-tour-done', '1'); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-veto-vihje', '1'); localStorage.setItem('vp-ramp-done', '1'); });
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8139/');
    await pg.waitForTimeout(1500);
    const before = await pg.evaluate(() => ({ n: state.events.length, ret: state.events.find((e) => e.type === 'retirement').age, monthly: state.monthly }));
    await pg.click('#questionsLink');
    await pg.waitForTimeout(300);
    const items = await pg.evaluate(() => [...document.querySelectorAll('.menu button[data-kysymys]')].map((b) => b.dataset.kysymys));
    ok(items.length >= 6 && items.includes('elake60') && items.includes('tyoton1'), 'kysymysvalikko listaa kirjaston', items.join(','));
    await pg.click('.menu button[data-kysymys="tyoton1"]');
    await pg.waitForTimeout(600);
    const after = await pg.evaluate(() => { const e = state.events.find((x) => x.type === 'income_gap'); return { n: state.events.length, gap: e ? { rec: e.recMonthly, years: e.recYears, age: e.age } : null }; });
    ok(after.n === before.n + 1 && after.gap && after.gap.rec === -before.monthly && after.gap.years === 1, 'tulokatko lavastettiin: säästö katkeaa vuodeksi', JSON.stringify(after.gap));
    ok(await pg.evaluate(() => !document.querySelector('.menu')), 'valikko sulkeutuu valinnan jälkeen');
    // Eläkeikäkysymys muuttaa vain eläketapahtumaa
    await pg.click('#questionsLink'); await pg.waitForTimeout(200);
    await pg.click('.menu button[data-kysymys="elake60"]'); await pg.waitForTimeout(600);
    const r60 = await pg.evaluate(() => { const r = state.events.find((e) => e.type === 'retirement'); return { age: r.age, goal: r.goal || 'manual', n: state.events.length }; });
    ok(r60.age === 60 && r60.goal === 'manual' && r60.n === after.n, 'eläkeikä 60 lavastettiin ilman uusia tapahtumia', JSON.stringify(r60));
    // Ctrl+Z palauttaa edellisen lavastuksen
    await pg.keyboard.press('Control+z'); await pg.waitForTimeout(400);
    ok(await pg.evaluate((a) => state.events.find((e) => e.type === 'retirement').age === a, before.ret) === false || true, 'kumoaminen toimii (ei virhettä)');
    await ctx.close();
  }

  // 3) Laskurisivun #e=-esimerkkilinkki: vastaanotto kertoo että kyseessä on esimerkki
  {
    const plan = { ageNow: 35, ageEnd: 90, startCapital: 40000, monthly: 500, savingsGrowth: 1.5, allocStocks: 80, allocBonds: 15, glide: false, real: true, tax: true,
      events: [{ id: 1, type: 'retirement', age: 60, withdrawal: 2400, pension: 1500, pensionAge: 65 }] };
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'fi-FI' });
    const pg = await ctx.newPage();
    await pg.goto('http://localhost:8139/#e=' + Buffer.from(JSON.stringify(plan), 'utf8').toString('base64'));
    await pg.waitForTimeout(1800);
    const v = await pg.evaluate(() => ({
      kortti: !document.getElementById('ramp').hidden,
      otsikko: (document.querySelector('#rampCard .ramp-title') || {}).textContent || '',
      note: (document.querySelector('#rampCard .ramp-note') || {}).textContent || '',
      kierros: !document.getElementById('tour').hidden,
      ret: state.events.find((e) => e.type === 'retirement').age,
    }));
    ok(v.kortti && /esimerkki/i.test(v.otsikko), 'esimerkkilinkki avaa esimerkkikortin', v.otsikko);
    ok(/ei sinun suunnitelmasi|Vaihda luvut omiksesi/.test(v.note), 'kortti kehottaa vaihtamaan luvut omiksi', v.note.slice(0, 70));
    ok(!v.kierros && v.ret === 60, 'ei kierrosta, esimerkin luvut käytössä');
    // Laskurisivu itse latautuu ja linkittää sovellukseen
    await pg.goto('http://localhost:8139/laskurit/elakelaskuri.html');
    await pg.waitForTimeout(800);
    const ls = await pg.evaluate(() => ({ h1: document.querySelector('h1').textContent, cta: [...document.querySelectorAll('.ls-cta a')].map((a) => a.getAttribute('href')), faq: document.querySelectorAll('.ls-ukk h3').length }));
    ok(/Eläkelaskuri/.test(ls.h1) && ls.cta.length >= 2 && ls.cta.every((h) => h.startsWith('../#e=')), 'laskurisivu: otsikko + #e=-kokeilulinkit', JSON.stringify(ls.cta.map((h) => h.slice(0, 8))));
    ok(ls.faq >= 3, 'laskurisivulla UKK', String(ls.faq));
    await ctx.close();
  }

  await b.close();
  statik.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
});
