'use strict';

/* Selaintestien verkkoeristys (auditointi 11/2026).
   Sivut lataavat Plausible-skriptin ja Tulkki hakee vertailudatan tuotannon
   palvelimelta — ilman eristystä testit tekivät oikeita verkkopyyntöjä, niiden
   tulos riippui tuotantodatasta, ja verkkokatko näkyi konsolivirheenä
   ("Failed to load resource"), jonka 15 testiä tulkitsee epäonnistumiseksi.

   asenna(chromium) käärii launchin: jokainen konteksti vastaa muihin kuin
   paikallisiin http(s)-pyyntöihin tyhjällä 204:llä. Testin omat mockit
   (page.route / myöhemmin rekisteröity context.route) menevät edelle, joten
   stats.json- ja Tulkki-mockit toimivat kuten ennen.

   Käyttö testin alussa:
     const { chromium } = require('playwright');
     require('./eristys').asenna(chromium); */

const PAIKALLINEN = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const ulkoinen = (url) => {
  try { const u = new URL(url); return /^https?:$/.test(u.protocol) && !PAIKALLINEN.test(u.hostname); } catch (e) { return false; }
};

function asenna(chromium) {
  if (chromium.__vpEristetty) return;
  chromium.__vpEristetty = true;
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (...args) => {
    const browser = await launch(...args);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...a) => {
      const ctx = await newContext(...a);
      await ctx.route(ulkoinen, (r) => r.fulfill({ status: 204, body: '' }));
      return ctx;
    };
    // browser.newPage luo oman kontekstinsa sisäisesti — ohjataan eristetyn kautta
    browser.newPage = async (...a) => (await browser.newContext(...a)).newPage();
    return browser;
  };
}

module.exports = { asenna, ulkoinen };
