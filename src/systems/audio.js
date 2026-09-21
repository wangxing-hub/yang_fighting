/**
 * 背景音乐 + 音效：全部用 Web Audio 现场合成，项目里一个音频文件都不需要。
 *
 * 音乐是一段 16 小节的循环（D 小调、108 BPM、带摇摆的十六分音符），走的是
 * 「滑稽潜行 / 偷鸡摸狗」那种卡通配乐路子：
 *   · 拨弦似的主旋律（三角波 + 高八度方波，短促、留白多）
 *   · 走路一样的贝斯，乐句末尾用半音"溜"进下一个和弦
 *   · 只有一点点鼓：踩在 2、4 拍上的边鼓、反拍上的沙锤，音量压得很低
 *   · 每隔 8 小节一个笑点：滑哨似的上滑音，最后再来一声 boing
 * 整体音量克制（峰值 0.16 左右 + 4.2kHz 低通），是背景音乐不是迪厅，
 * 打起来不会盖住音效。
 *
 * 音效也是同一套合成器：命中、重击、投掷、起跳、倒地、胜负各一小段。
 *
 * 浏览器要求先有用户手势才能出声，所以 main.js 里挂了"第一次点/按键就解锁"。
 */

const BPM = 108;
const SWING = 0.14;       // 摇摆：每对十六分音符的后一个往后拖一点
const LOOKAHEAD = 0.3;    // 提前排程的秒数
const TICK_MS = 30;
const STEPS_PER_BAR = 16;

/**
 * 音乐总音量。音色本身已经按"峰值 0.1~0.2"设计过，这里再乘一次总线，
 * 所以别调太小——0.5 大约是峰值 0.19 / 均方根 0.023，标准的背景音乐音量。
 */
const VOLUME = { title: 0.36, fight: 0.5 };
const CUTOFF = { title: 3400, fight: 4400 };
const SFX_VOLUME = 1;

const REST = '.';
const HOLD = '~';

/**
 * 16 小节。melody 每小节 16 个十六分音符（'.' 休止，'~' 延长），
 * bass 每小节 4 个四分音符（前两个是根音/五音，最后一个是走进下一小节的半音）。
 */
const BARS = [
  { chord: 'Dm', bass: ['D2', 'A2', 'D3', 'A2'], mel: 'D5 . . .  . . F5 .  E5 . . .  . D5 . .' },
  { chord: 'Dm', bass: ['D2', 'A2', 'F2', 'A2'], mel: 'A4 . . .  . . C5 .  D5 ~ . .  . . . .' },
  { chord: 'Bb', bass: ['Bb2', 'F2', 'Bb2', 'F2'], mel: 'Bb4 . . .  . . D5 .  F5 ~ . .  . . . .' },
  { chord: 'A7', bass: ['A2', 'E3', 'A2', 'C#3'], mel: 'E5 . . .  . . C#5 .  E5 ~ . .  . . . .' },
  { chord: 'Dm', bass: ['D2', 'A2', 'D3', 'A2'], mel: 'D5 . . .  . . F5 .  A5 ~ . .  G5 . F5 .' },
  { chord: 'Dm', bass: ['D2', 'F2', 'A2', 'D3'], mel: 'E5 . . .  . D5 . .  C#5 . . .  . . . .' },
  { chord: 'Gm', bass: ['G2', 'D3', 'Bb2', 'D3'], mel: 'G4 . . .  . . Bb4 .  D5 ~ . .  . . . .' },
  { chord: 'A7', bass: ['A2', 'E3', 'G2', 'C#3'], mel: 'C#5 . . .  E5 . . .  A4 ~ . .  . . . .' },
  { chord: 'Gm', bass: ['G2', 'D3', 'G2', 'D3'], mel: 'G4 . Bb4 .  D5 . Bb4 .  G4 . . .  . . . .' },
  { chord: 'A7', bass: ['A2', 'E3', 'A2', 'E3'], mel: 'A4 . C#5 .  E5 . C#5 .  A4 . . .  . . . .' },
  { chord: 'Dm', bass: ['D2', 'A2', 'D3', 'F3'], mel: 'D5 . E5 .  F5 . G5 .  A5 ~ . .  . . . .' },
  { chord: 'Bb', bass: ['Bb2', 'F3', 'Bb2', 'D3'], mel: 'Bb5 . A5 .  G5 . F5 .  D5 ~ . .  . . . .' },
  { chord: 'Gm', bass: ['G2', 'D3', 'Bb2', 'D3'], mel: 'G5 . F5 .  E5 . D5 .  Bb4 ~ . .  . . . .' },
  { chord: 'A7', bass: ['A2', 'C#3', 'E3', 'G3'], mel: 'C#5 . D5 .  E5 . F5 .  G5 . . .  . . . .' },
  { chord: 'Dm', bass: ['D2', 'A2', 'D3', 'A2'], mel: 'A5 . . .  G5 . . .  F5 . . .  E5 . D5 .' },
  { chord: 'A7', bass: ['A2', 'E3', 'A2', 'C#3'], mel: 'C#5 . E5 .  G5 . A5 .  D6 ~ ~ ~  . . . .' },
];

const TOTAL_STEPS = BARS.length * STEPS_PER_BAR;

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteToFreq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return 0;
  const [, letter, accidental, octave] = m;
  const semi = SEMI[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0);
  const midi = semi + (Number(octave) + 1) * 12;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** 把 'D5 . . .  . . F5 .' 拆成 [{note, step, len}] */
function parseMelody(line) {
  const tokens = line.trim().split(/\s+/);
  const notes = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t === REST || t === HOLD) continue;
    let len = 1;
    while (tokens[i + len] === HOLD) len += 1;
    notes.push({ note: t, step: i, len });
  }
  return notes;
}

const PARSED = BARS.map((bar) => ({ ...bar, melody: parseMelody(bar.mel) }));

/* ------------------------------------------------------------------ 乐器 */

/** 主旋律：三角波 + 高八度方波，短促的拨弦感；bend 是起音时从上往下溜一个小二度 */
function playLead(t, freq, dur, { bend = 0, gain = 0.14 } = {}) {
  const { ctx, music, noise } = t;
  const top = freq * 2 ** (bend / 12);
  const glide = Math.min(0.13, dur * 0.5);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(bend ? top : freq, t.at);
  if (bend) osc.frequency.exponentialRampToValueAtTime(freq, t.at + glide);

  const sparkle = ctx.createOscillator();
  sparkle.type = 'square';
  sparkle.frequency.setValueAtTime((bend ? top : freq) * 2, t.at);
  if (bend) sparkle.frequency.exponentialRampToValueAtTime(freq * 2, t.at + glide);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t.at);
  g.gain.linearRampToValueAtTime(gain, t.at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0006, t.at + dur);

  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, t.at);
  sg.gain.linearRampToValueAtTime(gain * 0.28, t.at + 0.01);
  sg.gain.exponentialRampToValueAtTime(0.0006, t.at + dur * 0.6);

  osc.connect(g).connect(music);
  sparkle.connect(sg).connect(music);
  osc.start(t.at);
  osc.stop(t.at + dur + 0.05);
  sparkle.start(t.at);
  sparkle.stop(t.at + dur + 0.05);
}

/** 贝斯：正弦，走路一样一格一下 */
function playBass(t, freq, dur) {
  const { ctx, music } = t;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t.at);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t.at);
  g.gain.linearRampToValueAtTime(0.2, t.at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0008, t.at + dur);
  osc.connect(g).connect(music);
  osc.start(t.at);
  osc.stop(t.at + dur + 0.05);
}

/** 噪声：边鼓 / 沙锤 / 木鱼都用它 */
function playNoise(t, dur, { type = 'highpass', freq = 6000, gain = 0.08, q = 1 } = {}) {
  const { ctx, music, noise } = t;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t.at);
  g.gain.exponentialRampToValueAtTime(0.0004, t.at + dur);
  src.connect(filter).connect(g).connect(music);
  src.start(t.at);
  src.stop(t.at + dur + 0.02);
}

/** 底鼓：很轻，只是把拍子垫住 */
function playKick(t, gain = 0.12) {
  const { ctx, music } = t;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t.at);
  osc.frequency.exponentialRampToValueAtTime(48, t.at + 0.11);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t.at);
  g.gain.linearRampToValueAtTime(gain, t.at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0006, t.at + 0.2);
  osc.connect(g).connect(music);
  osc.start(t.at);
  osc.stop(t.at + 0.24);
}

/** 滑哨：喜剧里的上滑音 */
function playSlide(t, from, to, dur, gain = 0.05) {
  const { ctx, music } = t;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, t.at);
  osc.frequency.exponentialRampToValueAtTime(to, t.at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t.at);
  g.gain.linearRampToValueAtTime(gain, t.at + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0006, t.at + dur);
  osc.connect(g).connect(music);
  osc.start(t.at);
  osc.stop(t.at + dur + 0.05);
}

/** boing：猛地往下掉一下，用来收尾 / 转场 */
function playBoing(t, gain = 0.07) {
  const { ctx, music } = t;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(420, t.at);
  osc.frequency.exponentialRampToValueAtTime(130, t.at + 0.22);
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 18;
  const wobbleGain = ctx.createGain();
  wobbleGain.gain.value = 26;
  wobble.connect(wobbleGain).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t.at);
  g.gain.linearRampToValueAtTime(gain, t.at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0006, t.at + 0.3);
  osc.connect(g).connect(music);
  osc.start(t.at);
  osc.stop(t.at + 0.34);
  wobble.start(t.at);
  wobble.stop(t.at + 0.34);
}

/* ------------------------------------------------------------------ 排程 */

/**
 * 排一个小节里第 step 个十六分音符。
 * t = { ctx, music, noise, at }，离线渲染时传的是另一个 ctx，所以音乐能被"渲染出来做自检"。
 */
function scheduleStep(t, step, stepDur) {
  const bar = Math.floor(step / STEPS_PER_BAR) % PARSED.length;
  const s = step % STEPS_PER_BAR;
  const data = PARSED[bar];
  const phraseEnd = bar % 4 === 3;

  // 主旋律
  data.melody.forEach(({ note, step: at, len }) => {
    if (at !== s) return;
    // 每 4 小节收尾时往下溜一个小二度，听感上像"脚下一滑"
    const bend = phraseEnd && at === 14 ? -1 : 0;
    playLead(t, noteToFreq(note), len * stepDur * 0.9, { bend });
  });

  // 贝斯：一小节四下
  if (s % 4 === 0) {
    const which = s / 4;
    const note = data.bass[which % data.bass.length];
    // 最后一个音是"走进下一小节"的过渡音，短一点
    playBass(t, noteToFreq(note), stepDur * (which === 3 ? 2.2 : 3.2));
  }

  // 鼓：轻到几乎只是垫底
  if (s === 0 || s === 8) playKick(t);
  if (s === 4 || s === 12) playNoise(t, 0.13, { type: 'bandpass', freq: 2000, gain: 0.075, q: 1.4 });
  if (s % 4 === 2) playNoise(t, 0.035, { type: 'highpass', freq: 7800, gain: 0.028 });

  // 笑点
  if (phraseEnd && s === 15) playNoise(t, 0.16, { type: 'bandpass', freq: 1400, gain: 0.07, q: 2 });
  if (bar === 7 && s === 14) playSlide(t, 520, 980, 0.24, 0.045);
  if (bar === 15 && s === 12) playBoing(t, 0.06);
}

/* ------------------------------------------------------------------ 上下文 */

let ctx = null;
let master = null;
let music = null;
let sfxBus = null;
let noiseBuffer = null;
let timer = null;
let stepIndex = 0;
let nextTime = 0;
let playing = false;
let muted = false;
let intensity = 'fight';
let unlocked = false;

function readMuted() {
  try {
    return window.localStorage.getItem('fightMuted') === '1';
  } catch {
    return false;
  }
}

function makeNoise(context, seconds = 0.4) {
  const len = Math.floor(context.sampleRate * seconds);
  const buf = context.createBuffer(1, len, context.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  return buf;
}

function ensureContext() {
  if (ctx) return true;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;
  ctx = new AudioCtx();
  muted = readMuted();

  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  const warm = ctx.createBiquadFilter();
  warm.type = 'lowpass';
  warm.frequency.value = 9000;
  master.connect(warm).connect(ctx.destination);

  music = ctx.createGain();
  music.gain.value = VOLUME[intensity];
  const musicTone = ctx.createBiquadFilter();
  musicTone.type = 'lowpass';
  musicTone.frequency.value = CUTOFF[intensity];
  music.connect(musicTone).connect(master);

  // 主旋律一点点回声，卡通味，但不糊
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.12;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.14;
  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  music.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(wet).connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_VOLUME;
  sfxBus.connect(master);

  noiseBuffer = makeNoise(ctx);
  return true;
}

function scheduler() {
  if (!playing || !ctx) return;
  const stepDur = 60 / BPM / 4;
  while (nextTime < ctx.currentTime + LOOKAHEAD) {
    const s = stepIndex % STEPS_PER_BAR;
    const swing = s % 2 === 1 ? stepDur * SWING : 0;
    scheduleStep({ ctx, music, noise: noiseBuffer, at: nextTime + swing }, stepIndex, stepDur);
    stepIndex = (stepIndex + 1) % TOTAL_STEPS;
    nextTime += stepDur;
  }
}

/* ------------------------------------------------------------------ 对外：音乐 */

export function unlockAudio() {
  if (unlocked) return;
  if (!ensureContext()) return;
  unlocked = true;
  if (ctx.state === 'suspended') ctx.resume();
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (playing) ctx.resume();
  });
}

export function startMusic() {
  if (!ensureContext()) return;
  unlocked = true;
  if (ctx.state === 'suspended') ctx.resume();
  if (playing) return;
  playing = true;
  stepIndex = 0;
  nextTime = ctx.currentTime + 0.12;
  timer = setInterval(scheduler, TICK_MS);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null;
  playing = false;
}

export function isMusicPlaying() {
  return playing;
}

/** 调试用：音频上下文的状态（'running' / 'suspended' / 'none'） */
export function audioState() {
  return ctx ? ctx.state : 'none';
}

export function isMuted() {
  return muted;
}

/** 标题界面稍微收一点，进关卡放开一点 */
export function setIntensity(which) {
  intensity = which;
  if (!ctx) return;
  music.gain.setTargetAtTime(VOLUME[which], ctx.currentTime, 0.2);
}

export function toggleMute() {
  muted = !muted;
  try {
    window.localStorage.setItem('fightMuted', muted ? '1' : '0');
  } catch {
    /* 隐私模式写不了，忽略 */
  }
  if (ctx && master) {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05);
  }
  return muted;
}

/* ------------------------------------------------------------------ 对外：音效 */

function live() {
  if (!ctx || muted) return null;
  return { ctx, music: sfxBus, noise: noiseBuffer };
}

/** 命中：木头敲一下的感觉。damage 越大越闷越响 */
export function sfxHit(damage = 8) {
  const t = live();
  if (!t) return;
  const heavy = damage >= 12;
  const at = t.ctx.currentTime + 0.001;
  playNoise({ ...t, at }, heavy ? 0.16 : 0.1, {
    type: 'bandpass',
    freq: heavy ? 900 : 1500,
    gain: heavy ? 0.16 : 0.11,
    q: 1.2,
  });
  const osc = t.ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(heavy ? 220 : 320, at);
  osc.frequency.exponentialRampToValueAtTime(heavy ? 90 : 150, at + 0.09);
  const g = t.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(heavy ? 0.16 : 0.1, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0006, at + 0.14);
  osc.connect(g).connect(t.music);
  osc.start(at);
  osc.stop(at + 0.18);
}

/** 投掷：一声短促的"嗖" */
export function sfxThrow() {
  const t = live();
  if (!t) return;
  const at = t.ctx.currentTime + 0.001;
  const src = t.ctx.createBufferSource();
  src.buffer = t.noise;
  const filter = t.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(700, at);
  filter.frequency.exponentialRampToValueAtTime(2600, at + 0.16);
  const g = t.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(0.1, at + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0005, at + 0.2);
  src.connect(filter).connect(g).connect(t.music);
  src.start(at);
  src.stop(at + 0.24);
}

/** 起跳：小小的一声 boing，别吵 */
export function sfxJump() {
  const t = live();
  if (!t) return;
  playSlide({ ...t, at: t.ctx.currentTime + 0.001 }, 300, 620, 0.12, 0.07);
}

/** 对话打字机：极轻的一声"嘀"，按字数间隔着放 */
export function sfxBlip() {
  const t = live();
  if (!t) return;
  const at = t.ctx.currentTime + 0.001;
  const osc = t.ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(760, at);
  const g = t.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(0.022, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0004, at + 0.045);
  osc.connect(g).connect(t.music);
  osc.start(at);
  osc.stop(at + 0.06);
}

/** 倒地 / 被击倒：往下一路滑，带一点滑稽 */
export function sfxKo() {
  const t = live();
  if (!t) return;
  const at = t.ctx.currentTime + 0.001;
  const osc = t.ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(420, at);
  osc.frequency.exponentialRampToValueAtTime(90, at + 0.6);
  const g = t.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(0.1, at + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0005, at + 0.7);
  const lp = t.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1800;
  osc.connect(lp).connect(g).connect(t.music);
  osc.start(at);
  osc.stop(at + 0.75);
}

/** 胜利：四个音的小号角 */
export function sfxWin() {
  const t = live();
  if (!t) return;
  const at = t.ctx.currentTime + 0.02;
  ['D5', 'F5', 'A5', 'D6'].forEach((n, i) => {
    playLead({ ...t, at: at + i * 0.14 }, noteToFreq(n), i === 3 ? 0.6 : 0.16, { gain: 0.16 });
  });
  playNoise({ ...t, at }, 0.3, { type: 'highpass', freq: 6200, gain: 0.06 });
}

/** 失败：两个音往下掉，有点丧 */
export function sfxLose() {
  const t = live();
  if (!t) return;
  const at = t.ctx.currentTime + 0.02;
  ['A4', 'F4', 'D4'].forEach((n, i) => {
    playLead({ ...t, at: at + i * 0.22 }, noteToFreq(n), 0.3, { gain: 0.14, bend: i === 2 ? -2 : 0 });
  });
}

/* ------------------------------------------------------------------ 自检 */

/**
 * 离线把音乐渲染出来量一量（命令行自检用）：
 * 返回峰值、均方根，以及每拍的音量包络——能验证"真的有声音、音量克制、节奏清楚"。
 */
export async function renderPreview(seconds = 8, sampleRate = 8000) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return null;
  const off = new Offline(1, Math.floor(seconds * sampleRate), sampleRate);
  const bus = off.createGain();
  bus.gain.value = VOLUME.fight;
  bus.connect(off.destination);
  const noise = makeNoise(off);
  const stepDur = 60 / BPM / 4;
  const steps = Math.floor(seconds / stepDur);
  for (let i = 0; i < steps; i += 1) {
    const s = i % STEPS_PER_BAR;
    const swing = s % 2 === 1 ? stepDur * SWING : 0;
    scheduleStep({ ctx: off, music: bus, noise, at: 0.05 + i * stepDur + swing }, i, stepDur);
  }
  const buffer = await off.startRendering();
  const data = buffer.getChannelData(0);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    const v = Math.abs(data[i]);
    if (v > peak) peak = v;
    sum += data[i] * data[i];
  }
  const beat = (60 / BPM) * sampleRate;
  const envelope = [];
  for (let b = 0; b * beat < data.length; b += 1) {
    let m = 0;
    for (let i = Math.floor(b * beat); i < Math.min(data.length, (b + 1) * beat); i += 1) {
      m = Math.max(m, Math.abs(data[i]));
    }
    envelope.push(Number(m.toFixed(3)));
  }
  // 每个十六分音符的包络：用来看"音符是不是真的落在谱子写的那一步上"
  const stepsEnv = [];
  for (let s = 0; s * stepDur * sampleRate < data.length; s += 1) {
    let m = 0;
    const from = Math.floor(s * stepDur * sampleRate);
    const to = Math.min(data.length, Math.floor((s + 1) * stepDur * sampleRate));
    for (let i = from; i < to; i += 1) m = Math.max(m, Math.abs(data[i]));
    stepsEnv.push(Number(m.toFixed(3)));
  }
  return {
    seconds,
    peak: Number(peak.toFixed(3)),
    rms: Number(Math.sqrt(sum / data.length).toFixed(4)),
    beats: envelope.length,
    envelope,
    steps: stepsEnv,
  };
}

muted = readMuted();
