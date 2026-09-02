# Kauppamateriaalit (App Store + Google Play)

Valmiina odottamassa kauppatilien aukeamista. Kuvakaappaukset generoidaan
komennolla `node tyokalut/kauppa-kuvat.js` (Playwright NODE_PATHin kautta,
kuten testit) → [kuvat/](kuvat/)-kansio. Tekstit alla ovat liitettävissä
sellaisenaan; merkkirajat tarkistettu. Linja: ei sijoitusneuvontaa, ei
tuottolupauksia — kuvataan työkalu, ei tuloksia.

## Yhteiset perustiedot

| Kenttä | Arvo |
|---|---|
| Nimi | Varallisuuspolku |
| Bundle/App ID | com.varallisuuspolku.app |
| Kategoria | Talous (Finance) |
| Ikäraja | 4+ / PEGI 3 (ei rahapelejä, ei käyttäjäsisältöä) |
| Hinta | Ilmainen, ei ostoja (v1) |
| Tuki-URL | https://varallisuuspolku.com/ |
| Markkinointi-URL | https://varallisuuspolku.com/ |
| Tietosuojaseloste-URL | https://varallisuuspolku.com/tietosuoja.html |
| Tukisähköposti | info@varallisuuspolku.com |

## App Store

**Alaotsikko (max 30 merkkiä):**
`Piirrä polkusi vaurauteen` (25)

**Promoteksti (max 170 merkkiä):**
`Kokeile taloudellisia elämänpäätöksiä ennen kuin teet ne: eläkeikä, asunto, perhe. Kaikki laskenta tapahtuu laitteellasi — ei tiliä, ei seurantaa.` (146)

**Avainsanat (max 100 merkkiä, pilkuin ilman välilyöntejä):**
`eläke,säästäminen,sijoittaminen,talous,fire,eläkelaskuri,korkoa korolle,varallisuus,budjetti` (92)

Vaihtoehto jos Tulkki halutaan hakuun — "budjetti" vaihtuu "tekoälyksi"
(Olavin päätös; pelkkä lisäys ilman vaihtoa veisi kentän 100/100 täyteen):
`eläke,säästäminen,sijoittaminen,talous,fire,eläkelaskuri,korkoa korolle,varallisuus,tekoäly` (91)

**Kuvaus:**

```
Varallisuuspolku on suomalainen elinkaarisuunnittelun työkalu, jossa
suunnitelmaa ei täytetä lomakkeelle — se piirretään. Vedä käyrää sormella:
milloin jäät eläkkeelle, paljonko säästät, mitä tapahtuu jos ostat asunnon
tai perheeseen tulee lapsi. Sovellus laskee joka vedolla tuhansia
markkinapolkuja ja näyttää, miten todennäköisesti rahat riittävät.

MITÄ SOVELLUS TEKEE
• Piirtopöytä: suunnitelman muokkaus suoraan käyrästä — kokeile päätöstä
  ennen kuin teet sen
• Monte Carlo -simulaatio: onnistumistodennäköisyys tuhansista
  satunnaisista markkinapoluista, ei yhden käyrän harhaa
• Suomalainen mallinnus: työeläke, pääomatulovero, hankintameno-olettama,
  sijoitustilit (OST/AOT)
• Elämäntapahtumat: asunto lainoineen, lapset, autot, remontit, myynnit,
  perheen yhteinen suunnitelma
• Tavoitteet varmuustasolla: "eläkkeelle 85 % varmuudella" — sovellus
  ratkaisee tarvittavan säästön, eläkeiän tai kestävän kuukausitulon
• Suunnitelmani-dokumentti: koko suunnitelma oletuksineen luettavana
  tekstinä, jonka voi viedä mukaan pankkiin tai neuvojalle
• Useita suunnitelmia: nimeä ja säilytä vaihtoehtoja ja vertaa niitä
  haamukäyränä samassa kaaviossa
• Vuositaulukko: kaikki luvut vuosi kerrallaan, vietävissä CSV:nä
• Tilastot: miten muut suunnittelevat varallisuuttaan — avointa dataa
• Pro-tila: ammattilaisen säädöt ja tarkemmat analyysit

SOVELLUKSEN LISÄT
• Toteumaseuranta: kirjaa toteutunut varallisuutesi kuukausittain ja näe,
  oletko polulla, edellä vai jäljessä suunnitelmastasi
• Kotinäyttöwidget: suunnitelmasi tila yhdellä vilkaisulla
• Muistutukset (valinnainen): kuukausikatsaus ja suunnitelmasi omat
  tapahtumat — "tämän piti tapahtua nyt, toteutuiko?"
• Sovelluksen lukitus (valinnainen): Face ID, Touch ID tai laitteen koodi
• Pikatoiminnot: pitkä painallus kuvakkeesta suoraan Kysy AI:hin,
  Toteumaan tai Suunnitelmaan

TULKKI — TEKOÄLY JOKA SELITTÄÄ, EI NEUVO
Kysy miksi luvut näyttävät siltä kuin näyttävät. Tulkki selittää oman
suunnitelmasi ja sen oletukset selkokielellä. Se ei suosittele tuotteita
eikä ennusta tuottoja. Kysymys lähtee laitteelta vain silloin kun itse
kysyt — muu sovellus toimii ilman verkkoyhteyttä.

YKSITYISYYS EDELLÄ
Kaikki laskenta ja tiedot pysyvät laitteellasi, ja sovellus toimii ilman
verkkoyhteyttä. Ei tiliä, ei rekisteröitymistä, ei mainoksia, ei
seurantaa. Mitään ei lähetetä minnekään ilman erillistä omaa toimintoasi.

Varallisuuspolku ei ole sijoitusneuvontaa: se näyttää ja selittää omien
oletustesi seuraukset, mutta ei suosittele tuotteita eikä lupaa tuottoja.
Laskentamalli oletuksineen on avoimesti dokumentoitu osoitteessa
varallisuuspolku.com.
```

**App Privacy -kyselyn luonnos (Olavi vastaa ASC:ssä):**
- Suositus: **"Data Not Collected"** — appi ei kerää mitään: ei tiliä, ei
  analytiikkaa (Plausible riisuttu appista), ei mainos-SDK:ita.
- Huomio: webin puolella on vapaaehtoinen anonyymi vertailudatan jako ja
  Tulkki-kysymykset — molemmat käyttäjän erikseen käynnistämiä toimintoja.
  Jos haluaa olla varman päällä, voi ilmoittaa "Financial Info — Not linked
  to you, App functionality, Optional". Kumpikin perusteltavissa; "Data Not
  Collected" on oikein, koska mitään ei kerätä ilman käyttäjän omaa,
  nimenomaisesti käynnistämää toimintoa, eikä mitään yhdistetä henkilöön.
- Tulkin osalta tarkistettu koodista (palvelin/server.js): välityspalvelin ei
  talleta kysymystä eikä suunnitelman lukuja mihinkään — vain mallitoimittajan
  virhevastaus lokitetaan. Applen "collect" edellyttää säilyttämistä pyynnön
  palvelemista pidempään, joten "Data Not Collected" pitää paikkansa.
- **AVOIN, OLAVIN PÄÄTETTÄVÄ: ikäraja.** Nykyinen merkintä on 4+. Applen
  uudistetussa ikärajakyselyssä on oma kysymyksensä tekoälykeskustelusta
  (chatbot), ja Kysy AI / Tulkki on juuri sellainen. Käy kysely läpi ASC:ssä
  ennen 1.1:n submitia — jos vastaus nostaa rajan, myös Playn sisältökysely
  pitää päivittää samalla. Älä oleta 4+:n säilyvän.

**App Review -muistiinpanot (katselmoijalle):**
```
No sign-in — all features work immediately. The app is bilingual: it
follows the device language and can be switched between English and
Finnish under the More (Lisää) tab; UI names below are given as
"English (Finnish)".

Native features beyond the web experience: home screen widget
(WidgetKit), icon quick actions, monthly progress tracking (Actuals /
Toteuma in the More tab), local notifications, Face ID app lock, haptic
feedback on the drawing board, native share sheet.

Ask AI ("Tulkki") is an assistant that explains the user's own plan in
plain language. It is the only feature that uses the network: the typed
question and the plan's numbers are sent over TLS to our own proxy, which
forwards them to the language model. It is never triggered automatically
— only when the user sends a question. No account, no personal data, no
identifiers; nothing is stored on our side. Every other feature, and all
of the calculation, runs on device and works offline.

Try: 1) drag the wealth curve on the drawing board (expand icon on the
chart), 2) More tab -> Reminders / App lock / Actuals, 3) Ask AI tab ->
send any question, 4) add the home screen widget after opening the app
once.
```

## Google Play

**Lyhyt kuvaus (max 80 merkkiä):**
`Piirrä polkusi vaurauteen — kaikki laskenta laitteellasi, ei tiliä.` (66)

**Pitkä kuvaus:** sama kuin App Storen suomenkielinen kuvaus yllä (widget-rivi
on jo siinä mukana), yksi muutos: lukitusrivi muotoon
`• Sovelluksen lukitus (valinnainen): sormenjälki, kasvot tai laitteen koodi`.

**Englanninkielinen listaus (en-US):**
- Lyhyt kuvaus (max 80): `Draw your path to wealth — all maths on your device, no account.` (64)
- Pitkä kuvaus: sama kuin App Storen englanninkielinen kuvaus alempana, sama
  lukitusrivin muutos (`fingerprint, face or your device passcode`)
- Kuvakaappaukset: `play-en-<n>-*.png` + sama feature graphic

**Data safety -luonnos:**
- Ei kerättyä eikä jaettua dataa (sama perustelu kuin App Privacy yllä).
- Tietoturva: liikenne TLS (Tulkki/vertailu jos käytetään), data ei poistu
  laitteelta oletuksena, datan poisto = sovelluksen tietojen tyhjennys.

**Feature graphic (1024×500):** generoidaan [feature.html](feature.html):stä
samalla kuvaskriptillä → `kuvat/play-feature.png`.

## Kuvakaappaukset (generoitu, kaikki tummassa teemassa)

Nimeämismalli `<laite>-<kieli>-<n>-<nimi>.png`; kieli `fi` tai `en`, sillä
Apple ja Play ottavat kuvat lokalisoinnittain. Sarja kertoo tarinan
näe → muokkaa → ymmärrä → säilytä → säädä, ja kaupan hakutuloksissa näkyy
kolme ensimmäistä.

| Tiedosto | Sisältö |
|---|---|
| `<laite>-<kieli>-1-koti.png` | Kojelauta: käyrä + onnistumis-% + alapalkki |
| `<laite>-<kieli>-2-piirtopoyta.png` | Piirtopöytä kokoruudussa |
| `<laite>-<kieli>-3-tulkki.png` | Tulkki: tekoälyapuri ja huomiot |
| `<laite>-<kieli>-4-suunnitelma.png` | Suunnitelmat ja tulostettava dokumentti |
| `<laite>-<kieli>-5-valikko.png` | Lisää-valikko: asetukset, muistutukset, lukitus, kieli |

Laitekoot: `iphone69` 1320×2868 (6,9" — pakollinen), `iphone67` 1290×2796
(6,7"), `ipad13` 2064×2752 (iPad 13"), `play` 1080×2400 (Play-puhelin).
Lavastus: esimerkkipersoona "Perhe ja asunto (35 v)" — realistiset luvut,
vahva mutta ei täydellinen onnistumis-%.

## App Store — englanninkielinen listaus (en-US)

Kohderyhmä: Suomessa asuvat englanninkieliset (KIELIVERSIO.md) — Suomi-spesifisyys
on ominaisuus, ei rajoite. Linja sama kuin suomeksi: ei sijoitusneuvontaa, ei
tuottolupauksia. Viralliset termit vero.fi:n mukaan: equity savings account
(osakesäästötili), deemed acquisition cost (hankintameno-olettama),
earnings-related pension (työeläke), book-entry account (arvo-osuustili).
Tulkki ja Varallisuuspolku ovat tuotenimiä — ei käännetä.

**Nimi (max 30 merkkiä):**
`Varallisuuspolku` (16) — sama brändinimi kaikilla kielillä

**Alaotsikko (max 30 merkkiä):**
`Draw your path to wealth` (24)

**Promoteksti (max 170 merkkiä):**
`Try financial life decisions before you make them: retirement age, home, family. All calculations run on your device — no account, no tracking.` (143)

**Avainsanat (max 100 merkkiä, pilkuin ilman välilyöntejä):**
`retirement,pension,savings,investing,fire,wealth,planner,calculator,finland,budget,loan,simulator` (97)

Vaihtoehto jos Tulkki halutaan hakuun — "simulator" vaihtuu "ai":ksi
(sama varaus kuin fi:ssä: pelkkä lisäys veisi kentän 100/100 täyteen):
`retirement,pension,savings,investing,fire,wealth,planner,calculator,finland,budget,loan,ai` (90)

**Kuvaus (max 4000 merkkiä; alla 2549):**

```
Varallisuuspolku is a lifetime financial planning tool made in Finland —
you don't fill in a form, you draw your plan. Drag the curve with your
finger: when you retire, how much you save, what happens if you buy a
home or a child joins the family. With every stroke the app runs
thousands of market paths and shows how likely your money is to last.

BUILT FOR FINLAND — IN ENGLISH
If you live in Finland, generic international calculators miss the
things that decide your outcome: earnings-related pension, capital
income tax, the deemed acquisition cost, and Finnish account types such
as the equity savings account (osakesäästötili). Varallisuuspolku
models them natively — in English.

WHAT THE APP DOES
• Drawing board: edit your plan directly on the curve — try a decision
  before you make it
• Monte Carlo simulation: a success probability from thousands of
  random market paths, not the false certainty of a single curve
• Finnish modelling: earnings-related pension, capital income tax,
  deemed acquisition cost, investment accounts (equity savings account
  / book-entry account)
• Life events: a home with its loan, children, cars, renovations,
  sales, a shared family plan
• Goals with a confidence level: "retire with 85% certainty" — the app
  solves the required savings, the retirement age or a sustainable
  monthly income
• My Plan document: your whole plan and its assumptions as readable
  text you can take to your bank or advisor
• Multiple plans: name and keep alternatives, and compare them as a
  ghost curve on the same chart
• Annual table: every figure year by year, exportable as CSV
• Stats: how others plan their wealth building — open data
• Pro mode: professional-grade controls and deeper analyses

APP EXTRAS
• Progress tracking: log your actual net worth monthly and see whether
  you are on, ahead of or behind your plan
• Home screen widget: your plan's status at a glance
• Reminders (optional): a monthly check-in and your plan's own events —
  "this was supposed to happen now, did it?"
• App lock (optional): Face ID, Touch ID or your device passcode
• Quick actions: long-press the app icon to jump straight to Ask AI,
  Progress or My Plan

TULKKI — AI THAT EXPLAINS, NEVER ADVISES
Ask why your numbers look the way they do. Tulkki explains your own
plan and its assumptions in plain language. It does not recommend
products and does not predict returns. Your question leaves the device
only when you ask — the rest of the app works offline.

PRIVACY FIRST
All calculations and data stay on your device, and the app works
offline. No account, no sign-up, no ads, no tracking. Nothing is sent
anywhere without a separate action of your own.

Varallisuuspolku is not investment advice: it shows and explains the
consequences of your own assumptions, but it does not recommend
products or promise returns. The calculation model and its assumptions
are openly documented at varallisuuspolku.com.
```

**What's New -pohja (englanninkielisen version julkaisuun):**

```
Varallisuuspolku now speaks English.

The full app is available in English: the drawing board, Monte Carlo
simulation, Finnish pension and tax modelling, the Tulkki explainer,
the widget, reminders and progress tracking. The app follows your
device language, and you can switch between English and Finnish in the
app's settings at any time.

As always: no account, no tracking — all data stays on your device.
```

**ASC-kentät jotka tämä osio täyttää** (lisää ensin kieli: App Information →
Localizable Information → English (U.S.)):
- App Information → Localizable Information (en-US): Name, Subtitle
- Versiosivu (en-US): Promotional Text, Description, Keywords, What's New,
  Support URL / Marketing URL (samat kuin fi: varallisuuspolku.com)
- Kuvakaappaukset per kieli: en-sarja on generoitu (`<laite>-en-<n>-*.png`)
  — lataa en-US-lokalisointiin ne, ei fi-settiä
- Ei-lokalisoituvat (jo täytetty fi-julkaisussa): kategoria, ikäraja, hinta,
  App Privacy, tietosuoja-URL


## Versio 1.1 — What's New (valmiit tekstit, päivitetty 22.8.2026)

Kenttä: ASC → versiosivu 1.1 → "What's New in This Version" (max 4000 merkkiä),
täytetään erikseen molemmille kielille.

### Suomeksi (fi) — 843 merkkiä

```
Varallisuuspolku puhuu nyt myös englantia.

Koko sovellus on käännetty: piirtopöytä, suomalainen eläke- ja
veromallinnus, elämäntapahtumat, vuositaulukko, toteumaseuranta,
tekoälyapuri Tulkki ja kotinäyttöwidget. Kielen vaihdat milloin tahansa
Lisää-välilehden asetuksista, Kieli-riviltä. Suomi on edelleen oletus
eikä mikään muutu, ellet itse vaihda.

Muuta tässä versiossa:
• Kaavion ikäkohdistin toimii nyt kosketuksella molemmissa kaavioissa:
  vaakaveto kuljettaa kohdistinta, pystyveto vierittää yhä sivua
• Allokaation korkoliukuri reagoi nyt myös silloin kun käteistä ei ole —
  osake- ja korkopaino joustavat symmetrisesti ja summa pysyy sadassa
• Kaavion tietolaatikko korjattu vaaleassa teemassa
• Pieniä hiontoja lomakkeiden asetteluun ja Lisää-valikkoon

Kaikki laskenta pysyy edelleen omalla laitteellasi: ei tiliä, ei
seurantaa.
```

### English (en-US) — 833 merkkiä

```
Varallisuuspolku now speaks English.

The whole app is translated: the drawing board, Finnish pension and tax
modelling, life events, the annual table, progress tracking, the Tulkki
explainer and the home screen widget. Switch languages at any time from
the Language row under the More tab. Finnish remains the default —
nothing changes unless you switch.

Also in this version:
• The chart's age cursor now works with touch on both charts: drag
  horizontally to move the cursor, vertically to scroll as before
• The interest allocation slider now responds even when you hold no
  cash — equity and interest weights flex symmetrically and still
  total 100
• Fixed the chart tooltip in the light theme
• Small refinements to form layout and the More menu

All calculations still run entirely on your device: no account, no
tracking.
```

**Tarkistettu koodista 22.8.2026:** appi EI vaihdu automaattisesti laitteen
kielelle. [kieli.js](../../kieli.js) aloittaa aina suomesta; englanninkielinen
laite saa etusivulla kertaluontoisen ehdotusbannerin, ja varsinainen valinta
tehdään Kieli-riviltä. Edellisessä What's New -luonnoksessa luki "The app
follows your device language" — se ei pitänyt paikkaansa, ja teksti on nyt
korjattu. Älä palauta väitettä ilman että toteutus muuttuu.

### ASC-muistilista 1.1:lle
- Versio 1.1 pbxproj:ssa (MARKETING_VERSION ×4), build-numeron antaa CI (run_number)
- CFBundleLocalizations = [fi, en] → kauppasivun Kielet-rivi: suomi, englanti
- InfoPlist-kolmikko (FaceID + pikavalinnat) TIETOISESTI suomeksi v1.1:ssä (KIELIVERSIO.md)
- en-US-lokalisoinnin kentät: tämän tiedoston edellinen osio (nimi/alaotsikko/promo/kuvaus/avainsanat)
- Ikärajakysely uudelleen (tekoälykeskustelu-kysymys) — ks. App Privacy -osio
- TestFlight ensin → X-toivojat DM-kutsulla → julkinen release manuaalisesti


## Versio 1.2 — What's New (luonnos 2.9.2026, kuluttajamuoto)

Kenttä: ASC → versiosivu 1.2 → "What's New in This Version" (max 4000 merkkiä),
täytetään erikseen molemmille kielille. Viisi bullettia, hyöty edellä, ei
teknisiä termejä; "jotkin luvut voivat muuttua" on tarkoituksellinen
rehellisyysrivi. Sisältö = web-erät 1–7 (2.9.2026); laskurisivut ovat vain
webissä eivätkä kuulu tähän.

### Suomeksi (fi) — 778 merkkiä

```
Riittävätkö rahat? Vastaus on nyt ensimmäinen luku, jonka näet.

• Kokeile elämää yhdellä napautuksella: "Onko varaa eläkkeelle
  60-vuotiaana?", "Mitä jos jään vuodeksi työttömäksi?", "Entä jos saan
  perinnön?" — kumoa palauttaa.
• Näet ennen kysymistä täsmälleen, mitä Tulkki-apurille lähtee. Nimesi
  ja suunnitelmiesi nimet eivät koskaan lähde laitteeltasi.
• Laskenta on entistä tarkempi: verot, varainsiirtovero ja työeläke
  käteen jäävänä — siksi jotkin luvut voivat muuttua hieman.
• Uutta suunnitelmaan: tulokatko (työttömyys, perhevapaa, sapatti) ja
  lainan kiinteä korko. Pro-tilassa myös korkojen nousun stressitesti.
• Jaettu linkki on puolet lyhyempi, ja sen avaaja saa selkeän
  vastaanoton.

Kaikki laskenta pysyy omalla laitteellasi — ei tiliä, ei seurantaa.
```

### English (en-US) — 731 merkkiä

```
Will the money last? The answer is now the first number you see.

• Try life with one tap: "Can I afford to retire at 60?", "What if I'm
  unemployed for a year?", "What if I inherit?" — undo restores.
• See exactly what is sent to the Tulkki assistant before you ask. Your
  name and your plan names never leave your device.
• More accurate calculation: taxes, transfer tax and take-home pension —
  so some figures may change slightly.
• New in your plan: an income gap (unemployment, parental leave,
  sabbatical) and a fixed-rate loan option. In Pro, a rising-rates
  stress test too.
• A shared link is half as long, and whoever opens it gets a clear
  welcome.

All calculations stay on your device — no account, no tracking.
```

**Tarkistettu koodista 2.9.2026:** jokainen kohta vastaa committeja 35683f8…d73beff
(Tulkin esikatselu ja nimipeite, kysymyskirjasto, sankaritiili, moottori-PR 2,
korkoshokki, rateFixed, jaetun linkin vastaanotto, pakkaus, leveät ikäkaistat).
"Osa luvuista muuttuu" on tarkoituksellinen rehellisyysrivi — validointisivun
muutosloki 29.8. ja 2.9.2026 kertoo yksityiskohdat.

### ASC-muistilista 1.2:lle
- 1.1-juna on suljettu ASC:ssä → MARKETING_VERSION 1.2 (bc12c76, ×4 pbxproj);
  TestFlight-buildi 1.2 onnistui 2.9.2026 (run 33592029348)
- Luo versiosivu 1.2 ASC:hen, What's New molemmille kielille yllä
- Kuvakaappaukset: ensimmäinen tiili on nyt "Riittävätkö rahat?" — päivitä
  työtilan kuvakaappaus, jos siinä näkyy vanha tiilijärjestys
- App Privacy: ei muutoksia (Tulkille välitetään edelleen vain nimettömät luvut;
  esikatselu vahvistaa tämän käyttäjälle)
- Ennen submitia: golden-evalit (kehote muuttui), npm publish 0.3.0, viikko
  TestFlight- ja web-palautetta
- Play: ensimmäinen Android-versio samalla sisällöllä vasta kun iOS 1.2 on
  todettu kunnossa (versionName 1.0 → 1.2)
