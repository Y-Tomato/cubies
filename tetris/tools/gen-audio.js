// 生成俄罗斯方块所需的音频资源（音效 + 背景音乐）为 WAV 格式
// 运行：node tools/gen-audio.js
// 仅依赖 Node 内置模块，无需安装任何第三方库
const fs = require('fs');
const path = require('path');

const AUDIO_DIR = path.join(__dirname, '..', 'audio');
const SR = 22050;

const m2f = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 波形（phase 为周期数）
const square = (ph) => Math.sign(Math.sin(2 * Math.PI * ph));
const triangle = (ph) => (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * ph));
const saw = (ph) => 2 * (ph - Math.floor(0.5 + ph));

function writeWav(file, samples, sr) {
  const n = samples.length;
  const dataLen = n * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM
  buf.writeUInt16LE(1, 20); // mono
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < n; i++) {
    let s = samples[i];
    if (s > 1) s = 1; else if (s < -1) s = -1;
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  console.log('  ' + path.basename(file) + '  ' + (n / sr).toFixed(2) + 's  ' + (buf.length / 1024).toFixed(1) + 'KB');
}

// 叠加一个带起音 + 指数衰减的音符
function addTone(buf, t0, freq, dur, wave, amp, decay, sr) {
  const start = Math.floor(t0 * sr);
  const len = Math.floor(dur * sr);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.min(1, t / 0.01) * Math.exp(-t * decay);
    const idx = start + i;
    if (idx < buf.length) buf[idx] += wave(freq * t) * env * amp;
  }
}

// ---- 音效 ----

function genClick(sr) {
  const dur = 0.05, n = Math.floor(dur * sr);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    b[i] = square(1200 * t) * Math.exp(-t * 120) * 0.3;
  }
  return b;
}

function genClear(sr) {
  const dur = 0.5, n = Math.floor(dur * sr);
  const b = new Float64Array(n);
  [[72, 0], [76, 0.05], [79, 0.1], [84, 0.15], [88, 0.2]].forEach(([m, d]) =>
    addTone(b, d, m2f(m), 0.16, square, 0.4, 12, sr));
  return b;
}

function genDrop(sr) {
  const dur = 0.14, n = Math.floor(dur * sr);
  const b = new Float64Array(n);
  addTone(b, 0, 180, 0.08, triangle, 0.6, 30, sr);
  addTone(b, 0.02, 120, 0.09, square, 0.35, 28, sr);
  return b;
}

function genRotate(sr) {
  const dur = 0.06, n = Math.floor(dur * sr);
  const b = new Float64Array(n);
  addTone(b, 0, m2f(69), 0.05, square, 0.22, 30, sr);
  return b;
}

function genHold(sr) {
  const dur = 0.07, n = Math.floor(dur * sr);
  const b = new Float64Array(n);
  addTone(b, 0, m2f(64), 0.06, triangle, 0.32, 26, sr);
  return b;
}

function genLevel(sr) {
  const dur = 0.3, n = Math.floor(dur * sr);
  const b = new Float64Array(n);
  [[69, 0], [72, 0.07], [76, 0.14]].forEach(([m, d]) =>
    addTone(b, d, m2f(m), 0.12, square, 0.3, 12, sr));
  return b;
}

function genOver(sr) {
  const dur = 1.0, n = Math.floor(dur * sr);
  const b = new Float64Array(n);
  [[64, 0], [60, 0.16], [57, 0.32]].forEach(([m, d]) =>
    addTone(b, d, m2f(m), 0.3, saw, 0.32, 8, sr));
  return b;
}

// ---- 背景音乐 ----

function genBgm(sr) {
  const bpm = 150, eighth = 60 / bpm / 2; // 0.2s 每八分音符
  // 原创 8-bit 旋律（A 小调，16 个八分音符一循环）+ 低音
  const MELODY = [69, 72, 76, 81, 76, 72, 76, 72, 69, 72, 77, 81, 77, 72, 67, 71];
  const BASS = [45, 57, 45, 57, 40, 52, 40, 52, 41, 53, 41, 53, 43, 55, 43, 55];
  const loops = 2;
  const steps = MELODY.length * loops;
  const total = steps * eighth;
  const n = Math.floor(total * sr);
  const b = new Float64Array(n);
  for (let i = 0; i < steps; i++) {
    const t0 = i * eighth;
    const mi = i % MELODY.length;
    addTone(b, t0, m2f(MELODY[mi]), 0.18, square, 0.5, 14, sr);
    addTone(b, t0, m2f(BASS[mi]), 0.14, triangle, 0.8, 16, sr);
  }
  // 归一化
  let peak = 0;
  for (let i = 0; i < n; i++) { const v = Math.abs(b[i]); if (v > peak) peak = v; }
  const norm = peak > 0 ? 0.82 / peak : 1;
  for (let i = 0; i < n; i++) b[i] *= norm;
  return b;
}

// ---- 主流程 ----

fs.mkdirSync(AUDIO_DIR, { recursive: true });

console.log('生成音频资源 -> ' + AUDIO_DIR);
writeWav(path.join(AUDIO_DIR, 'click.wav'), genClick(SR), SR);
writeWav(path.join(AUDIO_DIR, 'clear.wav'), genClear(SR), SR);
writeWav(path.join(AUDIO_DIR, 'drop.wav'), genDrop(SR), SR);
writeWav(path.join(AUDIO_DIR, 'rotate.wav'), genRotate(SR), SR);
writeWav(path.join(AUDIO_DIR, 'hold.wav'), genHold(SR), SR);
writeWav(path.join(AUDIO_DIR, 'level.wav'), genLevel(SR), SR);
writeWav(path.join(AUDIO_DIR, 'over.wav'), genOver(SR), SR);
writeWav(path.join(AUDIO_DIR, 'bgm.wav'), genBgm(SR), SR);

let total = 0;
fs.readdirSync(AUDIO_DIR).forEach((f) => { total += fs.statSync(path.join(AUDIO_DIR, f)).size; });
console.log('音频总大小：' + (total / 1024).toFixed(1) + ' KB');
