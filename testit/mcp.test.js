'use strict';

/* Varallisuuspolku MCP -testit (ei riippuvuuksia).
   Ajo: node testit/mcp.test.js

   Kaksi kerrosta: (1) sanitoi.js suoraan — purku, clampit, virheet;
   (2) palvelin lapsiprosessina MCP-kättelyineen — kultaiset luvut verrataan
   suoraan laskenta.js-kutsuun samalla sanitoidulla tilalla: kääre ei saa
   vääristää yhtään lukua. */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const L = require('../laskenta.js');
const S = require('../mcp/sanitoi.js');

let failed = 0;
function ok(cond, name, detail = '') {
  if (cond) { console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const r1 = (v) => Math.round(v * 10) / 10;

const PLAN = () => ({
  ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 1000, savingsGrowth: 1.5,
  allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
  events: [
    { type: 'home', age: 35, amount: -220000, financing: 'loan', down: 33000, rate: 3.5, years: 25, isAsset: true, appr: 2.0 },
    { type: 'car', age: 45, amount: -25000, financing: 'loan', down: 5000, rate: 4.5, years: 6, isAsset: true, appr: -10.0 },
    { type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 },
  ],
});
const linkiksi = (p) => 'https://varallisuuspolku.com#s=' + Buffer.from(JSON.stringify(p), 'utf8').toString('base64');

/* ===================== 1. Sanitoija ===================== */

console.log('Sanitoija: purku ja clampit');
{
  const st = S.lueSuunnitelma(PLAN());
  ok(st.ageNow === 30 && st.monthly === 1000 && st.events.length === 3, 'perussuunnitelma läpi sellaisenaan');
  const st2 = S.lueSuunnitelma(linkiksi(PLAN()));
  ok(JSON.stringify(st2) === JSON.stringify(st), 'jakolinkki purkautuu samaksi tilaksi kuin suora JSON');
  const st3 = S.lueSuunnitelma(JSON.stringify(PLAN()));
  ok(JSON.stringify(st3) === JSON.stringify(st), 'JSON-merkkijono purkautuu samaksi tilaksi');

  const iso = { ...PLAN(), allocStocks: 150, allocBonds: 80, inflation: 99, feePct: 22 };
  const c = S.lueSuunnitelma(iso);
  ok(c.allocStocks === 100 && c.allocBonds === 0, 'allokaatio clampataan (yht. ≤ 100)');
  ok(c.inflation === 15 && c.feePct === 10, 'inflaatio ja kulut clampataan');

  const owned = S.lueSuunnitelma({
    ...PLAN(),
    events: [{ type: 'ownHome', age: 50, amount: -280000, loanLeft: 150000, boughtYear: 2020 }],
  });
  const oe = owned.events[0];
  ok(oe.owned === true && oe.age === 30, 'omistuksen ikä ankkuroituu nykyhetkeen');
  ok(oe.rate === 3.5 && oe.years === 18 && oe.isAsset === true, 'omistuksen lainaoletukset täydentyvät');
  ok(oe.ownYears === new Date().getFullYear() - 2020, 'ownYears johdetaan hankintavuodesta');

  const ero = S.lueSuunnitelma({
    ...PLAN(),
    events: [{ type: 'divorce', age: 40, amount: -20000, recMonthly: -300, recYears: 5 }],
  });
  const de = ero.events[0];
  ok(de.type === 'divorce' && de.amount === -20000 && de.recMonthly === -300 && de.recYears === 5,
    'ero-tapahtuma (divorce) kelpaa kertakuluineen ja toistuvine kuluineen');
}

console.log('Sanitoija: virheet ovat selkokielisiä');
{
  const heittaa = (input, osa) => {
    try { S.lueSuunnitelma(input); return false; }
    catch (e) { return e instanceof S.SuunnitelmaVirhe && e.message.includes(osa); }
  };
  ok(heittaa({ ageNow: 30 }, 'ageEnd'), 'puuttuva pakollinen kenttä nimetään');
  ok(heittaa({ ...PLAN(), events: undefined }, 'events'), 'puuttuva events kerrotaan');
  ok(heittaa({ ...PLAN(), events: [{ type: 'yacht', age: 40 }] }, 'yacht'), 'tuntematon tapahtumatyyppi nimetään');
  ok(heittaa('#f=' + Buffer.from('{}').toString('base64'), 'simuloi_perhe'), 'perhelinkki yksilöpurussa → ohjaus simuloi_perheeseen');
  ok(heittaa('https://varallisuuspolku.com#s=roska!!!', 'kelvollista'), 'roskabase64 → selkeä virhe');
  ok(heittaa({ ...PLAN(), events: [PLAN().events[2], PLAN().events[2]] }, 'vain yksi'), 'kaksi eläketapahtumaa torjutaan');
}

/* ===================== 2. Palvelin lapsiprosessina ===================== */

const serverPath = path.join(__dirname, '..', 'mcp', 'server.js');
const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'inherit'] });

let seq = 0;
const odottajat = new Map();
let buf = '';
child.stdout.on('data', (d) => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const rivi = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!rivi.trim()) continue;
    const msg = JSON.parse(rivi);
    const w = odottajat.get(msg.id);
    if (w) { odottajat.delete(msg.id); w(msg); }
  }
});
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    odottajat.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => { if (odottajat.delete(id)) reject(new Error(method + ': aikakatkaisu')); }, 60000);
  });
}
const kutsu = (name, args) => rpc('tools/call', { name, arguments: args });

(async () => {
  console.log('MCP-kättely');
  {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'testi', version: '0' } });
    ok(init.result && init.result.serverInfo.name === 'varallisuuspolku-mcp', 'initialize → serverInfo');
    ok(init.result.protocolVersion === '2025-06-18', 'tuettu protokollaversio kaiutetaan');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const vanha = await rpc('initialize', { protocolVersion: '1999-01-01' });
    ok(vanha.result.protocolVersion === '2025-06-18', 'tuntematon versio → oma uusin');
    const ping = await rpc('ping', {});
    ok(ping.result && Object.keys(ping.result).length === 0, 'ping vastaa');
    const lista = await rpc('tools/list', {});
    ok(lista.result.tools.length === 6, 'tools/list: 6 työkalua');
    ok(lista.result.tools.every((t) => t.description.toLowerCase().includes('ei suosittele') || t.name === 'suunnitelman_skeema'), 'ei-neuvonta-linja työkalukuvauksissa');
  }

  console.log('simuloi_suunnitelma — kultaiset luvut moottoria vasten');
  {
    const st = S.lueSuunnitelma(PLAN());
    const sim = L.simulate(st, { paths: 300, sustainable: true });
    const r = await kutsu('simuloi_suunnitelma', { suunnitelma: linkiksi(PLAN()) });
    ok(!r.result.isError, 'kutsu onnistuu');
    const m = r.result.structuredContent.metriikat;
    ok(m.onnistumisTodennakoisyysPct === r1(sim.successProb * 100), 'onnistumis-% bitilleen moottorista', `${m.onnistumisTodennakoisyysPct} vs ${r1(sim.successProb * 100)}`);
    ok(m.loppuvarallisuusEur === Math.round(sim.wEnd), 'loppuvarallisuus bitilleen');
    ok(m.varallisuusElakeiassaEur === Math.round(sim.wAtRet), 'varallisuus eläkeiässä bitilleen');
    ok(m.kestavaKuukausituloEur === Math.round(sim.sustainableWd), 'kestävä tulo bitilleen');
    ok(m.verotYhteensaEur === Math.round(sim.taxPaid), 'verot bitilleen');
    const vt = r.result.structuredContent.vuositaulukko;
    ok(Array.isArray(vt) && vt.length >= 10 && vt.length <= 22, 'vuositaulukko harvennettu (≤22 riviä)', String(vt.length));
    ok(vt[0].ika === 30 && vt[vt.length - 1].ika === 90, 'taulukko kattaa koko elinkaaren');
    ok(r.result.content[0].text.includes('ei sijoitusneuvontaa'), 'vastuuvapaus tekstissä');
    const r2 = await kutsu('simuloi_suunnitelma', { suunnitelma: PLAN() });
    ok(JSON.stringify(r2.result.structuredContent) === JSON.stringify(r.result.structuredContent), 'deterministinen: sama syöte → sama vastaus bitilleen');
  }

  console.log('ratkaise_elakeika');
  {
    const st = S.lueSuunnitelma(PLAN());
    const retire = st.events.find((e) => e.type === 'retirement');
    retire.goal = 'age'; retire.withdrawal = 2000;
    const sim = L.simulate(st, { paths: 300, sustainable: true });
    const r = await kutsu('ratkaise_elakeika', { suunnitelma: PLAN(), kuukausitulo: 2000 });
    ok(!r.result.isError, 'kutsu onnistuu');
    ok(r.result.structuredContent.aikaisinElakeika === r1(sim.solvedRetireAge), 'ratkaistu eläkeikä bitilleen moottorista', `${r.result.structuredContent.aikaisinElakeika} vs ${r1(sim.solvedRetireAge)}`);
    const mahdoton = await kutsu('ratkaise_elakeika', { suunnitelma: PLAN(), kuukausitulo: 900000, varmuustaso: 0.95 });
    ok(!mahdoton.result.isError && mahdoton.result.structuredContent.saavutettavissa === false, 'mahdoton tavoite → saavutettavissa:false, ei kaatumista');
    const eiRetire = { ...PLAN(), events: [] };
    const er = await kutsu('ratkaise_elakeika', { suunnitelma: eiRetire, kuukausitulo: 2000 });
    ok(er.result.isError && er.result.content[0].text.includes('retirement'), 'puuttuva eläketapahtuma → opastava virhe');
  }

  console.log('ratkaise_saasto');
  {
    const st = S.lueSuunnitelma(PLAN());
    const retire = st.events.find((e) => e.type === 'retirement');
    retire.goal = 'saving'; retire.age = 60; retire.withdrawal = 2500;
    const sim = L.simulate(st, { paths: 300 });
    const r = await kutsu('ratkaise_saasto', { suunnitelma: PLAN(), elakeika: 60, kuukausitulo: 2500 });
    ok(!r.result.isError, 'kutsu onnistuu');
    ok(r.result.structuredContent.tarvittavaKuukausisaastoEur === Math.round(sim.requiredMonthly), 'tarvittava säästö bitilleen moottorista', `${r.result.structuredContent.tarvittavaKuukausisaastoEur} vs ${Math.round(sim.requiredMonthly)}`);
    ok(r.result.structuredContent.metriikatTarvittavallaSaastolla.onnistumisTodennakoisyysPct > 0, 'lopputilanne ratkaistulla säästöllä mukana');
    const huono = await kutsu('ratkaise_saasto', { suunnitelma: PLAN(), elakeika: 25, kuukausitulo: 2500 });
    ok(huono.result.isError && huono.result.content[0].text.includes('nykyikä'), 'eläkeikä ennen nykyikää → selkeä virhe');
  }

  console.log('vertaa_suunnitelmia');
  {
    const p60 = PLAN(); p60.events.find((e) => e.type === 'retirement').age = 60;
    const p65 = PLAN();
    const r = await kutsu('vertaa_suunnitelmia', {
      suunnitelmat: [
        { nimi: 'Eläkkeelle 60 v', suunnitelma: p60 },
        { nimi: 'Eläkkeelle 65 v', suunnitelma: linkiksi(p65) },
      ],
    });
    ok(!r.result.isError, 'kutsu onnistuu');
    const sc = r.result.structuredContent;
    ok(sc.vaihtoehdot.length === 2 && sc.vaihtoehdot[0].nimi === 'Eläkkeelle 60 v', 'molemmat vaihtoehdot mukana nimineen');
    ok(sc.parasIndeksi.loppuvarallisuusEur === 1, 'myöhempi eläkeikä → suurempi loppuvarallisuus (paras = 65 v)');
    ok(r.result.content[0].text.includes('◀ paras'), 'paras arvo merkitty tekstiin');
    const yksi = await kutsu('vertaa_suunnitelmia', { suunnitelmat: [{ nimi: 'A', suunnitelma: PLAN() }] });
    ok(yksi.result.isError, 'yksi vaihtoehto ei riitä vertailuun');
  }

  console.log('suunnitelman_skeema — silmukka takaisin simulaatioon');
  {
    const r = await kutsu('suunnitelman_skeema', {});
    ok(!r.result.isError, 'kutsu onnistuu');
    const sc = r.result.structuredContent;
    ok(sc.tapahtumatyypit.retirement && sc.tapahtumatyypit.ownHome && sc.tapahtumatyypit.goal, 'tapahtumatyypit dokumentoitu (ml. omistukset ja tavoitepiste)');
    ok(sc.kentat.pakolliset.ageNow && sc.kentat.valinnaiset.savePhases, 'pakolliset ja valinnaiset kentät listattu');
    const esim = await kutsu('simuloi_suunnitelma', { suunnitelma: sc.esimerkit.perussuunnitelma });
    ok(!esim.result.isError, 'skeeman perusesimerkki simuloituu sellaisenaan');
    const esim2 = await kutsu('simuloi_suunnitelma', { suunnitelma: sc.esimerkit.tapahtumarikas });
    ok(!esim2.result.isError, 'tapahtumarikas esimerkki simuloituu (omistus+lapsi+mökki+conf-tavoite)');
    ok(esim2.result.structuredContent.ratkaistu && esim2.result.structuredContent.ratkaistu.tavoite === 'withdrawal', 'esimerkin tavoitetila ratkaistaan');
  }

  console.log('simuloi_perhe — koherentti kotitalous-MC');
  {
    const puoliso = PLAN();
    puoliso.ageNow = 32; puoliso.monthly = 700;
    puoliso.events.find((e) => e.type === 'retirement').age = 63;
    const perhe = {
      persons: [
        { pid: 'p0', name: 'Minä', role: 'me', data: PLAN() },
        { pid: 'p1', name: 'Puoliso', role: 'spouse', data: puoliso },
      ],
      active: 0,
    };
    const linkki = 'https://varallisuuspolku.com#f=' + Buffer.from(JSON.stringify(perhe), 'utf8').toString('base64');
    const r = await kutsu('simuloi_perhe', { perhe: linkki });
    ok(!r.result.isError, 'perhelinkki purkautuu ja laskenta onnistuu');
    const sc = r.result.structuredContent;
    ok(sc.henkilot.length === 2 && sc.henkilot[1].nimi === 'Puoliso' && sc.henkilot[1].rooli === 'spouse', 'molemmat henkilöt rooleineen mukana');
    const suora = L.mcHousehold(S.luePerhe(perhe).map((h) => h.st), { paths: 300 });
    ok(sc.perheenOnnistumisTodennakoisyysPct === r1(suora.successProb * 100), 'perheen onnistumis-% bitilleen moottorin mcHouseholdista', `${sc.perheenOnnistumisTodennakoisyysPct} vs ${r1(suora.successProb * 100)}`);
    const yksin = await kutsu('simuloi_suunnitelma', { suunnitelma: PLAN() });
    ok(sc.henkilot[0].metriikat.onnistumisTodennakoisyysPct === yksin.result.structuredContent.metriikat.onnistumisTodennakoisyysPct, 'henkilön oma metriikka sama kuin yksilötyökalussa');
    // Koherenssitodistus: identtiset henkilöt jakavat saman markkinahistorian →
    // yhteinen onnistuminen on p, EI p² (sama todistus kuin sivuston testeissä)
    const kaksois = L.mcHousehold([S.lueSuunnitelma(PLAN()), S.lueSuunnitelma(PLAN())], { paths: 300 });
    const yksi = L.mcHousehold([S.lueSuunnitelma(PLAN())], { paths: 300 });
    ok(kaksois.successProb === yksi.successProb, 'koherenssi: identtiset henkilöt → sama onnistumis-% (p, ei p²)');
    // Ristiinohjaus: väärä linkkityyppi opastaa oikeaan työkaluun
    const vaara1 = await kutsu('simuloi_suunnitelma', { suunnitelma: linkki });
    ok(vaara1.result.isError && vaara1.result.content[0].text.includes('simuloi_perhe'), '#f= yksilötyökalussa → opastus simuloi_perheeseen');
    const vaara2 = await kutsu('simuloi_perhe', { perhe: linkiksi(PLAN()) });
    ok(vaara2.result.isError && vaara2.result.content[0].text.includes('simuloi_suunnitelma'), '#s= perhetyökalussa → opastus simuloi_suunnitelmaan');
    const liikaa = await kutsu('simuloi_perhe', { perhe: { persons: [1, 2, 3, 4, 5].map(() => ({ name: 'X', data: PLAN() })) } });
    ok(liikaa.result.isError && liikaa.result.content[0].text.includes('enintään'), 'yli 4 henkilöä torjutaan');
  }

  console.log('Protokollavirheet');
  {
    const tuntematon = await kutsu('avaa_lompakko', {});
    ok(tuntematon.error && tuntematon.error.code === -32602, 'tuntematon työkalu → -32602');
    const metodi = await rpc('resources/list', {});
    ok(metodi.error && metodi.error.code === -32601, 'tuntematon metodi → -32601');
  }

  console.log('Paketin eheys');
  {
    const kopio = path.join(__dirname, '..', 'mcp', 'laskenta.js');
    if (fs.existsSync(kopio)) {
      const a = fs.readFileSync(kopio), b = fs.readFileSync(path.join(__dirname, '..', 'laskenta.js'));
      ok(a.equals(b), 'mcp/laskenta.js on tavuidenttinen juuren kanssa (aja kopioi-laskenta.js jos ei)');
    } else {
      console.log('  – mcp/laskenta.js ei paikalla (repo-ajo käyttää juuren tiedostoa suoraan) — ok');
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mcp', 'package.json'), 'utf8'));
    ok(pkg.files.includes('laskenta.js') && pkg.scripts.prepack.includes('kopioi-laskenta'), 'julkaisu kantaa moottorin (files + prepack)');
  }

  child.stdin.end();
  console.log(failed ? `\n${failed} TESTIÄ PUNAISENA` : '\nKaikki MCP-testit vihreitä.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Testiajo kaatui:', e); child.kill(); process.exit(1); });
