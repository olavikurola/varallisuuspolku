'use strict';

/* Yhteinen tekstinormalisoija selaintesteille (testit/README.md: sudenkuopat).
   fi-FI-muotoilu käyttää NBSP- (U+00A0) ja kapea-NBSP- (U+202F) tuhaterottimia.
   HUOM: alla oleva merkkiluokka sisältää nämä LITERAALEINA — ne näyttävät
   editorissa välilyönneiltä mutta eivät ole. Normalisoi ENNEN tekstivertailua.
   Yksi määritelmä; jos erotinmerkistö joskus muuttuu (esim. kielivalinnan
   myötä), muutos tehdään vain tähän. */
const norm = (s) => String(s == null ? '' : s).replace(/[  ]/g, ' ');

module.exports = { norm };
