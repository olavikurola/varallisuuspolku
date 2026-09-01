#!/usr/bin/env node
'use strict';
/* Vertailudatan varmuuskopion palautus.

   Purkaa GitHub-artefaktista ladatun salatun kopion (ks.
   .github/workflows/vertailudata-vienti.yml), validoi rivit ja kirjoittaa
   palvelin/data/lahjoitukset.jsonl:n (tai annetun kohteen). Ei koskaan
   kirjoita olemassa olevan tiedoston päälle ilman --korvaa.

   Käyttö:
     VIENTI_SALASANA=... node tyokalut/vienti-palauta.js vertailudata-20260901.jsonl.enc [kohde] [--korvaa]

   Vaatii opensslin PATHissa (sama komento kuin workflow'ssa → sama tulos). */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const korvaa = process.argv.includes('--korvaa');
const src = args[0];
const dst = args[1] || path.join(__dirname, '..', 'palvelin', 'data', 'lahjoitukset.jsonl');
const pw = process.env.VIENTI_SALASANA;

if (!src || !fs.existsSync(src)) { console.error('Anna salattu tiedosto (.enc). Ks. otsikkokommentti.'); process.exit(2); }
if (!pw) { console.error('VIENTI_SALASANA-ympäristömuuttuja puuttuu.'); process.exit(2); }
if (fs.existsSync(dst) && !korvaa) { console.error(`Kohde on jo olemassa: ${dst} — anna --korvaa jos haluat ylikirjoittaa.`); process.exit(2); }

const r = spawnSync('openssl', ['enc', '-d', '-aes-256-cbc', '-pbkdf2', '-iter', '200000', '-in', src, '-pass', 'env:VIENTI_SALASANA'],
  { env: { ...process.env, VIENTI_SALASANA: pw }, encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.status !== 0) { console.error('Salauksen purku epäonnistui (väärä salasana?):', (r.stderr || '').trim()); process.exit(1); }

const lines = r.stdout.split('\n').filter(Boolean);
let bad = 0;
for (const l of lines) { try { const o = JSON.parse(l); if (typeof o.ageNow !== 'number') bad++; } catch (e) { bad++; } }
if (!lines.length || bad) { console.error(`Validointi epäonnistui: ${lines.length} riviä, viallisia ${bad}.`); process.exit(1); }

fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, lines.join('\n') + '\n');
console.log(`Palautettu ${lines.length} riviä → ${dst}`);
