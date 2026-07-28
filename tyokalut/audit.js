// UX-auditointi: kaikki näkymät mobiilissa (390×844) ja työpöydällä (1280×800).
// Jokaisesta tilasta: vaakasuuntainen ylivuoto (sivu + ylivuotavat elementit,
// pl. tarkoituksella pyyhkäistävät), konsolivirheet ja ruutukaappaus.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');

const OVERFLOW_FN = `(() => {
  const docW = document.documentElement.clientWidth;
  const isInScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(s.overflowX)) return true;
    }
    return false;
  };
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[hidden]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right > docW + 2 && !isInScroller(el)) {
      bad.push(el.tagName.toLowerCase()
        + (el.id ? '#' + el.id : '')
        + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '')
        + ' right=' + Math.round(r.right));
    }
  }
  return {
    pageOverflowX: document.documentElement.scrollWidth - docW,
    bodyScrollX: document.body.scrollWidth - docW,
    offenders: [...new Set(bad)].slice(0, 10),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const report = {};

  for (const [device, vpOpts] of [
    ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
    ['desktop', { viewport: { width: 1280, height: 800 } }],
  ]) {
    const page = await browser.newPage(vpOpts);
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    const snap = async (name, fullPage = false) => {
      await page.waitForTimeout(350);
      const o = await page.evaluate(OVERFLOW_FN);
      o.errors = errors.splice(0);
      report[`${device}/${name}`] = o;
      await page.screenshot({ path: `audit-${device}-${name}.png`, fullPage });
    };

    await page.goto('http://localhost:8123/', { waitUntil: 'networkidle' });
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-tour-done', '1'); }); // kierros testataan erikseen
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    // 1) piirtopöytä: opasteet (ensivierailu)
    await snap('fs-opasteet');

    // 2) piirtopöytä: tapahtuma valittuna (chippi + ikäviiva)
    await page.evaluate(() => {
      const car = state.events.find((e) => e.type === 'car');
      drawSelect('event', car.id);
    });
    await snap('fs-valinta');

    // 3) piirtopöytä: tavoitepiste valittuna (chipin toiminnot)
    await page.evaluate(() => {
      const ev = addEvent('goal', 55);
      closePopover();
      drawSelect('goal', ev.id);
    });
    await snap('fs-tavoite');

    // 4) normaalinäkymä
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await snap('perusnakyma', true);

    // 5) vertailupalkki aktiivisena
    await page.evaluate(() => {
      state.monthly = 800; renderAll(); setBaseline();
      state.monthly = 1300; document.getElementById('monthly').value = 1300; renderAll();
    });
    await snap('vertailupalkki');

    // 6) muokkausdialogi (popover, lainallinen tapahtuma)
    await page.evaluate(() => {
      const home = state.events.find((e) => e.type === 'home');
      openPopover(home.id);
    });
    await snap('popover');
    await page.evaluate(() => closePopover());

    // 7) Suunnitelmani (raportoitu taulukkovuoto)
    await page.evaluate(() => openSummary());
    await snap('suunnitelmani', true);
    await page.evaluate(() => closeSummary());

    // 8) Tietoa palvelusta
    await page.evaluate(() => { document.getElementById('infoModal').hidden = false; });
    await snap('tietoa', true);
    await page.evaluate(() => { document.getElementById('infoModal').hidden = true; });

    // 9) Vuositaulukko
    await page.evaluate(() => { renderYearTable(); document.getElementById('tableModal').hidden = false; });
    await snap('vuositaulukko');
    await page.evaluate(() => { document.getElementById('tableModal').hidden = true; });

    // 10) Anonyymi jako: esikatselu + raaka-JSON auki
    await page.evaluate(() => { openDonateModal(); document.querySelector('.donate-raw').open = true; });
    await snap('jako-esikatselu', true);
    await page.evaluate(() => { document.getElementById('donateModal').hidden = true; });

    // 11) Vertailunäkymä (hakee prod-statsit)
    await page.evaluate(() => openCompareModal());
    await page.waitForTimeout(1200);
    await snap('vertailumodaali', true);
    await page.evaluate(() => { document.getElementById('compareModal').hidden = true; });

    // 12) ☰-valikko
    await page.evaluate(() => openMoreMenu(document.getElementById('moreBtn')));
    await snap('valikko');
    await page.evaluate(() => closeMoreMenu());

    // 13) Esimerkit-valikko
    await page.evaluate(() => {
      const t = document.querySelector('.examples-trigger');
      t.scrollIntoView();
      openExamplesMenu(t);
    });
    await snap('esimerkit');
    await page.evaluate(() => closeExamplesMenu());

    // 14) Vaurastumisen kartta
    await page.goto('http://localhost:8123/analytiikka.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await snap('analytiikka', true);

    await page.close();
  }

  await browser.close();
  fs.writeFileSync('audit-report.json', JSON.stringify(report, null, 2));
  // tiivistelmä: vain ongelmalliset tilat
  let issues = 0;
  for (const [k, v] of Object.entries(report)) {
    if (v.pageOverflowX > 2 || v.offenders.length || v.errors.length) {
      issues++;
      console.log(`⚠ ${k}: sivuX=${v.pageOverflowX} bodyX=${v.bodyScrollX}`);
      for (const o of v.offenders) console.log(`    ${o}`);
      for (const e of v.errors) console.log(`    JS: ${e}`);
    }
  }
  console.log(issues ? `\n${issues}/${Object.keys(report).length} tilassa löydöksiä` : '\nEi ohjelmallisia löydöksiä — visuaalinen tarkistus jäljellä');
})().catch((e) => { console.error(e); process.exit(1); });
