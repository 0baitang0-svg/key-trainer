/**
 * 音效层（Web Audio 合成，零素材文件）：
 * - 答对 = 该调主和弦琶音（大调大三和弦 / 小调小三和弦），三角波单音 220ms + ADSR
 * - 连击 5 连琶音升八度、10 连加色彩音、15 连加高频 shimmer（正弦微音量）
 * - 答错 = 低八度柔和短音（低惩罚感）
 * - 通关 = IV–V–I 终止式（末和弦 1s）；打卡/徽章 = 五声音阶上行 jingle；按钮 = 60ms 正弦 click
 */

import { keyInfo, type Ask, type SigType } from '../core/music-theory';
import { audioEngine } from './engine';
import { midiToFreq, noteToMidi } from './melody-synth';

/** 单音时长（毫秒） */
export const NOTE_MS = 220;

/** 音频不可用时静默，不影响训练流程 */
function safePlay(fn: () => void): void {
  try {
    fn();
  } catch {
    // 无 AudioContext / 自动播放受限时直接跳过
  }
}

/** 一个音：三角波 + ADSR 包络，用 ctx.currentTime 排程 */
function tone(freq: number, start: number, dur: number, peak: number): void {
  const ctx = audioEngine.context;
  const osc = audioEngine.createOsc(freq);
  const g = ctx.createGain();
  const attack = Math.min(0.012, dur * 0.25);
  const release = Math.min(0.08, dur * 0.4);
  const sustainAt = Math.max(start + attack + 0.01, start + dur - release);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.linearRampToValueAtTime(peak * 0.72, Math.max(start + attack + 0.005, start + dur * 0.35));
  g.gain.setValueAtTime(peak * 0.72, sustainAt);
  g.gain.linearRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(audioEngine.master);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

/** 高频 shimmer 层：正弦微音量 */
function shimmer(freq: number, start: number, dur = 0.9): void {
  const ctx = audioEngine.context;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(0.035, start + dur * 0.3);
  g.gain.linearRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(audioEngine.master);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

/** 主音名 → MIDI（oct=4） */
function tonicMidi(keyType: SigType, keyN: number, ask: Ask): number {
  const info = keyInfo(keyType, keyN);
  const name = ask === 'maj' ? info.tonicMaj : info.tonicMin;
  const acc = name.includes('♯') ? 1 : name.includes('♭') ? -1 : 0;
  return noteToMidi(name[0], 4, acc);
}

/**
 * 答对音效：该调主和弦琶音（root-3-5）。
 * @param combo 当前连击数：≥5 升八度，≥10 加色彩音（加九音），≥15 加 shimmer
 */
export function playCorrect(keyType: SigType, keyN: number, ask: Ask, combo = 0): void {
  safePlay(() => {
    const root = tonicMidi(keyType, keyN, ask);
    const third = root + (ask === 'maj' ? 4 : 3);
    const fifth = root + 7;
    const up = combo >= 5 ? 12 : 0;
    const d = NOTE_MS / 1000;
    const t0 = audioEngine.now();
    tone(midiToFreq(root + up), t0, d, 0.26);
    tone(midiToFreq(third + up), t0 + d, d, 0.23);
    tone(midiToFreq(fifth + up), t0 + 2 * d, d * 1.3, 0.23);
    if (combo >= 10) {
      tone(midiToFreq(root + up + 14), t0 + 3 * d, d, 0.17);
    }
    if (combo >= 15) {
      shimmer(midiToFreq(root + up + 24), t0 + 3 * d);
    }
  });
}

/** 答错音效：低八度柔和短音（不带打击感） */
export function playWrong(): void {
  safePlay(() => {
    const t0 = audioEngine.now();
    tone(midiToFreq(noteToMidi('C', 3)), t0, 0.32, 0.16);
    tone(midiToFreq(noteToMidi('G', 3)), t0 + 0.02, 0.3, 0.08);
  });
}

/** 通关音效：IV–V–I 终止式（末和弦 1s 长音） */
export function playCadence(keyType: SigType = 'sh', keyN = 0, ask: Ask = 'maj'): void {
  safePlay(() => {
    const root = tonicMidi(keyType, keyN, ask);
    const thirdGap = ask === 'maj' ? 4 : 3;
    const chords: Array<{ root: number; dur: number }> = [
      { root: root + 5, dur: 0.38 },
      { root: root + 7, dur: 0.38 },
      { root, dur: 1 },
    ];
    let t = audioEngine.now();
    for (const c of chords) {
      const peak = c.dur >= 1 ? 0.22 : 0.18;
      tone(midiToFreq(c.root), t, c.dur, peak);
      tone(midiToFreq(c.root + thirdGap), t, c.dur, peak * 0.8);
      tone(midiToFreq(c.root + 7), t, c.dur, peak * 0.8);
      t += c.dur;
    }
  });
}

/** 打卡 / 徽章音效：五声音阶上行 jingle */
export function playJingle(): void {
  safePlay(() => {
    const scale = [0, 2, 4, 7, 9, 12];
    const base = noteToMidi('C', 5);
    const t0 = audioEngine.now();
    scale.forEach((s, i) => {
      tone(midiToFreq(base + s), t0 + i * 0.12, 0.16, 0.2);
    });
  });
}

/** 按钮按下：60ms 正弦 click */
export function playClick(): void {
  safePlay(() => {
    const ctx = audioEngine.context;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1046;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.12, t0 + 0.004);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 0.06);
    osc.connect(g);
    g.connect(audioEngine.master);
    osc.start(t0);
    osc.stop(t0 + 0.08);
  });
}

/** 设置音量 0..1 */
export function setVolume(v: number): void {
  audioEngine.setVolume(v);
}

/** 静音开关 */
export function setMuted(b: boolean): void {
  audioEngine.setMuted(b);
}
