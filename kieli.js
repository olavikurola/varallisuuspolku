'use strict';

/* Varallisuuspolku — kieli- ja muotoilukerros (KIELIVERSIO.md).
   Kaikki locale-sidonnainen muotoilu yhdessä paikassa: kun kielivalinta
   joskus toteutetaan, locale ja yksiköt vaihtuvat täältä — muut tiedostot
   eivät saa kutsua toLocaleString/toLocaleDateString suoraan.
   Ladataan ensimmäisenä skriptinä (classic script, jaettu globaali skooppi)
   kaikilla sivuilla joilla on JS: index.html, analytiikka.html, agentit.html.
   Vaiheessa 1 tänne tulee myös viestikatalogi (fi oletuksena, en overlay). */

const VP_LOCALE = 'fi-FI';

/* Viestikatalogi, gettext-tyyli: suomenkielinen teksti on itse avain.
   Kun kieli on fi (oletus, ainoa toistaiseksi), t() palauttaa syötteen
   sellaisenaan — suomi ei koskaan kulje sanakirjan kautta eikä voi hajota.
   Englanti tulee vaiheessa 2 fi→en-sanakirjana (VP_SANASTO).
   Parametrit {0}/{1}-paikkamerkein: t('Ikä {0} v', ika). */
let VP_KIELI = 'fi';
const VP_SANASTO = {}; // vaihe 2: en-käännökset { 'fi-teksti': 'en text' }
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
// Huom: "t€"/"M€" ovat suomen lyhenteitä — kielikatalogi ottaa nämä haltuun vaiheessa 1.
function fmtCompact(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return sign + (a / 1e6).toLocaleString(VP_LOCALE, { maximumFractionDigits: a >= 1e7 ? 0 : 1 }) + ' M€';
  if (a >= 1e3) return sign + Math.round(a / 1e3) + ' t€';
  return sign + Math.round(a) + ' €';
}

const pctFmt = (v) => (v * 100).toLocaleString(VP_LOCALE, { maximumFractionDigits: 1 }) + ' %';

// Ikä vuosina ja kuukausina: 42,25 → "42 v 3 kk"
function fmtAge(a) {
  const y = Math.floor(a);
  const mo = Math.round((a - y) * 12);
  if (mo >= 12) return `${y + 1} v`;
  return mo === 0 ? `${y} v` : `${y} v ${mo} kk`;
}
