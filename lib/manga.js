// Manga pages, to read and to sell (Amazon KDP print books): a manga story file of pages and panels. The panels are
// pictures made in Google Flow (free, like the frames), or frames already made for a video story ("frames from:"),
// and Flow Studio lays them out itself: panel borders (slanted like a manga page, or straight), parchment caption
// boxes and speech bubbles with the exact words (pictures made by AI often misspell them), at print size (300 dpi),
// then one PDF of all the pages for Amazon.
//
//   title: Whispers of the World Tree - Chapter 1
//   size: 6x9                      (the book's trim size in inches: 5x8, 5.5x8.5, 6x9, 7x10 or 8.5x11)
//   frames from: 01-world-intro.txt
//   style: ...
//
//   page 1: 1 tall, 1, 1, 1, 2 tall     (rows from top to bottom: how many panels side by side, and tall or short)
//   panel 1: frame 1                    (a frame of the "frames from" story, already made)
//   Caption: "Beyond the lands known to ordinary travelers..."
//   panel 2: A forest stream flowing between mossy stones...    (a new picture, made in Flow)
//   Caption (right): "...there lies a forest older than the memories of its people."
//   Jack (happy, left): "Look!"         (a speech bubble, its tail toward the left)
//   focus: top                          (which part of the picture to keep when it is cut to the panel's shape)
const fs = require('fs'), path = require('path');
const { launchHidden } = require('./browser');

const DPI = 300;
const SIZES = { '5x8': [5, 8], '5.5x8.5': [5.5, 8.5], '6x9': [6, 9], '7x10': [7, 10], '8.5x11': [8.5, 11] };
const SETTINGS = {
  title: 'title', project: 'project', size: 'size', characters: 'characters', style: 'style', place: 'place', model: 'frameModel', 'frame model': 'frameModel',
  quality: 'quality', 'style pictures': 'stylePictures', 'style picture': 'stylePictures', 'frames from': 'framesFrom', slant: 'slant',
};
const SAID = /^([A-Z][\w' -]{0,30}?)\s*(?:\(([^)]*)\))?\s*:\s*["“](.+?)["”]\s*$/;
const isCaption = who => /^(caption|narrator)$/i.test(String(who).trim());
const isManga = text => /^\s*page\s+\d+\s*:/im.test(text);

function parseRows(spec) {
  if (!spec.trim()) return { rows: null };
  const rows = [];
  for (const part of spec.split(/\s*,\s*/)) {
    const m = part.trim().match(/^([1-4])\s*(tall|short)?$/i);
    if (!m) return { error: 'write a page like this: "page 1: 1 tall, 2, 1": each number is a row, from the top, with how many panels side by side (1 to 4), "tall" or "short" to make the row taller or shorter.' };
    rows.push({ count: +m[1], weight: { tall: 1.5, short: 0.7 }[(m[2] || '').toLowerCase()] || 1 });
  }
  return { rows };
}

// Reads a manga story file: { meta, pages: [{ n, rows, panels }], panels (all, in order), errors }. Nothing here talks to Flow.
function parseManga(text) {
  const meta = { size: '6x9', characters: [], quality: 'upscaled', slant: true }, pages = [], panels = [], errors = [];
  let page = null, panel = null;
  const err = (n, msg) => errors.push(`Line ${n}: ${msg}`);
  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1, line = raw.trim();
    if (!line || line.startsWith('#')) return;
    let m;
    if ((m = line.match(/^page\s+(\d+)\s*:\s*(.*)$/i))) {
      const num = +m[1];
      if (pages.some(p => p.n === num)) return err(n, `there are two pages called "page ${num}".`);
      const { rows, error } = parseRows(m[2]);
      if (error) return err(n, error);
      page = { n: num, line: n, rows, panels: [] }; pages.push(page); panel = null; return;
    }
    if ((m = line.match(/^panel\s+(\d+)\s*:\s*(.*)$/i))) {
      const num = +m[1];
      if (!page) return err(n, 'a panel goes on a page: write "page 1:" above it.');
      if (panels.some(p => p.n === num)) return err(n, `there are two panels called "panel ${num}".`);
      const f = m[2].match(/^frame\s+(\d+)\s*\.?$/i);
      panel = { n: num, line: n, page: page.n, frame: f ? +f[1] : null, text: f ? '' : m[2], captions: [], bubbles: [], focus: 'middle' };
      page.panels.push(panel); panels.push(panel); return;
    }
    if (!page && (m = line.match(/^([a-z ]+?)\s*:\s*(.+)$/i)) && SETTINGS[m[1].toLowerCase()]) {
      const key = SETTINGS[m[1].toLowerCase()], v = m[2].trim();
      if (key === 'characters') meta.characters = v.split(/\s*,\s*|\s+and\s+/i).filter(Boolean);
      else if (key === 'size') { const s = v.toLowerCase().replace(/\s*(in|inches)\.?$/, '').replace(/\s*[x×]\s*/, 'x'); if (!SIZES[s]) return err(n, `size must be one of Amazon's book sizes: ${Object.keys(SIZES).join(', ')} (inches).`); meta.size = s; }
      else if (key === 'quality') { if (!/^(original|upscaled)$/.test(v)) return err(n, 'quality must be original or upscaled (bigger pictures, better for print).'); meta.quality = v; }
      else if (key === 'slant') { if (!/^(on|off)$/i.test(v)) return err(n, 'slant must be on (slanted panel borders, like a manga page) or off (straight).'); meta.slant = /^on$/i.test(v); }
      else if (key === 'stylePictures') meta.stylePictures = v.split(/\s*,\s*/).filter(Boolean);
      else meta[key] = v;
      return;
    }
    if (page && (m = line.match(/^([a-z ]+?)\s*:\s*(.+)$/i)) && SETTINGS[m[1].toLowerCase()] && !SAID.test(line))
      return err(n, `"${m[1]}:" is a setting: move it to the top of the story, above "page 1:".`);
    if (!panel) return err(n, page ? `I don't know "${line.slice(0, 40)}". Write "panel 1: ..." first.` : `I don't know "${line.slice(0, 40)}". Settings go at the top (title:, size:, style:...), then "page 1:" and "panel 1: ...".`);
    if ((m = line.match(/^focus\s*:\s*(top|middle|center|bottom)$/i))) { panel.focus = m[1].toLowerCase().replace('center', 'middle'); return; }
    const said = line.match(SAID);
    if (said) {
      const notes = (said[2] || '').toLowerCase().split(/\s*,\s*/).filter(Boolean);
      const x = notes.find(w => /^(left|right|middle)$/.test(w)) || null, y = notes.find(w => /^(top|bottom)$/.test(w)) || null;
      const item = { who: said[1].trim(), text: said[3].trim(), x, y, line: n };
      if (item.text.length > 120) err(n, `that line is long for one box (${item.text.length} letters). Keep it under 120, or split it in two.`);
      (isCaption(item.who) ? panel.captions : panel.bubbles).push(item);
      return;
    }
    if (panel.frame !== null) return err(n, `panel ${panel.n} is frame ${panel.frame}, already made: it can only have captions, words and "focus:" below it.`);
    panel.text = (panel.text ? panel.text + ' ' : '') + line;
  });
  if (!meta.title) errors.push('The story needs a "title:" line.');
  meta.project = (meta.project || meta.title || 'manga').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!pages.length) errors.push('The story has no pages ("page 1: ...").');
  pages.forEach(p => {
    if (!p.panels.length) err(p.line, `page ${p.n} has no panels.`);
    else if (p.rows && p.rows.reduce((s, r) => s + r.count, 0) !== p.panels.length)
      err(p.line, `page ${p.n}'s rows hold ${p.rows.reduce((s, r) => s + r.count, 0)} panels, but ${p.panels.length} are written below it.`);
  });
  panels.forEach(p => { p.text = p.text.trim(); if (p.frame === null && !p.text) err(p.line, `panel ${p.n} has no description (or write "panel ${p.n}: frame 3" to use a frame).`); });
  if (panels.some(p => p.frame !== null) && !meta.framesFrom) errors.push('A panel uses a frame ("panel 1: frame 1"): add "frames from: <the video story file>" at the top.');
  if ((meta.stylePictures || []).length > 2) errors.push('style pictures: at most 2.');
  pages.sort((a, b) => a.n - b.n);
  return { meta, pages, panels: pages.flatMap(p => p.panels), errors };
}

// The page in pixels at 300 dpi, with a margin all round (Amazon's inside margin for books up to 150 pages, so no
// "bleed" is needed) and thin gutters between the panels.
function pagePixels(meta) {
  const [w, h] = SIZES[meta.size];
  return { W: Math.round(w * DPI), H: Math.round(h * DPI), inches: [w, h], margin: Math.round(0.4 * DPI), gutter: Math.round(0.08 * DPI) };
}

// Each panel's four corners [top-left, top-right, bottom-right, bottom-left] on the page. The rows' borders tilt a
// little and the borders between panels lean (slant: on), like a manga page; the page's own edges stay straight.
function layoutPage(page, px, slant = true) {
  const { W, H, margin, gutter } = px, g = gutter / 2;
  const rows = page.rows || page.panels.map(() => ({ count: 1, weight: 1 }));
  const X0 = margin, X1 = W - margin, Y0 = margin, Y1 = H - margin, total = rows.reduce((s, r) => s + r.weight, 0);
  // the rows' borders: y at the left and right edges
  const hb = [{ l: Y0, r: Y0 }];
  let acc = 0;
  rows.forEach((r, i) => {
    acc += r.weight;
    if (i === rows.length - 1) return hb.push({ l: Y1, r: Y1 });
    const y = Y0 + (Y1 - Y0) * acc / total, t = slant ? (i % 2 ? 1 : -1) * H * 0.012 : 0;
    hb.push({ l: y - t, r: y + t });
  });
  const hy = (b, x) => b.l + (b.r - b.l) * (x - X0) / (X1 - X0);
  const meet = (v, b, ym) => { let y = hy(b, v.x); for (let k = 0; k < 8; k++) y = hy(b, v.x + (y - ym) * v.s); return { x: v.x + (y - ym) * v.s, y }; };
  const quads = [];
  rows.forEach((r, i) => {
    const xm = (X0 + X1) / 2, ym = (hy(hb[i], xm) + hy(hb[i + 1], xm)) / 2;
    // the borders between panels: x at the row's middle, and how much they lean
    const vb = [{ x: X0, s: 0 }];
    for (let k = 1; k < r.count; k++) vb.push({ x: X0 + (X1 - X0) * k / r.count, s: slant ? ((i + k) % 2 ? 1 : -1) * 0.12 : 0 });
    vb.push({ x: X1, s: 0 });
    for (let k = 0; k < r.count; k++) {
      const ti = i ? g : 0, bi = i < rows.length - 1 ? g : 0, li = k ? g : 0, ri = k < r.count - 1 ? g : 0;
      const T = { l: hb[i].l + ti, r: hb[i].r + ti }, B = { l: hb[i + 1].l - bi, r: hb[i + 1].r - bi };
      const L = { x: vb[k].x + li, s: vb[k].s }, R = { x: vb[k + 1].x - ri, s: vb[k + 1].s };
      quads.push([meet(L, T, ym), meet(R, T, ym), meet(R, B, ym), meet(L, B, ym)]);
    }
  });
  return quads;
}
// the panel's shape: wide panels are made 16:9 in Flow, tall ones 9:16 (then cut to the panel)
function panelAspect(q) {
  const xs = q.map(p => p.x), ys = q.map(p => p.y);
  return Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? '16:9' : '9:16';
}

// Draws every page (PNG, 300 dpi) and puts them in one PDF at the book's size.
// files: { panelNumber: picture file }. Returns { pages: [png files], pdf }.
async function renderPages(book, files, outDir, fontFiles) {
  const px = pagePixels(book.meta);
  const dataUrl = f => `data:image/${path.extname(f).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(f).toString('base64')}`;
  const font = f => `data:font/woff2;base64,${fs.readFileSync(f).toString('base64')}`;
  const pagesDir = path.join(outDir, 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });
  for (const f of fs.readdirSync(pagesDir)) if (/^page-\d+\.png$/.test(f)) fs.rmSync(path.join(pagesDir, f));
  const browser = await launchHidden(), out = [];
  try {
    const tab = await browser.newPage();
    await tab.evaluate(async ({ cap, bubble }) => {
      for (const [family, url, o] of [['Lora', cap, { weight: '500', style: 'italic' }], ['Fredoka', bubble, { weight: '700' }]]) {
        const f = new FontFace(family, `url(${url})`, o); await f.load(); document.fonts.add(f);
      }
    }, { cap: font(fontFiles.caption), bubble: font(fontFiles.bubble) });
    for (const [pi, page] of book.pages.entries()) {
      const quads = layoutPage(page, px, book.meta.slant);
      const panels = page.panels.map((p, k) => ({ quad: quads[k], img: dataUrl(files[p.n]), focus: p.focus, captions: p.captions, bubbles: p.bubbles }));
      const png = await tab.evaluate(drawPage, { W: px.W, H: px.H, panels });
      const file = path.join(pagesDir, `page-${String(pi + 1).padStart(2, '0')}.png`);
      fs.writeFileSync(file, Buffer.from(png, 'base64'));
      out.push(file);
    }
    // one PDF, each page at the book's size in inches, for Amazon KDP
    const [w, h] = px.inches;
    await tab.setContent(`<html><head><style>@page{size:${w}in ${h}in;margin:0}html,body{margin:0}img{display:block;width:${w}in;height:${h}in;page-break-after:always}img:last-child{page-break-after:auto}</style></head><body>${out.map(f => `<img src="${dataUrl(f)}">`).join('')}</body></html>`);
    await tab.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
    const pdf = path.join(outDir, `${book.meta.project}.pdf`);
    await tab.pdf({ path: pdf, width: `${w}in`, height: `${h}in`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    return { pages: out, pdf };
  } finally { await browser.close(); }
}

// (runs in the hidden browser) one page: white paper, each panel's picture cut to its shape, a black border, then
// the caption boxes and speech bubbles inside it
async function drawPage({ W, H, panels }) {
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const load = src => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('a panel picture could not be read')); i.src = src; });
  const shape = q => { g.beginPath(); q.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
  const size = W * 0.021, pad = W * 0.02;
  const wrap = (text, width) => {
    const out = [];
    for (const word of text.split(/\s+/)) { const last = out[out.length - 1]; if (last && g.measureText(`${last} ${word}`).width <= width) out[out.length - 1] = `${last} ${word}`; else out.push(word); }
    return out;
  };
  // the fewest lines, then as even as possible
  const fit = (text, width) => { let lines = wrap(text, width); for (let w = width * 0.95; w > size * 3; w *= 0.95) { const t = wrap(text, w); if (t.length > lines.length) break; lines = t; } return lines; };
  for (const p of panels) {
    const img = await load(p.img), q = p.quad;
    const xs = q.map(c => c.x), ys = q.map(c => c.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    // the picture covers the panel; "focus" says which part stays when it is cut
    const k = Math.max((x1 - x0) / img.width, (y1 - y0) / img.height), dw = img.width * k, dh = img.height * k;
    const dy = p.focus === 'top' ? y0 : p.focus === 'bottom' ? y1 - dh : y0 + (y1 - y0 - dh) / 2;
    g.save(); shape(q); g.clip(); g.drawImage(img, x0 + (x1 - x0 - dw) / 2, dy, dw, dh); g.restore();
    g.lineJoin = 'miter'; g.lineWidth = Math.max(3, W * 0.0028); g.strokeStyle = '#141414'; shape(q); g.stroke();
    // the space inside the panel's (maybe slanted) borders
    const box = { l: Math.max(q[0].x, q[3].x) + pad, r: Math.min(q[1].x, q[2].x) - pad, t: Math.max(q[0].y, q[1].y) + pad, b: Math.min(q[2].y, q[3].y) - pad };
    const maxW = Math.min((box.r - box.l) * 0.6, W * 0.38);
    const used = { top: { left: box.t, right: box.t, middle: box.t }, bottom: { left: box.b, right: box.b, middle: box.b } };
    const place = (bw, bh, x, y) => {
      const left = x === 'left' ? box.l : x === 'right' ? box.r - bw : (box.l + box.r - bw) / 2;
      if (y === 'bottom') { const top = used.bottom[x] - bh; used.bottom[x] = top - pad * 0.6; return { left, top }; }
      const top = used.top[x]; used.top[x] = top + bh + pad * 0.6; return { left, top };
    };
    // parchment caption boxes (the narrator), as in the films: the first at the top left, the next at the bottom right
    p.captions.forEach((c, i) => {
      g.font = `italic 500 ${Math.round(size)}px Lora`;
      const lines = fit(c.text, maxW - size * 1.6), lh = size * 1.25;
      const bw = Math.max(...lines.map(l => g.measureText(l).width)) + size * 1.6, bh = lines.length * lh + size * 1.0;
      const x = c.x || (i % 2 ? 'right' : 'left'), y = c.y || (i % 2 ? 'bottom' : 'top'), { left, top } = place(bw, bh, x, y);
      g.shadowColor = 'rgba(40,20,5,0.35)'; g.shadowBlur = size * 0.5; g.shadowOffsetY = size * 0.15;
      const grad = g.createLinearGradient(0, top, 0, top + bh); grad.addColorStop(0, '#fbf1d9'); grad.addColorStop(1, '#efdfb8');
      g.fillStyle = grad; g.fillRect(left, top, bw, bh); g.shadowColor = 'transparent';
      g.strokeStyle = '#6b4a26'; g.lineWidth = Math.max(2, size * 0.07); g.strokeRect(left, top, bw, bh);
      g.strokeStyle = 'rgba(107,74,38,0.35)'; g.lineWidth = 1; g.strokeRect(left + size * 0.18, top + size * 0.18, bw - size * 0.36, bh - size * 0.36);
      g.fillStyle = '#3b2a17'; g.textAlign = 'left'; g.textBaseline = 'middle';
      lines.forEach((l, j) => g.fillText(l, left + size * 0.8, top + size * 0.5 + lh * (j + 0.5)));
    });
    // speech bubbles, Kitsu style: white, rounded, a warm brown outline, a tail toward the speaker
    p.bubbles.forEach(b => {
      const bs = size * 1.05, lw = Math.max(3, bs * 0.12);
      g.font = `700 ${Math.round(bs)}px Fredoka`;
      const lines = fit(b.text, maxW - bs * 1.4), lh = bs * 1.18;
      const bw = Math.max(...lines.map(l => g.measureText(l).width)) + bs * 1.4, bh = lines.length * lh + bs * 0.9, tail = bs * 0.9;
      const x = b.x || 'middle', y = b.y || 'top', down = y !== 'bottom';
      const spot = place(bw, bh + tail, x, y), left = spot.left, top = down ? spot.top : spot.top + tail, r = Math.min(bh / 2, bs * 0.9);
      const tx = x === 'left' ? left + bw * 0.28 : x === 'right' ? left + bw * 0.72 : left + bw / 2, dir = x === 'left' ? -1 : x === 'right' ? 1 : 0;
      const edge = down ? top + bh : top, tipY = down ? edge + tail : edge - tail, tw = bs * 0.7, tipX = tx + dir * bs * 0.55, bend = down ? bs * 0.3 : -bs * 0.3;
      g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = '#4a2616'; g.fillStyle = '#fffaf2';
      g.beginPath(); g.roundRect(left, top, bw, bh, r);
      g.moveTo(tx - tw, edge); g.quadraticCurveTo(tx - tw * 0.2, edge + bend, tipX, tipY); g.quadraticCurveTo(tx + tw * 0.2, edge + bend, tx + tw, edge);
      g.fill(); g.stroke();
      g.beginPath(); g.moveTo(tx - tw + lw, edge); g.quadraticCurveTo(tx - tw * 0.2, edge + bend * 0.7, tipX, tipY + (down ? -lw * 1.8 : lw * 1.8)); g.quadraticCurveTo(tx + tw * 0.2, edge + bend * 0.7, tx + tw - lw, edge); g.closePath(); g.fill();
      g.fillStyle = '#3a2414'; g.textAlign = 'center'; g.textBaseline = 'middle';
      lines.forEach((l, j) => g.fillText(l, left + bw / 2, top + bs * 0.45 + lh * (j + 0.5)));
    });
  }
  return cv.toDataURL('image/png').slice(22);
}

module.exports = { parseManga, isManga, layoutPage, panelAspect, pagePixels, renderPages, SIZES };
