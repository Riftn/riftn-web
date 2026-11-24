/**
 * Binary Metal engine
 * ===================
 * Text -> UTF-8 bytes -> bits -> a metal riff. One byte is one bar of eight
 * eighth notes. On the low string 0 plays open and 1 plays the first fret; the
 * bass doubles the guitar an octave down, the kick follows the 1s (per style),
 * the snare keeps the backbeat and a crash marks every few bars.
 *
 * Everything is drawn with Web Audio in an OfflineAudioContext, so it runs on
 * the listener's own device and nothing is uploaded. The riftn.com page
 * (src/pages/app/BinaryMetalPage.tsx) and the app (through render.html in a
 * hidden WebView) both use this one file, so they sound the same.
 *
 * MP3 uses LAME (lame.min.js next to this file, LGPL, unmodified build of
 * @breezystack/lamejs 1.2.7, https://lame.sourceforge.io).
 */

export const MAX_CHARS = 200;
export const STEPS_PER_BYTE = 8;

export const TUNINGS = {
  'e-standard': { label: 'E standard', strings: ['e', 'B', 'G', 'D', 'A', 'E'], low: 82.41 },
  'drop-d': { label: 'Drop D', strings: ['e', 'B', 'G', 'D', 'A', 'D'], low: 73.42 },
  'drop-c': { label: 'Drop C', strings: ['d', 'A', 'F', 'C', 'G', 'C'], low: 65.41 },
  'b-standard': { label: 'B standard', strings: ['b', 'F#', 'D', 'A', 'E', 'B'], low: 61.74 },
};

export const STYLES = {
  thrash: { label: 'Thrash', bpm: 180, kick: 'ones', snare: [2, 6], hat: true, crashEvery: 4 },
  doom: { label: 'Doom', bpm: 90, kick: 'first', snare: [4], hat: false, crashEvery: 2 },
  blast: { label: 'Blast', bpm: 200, kick: 'all', snare: [1, 3, 5, 7], hat: true, crashEvery: 2 },
  groove: { label: 'Groove', bpm: 140, kick: 'ones', snare: [4], hat: true, crashEvery: 4 },
};

export const MIN_BPM = 60;
export const MAX_BPM = 240;
const TAIL = 2.4;

/** The text as the engine plays it: capped at MAX_CHARS characters. */
export function clip(text) {
  return Array.from(String(text ?? '')).slice(0, MAX_CHARS).join('');
}

/** One entry per UTF-8 byte: the character it came from and its 8 bits. */
export function bytesOf(text) {
  const out = [];
  const encoder = new TextEncoder();
  for (const ch of Array.from(clip(text))) {
    for (const b of encoder.encode(ch)) out.push({ ch, bits: b.toString(2).padStart(8, '0') });
  }
  return out;
}

export function settingsOf(opts = {}) {
  const style = STYLES[opts.style] ? opts.style : 'thrash';
  const tuning = TUNINGS[opts.tuning] ? opts.tuning : 'drop-d';
  const raw = Number(opts.bpm) || STYLES[style].bpm;
  const bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(raw)));
  return { style, tuning, bpm, power: !!opts.power };
}

/** Where everything lands in time, for the playhead. */
export function timeline(text, opts = {}) {
  const s = settingsOf(opts);
  const step = 60 / s.bpm / 2;
  const lead = 8 * step;
  const count = bytesOf(text).length;
  return { step, lead, bytes: count, end: lead + count * STEPS_PER_BYTE * step, duration: lead + count * STEPS_PER_BYTE * step + TAIL };
}

/** Which byte and which bit are sounding at `t` seconds (null in the count-in or the tail). */
export function positionAt(text, opts, t) {
  const tl = timeline(text, opts);
  if (t < tl.lead || t >= tl.end) return null;
  const n = Math.floor((t - tl.lead) / tl.step);
  return { byte: Math.floor(n / STEPS_PER_BYTE), bit: n % STEPS_PER_BYTE };
}

/**
 * Six tab lines (high string first). The low string carries the bits; with
 * power chords on, the two strings above it carry the fifth and the octave.
 */
export function tabLines(text, opts = {}) {
  const s = settingsOf(opts);
  const tuning = TUNINGS[s.tuning];
  const dropped = s.tuning === 'drop-d' || s.tuning === 'drop-c';
  const bars = bytesOf(text).map(({ bits }) => {
    const cols = Array.from(bits, (bit) => {
      const fret = Number(bit);
      const col = ['-', '-', '-', '-', '-', String(fret)];
      if (s.power) {
        col[4] = String(dropped ? fret : fret + 2);
        col[3] = String(dropped ? fret : fret + 2);
      }
      return col;
    });
    return tuning.strings.map((_, row) => cols.map((c) => c[row] + '-').join(''));
  });
  return tuning.strings.map((name, row) => ({ name, bars: bars.map((b) => b[row]) }));
}

export function tabText(text, opts = {}) {
  return tabLines(text, opts).map((l) => `${l.name.padEnd(2)}|${l.bars.join('|')}|`).join('\n');
}

function distCurve(k) {
  const n = 4096;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

function noiseBuffer(ctx, secs) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * secs), ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 1234567;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  return b;
}

/**
 * Every sound in a riff is one of a handful of one-shots (the 0 chug, the 1
 * chug, kick, snare, hat, crash, the last ring-out). Each is drawn once with
 * Web Audio and then copied into place, so a 4 minute riff mixes in well
 * under a second instead of building thousands of audio nodes.
 */
function shotContext(sampleRate, seconds) {
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  return new Offline(2, Math.max(1, Math.ceil(sampleRate * seconds)), sampleRate);
}

function guitarShot(sampleRate, freq, len, power) {
  const ctx = shotContext(sampleRate, len + 0.35);
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const partials = [[1, 'sawtooth', 1], [1, 'square', 0.5], [2, 'sawtooth', 0.35]];
  if (power) partials.push([1.5, 'sawtooth', 0.7], [1.5, 'square', 0.3]);
  // Two guitars, hard left and right, a few cents apart: the double-tracked wall.
  for (const [pan, detune] of [[-0.8, -6], [0.8, 7]]) {
    const pre = ctx.createBiquadFilter(); pre.type = 'highpass'; pre.frequency.value = 90;
    const drive = ctx.createGain(); drive.gain.value = 6;
    const ws = ctx.createWaveShaper(); ws.curve = distCurve(28); ws.oversample = '4x';
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 650; mid.Q.value = 0.8; mid.gain.value = -6;
    const bite = ctx.createBiquadFilter(); bite.type = 'peaking'; bite.frequency.value = 2400; bite.Q.value = 1; bite.gain.value = 4;
    const cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 5200; cab.Q.value = 0.7;
    const cab2 = ctx.createBiquadFilter(); cab2.type = 'lowpass'; cab2.frequency.value = 6500;
    const out = ctx.createGain(); out.gain.value = 0.16;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    pre.connect(drive).connect(ws).connect(mid).connect(bite).connect(cab).connect(cab2).connect(out).connect(p).connect(master);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, 0);
    env.gain.linearRampToValueAtTime(1, 0.004);
    env.gain.setTargetAtTime(0.35, 0.02, 0.05);
    env.gain.setTargetAtTime(0, len, 0.015);
    const palm = ctx.createBiquadFilter(); palm.type = 'lowpass'; palm.Q.value = 2;
    palm.frequency.setValueAtTime(3200, 0);
    palm.frequency.exponentialRampToValueAtTime(900, len);
    for (const [mult, type, level] of partials) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq * mult; o.detune.value = detune;
      const lv = ctx.createGain(); lv.gain.value = level;
      o.connect(lv).connect(palm);
      o.start(0); o.stop(len + 0.1);
    }
    palm.connect(env).connect(pre);
  }
  // The bass doubles it an octave down, in the middle.
  const bassWs = ctx.createWaveShaper(); bassWs.curve = distCurve(2.5);
  const bassLp = ctx.createBiquadFilter(); bassLp.type = 'lowpass'; bassLp.frequency.value = 520;
  const bassOut = ctx.createGain(); bassOut.gain.value = 0.42;
  bassWs.connect(bassLp).connect(bassOut).connect(master);
  const bo = ctx.createOscillator(); bo.type = 'sawtooth'; bo.frequency.value = freq / 2;
  const be = ctx.createGain();
  be.gain.setValueAtTime(0, 0);
  be.gain.linearRampToValueAtTime(1, 0.006);
  be.gain.setTargetAtTime(0, len, 0.03);
  bo.connect(be).connect(bassWs);
  bo.start(0); bo.stop(len + 0.2);
  return ctx.startRendering();
}

function drumShot(sampleRate, kind) {
  const seconds = { kick: 0.32, snare: 0.22, hat: 0.07, crash: 2.3 }[kind];
  const ctx = shotContext(sampleRate, seconds);
  const out = ctx.createGain();
  out.gain.value = 0.85;
  out.connect(ctx.destination);
  const noise = noiseBuffer(ctx, seconds + 0.05);
  const burst = (type, freq, q, level, len) => {
    const n = ctx.createBufferSource(); n.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, 0); g.gain.exponentialRampToValueAtTime(0.001, len);
    n.connect(f).connect(g).connect(out); n.start(0); n.stop(len + 0.02);
  };
  const thump = (from, to, drop, level, len) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(from, 0);
    o.frequency.exponentialRampToValueAtTime(to, drop);
    const g = ctx.createGain(); g.gain.setValueAtTime(level, 0); g.gain.exponentialRampToValueAtTime(0.001, len);
    o.connect(g).connect(out); o.start(0); o.stop(len + 0.02);
  };
  if (kind === 'kick') { thump(140, 42, 0.09, 1.4, 0.28); burst('highpass', 3000, 0, 0.5, 0.012); }
  if (kind === 'snare') { burst('bandpass', 2200, 0.6, 1.1, 0.18); thump(210, 160, 0.08, 0.7, 0.1); }
  if (kind === 'hat') burst('highpass', 7000, 0, 1, 0.045);
  if (kind === 'crash') burst('highpass', 7000, 0, 1, 2.2);
  return ctx.startRendering();
}

function addShot(L, R, shot, at, level = 1) {
  const a = shot.getChannelData(0);
  const b = shot.getChannelData(shot.numberOfChannels > 1 ? 1 : 0);
  const n = Math.min(a.length, L.length - at);
  for (let i = 0; i < n; i++) {
    L[at + i] += a[i] * level;
    R[at + i] += b[i] * level;
  }
}

/** Bring the mix up to full level and round off the peaks, like a bus compressor. */
function glue(L, R) {
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  if (!peak) return;
  const drive = 1.6 / peak;
  const norm = 0.95 / Math.tanh(1.6);
  for (let i = 0; i < L.length; i++) {
    L[i] = Math.tanh(L[i] * drive) * norm;
    R[i] = Math.tanh(R[i] * drive) * norm;
  }
}

/** Draw the whole riff. Resolves to an AudioBuffer (stereo, 44.1 kHz). */
export async function render(text, opts = {}) {
  const sampleRate = opts.sampleRate || 44100;
  const s = settingsOf(opts);
  const style = STYLES[s.style];
  const tl = timeline(text, s);
  const step = tl.step;
  const root = TUNINGS[s.tuning].low;
  const bytes = bytesOf(text);
  const [open, fret, last, kick, snare, hat, crash] = await Promise.all([
    guitarShot(sampleRate, root, step * 0.7, s.power),
    guitarShot(sampleRate, root * Math.pow(2, 1 / 12), step * 0.7, s.power),
    guitarShot(sampleRate, root, 1.6, s.power),
    drumShot(sampleRate, 'kick'),
    drumShot(sampleRate, 'snare'),
    drumShot(sampleRate, 'hat'),
    drumShot(sampleRate, 'crash'),
  ]);
  const length = Math.ceil(sampleRate * tl.duration);
  const L = new Float32Array(length);
  const R = new Float32Array(length);
  const at = (t) => Math.round(t * sampleRate);

  for (let i = 0; i < 4; i++) addShot(L, R, hat, at(i * step * 2), 0.5); // count-in on the hats
  bytes.forEach(({ bits }, bi) => {
    const bar = tl.lead + bi * STEPS_PER_BYTE * step;
    const crashes = bi % style.crashEvery === 0;
    if (crashes) addShot(L, R, crash, at(bar), 0.55);
    Array.from(bits).forEach((bit, si) => {
      const t = bar + si * step;
      addShot(L, R, bit === '1' ? fret : open, at(t));
      const hit = style.kick === 'all' || (style.kick === 'ones' && bit === '1') || (style.kick === 'first' && si === 0);
      if (hit) {
        addShot(L, R, kick, at(t));
        if (style.kick === 'all') addShot(L, R, kick, at(t + step / 2));
      }
      if (style.snare.includes(si)) addShot(L, R, snare, at(t));
      if (style.hat && !(crashes && si === 0)) addShot(L, R, hat, at(t), 0.22);
    });
  });
  addShot(L, R, last, at(tl.end));
  addShot(L, R, kick, at(tl.end));
  addShot(L, R, crash, at(tl.end), 0.7);

  glue(L, R);
  const buffer = typeof AudioBuffer === 'function'
    ? new AudioBuffer({ length, numberOfChannels: 2, sampleRate })
    : shotContext(sampleRate, 0.01).createBuffer(2, length, sampleRate);
  buffer.copyToChannel(L, 0);
  buffer.copyToChannel(R, 1);
  return buffer;
}

function pcm16(data) {
  const out = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

/** 16-bit PCM WAV bytes. */
export function toWav(buffer) {
  const ch = buffer.numberOfChannels;
  const len = buffer.length;
  const sr = buffer.sampleRate;
  const view = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const tag = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + len * ch * 2, true); tag(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * ch * 2, true); view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => pcm16(buffer.getChannelData(c)));
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { view.setInt16(o, chans[c][i], true); o += 2; }
  return new Uint8Array(view.buffer);
}

let lame = null;
function loadLame() {
  if (globalThis.lamejs) return Promise.resolve(globalThis.lamejs);
  if (!lame) {
    lame = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('./lame.min.js', import.meta.url).href;
      s.onload = () => (globalThis.lamejs ? resolve(globalThis.lamejs) : reject(new Error('MP3 encoder missing')));
      s.onerror = () => { lame = null; reject(new Error('MP3 encoder did not load')); };
      document.head.appendChild(s);
    });
  }
  return lame;
}

/** 192 kbps stereo MP3 bytes. `onProgress` gets 0..1 while it encodes. */
export async function toMp3(buffer, onProgress) {
  const { Mp3Encoder } = await loadLame();
  const enc = new Mp3Encoder(2, buffer.sampleRate, 192);
  const left = pcm16(buffer.getChannelData(0));
  const right = pcm16(buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0));
  const parts = [];
  const block = 1152 * 20;
  for (let i = 0; i < left.length; i += block) {
    const out = enc.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block));
    if (out.length) parts.push(new Uint8Array(out));
    if (i % (block * 20) === 0) {
      onProgress?.(i / left.length);
      await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
    }
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** A tidy file name from the text: "riftn-rules-thrash.mp3". */
export function fileName(text, opts, ext) {
  const s = settingsOf(opts);
  const slug = clip(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'riff';
  return `${slug}-${s.style}.${ext}`;
}
