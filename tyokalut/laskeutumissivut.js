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
const P = require('../pakkaus.js');
const linkki = (st) => './#e=' + P.pakkaa(JSON.stringify(st)); // pakattu (~), ks. pakkaus.js

/* ---------- siteerattavat luvut: moottori laskee taulukot generointihetkellä ----------
   SEO/GEO-selvitys 4.9.2026: hakukoneet ja tekoälyhaut siteeraavat konkreettisia
   lukuja, eivät "vedä käyrää" -kuvauksia. Jokainen luku tulee laskenta.js:stä
   samoilla oletuksilla kuin sovelluksessa — taulukko ei voi erota tuotteesta. */
const L = require('../laskenta.js');
const MC_PATHS = 1500;
const sim = (st) => L.simulate(st, { paths: MC_PATHS });
const nbsp = (t) => String(t).replace(/\u00a0/g, '&nbsp;');
const eur = (v) => nbsp(Math.round(v).toLocaleString('fi-FI')) + '&nbsp;€';
const eurKk = (v) => eur(v) + '/kk';
const pros = (v) => Math.round(v * 100) + '&nbsp;%';
const ika = (a) => (a == null ? '—' : (Math.round(a * 10) / 10).toLocaleString('fi-FI') + '&nbsp;v');

function taulukkoHtml(t) {
  if (!t) return '';
  return `    <section class="ls-tbl">
      <h2>${t.otsikko}</h2>
      <p class="ls-tbl-intro">${t.selite}</p>
      <div class="table-scroll"><table class="sum-table">
        <thead><tr>${t.sarakkeet.map((c, i) => `<th${i ? ' class="num"' : ''}>${c}</th>`).join('')}</tr></thead>
        <tbody>
${t.rivit.map((r) => `          <tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('\n')}
        </tbody>
      </table></div>
      <p class="ls-note">${t.huom}</p>
    </section>`;
}

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
  {
    slug: 'milloin-voin-jaada-elakkeelle',
    title: 'Milloin voin jäädä eläkkeelle? — ikäraja ja milloin on varaa',
    h1: 'Milloin voin jäädä eläkkeelle?',
    kuvaus: 'Kaksi vastausta: lakisääteinen vanhuuseläkeikä syntymävuoden mukaan ja se, milloin omat sijoituksesi riittävät aikaisempaan eläkkeeseen. Laskuri hakee aikaisimman eläkeiän halutulla varmuudella.',
    vastaus: [
      'Kysymyksellä on kaksi vastausta. Ensimmäinen on <b>lakisääteinen</b>: alin vanhuuseläkeikä määräytyy syntymävuoden mukaan — 1962–1964 syntyneillä 65 vuotta, sitä nuoremmilla elinajanodotteeseen sidottu ja arviolta 65–68 vuotta. Toinen on <b>taloudellinen</b>: milloin omat sijoituksesi riittävät kattamaan tulotarpeen siihen asti, kun työeläke alkaa, ja sen jälkeen työeläkkeen päälle.',
      'Työeläkelaitosten laskurit vastaavat ensimmäiseen kysymykseen. Varallisuuspolku vastaa toiseen: syötät ikäsi, sijoituksesi, säästösi kuukaudessa ja tulotarpeesi, ja ratkaisija hakee <b>aikaisimman eläkeiän</b>, jolla varat riittävät suunnitelman loppuun — joko tyypillisellä markkinakehityksellä tai valitsemallasi varmuustasolla (75/85/95 % simuloiduista poluista).',
      'Kaksi asiaa, jotka moni laskuri ohittaa: ennen työeläkkeen alkamista koko kuukausitulo nostetaan sijoituksista ja nostosta menee myyntivoittovero voiton osuudesta; ja jos lopetat työt ennen työeläkeikääsi, työeläkkeen karttuma päättyy, joten eläke jää työeläkeotteen arviota pienemmäksi. Laskuri huomioi molemmat.',
      'Laskuri ei kerro, milloin sinun pitäisi jäädä eläkkeelle. Se näyttää, mitä kukin eläkeikä maksaa säästönä tai kuukausitulona — päätös on sinun.',
    ],
    lisa: `    <section class="ls-tbl">
      <h2>Lakisääteinen alin vanhuuseläkeikä syntymävuoden mukaan</h2>
      <p class="ls-tbl-intro">Vuonna 1964 tai aiemmin syntyneiden ikärajat on säädetty laissa. Nuorempien ikäraja sidotaan elinajanodotteeseen ja vahvistetaan sinä vuonna, kun ikäluokka täyttää 62 — siihen asti luvut ovat Eläketurvakeskuksen arvioita, jotka voivat muuttua.</p>
      <div class="table-scroll"><table class="sum-table">
        <thead><tr><th>Syntymävuosi</th><th class="num">Alin vanhuuseläkeikä</th><th class="num">Tila</th></tr></thead>
        <tbody>
          <tr><td>1958</td><td class="num">64&nbsp;v</td><td class="num">laki</td></tr>
          <tr><td>1959</td><td class="num">64&nbsp;v 3&nbsp;kk</td><td class="num">laki</td></tr>
          <tr><td>1960</td><td class="num">64&nbsp;v 6&nbsp;kk</td><td class="num">laki</td></tr>
          <tr><td>1961</td><td class="num">64&nbsp;v 9&nbsp;kk</td><td class="num">laki</td></tr>
          <tr><td>1962–1964</td><td class="num">65&nbsp;v</td><td class="num">laki</td></tr>
          <tr><td>1965</td><td class="num">65&nbsp;v 2&nbsp;kk</td><td class="num">arvio</td></tr>
          <tr><td>1970</td><td class="num">65&nbsp;v 8–10&nbsp;kk</td><td class="num">arvio</td></tr>
          <tr><td>1975</td><td class="num">66&nbsp;v 4&nbsp;kk</td><td class="num">arvio</td></tr>
          <tr><td>1980</td><td class="num">66&nbsp;v 10&nbsp;kk</td><td class="num">arvio</td></tr>
          <tr><td>1985</td><td class="num">67&nbsp;v 4&nbsp;kk</td><td class="num">arvio</td></tr>
          <tr><td>1990</td><td class="num">67&nbsp;v 9&nbsp;kk</td><td class="num">arvio</td></tr>
          <tr><td>1995</td><td class="num">68&nbsp;v 2&nbsp;kk</td><td class="num">arvio</td></tr>
          <tr><td>2000</td><td class="num">68&nbsp;v 7&nbsp;kk</td><td class="num">arvio</td></tr>
        </tbody>
      </table></div>
      <p class="ls-note">Lähteet: <a href="https://www.tyoelake.fi/elakkeet-eri-elamantilanteissa/vanhuuselake-elakeika-maaraytyy-syntymavuoden-mukaan/" rel="noopener">Työeläke.fi</a> (säädetyt ikärajat), <a href="https://www.tela.fi/ajankohtaista/qa-tietopaketit/elakeika/" rel="noopener">Tela</a> ja Eläketurvakeskuksen ennusteet (arviot; 1970 syntyneille lähteet antavat 65 v 8 kk – 65 v 10 kk ennustevuodesta riippuen). Tarkista oma ikärajasi työeläkeotteelta. Työeläke karttuu 1,5 % vuosiansioista, ja alimman eläkeiän jälkeen lykätty eläke saa 0,4 % korotuksen kuukaudessa.</p>
    </section>`,
    ukk: [
      ['Voinko jäädä eläkkeelle ennen lakisääteistä ikää?', 'Vanhuuseläkettä ei saa ennen alinta eläkeikää (osittaista varhennettua vanhuuseläkettä lukuun ottamatta), mutta työt voi lopettaa aiemmin, jos omat sijoitukset kattavat tulotarpeen työeläkkeen alkamiseen asti. Laskuri hakee, milloin se on mahdollista.'],
      ['Pieneneekö työeläke, jos lopetan työt aikaisin?', 'Kyllä: karttuma päättyy, kun ansiot päättyvät. Laskuri pienentää työeläkearviota suhteessa menetettyihin työvuosiin — työeläkeotteen arvio olettaa, että työ jatkuu eläkeikään.'],
      ['Mitä varmuustaso tarkoittaa?', 'Osuutta 5 000 simuloidusta markkinapolusta, joilla varat riittävät suunnitelman loppuun. 85 % tarkoittaa, että 15 %:lla poluista rahat loppuisivat ennen loppuikää ilman muutoksia suunnitelmaan.'],
      ['Onko tämä sijoitusneuvontaa?', 'Ei. Laskuri laskee omilla oletuksillasi eikä suosittele tuotteita tai päätöksiä. Kaikki laskenta tapahtuu selaimessasi.'],
    ],
    kokeile: [
      ['Aikaisin eläkeikä, säästö 1 000 €/kk', rakenna({ goal: 'age', conf: 0.85, withdrawal: 2500, pension: 1800 }, { ageNow: 40, startCapital: 100000, monthly: 1000 })],
      ['Sama säästöllä 2 000 €/kk', rakenna({ goal: 'age', conf: 0.85, withdrawal: 2500, pension: 1800 }, { ageNow: 40, startCapital: 100000, monthly: 2000 })],
      ['Eläkkeelle 63 — riittääkö?', rakenna({ retAge: 63, goal: 'manual', withdrawal: 2500, pension: 1800 }, { ageNow: 40, startCapital: 100000, monthly: 1000 })],
    ],
  },
  {
    slug: 'asuntolaina-vai-sijoittaminen',
    title: 'Asuntolainan lyhennys vai sijoittaminen? — laskuri koko elinkaarella',
    h1: 'Asuntolainan lyhennys vai sijoittaminen?',
    kuvaus: 'Kannattaako lyhentää asuntolainaa nopeammin vai sijoittaa erotus? Laskuri vertaa laina-aikoja koko elinkaarella: kuukausierä, sijoitukset eläkeiässä ja loppuvarallisuus, verot ja markkinoiden heilunta huomioiden.',
    vastaus: [
      'Kysymys on oikeasti laina-ajan valinta: lyhyt laina tarkoittaa isoa kuukausierää ja vähemmän rahaa sijoituksiin nyt, pitkä laina pienempää erää ja enemmän sijoitettavaa. Vastaus riippuu siitä, <b>ylittääkö sijoitusten tuotto-odotus lainan koron</b> verojen jälkeen — ja siitä, kuinka paljon heiluntaa siedät matkalla.',
      'Varallisuuspolku laskee vertailun koko elinkaarella: sama säästökyky, sama asunto, eri laina-aika. Lainanhoito vähentää kuukausisäästöä työuralla, ja jos erä ylittää säästökyvyn, erotus myydään sijoituksista veroineen. Asunto kirjautuu varallisuudeksi omalla arvonkehityksellään ja lyhennykset siirtävät velkaa omaisuudeksi — molemmat näkyvät tase-paneelissa.',
      'Pitkä laina ei ole ilmainen lounas: korkoriski on todellinen (Markkinatesti näyttää +2 %-yksikön koronnousun vaikutuksen vaihtuvakorkoiseen lainaan), ja sijoitusten tuotto ei ole taattu. Lyhyt laina taas on varma, veroton "tuotto" lainan koron verran. Laskuri näyttää kummankin polun luvut — myös huonoimmilla markkinapoluilla.',
      'Laskuri ei suosittele kumpaakaan. Se näyttää, mitä laina-ajan valinta tarkoittaa euroina omilla luvuillasi.',
    ],
    ukk: [
      ['Miksi pidempi laina voi antaa suuremman loppuvarallisuuden?', 'Koska sijoitusten tuotto-odotus (oletuksena osakkeet 7 %/v) on lainan korkoa (esim. 3,5 %) suurempi. Erotus on riski: jos markkinat tuottavat huonosti tai korot nousevat, järjestys voi kääntyä. Laskurin viuhka ja stressitestit näyttävät sen.'],
      ['Huomioiko laskuri verot?', 'Kyllä: sijoituksista rahoitettu lainanhoito realisoi myyntivoittoveron voiton osuudesta, ja asunnon ostossa on varainsiirtovero 1,5 %. Asuntolainan korkovähennystä ei ole enää.'],
      ['Entä ylimääräiset lyhennykset?', 'Vertaa laina-aikoja: 15 vuoden laina vastaa 25 vuoden lainaa, jota lyhennetään ylimääräisillä erillä. Kuukausierän eron näet suoraan.'],
    ],
    kokeile: [
      ['Laina 15 v', rakenna({ retAge: 65, goal: 'manual', event: { type: 'home', dAge: 1, amount: -280000, financing: 'loan', down: 42000, rate: 3.5, years: 15, isAsset: true, appr: 2 } }, { monthly: 1500 })],
      ['Laina 25 v', rakenna({ retAge: 65, goal: 'manual', event: { type: 'home', dAge: 1, amount: -280000, financing: 'loan', down: 42000, rate: 3.5, years: 25, isAsset: true, appr: 2 } }, { monthly: 1500 })],
    ],
  },
];

/* ---------- moottorin laskemat taulukot sivuittain ---------- */
const TAULUKOT = {
  elakelaskuri() {
    const rivit = [60, 63, 65, 68].map((a) => {
      const m = sim(rakenna({ retAge: a, goal: 'manual' }));
      const w = sim(rakenna({ retAge: a, goal: 'withdrawal' }));
      return [`${a}&nbsp;v`, eurKk(m.pension), eur(m.wAtRet), eurKk(w.solvedWithdrawal), pros(m.successProb)];
    });
    return {
      otsikko: 'Esimerkki: mitä eläkeikä maksaa',
      selite: '35-vuotias, sijoituksia 40&nbsp;000&nbsp;€, säästö 500&nbsp;€/kk (+1,5&nbsp;%/v), osakepaino 80&nbsp;%, työeläkearvio 1&nbsp;500&nbsp;€/kk käteen 65-vuotiaana, tulotarve 2&nbsp;400&nbsp;€/kk, luvut nykyrahassa. Työeläke pienenee, jos työ päättyy ennen 65:tä (karttuma päättyy).',
      sarakkeet: ['Eläkeikä', 'Työeläke eläkeiässä', 'Sijoitukset eläkeiässä', 'Kestävä kuukausitulo', 'Onnistumis-% (2&nbsp;400&nbsp;€/kk)'],
      rivit,
      huom: 'Kestävä kuukausitulo = sijoitusten kantama tulo työeläkkeen päälle laskettuna niin, että varat riittävät 90-vuotiaaksi tyypillisellä (mediaani) markkinakehityksellä. Onnistumis-% = osuus simuloiduista markkinapoluista, joilla 2&nbsp;400&nbsp;€/kk riittää. Laskettu Varallisuuspolun moottorilla ' + PVM + '.',
    };
  },
  'fire-laskuri'() {
    const rivit = [1000, 1500, 2000, 2600].map((m) => {
      const r = [0.75, 0.85, 0.95].map((c) => sim(rakenna({ goal: 'age', conf: c, withdrawal: 2200 }, { ageNow: 32, startCapital: 60000, monthly: m, allocStocks: 95, allocBonds: 5 })));
      return [eurKk(m), ...r.map((x) => (x.goalUnreachable ? 'ei saavuteta' : ika(x.solvedRetireAge)))];
    });
    return {
      otsikko: 'Esimerkki: aikaisin eläkeikä säästön ja varmuustason mukaan',
      selite: '32-vuotias, sijoituksia 60&nbsp;000&nbsp;€, osakepaino 95&nbsp;%, tulotarve 2&nbsp;200&nbsp;€/kk nykyrahassa, työeläkearvio 1&nbsp;500&nbsp;€/kk 65-vuotiaana (pienenee, kun työ päättyy aiemmin), suunnitelma 90-vuotiaaksi.',
      sarakkeet: ['Säästö', 'Aikaisin eläkeikä 75&nbsp;%', '85&nbsp;%', '95&nbsp;%'],
      rivit,
      huom: 'Varmuustaso = osuus simuloiduista markkinapoluista, joilla varat riittävät 90-vuotiaaksi. Vertailun vuoksi 4&nbsp;%:n sääntö antaisi saman kysymyksen vastaukseksi salkun koon 660&nbsp;000&nbsp;€ — se ei tunne veroja, työeläkettä eikä nostoajan pituutta. Laskettu ' + PVM + '.',
    };
  },
  'paljonko-pitaa-saastaa-elakkeelle'() {
    const rivit = [2000, 2500, 3000].map((wd) => {
      const a65 = sim(rakenna({ retAge: 65, goal: 'saving', withdrawal: wd }));
      const a65c = sim(rakenna({ retAge: 65, goal: 'saving', withdrawal: wd, conf: 0.85 }));
      const a60 = sim(rakenna({ retAge: 60, goal: 'saving', withdrawal: wd }));
      const f = (x) => (x.goalUnreachable || x.requiredMonthly == null ? 'ei saavuteta' : eurKk(x.requiredMonthly));
      return [eurKk(wd), f(a65), f(a65c), f(a60)];
    });
    return {
      otsikko: 'Esimerkki: tarvittava kuukausisäästö',
      selite: '35-vuotias, sijoituksia 40&nbsp;000&nbsp;€, osakepaino 80&nbsp;%, säästö kasvaa 1,5&nbsp;%/v, työeläkearvio 1&nbsp;500&nbsp;€/kk käteen 65-vuotiaana, luvut nykyrahassa, varat mitoitettu 90-vuotiaaksi.',
      sarakkeet: ['Tulotarve eläkkeellä', 'Eläkkeelle 65 (mediaanipolku)', 'Eläkkeelle 65 (85&nbsp;% varmuus)', 'Eläkkeelle 60 (mediaanipolku)'],
      rivit,
      huom: 'Säästö tarkoittaa tämän päivän summaa, joka kasvaa palkkakehityksen mukana 1,5&nbsp;%/v. 60-vuotiaana eläköityvän työeläke on pienempi (karttuma päättyy) ja välivuodet 60–65 katetaan kokonaan sijoituksista. Laskettu ' + PVM + '.',
    };
  },
  'osakesaastotili-vai-arvo-osuustili'() {
    const rivit = [];
    for (const [nimi, acct, div] of [['Arvo-osuustili, osinkotuotto 3&nbsp;%', 'aot', 3], ['Osakesäästötili, osinkotuotto 3&nbsp;%', 'ost', 3], ['Arvo-osuustili, kasvurahastot (osinko 0&nbsp;%)', 'aot', 0], ['Osakesäästötili, kasvurahastot', 'ost', 0]]) {
      const m = sim(rakenna({ acct, retAge: 65, goal: 'withdrawal' }, { divYield: div, monthly: 800 }));
      rivit.push([nimi, eur(m.wAtRet), eurKk(m.solvedWithdrawal), eur(m.taxPaid)]);
    }
    return {
      otsikko: 'Esimerkki: sama salkku kahdella tilillä',
      selite: '35-vuotias, sijoituksia 40&nbsp;000&nbsp;€, säästö 800&nbsp;€/kk (+1,5&nbsp;%/v), osakepaino 80&nbsp;%, eläkkeelle 65, työeläke 1&nbsp;500&nbsp;€/kk, luvut nykyrahassa. Osinkotuotto on osa 7&nbsp;%:n kokonaistuotto-odotusta — arvo-osuustilillä siitä menee vero vuosittain, osakesäästötilillä vasta nostossa.',
      sarakkeet: ['Tili', 'Sijoitukset 65-vuotiaana', 'Kestävä kuukausitulo', 'Verot yhteensä'],
      rivit,
      huom: 'Ero syntyy osinkojen verotuksen ajoituksesta; kasvurahastoilla (ei osinkoja) tilit ovat perusversiossa yhtä hyvät. Osakesäästötilin suurempi verosumma johtuu suuremmista nostoista — vero maksetaan myöhemmin ja isommasta salkusta. Osakesäästötilin 100&nbsp;000&nbsp;€:n talletuskatto ei täyty tässä esimerkissä. Laskettu ' + PVM + '.',
    };
  },
  'milloin-voin-jaada-elakkeelle'() {
    const rivit = [500, 1000, 1500, 2000].map((m) => {
      const med = sim(rakenna({ goal: 'age', withdrawal: 2500, pension: 1800 }, { ageNow: 40, startCapital: 100000, monthly: m }));
      const c85 = sim(rakenna({ goal: 'age', conf: 0.85, withdrawal: 2500, pension: 1800 }, { ageNow: 40, startCapital: 100000, monthly: m }));
      const f = (x) => (x.goalUnreachable ? 'ei saavuteta' : ika(x.solvedRetireAge));
      return [eurKk(m), f(med), f(c85), eurKk(c85.pension)];
    });
    return {
      otsikko: 'Esimerkki: milloin on varaa?',
      selite: '40-vuotias, sijoituksia 100&nbsp;000&nbsp;€, osakepaino 80&nbsp;%, tulotarve 2&nbsp;500&nbsp;€/kk nykyrahassa, työeläkearvio 1&nbsp;800&nbsp;€/kk käteen 65-vuotiaana, suunnitelma 90-vuotiaaksi.',
      sarakkeet: ['Säästö', 'Aikaisin eläkeikä (mediaanipolku)', 'Aikaisin eläkeikä (85&nbsp;% varmuus)', 'Työeläke tuossa iässä'],
      rivit,
      huom: 'Työeläke pienenee, kun ansiot päättyvät ennen 65:tä — laskuri vähentää karttuman suhteessa menetettyihin työvuosiin. Ennen 65:tä koko tulo nostetaan sijoituksista ja nostosta menee myyntivoittovero. Laskettu ' + PVM + '.',
    };
  },
  'asuntolaina-vai-sijoittaminen'() {
    const rivit = [15, 20, 25, 30].map((y) => {
      const st = rakenna({ retAge: 65, goal: 'manual', event: { type: 'home', dAge: 1, amount: -280000, financing: 'loan', down: 42000, rate: 3.5, years: y, isAsset: true, appr: 2 } }, { monthly: 1500 });
      const m = sim(st);
      const era = L.loanPayment(280000 - 42000, 3.5, y);
      return [`${y}&nbsp;v`, eurKk(era), eur(m.wAtRet), eur(m.wEnd), pros(m.successProb)];
    });
    return {
      otsikko: 'Esimerkki: sama asunto, eri laina-aika',
      selite: '35-vuotias ostaa 280&nbsp;000&nbsp;€:n asunnon 42&nbsp;000&nbsp;€:n käsirahalla, laina 238&nbsp;000&nbsp;€ korolla 3,5&nbsp;%. Säästökyky 1&nbsp;500&nbsp;€/kk ennen lainanhoitoa (+1,5&nbsp;%/v), osakepaino 80&nbsp;%, eläkkeelle 65, tulotarve 2&nbsp;400&nbsp;€/kk, työeläke 1&nbsp;500&nbsp;€/kk, luvut nykyrahassa.',
      sarakkeet: ['Laina-aika', 'Kuukausierä', 'Sijoitukset 65-vuotiaana', 'Loppuvarallisuus 90 v', 'Onnistumis-%'],
      rivit,
      huom: 'Sijoitukset = sijoitussalkku ilman asuntoa; asunto on kaikissa riveissä sama. Pidempi laina jättää enemmän sijoitettavaa, mutta korkoriski ja markkinariski kasvavat — katso viuhka ja Markkinatesti sovelluksessa. Laskettu ' + PVM + '.',
    };
  },
};

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
    .ls-cta .btn { padding: 11px 16px; font-size: 14px; white-space: normal; text-align: left; max-width: 100%; box-sizing: border-box; }
    .ls-ukk h2 { font-size: 20px; margin: 26px 0 8px; }
    .ls-ukk h3 { font-size: 15.5px; margin: 14px 0 4px; }
    .ls-note { font-size: 12.5px; color: var(--text-faint); line-height: 1.6; margin-top: 22px; }
    .ls-muut { font-size: 13px; color: var(--text-faint); margin-top: 18px; }
    .ls-tbl h2 { font-size: 20px; margin: 24px 0 6px; }
    .ls-tbl .ls-tbl-intro { font-size: 14px; margin: 0 0 10px; }
    .ls-tbl table { width: 100%; }
    .ls-tbl .ls-note { margin-top: 8px; }
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
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Varallisuuspolku", "item": "${DOMAIN}" },
      { "@type": "ListItem", "position": 2, "name": ${jsonStr(p.h1)}, "item": "${url}" }
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
${p.lisa || ''}
${taulukkoHtml(TAULUKOT[p.slug] ? TAULUKOT[p.slug]() : null)}
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
