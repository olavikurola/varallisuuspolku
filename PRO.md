# Varallisuuspolku Pro — suunnitelma

Versio 1.0 (10.7.2026). Toteutus alkaa vasta Olavin hyväksynnän jälkeen, luvun 7 järjestyksessä.

## 0. Tiivistelmä ja asemointi

Pro on **tila, ei tuote**: kytkin kojelaudalla avaa ammattilaistason säädöt saman laskentamoottorin
päälle. Ei maksumuuria, ei tiliä, ei uusia verkkokutsuja — tietosuojalupaus ei muutu millään tavalla.

- **Perusversio** (nykyinen): päätökset nopeita, oletukset lukittuja. Kaikki nykyinen toiminnallisuus
  pysyy täsmälleen ennallaan; Pro-tilan pois kytkeminen palauttaa perusversion käytöksen.
- **Pro**: oletukset avautuvat säädettäviksi ja analyysit syvenevät — se mitä sijoitusammattilainen
  (varainhoitaja, talousvalmentaja, FIRE-harrastaja) tarvitsee käyttääkseen tätä työvälineenä
  asiakkaan tai oman suunnitelman kanssa.

Rajausperiaate: **perusversio vastaa kysymykseen "riittävätkö rahani", Pro vastaa kysymykseen
"kuinka herkkä tämä suunnitelma on oletuksilleni ja millä ehdoilla se kestää".**

## 1. Vipu ja esittelysivu

- **Vipu kojelaudan etusivulla**: kapea kytkinrivi paneelin yläosassa (Perustiedot-kortin yläpuolella):
  `[⬡ Pro-tila ○──] Mitä Pro sisältää →`. Yläpalkkiin ei lisätä nappeja (yläpalkkilinjaus).
- Ensimmäinen kytkentä (tai "Mitä Pro sisältää") avaa **esittelysivun** samalla modaalimallilla kuin
  Tietoa-sivu: ryhmittäin mitä avautuu, yksi kuvituskuva per ryhmä, alhaalla `Ota Pro käyttöön` /
  `Palaa`. Esittelysivu toimii myös SEO-sisältönä (DOMissa aina).
- Tila talteen `localStorage('vp-pro')`. Pro päällä: paneeliin ilmestyvät Pro-kortit (luku 3),
  vipurivissä ⬡-merkki hehkuu, ja Suunnitelmani-dokumenttiin tulostuu oletusliite (3.6).
- Pro pois: pro-asetukset **säilyvät** statessa mutta eivät vaikuta laskentaan (state.proOn = false)
  — kytkin on turvallinen kokeilla molempiin suuntiin, Ctrl+Z:n tapaan.
- Piirtopöytä toimii Pro-tilassa sellaisenaan; periaate "ratkaisija ei koskaan säädä tuottoa" pätee
  edelleen — Pro antaa säätää tuotto-oletuksia *käsin*, ei koskaan ratkaisijan kautta.

## 2. Rajaus

**Perusversiossa pysyy (ennallaan):** kaikki nykyinen — perustiedot, tapahtumat lainoineen ja
myynteineen, eläketavoitteet varmuustasoineen, tavoitepisteet, piirtopöytä, vertailu, jako,
Suunnitelmani, PWA. Kiinteät oletukset: tuotot 7/3/1,5 %, täyskorrelaatio, inflaatio 2 %,
glidepath 15 v / 0,35, ei kuluja, kiinteä reaalinen nostotaso.

**Pro tuo (tämä suunnitelma):** luvun 3 kuusi ryhmää.

**Tietoisesti ulos (Pro v2+ -lista, ei tähän toteutukseen):** kotitalous-/puolisomalli,
tilityypit (OST vs AOT), perintöverolaskenta, historiadatan bootstrap, faktoritiltit,
useampi rinnakkainen suunnitelma (profiilit), EN-versio.

## 3. Pro-ominaisuudet

### 3.1 Markkinaoletukset ja allokaattori (ydin)

Uusi paneelikortti **"Markkinaoletukset (Pro)"**:

- **Tuotto ja volatiliteetti per omaisuusluokka**: osakkeet/korot/käteinen μ ja σ muokattaviksi.
- **Omat omaisuusluokat** (enintään 3 lisää, esim. kiinteistörahasto, kulta, small cap):
  nimi, μ, σ, paino — allokaatioliukurit laajenevat riveiksi, summa 100 % validoituna.
- **Korrelaatiomatriisi**: nykyinen moottori laskee salkun σ:n painotettuna summana, mikä vastaa
  täyskorrelaatiota (ρ=1) — konservatiivinen mutta karkea. Pro tuo aidon kovarianssin:
  σ_p = √(wᵀΣw). UI: yläkolmiomatriisi liukusäätimin (−0,5…1,0), esiasetus "tyypilliset"
  (osake–korko 0,2; osake–käteinen 0; …). Validointi: jos matriisi ei ole positiividefiniitti,
  lähin kelvollinen haetaan kutistamalla kohti diagonaalia ja UI kertoo korjauksesta.
- **Oma glidepath**: alkuikä→loppuikä ja osakepaino alussa→lopussa (nyt kiinteä 15 v / kerroin 0,35).
  Piirtyy pikkukäyränä kortin sisään.
- **Inflaatio-oletus** säädettäväksi (nyt vakio 2 %).
- **Tuottojen jakauma**: normaali (oletus) tai paksuhäntäinen (Studentin t, vapausasteet 3–30
  -liukuri). Sama CRN-siemenmalli — determinismi säilyy.

Hyväksymiskriteerit: ρ=1-matriisilla tulokset bitilleen samat kuin perusversiossa; kovarianssilla
onnistumis-% nousee hajautushyödyn verran; kaikki syötteet rajattu ja NaN-suojattu jakolinkkiä myöten.

### 3.2 Kulut ja verot

- **Juoksevat kulut (TER %/v)**: vähennetään kuukausituotosta ennen shokkeja; oma rivi myös
  Suunnitelmani-oletuksiin ja vuositaulukkoon ("Kulut €/v"). (Backlog-item toteutuu tässä.)
- **Veroparametrit muokattaviksi**: pääomatulovero % / korotettu % / raja-euro (lakimuutosten ja
  muiden maiden karkea mallinnus). Perusversio pysyy Suomen 30/34/30 000:ssa.
- **Hankintameno-olettama myös kuukausinostoihin** (nyt vain myynneissä): kytkin, joka soveltaa
  max(40/20 % -olettama, todellinen basis) -sääntöä nostoihin. (Backlog-item.)

### 3.3 Nostostrategiat ja kulutuksen vaiheistus

- **Nostostrategia**-valinta eläketapahtumaan (nyt: kiinteä taso):
  1. *Kiinteä* (nykyinen, oletus)
  2. *Prosentti salkusta* — x % vuodessa jaettuna kuukausille; ei ehdy koskaan mutta tulo heiluu;
     HUD/kortit näyttävät tulon P10–P90-haarukan
  3. *Guardrails (Guyton–Klinger-tyylinen)* — kiinteä taso, jota korotetaan/leikataan y %, jos
     nostoprosentti karkaa putkesta ±20 %
- **Kulutuksen vaiheistus (go-go/slow-go/no-go)**: kolme ikäväliä ja kerrointa eläkeajan
  kuukausitulolle (esim. 100 % / 85 % / 70 %), piirtopöydän nostosegmentti näyttää portaat.
  (Backlog-item.) Ratkaisijat ja tavoitepisteet toimivat kaikilla strategioilla — bisektio säätää
  strategian perustasoa.

### 3.4 Monte Carlo -laboratorio

- **Polkumäärä** 300–20 000 (workerissa, progress; yli 5 000 varoittaa mobiililla).
- **Viuhkan persentiilit** valittaviksi: P10–P90 (oletus), P5–P95, P25–P75 — legenda päivittyy.
- **Stressiskenaariot** (deterministisiä overlay-polkuja viuhkan päälle, valittavissa 0–3):
  "Karhu heti eläkkeellä" (−35 % v. 1–2), "70-luvun stagflaatio" (10 v matala reaalituotto),
  "Menetetty vuosikymmen". Piirtyvät ohuina nimettyinä käyrinä; HUD näyttää ehtymisiän per skenaario.
- **Siemen** vaihdettavaksi (oletus nykyinen kiinteä) — "sama suunnitelma, eri maailmanhistoriat";
  vaihto ei riko CRN:ää, koska siemen tallentuu suunnitelmaan ja jakolinkkiin.

### 3.5 Analyysit

Uusi paneelikortti **"Analyysit (Pro)"**:

- **Ehtymiskäyrä**: P(varat ehtyneet ikään X mennessä) -käyrä MC-matriisista — jo laskettu data,
  vain esitys puuttuu.
- **Tornado-herkkyys**: tuotto ±1 %-yks, inflaatio ±1 %-yks, eläkeikä ±2 v, kk-säästö ±10 %,
  nostotaso ±10 % → vaikutus loppuvarallisuuteen vaakapalkkeina. Kertoo mihin oletukseen
  suunnitelma on herkin — ammattilaisen tärkein yksittäinen näkymä.
- **Kestävä tulo eläkei'ittäin**: käyrä "jos jäät eläkkeelle iässä X, kestävä kk-tulo on Y"
  (deterministinen bisektio per ikä, ~30 pistettä ≈ nopea).
- **Useampi vertailukohta**: nykyisen yhden haamun lisäksi enintään kolme nimettyä skenaariota
  (esim. "Perus / Varovainen / Rohkea"), värikoodatut haamukäyrät ja vertailurivi.

### 3.6 Pro-raportti

- Suunnitelmani-dokumenttiin **oletusliite**: kaikki poikkeamat perusoletuksista taulukkona
  ("Osakkeet μ 6,5 % (oletus 7,0)"), korrelaatiomatriisi, strategiakuvaus, stressitulokset.
  Ammattilainen voi antaa asiakkaalle dokumentin, jonka oletukset ovat auki kirjattu.
- CSV laajenee: kulut- ja strategiasarakkeet.

## 4. Tekninen suunnitelma

- **State**: `state.proOn` (bool) + `state.pro = { assets:[{key,name,mu,sigma,weight}], corr,
  infl, glide:{from,to,startW,endW}, ter, tax:{low,high,bracket,acqAssumption}, wd:{mode,params},
  phases:[...], mc:{paths,pcts,seed,dist,df,stress:[...]} }`. Kaikki valinnaisia — vanhat
  tallennukset/linkit toimivat ennallaan (applySaved-validointi whitelistillä kuten ennenkin).
- **laskenta.js**: `portfolioStats` saa kovarianssipolun (σ_p = √(wᵀΣw)); `buildMu` lukee pro-luokat,
  oman glidepathin, TER:n ja inflaation; `makeShock` saa t-jakauman (df) ja stressioverlayn;
  `runPath` saa strategia- ja vaihekertoimet. Kaikki oletusarvoilla == nykyinen käytös —
  determinismitestit vartioivat tätä (sama seed → bitilleen sama, kun pro-kentät puuttuvat).
- **Worker**: ei rakenteellisia muutoksia; polkumäärä viestistä (jo parametrina). 20 000 polkua
  ≈ 4 × nykyinen 5 000 → ~1,3 s työpöydällä; progress-viesti lisätään mc-taskiin.
- **Jako**: pro-kentät mukaan jakolinkkiin (hash kasvaa ~0,5 kt — ok). **Anonyymiin vertailudataan
  pro-parametreja EI lähetetä v1:ssä** — vain lippu `pro:true` (skeemakuorma ja tunnistettavuus;
  avoin kysymys 8.2).
- **Ei sijoitusneuvontaa**: Pro korostaa tätä entisestään — kaikki oletukset ovat käyttäjän omia
  ja esittelysivu + raporttiliite sanovat sen suoraan. Oletusten muuttaminen ei koskaan tapahdu
  ratkaisijan toimesta (periaate säilyy).

## 5. UX-koti

- Pro-kortit paneeliin nykyisten korttien tapaan (taittuvat, muistavat tilansa):
  Markkinaoletukset · Kulut ja verot · Nostostrategia · MC-laboratorio · Analyysit.
- Mobiili: samat kortit, sama ≤560 px -kieli (ei rivittyviä palkkeja; matriisi scrollaa omassa
  laatikossaan; tornado pystypalkkeina).
- Piirtopöytään ei lisätä Pro-säätimiä (periaate: päätökset piirretään, oletukset säädetään
  korteissa) — mutta HUD ja viuhka heijastavat pro-asetuksia automaattisesti.

## 6. Työmäärä ja PR-jako

| PR | Sisältö | Arvio |
|---|---|---|
| P0 | Vipu, esittelysivu, state.pro-runko, yhteensopivuustestit | 4–6 h |
| P1 | Markkinaoletukset: μ/σ, omat luokat, korrelaatiot (PSD), glidepath, inflaatio, t-jakauma | 12–18 h |
| P2 | Kulut (TER), veroparametrit, hankintameno-olettama nostoihin | 6–10 h |
| P3 | Nostostrategiat + kulutuksen vaiheistus (ratkaisijat mukaan lukien) | 10–16 h |
| P4 | MC-lab: polkumäärä/persentiilit/stressit/siemen + ehtymis- ja tornado-analyysit + kestävä tulo -käyrä | 12–18 h |
| P5 | Useampi vertailukohta + Pro-raporttiliite + CSV | 6–10 h |

Yhteensä ≈ **50–78 h**. Jokainen PR: determinismi- ja yhteensopivuustestit + smoke + 390 px -kaappaus.

## 7. Riskit

1. **Monimutkaisuus vuotaa perusversioon** → kaikki Pro-UI erillisissä korteissa, jotka eivät
   renderöidy ilman lippua; perusversion smoket ajetaan Pro pois päältä.
2. **Korrelaatiomatriisin validius** (ei-PSD → NaN-viuhka) → kutistusvalidointi + yksikkötestit.
3. **"Ei sijoitusneuvontaa" -rajan hämärtyminen** kun oletuksia voi säätää → esittelysivun ja
   raporttiliitteen kieli: "omat oletuksesi, eivät suosituksia"; ei esiasetettuja "suositeltuja"
   salkkuja.
4. **Suorituskyky** (20 k polkua × strategiat) → worker + progress; mobiilikatto 5 000 oletuksena.
5. **Jakolinkin koko ja vanhojen linkkien rikkoutuminen** → pro-kentät aidosti valinnaisia,
   roundtrip-testit molempiin suuntiin (pro-linkki perusversiossa: asetukset säilyvät passiivisina).

## 8. Avoimet kysymykset Olaville

1. **Nimi ja sävy**: "Pro" vai suomeksi "Ammattilaistila"? Vipurivin teksti?
2. **Vertailudata**: riittääkö `pro:true`-lippu, vai halutaanko myöhemmin karkeistetut pro-oletukset
   mukaan avoimeen dataan (kertoisi miten käyttäjät säätävät tuotto-odotuksia)?
3. **Stressiskenaarioiden nimet ja luvut** — ehdotetut kolme ovat luonnoksia, kalibroidaanko yhdessä?
4. **Prioriteetti**: jos aloitetaan osissa, ehdotus P0+P1 ensin (allokaattori on pyynnön ydin),
   sitten P4 (analyysit ovat ammattilaisarvon kärki), P2–P3 perässä.
