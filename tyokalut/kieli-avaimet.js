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
                ['EVENT_NAMES', /: '((?:[^'\\]|\\.)+)'/g],
                // EVENT_PROPS-ominaisuusnimet (t(p.nimi) muutosriveillä) ja
                // NOQ-tehtävälabelit (t(NOQ[mode]) — käännetty teksti menee
                // myös palvelimelle kysymyksenä, ks. KIELIVERSIO.md-linjaus)
                ['EVENT_PROPS', /nimi: '((?:[^'\\]|\\.)+)'/g],
                ['const NOQ', /: '((?:[^'\\]|\\.)+)'/g]],
  'sovellus.js': [['ACCT_NOTES', /: '((?:[^'\\]|\\.)+)'/g],
                  ['PLAN_SRC_LABELS', /: '((?:[^'\\]|\\.)+)'/g],
                  ['EXAMPLES', /(?:name|desc): '((?:[^'\\]|\\.)+)'/g]],
  'kaavio.js': [['goalNotes', /: '((?:[^'\\]|\\.)+)'/g]],
  'analytiikka.js': [['LABELS', /: '((?:[^'\\]|\\.)+)'/g]],
};

// 2b) Nieludatan poimijat (loppusiivous 18.8.2026): tekstit jotka kulkevat
//     datana ja käännetään vasta renderöintipaikan t()-nielussa.
//     Regexit per tiedosto — arvo = avain sellaisenaan.
const NIELUT = {
  // Natiivihaaran kokonaiskorvaukset (st.t/st.x = '...'); TOUR_STEPS-lohko
  // poimitaan erikseen taulukkolohkona (lohkoTaulukko) — t:/x:-regex koko
  // tiedostoon osuisi vääriin kohtiin.
  'laajennukset.js': [/\bst\.[tx] = '((?:[^'\\]|\\.)+)'/g],
  // Piirtopöydän HUD-mittarit: metric('Label', ...) — nielu kääntää k:n.
  'piirtopoyta.js': [/\bmetric\(\s*'((?:[^'\\]|\\.)+)'/g],
  // Donitsilabelit (l:) ja empty()-viestit — nielut renderDonut/empty.
  'analytiikka.js': [/\bl: '((?:[^'\\]|\\.)+)'/g,
                     /\bempty\(\s*'?[\w$]+'?,\s*'((?:[^'\\]|\\.)+)'/g],
  // Eläketavoitenapit ja varmuustasot — käännös map-renderissä t(lbl).
  'kaavio.js': [/\[\s*'(?:manual|withdrawal|age|saving)',\s*'((?:[^'\\]|\\.)+)'\s*\]/g,
                /\[(?:null|0\.\d+),\s*'((?:[^'\\]|\\.)+)'\]/g],
};

// toast()/announce() ovat nieluja kaikissa tiedostoissa — staattiset literaalit
// avaimiksi (koostetut valuvat suomena, KIELIVERSIO.md:n linjaus).
const TOAST_RE = /\b(?:toast|announce)\(\s*'((?:[^'\\]|\\.)+)'\s*\)/g;

// Valikko-/tabiapurit (alapalkki, sovellus, natiivilisat): add()/kytkin()
// nimi+kuvaus (myös ternary-haarat), tab()-label, ryhma()/sect()-otsikot.
// mi-kieli ohitetaan: kielivalitsin näytetään tahallaan kohdekielellä.
const VALIKKO_TIEDOSTOT = ['alapalkki.js', 'sovellus.js', 'natiivilisat.js'];
function poimiValikot(teksti, f) {
  const alkuRe = /(?<!classList\.)\b(?:add|kytkin)\(\s*'([\w-]+)',/g;
  let m;
  while ((m = alkuRe.exec(teksti))) {
    if (m[1] === 'mi-kieli') continue;
    const ikkuna = teksti.slice(alkuRe.lastIndex, alkuRe.lastIndex + 400);
    // argumentti-ikkuna päättyy callbackin alkuun (function/nuoli/kotona/null)
    const loppu = ikkuna.search(/\bfunction\b|=>|\bkotona\(|\bnull\b/);
    const osa = loppu >= 0 ? ikkuna.slice(0, loppu) : ikkuna;
    let s;
    const litRe = /'((?:[^'\\]|\\.)+)'/g;
    while ((s = litRe.exec(osa))) lisaa(s[1], `${f}/valikko:${m[1]}`);
  }
  const tabRe = /\btab\(\s*'[\w-]+',\s*'((?:[^'\\]|\\.)+)'/g;
  while ((m = tabRe.exec(teksti))) lisaa(m[1], `${f}/tab`);
  const ryhmaRe = /\b(?:ryhma|sect)\(\s*'((?:[^'\\]|\\.)+)'\)/g;
  while ((m = ryhmaRe.exec(teksti))) lisaa(m[1], `${f}/ryhma`);
}

// Pysyvät käsin ylläpidetyt avaimet: ajonaikaisesti johdetut variantit,
// joita staattinen skannaus ei näe. Nyt: kierroksen askel 0:n appiversio
// (laajennukset.js r. 45 .replace) — johdetaan lähdetekstistä samalla
// mutaatiolla, jotta avain pysyy tavulleen koodin tuottamana.
function pysyvatAvaimet(tourLohko) {
  const m = tourLohko.match(/\bx: '((?:[^'\\]|\\.)+)'/);
  if (m) {
    const askel0 = m[1].replace('omassa selaimessasi', 'omalla laitteellasi');
    lisaa(askel0, 'laajennukset.js/TOUR_STEPS[0].x (natiivi .replace)');
  }
  // Datana kulkevat yksittäisarvot, joita mikään lohkopoiminta ei näe:
  // analytiikka.js renderPenCoverage: rows.push({ g: 'kaikki' }) → t(r.g)
  lisaa('kaikki', 'PYSYVAT (analytiikka.js penCoverage koko joukon rivi)');
  // tulkki.js katsastuksen lainafallbackit: t(EVENT_NAMES[e.type] || 'Laina')
  // — fallback-literaali ei ole staattinen t('...')-kutsu
  lisaa('Laina', 'PYSYVAT (tulkki.js katsastus fallback)');
  lisaa('Lainaa', 'PYSYVAT (tulkki.js katsastus fallback)');
}

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

// Taulukkolohko ([...]) — TOUR_STEPS on taulukko, lohko() hakee vain {}-lohkoja
function lohkoTaulukko(teksti, nimi) {
  const alku = teksti.indexOf(nimi);
  if (alku < 0) return '';
  const avaa = teksti.indexOf('[', alku);
  let syvyys = 0;
  for (let i = avaa; i < teksti.length; i++) {
    if (teksti[i] === '[') syvyys++;
    else if (teksti[i] === ']') { syvyys--; if (!syvyys) return teksti.slice(avaa, i + 1); }
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
  for (const re of NIELUT[f] || []) {
    while ((m = re.exec(teksti))) lisaa(m[1], `${f}:${riviNro(teksti, m.index)} (nielu)`);
  }
  if (f !== 'laskenta.js') {
    while ((m = TOAST_RE.exec(teksti))) lisaa(m[1], `${f}:${riviNro(teksti, m.index)} (toast)`);
  }
  if (VALIKKO_TIEDOSTOT.includes(f)) poimiValikot(teksti, f);
  if (f === 'laajennukset.js') {
    const tour = lohkoTaulukko(teksti, 'const TOUR_STEPS');
    const txRe = /\b[tx]: '((?:[^'\\]|\\.)+)'/g;
    while ((m = txRe.exec(tour))) lisaa(m[1], 'laajennukset.js/TOUR_STEPS');
    pysyvatAvaimet(tour);
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
