// Narration → sentence timings, so the scenes and subtitles follow the voice. No manual timing needed.
//   node tools/align.js <voice.mp3|wav|m4a> <script.txt>
// script.txt: one sentence (= one scene) per line. Writes voice-timing.js and copies the voice into the project.
// How: ffmpeg finds the pauses; the speech between pauses is matched to the sentences
// (too many pieces → the pieces with the shortest pauses between them are joined;
//  too few → the longest piece is split in proportion to the letters of its sentences).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const [voiceArg, scriptArg] = process.argv.slice(2);
if (!voiceArg || !scriptArg) { console.log('usage: node tools/align.js <voice> <script.txt>'); process.exit(1); }
const root = path.join(__dirname, '..');
const lines = fs.readFileSync(scriptArg, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
if (!lines.length) { console.error('script.txt has no sentences'); process.exit(1); }

const ff = process.env.FFMPEG_PATH || 'ffmpeg';
const probe = spawnSync(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', voiceArg]);
const total = parseFloat(String(probe.stdout));
if (!Number.isFinite(total)) { console.error('cannot read the voice file'); process.exit(1); }

function speech(noiseDb, minPause) {
  const r = spawnSync(ff, ['-hide_banner', '-nostats', '-i', voiceArg, '-af', `silencedetect=noise=${noiseDb}dB:d=${minPause}`, '-f', 'null', '-'], { encoding: 'utf8' });
  const sil = [];
  let s0 = null;
  for (const l of String(r.stderr).split('\n')) {
    const a = l.match(/silence_start: (-?[\d.]+)/), b = l.match(/silence_end: ([\d.]+)/);
    if (a) s0 = Math.max(0, parseFloat(a[1]));
    if (b && s0 !== null) { sil.push([s0, parseFloat(b[1])]); s0 = null; }
  }
  if (s0 !== null) sil.push([s0, total]);
  const segs = [];
  let cur = 0;
  for (const [a, b] of sil) { if (a - cur > 0.12) segs.push({ t: cur, end: a }); cur = b; }
  if (total - cur > 0.12) segs.push({ t: cur, end: total });
  return segs;
}

// pick the pause setting whose piece count is closest to the sentence count
let segs = null;
for (const d of [0.35, 0.28, 0.45, 0.22, 0.6]) for (const n of [-35, -40, -30]) {
  const s = speech(n, d);
  if (!segs || Math.abs(s.length - lines.length) < Math.abs(segs.length - lines.length)) segs = s;
}
const notes = [];
const joined = new Set(), splitAt = new Set();
// too many pieces: join across the shortest pauses
while (segs.length > lines.length) {
  let k = 0, best = Infinity;
  for (let i = 0; i < segs.length - 1; i++) { const gap = segs[i + 1].t - segs[i].end; if (gap < best) { best = gap; k = i; } }
  segs.splice(k, 2, { t: segs[k].t, end: segs[k + 1].end, joined: true });
}
// too few pieces: split the longest piece by letters
while (segs.length < lines.length) {
  let k = 0;
  segs.forEach((s, i) => { if (s.end - s.t > segs[k].end - segs[k].t) k = i; });
  const s = segs[k];
  // which sentences does this piece hold? (by order) — split it in two at the letter share of the first half
  const idx = segs.slice(0, k).length;
  const a = lines[idx] ? lines[idx].length : 1, b = lines[idx + 1] ? lines[idx + 1].length : 1;
  const cut = s.t + (s.end - s.t) * (a / (a + b));
  segs.splice(k, 1, { t: s.t, end: cut - 0.05, split: true }, { t: cut + 0.05, end: s.end, split: true });
}
segs.forEach((s, i) => { if (s.joined) joined.add(i); if (s.split) splitAt.add(i); });

// copy the voice next to the project files (the renderer only serves the project folder)
const ext = path.extname(voiceArg) || '.wav';
const dst = path.join(root, 'voice' + ext);
if (path.resolve(voiceArg) !== path.resolve(dst)) fs.copyFileSync(voiceArg, dst);

const VT = { file: 'voice' + ext, duration: +total.toFixed(3), lines: segs.map((s, i) => ({ t: +s.t.toFixed(3), end: +s.end.toFixed(3), text: lines[i] })) };
fs.writeFileSync(path.join(root, 'voice-timing.js'),
  `// Narration timing, written by tools/align.js — edit the numbers by hand if a sentence is off.\n(function () { const VT = ${JSON.stringify(VT, null, 2)};\nif (typeof module !== 'undefined') module.exports = VT; else globalThis.VOICE_TIMING = VT; })();\n`);

const mmss = (x) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, '0')}`;
console.log(`voice ${total.toFixed(1)}s · ${lines.length} sentences\n`);
console.log('| # | 시작 | 끝 | 문장 | 확인 |');
console.log('|---|---|---|---|---|');
VT.lines.forEach((l, i) => console.log(`| ${i + 1} | ${mmss(l.t)} | ${mmss(l.end)} | ${l.text} | ${joined.has(i) ? '두 덩어리를 합침 — 확인' : splitAt.has(i) ? '쉼이 없어 나눔 — 확인' : ''} |`));
console.log('\nwrote voice-timing.js — SCENES in score.js must have the same number of scenes as sentences.');
