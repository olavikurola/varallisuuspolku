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

## Käännökset (ei vaadi paikallista Android Studiota / Macia)

- **Android**: GitHub → Actions → *Appi – Android (debug-APK)* → Run workflow.
  Valmis `app-debug.apk` löytyy ajon Artifacts-osiosta → siirrä puhelimeen ja
  asenna. Paikallisesti: asenna Android Studio + JDK 21, sitten
  `npm run sync:android && cd android && gradlew assembleDebug`.
- **iOS**: GitHub → Actions → *Appi – iOS (käännöstarkistus)* — todistaa että
  projekti kääntyy pilvi-Macilla. Laitteelle asennus vaatii Apple Developer
  -tilin (99 $/v); polku: App Store Connect -API-avain → fastlane/xcodebuild
  -allekirjoitus CI:ssä → TestFlight. Tämä on seuraava erä, kun tili on olemassa.

## Julkaisumuistilista (kun kauppoihin lähdetään)

1. Play Console -tili (25 $ kerran) · App Store: Apple Developer Program (99 $/v).
2. Release-allekirjoitus: Android keystore (SÄILYTÄ varmuuskopio!) GitHub-secretiksi;
   iOS: App Store Connect API-avain + jakelusertifikaatti secreteiksi.
3. Tietosuojakortit: appi ei kerää mitään oletuksena; suunnitelman jako ja
   Tulkki ovat opt-in ja kuvattu sivulla itsellään. Tietosuojaseloste-URL:ksi
   käy https://varallisuuspolku.com/ -sivun seloste.
4. Applen 4.2 (minimum functionality): kääre tarvitsee natiivilisää ennen
   katselmointia — suositus: kotinäytön widget + paikallinen kuukausimuistutus.
5. Versionumerot: android/app/build.gradle (versionCode/versionName) ja
   Xcode MARKETING_VERSION — nostetaan julkaisuittain.

## Päivitysrytmi

Web kehittyy omaan tahtiinsa; appi paketoi sen hetkisen tilan silloin kun
build ajetaan. Isot muutokset suunnitelman JSON-skeemaan pitää tehdä
taaksepäin yhteensopivina (vanha appiversio voi elää kaupassa kuukausia).
