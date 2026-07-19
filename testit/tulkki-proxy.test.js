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
    // Anthropic-tyylinen SSE-virta (palvelin jäsentää tämän NDJSON:ksi)
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const sse = (o) => res.write('data: ' + JSON.stringify(o) + '\n\n');
    sse({ type: 'message_start', message: { model: 'mock-malli', usage: { input_tokens: 1234 } } });
    sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Onnistumistodennäköisyys on 99 %, ' } });
    sse({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'koska säästöaika on pitkä.' } });
    sse({ type: 'message_delta', usage: { output_tokens: 56 } });
    sse({ type: 'message_stop' });
    res.end();
  });
});

// Lukee palvelimen NDJSON-virran → { answer, model, usage, error }
async function drain(r) {
  const text = await r.text();
  let answer = '', model = null, usage = null, error = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.delta) answer += o.delta;
    else if (o.done) { model = o.model; usage = o.usage; }
    else if (o.error) error = o.error;
  }
  return { answer, model, usage, error };
}

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
    ok(r.headers.get('content-type').includes('ndjson'), 'vastaus on NDJSON-virta (suoratoisto)');
    const data = await drain(r);
    ok(r.status === 200 && /99 %/.test(data.answer), 'suoratoistettu vastaus koostuu paloista', JSON.stringify(data));
    ok(data.model === 'mock-malli' && data.usage.in === 1234, 'malli ja tokenmäärät lopussa');
    ok(lastUpstream.body.stream === true, 'palvelin pyysi mallilta suoratoistoa');
    const up = lastUpstream.body;
    ok(lastUpstream.url === '/v1/messages', 'oikea upstream-polku');
    ok(lastUpstream.headers['x-api-key'] === 'test-avain', 'API-avain vain palvelimelta');
    ok(up.model === 'claude-haiku-4-5' && up.max_tokens === 500, 'malli ja max_tokens (explain 500) lukittu palvelimella');
    ok(up.system[0].cache_control && up.system[0].cache_control.type === 'ephemeral', 'järjestelmäkehote välimuistimerkitty');
    ok(/ÄLÄ laske itse/.test(up.system[0].text) && /sijoitusneuvontaa/.test(up.system[0].text), 'sävyvartijat kehotteessa');
    ok(/MUUTOS:/.test(up.system[0].text) && /allocStocks/.test(up.system[0].text) && /esikatseluna/.test(up.system[0].text), 'muutoskomento-ohje ja whitelist kehotteessa');
    ok(/tapahtumaIka/.test(up.system[0].text) && /ominaisuus/.test(up.system[0].text) && /arvonnousu/.test(up.system[0].text), 'tapahtumamuutosten muoto kehotteessa');
    ok(/VERTAILU:/.test(up.system[0].text) && /vaihtoehdot/.test(up.system[0].text), 'vertailukomennon muoto kehotteessa');
    ok(/aikataulu/.test(up.system[0].text) && /savePhases/.test(up.system[0].text), 'porrastetun säästön muoto kehotteessa');
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

  console.log('Haasta (stressiskenaariot)');
  {
    const r = await post({ key: 'oma-avain', mode: 'haasta', context: CTX });
    ok(r.status === 200, 'haasta ei vaadi kysymystä');
    ok(/TEHTÄVÄ: Etsi tästä suunnitelmasta/.test(lastUpstream.body.messages[0].content), 'haasta-tehtävä palvelimen määräämä');
    ok(lastUpstream.body.max_tokens === 800, 'haasta saa pidemmän katon (800)');
    ok(lastUpstream.body.messages[0].content.indexOf('stressiskenaario') > -1, 'ohjeistaa stressiskenaarioihin');
  }

  console.log('NL-ramppi (mode ramppi)');
  {
    const noQ = await post({ key: 'oma-avain', mode: 'ramppi', context: CTX });
    ok(noQ.status === 400, 'ramppi ilman kuvausta → 400');
    const r = await post({ key: 'oma-avain', mode: 'ramppi', question: 'Olen 38, säästän 600 €/kk.', context: CTX });
    ok(r.status === 200, 'ramppi-kuvaus kelpaa');
    const c = lastUpstream.body.messages[0].content;
    ok(/TEHTÄVÄ: Käyttäjä aloittaa/.test(c) && /KUVAUS: Olen 38/.test(c), 'ramppi-tehtävä ja kuvaus samassa viestissä');
    ok(lastUpstream.body.max_tokens === 800, 'ramppi saa pidemmän katon (800)');
    const sys = lastUpstream.body.system[0].text;
    ok(/"uusi"/.test(sys) && /"poista"/.test(sys) && /ageNow/.test(sys), 'luonti, poisto ja ageNow kehotteessa');
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
