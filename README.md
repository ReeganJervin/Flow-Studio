# Flow Studio

Make videos in **Google Flow** from a story file, by itself: Ren & Yuki Shorts, and the owner's series *Whispers of the World Tree*.

You write a story file with **frames** (free stills) and **clips** (short videos that go from one frame to the next). Then one command makes everything in Google Flow: the frames, the clips, and the finished film with the clips joined, the speech bubbles or caption boxes, and the sound.

**It runs without Claude**, so it uses none of your Claude usage. It opens a Chrome window for each Google account and clicks Flow's own buttons (`lib\flow-web.js`, adapted from [flow-mcp](https://github.com/GTAI-1/flow-mcp); see `NOTICE.md`).

**Kitsu Studio:** Flow Studio uses Kitsu Studio's voices (Ren, Yuki, the narrator) and its music, from your Kitsu Studio folder ([Ren_Video_Creation](https://github.com/ReeganJervin/Ren_Video_Creation)). It only reads and runs them; nothing in Kitsu Studio is changed.

## Setting up (once)

You need [Node.js](https://nodejs.org), Google Chrome, and Kitsu Studio set up on the same computer (its `setup.bat` run once).

1. **Get Flow Studio** next to Kitsu Studio, for example `D:\Reegan\flow-studio`:
   ```
   git clone https://github.com/ReeganJervin/Flow-Studio.git D:\Reegan\flow-studio
   ```
2. **Install its tools** (Playwright and FFmpeg): double-click `setup.bat`.
3. **Tell it where Kitsu Studio is** (found by itself when the two folders are side by side):
   ```
   flow-video.bat kitsu D:\Reegan\kitsu-studio
   ```
4. **Sign in to each Google account once.** Each account gets its own Chrome window and stays signed in:
   ```
   flow-video.bat login 1
   flow-video.bat login 2
   ```
   In each window: sign in, open (or create) a Flow project, and **leave the window open**. If your characters (Ren and Yuki, or Jack and Lunelle) are in that project, frames can use them. You can give the accounts names in `settings.json`:
   ```
   { "accounts": { "1": "Main account", "2": "Second account" } }
   ```

**Coming from Kitsu Studio's old `flow` folder?** The Google sign-ins stay as they are (they live in your user folder). Move your old `flow\output` folder into this folder as `output`, and everything you already made (frames, clips) still counts, so nothing is paid for twice.

## Making a video

```
flow-video.bat credits
flow-video.bat check stories\my-story.txt
flow-video.bat make stories\my-story.txt
```

- **`credits`**: the plan and the credits left on both accounts.
- **`check`**: reads the story and lists every frame and clip. It spends nothing.
- **`make`**, the first time: makes **only the frames**, which are free. Look at them in `output\<project>\frames\`.
  - To redo a frame you don't like: `make ... --redo frame 3`. Several at once: `--redo frame 6,7,9-12`. The clips that start or end on that frame are redone too.
- **`make`**, again: makes the **clips**, which cost credits, and then **joins them** into `output\<project>\film.mp4`.
- **`make ... --all`**: frames, clips and film in one go.

## Two accounts

Before each clip, Flow Studio reads the credits on both accounts:
- It starts on the account with the most credits.
- When that account has less left than one clip may cost (`max credits:` in the story), it **switches to the other account by itself** and carries on.
- If neither has enough, it stops and tells you. Everything already made is kept, so running the same command later carries on where it stopped. Nothing is ever paid for twice.

To use one account only: `make ... --account 2`.

## The story file

Start from `stories\_template.txt`:

```
title: The Bravest Fox
aspect: 9:16
characters: Ren, Yuki
max credits: 25
style: Cute 2D chibi storybook cartoon, ...
place: A cozy forest path at dusk, ...

frame 1: Ren and Yuki walk side by side along the path...
frame 2: Same place and framing. Ren frozen mid-step...

clip 1: frame 1 to frame 2
They walk along the path. A twig snaps. Ren freezes.
Yuki (soft, curious): "Ren... did you hear that?"
```

| Line | What it does |
|---|---|
| `title:` | The video's name. The output folder is named after it (or after `project:`, if you write one) |
| `aspect:` | `9:16` for Shorts, `16:9` for wide videos |
| `characters:` | Your characters' names in Flow. A frame that mentions one uses it as a reference |
| `style:` / `place:` | Added to every frame (and the style to every clip), so the look stays the same |
| `max credits:` | A clip is skipped, with nothing spent, if Flow asks for more than this (default 25) |
| `model:` | Optional, e.g. `Veo 3.1 - Fast`. Without it, Flow's current choice is used |
| `quality:` | `original`, or `upscaled` (1080p: free, but slower to download) |
| `voices:` | `kitsu` (**the default, always used unless you say otherwise**): Flow makes the clips without voices, and **the same Ren and Yuki voices as Kitsu Studio's episodes** (from `config\voices.json`) speak the words, with the bubbles. `none`: no voices, bubbles only. `flow`: Flow makes the voices (they change from clip to clip) |
| `music:` | **Kitsu Studio's own music** for the film, one of its moods: `happy` (the default), `calm`, `magical`, `mystery`, `adventure`, `tense`, `sad`, `bedtime`, `epic`, `heartfelt` or `none`. Inside a clip, a line `music: mystery` changes the music from that clip on. Kitsu Studio's mixer puts the voices on top: the music dips while someone speaks and fills the pauses, as in the episodes |
| `flow sound:` | `off` (the default): Google Flow's own sound (its music and little noises) is left out completely. `on`: keep it quietly under Kitsu's music |
| `bubbles:` | `on` (the default): what the characters say is shown in Kitsu-style speech bubbles on the film. `off`: no bubbles |
| `sides:` | Where each character usually stands, for the bubble's tail: `sides: Ren left, Yuki right`. One line can say otherwise: `Ren (proud, right): "..."` |
| `frame N:` | A still. Each frame also uses the frame before it as a reference, so the drawing stays consistent |
| `clip N: frame A to frame B` | A video starting on frame A and ending on frame B. The lines below it say what happens and who says what |
| `clip N: from frame A` | A video that starts on frame A, with no end frame: the camera travels on by itself. Use it when the next place looks very different (into a cave, into a town): with an end frame, Flow melts one picture into the other, so the new place seems to "fade in". The next clip then starts on its own frame |
| `Narrator: "..."` | The storyteller: never shown or acted by Flow, read by Kitsu Studio's narrator voice, and shown in a **storybook caption box** (parchment, top left; `(right)` for top right) instead of a speech bubble. With `music: none` and `flow sound: on`, Google Flow's music and sounds play under the narrator: brought up to a good level (Flow's own sound is often very quiet), and dipping a little while the narrator speaks |
| `frames:` | `follow on` (the default): each frame is the same scene a moment later than the one before, which is given to Flow as a reference (Ren & Yuki's Shorts). `new places`: each frame is a new place, drawn from its own words only, as Flow copies a reference picture into the new frame; a frame that starts with "Same place" still follows on (the World Tree) |
| `style pictures:` | Up to 2 of your own pictures (paths next to the story file), used as references for every frame so Flow draws in the same style |
| `clip 1:` (no frames) | The clip is made from the Flow characters named in it, with **their own looks and the voices you gave them in Flow**, and no frames. Flow can't use frames and characters in the same clip, so this trades the frames' exact picture for the characters' voices. Use it with `voices: flow` and `music: none` to hear Flow's own voices and music (see `stories\test-flow-voices.txt`) |
| `Ren (proud): "I'm a snow expert."` | In a clip: something said. It becomes a speech bubble (and, with `voices: kitsu`, Ren says it), and Flow gets only how Ren feels ("proud"). The feeling also changes the voice a little, as in Kitsu Studio (proud, teasing, pouting, whispering, shouting...) |
| `Yuki (counting, at 0s): "One... two..."` | `at 0s` says when the line starts in its clip (seconds from the start of the clip). Lines without it follow one another; without voices they spread over the clip, longer lines getting more time |

**The sound:** the film's sound is made by Kitsu Studio, its music with Ren and Yuki's voices, at the same loudness as Kitsu Studio's videos. Google Flow's sound isn't used.

**The film comes in two versions:** `film.mp4` with the speech bubbles and voices, and `film-clean.mp4` without them. To change a bubble, a voice or its timing, fix the story and run `make ... --redo film`. That's free: only the joining is done again, and the clips stay as they are. With voices, the background sound of the clips gets a little quieter while someone speaks.

`voices: kitsu` uses Kitsu Studio's voice tool and settings (`config\voices.json`) without changing them, so Kitsu Studio's `setup.bat` must have been run once on this computer. Each voice line is kept in `output\_voices\`, so it's only made once.

**One Flow project for all your stories:** keep using the project that has Ren and Yuki in it, on each account. Every frame and clip is named after its story in Flow (like `the-snow-expert-frame-01-...`), so the stories never mix up. A clip on the same account picks its frames there directly. Only a clip made on the *other* account uploads them.

## Manga pages (for reading, and for selling on Amazon)

A **manga story** makes manga pages instead of a video. The panels are pictures made in Google Flow, which are **free**, like the frames. A panel can also be a frame you already made for the video. Flow Studio lays out the pages itself:
- slanted panel borders, like a manga page
- the same parchment caption boxes as the films, with your **exact words** (AI pictures often misspell words)
- speech bubbles
- print size, plus **one PDF** ready for Amazon KDP

Start from `stories\world-tree\manga-chapter-01.txt`:

```
title: Whispers of the World Tree - Chapter 1
size: 6x9
frames from: 01-world-intro.txt
style: Breathtaking Japanese fantasy anime art...

page 1: 1 tall, 1, 1, 1, 2 tall
panel 1: frame 1
Caption: "Beyond the lands known to ordinary travelers..."
panel 2: Inside the ancient forest: enormous mossy trees...
Caption (right): "...there lies a forest older than the memories of its people."
```

| Line | What it does |
|---|---|
| `size:` | The book's size in inches, one of Amazon's: `5x8`, `5.5x8.5`, `6x9` (the default), `7x10`, `8.5x11`. The pages are made at 300 dpi (6x9 is 1800 x 2700 pixels), with a 0.4 inch margin all round, so no "bleed" is needed |
| `frames from:` | A video story next to this file. `panel 3: frame 2` then uses that story's frame 2, so nothing is made twice |
| `quality:` | `upscaled` (the default: bigger pictures from Flow, sharper in print) or `original` |
| `slant:` | `on` (the default): slanted panel borders, like a manga page. `off`: straight |
| `page 1: 1 tall, 2, 1` | A page, and its rows from top to bottom: how many panels side by side (1 to 4), and `tall` or `short` for a taller or shorter row. `page 1:` alone: one panel per row |
| `panel 3: ...` | A panel: what its picture shows (made in Flow), or `frame 2` (a frame of the `frames from` story). Panels are numbered through the whole chapter |
| `Caption: "..."` | A parchment caption box. `(right)`, `(bottom)` or `(bottom right)` says where. The first one in a panel goes top left, the next bottom right. `Narrator:` works too |
| `Jack (happy, left): "..."` | A speech bubble, its tail toward the left (or right) |
| `Title: "..."` | Big title letters across the panel, for a title page: at the bottom, or `(top)` |
| `focus: top` | Which part of the picture to keep when it is cut to the panel's shape: `top`, `middle` (the default) or `bottom` |

```
flow-video.bat check stories\world-tree\manga-chapter-01.txt
flow-video.bat make stories\world-tree\manga-chapter-01.txt --account 2
```

- **`make`** makes the panels that aren't made yet (free), then the pages: `output\<project>\pages\page-01.png`... and the book `output\<project>\<project>.pdf`.
- **A panel you don't like:** `make ... --redo panel 3` (free; several: `--redo panel 3,5,8-10`). A panel is drawn from its own words only. A panel that starts with "Same place" is the panel before a moment later.
- **Changed a caption, the layout or a focus?** `make ... --redo pages`: only the pages are laid out again. Free, and nothing is made in Flow.
- **Before selling on Amazon KDP:**
  - A paperback needs at least 24 pages, and a cover, which is made separately.
  - These pages are in colour: choose colour printing, which costs more per book.
  - Amazon asks whether the pictures are AI-made: answer yes.
  - Check Google's terms for selling pictures made in Flow.



- **Each account's Chrome window must stay open, with a Flow project open.** Don't use that window while a video is being made.
- Flow Studio waits 25–70 seconds between generations, like a person would, so a 6-clip video takes a while. You can leave it running.
- Your files go in `output\` and are never put in git.
- Google changes Flow from time to time. If something stops working, send the message to Claude Code: the fix goes into `lib\flow-web.js`, and a `git pull` brings it to you.
- Automated use of Flow may be against Google's terms (flow-mcp's author warns about this too). Use it on your own accounts, at your own risk.
- Characters (`characters:`) live in one Flow project. A frame that uses them must be made on the account whose open project has them: use `--account` for the frames if only one account has them. Clips don't need the characters (they start from your frames), so they can use either account.
- Tests (no Google needed): `npm test`. The voice and music tests need Kitsu Studio next to this folder; without it they are skipped.
