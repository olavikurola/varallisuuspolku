'use strict';

/* Varallisuuspolku — natiivilisät NATIIVIAPPIIN (Capacitor): muistutukset,
   sovelluksen lukitus ja kotinäyttöwidgetin tietosilta. Selaimessa tämä
   tiedosto ei tee mitään. Kaikki kolme ovat opt-in eivätkä lähetä mitään
   minnekään — ilmoitukset ajastetaan laitteella, lukitus on laitteen oma
   tunnistus ja widget lukee laitteelle tallennettua tiivistelmää.
   Ladataan sekä index- että analytiikkasivulla; suunnitelmaan nojaavat osat
   (muistutukset, widget) toimivat vain kotisivulla, lukitus kaikkialla. */

(function () {
  var native = false;
  try {
    native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (e) { /* ei Capacitoria → web */ }
  if (!native) return;

  var P = (window.Capacitor && window.Capacitor.Plugins) || {};
  var LN = P.LocalNotifications || null;
  var NB = P.NativeBiometric || null;

  var MUISTUTUS_KEY = 'vp-muistutukset'; // '1' = päällä
  var LUKITUS_KEY = 'vp-lukitus';        // '1' = päällä

  function paalla(key) {
    try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
  }
  function aseta(key, on) {
    try { on ? localStorage.setItem(key, '1') : localStorage.removeItem(key); } catch (e) {}
  }
  function ilmoita(msg) {
    if (typeof toast === 'function') toast(msg);
  }

  /* ===================== Muistutukset ===================== */
  // Kuukausikatsaus (kuun 1. päivä klo 9) + suunnitelman tulevat tapahtumat:
  // ikä ankkuroituu nykyhetkeen, joten tapahtuman kuukausi = (ikä − nykyikä) × 12
  // kuukautta tästä hetkestä. Ajastukset uusitaan aina käynnistyessä ja appin
  // siirtyessä taustalle — suunnitelman muutokset päätyvät ilmoituksiin ilman
  // erillistä tallennuskoukkua, ja puhelimen uudelleenkäynnistys kestää
  // (pluginin boot-palautus).

  var KK_ID = 1;        // kuukausikatsaus
  var TAPAHTUMA_ID = 100; // tapahtumat 100, 101, …
  var TAPAHTUMIA_MAX = 12; // iOS sallii 64 odottavaa — pidetään reilusti alle

  function ajastaMuistutukset() {
    if (!LN || !paalla(MUISTUTUS_KEY)) return Promise.resolve();
    return LN.checkPermissions().then(function (perm) {
      if (perm.display !== 'granted') return;
      return LN.getPending().then(function (res) {
        var pend = (res && res.notifications) || [];
        return pend.length ? LN.cancel({ notifications: pend.map(function (n) { return { id: n.id }; }) }) : null;
      }).then(function () {
        var lista = [{
          id: KK_ID,
          title: 'Kuukausikatsaus',
          body: 'Päivitä lukusi Varallisuuspolussa — ollaanko yhä polulla?',
          schedule: { on: { day: 1, hour: 9, minute: 0 }, allowWhileIdle: true },
        }];
        if (typeof state !== 'undefined' && state && state.events && typeof evLabel === 'function') {
          var nyt = new Date();
          var tulevat = state.events
            .filter(function (e) { return !e.owned && e.age > state.ageNow; })
            .map(function (e) { return { e: e, kk: Math.round((e.age - state.ageNow) * 12) }; })
            .filter(function (r) { return r.kk >= 1; })
            .sort(function (a, b) { return a.kk - b.kk; })
            .slice(0, TAPAHTUMIA_MAX);
          tulevat.forEach(function (r, i) {
            lista.push({
              id: TAPAHTUMA_ID + i,
              title: evLabel(r.e),
              body: 'Suunnitelmasi mukaan tämä tapahtuu nyt (' + Math.round(r.e.age) + ' v). Toteutuiko? Käy päivittämässä suunnitelma.',
              // kuunvaihteen ylivuoto vältetään rajaamalla päivä ≤ 28
              schedule: { at: new Date(nyt.getFullYear(), nyt.getMonth() + r.kk, Math.min(nyt.getDate(), 28), 9, 0), allowWhileIdle: true },
            });
          });
        }
        return LN.schedule({ notifications: lista });
      });
    }).catch(function () { /* ilmoitusvirhe ei saa kaataa sovellusta */ });
  }

  function toggleMuistutukset() {
    if (!LN) { ilmoita('Ilmoitukset eivät ole käytettävissä tässä versiossa'); return; }
    if (paalla(MUISTUTUS_KEY)) {
      aseta(MUISTUTUS_KEY, false);
      LN.getPending().then(function (res) {
        var pend = (res && res.notifications) || [];
        if (pend.length) LN.cancel({ notifications: pend.map(function (n) { return { id: n.id }; }) });
      }).catch(function () {});
      ilmoita('Muistutukset pois päältä');
      return;
    }
    LN.requestPermissions().then(function (perm) {
      if (perm.display !== 'granted') {
        ilmoita('Ilmoituslupa puuttuu — salli ilmoitukset laitteen asetuksista');
        return;
      }
      aseta(MUISTUTUS_KEY, true);
      ajastaMuistutukset();
      ilmoita('Muistutukset päällä — kuukausikatsaus ja suunnitelmasi tapahtumat');
    }).catch(function () { ilmoita('Ilmoituslupaa ei saatu'); });
  }

  /* ===================== Sovelluksen lukitus ===================== */
  // Laitteen oma tunnistus (sormenjälki / kasvot / laitteen suojakoodi
  // varamenetelmänä). Peite piirretään heti skriptin ajossa ennen kuin
  // suunnitelman luvut ehtivät ruudulle, ja uudestaan kun appi palaa
  // taustalta yli minuutin tauon jälkeen.

  var LUKKO_TAUKO_MS = 60000;
  var LUKKO_AUKI_KEY = 'vp-lukko-auki'; // sessionStorage: avaus kattaa istunnon,
  // jotta sivunvaihto appin sisällä (Polku ↔ Tilastot) ei lukitse uudestaan.
  // Appin sulkeminen tyhjentää session → kylmäkäynnistys lukitsee aina.
  var lukkoEl = null;
  var piilossaAlkoi = 0;

  function lukkoAvattu() {
    try { return sessionStorage.getItem(LUKKO_AUKI_KEY) === '1'; } catch (e) { return false; }
  }
  function merkitseAvatuksi(auki) {
    try { auki ? sessionStorage.setItem(LUKKO_AUKI_KEY, '1') : sessionStorage.removeItem(LUKKO_AUKI_KEY); } catch (e) {}
  }

  function naytaLukko() {
    if (lukkoEl) return;
    var vaalea = document.documentElement.classList.contains('light');
    var o = document.createElement('div');
    o.id = 'vpLukko';
    o.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;' +
      'background:' + (vaalea ? '#eef1f8' : '#0a0e1a') + ';';
    o.innerHTML =
      '<div style="font-size:44px" aria-hidden="true">🔒</div>' +
      '<div style="font-weight:600;font-size:17px;line-height:1.45;color:' + (vaalea ? '#1c2433' : '#e8ecf8') + '">Varallisuuspolku on lukittu</div>' +
      '<button id="vpAvaaLukko" type="button" style="font:inherit;font-weight:600;font-size:15px;padding:12px 26px;border:0;border-radius:10px;' +
      'background:var(--accent,#2dd4bf);color:#06251f;cursor:pointer">Avaa</button>';
    (document.body || document.documentElement).appendChild(o);
    lukkoEl = o;
    o.querySelector('#vpAvaaLukko').addEventListener('click', avaaLukko);
  }

  function piilotaLukko() {
    if (lukkoEl) { lukkoEl.remove(); lukkoEl = null; }
    merkitseAvatuksi(true);
  }

  function avaaLukko() {
    if (!NB) { piilotaLukko(); return; } // pluginia ei ole → ei jätetä käyttäjää loukkuun
    NB.verifyIdentity({
      reason: 'Avaa Varallisuuspolku',
      title: 'Varallisuuspolku on lukittu',
      useFallback: true,
    }).then(piilotaLukko).catch(function () { /* peruttu → peite jää, Avaa yrittää uudelleen */ });
  }

  function toggleLukitus() {
    if (!NB) { ilmoita('Lukitus ei ole käytettävissä tässä versiossa'); return; }
    if (paalla(LUKITUS_KEY)) {
      aseta(LUKITUS_KEY, false);
      ilmoita('Lukitus pois päältä');
      return;
    }
    NB.isAvailable({ useFallback: true }).then(function (r) {
      if (!r || !r.isAvailable) {
        ilmoita('Laitteessa ei ole käytettävissä olevaa lukitustapaa');
        return;
      }
      return NB.verifyIdentity({
        reason: 'Vahvista lukituksen käyttöönotto',
        title: 'Sovelluksen lukitus',
        useFallback: true,
      }).then(function () {
        aseta(LUKITUS_KEY, true);
        ilmoita('Lukitus päällä — appi vaatii avauksen jatkossa');
      }).catch(function () { ilmoita('Tunnistautuminen peruttiin'); });
    }).catch(function () { ilmoita('Lukitustavan tarkistus epäonnistui'); });
  }

  /* ===================== Widget-silta ===================== */
  // Tiivistelmä kotinäyttöwidgetille Preferences-tallennukseen (Androidilla
  // SharedPreferences "CapacitorStorage", josta widget lukee). Luvut tulevat
  // moottorista valmiiksi muotoiltuina — widget vain näyttää tekstit.

  function widgetPaivita() {
    if (!P.Preferences) return;
    if (typeof sim === 'undefined' || !sim || typeof state === 'undefined' || !state) return;
    var data;
    var vuosiNyt = new Date().getFullYear();
    if (sim.successProb != null) {
      data = {
        otsikko: 'Onnistumistodennäköisyys',
        arvo: Math.round(sim.successProb * 100) + ' %',
        alarivi: sim.retireAge != null
          ? 'Eläkkeelle ' + Math.round(sim.retireAge) + ' v (~' + (vuosiNyt + Math.round(sim.retireAge - state.ageNow)) + ')'
          : 'Suunnitelma ' + Math.round(state.ageEnd) + ' v ikään',
      };
    } else if (sim.wEnd != null && typeof fmtCompact === 'function') {
      data = {
        otsikko: 'Loppuvarallisuus',
        arvo: fmtCompact(sim.wEnd),
        alarivi: 'Suunnitelma ' + Math.round(state.ageEnd) + ' v ikään',
      };
    } else return;
    data.paivitetty = new Date().toLocaleDateString('fi-FI');
    P.Preferences.set({ key: 'vp-widget', value: JSON.stringify(data) }).then(function () {
      // Android-widget päivittyy heti pikkupluginilla; ilman sitä (iOS) tiedot
      // odottavat widgetin omaa päivitysrytmiä
      if (P.VpWidget && P.VpWidget.paivita) P.VpWidget.paivita().catch(function () {});
    }).catch(function () {});
  }

  /* ===================== Valikkorivit (☰) ===================== */
  // sovellus.js kutsuu tätä openMoreMenu:n lopussa — rivit näkyvät vain appissa.

  window.vpNativeMenu = function (add) {
    var mOn = paalla(MUISTUTUS_KEY);
    add('mi-muistutukset',
      mOn ? 'Muistutukset päällä ✓' : 'Muistutukset',
      mOn ? 'Poista ilmoitukset käytöstä' : 'Kuukausikatsaus ja suunnitelmasi tapahtumat ilmoituksina',
      toggleMuistutukset);
    var lOn = paalla(LUKITUS_KEY);
    add('mi-lukitus',
      lOn ? 'Lukitus päällä ✓' : 'Sovelluksen lukitus',
      lOn ? 'Poista lukitus käytöstä' : 'Avaa sormenjäljellä, kasvoilla tai laitteen koodilla',
      toggleLukitus);
  };

  /* ===================== Elinkaari ===================== */

  if (paalla(LUKITUS_KEY) && !lukkoAvattu()) {
    naytaLukko();
    setTimeout(avaaLukko, 350); // pieni viive: silta ja teema ehtivät asettua
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      piilossaAlkoi = Date.now();
      ajastaMuistutukset();
      widgetPaivita();
    } else if (paalla(LUKITUS_KEY) && piilossaAlkoi && Date.now() - piilossaAlkoi > LUKKO_TAUKO_MS) {
      merkitseAvatuksi(false); // pitkä tauko → istunnon avaus raukeaa
      naytaLukko();
      avaaLukko();
    }
  });

  function kaynnistys() {
    ajastaMuistutukset();
    // widget tarvitsee ensimmäisen simulaation — odotellaan kevyesti
    var yritys = 0;
    (function odota() {
      if (typeof sim !== 'undefined' && sim) { widgetPaivita(); return; }
      if (++yritys < 40) setTimeout(odota, 250);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kaynnistys);
  else kaynnistys();

  // testien ja vianetsinnän kädensija
  window.vpNatiivi = { ajastaMuistutukset: ajastaMuistutukset, widgetPaivita: widgetPaivita };
})();
