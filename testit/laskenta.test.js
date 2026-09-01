'use strict';

/* Varallisuuspolku — laskentaytimen yksikkötestit (ei riippuvuuksia).
   Ajo: node testit/laskenta.test.js */

const L = require('../laskenta.js');

let failed = 0;
function ok(cond, name, detail = '') {
  if (cond) { console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}
const close = (a, b, tol) => Math.abs(a - b) <= tol;

const plan = () => ({
  ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 1000, savingsGrowth: 1.5,
  allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
  events: [
    { id: 1, type: 'home', age: 35, amount: -220000, financing: 'loan', down: 33000, rate: 3.5, years: 25, isAsset: true, appr: 2.0 },
    { id: 2, type: 'car', age: 45, amount: -25000, financing: 'loan', down: 5000, rate: 4.5, years: 6, isAsset: true, appr: -10.0 },
    { id: 3, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 },
  ],
});

console.log('CRN-determinismi');
{
  const a = L.simulate(plan()), b = L.simulate(plan());
  ok(a.successProb === b.successProb, 'sama seed → sama onnistumis-% bitilleen');
  ok(a.exp.length === b.exp.length && a.exp.every((v, i) => v === b.exp[i]), 'odotuspolku bitilleen sama');
  ok([...a.opt].every((v, i) => v === b.opt[i]) && [...a.pess].every((v, i) => v === b.pess[i]), 'viuhka (P10/P90) bitilleen sama');
  const c = L.simulate(plan(), { paths: 1000 });
  ok(c.mcPaths === 1000 && Math.abs(c.successProb - a.successProb) < 0.1, 'polkumäärä parametroituu, tulos samaa luokkaa');
}

console.log('Viuhka samasta MC-joukosta');
{
  const s = L.simulate(plan());
  let sane = true;
  for (let m = 0; m <= s.months; m++) if (!(s.pess[m] <= s.opt[m] + 1e-6)) sane = false;
  ok(sane, 'P10 ≤ P90 joka kuukausi');
  ok(s.pess[0] === 20000 && s.opt[0] === 20000, 'viuhka alkaa alkupääomasta');
}

console.log('runPath stopAt = collect-polun arvo');
{
  const st = plan();
  const ctx = L.prepareSim(st);
  const { muM } = L.buildMu(ctx, st, 65);
  const full = L.runPath(ctx, st, 2400, 65, muM, { clamp0: true, collect: true });
  for (const m of [0, 1, 120, 419, 720]) {
    const stop = L.runPath(ctx, st, 2400, 65, muM, { clamp0: true, stopAt: m });
    if (stop.stopW !== full.arr[m]) { ok(false, `stopAt ${m}`, `${stop.stopW} !== ${full.arr[m]}`); break; }
    if (m === 720) ok(true, 'stopAt vastaa täyttä polkua (5 pistettä)');
  }
}

console.log('Raahausratkaisija: monotonisuus ja bisektio');
{
  const st = plan();
  const sim = L.simulate(st, { light: false });
  const s = L.makeDragSolver(st, sim);
  const w1 = s.wealthAtMonthly(500, 55), w2 = s.wealthAtMonthly(1500, 55);
  ok(w1 < w2, 'varallisuus kasvaa säästön mukana');
  const v1 = s.wealthAtWd(1000, 80), v2 = s.wealthAtWd(4000, 80);
  ok(v1 > v2, 'varallisuus laskee nostotason mukana');
  // käänteisratkaisu: hae säästö, jolla polku kulkee (55 v, 600 000 €) kautta
  const target = 600000;
  const solved = L.solveParam((ms) => s.wealthAtMonthly(ms, 55), target, 0, 1e6, true);
  ok(close(s.wealthAtMonthly(solved, 55), target, 50), 'bisektio osuu tavoitteeseen ±50 €',
    String(s.wealthAtMonthly(solved, 55)));
}

console.log('Tavoitepisteet: tiukin sitoo');
{
  const st = plan();
  st.events.push({ id: 4, type: 'goal', age: 50, amount: 300000 });
  st.events.push({ id: 5, type: 'goal', age: 55, amount: 900000 });
  const sim = L.simulate(st);
  const r = L.solveGoalsMonthly(st, [{ age: 50, value: 300000 }, { age: 55, value: 900000 }], sim);
  ok(r != null && r.bindingIndex === 1, 'tiukempi piste (900 t€ @ 55 v) sitoo', JSON.stringify(r));
  const s = L.makeDragSolver(st, sim);
  ok(s.wealthAtMonthly(r.monthly, 55) >= 900000 - 100, 'ratkaistu säästö täyttää tiukimman pisteen');
  ok(s.wealthAtMonthly(r.monthly, 50) >= 300000 - 100, 'löysempi piste toteutuu samalla');
  // goal-tapahtuma ei saa vaikuttaa kassavirtaan
  const st2 = plan();
  const base = L.simulate(st2);
  st2.events.push({ id: 9, type: 'goal', age: 50, amount: 500000 });
  const withGoal = L.simulate(st2);
  ok(base.exp.every((v, i) => v === withGoal.exp[i]), 'tavoitepiste ei muuta kassavirtaa');
  ok(withGoal.goalShares === null || withGoal.goalShares === undefined, 'goalShares vain pyydettäessä');
  const shares = L.simulate(st2, { goals: [{ age: 50, value: 500000 }] }).goalShares;
  ok(Array.isArray(shares) && shares[0] >= 0 && shares[0] <= 1, 'ylitysosuus ∈ [0,1]', String(shares));
}

console.log('Kevyt frame (light) jäädyttää stokastiikan');
{
  const st = plan();
  const frozen = L.simulate(st, { sustainable: true });
  st.monthly = 1400;
  const light = L.simulate(st, { light: true, frozen, sustainable: true });
  ok(light.successProb === frozen.successProb && light.successStale === true, 'onnistumis-% jäädytetty + stale-merkintä');
  ok(light.opt === frozen.opt, 'viuhka jäädytetty (sama viite)');
  ok(light.exp[light.months] > frozen.exp[frozen.months], 'odotuspolku reagoi säästöön');
  ok(light.sustainableWd > frozen.sustainableWd, 'kestävä tulo lasketaan deterministisesti myös kevyessä framessa');
}

console.log('Kestävä tulo = goal withdrawal -ratkaisu');
{
  const st = plan();
  const a = L.simulate(st, { sustainable: true });
  const st2 = plan();
  st2.events.find((e) => e.type === 'retirement').goal = 'withdrawal';
  const b = L.simulate(st2);
  ok(close(a.sustainableWd, b.solvedWithdrawal, 1), 'sama luku molempia reittejä', `${a.sustainableWd} vs ${b.solvedWithdrawal}`);
}

console.log('Apurit');
{
  ok(L.snapTo(447, 10) === 450 && L.snapTo(-1499, 1000) === -1000 && L.snapTo(63.4, 1) === 63, 'snapTo');
  ok(L.round2sig(123456) === 120000 && L.round2sig(-8765) === -8800 && L.round2sig(0) === 0, 'round2sig');
  const arr = new Float32Array([5, 1, 9, 3, 7, 2, 8, 4, 6, 0]);
  ok(L.kthSmallest(arr.slice(), 0) === 0 && L.kthSmallest(arr.slice(), 9) === 9 && L.kthSmallest(arr.slice(), 4) === 4, 'kthSmallest');
}

console.log('Pro: oletusarvot = perustila bitilleen');
{
  const a = L.simulate(plan());
  const st = plan();
  st.proOn = true;
  st.pro = L.defaultPro();
  const b = L.simulate(st);
  ok(a.exp.every((v, i) => v === b.exp[i]), 'odotuspolku identtinen pro-oletuksilla');
  ok(a.successProb === b.successProb, 'onnistumis-% identtinen');
  ok([...a.opt].every((v, i) => v === b.opt[i]), 'viuhka identtinen');
  st.proOn = false; // vipu pois: pro-asetukset passiivisia
  st.pro.mu.stocks = 15;
  const c = L.simulate(st);
  ok(a.exp.every((v, i) => v === c.exp[i]), 'proOn=false → asetukset eivät vaikuta');
}

console.log('Pro: markkinaoletukset');
{
  const st = plan();
  st.proOn = true;
  st.pro = L.defaultPro();
  st.pro.mu.stocks = 9;
  const hi = L.simulate(st);
  ok(hi.wEnd > L.simulate(plan()).wEnd, 'suurempi tuotto-odotus kasvattaa loppuvarallisuutta');
  // kovarianssi: tyypilliset korrelaatiot < täyskorrelaatio → pienempi σ → parempi onnistumis-%
  const st2 = plan();
  st2.proOn = true;
  st2.pro = L.defaultPro();
  st2.pro.corr = [0.2, 0, 0.2];
  const cov = L.simulate(st2);
  const base = L.simulate(plan());
  ok(cov.successProb >= base.successProb, 'hajautushyöty ei heikennä onnistumista', `${cov.successProb} vs ${base.successProb}`);
  ok(cov.exp.every((v, i) => v === base.exp[i]), 'korrelaatiot eivät muuta odotuspolkua');
  // PSD-pakotus: mahdoton matriisi kutistuu eikä kaada laskentaa
  const badM = L.corrMatrixOf(3, [1, -0.5, 1]);
  const fixed = L.ensurePSD(badM);
  ok(fixed.shrunk === true, 'ei-PSD-matriisi kutistetaan');
  ok(isFinite(L.portfolioStatsPro([0.5, 0.3, 0.2], L.classesOf(st2), fixed.M, 0).sigma), 'kutistettu matriisi antaa äärellisen σ:n');
  // TER syö tuottoa
  const st3 = plan();
  st3.proOn = true;
  st3.pro = L.defaultPro();
  st3.pro.ter = 1;
  ok(L.simulate(st3).wEnd < base.wEnd, 'TER pienentää loppuvarallisuutta');
  // t-jakauma: deterministinen ja eri kuin normaali
  const st4 = plan();
  st4.proOn = true;
  st4.pro = L.defaultPro();
  st4.pro.mc.dist = 't';
  st4.pro.mc.df = 4;
  const t1 = L.simulate(st4), t2 = L.simulate(JSON.parse(JSON.stringify(st4)));
  ok(t1.successProb === t2.successProb, 't-jakauma deterministinen (CRN)');
  ok(t1.successProb !== base.successProb, 't-jakauma eroaa normaalista');
  // siemen vaihtaa maailmanhistoriat mutta ei odotuspolkua
  const st5 = plan();
  st5.proOn = true;
  st5.pro = L.defaultPro();
  st5.pro.mc.seed = 42;
  const s5 = L.simulate(st5);
  ok(s5.exp.every((v, i) => v === base.exp[i]), 'siemen ei muuta odotuspolkua');
}

console.log('Pro: strategiat, vaiheistus ja verot');
{
  const base = L.simulate(plan());
  // %-salkusta: ei ehdy, ratkaisijat ohitetaan
  const stP = plan();
  stP.proOn = true;
  stP.pro = L.defaultPro();
  stP.pro.wd.mode = 'pct';
  stP.pro.wd.pct = 4;
  stP.events.find((e) => e.type === 'retirement').goal = 'withdrawal';
  const pct = L.simulate(stP);
  ok(pct.depletionAge == null, 'prosenttistrategia ei ehdy');
  ok(pct.solvedWithdrawal == null, 'ratkaisija ohitetaan pct-strategiassa');
  // guardrails: ajautuu ja pysyy äärellisenä; bisektio toimii (endW monotoninen)
  const stG = plan();
  stG.proOn = true;
  stG.pro = L.defaultPro();
  stG.pro.wd.mode = 'guard';
  const g = L.simulate(stG);
  ok(isFinite(g.wEnd), 'guardrails laskee');
  // vaiheistus: pienempi kulutus loppuiässä → suurempi loppuvarallisuus
  const stF = plan();
  stF.proOn = true;
  stF.pro = L.defaultPro();
  stF.pro.phases = [{ to: 75, mult: 100 }, { to: 85, mult: 85 }, { to: 200, mult: 70 }];
  ok(L.simulate(stF).wEnd > base.wEnd, 'go-go/slow-go kasvattaa loppuvarallisuutta');
  // hankintameno-olettama: vero ei kasva, tyypillisesti pienenee
  const stA = plan();
  stA.proOn = true;
  stA.pro = L.defaultPro();
  stA.pro.tax.acq = true;
  ok(L.simulate(stA).taxPaid <= base.taxPaid + 1, 'hankintameno-olettama ei kasvata veroa');
  // veroparametrit: nollavero = ei veroa
  const stT = plan();
  stT.proOn = true;
  stT.pro = L.defaultPro();
  stT.pro.tax.low = 0; stT.pro.tax.high = 0;
  ok(L.simulate(stT).taxPaid < 1, 'nollaveroparametrit nollaavat veron');
}

console.log('Pro: analyysit ja stressit');
{
  const st = plan();
  st.proOn = true;
  st.pro = L.defaultPro();
  st.pro.mc.stress = ['bear', 'lost'];
  const s = L.simulate(st);
  ok(Array.isArray(s.stress) && s.stress.length === 2, 'stressipolut lasketaan');
  ok(s.stress[0].arr.length === s.months + 1, 'stressipolku täysimittainen');
  ok(s.stress[0].arr[s.months] < s.exp[s.months], 'karhuskenaario odotettua heikompi');

  // Sekvenssiriskin pari: sama karhu heti nyt (from:'now') vs eläkkeen alussa —
  // varhainen shokki osuu pieneen salkkuun, joten loppusalkku kärsii vähemmän
  const st5 = plan();
  st5.proOn = true; st5.pro = L.defaultPro();
  st5.pro.mc.stress = ['bear', 'seqNow', 'crash', 'lost', 'stagf'];
  const s5 = L.simulate(st5);
  ok(s5.stress.length === 5, 'viisi stressiä kerralla (katto nostettu)');
  const byKey = Object.fromEntries(s5.stress.map((x) => [x.key, x]));
  ok(byKey.seqNow.arr[12] < s5.exp[12], 'seqNow painaa polkua jo alussa');
  ok(byKey.bear.arr[12] === s5.exp[12], 'bear ei kosketa säästövaihetta');
  ok(byKey.seqNow.arr[s5.months] > byKey.bear.arr[s5.months], 'varhainen karhu lievempi kuin eläkkeen alun karhu (sekvenssiriski)');
  ok(byKey.crash.arr[s5.months] < s5.exp[s5.months], 'romahdus −50 % heikentää loppusalkkua');
  ok(s.ruinCurve && s.ruinCurve[s.months] >= 0 && s.ruinCurve[s.months] <= 1, 'ehtymiskäyrä ∈ [0,1]');
  ok(Math.abs((1 - s.ruinCurve[s.months]) - s.successProb) < 1e-9, 'ehtymiskäyrän loppu = 1 − onnistumis-%');
  st.pro.mc.pctLo = 5; st.pro.mc.pctHi = 95;
  const wide = L.simulate(st);
  ok(wide.pess[600] <= s.pess[600] && wide.opt[600] >= s.opt[600], 'P5–P95 leveämpi kuin P10–P90');
  const rows = L.tornado(plan());
  ok(rows.length >= 6 && Math.abs(rows[0].delta) >= Math.abs(rows[rows.length - 1].delta), 'tornado järjestää herkkyydet');
  const sus = L.sustainableByAge(plan(), 5);
  ok(sus.length > 5 && sus.every((p, i) => i === 0 || p.wd >= sus[i - 1].wd - 1), 'kestävä tulo kasvaa eläkeiän myötä', JSON.stringify(sus.slice(0, 3)));
}

console.log('Kotitalous (Perhevirta): koherentti perhe-MC');
{
  const a = plan();
  const b = plan();
  b.ageNow = 28;
  b.monthly = 500;
  b.startCapital = 5000;
  b.events = [{ id: 1, type: 'retirement', age: 65, withdrawal: 1500, pension: 1200, pensionAge: 65 }];
  const ra = L.simulate(a), rb = L.simulate(b);
  const r = L.mcHousehold([a, b], { paths: 300 });
  ok(r.months === Math.max(ra.months, rb.months), 'yhteinen horisontti = pisin henkilöistä');
  ok(r.successProb <= Math.min(ra.successProb, rb.successProb) + 1e-9, 'perheen onnistuminen ≤ heikoin henkilö');
  ok(r.successProb === L.mcHousehold([a, b], { paths: 300 }).successProb, 'deterministinen (CRN)');
  let band = true;
  for (let m = 0; m <= r.months; m += 7) if (r.p10[m] > r.p90[m] + 1e-6) band = false;
  ok(band, 'perheviuhka P10 ≤ P90');
  const tot = L.householdExp([ra, rb]);
  ok(Math.abs(tot[0] - (a.startCapital + b.startCapital)) < 1e-6, 'yhteiskäyrä alkaa pääomien summasta');
  ok(Math.abs(tot[100] - (ra.exp[100] + rb.exp[100])) < 1e-6, 'yhteiskäyrä = odotuspolkujen summa');
  ok(Math.abs(tot[tot.length - 1] - (ra.exp[ra.months] + rb.exp[Math.min(tot.length - 1, rb.months)])) < 1e-6, 'lyhyempi horisontti jäädytetään loppuarvoon');
  // Koherenssin todistus: identtiset henkilöt jakavat saman markkinakohtalon —
  // riippumattomissa maailmoissa perheonnistuminen olisi p², samassa p
  const r2 = L.mcHousehold([plan(), plan()], { paths: 300 });
  ok(Math.abs(r2.successProb - ra.successProb) < 1e-9, 'sama maailma: identtiset henkilöt → sama onnistumis-%', `${r2.successProb} vs ${ra.successProb}`);
}

console.log('Korkoa korolle: analyyttiset identiteetit joka elinkaarivaiheessa');
{
  // Suljetun muodon kaavat: k = kuukausikerroin (1+mu)^(1/12).
  // Moottorin odotuspolun on osuttava näihin liukulukutarkkuudella.
  const k = Math.pow(1.07, 1 / 12);
  const relClose = (a, b, tol, name, extra) => ok(Math.abs(a - b) <= tol * Math.abs(b), name, `${a} vs ${b}${extra || ''}`);

  // (1) Kertyminen pelkällä alkupääomalla: w_n = S·1,07^(n/12)
  const acc = {
    ageNow: 30, ageEnd: 40, startCapital: 50000, monthly: 0, savingsGrowth: 0,
    allocStocks: 100, allocBonds: 0, glide: false, real: false, tax: false, events: [],
  };
  const rAcc = L.simulate(acc);
  relClose(rAcc.exp[120], 50000 * Math.pow(1.07, 10), 1e-9, 'pääoma kompoundaa: S·(1+r)^t');

  // (2) Kuukausisäästö: annuiteetin päätearvo w_n = C·(k^n − 1)/(k − 1)
  const sav = { ...acc, startCapital: 0, monthly: 500, events: [] };
  const rSav = L.simulate(sav);
  relClose(rSav.exp[120], 500 * (Math.pow(k, 120) - 1) / (k - 1), 1e-9,
    'säästövirta kompoundaa: annuiteetin päätearvo');

  // (3) REALISOINTIVAIHE: nostojen jälkeen jäljelle jäävä pääoma jatkaa
  // kompoundaamista — w_n = S·k^n − W·(k^n − 1)/(k − 1)
  const wd = {
    ageNow: 60, ageEnd: 70, startCapital: 1000000, monthly: 0, savingsGrowth: 0,
    allocStocks: 100, allocBonds: 0, glide: false, real: false, tax: false,
    events: [{ id: 1, type: 'retirement', age: 60, withdrawal: 2000, pension: 0 }],
  };
  const rWd = L.simulate(wd);
  relClose(rWd.exp[120], 1000000 * Math.pow(k, 120) - 2000 * (Math.pow(k, 120) - 1) / (k - 1), 1e-9,
    'realisointivaihe: jäljelle jäävä pääoma kompoundaa nostojen välissä');

  // (4) Verojen menetetty tuotto: aikaisin maksettu vero ei kompoundaa
  // omistajalle → varallisuusero verolliseen > nimellisesti maksetut verot
  const wdTax = { ...wd, tax: true, events: [{ id: 1, type: 'retirement', age: 60, withdrawal: 2000, pension: 0 }] };
  const rWdTax = L.simulate(wdTax);
  ok(rWdTax.taxPaid > 0, 'nostoista kertyy veroa');
  ok(rWd.exp[120] - rWdTax.exp[120] > rWdTax.taxPaid,
    'verojen menetetty korkoa korolle näkyy (ero > maksetut verot)',
    `ero ${Math.round(rWd.exp[120] - rWdTax.exp[120])} vs verot ${Math.round(rWdTax.taxPaid)}`);

  // (4b) Inflaatiokorjaus tarkalla Fisher-kaavalla: w_n = S·(1,07/1,02)^(n/12)
  const rl = { ...acc, real: true };
  const rRl = L.simulate(rl);
  relClose(rRl.exp[120], 50000 * Math.pow(1.07 / 1.02, 10), 1e-9,
    'reaalituotto Fisher-kaavalla (sama kuin omaisuuserissä)');

  // (4c) Käyttäjän oma inflaatio-oletus: asettamaton = 2 % (ennallaan);
  // eksplisiittinen 2 % bittiidenttinen; korkeampi pienentää reaalivarallisuutta;
  // vaikuttaa vain kun real=true
  const inflBase = plan(); inflBase.real = true; // ei inflation-kenttää → oletus 2 %
  const inflExplicit = plan(); inflExplicit.real = true; inflExplicit.inflation = 2;
  const rBase = L.simulate(inflBase), rExpl = L.simulate(inflExplicit);
  ok(rExpl.exp.every((v, i) => v === rBase.exp[i]), 'oma inflaatio 2 % = oletus (bittiidenttinen)');
  const inflHi = plan(); inflHi.real = true; inflHi.inflation = 4;
  ok(L.simulate(inflHi).exp[120] < rBase.exp[120], 'korkeampi inflaatio pienentää reaalivarallisuutta');
  const inflNoReal = plan(); inflNoReal.inflation = 5; // real=false → ei vaikutusta
  const nomBase = L.simulate(plan()); // nimellinen (real=false)
  ok(L.simulate(inflNoReal).exp.every((v, i) => v === nomBase.exp[i]), 'inflaatio ei vaikuta ilman inflaatiokorjausta');

  // (5) Omaisuuserä: arvo kompoundaa geometrisesti kuukausittain
  const ast = {
    ...acc, startCapital: 0, monthly: 0,
    events: [{ id: 1, type: 'home', age: 30, amount: -220000, financing: 'cash', isAsset: true, appr: 2.0 }],
  };
  const rAst = L.simulate(ast);
  relClose(rAst.assets[120], 220000 * Math.pow(1.02, 10), 1e-9, 'omaisuuserä kompoundaa: P·(1+a)^t');

  // (6) Palkkakehitys: kasvava säästövirta — kasvavan annuiteetin päätearvo
  // w_n = C·Σ g^((j−1)/12)·k^(n−j), g = 1,015 (suora summa vertailuna)
  const grw = { ...acc, startCapital: 0, monthly: 500, savingsGrowth: 1.5 };
  const rGrw = L.simulate(grw);
  let ref = 0;
  for (let j = 1; j <= 120; j++) ref = ref * k + 500 * Math.pow(1.015, (j - 1) / 12);
  relClose(rGrw.exp[120], ref, 1e-9, 'kasvava säästövirta kompoundaa oikein');
}

console.log('Sijoitustili (kuori) ja kulut');
{
  // Identiteetti: puuttuva/oletus-acct ja nollakulut = bitilleen entinen polku
  const base = L.simulate(plan());
  const st1 = plan();
  st1.acct = 'aot'; st1.feePct = 0; st1.wrapFee = 0; st1.divYield = 0;
  const r1 = L.simulate(st1);
  ok(r1.exp.every((v, i) => v === base.exp[i]), 'oletusarvoilla polku bitilleen sama');
  ok(L.acctOf({}) === 'aot' && L.acctOf({ acct: 'ost' }) === 'ost' && L.acctOf({ acct: 'x' }) === 'aot', 'acctOf normalisoi');

  // OST = AOT kun ei osinkoja eikä hankintameno-olettamaa: sama voitto-
  // osuusverotus → identtinen polku (dokumentoi mallin rehellisesti)
  const stOst = plan(); stOst.acct = 'ost';
  const rOst = L.simulate(stOst);
  ok(rOst.exp.every((v, i) => v === base.exp[i]), 'OST = AOT ilman osinkoja/olettamaa (sama voitto-osuusvero)');

  // Kulut vähentävät tuottoa; vakuutuskuoren kulu tulee päälle vain ins-tilillä
  const stFee = plan(); stFee.feePct = 1;
  ok(L.simulate(stFee).wEnd < base.wEnd, 'sijoituskulu pienentää loppuvarallisuutta');
  const stIns = plan(); stIns.acct = 'ins'; stIns.wrapFee = 0.5;
  const stAotWrap = plan(); stAotWrap.wrapFee = 0.5;
  ok(L.simulate(stIns).wEnd < base.wEnd, 'kuoren kulu pienentää tuottoa vakuutuskuorella');
  ok(L.simulate(stAotWrap).wEnd === base.wEnd, 'kuoren kulu ei vaikuta arvo-osuustilillä');

  // Osinkoverojarru: vain AOT + vero päällä; kuorissa osingot kertyvät verotta
  const stDivA = plan(); stDivA.divYield = 3.5;
  const stDivO = plan(); stDivO.divYield = 3.5; stDivO.acct = 'ost';
  const stDivNoTax = plan(); stDivNoTax.divYield = 3.5; stDivNoTax.tax = false;
  const baseNoTax = plan(); baseNoTax.tax = false;
  ok(L.simulate(stDivA).wEnd < base.wEnd, 'osinkovero jarruttaa arvo-osuustilillä');
  ok(L.simulate(stDivO).wEnd === base.wEnd, 'OST:lla osingot verotta (kuoren hyöty)');
  ok(L.simulate(stDivNoTax).wEnd === L.simulate(baseNoTax).wEnd, 'ilman verokytkintä osinkojarrua ei ole');
  ok(L.simulate(stDivO).wEnd > L.simulate(stDivA).wEnd, 'vertailu: sama salkku kuoressa voittaa osinko-osakkeilla');

  // Hankintameno-olettama (Pro) koskee vain arvo-osuustiliä
  const withAcq = (acct) => {
    const st = plan();
    st.proOn = true;
    st.pro = { tax: { acq: true } };
    if (acct) st.acct = acct;
    return L.simulate(st);
  };
  const plain = (acct) => {
    const st = plan();
    if (acct) st.acct = acct;
    return L.simulate(st);
  };
  ok(withAcq(null).taxPaid <= plain(null).taxPaid + 1e-9, 'olettama ei ainakaan kasvata veroa (AOT)');
  ok(withAcq('ost').taxPaid === plain('ost').taxPaid, 'olettama ei vaikuta OST:lla (portti)');
  ok(withAcq('ins').taxPaid === plain('ins').taxPaid, 'olettama ei vaikuta vakuutuskuorella (portti)');
}

console.log('%-nostostrategia: onnistuminen mittaa tulotarpeen täyttymistä');
{
  // Davidin bugiraportti (X, 13.7.2026): pct-nostossa salkku ei koskaan ehdy
  // → onnistuminen oli rakenteellisesti aina 100 %. Nyt tulotarve on lattia.
  const fire = (pct, need, pension = 0) => ({
    ageNow: 40, ageEnd: 90, startCapital: 300000, monthly: 0, savingsGrowth: 0,
    allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: false,
    proOn: true, pro: { wd: { mode: 'pct', pct } },
    events: [{ id: 1, type: 'retirement', age: 41, withdrawal: need, pension, pensionAge: 41 }],
  });
  const agro = L.simulate(fire(20, 2000));
  ok(agro.successProb < 0.05, 'ahne 20 %/v nosto 2 000 €/kk tarpeella epäonnistuu', String(agro.successProb));
  ok(agro.depletionAge != null, 'alitusikä raportoituu (Riittävyys-kortti)');
  const swr = L.simulate(fire(4, 1000));
  ok(swr.successProb > agro.successProb, 'maltillinen nosto + pieni tarve onnistuu useammin',
    `${swr.successProb} vs ${agro.successProb}`);
  const noFloor = L.simulate(fire(20, 0));
  ok(noFloor.successProb === 1 && noFloor.depletionAge == null, 'tarve 0 = ei lattiaa (entinen käytös)');
  const penCover = L.simulate(fire(20, 1500, 2000));
  ok(penCover.successProb === 1, 'työeläke tarpeen yli → nosto saa huveta (ei alitusta)');

  // Alitusvyöhykkeet graafiin: %-tilassa dryZones = jaksot joissa tulo < tarve
  ok(agro.dryZones.length >= 1 && agro.dryKind === 'floor', 'alitusvyöhyke piirtyy (dryKind floor)',
    JSON.stringify({ n: agro.dryZones.length, kind: agro.dryKind }));
  ok(agro.dryZones[0].from < 55, 'ahne nosto alittaa tarpeen jo alkuvuosina', String(agro.dryZones[0] && agro.dryZones[0].from));
  // Myöhään alkava työeläke nostaa tulon takaisin tarpeen yli → vyöhyke päättyy
  const rec = L.simulate((() => {
    const st = fire(12, 1500);
    st.events[0].pension = 1600;
    st.events[0].pensionAge = 75;
    return st;
  })());
  ok(rec.dryZones.length >= 1 && rec.dryZones.every((z) => z.to <= 75.2),
    'työeläkkeen alkaminen päättää alitusvyöhykkeen', JSON.stringify(rec.dryZones));
  // Kiinteä strategia ennallaan: ehtyminen ja vanha teksti
  const fix = L.simulate({ ...fire(0, 0), proOn: false, pro: null,
    events: [{ id: 1, type: 'retirement', age: 41, withdrawal: 5000, pension: 0 }] });
  ok(fix.dryKind === 'depleted' && fix.depletionAge != null, 'kiinteä strategia: ehtymissemantiikka ennallaan');
}

console.log('Porrastettu säästö (savePhases): kaistoittainen kuukausisumma');
{
  const base = {
    ageNow: 30, ageEnd: 65, startCapital: 0, monthly: 500, savingsGrowth: 0,
    allocStocks: 100, allocBonds: 0, glide: false, real: false, tax: false, events: [],
  };
  const m35 = Math.round((35 - 30) * 12), m50 = Math.round((50 - 30) * 12);
  // Ilman aikataulua: tasainen perussäästö 500 €/kk
  const c0 = L.prepareSim(base);
  const f0 = L.runPath(c0, base, 0, null, L.buildMu(c0, base, null).muM, { clamp0: true, collect: true });
  ok(close(f0.flows.contrib[m35], 500, 0.01) && close(f0.flows.contrib[m50], 500, 0.01), 'ilman aikataulua tasainen 500 €/kk');
  // Aikataululla: 500 (30-40 v), 1000 (40-65 v) — säästö elää elämänvaiheittain
  const st = { ...base, savePhases: [{ to: 40, amount: 500 }, { to: 65, amount: 1000 }] };
  const c1 = L.prepareSim(st);
  const f1 = L.runPath(c1, st, 0, null, L.buildMu(c1, st, null).muM, { clamp0: true, collect: true });
  ok(close(f1.flows.contrib[m35], 500, 0.01), 'kaista 1: 500 €/kk (30-40 v)', String(f1.flows.contrib[m35]));
  ok(close(f1.flows.contrib[m50], 1000, 0.01), 'kaista 2: 1000 €/kk (40-65 v)', String(f1.flows.contrib[m50]));
  // Säästö voi myös LASKEA kaistalta toiselle (esim. lyhennysvuodet)
  const dn = { ...base, savePhases: [{ to: 45, amount: 800 }, { to: 65, amount: 300 }] };
  const c3 = L.prepareSim(dn);
  const f3 = L.runPath(c3, dn, 0, null, L.buildMu(c3, dn, null).muM, { clamp0: true, collect: true });
  ok(close(f3.flows.contrib[m35], 800, 0.01) && close(f3.flows.contrib[m50], 300, 0.01), 'säästö voi laskea kaistoittain (800 → 300)');
  // Kasvu kertautuu aikataulun päälle
  const stG = { ...st, savingsGrowth: 1.5 };
  const c2 = L.prepareSim(stG);
  const f2 = L.runPath(c2, stG, 0, null, L.buildMu(c2, stG, null).muM, { clamp0: true, collect: true });
  ok(close(f2.flows.contrib[m50], 1000 * Math.pow(1.015, (m50 - 1) / 12), 1), 'säästön kasvu kertautuu aikataulun päälle');
}

console.log('Lainanhoito yli säästökyvyn (X-palaute 24.7.2026)');
{
  // 130 k€ remontti: lyhyt laina ≈ käteisosto (ero vain korko ja ajoitus).
  // Vanha malli jätti säästön ylittävän erän maksamatta ("loput palkasta")
  // → laina 1 v voitti käteisen ~1,8 M€:lla. Nyt erotus myydään salkusta.
  const mk = (fin) => {
    const st = { ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 1000, savingsGrowth: 1.5,
      allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
      events: [{ id: 1, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 },
        { id: 2, type: 'renovation', age: 40, amount: -130000, ...fin }] };
    return L.simulate(st).wEnd;
  };
  const cash = mk({});
  const loan1 = mk({ financing: 'loan', down: 0, rate: 3, years: 1 });
  const loan10 = mk({ financing: 'loan', down: 0, rate: 3, years: 10 });
  ok(Math.abs(loan1 - cash) / cash < 0.03, 'laina 1 v ≈ käteisosto (ero < 3 %)', `${Math.round(loan1)} vs ${Math.round(cash)}`);
  ok(loan10 > loan1 && (loan10 - loan1) / cash < 0.10, 'pidempi laina = maltillinen vipuhyöty, ei ilmaista rahaa', `${Math.round(loan10)} vs ${Math.round(loan1)}`);
}

console.log('Varmuustaso-ratkaisu (karkea→tarkka)');
{
  const st = plan();
  const r = L.solveGoalsMonthlyConf(st, [{ age: 55, value: 500000 }], 0.85, 1000, null);
  ok(r != null && r.monthly > 0, 'ratkaisu löytyy', JSON.stringify(r));
  // tarkistus: osuus poluista ylittää pisteen ratkaistulla säästöllä
  const st2 = plan();
  st2.monthly = r.monthly;
  const share = L.simulate(st2, { paths: 1000, goals: [{ age: 55, value: 500000 }] }).goalShares[0];
  ok(share >= 0.84, 'vähintään ~85 % poluista ylittää pisteen', String(share));
}

console.log('Omistukset (owned): nykytila alkuehtona');
{
  // Identiteetti: ilman owned-lippua ostotapahtuma käyttäytyy bitilleen ennallaan
  const a = L.simulate(plan()), b = L.simulate(plan());
  ok(a.exp.every((v, i) => v === b.exp[i]), 'ei owned-tapahtumia → polku bitilleen ennallaan');

  // Velaton omistus: näkyy varallisuutena, ei kosketa sijoituspolkuun
  const st = plan();
  st.events.push({ id: 9, type: 'ownCottage', owned: true, age: 30, amount: -100000, isAsset: true, appr: 0, loanLeft: 0 });
  const ctx = L.prepareSim(st);
  ok(close(ctx.assets[0], 100000, 1), 'omistus varallisuutena kuukaudesta 0', String(ctx.assets[0]));
  ok(close(ctx.lump.get(0) || 0, 0, 1e-9), 'ei ostohetken kassavirtaa');
  ok(ctx.debt[0] === 0, 'velaton: ei velkasaldoa');
  const s0 = L.simulate(plan()), s1 = L.simulate(st);
  ok(s1.exp.every((v, i) => v === s0.exp[i]), 'velaton omistus ei muuta sijoituspolkua');

  // Laina: velka alkaa jäljellä olevasta, annuiteetti juoksee, loppuu ajallaan
  // (pohja ilman osto-lainoja, jotta payments/lump ovat pelkän omistuksen)
  const bare = () => { const s = plan(); s.events = s.events.filter((e) => e.type === 'retirement'); return s; };
  const st2 = bare();
  st2.events.push({ id: 9, type: 'ownHome', owned: true, age: 30, amount: -250000, isAsset: true, appr: 0, loanLeft: 120000, rate: 3.0, years: 10 });
  const c2 = L.prepareSim(st2);
  const pmt = L.loanPayment(120000, 3.0, 10);
  ok(close(c2.debt[0], 120000, 0.01), 'velka alkaa jäljellä olevasta');
  ok(close(c2.payments[1], pmt, 0.01), 'kk-erä = annuiteetti jäljellä olevasta', String(c2.payments[1]));
  ok(c2.debt[120] < 1 && close(c2.payments[120], pmt, 0.01) && c2.payments[121] === 0, 'laina päättyy täsmälleen 10 vuodessa');

  // Tallennettuun ikään ei luoteta: sama tulos vaikka age olisi jäänyt vanhaksi
  const st2b = JSON.parse(JSON.stringify(st2));
  st2b.events.find((e) => e.owned).age = 27; // ageNow muuttunut tallennuksen jälkeen
  const c2b = L.prepareSim(st2b);
  ok(close(c2b.debt[0], 120000, 0.01) && close(c2b.assets[0], 250000, 1), 'owned ankkuroituu aina kuukauteen 0');

  // Verovapaa myynti: arvo − jäljellä oleva laina sijoituksiin
  const st3 = JSON.parse(JSON.stringify(st2));
  const oh = st3.events.find((e) => e.owned);
  oh.sellAge = 35; oh.sellTaxFree = true;
  const c3 = L.prepareSim(st3);
  const mS = (35 - 30) * 12;
  const info = c3.saleInfos.find((x) => x.id === 9);
  ok(info && info.tax === 0 && close(info.value, 250000, 1), 'verovapaa myynti: arvo ilman veroa (appr 0)', JSON.stringify(info));
  ok(close((c3.lump.get(mS) || 0), info.value - info.payoff, 0.01), 'myyntierä = arvo − lainan poismaksu');
  ok(info.payoff > 0 && info.payoff < 120000, 'poismaksu = lyhennetty saldo');

  // Verollinen myynti: hankintameno-olettama; ownYears siirtää 10 v -rajan yli
  const mk = (ownYears) => {
    const s = plan();
    s.events.push({ id: 9, type: 'ownFlat', owned: true, age: 30, amount: -200000, isAsset: true, appr: 0, loanLeft: 0, ownYears, sellAge: 35, sellTaxFree: false });
    const i = L.prepareSim(s).saleInfos.find((x) => x.id === 9);
    return i.tax;
  };
  const taxShort = mk(0);   // pito 5 v → olettama 20 % → verotettava 80 %
  const taxLong = mk(12);   // pito 5+12 v ≥ 10 → olettama 40 % → verotettava 60 %
  ok(close(taxShort, 0.8 * 200000 * 0.30 + Math.max(0, 0.8 * 200000 - 30000) * 0.04, 2000), 'olettama 20 % alle 10 v pidolla', String(taxShort));
  ok(taxLong < taxShort && close(taxLong / taxShort, 0.6 / 0.8, 0.05), 'ownYears vie 40 % olettamaan', `${taxLong} vs ${taxShort}`);
}

console.log('Hankintameno-olettama kk-nostoissa: verokirjanpito seuraa olettamaa');
{
  // Pitkä horisontti → salkun voitto-osuus eläkkeellä ylittää 60 % → olettama
  // leikkaa. Raportoidun veron (taxPaid) pitää täsmätä bruttoutuksen veroon
  // (Σ flows.tax) — aiemmin taxPaid kirjattiin todellisesta voitosta ja
  // liioitteli veroa jonka bruttoutus oli jo laskenut olettamalla.
  const st = plan();
  st.startCapital = 100000;
  st.ageEnd = 95;
  st.events = [{ id: 1, type: 'retirement', age: 60, withdrawal: 3000, pension: 0, pensionAge: 65 }];
  st.proOn = true;
  st.pro = L.defaultPro();
  st.pro.tax.acq = true;
  const s = L.simulate(st);
  let flowTax = 0;
  for (let m = 0; m < s.flows.tax.length; m++) flowTax += s.flows.tax[m];
  ok(flowTax > 0 && close(s.taxPaid, flowTax, Math.max(1, flowTax * 1e-9)),
    'taxPaid = Σ bruttoutuksen verot kun olettama leikkaa', `${s.taxPaid} vs ${flowTax}`);
  const st2 = JSON.parse(JSON.stringify(st));
  st2.pro.tax.acq = false;
  const s2 = L.simulate(st2);
  ok(s2.taxPaid > s.taxPaid, 'olettama pienentää raportoitua veroa (voitto-osuus > 60 %)');
}

console.log('Ero / iso muutos (divorce): kertakulu + toistuva kulunlisäys');
{
  const bare = () => { const s = plan(); s.events = s.events.filter((e) => e.type === 'retirement'); return s; };
  const base = L.simulate(bare());
  // Käteinen: kertakulu kuukauden könttänä, toistuva kulu vähentää säästöä
  const st = bare();
  st.events.push({ id: 9, type: 'divorce', age: 40, amount: -20000, financing: 'cash', recMonthly: -300, recYears: 5 });
  const ctx = L.prepareSim(st);
  const m0 = (40 - 30) * 12;
  ok(close(ctx.lump.get(m0) || 0, -20000, 1e-9), 'kertakulu kirjautuu tapahtumakuukauteen');
  ok(close(ctx.payments[m0 + 1], 300, 1e-9) && close(ctx.payments[m0 + 60], 300, 1e-9) && ctx.payments[m0 + 61] === 0,
    'toistuva kulu juoksee täsmälleen 5 vuotta');
  const s = L.simulate(st);
  ok(s.wEnd < base.wEnd, 'ero pienentää loppuvarallisuutta');
  // Laina: käsiraha heti, loppu annuiteettina — ei omaisuuserää (ei isAsset)
  const st2 = bare();
  st2.events.push({ id: 9, type: 'divorce', age: 40, amount: -20000, financing: 'loan', down: 4000, rate: 4.5, years: 10 });
  const c2 = L.prepareSim(st2);
  ok(close(c2.lump.get(m0) || 0, -4000, 1e-9), 'lainarahoitus: käsiraha könttänä');
  ok(close(c2.debt[m0], 16000, 0.01), 'velka = summa − käsiraha');
  ok(c2.assets[m0] === 0, 'ei omaisuuserää — kulu, ei omaisuutta');
}

/* ===== Pääomatuloveron porras: raja on KYNNYS, ei jako =====
   Auditointilöydös 8/2026: myynti (saleTax) jakoi portaan oikein, mutta
   kuukausinosto sovelsi koko summaan yhtä kantaa. */
console.log('Pääomatulovero portaittain');
{
  const B = 30000, LO = 0.30, HI = 0.34;
  ok(close(L.capitalTax(5000, 0, B, LO, HI), 1500, 1e-9), 'täysin rajan alla → 30 %');
  ok(close(L.capitalTax(30000, 0, B, LO, HI), 9000, 1e-9), 'täsmälleen rajalla → 30 %');
  ok(close(L.capitalTax(30001, 0, B, LO, HI), 9000 + 0.34, 1e-9), 'raja + 1 € → ylimenevä 34 %');
  ok(close(L.capitalTax(60000, 0, B, LO, HI), 30000 * LO + 30000 * HI, 1e-9), 'iso voitto jakautuu portaisiin');
  ok(close(L.capitalTax(5000, 29000, B, LO, HI), 1000 * LO + 4000 * HI, 1e-9), 'ytd kuluttaa rajan: 1000/4000-jako');
  ok(close(L.capitalTax(5000, 30000, B, LO, HI), 5000 * HI, 1e-9), 'raja jo täynnä → kaikki 34 %');
  ok(L.capitalTax(0, 0, B, LO, HI) === 0 && L.capitalTax(-5, 0, B, LO, HI) === 0, 'ei voittoa → ei veroa');
  let inv = true;
  for (const need of [1000, 21000, 30000, 90000]) {
    for (const ratio of [0.2, 0.6, 1]) {
      const g = L.grossUp(need, ratio, 0, B, LO, HI);
      if (!close(g - L.capitalTax(ratio * g, 0, B, LO, HI), need, 1e-6)) inv = false;
    }
  }
  ok(inv, 'bruttoutus on portaittaisen veron käänteisfunktio (12 tapausta)');
  const g2 = L.grossUp(20000, 0.5, 29000, B, LO, HI);
  ok(close(g2 - L.capitalTax(0.5 * g2, 29000, B, LO, HI), 20000, 1e-6), 'bruttoutus huomioi ytd:n');
}

/* ===== Reaalitila: nimelliset sopimukset deflatoituvat =====
   Auditointilöydös 8/2026: tuotot ja omaisuuden arvonnousu deflatoitiin,
   mutta lainaerä ja velkasaldo jäivät nimellisiksi — reaalitilassa laina
   näytti 25 vuoden päässä 64 % liian kalliilta. */
console.log('Reaalitila vs. nimellistila');
{
  const plan = (real, loanAge) => ({
    ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 3000, savingsGrowth: 0,
    allocStocks: 70, allocBonds: 20, glide: false, real, tax: true,
    events: [
      { id: 1, type: 'home', age: loanAge, amount: -300000, financing: 'loan', down: 0, rate: 3.5, years: 25, isAsset: true, appr: 0 },
      { id: 3, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 },
    ],
  });
  const i = L.INFLATION; // jo murtolukuna (0.02), ei prosenttina
  const nom = L.prepareSim(plan(false, 30)).payments;
  const rea = L.prepareSim(plan(true, 30)).payments;
  ok(close(nom[1], nom[300], 1e-9), 'nimellistilassa erä on vakio');
  ok(rea[300] < rea[1] * 0.7, 'reaalitilassa erän ostovoima laskee');
  let deflOk = true;
  for (const m of [1, 60, 120, 240, 300]) {
    if (!close(rea[m], nom[m] * Math.pow(1 + i, -m / 12), 1e-6 * nom[m])) deflOk = false;
  }
  ok(deflOk, 'reaalierä = nimelliserä × (1+i)^(−t) joka kuukausi');
  const nom2 = L.prepareSim(plan(false, 40)).payments;
  const rea2 = L.prepareSim(plan(true, 40)).payments;
  const m0 = (40 - 30) * 12;
  ok(close(rea2[m0 + 1], nom2[m0 + 1] * Math.pow(1 + i, -1 / 12), 1e-6 * nom2[m0 + 1]),
    'myöhempi laina deflatoituu OSTOHETKESTÄ, ei suunnitelman alusta');
  ok(rea2[m0 + 1] > rea[m0 + 1] * 1.2, 'ostohetkiankkurointi: myöhempi laina ei perusteettoman halpa');
  const dN = L.prepareSim(plan(false, 30)).debt, dR = L.prepareSim(plan(true, 30)).debt;
  ok(close(dR[120], dN[120] * Math.pow(1 + i, -120 / 12), 1e-6 * dN[120]), 'velkasaldo deflatoituu');
  ok(close(dR[0], dN[0], 1e-9), 'lainan alkusaldo sama molemmissa tiloissa');
}

/* Vero kohdistuu NIMELLISVOITTOON myös reaalitilassa. */
console.log('Reaalitilan vero nimellisvoitosta');
{
  const plan = (real) => ({
    ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 1500, savingsGrowth: 0,
    allocStocks: 100, allocBonds: 0, glide: false, real, tax: true,
    events: [{ id: 3, type: 'retirement', age: 65, withdrawal: 3000, pension: 0, pensionAge: 65 }],
  });
  const sN = L.simulate(plan(false)), sR = L.simulate(plan(true));
  ok(sR.taxPaid > 0 && sN.taxPaid > 0, 'molemmissa tiloissa maksetaan veroa');
  const shareN = sN.taxPaid / Math.max(1, sN.wEnd);
  const shareR = sR.taxPaid / Math.max(1, sR.wEnd);
  ok(shareR > shareN * 0.5, 'reaalitilan verorasitus ei romahda (nimellinen voitto-osuus käytössä)');
}

/* ===== Allokaation invariantti: painojen summa ei ylitä 100 % =====
   Auditointilöydös 8/2026: tuotu Pro-data pääsi moottoriin sellaisenaan ja
   tuotti hiljaisen vivutuksen. */
console.log('Allokaation invariantti');
{
  const bare = () => ({ ageNow: 30, ageEnd: 90, startCapital: 0, monthly: 0,
    allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true, events: [] });
  const w0 = L.weightsAt(40, 65, bare());
  ok(close(w0.reduce((a, b) => a + b, 0), 1, 1e-12), 'normaali allokaatio summautuu ykköseen');
  ok(close(w0[0], 0.7, 1e-12) && close(w0[1], 0.2, 1e-12), 'normaali allokaatio ennallaan (ei skaalausta)');
  const st = bare();
  st.proOn = true;
  st.pro = Object.assign(L.defaultPro(), { assets: [{ key: 'x', name: 'X', mu: 7, sigma: 16, weight: 100 }] });
  const w1 = L.weightsAt(40, 65, st);
  ok(close(w1.reduce((a, b) => a + b, 0), 1, 1e-9), '70+20+100 % normalisoituu ykköseen (ei vivutusta)');
  ok(w1.every((x) => x >= 0), 'yksikään paino ei ole negatiivinen');
  const st2 = bare();
  st2.proOn = true;
  st2.pro = Object.assign(L.defaultPro(), { assets: [{ key: 'y', name: 'Y', mu: 5, sigma: 10, weight: -50 }] });
  const w2 = L.weightsAt(40, 65, st2);
  ok(w2.every((x) => x >= 0), 'negatiivinen paino ei tuota lyhyeksimyyntiä');
}

/* ===== Osinkovero seuraa Pro-verokantaa (ctx.taxLow) =====
   Kirjattu 8/2026: buildMu luki TAX_LOW-vakiota ohi ctx:n → Pro tax.low ei
   vaikuttanut AOT:n osinkoveroon. Vertailut Pro–Pro, koska tax.low vaikuttaa
   myös nostoveroon. */
console.log('Osinkovero ja Pro-verokanta');
{
  const bare = (extra) => Object.assign({ ageNow: 30, ageEnd: 70, startCapital: 50000, monthly: 500, savingsGrowth: 0,
    allocStocks: 100, allocBonds: 0, glide: false, real: false, tax: true, acct: 'aot', divYield: 3,
    events: [{ id: 1, type: 'retirement', age: 65, withdrawal: 1000, pension: 0, pensionAge: 65 }] }, extra || {});
  const proTax = (low) => Object.assign(L.defaultPro(), { tax: { low, high: 34, bracket: 30000, acq: false } });
  const perus = L.simulate(bare());
  const eiOsinkoa = L.simulate(bare({ divYield: 0 }));
  ok(perus.wEnd < eiOsinkoa.wEnd, 'AOT: osinkovero jarruttaa tuottoa perustilassa');
  // Pro tax.low=0: osinkovero nollaan → divYield ei vaikuta polkuun
  const p0a = L.simulate(bare({ proOn: true, pro: proTax(0) }));
  const p0b = L.simulate(bare({ proOn: true, pro: proTax(0), divYield: 0 }));
  ok(close(p0a.wEnd, p0b.wEnd, 1e-9 * p0b.wEnd), 'Pro tax.low=0 → osinkotuotto ei jarruta (ctx.taxLow, ei vakio)');
  // Alempi Pro-kanta → pienempi osinkojarru → suurempi loppuvarallisuus
  const p15 = L.simulate(bare({ proOn: true, pro: proTax(15) }));
  const p30 = L.simulate(bare({ proOn: true, pro: proTax(30) }));
  ok(p15.wEnd > p30.wEnd, 'Pro tax.low 15 % antaa suuremman lopun kuin 30 % (osinkovero seuraa kantaa)');
  // Pro oletuskannalla (30) tulos = perustila bitilleen
  const proOletus = L.simulate(bare({ proOn: true, pro: L.defaultPro() }));
  ok(proOletus.wEnd === perus.wEnd, 'Pro oletuskannalla osinkovero bitilleen sama kuin perustilassa');
}

console.log(failed ? `\n${failed} TESTIÄ EPÄONNISTUI` : '\nKaikki testit läpi.');
process.exit(failed ? 1 : 0);
