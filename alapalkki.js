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
    'body.vp-has-tabbar .tk-handle{bottom:calc(72px + env(safe-area-inset-bottom,0px));}',
    /* piirtopöytä ja esittelykierros saavat koko ruudun */
    'body.fs .vp-tabbar{display:none;}',
    'body.fs.vp-has-tabbar{padding-bottom:0 !important;}',
  ].join('');

  var ICONS = {
    polku: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M2.5 16.5 C7 14 9.5 8.5 14 6 C15.8 5 17.5 5.5 19.5 7.5"/><circle cx="19.5" cy="7.5" r="1.8" fill="currentColor" stroke="none"/></svg>',
    tilastot: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><line x1="4.5" y1="18.5" x2="4.5" y2="12"/><line x1="11" y1="18.5" x2="11" y2="4.5"/><line x1="17.5" y1="18.5" x2="17.5" y2="9"/></svg>',
    lisaa: '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7.5"/><circle cx="7.4" cy="11" r="1.05" fill="currentColor" stroke="none"/><circle cx="11" cy="11" r="1.05" fill="currentColor" stroke="none"/><circle cx="14.6" cy="11" r="1.05" fill="currentColor" stroke="none"/></svg>',
  };

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

    var lisaa = tab('lisaa', 'Lisää', false);
    lisaa.addEventListener('click', function () {
      var btn = document.getElementById('moreBtn');
      if (typeof window.openMoreMenu === 'function' && btn) {
        window.openMoreMenu(btn);
      } else {
        /* tilastosivulla ☰-valikkoa ei ole — avataan kotisivun valikko perillä */
        try { sessionStorage.setItem('vp-avaa-valikko', '1'); } catch (e) {}
        location.href = './index.html';
      }
    });

    bar.appendChild(polku);
    bar.appendChild(tilastot);
    bar.appendChild(lisaa);
    document.body.appendChild(bar);
    document.body.classList.add('vp-has-tabbar');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
