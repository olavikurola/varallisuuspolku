#!/usr/bin/env node
'use strict';
/* Tuoreusmetadata hakukoneille ja kielimalleille (imaisu-ohjelma A3).

   - sitemap.xml: jokaisen <url>:n <lastmod> = tiedoston viimeisin git-commit
     (aiemmin käsin päivitetty ja jäänyt heinäkuulle)
   - index.html: JSON-LD WebApplication saa/päivittää "dateModified"
   - llms.txt: "päivitetty YYYY-MM-DD" -rivi = tämä päivä
   Idempotentti. Aja: node tyokalut/tuoreus.js   (tai --tarkista: ei kirjoita,
   exit 1 jos jokin olisi muuttunut — CI-vartija). */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TARKISTA = process.argv.includes('--tarkista');
const tanaan = new Date().toISOString().slice(0, 10);
let muutoksia = 0;

const gitPvm = (file) => {
  try {
    const d = execSync(`git log -1 --format=%cs -- "${file}"`, { cwd: ROOT, encoding: 'utf8' }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  } catch (e) { return null; }
};
/* Päivämäärät päätetään KERRALLA ennen kirjoituksia: tiedoston pvm = viimeisin
   commit, tai tänään jos työpuussa on committoimaton muutos. Näin skriptin omat
   kirjoitukset eivät muuta tulosta samalla ajolla (ei ikuista "tänään"-kierrettä)
   — seuraava ajo näkee committoidun päivän. */
const pvmCache = new Map();
const tiedostonPvm = (file) => {
  if (pvmCache.has(file)) return pvmCache.get(file);
  let pvm = gitPvm(file) || tanaan;
  try { if (execSync(`git status --porcelain -- "${file}"`, { cwd: ROOT, encoding: 'utf8' }).trim()) pvm = tanaan; } catch (e) {}
  pvmCache.set(file, pvm);
  return pvm;
};
for (const f of ['index.html', 'index-en.html', 'analytiikka.html', 'analytiikka-en.html', 'agentit.html', 'agentit-en.html',
  'validointi.html', 'validointi-en.html', 'saavutettavuus.html', 'saavutettavuus-en.html']) tiedostonPvm(f);
const kirjoita = (file, s, alku) => {
  if (s === alku) return;
  muutoksia++;
  if (!TARKISTA) fs.writeFileSync(file, s);
  console.log((TARKISTA ? 'MUUTTUISI: ' : 'päivitetty: ') + path.basename(file));
};

// 1) sitemap.xml
{
  const f = path.join(ROOT, 'sitemap.xml');
  const alku = fs.readFileSync(f, 'utf8');
  const s = alku.replace(/<loc>https:\/\/varallisuuspolku\.com\/([^<]*)<\/loc>\n(\s*)<lastmod>[^<]*<\/lastmod>/g,
    (m, polku, ind) => {
      const file = polku || 'index.html';
      // Työpuun muokkaamaton tiedosto → git-pvm; muokattu → tänään (julkaistaan tänään)
      let pvm = gitPvm(file);
      try { if (execSync(`git status --porcelain -- "${file}"`, { cwd: ROOT, encoding: 'utf8' }).trim()) pvm = tanaan; } catch (e) {}
      return `<loc>https://varallisuuspolku.com/${polku}</loc>\n${ind}<lastmod>${pvm || tanaan}</lastmod>`;
    });
  kirjoita(f, s, alku);
}

// 2) index.html JSON-LD dateModified (+ en-sivu, joka generoidaan fi:stä — sama arvo)
for (const name of ['index.html', 'index-en.html']) {
  const f = path.join(ROOT, name);
  if (!fs.existsSync(f)) continue;
  const alku = fs.readFileSync(f, 'utf8');
  let pvm = gitPvm(name) || tanaan;
  try { if (execSync(`git status --porcelain -- "${name}"`, { cwd: ROOT, encoding: 'utf8' }).trim()) pvm = tanaan; } catch (e) {}
  let s;
  if (/"dateModified": "[^"]*"/.test(alku)) s = alku.replace(/"dateModified": "[^"]*"/, `"dateModified": "${pvm}"`);
  else s = alku.replace('"applicationCategory": "FinanceApplication",', `"applicationCategory": "FinanceApplication",\n    "dateModified": "${pvm}",`);
  kirjoita(f, s, alku);
}

// 3) llms.txt päiväys
{
  const f = path.join(ROOT, 'llms.txt');
  const alku = fs.readFileSync(f, 'utf8');
  const s = alku.replace(/\(päivitetty \d{4}-\d{2}-\d{2}\)/, `(päivitetty ${tanaan})`);
  kirjoita(f, s, alku);
}

if (TARKISTA && muutoksia) { console.error(`tuoreus: ${muutoksia} tiedostoa vanhentunut — aja node tyokalut/tuoreus.js`); process.exit(1); }
if (!muutoksia) console.log('tuoreus: kaikki ajan tasalla');
