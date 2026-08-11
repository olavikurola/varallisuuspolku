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
