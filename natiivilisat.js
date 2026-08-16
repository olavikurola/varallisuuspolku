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
  var toastEl2 = null, toastTimer2 = null;
  function ilmoita(msg) {
    if (typeof toast === 'function') { toast(msg); return; }
    // tilastosivulla ei ole sovellus.js:n toastia — kevyt varatoteutus samalla tyylillä
    if (!toastEl2) {
      toastEl2 = document.createElement('div');
      toastEl2.className = 'toast';
      document.body.appendChild(toastEl2);
    }
    toastEl2.textContent = msg;
    toastEl2.classList.add('show');
    clearTimeout(toastTimer2);
    toastTimer2 = setTimeout(function () { toastEl2.classList.remove('show'); }, 2400);
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
          title: t('Kuukausikatsaus'),
          body: t('Kirjaa toteutunut varallisuutesi — ollaanko yhä polulla?'),
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
              body: t('Suunnitelmasi mukaan tämä tapahtuu nyt ({0} v). Toteutuiko? Käy päivittämässä suunnitelma.', Math.round(r.e.age)),
              // kuunvaihteen ylivuoto vältetään rajaamalla päivä ≤ 28
              schedule: { at: new Date(nyt.getFullYear(), nyt.getMonth() + r.kk, Math.min(nyt.getDate(), 28), 9, 0), allowWhileIdle: true },
            });
          });
        }
        return LN.schedule({ notifications: lista });
      });
    }).catch(function () { /* ilmoitusvirhe ei saa kaataa sovellusta */ });
  }

  function toggleMuistutukset(valmis) {
    var done = function () { if (valmis) valmis(); };
    if (!LN) { ilmoita(t('Ilmoitukset eivät ole käytettävissä tässä versiossa')); done(); return; }
    if (paalla(MUISTUTUS_KEY)) {
      aseta(MUISTUTUS_KEY, false);
      LN.getPending().then(function (res) {
        var pend = (res && res.notifications) || [];
        if (pend.length) LN.cancel({ notifications: pend.map(function (n) { return { id: n.id }; }) });
      }).catch(function () {});
      ilmoita(t('Muistutukset pois päältä'));
      done();
      return;
    }
    LN.requestPermissions().then(function (perm) {
      if (perm.display !== 'granted') {
        ilmoita(t('Ilmoituslupa puuttuu — salli ilmoitukset laitteen asetuksista'));
        done();
        return;
      }
      aseta(MUISTUTUS_KEY, true);
      ajastaMuistutukset();
      ilmoita(t('Muistutukset päällä — kuukausikatsaus ja suunnitelmasi tapahtumat'));
      done();
    }).catch(function () { ilmoita(t('Ilmoituslupaa ei saatu')); done(); });
  }

  /* ===================== Logoruutu ja sovelluksen lukitus ===================== */
  // Käynnistys alkaa AINA logoruudusta (Olavin toive 7.8.): lukitus päällä →
  // Face ID vie eteenpäin automaattisesti; lukitus pois → käyttäjä painaa
  // Avaa. Peite piirretään heti skriptin ajossa ennen kuin suunnitelman
  // luvut ehtivät ruudulle; lukitustilassa se palaa myös kun appi on ollut
  // taustalla yli minuutin.

  var LUKKO_TAUKO_MS = 60000;
  var LUKKO_AUKI_KEY = 'vp-lukko-auki'; // sessionStorage: avaus kattaa istunnon,
  // jotta sivunvaihto appin sisällä (Polku ↔ Tilastot) ei näytä ruutua
  // uudestaan. Appin sulkeminen tyhjentää session → kylmäkäynnistys näyttää aina.
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
    // Logoruutu: sama tumma ilme kuin splashissa, ei paljasta mitään sisältöä.
    // Brändi yläkolmanneksessa ja Avaa-nappi alhaalla — ruudun keskusta jää
    // vapaaksi iOS:n Face ID -dialogille, joka piirtyy juuri keskelle
    var lukossa = paalla(LUKITUS_KEY);
    var o = document.createElement('div');
    o.id = 'vpLukko';
    o.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:flex-start;gap:14px;text-align:center;' +
      'padding:calc(16vh + env(safe-area-inset-top,0px)) 24px 24px;' +
      'background:radial-gradient(1200px 600px at 80% -10%,rgba(139,124,246,0.12),transparent 60%),' +
      'radial-gradient(900px 500px at -10% 110%,rgba(45,212,191,0.08),transparent 60%),#0a0e1a;' +
      'transition:opacity 0.25s ease;';
    o.innerHTML =
      '<img src="./icon-192.png" alt="" width="84" height="84" style="border-radius:20px;box-shadow:0 12px 40px rgba(45,212,191,0.22)" />' +
      '<div style="font-weight:700;font-size:22px;letter-spacing:-0.3px;color:#e8ecf8">Varallisuuspolku</div>' +
      '<div style="font-size:13px;color:#93a1b8">' +
      (lukossa ? t('Lukittu — avaa tunnistautumalla') : t('Koko elinkaaresi vaurastuminen yhdellä näkymällä')) +
      '</div>' +
      '<button id="vpAvaaLukko" type="button" style="position:absolute;left:50%;transform:translateX(-50%);' +
      'bottom:calc(40px + env(safe-area-inset-bottom,0px));font:inherit;font-weight:600;font-size:15px;padding:12px 32px;border:0;border-radius:12px;' +
      'background:linear-gradient(90deg,#2dd4bf,#8b7cf6);color:#0a0e1a;cursor:pointer">Avaa</button>';
    (document.body || document.documentElement).appendChild(o);
    lukkoEl = o;
    o.querySelector('#vpAvaaLukko').addEventListener('click', avaaLukko);
  }

  function piilotaLukko() {
    if (lukkoEl) {
      var el = lukkoEl;
      lukkoEl = null;
      el.style.opacity = '0'; // pehmeä häivytys logoruudusta sisältöön
      el.style.pointerEvents = 'none';
      setTimeout(function () { el.remove(); }, 260);
    }
    merkitseAvatuksi(true);
  }

  function avaaLukko() {
    // Ilman lukitusta Avaa vie suoraan sisään; pluginin puuttuessa samoin
    // (ei jätetä käyttäjää loukkuun)
    if (!paalla(LUKITUS_KEY) || !NB) { piilotaLukko(); return; }
    NB.verifyIdentity({
      reason: t('Avaa Varallisuuspolku'),
      title: t('Varallisuuspolku on lukittu'),
      useFallback: true,
    }).then(piilotaLukko).catch(function () { /* peruttu → peite jää, Avaa yrittää uudelleen */ });
  }

  function toggleLukitus(valmis) {
    var done = function () { if (valmis) valmis(); };
    if (!NB) { ilmoita(t('Lukitus ei ole käytettävissä tässä versiossa')); done(); return; }
    if (paalla(LUKITUS_KEY)) {
      aseta(LUKITUS_KEY, false);
      ilmoita(t('Lukitus pois päältä'));
      done();
      return;
    }
    NB.isAvailable({ useFallback: true }).then(function (r) {
      if (!r || !r.isAvailable) {
        ilmoita(t('Laitteessa ei ole käytettävissä olevaa lukitustapaa'));
        done();
        return;
      }
      return NB.verifyIdentity({
        reason: t('Vahvista lukituksen käyttöönotto'),
        title: t('Sovelluksen lukitus'),
        useFallback: true,
      }).then(function () {
        aseta(LUKITUS_KEY, true);
        ilmoita(t('Lukitus päällä — appi vaatii avauksen jatkossa'));
        done();
      }).catch(function () { ilmoita(t('Tunnistautuminen peruttiin')); done(); });
    }).catch(function () { ilmoita(t('Lukitustavan tarkistus epäonnistui')); done(); });
  }

  /* ===================== Jakoarkki ===================== */
  // Laitteen oma jakovalikko (Viestit, sähköposti, AirDrop…) jakolinkille.
  // Palauttaa true kun arkki näytettiin (myös peruutus — silloin EI pudota
  // leikepöytäpolkuun), false kun plugin puuttuu → kutsuja käyttää varapolkua.

  function jaa(opts) {
    if (!P.Share || !P.Share.share) return Promise.resolve(false);
    return P.Share.share({
      title: opts.title || 'Varallisuuspolku',
      text: opts.text || '',
      url: opts.url,
      dialogTitle: opts.title || t('Jaa'),
    }).then(function () { return true; }).catch(function () { return true; });
  }

  /* ===================== Toteumaseuranta ===================== */
  // Kirjaa toteutunut varallisuus kuukausittain ja vertaa sitä suunnitelman
  // odotukseen. Vertailukohta JÄÄDYTETÄÄN ensimmäisestä kirjauksesta
  // (odotuskäyrä + kuukausi): suunnitelma elää ja ankkuroituu aina nykyhetkeen,
  // joten ilman jäädytystä "odotus silloin" ei olisi olemassa. Kaikki data
  // pysyy laitteella. Graafin historiajana on kirjattu jatkoon — graafi alkaa
  // nykyhetkestä, joten menneet pisteet eivät mahdu sen akselille.

  var TOTEUMA_KEY = 'vp-toteuma-v1';

  function kkNyt() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function kkEro(a, b) { // kuukausia a → b ('YYYY-MM')
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return (pb[0] - pa[0]) * 12 + (pb[1] - pa[1]);
  }
  function kkNimi(kk) {
    var p = kk.split('-').map(Number);
    return p[1] + '/' + p[0];
  }
  function toteumaLue() {
    try { return JSON.parse(localStorage.getItem(TOTEUMA_KEY)) || { viite: null, rivit: [] }; } catch (e) { return { viite: null, rivit: [] }; }
  }
  function toteumaTallennaData(t) {
    try { localStorage.setItem(TOTEUMA_KEY, JSON.stringify(t)); } catch (e) {}
  }

  function toteumaOdotus(t, kk) {
    if (!t.viite || !t.viite.exp || !t.viite.exp.length) return null;
    var i = kkEro(t.viite.pvm, kk);
    if (i < 0) i = 0;
    if (i >= t.viite.exp.length) i = t.viite.exp.length - 1;
    return t.viite.exp[i];
  }

  // Tuorein kirjaus suhteessa jäädytettyyn odotukseen → tila widgetiin ja sivulle
  function toteumaTila() {
    var t = toteumaLue();
    if (!t.rivit.length) return null;
    var r = t.rivit[t.rivit.length - 1];
    var odotus = toteumaOdotus(t, r.kk);
    if (odotus == null || typeof fmtCompact !== 'function') return null;
    var delta = r.eur - odotus;
    var suhde = odotus > 0 ? delta / odotus : 0;
    var teksti, lyhyt;
    // window.t: paikallinen "var t = toteumaLue()" varjostaa käännösfunktion tässä skoopissa
    if (Math.abs(suhde) < 0.05) { teksti = window.t('Polulla ✓'); lyhyt = window.t('Toteuma: polulla ✓'); }
    else if (delta > 0) { teksti = window.t('Edellä {0}', fmtCompact(delta)); lyhyt = window.t('Toteuma: {0} edellä', fmtCompact(delta)); }
    else { teksti = window.t('Jäljessä {0}', fmtCompact(-delta)); lyhyt = window.t('Toteuma: {0} jäljessä', fmtCompact(-delta)); }
    return { teksti: teksti, lyhyt: lyhyt, kk: r.kk, eur: r.eur, odotus: odotus, delta: delta };
  }

  function toteumaKirjaa(eur) {
    var t = toteumaLue();
    if (!t.viite) {
      // jäädytys: odotuskäyrä kirjaushetkellä (kokonaisiin euroihin pyöristettynä)
      if (typeof sim === 'undefined' || !sim || !sim.exp) return false;
      var exp = [];
      for (var i = 0; i < sim.exp.length; i++) exp.push(Math.round(sim.exp[i]));
      t.viite = { pvm: kkNyt(), exp: exp };
    }
    var kk = kkNyt();
    t.rivit = t.rivit.filter(function (r) { return r.kk !== kk; });
    t.rivit.push({ kk: kk, eur: eur });
    t.rivit.sort(function (a, b) { return a.kk < b.kk ? -1 : 1; });
    toteumaTallennaData(t);
    widgetPaivita();
    return true;
  }

  var toteumaEl = null;

  function suljeToteuma() {
    if (toteumaEl) {
      toteumaEl.remove();
      toteumaEl = null;
      document.body.classList.remove('vp-sivu-auki');
    }
  }
  window.vpSuljeToteuma = suljeToteuma;

  function renderToteuma() {
    if (!toteumaEl) return;
    var t = toteumaLue();
    var tila = toteumaTila();
    var fmt = typeof fmtCompact === 'function' ? fmtCompact : function (v) { return Math.round(v) + ' €'; };
    var html = '<div class="vp-sivuotsikko">Toteuma</div>' +
      '<div class="vpt-nyt"><input id="vptEur" type="number" inputmode="numeric" min="0" step="1000" ' +
      'placeholder="Sijoitukset ja säästöt nyt, €"><button type="button" class="btn" id="vptTallenna">Kirjaa</button></div>';
    if (tila) {
      html += '<div class="vpt-tila">' + tila.teksti +
        '<small>' + kkNimi(tila.kk) + ': kirjattu ' + fmt(tila.eur) + ' · suunnitelman odotus ' + fmt(tila.odotus) + '</small></div>';
    } else {
      html += '<div class="vpt-tila">Aloita kirjaamalla tämän kuun varallisuutesi' +
        '<small>Vertailukohta jäädytetään suunnitelmastasi ensimmäisellä kirjauksella</small></div>';
    }
    var rivit = t.rivit.slice().reverse().map(function (r) {
      var od = toteumaOdotus(t, r.kk);
      var d = od != null ? r.eur - od : null;
      return '<div class="vpt-rivi" data-kk="' + r.kk + '"><span><b>' + kkNimi(r.kk) + '</b> · ' + fmt(r.eur) + '</span>' +
        '<span class="d">' + (d == null ? '' : (d >= 0 ? '+' : '−') + fmt(Math.abs(d))) + '</span>' +
        '<button type="button" class="x" aria-label="Poista kirjaus">✕</button></div>';
    }).join('');
    if (rivit) html += '<div class="vpt-lista">' + rivit + '</div>';
    html += '<div class="vpt-info">Kirjaukset ja vertailukohta pysyvät vain tällä laitteella. ' +
      (t.viite ? window.t('Vertailukohta on jäädytetty suunnitelmastasi {0} — kaikkien kirjausten poisto nollaa sen.', kkNimi(t.viite.pvm)) :
        window.t('Kuukausimuistutus muistuttaa kirjaamisesta, kun muistutukset ovat päällä.')) +
      (widgetDiag && widgetDiag !== 'ok' ? '<br>Widget-silta: ' + widgetDiag + ' — kotinäyttöwidget ei saa tietoja.' : '') +
      '</div>';
    toteumaEl.innerHTML = html;

    toteumaEl.querySelector('#vptTallenna').addEventListener('click', function () {
      var inp = toteumaEl.querySelector('#vptEur');
      var v = parseFloat(inp.value);
      if (!(v >= 0)) { ilmoita('Anna varallisuus euroina'); return; }
      if (typeof sim === 'undefined' || !sim || !sim.exp) { ilmoita('Suunnitelma ei ole vielä laskenut — hetki'); return; }
      toteumaKirjaa(Math.round(v));
      renderToteuma();
      ilmoita('Kirjattu — ' + (toteumaTila() || {}).teksti);
    });
    toteumaEl.querySelectorAll('.vpt-rivi .x').forEach(function (b) {
      b.addEventListener('click', function () {
        var kk = b.closest('.vpt-rivi').dataset.kk;
        var t2 = toteumaLue();
        t2.rivit = t2.rivit.filter(function (r) { return r.kk !== kk; });
        if (!t2.rivit.length) t2.viite = null; // tyhjä loki nollaa vertailukohdan
        toteumaTallennaData(t2);
        widgetPaivita();
        renderToteuma();
      });
    });
  }

  window.vpAvaaToteuma = function () {
    if (toteumaEl) return;
    suljeToteuma();
    var el = document.createElement('div');
    el.className = 'menu vp-toteuma'; // .menu = appin kokosivupohja (alapalkki.js)
    document.body.appendChild(el);
    document.body.classList.add('vp-sivu-auki');
    toteumaEl = el;
    renderToteuma();
  };

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
        // lyhyt otsikko — täysi sana katkesi pienessä widgetissä (laitehavainto)
        otsikko: t('Onnistumis-%'),
        arvo: Math.round(sim.successProb * 100) + ' %',
        alarivi: sim.retireAge != null
          ? t('Eläkkeelle {0} v (~{1})', Math.round(sim.retireAge), vuosiNyt + Math.round(sim.retireAge - state.ageNow))
          : t('Suunnitelma {0} v ikään', Math.round(state.ageEnd)),
      };
    } else if (sim.wEnd != null && typeof fmtCompact === 'function') {
      data = {
        otsikko: t('Loppuvarallisuus'),
        arvo: fmtCompact(sim.wEnd),
        alarivi: t('Suunnitelma {0} v ikään', Math.round(state.ageEnd)),
      };
    } else return;
    // toteumakirjaus vie alarivin: polulla / edellä / jäljessä
    var tila = toteumaTila();
    if (tila) data.alarivi = tila.lyhyt;
    // polkukäyrä widgetin taustalle: odotettu kehitys normalisoituna 0–100
    // (25 pistettä riittää pieneen piirtoon; iOS piirtää, Android ohittaa)
    if (sim.exp && sim.exp.length > 2) {
      var huippu = 0;
      for (var i = 0; i < sim.exp.length; i++) if (sim.exp[i] > huippu) huippu = sim.exp[i];
      if (huippu > 0) {
        var kayra = [];
        for (var k = 0; k < 25; k++) {
          var idx = Math.round(k * (sim.exp.length - 1) / 24);
          kayra.push(Math.max(0, Math.round(sim.exp[idx] / huippu * 100)));
        }
        data.kayra = kayra;
      }
    }
    data.paivitetty = fmtPvm(new Date());
    var json = JSON.stringify(data);
    P.Preferences.set({ key: 'vp-widget', value: json }).then(function () {
      // Pikkusilta päivittää widgetin heti: Android lukee Preferencesin,
      // iOS saa JSONin argumenttina (App Group -tallennus + WidgetKit-reload).
      // Diagnoosi talteen Toteuma-sivun inforiviä varten — plugin haetaan
      // KUTSUHETKELLÄ suoraan window.Capacitor.Pluginsista (ei latauksessa
      // kaapatusta P:stä), ja vikatila kertoo täsmälleen puuttuvan lenkin.
      var vw = null;
      try { vw = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.VpWidget; } catch (e) {}
      if (vw && typeof vw.paivita === 'function') {
        vw.paivita({ data: json }).then(function (r) {
          widgetDiag = (r && r.ok === false) ? 'ryhmä puuttuu allekirjoituksesta' : 'ok';
        }).catch(function (e) {
          widgetDiag = 'siltavirhe: ' + ((e && (e.message || e.code)) || e);
        });
      } else {
        var headerit = [];
        try { headerit = (window.Capacitor.PluginHeaders || []).map(function (h) { return h.name; }); } catch (e) {}
        widgetDiag = !window.Capacitor ? 'ei capacitoria'
          : !window.Capacitor.Plugins ? 'plugins-objekti puuttuu'
          : !vw ? 'silta puuttuu — rekisteröidyt: ' + (headerit.join(', ') || '(tyhjä)')
          : 'paivita-metodi puuttuu (' + typeof vw.paivita + ')';
      }
    }).catch(function () {});
  }
  var widgetDiag = null; // null = ei vielä yritetty

  /* ===================== Kuvakkeen pikatoiminnot ===================== */
  // Pitkä painallus appikuvakkeesta (Kysy AI / Suunnitelma / Toteuma):
  // natiivipuoli kirjaa valinnan talteen, ja täällä se ajetaan alapalkin
  // vpAjaLippu-väylän kautta — sama polku kuin tabeilla. Tarkistus myös
  // taustalta palattaessa (appi oli jo käynnissä pikapainalluksen hetkellä).

  function tarkistaOikotie() {
    var vw = null;
    try { vw = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.VpWidget; } catch (e) {}
    if (!vw || !vw.oikotie) return;
    vw.oikotie().then(function (r) {
      var arvo = r && r.arvo;
      if (arvo && window.vpAjaLippu) window.vpAjaLippu(arvo);
    }).catch(function () {});
  }

  /* ===================== Valikkorivit (☰) ===================== */
  // sovellus.js kutsuu tätä openMoreMenu:n lopussa — rivit näkyvät vain appissa.

  window.vpNativeMenu = function (add, kytkin) {
    if (kytkin) {
      // Lisää-sivun kytkinrivit: tila näkyy switchissä, asynkroniset kytkennät
      // (ilmoituslupa, Face ID) päivittävät sen valmis-callbackilla
      kytkin('mi-muistutukset', 'Muistutukset', 'Kuukausikatsaus ja suunnitelmasi tapahtumat ilmoituksina',
        function () { return paalla(MUISTUTUS_KEY); },
        function (paivita) { toggleMuistutukset(paivita); });
      kytkin('mi-lukitus', 'Sovelluksen lukitus', 'Avaa sormenjäljellä, kasvoilla tai laitteen koodilla',
        function () { return paalla(LUKITUS_KEY); },
        function (paivita) { toggleLukitus(paivita); });
      return;
    }
    var mOn = paalla(MUISTUTUS_KEY);
    add('mi-muistutukset',
      mOn ? 'Muistutukset päällä ✓' : 'Muistutukset',
      mOn ? 'Poista ilmoitukset käytöstä' : 'Kuukausikatsaus ja suunnitelmasi tapahtumat ilmoituksina',
      function () { toggleMuistutukset(); });
    var lOn = paalla(LUKITUS_KEY);
    add('mi-lukitus',
      lOn ? 'Lukitus päällä ✓' : 'Sovelluksen lukitus',
      lOn ? 'Poista lukitus käytöstä' : 'Avaa sormenjäljellä, kasvoilla tai laitteen koodilla',
      function () { toggleLukitus(); });
  };

  /* ===================== Elinkaari ===================== */

  if (!lukkoAvattu()) {
    naytaLukko();
    // lukitus päällä → tunnistus vie eteenpäin automaattisesti;
    // ilman lukitusta käyttäjä painaa itse Avaa
    if (paalla(LUKITUS_KEY)) setTimeout(avaaLukko, 350);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      piilossaAlkoi = Date.now();
      ajastaMuistutukset();
      widgetPaivita();
    } else {
      if (paalla(LUKITUS_KEY) && piilossaAlkoi && Date.now() - piilossaAlkoi > LUKKO_TAUKO_MS) {
        merkitseAvatuksi(false); // pitkä tauko → istunnon avaus raukeaa
        naytaLukko();
        avaaLukko();
      }
      tarkistaOikotie(); // kuvakkeen pikatoiminto voi odottaa myös lämpimässä paluussa
    }
  });

  function kaynnistys() {
    ajastaMuistutukset();
    tarkistaOikotie();
    // widget tarvitsee ensimmäisen simulaation — odotellaan kevyesti
    var yritys = 0;
    (function odota() {
      if (typeof sim !== 'undefined' && sim) { widgetPaivita(); return; }
      if (++yritys < 40) setTimeout(odota, 250);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kaynnistys);
  else kaynnistys();

  // testien ja vianetsinnän kädensija + sovellus.js:n jakosauma
  window.vpNatiivi = {
    ajastaMuistutukset: ajastaMuistutukset,
    widgetPaivita: widgetPaivita,
    jaa: jaa,
    toteumaTila: toteumaTila,
    tarkistaOikotie: tarkistaOikotie,
  };
})();
