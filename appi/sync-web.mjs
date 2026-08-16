/* Kokoaa appi/www:n tuotannon web-tiedostoista.
   Periaate: appi on kääre saman repon webin ympärillä — tämä skripti on ainoa
   silta, eikä web-tiedostoja muokata käsin appia varten. Ajetaan aina ennen
   `npx cap sync` -komentoa (CI tekee tämän automaattisesti).

   Appikohtaiset poikkeamat (perustelut README-appi.md:ssä):
   - Plausible-analytiikka riisutaan: appikäyttö ei saa sekoittua webin
     kävijämittaukseen, ja kauppojen tietosuojakortti pysyy puhtaana.
   - sw.js jätetään pois: appi lataa tiedostot paikallisesti, service worker
     olisi pelkkä riski (sovellus.js ohittaa rekisteröinnin natiivissa). */

import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APPI = dirname(fileURLToPath(import.meta.url));
const ROOT = join(APPI, '..');
const WWW = join(APPI, 'www');

const FILES = [
  // sivut
  'index.html', 'analytiikka.html', 'saavutettavuus.html', 'validointi.html', 'agentit.html',
  // tyylit ja fontit
  'style.css', 'fonts.css', 'fonts/inter-latin.woff2', 'fonts/inter-latin-ext.woff2',
  // ajonaikainen JS (sw.js tarkoituksella pois)
  'kieli.js', 'kieli-en.js', 'apu.js', 'kaavio.js', 'piirtopoyta.js', 'kortit.js', 'laajennukset.js',
  'sovellus.js', 'laskenta.js', 'mc-worker.js', 'tulkki.js', 'analytiikka.js', 'alapalkki.js',
  'natiivilisat.js',
  // ikonit ja manifesti
  'favicon.svg', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png',
  'appstore-badge.svg', // etusivun App Store -kortti (piilossa appissa, mutta img latautuu)
];

rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });

let puuttuu = [];
for (const f of FILES) {
  const src = join(ROOT, f);
  if (!existsSync(src)) { puuttuu.push(f); continue; }
  const dst = join(WWW, f);
  mkdirSync(dirname(dst), { recursive: true });
  cpSync(src, dst);
}
if (puuttuu.length) {
  console.error('VIRHE: lähdetiedostot puuttuvat: ' + puuttuu.join(', '));
  process.exit(1);
}

/* Plausible pois HTML-sivuilta: script-tagi, inline-alustus ja kommenttirivi.
   Tekstisisällön maininnat (UKK, tietosuojaseloste) saavat jäädä — ne kuvaavat
   web-palvelua, eivät lataa mitään. */
for (const f of FILES.filter((x) => x.endsWith('.html'))) {
  const p = join(WWW, f);
  let html = readFileSync(p, 'utf8');
  const ennen = html.length;
  html = html
    .replace(/[ \t]*<!-- Privacy-friendly analytics by Plausible -->\r?\n/g, '')
    .replace(/[ \t]*<script async src="https:\/\/plausible\.io[^"]*"><\/script>\r?\n/g, '')
    .replace(/[ \t]*<script>\s*window\.plausible=[\s\S]*?<\/script>\r?\n/g, '');
  if (html.length === ennen) {
    console.error(`VIRHE: Plausible-poisto ei osunut tiedostossa ${f} — tarkista kaavat.`);
    process.exit(1);
  }
  if (/<script[^>]*plausible/i.test(html)) {
    console.error(`VIRHE: ${f} sisältää yhä plausible-scriptin poiston jälkeen.`);
    process.exit(1);
  }
  writeFileSync(p, html);
}

/* Windows-suoja: `npx cap sync ios` kirjoittaa Windowsilla Package.swiftiin
   kenoviivapolut, jotka kaatavat SPM:n macOS:llä ("invalid escape sequence").
   Normalisoidaan erottimet aina — CI ajaa tämän ennen jokaista iOS-käännöstä. */
const SPM = join(APPI, 'ios', 'App', 'CapApp-SPM', 'Package.swift');
if (existsSync(SPM)) {
  const spm = readFileSync(SPM, 'utf8');
  const fixed = spm.replace(/path:\s*"([^"]*)"/g, (m, p) => `path: "${p.replaceAll('\\', '/')}"`);
  if (fixed !== spm) {
    writeFileSync(SPM, fixed);
    console.log('Korjattu: Package.swiftin polkuerottimet / -muotoon.');
  }
}

console.log(`OK: www koottu (${FILES.length} tiedostoa), Plausible riisuttu HTML-sivuilta.`);
