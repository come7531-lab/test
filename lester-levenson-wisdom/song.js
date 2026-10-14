// THE SONG — a soft felt-piano lullaby over a quiet stream, wind and a few far birds.
//   node song.js            (STEMS=1 also writes out/stem-*.wav, LUFS=-16 sets loudness)
const path = require('path');
const { SR, Bus, reverb, Pink, SVF, OnePole, rng } = require('./engine/audio/dsp');
const I = require('./engine/audio/instruments');
const MIX = require('./engine/audio/mix');
const sc = require('./score');
const { DURATION, BEAT, m } = sc;

const N = Math.ceil(DURATION * SR);
const bus = () => new Bus(N);
const piano = bus(), lead = bus(), nature = bus(), birds = bus(), fx = bus(), verb = bus();
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
  const x = softPiano(n.midi, n.dur, 0.62, Math.round(n.t * 10) + 3);
  const t = n.t + 0.012; // melody leans just behind the beat
  lead.addMono(x, t, 0.6, 0.12);
  verb.addMono(x, t, 0.45, 0.12);
}

// ---------- nature bed: a gentle babbling brook (bubbles, not hiss) ----------
{
  const r = rng(5), pk = new Pink(5), lp = new SVF();
  const L = new Float32Array(N), R = new Float32Array(N);
  // the brook: many tiny water bubbles, each a short rising sine (Minnaert bubble)
  const RATE = 55; // bubbles per second
  for (let tb = 0; tb < DURATION; tb += -Math.log(1 - r() * 0.999) / RATE) {
    const f0 = 350 * Math.pow(4, r()), dur = 0.025 + r() * 0.05, amp = 0.15 + r() * 0.85;
    const pan = r() * 1.6 - 0.8, n0 = Math.floor(tb * SR), n = Math.floor(dur * SR);
    let ph = 0;
    for (let i = 0; i < n && n0 + i < N; i++) {
      const u = i / n;
      ph += (2 * Math.PI * f0 * (1 + 0.9 * u)) / SR;
      const v = Math.sin(ph) * Math.exp(-u * 4) * Math.min(1, i / 40) * amp;
      L[n0 + i] += v * (1 - pan) * 0.5; R[n0 + i] += v * (1 + pan) * 0.5;
    }
  }
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const rumble = lp.lp(pk.next(), 380, 0.6) * 0.5; // soft low water body, no hiss
    const fadeIn = Math.min(1, t / 1.2);
    L[i] = (L[i] * 0.22 + rumble) * fadeIn;
    R[i] = (R[i] * 0.22 + rumble) * fadeIn;
  }
  nature.addStereo(L, R, 0, 1);
}

// ---------- wind: only soft whooshes on scene changes and when words / clouds fly in ----------
const swish = (t, len, gain, f0 = 300, f1 = 1600) => fx.addMono(I.noiseSweep(len, f0, f1, { q: 0.7, pink: true, shape: (x) => Math.sin(Math.PI * x) }), t, gain);
for (let b = 1; b <= 5; b++) swish(sc.T(b) - 0.35, 0.9, 0.18, 250, 1200); // scene changes
for (const t of sc.ev.wants) swish(t - 0.05, 0.45, 0.1, 500, 2000); // the three want-clouds pop
for (const t of sc.ev.lackNodes) swish(t - 0.05, 0.4, 0.08, 500, 1800);
for (const t of sc.ev.letGo) swish(t, 1.1, 0.12, 900, 300); // balloons drift away
swish(sc.ev.title, 1.0, 0.1, 400, 1400);

// ---------- birds: a few far, soft chirps (release + final scene) ----------
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
const birdTimes = [[sc.T(2, 2.8), 3600, 0.6], [sc.T(2, 3.1), 4100, 0.6], [sc.T(5, 0.9), 3300, -0.5], [sc.T(5, 1.15), 3800, -0.5], [sc.T(5, 1.35), 3500, -0.5], [sc.T(5, 2.7), 4200, 0.4], [sc.T(5, 2.9), 3900, 0.4]];
birdTimes.forEach(([t, f, pan], i) => { const c = chirp(f, 0.09 + (i % 3) * 0.025, i + 3); birds.addMono(c, t, 0.12, pan); verb.addMono(c, t, 0.06, pan); });

// ---------- mix ----------
const stems = {
  piano, lead, nature, birds, fx,
  verb: reverb(verb, { room: 0.88, damp: 0.45, predelay: 0.02 }),
};
const GAIN = { piano: 0.85 * 0.63 * 0.5, lead: 1.25 * 0.63, nature: 0, // brook removed
  birds: 0.9, fx: 0.7 * 0.71 * 0.35, verb: 0.9 * 0.63 };
const out = path.join(__dirname, 'out');
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 30);
MIX.fadeOut(mix, DURATION - 2.2, DURATION);
const M = MIX.master(mix, parseFloat(process.env.DRIVE || '0.6'), undefined, { lufs: process.env.LUFS ? parseFloat(process.env.LUFS) : null });
MIX.writeWav(path.join(out, 'music.wav'), mix);
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s${M.lufs !== undefined ? `, ${M.lufs.toFixed(1)} LUFS at drive ${M.drive.toFixed(2)}` : ''})`);
