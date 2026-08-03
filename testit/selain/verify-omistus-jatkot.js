/* Omistusten jatkojen verifiointi:
   A) palvelin-E2E: donate own* → stats.owned (share/value/loanLeft K_ANON-portein)
   B) selain: ramppi-sisäänkäynti, EXAMPLES-persona, perhejaettu omistus, Tilastot-kortti */
// Playwright NODE_PATHin kautta (ks. testit/README.md)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const p = require('path');

const ROOT = p.join(__dirname, '..', '..');
const OUT = process.env.VP_OUT || require('os').tmpdir();
let fail = 0;
const ok = (cond, msg, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond ? '' : '  [' + (extra || '') + ']')); if (!cond) fail++; };

/* ---------- A) palvelin-E2E ---------- */
async function serverE2E() {
  console.log('A) Palvelin: donate → stats.owned');
  const dataDir = p.join(OUT, 'srv-data-' + Math.floor(Math.random() * 1e6));
  fs.mkdirSync(dataDir, { recursive: true });
  const srv = spawn('node', [p.join(ROOT, 'palvelin/server.js')], {
    env: { ...process.env, PORT: '8788', DATA_DIR: dataDir, TULKKI_PUBLIC: '0' },
    stdio: 'ignore',
  });
  const API = 'http://localhost:8788';
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(API + '/health'); if (r.ok) break; } catch (e) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  const donate = (events, ip) => fetch(API + '/donate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({
      v: 1, ageNow: 40, ageEnd: 90, startCapital: 20000, monthly: 1200,
      savingsGrowth: 1.5, alloc: { stocks: 75, bonds: 15 }, glide: false,
      real: false, tax: true, events,
    }),
  });
  let sent = 0, okd = 0;
  for (let i = 0; i < 40; i++) {
    const r = await donate([
      { type: 'ownHome', age: 40, amount: -250000, loanLeft: 120000, rate: 3.5, years: 15, isAsset: true, appr: 2 },
      { type: 'retirement', age: 65, withdrawal: 3000, pension: 1800 },
    ], `10.1.${Math.floor(i / 5)}.${i % 5 + 1}`);
    sent++; if (r.status === 200) okd++;
  }
  for (let i = 0; i < 5; i++) {
    const r = await donate([{ type: 'retirement', age: 65, withdrawal: 2500, pension: 1500 }], `10.2.0.${i + 1}`);
    sent++; if (r.status === 200) okd++;
  }
  ok(okd === sent, `kaikki lahjoitukset läpi (${okd}/${sent})`);
  const stats = await (await fetch(API + '/stats.json')).json();
  const ow = stats.owned;
  ok(!!ow, 'stats.owned olemassa (total ' + stats.total + ')');
  if (ow) {
    ok(Math.abs(ow.share - 40 / 45) < 0.02, 'omistusaste ~0.89 (' + ow.share + ')');
    ok(ow.value && ow.value.p50 === 250000, 'arvon mediaani 250000 (' + (ow.value && ow.value.p50) + ')');
    ok(ow.loanLeft && ow.loanLeft.p50 === 120000, 'lainan mediaani 120000 (' + (ow.loanLeft && ow.loanLeft.p50) + ')');
    ok(ow.debtShare === 1, 'velallisten osuus 1 (' + ow.debtShare + ')');
  }
  ok(!!stats.groups, 'muut statsit ennallaan (groups)');
  srv.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

/* ---------- B) selain ---------- */
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

async function browserTests() {
  console.log('B) Selain');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'fi-FI' });
  await ctx.addInitScript(() => {
    localStorage.setItem('vp-tour-done', '1');
    localStorage.setItem('vp-autotour-off', '1');
    localStorage.setItem('vp-veto-vihje', '1');
    localStorage.setItem('vp-draw-tutored', '1');
  });
  const pg = await ctx.newPage();
  await pg.goto('http://localhost:8132/');
  await pg.waitForTimeout(1500);

  // 1) Ramppi: tuloskortin Omistan jo -nappi
  await pg.evaluate(() => showRamp());
  await pg.fill('#rampAge', '40'); await pg.fill('#rampWealth', '20000'); await pg.fill('#rampMonthly', '1200');
  await pg.click('#rampGo');
  // Ratkaisija + tuloskortti: kiinteä odotus fleikkasi kuormitetulla koneella,
  // odotetaan nappia itseään (timeout kaatuu ok(false):ksi, ei poikkeukseksi)
  const hasOwnBtn = await pg.waitForSelector('#rampOwn', { timeout: 15000 }).catch(() => null);
  ok(!!hasOwnBtn, 'tuloskortissa Omistan jo -nappi');
  if (hasOwnBtn) {
    await pg.click('#rampOwn');
    await pg.waitForTimeout(600);
    const r = await pg.evaluate(() => {
      const e = state.events.find((x) => x.type === 'ownHome');
      return e && { owned: !!e.owned, ageOk: e.age === state.ageNow, pop: !!document.querySelector('.popover') };
    });
    ok(r && r.owned && r.ageOk, 'ownHome lisätty nykyhetkeen (owned)');
    ok(r && r.pop, 'popover aukesi täytettäväksi');
    await pg.screenshot({ path: p.join(OUT, 'jatko-ramppi.png') });
  }

  // 2) EXAMPLES-persona
  const ex = await pg.evaluate(() => {
    const i = EXAMPLES.findIndex((x) => x.name.includes('Asunnonomistaja'));
    if (i < 0) return { i };
    applySaved(JSON.parse(JSON.stringify(EXAMPLES[i].data)));
    syncInputs(); renderAll();
    const e = state.events.find((x) => x.type === 'ownHome');
    return { i, n: EXAMPLES.length, owned: e && !!e.owned, ownYears: e && e.ownYears, loan: e && e.loanLeft };
  });
  ok(ex.i >= 0 && ex.n === 7, 'EXAMPLES: 7 personaa, Asunnonomistaja mukana');
  ok(ex.owned && ex.loan === 140000, 'persona normalisoitui (owned, laina 140 t€)');
  ok(ex.ownYears === new Date().getFullYear() - 2021, 'ownYears johdettu ostovuodesta (' + ex.ownYears + ')');
  await pg.waitForTimeout(1500);
  const succ = await pg.evaluate(() => sim && sim.successProb);
  ok(succ != null && succ > 0.8 && succ < 0.98, 'onnistuminen terve (' + succ + ')');

  // 3) Perhejaettu omistus: puolison lisäys → jakodialogi → puolitus → peilaus
  const dlg = await pg.evaluate(() => {
    addPerson('spouse');
    const d = document.querySelector('.share-ask');
    const cb = d && d.querySelector('[data-share]:checked');
    return { dlg: !!d, pre: !!cb };
  });
  ok(dlg.dlg, 'jakodialogi aukesi puolison lisäyksestä');
  ok(dlg.pre, 'ownHome esivalittu (SHARE_PRESET)');
  await pg.click('#shareApply');
  await pg.waitForTimeout(600);
  const halves = await pg.evaluate(() => {
    const mine = state.events.find((x) => x.type === 'ownHome');
    const other = family.persons.find((_, i) => i !== family.active);
    const peer = other.data.events.find((x) => x.type === 'ownHome');
    return {
      a: mine && mine.amount, l: mine && mine.loanLeft, sh: mine && !!mine.shared,
      pa: peer && peer.amount, pl: peer && peer.loanLeft, po: peer && !!peer.owned,
    };
  });
  ok(halves.sh && halves.a === -140000 && halves.l === 70000, 'oma osuus puolittui (' + halves.a + ' / ' + halves.l + ')');
  ok(halves.po && halves.pa === -140000 && halves.pl === 70000, 'peili puolisolla (' + halves.pa + ' / ' + halves.pl + ')');
  // kytkin auki → täysi omistus takaisin, pari poistuu
  await pg.evaluate(() => { const e = state.events.find((x) => x.type === 'ownHome'); openPopover(e.id); });
  await pg.waitForTimeout(300);
  const shBox = await pg.$('#pv-shared');
  ok(!!shBox, 'popoverissa Jaettu-kytkin omistukselle');
  if (shBox) {
    // checkbox on visuaalisesti .switch-spanin alla — klikataan suoraan DOM:ssa
    await pg.evaluate(() => document.getElementById('pv-shared').click());
    await pg.waitForTimeout(600);
    const back = await pg.evaluate(() => {
      const mine = state.events.find((x) => x.type === 'ownHome');
      const other = family.persons.find((_, i) => i !== family.active);
      const peer = other.data.events.find((x) => x.type === 'ownHome');
      return { a: mine.amount, l: mine.loanLeft, sh: !!mine.shared, peer: !!peer };
    });
    ok(!back.sh && back.a === -280000 && back.l === 140000, 'jaon purku palautti täyden (' + back.a + ' / ' + back.l + ')');
    ok(!back.peer, 'peili poistui puolisolta');
  }
  await pg.screenshot({ path: p.join(OUT, 'jatko-perhejako.png') });
  await ctx.close();

  // 4) Tilastot-kortti (mock + tyhjätila)
  const ctx2 = await b.newContext({ viewport: { width: 1200, height: 900 }, locale: 'fi-FI' });
  const pg2 = await ctx2.newPage();
  await pg2.goto('http://localhost:8132/analytiikka.html');
  await pg2.waitForTimeout(2000);
  const card = await pg2.evaluate(() => {
    const el = document.getElementById('ownedCard');
    const before = el ? el.innerHTML : null;
    renderOwned({ total: 60, kAnon: 30, owned: { n: 60, share: 0.35, debtShare: 0.7, value: { p25: 150000, p50: 250000, p75: 400000 }, loanLeft: { p25: 50000, p50: 100000, p75: 160000 } } }, null);
    return { exists: !!el, before, after: el.innerHTML };
  });
  ok(card.exists, 'ownedCard-kontti olemassa');
  ok(card.after && card.after.includes('35 %') && card.after.includes('250'), 'renderOwned piirtää osuuden ja mediaanin');
  await pg2.screenshot({ path: p.join(OUT, 'jatko-tilastot.png') });
  await ctx2.close();
  await b.close();
}

(async () => {
  await serverE2E();
  await new Promise((r) => statik.listen(8132, r));
  await browserTests();
  statik.close();
  console.log(fail ? 'VIRHEITÄ: ' + fail : 'Kaikki tarkistukset läpi.');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
