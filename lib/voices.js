// Kitsu Studio's own voices for the words in a Flow story ("voices: kitsu"): Ren, Yuki and the others sound exactly as
// in the episodes, in every clip. Flow Studio only READS Kitsu Studio's voice settings (config/voices.json) and runs its
// voice tool (tools/tts.py, Kokoro, offline) with its voice model (models/); it changes nothing there.
// Each line is made once and kept in output/_voices/, so a line that didn't change is never made again.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync, execFileSync } = require('child_process');
const { FFMPEG, probe } = require('./join');

const { kitsuDir } = require('./kitsu');
const VOICES_FILE = () => process.env.KITSU_FLOW_VOICES || path.join(kitsuDir(), 'config', 'voices.json');
// (the tests use a pretend voice tool: KITSU_FLOW_TTS)
const TTS = () => process.env.KITSU_FLOW_TTS || path.join(kitsuDir(), 'tools', 'tts.py');
const MODELS = () => path.join(kitsuDir(), 'models');
// everyday words for Kitsu Studio's moods
const MOOD_WORDS = { teasing: 'playful', amused: 'playful', cheeky: 'playful', pouting: 'pouty', grumpy: 'pouty', giggling: 'laughing', laughs: 'laughing',
  confident: 'proud', heroic: 'proud', nervous: 'worried', frightened: 'scared', afraid: 'scared', sleepy: 'sleepy', curious: 'thinking', wondering: 'thinking',
  amazed: 'surprised', shocked: 'surprised', joyful: 'happy', cheerful: 'happy', crying: 'crying', sad: 'sad', brave: 'determined' };
const STYLE_WORDS = { whisper: 'whisper', whispers: 'whisper', whispering: 'whisper', shout: 'shout', shouts: 'shout', shouting: 'shout', think: 'think', thinks: 'think', thinking: 'think' };

const voiceTable = () => JSON.parse(fs.readFileSync(VOICES_FILE(), 'utf8'));
// "Grey Owl" -> "grey-owl", as in config/voices.json
const idOf = who => who.trim().toLowerCase().replace(/\s+/g, '-');

// The voice for one line, like Kitsu Studio's: the speaker's voice, changed by the first mood in its brackets
// ("proud", "teasing"... when config/voices.json has that mood) and by a way of talking (whispering, shouting).
// null when that speaker has no voice in config/voices.json.
function voiceFor(who, notes, table = voiceTable()) {
  const base = table[idOf(who)];
  if (!base) return null;
  const v = { ...base }, words = String(notes || '').toLowerCase().split(/\s*,\s*/).filter(Boolean);
  const apply = k => {
    if (!k) return;
    if (k.speed) v.speed = +(v.speed * k.speed).toFixed(4);
    if (k.pitch) v.pitch = +((v.pitch || 1) * k.pitch).toFixed(4);
    if (k.gain) v.gain = (v.gain || 0) + k.gain;
    if (k.echo) v.echo = true;
  };
  const mood = words.map(w => ((table._moods || {})[w] || (base.moods || {})[w] ? w : MOOD_WORDS[w])).find(w => w && ((table._moods || {})[w] || (base.moods || {})[w]));
  if (mood) apply({ ...(table._moods || {})[mood], ...((base.moods || {})[mood] || {}) });
  const style = words.map(w => STYLE_WORDS[w.split(' ')[0]]).find(Boolean);
  if (style) apply((table._styles || {})[style]);
  delete v.moods;
  return { voice: v.voice, speed: v.speed || 1, pitch: v.pitch || 1, gain: v.gain || 0, echo: !!v.echo };
}

const python = () => [path.join(kitsuDir(), '.venv', 'Scripts', 'python.exe'), path.join(kitsuDir(), '.venv', 'bin', 'python')].find(p => fs.existsSync(p));

// lines: [{ who, notes, text }] -> the same lines with { wav, len } (seconds). Throws with a friendly message when a
// voice or the voice tool is missing.
function makeVoices(lines, cacheDir, say = () => {}) {
  const table = voiceTable();
  fs.mkdirSync(cacheDir, { recursive: true });
  const out = lines.map(l => {
    const v = voiceFor(l.who, l.notes, table);
    if (!v) throw new Error(`${l.who} has no voice in config\\voices.json (Kitsu Studio's voices). Use one of: ${Object.keys(table).filter(k => !k.startsWith('_')).join(', ')}.`);
    const key = crypto.createHash('sha1').update(JSON.stringify([l.text, v, 'lufs-22'])).digest('hex').slice(0, 16);
    return { ...l, v, wav: path.join(cacheDir, `${key}.wav`) };
  });
  const todo = [...new Map(out.filter(l => !fs.existsSync(l.wav)).map(l => [l.wav, l])).values()];
  if (todo.length) {
    say(`  making ${todo.length} voice line(s) with Kitsu Studio's voices...`);
    const jobs = todo.map(l => ({ text: l.text, voice: l.v.voice, speed: l.v.speed, out: l.wav + '.raw.wav' }));
    const jobsFile = path.join(cacheDir, 'jobs.json');
    fs.writeFileSync(jobsFile, JSON.stringify(jobs));
    let r;
    if (TTS().endsWith('.js')) r = spawnSync(process.execPath, [TTS(), MODELS(), jobsFile], { encoding: 'utf8' });
    else {
      const py = python();
      if (!py) throw new Error("Kitsu Studio's voice tool isn't installed on this computer. Run setup.bat once in the Kitsu Studio folder.");
      if (!fs.existsSync(path.join(MODELS(), 'kokoro.onnx'))) throw new Error("Kitsu Studio's voice model is missing. Run setup.bat once in the Kitsu Studio folder.");
      r = spawnSync(py, [TTS(), MODELS(), jobsFile], { encoding: 'utf8' });
    }
    if (r.status !== 0) throw new Error(`Making the voices failed: ${String(r.stderr || r.stdout).trim().slice(-400)}`);
    // each line's own sound (Ren's brighter pitch, an echo for thinking), then all at the same loudness
    for (const l of todo) {
      const raw = l.wav + '.raw.wav', sr = 24000, chain = [];
      if (l.v.pitch !== 1) chain.push(`asetrate=${Math.round(sr * l.v.pitch)},aresample=${sr},atempo=${(1 / l.v.pitch).toFixed(5)}`);
      if (l.v.echo) chain.push('aecho=0.8:0.55:70|140:0.22|0.12');
      chain.push(`loudnorm=I=${-22 + l.v.gain}:TP=-2:LRA=11`, 'aresample=48000');
      execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', chain.join(','), '-ac', '2', '-c:a', 'pcm_s16le', l.wav]);
      fs.rmSync(raw, { force: true });
    }
  }
  return out.map(l => ({ ...l, len: probe(l.wav, true).duration }));
}

module.exports = { voiceFor, makeVoices, idOf };
