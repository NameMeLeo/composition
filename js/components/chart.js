/* Composition — the SVG line chart.
   Draws into a host element and wires pointer scrubbing when asked for it. */

import { el, clear } from '../dom.js';
import { metricText, fmtDate } from '../format.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag) { return document.createElementNS(NS, tag); }

/**
 * @param {HTMLElement} host Replaced entirely on each call.
 * @param {object} options
 * @param {{t: number, v: number}[]} options.points
 * @param {string} [options.metricKey] Used for unit-aware labels.
 * @param {(v: number) => string} [options.yFormat]
 */
export function drawChart(host, options) {
  const opts = Object.assign({
    height: 150,
    accent: 'var(--c-primary)',
    unit: '',
    digits: 1,
    grid: true,
    dots: true,
    scrub: true,
    padLeft: 38,
    padRight: 12,
    padTop: 14,
    padBottom: 18,
    yFormat: null
  }, options || {});

  clear(host);
  const pts = (opts.points || []).filter((p) => p && isFinite(p.v));
  const width = Math.max(240, Math.round(host.clientWidth || (host.parentElement && host.parentElement.clientWidth) || 320));
  const height = opts.height;

  const wrap = el('div', 'chart-wrap');
  host.appendChild(wrap);

  if (!pts.length) {
    const empty = svgEl('svg');
    empty.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    empty.setAttribute('role', 'img');
    empty.setAttribute('aria-label', 'No data in this range');
    const t = svgEl('text');
    t.setAttribute('x', String(width / 2));
    t.setAttribute('y', String(height / 2));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('class', 'chart__label');
    t.textContent = 'No readings in this range';
    empty.appendChild(t);
    wrap.appendChild(empty);
    return;
  }

  const xs = pts.map((p) => p.t);
  const ys = pts.map((p) => p.v);
  let min = Math.min.apply(null, ys);
  let max = Math.max.apply(null, ys);
  // A flat line would divide by zero; give it a nominal band instead.
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.16;
  const lo = min - pad;
  const hi = max + pad;

  const minT = Math.min.apply(null, xs);
  const maxT = Math.max.apply(null, xs);
  const spanT = Math.max(1, maxT - minT);

  const plotW = width - opts.padLeft - opts.padRight;
  const plotH = height - opts.padTop - opts.padBottom;
  const xAt = (t) => opts.padLeft + ((t - minT) / spanT) * plotW;
  const yAt = (v) => opts.padTop + (1 - (v - lo) / (hi - lo)) * plotH;

  const svg = svgEl('svg');
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', pts.length + ' readings, from ' +
    metricText(opts.metricKey || '', ys[0]).trim() + ' to ' +
    metricText(opts.metricKey || '', ys[ys.length - 1]).trim());

  if (opts.grid) {
    const g = svgEl('g');
    g.setAttribute('class', 'chart__grid');
    for (let i = 0; i <= 3; i++) {
      const y = opts.padTop + (plotH / 3) * i;

      const line = svgEl('line');
      line.setAttribute('x1', String(opts.padLeft));
      line.setAttribute('x2', String(width - opts.padRight));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      g.appendChild(line);

      const label = svgEl('text');
      label.setAttribute('class', 'chart__label');
      label.setAttribute('x', String(opts.padLeft - 6));
      label.setAttribute('y', String(y + 3));
      label.setAttribute('text-anchor', 'end');
      const value = hi - ((hi - lo) / 3) * i;
      label.textContent = opts.yFormat ? opts.yFormat(value) : value.toFixed(opts.digits);
      svg.appendChild(label);
    }
    svg.appendChild(g);
  }

  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + xAt(p.t).toFixed(1) + ' ' + yAt(p.v).toFixed(1)).join(' ');
  const areaPath = linePath +
    ' L' + xAt(pts[pts.length - 1].t).toFixed(1) + ' ' + (opts.padTop + plotH).toFixed(1) +
    ' L' + xAt(pts[0].t).toFixed(1) + ' ' + (opts.padTop + plotH).toFixed(1) + ' Z';

  const area = svgEl('path');
  area.setAttribute('class', 'chart__area');
  area.setAttribute('d', areaPath);
  area.setAttribute('fill', opts.accent);
  svg.appendChild(area);

  const line = svgEl('path');
  line.setAttribute('class', 'chart__line');
  line.setAttribute('d', linePath);
  line.setAttribute('stroke', opts.accent);
  svg.appendChild(line);

  if (opts.dots && pts.length <= 40) {
    pts.forEach((p) => {
      const c = svgEl('circle');
      c.setAttribute('class', 'chart__dot');
      c.setAttribute('cx', xAt(p.t).toFixed(1));
      c.setAttribute('cy', yAt(p.v).toFixed(1));
      c.setAttribute('r', '3.2');
      c.setAttribute('fill', opts.accent);
      svg.appendChild(c);
    });
  }

  const cursor = svgEl('line');
  cursor.setAttribute('class', 'chart__cursor');
  cursor.setAttribute('y1', String(opts.padTop));
  cursor.setAttribute('y2', String(opts.padTop + plotH));
  cursor.setAttribute('opacity', '0');
  svg.appendChild(cursor);

  wrap.appendChild(svg);

  if (!opts.scrub) return;

  const tip = el('div', 'chart-tip');
  tip.hidden = true;
  wrap.appendChild(tip);

  function moveTo(clientX) {
    const box = svg.getBoundingClientRect();
    const localX = ((clientX - box.left) / box.width) * width;
    let best = 0;
    let bestDist = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(xAt(p.t) - localX);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    const point = pts[best];
    const px = xAt(point.t);
    const py = yAt(point.v);
    cursor.setAttribute('x1', px.toFixed(1));
    cursor.setAttribute('x2', px.toFixed(1));
    cursor.setAttribute('opacity', '1');
    const ratio = box.width / width;
    tip.style.left = (px * ratio) + 'px';
    tip.style.top = Math.max(26, py * ratio - 10) + 'px';
    tip.textContent = metricText(opts.metricKey || '', point.v) + ' · ' + fmtDate(point.t, { day: 'numeric', month: 'short' });
    tip.hidden = false;
  }

  function leave() {
    cursor.setAttribute('opacity', '0');
    tip.hidden = true;
  }

  wrap.addEventListener('pointermove', (e) => moveTo(e.clientX));
  wrap.addEventListener('pointerdown', (e) => { wrap.setPointerCapture(e.pointerId); moveTo(e.clientX); });
  wrap.addEventListener('pointerup', leave);
  wrap.addEventListener('pointercancel', leave);
  wrap.addEventListener('pointerleave', leave);
}

/* Charts are drawn in a batch on the next frame: a render pass schedules several
   of them, and each needs the host to be laid out first to know its width. */
const jobs = new Map();
let frame = null;

export function scheduleChart(host, options) {
  jobs.set(host, options);
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    jobs.forEach((opts, node) => { if (node.isConnected) drawChart(node, opts); });
    jobs.clear();
  });
}
