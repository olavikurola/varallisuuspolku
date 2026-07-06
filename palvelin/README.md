# Varallisuuspolku — datalahjoituspalvelin

Pieni, riippuvuudeton Node-palvelin, joka vastaanottaa **vapaaehtoiset anonyymit
datalahjoitukset** ja tarjoaa avoimen aggregaattidatan (`/stats.json`).

## Mitä tallennetaan

Vain [server.js](server.js):n `sanitize()`-funktion whitelistaamat kentät —
tallenne rakennetaan alusta, joten mitään muuta (esim. tapahtumien omia nimiä)
ei voi päätyä levylle. IP-osoitetta käytetään vain muistinvaraiseen
rate-limitointiin; sitä ei koskaan kirjoiteta levylle. Lahjoituksissa ei ole
tunnisteita, eikä niitä voi yhdistää toisiinsa tai keneenkään.

Jakaumat julkaistaan vasta, kun ikäryhmässä on vähintään 30 lahjoitusta.

## Käynnistys paikallisesti

```bash
node server.js          # http://localhost:8787
```

## Deploy Railwayhin

1. Railway → **New Project → Deploy from GitHub repo** → valitse tämä repo.
2. Palvelun asetuksissa **Root Directory** = `palvelin`.
3. **Volume**: lisää volyymi ja liitä polkuun `/data`; aseta muuttuja
   `DATA_DIR=/data`.
4. **Networking → Generate Domain** — ehdota nimeä
   `varallisuuspolku-data.up.railway.app` (tai kerro saatu osoite,
   niin se päivitetään sovelluksen `DATA_API`-vakioon).

Palvelin kuuntelee Railwayn antamaa `PORT`-muuttujaa automaattisesti.
