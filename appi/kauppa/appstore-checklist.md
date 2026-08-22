# App Store -julkaisun läpikävely (täytetään appstoreconnect.apple.com)

Järjestys sama kuin lomakkeet tulevat vastaan. Kaikki tekstit ovat
[kuvaukset.md](kuvaukset.md):ssä — tähän on merkitty mihin kenttään mikäkin
menee. Arvioitu kokonaisaika ~1–2 h. Mikään kohta ei lähetä mitään ennen
viimeistä Submit-nappia; kaiken voi tallentaa ja jatkaa myöhemmin.

## A. Kertaluontoiset sovellustason asetukset

### A1. App Information (My Apps → Varallisuuspolku → App Information)
- [ ] Subtitle: `Piirrä polkusi vaurauteen`
- [ ] Category: Primary **Finance** (Secondary voi jättää tyhjäksi)
- [ ] Content Rights: ei kolmansien sisältöä → "does not contain third-party content"
- [ ] Age Rating → Edit: vastaa kyselyyn — kaikkiin **None/No**
      (ei väkivaltaa, ei rahapelejä, ei lääketietoa, ei käyttäjäsisältöä,
      ei tiliä). HUOM "Unrestricted Web Access" = **No** (appi ei sisällä
      selainta). Tulos: 4+.

### A2. Pricing and Availability
- [ ] Price: **0 € (Free)**
- [ ] Availability: kaikki maat (oletus) — suomenkielisyys ei haittaa

### A3. App Privacy (vasen valikko → App Privacy)
- [ ] Privacy Policy URL: `https://varallisuuspolku.com/tietosuoja.html`
- [ ] Get Started → **"Data Not Collected"** ("Do you or your third-party
      partners collect data from this app?" → **No**). Perustelu kirjattu
      kuvaukset.md:hen: ei tiliä, ei analytiikkaa appissa, Tulkki ja
      vertailudata ovat käyttäjän itse käynnistämiä eikä mitään yhdistetä
      henkilöön.
- [ ] Publish-nappi (App Privacy pitää julkaista ennen submitia)

### A4. EU Digital Services Act (Business → tai App Information -sivun kehote)
- [ ] Ilmoittaudu **non-traderiksi** (yksityishenkilö, ei kaupallista
      toimintaa — appi ilmainen, ei ostoja). Ilman tätä appi ei ole
      saatavilla EU-maissa, myöskään Suomessa.
- [ ] Jos ASC vaatii yhteystiedon vahvistuksen (sähköposti/puhelin),
      tee se heti — vahvistus voi viedä hetken.

## B. Versio 1.0 -sivu (My Apps → Varallisuuspolku → iOS App 1.0)

- [ ] **Screenshots** (vedä kuvat appi/kauppa/kuvat/-kansiosta):
      - iPhone 6,9": `iphone69-1-koti.png`, `iphone69-2-piirtopoyta.png`,
        `iphone69-3-koti-vaalea.png`, `iphone69-4-valikko.png`
      - iPhone 6,7" (valinnainen — 6,9" skaalautuu, mutta kuvat on):
        `iphone67-*.png` samassa järjestyksessä
      - iPad 13": `ipad13-*.png` samassa järjestyksessä (pakollinen,
        koska appi tukee iPadia)
      Järjestys = tarinan kärki ensin: koti → piirtopöytä → vaalea → valikko.
- [ ] Promotional Text: kuvaukset.md → "Promoteksti"
- [ ] Description: kuvaukset.md → "Kuvaus" (koko lohko)
- [ ] Keywords: kuvaukset.md → "Avainsanat"
- [ ] Support URL: `https://varallisuuspolku.com/`
- [ ] Marketing URL: `https://varallisuuspolku.com/` (valinnainen)
- [ ] **Build**: + Add Build → valitse uusin (korkein buildinumero,
      ladattu 9.8. — widget-käyrällinen)
- [ ] App Review Information:
      - Sign-in required: **ei rastia** (ei kirjautumista)
      - Contact: Olavi Kurola, puhelin kansainvälisessä muodossa,
        olavi.kurola@gmail.com
      - Notes: kuvaukset.md → "App Review -muistiinpanot" (englanninkielinen
        lohko — kertoo natiivilisät eli 4.2-vastauksen)
- [ ] Version Release: **"Manually release this version"** — saat itse
      päättää julkaisuhetken hyväksynnän jälkeen
- [ ] Export Compliance -kysymys submitissa: appi käyttää vain HTTPS:ää →
      "Standard encryption / exempt" (Info.plistissä on jo
      ITSAppUsesNonExemptEncryption=false, joten kysymystä ei ehkä näytetä)

## C. Lähetys ja sen jälkeen

- [ ] **Add for Review / Submit for Review**
- Tila: Waiting for Review (yleensä < 1 vrk) → In Review → hyväksyntä
  useimmiten 24–48 h. Hylkäyksen sattuessa syy tulee Resolution Centeriin —
  4.2-tapauksessa vastataan natiivilisillä (widget, pikatoiminnot,
  toteumaseuranta, muistutukset, lukitus, offline) ja lähetetään uudelleen.
- [ ] Hyväksynnän jälkeen: **Release This Version** kun haluat — kaupassa
  näkymiseen menee sen jälkeen muutama tunti.
- [ ] Julkaisun jälkeen: päivitä README-appi.md:n julkaisumuistilista ja
  harkitse App Storen tuotesivulinkin lisäämistä varallisuuspolku.comille.

## Muistiinpanot

- TestFlight-beta (sisäinen + ulkoinen ryhmä) jatkuu julkaisusta
  riippumatta — uudet buildit kulkevat samaa putkea, ja julkaistun appin
  päivitykset arvostellaan yleensä nopeammin kuin ensijulkaisu.
- Google Play: päätetty odottaa (suljetun testin 12 testaajaa × 14 pv
  -vaatimus — aloita testaajien keruu kun Play tulee ajankohtaiseksi).


---

# Versio 1.1 (englanti) — läpikävely

1.0:n kertaluontoiset asetukset (A1–A4) ovat jo tehty eikä niitä tarvitse
koskea. Uutta 1.1:ssä on **en-US-lokalisointi**, uudet kuvat ja What's New.
Arvioitu aika ~20–30 min. Tekstit: [kuvaukset.md](kuvaukset.md).

## 1. en-US-lokalisointi (kertaluontoinen, tehdään ennen versiosivua)
- [ ] My Apps → Varallisuuspolku → **App Information** → kielivalitsin
      oikeassa yläkulmassa → **Add Language → English (U.S.)**
- [ ] Name: `Varallisuuspolku` (sama brändi, 16/30)
- [ ] Subtitle: `Draw your path to wealth` (24/30)
- [ ] Tallenna. HUOM: tämä kohta tekee englannista näkyvän kaupassa —
      ilman sitä en-tekstit ja -kuvat eivät näy kenellekään.

## 2. Versiosivu 1.1 (iOS App → 1.1 Prepare for Submission)
Jokainen kenttä täytetään ERIKSEEN molemmille kielille (kielivalitsin sivun
yläreunassa: Finnish / English (U.S.)).

### Suomeksi (fi)
- [ ] What's New: kuvaukset.md → "Versio 1.1 — What's New" → Suomeksi
- [ ] Screenshots: `iphone69-fi-1…5`, (valinnaiset `iphone67-fi-*`), `ipad13-fi-*`
- [ ] **Description: PÄIVITTYNYT** — suomenkielinen kuvaus ei aiemmin maininnut
      Tulkkia lainkaan (englanninkielisessä sillä oli oma osionsa). Kopioi
      kuvaukset.md:n "Kuvaus"-lohko kokonaan uudelleen: mukana on nyt
      TULKKI-osio ja neljä ominaisuusriviä (useita suunnitelmia, vuositaulukko,
      tilastot, Pro-tila) sekä offline-maininta.
- [ ] **Promotional Text: PÄIVITTYNYT** — "Kokeile *taloudellisia*
      elämänpäätöksiä…" (146/170). HUOM: Promotional Text on ainoa kenttä,
      jota voi vaihtaa ilman uutta versiota — tämän voi päivittää heti,
      erillään 1.1:stä.
- [ ] Keywords: ennallaan (1.0:n tekstit) — ellei ota käyttöön kuvaukset.md:n
      vaihtoehtoista avainsanariviä, jossa "budjetti" on vaihdettu
      "tekoälyksi" (Olavin päätös)

### English (U.S.)
- [ ] What's New: kuvaukset.md → "Versio 1.1 — What's New" → English
- [ ] Screenshots: `iphone69-en-1…5`, (`iphone67-en-*`), `ipad13-en-*`
      Järjestys: koti → piirtopöytä → Tulkki → suunnitelmat → asetukset
- [ ] Promotional Text / Description / Keywords: kuvaukset.md → en-US-osio
- [ ] Support URL: `https://varallisuuspolku.com/index-en.html`

### Molemmille yhteiset
- [ ] **Build**: + Add Build → uusin (korkein numero)
- [ ] Version Release: **Manually release this version**
- [ ] **App Review Information: PÄIVITTYNYT** — kopioi kuvaukset.md:n
      "App Review -muistiinpanot" uudelleen. Uutta: appi on kaksikielinen
      (näkymien nimet annettu molemmilla kielillä) ja Kysy AI / Tulkki on
      kuvattu auki — se on ainoa verkkoa käyttävä toiminto, joten katselmoija
      ei tulkitse sitä ristiriidaksi "kaikki laskenta laitteella" -väitteen
      kanssa.
- [ ] **Ikärajakysely läpi uudelleen** (Age Rating → Edit): Applen kyselyssä on
      oma kohtansa tekoälykeskustelusta, ja Kysy AI / Tulkki on sellainen.
      Nykyinen 4+ ei ole itsestäänselvyys — käy kysely läpi ennen submitia.
      Jos raja nousee, päivitä myös Playn sisältökysely ja kuvaukset.md:n
      perustietotaulukon Ikäraja-rivi.

## 3. Lähetys
- [ ] Add for Review → Submit
- [ ] Odota hyväksyntä (päivitykset yleensä nopeampia kuin ensijulkaisu)
- [ ] **Release This Version** kun haluat → kaupassa muutamassa tunnissa
- [ ] Julkaisun jälkeen: somenosto (tekstipohjat keskustelussa) ja DM
      X-palautteen antajille, jotka englantia toivoivat

## Huomioita 1.1:stä
- Kauppasivun **Kielet-rivi** muuttuu muotoon "suomi, englanti" (Info.plistin
  CFBundleLocalizations + dev region korjattu — 1.0:ssa luki virheellisesti EN).
- Palvelinmuutokset (Tulkin en-prompt) ovat jo tuotannossa Railwayssa,
  eivät kulje appijulkaisun mukana.
- iOS:n InfoPlist-tekstit (Face ID -selite, 3 pikavalintaa) jäävät 1.1:ssä
  tietoisesti suomeksi — ks. KIELIVERSIO.md.
