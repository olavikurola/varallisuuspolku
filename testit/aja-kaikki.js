// Aja koko testipatteristo yhdellä komennolla: node testit/aja-kaikki.js [suodatin]
// Yksikkötestit + kaikki testit/selain/-kansion smoke-/verify-skriptit.
// Valinnainen suodatin ajaa vain skriptit joiden nimi sisältää annetun merkkijonon
// (esim. `node testit/aja-kaikki.js tulkki`). Golden-evalit (evalit.js) eivät kuulu
// tähän — ne maksavat ja ajetaan erikseen ennen kehotemuutoksia.
//
// Playwright: repo on riippuvuudeton, joten selaintestit hakevat playwrightin
// NODE_PATHista. Tämä ajuri etsii asennuksen automaattisesti Claude-scratchpadeista
// ellei NODE_PATH jo toimi; oman asennuksen voi osoittaa myös itse:
//   NODE_PATH=<polku>/node_modules node testit/aja-kaikki.js
'use strict';
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');

const ROOT = path.join(__dirname, '..');
const SELAIN = path.join(__dirname, 'selain');
const filter = process.argv[2] || '';
const TIMEOUT_MS = 5 * 60 * 1000;

function findPlaywright() {
  const probe = spawnSync(process.execPath, ['-e', "require('playwright')"], { env: process.env });
  if (probe.status === 0) return process.env.NODE_PATH || '';
  const base = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'claude', 'c--Users-olavi-claude-ty-t-varallisuuspolku');
  if (fs.existsSync(base)) {
    for (const s of fs.readdirSync(base)) {
      const nm = path.join(base, s, 'scratchpad', 'node_modules');
      if (fs.existsSync(path.join(nm, 'playwright'))) return nm;
    }
  }
  return null;
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

function run(name, file, env) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [file], { cwd: ROOT, env, timeout: TIMEOUT_MS, encoding: 'utf8' });
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const pass = r.status === 0;
  console.log((pass ? '  ✓ ' : '  ✗ ') + name + ' (' + secs + ' s)');
  if (!pass) {
    const out = ((r.stdout || '') + '\n' + (r.stderr || '')).trim().split('\n');
    console.log(out.slice(-25).map((l) => '      ' + l).join('\n'));
  }
  return { name, pass, secs };
}

(async () => {
  const results = [];
  const env = { ...process.env };

  // 1) Yksikkötestit (ei riippuvuuksia)
  console.log('— Yksikkötestit —');
  for (const f of ['laskenta.test.js', 'tulkki-proxy.test.js', 'mcp.test.js']) {
    if (filter && !f.includes(filter)) continue;
    results.push(run(f, path.join(__dirname, f), env));
  }

  // 2) Selaintestit
  const scripts = fs.readdirSync(SELAIN)
    .filter((f) => /^(smoke|verify)-.*\.js$/.test(f))
    .filter((f) => !filter || f.includes(filter))
    .sort();
  if (scripts.length) {
    const nm = findPlaywright();
    if (nm === null) {
      console.error('\nPlaywrightia ei löytynyt — asenna: npm i playwright && npx playwright install chromium');
      console.error('ja aja NODE_PATH=<asennus>/node_modules node testit/aja-kaikki.js');
      process.exit(1);
    }
    if (nm) env.NODE_PATH = nm;

    // Yhteinen staattinen palvelin porttiin 8123 ellei jo pyöri.
    let serveProc = null;
    if (await portFree(8123)) {
      serveProc = spawn(process.execPath, [path.join(SELAIN, 'serve.js')], { cwd: ROOT, stdio: 'ignore' });
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log('\n— Selaintestit (' + scripts.length + ') —');
    for (const f of scripts) results.push(run(f, path.join(SELAIN, f), env));
    if (serveProc) serveProc.kill();
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n' + '='.repeat(50));
  console.log('Yhteensä ' + results.length + ' ajoa, ' + (results.length - failed.length) + ' läpi, ' + failed.length + ' epäonnistui.');
  if (failed.length) console.log('Punaiset: ' + failed.map((r) => r.name).join(', '));
  process.exit(failed.length ? 1 : 0);
})();
