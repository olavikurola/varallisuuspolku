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
`Kokeile elämänpäätöksiä ennen kuin teet ne: eläkeikä, asunto, perhe. Kaikki laskenta tapahtuu laitteellasi — ei tiliä, ei seurantaa.` (~130)

**Avainsanat (max 100 merkkiä, pilkuin ilman välilyöntejä):**
`eläke,säästäminen,sijoittaminen,talous,fire,eläkelaskuri,korkoa korolle,varallisuus,budjetti` (92)

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

SOVELLUKSEN LISÄT
• Toteumaseuranta: kirjaa toteutunut varallisuutesi kuukausittain ja näe,
  oletko polulla, edellä vai jäljessä suunnitelmastasi
• Kotinäyttöwidget: suunnitelmasi tila yhdellä vilkaisulla
• Muistutukset (valinnainen): kuukausikatsaus ja suunnitelmasi omat
  tapahtumat — "tämän piti tapahtua nyt, toteutuiko?"
• Sovelluksen lukitus (valinnainen): Face ID, Touch ID tai laitteen koodi
• Pikatoiminnot: pitkä painallus kuvakkeesta suoraan Kysy AI:hin,
  Toteumaan tai Suunnitelmaan

YKSITYISYYS EDELLÄ
Kaikki laskenta ja tiedot pysyvät laitteellasi. Ei tiliä, ei
rekisteröitymistä, ei mainoksia, ei seurantaa. Mitään ei lähetetä
minnekään ilman erillistä omaa toimintoasi.

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

**App Review -muistiinpanot (katselmoijalle):**
```
No sign-in — all features work immediately. Native features beyond the
web experience: home screen widget (WidgetKit), icon quick actions,
monthly progress tracking (Toteuma in the Lisää tab), local notifications,
Face ID app lock, haptic feedback on the drawing board, native share
sheet. Try: 1) drag the wealth curve on the drawing board (expand icon on
the chart), 2) Lisää tab -> Muistutukset / Sovelluksen lukitus / Toteuma,
3) add the home screen widget after opening the app once. All calculations
run on device; the app collects no data.
```

## Google Play

**Lyhyt kuvaus (max 80 merkkiä):**
`Piirrä polkusi vaurauteen — kaikki laskenta laitteellasi, ei tiliä.` (66)

**Pitkä kuvaus:** sama kuin App Storen kuvaus yllä, yksi lisäys
SOVELLUKSEN LISÄT -listaan:
`• Kotinäyttöwidget: suunnitelmasi tila yhdellä vilkaisulla`
(ja lukitusrivin muotoon "sormenjälki, kasvot tai laitteen koodi").

**Data safety -luonnos:**
- Ei kerättyä eikä jaettua dataa (sama perustelu kuin App Privacy yllä).
- Tietoturva: liikenne TLS (Tulkki/vertailu jos käytetään), data ei poistu
  laitteelta oletuksena, datan poisto = sovelluksen tietojen tyhjennys.

**Feature graphic (1024×500):** generoidaan [feature.html](feature.html):stä
samalla kuvaskriptillä → `kuvat/play-feature.png`.

## Kuvakaappaukset (generoitu, tumma + vaalea)

| Tiedosto | Sisältö |
|---|---|
| `<laite>-1-koti.png` | Kojelauta: käyrä + onnistumis-% + alapalkki (tumma) |
| `<laite>-2-piirtopoyta.png` | Piirtopöytä kokoruudussa (tumma) |
| `<laite>-3-koti-vaalea.png` | Kojelauta vaaleassa teemassa |
| `<laite>-4-valikko.png` | ☰-valikko: muistutukset + lukitus näkyvissä |

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
`Try life decisions before you make them: retirement age, home, family. All calculations run on your device — no account, no tracking.` (133)

**Avainsanat (max 100 merkkiä, pilkuin ilman välilyöntejä):**
`retirement,pension,savings,investing,fire,wealth,planner,calculator,finland,budget,loan,simulator` (97)

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
products and does not predict returns.

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
- Kuvakaappaukset per kieli: en-US voi aluksi käyttää fi-settiä (ASC sallii;
  englanninkieliset kuvat generoidaan myöhemmin kun UI-käännös on buildissa)
- Ei-lokalisoituvat (jo täytetty fi-julkaisussa): kategoria, ikäraja, hinta,
  App Privacy, tietosuoja-URL
