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
| Manga pages | `lib/manga.js` (manga story files with `page N:`/`panel N:`; panels made in Flow as free images or taken from a video story's frames with `frames from:`; pages laid out at 300 dpi for Amazon KDP, slanted borders, parchment captions, bubbles; one PDF). `check` and `make` notice a manga story by itself |
| Tests | `tests/flow-video.test.js` (`npm test`; a pretend Flow, real FFmpeg). The 5 tests that make films with Kitsu Studio's voices and music skip when Kitsu Studio isn't next to this folder (as in a chat with only this repository); `KITSU_STUDIO_DIR=none` forces that |

## Rules

- **Branches (owner's rule, 2026-11-01): commit and push everything to `Improvment`, and never merge anything into `main`.** No pull requests into `main` either. If a session is given another branch to work on, push the same commits to `Improvment` too.
- **Both series go on (owner, 2026-11-01):** Ren & Yuki Shorts (`stories/`) and Whispers of the World Tree (`stories/world-tree/`). A change for one must not break the other.
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
  - `01-world-intro.txt` corrected (2026-11-01, from the owner's two example manga pages): `style:` and `place:` now only hold the drawing style and the world (they go into every frame, and used to ask for a blue sky, lanterns, floating islands and towns in the cave and at sunset); the sky and light are in each frame; page 1's own words ("...there lies a forest..."). Pages 1 and 2 have 6 captions each; the clips keep 2 shorter lines each, to fit 10 s.
  - Frames copied the frame before (2026-11-01, the owner's 10 frames): every frame had the previous frame as a reference and "the same scene a moment later", so new places kept the cave, the stag, the market (frames 6, 7, 9, 10, 11, 12 wrong; 3, 5, 8, 13 right). Fixed with `frames: new places` (World Tree stories; Ren & Yuki keep the default `follow on`), and "World Tree" taken out of `place:`. Redo: `--redo frame 6,7,9-12` (free).
  - Next: the owner makes the 13 frames of `01-world-intro.txt` (free), then the 12 clips (at most 180 credits).
- **Manga pages** (owner, 2026-11-01: to read and to sell on **Amazon KDP**, **World Tree first**): built, not yet tried on the owner's PC (Flow's picture sizes for print, the "upscaled" download for pictures). The two pages the owner showed were **examples of the look, not made in Flow**. `stories/world-tree/manga-chapter-01.txt` is chapter 1, made in Flow from page 1: 9 pages, 38 panels (12 are frames of `01-world-intro.txt`, 26 are new free pictures). Pages 1 and 2 use the words of the examples; from page 3 on, the narrator's words of the video. Next: the owner checks the words, the four worlds' looks (page 5: High World, Middle World, Lower World, Shrouded Wilds, guessed from the video), a cover, and at least 24 pages for a paperback.
