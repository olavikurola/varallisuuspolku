# Ylläpito-ohje (stewardship)

Tämä dokumentti kertoo, miten Varallisuuspolku pidetään käynnissä ja terveenä —
myös sellaiselle ylläpitäjälle, joka ei ole rakentanut sitä. Suunnittelu- ja
taustadokumentit: [PRO.md](PRO.md), [PERHE.md](PERHE.md),
[OMISTUKSET.md](OMISTUKSET.md), [MCP.md](MCP.md), [ARVIO.md](ARVIO.md).

## Arkkitehtuuri pähkinänkuoressa

- **Sivusto**: staattinen, ei buildia, ei riippuvuuksia. Julkaisu = `git push`
  → GitHub Pages päivittyy ~30 s (repo `olavikurola/varallisuuspolku`,
  osoite https://varallisuuspolku.com CNAME-tiedostolla).
- **Skriptit ovat classic-skriptejä jotka jakavat globaalin skoopin** —
  latausjärjestys [index.html](index.html):ssä on sitova:
  laskenta → apu → kaavio → piirtopoyta → kortit → laajennukset → sovellus → tulkki.
- **laskenta.js** on DOM-vapaa moottori: sama tiedosto ajaa sivun, mc-workerin,
  Node-testit ja MCP-paketin. Kaikki luvut tulevat moottorista — AI ei laske.
- **palvelin/** = riippuvuudeton Node-palvelin Railwayssa (vertailudata +
  Tulkki-proxy). Deployautuu automaattisesti git pushista.
- **mcp/** = npm-paketti `varallisuuspolku-mcp` (paikallinen stdio-MCP).
  Julkaisu vaatii Olavin terminaalin (npm 2FA): `cd mcp && npm publish`.
- Data selaimessa (localStorage), palvelimelle lähtee vain käyttäjän erikseen
  hyväksymä whitelist-muotoinen vertailudata. Tämä on tietosuojalupaus — älä riko.

## Julkaisurutiini

1. Aja koko patteristo: `node testit/aja-kaikki.js` (ks. [testit/README.md](testit/README.md)).
2. Jos muutit Tulkin kehotetta tai työkaluskeemaa: aja golden-evalit
   (`ANTHROPIC_API_KEY=... node testit/evalit.js`) ennen pushia.
3. Jos muutit laskenta.js:ää tai muita sovellusskriptejä: **bumppaa SW-cache**
   ([sw.js](sw.js) `CACHE`-vakio) — offline-asennuksen skriptipari pysyy eheänä.
   Uusi sivuston tiedosto lisätään myös sw.js:n CORE-listaan.
4. Isot julkaisut: päivitä [llms.txt](llms.txt) (GEO-faktatiedosto),
   sitemap-lastmod ja tarvittaessa Tietoa-UKK (JSON-LD-FAQ:n pitää peilata
   näkyvää sisältöä 1:1).
5. `git push` → verifioi tuotanto (etusivu 200, tarvittaessa Railway-reitit).

## Vuosihuolto (vähintään kerran vuodessa, verovuoden vaihtuessa)

1. **Veroparametrit**: [laskenta.js](laskenta.js) alku — `TAX_LOW`/`TAX_HIGH`/
  `TAX_BRACKET`, hankintameno-olettama, osinkojen veronalainen osuus.
   Tarkista myös lakisääteisen eläkeiän rajat ja tuotto-oletukset (`ASSETS`).
2. **Validointisivu**: jos parametrit tai oletukset muuttuivat, laske sivun
   luvut uudelleen moottorilla (`node tyokalut/validointi-luvut.js`) ja päivitä
   [validointi.html](validointi.html):n esimerkit, "verovuoden N parametrit"
   -maininta ja "Tarkistettu"-päiväys muutosmerkintöineen.
3. **Esimerkkipersoonat**: jos moottorin käytös muuttui, tarkista EXAMPLES-
   personien onnistumis-%:t ja kalibroi luvut uskottaviksi.
4. **og.png / demolooppi**: jos ulkoasu on muuttunut, generoi uudelleen
   (`tyokalut/og-gen.js`, `tyokalut/demo-gen.js`, `tyokalut/demo-some.js` —
   vaativat serve.js:n portissa 8123 ja Playwrightin; lavastusluvut valitaan
   niin ettei HUD näytä heikkoa onnistumista).
5. **Golden-evalit** ajoon kerran — mallipäivitykset voivat muuttaa Tulkin käytöstä.

## Ympäristöt ja tilit (kaikki Olavin)

| Mikä | Missä | Huomiot |
|---|---|---|
| Sivusto | GitHub Pages | push = julkaisu; CNAME + https_enforced |
| Domain | Namecheap | varallisuuspolku.com; apex 4×A + www-CNAME; info@-forward → iCloud |
| Palvelin | Railway (Hobby) | root dir `palvelin`, volume `/data`, PORT=8080; envit: `ANTHROPIC_API_KEY` (spend limit ~50 €/kk!), `TULKKI_KEYS`, `TULKKI_PUBLIC`, `TULKKI_DAILY_MAX`, `TULKKI_MODEL` |
| MCP-paketti | npmjs (olkurola) | publish vaatii 2FA:n Olavin terminaalissa |
| Analytiikka | Plausible | custom goalit + propertyt 'tyyppi'/'mode' lisätään käsin hallintaan |
| Haku | GSC + Bing | sitemap lähetetty; jatkotoimet hakusanadatan pohjalta |

Kustannuskatot: Tulkin julkinen taso on kolminkertaisesti rajattu (5/selain/pv,
10/IP/pv, 300/pv globaali) — kova maksimi ~2 €/pv. Railway Hobby ~5 $/kk.

## Periaatteet joita ei rikota

- **Ei sijoitusneuvontaa** — palvelu näyttää ja selittää, ei suosittele tuotteita.
  Tulkin työkalut eivät rakenteellisesti voi suositella; älä lisää sellaista.
- **AI ei tuota lukuja** — kaikki luvut moottorista (lukusidonnat, tool use).
- **Ei uusia pilviriippuvuuksia eikä ulkoisia verkkopyyntöjä** sivustolle
  (fontit self-hostattu; nolla pyyntöä ilman käyttäjän erillistä lupaa).
- **Vertailudata**: whitelist-serialisointi molemmissa päissä, k-anonymiteetti
  30/ryhmä, ei tunnisteita, `ev.name` ei saa koskaan vuotaa.
- **Ei palvelinlokia** käyttäjien sisällöistä (GDPR-minimointi on ominaisuus).
- Taaksepäinyhteensopivuus: vanhat jakolinkit ja tallenteet eivät saa hajota —
  puuttuva kenttä = entinen käytös (testit vartioivat useita identiteettejä
  bitilleen).

## Jos ylläpito siirtyy

Uudelle ylläpitäjälle riittää: GitHub-repo (sisältää kaiken; ei salaisuuksia),
Railway-projektin siirto (envit yllä), domainin siirto, npm-paketin omistajuus
ja Plausible-tili. Testipatteristo (`node testit/aja-kaikki.js`) + validointisivu
todistavat laskennan eheyden ilman rakentajan hiljaista tietoa.
