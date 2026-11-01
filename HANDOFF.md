# Flow Studio: Handoff

> **For Claude Code.** Read this first in every new session, then `README.md`.
> **Owner:** not a programmer, on Windows. They review every step from videos, pictures and reports. Keep messages short, simple and friendly.

## What this is

Flow Studio makes videos in **Google Flow** from a story file of frames (free stills) and clips (frame to frame), with no AI assistant in the loop, so it costs no Claude usage. It drives Flow's web page itself in a Chrome window per Google account (`lib/flow-web.js`, adapted from [flow-mcp](https://github.com/GTAI-1/flow-mcp), ISC; credit in `NOTICE.md`). It began as the `flow\` folder of Kitsu Studio ([Ren_Video_Creation](https://github.com/ReeganJervin/Ren_Video_Creation)) and moved here on 2026-11-01 at the owner's request, to keep the two projects apart.

| Part | Files |
|---|---|
| The command | `flow-video.js` behind `flow-video.bat` (`kitsu`, `login`, `credits`, `check`, `make`) |
| Story files | `lib/story.js` (settings, frames, clips, said lines, the narrator) |
| Driving Google Flow | `lib/flow-web.js` (sign-in, credits, one image or frames-to-video clip, download) |
| Joining, bubbles, sound | `lib/join.js` (FFmpeg), `lib/bubbles.js` (speech bubbles; parchment caption boxes for `Narrator`), `lib/voices.js` and `lib/soundtrack.js` (Kitsu Studio's voices and music) |
| Kitsu Studio's folder | `lib/kitsu.js` (`KITSU_STUDIO_DIR`, `"kitsu"` in settings.json, or a sibling folder) |
| Tests | `tests/flow-video.test.js` (`npm test`; a pretend Flow, real FFmpeg). The 5 tests that make films with Kitsu Studio's voices and music skip when Kitsu Studio isn't next to this folder (as in a chat with only this repository); `KITSU_STUDIO_DIR=none` forces that |

## Rules

- **Voices (owner's rule, 2026-10-31):** Ren and Yuki always have the same voices everywhere: the ones in Kitsu Studio's `config/voices.json`. Flow Studio reads them from there (`voices: kitsu`). Stories may instead keep Google Flow's own voices and music (`voices: flow`, `music: none`), which the owner chose for many Shorts.
- **Kitsu Studio is only used, never changed:** its voice tool and settings, its story compiler, page and audio (for the music), run and read from its folder.
- **Family show** for Ren & Yuki: cute, never scary, no fighting (Kitsu Studio's rules R11/R15).
- Flow can take a start/end frame **or** characters on a clip, never both; characters' Flow voices only come with characters (clips with no frames, `clip 1:`).
- Never spend credits to test: frames are free; `--redo film` is free; clips cost credits.
- Flow's page changes from time to time: fix `lib/flow-web.js` from the messages the owner pastes. It can only be tried on the owner's PC.

## Status (2026-11-01)

- Ren & Yuki Shorts: many stories in `stories/` (most with Flow's own sound and speech bubbles).
- **Whispers of the World Tree** (the owner's own series: winged elves Jack and Lunelle, a World Tree with four levels, a Japanese fantasy anime look): `stories/world-tree/`. The 2-clip test worked well (winged elves, caption boxes, narrator). Its two open points, decided by the owner on 2026-11-01:
  - The town "fading in" between two frames that differ too much: fixed with start-frame-only clips (`clip 3: from frame 3`). Flow travels on by itself instead of melting into a different end frame. In `01-world-intro.txt`, clips 3 to 11 use it; clips 1, 2 and 12 keep both frames. Clip 2 of the test was changed too (to compare: `--redo clip 2`, about 15 credits).
  - Music: **Flow's own sound for now** (`music: none`, `flow sound: on`), no Kitsu music. It was very quiet, so with no Kitsu music it is now brought to a proper level (-21 LUFS under a narrator, -16 alone) and dips about 5 dB while the narrator speaks (`lib/bubbles.js`).
  - Next: the owner makes the 13 frames of `01-world-intro.txt` (free), then the 12 clips (at most 180 credits).
