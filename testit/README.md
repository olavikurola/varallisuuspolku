# Testit

## Yksikkötestit (ei riippuvuuksia)

```bash
node testit/laskenta.test.js
node testit/tulkki-proxy.test.js   # Tulkki-välitys mock-upstreamia vasten (ei oikeita API-kutsuja)
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
```

Sudenkuopat: fi-FI käyttää NBSP-tuhaterottimia (normalisoi ennen vertailua),
checkbox-inputit ovat visuaalisesti piilotettuja (klikkaa labelin kytkintä),
ja ensivierailu avaa piirtopöydän automaattisesti (testit poistuvat Escillä).
