# Mind Story — style guide (locked look & sound)

This is the approved look and sound of the series (first film: 레스터 레븐슨의 지혜, Oct 2026).
Every new film must keep these. Only the story, drawings, words and timings change.

## Format and pacing
- 16:9, 1920×1080, 30 fps by default; 9:16 (1080×1920) for Shorts/Reels (see below).
- `makeClock({ bpm: 72 })` → 1 bar = 3.333 s. **Length is free**: one scene per sentence, 1 bar each (2 bars for a long subtitle);
  with narration every scene lasts exactly as long as its sentence (`tools/align.js`).
- Each scene: one idea, one picture that fills the whole frame, 1–3 hand-written key words, one diagram device (arrow, loop, X, graph, cycle).
- Scenes cross-fade softly for 0.45 s after each scene start (the runner in film.js does it).
- The last 0.7 s settle into paper colour (not black).

## 9:16 (Shorts / Reels / TikTok)
- `FORMAT = U.pickFormat('9:16')` in score.js, then **re-stage every scene for 1080×1920** — never crop the 16:9 picture.
- Stack the picture vertically: key words and diagrams in the top ~65%, the person / main drawing in the middle,
  nothing important in the bottom 22% (platform UI) or the right 140 px. The subtitle sits automatically above the
  bottom 22% and wraps into two lines.
- Bigger words (key words 90–130 px), fewer elements per scene, the same palette and line weights.

## Picture
- **Full-frame drawings, no side text panel.** Every scene background is coloured edge to edge.
- **Crayon colouring**: `crayonFill` = light tint + diagonal waxy strokes (angle −0.55, gap 8–9, lw 9–12) + paper-speck grain. Things colour themselves in over 0.6–0.9 s (`fill: pr(t, t0, 0.8)`).
- **Hand-drawn lines**: `crayonLine` double-pass, dark brown ink `#4A3B33`, lw 5–7; outlines draw on with `p`. Slow 4 fps boil.
- Pastel crayon palette (`C` in film.js): sky `#AFC8DA`, warm sky `#F6C9A8`, hill `#9DBF7E`/`#7FA868`, lake `#7FB0C9`, coral `#EE8C78`, purple `#A98BC9`, teal `#6CB9A9`, yellow `#F7CF5B`, orange `#F2A15B`, pink `#F2A7B5`, red `#E46F6A`, skin `#F4CFAE`, shirt `#7FA7D6`, paper `#F7F0E1`.
- Skies are **one vertical gradient** (`vgrad`) through crayonFill — never stacked bands (they leave hard seams).
- Post: `{ paper: 0.55, vignette: 0.22, grain: 0.04 }`.
- **Hand lettering**: font Gaegu Bold (`FONT`), via `word()` — writes on left→right and pops with a small zoom (outBack 0.55→1) and a gentle breathing scale. Key words 72–150 px, colours from the palette, a cream halo behind.
- **Diagram devices**: `arrow()` (curved, head appears at the end), `loop()` (circle-highlight), red crayon X, `sparkle()`, small `birdV()`, `cloud()` bubbles, simple graphs drawn with `crayonLine` + axes arrows.
- **Camera — every scene moves, using the six approved recipes** (`camMove(ctx, t, key, recipe, { focus, to })` in film.js; `cam()` clamps so zoom ≥ 1 and the frame is always covered):

  | recipe | move | use for |
  |---|---|---|
  | `push` | slow push-in 1.0→1.1 on the focus | a person / a burden — feel the weight |
  | `pullPan` | start close (1.22) on the first element, pan and zoom out to the whole | diagrams that build left→right |
  | `follow` | 1.0→1.08 while the centre glides with the drawing | graphs, a line being drawn |
  | `reveal` | start 1.16 on a detail, open to the whole picture | landscapes, endings, titles |
  | `dive` | settle 1.12→1.0, then in the last 0.55 s dive ×3.2 into the focus | "inside" moments (heart, mind) |
  | `pullBack` | start 1.3 (already inside), open to 1.0 | always the scene right after a `dive` |

  **Mixing rules:** never the same recipe twice in a row · `dive` is always followed by `pullBack` · at most one `dive` per ~4 scenes · start a film with `push` or `pullPan`, end it with `reveal`. Write the chosen recipe in the scene table's 그림 column.
- **The little person** (`person()`): round head with dark hair cap, rounded crayon body, stick legs, closed-eye calm face. Options: `bend` (lean), `arms: down|up|hold|lap`, `face: calm|smile|tired`, `sit`, `shirt` colour. Returns `handR` and `chest` positions.

### Layout rules (learned in review)
- Keep drawn words and diagrams above y ≈ 900 — the bottom band is the subtitle's.
- Keep words ≥ 120 px from the frame edge in scenes whose camera pushes in (the zoom crops the edges).
- Don't let arrows cross a word: place the word, then route the arrow beside it.
- Mouth curves: `curve(a, b, +bend)` is a smile, negative a frown.
- Hair is a filled `hairCap`, not a line (a line reads as a unibrow).

## Subtitles
- Bottom centre, Gaegu Bold 56 px, ink colour, on a rounded cream box `rgba(251,245,232,0.88)` with a thin crayon border; fade + small rise in 0.3 s.
- One sentence per scene (`sub` in score.js SCENES), polite 해요/합니다 tone. Without narration it shows from the scene start +0.2 s to its end −0.2 s; with narration it follows the spoken sentence. Lines wider than 86% of the frame wrap into two.

## Sound (LOCKED — the user tuned this by ear; do not change unless asked)
- **Felt piano** (`softPiano` in song.js): 6 partials, dark roll-off, 35 ms felt attack, no hammer click, low-pass 1300 + 600·vel Hz.
- Chords loop Fmaj7 · Em7 · Am7 · Dm9 for any length and always end Fmaj7→Gsus · Cadd9.
- Accompaniment: **one soft note per beat** (order 0-2-1-3, vel 0.5/0.4) + a low bass note per chord. Never busy 8ths.
- Melody: few long notes, phrases A–D looping, E before the end, a long E5 last; `softPiano` vel **0.45**, 12 ms behind the beat.
- Reverb room 0.88 damp 0.45. Birds: a few far chirps (score.js `sfx.birds`).
- Wind: **no constant wind, no water.** Only short soft whooshes at each scene change and at `sfx.swish` / `sfx.drift` moments.
- **Knobs (`LEVEL_DB` in song.js, dB):** 피아노 반주 −11.4 · 멜로디 −8.1 · 잔향 −10.9 · 새소리 −0.9 · 바람 −15.2 · 내레이션 0; music dips under the narration by `DUCK` 0.5.
- Approved film as **volume numbers** (shown to the user; volume = 100 + measured dB): 새소리 72 · 피아노 반주 68 · 멜로디 67 · 잔향 58 · 바람 53 · 전체 **70** (YouTube normal = 86; quiet on purpose).
- Every `node song.js` prints this volume table (out/sound-levels.md); always show it, never dB.

## Review checklist before rendering
1. `stills` at the middle of each scene — check overlaps, clipped words, faces, seams.
2. Fix, re-render the same stills.
3. `video` → `mux` → `check` (contact sheet + loudness).
