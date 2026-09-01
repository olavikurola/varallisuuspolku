#!/usr/bin/env node
'use strict';
/* Hakuaikeiden laskeutumissivut (imaisu-ohjelma B8).

   Etusivu yrittää vastata kaikkiin hakuihin, mutta sen otsikot ovat
   käyttöliittymän nimiä ("Perustiedot", "MC-laboratorio") — kukaan ei
   googlaa niitä. Ihmiset hakevat "eläkelaskuri", "FIRE-laskuri", "paljonko
   pitää säästää eläkkeelle", "osakesäästötili vai arvo-osuustili". Tämä
   generaattori kirjoittaa jokaiselle aikeelle oman staattisen sivun, jossa
   on AITO vastaus (ei ohutta SEO-tekstiä), FAQ-skeema ja "Kokeile heti"
   -linkki valmiiseen skenaarioon (#s=…, sama jakolinkkimekanismi kuin muuallakin
   — mitään ei tallenneta palvelimelle). Skenaariot rakennetaan samasta
   deklaratiivisesta ops-muodosta kuin kysymyskirjasto (apu.js KYSYMYKSET).

   Sivut ovat GENEROITUJA — muokkaa tätä tiedostoa, älä .html-tiedostoja.
   Aja: node tyokalut/laskeutumissivut.js   (kirjoittaa laskurit/*.html ja
   päivittää sitemap.xml:n <url>-lohkot merkkien väliin). Idempotentti. */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'laskurit');
const DOMAIN = 'https://varallisuuspolku.com/';
const PVM = new Date().toISOString().slice(0, 10);

/* ---------- skenaariot: perussuunnitelma + ops (kuten KYSYMYKSET) ---------- */
const PERUS = { ageNow: 35, ageEnd: 90, startCapital: 40000, monthly: 500, savingsGrowth: 1.5,
  allocStocks: 80, allocBonds: 15, glide: false, real: true, tax: true,
  events: [{ id: 1, type: 'retirement', age: 65, withdrawal: 2400, pension: 1500, pensionAge: 65 }] };

function rakenna(ops, muutos) {
  const st = JSON.parse(JSON.stringify(PERUS));
  if (muutos) Object.assign(st, muutos);
  const ret = st.events.find((e) => e.type === 'retirement');
  if (ops.retAge != null) ret.age = ops.retAge;
  if (ops.withdrawal != null) ret.withdrawal = ops.withdrawal;
  if (ops.pension != null) ret.pension = ops.pension;
  if (ops.goal && ops.goal !== 'manual') ret.goal = ops.goal;
  if (ops.conf != null) ret.conf = ops.conf;
  if (ops.acct) st.acct = ops.acct;
  if (ops.event) {
    const ev = ops.event;
    const e = { id: 2, type: ev.type, age: st.ageNow + (ev.dAge || 0) };
    if (ev.amount != null) e.amount = ev.amount;
    if (ev.financing) { e.financing = ev.financing; if (ev.down != null) e.down = ev.down; if (ev.rate != null) e.rate = ev.rate; if (ev.years != null) e.years = ev.years; }
    if (ev.isAsset) { e.isAsset = true; e.appr = ev.appr != null ? ev.appr : 2; }
    if (ev.recMonthly != null) e.recMonthly = ev.recMonthly;
    if (ev.recYears != null) e.recYears = ev.recYears;
    st.events.push(e);
  }
  return st;
}
// #e= = esimerkki: sovellus näyttää "valmis esimerkki, vaihda luvut omiksesi"
// -kortin (ei "toisen henkilön suunnitelma" kuten #s=-jakolinkillä)
const linkki = (st) => './#e=' + Buffer.from(JSON.stringify(st), 'utf8').toString('base64');

/* ---------- sivut ---------- */
const SIVUT = [
  {
    slug: 'elakelaskuri',
    title: 'Eläkelaskuri — riittävätkö rahat eläkkeellä?',
    h1: 'Eläkelaskuri: riittävätkö rahasi koko eläkeajaksi?',
    kuvaus: 'Ilmainen eläkelaskuri, joka laskee koko elinkaaren: työeläke, omat sijoitukset, verot ja Monte Carlo -onnistumistodennäköisyys. Vedä eläkeikää ja näe hinta heti. Kaikki laskenta selaimessa.',
    vastaus: [
      'Eläkelaskurin tärkein kysymys ei ole "paljonko minulla on 65-vuotiaana" vaan <b>riittävätkö rahat 90-vuotiaaksi</b>. Vastaus riippuu neljästä asiasta: työeläkkeesi tasosta, omien sijoitustesi määrästä eläkkeelle jäädessä, kuukausittaisesta tulotarpeestasi ja siitä, kuinka pahasti markkinat heiluvat juuri eläkkeen alkuvuosina.',
      'Varallisuuspolku laskee nämä yhdessä näkymässä. Syötät kolme lukua (ikä, sijoitukset nyt, säästö kuukaudessa), lisäät työeläkearviosi työeläkeotteelta <b>käteen jäävänä</b> summana ja saat kaksi vastausta: kestävän kuukausitulon, jonka sijoituksesi kantavat eläkeiästä suunnitelman loppuun, ja onnistumistodennäköisyyden — osuuden 5 000 simuloidusta markkinapolusta, joilla varat riittävät.',
      'Laskuri huomioi suomalaisen verotuksen: myyntivoittovero nostojen voitto-osuudesta (30 % / 34 % yli 30 000 €), hankintameno-olettama, osakesäästötilin ja arvo-osuustilin ero sekä varainsiirtovero asunnon ostossa. Inflaatiokorjatussa tilassa kaikki luvut ovat tämän päivän rahassa. Laskenta on validoitu käsinlaskettavin esimerkein, ja tunnetut yksinkertaistukset on listattu avoimesti.',
      'Eläkeikä ei ole lomakkeen kenttä vaan graafin kahva: <b>tartu eläkemerkkiin ja vedä</b>, niin laskuri kertoo heti, mitä aikaisempi tai myöhäisempi eläke maksaa kuukausitulona tai vaadittavana säästönä.',
    ],
    ukk: [
      ['Mitä eläkelaskuri tarvitsee lähtötiedoiksi?', 'Kolme lukua: ikäsi, sijoitusvarallisuutesi nyt ja säästösi kuukaudessa. Työeläkkeen arvion voit lisätä työeläkeotteelta — laskuri kysyy käteen jäävää summaa, koska ote näyttää bruton.'],
      ['Miten onnistumistodennäköisyys lasketaan?', 'Monte Carlo -simulaatio ajaa 5 000 markkinapolkua samoilla oletuksilla. Onnistumistodennäköisyys on niiden polkujen osuus, joilla varat riittävät suunnitelman loppuun. Se ei ole ennuste vaan mittari suunnitelman herkkyydestä markkinoiden heilunnalle.'],
      ['Lähteekö suunnitelmani jonnekin?', 'Ei. Kaikki laskenta tapahtuu selaimessasi ja suunnitelma tallentuu vain omalle laitteellesi. Jakolinkki kantaa suunnitelman osoitteessa — sitäkään ei tallenneta palvelimelle.'],
    ],
    kokeile: [
      ['Eläkkeelle 65 — riittääkö?', rakenna({ retAge: 65, goal: 'manual' })],
      ['Eläkkeelle jo 60?', rakenna({ retAge: 60, goal: 'manual' })],
      ['Kestävä kuukausitulo 65 v alkaen', rakenna({ retAge: 65, goal: 'withdrawal' })],
    ],
  },
  {
    slug: 'fire-laskuri',
    title: 'FIRE-laskuri — kuinka aikaisin voit lopettaa työt?',
    h1: 'FIRE-laskuri: aikaisin eläkeikä halutulla varmuudella',
    kuvaus: 'FIRE-laskuri suomalaisella verotuksella: aikaisin eläkeikä 75/85/95 % varmuudella, kestävä nostotaso ja sekvenssiriskin stressitestit — ei 4 %:n sääntöä vaan koko elinkaari.',
    vastaus: [
      'Useimmat FIRE-laskurit kertovat, milloin salkkusi on 25 kertaa vuosikulusi — eli soveltavat 4 %:n sääntöä. Sääntö on yhdysvaltalainen, nimellinen ja vero-vapaa oletus, joka ei tunne suomalaista myyntivoittoveroa, työeläkettä eikä sitä, että 45-vuotiaana aloitettu nosto voi kestää 45 vuotta.',
      'Varallisuuspolun FIRE-laskuri ratkaisee kysymyksen toisin päin: <b>kuinka aikaisin voit lopettaa työt, kun haluat, että varat riittävät X %:n varmuudella</b>. Valitset kuukausitulon tarpeen ja varmuustason (75, 85 tai 95 % simuloiduista markkinapoluista), ja ratkaisija hakee aikaisimman eläkeiän. Työeläke alkaa omalla iällään — ennen sitä koko tulo nostetaan sijoituksista, ja siitä menee vero voiton osuudesta.',
      'Sekvenssiriski — huono markkinavuosi juuri nostojen alkaessa — on FIRE-suunnitelman suurin yksittäinen riski. Laskurin Markkinatesti ajaa suunnitelman viiden deterministisen stressiskenaarion läpi (karhu heti eläkkeellä, menetetty vuosikymmen, stagflaatio, romahdus −50 %) ja näyttää, missä iässä varat loppuisivat kussakin.',
      'Kaikki on ilmaista, ilman rekisteröitymistä, ja suunnitelma pysyy omalla laitteellasi. Laskuri ei anna sijoitusneuvontaa: se laskee, sinä päätät.',
    ],
    ukk: [
      ['Miksi ei 4 %:n sääntö?', 'Sääntö olettaa 30 vuoden nostoajan, Yhdysvaltain historiallisia tuottoja ja nollaveroa. Suomessa nostoista maksetaan myyntivoittovero, ja varhainen eläke voi kestää 40–50 vuotta. Elinkaarisimulaatio omilla luvuillasi on rehellisempi.'],
      ['Mikä varmuustaso kannattaa valita?', 'Laskuri ei suosittele — se näyttää, mitä kukin taso maksaa. 85 % on yleinen kompromissi: 15 % simuloiduista poluista jää alle tavoitteen, mutta niissäkin on yleensä aikaa reagoida.'],
      ['Huomioiko laskuri työeläkkeen?', 'Kyllä. Työeläke alkaa valitsemastasi iästä ja pienentää sijoituksista nostettavaa summaa. Syötä se käteen jäävänä arviona.'],
    ],
    kokeile: [
      ['Aikaisin eläkeikä 85 % varmuudella', rakenna({ goal: 'age', conf: 0.85, withdrawal: 2200 }, { ageNow: 32, startCapital: 60000, monthly: 2000, allocStocks: 95, allocBonds: 5 })],
      ['Sama 95 % varmuudella', rakenna({ goal: 'age', conf: 0.95, withdrawal: 2200 }, { ageNow: 32, startCapital: 60000, monthly: 2000, allocStocks: 95, allocBonds: 5 })],
    ],
  },
  {
    slug: 'paljonko-pitaa-saastaa-elakkeelle',
    title: 'Paljonko pitää säästää eläkkeelle? — laskuri',
    h1: 'Paljonko pitää säästää eläkkeelle?',
    kuvaus: 'Laskuri kertoo tarvittavan kuukausisäästön, jotta eläkeajan tulotarve toteutuu — työeläke, verot ja markkinoiden heilunta huomioiden. Ilmainen, kaikki laskenta selaimessa.',
    vastaus: [
      'Kysymykseen ei ole yhtä lukua, koska vastaus riippuu kolmesta valinnasta: <b>milloin</b> haluat jäädä eläkkeelle, <b>paljonko</b> haluat käyttää kuukaudessa ja <b>kuinka varmasti</b> haluat rahojen riittävän. Laskuri tekee näistä valinnoista luvun: kuukausisäästön, jolla suunnitelma toteutuu.',
      'Lähtökohta on työeläke. Suomalaisella palkansaajalla se kattaa tyypillisesti 40–60 % eläkkeen tulotarpeesta; loput pitää tulla omista sijoituksista. Jos tulotarve on 2 500 € kuukaudessa ja käteen jäävä työeläke 1 500 €, sijoitusten on kannettava 1 000 € kuukaudessa — ja vero sen päälle, koska nostosta menee myyntivoittovero voiton osuudesta.',
      'Varallisuuspolku ratkaisee säästötarpeen deterministisesti odotetulla tuotolla tai valitsemallasi varmuustasolla Monte Carlo -poluista. Voit porrastaa säästön elämänvaiheittain (vähemmän lapsivuosina, enemmän myöhemmin) ja lisätä isot hankinnat lainoineen — laskuri näyttää, miten asunnon osto tai lapsi muuttaa tarvittavaa säästöä.',
      'Palvelu ei suosittele tuotteita eikä ota kantaa siihen, mihin säästät. Se laskee, kuinka paljon — sinun omilla oletuksillasi, joita voit muuttaa.',
    ],
    ukk: [
      ['Mitä laskuri olettaa tuotosta?', 'Oletuksena osakkeet 7 %, korot 3 % ja käteinen 1,5 % vuodessa nimellisesti, inflaatio 2 %. Kaikki ovat muokattavissa, ja oletukset on dokumentoitu validointisivulla.'],
      ['Riittääkö 100 € kuukaudessa?', 'Se riippuu iästäsi ja tavoitteestasi. Laskuri näyttää, mihin 100 €/kk kantaa — ja mitä tavoitteesi vaatisi. Aloita omilla luvuillasi.'],
      ['Entä jos en pysty säästämään joka kuukausi?', 'Porrasta säästö ikävaiheittain tai lisää tulokatko (työttömyys, perhevapaa). Laskuri näyttää katkon hinnan suunnitelman lopussa.'],
    ],
    kokeile: [
      ['Tarvittava säästö eläkkeelle 65 v, 2 500 €/kk', rakenna({ retAge: 65, goal: 'saving', withdrawal: 2500 })],
      ['Sama eläkkeelle 60 v', rakenna({ retAge: 60, goal: 'saving', withdrawal: 2500 })],
      ['Entä jos jään vuodeksi työttömäksi?', rakenna({ retAge: 65, goal: 'saving', withdrawal: 2500, event: { type: 'income_gap', dAge: 2, recMonthly: -500, recYears: 1 } })],
    ],
  },
  {
    slug: 'osakesaastotili-vai-arvo-osuustili',
    title: 'Osakesäästötili vai arvo-osuustili? — vertaa koko elinkaarella',
    h1: 'Osakesäästötili vai arvo-osuustili?',
    kuvaus: 'Vertaa osakesäästötiliä (OST), arvo-osuustiliä (AOT) ja vakuutuskuorta koko elinkaarella: verot, osinkojen verotus, nostot eläkkeellä. Laskuri näyttää eron euroina omilla luvuillasi.',
    vastaus: [
      'Ero ei ole tuotossa vaan <b>verotuksen ajoituksessa</b>. Arvo-osuustilillä osingoista menee vero heti (85 % osingosta veronalaista pääomatuloa), ja jokaisesta myynnistä maksetaan myyntivoittovero. Osakesäästötilillä osingot ja myyntivoitot kertyvät tilin sisällä verotta, ja vero maksetaan vasta nostettaessa — voiton osuudesta. Vakuutuskuori toimii samoin, mutta kuoren omat kulut syövät osan hyödystä.',
      'Kumpi voittaa, riippuu osinkotuotosta, sijoitusajasta, kuluista ja siitä, kuinka paljon nostat eläkkeellä vuodessa. Pitkällä sijoitusajalla veron lykkääminen kasvattaa salkkua korkoa korolle; toisaalta osakesäästötilillä on 100 000 euron talletuskatto, eikä tappioita voi vähentää samalla tavalla kuin arvo-osuustilillä.',
      'Varallisuuspolku laskee kolme tilityyppiä samalla elinkaarimallilla: valitse tili Allokaatio-kortista, aseta osinkotuotto ja kulut, ja vertaa haamukäyrällä. Nostovaiheessa laskuri soveltaa myyntivoittoveron portaita (30 % / 34 % yli 30 000 € vuodessa) ja Pro-tilassa hankintameno-olettamaa.',
      'Laskuri ei kerro, kumpi tili sinun pitäisi avata. Se näyttää, mitä valinta maksaa tai tuottaa omilla luvuillasi — päätös on sinun.',
    ],
    ukk: [
      ['Miten osinkojen verotus eroaa?', 'Arvo-osuustilillä 85 % osingosta on veronalaista pääomatuloa heti. Osakesäästötilillä ja vakuutuskuoressa osingot kertyvät verotta ja verotetaan vasta nostossa voiton osuutena.'],
      ['Onko osakesäästötilillä katto?', 'Kyllä, talletuksille 100 000 €. Tuotto saa kasvattaa tiliä katon yli. Laskuri varoittaa, kun talletuksesi ylittävät katon.'],
      ['Mitä vakuutuskuori maksaa?', 'Kuorella on oma vuosikulu tilin sisällä olevista varoista. Laskurissa kulun voi asettaa itse — oletuksena se on nolla, jotta vertailu lähtee tasan.'],
    ],
    kokeile: [
      ['Osakesäästötili, 3 % osinkotuotto', rakenna({ acct: 'ost' }, { divYield: 3, monthly: 800 })],
      ['Arvo-osuustili, sama salkku', rakenna({ acct: 'aot' }, { divYield: 3, monthly: 800 })],
    ],
  },
];

/* ---------- HTML ---------- */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const jsonStr = (s) => JSON.stringify(String(s).replace(/<[^>]+>/g, ''));

function sivuHtml(p) {
  const url = DOMAIN + 'laskurit/' + p.slug + '.html';
  const faq = p.ukk.map(([q, a]) => `      { "@type": "Question", "name": ${jsonStr(q)}, "acceptedAnswer": { "@type": "Answer", "text": ${jsonStr(a)} } }`).join(',\n');
  const muut = SIVUT.filter((x) => x.slug !== p.slug).map((x) => `<a href="${x.slug}.html">${esc(x.h1.split(':')[0].split('?')[0])}</a>`).join(' · ');
  return `<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${esc(p.title)} | Varallisuuspolku</title>
  <meta name="description" content="${esc(p.kuvaus)}" />
  <meta name="theme-color" content="#0a0e1a" />
  <script>/* Vaalea teema käyttöön ennen ensimmäistä maalausta — ei välähdystä */try{if(localStorage.getItem("vp-theme")==="light"){document.documentElement.classList.add("light");document.querySelector('meta[name="theme-color"]').content="#f4f6fb";}}catch(e){}</script>
  <meta property="og:locale" content="fi_FI" />
  <meta property="og:site_name" content="Varallisuuspolku" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.kuvaus)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${DOMAIN}og.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
  <link rel="stylesheet" href="../fonts.css" />
  <link rel="stylesheet" href="../style.css" />
  <style>
    .ls-main { max-width: 860px; margin: 0 auto; padding: 22px 18px 40px; }
    .ls-main h1 { font-size: 30px; line-height: 1.2; margin: 6px 0 14px; }
    .ls-main p { font-size: 15.5px; line-height: 1.7; color: var(--text-dim); }
    .ls-main p b { color: var(--text); }
    .ls-cta { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 8px; }
    .ls-cta .btn { padding: 11px 16px; font-size: 14px; }
    .ls-ukk h2 { font-size: 20px; margin: 26px 0 8px; }
    .ls-ukk h3 { font-size: 15.5px; margin: 14px 0 4px; }
    .ls-note { font-size: 12.5px; color: var(--text-faint); line-height: 1.6; margin-top: 22px; }
    .ls-muut { font-size: 13px; color: var(--text-faint); margin-top: 18px; }
  </style>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "inLanguage": "fi",
    "dateModified": "${PVM}",
    "mainEntity": [
${faq}
    ]
  }
  </script>
  <!-- Privacy-friendly analytics by Plausible -->
  <script async src="https://plausible.io/js/pa-gxRZu9FAu8RyeQ_oaNFz0.js"></script>
  <script>
    window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
    plausible.init()
  </script>
</head>
<body class="an-body">
  <header class="topbar">
    <a class="brand" href="../" style="text-decoration:none;color:inherit">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 29 C17 28 21 17 31 11 L31 32 L9 32 Z" fill="#fff" fill-opacity="0.18" />
          <path d="M9 29 C17 28 21 17 31 11" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="9" cy="29" r="2" fill="#fff" fill-opacity="0.85" />
          <circle cx="31" cy="11" r="3.3" fill="#fff" />
          <circle cx="31" cy="11" r="1.5" fill="#8b7cf6" />
        </svg>
      </div>
      <div>
        <div class="brand-name">Varallisuuspolku</div>
        <div class="brand-tag">Ilmainen elinkaarilaskuri — kaikki laskenta selaimessa</div>
      </div>
    </a>
    <div class="topbar-right">
      <a class="btn" href="../">Avaa suunnittelutyökalu</a>
    </div>
  </header>

  <main class="ls-main">
    <h1>${esc(p.h1)}</h1>
${p.vastaus.map((k) => `    <p>${k}</p>`).join('\n')}
    <div class="ls-cta">
${p.kokeile.map(([lbl, st]) => `      <a class="btn" href="${linkki(st).replace('./', '../')}">${esc(lbl)} →</a>`).join('\n')}
    </div>
    <p class="ls-note">Kokeile-linkit avaavat valmiin esimerkkisuunnitelman — vaihda luvut omiksesi. Suunnitelma pysyy laitteellasi; linkki ei tallenna mitään palvelimelle.</p>

    <section class="ls-ukk">
      <h2>Usein kysyttyä</h2>
${p.ukk.map(([q, a]) => `      <h3>${esc(q)}</h3>\n      <p>${esc(a)}</p>`).join('\n')}
    </section>

    <p class="ls-muut">Muut laskurit: ${muut} · <a href="../validointi.html">Näin laskenta on validoitu</a> · <a href="../analytiikka.html">Miten muut suunnittelevat</a></p>
    <p class="ls-note">Varallisuuspolku ei anna sijoitusneuvontaa eikä suosittele tuotteita. Laskelma on suuntaa antava havainnollistus omilla oletuksillasi — ei ennuste.</p>
  </main>
  <script src="../kieli.js" defer></script>
  <!-- Natiiviappi (Capacitor): alapalkki + natiivilisät ladataan vain, kun
       Capacitor-silta on läsnä — webissä ne palaisivat heti ja maksaisivat
       ~22 kt gzip turhaan mobiilin kriittisellä polulla (imaisu-ohjelma erä 5).
       Järjestys säilyy: peräkkäin DOMContentLoadedin jälkeen, kun defer-skriptit
       ovat ajaneet. -->
  <script>
  (function(){var C=window.Capacitor;if(!(C&&C.isNativePlatform&&C.isNativePlatform()))return;
  function l(s,cb){var e=document.createElement('script');e.src=s;if(cb)e.onload=cb;document.body.appendChild(e);}
  function go(){l('../alapalkki.js',function(){l('../natiivilisat.js');});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();})();
  </script>
</body>
</html>
`;
}

/* ---------- kirjoitus + sitemap ---------- */
fs.mkdirSync(DIR, { recursive: true });
for (const p of SIVUT) fs.writeFileSync(path.join(DIR, p.slug + '.html'), sivuHtml(p));

const ALKU = '  <!-- VP-LASKURIT alku (generoitu: tyokalut/laskeutumissivut.js) -->';
const LOPPU = '  <!-- VP-LASKURIT loppu -->';
const sm = path.join(ROOT, 'sitemap.xml');
let xml = fs.readFileSync(sm, 'utf8');
const lohko = ALKU + '\n' + SIVUT.map((p) => `  <url>
    <loc>${DOMAIN}laskurit/${p.slug}.html</loc>
    <lastmod>${PVM}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('\n') + '\n' + LOPPU;
const i = xml.indexOf(ALKU), j = xml.indexOf(LOPPU);
if (i >= 0 && j > i) xml = xml.slice(0, i) + lohko + xml.slice(j + LOPPU.length);
else xml = xml.replace('</urlset>', lohko + '\n</urlset>');
fs.writeFileSync(sm, xml);
console.log(`laskeutumissivut: ${SIVUT.length} sivua → laskurit/, sitemap päivitetty`);
