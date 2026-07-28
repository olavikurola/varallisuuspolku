'use strict';
/* Hionta 2: otsikon katkeamattomuus, ?-chippi, vertailun mahtuvuus, kestävä tulo. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');

let failed = 0;
const ok = (c, name, d = '') => { if (c) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); } };

(async () => {
  const server = spawn('node', ['testit/selain/serve.js'], { cwd: require('path').join(__dirname, '..', '..') });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch();
  // Sama leveys kuin Olavin ruutukaappauksessa (2864 fyysistä / 2 = 1432)
  const page = await browser.newPage({ viewport: { width: 1432, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.route('**/tulkki', (route) => {
    const q = JSON.parse(route.request().postData()).question || '';
    const answer = /vertaa/i.test(q)
      ? 'Katso vertailu alta.\nVERTAILU: {"vaihtoehdot":[{"nimi":"Eläkeikä 60","muutokset":[{"kentta":"retAge","arvo":60}]},{"nimi":"Eläkeikä 63","muutokset":[{"kentta":"retAge","arvo":63}]},{"nimi":"Eläkeikä 65","muutokset":[{"kentta":"retAge","arvo":65}]}],"selite":"Kolmen eläkeiän vertailu"}'
      : 'Selitys.';
    const nd = JSON.stringify({ delta: answer }) + '\n' +
      JSON.stringify({ done: true, model: 'claude-haiku-4-5', usage: { in: 1500, out: 80 } }) + '\n';
    route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: nd });
  });

  await page.goto('http://localhost:8123/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vp-autotour-off', '1'); localStorage.setItem('vp-tour-done', '1'); localStorage.setItem('vp-tulkki-intro', '1'); });
  await page.goto('http://localhost:8123/?h2=1#tulkki=testikoodi');
  await page.waitForFunction(() => document.querySelectorAll('#chart path').length > 0);
  await page.waitForSelector('.stat .tk-why');

  console.log('?-chippi kulmassa');
  {
    const chip = await page.evaluate(() => {
      const b = document.querySelector('.stat .tk-why');
      const card = b.closest('.stat');
      const br = b.getBoundingClientRect(), cr = card.getBoundingClientRect();
      return { text: b.textContent, top: br.top - cr.top, fromRight: cr.right - br.right, w: br.width };
    });
    ok(chip.text === '?', 'chipin teksti on ?', chip.text);
    ok(chip.top < 12 && chip.fromRight < 12 && chip.fromRight >= 0, 'chippi kortin oikeassa yläkulmassa', JSON.stringify(chip));
  }

  console.log('Telakoitu tila: otsikko ei katkea kesken sanan');
  await page.click('.tk-handle');
  await page.waitForTimeout(400); // telakointianimaatio loppuun
  {
    // JOKAISEN kortin otsikon pisimmän sanan on mahduttava riville — ei katkoja kesken sanan
    const labs = await page.evaluate(() => {
      return [...document.querySelectorAll('.stat .k')].map((k) => {
        const cs = getComputedStyle(k);
        const span = document.createElement('span');
        span.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing};text-transform:${cs.textTransform}`;
        const longest = k.textContent.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0];
        span.textContent = longest;
        document.body.appendChild(span);
        const wordW = span.getBoundingClientRect().width;
        span.remove();
        const avail = k.clientWidth - parseFloat(cs.paddingRight || '0');
        return { text: k.textContent, longest, wordW: Math.round(wordW), avail: Math.round(avail), over: k.scrollWidth - k.clientWidth };
      });
    });
    const broken = labs.filter((l) => l.wordW > l.avail);
    ok(labs.some((l) => /Verot yhteensä/.test(l.text)), 'verokortti käyttää vertailun rivinimeä', JSON.stringify(labs.map((l) => l.text)));
    ok(broken.length === 0, 'jokaisen otsikon pisin sana mahtuu riville', JSON.stringify(broken));
    ok(labs.every((l) => l.over <= 0), 'mikään otsikko ei vuoda kortista');
    const grid = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.stat')];
      const tops = cards.map((s) => Math.round(s.getBoundingClientRect().top));
      const shown = cards.map((c) => c.querySelector('.v').innerText.trim());
      return { n: cards.length, rows: new Set(tops).size, shown };
    });
    ok(grid.n === 5 && grid.rows === 1, 'kaikki 5 korttia yhdellä rivillä telakoituna', JSON.stringify(grid));
    ok(/M€/.test(grid.shown.join('|')), 'tiiviit arvot käytössä kapeassa telakassa', JSON.stringify(grid.shown));
  }

  console.log('Vertailu: kompakti taulukko mahtuu, kestävä tulo lasketaan');
  await page.fill('#tkInput', 'vertaa eläkeikiä 60, 63 ja 65');
  await page.press('#tkInput', 'Enter');
  await page.waitForSelector('.tk-cmp-tbl');
  {
    const t = await page.evaluate(() => {
      const sc = document.querySelector('.tk-cmp-scroll');
      const rows = [...document.querySelectorAll('.tk-cmp-tbl tr')].map((r) => r.textContent);
      return { overflow: sc.scrollWidth - sc.clientWidth, rows };
    });
    ok(t.overflow <= 0, 'ei vaakavieritystä 4 sarakkeella', 'ylivuoto ' + t.overflow + 'px');
    const kest = t.rows.find((r) => /Kestävä/.test(r));
    ok(kest && /€\/kk/.test(kest) && !/–/.test(kest), 'Kestävä tulo -rivillä lasketut arvot', kest);
    const loppu = t.rows.find((r) => /Loppuvar/.test(r));
    ok(loppu && /M€/.test(loppu), 'Loppuvarallisuus kompaktina (M€)', loppu);
    const verot = t.rows.find((r) => /Verot/.test(r));
    ok(verot && /t€/.test(verot), 'Verot kompaktina (t€)', verot);
  }

  console.log('Markkinatesti mahtuu käännettynä');
  {
    const nT = await page.locator('.tk-cmp-tbl').count();
    await page.locator('.tk-market').click();
    await page.waitForFunction((n) => document.querySelectorAll('.tk-cmp-tbl').length > n, nT);
    const m = await page.evaluate(() => {
      const sc = [...document.querySelectorAll('.tk-cmp-scroll')].pop();
      return { overflow: sc.scrollWidth - sc.clientWidth };
    });
    ok(m.overflow <= 0, 'ei vaakavieritystä markkinatestissä', 'ylivuoto ' + m.overflow + 'px');
  }

  console.log('Miksi-kysymys ilman tavuviivamerkkiä');
  {
    let asked = null;
    await page.route('**/tulkki', (route) => {
      asked = JSON.parse(route.request().postData()).question;
      route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: JSON.stringify({ delta: 'Selitys.' }) + '\n' + JSON.stringify({ done: true, model: 'm', usage: { in: 1, out: 1 } }) + '\n' });
    });
    const nMsg = await page.locator('.tk-a').count();
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.stat')].find((s) => /Verot yhteensä/.test(s.textContent)).querySelector('.tk-why');
      b.click();
    });
    await page.waitForFunction((n) => document.querySelectorAll('.tk-a').length > n, nMsg);
    await page.waitForTimeout(300);
    // täysi euroarvo kysymykseen, vaikka kortissa näkyy tiivis (v-alt)
    ok(asked && /Verot yhteensä/.test(asked) && /85\s?575|85.575/.test(asked.replace(/[  ]/g, ' ')), 'kysymyksessä ehjä otsikko ja täysi arvo', JSON.stringify(asked));
  }

  await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'tulkki-hionta2.png') });
  ok(errors.length === 0, 'ei konsolivirheitä', errors.join(' | '));

  await browser.close();
  server.kill();
  console.log(failed ? `\n${failed} TARKISTUSTA EPÄONNISTUI` : '\nKaikki hionta 2 -tarkistukset läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
