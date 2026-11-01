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
  - To redo a frame you don't like: `make ... --redo frame 3`. The clips that start or end on that frame are redone too.
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
| `Narrator: "..."` | The storyteller: never shown or acted by Flow, read by Kitsu Studio's narrator voice, and shown in a **storybook caption box** (parchment, top left; `(right)` for top right) instead of a speech bubble. With `music: none` and `flow sound: on`, Google Flow's music and sounds play under the narrator |
| `style pictures:` | Up to 2 of your own pictures (paths next to the story file), used as references for every frame so Flow draws in the same style |
| `clip 1:` (no frames) | The clip is made from the Flow characters named in it, with **their own looks and the voices you gave them in Flow**, and no frames. Flow can't use frames and characters in the same clip, so this trades the frames' exact picture for the characters' voices. Use it with `voices: flow` and `music: none` to hear Flow's own voices and music (see `stories\test-flow-voices.txt`) |
| `Ren (proud): "I'm a snow expert."` | In a clip: something said. It becomes a speech bubble (and, with `voices: kitsu`, Ren says it), and Flow gets only how Ren feels ("proud"). The feeling also changes the voice a little, as in Kitsu Studio (proud, teasing, pouting, whispering, shouting...) |
| `Yuki (counting, at 0s): "One... two..."` | `at 0s` says when the line starts in its clip (seconds from the start of the clip). Lines without it follow one another; without voices they spread over the clip, longer lines getting more time |

**The sound:** the film's sound is made by Kitsu Studio, its music with Ren and Yuki's voices, at the same loudness as Kitsu Studio's videos. Google Flow's sound isn't used.

**The film comes in two versions:** `film.mp4` with the speech bubbles and voices, and `film-clean.mp4` without them. To change a bubble, a voice or its timing, fix the story and run `make ... --redo film`. That's free: only the joining is done again, and the clips stay as they are. With voices, the background sound of the clips gets a little quieter while someone speaks.

`voices: kitsu` uses Kitsu Studio's voice tool and settings (`config\voices.json`) without changing them, so Kitsu Studio's `setup.bat` must have been run once on this computer. Each voice line is kept in `output\_voices\`, so it's only made once.

**One Flow project for all your stories:** keep using the project that has Ren and Yuki in it, on each account. Every frame and clip is named after its story in Flow (like `the-snow-expert-frame-01-...`), so the stories never mix up. A clip on the same account picks its frames there directly. Only a clip made on the *other* account uploads them.

## Good to know

- **Each account's Chrome window must stay open, with a Flow project open.** Don't use that window while a video is being made.
- Flow Studio waits 25–70 seconds between generations, like a person would, so a 6-clip video takes a while. You can leave it running.
- Your files go in `output\` and are never put in git.
- Google changes Flow from time to time. If something stops working, send the message to Claude Code: the fix goes into `flow\lib\flow-web.js`, and a `git pull` brings it to you.
- Automated use of Flow may be against Google's terms (flow-mcp's author warns about this too). Use it on your own accounts, at your own risk.
- Characters (`characters:`) live in one Flow project. A frame that uses them must be made on the account whose open project has them: use `--account` for the frames if only one account has them. Clips don't need the characters (they start from your frames), so they can use either account.
- Tests (no Google needed): `node --test flow/tests/flow-video.test.js`
