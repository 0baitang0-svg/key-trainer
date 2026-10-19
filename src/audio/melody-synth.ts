/**
 * 三角波旋律合成：曲目动机播放用（零素材文件，纯合成）。
 */

import { audioEngine } from './engine';
import { T_LET, T_OCT } from '../core/music-theory';

/** 旋律音符：给 letter+oct+acc，或给谱面 step（按高音谱号解读） */
export interface SynthNote {
  /** 谱面位置 0..8（无 letter 时按高音谱号解读） */
  step?: number;
  /** 音名字母（大写） */
  letter?: string;
  /** 八度 */
  oct: number;
  /** 临时记号：1=♯ / -1=♭ / 0=原位 */
  acc?: number;
  /** 时值（拍） */
  dur: number;
}

const LETTER_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 音名 → MIDI 号 */
export function noteToMidi(letter: string, oct: number, acc = 0): number {
  const semi = LETTER_SEMI[letter.toUpperCase()];
  if (semi === undefined) throw new RangeError(`未知音名 ${letter}`);
  return (oct + 1) * 12 + semi + acc;
}

/** MIDI 号 → 频率（A4=440Hz，十二平均律） */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 音名 + 八度 → 频率（如 nameToFreq('C♯', 4)） */
export function nameToFreq(name: string, oct: number): number {
  const letter = name[0];
  const acc = name.includes('♯') || name.includes('#') ? 1 : name.includes('♭') || name.includes('b') ? -1 : 0;
  return midiToFreq(noteToMidi(letter, oct, acc));
}

function freqOf(note: SynthNote): number {
  if (note.letter) return midiToFreq(noteToMidi(note.letter, note.oct, note.acc ?? 0));
  const step = Math.min(8, Math.max(0, note.step ?? 0));
  return midiToFreq(noteToMidi(T_LET[step], T_OCT[step], note.acc ?? 0));
}

/**
 * 播放三角波旋律。
 * @param notes 音符列表（dur 单位为拍）
 * @param bpm   每分钟拍数
 * @returns 旋律总时长（秒）
 */
export function playMelody(notes: ReadonlyArray<SynthNote>, bpm: number): number {
  const beat = 60 / Math.max(1, bpm);
  const ctx = audioEngine.context;
  const master = audioEngine.master;
  const t0 = ctx.currentTime;
  let t = t0;
  for (const n of notes) {
    const dur = Math.max(0.05, n.dur * beat);
    const osc = audioEngine.createOsc(freqOf(n));
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.012);
    gain.gain.linearRampToValueAtTime(0.15, t + Math.min(0.09, dur * 0.4));
    gain.gain.setValueAtTime(0.15, t + Math.max(0.02, dur - 0.05));
    gain.gain.linearRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    t += dur;
  }
  return t - t0;
}
