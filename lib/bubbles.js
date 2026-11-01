// Speech bubbles on the finished film, in Kitsu Studio's style: a soft white rounded bubble, a warm dark-brown
// outline, Fredoka letters and a little tail toward whoever is speaking (left, right, or the middle when unknown).
// One bubble at a time, near the top of the picture where faces rarely are. With voices, each bubble shows while its
// line is spoken; the sound itself (Kitsu Studio's music and voices) comes from soundtrack.js. The bubbles are drawn in a hidden
// browser page (Playwright, with the computer's Chrome) and laid over the film with FFmpeg.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const { launchHidden } = require('./browser');
const { FFMPEG } = require('./join');

const FONT = path.join(__dirname, '..', 'fonts', 'fredoka-700.woff2');
// the narrator's caption box: a storybook parchment box with Lora italic letters (Kitsu Studio's caption font)
const CAPTION_FONT = path.join(__dirname, '..', 'fonts', 'lora-500-italic.woff2');
const LINE = '#4a2616', FILL = '#fffaf2', TEXT = '#3a2414';

// how long a line takes to read (or say) when there is no voice to measure
const readTime = text => Math.max(1.3, 0.6 + text.length * 0.06);

// When each line shows (and is spoken): [{ text, side, wav, t0, t1 }] in film time, plus warnings.
// clips: [{ duration, lines: [{ text, side, at, len?, wav? }] }] (len: the voice line's length, when there is one).
// A line with "at" starts then; the others follow one another. Without voices, the lines are spread over the clip
// (longer lines get more time); with voices, each bubble stays for its line and a moment more.
function bubbleTimes(clips) {
  const out = [], warnings = [];
  let at = 0;
  clips.forEach((c, ci) => {
    const n = c.lines.length, pad = Math.min(0.4, c.duration * 0.05), voiced = c.lines.some(l => l.len);
    if (!n) { at += c.duration; return; }
    const len = c.lines.map(l => l.len || readTime(l.text));
    // without voices and without "at", stretch the reading times to fill the clip
    const free = c.lines.every(l => l.at === null || l.at === undefined) && !voiced;
    const scale = free ? Math.max(1, (c.duration - 2 * pad - 0.25 * (n - 1)) / len.reduce((s, x) => s + x, 0)) : 1;
    let cursor = pad;
    const starts = c.lines.map((l, i) => { const s = l.at !== null && l.at !== undefined ? l.at : cursor; cursor = s + len[i] * scale + 0.25; return s; });
    c.lines.forEach((l, i) => {
      const t0 = starts[i], next = i + 1 < n ? starts[i + 1] : c.duration;
      const t1 = Math.min(next - 0.05, c.duration - 0.05, t0 + len[i] * scale + (voiced ? 0.5 : 0));
      if (t0 + len[i] > c.duration + 0.05) warnings.push(`clip ${ci + 1}: "${l.text.slice(0, 40)}" goes on past the end of the clip. Shorten it, or start it earlier ("at").`);
      if (i && t0 < starts[i - 1] + len[i - 1] - 0.05 && voiced) warnings.push(`clip ${ci + 1}: "${l.text.slice(0, 40)}" starts before the line before it has finished.`);
      out.push({ text: l.text, side: l.side, who: l.who, wav: l.wav, t0: at + t0, t1: at + Math.max(t0 + 0.8, t1) });
    });
    at += c.duration;
  });
  return { items: out, warnings };
}

// one transparent picture the size of the film per bubble
async function drawBubbles(items, W, H) {
  const browser = await launchHidden();
  try {
    const page = await browser.newPage();
    const font = `data:font/woff2;base64,${fs.readFileSync(FONT).toString('base64')}`, cap = `data:font/woff2;base64,${fs.readFileSync(CAPTION_FONT).toString('base64')}`;
    return await page.evaluate(async ({ items, W, H, font, cap, LINE, FILL, TEXT }) => {
      const face = new FontFace('Fredoka', `url(${font})`, { weight: '700' });
      await face.load(); document.fonts.add(face);
      const lora = new FontFace('Lora', `url(${cap})`, { weight: '500', style: 'italic' });
      await lora.load(); document.fonts.add(lora);
      const tall = H > W, size = Math.round((tall ? W * 0.062 : H * 0.055)), maxW = W * (tall ? 0.8 : 0.6), lw = Math.max(3, size * 0.12);
      return items.map(({ text, side, who }) => {
        const cv = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = cv.getContext('2d');
        const narrator = /^narrator$/i.test(String(who || '').trim());
        // a name plate ("Label: Level 1 — The High World"): bottom left, "LEVEL 1 —" big over "THE HIGH WORLD" small
        if (/^label$/i.test(String(who || ''))) {
          const s = Math.round(tall ? W * 0.05 : H * 0.045), [head, ...rest] = text.toUpperCase().split(/\s+(?=[—–-]\s)/);
          const line1 = rest.length ? `${head} ${rest.join(' ').match(/^[—–-]/)[0]}` : head, line2 = rest.join(' ').replace(/^[—–-]\s*/, ''), small = s * 0.68;
          g.font = `italic 500 ${s}px Lora`; const w1 = g.measureText(line1).width;
          g.font = `italic 500 ${Math.round(small)}px Lora`; const w2 = line2 ? g.measureText(line2).width : 0;
          const bw = Math.max(w1, w2) + s * 1.8, bh = s * 1.25 + (line2 ? small * 1.3 : 0) + s * 0.7, x = W * 0.04, y = H - bh - H * (tall ? 0.1 : 0.07);
          g.shadowColor = 'rgba(40,20,5,0.35)'; g.shadowBlur = s * 0.5; g.shadowOffsetY = s * 0.15;
          const grad = g.createLinearGradient(0, y, 0, y + bh); grad.addColorStop(0, '#fbf1d9'); grad.addColorStop(1, '#ead6a6');
          g.fillStyle = grad; g.fillRect(x, y, bw, bh); g.shadowColor = 'transparent';
          g.strokeStyle = '#8a6a2c'; g.lineWidth = Math.max(2, s * 0.08); g.strokeRect(x, y, bw, bh);
          g.lineWidth = Math.max(1, s * 0.04); g.strokeRect(x + s * 0.2, y + s * 0.2, bw - s * 0.4, bh - s * 0.4);
          g.fillStyle = '#3b2a17'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = `italic 500 ${s}px Lora`; g.fillText(line1, x + bw / 2, y + s * 0.35 + s * 0.62);
          if (line2) { g.font = `italic 500 ${Math.round(small)}px Lora`; g.fillText(line2, x + bw / 2, y + s * 0.35 + s * 1.25 + small * 0.6); }
          return cv.toDataURL('image/png').slice(22);
        }
        g.font = narrator ? `italic 500 ${Math.round(size * (tall ? 0.85 : 0.72))}px Lora` : `700 ${size}px Fredoka`;
        // words into lines that fit, then as even as possible (no single word left alone on the last line)
        const wrap = width => {
          const out = [];
          for (const word of text.split(/\s+/)) {
            const last = out[out.length - 1];
            if (last && g.measureText(`${last} ${word}`).width <= width) out[out.length - 1] = `${last} ${word}`; else out.push(word);
          }
          return out;
        };
        let width = (narrator ? Math.min(maxW, W * (tall ? 0.8 : 0.5)) : maxW) - size * 1.4, lines = wrap(width);
        for (let w = width * 0.95; w > size * 3; w *= 0.95) { const t = wrap(w); if (t.length > lines.length) break; lines = t; }
        if (narrator) {
          // a parchment caption box at the top left (or right, with "(right)"), like a storybook or comic page
          const lh = size * 1.2, bw = Math.max(...lines.map(l => g.measureText(l).width)) + size * 1.6, bh = lines.length * lh + size * 1.0;
          const x = side === 'right' ? W - bw - W * 0.04 : W * 0.04, y = H * (tall ? 0.07 : 0.06);
          g.shadowColor = 'rgba(40,20,5,0.35)'; g.shadowBlur = size * 0.5; g.shadowOffsetY = size * 0.15;
          const grad = g.createLinearGradient(0, y, 0, y + bh); grad.addColorStop(0, '#fbf1d9'); grad.addColorStop(1, '#efdfb8');
          g.fillStyle = grad; g.fillRect(x, y, bw, bh); g.shadowColor = 'transparent';
          g.strokeStyle = '#6b4a26'; g.lineWidth = Math.max(2, size * 0.07); g.strokeRect(x, y, bw, bh);
          g.strokeStyle = 'rgba(107,74,38,0.35)'; g.lineWidth = 1; g.strokeRect(x + size * 0.18, y + size * 0.18, bw - size * 0.36, bh - size * 0.36);
          g.fillStyle = '#3b2a17'; g.textAlign = 'left'; g.textBaseline = 'middle';
          lines.forEach((l, i) => g.fillText(l, x + size * 0.8, y + size * 0.5 + lh * (i + 0.5)));
          return cv.toDataURL('image/png').slice(22);
        }
        const lh = size * 1.18, bw = Math.max(...lines.map(l => g.measureText(l).width)) + size * 1.4, bh = lines.length * lh + size * 0.9;
        const cx = side === 'left' ? Math.max(bw / 2 + W * 0.04, W * 0.38) : side === 'right' ? Math.min(W - bw / 2 - W * 0.04, W * 0.62) : W / 2;
        const x = cx - bw / 2, y = H * (tall ? 0.07 : 0.06), r = Math.min(bh / 2, size * 0.9);
        // the tail points down toward the speaker's side
        const tx = side === 'left' ? x + bw * 0.28 : side === 'right' ? x + bw * 0.72 : cx, dir = side === 'left' ? -1 : side === 'right' ? 1 : 0;
        g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = LINE; g.fillStyle = FILL;
        g.shadowColor = 'rgba(60,30,10,0.18)'; g.shadowBlur = size * 0.4; g.shadowOffsetY = size * 0.12;
        g.beginPath(); g.roundRect(x, y, bw, bh, r);
        const tw = size * 0.7, tipX = tx + dir * size * 0.55, tipY = y + bh + size * 0.85;
        g.moveTo(tx - tw, y + bh - 1); g.quadraticCurveTo(tx - tw * 0.2, y + bh + size * 0.3, tipX, tipY); g.quadraticCurveTo(tx + tw * 0.2, y + bh + size * 0.3, tx + tw, y + bh - 1);
        g.fill(); g.shadowColor = 'transparent'; g.stroke();
        // cover the outline where the tail joins the bubble
        g.beginPath(); g.moveTo(tx - tw + lw, y + bh - lw); g.quadraticCurveTo(tx - tw * 0.2, y + bh + size * 0.3 - lw, tipX, tipY - lw * 1.8); g.quadraticCurveTo(tx + tw * 0.2, y + bh + size * 0.3 - lw, tx + tw - lw, y + bh - lw); g.closePath(); g.fill();
        g.fillStyle = TEXT; g.textAlign = 'center'; g.textBaseline = 'middle';
        lines.forEach((l, i) => g.fillText(l, cx, y + size * 0.45 + lh * (i + 0.5)));
        return cv.toDataURL('image/png').slice(22);
      });
    }, { items, W, H, font, cap, LINE, FILL, TEXT });
  } finally { await browser.close(); }
}

// lays the bubbles over the film and puts in its sound: film -> out. soundtrack: Kitsu Studio's music and voices (a
// WAV, or null); flowSound: keep the clips' own sound from Google Flow (mixed under the soundtrack when there is one).
// flowLoudness: when Google Flow's sound is the film's music (no Kitsu music), it is set to this loudness (LUFS)
// instead of flowVolume, as Flow's own sound is often very quiet; duck: it dips while the voices speak.
async function burnBubbles(film, out, items, W, H, { bubbles = true, soundtrack = null, flowSound = false, flowVolume = 0.35, flowLoudness = null, duck = false } = {}) {
  const shown = bubbles ? items : [];
  if (!shown.length && !soundtrack && flowSound && flowLoudness === null) { fs.copyFileSync(film, out); return 0; }
  const pngs = shown.length ? await drawBubbles(shown, W, H) : [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitsu-bubbles-'));
  const files = pngs.map((b64, i) => { const f = path.join(dir, `bubble-${i}.png`); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; });
  // each bubble pops in quickly and fades out (its own short fade on a looped still)
  let graph = shown.length ? shown.map((b, i) => `[${i + 1}:v]format=rgba,fade=t=in:st=${b.t0.toFixed(3)}:d=0.15:alpha=1,fade=t=out:st=${Math.max(b.t0, b.t1 - 0.2).toFixed(3)}:d=0.2:alpha=1[b${i}];`).join('')
    + shown.map((b, i) => `${i ? `[o${i - 1}]` : '[0:v]'}[b${i}]overlay=0:0:enable='between(t,${b.t0.toFixed(3)},${b.t1.toFixed(3)})'${i === shown.length - 1 ? '[v]' : `[o${i}]`}`).join(';')
    : '[0:v]null[v]';
  // the sound: Kitsu Studio's soundtrack, with Flow's own sound quietly under it if asked for, or Flow's sound alone,
  // or silence
  const audioIn = 1 + files.length, stereo = 'aformat=sample_rates=48000:channel_layouts=stereo';
  // Flow's sound: a fixed volume under Kitsu's music, or brought to flowLoudness (at most 30 dB louder, so a near
  // silent clip doesn't turn into hiss); a limiter keeps the peaks under -1.5 dB, as in Kitsu Studio's videos
  const level = flowSound && flowLoudness !== null ? require('./join').loudness(film) : null;
  const flowGain = flowLoudness === null ? `volume=${flowVolume}` : `volume=${(level ? Math.min(30, flowLoudness - level.i) : 0).toFixed(2)}dB`;
  const limit = 'alimiter=limit=0.84:level=false';
  if (soundtrack && flowSound) {
    graph += `;[0:a]${stereo},${flowGain}[f];[${audioIn}:a]${stereo}[k]`;
    // (while someone speaks, Flow's sound dips, then comes back up in the pauses)
    graph += duck ? ';[k]asplit=2[k1][k2];[f][k2]sidechaincompress=threshold=0.008:ratio=5:attack=40:release=700[fd];[k1][fd]' : ';[k][f]';
    graph += `amix=inputs=2:normalize=0:duration=first,${limit}[a]`;
  } else if (soundtrack) graph += `;[${audioIn}:a]${stereo}[a]`;
  else if (flowSound && flowLoudness !== null) graph += `;[0:a]${stereo},${flowGain},${limit}[a]`;
  else if (!flowSound) graph += ';anullsrc=r=48000:cl=stereo[a]';
  const sound = soundtrack || !flowSound || flowLoudness !== null ? '[a]' : '0:a?';
  try {
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', film, ...files.flatMap(f => ['-loop', '1', '-i', f]), ...(soundtrack ? ['-i', soundtrack] : []), '-filter_complex', graph,
      '-map', '[v]', '-map', sound, '-t', String(require('./join').probe(film).duration), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p',
      ...(sound === '[a]' ? ['-c:a', 'aac', '-b:a', '192k'] : ['-c:a', 'copy']), '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) { throw new Error(`FFmpeg couldn't add the speech bubbles and voices: ${String(e.stderr || e.message).slice(-400)}`); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return items.length;
}

module.exports = { bubbleTimes, drawBubbles, burnBubbles };
