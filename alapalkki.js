'use strict';

/* Varallisuuspolku — alapalkkinavigaatio NATIIVIAPPIIN (Capacitor).
   Selaimessa tämä tiedosto ei tee mitään: palkki rakennetaan vain kun
   Capacitor-silta on läsnä (appikääre). Itsenäinen moduuli — injektoi omat
   tyylinsä, jotta sama tiedosto toimii sekä index- että analytiikkasivulla
   ilman muutoksia style.css:ään. Web-versio päättää alapalkista erikseen
   affordanssitestin jälkeen (ks. muistio). */

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
    /* sisältö, toastit ja Kysy AI -kelluke väistävät palkkia */
    'body.vp-has-tabbar{padding-bottom:calc(64px + env(safe-area-inset-bottom,0px)) !important;}',
    /* paneelin häntä (Pro-rivi, disclaimer) ei nojaa bodyn paddingiin — layoutissa
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
    /* legenda tiiviimmin; Vuositaulukko siirtyi valikkoon (sovellus.js) */
    'body.vp-has-tabbar .legend{gap:8px 14px;font-size:11px;padding:2px 2px 4px;}',
    'body.vp-has-tabbar .legend .lg{gap:5px;}',
    'body.vp-has-tabbar #tableBtn{display:none;}',
    /* piirtopöytä ja esittelykierros saavat koko ruudun */
    'body.fs .vp-tabbar{display:none;}',
    'body.fs.vp-has-tabbar{padding-bottom:0 !important;}',
    /* valikot bottom sheetinä: appimainen tapa — nousee alhaalta koko leveydeltä
       (sovellus.js asemoi valikon inlinena ankkurin alle → !important ohittaa) */
    'body.vp-has-tabbar .menu{position:fixed !important;top:auto !important;left:0 !important;right:0 !important;bottom:0 !important;',
    ' max-width:none;border-radius:18px 18px 0 0;border-bottom:0;max-height:75vh;overflow-y:auto;z-index:130;',
    ' padding:10px 14px calc(14px + env(safe-area-inset-bottom,0px));animation:vp-sheet-up 0.22s ease;}',
    '@keyframes vp-sheet-up{from{transform:translateY(28px);opacity:0.5}to{transform:none;opacity:1}}',
    /* appin etusivu tiiviimmäksi (Olavin laitehavainnot 5.8.): UKK-kortti on
       webin hakukonesisältöä — appissa sama tieto on valikon Tietoa-sivulla;
       Pro-kytkin siirtyy valikon Asetuksiin (sovellus.js lisää rivin) */
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

  /* Tilastot-sivun Lisää-sheet: samat ryhmät kuin ☰-valikossa siltä osin kuin
     ne toimivat ilman etusivun skriptejä; natiivirivit (muistutukset, lukitus)
     tulevat natiivilisat.js:n koukusta. */
  var sheetEl = null;
  function suljeSheet() {
    if (sheetEl) { sheetEl.remove(); sheetEl = null; document.removeEventListener('click', sheetUlkoklikki, true); }
  }
  function sheetUlkoklikki(e) {
    if (sheetEl && !sheetEl.contains(e.target)) suljeSheet();
  }
  function vaihdaTeema() {
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
    var add = function (id, name, desc, fn) {
      var b = document.createElement('button');
      b.id = id;
      b.innerHTML = '<div>' + name + '</div><div class="mdesc">' + desc + '</div>';
      b.addEventListener('click', function () { suljeSheet(); if (fn) fn(); });
      menu.appendChild(b);
      return b;
    };
    sect('Sivut');
    add('mi-agents', 'Agentit', 'Kytke oma tekoälyavustajasi laskentamoottoriin (MCP)',
      function () { location.href = './agentit.html'; });
    sect('Asetukset');
    add('mi-theme',
      document.documentElement.classList.contains('light') ? 'Tumma teema' : 'Vaalea teema',
      'Vaihda värimaailma — valinta muistetaan', vaihdaTeema);
    if (window.vpNativeMenu) window.vpNativeMenu(add);
    document.body.appendChild(menu);
    sheetEl = menu;
    setTimeout(function () { document.addEventListener('click', sheetUlkoklikki, true); }, 0);
  }

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
      if (onStats) location.href = './index.html';
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var tilastot = tab('tilastot', 'Tilastot', onStats);
    tilastot.addEventListener('click', function () {
      if (onStats) window.scrollTo({ top: 0, behavior: 'smooth' });
      else location.href = './analytiikka.html';
    });

    /* Kysy AI ja Suunnitelma ovat toimintotabeja (avaavat näkymän, eivät
       "aktivoidu"); tilastosivulla siirrytään etusivulle lipun kanssa */
    var ai = tab('ai', 'Kysy AI', false);
    ai.addEventListener('click', function () {
      var h = document.querySelector('.tk-handle');
      if (h) { h.click(); return; }
      try { sessionStorage.setItem('vp-avaa-tulkki', '1'); } catch (e) {}
      location.href = './index.html';
    });

    var suunnitelma = tab('suunnitelma', 'Suunnitelma', false);
    suunnitelma.addEventListener('click', function () {
      if (typeof window.openSummary === 'function') { window.openSummary(); return; }
      try { sessionStorage.setItem('vp-avaa-suunnitelma', '1'); } catch (e) {}
      location.href = './index.html';
    });

    var lisaa = tab('lisaa', 'Lisää', false);
    lisaa.addEventListener('click', function () {
      var btn = document.getElementById('moreBtn');
      if (typeof window.openMoreMenu === 'function' && btn) {
        window.openMoreMenu(btn);
      } else {
        /* tilastosivulla ☰-valikkoa ei ole — oma sheet suoraan tässä,
           ei hyppyä etusivulle (Olavin laitehavainto 5.8.) */
        avaaSheet();
      }
    });

    bar.appendChild(polku);
    bar.appendChild(tilastot);
    bar.appendChild(ai);
    bar.appendChild(suunnitelma);
    bar.appendChild(lisaa);
    document.body.appendChild(bar);
    document.body.classList.add('vp-has-tabbar');

    /* tilastosivulta tulleet avausliput (Tulkki/Suunnitelmani etusivulla);
       viive antaa muiden skriptien rakentaa käyttöliittymänsä ensin */
    if (!onStats) {
      try {
        if (sessionStorage.getItem('vp-avaa-tulkki')) {
          sessionStorage.removeItem('vp-avaa-tulkki');
          setTimeout(function () { var h = document.querySelector('.tk-handle'); if (h) h.click(); }, 600);
        }
        if (sessionStorage.getItem('vp-avaa-suunnitelma')) {
          sessionStorage.removeItem('vp-avaa-suunnitelma');
          setTimeout(function () { if (typeof window.openSummary === 'function') window.openSummary(); }, 600);
        }
      } catch (e) {}
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
