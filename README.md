# Varallisuuspolku

Visuaalinen varallisuussuunnittelutyökalu — suunnittele koko elinkaaresi sijoittaminen yhdellä näkymällä.

![Teema](https://img.shields.io/badge/teema-tumma-0a0e1a) ![Riippuvuudet](https://img.shields.io/badge/riippuvuudet-ei%20yht%C3%A4%C3%A4n-2dd4bf) ![Lisenssi](https://img.shields.io/badge/lisenssi-MIT-8b7cf6)

Kaikki laskenta ja data pysyy selaimessa — ei palvelinta, ei evästeitä, ei analytiikkaa.

## Ominaisuudet

- **Interaktiivinen aikajana** — varallisuuden kehitys iän ja kalenterivuoden mukaan, odotettu kehitys ja epävarmuushaarukka (±σ·√t)
- **Raahattavat elämäntapahtumat** — asunnon osto, opiskelu, auto, häät, lapsi, remontti, mökki, perintö, eläkkeelle jäänti ym. pudotetaan graafille ja siirretään haluttuun ikään
- **Allokointimoottori** — osake/korko/käteinen-painot, tuotto-odotus ja volatiliteetti, valinnainen ikäsidonnainen allokaatio (glidepath) ja inflaatiokorjaus
- **Palkkakehitys** — kuukausisijoitus voi kasvaa vuosittain, mikä vastaa uran tuomia korotuksia
- **Velkarahoitus** — annuiteettilainat korkoineen: käsiraha, maksuerät ja velkasaldo; työuralla erät vähentävät säästökykyä, eläkkeellä ne maksetaan sijoituksista
- **Toistuvat erät** — kuukausivaikutus tietyn ajan (esim. lapsen kulut 18 v tai vuokratulo); työuralla vähentää säästöä, eläkkeellä kasvattaa tulotarvetta
- **Omaisuuserät** — asunto ym. kirjautuu varallisuudeksi omalla arvonmuutoksellaan; lyhennykset siirtävät velkaa omaisuudeksi
- **Omaisuuden myynti** — kohteen voi myydä valitussa iässä: arvo siirtyy sijoituksiin, laina maksetaan pois ja voitosta peritään vero (hankintameno-olettama; oma asunto voi olla verovapaa)
- **Tase-paneeli** — varallisuus pylväinä nollaviivan yläpuolella, velka alapuolella, nettovarallisuus käyränä; yhteinen kohdistin pääkäyrän kanssa
- **Varallisuusjakauma** — donitsikaavio omaisuusluokittain (osakkeet, korot, käteinen, kiinteistöt, ajoneuvot), seuraa kohdistinta
- **Lakisääteinen työeläke** — eläketuloksi arvioitu kuukausieläke, joka pienentää sijoituksista tarvittavaa nostoa ja voi alkaa eri iässä kuin eläkkeelle jäänti
- **Myyntivoittovero** — eläkeajan nostoista huomioidaan Suomen pääomatulovero (30/34 %) noston voitto-osuudesta; seuraa salkun hankintahintaa
- **Eläkesuunnittelu tavoitteella** — valitse mikä joustaa: kestävä kuukausitulo (ikä lukittu), aikaisin eläkeikä (tulo lukittu) tai tarvittava kuukausisäästö (ikä ja tulo lukittu) ratkaistaan automaattisesti
- **Varmuustaso** — tavoitteen voi ratkaista myös Monte Carlo -onnistumisosuudelle (75/85/95 % poluista onnistuu) pelkän odotetun kehityksen sijaan
- **Monte Carlo** — onnistumistodennäköisyys 300 satunnaisesta markkinapolusta; ehtyneet jaksot piirtyvät graafille varoitusvyöhykkeinä
- **Skenaarioiden vertailu** — tallenna nykyinen suunnitelma vertailukohdaksi; haamukäyrä ja erotunnusluvut näyttävät muutosten vaikutuksen
- **Vuositaulukko ja CSV** — vuosikohtaiset luvut (säästöt, nostot, verot, työeläke, tase) taulukkona ja ladattavana CSV:nä
- **Esimerkkisuunnitelmat** — valmiit pohjat eri elämäntilanteisiin yhdellä klikkauksella
- **Kumoa** — Ctrl+Z peruu muutokset; tapahtumat voi myös monistaa
- **Tallennus ja jakaminen** — suunnitelma tallentuu selaimeen automaattisesti, jaettava linkki kopioi koko suunnitelman URL:iin
- **PWA / offline** — asennettava sovellus, joka toimii myös ilman verkkoyhteyttä
- **Tulostettava yhteenveto** — tavoitedokumentti suunnitelman kulmakivistä ja keskustelunaiheista, minä-muodossa esim. varainhoitajalle annettavaksi; ei sijoitusneuvontaa

## Käynnistys

Puhdas HTML/CSS/JS — ei buildia, ei riippuvuuksia. Käynnistä kevyt palvelin:

```bash
npx serve .
```

## Julkaisu

Staattinen sivusto: julkaisuun riittää tiedostojen kopiointi mille tahansa web-palvelimelle
(GitHub Pages, Netlify, Cloudflare Pages…). GitHub Pages -julkaisu:

```bash
gh auth login
./julkaise.ps1   # luo repon, pushaa ja kytkee Pagesin
```

## Huomio

Laskelma on suuntaa antava havainnollistus, ei sijoitussuositus.
