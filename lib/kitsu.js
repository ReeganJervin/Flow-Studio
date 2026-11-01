// Where Kitsu Studio is (the Ren_Video_Creation project): Flow Studio uses its voices (config/voices.json,
// tools/tts.py, models/, .venv/) and its music and mixer (engine/), and never changes anything there.
// Found from KITSU_STUDIO_DIR, from "kitsu" in settings.json (flow-video kitsu <folder>), or next to this folder.
const fs = require('fs'), path = require('path');

const HERE = path.resolve(__dirname, '..');
const SETTINGS_FILE = process.env.KITSU_FLOW_SETTINGS || path.join(HERE, 'settings.json');
const looksLikeKitsu = dir => dir && fs.existsSync(path.join(dir, 'engine', 'story.js')) && fs.existsSync(path.join(dir, 'config', 'voices.json'));

function settings() { try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (_) { return {}; } }
function saveSettings(s) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); }

function kitsuDir() {
  // (KITSU_STUDIO_DIR=none: act as if there were no Kitsu Studio, to test how Flow Studio does without it)
  if (process.env.KITSU_STUDIO_DIR === 'none') throw new Error("Flow Studio uses Kitsu Studio's voices and music, but can't find the Kitsu Studio folder.\nTell it where it is, once:  flow-video kitsu D:\\Reegan\\kitsu-studio");
  const tries = [process.env.KITSU_STUDIO_DIR, settings().kitsu, ...['kitsu-studio', 'Ren_Video_Creation', 'ren_video_creation'].map(n => path.join(HERE, '..', n))];
  const dir = tries.find(looksLikeKitsu);
  if (!dir) throw new Error("Flow Studio uses Kitsu Studio's voices and music, but can't find the Kitsu Studio folder.\nTell it where it is, once:  flow-video kitsu D:\\Reegan\\kitsu-studio");
  return path.resolve(dir);
}

module.exports = { kitsuDir, looksLikeKitsu, settings, saveSettings, SETTINGS_FILE, HERE };
