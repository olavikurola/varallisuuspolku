'use strict';

/* Varallisuuspolku — anonyymi datalahjoituspalvelin.
   Ei riippuvuuksia: node:http + JSONL-tiedosto volyymillä.

   Periaatteet:
   - POST /donate  : vastaanottaa anonyymin suunnitelmapaketin. Kaikki kentät
     validoidaan tiukalla whitelistillä; tuntemattomat kentät hylätään, joten
     esim. tapahtumien omat nimet eivät voi päätyä levylle edes vahingossa.
   - GET  /stats.json : avoin aggregaattidata ikäryhmittäin. Jakaumat
     julkaistaan vasta kun ryhmässä on ≥ K_ANON lahjoitusta.
   - IP-osoitetta käytetään vain muistinvaraiseen rate-limitointiin,
     sitä ei koskaan kirjoiteta levylle.
   - Koko koodi on julkinen samassa repossa kuin sovellus — kuka tahansa
     voi tarkistaa, mitä tallennetaan. */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'lahjoitukset.jsonl');
const K_ANON = 30;            // jakaumat julki vasta tällä ryhmäkoolla
const MAX_BODY = 20 * 1024;   // 20 KB riittää reilusti
const RATE_LIMIT = 10;        // lahjoitusta / IP / tunti
const STATS_TTL = 5 * 60 * 1000;

const ALLOWED_ORIGINS = [
  'https://olavikurola.github.io',
  'http://localhost:3000', 'http://localhost:8080', 'http://localhost:5173',
];
const isDevOrigin = (o) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o || '');

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- Validointi: tiukka whitelist ---------- */

const EVENT_TYPES = ['study', 'home', 'car', 'wedding', 'child', 'renovation',
  'travel', 'recurring', 'cottage', 'inheritance', 'bonus', 'retirement'];
const GOALS = ['manual', 'withdrawal', 'age', 'saving'];

const num = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
const int = (v, lo, hi) => num(v, lo, hi) && Math.round(v) === v;
const opt = (v, check) => v === undefined || check(v);

// Palauttaa puhtaaksi rakennetun tallenteen tai null. Rakennetaan alusta —
// syötteen ylimääräiset kentät eivät voi kulkeutua läpi.
function sanitize(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.v !== 1) return null;
  if (!int(p.ageNow, 0, 105) || !int(p.ageEnd, 2, 105)) return null;
  if (!num(p.startCapital, 0, 1e9) || !num(p.monthly, 0, 1e6)) return null;
  if (!num(p.savingsGrowth, 0, 15)) return null;
  if (!p.alloc || !int(p.alloc.stocks, 0, 100) || !int(p.alloc.bonds, 0, 100)) return null;
  if (!Array.isArray(p.events) || p.events.length > 40) return null;

  const out = {
    v: 1,
    date: new Date().toISOString().slice(0, 7), // palvelimen kello, kuukausitaso
    ageNow: p.ageNow, ageEnd: p.ageEnd,
    startCapital: p.startCapital, monthly: p.monthly, savingsGrowth: p.savingsGrowth,
    alloc: { stocks: p.alloc.stocks, bonds: p.alloc.bonds },
    glide: !!p.glide, real: !!p.real, tax: !!p.tax,
    events: [],
  };

  for (const e of p.events) {
    if (!e || !EVENT_TYPES.includes(e.type) || !int(e.age, 0, 105)) return null;
    const ev = { type: e.type, age: e.age };
    if (e.type === 'retirement') {
      if (!num(e.withdrawal, 0, 1e6) || !num(e.pension, 0, 1e6)) return null;
      ev.withdrawal = e.withdrawal;
      ev.pension = e.pension;
      if (!opt(e.pensionAge, (v) => int(v, 0, 105))) return null;
      if (e.pensionAge !== undefined) ev.pensionAge = e.pensionAge;
      if (!opt(e.goal, (v) => GOALS.includes(v))) return null;
      if (e.goal !== undefined) ev.goal = e.goal;
      if (!opt(e.conf, (v) => num(v, 0.5, 0.99))) return null;
      if (e.conf !== undefined) ev.conf = e.conf;
    } else {
      if (!opt(e.amount, (v) => num(v, -1e9, 1e9))) return null;
      if (e.amount !== undefined) ev.amount = e.amount;
      if (e.financing === 'loan') {
        ev.financing = 'loan';
        if (!opt(e.down, (v) => num(v, 0, 1e9))) return null;
        if (!opt(e.rate, (v) => num(v, 0, 25))) return null;
        if (!opt(e.years, (v) => num(v, 1, 40))) return null;
        if (e.down !== undefined) ev.down = e.down;
        if (e.rate !== undefined) ev.rate = e.rate;
        if (e.years !== undefined) ev.years = e.years;
      }
      if (e.isAsset) {
        ev.isAsset = true;
        if (!opt(e.appr, (v) => num(v, -30, 15))) return null;
        if (e.appr !== undefined) ev.appr = e.appr;
        if (!opt(e.sellAge, (v) => int(v, 0, 105))) return null;
        if (e.sellAge !== undefined) { ev.sellAge = e.sellAge; ev.sellTaxFree = !!e.sellTaxFree; }
      }
      if (!opt(e.recMonthly, (v) => num(v, -1e5, 1e5))) return null;
      if (e.recMonthly !== undefined) {
        ev.recMonthly = e.recMonthly;
        if (!num(e.recYears, 1, 60)) return null;
        ev.recYears = e.recYears;
      }
    }
    out.events.push(ev);
  }

  if (p.derived && typeof p.derived === 'object') {
    const d = p.derived;
    out.derived = {};
    if (num(d.wAtRet, 0, 1e12)) out.derived.wAtRet = d.wAtRet;
    if (num(d.wEnd, 0, 1e12)) out.derived.wEnd = d.wEnd;
    if (num(d.successProb, 0, 1)) out.derived.successProb = d.successProb;
    if (num(d.retireAge, 0, 105)) out.derived.retireAge = d.retireAge;
    if (num(d.taxPaid, 0, 1e12)) out.derived.taxPaid = d.taxPaid;
  }
  return out;
}

/* ---------- Rate limit (IP vain muistissa, ei levylle) ---------- */

const hits = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
}, 10 * 60 * 1000).unref();

function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) { hits.set(ip, { count: 1, reset: now + 3600e3 }); return false; }
  h.count++;
  return h.count > RATE_LIMIT;
}

/* ---------- Aggregaatit ---------- */

const AGE_GROUPS = [
  ['18-24', 18, 24], ['25-29', 25, 29], ['30-34', 30, 34], ['35-39', 35, 39],
  ['40-44', 40, 44], ['45-49', 45, 49], ['50-54', 50, 54], ['55-59', 55, 59],
  ['60-64', 60, 64], ['65+', 65, 120],
];
const groupOf = (age) => (AGE_GROUPS.find(([, lo, hi]) => age >= lo && age <= hi) || [null])[0];

function quartiles(arr) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const q = (p) => a[Math.floor(p * (a.length - 1))];
  return { p25: q(0.25), p50: q(0.5), p75: q(0.75) };
}

let statsCache = { at: 0, json: null };

function computeStats() {
  if (Date.now() - statsCache.at < STATS_TTL && statsCache.json) return statsCache.json;
  const rows = [];
  try {
    for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch (e) { /* rikkinäinen rivi ohitetaan */ }
    }
  } catch (e) { /* ei vielä dataa */ }

  const buckets = new Map([['all', []]]);
  for (const r of rows) {
    buckets.get('all').push(r);
    const g = groupOf(r.ageNow);
    if (g) {
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push(r);
    }
  }

  const groups = {};
  for (const [name, list] of buckets) {
    const g = { n: list.length };
    if (list.length >= K_ANON) {
      const ret = list.map((r) => r.events.find((e) => e.type === 'retirement')).filter(Boolean);
      g.monthly = quartiles(list.map((r) => r.monthly));
      g.startCapital = quartiles(list.map((r) => r.startCapital));
      g.stocks = quartiles(list.map((r) => r.alloc.stocks));
      if (ret.length >= K_ANON) {
        g.retireAge = quartiles(ret.map((e) => e.age));
        g.withdrawal = quartiles(ret.map((e) => e.withdrawal));
        g.pension = quartiles(ret.map((e) => e.pension).filter((p) => p > 0));
      }
      const withW = list.filter((r) => r.derived && r.derived.wAtRet != null);
      if (withW.length >= K_ANON) g.wAtRet = quartiles(withW.map((r) => r.derived.wAtRet));
      // tapahtumatyyppien yleisyys suunnitelmissa
      g.events = {};
      for (const t of EVENT_TYPES) {
        const share = list.filter((r) => r.events.some((e) => e.type === t)).length / list.length;
        g.events[t] = Math.round(share * 100) / 100;
      }
    }
    groups[name] = g;
  }

  const json = JSON.stringify({ updated: new Date().toISOString(), kAnon: K_ANON, total: rows.length, groups });
  statsCache = { at: Date.now(), json };
  return json;
}

/* ---------- HTTP ---------- */

function cors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin) || isDevOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = req.url.split('?')[0];

  if (req.method === 'GET' && url === '/health') return send(res, 200, { ok: true });

  if (req.method === 'GET' && (url === '/stats.json' || url === '/avoin-data.json')) {
    return send(res, 200, computeStats());
  }

  if (req.method === 'POST' && url === '/donate') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    if (rateLimited(ip)) return send(res, 429, { error: 'rate_limit' });
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { send(res, 413, { error: 'too_large' }); req.destroy(); return; }
      body += chunk;
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      let parsed = null;
      try { parsed = JSON.parse(body); } catch (e) { /* alla */ }
      const clean = sanitize(parsed);
      if (!clean) return send(res, 400, { error: 'invalid' });
      fs.appendFile(FILE, JSON.stringify(clean) + '\n', (err) => {
        if (err) return send(res, 500, { error: 'store_failed' });
        statsCache.at = 0; // seuraava stats-haku laskee uusiksi
        send(res, 200, { ok: true });
      });
    });
    return;
  }

  send(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => console.log(`varallisuuspolku-data kuuntelee portissa ${PORT}, data: ${FILE}`));
