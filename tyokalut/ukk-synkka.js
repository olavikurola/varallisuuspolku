'use strict';
/* Etusivun UKK: JSON-LD-FAQ generoidaan NÄKYVÄSTÄ sisällöstä (yksi totuus).
   YLLAPITO.md:n sääntö "JSON-LD-FAQ peilaa näkyvää sisältöä 1:1" oli käsityötä
   ja ajautui erilleen (11/2026: 5/9 vastausta erosi).

   node tyokalut/ukk-synkka.js              kirjoittaa index.html:n FAQPage-lohkon
                                            näkyvistä <details>-kohdista ja lisää
                                            en-sanastoon (kieli-en-html.json) uusien
                                            JSON-LD-vastausten käännökset näkyvän
                                            vastauksen käännöksestä
   node tyokalut/ukk-synkka.js --tarkista   ei kirjoita; exit 1 jos index.html tai
                                            index-en.html ei ole synkassa (testi)

   Ajojärjestys: tämä → kieli-html-avaimet.js → kieli-sivut-buildi.js. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TARKISTA = process.argv.includes('--tarkista');
const SANASTO = path.join(__dirname, 'kieli-en-html.json');

const lue = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
// Näkyvä HTML → JSON-LD:n tekstimuoto: tagit pois, entiteetit auki, välit yhdeksi
const teksti = (html) => html.replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s+/g, ' ').trim();
const UKK_RE = /<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g;
const FAQ_RE = /(<script type="application\/ld\+json">\s*)(\{[^<]*?"@type": "FAQPage"[\s\S]*?\})(\s*<\/script>)/;

// [{ q, a, qRaw, aRaw }] sivun about-kortista (ainoa paikka, jossa <details><summary> on UKK)
function nakyvat(html) {
  const alku = html.indexOf('data-card="about"');
  if (alku < 0) throw new Error('about-korttia ei löydy');
  const out = [];
  for (const m of html.slice(alku).matchAll(UKK_RE)) out.push({ q: teksti(m[1]), a: teksti(m[2]), qRaw: m[1], aRaw: m[2] });
  return out;
}
function jsonLd(html) {
  const m = html.match(FAQ_RE);
  if (!m) throw new Error('FAQPage-lohkoa ei löydy');
  return JSON.parse(m[2]).mainEntity.map((e) => ({ q: e.name, a: e.acceptedAnswer.text }));
}
function erot(sivu) {
  const html = lue(sivu);
  const n = nakyvat(html), j = jsonLd(html);
  const out = [];
  if (n.length !== j.length) out.push(`${sivu}: näkyviä kysymyksiä ${n.length}, JSON-LD:ssä ${j.length}`);
  n.forEach((x, i) => {
    if (!j[i]) return;
    if (x.q !== j[i].q) out.push(`${sivu}: kysymys ${i + 1} eroaa: "${x.q}" vs "${j[i].q}"`);
    if (x.a !== j[i].a) out.push(`${sivu}: vastaus ${i + 1} ("${x.q}") eroaa`);
  });
  return out;
}

if (TARKISTA) {
  const e = [...erot('index.html'), ...(fs.existsSync(path.join(ROOT, 'index-en.html')) ? erot('index-en.html') : [])];
  if (e.length) { console.error('ukk-synkka: JSON-LD-FAQ ei vastaa näkyvää UKK:ta\n  ' + e.join('\n  ') + '\n  → aja node tyokalut/ukk-synkka.js (+ kieliputki)'); process.exit(1); }
  console.log('ukk-synkka: JSON-LD-FAQ = näkyvä UKK (fi + en)');
  process.exit(0);
}

// --- kirjoitus ---
const html = lue('index.html');
const n = nakyvat(html);
const vanha = jsonLd(html);
const lohko = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: n.map((x) => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })),
};
// Sama asettelu kuin käsin kirjoitetussa lohkossa: yksi kysymys kahdelle riville
const rivit = lohko.mainEntity.map((e) =>
  `      { "@type": "Question", "name": ${JSON.stringify(e.name)},\n        "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(e.acceptedAnswer.text)} } }`);
const uusiLohko = `{\n    "@context": "https://schema.org",\n    "@type": "FAQPage",\n    "mainEntity": [\n${rivit.join(',\n')}\n    ]\n  }`;
const uusi = html.replace(FAQ_RE, (m, a, b, c) => a + uusiLohko + c);
JSON.parse(uusi.match(FAQ_RE)[2]); // varmistus: jäsentyy
if (uusi !== html) fs.writeFileSync(path.join(ROOT, 'index.html'), uusi);

// En-sanasto: JSON-LD-vastauksen avain = fi-teksti; käännös johdetaan näkyvän
// vastauksen (raaka-HTML-avain) käännöksestä samalla tekstimuunnoksella
const sanasto = JSON.parse(fs.readFileSync(SANASTO, 'utf8'));
let lisatty = 0, puuttuu = 0;
for (const x of n) {
  for (const [fiTeksti, raaka] of [[x.a, x.aRaw], [x.q, x.qRaw]]) {
    if (sanasto[fiTeksti]) continue;
    const en = sanasto[raaka] || sanasto[raaka.trim()];
    if (en) { sanasto[fiTeksti] = teksti(en); lisatty++; } else puuttuu++;
  }
}
if (lisatty) fs.writeFileSync(SANASTO, JSON.stringify(sanasto, null, 2) + '\n', 'utf8');
const muuttui = n.filter((x, i) => !vanha[i] || vanha[i].a !== x.a || vanha[i].q !== x.q).length;
console.log(`ukk-synkka: ${n.length} kysymystä, ${muuttui} JSON-LD-kohtaa päivitetty, en-sanastoon ${lisatty} lisätty` + (puuttuu ? `, ${puuttuu} käännöstä puuttuu (käännä näkyvä vastaus ensin)` : ''));
