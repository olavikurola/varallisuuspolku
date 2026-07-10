# Testit

## Yksikkötestit (ei riippuvuuksia)

```bash
node testit/laskenta.test.js
```

Kattaa: CRN-determinismi (sama seed → bitilleen sama tulos), bisektion
monotonisuus ja osuvuus, runPathin stopAt, tavoitepisteiden tiukin-sitoo,
kevyen raahausframen jäädytys, varmuustasoratkaisu, snap/karkeistusapurit.

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
```

Sudenkuopat: fi-FI käyttää NBSP-tuhaterottimia (normalisoi ennen vertailua),
checkbox-inputit ovat visuaalisesti piilotettuja (klikkaa labelin kytkintä),
ja ensivierailu avaa piirtopöydän automaattisesti (testit poistuvat Escillä).
