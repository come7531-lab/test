// THE SCORE — one timeline for the piano, the sounds, the drawings and the subtitles.
// The example is the approved first film (레스터 레븐슨의 지혜). For a new film edit only the PER-FILM block.
//
// Length is free: it follows the scenes.
//   * no narration  → each scene lasts `bars` bars (1 bar = 3.33 s at 72 BPM; default 1).
//   * narration     → `node tools/align.js voice.mp3 script.txt` writes voice-timing.js; scene i then lasts
//                     exactly as long as sentence i, and the film ends 1.8 s after the voice.
(function () {
  const node = typeof require !== 'undefined';
  const U = node ? require('./engine/util') : globalThis.U;
  const MU = node ? require('./engine/music') : globalThis.MUSIC;
  const { m, makeClock, makeChords } = MU;
  let VT = null; // narration timing (voice-timing.js), or null
  if (node) { try { VT = require('./voice-timing.js'); } catch (e) { VT = null; } } else VT = globalThis.VOICE_TIMING || null;

  const FPS = 30;
  const FORMAT = U.pickFormat('16:9'); // '9:16' for Shorts/Reels: re-stage every scene for 1080×1920
  const [W, H] = U.formatSize(FORMAT);
  const SAFE = U.safeArea(W, H);
  const WIDE = W / H > 1.2;
  const clock = makeClock({ bpm: 72, offset: 0 }); // LOCKED tempo
  const { T, BEAT } = clock;
  const BAR = 4 * BEAT;

  // =============================== PER-FILM: the scenes ===============================
  // key: used by film.js (S.S[key]) · sub: the bottom subtitle · bars: length without narration (default 1)
  const SCENES = [
    { key: 'want', sub: "우리는 늘 무언가를 '원하며' 살아갑니다" },
    { key: 'lack', sub: "원함은 '지금 부족하다'는 느낌을 만들죠" },
    { key: 'release', sub: '붙잡지 말고, 그냥 놓아 보세요' },
    { key: 'within', sub: '행복은 밖이 아니라, 이미 내 안에 있습니다' },
    { key: 'graph', sub: '원함을 내려놓을수록, 평화는 커집니다' },
    { key: 'free', sub: '지금 이 순간, 그저 내려놓으세요' },
  ];
  // ====================================================================================

  // ---------- scene times ----------
  const starts = [], ends = [];
  if (VT && VT.lines && VT.lines.length) {
    if (VT.lines.length !== SCENES.length) throw new Error(`voice-timing has ${VT.lines.length} sentences but SCENES has ${SCENES.length}`);
    VT.lines.forEach((l, i) => { starts.push(i === 0 ? 0 : l.t - 0.15); });
    for (let i = 0; i < SCENES.length; i++) ends.push(i + 1 < SCENES.length ? starts[i + 1] : VT.lines[i].end + 1.8);
  } else {
    let b = 0;
    for (const sc of SCENES) { starts.push(T(b)); b += sc.bars || 1; ends.push(T(b)); }
  }
  const DURATION = +ends[ends.length - 1].toFixed(3);
  const S = {};
  SCENES.forEach((sc, i) => { S[sc.key] = [starts[i], ends[i]]; });
  // at(i, beats): a moment inside scene i, `beats` beats after it starts (kept inside the scene)
  const at = (i, beats = 0) => Math.min(starts[i] + beats * BEAT, ends[i] - 0.05);

  // ---------- harmony (LOCKED colour): loops for any length, always ends Fmaj7·Gsus → Cadd9 ----------
  const NB = Math.max(2, Math.ceil(DURATION / BAR - 1e-6));
  const LOOP = ['Fmaj7', 'Em7', 'Am7', 'Dm9'];
  const rows = [];
  for (let b = 0; b < NB - 2; b++) rows.push([b, 0, 4, LOOP[b % 4]]);
  rows.push([NB - 2, 0, 2, 'Fmaj7'], [NB - 2, 2, 2, 'Gsus'], [NB - 1, 0, 4, 'Cadd9']);
  const { chords, chordAt } = makeChords(clock, {
    Fmaj7: { notes: ['F3', 'A3', 'C4', 'E4'], bass: 'F2' },
    Em7: { notes: ['E3', 'G3', 'B3', 'D4'], bass: 'E2' },
    Am7: { notes: ['A3', 'C4', 'E4', 'G4'], bass: 'A2' },
    Dm9: { notes: ['D3', 'F3', 'A3', 'E4'], bass: 'D2' },
    Gsus: { notes: ['G3', 'C4', 'D4', 'F4'], bass: 'G2' },
    Cadd9: { notes: ['C3', 'G3', 'D4', 'E4'], bass: 'C2' },
  }, rows);

  // gentle melody: few long notes. Phrases A–D loop over the middle bars; E before the end; END last.
  const PH = {
    A: [['E5', 0, 1.5], ['G5', 1.5, 0.5], ['A5', 2, 2]],
    B: [['G5', 0, 1.5], ['D5', 2, 2]],
    C: [['E5', 0, 1], ['C5', 1, 1], ['E5', 2, 2]],
    D: [['F5', 0, 1.5], ['E5', 1.5, 0.5], ['D5', 2, 2]],
    E: [['C5', 0, 1], ['A4', 1, 1], ['D5', 2, 2]],
    END: [['E5', 0, 4]],
  };
  const MEL = [];
  for (let b = 0; b < NB; b++) {
    const ph = b === NB - 1 ? 'END' : b === NB - 2 ? 'E' : 'ABCD'[b % 4];
    for (const [n, beat, d] of PH[ph]) MEL.push({ t: T(b, beat), dur: d * BEAT, midi: m(n) });
  }

  // accompaniment (LOCKED): one soft note per beat + the chord's bass note
  const arp = [];
  for (const c of chords) {
    const order = [0, 2, 1, 3];
    const steps = Math.round((c.t1 - c.t0) / BEAT);
    for (let s = 0; s < steps; s++) arp.push({ t: c.t0 + s * BEAT, midi: c.notes[order[s % 4]], vel: s % 2 ? 0.4 : 0.5 });
  }

  // =============================== PER-FILM: moments inside scenes ===============================
  // at(sceneIndex, beats). These drive the drawings AND the sounds (swishes, birds) in song.js.
  const ev = {
    wants: [at(0, 0.9), at(0, 1.5), at(0, 2.1)], // scene 1: the three wants pop
    lackNodes: [at(1, 0.2), at(1, 1.2), at(1, 2.2)], // scene 2: the diagram draws node by node
    letGo: [at(2, 0.6), at(2, 1.4), at(2, 2.2)], // scene 3: balloons let go
    sunOn: at(3, 0.5), // scene 4: the inner sun lights
    graphDraw: at(4, 0.3), // scene 5: the lines draw
    title: at(5, 0.6), // scene 6: the title
  };
  // sounds tied to the pictures
  const sfx = {
    swish: [...ev.wants, ...ev.lackNodes, ev.title], // a short soft whoosh when words / clouds fly in
    drift: ev.letGo, // a slower falling whoosh when something floats away
    birds: [[at(2, 2.8), 3600, 0.6], [at(2, 3.1), 4100, 0.6], [at(5, 0.9), 3300, -0.5], [at(5, 1.15), 3800, -0.5], [at(5, 1.35), 3500, -0.5], [at(5, 2.7), 4200, 0.4], [at(5, 2.9), 3900, 0.4]],
  };
  // ================================================================================================

  const markers = Object.fromEntries(SCENES.map((sc, i) => [sc.key, starts[i] + 0.1]));

  // subtitles: the narration's own sentence times when there is a voice, else the scene with a small margin
  const subtitles = SCENES.map((sc, i) => VT && VT.lines
    ? { t: VT.lines[i].t, end: Math.min(VT.lines[i].end + 0.6, ends[i] - 0.1), text: sc.sub }
    : { t: starts[i] + (i === 0 ? 0.35 : 0.2), end: ends[i] - (i === SCENES.length - 1 ? 0.4 : 0.2), text: sc.sub });

  const SCORE = { FPS, FORMAT, W, H, SAFE, WIDE, DURATION, clock, T, BEAT, BAR, S, SCENES, starts, ends, at, m, chords, chordAt, MEL, arp, ev, sfx, markers, subtitles, VT };
  if (node) module.exports = SCORE; else globalThis.SCORE = SCORE;
})();
