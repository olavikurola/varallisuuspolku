'use strict';

/* prepack: kopioi repojuuren laskenta.js paketin juureen. Julkaistu paketti
   kantaa julkaisuhetken moottorin; testit vartioivat tavuidenttisyyden.
   Ajetaan vain repossa (npm pack / npm publish) — valmiissa paketissa
   tiedosto on jo paikallaan eikä tätä skriptiä ole mukana. */

const fs = require('fs');
const path = require('path');

const lahde = path.join(__dirname, '..', 'laskenta.js');
const kohde = path.join(__dirname, 'laskenta.js');

if (!fs.existsSync(lahde)) {
  console.error('kopioi-laskenta: ../laskenta.js puuttuu — aja repojuuresta.');
  process.exit(1);
}
fs.copyFileSync(lahde, kohde);
console.error('kopioi-laskenta: laskenta.js kopioitu pakettiin.');
