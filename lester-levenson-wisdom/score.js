// THE SCORE — 레스터 레븐슨의 지혜, 20초 손그림 영상.
// One timeline for the piano, the nature bed and every drawing. 72 BPM: 1 bar = 3.33s, one scene per bar.
(function () {
  const node = typeof require !== 'undefined';
  const U = node ? require('./engine/util') : globalThis.U;
  const MU = node ? require('./engine/music') : globalThis.MUSIC;
  const { m, makeClock, makeChords } = MU;

  const FPS = 30;
  const FORMAT = U.pickFormat('16:9');
  const [W, H] = U.formatSize(FORMAT);
  const SAFE = U.safeArea(W, H);
  const WIDE = W / H > 1.2;
  const clock = makeClock({ bpm: 72, offset: 0 }); // 1 beat = 0.833s, 1 bar = 3.333s
  const { T, BEAT } = clock;
  const DURATION = 20;

  // ---------- six scenes, one per bar ----------
  const S = {
    want: [T(0), T(1)], // 원함의 무게
    lack: [T(1), T(2)], // 원함 → 부족함 → 괴로움
    release: [T(2), T(3)], // 놓아버리기
    within: [T(3), T(4)], // 행복은 이미 안에
    graph: [T(4), T(5)], // 원함 ↓ 평화 ↑
    free: [T(5), DURATION], // 자유
  };

  // ---------- harmony: soft, open voicings ----------
  const { chords, chordAt } = makeChords(clock, {
    Fmaj7: { notes: ['F3', 'A3', 'C4', 'E4'], bass: 'F2' },
    Em7: { notes: ['E3', 'G3', 'B3', 'D4'], bass: 'E2' },
    Am7: { notes: ['A3', 'C4', 'E4', 'G4'], bass: 'A2' },
    Dm9: { notes: ['D3', 'F3', 'A3', 'E4'], bass: 'D2' },
    Gsus: { notes: ['G3', 'C4', 'D4', 'F4'], bass: 'G2' },
    Cadd9: { notes: ['C3', 'G3', 'D4', 'E4'], bass: 'C2' },
  }, [
    [0, 0, 4, 'Fmaj7'], [1, 0, 4, 'Em7'], [2, 0, 4, 'Am7'], [3, 0, 4, 'Dm9'],
    [4, 0, 2, 'Fmaj7'], [4, 2, 2, 'Gsus'], [5, 0, 4, 'Cadd9'],
  ]);

  // gentle melody on top: few, long notes [note, bar, beat, beats]
  const MEL = [
    ['E5', 0, 0, 1.5], ['G5', 0, 1.5, 0.5], ['A5', 0, 2, 2],
    ['G5', 1, 0, 1.5], ['D5', 1, 2, 2],
    ['E5', 2, 0, 1], ['C5', 2, 1, 1], ['E5', 2, 2, 2],
    ['F5', 3, 0, 1.5], ['E5', 3, 1.5, 0.5], ['D5', 3, 2, 2],
    ['C5', 4, 0, 1], ['A4', 4, 1, 1], ['D5', 4, 2, 2],
    ['E5', 5, 0, 4],
  ].map(([n, bar, beat, d]) => ({ t: T(bar, beat), dur: d * BEAT, midi: m(n) }));

  // broken-chord arpeggio: one soft note per beat
  const arp = [];
  for (const c of chords) {
    const notes = c.notes;
    const order = [0, 2, 1, 3];
    const steps = Math.round((c.t1 - c.t0) / BEAT); // calm quarter notes, not busy 8ths
    for (let s = 0; s < steps; s++) arp.push({ t: c.t0 + s * BEAT, midi: notes[order[s % 4]], vel: s % 2 ? 0.4 : 0.5 });
  }

  // ---------- picture events (all inside their scene) ----------
  const ev = {
    // scene 1: the three wants pop next to the heavy sack
    wants: [T(0, 0.9), T(0, 1.5), T(0, 2.1)],
    // scene 2: the diagram draws itself node by node
    lackNodes: [T(1, 0.2), T(1, 1.2), T(1, 2.2)],
    // scene 3: three balloons let go, one per beat
    letGo: [T(2, 0.6), T(2, 1.4), T(2, 2.2)],
    // scene 4: the inner sun lights
    sunOn: T(3, 0.5),
    // scene 5: the two lines draw
    graphDraw: T(4, 0.3),
    // scene 6: title
    title: T(5, 0.6),
  };

  const markers = { want: 0.1, lack: T(1), release: T(2), within: T(3), graph: T(4), free: T(5), title: ev.title };

  // ---------- bottom subtitles ----------
  const subtitles = [
    { t: 0.35, end: T(1) - 0.2, text: "우리는 늘 무언가를 '원하며' 살아갑니다" },
    { t: T(1) + 0.2, end: T(2) - 0.2, text: "원함은 '지금 부족하다'는 느낌을 만들죠" },
    { t: T(2) + 0.2, end: T(3) - 0.2, text: '붙잡지 말고, 그냥 놓아 보세요' },
    { t: T(3) + 0.2, end: T(4) - 0.2, text: '행복은 밖이 아니라, 이미 내 안에 있습니다' },
    { t: T(4) + 0.2, end: T(5) - 0.2, text: '원함을 내려놓을수록, 평화는 커집니다' },
    { t: T(5) + 0.3, end: DURATION - 0.4, text: '지금 이 순간, 그저 내려놓으세요' },
  ];

  const SCORE = { FPS, FORMAT, W, H, SAFE, WIDE, DURATION, clock, T, BEAT, S, m, chords, chordAt, MEL, arp, ev, markers, subtitles };
  if (node) module.exports = SCORE; else globalThis.SCORE = SCORE;
})();
