'use strict';

/* Tilastot (ent. Vaurastumisen kartta) — avoin analytiikka Varallisuuspolun anonyymistä
   vertailudatasta. Kaikki kaaviot käsintehtyä SVG:tä, ei riippuvuuksia.
   "Sinä kartalla": oma suunnitelma luetaan VAIN localStoragesta — mitään
   ei lähetetä minnekään tältä sivulta. */

// Huom: sama osoite kuin app.js:n DATA_API — päivitä molemmat jos muuttuu
const DATA_API = 'https://varallisuuspolku-data.up.railway.app';

const ICONS = {
  study: '🎓', home: '🏠', car: '🚗', wedding: '💍', child: '👶', renovation: '🛠️',
  travel: '✈️', recurring: '💳', cottage: '🏡', inheritance: '💎', bonus: '💰', retirement: '🌴',
};
const LABELS = {
  study: 'Opiskelu', home: 'Asunnon osto', car: 'Auton osto', wedding: 'Häät', child: 'Lapsi',
  renovation: 'Remontti', travel: 'Unelmamatka', recurring: 'Kuukausimeno', cottage: 'Mökki / vene',
  inheritance: 'Perintö / lahja', bonus: 'Bonus', retirement: 'Eläkkeelle jäänti',
};
const GROUPS = [
  ['18-24', 21], ['25-29', 27], ['30-34', 32], ['35-39', 37], ['40-44', 42],
  ['45-49', 47], ['50-54', 52], ['55-59', 57], ['60-64', 62], ['65+', 70],
];

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const YOU = '#fbbf24';

function el(name, attrs, parent) {
  const n = document.createElementNS(SVG_NS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}
function svgIn(container, W, H) {
  const s = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
  s.style.width = '100%';
  container.innerHTML = '';
  container.appendChild(s);
  return s;
}
function fmtCompact(v) {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return sign + (a / 1e6).toLocaleString('fi-FI', { maximumFractionDigits: 1 }) + ' M€';
  if (a >= 1e3) return sign + Math.round(a / 1e3) + ' t€';
  return sign + Math.round(a) + ' €';
}
const text = (svg, x, y, str, cls, anchor) => {
  const t = el('text', { x, y, class: cls || 'an-tick', 'text-anchor': anchor || 'start' }, svg);
  t.textContent = str;
  return t;
};
function empty(containerId, msg) {
  $(containerId).innerHTML = `<div class="an-empty">📈 ${msg}</div>`;
}
const needMsg = (total, k) =>
  `Kertyy vielä — jaettuja suunnitelmia ${total}. Jakauma julkaistaan, kun ryhmässä on vähintään ${k}.`;

/* Oma suunnitelma localStoragesta ("Sinä kartalla") */
function readMe() {
  try {
    const st = JSON.parse(localStorage.getItem('varallisuuspolku-v1'));
    if (!st || typeof st.ageNow !== 'number') return null;
    const ret = (st.events || []).find((e) => e.type === 'retirement');
    return {
      ageNow: st.ageNow, startCapital: st.startCapital, monthly: st.monthly,
      stocks: st.allocStocks, events: st.events || [], ret,
      group: (GROUPS.find(([g]) => {
        const [lo, hi] = g === '65+' ? [65, 120] : g.split('-').map(Number);
        return st.ageNow >= lo && st.ageNow <= hi;
      }) || [null])[0],
    };
  } catch (e) { return null; }
}

/* ---------- Hover: arvot osoittimen alle ---------- */
// Yksi jaettu vihjelaatikko; kukin kaavio antaa resolverin, joka kääntää
// viewBox-koordinaatit sisällöksi. Resolveri talletetaan svg.__anHover-
// ominaisuudeksi, jotta suurennettu klooni saa saman vihjeen (kloonaus ei
// kopioi kuuntelijoita — initZoom sitoo resolverin uudelleen).

let tipEl = null;
function tipShow(html, cx, cy) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'an-tip'; document.body.appendChild(tipEl); }
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const left = Math.min(window.innerWidth - tipEl.offsetWidth - 10, cx + 14);
  tipEl.style.left = Math.max(8, left) + 'px';
  tipEl.style.top = Math.max(8, cy - tipEl.offsetHeight - 12) + 'px';
}
function tipHide() { if (tipEl) tipEl.hidden = true; }

function bindHover(svg, resolve) {
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const vb = svg.viewBox.baseVal;
    const hit = resolve((e.clientX - r.left) / r.width * vb.width, (e.clientY - r.top) / r.height * vb.height);
    if (hit) tipShow(hit, e.clientX, e.clientY); else tipHide();
  });
  svg.addEventListener('pointerleave', tipHide);
}
function attachHover(svg, resolve) { svg.__anHover = resolve; bindHover(svg, resolve); }

/* ---------- Kaaviot ---------- */

// Hero: varallisuusvyöhyke ikäryhmien yli (sqrt-asteikko — varallisuus kasvaa moninkertaisesti)
function renderHero(stats, me) {
  const pts = GROUPS.map(([g, cx]) => ({ g, cx, q: stats.groups[g] && stats.groups[g].startCapital }))
    .filter((p) => p.q);
  if (pts.length < 2) return empty('heroChart', needMsg(stats.total, stats.kAnon));
  const W = 960, H = 320, l = 64, r = 20, t = 16, b = 36;
  const svg = svgIn($('heroChart'), W, H);
  let vMax = Math.max(...pts.map((p) => p.q.p75), me ? me.startCapital : 0) * 1.15 + 1;
  const X = (age) => l + ((age - 18) / (72 - 18)) * (W - l - r);
  const Y = (v) => t + (H - t - b) * (1 - Math.sqrt(Math.max(0, v) / vMax));
  // ruudukko
  for (const v of [1e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2e6].filter((v) => v < vMax)) {
    el('line', { x1: l, y1: Y(v), x2: W - r, y2: Y(v), class: 'grid-line' }, svg);
    text(svg, l - 8, Y(v) + 4, fmtCompact(v), 'an-tick', 'end');
  }
  for (const [g, cx] of GROUPS) text(svg, X(cx), H - 12, g, 'an-tick', 'middle');
  // vyöhyke P25–P75
  let band = 'M ' + pts.map((p) => `${X(p.cx).toFixed(1)},${Y(p.q.p75).toFixed(1)}`).join(' L ');
  band += ' L ' + [...pts].reverse().map((p) => `${X(p.cx).toFixed(1)},${Y(p.q.p25).toFixed(1)}`).join(' L ') + ' Z';
  el('path', { d: band, fill: 'rgba(45,212,191,0.16)', stroke: 'none' }, svg);
  // mediaaniviiva
  const med = 'M ' + pts.map((p) => `${X(p.cx).toFixed(1)},${Y(p.q.p50).toFixed(1)}`).join(' L ');
  el('path', { d: med, fill: 'none', stroke: 'url(#anGrad)', 'stroke-width': 3, 'stroke-linejoin': 'round' }, svg);
  const defs = el('defs', {}, svg);
  const grad = el('linearGradient', { id: 'anGrad', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  el('stop', { offset: '0%', 'stop-color': '#2dd4bf' }, grad);
  el('stop', { offset: '100%', 'stop-color': '#8b7cf6' }, grad);
  for (const p of pts) {
    el('circle', { cx: X(p.cx), cy: Y(p.q.p50), r: 4, fill: '#2dd4bf', stroke: '#0a0e1a', 'stroke-width': 2 }, svg);
    text(svg, X(p.cx), Y(p.q.p50) - 10, fmtCompact(p.q.p50), 'an-tick-strong', 'middle');
  }
  if (me && me.ageNow >= 18 && me.ageNow <= 72) {
    el('circle', { cx: X(me.ageNow), cy: Y(me.startCapital), r: 6, fill: YOU, stroke: '#0a0e1a', 'stroke-width': 2 }, svg);
    text(svg, X(me.ageNow) + 10, Y(me.startCapital) + 4, 'sinä', 'an-you', 'start');
  }
  attachHover(svg, (x) => {
    let best = null;
    for (const p of pts) {
      const d = Math.abs(X(p.cx) - x);
      if (d < 44 && (!best || d < best.d)) best = { p, d };
    }
    if (!best) return null;
    const n = stats.groups[best.p.g] && stats.groups[best.p.g].n;
    const q = best.p.q;
    return `<b>${best.p.g} v</b>${n ? ` · n = ${n}` : ''}<br>P75 ${fmtCompact(q.p75)}<br>Mediaani <b>${fmtCompact(q.p50)}</b><br>P25 ${fmtCompact(q.p25)}`;
  });
}

// Elämän kartta: ridgeline tapahtumien suunnitelluista i'istä
function renderRidgeline(stats, me) {
  const order = ['study', 'home', 'child', 'wedding', 'car', 'renovation', 'travel', 'recurring', 'cottage', 'retirement'];
  const rows = order.filter((t) => stats.eventAges && stats.eventAges[t]);
  if (!rows.length) return empty('ridgeline', needMsg(stats.total, stats.kAnon));
  const W = 960, rowH = 52, l = 170, r = 90, headH = 26;
  const H = headH + rows.length * rowH + 30;
  const svg = svgIn($('ridgeline'), W, H);
  const X = (age) => l + ((age - 18) / (81 - 18)) * (W - l - r);
  for (let a = 20; a <= 80; a += 10) {
    el('line', { x1: X(a), y1: headH, x2: X(a), y2: H - 24, class: 'grid-line-x' }, svg);
    text(svg, X(a), H - 8, a + ' v', 'an-tick', 'middle');
  }
  rows.forEach((type, i) => {
    const d = stats.eventAges[type];
    const base = headH + (i + 1) * rowH - 10;
    const maxC = Math.max(...d.counts, 1);
    const pts = d.counts.map((c, k) => ({
      x: X((d.edges[k] + d.edges[k + 1]) / 2),
      y: base - (c / maxC) * (rowH * 0.92),
    }));
    // pehmennetty polku (quadratic midpoints)
    let path = `M ${X(d.edges[0]).toFixed(1)},${base}`;
    let prev = { x: X(d.edges[0]), y: base };
    for (const p of pts) {
      const mx = (prev.x + p.x) / 2;
      path += ` Q ${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${mx.toFixed(1)},${((prev.y + p.y) / 2).toFixed(1)}`;
      prev = p;
    }
    path += ` Q ${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${X(d.edges[d.edges.length - 1]).toFixed(1)},${base}`;
    el('path', { d: path + ' Z', fill: `rgba(45,212,191,${0.28 - i * 0.012})`, stroke: 'rgba(45,212,191,0.6)', 'stroke-width': 1.4 }, svg);
    el('line', { x1: l, y1: base, x2: W - r, y2: base, stroke: 'rgba(148,168,220,0.12)' }, svg);
    text(svg, 12, base - 6, `${ICONS[type]} ${LABELS[type]}`, 'an-row-label');
    text(svg, W - r + 8, base - 6, `med. ${Math.round(d.p50)} v`, 'an-tick');
    if (me) {
      const mine = type === 'retirement' ? me.ret : me.events.find((e) => e.type === type);
      if (mine) {
        el('path', { d: `M ${X(mine.age).toFixed(1)} ${base + 2} l 5 8 l -10 0 Z`, fill: YOU }, svg);
      }
    }
  });
  attachHover(svg, (x, y) => {
    const i = Math.floor((y - headH) / rowH);
    if (i < 0 || i >= rows.length) return null;
    const type = rows[i], d = stats.eventAges[type];
    const tot = d.counts.reduce((s, c) => s + c, 0) || 1;
    for (let k = 0; k < d.counts.length; k++) {
      if (x >= X(d.edges[k]) && x < X(d.edges[k + 1]) && d.counts[k] > 0) {
        return `${ICONS[type]} <b>${LABELS[type]}</b> · med. ${Math.round(d.p50)} v<br>` +
          `${d.edges[k]}–${d.edges[k + 1]} v: ${Math.round((d.counts[k] / tot) * 100)} % suunnitelmista`;
      }
    }
    return `${ICONS[type]} <b>${LABELS[type]}</b> · mediaani ${Math.round(d.p50)} v`;
  });
}

// Kvartiilipylväät ikäryhmittäin (kk-säästö, osakepaino)
function renderQuartCols(containerId, stats, key, me, meVal, fmt, refFn, vCap) {
  const pts = GROUPS.map(([g, cx], i) => ({ g, i, q: stats.groups[g] && stats.groups[g][key] })).filter((p) => p.q);
  if (pts.length < 2) return empty(containerId, needMsg(stats.total, stats.kAnon));
  const W = 470, H = 240, l = 56, r = 10, t = 14, b = 32;
  const svg = svgIn($(containerId), W, H);
  const vMax = vCap || Math.max(...pts.map((p) => p.q.p75), meVal || 0) * 1.15 + 1;
  const X = (i) => l + ((i + 0.5) / GROUPS.length) * (W - l - r);
  const Y = (v) => t + (H - t - b) * (1 - v / vMax);
  for (let k = 1; k <= 4; k++) {
    const v = (vMax / 4) * k;
    el('line', { x1: l, y1: Y(v), x2: W - r, y2: Y(v), class: 'grid-line' }, svg);
    text(svg, l - 6, Y(v) + 4, fmt(v), 'an-tick', 'end');
  }
  GROUPS.forEach(([g], i) => { if (i % 2 === 0) text(svg, X(i), H - 10, g, 'an-tick', 'middle'); });
  if (refFn) {
    let d = '';
    GROUPS.forEach(([g, cx], i) => {
      const v = Math.max(0, Math.min(vMax, refFn(cx)));
      d += `${d ? ' L' : 'M'} ${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
    });
    el('path', { d, fill: 'none', stroke: 'rgba(148,168,220,0.5)', 'stroke-width': 1.5, 'stroke-dasharray': '4 5' }, svg);
  }
  for (const p of pts) {
    const x = X(p.i);
    el('line', { x1: x, y1: Y(p.q.p25), x2: x, y2: Y(p.q.p75), stroke: 'rgba(45,212,191,0.5)', 'stroke-width': 10, 'stroke-linecap': 'round' }, svg);
    el('circle', { cx: x, cy: Y(p.q.p50), r: 4, fill: '#2dd4bf', stroke: '#0a0e1a', 'stroke-width': 1.5 }, svg);
  }
  if (me && me.group && meVal != null) {
    const i = GROUPS.findIndex(([g]) => g === me.group);
    if (i >= 0 && meVal <= vMax) {
      el('path', { d: `M ${(X(i) + 12).toFixed(1)} ${Y(meVal).toFixed(1)} l 8 -5 l 0 10 Z`, fill: YOU }, svg);
      text(svg, X(i) + 24, Y(meVal) + 4, 'sinä', 'an-you');
    }
  }
  attachHover(svg, (x) => {
    let best = null;
    for (const p of pts) {
      const d = Math.abs(X(p.i) - x);
      if (d < 26 && (!best || d < best.d)) best = { p, d };
    }
    if (!best) return null;
    const n = stats.groups[best.p.g] && stats.groups[best.p.g].n;
    const q = best.p.q;
    return `<b>${best.p.g} v</b>${n ? ` · n = ${n}` : ''}<br>P75 ${fmt(q.p75)}<br>Mediaani <b>${fmt(q.p50)}</b><br>P25 ${fmt(q.p25)}`;
  });
}

// Eläkeikähistogrammi + lakisääteinen alue + oma tavoite
function renderRetireHist(stats, me) {
  const g = (me && me.group && stats.groups[me.group] && stats.groups[me.group].hist && stats.groups[me.group].hist.retireAge)
    ? stats.groups[me.group] : stats.groups.all;
  const h = g && g.hist && g.hist.retireAge;
  if (!h) return empty('retireHist', needMsg(stats.total, stats.kAnon));
  const W = 470, H = 240, l = 34, r = 10, t = 14, b = 32;
  const svg = svgIn($('retireHist'), W, H);
  const X = (age) => l + ((age - 40) / (80 - 40)) * (W - l - r);
  const maxC = Math.max(...h.counts, 1);
  const Y = (c) => t + (H - t - b) * (1 - c / maxC);
  el('rect', { x: X(65), y: t, width: X(68) - X(65), height: H - t - b, fill: 'rgba(139,124,246,0.12)' }, svg);
  text(svg, X(66.5), t + 12, 'lakisäät.', 'an-tick', 'middle');
  h.counts.forEach((c, i) => {
    if (!c) return;
    const x0 = X(h.edges[i]), x1 = X(h.edges[i + 1]);
    el('rect', { x: x0 + 1, y: Y(c), width: Math.max(2, x1 - x0 - 2), height: H - b - Y(c), rx: 3, fill: 'rgba(45,212,191,0.65)' }, svg);
  });
  for (let a = 40; a <= 80; a += 10) text(svg, X(a), H - 10, a + ' v', 'an-tick', 'middle');
  if (g.retireAge) {
    el('line', { x1: X(g.retireAge.p50), y1: t, x2: X(g.retireAge.p50), y2: H - b, stroke: '#2dd4bf', 'stroke-width': 2, 'stroke-dasharray': '3 4' }, svg);
  }
  if (me && me.ret) {
    el('path', { d: `M ${X(me.ret.age).toFixed(1)} ${t + 2} l 5 8 l -10 0 Z`, fill: YOU }, svg);
    text(svg, X(me.ret.age) + 8, t + 12, 'sinä', 'an-you');
  }
  const totalC = h.counts.reduce((s, c) => s + c, 0) || 1;
  attachHover(svg, (x) => {
    for (let i = 0; i < h.counts.length; i++) {
      if (x >= X(h.edges[i]) && x < X(h.edges[i + 1]) && h.counts[i] > 0) {
        return `<b>Eläkeikä ${h.edges[i]}–${h.edges[i + 1]} v</b><br>${h.counts[i]} suunnitelmaa · ${Math.round((h.counts[i] / totalC) * 100)} %`;
      }
    }
    return null;
  });
}

// Työeläkkeen kateosuus: pinopalkit ikäryhmittäin
function renderPenCoverage(stats, me) {
  const rows = GROUPS.map(([g]) => ({ g, s: stats.groups[g] && stats.groups[g].penShare })).filter((r) => r.s);
  if (!rows.length) return empty('penCoverage', needMsg(stats.total, stats.kAnon));
  let html = '<div class="an-cov">';
  for (const r of rows) {
    const pct = Math.round(r.s.p50 * 100);
    const mine = me && me.group === r.g ? ' mine' : '';
    html += `<div class="an-cov-row${mine}"><span class="cg">${r.g}</span>` +
      `<span class="cbar"><i style="width:${pct}%"></i></span>` +
      `<span class="cpct">${pct} % työeläke</span></div>`;
  }
  html += '</div><p class="an-note" style="margin-top:8px">Mediaani: työeläkkeen osuus eläkeajan kuukausitulosta — loput katetaan sijoituksista.</p>';
  $('penCoverage').innerHTML = html;
}

// Donitsi
function renderDonut(containerId, slicesIn, note) {
  const slices = slicesIn.filter((s) => s.v > 0.005);
  if (!slices.length) return empty(containerId, 'Kertyy vielä.');
  const W = 300, H = 150, cx = 72, cy = 74, r0 = 40, r1 = 64;
  const svg = svgIn($(containerId), W, H);
  let a = -Math.PI / 2;
  const total = slices.reduce((s, x) => s + x.v, 0);
  for (const s of slices) {
    const a1 = a + (s.v / total) * Math.PI * 2 - 0.03;
    const p = (rr, ang) => `${(cx + rr * Math.cos(ang)).toFixed(1)} ${(cy + rr * Math.sin(ang)).toFixed(1)}`;
    const large = a1 - a > Math.PI ? 1 : 0;
    el('path', {
      d: `M ${p(r1, a)} A ${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${p(r0, a)} Z`,
      fill: s.c, opacity: 0.9,
    }, svg);
    a = a1 + 0.03;
  }
  slices.forEach((s, i) => {
    el('rect', { x: 158, y: 22 + i * 26, width: 11, height: 11, rx: 3, fill: s.c }, svg);
    text(svg, 176, 32 + i * 26, `${s.l} ${Math.round((s.v / total) * 100)} %`, 'an-tick-strong');
  });
  if (note) text(svg, cx, cy + 4, note, 'an-tick', 'middle');
  // kulma → siivu (ei elementtikohtaisia kuuntelijoita — klooni perii resolverin)
  const arcs = [];
  let acc = -Math.PI / 2;
  for (const s of slices) { const a1 = acc + (s.v / total) * Math.PI * 2; arcs.push({ s, a0: acc, a1 }); acc = a1; }
  attachHover(svg, (x, y) => {
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < r0 - 4 || dist > r1 + 4) return null;
    let ang = Math.atan2(y - cy, x - cx);
    if (ang < -Math.PI / 2) ang += Math.PI * 2; // normalisoi alkamaan kello 12:sta
    const hit = arcs.find((a) => ang >= a.a0 && ang < a.a1);
    return hit ? `<b>${hit.s.l}</b> · ${Math.round((hit.s.v / total) * 100)} %` : null;
  });
}

// Asuntolaina: tunnuslukurivit
function renderHomeLoan(stats, me) {
  const hl = stats.homeLoan;
  if (!hl) return empty('homeLoan', needMsg(stats.total, stats.kAnon));
  const pct = (v) => Math.round(v * 100) + ' %';
  const myHome = me && me.events.find((e) => e.type === 'home' && e.financing === 'loan');
  const row = (k, q, fmt, mine) =>
    `<div class="an-hl-row"><span class="k">${k}</span><b>${fmt(q.p50)}</b>` +
    `<span class="rng">P25–P75: ${fmt(q.p25)} – ${fmt(q.p75)}</span>` +
    (mine != null ? `<span class="you">sinä: ${fmt(mine)}</span>` : '') + `</div>`;
  $('homeLoan').innerHTML =
    row('Asunnon hinta', hl.price, fmtCompact, myHome ? -myHome.amount : null) +
    (hl.downShare ? row('Käsirahan osuus', hl.downShare, pct, myHome && myHome.down != null ? myHome.down / -myHome.amount : null) : '') +
    (hl.years ? row('Laina-aika', hl.years, (v) => Math.round(v) + ' v', myHome ? myHome.years : null) : '') +
    (hl.rate ? row('Korko-oletus', hl.rate, (v) => v.toLocaleString('fi-FI', { maximumFractionDigits: 1 }) + ' %', myHome ? myHome.rate : null) : '') +
    `<p class="an-note" style="margin-top:10px">Suunnitelmien asunnonostot lainalla (n = ${hl.n}).</p>`;
}

// Realismi: kytkinten käyttö + onnistumis-%
function renderRealism(stats, me) {
  const g = (me && me.group && stats.groups[me.group] && stats.groups[me.group].shares)
    ? stats.groups[me.group] : stats.groups.all;
  if (!g || !g.shares) return empty('realism', needMsg(stats.total, stats.kAnon));
  const bar = (k, v) =>
    `<div class="an-share"><span class="k">${k}</span><span class="sbar"><i style="width:${Math.round(v * 100)}%"></i></span><b>${Math.round(v * 100)} %</b></div>`;
  let html = bar('Myyntivoittovero mallinnettu', g.shares.tax) +
    bar('Ikäsidonnainen allokaatio', g.shares.glide) +
    bar('Inflaatiokorjaus käytössä', g.shares.real);
  if (g.successProb) {
    html += `<div class="an-hl-row" style="margin-top:12px"><span class="k">Onnistumistodennäköisyys</span>` +
      `<b>${Math.round(g.successProb.p50 * 100)} %</b>` +
      `<span class="rng">P25–P75: ${Math.round(g.successProb.p25 * 100)}–${Math.round(g.successProb.p75 * 100)} %</span></div>`;
  }
  $('realism').innerHTML = html + `<p class="an-note" style="margin-top:10px">Osuus suunnitelmista${me && me.group && g !== stats.groups.all ? ` ikäryhmässä ${me.group}` : ''}.</p>`;
}

// Kertymä-sparkline
function renderTimeline(stats) {
  const tl = stats.timeline || [];
  if (!tl.length) return empty('timeline', 'Ei vielä jaettuja suunnitelmia.');
  const W = 470, H = 110, l = 8, r = 8, t = 10, b = 24;
  const svg = svgIn($('timeline'), W, H);
  const maxN = Math.max(...tl.map((x) => x.n), 1);
  const bw = (W - l - r) / tl.length;
  tl.forEach((x, i) => {
    const h = ((H - t - b) * x.n) / maxN;
    el('rect', { x: l + i * bw + 2, y: H - b - h, width: Math.max(3, bw - 4), height: h, rx: 3, fill: 'rgba(139,124,246,0.65)' }, svg);
    if (i === 0 || i === tl.length - 1) text(svg, l + i * bw + bw / 2, H - 8, x.m, 'an-tick', 'middle');
  });
  text(svg, W - r, t + 6, `yht. ${stats.total}`, 'an-tick-strong', 'end');
  attachHover(svg, (x) => {
    const i = Math.floor((x - l) / bw);
    if (i < 0 || i >= tl.length) return null;
    return `<b>${tl[i].m}</b> · ${tl[i].n} jaettua suunnitelmaa`;
  });
}

/* ---------- Portti: kartta aukeaa omalla suunnitelmalla ja jaolla ---------- */
// Kaaviot renderöidään normaalisti mutta sumennettuna; lukituskortti kertoo,
// miten näkymän saa auki. Aggregaatit ovat silti avointa dataa (stats.json) —
// lukitus on käyttöliittymän kannustin, ei salaus.

function hasShared() {
  try { return !!(JSON.parse(localStorage.getItem('vp-donate-v1')) || {}).donatedHash; } catch (e) { return false; }
}

function renderGate(me) {
  if (me && hasShared()) return false;
  document.querySelector('.an-main').classList.add('an-locked');
  const lock = document.createElement('div');
  lock.className = 'an-lock';
  lock.innerHTML = me
    ? `<div class="an-lock-card"><div class="ic">🗺️</div><h2>Melkein valmista</h2>
       <p>Sinulla on jo oma suunnitelma. Tilastot aukeavat, kun jaat sen
       <b>anonyymisti</b> — näet ensin täsmälleen mitä jaetaan, eikä se velvoita mihinkään.</p>
       <a class="btn" href="./#yhteenveto">Avaa Suunnitelmani ja jaa →</a>
       <p class="small">Ei tunnisteita · summat pyöristetään · jakaumat julkaistaan vasta
       ≥ 30 suunnitelman ryhmistä · aggregaatit ovat avointa dataa:
       <a href="${DATA_API}/stats.json" target="_blank" rel="noopener">stats.json</a></p></div>`
    : `<div class="an-lock-card"><div class="ic">📊</div><h2>Tilastot — miten muut suunnittelevat vaurastumista</h2>
       <p>Tämä näkymä kertoo, miten eri ikäiset suunnittelevat talouttaan ja etenevät
       vaurastumisen matkalla. Tilastot aukeavat, kun sinullakin on <b>oma suunnitelma</b>.</p>
       <a class="btn" href="./">Tee oma suunnitelma →</a>
       <p class="small">Vie pari minuuttia — suunnitelmasi pysyy omassa selaimessasi.</p></div>`;
  document.body.appendChild(lock);
  return true;
}

/* ---------- Suurennus: kaavio koko ruudun kehykseen ---------- */
// SVG:t piirretään viewBoxiin ja skaalautuvat vektoreina — suurennos on
// kortin klooni isossa kehyksessä, terävänä ilman uudelleenpiirtoa.
// Esc, ✕ tai taustan klikkaus sulkee.

function initZoom() {
  document.querySelectorAll('.an-card').forEach((card) => {
    if (card.classList.contains('an-method')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'an-zoom';
    btn.title = 'Suurenna';
    btn.setAttribute('aria-label', 'Suurenna kaavio');
    btn.textContent = '⛶';
    btn.addEventListener('click', () => {
      const light = document.createElement('div');
      light.className = 'an-light';
      const clone = card.cloneNode(true);
      const zb = clone.querySelector('.an-zoom');
      if (zb) zb.remove();
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'an-light-x';
      x.setAttribute('aria-label', 'Sulje');
      x.textContent = '✕';
      clone.appendChild(x);
      light.appendChild(clone);
      // hover toimii myös suurennoksessa: sido alkuperäisten resolverit klooniin
      const osv = card.querySelectorAll('svg'), csv = clone.querySelectorAll('svg');
      osv.forEach((o, i) => { if (o.__anHover && csv[i]) bindHover(csv[i], o.__anHover); });
      const close = () => { light.remove(); tipHide(); document.removeEventListener('keydown', onEsc); };
      const onEsc = (e) => { if (e.key === 'Escape') close(); };
      light.addEventListener('click', (e) => { if (e.target === light || e.target === x) close(); });
      document.addEventListener('keydown', onEsc);
      document.body.appendChild(light);
    });
    card.appendChild(btn);
  });
}

/* ---------- Poimintalauseet: kaavio näyttää, lause kertoo ---------- */
// Rehellinen kvartiilikieli: sijainti kerrotaan neljänneksinä, ei tarkkoina
// prosenttipisteinä (dataa on vain kvartiileina). Lause lisätään vain kun
// ryhmän jakauma on julkaistu ja oma arvo on olemassa.

function quartPos(v, q) {
  if (v >= q.p75) return 'ylimmässä neljänneksessä';
  if (v >= q.p50) return 'mediaanin yläpuolella';
  if (v >= q.p25) return 'mediaanin alapuolella';
  return 'alimmassa neljänneksessä';
}

function addTake(chartId, html) {
  const c = $(chartId);
  if (!c || c.querySelector('.an-empty') || !html) return;
  const p = document.createElement('p');
  p.className = 'an-take';
  p.innerHTML = html;
  c.insertAdjacentElement('afterend', p);
}

function takeaways(stats, me) {
  const g = me && me.group && stats.groups[me.group];
  const n = g && g.n ? ` <span class="an-take-n">n = ${g.n}</span>` : '';
  if (g && g.startCapital && me.startCapital != null) {
    addTake('heroChart', `Ikäryhmäsi ${me.group} mediaanivarallisuus on <b>${fmtCompact(g.startCapital.p50)}</b> — sinun ${fmtCompact(me.startCapital)} on ${quartPos(me.startCapital, g.startCapital)}.${n}`);
  }
  if (g && g.monthly && me.monthly != null) {
    addTake('savingsChart', `Ikäryhmäsi mediaanisäästö on <b>${Math.round(g.monthly.p50).toLocaleString('fi-FI')} €/kk</b> — sinun ${Math.round(me.monthly).toLocaleString('fi-FI')} €/kk on ${quartPos(me.monthly, g.monthly)}.${n}`);
  }
  if (g && g.stocks && me.stocks != null) {
    addTake('stocksChart', `Ikäryhmäsi mediaaniosakepaino on <b>${Math.round(g.stocks.p50)} %</b> — sinulla ${Math.round(me.stocks)} %.${n}`);
  }
  const rg = (g && g.retireAge) ? g : stats.groups.all;
  if (rg && rg.retireAge && me && me.ret) {
    const med = Math.round(rg.retireAge.p50);
    const d = Math.round(me.ret.age) - med;
    const rTxt = d === 0 ? 'sama kuin mediaani' : d < 0 ? `${-d} v mediaania aiemmin` : `${d} v mediaania myöhemmin`;
    addTake('retireHist', `Mediaani eläkeikätavoite${rg === stats.groups.all ? '' : ' ikäryhmässäsi'} on <b>${med} v</b> — sinun ${Math.round(me.ret.age)} v on ${rTxt}.`);
  }
}

/* ---------- Sivun kokoaminen ---------- */

(async () => {
  const me = readMe();
  renderGate(me);
  // "sinä"-selite on navissa kaavioiden vieressä — näytetään vain kun oma
  // suunnitelma on olemassa (erillinen banneri poistettu: yläosa rauhoittuu,
  // yksityisyys on selitetty Data ja menetelmä -lohkossa)
  const legend = document.querySelector('.an-legend');
  if (legend && !me) legend.hidden = true;
  $('anStatsLink').href = DATA_API + '/stats.json';

  let stats = null;
  try {
    stats = await (await fetch(DATA_API + '/stats.json')).json();
  } catch (e) { /* alla */ }
  if (!stats || !stats.groups) {
    $('anTiles').innerHTML = '';
    for (const id of ['heroChart', 'ridgeline', 'savingsChart', 'stocksChart', 'retireHist', 'penCoverage', 'goalDonut', 'confDonut', 'homeLoan', 'realism', 'timeline']) {
      empty(id, 'Datapalvelin ei ole juuri nyt tavoitettavissa — yritä hetken päästä uudelleen.');
    }
    return;
  }

  $('anUpdated').textContent = `Päivitetty ${new Date(stats.updated).toLocaleDateString('fi-FI')}.`;
  const all = stats.groups.all || { n: stats.total };

  // Edistymismittari: kun mikään ikäryhmä ei vielä yllä k-anon-rajaan,
  // kuusi erillistä tyhjätilaa korvautuu yhdellä yhteisellä tavoitteella
  const bestN = Math.max(0, ...Object.entries(stats.groups)
    .filter(([g]) => g !== 'all').map(([, v]) => v.n || 0));
  const anyOpen = Object.entries(stats.groups).some(([g, v]) => g !== 'all' && (v.n || 0) >= stats.kAnon);
  const prog = $('anProgress');
  if (prog) {
    if (!anyOpen) {
      const pct = Math.min(100, Math.round(bestN / stats.kAnon * 100));
      prog.hidden = false;
      prog.innerHTML =
        `<div class="an-prog-head"><b>Kartta aukeaa yhdessä:</b> suurimmassa ikäryhmässä on nyt `
        + `<b>${bestN}/${stats.kAnon}</b> jaettua suunnitelmaa (kaikkiaan ${stats.total}).</div>`
        + `<div class="an-prog-bar"><i style="width:${pct}%"></i></div>`
        + `<div class="an-prog-sub">Jakaumat julkaistaan, kun ikäryhmässä on ${stats.kAnon} anonyymiä suunnitelmaa. `
        + `Ole yksi avaajista — jaa omasi <a href="./#yhteenveto">Suunnitelmani-sivulta</a>.</div>`;
    } else {
      prog.hidden = true;
    }
  }

  // Tunnuslukutiilet
  const tiles = [{ k: 'Jaettuja suunnitelmia', v: String(stats.total) }];
  if (all.monthly) tiles.push({ k: 'Mediaani kk-säästö', v: `${Math.round(all.monthly.p50).toLocaleString('fi-FI')} €/kk` });
  if (all.retireAge) tiles.push({ k: 'Mediaani eläkeikätavoite', v: `${Math.round(all.retireAge.p50)} v` });
  if (all.events) {
    const top = Object.entries(all.events).filter(([t]) => t !== 'retirement').sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) tiles.push({ k: 'Yleisin tapahtuma', v: `${ICONS[top[0]]} ${Math.round(top[1] * 100)} %` });
  }
  $('anTiles').innerHTML = tiles.map((c) => `<div class="sum-tile"><div class="k">${c.k}</div><div class="v">${c.v}</div></div>`).join('');

  renderHero(stats, me);
  renderRidgeline(stats, me);
  renderQuartCols('savingsChart', stats, 'monthly', me, me ? me.monthly : null,
    (v) => v >= 1950 ? fmtCompact(v) : Math.round(v / 10) * 10 + ' €');
  renderQuartCols('stocksChart', stats, 'stocks', me, me ? me.stocks : null,
    (v) => Math.round(v) + ' %', (age) => 110 - age, 100);
  renderRetireHist(stats, me);
  renderPenCoverage(stats, me);

  const gd = (me && me.group && stats.groups[me.group] && stats.groups[me.group].goals) ? stats.groups[me.group] : all;
  if (gd.goals) {
    renderDonut('goalDonut', [
      { l: 'Kokeilen itse', v: gd.goals.manual, c: '#8fa0c4' },
      { l: 'Kestävä tulo', v: gd.goals.withdrawal, c: '#2dd4bf' },
      { l: 'Eläkeikä', v: gd.goals.age, c: '#8b7cf6' },
      { l: 'Tarvittava säästö', v: gd.goals.saving, c: '#fb923c' },
    ]);
  } else empty('goalDonut', needMsg(stats.total, stats.kAnon));
  if (gd.confs) {
    renderDonut('confDonut', [
      { l: 'Odotettu polku', v: gd.confs.none, c: '#8fa0c4' },
      { l: '75 %', v: gd.confs.c75, c: '#2dd4bf' },
      { l: '85 %', v: gd.confs.c85, c: '#8b7cf6' },
      { l: '95 %', v: gd.confs.c95, c: '#fb923c' },
    ]);
  } else empty('confDonut', needMsg(stats.total, stats.kAnon));

  renderHomeLoan(stats, me);
  renderRealism(stats, me);
  renderTimeline(stats);
  takeaways(stats, me);
  initZoom();

  // Menetelmä: n per ikäryhmä
  $('methodChips').innerHTML = GROUPS.map(([g]) => {
    const n = (stats.groups[g] && stats.groups[g].n) || 0;
    const ok = n >= stats.kAnon;
    return `<span class="an-chip ${ok ? 'ok' : ''}" title="${ok ? 'jakaumat julkaistu' : 'kertyy vielä'}">${g} v · ${n}</span>`;
  }).join('');
})();
