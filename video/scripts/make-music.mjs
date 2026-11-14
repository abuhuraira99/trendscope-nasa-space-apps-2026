// Writes the soundtrack: an original ambient piece synthesised from scratch (additive pads, a soft
// sub bass, a few quiet bell tones and a small reverb). No samples or recordings are used, so the
// music carries no copyright restrictions. Deterministic: the same file comes out every run.
//
// Usage: node scripts/make-music.mjs public/music.wav [seconds]
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? "public/music.wav";
const DURATION = Number(process.argv[3] ?? 29);
const SR = 48000;
const N = Math.round(DURATION * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);

// Small deterministic PRNG so the detune phases are stable between runs.
let seed = 20261114;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Chords line up with the scene changes of the video (seconds).
// Dmaj9 -> Bm11 -> Gmaj9 -> Em9 -> Dmaj9 (open) -> Dadd9
const chords = [
  { t: 0.0, end: 5.6, notes: [50, 57, 61, 64, 66], bass: 38 },
  { t: 5.0, end: 10.6, notes: [47, 54, 57, 61, 64], bass: 35 },
  { t: 10.0, end: 17.1, notes: [43, 50, 54, 57, 62, 69], bass: 31 },
  { t: 16.5, end: 21.6, notes: [52, 55, 59, 62, 66], bass: 40 },
  { t: 21.0, end: 25.6, notes: [50, 57, 62, 64, 69, 73], bass: 38 },
  { t: 25.0, end: 31.0, notes: [50, 57, 64, 66, 69], bass: 38 },
];

const ATTACK = 1.6;
const RELEASE = 1.8;

function addPadNote(midi, t0, t1, gain, pan) {
  const f0 = hz(midi);
  const partials = [1, 2, 3, 4, 5, 6];
  const voices = [];
  for (const k of partials) {
    for (const cents of [-4.5, 4.5]) {
      voices.push({
        f: f0 * k * Math.pow(2, cents / 1200),
        a: (1 / Math.pow(k, 1.7)) * 0.5,
        ph: rand() * Math.PI * 2,
        k,
      });
    }
  }
  const s0 = Math.max(0, Math.floor(t0 * SR));
  const s1 = Math.min(N, Math.floor((t1 + RELEASE) * SR));
  const lfoRate = 0.08 + rand() * 0.1;
  const lfoPh = rand() * Math.PI * 2;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const env = smooth((t - t0) / ATTACK) * (1 - smooth((t - t1) / RELEASE));
    if (env <= 0) continue;
    // Brightness swells in with the note and settles back.
    const bright = 0.35 + 0.65 * smooth((t - t0) / (ATTACK * 1.8));
    const trem = 1 + 0.08 * Math.sin(2 * Math.PI * lfoRate * t + lfoPh);
    let s = 0;
    for (const v of voices) {
      const w = v.k === 1 ? 1 : Math.pow(bright, v.k - 1);
      s += v.a * w * Math.sin(2 * Math.PI * v.f * t + v.ph);
    }
    s *= env * trem * gain;
    L[i] += s * gl;
    R[i] += s * gr;
  }
}

function addBass(midi, t0, t1, gain) {
  const f = hz(midi);
  const s0 = Math.max(0, Math.floor(t0 * SR));
  const s1 = Math.min(N, Math.floor((t1 + RELEASE) * SR));
  for (let i = s0; i < s1; i++) {
    const t = i / SR;
    const env = smooth((t - t0) / 2.2) * (1 - smooth((t - t1) / RELEASE));
    const s = gain * env * (Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(4 * Math.PI * f * t));
    L[i] += s;
    R[i] += s;
  }
}

function addBell(midi, t0, gain, pan) {
  const f = hz(midi);
  const s0 = Math.floor(t0 * SR);
  const s1 = Math.min(N, s0 + Math.floor(4.5 * SR));
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = s0; i < s1; i++) {
    const t = (i - s0) / SR;
    const env = Math.min(1, t / 0.012) * Math.exp(-t / 1.1);
    const s = gain * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.exp(-t / 0.4) * Math.sin(2 * Math.PI * f * 2.76 * t));
    L[i] += s * gl;
    R[i] += s * gr;
  }
}

for (const c of chords) {
  c.notes.forEach((n, j) => {
    const pan = ((j % 2 === 0 ? -1 : 1) * (0.15 + 0.35 * (j / c.notes.length)));
    addPadNote(n, c.t, c.end, 0.055, pan);
  });
  addBass(c.bass, c.t, c.end, 0.07);
}

// Sparse bell tones on scene changes and a few in between (D major pentatonic).
const bells = [
  [5.0, 78, -0.3],
  [6.6, 81, 0.25],
  [10.0, 74, 0.2],
  [12.4, 78, -0.2],
  [16.5, 76, 0.3],
  [18.9, 81, -0.25],
  [21.0, 78, -0.1],
  [23.0, 83, 0.3],
  [25.0, 74, -0.3],
  [26.4, 78, 0.2],
];
for (const [t, n, p] of bells) addBell(n, t, 0.035, p);

// Freeverb-style reverb: parallel damped combs into series allpasses, per channel.
function reverb(input, offset) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => Math.round(((d + offset) * SR) / 44100));
  const aps = [556, 441, 341, 225].map((d) => Math.round(((d + offset) * SR) / 44100));
  const out = new Float32Array(N);
  const feedback = 0.86;
  const damp = 0.3;
  for (const d of combs) {
    const buf = new Float32Array(d);
    let idx = 0;
    let filt = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[idx];
      filt = y * (1 - damp) + filt * damp;
      buf[idx] = input[i] + filt * feedback;
      idx = (idx + 1) % d;
      out[i] += y;
    }
  }
  for (const d of aps) {
    const buf = new Float32Array(d);
    let idx = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[idx];
      const x = out[i];
      buf[idx] = x + b * 0.5;
      out[i] = b - x;
      idx = (idx + 1) % d;
    }
  }
  return out;
}

const wetL = reverb(L, 0);
const wetR = reverb(R, 23);
const WET = 0.2;
const DRY = 0.78;

const FADE_IN = 1.4;
const FADE_OUT = 2.6;
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const g = smooth(t / FADE_IN) * (1 - smooth((t - (DURATION - FADE_OUT)) / FADE_OUT));
  L[i] = (L[i] * DRY + wetL[i] * WET) * g;
  R[i] = (R[i] * DRY + wetR[i] * WET) * g;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}

// Normalise to a quiet level: peaks at -9 dBFS so the music sits low under the picture.
const target = Math.pow(10, -9 / 20);
const k = peak > 0 ? target / peak : 1;
let sumSq = 0;
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const l = Math.max(-1, Math.min(1, L[i] * k));
  const r = Math.max(-1, Math.min(1, R[i] * k));
  sumSq += l * l + r * r;
  pcm.writeInt16LE(Math.round(l * 32767), i * 4);
  pcm.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);

fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, Buffer.concat([header, pcm]));
const rmsDb = 10 * Math.log10(sumSq / (2 * N));
console.log(`wrote ${out}: ${DURATION}s, ${SR} Hz stereo, peak -9.0 dBFS, RMS ${rmsDb.toFixed(1)} dBFS`);
