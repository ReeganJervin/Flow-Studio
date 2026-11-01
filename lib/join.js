// Joins clips into one film with FFmpeg (ffmpeg-static and ffprobe-static, installed by setup.bat).
// Every clip is scaled to the first clip's size; a clip without sound gets silence, so the sound stays in step.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const tool = (env, pkg, pick) => process.env[env] || (() => { try { return pick(require(pkg)); } catch (_) { return pkg.split('-')[0]; } })();
const FFMPEG = tool('KITSU_FLOW_FFMPEG', 'ffmpeg-static', m => m);
const FFPROBE = tool('KITSU_FLOW_FFPROBE', 'ffprobe-static', m => m.path);

// a clip's size, length and whether it has sound (audioOnly: a voice line, which has no picture)
function probe(file, audioOnly = false) {
  const out = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-show_entries', 'format=duration', '-of', 'json', file], { encoding: 'utf8' }));
  if (audioOnly) return { duration: Number(out.format.duration) };
  const v = out.streams.find(s => s.codec_type === 'video');
  if (!v) throw new Error(`${path.basename(file)} has no picture in it.`);
  return { w: v.width, h: v.height, audio: out.streams.some(s => s.codec_type === 'audio'), duration: Number(out.format.duration) };
}

function joinClips(clips, out) {
  if (!clips.length) throw new Error('There are no clips to join.');
  const info = clips.map(c => probe(c)), { w, h } = info[0];
  const parts = info.map((c, i) => `[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}];` +
    (c.audio ? `[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}];` : `anullsrc=r=48000:cl=stereo,atrim=duration=${c.duration.toFixed(3)}[a${i}];`));
  const graph = parts.join('') + info.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${info.length}:v=1:a=1[v][a]`;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...clips.flatMap(c => ['-i', c]), '-filter_complex', graph, '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) { throw new Error(`FFmpeg couldn't join the clips: ${String(e.stderr || e.message).slice(-400)}`); }
  return { file: out, duration: info.reduce((s, c) => s + c.duration, 0) };
}

// how loud a file's sound is: { i: loudness in LUFS, tp: highest peak in dB }, or null when it is silent
function loudness(file) {
  const r = require('child_process').spawnSync(FFMPEG, ['-hide_banner', '-i', file, '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  try {
    const m = JSON.parse(r.stderr.slice(r.stderr.lastIndexOf('{'), r.stderr.lastIndexOf('}') + 1)), i = parseFloat(m.input_i), tp = parseFloat(m.input_tp);
    return isFinite(i) && i > -70 ? { i, tp } : null;
  } catch (_) { return null; }
}

module.exports = { joinClips, probe, loudness, FFMPEG };
