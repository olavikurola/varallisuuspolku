# Omistukset — nykytila mukaan laskentaan

Suunniteltu 25.7.2026 (Olavin hyväksymä suunta: "nykytila kyllä, historia ei").
Tausta: lanseerauspalaute (@OLaitinen "5 v sitten ostettu asunto") — jo omistettu
asunto lainoineen puuttuu laskennasta kokonaan, koska menneet tapahtumat
pudotetaan (`prepareSim`: `m0 < 0 → continue`).

## Periaate

**Tuote mallintaa tulevaisuutta; nykyhetki on alkuehto, ei tapahtumaloki.**
Alkupääoma on jo tämän periaatteen mukainen (yksi luku, ei säästöhistoriaa).
Omistukset ovat sama asia varallisuuspuolella: nykyarvo + jäljellä oleva laina
+ kk-erä — luvut jotka käyttäjä tietää verkkopankin etusivulta. Historiaa ei
kysytä, koska (a) vaihtuvakorkoisen lainan kelaus alkuperäisillä ehdoilla
tuottaisi väärän nykysaldon näennäistarkasti ja (b) käyttäjä tietää nykyarvot
paremmin kuin mikään oletus.

## Ei-tavoitteet (pysyvä rajaus, vrt. "kevyt tila torjutaan" -linjaus)

- EI takautuvia tapahtumia (`age < ageNow` ei koskaan kelpaa syötteenä)
- EI pankkituontia eikä tilitapahtumia
- EI historian rekonstruointia eikä arvohistoriaa
- EI basis-seurantaa omistuksille — myyntivero aina hankintameno-olettamalla
  (pitkään omistetulle usein todellista edullisempi; ostohintaa ei kysytä)
- EI markkereita x-akselin ulkopuolelle (aiempi linjaus pysyy)

## Tietomalli

Kolme uutta tapahtumatyyppiä (`EVENT_TYPES`), kaikilla `owned: true`:

| tyyppi | chip | oletukset |
|---|---|---|
| `ownHome` | 🔑 Oma asunto | arvo 250 t€, lainaa 120 t€, 3,5 %, 18 v; myynti verovapaa |
| `ownFlat` | 🏢 Sijoitusasunto | arvo 180 t€, lainaa 100 t€, 3,5 %, 15 v; vuokra +650 €/kk 30 v |
| `ownCottage` | 🌲 Oma mökki / vene | arvo 120 t€, lainaa 40 t€, 4,0 %, 10 v |

Tapahtuman kentät: `owned:true`, `age` (= ageNow, normalisoidaan; moottori ja
markkeri eivät luota siihen vaan pakottavat nykyhetkeen), `amount` (= −nykyarvo,
jolloin koko asset/myyntikoneisto toimii sellaisenaan), `isAsset:true`, `appr`,
`loanLeft` (€), `rate` + `years` (jäljellä oleva laina), `boughtYear`
(valinnainen, vain verolliseen myyntiin), `sellAge`/`sellTaxFree` ja
`recMonthly`/`recYears` (vuokratulo) kuten ennenkin. `ownYears` johdetaan
boughtYearista applySavedissa/popoverissa — EI serialisoitava totuus.
`financing` ei koskaan 'loan' (ei ostohetken kassavirtaa eikä käsirahaa);
`owned`-lippu hyväksytään VAIN own*-tyypeille (applySaved poistaa muilta —
käsin muokattu linkki ei saa kytkeä ostotapahtumaa nollakassavirtaiseksi).

## Moottori (laskenta.js, prepareSim)

- `m0 = e.owned ? 0 : …` molemmissa silmukoissa (erä/velka + omaisuus).
- Owned-haara erä/velkasilmukassa: EI lumpia, EI käsirahaa; jos `loanLeft > 0`,
  sama annuiteettikoneisto (`loanPayment(loanLeft, rate, years)`) kuukaudesta 1,
  myynti katkaisee lainan (salePayoff) kuten ostetuillakin.
- Omaisuussilmukka toimii lähes sellaisenaan (v0 = −amount = nykyarvo).
- Myyntivero owned-kohteelle: voittoa ei tunneta → verotettava = suoraan
  hankintameno-olettamaosuus myyntihinnasta: `(heldY ≥ 10 ? 0.6 : 0.8) ×
  myyntihinta`, missä `heldY = tuleva pito + ownYears`. Ilman ostovuotta
  ownYears = 0 (konservatiivinen: olettama 20 % kunnes 10 v täyttyy nyt-hetkestä).
- Identiteettitakuu: ilman owned-tapahtumia jokainen polku bitilleen ennallaan
  (kaikki haarat `e.owned`-portin takana; yksikkötesti vartioi).

## UI

- Paletti: kolme chippiä (tulevat EVENT_TYPES-järjestyksestä). addEvent pakottaa
  iän nykyhetkeen ja alustaa owned-kentät; raahauspudotuksen ikä ohitetaan.
- Popover (owned-haara): Nykyarvo, Arvonmuutos, Lainaa jäljellä (+Korko, Vuosia
  jäljellä, erä-note), Myyn kohteen (+Myynti-ikä, Verovapaa, Ostovuosi vain kun
  verollinen), Toistuva kuukausierä (vuokra). EI Ikää, EI Summaa, EI Rahoitusta,
  EI käsirahaa, EI "kertyy omaisuudeksi" -kytkintä (aina omaisuutta).
  pv-rate/pv-years/pv-appr/pv-sell/pv-selltf/pv-rec -id:t uusiokäytössä →
  olemassa olevat listenerit toimivat; pv-age saa puuttumissuojan.
- Markkeri: piirtyy nykyiän kohdalle (vasen reuna); ikäveto estetty sekä
  normaalitilassa (startMarkerDrag) että piirtopöydällä (dragEvent: ikä lukittu,
  pystyveto säätää nykyarvoa; nudge x → ilmoitus). Tooltip: arvo · lainaa · erä/kk.
- Tapahtumalista: ikäsarakkeessa "nyt", summa positiivisena (omaisuutta, ei
  kulua), badget "omistan" + mahdollinen myynti.
- Piirtopöydän ＋ Lisää -valikko EI listaa omistuksia (nykytilan syöttö kuuluu
  kojelaudalle, ei tulevaisuuspintaan).
- Perhejako ("jaettu puolison kanssa") toimii myös omistuksille (25.7. jatko):
  halveShared puolittaa nykyarvon JA loanLeftin — kahden puolikkaan annuiteetit
  summautuvat sentilleen täyteen erään (lineaarinen kaava).

## Data ja yhteensopivuus

- serialize: kentät kulkevat events-listan mukana automaattisesti; vanhat
  tallenteet/linkit ennallaan (owned-kenttiä ei ole → ei owned-käytöstä).
- Vanha asiakas + uusi linkki: tuntematon tyyppi putoaa pois applySavedissa,
  suunnitelma latautuu muuten — SW-cache bump pienentää ikkunaa.
- Vertailudata: own*-tyypit palvelimen whitelistiin (loanLeft/rate/years),
  samassa pushissa (Railway auto-deploy; sama kuvio kuin goal-tyypillä).
  Tulkki näkee omistukset automaattisesti (sama buildDonationPayload-konteksti).
- Tulkin työkalu-enumissa (TAPAHTUMATYYPIT) myös own*-tyypit (25.7. jatko):
  d-muoto luo omistuksen (ikä pakotetaan nykyhetkeen, ika saa puuttua),
  b-muodon loanLeft-ominaisuus vain omistuksille; age-muutos omistukselle
  torjutaan ("omistus on aina nykyhetkessä").

## Jatkot — KAIKKI TOTEUTETTU 25.7.2026 (sama päivä, toinen erä)

- ✓ Rampin tuloskorttiin "🔑 Omistan jo asunnon" -nappi (rampOwn: lisää
  ownHome ja avaa popoverin; Plausible 'Omistan jo rampista')
- ✓ Tulkin d-muoto (kehote-sääntö 7 b/d + skeema + validateChanges/applyChanges;
  golden-eval 'omistus-d-muoto' — aja ennen kehotemuutoksia)
- ✓ Tilastot-kortti "Jo omistettu varallisuus" (server stats.owned: share +
  value/loanLeft-kvartiilit K_ANON-portein; analytiikka renderOwned tyhjätiloin)
- ✓ EXAMPLES-persona "Asunnonomistaja (40 v)" (kalibroitu moottorilla:
  onnistuminen 90 %, wAtRet ~511 t€ — monthly 1200 josta erä ~910/kk)
- ✓ Perhejaettu omistus (halveShared/unshareEvent puolittaa/tuplaa loanLeftin;
  SHARE_FIELDS += owned/loanLeft/boughtYear; SHARE_PRESET += ownHome/ownCottage)
