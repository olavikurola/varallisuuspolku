# Varallisuuspolku · Wealth Path

Visuaalinen varallisuussuunnittelutyökalu — suunnittele koko elinkaaresi sijoittaminen yhdellä näkymällä.
**Sinä vedät, kone laskee:** kokoruudun piirtopöydällä tartut suoraan elinkaarikäyrään, tapahtumiin ja
eläkeikäviivaan — käänteisratkaisija hakee jokaisen vedon hinnan (säästö, kuukausitulo, eläkeikä) heti.

![Teema](https://img.shields.io/badge/teema-tumma-0a0e1a) ![Riippuvuudet](https://img.shields.io/badge/riippuvuudet-ei%20yht%C3%A4%C3%A4n-2dd4bf) ![Lisenssi](https://img.shields.io/badge/lisenssi-MIT-8b7cf6)

Kaikki laskenta ja data pysyy selaimessa — ei evästeitä, ei analytiikkaa. Mitään ei lähetetä
mihinkään ilman erillistä lupaa; ainoa poikkeus on vapaaehtoinen anonyymi vertailudata, jonka
sisällön näkee kokonaisuudessaan ennen jakamista.

![Piirtopöytä: vedä käyrää — kone laskee vedon hinnan](demo.gif)

*Vedä eläkepäiviä lähemmäs. Näe hinta.* — sama klippi videona: [demo.mp4](demo.mp4)

## Ominaisuudet

- **Piirtopöytä** — kokoruudun piirtotila (⛶ tai F): valitse käyrän segmentti, tapahtuma, eläkeikäviiva tai tavoitepiste ja raahaa; chippi näyttää muuttuvan parametrin (vanha → uusi, delta) ja HUD seuraukset haamukäyrää vasten. Toimii myös pelkällä näppäimistöllä (Tab kiertää, nuolet säätävät, Enter muokkaa)
- **Käänteisratkaisija** — käyrä on kuin naru: tartuntapiste seuraa osoitinta ja bisektio hakee kuukausisäästön tai kuukausitulon, jolla odotuspolku kulkee pisteen kautta — deterministisesti joka framella
- **Tavoitepisteet** — 🎯 mittari graafille: pystyvaje ("iässä 55 puuttuu 80 000 €"), saavutusikä ja osuus markkinapoluista, jotka ylittävät pisteen; Ratkaise hakee säästön odotuspolulle tai valitulle varmuustasolle — tiukin piste sitoo
- **Interaktiivinen aikajana** — varallisuuden kehitys iän ja kalenterivuoden mukaan, odotettu kehitys ja P10–P90-viuhka samasta Monte Carlo -polkujoukosta
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
- **Monte Carlo** — onnistumistodennäköisyys ja viuhka jopa 5 000 satunnaisesta markkinapolusta (Web Worker taustalla, 300 polun välitön esikatselu); kiinteät polkukohtaiset siemenet (CRN) — sama suunnitelma antaa aina saman tuloksen eikä viuhka väpätä säätöjen välillä; ehtyneet jaksot piirtyvät varoitusvyöhykkeinä
- **Skenaarioiden vertailu** — tallenna nykyinen suunnitelma vertailukohdaksi; haamukäyrä ja erotunnusluvut näyttävät muutosten vaikutuksen
- **Vuositaulukko ja CSV** — vuosikohtaiset luvut (säästöt, nostot, verot, työeläke, tase) taulukkona ja ladattavana CSV:nä
- **Esimerkkisuunnitelmat** — valmiit pohjat eri elämäntilanteisiin yhdellä klikkauksella
- **Kumoa** — Ctrl+Z peruu muutokset; tapahtumat voi myös monistaa
- **Tallennus ja jakaminen** — suunnitelma tallentuu selaimeen automaattisesti, jaettava linkki kopioi koko suunnitelman URL:iin
- **PWA / offline** — asennettava sovellus, joka toimii myös ilman verkkoyhteyttä
- **Anonyymi vertailudata** — jaa halutessasi suunnitelmasi anonyymisti ja näe, miten eri ikäiset suunnittelevat talouttaan: jakaumat ikäryhmittäin (P25/mediaani/P75) ja tapahtumien yleisyys; aggregaatit avoimena datana ([palvelin/](palvelin/))
- **Vaurastumisen kartta** — avoin analytiikkasivu ([analytiikka.html](analytiikka.html)): varallisuusvyöhyke iän yli, elämäntapahtumien "elämän kartta", eläkehaaveet, riskinotto ja asuntolainatilastot — oma suunnitelma näkyy kaavioissa paikallisesti
- **Suunnitelmani-dokumentti** — tulostettava tavoitedokumentti suunnitelman kulmakivistä ja keskustelunaiheista, minä-muodossa esim. varainhoitajalle annettavaksi; ei sijoitusneuvontaa

## Show HN -otsikkoluonnos

> Show HN: Varallisuuspolku (Wealth Path) – a lifetime wealth planner where you grab the curve and it back-solves your savings rate

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
