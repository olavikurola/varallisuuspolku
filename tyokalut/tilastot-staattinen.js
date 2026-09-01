#!/usr/bin/env node
'use strict';
/* Tilastojen avainluvut staattiseksi HTML:ksi (GEO/SEO, imaisu-ohjelma A2).

   Tilastot-sivu renderöi kaiken selaimessa stats.jsonista — staattisessa
   HTML:ssä oli 0 lukua, joten hakukone tai kielimalli ei voinut siteerata
   palvelun ainutlaatuista dataa ("paljonko suomalaiset säästävät"). Tämä
   kirjoittaa avainluvut valmiiksi sivulle merkkien väliin Data ja menetelmä
   -osioon. Lohko pysyy näkyvissä myös JS:n kanssa: koneille siteerattava
   teksti, ihmiselle kopioitava avainlukutaulukko — eikä piilotus aiheuta
   sivuhyppyä.

   Idempotentti: sama syöte → sama tulos, merkit korvataan paikalleen.
   Kirjoittaa sekä fi- että en-sivun (en-sivu generoidaan fi:stä
   kieli-sivut-buildi.js:llä, joka kopioi merkit mukanaan — aja tämä SEN
   JÄLKEEN). Käännöstyökalut ohittavat merkkien välisen alueen
   (kieli-html-avaimet.js), jotta vaihtuvat luvut eivät roskaa sanastoa.

   Aja: node tyokalut/tilastot-staattinen.js            (hakee stats.jsonin)
        node tyokalut/tilastot-staattinen.js --tiedosto x.json [--sivu a.html --sivu-en b.html]
   Ajastettu: .github/workflows/tilastot-staattinen.yml (viikoittain). */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API = 'https://varallisuuspolku-data.up.railway.app/stats.json';
const ALKU = '<!-- VP-STAATTISET-TILASTOT alku -->';
const LOPPU = '<!-- VP-STAATTISET-TILASTOT loppu -->';
// Lohko Data ja menetelmä -osion alkuun, "Avoin data ja menetelmä" -kortin
// eteen. Se PYSYY näkyvissä myös JS:n kanssa: koneille siteerattava teksti,
// ihmiselle kopioitava avainlukutaulukko — eikä piilotus aiheuta sivuhyppyä
// (verify-tilastot mittaa, ettei data täyttyessään siirrä sisältöä).
const ANKKURI = /(\n[ \t]*<section class="an-card an-method">)/;

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const SIVU_FI = arg('--sivu') || path.join(ROOT, 'analytiikka.html');
const SIVU_EN = arg('--sivu-en') || path.join(ROOT, 'analytiikka-en.html');

const nbsp = ' ';
const eur = (n) => Math.round(n).toLocaleString('fi-FI').replace(/ /g, nbsp) + nbsp + '€';
const eurEn = (n) => '€' + Math.round(n).toLocaleString('en-GB');
const pct = (x) => Math.round(x * 100);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function ryhmat(d) {
  return Object.keys(d.groups).filter((k) => k !== 'all')
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((k) => ({ k, n: d.groups[k].n || 0 }));
}

function lohko(d, lang) {
  const a = d.groups.all;
  const pvm = String(d.updated || new Date().toISOString()).slice(0, 10);
  const fi = lang === 'fi';
  const E = fi ? eur : eurEnAsEur;
  const rivit = [];
  const r = (k, v, s) => rivit.push(`<tr><th scope="row">${esc(k)}</th><td>${v}</td>${s ? `<td class="an-st-s">${esc(s)}</td>` : '<td></td>'}</tr>`);
  if (a.monthly) r(fi ? 'Kuukausisäästö' : 'Monthly savings', E(a.monthly.p50) + (fi ? '/kk' : '/mo'), fi ? `kvartiilit ${E(a.monthly.p25)}–${E(a.monthly.p75)}` : `quartiles ${E(a.monthly.p25)}–${E(a.monthly.p75)}`);
  if (a.startCapital) r(fi ? 'Sijoitusvarallisuus nyt' : 'Investable wealth now', E(a.startCapital.p50), fi ? `kvartiilit ${E(a.startCapital.p25)}–${E(a.startCapital.p75)}` : `quartiles ${E(a.startCapital.p25)}–${E(a.startCapital.p75)}`);
  if (a.stocks) r(fi ? 'Osakepaino' : 'Equity weight', `${a.stocks.p50}${nbsp}%`, fi ? `kvartiilit ${a.stocks.p25}–${a.stocks.p75}${nbsp}%` : `quartiles ${a.stocks.p25}–${a.stocks.p75}${nbsp}%`);
  if (a.retireAge) r(fi ? 'Tavoiteltu eläkeikä' : 'Target retirement age', `${a.retireAge.p50}${nbsp}${fi ? 'v' : 'y'}`, fi ? `kvartiilit ${a.retireAge.p25}–${a.retireAge.p75} v` : `quartiles ${a.retireAge.p25}–${a.retireAge.p75} y`);
  if (a.withdrawal) r(fi ? 'Kuukausitulon tarve eläkkeellä' : 'Monthly income need in retirement', E(a.withdrawal.p50) + (fi ? '/kk' : '/mo'), '');
  if (a.pension) r(fi ? 'Arvioitu työeläke' : 'Estimated statutory pension', E(a.pension.p50) + (fi ? '/kk' : '/mo'), fi ? 'käyttäjän oma arvio' : "user's own estimate");
  if (a.penShare) r(fi ? 'Työeläkkeen osuus eläketulosta' : 'Pension share of retirement income', `${pct(a.penShare.p50)}${nbsp}%`, '');
  if (a.successProb) r(fi ? 'Onnistumistodennäköisyys (Monte Carlo)' : 'Success probability (Monte Carlo)', `${pct(a.successProb.p50)}${nbsp}%`, fi ? `kvartiilit ${pct(a.successProb.p25)}–${pct(a.successProb.p75)}${nbsp}%` : `quartiles ${pct(a.successProb.p25)}–${pct(a.successProb.p75)}${nbsp}%`);
  const ev = a.events || {};
  const evRivi = (k, fiN, enN) => { if (ev[k] != null) r(fi ? fiN : enN, `${pct(ev[k])}${nbsp}%`, fi ? 'osuus suunnitelmista' : 'share of plans'); };
  evRivi('home', 'Asunnon osto suunnitelmassa', 'Home purchase in plan');
  evRivi('ownHome', 'Oma asunto jo omistuksessa', 'Already owns a home');
  evRivi('inheritance', 'Perintö tai lahja mukana', 'Inheritance or gift included');
  evRivi('child', 'Lapsi suunnitelmassa', 'Child in plan');
  if (a.shares && a.shares.real != null) r(fi ? 'Inflaatiokorjatut luvut käytössä' : 'Inflation-adjusted figures in use', `${pct(a.shares.real)}${nbsp}%`, fi ? 'osuus suunnitelmista' : 'share of plans');

  const g = ryhmat(d);
  const gTxt = g.map((x) => `${x.k}: ${x.n}`).join(' · ');
  const avoinna = g.filter((x) => x.n >= d.kAnon).map((x) => x.k);
  const h2 = fi ? 'Avainluvut lukuina' : 'Key figures in numbers';
  const johdanto = fi
    ? `Tilanne ${pvm}: <b>${d.total}</b> anonyymisti jaettua suunnitelmaa, joista <b>${d.editedN}</b> aidosti muokattua (jakaumat lasketaan ${d.basis === 'edited' ? 'muokatuista' : 'kaikista'}). Luvut ovat mediaaneja käyttäjien <b>suunnitelmista</b> — eivät toteutunutta varallisuutta, eivät normi eivätkä suositus. Ikäryhmäkohtaiset jakaumat julkaistaan, kun ryhmässä on vähintään ${d.kAnon} suunnitelmaa (k-anonymiteetti).`
    : `As of ${pvm}: <b>${d.total}</b> anonymously shared plans, <b>${d.editedN}</b> of them genuinely edited (distributions computed from ${d.basis === 'edited' ? 'edited plans' : 'all plans'}). Figures are medians of users' <b>plans</b> — not realised wealth, not a norm, not advice. Age-group distributions are published once a group has at least ${d.kAnon} plans (k-anonymity).`;
  const ryhmaTxt = fi
    ? `Suunnitelmia ikäryhmittäin: ${gTxt}.${avoinna.length ? ` Ikäryhmäjakaumat avoinna: ${avoinna.join(', ')}.` : ' Yksikään ikäryhmä ei vielä ylitä julkaisukynnystä — jakaumat koskevat koko joukkoa.'}`
    : `Plans by age group: ${gTxt}.${avoinna.length ? ` Age-group distributions open: ${avoinna.join(', ')}.` : ' No age group has reached the publication threshold yet — distributions cover the whole population.'}`;
  const lahde = fi
    ? `Lähde: Varallisuuspolun avoin vertailudata (<a href="https://varallisuuspolku-data.up.railway.app/stats.json">stats.json</a>, CC BY 4.0). Päivittyy automaattisesti.`
    : `Source: Varallisuuspolku open comparison data (<a href="https://varallisuuspolku-data.up.railway.app/stats.json">stats.json</a>, CC BY 4.0). Updated automatically.`;
  return `${ALKU}
      <section class="an-card an-staattinen" id="anStaattinen" data-kieli="ohita">
        <h2>${h2} <small>${fi ? 'mediaanit, päivitetty' : 'medians, updated'} ${pvm}</small></h2>
        <p class="an-note">${johdanto}</p>
        <table class="an-st"><tbody>
${rivit.map((x) => '          ' + x).join('\n')}
        </tbody></table>
        <p class="an-note">${ryhmaTxt}</p>
        <p class="an-note">${lahde}</p>
      </section>
      ${LOPPU}`;
}
function eurEnAsEur(n) { return eurEn(n); }

function kirjoita(sivu, html, d, lang) {
  let s = fs.readFileSync(sivu, 'utf8');
  const uusi = lohko(d, lang);
  const i = s.indexOf(ALKU), j = s.indexOf(LOPPU);
  if (i >= 0 && j > i) {
    s = s.slice(0, i) + uusi + s.slice(j + LOPPU.length);
  } else {
    if (!ANKKURI.test(s)) throw new Error(sivu + ': "Avoin data ja menetelmä" -korttia (.an-method) ei löydy — lohkoa ei voi sijoittaa');
    s = s.replace(ANKKURI, (m) => '\n    ' + uusi + m);
  }
  // Dataset-skeema: dateModified päivittyy datan mukana (GEO: tuoreus)
  const pvm = String(d.updated || new Date().toISOString()).slice(0, 10);
  if (/"dateModified": "[^"]*"/.test(s)) s = s.replace(/"dateModified": "[^"]*"/, `"dateModified": "${pvm}"`);
  else s = s.replace('"isAccessibleForFree": true,\n    "inLanguage"', `"isAccessibleForFree": true,\n    "dateModified": "${pvm}",\n    "inLanguage"`);
  fs.writeFileSync(sivu, s);
  return (s.match(/<tr>/g) || []).length;
}

(async () => {
  const tiedosto = arg('--tiedosto');
  let d;
  if (tiedosto) d = JSON.parse(fs.readFileSync(tiedosto, 'utf8'));
  else {
    const r = await fetch(API);
    if (!r.ok) throw new Error('stats.json: HTTP ' + r.status);
    d = await r.json();
  }
  if (!d || !d.groups || !d.groups.all) throw new Error('stats.json: groups.all puuttuu');
  const nFi = kirjoita(SIVU_FI, null, d, 'fi');
  const nEn = fs.existsSync(SIVU_EN) ? kirjoita(SIVU_EN, null, d, 'en') : 0;
  console.log(`tilastot-staattinen: ${path.basename(SIVU_FI)} ${nFi} riviä, ${path.basename(SIVU_EN)} ${nEn} riviä (data ${String(d.updated).slice(0, 10)}, N=${d.total})`);
})().catch((e) => { console.error('tilastot-staattinen:', e.message); process.exit(1); });
