'use strict';
/* Kerää käännösavaimet (KIELIVERSIO.md, vaihe 2): skannaa ajonaikaisten
   JS-tiedostojen t('...')-kutsut ja tunnettujen labeltaulujen arvot, ja
   kirjoittaa en-sanaston luonnoksen tyokalut/kieli-en.luonnos.json
   ({ "fi-avain": "" } — tyhjä arvo = kääntämättä, t() palauttaa silloin fi:n).
   Aja: node tyokalut/kieli-avaimet.js
   HUOM: avaimissa voi olla literaaleja NBSP-merkkejä (U+00A0) — JSON säilyttää
   ne; älä editoi luonnosta työkaluilla jotka normalisoivat välilyönnit. */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const TIEDOSTOT = ['apu.js', 'kaavio.js', 'piirtopoyta.js', 'kortit.js',
  'laajennukset.js', 'sovellus.js', 'tulkki.js', 'alapalkki.js',
  'natiivilisat.js', 'analytiikka.js'];

const avaimet = new Map(); // avain -> [tiedosto:rivi, ...]
const lisaa = (avain, lahde) => {
  if (!avain || !/[a-zA-ZäöåÄÖÅ]/.test(avain)) return; // pelkät merkit/numerot pois
  if (/^[.#]/.test(avain)) return; // CSS-valitsimet (esim. TOUR_STEPSin s-kentät)
  if (!avaimet.has(avain)) avaimet.set(avain, []);
  avaimet.get(avain).push(lahde);
};

// 1) Staattiset t('...')-avaimet (myös window.t). Kattaa \'-escapet.
// Lookbehind estää väärät osumat: createElement('div'), getContext('2d'),
// $t('tkQuota') ym. päättyvät "t("-merkkeihin mutta eivät ole käännöskutsuja.
const T_RE = /(?<![\w$.])(?:window\.)?t\(\s*'((?:[^'\\]|\\.)+)'/g;

// 2) Labeltaulut, joiden arvot toimivat avaimina (käännös lukupaikassa) —
//    lohko poimitaan nimellä ja arvot sen sisältä. Lista: KIELIVERSIO.md.
const TAULUT = {
  'apu.js': [['EVENT_TYPES', /label: '((?:[^'\\]|\\.)+)'/g]],
  'laskenta.js': [['STRESS_DEFS', /name: '((?:[^'\\]|\\.)+)'/g],
                  ['PRO_BASE_ASSETS', /'((?:[^'\\]|\\.)+)'/g]],
  'tulkki.js': [['ERRORS', /: '((?:[^'\\]|\\.)+)'/g],
                ['FIELDS', /nimi: '((?:[^'\\]|\\.)+)'/g],
                ['EVENT_NAMES', /: '((?:[^'\\]|\\.)+)'/g]],
  'sovellus.js': [['ACCT_NOTES', /: '((?:[^'\\]|\\.)+)'/g],
                  ['PLAN_SRC_LABELS', /: '((?:[^'\\]|\\.)+)'/g],
                  ['EXAMPLES', /(?:name|desc): '((?:[^'\\]|\\.)+)'/g]],
  'kaavio.js': [['goalNotes', /: '((?:[^'\\]|\\.)+)'/g]],
};

// 3) Nielukäärityt objektiliteraalit: tiilien/korttien k/s/v-statiikat.
//    v-poiminta vain selvät tekstit (sisältää kirjaimia, ei ${}).
const KVS_RE = /\b(?:k|s|v|va): '((?:[^'\\]|\\.)+)'/g;
const KVS_TIEDOSTOT = ['kortit.js', 'sovellus.js', 'analytiikka.js', 'piirtopoyta.js'];

function lohko(teksti, nimi) {
  const alku = teksti.indexOf(nimi);
  if (alku < 0) return '';
  const avaa = teksti.indexOf('{', alku);
  let syvyys = 0;
  for (let i = avaa; i < teksti.length; i++) {
    if (teksti[i] === '{') syvyys++;
    else if (teksti[i] === '}') { syvyys--; if (!syvyys) return teksti.slice(avaa, i + 1); }
  }
  return '';
}

const riviNro = (teksti, idx) => teksti.slice(0, idx).split('\n').length;

const skannatut = [...TIEDOSTOT, 'laskenta.js'];
for (const f of skannatut) {
  const teksti = fs.readFileSync(path.join(ROOT, f), 'utf8');
  let m;
  if (f !== 'laskenta.js') {
    while ((m = T_RE.exec(teksti))) lisaa(m[1], `${f}:${riviNro(teksti, m.index)}`);
  }
  for (const [nimi, re] of TAULUT[f] || []) {
    const b = lohko(teksti, nimi);
    while ((m = re.exec(b))) lisaa(m[1], `${f}/${nimi}`);
  }
  if (KVS_TIEDOSTOT.includes(f)) {
    while ((m = KVS_RE.exec(teksti))) lisaa(m[1], `${f}:${riviNro(teksti, m.index)} (kvs)`);
  }
}

// Luonnos: säilytä olemassa olevat käännökset, lisää uudet tyhjinä
const ULOS = path.join(__dirname, 'kieli-en.luonnos.json');
let vanha = {};
try { vanha = JSON.parse(fs.readFileSync(ULOS, 'utf8')); } catch (e) {}
const ulos = {};
for (const avain of [...avaimet.keys()].sort((a, b) => a.localeCompare(b, 'fi'))) {
  ulos[avain] = vanha[avain] || '';
}
fs.writeFileSync(ULOS, JSON.stringify(ulos, null, 2) + '\n', 'utf8');

const kaannetty = Object.values(ulos).filter(Boolean).length;
const nbsp = [...JSON.stringify(ulos)].filter((c) => c === String.fromCharCode(0xA0)).length;
console.log(`Avaimia: ${avaimet.size} (käännetty ${kaannetty}, NBSP-merkkejä avaimissa ${nbsp})`);
console.log(`Luonnos: ${ULOS}`);
// Poistuneet avaimet (vanhassa mutta ei enää koodissa) — käännösten siivousapu
const poistuneet = Object.keys(vanha).filter((k) => !(k in ulos));
if (poistuneet.length) console.log('Poistuneita avaimia (eivät enää koodissa):', poistuneet.length);
