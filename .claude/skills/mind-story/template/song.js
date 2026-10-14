// THE SONG — a soft felt-piano lullaby, a few far birds, soft wind only when things move, and (optionally) a narration.
//   node song.js            → out/music.wav + a sound table in dB (also out/sound-levels.md)
//   LUFS=-24 node song.js   → same balance, everything louder (or quieter) together
//   STEMS=1 node song.js    → also writes out/stem-*.wav
const path = require('path');
const fs = require('fs');
const { SR, Bus, reverb, OnePole, rng } = require('./engine/audio/dsp');
const I = require('./engine/audio/instruments');
const MIX = require('./engine/audio/mix');
const sc = require('./score');
const { DURATION, BEAT, m } = sc;

const N = Math.ceil(DURATION * SR);
const bus = () => new Bus(N);
const piano = bus(), lead = bus(), birds = bus(), fx = bus(), verb = bus();

// ======================= SOUND KNOBS (dB) — the approved mix. "피아노 3dB 낮춰" → piano: -14.4 =======================
const LEVEL_DB = {
  piano: -11.4, // 피아노 반주 (one soft note per beat + bass)
  lead: -8.1, //   멜로디
  verb: -10.9, //  잔향 (room of the piano and the birds)
  birds: -0.9, //  새소리
  fx: -15.2, //    바람 (whooshes on scene changes and when words fly in)
  voice: 0, //     내레이션 (only when voice-timing.js has a voice)
};
const DUCK = 0.5; // how much the music dips under the narration (0 = none, 0.5 ≈ -6 dB)
// =====================================================================================================================
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---------- felt piano: warm partials, slow hammer, no hard "ting" ----------
function softPiano(midi, dur, vel = 0.6, seed = 1) {
  const f = mtof(midi);
  const ring = dur + 1.6;
  const len = Math.ceil((ring + 0.7) * SR);
  const out = new Float32Array(len);
  const B = 0.00035;
  const baseTau = 2.8 * Math.pow(261 / f, 0.35);
  const bright = 0.75 + (1 - vel) * 0.7; // softer touch = darker
  const parts = [];
  for (let k = 1; k <= 6; k++) {
    const fk = f * k * Math.sqrt(1 + B * k * k);
    if (fk > 7000) break;
    parts.push({ fk, a: Math.pow(k, -1.8) * Math.exp(-(k - 1) * bright * 0.95), tau: baseTau / (1 + 0.45 * (k - 1)), det: 1 + (k === 1 ? 0.0006 : 0.0011) });
  }
  const r = rng(seed * 31 + midi);
  const lp = new OnePole();
  const att = 0.035; // a soft felt hammer: no click, no 'ting'
  const relT = ring, relLen = 0.6;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let s = 0;
    for (const p of parts) {
      const e = Math.exp(-t / p.tau);
      s += p.a * e * (Math.sin(2 * Math.PI * p.fk * t) + 0.6 * Math.sin(2 * Math.PI * p.fk * p.det * t + 0.7));
    }
    const a = t < att ? 0.5 - 0.5 * Math.cos((Math.PI * t) / att) : 1;
    const rel = t < relT ? 1 : Math.max(0, 1 - (t - relT) / relLen);
    const thump = 0; void r;
    out[i] = lp.lp((s * a * rel + thump) * vel * 0.35, 1300 + vel * 600);
  }
  return out;
}

// arpeggio (left hand) and melody (right hand), with a little human timing
const hum = rng(77);
for (const n of sc.arp) {
  const x = softPiano(n.midi, BEAT * 1.2, n.vel * 0.75, Math.round(n.t * 100));
  const t = n.t + hum() * 0.008;
  const pan = (n.midi - 60) / 30;
  piano.addMono(x, t, 0.55, pan);
  verb.addMono(x, t, 0.32, pan);
}
for (const c of sc.chords) {
  const x = softPiano(c.bass + 12, c.t1 - c.t0, 0.55, 5);
  piano.addMono(x, c.t0, 0.45, -0.1);
  verb.addMono(x, c.t0, 0.2);
}
for (const n of sc.MEL) {
  const x = softPiano(n.midi, n.dur, 0.45, Math.round(n.t * 10) + 3);
  const t = n.t + 0.012; // melody leans just behind the beat
  lead.addMono(x, t, 0.6, 0.12);
  verb.addMono(x, t, 0.45, 0.12);
}

// ---------- birds: a few far, soft chirps (times from score.js sfx.birds) ----------
function chirp(f0, len, seed) {
  const out = new Float32Array(Math.ceil(len * SR));
  let ph = 0;
  const r = rng(seed);
  const wob = 0.15 + r() * 0.1;
  for (let i = 0; i < out.length; i++) {
    const u = i / out.length;
    const f = f0 * (1 + wob * Math.sin(Math.PI * u)) * (1 + 0.04 * Math.sin(i / SR * 2 * Math.PI * 38));
    ph += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(ph) * Math.sin(Math.PI * u) ** 2;
  }
  return out;
}
sc.sfx.birds.forEach(([t, f, pan], i) => { if (t >= DURATION) return; const c = chirp(f, 0.09 + (i % 3) * 0.025, i + 3); birds.addMono(c, t, 0.12, pan); verb.addMono(c, t, 0.06, pan); });

// ---------- wind: only soft whooshes — on every scene change and when words / clouds / things fly ----------
const swish = (t, len, gain, f0 = 300, f1 = 1600) => { if (t > 0 && t < DURATION) fx.addMono(I.noiseSweep(len, f0, f1, { q: 0.7, pink: true, shape: (x) => Math.sin(Math.PI * x) }), t, gain); };
sc.starts.slice(1).forEach((t) => swish(t - 0.35, 0.9, 0.18, 250, 1200));
for (const t of sc.sfx.swish) swish(t - 0.05, 0.45, 0.1, 500, 2000);
for (const t of sc.sfx.drift) swish(t, 1.1, 0.12, 900, 300);

// ---------- narration (voice mode) ----------
const stems = { piano, lead, birds, fx };
if (sc.VT && sc.VT.file) {
  const v = MIX.loadAudio(path.join(__dirname, sc.VT.file), { length: DURATION });
  const hp = [new OnePole(), new OnePole()];
  for (let i = 0; i < N; i++) { v.L[i] -= hp[0].lp(v.L[i], 80); v.R[i] -= hp[1].lp(v.R[i], 80); } // gentle high-pass
  const voice = bus(); voice.L.set(v.L.subarray(0, N)); voice.R.set(v.R.subarray(0, N));
  stems.voice = voice;
}
stems.verb = reverb(verb, { room: 0.88, damp: 0.45, predelay: 0.02 });
if (stems.voice) MIX.duck([stems.piano, stems.lead, stems.verb], stems.voice, { depth: DUCK, release: 0.6 });

// ---------- mix ----------
const GAIN = Object.fromEntries(Object.keys(stems).map((k) => [k, Math.pow(10, LEVEL_DB[k] / 20)]));
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 30);
MIX.fadeOut(mix, DURATION - 2.2, DURATION);
const M = MIX.master(mix, parseFloat(process.env.DRIVE || '0.6'), undefined, { lufs: process.env.LUFS ? parseFloat(process.env.LUFS) : null });
MIX.writeWav(path.join(out, 'music.wav'), mix);

// ---------- the sound table (numbers the user can steer by: "바람 3dB 낮춰") ----------
const NAMES = { piano: '피아노 반주', lead: '멜로디', verb: '잔향', birds: '새소리', fx: '바람', voice: '내레이션' };
function level(b, g) { // active RMS: only the 50 ms windows where the sound is actually playing
  const w = Math.round(0.05 * SR); let s = 0, n = 0, pk = 0;
  for (let i0 = 0; i0 + w <= b.n; i0 += w) {
    let ws = 0;
    for (let i = i0; i < i0 + w; i++) { const x = (b.L[i] + b.R[i]) * 0.5 * g; ws += x * x; pk = Math.max(pk, Math.abs(b.L[i] * g), Math.abs(b.R[i] * g)); }
    if (ws / w > 1e-6) { s += ws; n += w; } // above -60 dB
  }
  const db = (x) => (x > 1e-9 ? 20 * Math.log10(x) : -Infinity);
  return { rms: n ? db(Math.sqrt(s / n)) : -Infinity, peak: db(pk) };
}
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '없음');
const rowsOut = Object.keys(stems).map((k) => { const L = level(stems[k], GAIN[k]); return `| ${NAMES[k]} | ${LEVEL_DB[k].toFixed(1)} dB | ${f1(L.rms)} dB | ${f1(L.peak)} dB |`; });
const loud = MIX.lufs(mix);
const table = [
  `소리 크기 표 (${DURATION.toFixed(1)}초)`,
  '',
  '| 소리 | 설정값 | 들리는 크기 (평균) | 가장 큰 순간 |',
  '|---|---|---|---|',
  ...rowsOut,
  '',
  `전체 음량: ${loud.toFixed(1)} LUFS  (유튜브 기준 -14, 지금처럼 잔잔한 버전 ≈ -30)`,
  '조절 가이드: 3dB = 살짝 · 6dB = 절반 느낌 · 10dB = 많이.  예) "바람 3dB 낮춰", "전체 6dB 올려"',
].join('\n');
fs.writeFileSync(path.join(out, 'sound-levels.md'), table + '\n');
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s${M.lufs !== undefined ? `, ${M.lufs.toFixed(1)} LUFS at drive ${M.drive.toFixed(2)}` : ''})\n`);
console.log(table);
