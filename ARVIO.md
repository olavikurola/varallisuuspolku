# ARVIO.md — Kokoruudun piirtotila v1.1, arviointi repoa vasten

Arvioitu 2026-07-09 työpuun tilaa vasten (app.js 2 882 riviä / 126 kt, index.html 316 riviä).
Benchmarkit: Node v24.16.0, työpöytäkone. Selainmittauksia (DOM-renderöinti) ei ajettu — merkitty erikseen.

**Kokonaisarvio: toteuttamiskelpoinen.** Arkkitehtuuri tukee suunnitelmaa paremmin kuin suunnitelma olettaa:
CRN on käytännössä jo olemassa, `simulate(st)` on jo lähes puhdas, ja jakolinkki on jo hash-fragmentissa.
Kaksi suunnitelman oletusta on kuitenkin väärin päin: (1) V0:n shokkimatriisi ratkoo ongelmaa jota ei ole,
ja todellinen ongelma on että **nykyinen renderöinti ajaa täyden MC:n + ratkaisijat joka framella**;
(2) 5000 polkua päälangassa ei mahdu budjetteihin — tarvitaan worker tai porrastus, ei "optimoidaan jos ylittyy".

---

## 1. Nykytilaväitteiden todennus (suunnitelman luku 2)

| Väite | Tulos | Viite |
|---|---|---|
| Yksi app.js ~128 kt, index.html ~18 kt | ✔ (129 350 t / 18 110 t) | — |
| SVG-renderöinti `createElementNS`, ei kirjastoja, keskitetty `renderChart` | ✔ | `el()` app.js:617, `renderChart` app.js:639 |
| Simulaatio kk-resoluutiolla, Float64Array-puskurit | ✔ osin: growth/payments/debt/assets/flows ovat Float64Array; **`exp`, `opt`, `pess`, `net`, `invested` ovat tavallisia Array-taulukoita** | app.js:238–246, 294–299, 368–371 vs. 366, 563, 567, 579 |
| `mulberry32` olemassa | ✔ | app.js:106 |
| `startMarkerDrag`, `startPaletteDrag`, pointer events | ✔ | app.js:1004, 1065 |
| `computeGhost`, `loadBaseline`, `clearBaseline` | ✔ | app.js:1663, 1687, 1680 |
| "Ratkaisijat `solvedWithdrawal`, `solvedRetireAge`" | ⚠ Eivät ole funktioita vaan **tuloskenttiä**; ratkaisulogiikka on inline-haaroina `simulate()`:n sisällä | app.js:455–532 |
| `doUndo`, `buildDonationPayload`, `donateState`, `allocationAt`, `buildMu` | ✔ — huom. `buildMu` on **`simulate()`:n sisäinen closure**, ei moduulitason funktio | app.js:2221, 129, 1825, 200, 346 |

### Avoimet kysymykset — vastaukset

- **MC-polkumäärä:** `const N_MC = 300` on kovakoodattu `simulate()`:n **sisään** (app.js:425). Parametrisointi on triviaali mutta pakollinen V0-muutos.
- **Seedaus:** polkukohtainen kiinteä siemen `mulberry32(1337 + i * 7919)` (app.js:430), riippumaton kaikista parametreista. **Tämä on jo CRN**: benchmarkissa sama tila → bitilleen sama `exp`-polku ja sama onnistumis-%.
- **Viuhka:** nykyinen haarukka (`opt`/`pess`) on **analyyttinen** ±z·σ·√t (BAND_Z, app.js:11 ja 566–574), **ei** MC-pohjainen. V0.3:n "poista erillinen analyyttinen haarukka" pitää siis paikkansa: MC-persentiiliviuhka on uusi ominaisuus, ei korjaus.
- **`simulate`-ytimen puhtaus:** ei DOM-viittauksia, ottaa tilan parametrina (`computeGhost` kutsuu jo mielivaltaisella kopiolla). **Yksi sivuvaikutus:** `retire.age = retireAge` (app.js:506) mutatoi syötetilaa goal:'age'-tilassa. Bisektioevaluoinnin pitää ajaa työkopiolla ja goal pakotettuna manuaaliksi.

---

## 2. simulateCore-eriytys

**Eriytystä ei kannata tehdä suunnitelman kuvaamassa muodossa.** `simulate(st)` on jo ajettavissa
mielivaltaisilla parametreilla ilman DOM:ia. Puuttuu kaksi asiaa:

1. **Kevyt tila.** `simulate()` ajaa aina koko putken: tavoiteratkaisijat + `mcSuccess` (300 polkua).
   Tarvitaan optiot tyyliin `simulate(st, { light: true, paths: N })`: light ohittaa MC:n ja
   **jäädyttää ratkaistut arvot** (goal-tilat) raahauksen ajaksi. Ilman tätä periaate 5
   ("deterministinen per frame") ei toteudu.
2. **prepare/runPath-jako bisektiota varten.** Esikäsittely (lump/payments/debt/growth, app.js:238–341)
   ei riipu kuukausisäästöstä eikä nostotasosta → se lasketaan kerran raahauksen alussa ja bisektio
   ajaa vain `runPath`ia (app.js:361, jo olemassa closurena). Pienin diffi: nosta `runPath`+`buildMu`
   ulos parametrisoituna, `simulate()` jää ohueksi kuoreksi. Työmäärä ~4–8 h, riski pieni
   (mekaaninen siirto; regressiot näkyisivät heti lukuina).

Erillistä "simulateCore-moduulia" tai laskennan duplikaatiota ei tarvita — periaate 4 säilyy.

---

## 3. Konfliktikartta

- **Crosshair/scrub:** overlay-rect (app.js:749–756) hoitaa pointermove→`updateCrosshair`, ja
  `draggingId`-vahti (751) hiljentää sen raahauksen ajaksi. Valintamallin osumakerrokset voi lisätä
  overlayn ja markereiden väliin — SVG:ssä osumaprioriteetti = dokumenttijärjestys, ja markerit
  lisätään jo overlayn jälkeen. Suunnitelman prioriteetti (tapahtumat > eläkeviiva > pisteet >
  segmentit) toteutuu lisäysjärjestyksellä. **Ei vaadi renderChartin uudelleenkirjoitusta.**
- **`renderChart` rakentaa koko SVG:n uusiksi joka framella** (`svg.innerHTML = ''`, app.js:657).
  Valinnan korostus pitää palauttaa id:n perusteella joka renderillä — sama malli kuin
  `openPopoverId` (app.js:780) jo tekee. Toimii; 60 fps -kriteerin riski on DOM-puolella (ks. riskit).
- **Isoin löydös:** `renderChart` kutsuu joka framella `simulate()` (MC 300 ≈ 21 ms) **ja**
  `computeGhost()` → toinen täysi simulate deep-copyineen (yht. ≈ 35 ms/frame benchmarkissa).
  Jos suunnitelmassa on varmuustaso-tavoite, yksi frame maksaa **190–280 ms jo nyt** (FIRE/Kiri-esimerkit).
  Nykyinen tapahtumaraahaus ei siis ole 60 fps tälläkään hetkellä goal-suunnitelmissa.
  → `ghostSim` pitää välimuistittaa (baseline ei muutu raahatessa) ja raahausframet ajaa light-tilassa.
  Tämä kannattaa korjata **ennen** V1:tä — hyödyttää nykysovellusta heti.
- **`startMarkerDrag`:** dokumenttitason move/up-kuuntelijat, ikä-snap, popover-avaus napautuksesta
  (app.js:1029). Toimii fs-layoutissa sellaisenaan (koordinaatit `getBoundingClientRect`ista,
  ResizeObserver app.js:2876 hoitaa skaalat). V2:n "napautus valitsee" **muuttaa** nykyisen
  "napautus avaa popoverin" -käytöksen piirtotilassa — tietoinen UX-ero, normaalitila ennallaan.
- **Esc:** globaali käsittelijä (app.js:1574–1584) sulkee kaiken kerralla. Piirtotilan kerroksellinen
  Esc (dragging→selected→idle→ulos) vaatii että fs-tilassa tämä käsittelijä väistää. Pieni muutos.
- **Undo:** raahaus committoituu jo nyt yhtenä askeleena (scheduleRender ei tallenna; `renderAll`→
  `saveState`→`pushUndoDebounced` vasta pointerupissa). Suunnitelman malli istuu suoraan. ✔
- **`history.pushState`:** repossa ei ole popstate-kuuntelijaa; `loadState` ja `#yhteenveto` käyttävät
  `replaceState`a — ei törmäystä, puhdas lisäys.
- **Jakolinkki on jo hash-fragmentissa** (`#s=`, app.js:2504, 2532) — V3.4:n vaatimus toteutuu jo.
- **CSS:** `touch-action: none` vain `.marker`illa (style.css:535); `dvh`/`safe-area` ei käytössä
  missään → V1-layout on puhdasta uutta CSS:ää, ei ristiriitoja.

---

## 4. Benchmark (Node v24, oletussuunnitelma 30→90 v = 720 kk; mediaani)

| Skenaario | ms |
|---|---|
| Kevyt frame: simulate ilman MC:tä (odotuspolku + esikäsittely) | **0,5** |
| Bisektio-proxy: 24 polkuevaluointia | **2,1** |
| Nykyinen: simulate + MC 300 | 21 |
| Nykyinen render-frame: sim + ghost (2 × MC 300) | 35 |
| simulate + MC 1000 | 53 |
| simulate + MC 5000 | **316** |
| FIRE (goal:age, conf 85 %): MC 300 / MC 5000 | 193 / **3 254** |
| Kiri (goal:saving, conf 85 %): MC 300 / MC 5000 | 280 / **4 831** |

Johtopäätökset:

- **Pointermove-budjetti < 2 ms on realistinen**, kunhan esikäsittely tehdään kerran raahauksen alussa:
  24 × runPath ≈ 2 ms jopa ilman jakoa; jaon kanssa reilusti alle. (Huom: budjetti koskee laskentaa —
  SVG-rebuildin kustannus mitattava selaimessa erikseen.)
- **MC 5000 ei mahdu 150 ms:iin päälangassa** (316 ms työpöydällä; puhelimella arviolta 1–3 s).
  Suunnitelman "siirrä workeriin jos ylittyy" laukeaa varmasti → worker kannattaa ottaa V0-vaatimukseksi,
  tai pudottaa tavoite ~1000–2000 polkuun (53–120 ms).
- **HUD ≤ 500 ms irrotuksesta:** 200 ms debounce + 316 ms = 516 ms — ylittyy työpöydälläkin 5000 polulla.
  Toteutuu 1000–2000 polulla tai workerilla.
- **V3:n "Ratkaise varmuustasolla < 3 s" ei toteudu** 5000 polulla (3,3–4,8 s työpöydällä, puhelimella
  moninkertainen). Lievennys: karkea→tarkka-bisektio (haarukointi 500–1000 polulla, lopputarkistus
  täydellä määrällä workerissa) — silloin < 3 s on saavutettavissa.
- **Determinismi (V0-hyväksyntä) toteutuu jo:** sama tila → bitilleen sama polku ja sama onnistumis-%.
- **Muisti:** polkujen tallennus P10/P90-viuhkaa varten: 5000 × 721 × 8 t ≈ 28 Mt (Float32: 14 Mt).
  Vaihtoehto: persentiilit harvennetulla kk-ruudukolla tai pienemmällä polkujoukolla.

---

## 5. Hyväksymiskriteerit

Merkinnät: ✅ toteutuu nykyrakenteella · 🔧 vaatii refaktoroinnin · ⚠ riski.

**V0** — "sama seed → bitilleen sama": ✅ (toteutuu jo; testi puuttuu). 5000 polkua < 150 ms: ⚠ (vaatii workerin tai pienemmän määrän). Yhtenäinen malli: 🔧 (viuhka analyyttinen → MC-persentiilit uutta työtä + muistikysymys).

**V1** — Laajenna/palauta ilman tilan katoamista: ✅ (CSS-luokka + ResizeObserver hoitavat). Esc/X/back + scroll-lukko + safe-area: 🔧 (uutta koodia, ei ristiriitoja; iOS-testaus käsin). HUD 3 lukua + deltat: ✅ (`renderCompare`-delta-logiikka app.js:1717 uudelleenkäytettävissä); onnistumis-% ≤ 500 ms: ⚠ 5000 polulla, ✅ ≤ 2000 polulla. Nykyinen tapahtumaraahaus muuttumattomana: ✅.

**V2** — Kohteet valittavissa/raahattavissa, ≤ 1 px: 🔧 (bisektio tarkka; huom. kriteeri on ristiriidassa snapin kanssa — snap-askel siirtää käyrää portaittain, "1 px" voi koskea vain ratkaisua ennen kvantisointia). Näppäimistö + aria-live: 🔧 (uutta; pohja hyvä, `role="application"` ei vielä käytössä). 60 fps ilman MC:tä: 🔧 laskenta ✅, SVG-täysrebuild ⚠ mobiilissa — mitattava. Rajoitteet + chippi + vibrate: 🔧 suoraviivainen. Ctrl+Z yhtenä askeleena: ✅. Scrub/tapahtumaraahaus ei regressiota: ✅ (kunhan valinta lisätään kerroksina).

**V3** — Piste + vajeet + persentiili: 🔧 (persentiili vaatii polkujen talletuksen). Ratkaise conf-moodissa < 3 s: ⚠ (ks. benchmark; karkea→tarkka pakollinen). Useampi piste, tiukin sitoo: ✅ (monotonisuus pätee). Jakolinkki + localStorage: ✅ (serialize/applySaved-laajennus, hash jo kunnossa). Anonyymi jako: 🔧 (whitelist app.js:129 + palvelin/server.js -skeema + esikatselu).

**V4** — Ensivierailuflow: ✅ (ONBOARD_KEY/localStorage-malli on jo). SEO: ✅ (CSS-kerros). Jakolinkki→piirtotila: ✅. og/demo/domain: sisältötyötä; CNAME-migraatiossa muista myös `sw.js`-cachen versiobumppi ja `manifest.webmanifest` start_url/scope (suunnitelmasta puuttui sw-maininta).

---

## 6. Työmääräarvio ja PR-jako

| PR | Sisältö | Arvio |
|---|---|---|
| PR0 "pikavoitot" | ghostSim-välimuisti; N_MC parametriksi; determinismin yksikkötesti | 3–5 h |
| PR1 = V0 | light-tila + prepare/runPath-jako; MC workeriin; persentiiliviuhka; polkumääräpäätös | 12–20 h |
| PR2 = V1 | fs-layout, poistumisreitit (Esc/X/back), scroll-lukko, HUD + deltat, haamu-capture | 8–14 h |
| PR3 = V2a | valintatilakone, osumakerrokset, kertymäsegmentti + bisektio, chippi, snap, rajoitteet | 14–22 h |
| PR4 = V2b | loput kohteet (nosto, loppupiste, eläkeviiva), näppäimistö, aria-live, affordanssi | 8–14 h |
| PR5 = V3 | tavoitepisteet, mittarit, Ratkaise-moodit, jako + palvelinskeema | 12–20 h |
| PR6 = V4 | ensikäyttöflow, copy, og/demolooppi, domain-migraatio | 6–10 h |

Yhteensä ≈ **65–105 h**. V2 on suunnitelmassakin tunnistettu painopiste (~40 % työstä) — siksi jako kahteen PR:ään.

---

## 7. Top 5 riskiä

1. **Mobiilisuorituskyky, MC 5000.** Työpöydällä 316 ms → puhelimella 1–3 s; HUD-lupaus pettää.
   *Lievennys:* Web Worker + progressiivinen MC (300 heti, tarkennus taustalla) tai polkumäärä 1000–2000.
2. **"Ratkaise varmuustasolla" -kesto.** 3,3–4,8 s työpöydällä = luultavasti 10 s+ puhelimella.
   *Lievennys:* karkea→tarkka-bisektio + worker + progress; hyväksymiskriteeri uusiksi jos ei riitä.
3. **SVG-täysrebuild 60 fps:ssä mobiilissa.** Laskenta mahtuu budjettiin, DOM-churn ei ehkä.
   *Lievennys:* mittaa Playwrightilla/laitteella heti V1:ssä; tarvittaessa attribuuttipäivityspolku
   raahatuille elementeille (ei koko graafin uudelleenkirjoitusta).
4. **Goal-tilat × raahaus.** Jos suunnitelmassa on aktiivinen ratkaisin (esim. kestävä tulo), raahauksen
   semantiikka on määrittelemättä: mitä HUD näyttää kun ratkaistu arvo on jäädytetty? Lisäksi
   `simulate` mutatoi `retire.age`a (app.js:506). *Lievennys:* light-tila jäädyttää ratkaisut, re-solve
   irrotettaessa; evaluoinnit aina työkopiolla; UX-sääntö kirjataan ennen V2:ta.
5. **V0.1:n seedausmuotoilu rikkoisi CRN:n.** "Seed per istunto tai suunnitelma-id" tarkoittaisi, että
   suunnitelman muokkaus (tai uusi istunto) vaihtaa satunnaisuuden → viuhka väpättää juuri niin kuin
   yritetään estää. *Lievennys:* pidä nykyiset kiinteät vakiosiemenet (1337 + i·7919) — ne ovat jo oikea ratkaisu.

---

## 8. Vastaehdotukset (olemassa olevan laajentaminen uuden sijaan)

1. **Hylkää shokkimatriisi (V0.1).** Polkukohtainen seedattu generointi lennossa on jo käytössä ja on
   suunnitelman oma fallback. 34 Mt:n matriisi ei tuo mitään lisää; determinismitesti riittää.
2. **Tavoitepisteet tapahtumatyyppinä.** Lisää `EVENT_TYPES.goal` (🎯, ei kassavirtavaikutusta,
   ohitus simulaattorin tapahtumasilmukoissa) sen sijaan että rakennetaan rinnakkainen "pisteet"-
   järjestelmä. Saat ilmaiseksi: paletin, raahauksen, markerit, popoverin, listan, serialize/applySaved-
   validoinnin, jakolinkin, undon ja monistuksen. Donation-whitelistiin ja palvelinskeemaan eksplisiittinen lisäys.
3. **Ei uutta laskentamoduulia** — `simulate(st, opts)` + sisäinen prepare/runPath-jako (luku 2).
   `buildMu`/`runPath` ovat jo oikean muotoiset, ne pitää vain nostaa ulos closuresta.
4. **HUD-deltat `renderCompare`-logiikasta** (app.js:1705–1742): sama add()-deltamalli, eri kohde-DOM.
5. **Chippi = kevennetty popover-malli:** transform-siirretty div `chartWrap`in sisällä, kuten
   `tooltip`/`popover` jo ovat — ei uutta kerrosarkkitehtuuria.
6. **PR0 ennen kaikkea muuta:** ghostSim-välimuistitus poistaa ~40 % nykyisen raahausframen kustannuksesta
   yhdellä muutoksella ja parantaa nykytuotetta ilman piirtotilaakin.

---

## Poikkeamat suunnitelman väitteistä (luvun 1 periaatteiden mukaan kirjattuna)

- "Viuhka ei väpätä säätöjen välillä" -perustelu (V0.1): nykyinen viuhka on deterministinen analyyttinen
  kaava eikä väpätä nytkään; CRN-hyöty koskee vasta tulevaa MC-viuhkaa ja onnistumis-%:a — joka sekin on jo CRN-deterministinen.
- "840 kk" (V0.2): oletussuunnitelma on 720 kk (30→90 v); teoreettinen maksimi ageEnd 105 v.
- V2-kriteerin "tartuntapiste ≤ 1 px snap-pisteissä" sanamuoto on ristiriitainen snapin kanssa — esitys:
  "ratkaistu arvo ennen snap-kvantisointia seuraa osoitinta ≤ 1 px".
