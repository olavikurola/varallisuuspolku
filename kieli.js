'use strict';

/* Varallisuuspolku — kieli- ja muotoilukerros (KIELIVERSIO.md).
   Kaikki locale-sidonnainen muotoilu yhdessä paikassa: kun kielivalinta
   joskus toteutetaan, locale ja yksiköt vaihtuvat täältä — muut tiedostot
   eivät saa kutsua toLocaleString/toLocaleDateString suoraan.
   Ladataan ensimmäisenä skriptinä (classic script, jaettu globaali skooppi)
   kaikilla sivuilla joilla on JS: index.html, analytiikka.html, agentit.html.
   Vaiheessa 1 tänne tulee myös viestikatalogi (fi oletuksena, en overlay). */

/* Viestikatalogi, gettext-tyyli: suomenkielinen teksti on itse avain.
   Kun kieli on fi (oletus, ainoa toistaiseksi), t() palauttaa syötteen
   sellaisenaan — suomi ei koskaan kulje sanakirjan kautta eikä voi hajota.
   Englanti tulee vaiheessa 2 fi→en-sanakirjana (VP_SANASTO).
   Parametrit {0}/{1}-paikkamerkein: t('Ikä {0} v', ika). */
/* Kielen valinta (vaihe 3): SIVUN lang-attribuutti on sivun identiteetti
   (generoidut -en.html-sivut ovat lang="en"), tallennettu valinta (?lang=…
   → localStorage vp-kieli) ohjaa vain UUDELLEENOHJAUSTA sivuparien välillä.
   Pelkkä en-sivulla käynti EI tallenna mitään — suomenkielinen voi kurkata
   en-linkkiä jäämättä englantiin. Automaattista redirectiä selaimen kielestä
   EI tehdä (Googlen ohje + testit); sen sijaan fi-etusivu näyttää
   englanninkieliselle selaimelle kohteliaan bannerin. */
let VP_KIELI = 'fi';
try {
  const sivuEn = document.documentElement.lang === 'en';
  const urlKieli = new URLSearchParams(location.search).get('lang');
  if (urlKieli === 'en' || urlKieli === 'fi') localStorage.setItem('vp-kieli', urlKieli);
  const valittu = localStorage.getItem('vp-kieli');
  VP_KIELI = sivuEn || valittu === 'en' ? 'en' : 'fi';
  // Sivuparien uudelleenohjaus (hash säilyy; toimii myös appissa, koska
  // -en-sivut ovat sync-whitelistissä). Ei koskaan fi-sivulta ilman valintaa.
  const SIVUPARIT = ['index.html', 'analytiikka.html', 'agentit.html', 'validointi.html', 'saavutettavuus.html', 'tietosuoja.html'];
  const tiedosto = (location.pathname.split('/').pop() || 'index.html');
  if (!sivuEn && valittu === 'en' && SIVUPARIT.includes(tiedosto)) {
    location.replace(tiedosto.replace(/\.html$/, '-en.html') + location.hash);
  } else if (sivuEn && valittu === 'fi') {
    const fiNimi = tiedosto.replace(/-en\.html$/, '.html');
    location.replace((fiNimi === 'index.html' ? './' : fiNimi) + location.hash);
  } else if (!sivuEn && !valittu && tiedosto === 'index.html'
    && /^en\b/i.test(navigator.language || '') && !localStorage.getItem('vp-kieli-ehdotettu')) {
    // Kohtelias ehdotus englanninkieliselle selaimelle — kerran, ei koskaan uudestaan
    document.addEventListener('DOMContentLoaded', () => {
      try { localStorage.setItem('vp-kieli-ehdotettu', '1'); } catch (e) {}
      const b = document.createElement('div');
      b.id = 'vpKieliEhdotus';
      b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:300;' +
        'background:var(--bg-2,#141b2e);color:var(--text,#e8ecf6);border:1px solid var(--line,#2a3350);' +
        'border-radius:12px;padding:10px 14px;font-size:14px;display:flex;gap:12px;align-items:center;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.35)';
      b.innerHTML = 'Varallisuuspolku is also available in English. ' +
        '<a href="index-en.html" style="color:var(--accent,#2dd4bf);font-weight:600">Switch →</a>' +
        '<button type="button" aria-label="Dismiss" style="background:none;border:0;color:inherit;cursor:pointer;font-size:16px">✕</button>';
      b.querySelector('button').addEventListener('click', () => b.remove());
      document.body.appendChild(b);
    });
  }
} catch (e) { /* private mode tms. — pysytään suomessa */ }

/* Locale ja yksiköt kielen mukaan. en-GB: 1,234.5 ja €1,234 — käännetyt
   tekstit käyttävät samaa tyyliä (desimaalipisteet). Yksikkölyhenteet:
   fi "t€/v/kk", en "k€/y/mo"; M€ ja €-symboli yhteiset. */
const VP_LOCALE = VP_KIELI === 'en' ? 'en-GB' : 'fi-FI';
const VP_YKS_V = VP_KIELI === 'en' ? 'y' : 'v';
const VP_YKS_KK = VP_KIELI === 'en' ? 'mo' : 'kk';
// Yhdistelmäyksiköt lomakekenttien <em>-liitteisiin ja koosteisiin.
// (Staattisten sivujen samat liitteet vaihtaa kieli-sivut-buildi.js.)
const VP_YKS_EKK = VP_KIELI === 'en' ? '€/mo' : '€/kk';   // €/kk
const VP_YKS_EV = VP_KIELI === 'en' ? '€/yr' : '€/v';     // €/v
const VP_YKS_PV = VP_KIELI === 'en' ? '%/yr' : '%/v';     // %/v
const VP_SANASTO = {}; // kieli-en.js täyttää kun VP_KIELI === 'en'

// JS-navigointien sivupari: en-tilassa X.html → X-en.html (staattiset sivut)
const vpSivu = (nimi) => VP_KIELI === 'en' ? nimi.replace(/\.html$/, '-en.html') : nimi;
function t(s, ...args) {
  let m = VP_KIELI === 'fi' ? s : (VP_SANASTO[s] || s);
  for (let i = 0; i < args.length; i++) m = m.split('{' + i + '}').join(args[i]);
  return m;
}

// Raakaluku localen mukaan — ei pyöristä, kutsuja päättää tarkkuuden opts:lla
const fmtLuku = (v, opts) => Number(v).toLocaleString(VP_LOCALE, opts);

// Päivämäärä localen mukaan
const fmtPvm = (d, opts) => d.toLocaleDateString(VP_LOCALE, opts);

const eurFmt = new Intl.NumberFormat(VP_LOCALE, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtEur = (v) => eurFmt.format(Math.round(v));

// Tiivis rahamuoto: 1 234 → "1 234 €", 56 700 → "57 t€", 1 230 000 → "1,2 M€".
// Yksiköt: NBSP escapeina (\u00A0) — älä muuta literaaleiksi (editointiturva).
function fmtCompact(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return sign + (a / 1e6).toLocaleString(VP_LOCALE, { maximumFractionDigits: a >= 1e7 ? 0 : 1 }) + '\u00A0M€';
  if (a >= 1e3) return sign + Math.round(a / 1e3) + (VP_KIELI === 'en' ? '\u00A0k€' : '\u00A0t€');
  return sign + Math.round(a) + '\u00A0€';
}

const pctFmt = (v) => (v * 100).toLocaleString(VP_LOCALE, { maximumFractionDigits: 1 }) + '\u00A0%';

// Ikä vuosina ja kuukausina: 42,25 → "42 v 3 kk"
function fmtAge(a) {
  const y = Math.floor(a);
  const mo = Math.round((a - y) * 12);
  if (mo >= 12) return `${y + 1} ${VP_YKS_V}`;
  return mo === 0 ? `${y} ${VP_YKS_V}` : `${y} ${VP_YKS_V} ${mo} ${VP_YKS_KK}`;
}
