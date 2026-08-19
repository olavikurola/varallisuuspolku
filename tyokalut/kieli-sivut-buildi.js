'use strict';
/* Generoi englanninkieliset staattiset sivut (KIELIVERSIO.md, vaihe 3):
   suomenkieliset lähdesivut + tyokalut/kieli-en-html.json -> juuritason
   -en.html-sivut (index-en.html, analytiikka-en.html, …). Juuritaso siksi,
   että suhteelliset asset-polut (style.css, kieli.js, favicon…) toimivat
   sellaisinaan. Suomenkielisiin lähdesivuihin EI kosketa.
   Aja: node tyokalut/kieli-sivut-buildi.js  (aja kieli-html-avaimet.js ensin;
   putki on vihreä myös täysin tyhjällä sanastolla — sivut syntyvät silloin
   suomeksi ja eroavat vain mekaanisilta osin).

   Mekaaniset muutokset per sivu (sanaston lisäksi):
   1) sanastokorvaukset: pisin avain ensin (estää osajonotörmäykset), ja
      avaimen molemmin puolin vaaditaan ei-kirjain (estää sanansisäiset
      osumat: 'Vero' ei osu sanaan 'Verosäännöt' vaikka se olisi kääntämättä)
   2) sisäiset linkit -en-sivuille: X.html → X-en.html, myös ./ , ./#… ja
      ./index.html-muodot; canonical + og:url + JSON-LD url → -en-URL
   3) <html lang="en">, og:locale fi_FI → en_GB (en-GB on vaiheen 2 valinta
      kieli.js:n locale-muotoiluille — pidetään sama), JSON-LD inLanguage en
   4) hreflang-parit (fi / en / x-default → fi) canonicalin perään — VAIN
      generoidulle sivulle; fi-sivut saavat vastinparinsa sitemapin kautta
   5) inline-injektio ennen kieli.js-latausta (tai <head>iin scriptittömillä
      sivuilla): localStorage vp-kieli = 'en', jotta JS-kerros renderöi
      englannin näillä sivuilla
   6) GENEROITU-leima heti doctypen perään — älä muokkaa -en-sivuja käsin

   HUOM: sanaston avaimissa on literaaleja NBSP-merkkejä, &nbsp;-entiteettejä
   ja rivinvaihtoja — korvaus on tavutarkka, joten sanastoa ei saa päästää
   välilyöntejä normalisoivien työkalujen läpi. Generoituja sivuja EI lisätä
   tässä sw.js:ään eikä appi/sync-web.mjs:ään (oma työvaiheensa). */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SIVUT = ['index.html', 'analytiikka.html', 'agentit.html',
  'validointi.html', 'saavutettavuus.html', 'tietosuoja.html'];
const DOMAIN = 'https://varallisuuspolku.com/';
const KIRJAIN = 'A-Za-zÀ-ÖØ-öø-ÿ'; // kirjainluokka avainrajojen vartiointiin

const vaadi = (ehto, viesti) => { if (!ehto) throw new Error('kieli-sivut-buildi: ' + viesti); };

const SANASTO_POLKU = path.join(__dirname, 'kieli-en-html.json');
vaadi(fs.existsSync(SANASTO_POLKU), 'sanasto puuttuu — aja ensin node tyokalut/kieli-html-avaimet.js');
const sanasto = JSON.parse(fs.readFileSync(SANASTO_POLKU, 'utf8'));
const parit = Object.entries(sanasto).filter(([, v]) => v)
  .sort((a, b) => b[0].length - a[0].length); // pisin avain ensin

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const osumat = new Map(parit.map(([k]) => [k, 0]));

function korvaaSanasto(html) {
  let n = 0;
  for (const [avain, arvo] of parit) {
    const re = new RegExp(
      '(?<![' + KIRJAIN + '])' + escapeRe(avain) + '(?![' + KIRJAIN + '])', 'g');
    html = html.replace(re, () => {
      n++; osumat.set(avain, osumat.get(avain) + 1);
      return arvo; // funktiokorvaus: $-merkit arvossa eivät tulkkaudu
    });
  }
  return { html, n };
}

// (aiempi localStorage-injektio poistettu — ks. vaihe 5 alempana)

for (const sivu of SIVUT) {
  const base = sivu.replace(/\.html$/, '');
  const kohde = base + '-en.html';
  let html = fs.readFileSync(path.join(ROOT, sivu), 'utf8');

  // 1) sanastokorvaukset (ennen linkkien uudelleenkirjoitusta — avainten
  //    sisällä voi olla href="validointi.html" -muotoisia sisälinkkejä)
  const r = korvaaSanasto(html);
  html = r.html;

  // 2a) suhteelliset sisälinkit -en-sivuille (canonical ym. absoluuttiset
  //     eivät osu tähän — niissä href alkaa https:llä)
  let linkit = 0;
  html = html.replace(
    /href="(\.\/)?(index|analytiikka|agentit|validointi|saavutettavuus|tietosuoja)\.html(#[^"]*)?"/g,
    (m, p, nimi, frag) => { linkit++; return 'href="' + (p || '') + nimi + '-en.html' + (frag || '') + '"'; });
  html = html.replace(/href="\.\/(#[^"]*)?"/g,
    (m, frag) => { linkit++; return 'href="./index-en.html' + (frag || '') + '"'; });

  // 2b) sivun oma absoluuttinen URL (canonical, og:url, JSON-LD url) → -en
  const fiUrl = base === 'index' ? DOMAIN : DOMAIN + sivu;
  const enUrl = DOMAIN + kohde;
  if (base === 'index') {
    // etusivun URL on pelkkä domain — täsmäkorvaukset, jotta og.png ei kärsi
    html = html.replace('rel="canonical" href="' + DOMAIN + '"', 'rel="canonical" href="' + enUrl + '"');
    html = html.replace('property="og:url" content="' + DOMAIN + '"', 'property="og:url" content="' + enUrl + '"');
    html = html.replace('"url": "' + DOMAIN + '",', '"url": "' + enUrl + '",');
  } else {
    html = html.split(DOMAIN + sivu).join(enUrl);
  }
  vaadi(html.includes(enUrl), sivu + ': canonical/og:url-uudelleenkirjoitus ei osunut');

  // 2b) yksikköliitteet: sanaston "≥3 kirjainta" -sääntö ohittaa lyhyet
  //     <em>-yksiköt tarkoituksella — vaihdetaan mekaanisesti en-muotoon
  //     (sama konventio kuin kieli.js: v→y, kk→mo, %/v→%/yr)
  html = html.split('<em>v</em>').join('<em>y</em>')
    .split('<em>kk</em>').join('<em>mo</em>')
    .split('<em>%/v</em>').join('<em>%/yr</em>')
    .split('<em>€/kk</em>').join('<em>€/mo</em>')
    .split('<em>€/v</em>').join('<em>€/yr</em>');

  // 3) kieli- ja localemetadata
  vaadi(html.includes('<html lang="fi">'), sivu + ': <html lang="fi"> puuttuu');
  html = html.replace('<html lang="fi">', '<html lang="en">');
  vaadi(html.includes('content="fi_FI"'), sivu + ': og:locale puuttuu');
  html = html.replace('content="fi_FI"', 'content="en_GB"');
  html = html.replace(/"inLanguage": "fi"/g, '"inLanguage": "en"'); // vain JSON-LD-sivuilla

  // 4) hreflang-parit canonicalin perään (vain generoitu sivu; fi-sivujen
  //    vastinparit hoidetaan sitemapissa, fi-lähteisiin ei kosketa)
  const canonRe = /^([ \t]*)<link rel="canonical"[^\n]*\n/m;
  vaadi(canonRe.test(html), sivu + ': canonical-linkki puuttuu');
  html = html.replace(canonRe, (rivi, sisennys) => rivi +
    sisennys + '<link rel="alternate" hreflang="fi" href="' + fiUrl + '" />\n' +
    sisennys + '<link rel="alternate" hreflang="en" href="' + enUrl + '" />\n' +
    sisennys + '<link rel="alternate" hreflang="x-default" href="' + fiUrl + '" />\n');

  // 5) EI localStorage-injektiota: kieli.js lukee sivun lang-attribuutin
  //    (lang="en" → VP_KIELI en tällä sivulla) eikä pysyvää valintaa kirjoiteta
  //    pelkästä sivulatauksesta — muuten en-linkin kerran avannut suomenkielinen
  //    jäisi englantiin (KIELIVERSIO.md: sivun kieli = sivun identiteetti,
  //    tallennettu valinta ohjaa vain uudelleenohjausta).

  // 6) generointileima
  vaadi(html.startsWith('<!DOCTYPE html>\n'), sivu + ': doctype puuttuu');
  html = '<!DOCTYPE html>\n<!-- GENEROITU TIEDOSTO — älä muokkaa käsin. Lähde: ' +
    sivu + ' + tyokalut/kieli-en-html.json, buildi: tyokalut/kieli-sivut-buildi.js -->\n' +
    html.slice('<!DOCTYPE html>\n'.length);

  fs.writeFileSync(path.join(ROOT, kohde), html, 'utf8');
  console.log(`${kohde}: ${r.n} sanastokorvausta, ${linkit} sisälinkkiä uudelleenkirjoitettu`);
}

console.log(`Sanasto: ${parit.length} käännettyä avainta / ${Object.keys(sanasto).length} yhteensä`);
const nollat = parit.filter(([k]) => !osumat.get(k)).map(([k]) => k);
if (nollat.length) {
  console.warn(`VAROITUS: ${nollat.length} käännettyä avainta ei osunut yhdellekään sivulle` +
    ' (lähdesivu muuttunut? aja kieli-html-avaimet.js uudelleen):');
  for (const k of nollat) console.warn('  - ' + (k.length > 70 ? k.slice(0, 70) + '…' : k));
}
