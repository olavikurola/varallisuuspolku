'use strict';
/* tyokalut/tilastot-staattinen.js: avainluvut päätyvät staattiseen HTML:ään
   (fi + en), lohko on idempotentti ja Dataset-skeema saa dateModifiedin.
   Ajo: node testit/tilastot-staattinen.test.js */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-staat-'));
const fi = path.join(dir, 'analytiikka.html');
const en = path.join(dir, 'analytiikka-en.html');
fs.copyFileSync(path.join(ROOT, 'analytiikka.html'), fi);
fs.copyFileSync(path.join(ROOT, 'analytiikka-en.html'), en);
// Riisutaan mahdollinen olemassa oleva lohko, jotta testataan myös ensimmäinen sijoitus
for (const f of [fi, en]) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/[ \t]*<!-- VP-STAATTISET-TILASTOT alku -->[\s\S]*?<!-- VP-STAATTISET-TILASTOT loppu -->\n?/, '');
  s = s.replace(/\n\s*"dateModified": "[^"]*",/, '');
  fs.writeFileSync(f, s);
}
const data = {
  updated: '2026-09-01T20:50:25.111Z', v: 3, kAnon: 30, total: 82, editedN: 73, basis: 'edited',
  groups: {
    all: { n: 73, monthly: { p25: 400, p50: 800, p75: 1500 }, startCapital: { p25: 10000, p50: 42000, p75: 150000 },
      stocks: { p25: 70, p50: 95, p75: 100 }, retireAge: { p25: 55, p50: 60, p75: 65 }, withdrawal: { p25: 2000, p50: 2500, p75: 3500 },
      pension: { p25: 1000, p50: 1500, p75: 2200 }, penShare: { p25: 0.3, p50: 0.45, p75: 0.6 }, successProb: { p25: 0.3, p50: 0.51, p75: 0.8 },
      shares: { glide: 0.07, real: 0.3, tax: 0.99 }, events: { home: 0.21, ownHome: 0.16, inheritance: 0.16, child: 0.04 } },
    '30-34': { n: 18 }, '25-29': { n: 11 }, '40-44': { n: 10 },
  },
};
const dataF = path.join(dir, 'stats.json');
fs.writeFileSync(dataF, JSON.stringify(data));
const aja = () => spawnSync(process.execPath, [path.join(ROOT, 'tyokalut', 'tilastot-staattinen.js'), '--tiedosto', dataF, '--sivu', fi, '--sivu-en', en], { encoding: 'utf8' });

console.log('Ensimmäinen ajo sijoittaa lohkon');
{
  const r = aja();
  ok(r.status === 0, 'generaattori ajaa', r.stderr);
  const s = fs.readFileSync(fi, 'utf8');
  const e = fs.readFileSync(en, 'utf8');
  ok(s.includes('<!-- VP-STAATTISET-TILASTOT alku -->') && s.includes('id="anStaattinen"'), 'fi: lohko merkkien välissä');
  ok(s.indexOf('anStaattinen') > s.indexOf('id="anTiles"') && s.indexOf('anStaattinen') < s.indexOf('an-card an-method'), 'fi: lohko Data ja menetelmä -osiossa, Avoin data -kortin edellä');
  ok(s.includes('800 €/kk') && s.includes('42 000 €') && s.includes('51 %'), 'fi: mediaanit lukuina HTML:ssä (800 €/kk, 42 000 €, 51 %)');
  ok(s.includes('<b>82</b>') && s.includes('<b>73</b>'), 'fi: N ja muokatut näkyvissä');
  ok(s.includes('30-34: 18') && s.includes('ei vielä ylitä'), 'fi: ikäryhmien n ja kynnysteksti');
  ok(s.includes('"dateModified": "2026-09-01"'), 'fi: Dataset dateModified datan päivästä');
  ok(e.includes('Key figures in numbers') && e.includes('€800/mo') && e.includes('Monthly savings'), 'en: oma englanninkielinen lohko');
  ok(!e.includes('Kuukausisäästö</th>'), 'en: ei suomea taulukossa');
  // Staattinen teksti on aidosti HTML:ssä ilman scriptejä
  const ilmanJs = s.replace(/<script[\s\S]*?<\/script>/g, '');
  ok((ilmanJs.match(/\d[\d  ]* €/g) || []).length >= 5, 'fi: vähintään 5 eurolukua ilman JavaScriptiä');
}

console.log('Toinen ajo on idempotentti');
{
  const ennen = fs.readFileSync(fi, 'utf8');
  const r = aja();
  ok(r.status === 0, 'toinen ajo onnistuu');
  const jalkeen = fs.readFileSync(fi, 'utf8');
  ok(ennen === jalkeen, 'sama syöte → tavulleen sama sivu');
  ok((jalkeen.match(/VP-STAATTISET-TILASTOT alku/g) || []).length === 1, 'vain yksi lohko');
}

console.log('Uusi data korvaa vanhan');
{
  data.total = 120; data.groups.all.monthly.p50 = 950; data.updated = '2026-10-01T00:00:00Z';
  fs.writeFileSync(dataF, JSON.stringify(data));
  aja();
  const s = fs.readFileSync(fi, 'utf8');
  ok(s.includes('<b>120</b>') && s.includes('950 €/kk') && !s.includes('800 €/kk'), 'luvut päivittyvät paikalleen');
  ok(s.includes('"dateModified": "2026-10-01"'), 'dateModified seuraa dataa');
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(failed ? `\n${failed} TESTIÄ EPÄONNISTUI` : '\nKaikki testit läpi.');
process.exit(failed ? 1 : 0);
