'use strict';
/* Validointisivun vertailuluvut: käsinlaskettava kaava vs. moottorin tulos.
   Ajo: node validointi-luvut.js */
const L = require('../laskenta.js');

const k = Math.pow(1.07, 1 / 12);
const fmt = (v) => v.toLocaleString('fi-FI', { maximumFractionDigits: 2 });
const row = (name, hand, engine) =>
  console.log(`${name}\n  käsin:    ${fmt(hand)}\n  moottori: ${fmt(engine)}\n  ero:      ${Math.abs(hand - engine).toExponential(2)}\n`);

// 1) Kertasijoitus 50 000 €, 100 % osakkeet (7 %/v), 10 v, ei veroa
const acc = { ageNow: 30, ageEnd: 40, startCapital: 50000, monthly: 0, savingsGrowth: 0,
  allocStocks: 100, allocBonds: 0, glide: false, real: false, tax: false, events: [] };
row('1) Kertasijoitus S·1,07^10', 50000 * Math.pow(1.07, 10), L.simulate(acc).exp[120]);

// 2) Kuukausisäästö 500 €/kk, 7 %/v, 10 v — annuiteetin päätearvo
const sav = { ...acc, startCapital: 0, monthly: 500 };
row('2) Säästövirta C·(k^120−1)/(k−1)', 500 * (Math.pow(k, 120) - 1) / (k - 1), L.simulate(sav).exp[120]);

// 3) Kasvava säästö: 500 €/kk + 1,5 %/v palkkakehitys, 10 v
const grw = { ...acc, startCapital: 0, monthly: 500, savingsGrowth: 1.5 };
let ref = 0;
for (let j = 1; j <= 120; j++) ref = ref * k + 500 * Math.pow(1.015, (j - 1) / 12);
row('3) Kasvava säästövirta (suora summa)', ref, L.simulate(grw).exp[120]);

// 4) Nostovaihe: 1 000 000 €, nosto 2 000 €/kk, 7 %/v, 10 v, ei veroa
const wd = { ageNow: 60, ageEnd: 70, startCapital: 1000000, monthly: 0, savingsGrowth: 0,
  allocStocks: 100, allocBonds: 0, glide: false, real: false, tax: false,
  events: [{ id: 1, type: 'retirement', age: 60, withdrawal: 2000, pension: 0 }] };
row('4) Nostovaihe S·k^120 − W·(k^120−1)/(k−1)',
  1000000 * Math.pow(k, 120) - 2000 * (Math.pow(k, 120) - 1) / (k - 1), L.simulate(wd).exp[120]);

// 5) Inflaatiokorjaus (Fisher): 50 000 €, 7 % nimellinen, 2 % inflaatio, 10 v
const rl = { ...acc, real: true };
row('5) Fisher S·(1,07/1,02)^10', 50000 * Math.pow(1.07 / 1.02, 10), L.simulate(rl).exp[120]);

// 6) Omaisuuserä: 220 000 € asunto, +2 %/v, arvo 10 v kohdalla
const ast = { ...acc, startCapital: 0,
  events: [{ id: 1, type: 'home', age: 30, amount: -220000, financing: 'cash', isAsset: true, appr: 2.0 }] };
row('6) Omaisuuserä P·1,02^10', 220000 * Math.pow(1.02, 10), L.simulate(ast).assets[120]);

// 7) Annuiteettilaina: 187 000 €, 3,5 %, 25 v — kuukausierä
const pmtHand = 187000 * (0.035 / 12) / (1 - Math.pow(1 + 0.035 / 12, -300));
row('7) Annuiteettierä P·r/(1−(1+r)^−n)', pmtHand, L.loanPayment(187000, 3.5, 25));

// 8) Omaisuuden myynti + hankintameno-olettama: asunto ostettu 30 v (220 000 €,
//    +2 %/v), myydään 40 v, vero päällä, EI verovapaa
const sale = { ageNow: 30, ageEnd: 50, startCapital: 0, monthly: 0, savingsGrowth: 0,
  allocStocks: 100, allocBonds: 0, glide: false, real: false, tax: true,
  events: [{ id: 1, type: 'home', age: 30, amount: -220000, financing: 'cash', isAsset: true, appr: 2.0, sellAge: 40 }] };
const info = L.prepareSim(sale).saleInfos[0];
const saleValue = 220000 * Math.pow(Math.pow(1.02, 1 / 12), 120);
const gain = saleValue - 220000;
const taxable = Math.min(gain, 0.6 * saleValue); // omistus ≥ 10 v → olettama 40 %
const handTax = taxable <= 30000 ? taxable * 0.30 : 30000 * 0.30 + (taxable - 30000) * 0.34;
console.log(`8) Myynti: arvo käsin ${fmt(saleValue)} vs moottori ${fmt(info.value)}`);
row('   Myyntivoittovero (30/34 %, olettama)', handTax, info.tax);

// 9) Noston brutto→netto (kaava, sama kuin moottorissa):
//    tarve 2 000 € netto, voitto-osuus 50 %, vero 30 %
const gross = 2000 / (1 - 0.5 * 0.30);
console.log(`9) Brutto ${fmt(gross)}, vero ${fmt(gross - 2000)} (kaava gross = need/(1−gainRatio·rate))`);

// 10) MC-determinismi
const plan = () => ({ ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 1000, savingsGrowth: 1.5,
  allocStocks: 70, allocBonds: 20, glide: false, real: false, tax: true,
  events: [
    { id: 1, type: 'home', age: 35, amount: -220000, financing: 'loan', down: 33000, rate: 3.5, years: 25, isAsset: true, appr: 2.0 },
    { id: 2, type: 'car', age: 45, amount: -25000, financing: 'loan', down: 5000, rate: 4.5, years: 6, isAsset: true, appr: -10.0 },
    { id: 3, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 },
  ] });
const s1 = L.simulate(plan()), s2 = L.simulate(plan());
console.log(`10) MC: onnistumis-% ${(s1.successProb * 100).toFixed(1)} — kahdesti ajettuna identtinen: ${s1.successProb === s2.successProb}`);

// 11) Osinkoverojarru: 3,5 % osinkotuotto AOT:lla
console.log(`11) Osinkojarru 3,5 % × 85 % × 30 % = ${(3.5 * 0.85 * 0.30).toFixed(3)} %-yks/v osakepainolle`);
