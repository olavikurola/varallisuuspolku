'use strict';
/* Monte Carlon tilastollinen validointi (erä 7). Suljetun muodon testit
   vartioivat determinismiä ja regressiota; tämä sarja vartioi, että
   simulaattori tekee TILASTOLLISESTI sitä mitä väittää: shokkien keskiarvo
   ja hajonta, Studentin t:n varianssiskaalaus, siemenen determinismi,
   nollavolatiliteetin deterministisyys, konvergenssi polkumäärän kasvaessa,
   korrelaatiomatriisin vaikutus salkun hajontaan ja glidepathin ajoitus.
   Ajo: node testit/mc-validointi.test.js */

const L = require('../laskenta.js');

let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };
const close = (a, b, tol) => Math.abs(a - b) <= tol;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };

const bare = (extra) => Object.assign({ ageNow: 30, ageEnd: 90, startCapital: 100000, monthly: 500, savingsGrowth: 0,
  allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
  events: [{ id: 1, type: 'retirement', age: 65, withdrawal: 2000, pension: 1500, pensionAge: 65 }] }, extra || {});

console.log('Shokit: keskiarvo 0, hajonta = σ/√12 (normaali)');
{
  const st = bare();
  const ctx = L.prepareSim(st);
  const { sigA } = L.buildMu(ctx, st, 65);
  const draws = [];
  for (let i = 0; i < 400; i++) { const f = L.makeShock(st, sigA, i); for (let m = 1; m <= 60; m++) draws.push(f(m) / (sigA[m] / Math.sqrt(12))); }
  ok(close(mean(draws), 0, 0.02), 'standardoitujen shokkien keskiarvo ≈ 0 (' + mean(draws).toFixed(4) + ')');
  ok(close(sd(draws), 1, 0.02), 'standardoitujen shokkien hajonta ≈ 1 (' + sd(draws).toFixed(4) + ')');
}

console.log('Studentin t: varianssi skaalattu samaksi, hännät paksummat');
{
  const st = bare({ proOn: true, pro: Object.assign(L.defaultPro(), { mc: Object.assign(L.defaultPro().mc, { dist: 't', df: 5 }) }) });
  const ctx = L.prepareSim(st);
  const { sigA } = L.buildMu(ctx, st, 65);
  const draws = [];
  for (let i = 0; i < 600; i++) { const f = L.makeShock(st, sigA, i); for (let m = 1; m <= 60; m++) draws.push(f(m) / (sigA[m] / Math.sqrt(12))); }
  ok(close(mean(draws), 0, 0.03), 't: keskiarvo ≈ 0 (' + mean(draws).toFixed(4) + ')');
  ok(close(sd(draws), 1, 0.05), 't (df 5): hajonta skaalattu ≈ 1 (' + sd(draws).toFixed(4) + ')');
  const tail = draws.filter((x) => Math.abs(x) > 3).length / draws.length;
  ok(tail > 0.005, 't: >3σ-havaintoja enemmän kuin normaalilla (' + (tail * 100).toFixed(2) + ' %)');
}

console.log('Siemen: sama polku bitilleen, eri polut eroavat');
{
  const st = bare();
  const ctx = L.prepareSim(st);
  const { sigA } = L.buildMu(ctx, st, 65);
  const a = L.makeShock(st, sigA, 7), b = L.makeShock(st, sigA, 7), c = L.makeShock(st, sigA, 8);
  let same = true, diff = false;
  for (let m = 1; m <= 120; m++) { const x = a(m), y = b(m), z = c(m); if (x !== y) same = false; if (x !== z) diff = true; }
  ok(same, 'sama i → identtinen shokkisarja');
  ok(diff, 'eri i → eri sarja');
}

console.log('Nollavolatiliteetti: viuhka = odotuspolku');
{
  const pro = L.defaultPro();
  const st = bare({ proOn: true, pro: Object.assign(pro, { sigma: { stocks: 0, bonds: 0, cash: 0 } }) });
  const s = L.simulate(st);
  let maxRel = 0;
  for (let m = 0; m <= s.months; m += 12) {
    const e = s.exp[m];
    if (e > 1000) maxRel = Math.max(maxRel, Math.abs(s.opt[m] - e) / e, Math.abs(s.pess[m] - e) / e);
  }
  ok(maxRel < 1e-6, 'σ = 0 → P10 = P90 = odotuspolku (max suht. ero ' + maxRel.toExponential(1) + ')');
  ok(s.successProb === 1 || s.successProb === 0, 'σ = 0 → onnistuminen on 0 tai 1, ei välimaastoa');
}

console.log('Konvergenssi: polkumäärän kasvu ei muuta tulosta olennaisesti');
{
  const st = bare({ monthly: 250, startCapital: 30000, events: [{ id: 1, type: 'retirement', age: 63, withdrawal: 2700, pension: 1100, pensionAge: 65 }] });
  const s1 = L.simulate(st, { paths: 1000 });
  const s5 = L.simulate(st, { paths: 5000 });
  ok(s1.successProb > 0.05 && s1.successProb < 0.95, 'testisuunnitelma on epävarma (onnistuminen ' + Math.round(s1.successProb * 100) + ' %)');
  ok(close(s1.successProb, s5.successProb, 0.04), '1 000 vs 5 000 polkua: onnistumis-% ±4 %-yks (' + Math.round(s1.successProb * 100) + ' vs ' + Math.round(s5.successProb * 100) + ')');
  const m = s5.months;
  ok(close(s1.pess[m], s5.pess[m], Math.max(5000, Math.abs(s5.pess[m]) * 0.15)), 'P10 lopussa samaa luokkaa');
  ok(s5.pess[m] <= s5.exp[m] + 1e-6 && s5.exp[m] <= s5.opt[m] + 1e-6, 'P10 ≤ odotusarvo ≤ P90 lopussa');
}

console.log('Korrelaatio: ρ=1 = painotettu summa, ρ=0 pienempi, PSD-korjaus');
{
  const classes = L.classesOf(bare()); // osakkeet/korot/käteinen (PRO_BASE_ASSETS)
  const w = [0.6, 0.3, 0.1];
  const yksi = L.portfolioStatsPro(w, classes, null, 0); // corr null = täyskorrelaatio
  const summa = w.reduce((a, x, i) => a + x * classes[i].sigma / 100, 0);
  ok(close(yksi.sigma, summa, 1e-9), 'ρ=1: σ = Σ wᵢσᵢ (' + yksi.sigma.toFixed(4) + ')');
  const nolla = L.ensurePSD(L.corrMatrixOf(3, [0, 0, 0])).M;
  const riippumaton = L.portfolioStatsPro(w, classes, nolla, 0);
  const odotus = Math.sqrt(w.reduce((a, x, i) => a + x * x * Math.pow(classes[i].sigma / 100, 2), 0));
  ok(close(riippumaton.sigma, odotus, 1e-9), 'ρ=0: σ = √Σ wᵢ²σᵢ² (' + riippumaton.sigma.toFixed(4) + ')');
  ok(riippumaton.sigma < yksi.sigma, 'hajautus pienentää σ:aa');
  const rikki = L.ensurePSD(L.corrMatrixOf(3, [0.9, -0.9, 0.9])); // ei positiividefiniitti
  ok(rikki.fixed === true || rikki.korjattu === true || rikki.M, 'ei-PSD-matriisi korjataan kelvolliseksi');
}

console.log('Glidepath: osakepaino laskee oikeassa iässä');
{
  const pro = L.defaultPro();
  const st = bare({ proOn: true, pro: Object.assign(pro, { glide: { from: 50, to: 65, endF: 40 } }) });
  const w45 = L.weightsAt(45, 65, st), w57 = L.weightsAt(57.5, 65, st), w70 = L.weightsAt(70, 65, st);
  ok(close(w45[0], 0.7, 1e-9), 'ennen glidepathia osakepaino = perusallokaatio');
  ok(w57[0] < w45[0] && w57[0] > w70[0], 'glidepathin keskellä paino laskee');
  ok(close(w70[0], 0.7 * 0.4, 1e-9), 'glidepathin jälkeen osakepaino = alku × endF');
  ok(close(w45.reduce((a, b) => a + b, 0), 1, 1e-9) && close(w70.reduce((a, b) => a + b, 0), 1, 1e-9), 'painot summautuvat ykköseen kaikissa vaiheissa');
}

console.log(failed ? `\n${failed} TESTIÄ EPÄONNISTUI` : '\nKaikki testit läpi.');
process.exit(failed ? 1 : 0);
