'use strict';
/* Skeema-golden (erä 7): vanhojen jakolinkkien ja tallenteiden TALOUDELLINEN
   MERKITYS ei saa muuttua hiljaa. Fixtures ovat todellisia suunnitelma-JSONeja
   eri aikakausilta (ilman sv-kenttää = versio 1, pro, omistukset, porrastus),
   ja odotetut tunnusluvut on tallennettu tiedostoon. Kun moottoria muutetaan
   TARKOITUKSELLA (kuten 29.8. ja 2.9.2026 verokorjaukset), odotteet
   päivitetään tietoisesti: node testit/skeema-golden.test.js --paivita
   ja muutos kirjataan validointisivun muutoslokiin.
   Ajo: node testit/skeema-golden.test.js */

const fs = require('fs');
const path = require('path');
const L = require('../laskenta.js');

const F = path.join(__dirname, 'fixtures', 'skeema-golden.json');
const paivita = process.argv.includes('--paivita');
let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };

const FIXTURES = {
  // Heinäkuun 2026 muotoinen linkki: vain peruskentät, ei sv:tä, ei pro:ta
  'v1-perus': { ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 1000, savingsGrowth: 1.5,
    allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
    events: [
      { id: 1, type: 'home', age: 35, amount: -220000, financing: 'loan', down: 33000, rate: 3.5, years: 25, isAsset: true, appr: 2.0 },
      { id: 2, type: 'car', age: 45, amount: -25000, financing: 'loan', down: 5000, rate: 4.5, years: 6, isAsset: true, appr: -10.0 },
      { id: 3, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 }] },
  // Omistukset (25.7.2026) + verollinen myynti + reaalitila
  'v1-omistus-reaali': { ageNow: 40, ageEnd: 90, startCapital: 80000, monthly: 900, savingsGrowth: 1.0,
    allocStocks: 60, allocBonds: 30, glide: true, real: true, tax: true, inflation: 2,
    events: [
      { id: 1, type: 'ownHome', age: 40, amount: -280000, owned: true, loanLeft: 140000, rate: 3.5, years: 17, isAsset: true, appr: 2, boughtYear: 2021, ownYears: 5 },
      { id: 2, type: 'ownCottage', age: 40, amount: -120000, owned: true, isAsset: true, appr: 1, sellAge: 55, sellTaxFree: false, ownYears: 0 },
      { id: 3, type: 'child', age: 42, amount: -3000, financing: 'cash', recMonthly: -300, recYears: 18 },
      { id: 4, type: 'retirement', age: 63, withdrawal: 2600, pension: 1700, pensionAge: 65 }] },
  // Pro + porrastus + osakesäästötili + tavoite
  'v1-pro-porrastus-ost': { ageNow: 32, ageEnd: 92, startCapital: 60000, monthly: 2000, savingsGrowth: 2,
    allocStocks: 95, allocBonds: 5, glide: false, real: false, tax: true, acct: 'ost', divYield: 2.5, feePct: 0.2,
    savePhases: [{ to: 40, amount: 2000 }, { to: 50, amount: 1200 }, { to: 60, amount: 2500 }],
    proOn: true, pro: { infl: 2.5, ter: 0.3, tax: { low: 30, high: 34, bracket: 30000, acq: true },
      wd: { mode: 'guard', pct: 4, band: 20, adj: 10 }, mc: { paths: 3000, seed: 1337, dist: 't', df: 5, stress: ['bear'] } },
    events: [
      { id: 1, type: 'goal', age: 45, amount: 500000 },
      { id: 2, type: 'retirement', age: 50, withdrawal: 2200, pension: 1300, pensionAge: 65, goal: 'age', conf: 0.85 }] },
};

const tunnusluvut = (plan) => {
  const s = L.simulate(JSON.parse(JSON.stringify(plan)));
  return {
    successProb: +(s.successProb || 0).toFixed(4),
    wEnd: Math.round(s.wEnd || 0),
    wAtRet: s.wAtRet != null ? Math.round(s.wAtRet) : null,
    taxPaid: Math.round(s.taxPaid || 0),
    sustainableWd: s.sustainableWd != null ? Math.round(s.sustainableWd) : null,
    solvedRetireAge: s.solvedRetireAge != null ? +s.solvedRetireAge.toFixed(2) : null,
    depletionAge: s.depletionAge != null ? +s.depletionAge.toFixed(1) : null,
  };
};

const nyt = {};
for (const k in FIXTURES) nyt[k] = tunnusluvut(FIXTURES[k]);

if (paivita || !fs.existsSync(F)) {
  fs.writeFileSync(F, JSON.stringify({ paivitetty: new Date().toISOString().slice(0, 10), huom: 'Päivitä vain tietoisesti (--paivita) ja kirjaa muutos validointisivulle.', odotteet: nyt }, null, 2) + '\n');
  console.log((paivita ? 'Odotteet päivitetty' : 'Odotteet luotu') + ': ' + F);
  process.exit(0);
}

const odotteet = JSON.parse(fs.readFileSync(F, 'utf8')).odotteet;
console.log('Vanhat suunnitelmat antavat samat tunnusluvut (golden)');
for (const k in FIXTURES) {
  const e = odotteet[k], n = nyt[k];
  ok(!!e, `fixture ${k}: odote olemassa`);
  if (!e) continue;
  for (const f in e) {
    const sama = e[f] === n[f] || (typeof e[f] === 'number' && typeof n[f] === 'number' && Math.abs(e[f] - n[f]) <= Math.abs(e[f]) * 1e-6);
    ok(sama, `${k}.${f} = ${e[f]}`, `nyt ${n[f]}`);
  }
}
console.log('Skeemaversio');
ok(typeof FIXTURES['v1-perus'].sv === 'undefined', 'fixture-linkeissä ei sv-kenttää (versio 1)');

console.log(failed ? `\n${failed} TESTIÄ EPÄONNISTUI — jos muutos on tarkoituksellinen: node testit/skeema-golden.test.js --paivita` : '\nKaikki testit läpi.');
process.exit(failed ? 1 : 0);
