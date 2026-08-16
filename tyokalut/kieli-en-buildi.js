'use strict';
/* Paketoi en-sanaston ajonaikaiseksi tiedostoksi (KIELIVERSIO.md, vaihe 2):
   tyokalut/kieli-en.luonnos.json -> kieli-en.js (repon juureen).
   Aja: node tyokalut/kieli-en-buildi.js  (aja käännösten muututtua; committaa
   molemmat). Tyhjät arvot ohitetaan — t() palauttaa niille suomen. */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const sanasto = JSON.parse(fs.readFileSync(path.join(__dirname, 'kieli-en.luonnos.json'), 'utf8'));
const parit = Object.entries(sanasto).filter(([, v]) => v);

const ulos = `'use strict';

/* Varallisuuspolku — englannin sanasto (GENEROITU, älä muokkaa käsin:
   lähde tyokalut/kieli-en.luonnos.json, buildi tyokalut/kieli-en-buildi.js).
   Ladataan kieli.js:n jälkeen; täyttää VP_SANASTON vain kun kieli on en.
   Avaimissa ja arvoissa on literaaleja NBSP-merkkejä — säilytä tavut. */

if (typeof VP_KIELI !== 'undefined' && VP_KIELI === 'en') {
  Object.assign(VP_SANASTO, ${JSON.stringify(Object.fromEntries(parit), null, 2)});
}
`;

fs.writeFileSync(path.join(ROOT, 'kieli-en.js'), ulos, 'utf8');
console.log(`kieli-en.js: ${parit.length} käännöstä, ${Math.round(ulos.length / 1024)} KB`);
