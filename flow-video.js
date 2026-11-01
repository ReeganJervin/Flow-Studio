#!/usr/bin/env node
// Flow Studio: makes a video in Google Flow from a story file, by itself, with no AI assistant in the loop (so it costs
// no Claude usage). Each Google account has its own signed-in Chrome window, and Flow's own buttons are clicked in it
// (lib/flow-web.js). Kitsu Studio's voices and music are used from the Kitsu Studio folder (lib/kitsu.js).
//
//   flow-video kitsu <folder>               once: where Kitsu Studio is (for its voices and music)
//   flow-video login 1                      once per account: sign in to Google in that account's Chrome window
//   flow-video credits                      the plan and credits left on every account
//   flow-video check <story>                read the story, list what will be made (spends nothing)
//   flow-video make <story>                 frames first (free); run again for the clips and the finished film
//   flow-video make <story> --all           frames, clips and the film in one go
//   flow-video make <story> --redo frame 3  make frame 3 again (also: --redo clip 2, --redo film)
//   flow-video make <story> --account 2     use account 2 only (default: whichever has the most credits)
//
// Everything lands in output/<project>/: frames/frame-01.png..., clips/clip-01.mp4..., film.mp4.
// Already-made frames and clips are kept, so a run that stops (no credits left, Chrome closed) carries on where it was.
const fs = require('fs'), path = require('path'), os = require('os');
const { parseFlowStory, framePrompt, clipPrompt, castOf } = require('./lib/story');
const { joinClips, probe } = require('./lib/join');
const { bubbleTimes, burnBubbles } = require('./lib/bubbles');
const { makeVoices } = require('./lib/voices');
const { kitsuSoundtrack } = require('./lib/soundtrack');

const HERE = __dirname;
const { SETTINGS_FILE, settings, saveSettings, looksLikeKitsu, kitsuDir } = require('./lib/kitsu');
const OUTPUT = process.env.KITSU_FLOW_OUTPUT || path.join(HERE, 'output');
const ACCOUNTS_HOME = process.env.KITSU_FLOW_HOME || path.join(os.homedir(), '.kitsu-flow');
// (the tests use a pretend Flow instead of Chrome)
const { FlowAccount } = require(process.env.KITSU_FLOW_ENGINE || './lib/flow-web');
const say = (...a) => console.log(...a);
class Stop extends Error {}
const stop = msg => { throw new Stop(msg); };

// ---------- accounts ----------
// each account: its own Chrome profile and its own remote-control port, so both can be signed in at once
function accountNames() {
  const s = settings(); if (s.accounts) return s.accounts;
  return { 1: 'Account 1', 2: 'Account 2' };
}
const made_ = {};
function account(n) {
  const names = accountNames();
  if (!names[n]) stop(`There is no account ${n}. Accounts: ${Object.keys(names).join(', ')} (names are in settings.json).`);
  return made_[n] || (made_[n] = new FlowAccount({ n: String(n), name: names[n], home: path.join(ACCOUNTS_HOME, `account-${n}`), cdp: 9340 + +n }));
}
const accounts = () => Object.keys(accountNames()).map(account);
async function state(a) {
  try { return await a.state(true); } catch (e) { return { ok: false, credits: null, hint: e.message }; }
}
function showState(a, s) {
  say(`  ${a.n}. ${a.name}: ${s.ok ? `${s.credits === null ? 'credits unknown' : `${s.credits} credits`}${s.plan ? ` (${s.plan})` : ''}` : s.hint || 'not ready'}`);
}

// ---------- the story's files ----------
const outDir = story => path.join(OUTPUT, story.meta.project);
const stateFile = story => path.join(outDir(story), 'made.json');
function made(story) {
  let m = {}; try { m = JSON.parse(fs.readFileSync(stateFile(story), 'utf8')); } catch (_) { /* nothing made yet */ }
  // inFlow: where each frame already is in Flow ({ account, title }), so a clip on that account picks it there
  m = { frames: {}, clips: {}, credits: {}, inFlow: {}, ...m };
  // files made before this folder was moved (from Kitsu Studio's flow folder, or another drive) are found where they
  // are now: the same name in the same place inside this story's output folder
  const here = f => (!f || fs.existsSync(f) ? f : [path.join(outDir(story), path.basename(path.dirname(f)), path.basename(f)), path.join(outDir(story), path.basename(f))].find(x => fs.existsSync(x)) || f);
  for (const k of ['frames', 'clips']) for (const n in m[k]) m[k][n] = here(m[k][n]);
  if (m.film) m.film = here(m.film);
  return m;
}
// a frame for a clip or as a reference: picked in Flow when it's already in this account's project, else uploaded
function frameFor(m, n, a) { const f = m.inFlow[n]; return f && f.account === a.n && f.title ? `asset:${f.title}` : path.resolve(m.frames[n]); }
function saveMade(story, m) { fs.mkdirSync(outDir(story), { recursive: true }); fs.writeFileSync(stateFile(story), JSON.stringify(m, null, 2)); }
const have = f => f && fs.existsSync(f);
const num = n => String(n).padStart(2, '0');
function readStory(file) {
  if (!file) stop('Which story? For example:  flow-video make stories\\my-story.txt');
  if (!fs.existsSync(file)) stop(`I can't find ${file}.`);
  const story = parseFlowStory(fs.readFileSync(file, 'utf8'));
  // style pictures are found next to the story file
  story.stylePictures = (story.meta.stylePictures || []).map(p => path.resolve(path.dirname(file), p));
  const lost = story.stylePictures.filter(p => !fs.existsSync(p));
  if (lost.length) story.errors.push(`style pictures: I can't find ${lost.map(p => path.relative(process.cwd(), p)).join(', ')}.`);
  if (story.errors.length) stop(`Please fix these lines in ${path.basename(file)}:\n  ${story.errors.join('\n  ')}`);
  return story;
}
const progress = label => msg => say(`    ${label}: ${msg}`);

// ---------- making ----------
// frames one at a time, so each can use the frame before it as a reference and keep the look the same
async function makeFrames(story, a, m, todo) {
  say(`\nFrames (free): ${todo.map(f => f.n).join(', ')} on ${a.name}`);
  for (const f of todo) {
    const prev = story.frames[story.frames.indexOf(f) - 1], prevFile = prev && m.frames[prev.n];
    // references: the frame before (same look), the story's style pictures, the characters in this frame (3 at most)
    const refs = [...(have(prevFile) ? [frameFor(m, prev.n, a)] : []), ...story.stylePictures, ...castOf(story.meta, f.text).map(c => `asset:${c}`)].slice(0, 3);
    const scene = { type: 'image', prompt: framePrompt(story.meta, f) + (have(prevFile) ? ' Match the previous image exactly for the characters, colours, light and drawing style; this is the same scene a moment later.' : ''),
      aspect_ratio: story.meta.aspect, max_credits: 0, ...(refs.length ? { reference_images: refs } : {}), ...(story.meta.frameModel ? { model: story.meta.frameModel } : {}), download_quality: story.meta.quality };
    let r;
    try { r = await a.generate(scene, path.join(outDir(story), 'frames', `frame-${num(f.n)}`), progress(`frame ${f.n}`), `${story.meta.project}-frame-${num(f.n)}`); }
    catch (e) { stop(`Frame ${f.n} wasn't made: ${e.message}\nRun the same command again to try once more.`); }
    m.frames[f.n] = r.files[0];
    m.inFlow[f.n] = { account: a.n, title: r.title };
    saveMade(story, m);
    say(`    frame ${f.n}: ${path.relative(process.cwd(), m.frames[f.n])}`);
  }
}

// Clips one at a time. Before each one the credits are read; when the account in use has fewer left than a clip may
// cost (the story's "max credits"), it moves to another account that has enough, by itself.
async function makeClips(story, accts, pinned, m) {
  const todo = story.clips.filter(c => !have(m.clips[c.n])), need = story.meta.maxCredits;
  say(`\nClips: ${todo.map(c => c.n).join(', ')} (each at most ${need} credits)`);
  let a = null;
  for (const c of todo) {
    const pick = [];
    for (const x of pinned ? [pinned] : accts) { const s = await state(x); if (s.ok) pick.push({ a: x, s }); }
    const fits = pick.filter(p => p.s.credits === null || p.s.credits >= need);
    const best = (a && fits.find(p => p.a === a)) || fits.sort((p, q) => (q.s.credits ?? 0) - (p.s.credits ?? 0))[0];
    if (!best) {
      pick.forEach(p => showState(p.a, p.s));
      stop(`No account has ${need} credits left for clip ${c.n}. Everything made so far is kept: run the same command again when credits are back${pinned ? ', or without --account to use the other account' : ''}.`);
    }
    if (a && best.a !== a) say(`  ${a.name} is low on credits: switching to ${best.a.name} (${best.s.credits} credits).`);
    a = best.a;
    // from its two frames, or (a clip with no frames) from the Flow characters named in it, with their own voices
    const look = c.from !== null ? { first_frame: frameFor(m, c.from, a), ...(c.to !== null ? { last_frame: frameFor(m, c.to, a) } : {}) } : { reference_images: castOf(story.meta, c.text).slice(0, 3).map(n => `asset:${n}`) };
    const scene = { type: 'video', prompt: clipPrompt(story.meta, c), aspect_ratio: story.meta.aspect, max_credits: need, ...look, download_quality: story.meta.quality,
      ...(story.meta.model ? { model: story.meta.model } : {}), ...(story.meta.duration ? { duration: story.meta.duration } : {}), ...(story.meta.resolution ? { resolution: story.meta.resolution } : {}) };
    say(`  clip ${c.n} (${c.from !== null ? (c.to !== null ? `frame ${c.from} to frame ${c.to}` : `from frame ${c.from} on`) : `from the characters ${castOf(story.meta, c.text).join(', ')}`}) on ${a.name}${best.s.credits !== null ? `, ${best.s.credits} credits left` : ''}`);
    let r;
    try { r = await a.generate(scene, path.join(outDir(story), 'clips', `clip-${num(c.n)}`), progress(`clip ${c.n}`), `${story.meta.project}-clip-${num(c.n)}`); }
    catch (e) { stop(`Clip ${c.n} wasn't made: ${e.message}\nThe clips made so far are kept: run the same command again to carry on.`); }
    m.clips[c.n] = r.files[0];
    m.credits[c.n] = { account: a.n, credits: r.credits ?? null };
    saveMade(story, m);
    say(`    clip ${c.n}: ${path.relative(process.cwd(), m.clips[c.n])}${r.credits ? ` (${r.credits} credits)` : ''}`);
  }
}

// the clips joined (film-clean.mp4), then the speech bubbles on top (film.mp4)
async function makeFilm(story, m) {
  say('\nJoining the clips into the film...');
  const clips = story.clips.map(c => path.resolve(m.clips[c.n]));
  const clean = path.join(outDir(story), 'film-clean.mp4'), film = path.join(outDir(story), 'film.mp4');
  const r = joinClips(clips, clean), info = clips.map(c => probe(c));
  // Kitsu Studio's voices for the words ("voices: kitsu"), made once and kept
  let lines = story.clips.map(c => c.lines);
  if (story.meta.voices === 'kitsu' && lines.some(x => x.length)) {
    const all = makeVoices(lines.flat(), path.join(OUTPUT, '_voices'), say);
    let k = 0; lines = lines.map(x => x.map(() => all[k++]));
  }
  const { items, warnings } = bubbleTimes(story.clips.map((c, i) => ({ duration: info[i].duration, lines: lines[i] })));
  warnings.forEach(w => say(`  note: ${w}`));
  const voiced = items.filter(b => b.wav).length;
  // the sound: Kitsu Studio's music (the story's mood, changed by a clip's own "music:" line) and the voice lines,
  // mixed by Kitsu Studio's mixer; Google Flow's own sound is left out unless the story says "flow sound: on"
  const starts = info.reduce((a, c, i) => [...a, i ? a[i - 1] + info[i - 1].duration : 0], []);
  const music = [{ t: 0, mood: story.meta.music }, ...story.clips.map((c, i) => (c.music ? { t: starts[i], mood: c.music } : null)).filter(Boolean)];
  const playing = music.some(x => x.mood !== 'none');
  let soundtrack = null;
  if (playing || voiced) {
    say(`  making the sound: ${playing ? `Kitsu Studio's music (${[...new Set(music.map(x => x.mood))].join(', ')})` : 'no music'}${voiced ? ` and ${voiced} voice line(s)` : ''}${story.meta.flowSound ? ", with Flow's own sound under it" : ''}...`);
    soundtrack = await kitsuSoundtrack({ duration: r.duration, music, voices: items.filter(b => b.wav).map(b => ({ t: b.t0, wav: b.wav })) }, path.join(OUTPUT, '_sound'));
  }
  if (items.length && story.meta.voices !== 'kitsu') say(`  no Ren and Yuki voices: this story says "voices: ${story.meta.voices}". Delete that line (or write voices: kitsu) to hear them.`);
  if (items.length && story.meta.bubbles) say(`  adding ${items.length} speech bubble(s)...`);
  // Flow's own sound under Kitsu's music is kept quiet. With no Kitsu music it is the film's music: it is brought up
  // (Flow's sound is often very quiet), a little under the voices' level when someone speaks, and dips under them
  const flowLoudness = playing ? null : voiced ? -21 : -16;
  await burnBubbles(clean, film, items, info[0].w, info[0].h, { bubbles: story.meta.bubbles, soundtrack, flowSound: story.meta.flowSound, flowVolume: 0.35, flowLoudness, duck: !playing && voiced > 0 });
  m.film = film;
  saveMade(story, m);
  say(`  ${path.relative(process.cwd(), m.film)} (${Math.round(r.duration)} s)${items.length ? `; without bubbles or voices: ${path.basename(clean)}` : ''}`);
}

async function make(file, opts) {
  const story = readStory(file);
  const m = made(story);
  if (opts.redo) {
    const [kind, n] = opts.redo;
    if (kind === 'frame') { delete m.frames[n]; delete m.inFlow[n]; } else if (kind === 'clip') delete m.clips[n];
    // a new frame changes the clips that start or end on it
    if (kind === 'frame') story.clips.filter(c => c.from === +n || c.to === +n).forEach(c => { if (m.clips[c.n]) { delete m.clips[c.n]; say(`(clip ${c.n} uses frame ${n}, so it will be made again too)`); } });
    delete m.film;
    saveMade(story, m);
  }
  const pinned = opts.account ? account(opts.account) : null;
  say(`${story.meta.title}: ${story.frames.length} frames, ${story.clips.length} clips, ${story.meta.aspect}`);
  say('Accounts:');
  const accts = pinned ? [pinned] : accounts(), ready = [];
  for (const a of accts) { const s = await state(a); showState(a, s); if (s.ok) ready.push({ a, s }); }
  if (!ready.length) stop(`No account is ready. Sign in with  flow-video login ${accts[0].n}  and open a Flow project in that Chrome window, then try again.`);
  const first = ready.sort((p, q) => (q.s.credits ?? 0) - (p.s.credits ?? 0))[0].a;

  const frames = story.frames.filter(f => !have(m.frames[f.n]));
  if (frames.length) {
    await makeFrames(story, first, m, frames);
    if (!opts.all) {
      say(`\nThe frames are ready in ${path.relative(process.cwd(), path.join(outDir(story), 'frames'))}. Look at them first: they're free, clips cost credits.`);
      say(`  Redo one:            flow-video make ${file} --redo frame 3`);
      say(`  Then make the clips: flow-video make ${file}`);
      return;
    }
  } else if (story.frames.length) say('\nFrames: all made.');

  if (story.clips.some(c => !have(m.clips[c.n]))) await makeClips(story, accts, pinned, m); else say('Clips: all made.');
  if (!have(m.film) && story.clips.length) await makeFilm(story, m);
  const spent = Object.values(m.credits).reduce((s, x) => s + (x.credits || 0), 0);
  say(`\nDone: ${path.relative(process.cwd(), m.film || outDir(story))}${spent ? ` (clips cost ${spent} credits in all)` : ''}`);
}

function check(file) {
  const story = readStory(file), m = made(story);
  say(`${story.meta.title}  (project "${story.meta.project}", ${story.meta.aspect}${story.meta.model ? `, ${story.meta.model}` : ''}, at most ${story.meta.maxCredits} credits a clip)`);
  if (story.meta.characters.length) say(`Flow characters: ${story.meta.characters.join(', ')}`);
  if (story.frames.length) say('\nFrames (free):');
  story.frames.forEach(f => say(`  ${have(m.frames[f.n]) ? 'made ' : '     '} frame ${f.n}${castOf(story.meta, f.text).length ? ` [${castOf(story.meta, f.text).join(', ')}]` : ''}: ${f.text.slice(0, 80)}${f.text.length > 80 ? '...' : ''}`));
  say('\nClips:');
  story.clips.forEach(c => {
    say(`  ${have(m.clips[c.n]) ? 'made ' : '     '} clip ${c.n}: ${c.from !== null ? (c.to !== null ? `frame ${c.from} to frame ${c.to}` : `from frame ${c.from} on`) : `from the characters (${castOf(story.meta, c.text).join(', ')})`}: ${c.action.slice(0, 70)}${c.action.length > 70 ? '...' : ''}`);
    c.lines.forEach(l => say(`          ${story.meta.bubbles ? 'bubble' : 'says  '} (${l.who}${l.side ? `, ${l.side}` : ''}${l.at !== null ? `, at ${l.at}s` : ''}): "${l.text}"`));
  });
  say(`\nVoices: ${{ none: 'none (the words go in speech bubbles)', kitsu: "Kitsu Studio's own voices, added to the film (none from Flow)", flow: 'made by Flow' }[story.meta.voices]}. Bubbles: ${story.meta.bubbles ? 'on' : 'off'}.`);
  const clipMusic = story.clips.filter(c => c.music).map(c => `clip ${c.n}: ${c.music}`);
  const kitsuMusic = story.meta.music !== 'none' || clipMusic.length;
  say(`Music: ${kitsuMusic ? `Kitsu Studio's "${story.meta.music}"${clipMusic.length ? ` (then ${clipMusic.join(', ')})` : ''}` : 'none from Kitsu Studio'}. Google Flow's own sound: ${story.meta.flowSound ? (kitsuMusic ? 'kept, under the music' : story.meta.voices === 'flow' ? 'kept (its music, sounds and voices)' : 'kept (its music and sounds)') : 'left out'}.`);
  if (story.meta.voices === 'kitsu') {
    try {
      const { voiceFor } = require('./lib/voices'), missing = [...new Set(story.clips.flatMap(c => c.lines).filter(l => !voiceFor(l.who, l.notes)).map(l => l.who))];
      if (missing.length) say(`Note: no Kitsu voice for ${missing.join(', ')} (see Kitsu Studio's config\\voices.json): those lines would stop the film.`);
    } catch (e) { say(`Note: ${e.message.split('\n')[0]} Run  flow-video kitsu <folder>  before making the film.`); }
  }
  const left = story.clips.filter(c => !have(m.clips[c.n])).length;
  say(`\n${left} clip(s) still to make: at most ${left * story.meta.maxCredits} credits. Nothing has been spent by this check.`);
}

// where Kitsu Studio is: its voices (Ren, Yuki, the narrator) and its music are used from there
function kitsu(dir) {
  if (!dir) {
    try { return say(`Kitsu Studio: ${kitsuDir()}`); } catch (e) { stop(e.message); }
  }
  dir = path.resolve(dir);
  if (!looksLikeKitsu(dir)) stop(`${dir} doesn't look like the Kitsu Studio folder (it should have engine\\story.js and config\\voices.json).`);
  saveSettings({ ...settings(), kitsu: dir });
  say(`Saved: Kitsu Studio is in ${dir}. Its voices and music will be used from there.`);
}

async function credits() {
  say('Accounts:');
  for (const a of accounts()) showState(a, await state(a));
}

async function login(n) {
  const a = account(n || 1);
  say(`Opening the Chrome window for ${a.name}.`);
  const s = await state(a);
  if (s.ok) say(`It's ready: signed in, with a Flow project open${s.credits !== null ? ` (${s.credits} credits)` : ''}. Leave the window open.`);
  else say(`In that window: sign in to Google, open (or create) a Flow project, and leave the window open.\n(${s.hint})`);
}

// ---------- command line ----------
async function main(argv) {
  const [cmd, ...rest] = argv, opt = k => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : null; };
  const file = rest.find((x, i) => !x.startsWith('--') && !['--account', '--redo'].includes(rest[i - 1]) && rest[i - 2] !== '--redo');
  if (cmd === 'login') return login(rest[0]);
  if (cmd === 'credits') return credits();
  if (cmd === 'check') return check(file);
  if (cmd === 'make') {
    let redo = null;
    const ri = rest.indexOf('--redo');
    if (ri >= 0) {
      redo = [String(rest[ri + 1] || '').toLowerCase(), rest[ri + 2]];
      if (!/^(frame|clip|film)$/.test(redo[0]) || (redo[0] !== 'film' && !/^\d+$/.test(redo[1] || ''))) stop('Use --redo frame 3, --redo clip 2, or --redo film.');
    }
    return make(file, { all: rest.includes('--all'), account: opt('account'), redo });
  }
  if (cmd === 'kitsu') return kitsu(rest[0]);
  if (cmd === 'setup') return say('Run setup.bat once (it installs what Flow Studio needs), then:  flow-video kitsu <Kitsu Studio folder>');
  say(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 16).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
}

if (require.main === module) {
  let code = 0;
  main(process.argv.slice(2))
    .catch(e => { console.error(`\n${e instanceof Stop ? e.message : `Something went wrong: ${e.stack || e}`}`); code = 1; })
    // (Chrome stays open and signed in; only this program's connection to it ends)
    .finally(() => process.exit(code));
}
module.exports = { main };
