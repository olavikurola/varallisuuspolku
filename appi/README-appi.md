# Varallisuuspolku — natiiviappi (iOS + Android)

Capacitor-kääre saman repon web-sovelluksen ympärillä. Periaate: **web on
totuuden lähde** — appi ei sisällä omaa sovelluskoodia, vaan `sync-web.mjs`
kokoaa `www/`-kansion tuotannon tiedostoista aina ennen käännöstä.
Tuotantoon (GitHub Pages, Railway) tämä kansio ei vaikuta millään tavalla.

## Rakenne

- `sync-web.mjs` — ainoa silta webin ja appin välillä: kopioi whitelistatut
  tiedostot `www/`-kansioon ja riisuu Plausible-analytiikan (appikäyttö ei saa
  sekoittua webin kävijämittaukseen, ja kauppojen tietosuojakortti pysyy puhtaana).
  `www/` ja `node_modules/` on gitignoroitu — generoituvat aina uudelleen.
- `capacitor.config.json` — appId `com.varallisuuspolku.app`, tumma tausta,
  Android edge-to-edge -marginaalit.
- `android/`, `ios/` — Capacitorin generoimat natiiviprojektit (versionhallinnassa,
  kuten Capacitor-käytäntö on). Käsin tehdyt muutokset: styles.xml (tumma
  tilapalkki), Info.plist (vaalea tilapalkkiteksti, ITSAppUsesNonExemptEncryption).
- `assets/logo.png` — ikonien lähde (skaalattu icon-512-maskable.png:stä);
  `npm run ikonit` generoi kaikki koot uudelleen.

## Appikohtaiset erot webiin

| Ero | Miksi |
|---|---|
| Ei Plausiblea | appikäyttö erilleen webin mittauksesta; kauppojen tietosuojakortti |
| Ei service workeria | tiedostot latautuvat paikallisesti; sovellus.js ohittaa rekisteröinnin natiivissa |
| Palvelin-CORS: `capacitor://localhost` + `https://localhost` | tilastot ja jako toimivat appista (palvelin/server.js) |
| Natiivilisät (natiivilisat.js) | ks. alla — webissä tiedosto ei tee mitään |

## Natiivilisät (Applen 4.2 "minimum functionality" -vaatimus + käyttötiheys)

Kaikki opt-in, ilmaisia ja paikallisia — mitään ei lähetetä minnekään.
Web-puoli on yhdessä tiedostossa ([natiivilisat.js](../natiivilisat.js), sauma
sovellus.js:n `openMoreMenu`ssa `window.vpNativeMenu`-koukkuna), joten appin
logiikka pysyy periaatteen mukaisesti webissä.

- **Muistutukset** (`@capacitor/local-notifications`, ☰-valikon rivi):
  kuukausikatsaus kuun 1. päivä klo 9 + suunnitelman tulevat tapahtumat
  ("Suunnitelmasi mukaan tämä tapahtuu nyt — toteutuiko?"). Tapahtuman
  kuukausi lasketaan iästä (ikä ankkuroituu nykyhetkeen); ajastukset uusitaan
  aina käynnistyksessä ja taustalle siirryttäessä, enintään 12 tapahtumaa
  (iOS:n 64 odottavan raja). Pluginin boot-palautus kestää puhelimen
  uudelleenkäynnistyksen.
- **Sovelluksen lukitus** (`@capgo/capacitor-native-biometric`, ☰-valikon
  rivi): sormenjälki/kasvot/laitteen koodi varamenetelmänä. Peite piirtyy
  ennen kuin luvut ehtivät ruudulle; lukitus laukeaa kylmäkäynnistyksessä ja
  kun appi palaa taustalta yli minuutin tauon jälkeen (myös Tilastot-sivulla).
  Luvat: USE_BIOMETRIC (AndroidManifest), NSFaceIDUsageDescription (Info.plist).
- **Kotinäyttöwidget (Android)**: natiivilisat.js kirjoittaa tiivistelmän
  (onnistumis-%, eläkeikä, päiväys) `@capacitor/preferences`-tallennukseen →
  widget (VarallisuusWidget.java) lukee saman SharedPreferencesin
  ("CapacitorStorage", avain `vp-widget`) ja näyttää valmiit tekstit — widget
  ei laske mitään. Päivitys heti VpWidgetPlugin-pikkusillalla (rekisteröity
  MainActivityssä) + varalta 30 min välein. **iOS-widget tehdään erikseen**
  kun Apple-tili aukeaa (WidgetKit-laajennus vaatii Xcode-projektimuutokset,
  joita ei kannata tehdä sokkona ilman TestFlight-testausta).

Regressiot: `testit/selain/verify-natiivilisat.js` (Capacitor-stub: valikkorivit,
ajastukset, lupa evätty, lukituspolut, widget-JSON, web-noop).

## Käännökset (ei vaadi paikallista Android Studiota / Macia)

- **Android**: GitHub → Actions → *Appi – Android (debug-APK)* → Run workflow.
  Valmis `app-debug.apk` löytyy ajon Artifacts-osiosta → siirrä puhelimeen ja
  asenna. Paikallisesti: asenna Android Studio + JDK 21, sitten
  `npm run sync:android && cd android && gradlew assembleDebug`.
- **iOS**: GitHub → Actions → *Appi – iOS (käännöstarkistus)* — todistaa että
  projekti kääntyy pilvi-Macilla. Laitteelle asennus: TestFlight-työnkulku alla.

## TestFlight-työnkulku (appi-testflight.yml)

Valmiina odottamassa — vaatii Apple Developer -tilin (99 $/v) ja neljä
GitHub-secretiä. Kun tili on auki, tee kerran:

1. **API-avain**: App Store Connect (appstoreconnect.apple.com) → Users and
   Access → Integrations → App Store Connect API → Team Keys → **+**.
   Rooli: **App Manager**. Lataa `.p8`-tiedosto talteen (saa ladata vain kerran!)
   ja kopioi sivulta **Key ID** ja **Issuer ID**.
2. **Team ID**: developer.apple.com/account → Membership details → Team ID
   (10 merkkiä, esim. AB12CD34EF).
3. **Secretit** (PowerShell repokansiossa; korvaa arvot):
   ```
   gh secret set APPSTORE_KEY_ID --body "AVAIMEN_KEY_ID"
   gh secret set APPSTORE_ISSUER_ID --body "ISSUER_ID"
   gh secret set APPLE_TEAM_ID --body "TEAM_ID"
   gh secret set APPSTORE_P8 (Get-Content polku\AuthKey_XXXX.p8 -Raw)
   ```
4. **Appirivi App Store Connectiin** (kerran): My Apps → **+** → New App →
   alusta iOS, nimi "Varallisuuspolku", kieli suomi, Bundle ID
   `com.varallisuuspolku.app` (jos ID ei ole listalla, aja työnkulku kerran —
   pilviallekirjoitus rekisteröi sen — ja luo appirivi sitten), SKU esim.
   `varallisuuspolku`.
5. Aja GitHub → Actions → **Appi – iOS TestFlight** → Run workflow.
   Build ilmestyy App Store Connectin TestFlight-välilehdelle ~5–15 min
   käsittelyn jälkeen → lisää itsesi sisäiseksi testaajaksi → asenna
   iPhonen TestFlight-apista.

Allekirjoitus hoituu Xcoden pilviallekirjoituksella (API-avain) — sertifikaatteja
ei säilytetä missään itse. Buildinumero kasvaa automaattisesti (GitHub-ajon
numero); versionumero (MARKETING_VERSION 1.0) nostetaan Xcode-projektista
kun julkaistaan isompia versioita.

## Julkaisumuistilista (kun kauppoihin lähdetään)

1. Play Console -tili (25 $ kerran) · App Store: Apple Developer Program (99 $/v).
2. Release-allekirjoitus: Android keystore (SÄILYTÄ varmuuskopio!) GitHub-secretiksi;
   iOS: App Store Connect API-avain + jakelusertifikaatti secreteiksi.
3. Tietosuojakortit: appi ei kerää mitään oletuksena; suunnitelman jako ja
   Tulkki ovat opt-in ja kuvattu sivulla itsellään. Tietosuojaseloste-URL:ksi
   käy https://varallisuuspolku.com/ -sivun seloste.
4. Applen 4.2 (minimum functionality): natiivilisät tehty (muistutukset,
   lukitus, Android-widget — ks. yllä). iOS-puolelle vielä WidgetKit-widget
   TestFlight-vaiheessa vahvistamaan 4.2-argumenttia.
5. Versionumerot: android/app/build.gradle (versionCode/versionName) ja
   Xcode MARKETING_VERSION — nostetaan julkaisuittain.

## Päivitysrytmi

Web kehittyy omaan tahtiinsa; appi paketoi sen hetkisen tilan silloin kun
build ajetaan. Isot muutokset suunnitelman JSON-skeemaan pitää tehdä
taaksepäin yhteensopivina (vanha appiversio voi elää kaupassa kuukausia).
