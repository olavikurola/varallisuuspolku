'use strict';

/* Varallisuuspolku — alapalkkinavigaatio NATIIVIAPPIIN (Capacitor).
   Selaimessa tämä tiedosto ei tee mitään: palkki rakennetaan vain kun
   Capacitor-silta on läsnä (appikääre). Itsenäinen moduuli — injektoi omat
   tyylinsä, jotta sama tiedosto toimii sekä index- että analytiikkasivulla
   ilman muutoksia style.css:ään. Web-versio päättää alapalkista erikseen
   affordanssitestin jälkeen (ks. muistio).

   Rakenne: viisi tabia (Polku · Tilastot · Kysy AI · Suunnitelma · Lisää).
   Kysy AI ja Suunnitelma ovat täysiä sivuja ilman sulkunappeja — pois
   pääsee tabeilla. Lisää avaa bottom sheetin, jonka sisältö on SAMA joka
   sivulla; etusivusidonnaiset toiminnot ajetaan Tilastot-sivulta
   sessionStorage-lipun kautta heti etusivun auettua (ei näkyvää viivettä). */

(function () {
  var native = false;
  try {
    native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (e) { /* ei Capacitoria → web */ }
  if (!native) return;

  var onStats = /analytiikka\.html$/.test(location.pathname);

  var css = [
    '.vp-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:58;display:flex;justify-content:space-around;align-items:stretch;',
    ' padding:6px 8px calc(10px + env(safe-area-inset-bottom,0px));',
    ' background:color-mix(in srgb, var(--bg-2, #0e1424) 92%, transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
    ' border-top:1px solid var(--border, rgba(148,168,220,0.14));}',
    '.vp-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0 2px;',
    ' background:none;border:0;font:inherit;font-size:10.5px;font-weight:600;letter-spacing:0.01em;',
    ' color:var(--text-dim, #93a1b8);cursor:pointer;text-decoration:none;-webkit-tap-highlight-color:transparent;}',
    '.vp-tab svg{display:block}',
    '.vp-tab.act{color:var(--accent, #2dd4bf);}',
    '.vp-tab:focus-visible{outline:2px solid var(--accent, #2dd4bf);outline-offset:2px;border-radius:8px;}',
    /* sisältö ja toastit väistävät palkkia */
    'body.vp-has-tabbar{padding-bottom:calc(64px + env(safe-area-inset-bottom,0px)) !important;}',
    /* paneelin häntä (disclaimer) ei nojaa bodyn paddingiin — layoutissa
       paneeli valuu sen ohi, joten padataan paneelia itseään (havaittu laitteella) */
    'body.vp-has-tabbar .panel{padding-bottom:calc(84px + env(safe-area-inset-bottom,0px)) !important;}',
    'body.vp-has-tabbar .toast{bottom:calc(84px + env(safe-area-inset-bottom,0px));}',
    /* Kysy AI on appissa oma tabi — kelluke pois sisällön päältä */
    'body.vp-has-tabbar .tk-handle{display:none !important;}',
    /* päätoiminnot alapalkissa → yläpalkkiin jää logo ja nimi */
    'body.vp-has-tabbar .topbar-right{display:none;}',
    /* tunnusluvut 2×2-ruudukkona: kaikki neljä kerralla näkyvissä, ei piiloon
       jäävää vaakaskrollia (Olavin laitehavainto 6.8.) */
    'body.vp-has-tabbar .stats{display:grid;grid-template-columns:1fr 1fr;overflow:visible;margin:0;padding:0;gap:8px;}',
    'body.vp-has-tabbar .stat{width:auto;padding:8px 11px;}',
    'body.vp-has-tabbar .stat .v{font-size:16px;}',
    /* legenda tiiviimmin; Vuositaulukko siirtyi valikkoon */
    'body.vp-has-tabbar .legend{gap:8px 14px;font-size:11px;padding:2px 2px 4px;}',
    'body.vp-has-tabbar .legend .lg{gap:5px;}',
    'body.vp-has-tabbar #tableBtn{display:none;}',
    /* piirtopöytä ja esittelykierros saavat koko ruudun */
    'body.fs .vp-tabbar{display:none;}',
    'body.fs.vp-has-tabbar{padding-bottom:0 !important;}',
    /* valikot bottom sheetinä: appimainen tapa — nousee alhaalta koko leveydeltä
       (sovellus.js asemoi ☰-valikon inlinena ankkurin alle → !important ohittaa) */
    'body.vp-has-tabbar .menu{position:fixed !important;top:auto !important;left:0 !important;right:0 !important;bottom:0 !important;',
    ' max-width:none;border-radius:18px 18px 0 0;border-bottom:0;overflow-y:auto;z-index:130;',
    ' max-height:calc(100dvh - 80px - env(safe-area-inset-top,0px));',
    ' padding:8px 14px calc(14px + env(safe-area-inset-bottom,0px));animation:vp-sheet-up 0.22s ease;}',
    /* vetokahva kertoo että kyseessä on sheet */
    'body.vp-has-tabbar .menu::before{content:"";display:block;width:36px;height:4px;border-radius:2px;',
    ' background:var(--border,rgba(148,168,220,0.35));margin:2px auto 6px;}',
    '@keyframes vp-sheet-up{from{transform:translateY(28px);opacity:0.5}to{transform:none;opacity:1}}',
    /* Tulkki ja Suunnitelmani täysinä sivuina: koko ruutu alapalkkiin asti,
       ei sulkunappeja — tabit hoitavat poistumisen (Olavin laitehavainto 6.8.) */
    'body.vp-has-tabbar .tk-sheet{top:0 !important;height:auto !important;width:100% !important;',
    ' bottom:calc(64px + env(safe-area-inset-bottom,0px)) !important;',
    ' border-radius:0 !important;border-top:0 !important;padding-top:env(safe-area-inset-top,0px);}',
    'body.vp-has-tabbar .tk-x{display:none;}',
    'body.vp-has-tabbar #sumClose{display:none;}',
    'body.vp-has-tabbar .summary{bottom:calc(64px + env(safe-area-inset-bottom,0px));padding-bottom:28px;}',
    /* modaalit täysiksi sivuiksi: webissä tausta kuultaa peitteen takaa —
       appissa näkymä avautuu omana sivunaan yhdellä siirtymällä */
    'body.vp-has-tabbar .summary{background:var(--bg,#0a0e1a);backdrop-filter:none;-webkit-backdrop-filter:none;',
    ' animation:vp-page-in 0.2s ease;}',
    '@keyframes vp-page-in{from{transform:translateY(14px);opacity:0.4}to{transform:none;opacity:1}}',
    /* appin etusivu tiiviimmäksi: UKK-kortti on webin hakukonesisältöä (sama
       tieto valikon Tietoa-sivulla); Pro-kytkin on valikon Asetuksissa */
    'body.vp-has-tabbar .card[data-card=about]{display:none;}',
    'body.vp-has-tabbar .pro-switch{display:none;}',
  ].join('');

  var ICONS = {
    polku: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M2.5 16.5 C7 14 9.5 8.5 14 6 C15.8 5 17.5 5.5 19.5 7.5"/><circle cx="19.5" cy="7.5" r="1.8" fill="currentColor" stroke="none"/></svg>',
    tilastot: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><line x1="4.5" y1="18.5" x2="4.5" y2="12"/><line x1="11" y1="18.5" x2="11" y2="4.5"/><line x1="17.5" y1="18.5" x2="17.5" y2="9"/></svg>',
    ai: '<svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor" aria-hidden="true"><path d="M11 3 L12.8 9.2 L19 11 L12.8 12.8 L11 19 L9.2 12.8 L3 11 L9.2 9.2 Z"/><path d="M17.5 3.5 L18.2 5.8 L20.5 6.5 L18.2 7.2 L17.5 9.5 L16.8 7.2 L14.5 6.5 L16.8 5.8 Z" opacity="0.7"/></svg>',
    suunnitelma: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2.8 h7.5 L17 6.3 V19.2 H6 Z"/><line x1="8.6" y1="10" x2="14.4" y2="10"/><line x1="8.6" y1="13.2" x2="14.4" y2="13.2"/><line x1="8.6" y1="16.4" x2="12.2" y2="16.4"/></svg>',
    lisaa: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7.5"/><circle cx="7.4" cy="11" r="1.05" fill="currentColor" stroke="none"/><circle cx="11" cy="11" r="1.05" fill="currentColor" stroke="none"/><circle cx="14.6" cy="11" r="1.05" fill="currentColor" stroke="none"/></svg>',
  };

  /* ---------- Etusivusidonnaiset toiminnot ja liput ---------- */
  // Tilastot-sivulla toiminto ajetaan lipun kautta heti etusivun auettua —
  // valikon sisältö on identtinen joka sivulla, kokemus yksi siirtymä.

  var LIPUT = {
    vertaile: 'vp-a-vertaile', kierros: 'vp-a-kierros', taulukko: 'vp-a-taulukko',
    tietoa: 'vp-a-tietoa', pro: 'vp-a-pro', sheet: 'vp-a-sheet',
    tulkki: 'vp-avaa-tulkki', suunnitelma: 'vp-avaa-suunnitelma',
  };

  function etusivulle(lippu) {
    try { sessionStorage.setItem(lippu, '1'); } catch (e) {}
    location.href = './index.html';
  }
  function kotona(fn, lippu) {
    return function () { if (onStats) etusivulle(lippu); else fn(); };
  }

  function toimVertaile() {
    if (typeof baseline !== 'undefined' && baseline) { clearBaseline(); toast('Vertailu poistettu'); }
    else { setBaseline(); toast('Vertailukohta tallennettu — erot näkyvät, kun muutat suunnitelmaa'); }
  }
  function toimTaulukko() { renderYearTable(); $('tableModal').hidden = false; }
  function toimTietoa() { $('infoModal').hidden = false; }
  function toimPro() {
    // ensimmäinen kytkentä kulkee esittelysivun kautta kuten webissäkin
    if (!state.proOn && !proSeen()) { openProModal(); return; }
    setPro(!state.proOn);
  }

  /* ---------- Avoimet sivut kiinni tabivaihdossa ---------- */

  function suljeSuunnitelma() {
    var s = document.getElementById('summary');
    if (s && !s.hidden) {
      var c = document.getElementById('sumClose');
      if (c) c.click(); else s.hidden = true;
    }
  }
  function suljeTulkki() {
    var tk = document.querySelector('.tk-sheet');
    if (tk && !tk.hidden) {
      var x = tk.querySelector('.tk-x');
      if (x) x.click();
    }
  }
  function suljeAvoimet() {
    suljeSheet();
    suljeSuunnitelma();
    suljeTulkki();
  }

  /* ---------- Lisää-sheet (sama sisältö joka sivulla) ---------- */

  var sheetEl = null;
  function suljeSheet() {
    if (sheetEl) { sheetEl.remove(); sheetEl = null; document.removeEventListener('click', sheetUlkoklikki, true); }
  }
  function sheetUlkoklikki(e) {
    if (sheetEl && !sheetEl.contains(e.target)) suljeSheet();
  }
  function vaihdaTeema() {
    if (typeof applyTheme === 'function') { applyTheme(!document.documentElement.classList.contains('light')); return; }
    var light = !document.documentElement.classList.contains('light');
    document.documentElement.classList.toggle('light', light);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', light ? '#eef1f8' : '#0a0e1a');
    try { localStorage.setItem('vp-theme', light ? 'light' : 'dark'); } catch (e) {}
  }

  function avaaSheet() {
    if (sheetEl) { suljeSheet(); return; }
    var menu = document.createElement('div');
    menu.className = 'menu';
    var sect = function (label) {
      var s = document.createElement('div');
      s.className = 'msect';
      s.textContent = label;
      menu.appendChild(s);
    };
    var add = function (id, name, desc, fn, o) {
      var b = document.createElement('button');
      b.id = id;
      if (o && o.danger) b.classList.add('danger');
      b.innerHTML = '<div>' + name + '</div><div class="mdesc">' + desc + '</div>';
      b.addEventListener('click', function () {
        if (o && o.pysy) { if (fn) fn(b); return; } // nollaus vahvistetaan sheetissä
        suljeSheet();
        if (fn) fn(b);
      });
      menu.appendChild(b);
      return b;
    };

    sect('Toiminnot');
    add('mi-compare',
      (!onStats && typeof baseline !== 'undefined' && baseline) ? 'Vertailu päällä ✓' : 'Vertaile',
      'Tallenna nykyinen suunnitelma haamukäyräksi', kotona(toimVertaile, LIPUT.vertaile));
    add('mi-tour', 'Esittelykierros', 'Palvelun läpikäynti yhdeksällä klikkauksella',
      kotona(function () { startTour(); }, LIPUT.kierros));
    add('mi-taulukko', 'Vuositaulukko', 'Vuosikohtaiset luvut taulukkona ja CSV:nä',
      kotona(toimTaulukko, LIPUT.taulukko));

    sect('Sivut');
    add('mi-analytics', 'Tilastot', 'Miten muut suunnittelevat vaurastumista — avoin data',
      function () { if (onStats) window.scrollTo({ top: 0, behavior: 'smooth' }); else location.href = './analytiikka.html'; });
    add('mi-agents', 'Agentit', 'Kytke oma tekoälyavustajasi laskentamoottoriin (MCP)',
      function () { location.href = './agentit.html'; });
    add('mi-info', 'Tietoa palvelusta', 'Oletukset, tietosuoja ja vinkit', kotona(toimTietoa, LIPUT.tietoa));

    sect('Asetukset');
    add('mi-theme',
      document.documentElement.classList.contains('light') ? 'Tumma teema' : 'Vaalea teema',
      'Vaihda värimaailma — valinta muistetaan', vaihdaTeema);
    add('mi-pro',
      (!onStats && typeof state !== 'undefined' && state.proOn) ? 'Pro-tila päällä ✓' : 'Pro-tila',
      'Ammattilaisen säädöt ja analyysit', kotona(toimPro, LIPUT.pro));
    if (window.vpNativeMenu) window.vpNativeMenu(add); // muistutukset + lukitus

    // Nollaus: kaksivaiheinen vahvistus sheetissä. Tilastot-sivulta siirrytään
    // etusivulle sheet auki — tuhoavaa toimintoa ei ajeta lipun kautta.
    add('mi-reset', 'Nollaa suunnitelma', 'Poistaa avoinna olevan suunnitelman — muut rivit säilyvät',
      function (b) {
        if (onStats) { etusivulle(LIPUT.sheet); return; }
        if (b.dataset.armed) { nollaaAktiivinen(); return; }
        b.dataset.armed = '1';
        b.classList.add('armed-item');
        b.querySelector('div').textContent = 'Vahvista nollaus';
        setTimeout(function () {
          if (!b.isConnected) return;
          delete b.dataset.armed;
          b.classList.remove('armed-item');
          b.querySelector('div').textContent = 'Nollaa suunnitelma';
        }, 3000);
      }, { danger: true, pysy: true });

    document.body.appendChild(menu);
    sheetEl = menu;
    setTimeout(function () { document.addEventListener('click', sheetUlkoklikki, true); }, 0);
  }

  /* ---------- Palkki ---------- */

  function tab(id, label, act) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'vp-tab' + (act ? ' act' : '');
    el.innerHTML = ICONS[id] + '<span>' + label + '</span>';
    return el;
  }

  function build() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var bar = document.createElement('nav');
    bar.className = 'vp-tabbar';
    bar.setAttribute('aria-label', 'Päänavigaatio');

    var polku = tab('polku', 'Polku', !onStats);
    polku.addEventListener('click', function () {
      if (onStats) { location.href = './index.html'; return; }
      suljeAvoimet();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var tilastot = tab('tilastot', 'Tilastot', onStats);
    tilastot.addEventListener('click', function () {
      if (onStats) { suljeSheet(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      location.href = './analytiikka.html';
    });

    var ai = tab('ai', 'Kysy AI', false);
    ai.addEventListener('click', function () {
      if (onStats) { etusivulle(LIPUT.tulkki); return; }
      var tk = document.querySelector('.tk-sheet');
      if (tk && !tk.hidden) return; // jo auki
      suljeSheet();
      suljeSuunnitelma();
      var h = document.querySelector('.tk-handle');
      if (h) h.click();
    });

    var suunnitelma = tab('suunnitelma', 'Suunnitelma', false);
    suunnitelma.addEventListener('click', function () {
      if (onStats) { etusivulle(LIPUT.suunnitelma); return; }
      var s = document.getElementById('summary');
      if (s && !s.hidden) return; // jo auki
      suljeSheet();
      suljeTulkki();
      if (typeof window.openSummary === 'function') window.openSummary();
    });

    var lisaa = tab('lisaa', 'Lisää', false);
    lisaa.addEventListener('click', function () { avaaSheet(); });

    bar.appendChild(polku);
    bar.appendChild(tilastot);
    bar.appendChild(ai);
    bar.appendChild(suunnitelma);
    bar.appendChild(lisaa);
    document.body.appendChild(bar);
    document.body.classList.add('vp-has-tabbar');

    /* tab-aktiivitilat: Kysy AI ja Suunnitelma näkyvät valittuina kun niiden
       sivu on auki — sivumaisuus tuntuu aidolta (hidden-attribuutin vahti) */
    if (!onStats) {
      setTimeout(function () {
        var tk = document.querySelector('.tk-sheet');
        var sum = document.getElementById('summary');
        if (!sum) return;
        var paivita = function () {
          var tkAuki = !!(tk && !tk.hidden);
          var sumAuki = !sum.hidden;
          ai.classList.toggle('act', tkAuki);
          suunnitelma.classList.toggle('act', sumAuki && !tkAuki);
          polku.classList.toggle('act', !tkAuki && !sumAuki);
        };
        var mo = new MutationObserver(paivita);
        if (tk) mo.observe(tk, { attributes: true, attributeFilter: ['hidden'] });
        mo.observe(sum, { attributes: true, attributeFilter: ['hidden'] });
        paivita();
      }, 400);
    }

    /* Tilastot-sivulta tulleet toimintoliput: ajetaan HETI (ei viivettä —
       Tulkin avausvälähdys pois: sivu on auki jo ensimmäisessä maalauksessa) */
    if (!onStats) {
      var lippu = function (k) {
        try { var v = sessionStorage.getItem(k); if (v) sessionStorage.removeItem(k); return !!v; } catch (e) { return false; }
      };
      if (lippu(LIPUT.tulkki)) { var h0 = document.querySelector('.tk-handle'); if (h0) h0.click(); }
      if (lippu(LIPUT.suunnitelma) && typeof window.openSummary === 'function') window.openSummary();
      if (lippu(LIPUT.vertaile)) toimVertaile();
      if (lippu(LIPUT.kierros)) startTour();
      if (lippu(LIPUT.taulukko)) toimTaulukko();
      if (lippu(LIPUT.tietoa)) toimTietoa();
      if (lippu(LIPUT.pro)) toimPro();
      if (lippu(LIPUT.sheet)) avaaSheet();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
