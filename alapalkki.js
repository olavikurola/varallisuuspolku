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
  // Etusivu = ainoa sivu jolla suunnitelmatoiminnot elävät; muut (Tilastot,
  // Agentit) ajavat ne sinne lippujen kautta
  var onIndex = !/analytiikka\.html$|agentit\.html$|saavutettavuus\.html$|validointi\.html$/.test(location.pathname);

  var css = [
    /* z-index sivujen (summary 90, tk 160, menu 170) yläpuolella: sivut
       ulottuvat palkin taakse, palkki pysyy aina klikattavana päällimmäisenä */
    '.vp-tabbar{position:fixed;left:0;right:0;bottom:0;z-index:200;display:flex;justify-content:space-around;align-items:stretch;',
    /* suojakaistale palkin alle: kumijouston aikana fixed-palkki elää hetken
       mukana ja alta paljastuisi sivua (havaittu laitteella) — kiinteä jatke
       peittää raon millä tahansa joustolla */
    '.vp-tabbar::after{content:"";position:absolute;top:100%;left:0;right:0;height:160px;background:var(--bg-2,#0e1424);}',
    ' padding:6px 8px calc(10px + env(safe-area-inset-bottom,0px));',
    ' background:color-mix(in srgb, var(--bg-2, #0e1424) 92%, transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
    ' border-top:1px solid var(--border, rgba(148,168,220,0.14));}',
    '.vp-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:4px 0 2px;',
    ' background:none;border:0;font:inherit;font-size:10.5px;font-weight:600;letter-spacing:0.01em;',
    ' color:var(--text-dim, #93a1b8);cursor:pointer;text-decoration:none;-webkit-tap-highlight-color:transparent;}',
    '.vp-tab svg{display:block}',
    '.vp-tab.act{color:var(--accent, #2dd4bf);}',
    '.vp-tab:focus-visible{outline:2px solid var(--accent, #2dd4bf);outline-offset:2px;border-radius:8px;}',
    /* Skrollaus dokumentilta bodyn sisään: kumijousto tapahtuu sisällössä,
       mutta viewport (ja siihen ankkuroidut fixed-elementit, ennen kaikkea
       alapalkki) EI liiku jouston mukana — palkki pysyy naulattuna.
       overscroll-behavior:contain estää ketjutuksen, jousto säilyy. */
    'html:has(body.vp-has-tabbar){overflow:hidden;height:100%;}',
    'body.vp-has-tabbar{overflow-y:auto;height:100dvh;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}',
    /* tilapalkin tausta: skrollattu sisältö ei vilku kellon ja akun alla —
       sama suoja ylös kuin palkin alle */
    'body.vp-has-tabbar::before{content:"";position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top,0px);',
    ' background:var(--bg,#0a0e1a);z-index:210;pointer-events:none;}',
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
    /* valikot aitoina kokosivuina: koko ruutu alapalkkiin asti, oma otsikko —
       ei enää bottom sheetiä joka jätti taustan näkyviin (Olavin toive 7.8.)
       (sovellus.js asemoi ☰-valikon inlinena ankkurin alle → !important ohittaa) */
    'body.vp-has-tabbar .menu{position:fixed !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;',
    ' max-width:none;max-height:none;border:0;border-radius:0;overflow-y:auto;z-index:170;',
    ' background:var(--bg,#0a0e1a);overscroll-behavior:contain;',
    ' padding:calc(14px + env(safe-area-inset-top,0px)) 16px calc(78px + env(safe-area-inset-bottom,0px));animation:vp-page-in 0.2s ease;}',
    '.vp-sivuotsikko{font-size:21px;font-weight:700;letter-spacing:-0.3px;color:var(--text,#e8ecf8);margin:4px 10px 10px;}',
    /* avoin sivu lukitsee taustan skrollauksen — mikään ei "pyöri takana" */
    'html:has(body.vp-has-tabbar.vp-sivu-auki){overflow:hidden;}',
    'body.vp-has-tabbar.vp-sivu-auki{overflow:hidden !important;}',
    'body.vp-has-tabbar .tk-log{overscroll-behavior:contain;}',
    'body.vp-has-tabbar .summary{overscroll-behavior:contain;}',
    /* Tulkki ja Suunnitelmani täysinä sivuina: pohjaan asti alapalkin TAAKSE
       (palkin lasi peittää — väliin ei jää rakoa josta tausta kuultaisi),
       sisältö väistää palkkia paddingilla. Ei sulkunappeja — tabit hoitavat. */
    'body.vp-has-tabbar .tk-sheet{top:0 !important;height:auto !important;width:100% !important;bottom:0 !important;',
    ' border-radius:0 !important;border-top:0 !important;padding-top:env(safe-area-inset-top,0px);',
    ' padding-bottom:calc(64px + env(safe-area-inset-bottom,0px));}',
    'body.vp-has-tabbar .tk-x{display:none;}',
    'body.vp-has-tabbar #sumClose{display:none;}',
    'body.vp-has-tabbar .summary{padding-bottom:calc(76px + env(safe-area-inset-bottom,0px));}',
    /* Tulkin otsikkorivi samaan mittakaavaan muiden sivujen kanssa —
       oma ✦-symboli säilyy, mutta kokoluokka yhtenäistyy */
    'body.vp-has-tabbar .tk-dot{width:42px;height:42px;border-radius:12px;font-size:19px;}',
    'body.vp-has-tabbar .tk-head{padding:14px 16px;}',
    'body.vp-has-tabbar .tk-head b{font-size:21px;letter-spacing:-0.3px;}',
    /* modaalit täysiksi sivuiksi: webissä tausta kuultaa peitteen takaa —
       appissa näkymä avautuu omana sivunaan yhdellä siirtymällä */
    'body.vp-has-tabbar .summary{background:var(--bg,#0a0e1a);backdrop-filter:none;-webkit-backdrop-filter:none;',
    ' animation:vp-page-in 0.2s ease;}',
    '@keyframes vp-page-in{from{transform:translateY(14px);opacity:0.4}to{transform:none;opacity:1}}',
    /* appin etusivu tiiviimmäksi: UKK-kortti on webin hakukonesisältöä (sama
       tieto valikon Tietoa-sivulla); Pro-kytkin on valikon Asetuksissa */
    'body.vp-has-tabbar .card[data-card=about]{display:none;}',
    'body.vp-has-tabbar .pro-switch{display:none;}',
    /* Lisää-sivun ryhmäkortit: Sivut ja Asetukset erottuvat kokonaisuuksina
       (Olavin havainto 8.8.) — kortti, sisäiset erotinviivat, kytkinrivit */
    'body.vp-has-tabbar .menu .vp-ryhma{background:linear-gradient(180deg,var(--card,#111a2e),var(--bg-2,#0e1424));',
    ' border:1px solid var(--border,rgba(148,168,220,0.14));border-radius:14px;padding:4px 14px 6px;margin:0 0 14px;}',
    'body.vp-has-tabbar .menu .vp-ryhma .msect{border-top:0;margin:0;padding:10px 0 2px;}',
    'body.vp-has-tabbar .menu .vp-ryhma button{padding:11px 0;}',
    'body.vp-has-tabbar .menu .vp-ryhma button+button{border-top:1px solid var(--border-soft,rgba(148,168,220,0.08));border-radius:0;}',
    'body.vp-has-tabbar .menu{overflow-x:hidden;}',
    'body.vp-has-tabbar .menu .vp-kytkinrivi{width:100%;text-align:left;}',
    'body.vp-has-tabbar .menu .vp-krow{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;}',
    'body.vp-has-tabbar .menu .vp-kr{min-width:0;flex:1 1 auto;display:block;}',
    'body.vp-has-tabbar .menu .vp-kr-nimi{display:block;}',
    'body.vp-has-tabbar .menu .vp-kr .mdesc{display:block;}',
    /* switch ilman sisäkkäistä flexiä: .toggle-kääre romahti WebKitissä
       nollalevyiseksi ja nuppi valui kortista yli (mitattu WebKit-moottorilla) */
    'body.vp-has-tabbar .menu .vp-kr-sw{margin:0;flex:0 0 36px;width:36px;display:block;position:relative;}',
    'body.vp-has-tabbar .menu .vp-kr-sw .switch{display:block;width:36px;}',
    'body.vp-has-tabbar .menu>#mi-reset{margin-top:2px;}',
    /* yhtenäinen sivuilme (Olavin toive 7.8.): logo + otsikko myös sisäsivuilla —
       sama koko ja muoto kuin yläpalkin brand-markissa (42 px, kulmat 12 px).
       Tulkki pitää oman ✦-symbolinsa (Olavin linjaus). */
    'body.vp-has-tabbar .sum-head h1::before,body.vp-has-tabbar .ph-head h2::before,body.vp-has-tabbar .vp-sivuotsikko::before{',
    ' content:"";display:inline-block;width:42px;height:42px;border-radius:12px;vertical-align:-13px;margin-right:12px;',
    ' background:url(./icon-192.png) center/cover;box-shadow:0 4px 18px rgba(45,212,191,0.35);}',
    /* Suunnitelmat- ja Vuositaulukko-sivut alkavat otsikolla kuten muutkin.
       min-width:0 on pakollinen: flex-lapsen min-width:auto antaisi leveän
       sisällön (taulukko 640 px, tiilirivistö) levittää arkin ruutua
       leveämmäksi → tarpeeton vaakaskrolli (auditoitu 390 px:ssä). */
    'body.vp-has-tabbar #summary,body.vp-has-tabbar #tableModal{display:flex;flex-direction:column;}',
    'body.vp-has-tabbar #summary > *,body.vp-has-tabbar #tableModal > *{flex:0 0 auto;min-width:0;}',
    /* margin:0 auto (webin keskitys) estäisi flex-venytyksen → arkki leviäisi
       sisältönsä (esim. taulukon) levyiseksi ja toisi vaakaskrollin */
    'body.vp-has-tabbar #summary .sum-sheet,body.vp-has-tabbar #tableModal .sum-sheet,body.vp-has-tabbar #summary .plans-home{margin-left:0;margin-right:0;}',
    /* Suunnitelmat: toimintonapit sisällön loppuun */
    'body.vp-has-tabbar #summary .sum-bar{order:9;justify-content:center;margin:18px auto 6px;}',
    /* Tilastot: alareunan paluulinkki pois — alapalkin tabit ovat väylä
       (yläreunan linkki on jo piilossa topbar-rightin mukana) */
    'body.vp-has-tabbar .an-foot{display:none;}',
    /* Suunnitelmat: Uusi suunnitelma tiiviinä nappina — vaihtoehdot ja
       tuonti/vienti aukeavat vasta napautuksesta (webissä kaikki auki) */
    'body.vp-has-tabbar .ph-new{padding:10px 12px;}',
    'body.vp-has-tabbar .ph-new-toggle{width:100%;justify-content:center;font-size:14px;padding:11px 14px;}',
    'body.vp-has-tabbar .ph-new-body{margin-top:12px;}',
    'body.vp-has-tabbar .ph-new-body .ph-opt{width:100%;}',
    /* suunnitelmarivin nimi: kaksi riviä ellipsiksen sijaan kapealla */
    'body.vp-has-tabbar .ph-name .nm{white-space:normal;line-height:1.25;font-size:13px;',
    ' display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}',
    /* Suunnitelmani-dokumentin taitteet: osiot aukeavat tarpeeseen */
    'body.vp-has-tabbar .sum-taite summary{list-style:none;cursor:pointer;-webkit-tap-highlight-color:transparent;}',
    'body.vp-has-tabbar .sum-taite summary::-webkit-details-marker{display:none;}',
    'body.vp-has-tabbar .sum-taite summary h2{display:inline-block;}',
    'body.vp-has-tabbar .sum-taite summary::after{content:"▸";color:var(--text-dim,#93a1b8);margin-left:9px;font-size:14px;}',
    'body.vp-has-tabbar .sum-taite[open] summary::after{content:"▾";}',
    /* etusivun syöttökortit taittuvat otsikkoriveiksi: appiin tullaan
       katsomaan tilannetta — muokkaus avataan tarpeeseen (kuten tase) */
    'body.vp-has-tabbar .panel .card[data-card]{--vp-kortti:1;}',
    'body.vp-has-tabbar .panel .card[data-card] > h2{cursor:pointer;-webkit-tap-highlight-color:transparent;position:relative;padding-right:20px;}',
    'body.vp-has-tabbar .panel .card[data-card] > h2::after{content:"▾";position:absolute;right:0;top:1px;color:var(--text-faint,#6b7ba4);font-size:14px;font-weight:400;}',
    'body.vp-has-tabbar .panel .card.vp-kiinni > h2::after{content:"▸";}',
    'body.vp-has-tabbar .panel .card.vp-kiinni > h2{margin-bottom:0;}',
    'body.vp-has-tabbar .panel .card.vp-kiinni > *:not(h2){display:none !important;}',
    /* sivujen sulkeutuminen: sama liike ulos kuin sisään */
    '@keyframes vp-page-out{from{transform:none;opacity:1}to{transform:translateY(14px);opacity:0}}',
    'body.vp-has-tabbar .vp-pois{animation:vp-page-out 0.15s ease forwards;}',
    /* tabi-ikonin mikropomppu valittaessa */
    '@keyframes vp-tab-pop{0%{transform:scale(1)}45%{transform:scale(1.16)}100%{transform:scale(1)}}',
    'body.vp-has-tabbar .vp-tab.act svg{animation:vp-tab-pop 0.25s ease;}',
    /* käynnistyksen sisääntulo: tunnusluvut portaittain (kylmäkäynnistys) */
    '@keyframes vp-stat-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    'body.vp-has-tabbar.vp-intro .stats .stat{animation:vp-stat-in 0.4s ease backwards;}',
    'body.vp-has-tabbar.vp-intro .stats .stat:nth-child(2){animation-delay:0.06s;}',
    'body.vp-has-tabbar.vp-intro .stats .stat:nth-child(3){animation-delay:0.12s;}',
    'body.vp-has-tabbar.vp-intro .stats .stat:nth-child(4){animation-delay:0.18s;}',
    'body.vp-has-tabbar.vp-intro .stats .stat:nth-child(5){animation-delay:0.24s;}',
    /* liikeherkille kaikki koristeliike pois */
    '@media (prefers-reduced-motion: reduce){body.vp-has-tabbar .vp-tab.act svg,body.vp-has-tabbar .menu,',
    ' body.vp-has-tabbar .summary,body.vp-has-tabbar .vp-pois,body.vp-has-tabbar.vp-intro .stats .stat{animation:none !important;}}',
    /* Tulkin tyhjä aloitusnäkymä: ehdotukset korteiksi peukalon ulottuville */
    'body.vp-has-tabbar .tk-sugs-alku{flex-direction:column;align-items:stretch;gap:8px;padding:0 14px 12px;}',
    'body.vp-has-tabbar .tk-sugs-alku .tk-sug{width:100%;text-align:left;font-size:14px;padding:12px 14px;border-radius:12px;}',
    'body.vp-has-tabbar .tk-alku-otsikko{font-size:10.5px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;',
    ' color:var(--text-dim,#93a1b8);margin:0 2px 2px;}',
    /* Toteuma-sivu (natiivilisat.js rakentaa sisällön .menu-pohjalle).
       HUOM: style.css:n .menu button (valikkorivit: width 100 %, background
       none) osuu myös näihin — napit ylikirjoitetaan omaan muotoonsa */
    'body.vp-has-tabbar .vp-toteuma .vpt-nyt{display:flex;gap:8px;margin:6px 10px 14px;}',
    'body.vp-has-tabbar .vp-toteuma .vpt-nyt button{width:auto;flex:0 0 auto;display:inline-block;text-align:center;',
    ' padding:10px 20px;background:var(--accent,#2dd4bf);color:#0a0e1a;font-weight:700;font-size:14px;border-radius:10px;}',
    'body.vp-has-tabbar .vp-toteuma .vpt-nyt input{flex:1;min-width:0;font:inherit;font-size:16px;padding:10px 12px;',
    ' background:rgba(45,212,191,0.06);border:1px solid var(--border,rgba(148,168,220,0.14));border-radius:10px;color:var(--text,#e8ecf8);}',
    'body.vp-has-tabbar .vp-toteuma .vpt-tila{margin:0 10px 12px;padding:12px 14px;border-radius:12px;font-weight:700;',
    ' background:linear-gradient(180deg,var(--card,#111a2e),var(--bg-2,#0e1424));border:1px solid var(--border,rgba(148,168,220,0.14));}',
    'body.vp-has-tabbar .vp-toteuma .vpt-tila small{display:block;font-weight:400;color:var(--text-dim,#93a1b8);margin-top:3px;}',
    'body.vp-has-tabbar .vp-toteuma .vpt-rivi{display:flex;justify-content:space-between;gap:10px;align-items:center;',
    ' padding:9px 10px;border-top:1px solid var(--border-soft,rgba(148,168,220,0.08));font-size:13.5px;}',
    'body.vp-has-tabbar .vp-toteuma .vpt-rivi .d{color:var(--text-dim,#93a1b8);font-size:12px;}',
    'body.vp-has-tabbar .vp-toteuma .vpt-rivi .x{width:auto;display:inline-block;background:none;border:0;color:var(--text-faint,#6b7ba4);font-size:15px;cursor:pointer;padding:2px 6px;}',
    'body.vp-has-tabbar .vp-toteuma .vpt-info{margin:10px 10px 0;font-size:12px;color:var(--text-faint,#6b7ba4);}',
    /* Vuositaulukko: Lataa CSV otsikkorivin oikeaan reunaan, Sulje pois */
    'body.vp-has-tabbar #tableModal .sum-bar{order:0;justify-content:flex-end;margin:0 4px -66px 0;position:relative;z-index:2;}',
    'body.vp-has-tabbar #tableClose{display:none;}',
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
    toteuma: 'vp-a-toteuma', uusi: 'vp-avaa-uusi',
  };

  /* ---------- Haptiikka ja liike ---------- */
  // Kevyt napsahdus sormiin siellä missä jokin loksahtaa: tabit, kytkimet,
  // piirtopöydän vuosisnapit (piirtopoyta.js kutsuu window.vpHaptic-koukkua,
  // joka on olemassa vain appissa — webissä kutsu on no-op-vahdittu).
  function napsu(tyyli) {
    try {
      var H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
      if (H && H.impact) H.impact({ style: tyyli || 'Light' }).catch(function () {});
    } catch (e) { /* haptiikka ei saa koskaan kaataa mitään */ }
  }
  window.vpHaptic = napsu;

  var REDUCED = false;
  try { REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // Sivun sulkeutuminen samalla liikkeellä kuin avautuminen: lyhyt ulosliuku,
  // ja vasta sen jälkeen varsinainen sulku (fn). Liikeherkille suoraan fn.
  function animoiPois(el, fn) {
    if (REDUCED || !el || el.hidden) { fn(); return; }
    if (el.dataset.vpPois) return; // jo sulkeutumassa
    el.dataset.vpPois = '1';
    el.classList.add('vp-pois');
    setTimeout(function () {
      delete el.dataset.vpPois;
      el.classList.remove('vp-pois');
      fn();
    }, 150);
  }

  function etusivulle(lippu) {
    try { sessionStorage.setItem(lippu, '1'); } catch (e) {}
    location.href = './index.html';
  }
  function kotona(fn, lippu) {
    return function () { if (!onIndex) etusivulle(lippu); else fn(); };
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
      animoiPois(s, function () {
        var c = document.getElementById('sumClose');
        if (c) c.click(); else s.hidden = true;
      });
    }
  }
  function suljeModaalit() {
    // muutkin peitesivut (Vuositaulukko, Tietoa, Pro…) kiinni tabivaihdossa —
    // sivumallissa tabi vie aina puhtaaseen näkymään
    document.querySelectorAll('.summary:not([hidden])').forEach(function (m) {
      if (m.id === 'summary') suljeSuunnitelma();
      else animoiPois(m, function () { m.hidden = true; });
    });
  }
  function suljeTulkki() {
    var tk = document.querySelector('.tk-sheet');
    if (tk && !tk.hidden) {
      animoiPois(tk, function () {
        var x = tk.querySelector('.tk-x');
        if (x) x.click();
      });
    }
  }
  function suljeAvoimet() {
    suljeSheet();
    suljeModaalit();
    suljeTulkki();
    if (window.vpSuljeToteuma) window.vpSuljeToteuma();
  }

  /* ---------- Lisää-sheet (sama sisältö joka sivulla) ---------- */

  var sheetEl = null;
  var tabPolku = null, tabTilastot = null, tabAi = null, tabSuunnitelma = null, tabLisaa = null;

  /* Yksi totuus tabien tilasta ja taustan skrollilukosta: avoin sivu
     (Lisää > Tulkki > Suunnitelma) määrää aktiivisen tabin, ja mikä tahansa
     avoin sivu lukitsee taustasivun skrollauksen (vp-sivu-auki). */
  function paivitaTabit() {
    if (!tabPolku) return;
    var tk = document.querySelector('.tk-sheet');
    var sum = document.getElementById('summary');
    var tkAuki = !!(tk && !tk.hidden);
    var sumAuki = !!(sum && !sum.hidden);
    var sheetAuki = !!sheetEl;
    tabLisaa.classList.toggle('act', sheetAuki);
    tabAi.classList.toggle('act', !sheetAuki && tkAuki);
    tabSuunnitelma.classList.toggle('act', !sheetAuki && !tkAuki && sumAuki);
    var perus = !sheetAuki && !tkAuki && !sumAuki;
    tabPolku.classList.toggle('act', perus && onIndex);
    tabTilastot.classList.toggle('act', perus && onStats);
    document.body.classList.toggle('vp-sivu-auki', sheetAuki || tkAuki || sumAuki);
  }

  function suljeSheet() {
    if (!sheetEl) return;
    var el = sheetEl;
    sheetEl = null; // heti pois kirjanpidosta — uusi avaus ei törmää sulkeutuvaan
    animoiPois(el, function () { el.remove(); paivitaTabit(); });
    paivitaTabit();
  }
  /* skrollaaja on appissa body (dokumentti on lukittu) — ylös molemmilla */
  function ylos() {
    try { document.body.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    suljeSuunnitelma();
    suljeTulkki();
    if (window.vpSuljeToteuma) window.vpSuljeToteuma();
    var menu = document.createElement('div');
    menu.className = 'menu';
    var otsikko = document.createElement('div');
    otsikko.className = 'vp-sivuotsikko';
    otsikko.textContent = 'Lisää';
    menu.appendChild(otsikko);

    /* Kaksijako (Olavin jäsennys 8.8.): SIVUT = navigointi, ASETUKSET =
       on/off-tilat kytkiminä (sama switch kuin Polku-sivun säädöissä).
       Ryhmät korttitaustoilla, jotta kokonaisuudet erottuvat. */
    var ryhmaEl = null;
    var ryhma = function (label) {
      var r = document.createElement('div');
      r.className = 'vp-ryhma';
      var s = document.createElement('div');
      s.className = 'msect';
      s.textContent = label;
      r.appendChild(s);
      menu.appendChild(r);
      ryhmaEl = r;
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
      (ryhmaEl || menu).appendChild(b);
      return b;
    };
    // Kytkinrivi: napautus ei sulje sivua — tila näkyy heti switchissä.
    // toggleFn saa paivita-callbackin, jota myös asynkroniset kytkennät
    // (ilmoituslupa, Face ID) kutsuvat kun tila on ratkennut.
    var kytkin = function (id, name, desc, tilaFn, toggleFn) {
      var b = document.createElement('button');
      b.id = id;
      b.className = 'vp-kytkinrivi';
      // flex asuu sisäkääreessä: <button> flex-kontainerina on WebKitissä
      // epäluotettava (Chromiumissa ok, laitteella switch vuoti kortista yli)
      b.innerHTML = '<span class="vp-krow">' +
        '<span class="vp-kr"><span class="vp-kr-nimi">' + name + '</span><span class="mdesc">' + desc + '</span></span>' +
        '<span class="toggle vp-kr-sw"><input type="checkbox" tabindex="-1" aria-hidden="true"><span class="switch"></span></span>' +
        '</span>';
      var input = b.querySelector('input');
      var paivita = function () { input.checked = !!tilaFn(); };
      paivita();
      b.addEventListener('click', function () { napsu('Light'); toggleFn(paivita); });
      (ryhmaEl || menu).appendChild(b);
      return b;
    };

    ryhma('Sivut');
    add('mi-taulukko', 'Vuositaulukko', 'Vuosikohtaiset luvut taulukkona ja CSV:nä',
      kotona(toimTaulukko, LIPUT.taulukko));
    add('mi-toteuma', 'Toteuma', 'Kirjaa toteutunut varallisuutesi — oletko polulla?',
      kotona(function () { if (window.vpAvaaToteuma) window.vpAvaaToteuma(); }, LIPUT.toteuma));
    add('mi-analytics', 'Tilastot', 'Miten muut suunnittelevat vaurastumista — avoin data',
      function () { if (onStats) ylos(); else location.href = './analytiikka.html'; });
    add('mi-agents', 'Agentit', 'Kytke oma tekoälyavustajasi laskentamoottoriin (MCP)',
      function () { location.href = './agentit.html'; });
    add('mi-info', 'Tietoa palvelusta', 'Oletukset, tietosuoja ja vinkit', kotona(toimTietoa, LIPUT.tietoa));
    add('mi-tour', 'Esittelykierros', 'Palvelun läpikäynti yhdeksällä klikkauksella',
      kotona(function () { startTour(); }, LIPUT.kierros));

    ryhma('Asetukset');
    kytkin('mi-compare', 'Vertailu', 'Nykyinen suunnitelma haamukäyräksi graafiin',
      function () { return onIndex && typeof baseline !== 'undefined' && !!baseline; },
      function (paivita) {
        if (!onIndex) { etusivulle(LIPUT.vertaile); return; }
        toimVertaile();
        paivita();
      });
    kytkin('mi-theme', 'Vaalea teema', 'Vaihda värimaailma — valinta muistetaan',
      function () { return document.documentElement.classList.contains('light'); },
      function (paivita) { vaihdaTeema(); paivita(); });
    kytkin('mi-pro', 'Pro-tila', 'Ammattilaisen säädöt ja analyysit',
      function () { return onIndex && typeof state !== 'undefined' && !!state.proOn; },
      function (paivita) {
        if (!onIndex) { etusivulle(LIPUT.pro); return; }
        // ensimmäinen kytkentä kulkee esittelysivun kautta kuten webissäkin
        if (!state.proOn && !proSeen()) { suljeSheet(); openProModal(); return; }
        setPro(!state.proOn);
        paivita();
      });
    if (window.vpNativeMenu) window.vpNativeMenu(add, kytkin); // muistutukset + lukitus

    ryhmaEl = null; // nollaus omana rivinään ryhmien alla

    // Nollaus: kaksivaiheinen vahvistus sheetissä. Tilastot-sivulta siirrytään
    // etusivulle sheet auki — tuhoavaa toimintoa ei ajeta lipun kautta.
    add('mi-reset', 'Nollaa suunnitelma', 'Poistaa avoinna olevan suunnitelman — muut rivit säilyvät',
      function (b) {
        if (!onIndex) { etusivulle(LIPUT.sheet); return; }
        if (b.dataset.armed) { napsu('Medium'); nollaaAktiivinen(); return; }
        napsu('Medium');
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
    paivitaTabit();
  }

  /* ---------- Etusivun korttien taitto ---------- */
  // Appiin tullaan katsomaan tilannetta: graafi ja tunnusluvut ovat kärjessä,
  // ja syöttökortit (Perustiedot, Elämäntapahtumat, Aikajanalla, Allokaatio)
  // taittuvat otsikkoriveiksi kuten tase. Avoimet kortit muistetaan.
  var KORTIT_KEY = 'vp-kortit-auki-v1';

  function korttienTaitto() {
    if (!onIndex) return;
    var auki = [];
    try { auki = JSON.parse(localStorage.getItem(KORTIT_KEY)) || []; } catch (e) {}
    document.querySelectorAll('.panel .card[data-card]').forEach(function (kortti) {
      var nimi = kortti.dataset.card;
      if (nimi === 'about') return; // piilossa appissa
      var h2 = kortti.querySelector(':scope > h2');
      if (!h2) return;
      kortti.classList.toggle('vp-kiinni', auki.indexOf(nimi) === -1);
      h2.addEventListener('click', function (e) {
        // perhechipit elävät Perustiedot-otsikossa — niiden napautus ei taita
        if (e.target.closest('.fam-chips')) return;
        napsu('Light');
        var kiinni = kortti.classList.toggle('vp-kiinni');
        var lista = [];
        try { lista = JSON.parse(localStorage.getItem(KORTIT_KEY)) || []; } catch (er) {}
        lista = lista.filter(function (x) { return x !== nimi; });
        if (!kiinni) lista.push(nimi);
        try { localStorage.setItem(KORTIT_KEY, JSON.stringify(lista)); } catch (er) {}
      });
    });
  }

  /* ---------- Käynnistyksen sisääntulo ---------- */
  // Kerran per käynnistys (sessionStorage): polkuviiva piirtyy esiin ja
  // tunnusluvut nousevat portaittain. Odottaa logoruudun poistumista, ettei
  // liike tapahdu peitteen alla. Liikeherkille ei mitään.
  function introAnimaatio() {
    if (!onIndex || REDUCED) return;
    try {
      if (sessionStorage.getItem('vp-intro-ok')) return;
      sessionStorage.setItem('vp-intro-ok', '1');
    } catch (e) { return; }
    var yritys = 0;
    (function odota() {
      if (++yritys > 120) return; // ~12 s — lukko voi odottaa Face ID:tä
      if (document.getElementById('vpLukko')) { setTimeout(odota, 100); return; }
      var p = document.querySelector('#chart path[stroke="url(#lineGrad)"]');
      if (!p) { setTimeout(odota, 100); return; }
      document.body.classList.add('vp-intro');
      setTimeout(function () { document.body.classList.remove('vp-intro'); }, 1400);
      try {
        var len = p.getTotalLength();
        p.style.strokeDasharray = len + ' ' + len;
        p.style.strokeDashoffset = len;
        p.style.transition = 'stroke-dashoffset 0.9s ease';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { p.style.strokeDashoffset = '0'; });
        });
        // siivous: uudelleenpiirto korvaa polun joka tapauksessa puhtaalla
        setTimeout(function () {
          p.style.strokeDasharray = '';
          p.style.strokeDashoffset = '';
          p.style.transition = '';
        }, 1000);
      } catch (e) { /* SVG-mittaus voi kaatua piilotettuna — ohitetaan */ }
    })();
  }

  /* ---------- Appitekstit ---------- */
  // Web puhuu selaimesta, appi laitteesta — staattisen HTML:n maininnat
  // vaihdetaan tekstisolmuista (elementit ja kuuntelijat säilyvät).
  // Dynaamiset tekstit (Suunnitelmat, Tulkki, kierros, Tilastot-portti)
  // valitsevat sanansa itse omalla Capacitor-tarkistuksellaan.

  function vaihdaTekstit(root, parit) {
    if (!root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) {
      var t = n.nodeValue;
      for (var i = 0; i < parit.length; i++) t = t.replace(parit[i][0], parit[i][1]);
      if (t !== n.nodeValue) n.nodeValue = t;
    }
  }

  function appitekstit() {
    vaihdaTekstit(document.querySelector('.panel .disclaimer'), [['selaimeesi', 'laitteellesi']]);
    vaihdaTekstit(document.getElementById('ramp'), [['tapahtuu selaimessasi', 'tapahtuu omalla laitteellasi']]);
    vaihdaTekstit(document.getElementById('proModal'), [['omassa selaimessasi', 'omalla laitteellasi']]);
    vaihdaTekstit(document.getElementById('infoModal'), [
      ['Oikean reunan', 'Alapalkin'],
      ['-kielekkeestä', '-välilehdestä'],
      [/☰-valikossa/g, 'Lisää-valikossa'],
      [/\(paneelin\s+yläreunan kytkin\)/, '(Lisää-valikon Asetuksissa)'],
      [/\(graafin alla\)/, '(Lisää-valikossa)'],
      [/Sovelluksen voi\s+asentaa aloitusnäytölle \(PWA\), jolloin se/, 'Sovellus'],
      [/kokonaan selaimessa ja suunnitelma tallentuu selaimen omaan muistiin\s+\(localStorage\)/, 'kokonaan laitteellasi ja suunnitelma tallentuu sovelluksen omaan muistiin'],
      ['tallessa samassa selaimessa', 'tallessa samalla laitteella'],
    ]);
    // Tilastot-sivun alaviite
    vaihdaTekstit(document.querySelector('.an-main > .disclaimer'), [['omassa selaimessasi', 'omalla laitteellasi']]);
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

    var polku = tab('polku', 'Polku', onIndex);
    polku.addEventListener('click', function () {
      napsu('Light');
      if (!onIndex) { location.href = './index.html'; return; }
      suljeAvoimet();
      ylos();
    });

    var tilastot = tab('tilastot', 'Tilastot', onStats);
    tilastot.addEventListener('click', function () {
      napsu('Light');
      if (onStats) { suljeSheet(); if (window.vpSuljeToteuma) window.vpSuljeToteuma(); ylos(); return; }
      location.href = './analytiikka.html';
    });

    var ai = tab('ai', 'Kysy AI', false);
    ai.addEventListener('click', function () {
      napsu('Light');
      if (!onIndex) { etusivulle(LIPUT.tulkki); return; }
      var tk = document.querySelector('.tk-sheet');
      if (tk && !tk.hidden) return; // jo auki
      suljeSheet();
      suljeModaalit();
      if (window.vpSuljeToteuma) window.vpSuljeToteuma();
      var h = document.querySelector('.tk-handle');
      if (h) h.click();
    });

    var suunnitelma = tab('suunnitelma', 'Suunnitelma', false);
    suunnitelma.addEventListener('click', function () {
      napsu('Light');
      if (!onIndex) { etusivulle(LIPUT.suunnitelma); return; }
      var s = document.getElementById('summary');
      if (s && !s.hidden) return; // jo auki
      suljeSheet();
      suljeModaalit();
      suljeTulkki();
      if (window.vpSuljeToteuma) window.vpSuljeToteuma();
      if (typeof window.openSummary === 'function') window.openSummary();
    });

    var lisaa = tab('lisaa', 'Lisää', false);
    lisaa.addEventListener('click', function () { napsu('Light'); avaaSheet(); });

    /* ID:t antavat kiinnityspisteen appikohtaisille osoittimille (mm.
       esittelykierros osoittaa tabeihin webin piilotettujen nappien sijaan) */
    polku.id = 'vpTabPolku'; tilastot.id = 'vpTabTilastot'; ai.id = 'vpTabAi';
    suunnitelma.id = 'vpTabSuunnitelma'; lisaa.id = 'vpTabLisaa';
    bar.appendChild(polku);
    bar.appendChild(tilastot);
    bar.appendChild(ai);
    bar.appendChild(suunnitelma);
    bar.appendChild(lisaa);
    document.body.appendChild(bar);
    document.body.classList.add('vp-has-tabbar');
    appitekstit();
    korttienTaitto();
    introAnimaatio();

    /* Pikatoiminnot (kuvakkeen pitkä painallus) ja muut natiivipolut ajavat
       saman toiminnon kuin tabit — natiivilisat.js kutsuu tätä kun laite
       kertoo odottavasta oikotiestä */
    window.vpAjaLippu = function (mika) {
      if (mika === 'tulkki') {
        if (!onIndex) { etusivulle(LIPUT.tulkki); return; }
        suljeAvoimet();
        var h = document.querySelector('.tk-handle');
        if (h) h.click();
      } else if (mika === 'suunnitelma') {
        if (!onIndex) { etusivulle(LIPUT.suunnitelma); return; }
        suljeAvoimet();
        if (typeof window.openSummary === 'function') window.openSummary();
      } else if (mika === 'uusi') {
        if (!onIndex) { etusivulle(LIPUT.uusi); return; }
        suljeAvoimet();
        if (typeof window.openSummary === 'function') {
          window.openSummary();
          var t = document.querySelector('.ph-new-toggle');
          if (t) t.click();
        }
      } else if (mika === 'toteuma') {
        if (!onIndex) { etusivulle(LIPUT.toteuma); return; }
        suljeAvoimet();
        if (window.vpAvaaToteuma) window.vpAvaaToteuma();
      }
    };

    tabPolku = polku; tabTilastot = tilastot; tabAi = ai;
    tabSuunnitelma = suunnitelma; tabLisaa = lisaa;

    /* Tulkin kehotepaikka lyhyeksi appissa — webin pitkä esimerkki
       ("Kysy tai kokeile: …") ahtautui kapeaan kenttään sekavasti */
    var tkInp = document.getElementById('tkInput');
    if (tkInp) tkInp.placeholder = 'Kysy suunnitelmastasi…';

    /* tab-aktiivitilat ja taustan skrollilukko: Tulkin ja Suunnitelman
       avautumista vahditaan hidden-attribuutista (avautuvat myös muualta
       kuin tabeista), Lisää-sivu päivittää tilansa itse */
    if (onIndex) {
      setTimeout(function () {
        var tk = document.querySelector('.tk-sheet');
        var sum = document.getElementById('summary');
        var mo = new MutationObserver(paivitaTabit);
        if (tk) mo.observe(tk, { attributes: true, attributeFilter: ['hidden'] });
        if (sum) mo.observe(sum, { attributes: true, attributeFilter: ['hidden'] });
        paivitaTabit();
      }, 400);
    }

    /* Muilta sivuilta tulleet toimintoliput: ajetaan HETI (ei viivettä —
       Tulkin avausvälähdys pois: sivu on auki jo ensimmäisessä maalauksessa) */
    if (onIndex) {
      var lippu = function (k) {
        try { var v = sessionStorage.getItem(k); if (v) sessionStorage.removeItem(k); return !!v; } catch (e) { return false; }
      };
      if (lippu(LIPUT.tulkki)) { var h0 = document.querySelector('.tk-handle'); if (h0) h0.click(); }
      if (lippu(LIPUT.suunnitelma) && typeof window.openSummary === 'function') window.openSummary();
      if (lippu(LIPUT.uusi) && typeof window.openSummary === 'function') {
        window.openSummary();
        var t0 = document.querySelector('.ph-new-toggle');
        if (t0) t0.click();
      }
      // Toteuma asuu natiivilisat.js:ssä, joka latautuu tämän jälkeen — siksi viive
      if (lippu(LIPUT.toteuma)) setTimeout(function () { if (window.vpAvaaToteuma) window.vpAvaaToteuma(); }, 0);
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
