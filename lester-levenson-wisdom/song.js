// THE SONG — a soft felt-piano lullaby over a quiet stream, wind and a few far birds.
//   node song.js            (STEMS=1 also writes out/stem-*.wav, LUFS=-16 sets loudness)
const path = require('path');
const { SR, Bus, reverb, Pink, SVF, OnePole, rng } = require('./engine/audio/dsp');
const MIX = require('./engine/audio/mix');
const sc = require('./score');
const { DURATION, BEAT, m } = sc;

const N = Math.ceil(DURATION * SR);
const bus = () => new Bus(N);
const piano = bus(), lead = bus(), nature = bus(), birds = bus(), verb = bus();
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
  for (let k = 1; k <= 9; k++) {
    const fk = f * k * Math.sqrt(1 + B * k * k);
    if (fk > 7000) break;
    parts.push({ fk, a: Math.pow(k, -1.5) * Math.exp(-(k - 1) * bright * 0.55), tau: baseTau / (1 + 0.45 * (k - 1)), det: 1 + (k === 1 ? 0.0006 : 0.0011) });
  }
  const r = rng(seed * 31 + midi);
  const lp = new OnePole();
  const att = 0.012; // a felt hammer, not a click
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
    const thump = t < 0.03 ? r() * 0.02 * (1 - t / 0.03) : 0;
    out[i] = lp.lp((s * a * rel + thump) * vel * 0.35, 2600 + vel * 1200);
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

// ---------- nature bed: a small stream + soft wind ----------
{
  const pk = new Pink(5), pk2 = new Pink(9), bp = new SVF(), bp2 = new SVF(), lp = new SVF();
  const L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    // stream: band-limited noise whose centre wanders like moving water
    const wob = 1400 + 500 * Math.sin(t * 2.3) + 350 * Math.sin(t * 5.1 + 1) + 250 * Math.sin(t * 9.7);
    const st = bp.bp(pk.next(), wob, 1.6) * (0.55 + 0.25 * Math.sin(t * 3.7) + 0.2 * Math.sin(t * 11.3));
    const st2 = bp2.bp(pk.next(), wob * 1.8, 2.2) * 0.4;
    // wind: slow swells, low
    const wind = lp.lp(pk2.next(), 500 + 200 * Math.sin(t * 0.4), 0.7) * (0.5 + 0.5 * Math.sin(t * 0.31 + 2));
    const fadeIn = Math.min(1, t / 1.2);
    L[i] = (st * 0.8 + st2 * 0.6 + wind * 0.9) * fadeIn;
    R[i] = (st * 0.6 + st2 * 0.8 + wind * 0.8) * fadeIn;
  }
  nature.addStereo(L, R, 0, 1);
}

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
  piano, lead, nature, birds,
  verb: reverb(verb, { room: 0.88, damp: 0.45, predelay: 0.02 }),
};
const GAIN = { piano: 0.85, lead: 1.25, nature: 0.26, birds: 0.9, verb: 0.9 };
const out = path.join(__dirname, 'out');
const mix = MIX.mixdown(stems, GAIN, { stemDir: process.env.STEMS ? out : null });
MIX.highpass(mix, 30);
MIX.fadeOut(mix, DURATION - 2.2, DURATION);
const M = MIX.master(mix, parseFloat(process.env.DRIVE || '0.6'), undefined, { lufs: parseFloat(process.env.LUFS || '-16') });
MIX.writeWav(path.join(out, 'music.wav'), mix);
console.log(`wrote out/music.wav (${DURATION.toFixed(2)}s${M.lufs !== undefined ? `, ${M.lufs.toFixed(1)} LUFS at drive ${M.drive.toFixed(2)}` : ''})`);
