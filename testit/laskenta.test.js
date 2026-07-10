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

console.log(failed ? `\n${failed} TESTIÄ EPÄONNISTUI` : '\nKaikki testit läpi.');
process.exit(failed ? 1 : 0);
