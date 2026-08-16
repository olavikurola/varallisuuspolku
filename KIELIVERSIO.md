# Kieliversio (fi/en) — suunnitelma ja tilanne

Tavoite: englanninkielinen versio Suomessa asuville englanninkielisille. Sisältö pysyy
Suomi-spesifinä (euro, osakesäästötili, Suomen verotus) — vain kieli käännetään.
Suomenkielinen kokemus ei saa muuttua missään vaiheessa.

Kartoitus tehty 16.8.2026 (neljä rinnakkaista koodipohja-analyysiä). Laajuus:
**~2 100–2 200 käännösyksikköä** — ~1 450 JS-stringiä kymmenessä tiedostossa,
~600 HTML-tekstisolmua, ~60 attribuuttia (title/aria-label/placeholder), ~36 JSON-LD-stringiä.
Ei olemassa olevaa i18n-infraa.

## Periaatteet

1. **Kieli ja maa ovat eri akselit.** Tämä hanke tekee kielikerroksen (fi/en).
   Maaprofiili (toisen maan verosäännöt) on eri hanke; nyt riittää, ettei
   Suomi-logiikkaa upoteta syvemmälle ja domain-vakiot pysyvät erillään kieliavaimista.
2. **Suomi on oletus ja lähde.** JS-tekstit siirretään avainpohjaiseen katalogiin, jossa
   fi-arvo on suoraan katalogissa — kun kieli on fi, renderöity lopputulos on merkilleen
   sama kuin ennen. Testisuite vartioi tätä.
3. **Staattiset sivut generoidaan.** Englanninkieliset HTML-sivut tuotetaan
   generaattorilla (tyokalut/-tyyliin) — suomenkielisiin HTML-tiedostoihin ei kosketa,
   ja SEO saa oikeat en-sivut hreflang-pareineen.
4. **Kielivalinta:** appi seuraa laitteen kieltä, web ?lang/localStorage-arvoa;
   asetuksissa valitsin ohitukseksi. Jakolinkit/tallenteet: kielikenttä additiivinen,
   puuttuva = fi (taaksepäinyhteensopivuus ei rikkoudu).
5. **MCP-paketti pysyy suomeksi** (julkaistu julkinen API, työkalunimet ym.).

## Vaiheet

### Vaihe 0 — valmistelu, nolla näkyvää muutosta ⬅ TYÖN ALLA
- [x] **kieli.js luotu** (16.8.2026): locale-sidonnainen muotoilu yhdessä paikassa —
      VP_LOCALE, fmtLuku (raakaluku), fmtPvm (pvm), fmtEur, fmtCompact, pctFmt, fmtAge
      siirretty apu.js:stä tavut säilyttäen. Ladataan ensimmäisenä index/analytiikka/
      agentit-sivuilla. Lisätty sync-whitelistiin + SW CORE:en, CACHE v49→v50.
      ⚠ HAVAINTO: fmtCompactin ' M€'/' t€'/' €' ja pctFmt:n ' %' sisältävät
      LITERAALIN NBSP:n (U+00A0) — inventaarion väite "ei NBSP-literaaleja" oli
      väärä; JS-tiedostoissa on ~109 NBSP:tä. Editointi vain tavutietoisesti
      (Edit-työkalu ei erota NBSP:tä välilyönnistä — käytä node-skriptiä).
- [x] Raa'at `toLocaleString/toLocaleDateString('fi-FI')`-kutsut (42 kpl) → fmtLuku/fmtPvm.
      Ainoat jäljelle jääneet 'fi-FI'-maininnat: kieli.js (VP_LOCALE), offline-työkalut
      (tyokalut/), testien locale-pinnit.
- [x] Duplikaattiformatterit pois: analytiikka.js fmtCompact (huom: ≥10 M€ näyttää nyt
      0 desimaalia kuten muuallakin — ero mahdollinen vain >10 M€ tilastoissa),
      piirtopoyta.js fmtNum → ohut pyöristävä wrapperi fmtLuvun päälle,
      tulkki.js fmtFi → fmtLuku sisällä. analytiikka.html lataa nyt kieli.js:n.
- [x] Testien hasText-klikkiajurit → rakenteelliset kahvat: paletin chipit
      `data-type` (kaavio.js buildPalette), suunnitelmavalikon napit `data-act`
      (sovellus.js openPlanMenu), vihjechipit `data-vihje` (sovellus.js showEventHint),
      perhevalikko `data-rooli` (laajennukset.js openFamAddMenu). 15 ajuria muutettu
      8 testitiedostossa. JÄTETTY TARKOITUKSELLA: verify-profiilit .ph-row-nimimatchit
      (käyttäjäsisältöä; 'Oma polkuni'/'Tuotu suunnitelma' -oletusnimet katalogiin
      vaiheessa 1) ja verify-vertailu .tk-sug (sisältöassertio, vaihe 1).
- [x] NBSP-normalisoija: testit/selain/normi.js (norm), 6 kopiota korvattu requirella.
      verify-tulkki.js:n oma stripperi jätetty (eri semantiikka: poistaa kaikki välit).
- [ ] Duplikaatti-labeltaulut: tulkki.js EVENT_NAMES, analytiikka.js tapahtumakartta
      → EVENT_TYPES (sanamuodot eroavat tarkoituksella — tarkista) — SIIRRETTY VAIHEESEEN 1
      (EVENT_TYPES asuu apu.js:ssä jota analytiikka.html ei lataa; ratkeaa katalogin myötä)
- [ ] ERIKSEEN (muuttaa Pro-käytöstä): osinkovero lukee TAX_LOW-vakiota ohi ctx:n
      (laskenta.js ~496) — Pro-verokannan muutos ei vaikuta osinkoveroon. Korjaus
      omana committinaan.

### Vaihe 1 — tekstien ekstraktio katalogiin ⬅ TYÖN ALLA
**VALITTU MALLI (16.8.2026): gettext-tyyli.** Suomenkielinen teksti on itse avain:
`t('Opiskelu')` palauttaa fi-kielellä syötteen sellaisenaan (suomi ei kulje
sanakirjan kautta eikä voi hajota), en-kielellä VP_SANASTO-haun (fi→en).
Parametrit `t('Ikä {0} v', ika)` -paikkamerkein. Mekanismi kieli.js:ssä
(VP_KIELI, VP_SANASTO, t). "Ekstraktio" = render-kohtien kääriminen t():hen —
tekstejä ei siirretä, diff pysyy pienenä, en-sanasto generoidaan vaiheessa 2
skannaamalla t()-kutsut. VAROITUS: `t` on yleinen muuttujanimi — tarkista
varjostukset ennen käärintää (esim. kortit.js:in `[t, share]` → `[tp, share]`).
LINJAUS: telemetria (track()-propsit, esim. kaavio.js 'Tapahtuma lisätty'
tyyppi-label) EI käännetä — Plausible-datan jatkuvuus. MCP ja LLM-konteksti fi.

- [x] t()-mekanismi kieli.js:ään (16.8.2026)
- [x] EVENT_TYPES-labelien renderöintiketju: evLabel (apu.js, kattaa 43 kutsupaikkaa)
      + suorat def.label-luvut (kaavio paletti/ghost/placeholder, kortit ×2,
      piirtopoyta fs-valikko, laajennukset tornado-labelit)
- [x] alapalkki.js kokonaan: käännös apuritasolla (ryhma/add/kytkin/tab) —
      kaikki valikkorivit, kytkimet ja tabbar kerralla, kutsupaikat pysyvät suomena
- [x] natiivilisat.js: ilmoitukset, lukitusdialogit ja -näyttö, jakolomake,
      toteumatekstit, widget-payload — koostetut lauseet {0}-paikkamerkein.
      HUOM: toteumafunktioissa paikallinen `var t = toteumaLue()` varjostaa
      käännösfunktion → niissä window.t(...). JÄLJELLÄ samasta syystä:
      toteumalomakkeen virhetekstit (~349-353, 'Anna varallisuus euroina' ym.)
      — kääri window.t:llä tai nimeä lokaali uudelleen seuraavassa erässä.
      Kytkinrivien tekstit (473-489) lokalisoituivat jo alapalkin apurin kautta.
- [x] natiivilisat.js loppuun: toteumalomakkeen virhetekstit window.t:llä
- [x] tulkki.js ERRORS-luennat (4 kpl) fallback-teksteineen — t() lukupaikassa,
      ERRORS-taulun fi-arvot toimivat avaimina. LINJAUS: NOQ ei käärity — arvot
      menevät palvelimelle LLM-kysymyksinä (kieli ratkeaa vaiheen 2 lang-paramilla)
- [x] STRESS_DEFS-nimet + from-tekstit stressiskenaariolistassa (laajennukset.js;
      laskenta.js pysyy koskemattomana — labelit käännetään renderöintipaikassa)
- [x] kortit.js tilastotiilet + sovellus.js yhteenvetotiilet NIELUKÄÄRINTÄNÄ:
      renderöinti kääntää k/v/s-kentät — staattiset labelit ('Verot yhteensä',
      'Ei toteudu'…) kääntyvät heti, koostetut alaotsikot valuvat suomena läpi
      kunnes ne muutetaan {0}-muotoon (inkrementaalinen malli, ei riko mitään)
- [x] kaavio.js tooltip-rivien labelit (9 kpl: Sijoitukset, Vaihteluväli, …)
- [x] TOUR_STEPS (~1600 sanaa): renderöinti (tourShow + announce) kääntää t():llä.
      MIINA PURETTU ARKKITEHTUURILLA: natiiviblokin .replace()/mutaatiot ovat
      gettext-mallissa turvallisia — muunneltu KOKO teksti on avain, web- ja
      appiversiot ovat vain eri sanakirjarivejä (kommentti laajennukset.js:ssä)
- [x] EXAMPLES-valikon nimet/kuvaukset + toast()-NIELU (kattaa ~29 kutsupaikan
      staattiset viestit kerralla; tupla-t() on harmiton — miss palauttaa syötteen)
      + ACCT_NOTES-luenta. Koostetut toastit ja OST-katon häntäliitteet valuvat
      suomena kunnes {0}-muoto
- [x] piirtopöydän a11y-tekstit (aria/announce/scrub, 15 lausetta) {0}-muotoon +
      chipRow-labelnielu — puhutut muodot ('euroa kuukaudessa') omina avaiminaan,
      visuaaliset €/kk-yksiköt ennallaan (NBSP-alueisiin ei koskettu)
- [x] tulkin muutosesikatselun r.nimi-nielut (kortti/tiivistelmä/ohitettu)
- [x] kaavion openPopover-lomake (84 käärintää: kentät, tavoitenapit sinkeinä,
      note-builderit {0}-muotoon; NBSP-rivit 447/550/801 kierretty sinkeillä)
- [x] analytiikan narratiivit {0}-muotoon (quartPos-fraasit omina avaiminaan),
      needMsg, empty()- ja tiilinielut
- [x] suunnitelmakodin valikon inforivi, poistovarmistus, lähdelabelit
- [x] laajennusten Pro-paneelit + perheominaisuudet (160 käärintää; dev()-taulun
      arvo/oletus/yksikköpuolet tavut säilyttäen koskematta), kortit.js alaotsikot
- [x] sovellus.js renderSummary/summaryPoints/summaryTalks + buildShareImage
      (134 käärintää): r. 1145 fragmenttilause EI uudelleenkirjoitettu vaan
      jokainen '; '-alkuinen itsenäinen lauseke on oma avaimensa (NBSP:t
      avaimissa tallella); tavuidenttisyys todistettu ajamalla vanha ja uusi
      funktio 5 tilayhdistelmällä
- [x] tulkin in-template title/aria/placeholder-attribuutit ja paneeliotsikot
      (14 kpl; yksityisyysrivin web/appi-variantit omina avaiminaan)
- [ ] jatko (vaihe 1 loppusuora): summaryChartSVG-akselit (lokaali t → window.t),
      kaavion HUD/legenda index.html:ssä; staattinen HTML vaihe 3:n generaattorin
      kautta. Lisäksi iOS-kielimetadata korjattu (dev region fi + CFBundleLocalizations)
      — App Store näyttää FI seuraavasta buildista alkaen.

Tiedosto kerrallaan, testit joka välissä. Järjestys (helpoimmasta / perustavimmasta):
1. apu.js (EVENT_TYPES-labelit + formatterit — kaiken perusta)
2. laskenta.js (3 pientä labeltaulua), natiivilisat.js (flat), alapalkki.js (parametrisoitu valmiiksi)
3. kortit.js, piirtopoyta.js (huom: a11y-announce tarvitsee puhutun muodon "euroa kuukaudessa")
4. kaavio.js (openPopover ~540 riviä HTML-buildausta), analytiikka.js
5. laajennukset.js — TOUR_STEPS helppo, MUTTA r. 42 `.replace('omassa selaimessasi', …)`
   -hack korvattava web/native-avaimilla
6. tulkki.js (4 labeltaulua, 18 in-template-attribuuttia)
7. sovellus.js — työläin: EXAMPLES (7 suunnitelmaa), 29 toastia, buildShareImage-canvas,
   ja renderSummary r. ~1145 fragmenttilause kirjoitettava kokonaisiksi lauseviesteiksi

### Vaihe 2 — englanti käyttöön
- Käännös (viralliset termit: osakesäästötili = equity savings account [vero.fi],
  arvo-osuustili = book-entry account, hankintameno-olettama = deemed acquisition cost)
- Kielentunnistus + asetusten valitsin
- Tulkki: lang-parametri /tulkki-APIin + englanninkielinen TULKKI_SYSTEM
  (palvelin/server.js ~399; nyt "Vastaa suomeksi")
- Natiivit ~16 stringiä: iOS Localizable.strings + InfoPlist.strings + knownRegions
  (pbxproj käsin tehty — varo), Android values-en/strings.xml
  ⚠ Lokalisointi kääntää en-laitteet automaattisesti → shipataan vasta kun kattava
- App Store: englanninkielinen listaus ASC:hen (en-US), TestFlight-beta X-toivojille
- Widget + notifikaatiot lokalisoituvat JS:n mukana ilmaiseksi (sisällöt natiivilisat.js:stä)

### Vaihe 3 — web-SEO
- Generoidut /en-sivut kaikista kuudesta + hreflang-parit + sitemap + en-JSON-LD
  (UKK duplikoitu näkyvän ja JSON-LD:n välillä — generoitava samasta lähteestä)
- SW: offline-navigointifallback on kovakoodattu ./index.html → en-reitille oma käsittely
- Huom: tietosuoja.html ei ole sync-whitelistissä eikä SW CORE:ssa (korjattava ohessa)

## Ansat (älä unohda)

- **appi/sync-web.mjs**: kova 30 tiedoston whitelist; jokaisessa listan HTML:ssä
  OLTAVA Plausible-blokki tai synkka kaatuu tahallaan (fail-fast-guard).
- **sw.js**: uudet tiedostot CORE-listaan + CACHE-bump (nyt v49); offline-fallback → fi-etusivu.
- **Yksiköt teksteissä**: €/kk (38×), %/v (29×), t€/M€ ovat suomen lyhenteitä → muotoilukuviot.
- **Desimaalipilkut proosassa** (1,5 %) kulkevat käännöksen mukana; validointi.html:n
  36 käsin kirjoitettua &nbsp;-tuhaterotinta muotoiltava en-versioon käsin.
- **Testit**: 865 assertiosta ~17 % tekstisidonnaisia, keskittyvät ~8 tiedostoon
  (verify-natiivilisat, verify-tulkki, verify-tilastot* pahimmat). evalit.js:n
  numerokuri-parseri olettaa fi-muotoilua.
- **Julkaisurutiini** (YLLAPITO.md) pätee joka vaiheessa: aja-kaikki.js vihreä ennen pushia.

## Tilanne

- 16.8.2026: Kartoitus valmis, suunnitelma kirjattu. Vaihe 0 aloitettu.
