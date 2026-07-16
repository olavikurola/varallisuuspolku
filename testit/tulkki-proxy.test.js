'use strict';

/* Tulkki-välityksen testit (ei riippuvuuksia, ei oikeita API-kutsuja).
   Mock-upstream esittää mallitoimittajaa; palvelin käynnistetään aliprosessina
   TULKKI_UPSTREAM osoitettuna mockiin. Ajo: node testit/tulkki-proxy.test.js */

const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const SERVER = path.join(__dirname, '..', 'palvelin', 'server.js');
const MOCK_PORT = 8790, MAIN_PORT = 8791, OFF_PORT = 8792;
const API = `http://127.0.0.1:${MAIN_PORT}`;

let failed = 0;
const ok = (c, name, d = '') => {
  if (c) console.log('  ✓ ' + name);
  else { failed++; console.error('  ✗ ' + name + (d ? ' — ' + d : '')); }
};

/* Mock-upstream: tallentaa viimeisimmän pyynnön tarkistuksia varten */
let lastUpstream = null;
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => body += c);
  req.on('end', () => {
    lastUpstream = { url: req.url, headers: req.headers, body: JSON.parse(body) };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      model: 'mock-malli',
      content: [{ type: 'text', text: 'Onnistumistodennäköisyys on 99 %, koska säästöaika on pitkä.' }],
      usage: { input_tokens: 1234, output_tokens: 56 },
    }));
  });
});

function spawnServer(port, extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-tulkki-'));
  return spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, ...extraEnv },
    stdio: 'ignore',
  });
}

async function waitUp(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return;
    } catch (e) { /* ei vielä */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('palvelin ei käynnistynyt portissa ' + port);
}

const post = (payload) => fetch(`${API}/tulkki`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const CTX = { plan: { ageNow: 30 }, stats: { onnistumistodennakoisyysPct: 99, verovuosi: 2026 }, years: { rivit: [[65, 500000, 0, 28800, 3200, 18000]] } };

(async () => {
  await new Promise((r) => mock.listen(MOCK_PORT, r));
  const main = spawnServer(MAIN_PORT, {
    ANTHROPIC_API_KEY: 'test-avain',
    TULKKI_KEYS: 'oma-avain, kaveri-avain',
    TULKKI_UPSTREAM: `http://127.0.0.1:${MOCK_PORT}`,
    TULKKI_DAILY_MAX: '6',
  });
  const off = spawnServer(OFF_PORT, {}); // ei env-muuttujia → 503
  await waitUp(MAIN_PORT);
  await waitUp(OFF_PORT);

  console.log('Portti ja avain');
  {
    const r = await fetch(`http://127.0.0.1:${OFF_PORT}/tulkki`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'x', question: 'moi', context: CTX }),
    });
    ok(r.status === 503, 'ilman ympäristömuuttujia → 503 disabled');
    const bad = await post({ key: 'väärä', question: 'moi', context: CTX });
    ok(bad.status === 401, 'väärä avain → 401');
    const trimmed = await post({ key: 'kaveri-avain', question: 'moi', context: CTX });
    ok(trimmed.status === 200, 'pilkkulistan toinen avain kelpaa (trimmaus)');
  }

  console.log('Validointi');
  {
    const noQ = await post({ key: 'oma-avain', context: CTX });
    ok(noQ.status === 400, 'puuttuva kysymys → 400');
    const longQ = await post({ key: 'oma-avain', question: 'x'.repeat(601), context: CTX });
    ok(longQ.status === 400, 'liian pitkä kysymys → 400');
    const bigCtx = await post({ key: 'oma-avain', question: 'moi', context: { pad: 'x'.repeat(17000) } });
    ok(bigCtx.status === 400, 'liian iso konteksti → 400');
  }

  console.log('Onnistunut selitys');
  {
    const r = await post({
      key: 'oma-avain', question: 'Miksi onnistuminen on 99 %?', context: CTX,
      history: [{ q: 'aiempi kysymys', a: 'aiempi vastaus' }],
    });
    const data = await r.json();
    ok(r.status === 200 && /99 %/.test(data.answer), 'vastaus välittyy läpi', JSON.stringify(data));
    ok(data.model === 'mock-malli' && data.usage.in === 1234, 'malli ja tokenmäärät mukana');
    const up = lastUpstream.body;
    ok(lastUpstream.url === '/v1/messages', 'oikea upstream-polku');
    ok(lastUpstream.headers['x-api-key'] === 'test-avain', 'API-avain vain palvelimelta');
    ok(up.model === 'claude-haiku-4-5' && up.max_tokens === 700, 'malli ja max_tokens lukittu palvelimella');
    ok(up.system[0].cache_control && up.system[0].cache_control.type === 'ephemeral', 'järjestelmäkehote välimuistimerkitty');
    ok(/ÄLÄ laske itse/.test(up.system[0].text) && /sijoitusneuvontaa/.test(up.system[0].text), 'sävyvartijat kehotteessa');
    ok(up.messages.length === 3 && up.messages[0].content === 'aiempi kysymys', 'historia kulkee vuoroina');
    const last = up.messages[2].content;
    ok(/KONTEKSTI:/.test(last) && /KYSYMYS: Miksi onnistuminen/.test(last), 'konteksti + kysymys viimeisessä vuorossa');
  }

  console.log('Varainhoitajakäännös (advisor)');
  {
    const r = await post({ key: 'oma-avain', mode: 'advisor', context: CTX });
    ok(r.status === 200, 'advisor ei vaadi kysymystä');
    ok(/TEHTÄVÄ: Laadi/.test(lastUpstream.body.messages[0].content), 'advisor-tehtävä palvelimen määräämä');
  }

  console.log('Päiväkatkaisija');
  {
    // 6 kutsua käytetty yllä (3 onnistunutta + advisor + trimmed = 5... katto laukeaa laskurista)
    let capped = null;
    for (let i = 0; i < 6; i++) {
      const r = await post({ key: 'oma-avain', question: 'vielä yksi', context: CTX });
      if (r.status === 429) { capped = await r.json(); break; }
    }
    ok(capped && capped.error === 'daily_cap', 'globaali päiväraja katkaisee (429 daily_cap)');
  }

  console.log('Regressio: /donate ja /health ennallaan');
  {
    const h = await fetch(`${API}/health`);
    ok(h.status === 200, '/health ok');
    const d = await fetch(`${API}/donate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        v: 1, ageNow: 30, ageEnd: 90, startCapital: 20000, monthly: 1000,
        savingsGrowth: 1.5, alloc: { stocks: 70, bonds: 20 }, glide: false,
        real: false, tax: true,
        events: [{ type: 'retirement', age: 65, withdrawal: 2400, pension: 1500 }],
      }),
    });
    const dd = await d.json();
    ok(d.status === 200 && dd.ok === true, '/donate toimii kuten ennen', JSON.stringify(dd));
  }

  main.kill();
  off.kill();
  mock.close();
  console.log(failed ? `\n${failed} TESTIÄ EPÄONNISTUI` : '\nKaikki Tulkki-testit läpi.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
