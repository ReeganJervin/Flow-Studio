// The film's sound made by Kitsu Studio itself, so a Flow film sounds like the episodes: Kitsu Studio's music (its
// moods: happy, calm, magical, mystery...) with Ren and Yuki's voice lines, mixed by Kitsu Studio's own mixer (the
// music dips under the voices and fills the pauses), then set to the same loudness as Kitsu Studio's videos.
// Flow Studio only USES Kitsu Studio's story compiler and audio (engine/story.js, engine/page.html, engine/audio.js);
// it changes nothing there. Google Flow's own sound is not used (unless a story says "flow sound: on").
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto'), { spawnSync } = require('child_process');
const { launchHidden } = require('./browser');
const { kitsuDir } = require('./kitsu');
const { FFMPEG } = require('./join');

const MOODS = ['happy', 'calm', 'magical', 'mystery', 'adventure', 'tense', 'sad', 'bedtime', 'epic', 'heartfelt', 'none'];

// a local web server for the engine's page: the project's files (its scripts), and the few files of this film handed
// to it (the plan and the voice lines, wherever they are kept) under /_file/<number>
function serve(extra, ROOT) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), k = p.match(/^\/_file\/(\d+)/);
    const file = k ? extra[+k[1]] : path.join(ROOT, p);
    if (!file || (!k && !file.startsWith(ROOT)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// Kitsu Studio's final level: -16 LUFS, peaks at most -1.5 dB (as make-video.js does)
function master(src, dst) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', src, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  let gain = 0;
  try { const m = JSON.parse(r.stderr.slice(r.stderr.lastIndexOf('{'), r.stderr.lastIndexOf('}') + 1)); if (isFinite(parseFloat(m.input_i))) gain = Math.min(-16 - parseFloat(m.input_i), -1.5 - parseFloat(m.input_tp)); } catch (_) { /* silent: leave it */ }
  const w = spawnSync(FFMPEG, ['-loglevel', 'error', '-y', '-i', src, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'pcm_s16le', dst], { encoding: 'utf8' });
  if (w.status !== 0) throw new Error(`Setting the sound's loudness failed: ${w.stderr}`);
}

// duration (s); music: [{ t, mood }]; voices: [{ t, wav }] -> a WAV of the whole film's sound (kept in cacheDir, so
// the same soundtrack is never made twice)
async function kitsuSoundtrack({ duration, music, voices }, cacheDir) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const ROOT = kitsuDir();
  const key = crypto.createHash('sha1').update(JSON.stringify([duration.toFixed(3), music, voices.map(v => [v.t.toFixed(3), path.basename(v.wav)])])).digest('hex').slice(0, 16);
  const out = path.join(cacheDir, `${key}.wav`);
  if (fs.existsSync(out)) return out;
  // a plan from Kitsu Studio's own compiler, then given this film's music and voice lines (no place sounds)
  const { parseStory, compileStory } = require(path.join(ROOT, 'engine', 'story.js'));
  const plan = compileStory(parseStory('title: Flow Studio soundtrack\nplace: meadow\nmusic: calm\nwait 1\n'), {});
  const extra = [], url = f => `/_file/${extra.push(path.resolve(f)) - 1}${path.extname(f)}`;
  // (fading in over the first second and out over the last two, as Kitsu Studio's own videos do)
  Object.assign(plan, { duration, music: music.filter(m => m.mood), sfx: [], musicFadeIn: 1.0, musicFadeOut: [Math.max(1, duration - 2), duration],
    scenes: [{ name: 'film', line: 0, t0: 0, t1: duration, implicit: true }], voice: voices.map((v, i) => ({ id: i, who: 'ren', text: '', t: v.t, len: v.len, file: url(v.wav) })) });
  const planFile = path.join(cacheDir, `${key}.json`);
  fs.writeFileSync(planFile, JSON.stringify(plan));
  const planUrl = url(planFile), server = await serve(extra, ROOT), browser = await launchHidden();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/engine/page.html?plan=${encodeURIComponent(planUrl)}&export=1`);
    await page.evaluate(() => FILM.ready);
    const { wav, missing } = await page.evaluate(() => FILM.renderAudio('mix'));
    if (missing && missing.length) throw new Error(`Kitsu Studio's mixer couldn't load ${missing.length} voice line(s).`);
    const raw = path.join(cacheDir, `${key}.raw.wav`);
    fs.writeFileSync(raw, Buffer.from(wav, 'base64'));
    master(raw, out);
    fs.rmSync(raw, { force: true });
  } finally { await browser.close(); server.close(); fs.rmSync(planFile, { force: true }); }
  return out;
}

module.exports = { kitsuSoundtrack, MOODS };
