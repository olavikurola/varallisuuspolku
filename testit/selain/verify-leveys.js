'use strict';
/* Verifiointi: staattiset sivut eivät vuoda sivun leveyttä kapealla näytöllä
   (390 px = iPhone). Löydös TestFlight 1.2:sta 5.9.2026: validointi.html:n
   laskuesimerkkitaulukot (td.num nowrap) ja muutoslokin sidotuilla
   välilyönneillä kirjoitettu kaava levittivät sivun 851 px leveäksi, jolloin
   koko sivu vieritti sivusuunnassa appissa. Sovelluksen etusivu on tarkoituksella
   pois: sen tiilirivit vierittävät omassa säiliössään.
   Käyttää aiemman istunnon playwright-asennusta (NODE_PATH). */
const { chromium } = require('playwright');
const { spawn } = require('child_process');

let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };

const SIVUT = [
  'validointi.html', 'validointi-en.html', 'analytiikka.html', 'analytiikka-en.html',
  'tietosuoja.html', 'tietosuoja-en.html', 'saavutettavuus.html', 'saavutettavuus-en.html',
  'agentit.html', 'agentit-en.html',
  'laskurit/elakelaskuri.html', 'laskurit/fire-laskuri.html', 'laskurit/paljonko-pitaa-saastaa-elakkeelle.html',
  'laskurit/osakesaastotili-vai-arvo-osuustili.html', 'laskurit/milloin-voin-jaada-elakkeelle.html',
  'laskurit/asuntolaina-vai-sijoittaminen.html',
];

(async () => {
  const server = spawn('node', ['testit/selain/serve.js'], { cwd: require('path').join(__dirname, '..', '..') });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  for (const w of [390, 360]) {
    console.log('leveys ' + w + ' px');
    const page = await browser.newPage({ viewport: { width: w, height: 844 } });
    for (const s of SIVUT) {
      await page.goto('http://localhost:8123/' + s);
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const de = document.documentElement;
        const out = { sw: de.scrollWidth, cw: de.clientWidth, syy: '' };
        if (out.sw > out.cw) {
          let max = 0;
          for (const el of document.querySelectorAll('body *')) {
            const b = el.getBoundingClientRect();
            const scrollable = el.closest('.table-scroll, .stats-scroll, [style*="overflow"]');
            if (!scrollable && b.right > max) { max = b.right; out.syy = el.tagName + '.' + el.className + ' → ' + Math.round(b.right) + ': ' + (el.textContent || '').trim().slice(0, 50); }
          }
        }
        return out;
      });
      // 2 px:n toleranssi: fonttimetriikka vaihtelee alustoittain (CI Linux vs. Windows),
      // eikä alle 3 px:n ylitys näy käyttäjälle sivuvierityksenä
      ok(r.sw <= r.cw + 2, s, `scrollWidth ${r.sw} > ${r.cw}; ${r.syy}`);
    }
    await page.close();
  }
  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} VIRHETTÄ` : '\nKaikki tarkistukset läpi.');
  process.exit(failed ? 1 : 0);
})();
