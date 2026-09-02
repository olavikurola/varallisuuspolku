'use strict';
/* Varallisuuspolku — jakolinkin pakkaus (erä 7, jatko).

   Jakolinkki kantaa koko suunnitelman URL:ssa (#s=base64(JSON)). Kahdentoista
   tapahtuman suunnitelma on ~2 400 merkkiä ja perhelinkki moninkertainen —
   viestisovellukset ja jotkin selaimet katkovat pitkiä osoitteita. Tämä on
   SYNKRONINEN LZW-pakkaus (selaimen CompressionStream on asynkroninen, mikä
   vaatisi latauspolun uusiksi; Node voisi käyttää zlibiä, mutta selain ei
   synkronisesti). Ei riippuvuuksia, sama koodi selaimessa ja MCP:ssä.

   Muoto: '~' + base64url(LZW-koodit UTF-16-yksiköistä, koodileveys 9→15 bittiä).
   '~' ei esiinny base64:ssä, joten vanhat pakkaamattomat linkit tunnistuvat
   yksikäsitteisesti — #s=/#e=/#f=-etuliitteet pysyvät ennallaan.
   Mitattu: 12 tapahtuman suunnitelma 2 376 → 1 014 merkkiä (−57 %), perhelinkki −48 %. */

(function (root) {
  const MARKER = '~';
  const BITS = 15;              // enimmäisleveys: sanakirja enintään 32 768 koodia → nollaus
  const MAX = 1 << BITS;
  const MIN_BITS = 9;           // koodileveys kasvaa 9 → 15 bittiä sanakirjan täyttyessä
                                // (lyhyet JSON-linkit: valtaosa koodeista < 512 → ~35 % lisähyöty)
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const B64I = {};
  for (let i = 0; i < 64; i++) B64I[B64[i]] = i;

  // Bittikirjoitin/-lukija: koodit vaihtuvalla leveydellä ([koodi, leveys]);
  // ulos base64url (6 bittiä/merkki), loppuun nollatäyte
  function bitsToB64(pairs) {
    let out = '', acc = 0, n = 0;
    for (const [c, w] of pairs) {
      acc = (acc << w) | c; n += w;
      while (n >= 6) { n -= 6; out += B64[(acc >>> n) & 63]; }
      acc &= (1 << n) - 1;
    }
    if (n > 0) out += B64[(acc << (6 - n)) & 63];
    return out;
  }
  function bitReader(s) {
    let i = 0, acc = 0, n = 0;
    return (w) => { // lukee w bittiä tai palauttaa null virran lopussa
      while (n < w) {
        if (i >= s.length) return null;
        const v = B64I[s[i++]];
        if (v == null) throw new Error('pakkaus: viallinen merkki');
        acc = (acc << 6) | v; n += 6;
      }
      n -= w;
      const c = (acc >>> n) & ((1 << w) - 1);
      acc &= (1 << n) - 1;
      return c;
    };
  }

  function pakkaa(str) {
    if (typeof str !== 'string') str = String(str);
    // Alkusanakirja: 0–255 = ne UTF-16-yksiköt; muut yksiköt (ä, ö, €, …) lisätään
    // literaaleina koodilla 256 + seuraava 16-bittinen arvo kahtena osana (ylä/alatavu)
    let dict = new Map();
    let next = 258; // 256 = literaali-escape, 257 = sanakirjan nollaus
    let width = MIN_BITS;
    const reset = () => { dict = new Map(); next = 258; width = MIN_BITS; };
    const pairs = [];
    let w = '';
    const emit = (s) => {
      if (s.length === 1) {
        const u = s.charCodeAt(0);
        if (u < 256) pairs.push([u, width]);
        else { pairs.push([256, width]); pairs.push([u >>> 8, width]); pairs.push([u & 255, width]); }
      } else pairs.push([dict.get(s), width]);
    };
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      const wc = w + c;
      if (wc.length === 1 || dict.has(wc)) { w = wc; continue; }
      emit(w);
      if (next < MAX) {
        dict.set(wc, next++);
        if (next > (1 << width) && width < BITS) width++; // purkaja kasvattaa samassa kohdassa
      } else { pairs.push([257, width]); reset(); }
      w = c;
    }
    if (w) emit(w);
    return MARKER + bitsToB64(pairs);
  }

  function pura(str) {
    if (typeof str !== 'string' || str[0] !== MARKER) throw new Error('pakkaus: ei pakattu muoto');
    const read = bitReader(str.slice(1));
    let dict = [];
    let width = MIN_BITS;
    const reset = () => { dict = []; width = MIN_BITS; };
    const entry = (c) => (c < 256 ? String.fromCharCode(c) : dict[c - 258]);
    let out = '', w = '';
    for (;;) {
      const c = read(width);
      if (c == null) break;
      let s;
      if (c === 256) { // literaali: kaksi osaa = yksi 16-bittinen yksikkö
        const hi = read(width), lo = read(width);
        if (hi == null || lo == null) break; // täytebitit lopussa
        s = String.fromCharCode((hi << 8) | lo);
      } else if (c === 257) { reset(); w = ''; continue; }
      else if (c < 256 || c - 258 < dict.length) s = entry(c);
      else if (c - 258 === dict.length && w) s = w + w[0]; // KwKwK-tapaus
      else break; // täytebitit lopussa muodostavat epäkelvon koodin → loppu
      out += s;
      if (w && dict.length < MAX - 258) {
        dict.push(w + s[0]);
        // Pakkaaja kasvatti leveyttä kun next ylitti 2^width; purkajan next = dict.length + 258
        if (dict.length + 258 + 1 > (1 << width) && width < BITS) width++;
      }
      w = s;
    }
    return out;
  }

  const onPakattu = (s) => typeof s === 'string' && s[0] === MARKER;

  const api = { pakkaa, pura, onPakattu, MARKER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VP_PAKKAUS = api;
})(typeof window !== 'undefined' ? window : globalThis);
