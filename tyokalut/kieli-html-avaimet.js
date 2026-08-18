'use strict';
/* Poimii käännettävät segmentit staattisilta HTML-sivuilta (KIELIVERSIO.md,
   vaihe 3) ja kirjoittaa sanastopohjan tyokalut/kieli-en-html.json
   ({ "fi-segmentti": "" } — tyhjä arvo = kääntämättä, generaattori jättää
   silloin suomen). Olemassa olevat käännökset säilytetään ajokerrasta toiseen.
   Aja: node tyokalut/kieli-html-avaimet.js

   Mitä poimitaan:
   - tekstisolmuajot inline-merkkauksineen: <li>…<b>…</b>…</li> pysyy YHTENÄ
     segmenttinä, jotta kääntäjä näkee kokonaisen virkkeen. Jos ajossa ei ole
     lainkaan paljasta tekstiä (esim. nav-linkkirivi), se puretaan elementeittäin.
   - attribuutit title / aria-label / placeholder / alt sekä metojen content
     (description, og:title/og:description, twitter:title/twitter:description)
   - <title>-teksti (kulkee tavallisena tekstisolmuna)
   - JSON-LD: description-, text- ja featureList-arvot sekä name Question- ja
     Dataset-tyypeillä (brändi-/henkilönimet jäävät pois). Avain on RAAKA
     merkkijono HTML:stä — poiminta varmistaa, ettei arvossa ole JSON-escapeja.

   Mitä ohitetaan tarkoituksella:
   - <script> (paitsi JSON-LD), <style>, <pre> (komentoesimerkit), <svg>,
     HTML-kommentit ja Plausible-lohko (scriptin sisällä)
   - segmentit ilman ≥3 kirjaimen sanaa: yksikköliitteet (v, €/kk, %/v),
     pelkät luvut/entiteetit (70&nbsp;%) ja kaavasolut (C·(k−1)…)
   - <code>-sisältö sellaisenaan (MCP-työkalunimet ym. pysyvät suomeksi)
   - tiedostonimet (stats.json, llms.txt …)

   HUOM: avaimissa voi olla literaaleja NBSP-merkkejä (U+00A0), &nbsp;-
   entiteettejä ja rivinvaihtoja sisennyksineen — kaikki TAVULLEEN kuten
   lähdesivulla, koska generaattori (kieli-sivut-buildi.js) korvaa avaimen
   täsmälleen samana esiintymänä. Älä editoi JSONia työkaluilla, jotka
   normalisoivat välilyöntejä. */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SIVUT = ['index.html', 'analytiikka.html', 'agentit.html',
  'validointi.html', 'saavutettavuus.html', 'tietosuoja.html'];

/* Inline-tagit pysyvät segmentin sisällä; kaikki muut tagit katkaisevat
   segmentin (myös span — sivuilla span on aina oma looginen yksikkönsä). */
const INLINE = new Set(['a', 'b', 'i', 'em', 'strong', 'code', 'small',
  'sup', 'sub', 'abbr', 'mark', 'u', 's', 'time', 'br', 'wbr']);
/* Raakalohkot: sisältö ohitetaan kokonaan (JSON-LD-scriptit erikseen). */
const RAW = new Set(['script', 'style', 'pre', 'svg']);

const avaimet = new Map(); // avain -> [lähde, ...]
const KIRJAIMET = /[A-Za-zÀ-ÖØ-öø-ÿ]+/g;

const riisuEntiteetit = (s) => s.replace(/&[a-zA-Z]+;|&#x?[0-9a-fA-F]+;/g, ' ');
const riisuTagit = (s) => s.replace(/<[^>]*>/g, ' ');
const riisuKoodi = (s) => s.replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, ' ');
const kirjaimia = (s) => (s.match(KIRJAIMET) || []).join('').length;
/* Pisin yhtenäinen kirjainjono — erottaa oikean tekstin kaavoista (C·k−1). */
const pisinSana = (s) => (s.match(KIRJAIMET) || []).reduce((a, b) => Math.max(a, b.length), 0);
/* Trimmaa vain ASCII-välit — literaali NBSP reunalla säilyy tavulleen. */
const asciiTrim = (s) => s.replace(/^[ \t\r\n]+/, '').replace(/[ \t\r\n]+$/, '');

function lisaa(avain, lahde) {
  if (!avain) return;
  const nakyva = riisuEntiteetit(riisuTagit(riisuKoodi(avain)));
  if (pisinSana(nakyva) < 3) return; // yksiköt, luvut, kaavat
  if (/^https?:/.test(avain)) return; // URLit ei käännetä
  if (/^[\w./-]+\.(json|js|html|txt|md|svg|png|webmanifest)$/.test(avain)) return; // tiedostonimet
  if (!avaimet.has(avain)) avaimet.set(avain, []);
  avaimet.get(avain).push(lahde);
}

/* Jakaa ajon huipputason osiin: paljas teksti + kokonaiset elementit.
   Parittomat tagit (fragmentit) ohitetaan opaakkeina. */
function huipputaso(run) {
  const elems = [];
  let paljas = '', i = 0;
  while (i < run.length) {
    const lt = run.indexOf('<', i);
    if (lt < 0) { paljas += run.slice(i); break; }
    paljas += run.slice(i, lt);
    const gt = run.indexOf('>', lt);
    if (gt < 0) { paljas += run.slice(lt); break; }
    const tag = run.slice(lt, gt + 1);
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag);
    const nimi = m ? m[2].toLowerCase() : '';
    if (!m || m[1] || /\/>$/.test(tag) || nimi === 'br' || nimi === 'wbr') {
      i = gt + 1; continue; // irrallinen sulku tai void-tagi
    }
    // etsi saman nimen vastinpari syvyyslaskurilla
    const re = new RegExp('<(/?)' + nimi + '\\b', 'gi');
    re.lastIndex = gt + 1;
    let syvyys = 1, close = -1, mm;
    while ((mm = re.exec(run))) {
      syvyys += mm[1] ? -1 : 1;
      if (!syvyys) { close = mm.index; break; }
    }
    if (close < 0) { i = gt + 1; continue; } // pariton avaus — ohita tagi
    elems.push({ nimi, sisus: run.slice(gt + 1, close) });
    i = run.indexOf('>', close) + 1;
  }
  return { paljas, elems };
}

/* Käsittelee yhden tekstiajon: siistii reunat, purkaa pelkistä elementeistä
   koostuvat ajot osiin ja lisää lopulta avaimen. */
function segmentti(run, lahde) {
  run = asciiTrim(run);
  let ed;
  do { // reunoilta kirjaimettomat inline-parit: <i class="sw"></i>, <i>🏠</i>, <b>70&nbsp;%</b>
    ed = run;
    run = run.replace(/^<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>([^<]*)<\/\1>[ \t\r\n]*/,
      (koko, t, sisus) => (kirjaimia(riisuEntiteetit(sisus)) ? koko : ''));
    run = run.replace(/[ \t\r\n]*<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>([^<]*)<\/\1>$/,
      (koko, t, sisus) => (kirjaimia(riisuEntiteetit(sisus)) ? koko : ''));
    run = asciiTrim(run);
  } while (run !== ed);
  if (!run) return;
  if (run.startsWith('<')) {
    const { paljas, elems } = huipputaso(run);
    if (!kirjaimia(riisuEntiteetit(paljas)) && elems.length) {
      // pelkkiä elementtejä (nav-linkit, alaviitelinkkirivit) — pura osiin;
      // <code>-sisältöön ei laskeuduta (työkalunimet pysyvät suomeksi)
      for (const e of elems) if (e.nimi !== 'code' && e.nimi !== 'pre') segmentti(e.sisus, lahde);
      return;
    }
  }
  lisaa(run, lahde);
}

/* Poimii yhden tagin käännettävät attribuutit. */
function attribuutit(tagRaw, nimi, lahde) {
  const attr = (n) => {
    const m = new RegExp('(?:^|[ \\t\\r\\n])' + n + '\\s*=\\s*"([^"]*)"', 'i').exec(tagRaw);
    return m ? m[1] : null;
  };
  if (nimi === 'meta') {
    const name = attr('name'), prop = attr('property');
    const kohde = name === 'description' || name === 'twitter:title' ||
      name === 'twitter:description' || prop === 'og:title' ||
      prop === 'og:description' || prop === 'twitter:title' || prop === 'twitter:description';
    if (kohde) lisaa(attr('content'), lahde + ' [meta ' + (name || prop) + ']');
    return;
  }
  for (const a of ['title', 'aria-label', 'placeholder', 'alt']) {
    const v = attr(a);
    if (v) lisaa(v, lahde + ' [' + a + ']');
  }
}

/* JSON-LD: kerää käännettävät kentät. Avaimeksi kelpaa vain arvo, joka
   esiintyy lohkossa RAAKANA (ei JSON-escapeja) — muuten generaattorin
   täsmäkorvaus ei osuisi, ja siitä varoitetaan. */
function jsonLd(raaka, lahde) {
  let data;
  try { data = JSON.parse(raaka); } catch (e) {
    console.warn(`VAROITUS: JSON-LD ei jäsenny (${lahde}) — lohko ohitettu`);
    return;
  }
  const poimi = (v, k) => {
    if (typeof v !== 'string' || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v)) return;
    if (raaka.indexOf(v) < 0) {
      console.warn(`VAROITUS: JSON-LD-arvo ei löydy raakana (${lahde}, ${k}) — escapeja? Ohitettu.`);
      return;
    }
    lisaa(v, lahde + ' [JSON-LD ' + k + ']');
  };
  const kaynti = (node) => {
    if (Array.isArray(node)) { node.forEach(kaynti); return; }
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (k === 'description' || k === 'text') poimi(v, k);
      else if (k === 'name' && (node['@type'] === 'Question' || node['@type'] === 'Dataset')) poimi(v, k);
      else if (k === 'featureList' && Array.isArray(v)) v.forEach((s) => poimi(s, 'featureList'));
      kaynti(v);
    }
  };
  kaynti(data);
}

/* Tilakone: kulkee HTML:n läpi tagi kerrallaan. Teksti ja inline-tagit
   kertyvät puskuriin; lohkotagi, kommentti tai raakalohko katkaisee ajon. */
function skannaa(html, sivu) {
  let i = 0, buf = '', bufAlku = 0;
  const rivi = (idx) => html.slice(0, idx).split('\n').length;
  const flush = () => { if (buf) segmentti(buf, sivu + ':' + rivi(bufAlku)); buf = ''; };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { buf += html.slice(i); break; }
    if (lt > i) { if (!buf) bufAlku = i; buf += html.slice(i, lt); }
    if (html.startsWith('<!--', lt)) { // kommentit eivät ole käyttäjälle näkyvää sisältöä
      flush();
      const loppu = html.indexOf('-->', lt + 4);
      i = loppu < 0 ? html.length : loppu + 3;
      continue;
    }
    const gt = html.indexOf('>', lt);
    if (gt < 0) break;
    const tagRaw = html.slice(lt, gt + 1);
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(tagRaw);
    if (!m) { flush(); i = gt + 1; continue; } // <!DOCTYPE …>
    const nimi = m[2].toLowerCase(), sulkeva = !!m[1];
    if (!sulkeva) attribuutit(tagRaw, nimi, sivu + ':' + rivi(lt));
    if (!sulkeva && RAW.has(nimi)) {
      flush();
      const kiinni = html.toLowerCase().indexOf('</' + nimi, gt + 1);
      if (nimi === 'script' && /application\/ld\+json/i.test(tagRaw)) {
        jsonLd(html.slice(gt + 1, kiinni < 0 ? html.length : kiinni), sivu + ':' + rivi(lt));
      }
      i = kiinni < 0 ? html.length : html.indexOf('>', kiinni) + 1;
      continue;
    }
    if (INLINE.has(nimi)) { if (!buf) bufAlku = lt; buf += tagRaw; }
    else flush();
    i = gt + 1;
  }
  flush();
}

for (const sivu of SIVUT) {
  const ennen = avaimet.size;
  skannaa(fs.readFileSync(path.join(ROOT, sivu), 'utf8'), sivu);
  console.log(`${sivu}: ${avaimet.size - ennen} uutta avainta`);
}

// Luonnos: säilytä olemassa olevat käännökset, lisää uudet tyhjinä
const ULOS = path.join(__dirname, 'kieli-en-html.json');
let vanha = {};
try { vanha = JSON.parse(fs.readFileSync(ULOS, 'utf8')); } catch (e) {}
const ulos = {};
for (const avain of [...avaimet.keys()].sort((a, b) => a.localeCompare(b, 'fi'))) {
  ulos[avain] = vanha[avain] || '';
}
fs.writeFileSync(ULOS, JSON.stringify(ulos, null, 2) + '\n', 'utf8');

const kaannetty = Object.values(ulos).filter(Boolean).length;
const nbsp = [...JSON.stringify(ulos)].filter((c) => c === String.fromCharCode(0xA0)).length;
console.log(`Avaimia: ${avaimet.size} (käännetty ${kaannetty}, literaaleja NBSP-merkkejä ${nbsp})`);
console.log(`Sanasto: ${ULOS}`);
// Poistuneet avaimet (vanhassa mutta ei enää sivuilla) — käännösten siivousapu
const poistuneet = Object.keys(vanha).filter((k) => !(k in ulos));
if (poistuneet.length) {
  console.log(`Poistuneita avaimia (eivät enää sivuilla): ${poistuneet.length}`);
  for (const k of poistuneet) console.log('  - ' + (k.length > 70 ? k.slice(0, 70) + '…' : k));
}
