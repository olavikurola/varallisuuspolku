# MCP-paketti — Varallisuuspolku LLM:ien deterministisenä laskimena

Linjaus hyväksytty 25.7.2026 (ks. muistio): MCP tehdään **paikallisena npm-pakettina**
(`npx varallisuuspolku-mcp`), ei hostattuna palveluna. Paikallisuus on tietosuojalupauksen
jatke (suunnitelma ei poistu koneelta agenttikäytössäkään), nollakustannus ja nolla
väärinkäyttöriskiä. Mikromaksuja EI rakenneta nyt — mutta arkkitehtuuriin jätetään sauma,
johon hostattu endpoint ja maksuportti voidaan myöhemmin pudottaa ("API-puolen setPro").

## Periaate

Sama kuin Tulkissa: **moottori on totuuden lähde, kieli on kuori.** MCP ei tuota yhtään
lukua itse — jokainen työkalu on ohut validoiva kääre `laskenta.js`:n ympärillä, joka on
jo DOM-vapaa ja Node-yhteensopiva (`module.exports` rivillä ~1225: `simulate`, `prepareSim`,
`runPath`, ratkaisijat, `STRESS_DEFS`…). CRN-siemenet (`MC_SEED = 1337 + i·7919`) tekevät
tuloksista bitilleen toistettavia: sama suunnitelma-JSON → sama vastaus joka koneella.
Tämä on myyntilause: *"deterministinen, auditoitava laskin kielimalleille"* — validointi-
sivun jatke agenttimaailmaan.

Ei-neuvonta-linja rakenteessa: työkalut laskevat ja vertailevat, eivät suosittele.
Jokaisen työkalun description ja jokaisen vastauksen häntä kantaa vakiotekstin:
"Tämä on laskentatulos, ei sijoitusneuvontaa. Oletukset: varallisuuspolku.com/validointi.html".

## Ei-tavoitteet (v1)

- **Ei hostattua endpointtia, ei maksuja, ei avaimia** — vain stdio-transport paikallisesti.
- **Ei perhetilaa** (`#f=`-linkit): `mcHousehold` on olemassa, mutta perheskeema elää vielä;
  työkalu palauttaa perhelinkeille selkeän "ei tuettu vielä" -virheen.
- **Ei tilaa**: palvelin ei tallenna mitään mihinkään (ei edes lokia — sama AUDIT-linjaus
  kuin Tulkissa). Jokainen kutsu on puhdas funktio.
- **Ei omaa laskentaa**: jos jokin metriikka puuttuu moottorista, sitä ei lasketa MCP:ssä
  vaan lisätään moottoriin (malli "moottori→UI→Tulkki→MCP").
- **Ei englanninkielistä käyttöliittymäkerrosta v1:ssä** — työkalunimet suomeksi linjauksen
  mukaan; descriptionit FI + 1 rivi EN, jotta kansainväliset mallit osaavat kutsua.

## Arkkitehtuuri

```
mcp/
  package.json        # name: varallisuuspolku-mcp, bin: {varallisuuspolku-mcp: server.js}
  server.js           # stdio JSON-RPC 2.0 -silmukka + MCP-kättely (~200 riviä)
  tyokalut.js         # työkalumääritykset + suoritus (validointi → laskenta.js → tiivistys)
  sanitoi.js          # suunnitelma-JSON:n validointi/clampit (peilaa applySavedia)
  laskenta.js         # KOPIO repojuuresta (prepack kopioi; testi vartioi tavuidenttisyyden)
  README.md           # asennus, Claude Desktop/Code -konfiguraatio, esimerkit
```

**Riippumattomuus:** EI `@modelcontextprotocol/sdk`:ta — käsin kirjoitettu stdio-JSON-RPC,
kuten `palvelin/server.js` on riippuvuudeton Node. Tarvittava protokollapinta on pieni ja
vakaa: `initialize` (protocolVersion-neuvottelu), `notifications/initialized`, `tools/list`,
`tools/call`, `ping`. Nollariippuvuus = `npx` käynnistyy sekunnissa, ei supply-chain-pintaa,
ei versiorotaatiota. Jos protokolla alkaa elää (esim. pakollinen uusi metodi), SDK:hon
siirtyminen on paikallinen muutos `server.js`:ään — työkalukerros ei huomaa mitään.

**Yksi totuus laskennasta:** `mcp/laskenta.js` on julkaisuhetken kopio repojuuren
tiedostosta (`prepack`-skripti kopioi; git-versiota EI komittoida — .gitignore).
Testi ajaa `simulate`-savukokeen suoraan repojuuren laskenta.js:llä JA paketin polulla
ja vertaa tulokset bitilleen. Paketin versioon leimataan moottorin "Tarkistettu"-päiväys
(sama jota validointi.html kantaa) → agentti voi kertoa käyttäjälle millä oletusversiolla
laskettiin (`serverInfo.version` + jokaisen vastauksen `moottori`-kenttä).

**Transport-sauma:** `tyokalut.js` ei tiedä stdiosta mitään — se vie puhtaan
`{name, description, inputSchema, run(args)}`-listan. Hostattu HTTP-endpoint (jos
laukaisimet joskus täyttyvät: npm-lataukset/tähdet/inbound) on uusi ohut kuori saman
listan ympärille TULKKI_KEYS-tyyppisellä avainportilla — maksustandardi pudotetaan
siihen kun joku voittaa standardisodan. Tätä EI rakenneta nyt.

## Syöte: suunnitelma-JSON tai jakolinkki

Kaikki työkalut hyväksyvät suunnitelman kahdessa muodossa (`suunnitelma`-parametri):

1. **Jakolinkki tai sen hash**: `https://varallisuuspolku.com#s=<base64>` tai pelkkä
   `#s=…`-osa. Purku Nodessa: `JSON.parse(Buffer.from(b64,'base64').toString('utf8'))`
   (sama utf8-polku kuin selaimen `btoa(unescape(encodeURIComponent(…)))`).
   Tämä on tärkein käyttötapa: *"liitä jakolinkkisi, agentti laskee"* — käyttäjän ei
   tarvitse ymmärtää skeemaa. `#f=`-linkki → kohtelias virhe (perhetila ei tuettu).
2. **Suora JSON-objekti**: `serialize()`-muotoinen suunnitelma (sama skeema jonka
   jakolinkki kantaa). Tämä on agenttien reitti rakentaa suunnitelmia tyhjästä.

**Validointi (`sanitoi.js`):** `applySaved` asuu app.js:ssä (DOM-sidonnainen), joten
MCP tarvitsee oman sanitoijan. V1: peilataan applySavedin numeeriset clampit ja
rakennesäännöt käsin (ageNow/ageEnd/startCapital/monthly, inflation 0–15,
savePhases-kaistat max 8 nousevaan järjestykseen, acct aot|ost|ins, feePct/wrapFee/divYield
0–10, owned-lippu vain own*-tyypeille, tuntemattomat kentät pois — sama whitelist-henki
kuin palvelimen donate-sanitoinnissa). EI moottorirefaktorointia: tuotannon
web-sovellukseen ei kosketa lainkaan. Jos sanitoijien välille syntyy ajelehtimista,
`sanitizePlan` ekstraktoidaan laskenta.js:ään myöhemmin — kirjattu jatkoihin.
Kelvoton syöte → JSON-RPC-virhe jossa lukee MIKÄ kenttä ja MIKSI (agentti osaa korjata).

## Työkalut

Kaikki palauttavat: (a) `structuredContent`-JSON koneelle, (b) lyhyt suomenkielinen
tekstitiivistelmä + disclaimer ihmiselle näytettäväksi. Euromäärät kokonaislukuina,
prosentit yhdellä desimaalilla — samat pyöristykset kuin UI:ssa, jotta agentin siteeraamat
luvut täsmäävät sivuston kanssa.

### 1. `simuloi_suunnitelma`
Syöte: `suunnitelma` (+ valinnainen `polkuja` 300–5000, oletus MC_LIVE=300; MC_FULL=5000
dokumentoidaan "tarkka mutta hitaampi").
Ajaa `simulate(st, {paths, sustainable:true})`. Palauttaa: varallisuus eläkeiässä ja
lopussa (odotuspolku `exp` + P10/P90), `successProb`, kestävä kuukausitulo
(`sustainableWd`), verot yhteensä (`taxPaid`), ehtymisikä ja -jaksot (`dryZones`,
`dryKind` floor/depleted), nettovarallisuus (`net`, jos omistuksia/velkaa — `hasNet`),
ratkaistut arvot (`solvedWithdrawal`/`solvedRetireAge`/`requiredMonthly`,
`goalUnreachable`), Pro-stressit jos suunnitelmassa on (`stress`).
Aikasarjat harvennettuna vuositasolle (sama ≤20 riviä -henki kuin Tulkin kontekstissa) —
MCP-vastaus ei saa olla 800 kk-alkion litania.

### 2. `ratkaise_elakeika`
Syöte: `suunnitelma`, `kuukausitulo` (nettotarve €/kk), valinnainen `varmuustaso`
(0.75/0.85/0.95 → MC-bisektio, muuten deterministinen).
Toteutus: kloonaa suunnitelma, aseta eläketapahtumaan `goal:'age'`, `withdrawal`,
`conf` → `simulate` ratkaisee (`solvedRetireAge`). Palauttaa iän + samat päämetriikat
kuin simuloinnissa; `goalUnreachable` → selkeä "ei saavutettavissa näillä tiedoilla".

### 3. `ratkaise_saasto`
Syöte: `suunnitelma`, `elakeika`, `kuukausitulo`, valinnainen `varmuustaso`.
Sama kuvio `goal:'saving'` → `requiredMonthly`. Huom: %-nostostrategiassa (Pro `wdMode
pct`) ratkaisijat eivät ole mielekkäitä — moottori jättää tavoitteen mittariksi; työkalu
palauttaa tästä selväsanaisen huomautuksen (sama sääntö kuin UI:ssa).

### 4. `vertaa_suunnitelmia`
Syöte: `suunnitelmat` = 2–4 kpl `{nimi, suunnitelma}` (linkki tai JSON).
Ajaa simulaation jokaiselle ja palauttaa Tulkin vertailutaulukon metriikat:
Onnistumis-% / Varat riittävät ikään / Kestävä tulo / Loppuvarallisuus / Verot —
+ paras arvo per rivi (`bestIndex`-henki, ei korostusta jos kaikki samat).
Sama lukupohjainen turvallisuus kuin Tulkin VERTAILUssa: ei muuta mitään, vain laskee.
Käyttötapa: "vertaa eläkeikiä 60 ja 65" → agentti kloonaa suunnitelman kahdesti itse
(skeematyökalu kertoo miten) ja kutsuu tätä.

### 5. `suunnitelman_skeema`
Ilman parametreja. Palauttaa suunnitelma-JSON:n kenttädokumentaation (perustiedot,
tapahtumatyypit kenttineen — myös owned-omistukset, savePhases, acct/kulut, Pro-lohko
pintapuolisesti), 2–3 esimerkkisuunnitelmaa (rampin oletus + tapahtumarikas) ja rajat.
**Tämä tekee paketista aidosti "LLM:ien laskimen"**: agentti voi rakentaa suunnitelman
keskustelusta tyhjästä ilman jakolinkkiä — sama rooli kuin Tulkin kehotteen
kenttädokumentaatiolla, mutta koneluettavana. Ilman tätä työkalusarja olisi vain
"linkkilaskin".

## Testit ja laatu

- `testit/mcp.test.js` (riippuvuudeton Node, kuten laskenta.test.js): käynnistää
  palvelimen lapsiprosessina, ajaa MCP-kättelyn ja jokaisen työkalun; **kultaiset luvut
  verrataan suoraan repojuuren laskenta.js-kutsuun** (sama syöte → identtinen tulos =
  kääre ei vääristä mitään).
- Sanitoijatestit: viallinen/vihamielinen syöte (NaN, negatiiviset, ylisuuret, tuntematon
  tapahtumatyyppi, perhelinkki, roskabase64) → siisti virhe, ei kaatumista.
- Tavuidenttisyystesti: paketin laskenta.js === repojuuren laskenta.js (julkaisuportti).
- Käsintestaus Claude Codella/Desktopilla ennen julkaisua: `claude mcp add` -konfiguraatio
  READMEen juuri siinä muodossa kuin se testattiin.

## Julkaisu ja löydettävyys

- npm-paketti `varallisuuspolku-mcp` (Olavin npm-tili; tarkista nimen vapaus ennen
  ensimmäistä `npm publish`iä — varanimi `@olavikurola/varallisuuspolku-mcp`).
- `engines: node >=18` (kehityskone v24; ei uudempia API-tarpeita).
- README: FI-pääosa + EN-tiivistelmä; asennusrivit Claude Code (`claude mcp add
  varallisuuspolku -- npx -y varallisuuspolku-mcp`), Claude Desktop (json-lohko) ja
  geneerinen stdio; esimerkkidialogi; ei-neuvonta + oletusten versiointi.
- Julkaisun jälkeen: maininta llms.txt:hen ("koneluettava rajapinta: npm varallisuuspolku-mcp"
  — GEO-jatke), index.html Tietoa-korttiin ja repo-READMEen. Sivustoon EI muita muutoksia.
- Laukaisimet (linjauksesta): npm-lataukset/tähdet/inbound-kyselyt → hostattu endpoint
  mittaroituna; ei signaalia 6 kk → paketti jää optioksi nollakustannuksella.

## Vaiheistus (yhteensä ~1–2 pv linjauksen mukaan)

- **V0** — runko: package.json, stdio-JSON-RPC-kättely, `suunnitelman_skeema` +
  `simuloi_suunnitelma`, sanitoija, linkinpurku, testirunko. (~½ pv)
- **V1** — ratkaisijat + `vertaa_suunnitelmia` + kultaiset testit. (~½ pv)
- **V2** — README + prepack-kopiointi + tavuidenttisyysportti + käsintestaus Claudella
  + npm publish. (~½ pv)

## Avoimet kysymykset Olaville

1. **Julkaistaanko heti npm:ään** vai ensin vain GitHubiin (`npx github:olavikurola/…`
  toimii myös)? npm on löydettävyyden kannalta se varsinainen teko.
2. **Skeematyökalu mukaan v1:een?** (Suositus: kyllä — se on erottava osa; ilman sitä
  paketti on vain jakolinkkilaskin.) → TOTEUTETTU suosituksen mukaan.
3. **README:n kieli**: FI-pääosa + EN-tiivistelmä (suositus), vai EN edellä npm-yleisölle?
  → TOTEUTETTU suosituksen mukaan.
4. `polkuja`-parametrin katto: riittääkö 5000 (MC_FULL), vai sallitaanko Pro-tason 20 000?
  → TOTEUTETTU 5000 (suositus); noston voi tehdä yhdellä vakiolla (POLUT_MAX).

## Toteutustilanne (25.7.2026)

**V0–V2 TOTEUTETTU** suunnitelman mukaan: `mcp/` sisältää server.js (riippuvuudeton
stdio-JSON-RPC, protokollaneuvottelu 2024-11-05…2025-06-18), tyokalut.js (5 työkalua,
transport-agnostinen lista), sanitoi.js (applySavedin peili + linkinpurku; tietoiset
poikkeamat dokumentoitu tiedoston alussa: events ja perusnumerot PAKOLLISIA — agentin
suunnitelmaan ei ilmesty oletustapahtumia hiljaa), kopioi-laskenta.js (prepack),
package.json (bin, files, engines ≥18) ja README.md (FI + EN-tiivistelmä,
Claude Code/Desktop -asennus). `mcp/laskenta.js` EI ole gitissä (.gitignore) —
repo-ajo käyttää juuren tiedostoa suoraan, prepack kopioi julkaisuun.

Testit: `testit/mcp.test.js` (53 tarkistusta, riippuvuudeton): sanitoijan clampit ja
selkokieliset virheet, MCP-kättely lapsiprosessia vasten, **kultaiset luvut bitilleen
suoraan laskenta.js-kutsua vasten** (kääre ei vääristä mitään), determinismi,
skeemaesimerkkien silmukka takaisin simulaatioon, tavuidenttisyysportti.
`npm pack --dry-run` verifioitu: 6 tiedostoa, 32,5 kB.

**OLAVIN TEHTÄVÄT ennen julkaisua**: (1) npm-tili + 2FA, tarkista nimen vapaus
(`npm view varallisuuspolku-mcp` → 404 = vapaa), (2) `cd mcp && npm publish`,
(3) käsintestaus Claude Codella (`claude mcp add varallisuuspolku -- npx -y
varallisuuspolku-mcp`), (4) julkaisun jälkeen: maininta llms.txt + Tietoa-UKK +
repo-README (erillinen pieni erä — sivustoon ei koskettu tässä).
