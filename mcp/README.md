# varallisuuspolku-mcp

**English summary:** [Varallisuuspolku](https://varallisuuspolku.com) ("Wealth Path") is a free
Finnish lifecycle wealth planning tool. This package exposes its deterministic calculation engine
(statutory pension, Finnish capital gains tax, acquisition-cost assumption, investment account
wrappers, Monte Carlo with fixed seeds) as a **local MCP server** for AI agents. All computation
happens on your machine — nothing is sent anywhere. The tools compute; they never give investment
advice. Tool names and outputs are in Finnish.

---

Varallisuuspolun laskentamoottori tekoälyagentin työkaluna: agentti voi simuloida
elinkaarisuunnitelman, ratkaista aikaisimman eläkeiän tai tarvittavan säästön ja vertailla
vaihtoehtoja — samalla moottorilla joka pyörii varallisuuspolku.comissa. Laskenta on
deterministinen (kiinteät Monte Carlo -siemenet): sama syöte antaa aina täsmälleen saman
vastauksen, ja sen voi tarkistaa [validointisivulta](https://varallisuuspolku.com/validointi.html).

**Kaikki tapahtuu omalla koneellasi.** Palvelin ei käytä verkkoa, ei tallenna mitään eikä
lähetä mitään minnekään — sama tietosuojalupaus kuin sivustolla, nyt myös agenttikäytössä.

## Asennus

**Claude Code:**

```
claude mcp add varallisuuspolku -- npx -y varallisuuspolku-mcp
```

**Claude Desktop** (Asetukset → Kehittäjä → Muokkaa asetuksia):

```json
{
  "mcpServers": {
    "varallisuuspolku": {
      "command": "npx",
      "args": ["-y", "varallisuuspolku-mcp"]
    }
  }
}
```

Muut MCP-yhteensopivat asiakkaat: käynnistä `npx -y varallisuuspolku-mcp` stdio-palvelimena.
Vaatii [Node.js](https://nodejs.org) ≥ 18.

## Käyttö

Helpoin tapa: tee suunnitelma osoitteessa [varallisuuspolku.com](https://varallisuuspolku.com),
kopioi jakolinkki (Suunnitelmani → Jaa linkkinä) ja liitä se agentille:

> *"Tässä suunnitelmani: https://varallisuuspolku.com#s=eyJhZ2… — pärjäänkö, jos jään
> eläkkeelle 60-vuotiaana?"*

Agentti voi myös rakentaa suunnitelman keskustelusta tyhjästä: `suunnitelman_skeema`-työkalu
kertoo sille kaikki kentät ja tapahtumatyypit.

## Työkalut

| Työkalu | Mitä tekee |
|---|---|
| `simuloi_suunnitelma` | Koko elinkaari: onnistumis-%, varallisuus eläkeiässä ja lopussa (P10–P90), kestävä tulo, verot, ehtymisriskit, vuositaulukko |
| `ratkaise_elakeika` | Aikaisin mahdollinen eläkeikä annetulla kuukausitulolla, halutessa Monte Carlo -varmuustasolla |
| `ratkaise_saasto` | Tarvittava kuukausisäästö annetulla eläkeiällä ja tulotarpeella |
| `vertaa_suunnitelmia` | 2–4 vaihtoehdon vertailutaulukko, paras arvo merkittynä |
| `simuloi_perhe` | Koko kotitalous (enintään 4 henkilöä) perhelinkistä: henkilökohtaiset metriikat + perheen yhteinen onnistumis-% koherentilla Monte Carlolla |
| `suunnitelman_skeema` | Suunnitelma-JSON:n kenttädokumentaatio ja esimerkit agentille |

## Rajaukset

- **Ei sijoitusneuvontaa**: työkalut laskevat ja vertailevat, eivät suosittele tuotteita tai
  toimia. Jokainen vastaus kantaa tämän muistutuksen.
- Perhelinkit (`#f=`) käsittelee `simuloi_perhe`; ratkaisijat ja vertailu toimivat
  yhden henkilön suunnitelmilla.
- Oletukset ja tunnetut yksinkertaistukset: [validointi.html](https://varallisuuspolku.com/validointi.html).
  Paketti kantaa julkaisuhetken moottorin (verovuoden parametrit vastauksen `moottori`-kentässä) —
  päivitä paketti isojen sivustopäivitysten jälkeen (`npx` tekee tämän automaattisesti).

## Kehitys

Repossa ([olavikurola/varallisuuspolku](https://github.com/olavikurola/varallisuuspolku), kansio
`mcp/`) palvelin käyttää suoraan juuren `laskenta.js`:ää; julkaisussa `prepack` kopioi sen
pakettiin. Testit: `node testit/mcp.test.js` repojuuresta.

## Lisenssi

MIT © Olavi Kurola
