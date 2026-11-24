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

// Kelpaa vain asennus, jonka Chromium on oikeasti olemassa — pelkkä
// node_modules/playwright-kansio osui 4.9.2026 rikkinäiseen asennukseen
// ja kaikki selaintestit kaatuivat 0 sekunnissa.
const PW_PROBE = "const {chromium}=require('playwright');require('fs').accessSync(chromium.executablePath())";
const pwWorks = (nodePath) => spawnSync(process.execPath, ['-e', PW_PROBE],
  { env: nodePath == null ? process.env : { ...process.env, NODE_PATH: nodePath } }).status === 0;

function findPlaywright() {
  if (pwWorks(null)) return process.env.NODE_PATH || '';
  const base = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'claude', 'c--Users-olavi-claude-ty-t-varallisuuspolku');
  if (fs.existsSync(base)) {
    // uusin ensin: tuorein asennus on todennäköisimmin ehjä
    const ehdokkaat = fs.readdirSync(base)
      .map((s) => path.join(base, s, 'scratchpad', 'node_modules'))
      .filter((nm) => fs.existsSync(path.join(nm, 'playwright')))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const nm of ehdokkaat) if (pwWorks(nm)) return nm;
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

// Aikakatkaisu tappaa koko prosessipuun: spawnSyncin SIGTERM on Windowsilla
// TerminateProcess, jolloin Playwrightin oma siivous ei ehdi ajaa ja
// Chromium-lapset jäivät orvoiksi kuormittamaan seuraavia testejä.
function killTree(child) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { child.kill('SIGKILL'); } }
}

function run(name, file, env) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [file], { cwd: ROOT, env, detached: process.platform !== 'win32' });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const pass = code === 0 && !timedOut;
      console.log((pass ? '  ✓ ' : '  ✗ ') + name + ' (' + secs + ' s)' + (timedOut ? ' — AIKAKATKAISU ' + TIMEOUT_MS / 1000 + ' s' : ''));
      if (!pass) {
        const lines = out.trim().split('\n');
        console.log(lines.slice(-25).map((l) => '      ' + l).join('\n'));
      }
      resolve({ name, pass, secs });
    });
  });
}

(async () => {
  const results = [];
  const env = { ...process.env };

  // 1) Yksikkötestit (ei riippuvuuksia)
  console.log('— Yksikkötestit —');
  // Kaikki testit/*.test.js poimitaan automaattisesti (kuten selaintestit)
  for (const f of fs.readdirSync(__dirname).filter((n) => /\.test\.js$/.test(n)).sort()) {
    if (filter && !f.includes(filter)) continue;
    results.push(await run(f, path.join(__dirname, f), env));
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
    for (const f of scripts) results.push(await run(f, path.join(SELAIN, f), env));
    if (serveProc) serveProc.kill();
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n' + '='.repeat(50));
  console.log('Yhteensä ' + results.length + ' ajoa, ' + (results.length - failed.length) + ' läpi, ' + failed.length + ' epäonnistui.');
  if (failed.length) console.log('Punaiset: ' + failed.map((r) => r.name).join(', '));
  process.exit(failed.length ? 1 : 0);
})();
