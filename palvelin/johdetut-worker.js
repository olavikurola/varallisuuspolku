'use strict';
/* Johdettujen tunnuslukujen laskenta erillisessä säikeessä (server.js:n
   scheduleDerive). Varmuustasotavoitteen rivi vie 1–2 s Monte Carloa — pää-
   säikeessä se pysäyttäisi Tulkin suoratoiston ja jaot laskennan ajaksi.
   Viesti sisään: { key, row }; ulos: { key, d } (d = null jos rivi ei laskeudu). */
const { parentPort } = require('worker_threads');
const L = require('./laskenta.js');

const PATHS = 1000;

// Vertailurivi → moottorin tila. Kaikki rivit tämän päivän rahassa (real), jotta
// varallisuus on vertailukelpoinen jakajan kytkimestä riippumatta. Rivissä ei
// kulje Pro-asetuksia, porrastettua säästöä eikä osinkotuottoa (perustilan oletukset).
function rowToState(r) {
  return {
    ageNow: r.ageNow, ageEnd: r.ageEnd, startCapital: r.startCapital, monthly: r.monthly,
    savingsGrowth: r.savingsGrowth || 0, savePhases: null,
    allocStocks: r.alloc.stocks, allocBonds: r.alloc.bonds,
    glide: !!r.glide, real: true, inflation: 2, tax: !!r.tax,
    acct: r.acct === 'ost' || r.acct === 'ins' ? r.acct : 'aot',
    feePct: r.feePct || 0, wrapFee: 0, divYield: 0, proOn: false, pro: null,
    events: (r.events || []).map((e, i) => Object.assign({ id: i + 1 }, e)),
  };
}

function deriveRow(r) {
  const s = L.simulate(rowToState(r), { paths: PATHS });
  const d = { wEnd: L.round2sig(Math.max(0, s.wEnd)), successProb: Math.round(s.successProb * 100) / 100 };
  if (s.wAtRet != null) d.wAtRet = L.round2sig(Math.max(0, s.wAtRet));
  if (s.retireAge != null) d.retireAge = Math.round(s.retireAge * 10) / 10;
  if (s.taxPaid > 0) d.taxPaid = L.round2sig(s.taxPaid);
  return d;
}

parentPort.on('message', ({ key, row }) => {
  let d = null;
  try { d = deriveRow(row); } catch (e) { d = null; }
  parentPort.postMessage({ key, d });
});

parentPort.postMessage({ ready: true, engine: L.ENGINE_VERSION, paths: PATHS });
