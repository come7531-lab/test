# Crayon Wisdom Film — style guide (locked look & sound)

This is the approved look and sound of the series (first film: 레스터 레븐슨의 지혜, Oct 2026).
Every new film must keep these. Only the story, drawings, words and timings change.

## Format and pacing
- 16:9, 1920×1080, 30 fps, **20 s**. (9:16 on request: re-stage the scenes, never crop.)
- `makeClock({ bpm: 72 })` → 1 bar = 3.333 s. **Six scenes, one per bar**: `T(0)…T(5)`, last scene runs to 20 s.
- Each scene: one idea, one picture that fills the whole frame, 1–3 hand-written key words, one diagram device (arrow, loop, X, graph, cycle).
- Scenes cross-fade softly for 0.45 s after each bar line (the runner in film.js does it).
- The last 0.7 s settle into paper colour (not black).

## Picture
- **Full-frame drawings, no side text panel.** Every scene background is coloured edge to edge.
- **Crayon colouring**: `crayonFill` = light tint + diagonal waxy strokes (angle −0.55, gap 8–9, lw 9–12) + paper-speck grain. Things colour themselves in over 0.6–0.9 s (`fill: pr(t, t0, 0.8)`).
- **Hand-drawn lines**: `crayonLine` double-pass, dark brown ink `#4A3B33`, lw 5–7; outlines draw on with `p`. Slow 4 fps boil.
- Pastel crayon palette (`C` in film.js): sky `#AFC8DA`, warm sky `#F6C9A8`, hill `#9DBF7E`/`#7FA868`, lake `#7FB0C9`, coral `#EE8C78`, purple `#A98BC9`, teal `#6CB9A9`, yellow `#F7CF5B`, orange `#F2A15B`, pink `#F2A7B5`, red `#E46F6A`, skin `#F4CFAE`, shirt `#7FA7D6`, paper `#F7F0E1`.
- Skies are **one vertical gradient** (`vgrad`) through crayonFill — never stacked bands (they leave hard seams).
- Post: `{ paper: 0.55, vignette: 0.22, grain: 0.04 }`.
- **Hand lettering**: font Gaegu Bold (`FONT`), via `word()` — writes on left→right and pops with a small zoom (outBack 0.55→1) and a gentle breathing scale. Key words 72–150 px, colours from the palette, a cream halo behind.
- **Diagram devices**: `arrow()` (curved, head appears at the end), `loop()` (circle-highlight), red crayon X, `sparkle()`, small `birdV()`, `cloud()` bubbles, simple graphs drawn with `crayonLine` + axes arrows.
- **Camera**: every scene moves — slow push-in (1.0→1.1) or zoom-out (1.15–1.3→1.0) with a pan; `cam()` clamps so zoom ≥ 1 and the frame is always covered. One scene may dive into the next (zoom to ×3 into a detail, next scene starts zoomed in).
- **The little person** (`person()`): round head with dark hair cap, rounded crayon body, stick legs, closed-eye calm face. Options: `bend` (lean), `arms: down|up|hold|lap`, `face: calm|smile|tired`, `sit`, `shirt` colour. Returns `handR` and `chest` positions.

### Layout rules (learned in review)
- Keep drawn words and diagrams above y ≈ 900 — the bottom band is the subtitle's.
- Keep words ≥ 120 px from the frame edge in scenes whose camera pushes in (the zoom crops the edges).
- Don't let arrows cross a word: place the word, then route the arrow beside it.
- Mouth curves: `curve(a, b, +bend)` is a smile, negative a frown.
- Hair is a filled `hairCap`, not a line (a line reads as a unibrow).

## Subtitles
- Bottom centre, Gaegu Bold 56 px, ink colour, on a rounded cream box `rgba(251,245,232,0.88)` with a thin crayon border; fade + small rise in 0.3 s.
- One short sentence per scene (≈ 15–22 Korean characters), polite 해요/합니다 tone, `S.subtitles` in score.js with `t: T(n)+0.2, end: T(n+1)-0.2`.

## Sound (LOCKED — the user tuned this by ear; do not change unless asked)
- **Felt piano** (`softPiano` in song.js): 6 partials, dark roll-off, 35 ms felt attack, no hammer click, low-pass 1300 + 600·vel Hz.
- Chords (one per bar): Fmaj7 · Em7 · Am7 · Dm9 · Fmaj7→Gsus · Cadd9. You may write a new progression in the same calm major-7/9 colour.
- Accompaniment: **one soft note per beat** (quarter notes, order 0-2-1-3, vel 0.5/0.4) + a low bass note per chord. Never busy 8ths.
- Melody: few long notes (E5–A5 range), `softPiano` vel **0.45**, 12 ms behind the beat.
- Reverb room 0.88 damp 0.45.
- Birds: a few far chirps (gain 0.12 each) in the "release" moment and the final scene.
- Wind: **no constant wind, no water/brook.** Only short soft whooshes (`swish`) at each scene change and when words/clouds/balloons fly in.
- Mix GAIN: `piano 0.268, lead 0.394, verb 0.284, birds 0.9, fx 0.174, nature 0`. Master drive 0.6, no LUFS target → ≈ −30 LUFS. If the user wants it louder for uploading, raise everything together with `LUFS=-24 node song.js` (keeps the balance).

## Review checklist before rendering
1. `stills` at the middle of each scene (≈ T(n)+2.5) — check overlaps, clipped words, faces, seams.
2. Fix, re-render the same stills.
3. `video` → `mux` → `check` (contact sheet + loudness).
