// Tests Flow Studio against a pretend flow-mcp (same local API, no Chrome, no Google, no credits).
//   npm test   (or: node --test tests/flow-video.test.js)
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const { parseFlowStory, framePrompt, castOf } = require('../lib/story');
const { probe } = require('../lib/join');

const CLI = path.join(__dirname, '..', 'flow-video.js');
// Kitsu Studio (its voices and music) next to this folder: the tests that make a film with them skip without it
const KITSU = (() => { try { return require('../lib/kitsu').kitsuDir(); } catch (_) { return null; } })();
const needsKitsu = { skip: KITSU ? false : 'needs Kitsu Studio next to this folder (its voices and music)' };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kitsu-flow-'));

// a pretend Flow (no Chrome, no Google, no credits): an engine with the same methods as lib/flow-web.js
const engine = path.join(tmp, 'fake-flow.js');
fs.writeFileSync(engine, `
const fs = require('fs'), path = require('path');
class FlowAccount {
  constructor(o) { Object.assign(this, o); fs.mkdirSync(o.home, { recursive: true }); }
  file(f) { return path.join(this.home, f); }
  credits() { return Number(fs.readFileSync(this.file('credits'), 'utf8')); }
  async state() { return { ok: true, credits: this.credits(), plan: 'PRO' }; }
  async generate(s, stem, progress, name) {
    fs.appendFileSync(this.file('calls.log'), JSON.stringify(s) + '\\n');
    const cost = s.type === 'video' ? 20 : 0;
    if (cost > s.max_credits) throw new Error('too dear');
    if (this.credits() < cost) throw new Error('Not enough credits');
    fs.writeFileSync(this.file('credits'), String(this.credits() - cost));
    progress('started');
    fs.mkdirSync(path.dirname(stem), { recursive: true });
    const out = stem + (s.type === 'image' ? '.png' : '.mp4');
    if (s.type === 'video') require('child_process').execFileSync(require(${JSON.stringify(require.resolve(path.join(__dirname, '..', 'lib', 'join.js')))}).FFMPEG,
      ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=orange:s=180x320:d=1', ...(fs.existsSync(this.file('mute')) ? [] : ['-f', 'lavfi', '-i', 'sine=d=1']), ...(fs.existsSync(this.file('quiet')) ? ['-af', 'volume=0.1'] : []), '-shortest', out]);
    // (a real picture, its prompt kept next to it, so the manga pages can be drawn)
    else { require('child_process').execFileSync(require(${JSON.stringify(require.resolve(path.join(__dirname, '..', 'lib', 'join.js')))}).FFMPEG, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=teal:s=' + (s.aspect_ratio === '9:16' ? '90x160' : '160x90'), '-frames:v', '1', out]); fs.writeFileSync(out + '.txt', s.prompt); }
    return { files: [out], credits: cost, title: name + '-t' + Date.now() };
  }
}
module.exports = { FlowAccount };`);

// a pretend voice tool (Kitsu voices are the default): a tone as long as the words
fs.writeFileSync(path.join(tmp, 'fake-tts.js'), `const fs = require('fs'), { execFileSync } = require('child_process');
for (const j of JSON.parse(fs.readFileSync(process.argv[3], 'utf8')))
  execFileSync(${JSON.stringify(require('../lib/join').FFMPEG)}, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=f=440:r=24000:d=' + (0.3 + j.text.length * 0.05), j.out]);`);
const env = { ...process.env, KITSU_FLOW_TTS: path.join(tmp, 'fake-tts.js'), KITSU_FLOW_ENGINE: engine, KITSU_FLOW_SETTINGS: path.join(tmp, 'settings.json'), KITSU_FLOW_OUTPUT: path.join(tmp, 'output'), KITSU_FLOW_HOME: path.join(tmp, 'accounts') };
const run = (...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', cwd: tmp }); return { code: r.status, out: r.stdout + r.stderr }; };
const bank = (n, v) => { const d = path.join(tmp, 'accounts', `account-${n}`); fs.mkdirSync(d, { recursive: true }); if (v !== undefined) fs.writeFileSync(path.join(d, 'credits'), String(v)); return Number(fs.readFileSync(path.join(d, 'credits'), 'utf8')); };
const calls = n => { try { return fs.readFileSync(path.join(tmp, 'accounts', `account-${n}`, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch (_) { return []; } };

const STORY = path.join(tmp, 'story.txt');
fs.writeFileSync(STORY, `title: The Test Fox
aspect: 9:16
sides: Ren left, Yuki right
characters: Ren, Yuki
max credits: 25
style: Cute chibi cartoon
place: A meadow

frame 1: Ren and Yuki stand together.
frame 2: Ren points up.
frame 3: A butterfly lands on the meadow.

clip 1: frame 1 to frame 2
Ren points up.
Ren (excited): "Look!"
clip 2: frame 2 to frame 3
A butterfly lands.
`);

test('the story file: settings, frames, clips, prompts and characters', () => {
  const s = parseFlowStory(fs.readFileSync(STORY, 'utf8'));
  assert.deepStrictEqual(s.errors, []);
  assert.strictEqual(s.meta.project, 'the-test-fox');
  assert.deepStrictEqual(s.frames.map(f => f.n), [1, 2, 3]);
  assert.deepStrictEqual(s.clips.map(c => [c.from, c.to]), [[1, 2], [2, 3]]);
  assert.strictEqual(s.clips[0].text, 'Ren points up. Ren (excited): "Look!"');
  assert.strictEqual(s.clips[0].action, 'Ren points up.');
  assert.deepStrictEqual(s.clips[0].lines.map(l => [l.who, l.notes, l.text, l.side]), [['Ren', 'excited', 'Look!', 'left']]);
  assert.strictEqual(framePrompt(s.meta, s.frames[0]), 'Cute chibi cartoon. A meadow. Ren and Yuki stand together.');
  assert.deepStrictEqual(castOf(s.meta, s.frames[2].text), []);
  const bad = parseFlowStory('aspect: 4:3\nframe 1: x\nclip 1: frame 1 to frame 9\ny\nclip 2 frame 1\n');
  assert.ok(bad.errors.some(e => /title/.test(e)));
  assert.ok(bad.errors.some(e => /9:16/.test(e)));
  assert.ok(bad.errors.some(e => /no "frame 9:"/.test(e)));
  assert.ok(bad.errors.some(e => /clip 1: frame 1 to frame 2/.test(e)));
});

test('check spends nothing', () => {
  const c = run('check', STORY);
  assert.strictEqual(c.code, 0, c.out);
  assert.match(c.out, /frame 1 \[Ren, Yuki\]/);
  assert.match(c.out, /2 clip\(s\) still to make: at most 50 credits/);
});

test('make: frames first (free), with the previous frame and the characters as references', () => {
  bank(1, 30); bank(2, 100);
  const r = run('make', STORY);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /The frames are ready/);
  // the account with the most credits makes the frames
  const imgs = calls(2).filter(c => c.type === 'image');
  assert.strictEqual(imgs.length, 3);
  assert.deepStrictEqual(imgs[0].reference_images, ['asset:Ren', 'asset:Yuki']);
  // the frame before, picked in Flow where it already is (not uploaded again)
  assert.match(imgs[1].reference_images[0], /^asset:the-test-fox-frame-01-t\d+$/);
  assert.match(imgs[1].prompt, /Match the previous image/);
  assert.strictEqual(calls(1).length, 0);
  assert.ok(fs.existsSync(path.join(tmp, 'output', 'the-test-fox', 'frames', 'frame-03.png')));
});

test('make again: clips from frame to frame, switching account when one runs low, then the film', needsKitsu, () => {
  bank(1, 30); bank(2, 30); fs.writeFileSync(path.join(tmp, 'accounts', 'account-2', 'mute'), '');
  const r = run('make', STORY);
  assert.strictEqual(r.code, 0, r.out);
  const v1 = calls(1).filter(c => c.type === 'video'), v2 = calls(2).filter(c => c.type === 'video');
  assert.strictEqual(v1.length + v2.length, 2);
  assert.match(r.out, /switching to/);
  // a clip on the account that made the frames picks them in Flow; on the other account they are uploaded
  const onFrames = v2.length ? v2[0] : null, onOther = v1[0];
  if (onFrames) { assert.match(onFrames.first_frame, /^asset:the-test-fox-frame-0\d-t\d+$/); }
  assert.match(onOther.first_frame, /frame-0\d\.png$/);
  const clip = [...v1, ...v2][0];
  // the words stay out of Flow's prompt, which asks for no voices (Kitsu's voices say them)
  assert.doesNotMatch(clip.prompt, /Look!/);
  assert.match(clip.prompt, /Ren points up\. Ren reacts \(excited\)/);
  assert.match(clip.prompt, /Nobody speaks/);
  assert.strictEqual(clip.aspect_ratio, '9:16'); assert.strictEqual(clip.max_credits, 25);
  const film = path.join(tmp, 'output', 'the-test-fox', 'film.mp4');
  assert.ok(fs.existsSync(film));
  // a real film: both 1-second clips joined, with sound (account 2's clips have none, and get silence)
  const info = probe(film);
  assert.ok(Math.abs(info.duration - 2) < 0.25, `film is ${info.duration} s`);
  assert.ok(info.audio);
  // the speech bubble ("Look!") is on the film, not on the clean copy
  assert.match(r.out, /adding 1 speech bubble\(s\)/);
  assert.match(r.out, /making the sound: Kitsu Studio's music \(happy\) and 1 voice line\(s\)/);
  assert.ok(fs.existsSync(path.join(tmp, 'output', 'the-test-fox', 'film-clean.mp4')));
  assert.match(r.out, /clips cost 40 credits/);
});

test('nothing is made twice; --redo frame 2 makes that frame and its two clips again', needsKitsu, () => {
  bank(1, 100); bank(2, 0);
  const before = calls(1).length + calls(2).length;
  assert.match(run('make', STORY).out, /Frames: all made[\s\S]*Clips: all made/);
  assert.strictEqual(calls(1).length + calls(2).length, before);
  const b1 = calls(1).length, b2 = calls(2).length;
  const r = run('make', STORY, '--redo', 'frame', '2', '--all');
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /clip 1 uses frame 2[\s\S]*clip 2 uses frame 2/);
  const after = [...calls(1).slice(b1), ...calls(2).slice(b2)];
  assert.deepStrictEqual(after.map(c => c.type), ['image', 'video', 'video']);
});

test('no account with enough credits: stops, keeps what was made, says what to do', needsKitsu, () => {
  bank(1, 5); bank(2, 5);
  const r = run('make', STORY, '--redo', 'clip', '1');
  assert.strictEqual(r.code, 1);
  assert.match(r.out, /No account has 25 credits left for clip 1/);
  assert.ok(fs.existsSync(path.join(tmp, 'output', 'the-test-fox', 'clips', 'clip-02.mp4')));
});

test('--account pins one account', needsKitsu, () => {
  bank(1, 100); bank(2, 100);
  const before = calls(2).length;
  const r = run('make', STORY, '--account', '1');
  assert.strictEqual(r.code, 0, r.out);
  assert.strictEqual(calls(2).length, before);
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the Flow driver: newest image model, file kinds, the price link', () => {
  const { newestNanoBanana, extensionOf, inEnglish } = require('../lib/flow-web');
  assert.strictEqual(newestNanoBanana(['Nano Banana Pro', 'Nano Banana 2 Lite', 'Nano Banana 2.1', 'Veo 3.1 - Fast']), 2);
  assert.strictEqual(newestNanoBanana(['Nano Banana 2', 'Nano Banana 10']), 1);
  assert.strictEqual(newestNanoBanana(['Veo 3.1 - Fast']), -1);
  const f = path.join(tmp, 'kind');
  fs.writeFileSync(f, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])); assert.strictEqual(extensionOf(f), '.png');
  fs.writeFileSync(f, Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])); assert.strictEqual(extensionOf(f), '.jpg');
  fs.writeFileSync(f, Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom')])); assert.strictEqual(extensionOf(f), '.mp4');
  assert.strictEqual(inEnglish('https://flow.google.com/project/x?hl=es'), 'https://flow.google.com/project/x?hl=en');
  // the price is the link with a number in it, never Flow's "Add AI credits" banner (the bug of 2026-10-31)
  const price = /^\s*\d[\d,]*\s*credits?\s*$/i;
  assert.ok(price.test('0 credits') && price.test('20 credits') && price.test('1,000 credits'));
  assert.ok(!price.test('Add AI credits'));
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'lib', 'flow-web.js'), 'utf8'), /name: \/\^\\s\*\\d\[\\d,\]\*\\s\*credits\?\\s\*\$\/i/);
});

test('bubbles: timing from reading time, "at", and voice lengths; the bubble pictures are drawn', async () => {
  const { bubbleTimes, drawBubbles } = require('../lib/bubbles');
  const { items: t } = bubbleTimes([{ duration: 8, lines: [{ text: 'a', side: 'left', at: null }, { text: 'a much longer line to read', side: 'right', at: null }] }, { duration: 8, lines: [] }, { duration: 8, lines: [{ text: 'c', at: null }] }]);
  assert.deepStrictEqual(t.map(b => b.text), ['a', 'a much longer line to read', 'c']);
  assert.ok(t[0].t0 > 0 && t[0].t1 < t[1].t0 && t[1].t1 <= 8 && t[2].t0 >= 16 && t[2].t1 <= 24);
  assert.ok(t[1].t1 - t[1].t0 > t[0].t1 - t[0].t0, 'the longer line shows longer');
  // "at": the counting starts at once, and the next line follows it
  const { items: a } = bubbleTimes([{ duration: 10, lines: [{ text: 'One... two... three...', at: 0 }, { text: 'Found you.', at: 6 }] }]);
  assert.strictEqual(a[0].t0, 0); assert.strictEqual(a[1].t0, 6); assert.ok(a[0].t1 <= 5.95);
  // voices: a bubble lasts its line and a moment; a line too long for its clip is reported
  const { items: v, warnings } = bubbleTimes([{ duration: 4, lines: [{ text: 'x', at: null, len: 2, wav: 'x.wav' }, { text: 'y', at: null, len: 3, wav: 'y.wav' }] }]);
  assert.ok(Math.abs(v[0].t1 - (v[0].t0 + 2.5)) < 0.3 && v[1].t0 > v[0].t0 + 2);
  assert.ok(warnings.some(w => /past the end/.test(w)));
  const [png] = await drawBubbles([{ text: "Don't worry, Yuki. I'm a snow expert.", side: 'left' }], 720, 1280);
  fs.writeFileSync(path.join(tmp, 'bubble.png'), Buffer.from(png, 'base64'));
  if (process.env.KEEP_BUBBLE) fs.copyFileSync(path.join(tmp, 'bubble.png'), process.env.KEEP_BUBBLE);
  assert.ok(png.length > 2000);
});

test('voices: kitsu: Kitsu Studio voices for each line, mood and whisper, mixed into the film', needsKitsu, () => {
  const { voiceFor } = require('../lib/voices');
  const table = { ren: { voice: 'am_puck', speed: 1, pitch: 1.12 }, _moods: { proud: { speed: 0.95, pitch: 1.02 } }, _styles: { whisper: { gain: -5, speed: 0.95 } } };
  assert.deepStrictEqual(voiceFor('Ren', 'proud, left', table), { voice: 'am_puck', speed: 0.95, pitch: 1.1424, gain: 0, echo: false });
  assert.strictEqual(voiceFor('Ren', 'whispering', table).gain, -5);
  assert.strictEqual(voiceFor('Nobody', '', table), null);
  const tts = path.join(tmp, 'fake-tts.js');
  const story = path.join(tmp, 'voiced.txt');
  fs.writeFileSync(story, fs.readFileSync(STORY, 'utf8').replace('title: The Test Fox', 'title: The Voiced Fox\nvoices: kitsu\nmusic: mystery').replace('clip 2: frame 2 to frame 3', 'clip 2: frame 2 to frame 3\nmusic: magical').replace('Ren (excited): "Look!"', 'Ren (excited, at 0.2s): "Look!"'));
  bank(1, 100); bank(2, 100);
  const r = spawnSync(process.execPath, [CLI, 'make', story, '--all', '--account', '1'], { env: { ...env, KITSU_FLOW_TTS: tts }, encoding: 'utf8', cwd: tmp });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  // ("Look!" in Ren's voice was already made by an earlier test, so it is reused from the voice cache)
  assert.match(r.stdout, /making the sound: Kitsu Studio's music \(mystery, magical\) and 1 voice line\(s\)/);
  const film = path.join(tmp, 'output', 'the-voiced-fox', 'film.mp4');
  assert.ok(Math.abs(probe(film).duration - 2) < 0.25);
  // Google Flow's own sound is left out: the film's sound is Kitsu Studio's soundtrack (made once and kept)
  assert.ok(fs.readdirSync(path.join(tmp, 'output', '_sound')).some(f => f.endsWith('.wav')));
  // the voice is kept: making the film again needs no new voice
  const again = spawnSync(process.execPath, [CLI, 'make', story, '--redo', 'film', '--account', '1'], { env: { ...env, KITSU_FLOW_TTS: tts }, encoding: 'utf8', cwd: tmp });
  assert.strictEqual(again.status, 0, again.stdout + again.stderr);
  assert.doesNotMatch(again.stdout, /making \d+ voice/);
});

test('a clip with no frames is made from the characters, with Flow voices and Flow sound', () => {
  const story = path.join(tmp, 'charclips.txt');
  fs.writeFileSync(story, `title: Char Clips\ncharacters: Ren, Yuki\nvoices: flow\nmusic: none\nbubbles: off\nmax credits: 25\nstyle: Cute.\nplace: A garden.\n\nclip 1:\nRen waves at Yuki.\nRen (happy): "Hello!"\n\nclip 2:\nYuki hops.\n`);
  const { parseFlowStory } = require('../lib/story');
  assert.deepStrictEqual(parseFlowStory(fs.readFileSync(story, 'utf8')).errors, []);
  assert.match(parseFlowStory('title: x\ncharacters: Ren\nclip 1:\nA cloud floats by.\n').errors.join(), /doesn't name any/);
  bank(1, 100); bank(2, 0);
  const before = calls(1).length;
  const r = run('make', story, '--account', '1');
  assert.strictEqual(r.code, 0, r.out);
  const made = calls(1).slice(before);
  assert.deepStrictEqual(made.map(c => c.type), ['video', 'video']);
  assert.deepStrictEqual(made[0].reference_images, ['asset:Ren', 'asset:Yuki']);
  assert.deepStrictEqual(made[1].reference_images, ['asset:Yuki']);
  assert.ok(!made[0].first_frame && !made[0].last_frame);
  assert.match(made[0].prompt, /A garden\. Ren waves at Yuki\. Ren \(happy\): "Hello!" Each character speaks their lines in their own voice\./);
  assert.ok(fs.existsSync(path.join(tmp, 'output', 'char-clips', 'film.mp4')));
});

test('a narrator: never acted by Flow, read by the Kitsu narrator voice, shown in a caption box', async () => {
  const { parseFlowStory, clipPrompt } = require('../lib/story');
  const st = parseFlowStory('title: T\naspect: 16:9\nmusic: none\nflow sound: on\nframe 1: a forest\nframe 2: a waterfall\nclip 1: frame 1 to frame 2\nThe camera glides on.\nNarrator (at 0.5s): "Beyond the lands known to ordinary travelers."\n');
  assert.deepStrictEqual(st.errors, []);
  const p = clipPrompt(st.meta, st.clips[0]);
  assert.doesNotMatch(p, /Narrator reacts/); assert.doesNotMatch(p, /Beyond the lands/); assert.match(p, /Nobody speaks/);
  assert.ok(require('../lib/voices').voiceFor('Narrator', '', { narrator: { voice: 'am_onyx', speed: 0.86, pitch: 0.94, echo: true } }).echo);
  const { drawBubbles } = require('../lib/bubbles');
  const [cap] = await drawBubbles([{ text: 'Four worlds. One ancient tree.', who: 'Narrator' }], 1280, 720);
  assert.ok(cap.length > 2000);
});

test('a clip from a start frame only: no end frame, so a very different place doesn\'t fade in', () => {
  const { parseFlowStory, clipPrompt } = require('../lib/story');
  const st = parseFlowStory('title: Town\naspect: 16:9\nframe 1: a forest path\nframe 2: a town market\nclip 1: from frame 1\nThe hunters walk on into the town.\nclip 2: frame 2\nThe market comes alive.\n');
  assert.deepStrictEqual(st.errors, []);
  assert.deepStrictEqual(st.clips.map(c => [c.from, c.to]), [[1, null], [2, null]]);
  assert.match(clipPrompt(st.meta, st.clips[0]), /The hunters walk on into the town\. One continuous camera shot[^]*no fades, no dissolves/);
  assert.match(parseFlowStory('title: x\nframe 1: a\nclip 1: from frame 4\nGo.\n').errors.join(), /no "frame 4:"/);
  const story = path.join(tmp, 'town.txt');
  fs.writeFileSync(story, 'title: Town Walk\nvoices: none\nmusic: none\nbubbles: off\nframe 1: a forest path\nframe 2: a town market\nclip 1: from frame 1\nThe hunters walk on into the town.\nclip 2: frame 1 to frame 2\nThe market.\n');
  assert.match(run('check', story).out, /clip 1: from frame 1 on/);
  bank(1, 100); bank(2, 0);
  const before = calls(1).length;
  const r = run('make', story, '--all', '--account', '1');
  assert.strictEqual(r.code, 0, r.out);
  const vids = calls(1).slice(before).filter(c => c.type === 'video');
  assert.ok(vids[0].first_frame && !('last_frame' in vids[0]), 'clip 1: a start frame only');
  assert.ok(vids[1].first_frame && vids[1].last_frame, 'clip 2: both frames');
});

test('frames: new places: a new place is drawn from its own words, not copied from the frame before', () => {
  const { parseFlowStory, followsOn } = require('../lib/story');
  const text = 'title: Tree Walk\nframes: new places\nvoices: none\nmusic: none\nframe 1: a cave\nframe 2: the World Tree\nframe 3: Same place, at sunset.\nframe 4: a market\nclip 1: from frame 1\nGo.\n';
  const st = parseFlowStory(text);
  assert.deepStrictEqual(st.errors, []);
  assert.deepStrictEqual(st.frames.map(f => followsOn(st.meta, f.text)), [false, false, true, false]);
  // Ren & Yuki's stories don't change: every frame follows on
  assert.ok(followsOn(parseFlowStory(fs.readFileSync(STORY, 'utf8')).meta, 'Ren points up.'));
  assert.match(parseFlowStory('title: x\nframes: sometimes\nframe 1: a\n').errors.join(), /new places/);
  const story = path.join(tmp, 'tree-walk.txt');
  fs.writeFileSync(story, text);
  bank(1, 100); bank(2, 0);
  let before = calls(1).length;
  assert.strictEqual(run('make', story, '--account', '1').code, 0);
  const imgs = calls(1).slice(before);
  assert.deepStrictEqual(imgs.map(c => !!c.reference_images), [false, false, true, false]);
  assert.doesNotMatch(imgs[1].prompt, /previous image/); assert.match(imgs[2].prompt, /same scene a moment later/);
  // several frames again at once
  before = calls(1).length;
  const r = run('make', story, '--account', '1', '--redo', 'frames', '2,4');
  assert.strictEqual(r.code, 0, r.out);
  assert.deepStrictEqual(calls(1).slice(before).filter(c => c.type === 'image').map(c => c.prompt.match(/(cave|World Tree|sunset|market)/)[1]), ['World Tree', 'market']);
  assert.match(run('make', story, '--redo', 'frame', 'x').out, /--redo frame 6,7,9-12/);
  // PowerShell passes 6,7,9-12 as three words: "6" "7" "9-12"
  before = calls(1).length;
  assert.strictEqual(run('make', story, '--account', '1', '--redo', 'frame', '1', '3-4').code, 0);
  assert.deepStrictEqual(calls(1).slice(before).map(c => c.prompt.match(/(cave|World Tree|sunset|market)/)[1]), ['cave', 'sunset', 'market']);
});

test("Flow's own sound as the film's music: a quiet one is brought up to a proper level", () => {
  const { loudness } = require('../lib/join');
  const story = path.join(tmp, 'quiet.txt');
  fs.writeFileSync(story, 'title: Quiet Flow\nvoices: none\nmusic: none\nflow sound: on\nframe 1: a\nframe 2: b\nclip 1: frame 1 to frame 2\nWind in the trees.\nNarrator: "Long ago."\n');
  bank(1, 100); bank(2, 0);
  const quiet = path.join(tmp, 'accounts', 'account-1', 'quiet');
  fs.writeFileSync(quiet, '');
  try {
    const r = run('make', story, '--all', '--account', '1');
    assert.strictEqual(r.code, 0, r.out);
  } finally { fs.rmSync(quiet, { force: true }); }
  const dir = path.join(tmp, 'output', 'quiet-flow'), before = loudness(path.join(dir, 'film-clean.mp4')), after = loudness(path.join(dir, 'film.mp4'));
  assert.ok(before.i < -35, `the clip is quiet (${before.i} LUFS)`);
  assert.ok(Math.abs(after.i - -16) < 2.5, `the film is at a proper level (${after.i} LUFS)`);
  assert.ok(after.tp <= -1, `no clipping (${after.tp} dB)`);
});

test('manga: the story file, the pages\' layout, and their checks', () => {
  const { parseManga, isManga, layoutPage, panelAspect, pagePixels } = require('../lib/manga');
  const text = 'title: Book\nsize: 6 x 9\nframes from: story.txt\nstyle: Anime.\n\npage 1: 1 tall, 2\npanel 1: frame 1\nCaption: "Long ago..."\npanel 2: A waterfall.\nCaption (right, bottom): "...it fell."\nfocus: top\npanel 3: A cave.\nJack (happy, left): "Look!"\nTitle (top): "The Cave"\n\npage 2:\npanel 4: frame 3\n';
  assert.ok(isManga(text) && !isManga(fs.readFileSync(STORY, 'utf8')));
  const b = parseManga(text);
  assert.deepStrictEqual(b.errors, []);
  assert.strictEqual(b.meta.size, '6x9'); assert.strictEqual(b.meta.quality, 'upscaled');
  assert.deepStrictEqual(b.panels.map(p => [p.n, p.page, p.frame]), [[1, 1, 1], [2, 1, null], [3, 1, null], [4, 2, 3]]);
  assert.deepStrictEqual(b.panels[1].captions.map(c => [c.text, c.x, c.y]), [['...it fell.', 'right', 'bottom']]);
  assert.strictEqual(b.panels[1].focus, 'top');
  assert.deepStrictEqual(b.panels[2].bubbles.map(x => [x.who, x.text, x.x]), [['Jack', 'Look!', 'left']]);
  assert.deepStrictEqual(b.panels[2].titles.map(x => [x.text, x.y]), [['The Cave', 'top']]);
  // Amazon's 6 x 9 inches at 300 dpi; the panels stay inside the margins and don't overlap
  const px = pagePixels(b.meta);
  assert.deepStrictEqual([px.W, px.H], [1800, 2700]);
  for (const slant of [true, false]) {
    const q = layoutPage(b.pages[0], px, slant);
    assert.strictEqual(q.length, 3);
    q.flat().forEach(c => assert.ok(c.x >= px.margin - 0.5 && c.x <= px.W - px.margin + 0.5 && c.y >= px.margin - 0.5 && c.y <= px.H - px.margin + 0.5));
    assert.ok(q[0][3].y < q[1][0].y && q[0][2].y < q[2][1].y, 'a gutter between the rows');
    assert.ok(q[1][1].x < q[2][0].x && q[1][2].x < q[2][3].x, 'a gutter between the panels');
    assert.strictEqual(panelAspect(q[0]), '16:9');
  }
  assert.strictEqual(panelAspect(layoutPage({ rows: [{ count: 3, weight: 1.5 }], panels: [1, 2, 3] }, px, false)[0]), '9:16');
  const bad = parseManga('title: x\npage 1: 1, 2\npanel 1: frame 2\npanel 2: a\npage 2: 5\nCaption: "x"\n');
  assert.ok(bad.errors.some(e => /rows hold 3 panels, but 2/.test(e)));
  assert.ok(bad.errors.some(e => /frames from/.test(e)));
  assert.ok(bad.errors.some(e => /page 1: 1 tall, 2, 1/.test(e)));
  assert.match(parseManga('title: x\nsize: A4\npage 1:\npanel 1: a\n').errors.join(), /Amazon's book sizes/);
});

test('manga: panels made in Flow (free) or taken from the video\'s frames, then the pages and the PDF', () => {
  const book = path.join(tmp, 'book.txt');
  fs.writeFileSync(book, 'title: The Fox Book\nframes from: story.txt\ncharacters: Ren, Yuki\nstyle: Cute.\n\npage 1: 1, 2\npanel 1: frame 1\nCaption: "Once upon a time..."\npanel 2: Ren in a garden.\nRen (happy, left): "Hi!"\npanel 3: Same place, Ren climbs a tall tree.\nTitle: "The Fox Book"\n\npage 2:\npanel 4: frame 3\nCaption (right): "The end."\n');
  const c = run('check', book);
  assert.strictEqual(c.code, 0, c.out);
  assert.match(c.out, /made +panel 1: frame 1 of story\.txt/);
  assert.match(c.out, /2 panel picture\(s\) still to make in Flow: free/);
  // story.txt is 9:16, and panel 1 is a wide panel: check says how much of that frame shows
  assert.match(c.out, /panel 1 \(frame 1\): only \d+% of the frame's height shows/);
  bank(1, 7); bank(2, 0);
  const before = calls(1).length;
  const r = run('make', book, '--account', '1');
  assert.strictEqual(r.code, 0, r.out);
  const made = calls(1).slice(before);
  assert.deepStrictEqual(made.map(x => x.type), ['image', 'image'], 'only the two new panels are made; the frames are reused');
  // a new place: only the character as a reference, not the panel before (Flow would copy it in)
  assert.match(made[0].prompt, /Ren in a garden\. One manga panel picture[^]*no speech bubbles/);
  assert.deepStrictEqual(made[0].reference_images, ['asset:Ren']);
  assert.doesNotMatch(made[0].prompt, /reference picture/);
  // "Same place": the panel before is the reference
  assert.match(made[1].prompt, /same scene a moment later/);
  assert.ok(made[1].reference_images[0].includes('panel-02'));
  assert.strictEqual(made[0].download_quality, 'upscaled');
  assert.strictEqual(made[1].aspect_ratio, '9:16', 'half the page wide, half the page tall: a tall panel');
  assert.strictEqual(bank(1), 7, 'no credits spent');
  const out = path.join(tmp, 'output', 'the-fox-book');
  assert.deepStrictEqual(fs.readdirSync(path.join(out, 'pages')), ['page-01.png', 'page-02.png']);
  const pdf = fs.readFileSync(path.join(out, 'the-fox-book.pdf'), 'latin1');
  assert.strictEqual((pdf.match(/\/Type\s*\/Page\b/g) || []).length, 2);
  assert.match(pdf, /\/MediaBox\s*\[\s*0 0 432 648\s*\]/, '6 x 9 inches');
  // nothing is made twice; --redo pages lays them out again for free, --redo panel 3 makes that one again
  assert.match(run('make', book, '--account', '1', '--redo', 'pages').out, /Panels: all made/);
  assert.strictEqual(calls(1).length, before + 2);
  assert.strictEqual(run('make', book, '--account', '1', '--redo', 'panel', '3').code, 0);
  assert.strictEqual(calls(1).length, before + 3);
  assert.match(run('make', book, '--redo', 'panel', '1').out, /redo that frame there/);
});

test('moving Flow Studio: frames made in the old folder still count', () => {
  const { looksLikeKitsu } = require('../lib/kitsu');
  assert.ok(!looksLikeKitsu(tmp));
  // made.json written in the old place (Kitsu Studio's flow\output), then the folder moved
  const story = path.join(tmp, 'moved.txt');
  fs.writeFileSync(story, 'title: Moved Fox\nvoices: none\nmusic: none\nframe 1: a\nframe 2: b\nclip 1: frame 1 to frame 2\nRen hops.\n');
  const dir = path.join(tmp, 'output', 'moved-fox');
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
  ['frame-01.png', 'frame-02.png'].forEach(f => fs.writeFileSync(path.join(dir, 'frames', f), 'x'));
  fs.writeFileSync(path.join(dir, 'made.json'), JSON.stringify({ frames: { 1: 'D:\\Reegan\\kitsu-studio\\flow\\output\\moved-fox\\frames\\frame-01.png'.replace(/\\/g, path.sep), 2: '/old/place/moved-fox/frames/frame-02.png' }, clips: {}, credits: {} }));
  const c = run('check', story);
  assert.strictEqual(c.code, 0, c.out);
  assert.match(c.out, /made +frame 1/); assert.match(c.out, /made +frame 2/);
});
