# Testit

## Koko patteristo yhdellä komennolla

```bash
node testit/aja-kaikki.js           # yksikkötestit + kaikki selaintestit
node testit/aja-kaikki.js tulkki    # vain skriptit joiden nimessä on "tulkki"
```

Ajuri etsii Playwright-asennuksen automaattisesti (NODE_PATH tai
Claude-scratchpadit), käynnistää yhteisen palvelimen porttiin 8123 ja ajaa
skriptit peräkkäin. Aja tämä ennen jokaista pushia. Golden-evalit eivät
sisälly (maksavat) — ne ajetaan erikseen kehotemuutosten yhteydessä.

## Yksikkötestit (ei riippuvuuksia)

```bash
node testit/laskenta.test.js
node testit/tulkki-proxy.test.js   # Tulkki-välitys mock-upstreamia vasten (ei oikeita API-kutsuja)
node testit/mcp.test.js            # MCP-paketin työkalut kultaisin luvuin
```

Kattaa: CRN-determinismi (sama seed → bitilleen sama tulos), bisektion
monotonisuus ja osuvuus, runPathin stopAt, tavoitepisteiden tiukin-sitoo,
kevyen raahausframen jäädytys, varmuustasoratkaisu, snap/karkeistusapurit.

## Tulkin golden-evalit (oikea malli, maksaa senttejä)

```bash
ANTHROPIC_API_KEY=sk-... node testit/evalit.js            # koko setti (~10 tapausta, muutama sentti)
ANTHROPIC_API_KEY=sk-... node testit/evalit.js muutos-elakeika   # yksi tapaus nimellä
```

Mitä tämä on: `evalit-golden.json` sisältää oikeita käyttötilanteita
(kysymys + konteksti) ja niiden **odotteet** — kutsuiko mallin vastaus oikeaa
työkalua oikeilla kentillä, pysyivätkö luvut kontekstissa (numerokuri),
pysyikö neuvontakielto (ei tuotesuosituksia, ei injektiolle periksi).
Ajuri käynnistää oikean palvelinkoodin (sama kehote ja työkaluskeema kuin
tuotannossa) ja raportoi ✓/✗ + tokenit + kustannusarvion.

**Milloin ajetaan:** aina ennen kehotemuutoksen puskemista ja mallin-
vaihdon jälkeen. **Mistä uudet tapaukset tulevat:** käyttöliittymän
👎-palaute avainkäytössä tallentaa vaihdon paikalliseen evallistaan
(Kopioi evalit -nappi) — poimi sieltä epäonnistunut vastaus ja kirjaa
golden-settiin odote, joka olisi tehnyt siitä hyvän.

## Selaintestit (Playwright)

Asenna Playwright erilliseen työkansioon (ei tähän repoon — repo pysyy
riippuvuudettomana) ja aja palvelin + smoket:

```bash
npm i playwright && npx playwright install chromium
node testit/selain/serve.js          # tarjoilee repon portissa 8123
node testit/selain/smoke-v1.js       # piirtopöytä auki/kiinni, HUD, worker
node testit/selain/smoke-v2.js       # valintamalli, bisektioraahaus, näppäimistö
node testit/selain/smoke-v3.js       # tavoitepisteet, Ratkaise, jako-roundtrip
node testit/selain/smoke-v4.js       # ensivierailu, jakolinkki→piirtopöytä, copy
node testit/selain/smoke-mobile-perf.js  # 390 px -näkymät + raahauksen fps
node testit/selain/smoke-pro.js      # Pro-tila: vipu, säädöt, analyysit, roundtrip
node testit/selain/smoke-family.js   # Perhevirta: puoliso, yhteiskäyrä, apuri
node testit/selain/smoke-acct.js     # sijoitustilit (kuoret) ja kulukentät
node testit/selain/smoke-compare.js  # vertailupilleri, korttideltat, tooltip
```

Lisäksi `verify-*.js` = ominaisuuskohtaiset regressiosarjat (ramppi, Tulkki,
profiilit, omistukset, teema, tilastot, porrastettu säästö, validointisivut,
tuloskuva…). Ne noudattavat samoja konventioita; osa käynnistää oman
palvelimensa eri porttiin (8131–8133) tai spawnaa serve.js:n itse, joten ne
toimivat sekä yksin että aja-kaikki-ajurin alla. Tulkki-testit mockaavat
verkon — oikeita API-kutsuja ei tehdä.

Generaattorit ja kertaluonteiset työkalut ovat [../tyokalut/](../tyokalut/)-kansiossa
(og-gen, demo-gen, demo-some, audit, validointi-luvut) — ne eivät ole testejä
eikä aja-kaikki aja niitä.

Sudenkuopat: fi-FI käyttää NBSP-tuhaterottimia (normalisoi ennen vertailua),
checkbox-inputit ovat visuaalisesti piilotettuja (klikkaa labelin kytkintä),
ja tyhjä localStorage avaa aloitusrampin 600 ms:n viiveellä — testit asettavat
`vp-autotour-off=1` (hiljentää sekä rampin että esittelykierroksen) heti
localStorage.clearin perään.
