---
name: crayon-wisdom-film
description: Make a 20-second hand-drawn pastel crayon video (손그림 크레파스 영상) that explains a book's or teacher's core wisdom in six full-frame drawn scenes with hand-written Korean words, diagram arrows, zoom-in/zoom-out camera, bottom subtitles, a soft felt-piano score, far birds and gentle wind whooshes on transitions — exactly the approved "레스터 레븐슨의 지혜" style. Use when the user asks for "크레파스 손그림 영상", "지혜 영상", "그 스타일로 영상", a new episode of this series, or invokes /crayon-wisdom-film with a topic.
---

# Crayon Wisdom Film

Builds a new episode of the user's series in the **locked style** of the approved first film
(`template/` is that exact film, working end to end). Only the story changes; the look and the sound stay.

Read `references/style-guide.md` before writing anything — it holds the palette, drawing rules, layout
rules learned in review, subtitle style and the **locked sound mix**.

## Workflow

### 1. Brief (no questions unless the topic is missing)
From the request take: the book / teacher / topic, and any key message the user names.
Defaults: 20 s, 16:9, Korean words and subtitles, same music. Ask only if no topic was given.
Do not invent quotes; express the teaching's core ideas in your own plain words. If unsure of a book's
exact Korean title, write it neutrally (e.g. "○○○의 지혜") and say so.

### 2. Story in six scenes (one per bar, 3.33 s each)
Write a 6-row plan: picture · hand-written key words · diagram device · subtitle. The proven arc:
1. **Problem** – a person and the burden (what we cling to), labelled with the key words.
2. **Mechanism** – a diagram: A → B → C with arrows, ideally a cycle back.
3. **Turn** – the practice/action shown as a picture (letting go, opening, breathing…).
4. **Insight** – a zoom into the heart of it (inside vs outside, X over the wrong answer, "이미 여기에!").
5. **Principle** – a simple hand-drawn graph or scale (one thing goes down, the other up).
6. **Rest** – a calm landscape, the person at peace, the title as hand lettering + "○○○의 지혜".

### 3. Scaffold
```bash
sh .claude/skills/crayon-wisdom-film/scripts/new-film.sh <kebab-case-topic>
```
(in the user's repo root unless they name a place). It copies the template and writes `out/chrome.sh`
(Chromium with `--no-sandbox`). Run every later command as
`cd <dir> && CHROME_PATH=$PWD/out/chrome.sh node engine/render.js …`.

### 4. Edit only the per-film parts
- **score.js**: `S` (keep six bars), `ev` (the moments things pop / draw), `markers`, `subtitles`,
  and optionally `MEL` / chord rows (same calm colour). Keep `bpm: 72`, `DURATION = 20`.
- **film.js**: only the block marked `PER-FILM PART` — the `bgs` backgrounds and the six `sceneX`
  functions + `SCENES` list. Reuse the toolkit (`crayonFill`, `crayonLine`, `shape`, `blobPts`, `rrPts`,
  `curve`, `arrow`, `word`, `loop`, `sparkle`, `cloud`, `birdV`, `person`, `hairCap`, `cam`, `vgrad`, `hillPts`,
  `FULL`, `pr`, `sm`). Do not change the toolkit, palette, fonts, subtitle or cross-fade code.
- **song.js**: do not change the instruments or the `GAIN` table. Only re-point event-tied sounds if the
  scene events changed: `birdTimes` (release + final scene) and the `swish` list (scene changes and the
  `ev` moments where words/clouds fly in).

### 5. Review, then render
```bash
node song.js                                            # out/music.wav (~-30 LUFS)
node engine/render.js stills 2.5 5.8 9.2 12.5 15.8 18.8 # one mid-scene still each → out/stills/
```
Look at every still against the layout rules in the style guide; fix and re-render until clean. Then:
```bash
node engine/render.js video     # ~2–3 min: run in the background
node engine/render.js mux       # → out/<dir>.mp4
node engine/render.js check     # contact sheet + loudness
```

### 6. Deliver
Send `out/<dir>.mp4` to the user, list the six scenes with their subtitles, and say the audio was checked
by measurement. Commit the project (the `.gitignore` keeps only the final mp4 from `out/`) and push only
if the user's session/branch instructions say so.

### Sound changes on request (no picture re-render)
If the user only wants the sound changed: edit `song.js`, run `node song.js`, then `node engine/render.js mux`
(re-uses `out/video.mp4`). Reply with the before → after levels.
