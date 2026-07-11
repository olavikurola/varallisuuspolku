# Perhevirta — Varallisuuspolku koko perheelle

Suunnitelma, versio 1.0 (10.7.2026). Ei toteutusta ennen Olavin hyväksyntää.

## 0. Tiivistelmä

Varallisuuspolku haarautuu usean henkilön ja koko perheen suunnitteluksi. Esitystapa ei ole
perspektiivi-3D vaan **haarautuvat virrat**: jokainen henkilö on oma kaista yhteisellä
kalenteriaika-akselilla, lapset haarautuvat vanhempien virrasta, ja rahansiirrot piirtyvät
nauhoina kaistalta toiselle. Piirtopöydän suora manipulaatio yleistyy: tartu kenen tahansa
käyrään — tai koko perheen yhteiskäyrään, jolloin ratkaisija jakaa tarvittavan säästön
perheenjäsenille valitulla reiluussäännöllä.

Kolme asiaa, jotka mullistavat varallisuussuunnittelun tässä:

1. **Koherentti kotitalous-Monte-Carlo.** Sama satunnainen markkinahistoria osuu kaikkiin
   perheenjäseniin samanaikaisesti (CRN-siemenet jaetaan kalenterikuukausittain) — kukin salkku
   reagoi omalla allokaatiollaan. Perheen onnistumis-% on aito yhteisjakauma, ei henkilöiden
   itsenäisten todennäköisyyksien tulo. Tämän moottori osaa jo melkein ilmaiseksi.
2. **Sukupolvinäkymä.** Lapsi syntyy graafille: kulu vanhempien kaistalla, joka täysi-ikäisyydessä
   haarautuu omaksi virraksi — ja opintotuki, ensiasunnon käsiraha tai perintö näkyy nauhana,
   joka siirtää varallisuutta virrasta toiseen. Suunnitelman horisontti venyy 60–100 vuoteen.
3. **Perhetason käänteisratkaisu.** "Haluamme molemmat eläkkeelle 2049" -veto perheen
   yhteiskäyrällä → kone jakaa vaaditun lisäsäästön henkilöille säännöllä: tasan / tulojen
   suhteessa / pienimmän kokonaissumman mukaan. Syy sormessa, seuraus HUDissa — nyt perheelle.

## 1. Miksi ei perspektiivi-3D:tä (ja mitä 3D-ideasta otetaan talteen)

Aito 3D-piirtopöytä (aika × raha × henkilö avaruudessa) kaatuu neljään asiaan: okkluusio
(takakaista peittyy), suoran manipulaation tarkkuus (tuotteen sielu on pikselintarkka veto —
3D-projektiossa sormi ei osu), mobiili (390 px + kosketus + perspektiivi = mahdoton) ja
saavutettavuus. Rinnakkaiskaistat antavat saman informaation ilman näitä kustannuksia —
kuten DAW-ohjelmien raidat tai git-haarat.

**Talteen otetaan wow-kerros**: valinnainen **"Perhevuoristo"-näkymä** — 2.5D-ridgeline, jossa
kaistat piirtyvät limittäin syvyysporrastuksella (sama tekniikka kuin analytiikkasivun Elämän
kartta, ei WebGL-riippuvuutta). Katselunäkymä ja markkinointimateriaali, ei muokkaustila.
Piirtäminen tapahtuu aina 2D-kaistoilla.

## 2. Käsitemalli

```
household = {
  persons: [ { id, nimi, väri, ageNow, startCapital, monthly, savingsGrowth,
               alloc..., events[...], pro?... } ],          // 1–2 aikuista + lapset
  children: [ { id, nimi, syntymävuosi, kuluprofiili,
                itsenäistyy: ikä, alkupääoma haarautuessa } ],
  shared:   [ { event, jako: {p1: 60, p2: 40} } ],          // yhteiset tapahtumat (asunto, laina)
  transfers:[ { from, to, vuosi|ikä, määrä | kk-erä+kesto, tyyppi: lahja|tuki|perintö } ],
  pooling:  'omat' | 'yhteinen',                            // kukkarosääntö
}
```

- **Akseli vaihtuu kalenterivuosiin** perhetilassa (iät eroavat — kalenteri on yhteinen totuus);
  kunkin kaistan reunassa juoksee henkilön oma ikä. Yksin suunniteltaessa ikäakseli säilyy
  täsmälleen nykyisenä — perhetila on tila, ei uusi oletus.
- **Kukkarosäännöt**: *Omat kukkarot* (oletus) — jokaisella oma salkku, siirrot eksplisiittisiä
  nauhoja; alijäämä yhdellä EI automaattisesti paikkaudu toiselta, vaan näkyy ehtymisvyöhykkeenä
  ("kuka kantaa riskin" pysyy näkyvänä). *Yhteinen kukkaro* — salkut yhdistetty, nostot yhteisestä;
  yksinkertaisempi mutta piilottaa epäsymmetrian. Molemmat tuettu, vaihto yhdellä kytkimellä.
- **Lapsihaara**: lapsi on ensin kuluprofiili vanhempien kaistoilla (recurring-erät, jako-osuudet).
  Itsenäistymisiässä kaista haarautuu: alkupääoma = siihen mennessä osoitetut siirrot (säästötili,
  lahjat). Haaran jälkeen lapsi on täysi henkilö omine parametreineen — isovanhemmuus asti.
- **Leskiturva (stressiskenaario)**: "henkilö X kuolee vuonna Y" -kytkin: tulot ja eläke poistuvat,
  varallisuus siirtyy puolisolle/lapsille karkealla perintösäännöllä, perhe-eläke arviona.
  Deterministinen overlay kuten Pron stressit — ei jatkuva mallinnus (perintöverot yms. Pro v2).

## 3. Näkymät ja vuorovaikutus

### 3.1 Kaistanäkymä (uusi päänäkymä perhetilassa)

- 2–5 kaistaa pinossa, yhteinen kalenteriakseli, synkattu kohdistin (yksi pystyviiva kaikilla).
- Kaistan korkeus: aktiivinen kaista ~50 %, muut kutistuvat mutta pysyvät luettavina
  (fokus+konteksti). Napautus kaistalle aktivoi sen.
- **Yhteiskäyrä**-välilehti: koko perheen varallisuus yhtenä käyränä + pinottu aluekaavio
  (kuka omistaa mitäkin) — sama viuhka, sama HUD.
- **Siirtonauhat**: kaistalta toiselle kaartuva nauha, jonka leveys ∝ summa. Nauhaan voi tarttua
  piirtopöydällä: pystyveto muuttaa summaa, vaakaveto ajankohtaa — chippi ja HUD kuten ennen.
- Tapahtumapaletti saa "kenelle"-valinnan (henkilöchipit); yhteinen tapahtuma näyttää
  jakoprosentit ja piirtyy molemmille kaistoille sidottuna (siirto toisella siirtää molempia).

### 3.2 Piirtopöytä perheelle

- Kaikki nykyinen toimii kaistan sisällä (tartu käyrään → sen henkilön säästö joustaa jne.).
- Uudet tartuttavat: yhteiskäyrä (perheratkaisija + reiluussääntövalitsin chipissä),
  siirtonauhat, haarautumispiste (lapsen itsenäistymisikä liukuu vaakavedolla).
- HUD perhetilassa: perheen onnistumis-%, yhteisvarallisuus eläkeaikana, kestävä *yhteinen*
  kuukausitulo — valitun kaistan luvut toissijaisina.
- Opasteet ja esittelykierros laajenevat kolmella perheaskeleella.

### 3.3 Suunnitelmani perheelle

Yksi dokumentti: perheen tunnusluvut, kaistakooste per henkilö, siirtotaulukko
("Iässä 55 siirrämme Ainolle 20 000 € ensiasuntoon"), leskiturvatarkastelu, kulmakivet
me-muodossa. Edelleen ei sijoitusneuvontaa — perheen omat päätökset dokumenttina.

## 4. Laskenta

- Yhteinen kuukausigridi kalenteriajassa: `m = 0 … max(kaikkien horisontit)`. Kunkin henkilön
  prepareSim tuottaa oman kontekstinsa; henkilön ikä = kalenteri − syntymävuosi.
- **CRN perheessä**: shokki-indeksi on (polku i, kalenterikuukausi m) — kaikki henkilöt lukevat
  saman heiton ja skaalaavat omalla σ:llaan. Pro-korrelaatiomatriisi toimii per henkilö;
  henkilöiden VÄLINEN markkinakorrelaatio on täydet 100 % (sama maailma) — juuri niin kuin pitää.
- Siirrot: lähtökukkarosta sell(), kohdekukkaroon lump — verottomuusoletus lahjaverorajoihin
  asti, ylitys varoituksena (ei veromallinnusta v1:ssä).
- Perheen onnistumis-%: *Omat kukkarot* -säännöllä "kaikki kukkarot kestävät"; *Yhteinen* -säännöllä
  yhteiskukkaro kestää. Ehtymiskäyrät per henkilö JA perheelle.
- Perheratkaisija: bisektio yhteistavoitteeseen; jakosäännöt (tasan / tulosuhteessa / min-summa)
  ovat lineaarisia painoja säästöille → monotonisuus säilyy, sama solveParam kelpaa.
- Suorituskyky: N henkilöä ≈ N × nykyinen polkuaika; 2 aikuista + 2 lasta @5000 polkua ≈ 1,3 s
  workerissa — sama progress-malli kuin nyt. Kevyt raahausframe pysyy deterministisenä (<5 ms).

## 5. Jakaminen ja yhteissuunnittelu

- **Perhelinkki**: koko household samaan hash-fragmenttiin; koko kasvaa → pakataan
  (LZ-tyyppinen minipakkain, ~60 riviä, ei riippuvuuksia). Vanhat yksilölinkit avautuvat
  henkilönä #1 — täysi taaksepäinyhteensopivuus.
- **Sohvayhteistila** (v1): sama laite, kaksi suunnittelijaa — ei tekniikkaa, vaan UX: kaistan
  aktivointi + iso kosketuspiirtopöytä on jo pariskunnan yhteistyökalu.
- **P2P-etäyhteistila** (v2, kirjattu suunta): WebRTC-datakanava selainten välillä — tila synkataan
  vertaisverkossa, mitään ei tallenneta palvelimelle (istuntokoodi/QR käsin = täysin serveritön,
  tai kevyt signalointirelay joka ei näe sisältöä). Sopii tietosuojalupaukseen; päätetään erikseen.
- **Vertailudataan perhesuunnitelmia EI lähetetä v1:ssä** (tunnistettavuus kasvaa) — vain
  `persons: n` -lippu. Avataan myöhemmin omalla karkeistusmallilla, jos halutaan.

## 6. Rajaus

**V1 (tämä suunnitelma):** enintään 2 aikuiskaistaa + 4 lasta (kuluprofiili → haara), yhteiset
tapahtumat jaolla, siirtonauhat, kukkarosäännöt, perhe-HUD ja -ratkaisija, kaistanäkymä +
yhteiskäyrä, perhelinkki, Suunnitelmani perheelle, leskiturva-overlay, Perhevuoristo-katselutila.

**Ulos (myöhemmin):** perintö- ja lahjaverolaskenta, avioehto/ositus, useampi kotitalous
(isovanhemmat omana taloutenaan + siirrot talouksien välillä), P2P-etäyhteistila,
perhesuunnitelmien vertailudata, aito WebGL-3D.

**Muuttumattomana:** yksin suunnittelu on oletus ja täsmälleen nykyinen — perhetila on
"＋ Lisää henkilö" -valinnan takana, ja sen voi purkaa takaisin yhteen henkilöön.

## 7. Toteutusjärjestys

| PR | Sisältö | Arvio |
|---|---|---|
| F0 | Household-tietomalli, kalenterigridi, migraatio (nykyinen suunnitelma = henkilö #1), linkkipakkain | 8–12 h |
| F1 | Moottori: monihenkilö-MC jaetuilla shokeilla, kukkarosäännöt, siirrot, perheen onnistumis-% | 14–20 h |
| F2 | Kaistanäkymä + yhteiskäyrä + synkattu kohdistin + paletin "kenelle" | 14–20 h |
| F3 | Piirtopöytä: kaistavedot, siirtonauhojen manipulointi, perheratkaisija + reiluussäännöt, HUD | 12–18 h |
| F4 | Lapsihaarat (kuluprofiili → oma virta), leskiturva-overlay | 10–14 h |
| F5 | Suunnitelmani perheelle, Perhevuoristo-näkymä, opasteet/kierros, smoket | 10–14 h |

Yhteensä ≈ **70–100 h**. Jokainen PR: determinismi- ja yhteensopivuustestit, 390 px -kaappaukset.

## 8. Riskit

1. **Monimutkaisuus syö tuotteen sielun** → perhetila on tila; yhden henkilön polku ei muutu
   pikseliäkään; perhe-UI:n jokainen elementti perustelee paikkansa samalla Jobs-kurilla.
2. **Kalenteriakseli hämmentää nykykäyttäjiä** → akseli vaihtuu vain perhetilassa; kaistan
   reunassa henkilön ikä; siirtymäanimaatio näyttää muunnoksen.
3. **Kaistat ahtaita mobiilissa** → mobiilissa yksi kaista kerrallaan + pyyhkäisy, yhteiskäyrä
   oletusnäkymänä; siirtonauhat listana jos ruutu ei riitä.
4. **Linkin koko** → pakkain + testit; raja ~8 kt hashille, ylitys varoittaa.
5. **Leskiturvan väärintulkinta neuvonnaksi** → sama minä/me-muotoinen kieli ja disclaimer kuin
   muuallakin; karkeus sanotaan ääneen.

## 9. UX-vaikutusarvio: sotkeeko tämä muun kokemuksen? (lisätty 11.7.2026)

Rehellinen arvio pintakohta kerrallaan. Tiivistelmä: yksin käyttävän kokemus on pidettävissä
pikselintarkasti ennallaan — Pro todisti tilaeristyksen toimivan (identiteettitestit, nolla
regressiota) — mutta kuusi aitoa riskiä vaatii kurinalaisuutta, ja neljä niistä muuttaa
tätä suunnitelmaa (korjaukset alla).

**Ei vaikutusta:** ensivierailuflow (oletus on aina yksi henkilö), piirtopöydän ydinvedot,
tavoitepisteet, Vaurastumisen kartta, palvelin, PWA. Yksin-tilan smoket ajetaan aina
perhetila pois päältä — sama vartiointi kuin Prossa.

**Aidot riskit ja vastaukset:**

1. **Sisäänkäyntien ryöstäytyminen.** Paneelin yläosassa on jo Pro-vipu; "＋ Lisää henkilö"
   -elementti sen viereen aloittaisi nappien kertymisen, jota vastaan yläpalkkilinjaus on.
   → *Muutos:* perhetilan sisäänkäynti on Perustiedot-kortin otsikkorivin henkilöchipit —
   yksin-tilassa näkymätön, ei uutta pysyvää elementtiä.
2. **Kombinatoriikka on suurin piilokustannus.** Pro × Perhe × piirtopöytä × mobiili = jokainen
   uusi ominaisuus testataan neljässä maailmassa. → *Muutos:* markkinaoletukset, inflaatio,
   verot ja MC-asetukset ovat PERHETASON asetuksia (sama markkinamaailma kaikille — myös
   laskennallisesti oikein); henkilökohtaisia ovat vain allokaatio ja nostostrategia.
   Tämä puolittaa matriisin eikä hajota Pro-kortteja per henkilö.
3. **Vanha asiakas + perhelinkki = hiljainen datan menetys.** Vanha (esim. PWA-välimuistista
   ajava) versio pudottaisi tuntemattomat household-kentät ja tallentaisi typistetyn
   suunnitelman päälle. → *Muutos F0:aan:* linkkiin versiokenttä; vanhat versiot näyttävät
   "linkki vaatii uudemman version" eivätkä kirjoita localStorageen.
4. **Valintakerrosten kasautuminen piirtopöydällä.** Kaista-aktivointi + valinta + veto = kolme
   elettä mobiilissa; nykyinen malli on kaksi. → *Muutos:* kaistan aktivointi sulautuu
   valintaan — napautus mihin tahansa objektiin millä tahansa kaistalla valitsee suoraan ja
   aktivoi kaistan sivutuotteena. Elemäärä ei kasva.
5. **Opastuksen paisuminen.** +3 askelta pääkierrokseen veisi sen 12:een. → *Muutos:*
   pääkierros ei muutu; perhetilan ensiavaus saa oman 3 askeleen minikierroksen
   (sama malli kuin Pro-esittelysivu).
6. **Renderöintikustannus perhetilassa.** Sync-300-MC × 4 henkilöä ≈ 80–100 ms per muutos —
   syöttökentät tuntuisivat tahmeilta (nyt ~25 ms). → *Lievennys F1:een:* perhetilassa
   välitön esikatselu 150 polulla + worker tarkentaa kuten nyt; raahauksen kevyt frame
   pysyy deterministisenä (~2 ms × henkilöt).

**Hyväksyttävät myönnytykset (sanotaan ääneen):** mobiilissa perhetila on katselu- ja
yksi-kaista-muokkauspainotteinen — täysi kaistanäkymä on työpöytäkokemus. Suunnitelmani
vaihtaa minä-muodosta me-muotoon perhetilassa. Vertailudatakortti piilotetaan
perhesuunnitelmilta v1:ssä (ominaisuus "katoaa" perhekäyttäjältä — kerrotaan miksi).
Vertailukohta (haamu) ja skenaariot toimivat vain saman tilan sisällä; tilanvaihto
tyhjentää ne varoituksella.

## 10. Toteutustilanne (11.7.2026)

**Toteutettu ja tuotannossa** (arkkitehtuuri: profiilivaihto — aktiivinen henkilö on täsmälleen
nykyinen state, yksin-tila pikselintarkasti ennallaan):

- Henkilöchipit Perustiedoissa (＋ → puoliso, vaihto, nimeäminen, ✕×2 poistaa) — §9:n sisäänkäynti
- Koherentti kotitalous-MC (`mcHousehold`): sama markkinahistoria molemmille, perheen onnistumis-%
  = molempien varat riittävät; koherenssitodistus testinä (identtiset henkilöt → p, ei p²)
- Yhteiskäyrä + puolison käyrä graafissa ja piirtopöydällä; perhe-HUD-mittari
- **Perheratkaisija**: tartu yhteiskäyrään piirtopöydällä — molempien kuukausisäästöt joustavat
  yhtä paljon, chippi näyttää jaon; toimii myös Tab+nuolilla
- **Siirrot** (📤/📥): parisynkatut tapahtumat molempien suunnitelmissa (linkId; sama
  kalenterihetki eri i'illä); eivät päädy vertailudataan
- **Leskiturvatarkastelu** Suunnitelmani-perheosiossa (kuolema eläkeiässä → leski perii,
  riittävyys) + perheen tunnusluvut, henkilötaulukko ja siirtotaulukko
- **Perhevuoristo**: 2.5D-ridgeline-katselunäkymä (Yhteensä + henkilöt), ei riippuvuuksia
- Perhelinkki `#f=`-etuliitteellä (versiovahti), oma localStorage-avain, yksilölinkit ennallaan
- **Perhe kasvaa neljään (11.7.2026)**: jo syntyneet lapset täysinä jäseninä (oma käyrä,
  perustiedot, oma väri chipissä/graafissa/Vuoristossa; pohja: ikä 10, 50 €/kk, ei eläkettä).
  Havainto: F6:n gridimuunnos koskee vain syntymättömiä — jo syntynyt lapsi on vain henkilö,
  jonka ikä on pieni, ja kotitalous-MC hyväksyi N henkilöä valmiiksi. Siirrot kohdennetaan
  `peerPid`-tunnisteella (popoveriin saaja/antaja-valinta kun jäseniä > 2); perheratkaisija
  joustaa vain aikuisia; leskiturva rajattu aikuispariin; ✕ poistaa aktiivisen henkilön.

**Perustellut poikkeamat suunnitelmasta:** täysi kaistanäkymä-EDITORI korvattiin chipeillä +
yhteiskäyräoverlaylla + Vuoristo-katselulla — kompleksisuusbudjetti (Olavin vaatimus: kasvu ei
saa näkyä käyttäjälle) ja profiilivaihdon riskittömyys painoivat enemmän kuin rinnakkaiseditointi.
Akseli säilyi aktiivisen henkilön ikäakselina (kalenterivuodet ovat jo alarivinä) — puolison
käyrä mapataan samaan kalenteriin kuukausi-indeksillä.

**Jäljellä (F6+):** syntymättömät lapset (vaatii tulevaisuudessa alkavien simulaatioiden
gridimuunnoksen; jo syntyneet toteutettu 11.7.2026), käyrän "haarautuminen" lapsen
täysi-ikäistyessä, reiluussääntövalinta perheratkaisijaan (nyt: sama euromäärä aikuisille),
leskiturva graafi-overlayna, P2P-yhteissuunnittelu, perhesuunnitelmien vertailudata.

## 11. Avoimet kysymykset Olaville

1. Oletuskukkaro: *Omat kukkarot* (riski näkyy) vai *Yhteinen* (yksinkertaisempi)? Ehdotus: omat.
2. Lapsihaaran oletusikä (18? 20?) ja haaran alkupääoman esitystapa.
3. Perheratkaisijan oletusreiluussääntö (ehdotus: tulojen suhteessa).
4. Perhevuoristo v1:een vai lykätäänkö wow-kerros lanseerauksen jälkeiseksi?
5. Nimi: **Perhevirta**? (pariutuu Varallisuuspolun ja Vaurastumisen kartan kanssa) — vai
   Perhepolku / Sukuvirta?
