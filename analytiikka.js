'use strict';

/* Tilastot (ent. Vaurastumisen kartta) — avoin analytiikka Varallisuuspolun anonyymistä
   vertailudatasta. Kaikki kaaviot käsintehtyä SVG:tä, ei riippuvuuksia.
   "Sinä kartalla": oma suunnitelma luetaan VAIN localStoragesta — mitään
   ei lähetetä minnekään tältä sivulta. */

// Huom: sama osoite kuin app.js:n DATA_API — päivitä molemmat jos muuttuu
const DATA_API = 'https://varallisuuspolku-data.up.railway.app';

const ICONS = {
  study: '🎓', home: '🏠', car: '🚗', wedding: '💍', child: '👶', divorce: '💔', renovation: '🛠️',
  travel: '✈️', recurring: '💳', income_gap: '⏸️', cottage: '🏡', inheritance: '💎', bonus: '💰', retirement: '🌴',
  sidegig: '💼', goal: '🎯', ownHome: '🔑', ownFlat: '🏢', ownCottage: '🌲',
};
const LABELS = {
  study: 'Opiskelu', home: 'Asunnon osto', car: 'Auton osto', wedding: 'Häät', child: 'Lapsi',
  divorce: 'Ero / iso muutos', renovation: 'Remontti', travel: 'Unelmamatka', recurring: 'Kuukausimeno', income_gap: 'Tulokatko', cottage: 'Mökki / vene',
  inheritance: 'Perintö / lahja', bonus: 'Bonus', retirement: 'Eläkkeelle jäänti',
  sidegig: 'Sivutulo', goal: 'Tavoitepiste', ownHome: 'Asunto jo omistuksessa',
  ownFlat: 'Sijoitusasunto omistuksessa', ownCottage: 'Mökki / vene omistuksessa',
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
// fmtCompact: kieli.js (ladataan ennen tätä; huom. M€-desimaalit ≥10 M€:ssa 0 kuten muuallakin)
const text = (svg, x, y, str, cls, anchor) => {
  const t = el('text', { x, y, class: cls || 'an-tick', 'text-anchor': anchor || 'start' }, svg);
  t.textContent = str;
  return t;
};
function empty(containerId, msg) {
  $(containerId).innerHTML = `<div class="an-empty">📈 ${t(msg)}</div>`;
}
const needMsg = (total, k) =>
  t('Kertyy vielä — jaettuja suunnitelmia {0}. Jakauma julkaistaan, kun ryhmässä on vähintään {1}.', total, k);

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
// Resolveri palauttaa joko html-merkkijonon tai { html, x, y1, y2 }, jolloin
// kaavioon piirtyy pystykatkoviiva kohdistetun sarakkeen kohdalle.

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
  let line = null; // kohdistusviiva luodaan laiskasti tähän svg:hen (myös klooni saa omansa)
  const hideLine = () => { if (line) line.setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const vb = svg.viewBox.baseVal;
    const hit = resolve((e.clientX - r.left) / r.width * vb.width, (e.clientY - r.top) / r.height * vb.height);
    if (!hit) { tipHide(); hideLine(); return; }
    const h = typeof hit === 'string' ? { html: hit } : hit;
    tipShow(h.html, e.clientX, e.clientY);
    if (h.x != null) {
      if (!line) line = el('line', { class: 'an-xline' }, svg);
      line.setAttribute('x1', h.x); line.setAttribute('x2', h.x);
      line.setAttribute('y1', h.y1); line.setAttribute('y2', h.y2);
      line.setAttribute('visibility', 'visible');
    } else hideLine();
  });
  svg.addEventListener('pointerleave', () => { tipHide(); hideLine(); });
}
function attachHover(svg, resolve) { svg.__anHover = resolve; bindHover(svg, resolve); }

/* Kortin otsikon small-tekstin vaihto — fallback-näkymä kertoo mitä näytetään */
function setSmall(containerId, txt) {
  const c = $(containerId);
  if (!c) return;
  let h = c.previousElementSibling;
  while (h && !/^H[23]$/.test(h.tagName)) h = h.previousElementSibling;
  if (!h) return;
  let s = h.querySelector('small');
  if (!s) { s = document.createElement('small'); h.appendChild(s); }
  s.textContent = txt;
}

/* "sinä"-selite kortin otsikkoon — kaavion viereen, ei irralliseksi.
   Kutsutaan vain kun oma merkki oikeasti piirtyi; glyyfi vastaa kaavion merkkiä. */
function markYou(containerId, glyph) {
  const c = $(containerId);
  if (!c) return;
  let h = c.previousElementSibling;
  while (h && !/^H[23]$/.test(h.tagName)) h = h.previousElementSibling;
  if (!h || h.querySelector('.an-youchip')) return;
  const s = document.createElement('span');
  s.className = 'an-youchip';
  s.textContent = `${glyph} ${t('sinä')}`;
  h.appendChild(s);
}

/* ---------- Kaaviot ---------- */

// Kategorinen histogrammi: lokerot tasalevein pylväin (reunavälit saavat olla
// epätasaiset). Koko joukon varanäkymä ikäryhmäkortteihin, kunnes ryhmiä
// aukeaa — mediaaniviiva ja oma merkki kuten eläkeikäkortissa.
// Pylväiden jaettu pystyliukuväri — yksi def per svg (klooni perii saman id:n,
// ja selain hakee määritelmän dokumentista, joten suurennos toimii)
let gradSeq = 0;
function histBarFill(svg) {
  if (svg.__barFill) return svg.__barFill;
  const id = 'anHg' + (++gradSeq);
  const defs = el('defs', {}, svg);
  const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0%', 'stop-color': 'rgba(45,212,191,0.9)' }, g);
  el('stop', { offset: '100%', 'stop-color': 'rgba(45,212,191,0.3)' }, g);
  svg.__barFill = `url(#${id})`;
  return svg.__barFill;
}

// Pylväs pyöristetyin yläkulmin ja tasaisella jalalla (rect pyöristäisi kaikki)
function histBar(svg, x, yTop, w, base, fill) {
  const r = Math.min(4, w / 2, Math.max(0, base - yTop));
  el('path', {
    class: 'hbar',
    d: `M ${x.toFixed(1)} ${base.toFixed(1)} L ${x.toFixed(1)} ${(yTop + r).toFixed(1)}` +
      ` Q ${x.toFixed(1)} ${yTop.toFixed(1)} ${(x + r).toFixed(1)} ${yTop.toFixed(1)}` +
      ` L ${(x + w - r).toFixed(1)} ${yTop.toFixed(1)}` +
      ` Q ${(x + w).toFixed(1)} ${yTop.toFixed(1)} ${(x + w).toFixed(1)} ${(yTop + r).toFixed(1)}` +
      ` L ${(x + w).toFixed(1)} ${base.toFixed(1)} Z`,
    fill, stroke: 'rgba(45,212,191,0.45)', 'stroke-width': 1,
  }, svg);
}

function renderHistCols(containerId, h, opts) {
  const o = opts || {};
  const fmt = o.fmt || String;
  // Tyhjät reunalokerot pois (yksi jää puskuriksi): vino jakauma ei jätä
  // puolta kaaviosta tyhjäksi (esim. osakepaino keskittyy 60–100 %:iin)
  let lo = h.counts.findIndex((c) => c > 0);
  if (lo < 0) return empty(containerId, 'Kertyy vielä.');
  let hi = h.counts.length - 1;
  while (h.counts[hi] === 0) hi--;
  lo = Math.max(0, lo - 1); hi = Math.min(h.counts.length - 1, hi + 1);
  const counts = h.counts.slice(lo, hi + 1);
  const edges = h.edges.slice(lo, hi + 2);
  const nB = counts.length;
  const total = counts.reduce((s, c) => s + c, 0) || 1;

  const W = o.W || 470, H = o.H || 240, l = 40, r = 14, t = 16, b = 30;
  const svg = svgIn($(containerId), W, H);
  const bw = (W - l - r) / nB;
  const base = H - b;
  // %-asteikko ruudukolla: osuudet vertautuvat kaavioiden välillä ja tyhjä
  // tila saa rakenteen — askel valitaan niin että viivoja on 2–4
  const maxP = Math.max(...counts) / total;
  const step = [0.02, 0.05, 0.1, 0.2, 0.25].find((s) => maxP / s <= 4) || 0.5;
  const yMax = maxP * 1.12;
  const Y = (p) => base - (p / yMax) * (H - t - b);
  for (let i = 1; i * step <= yMax; i++) {
    el('line', { x1: l, y1: Y(i * step), x2: W - r, y2: Y(i * step), class: 'grid-line' }, svg);
    text(svg, l - 6, Y(i * step) + 4, Math.round(i * step * 100) + ' %', 'an-tick', 'end');
  }
  el('line', { x1: l, y1: base, x2: W - r, y2: base, class: 'grid-line' }, svg);
  const xEdge = (k) => l + k * bw;
  const xOf = (v) => { // arvo → x lineaarisesti lokeron sisällä
    const cv = Math.max(edges[0], Math.min(edges[nB], v));
    let k = edges.findIndex((e, i) => i < nB && cv < edges[i + 1]);
    if (k === -1) k = nB - 1;
    const e0 = edges[k], e1 = edges[k + 1];
    const f = e1 > e0 ? Math.max(0, Math.min(1, (cv - e0) / (e1 - e0))) : 0.5;
    return xEdge(k) + f * bw;
  };
  const fill = histBarFill(svg);
  counts.forEach((c, i) => {
    if (!c) return;
    histBar(svg, xEdge(i) + 1.5, Y(c / total), Math.max(2, bw - 3), base, fill);
  });
  // X-nimiöt: siistit tasa-arvot (labelEdges) kun niitä on, muuten joka n:s reuna
  let labs = (o.labelEdges || []).filter((v) => edges.includes(v));
  if (labs.length >= 3) {
    if (!labs.includes(edges[0])) labs.unshift(edges[0]);
    if (!labs.includes(edges[nB])) labs.push(edges[nB]);
  } else {
    labs = [];
    const st = Math.ceil(nB / 4);
    for (let k = 0; k < nB; k += st) if (nB - k >= st * 0.6) labs.push(edges[k]);
    labs.push(edges[nB]);
  }
  for (const v of labs) {
    const k = edges.indexOf(v);
    text(svg, xEdge(k), H - 10, fmt(v), 'an-tick', k === 0 ? 'start' : k === nB ? 'end' : 'middle');
  }
  if (o.med != null) {
    const mx = xOf(o.med);
    el('line', { x1: mx, y1: t, x2: mx, y2: base, stroke: '#2dd4bf', 'stroke-width': 2, 'stroke-dasharray': '3 4' }, svg);
    const right = mx > l + (W - l - r) * 0.72; // nimiö kääntyy vasemmalle oikeassa reunassa
    text(svg, right ? mx - 6 : mx + 6, t + 11, window.t('med. {0}', fmt(o.med)), 'an-tick-strong', right ? 'end' : 'start');
  }
  // Oma merkki oman lokeron pylvään päälle — ei irralleen yläreunaan
  if (o.meVal != null) {
    const mv = Math.max(edges[0], Math.min(edges[nB], o.meVal));
    let k = edges.findIndex((e, i) => i < nB && mv < edges[i + 1]);
    if (k < 0) k = nB - 1;
    const yTop = counts[k] ? Y(counts[k] / total) : base;
    el('path', { d: `M ${xOf(mv).toFixed(1)} ${(yTop - 4).toFixed(1)} l 5 -8 l -10 0 Z`, fill: YOU }, svg);
    markYou(containerId, '▼'); // kärki osoittaa omaan lokeroon

  }
  attachHover(svg, (x) => {
    const i = Math.floor((x - l) / bw);
    if (i < 0 || i >= nB || !counts[i]) return null;
    return {
      html: `<b>${fmt(edges[i])} – ${fmt(edges[i + 1])}</b><br>${window.t('{0} suunnitelmaa · {1} %', counts[i], Math.round((counts[i] / total) * 100))}`,
      x: xEdge(i) + bw / 2, y1: t, y2: base,
    };
  });
}

// Ikäryhmäkortin varanäkymä koko joukon histogrammista; palauttaa true jos piirtyi
const LABEL_EDGES = { // siistit x-nimiöarvot per jakauma (leikataan näkyvään alueeseen)
  monthly: [0, 500, 1000, 2000, 5000, 10000],
  stocks: [0, 20, 40, 60, 80, 100],
  startCapital: [0, 50000, 150000, 400000, 1000000, 2000000],
};
function histFallback(containerId, stats, key, meVal, fmt, dims) {
  const all = stats.groups.all;
  const ah = all && all.hist && all.hist[key];
  if (!ah) return false;
  renderHistCols(containerId, ah, Object.assign(
    { fmt, med: all[key] && all[key].p50, meVal, labelEdges: LABEL_EDGES[key] }, dims));
  setSmall(containerId, t('kaikki jakajat · n = {0}', all.n));
  return true;
}

// Hero: varallisuusvyöhyke ikäryhmien yli (sqrt-asteikko — varallisuus kasvaa moninkertaisesti)
function renderHero(stats, me) {
  const pts = GROUPS.map(([g, cx]) => ({ g, cx, q: stats.groups[g] && stats.groups[g].startCapital }))
    .filter((p) => p.q);
  if (pts.length < 2) {
    if (histFallback('heroChart', stats, 'startCapital', me ? me.startCapital : null, fmtCompact, { W: 960, H: 320 })) return;
    return empty('heroChart', needMsg(stats.total, stats.kAnon));
  }
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
    markYou('heroChart', '●');
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
    return {
      html: `<b>${window.t('{0} v', best.p.g)}</b>${n ? ` · n = ${n}` : ''}<br>P75 ${fmtCompact(q.p75)}<br>${window.t('Mediaani')} <b>${fmtCompact(q.p50)}</b><br>P25 ${fmtCompact(q.p25)}`,
      x: X(best.p.cx), y1: t, y2: H - b,
    };
  });
}

// Elämän kartta: ridgeline tapahtumien suunnitelluista i'istä
function renderRidgeline(stats, me) {
  const order = ['study', 'home', 'child', 'wedding', 'divorce', 'income_gap', 'car', 'renovation', 'travel', 'recurring', 'cottage', 'retirement'];
  const rows = order.filter((t) => stats.eventAges && stats.eventAges[t]);
  if (!rows.length) return empty('ridgeline', needMsg(stats.total, stats.kAnon));
  const W = 960, rowH = 52, l = 170, r = 90, headH = 26;
  const H = headH + rows.length * rowH + 30;
  const svg = svgIn($('ridgeline'), W, H);
  const X = (age) => l + ((age - 18) / (81 - 18)) * (W - l - r);
  for (let a = 20; a <= 80; a += 10) {
    el('line', { x1: X(a), y1: headH, x2: X(a), y2: H - 24, class: 'grid-line-x' }, svg);
    text(svg, X(a), H - 8, a + ' ' + VP_YKS_V, 'an-tick', 'middle');
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
    text(svg, 12, base - 6, `${ICONS[type]} ${t(LABELS[type])}`, 'an-row-label');
    text(svg, W - r + 8, base - 6, t('med. {0} v', Math.round(d.p50)), 'an-tick');
    if (me) {
      const mine = type === 'retirement' ? me.ret : me.events.find((e) => e.type === type);
      if (mine) {
        el('path', { d: `M ${X(mine.age).toFixed(1)} ${base + 2} l 5 8 l -10 0 Z`, fill: YOU }, svg);
        markYou('ridgeline', '▲');
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
        return {
          html: `${ICONS[type]} <b>${t(LABELS[type])}</b> · ${t('med. {0} v', Math.round(d.p50))}<br>` +
            t('{0}–{1} v: {2} % suunnitelmista', d.edges[k], d.edges[k + 1], Math.round((d.counts[k] / tot) * 100)),
          x: (X(d.edges[k]) + X(d.edges[k + 1])) / 2, y1: headH, y2: H - 24,
        };
      }
    }
    return `${ICONS[type]} <b>${t(LABELS[type])}</b> · ${t('mediaani {0} v', Math.round(d.p50))}`;
  });
}

// Kvartiilipylväät ikäryhmittäin (kk-säästö, osakepaino)
function renderQuartCols(containerId, stats, key, me, meVal, fmt, refFn, vCap) {
  const pts = GROUPS.map(([g, cx], i) => ({ g, i, q: stats.groups[g] && stats.groups[g][key] })).filter((p) => p.q);
  if (pts.length < 2) {
    if (histFallback(containerId, stats, key, meVal, fmt)) return;
    return empty(containerId, needMsg(stats.total, stats.kAnon));
  }
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
      markYou(containerId, '◂');
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
    return {
      html: `<b>${window.t('{0} v', best.p.g)}</b>${n ? ` · n = ${n}` : ''}<br>P75 ${fmt(q.p75)}<br>${window.t('Mediaani')} <b>${fmt(q.p50)}</b><br>P25 ${fmt(q.p25)}`,
      x: X(best.p.i), y1: t, y2: H - b,
    };
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
  // varjostuksen selite on otsikossa — tekstinimiö jäisi pylvään alle
  el('rect', { x: X(65), y: t, width: X(68) - X(65), height: H - t - b, fill: 'rgba(139,124,246,0.12)' }, svg);
  h.counts.forEach((c, i) => {
    if (!c) return;
    const x0 = X(h.edges[i]), x1 = X(h.edges[i + 1]);
    histBar(svg, x0 + 1, Y(c), Math.max(2, x1 - x0 - 2), H - b, histBarFill(svg));
  });
  for (let a = 40; a <= 80; a += 10) text(svg, X(a), H - 10, a + ' ' + VP_YKS_V, 'an-tick', 'middle');
  if (g.retireAge) {
    el('line', { x1: X(g.retireAge.p50), y1: t, x2: X(g.retireAge.p50), y2: H - b, stroke: '#2dd4bf', 'stroke-width': 2, 'stroke-dasharray': '3 4' }, svg);
  }
  if (me && me.ret) {
    // merkki oman lokeron pylvään päälle, samaan tapaan kuin histogrammeissa
    const a = Math.max(h.edges[0], Math.min(h.edges[h.edges.length - 1], me.ret.age));
    let k = h.edges.findIndex((e, i) => i < h.counts.length && a < h.edges[i + 1]);
    if (k < 0) k = h.counts.length - 1;
    const yTop = h.counts[k] ? Y(h.counts[k]) : H - b;
    el('path', { d: `M ${X(a).toFixed(1)} ${(yTop - 4).toFixed(1)} l 5 -8 l -10 0 Z`, fill: YOU }, svg);
    markYou('retireHist', '▼');
  }
  const totalC = h.counts.reduce((s, c) => s + c, 0) || 1;
  attachHover(svg, (x) => {
    for (let i = 0; i < h.counts.length; i++) {
      if (x >= X(h.edges[i]) && x < X(h.edges[i + 1]) && h.counts[i] > 0) {
        return {
          html: `<b>${window.t('Eläkeikä {0}–{1} v', h.edges[i], h.edges[i + 1])}</b><br>${window.t('{0} suunnitelmaa · {1} %', h.counts[i], Math.round((h.counts[i] / totalC) * 100))}`,
          x: (X(h.edges[i]) + X(h.edges[i + 1])) / 2, y1: t, y2: H - b,
        };
      }
    }
    return null;
  });
}

// Työeläkkeen kateosuus: pinopalkit ikäryhmittäin
function renderPenCoverage(stats, me) {
  const rows = GROUPS.map(([g]) => ({ g, s: stats.groups[g] && stats.groups[g].penShare })).filter((r) => r.s);
  // Koko joukon rivi, kunnes yksikin ikäryhmä on auki
  if (!rows.length && stats.groups.all && stats.groups.all.penShare) {
    rows.push({ g: 'kaikki', s: stats.groups.all.penShare });
  }
  if (!rows.length) return empty('penCoverage', needMsg(stats.total, stats.kAnon));
  let html = '<div class="an-cov">';
  for (const r of rows) {
    const pct = Math.round(r.s.p50 * 100);
    const mine = me && me.group === r.g ? ' mine' : '';
    html += `<div class="an-cov-row${mine}"><span class="cg">${t(r.g)}</span>` +
      `<span class="cbar"><i style="width:${pct}%"></i></span>` +
      `<span class="cpct">${t('{0} % työeläke', pct)}</span></div>`;
  }
  html += `</div><p class="an-note" style="margin-top:8px">${t('Mediaani: työeläkkeen osuus eläkeajan kuukausitulosta — loput katetaan sijoituksista.')}</p>`;
  $('penCoverage').innerHTML = html;
}

// Donitsi. Kun yksi siivu on ≥ 90 %, donitsi ei kerro mitään — silloin
// osuudet piirretään palkkiriveinä, jotka pysyvät lukukelpoisina.
function renderDonut(containerId, slicesIn, note) {
  const slices = slicesIn.filter((s) => s.v > 0.005);
  if (!slices.length) return empty(containerId, 'Kertyy vielä.');
  const totalV = slices.reduce((s, x) => s + x.v, 0);
  if (Math.max(...slices.map((s) => s.v)) / totalV >= 0.9) {
    $(containerId).innerHTML = slices.map((s) =>
      `<div class="an-share"><span class="k">${t(s.l)}</span>` +
      `<span class="sbar"><i style="width:${Math.round((s.v / totalV) * 100)}%"></i></span>` +
      `<b>${Math.round((s.v / totalV) * 100)} %</b></div>`).join('');
    return;
  }
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
    text(svg, 176, 32 + i * 26, `${t(s.l)} ${Math.round((s.v / total) * 100)} %`, 'an-tick-strong');
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
    return hit ? `<b>${t(hit.s.l)}</b> · ${Math.round((hit.s.v / total) * 100)} %` : null;
  });
}

// Tapahtumaranking: kuinka suuri osa suunnitelmista sisältää kunkin tapahtuman
function renderEventRank(stats, me) {
  const g = (me && me.group && stats.groups[me.group] && stats.groups[me.group].events)
    ? stats.groups[me.group] : stats.groups.all;
  if (!g || !g.events) return empty('eventRank', needMsg(stats.total, stats.kAnon));
  const rows = Object.entries(g.events)
    .filter(([t, v]) => t !== 'retirement' && v > 0 && LABELS[t])
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!rows.length) return empty('eventRank', 'Kertyy vielä.');
  $('eventRank').innerHTML = rows.map(([t, v]) => {
    const mine = me && me.events.some((e) => e.type === t) ? ` <span class="you">${window.t('sinullakin ✓')}</span>` : '';
    return `<div class="an-share"><span class="k">${ICONS[t]} ${window.t(LABELS[t])}${mine}</span>` +
      `<span class="sbar"><i style="width:${Math.round(v * 100)}%"></i></span><b>${Math.round(v * 100)} %</b></div>`;
  }).join('') + `<p class="an-note" style="margin-top:10px">${g !== stats.groups.all
    ? t('Osuus suunnitelmista ikäryhmässä {0}, joissa tapahtuma on mukana (n = {1}).', me.group, g.n)
    : t('Osuus suunnitelmista, joissa tapahtuma on mukana (n = {0}).', g.n)}</p>`;
}

// Eläkeajan talous: tulotarve, työeläke ja varallisuus eläkkeelle jäädessä
function renderRetirePlan(stats, me) {
  const g = (me && me.group && stats.groups[me.group] && stats.groups[me.group].withdrawal)
    ? stats.groups[me.group] : stats.groups.all;
  if (!g || (!g.withdrawal && !g.wAtRet)) return empty('retirePlan', needMsg(stats.total, stats.kAnon));
  const eurKk = (v) => fmtLuku(Math.round(v)) + ' €/' + VP_YKS_KK;
  const row = (k, q, fmt, mine) =>
    `<div class="an-hl-row"><span class="k">${k}</span><b>${fmt(q.p50)}</b>` +
    `<span class="rng">${t('P25–P75: {0} – {1}', fmt(q.p25), fmt(q.p75))}</span>` +
    (mine != null ? `<span class="you">${t('sinä: {0}', fmt(mine))}</span>` : '') + `</div>`;
  let html = '';
  if (g.withdrawal) html += row(t('Kuukausitulon tarve eläkkeellä'), g.withdrawal, eurKk, me && me.ret ? me.ret.withdrawal : null);
  if (g.pension) html += row(t('Työeläkeoletus'), g.pension, eurKk, me && me.ret && me.ret.pension > 0 ? me.ret.pension : null);
  if (g.wAtRet) html += row(t('Varallisuus eläkkeelle jäädessä'), g.wAtRet, fmtCompact, null);
  $('retirePlan').innerHTML = html +
    `<p class="an-note" style="margin-top:10px">${g === stats.groups.all
      ? t('Mediaani ja P25–P75 kaikista jakajista (n = {0}).', g.n)
      : t('Mediaani ja P25–P75 ikäryhmästä {0} (n = {1}).', me.group, g.n)} ` +
    `${t('Varallisuus eläkkeellä on laskentamoottorin tulos kunkin suunnitelman omilla oletuksilla.')}</p>`;
}

// Asuntolaina: tunnuslukurivit
function renderHomeLoan(stats, me) {
  const hl = stats.homeLoan;
  if (!hl) return empty('homeLoan', needMsg(stats.total, stats.kAnon));
  const pct = (v) => Math.round(v * 100) + ' %';
  const myHome = me && me.events.find((e) => e.type === 'home' && e.financing === 'loan');
  const row = (k, q, fmt, mine) =>
    `<div class="an-hl-row"><span class="k">${k}</span><b>${fmt(q.p50)}</b>` +
    `<span class="rng">${t('P25–P75: {0} – {1}', fmt(q.p25), fmt(q.p75))}</span>` +
    (mine != null ? `<span class="you">${t('sinä: {0}', fmt(mine))}</span>` : '') + `</div>`;
  $('homeLoan').innerHTML =
    row(t('Asunnon hinta'), hl.price, fmtCompact, myHome ? -myHome.amount : null) +
    (hl.downShare ? row(t('Käsirahan osuus'), hl.downShare, pct, myHome && myHome.down != null ? myHome.down / -myHome.amount : null) : '') +
    (hl.years ? row(t('Laina-aika'), hl.years, (v) => Math.round(v) + ' ' + VP_YKS_V, myHome ? myHome.years : null) : '') +
    (hl.rate ? row(t('Korko-oletus'), hl.rate, (v) => fmtLuku(v, { maximumFractionDigits: 1 }) + ' %', myHome ? myHome.rate : null) : '') +
    `<p class="an-note" style="margin-top:10px">${t('Suunnitelmien asunnonostot lainalla (n = {0}).', hl.n)}</p>`;
}

// Jo omistettu varallisuus: omistusaste + arvo/laina-kvartiilit (own*-tyypit)
function renderOwned(stats, me) {
  const ow = stats.owned;
  if (!ow) return empty('ownedCard', needMsg(stats.total, stats.kAnon));
  const OWNED = ['ownHome', 'ownFlat', 'ownCottage'];
  const mine = me && me.events.filter((e) => OWNED.includes(e.type) && e.amount < 0);
  const bar = (k, v, you) =>
    `<div class="an-share"><span class="k">${k}</span><span class="sbar"><i style="width:${Math.round(v * 100)}%"></i></span><b>${Math.round(v * 100)} %</b>` +
    (you ? `<span class="you">${you}</span>` : '') + `</div>`;
  const row = (k, q, fmt, mineV) =>
    `<div class="an-hl-row"><span class="k">${k}</span><b>${fmt(q.p50)}</b>` +
    `<span class="rng">${t('P25–P75: {0} – {1}', fmt(q.p25), fmt(q.p75))}</span>` +
    (mineV != null ? `<span class="you">${t('sinä: {0}', fmt(mineV))}</span>` : '') + `</div>`;
  let html = bar(t('Suunnitelmassa jo omistettua'), ow.share, mine && mine.length ? t('sinäkin ✓') : '');
  if (ow.debtShare != null) html += bar(t('Omistuksissa lainaa jäljellä'), ow.debtShare);
  if (ow.value) html += row(t('Omistuksen nykyarvo'), ow.value, fmtCompact, mine && mine.length ? -mine[0].amount : null);
  if (ow.loanLeft) html += row(t('Lainaa jäljellä'), ow.loanLeft, fmtCompact, mine && mine.length && (mine[0].loanLeft || 0) > 0 ? mine[0].loanLeft : null);
  html += `<p class="an-note" style="margin-top:10px">${t('Jo omistettu asunto, sijoitusasunto tai mökki nykyarvoon (n = {0} suunnitelmaa). Uusi tapahtumatyyppi {1} alkaen — jakaumat täydentyvät datan karttuessa.', ow.n, '25.7.2026')}</p>`;
  $('ownedCard').innerHTML = html;
}

// Realismi: kytkinten käyttö + onnistumis-%
function renderRealism(stats, me) {
  const g = (me && me.group && stats.groups[me.group] && stats.groups[me.group].shares)
    ? stats.groups[me.group] : stats.groups.all;
  if (!g || !g.shares) return empty('realism', needMsg(stats.total, stats.kAnon));
  const bar = (k, v) =>
    `<div class="an-share"><span class="k">${k}</span><span class="sbar"><i style="width:${Math.round(v * 100)}%"></i></span><b>${Math.round(v * 100)} %</b></div>`;
  let html = bar(t('Myyntivoittovero mallinnettu'), g.shares.tax) +
    bar(t('Ikäsidonnainen allokaatio'), g.shares.glide) +
    bar(t('Inflaatiokorjaus käytössä'), g.shares.real);
  if (g.successProb) {
    html += `<div class="an-hl-row" style="margin-top:12px"><span class="k">${t('Onnistumistodennäköisyys')}</span>` +
      `<b>${Math.round(g.successProb.p50 * 100)} %</b>` +
      `<span class="rng">${t('P25–P75: {0}–{1} %', Math.round(g.successProb.p25 * 100), Math.round(g.successProb.p75 * 100))}</span></div>`;
  }
  $('realism').innerHTML = html + `<p class="an-note" style="margin-top:10px">${me && me.group && g !== stats.groups.all
    ? t('Osuus suunnitelmista ikäryhmässä {0}.', me.group) : t('Osuus suunnitelmista.')}</p>`;
}

// Kertymä-sparkline
function renderTimeline(stats) {
  const tl = stats.timeline || [];
  if (!tl.length) return empty('timeline', 'Ei vielä jaettuja suunnitelmia.');
  // Parin kuukauden kertymä yhtenä möhkälepalkkina näyttäisi rikkinäiseltä —
  // lukuteksti kunnes kuukausia on vertailtavaksi asti
  if (tl.length < 3) {
    const since = fmtPvm(new Date(tl[0].m + '-01T00:00:00'), { month: 'long', year: 'numeric' });
    $('timeline').innerHTML =
      `<div class="an-hl-row"><span class="k">${window.t('Jaettuja suunnitelmia yhteensä')}</span><b>${stats.total}</b>` +
      `<span class="rng">${window.t('alkaen {0}', since)}</span></div>` +
      `<p class="an-note" style="margin-top:8px">${window.t('Kuukausittainen kertymäkäyrä piirtyy, kun kuukausia on useampi.')}</p>`;
    return;
  }
  const W = 470, H = 110, l = 8, r = 8, t = 10, b = 24;
  const svg = svgIn($('timeline'), W, H);
  const maxN = Math.max(...tl.map((x) => x.n), 1);
  const bw = (W - l - r) / tl.length;
  tl.forEach((x, i) => {
    const h = ((H - t - b) * x.n) / maxN;
    el('rect', { x: l + i * bw + 2, y: H - b - h, width: Math.max(3, bw - 4), height: h, rx: 3, fill: 'rgba(139,124,246,0.65)' }, svg);
    if (i === 0 || i === tl.length - 1) text(svg, l + i * bw + bw / 2, H - 8, x.m, 'an-tick', 'middle');
  });
  text(svg, W - r, t + 6, window.t('yht. {0}', stats.total), 'an-tick-strong', 'end');
  attachHover(svg, (x) => {
    const i = Math.floor((x - l) / bw);
    if (i < 0 || i >= tl.length) return null;
    return {
      html: `<b>${tl[i].m}</b> · ${window.t('{0} jaettua suunnitelmaa', tl[i].n)}`,
      x: l + i * bw + bw / 2, y1: t, y2: H - b,
    };
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
    ? `<div class="an-lock-card"><div class="ic">🗺️</div><h2>${t('Melkein valmista')}</h2>
       <p>${t('Sinulla on jo oma suunnitelma. Tilastot aukeavat, kun jaat sen <b>anonyymisti</b> — näet ensin täsmälleen mitä jaetaan, eikä se velvoita mihinkään.')}</p>
       <a class="btn" href="./#yhteenveto">${t('Avaa Suunnitelmani ja jaa →')}</a>
       <p class="small">${t('Ei tunnisteita · summat pyöristetään · jakaumat julkaistaan vasta ≥ 30 suunnitelman ryhmistä · aggregaatit ovat avointa dataa:')}
       <a href="${DATA_API}/stats.json" target="_blank" rel="noopener">stats.json</a></p></div>`
    : `<div class="an-lock-card"><div class="ic">📊</div><h2>${t('Tilastot — miten muut suunnittelevat vaurastumista')}</h2>
       <p>${t('Tämä näkymä kertoo, miten eri ikäiset suunnittelevat talouttaan ja etenevät vaurastumisen matkalla. Tilastot aukeavat, kun sinullakin on <b>oma suunnitelma</b>.')}</p>
       <a class="btn" href="./">${t('Tee oma suunnitelma →')}</a>
       <p class="small">${t('Vie pari minuuttia — suunnitelmasi pysyy {0}.', (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? t('omalla laitteellasi') : t('omassa selaimessasi'))}</p></div>`;
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
    btn.title = t('Suurenna');
    btn.setAttribute('aria-label', t('Suurenna kaavio'));
    btn.textContent = '⛶';
    btn.addEventListener('click', () => {
      const light = document.createElement('div');
      light.className = 'an-light';
      const clone = card.cloneNode(true);
      const zb = clone.querySelector('.an-zoom');
      if (zb) zb.remove();
      clone.querySelectorAll('.an-xline').forEach((n) => n.remove()); // klooni saa oman kohdistusviivan bindHoverista
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'an-light-x';
      x.setAttribute('aria-label', t('Sulje'));
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
  if (v >= q.p75) return t('ylimmässä neljänneksessä');
  if (v >= q.p50) return t('mediaanin yläpuolella');
  if (v >= q.p25) return t('mediaanin alapuolella');
  return t('alimmassa neljänneksessä');
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
    addTake('heroChart', t('Ikäryhmäsi {0} mediaanivarallisuus on <b>{1}</b> — sinun {2} on {3}.', me.group, fmtCompact(g.startCapital.p50), fmtCompact(me.startCapital), quartPos(me.startCapital, g.startCapital)) + n);
  }
  if (g && g.monthly && me.monthly != null) {
    addTake('savingsChart', t('Ikäryhmäsi mediaanisäästö on <b>{0} €/kk</b> — sinun {1} €/kk on {2}.', fmtLuku(Math.round(g.monthly.p50)), fmtLuku(Math.round(me.monthly)), quartPos(me.monthly, g.monthly)) + n);
  }
  if (g && g.stocks && me.stocks != null) {
    addTake('stocksChart', t('Ikäryhmäsi mediaaniosakepaino on <b>{0} %</b> — sinulla {1} %.', Math.round(g.stocks.p50), Math.round(me.stocks)) + n);
  }
  // Ikäryhmä vielä kiinni mutta koko joukko auki: sama lause kaikista jakajista
  const all = stats.groups.all;
  const an = all && all.n ? ` <span class="an-take-n">n = ${all.n}</span>` : '';
  if (me && !(g && g.startCapital) && all && all.startCapital && me.startCapital != null) {
    addTake('heroChart', t('Kaikkien jakajien mediaanivarallisuus on <b>{0}</b> — sinun {1} on {2}.', fmtCompact(all.startCapital.p50), fmtCompact(me.startCapital), quartPos(me.startCapital, all.startCapital)) + an);
  }
  if (me && !(g && g.monthly) && all && all.monthly && me.monthly != null) {
    addTake('savingsChart', t('Kaikkien jakajien mediaanisäästö on <b>{0}&nbsp;€/kk</b> — sinun {1}&nbsp;€/kk on {2}.', fmtLuku(Math.round(all.monthly.p50)), fmtLuku(Math.round(me.monthly)), quartPos(me.monthly, all.monthly)) + an);
  }
  if (me && !(g && g.stocks) && all && all.stocks && me.stocks != null) {
    addTake('stocksChart', t('Kaikkien jakajien mediaaniosakepaino on <b>{0}&nbsp;%</b> — sinulla {1}&nbsp;%.', Math.round(all.stocks.p50), Math.round(me.stocks)) + an);
  }
  const rg = (g && g.retireAge) ? g : stats.groups.all;
  if (rg && rg.retireAge && me && me.ret) {
    const med = Math.round(rg.retireAge.p50);
    const d = Math.round(me.ret.age) - med;
    const rTxt = d === 0 ? t('sama kuin mediaani') : d < 0 ? t('{0} v mediaania aiemmin', -d) : t('{0} v mediaania myöhemmin', d);
    addTake('retireHist', rg === stats.groups.all
      ? t('Mediaani eläkeikätavoite on <b>{0} v</b> — sinun {1} v on {2}.', med, Math.round(me.ret.age), rTxt)
      : t('Mediaani eläkeikätavoite ikäryhmässäsi on <b>{0} v</b> — sinun {1} v on {2}.', med, Math.round(me.ret.age), rTxt));
  }
}

/* ---------- Sivun kokoaminen ---------- */

(async () => {
  const me = readMe();
  renderGate(me);
  // Paluulinkit: kun oma suunnitelma on olemassa, nappi kertoo että sinne palataan
  if (me) {
    document.querySelectorAll('a.an-return').forEach((a) => { a.textContent = t('← Palaa suunnitelmaasi'); });
  }
  $('anStatsLink').href = DATA_API + '/stats.json';

  /* Välimuisti ensin, verkko taustalla (stale-while-revalidate; Olavin
     laitehavainto 8.8.: tiilet ja edistymiskortti "räpsähtivät" paikoilleen
     verkon viiveellä): sivu renderöityy heti edellisestä datasta täydessä
     layoutissa, tuore data haetaan taustalla ja piirretään vain jos se
     muuttui. Ensikäynnillä luurankotiilet varaavat tilan. */
  const STATS_CACHE_KEY = 'vp-stats-cache';
  let stats = null;

  const renderStats = () => {

  $('anUpdated').textContent = t('Päivitetty {0}.', fmtPvm(new Date(stats.updated)));
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
        `<div class="an-prog-head">${t('<b>Kartta aukeaa yhdessä:</b> suurimmassa ikäryhmässä on nyt <b>{0}/{1}</b> jaettua suunnitelmaa (kaikkiaan {2}).', bestN, stats.kAnon, stats.total)}</div>`
        + `<div class="an-prog-bar"><i style="width:${pct}%"></i></div>`
        + `<div class="an-prog-sub">${t('Jakaumat julkaistaan, kun ikäryhmässä on {0} anonyymiä suunnitelmaa.', stats.kAnon)} `
        + `${t('Ole yksi avaajista — jaa omasi <a href="./#yhteenveto">Suunnitelmani-sivulta</a>.')}</div>`;
    } else {
      prog.hidden = true;
    }
  }

  // Tunnuslukutiilet
  const tiles = [{ k: 'Jaettuja suunnitelmia', v: String(stats.total) }];
  if (all.monthly) tiles.push({ k: 'Mediaani kk-säästö', v: `${fmtLuku(Math.round(all.monthly.p50))} €/${VP_YKS_KK}` });
  if (all.retireAge) tiles.push({ k: 'Mediaani eläkeikätavoite', v: `${Math.round(all.retireAge.p50)} ${VP_YKS_V}` });
  if (all.wAtRet) tiles.push({ k: 'Mediaani varallisuus eläkkeellä', v: fmtCompact(all.wAtRet.p50) });
  if (all.events) {
    const top = Object.entries(all.events).filter(([t]) => t !== 'retirement' && LABELS[t]).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0) tiles.push({ k: t('Yleisin: {0}', t(LABELS[top[0]]).toLowerCase()), v: `${ICONS[top[0]]} ${Math.round(top[1] * 100)} %` });
  }
  $('anTiles').innerHTML = tiles.map((c) => `<div class="sum-tile"><div class="k">${t(c.k)}</div><div class="v">${c.v}</div></div>`).join('');

  // Rehellisyys jakaumien pohjasta: muokatut vs. esimerkkipohjat (v3-palvelin)
  const bn = $('anBasisNote');
  if (bn && stats.editedN != null) {
    bn.hidden = false;
    bn.textContent = stats.basis === 'edited'
      ? t('Jakaumat lasketaan {0} muokatusta suunnitelmasta — muokkaamattomina jaetut esimerkkipohjat ({1} kpl) eivät vääristä lukuja.', stats.editedN, stats.total - stats.editedN)
      : t('Jaetuista {0} suunnitelmasta {1} on muokattuja. Jakaumissa ovat toistaiseksi kaikki; muokkaamattomat esimerkkipohjat suodatetaan pois, kun muokattuja on vähintään {2}.', stats.total, stats.editedN, stats.kAnon);
  }

  // Kaikki "sinä"-kerroksesta riippuva piirto yhdessä funktiossa, jotta oman
  // suunnitelman merkinnät voi kytkeä päälle ja pois ilman sivulatausta.
  // Portti, paluulinkit ja tiilet käyttävät aina oikeaa me-tilaa.
  const drawCharts = (m) => {
  document.querySelectorAll('.an-youchip').forEach((n) => n.remove());
  document.querySelectorAll('.an-take').forEach((n) => n.remove());
  renderHero(stats, m);
  renderRidgeline(stats, m);
  renderEventRank(stats, m);
  renderQuartCols('savingsChart', stats, 'monthly', m, m ? m.monthly : null,
    (v) => v >= 1950 ? fmtCompact(v) : Math.round(v / 10) * 10 + ' €');
  renderQuartCols('stocksChart', stats, 'stocks', m, m ? m.stocks : null,
    (v) => Math.round(v) + ' %', (age) => 110 - age, 100);
  renderRetireHist(stats, m);
  renderPenCoverage(stats, m);

  const gd = (m && m.group && stats.groups[m.group] && stats.groups[m.group].goals) ? stats.groups[m.group] : all;
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
      { l: 'Varmuus 75 %', v: gd.confs.c75, c: '#2dd4bf' },
      { l: 'Varmuus 85 %', v: gd.confs.c85, c: '#8b7cf6' },
      { l: 'Varmuus 95 %', v: gd.confs.c95, c: '#fb923c' },
    ]);
  } else empty('confDonut', needMsg(stats.total, stats.kAnon));

  renderRetirePlan(stats, m);
  renderHomeLoan(stats, m);
  renderOwned(stats, m);
  renderRealism(stats, m);
  renderTimeline(stats);
  takeaways(stats, m);
  };

  // Kytkin: oma suunnitelma kaavioissa päälle/pois (valinta muistetaan).
  // Näytetään vain kun oma suunnitelma on olemassa — muuten ei ole kytkettävää.
  const SHOWME_KEY = 'vp-an-me';
  let showMe = true;
  try { showMe = localStorage.getItem(SHOWME_KEY) !== '0'; } catch (e) {}
  // uudelleenrenderöinti (välimuisti → tuore data) ei saa monistaa kytkintä
  const vanhaMeToggle = document.querySelector('.an-me-toggle');
  if (vanhaMeToggle) vanhaMeToggle.remove();
  if (me) {
    const lb = document.createElement('label');
    lb.className = 'toggle an-me-toggle';
    // Asemointi inlinena: JS ja markup kulkevat aina yhdessä, joten oikea
    // reuna ei riipu style.css:n tuoreudesta (Pages-välimuistin 10 min ikkuna
    // voi tarjota uuden JS:n ja vanhan CSS:n sekaisin). Mobiilisääntö
    // ohittaa tämän !importantilla.
    lb.style.marginLeft = 'auto';
    lb.style.marginTop = '0';
    lb.innerHTML = `<input type="checkbox" id="anMeToggle"${showMe ? ' checked' : ''} />` +
      `<span class="switch" aria-hidden="true"></span><span>${t('Oma suunnitelmani kaavioissa')}</span>`;
    document.querySelector('.an-nav').appendChild(lb);
    lb.querySelector('input').addEventListener('change', (e) => {
      showMe = e.target.checked;
      try { localStorage.setItem(SHOWME_KEY, showMe ? '1' : '0'); } catch (err) {}
      drawCharts(showMe ? me : null);
    });
  }

  drawCharts(me && showMe ? me : null);
  initZoom();

  // Menetelmä: n per ikäryhmä
  $('methodChips').innerHTML = GROUPS.map(([g]) => {
    const n = (stats.groups[g] && stats.groups[g].n) || 0;
    const ok = n >= stats.kAnon;
    return `<span class="an-chip ${ok ? 'ok' : ''}" title="${ok ? t('jakaumat julkaistu') : t('kertyy vielä')}">${t('{0} v · {1}', g, n)}</span>`;
  }).join('');
  };

  // Luurankotiilet: oikean kokoiset paikat heti — data täyttyy ilman että
  // mikään töksähtää alaspäin (vain ensikäynnillä, kun välimuistia ei ole)
  const skeleton = () => {
    // kaksirivinen otsikkopaikka: todelliset tiiliotsikot rivittyvät kapealla
    // näytöllä kahdelle riville — sama korkeus, ei siirtymää datan saapuessa
    $('anTiles').innerHTML = new Array(5).fill(
      '<div class="sum-tile an-luuranko"><div class="k">&nbsp;<br>&nbsp;</div><div class="v">–</div></div>').join('');
  };

  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(STATS_CACHE_KEY) || 'null'); } catch (e) {}
  if (cached && cached.groups) {
    stats = cached;
    renderStats();
  } else {
    skeleton();
  }

  let fresh = null;
  try {
    fresh = await (await fetch(DATA_API + '/stats.json')).json();
  } catch (e) { /* alla */ }
  if (fresh && fresh.groups) {
    try { localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(fresh)); } catch (e) {}
    // identtinen vastaus ei piirrä mitään uudelleen — ei välähdystä
    if (!stats || JSON.stringify(fresh) !== JSON.stringify(stats)) {
      stats = fresh;
      renderStats();
    }
  } else if (!stats) {
    $('anTiles').innerHTML = '';
    for (const id of ['heroChart', 'ridgeline', 'savingsChart', 'stocksChart', 'retireHist', 'penCoverage', 'goalDonut', 'confDonut', 'homeLoan', 'ownedCard', 'realism', 'timeline']) {
      empty(id, 'Datapalvelin ei ole juuri nyt tavoitettavissa — yritä hetken päästä uudelleen.');
    }
  }
})();
