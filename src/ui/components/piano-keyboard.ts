/**
 * SVG 钢琴键盘组件：白键等宽矩形 + 黑键 2-3-2 分组贴白键缝隙。
 * 支持标记（target/selected/correct/wrong/ghost）、键底小字标签与点选 toggle。
 * midi↔音名换算与 audio/melody-synth.ts 的 noteToMidi 一致（C4=60）。
 */

import type { PitchName } from '../../core/chord-theory';
import { keyAlterations, scaleNotes } from '../../core/scale-theory';
import type { ScaleKind } from '../../core/scale-theory';

export interface PianoKeyDef {
  midi: number;
  letter: string;
  acc: number;
  oct: number;
  isBlack: boolean;
}

export type KeyMarkKind = 'target' | 'selected' | 'correct' | 'wrong' | 'ghost';

export interface KeyMark {
  midi: number;
  kind: KeyMarkKind;
  label?: string;
}

export interface KeyboardOptions {
  /** 起始 MIDI 号，默认 48（C3） */
  startMidi?: number;
  /** 八度数：2（默认）/ 3（拼和弦用） */
  octaves?: number;
  marks?: KeyMark[];
  /** 键底小字：音名 / 音级（需 tonic+scale）/ 变化记号 */
  labels?: 'none' | 'degree' | 'noteName' | 'alteration';
  tonic?: { letter: string; acc: number };
  scale?: 'maj' | 'harmMin' | 'melMin';
  interactive?: boolean;
  onToggle?: (midi: number, on: boolean) => void;
}

export interface PianoKeyboard {
  root: SVGSVGElement;
  setMarks(marks: KeyMark[]): void;
  getSelected(): number[];
  setSelected(midis: number[]): void;
  setDisabled(b: boolean): void;
  destroy(): void;
}

/* ---------- 几何常量（viewBox 单位） ---------- */

const WHITE_W = 22;
const WHITE_H = 110;
const BLACK_W = 13;
const BLACK_H = 68;
const VIEW_H = 130;

/* ---------- midi ↔ 音名 ---------- */

/** 半音 0..11 → 自然字母 / 升号拼写 */
const PC_LETTER = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const PC_ACC = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];

/** MIDI 号 → 键定义（黑键用升号拼写：61 → C♯4） */
export function midiToKeyDef(midi: number): PianoKeyDef {
  const pc = ((midi % 12) + 12) % 12;
  return {
    midi,
    letter: PC_LETTER[pc],
    acc: PC_ACC[pc],
    oct: Math.floor(midi / 12) - 1,
    isBlack: PC_ACC[pc] !== 0,
  };
}

const ACC_CHAR = ['♮', '♯', '𝄪', '♭', '𝄫'];

function accChar(acc: number): string {
  if (acc === 0) return '';
  return acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc);
}

/** 键定义 → 显示音名：'C' / 'C♯'；withOct 时带八度（'C♯4'） */
export function keyDefName(d: PianoKeyDef, withOct = false): string {
  return d.letter + accChar(d.acc) + (withOct ? String(d.oct) : '');
}

/**
 * 起始 MIDI 起连续 octaves 个八度的键定义（每八度 12 键）。
 * 例：pianoKeyDefs(48, 2) → 24 键（14 白 10 黑）。
 */
export function pianoKeyDefs(startMidi: number, octaves: number): PianoKeyDef[] {
  const defs: PianoKeyDef[] = [];
  for (let i = 0; i < octaves * 12; i++) defs.push(midiToKeyDef(startMidi + i));
  return defs;
}

/* ---------- 标签 ---------- */

/** 'degree' 标签：音级 1-7 带 ♯/♭/♮（按字母对齐调内音级，记号取该键实际拼写） */
function degreeLabel(def: PianoKeyDef, tonic: PitchName, kind: ScaleKind): string {
  const notes = scaleNotes(tonic, kind);
  const idx = notes.findIndex((n) => n.letter === def.letter);
  if (idx < 0) return '';
  const alt = keyAlterations(tonic, kind)[idx];
  const sign = def.acc !== 0 ? ACC_CHAR[def.acc > 0 ? 1 : 3] : alt.altered ? '♮' : '';
  return String(idx + 1) + sign;
}

function labelOf(def: PianoKeyDef, opts: KeyboardOptions): string {
  switch (opts.labels ?? 'none') {
    case 'noteName':
      return keyDefName(def);
    case 'alteration':
      return def.acc > 0 ? '♯' : def.acc < 0 ? '♭' : '♮';
    case 'degree':
      return opts.tonic && opts.scale ? degreeLabel(def, opts.tonic, opts.scale) : '';
    default:
      return '';
  }
}

/* ---------- SVG 构建 ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const MARK_FILL: Partial<Record<KeyMarkKind, string>> = {
  selected: 'var(--ink)',
  correct: '#2E7D4F',
  wrong: '#B5402D',
};

interface KeyRefs {
  def: PianoKeyDef;
  rect: SVGRectElement;
  text: SVGTextElement | null;
  baseFill: string;
  baseTextFill: string;
}

export function pianoKeyboard(opts: KeyboardOptions): PianoKeyboard {
  const startMidi = opts.startMidi ?? 48;
  const octaves = opts.octaves ?? 2;
  const defs = pianoKeyDefs(startMidi, octaves);
  const whiteDefs = defs.filter((d) => !d.isBlack);
  const width = whiteDefs.length * WHITE_W;

  const root = svgEl('svg', {
    viewBox: `0 0 ${width} ${VIEW_H}`,
    class: 'piano',
    role: 'group',
    'aria-label': '钢琴键盘',
    preserveAspectRatio: 'xMidYMid meet',
  });

  const selected = new Set<number>();
  let disabled = false;
  const refs: KeyRefs[] = [];

  // 白键按序等宽铺开；黑键贴在前一个白键的右缝隙（2-3-2 分组自然形成）
  let whiteIndex = 0;
  for (const def of defs) {
    if (def.isBlack) {
      const x = whiteIndex * WHITE_W - BLACK_W * 0.5 + 2;
      const rect = svgEl('rect', {
        class: 'pk__face',
        x: String(x),
        y: '0',
        width: String(BLACK_W),
        height: String(BLACK_H),
        fill: 'var(--ink)',
        stroke: 'var(--ink)',
        'stroke-width': '1',
      });
      // 透明热区扩大点击范围
      const hit = svgEl('rect', {
        class: 'pk__hit',
        x: String(x - 4),
        y: '0',
        width: String(BLACK_W + 8),
        height: String(BLACK_H + 12),
        fill: 'transparent',
      });
      const g = svgEl('g', { class: 'pk pk--black', 'data-midi': String(def.midi) });
      g.append(rect, hit);
      const text = addLabel(g, def, x + BLACK_W / 2, BLACK_H - 8, 'var(--card)');
      root.append(g);
      refs.push({ def, rect, text, baseFill: 'var(--ink)', baseTextFill: 'var(--card)' });
      if (opts.interactive) bindToggle(g, def.midi);
    } else {
      const x = whiteIndex * WHITE_W;
      const rect = svgEl('rect', {
        class: 'pk__face',
        x: String(x),
        y: '0',
        width: String(WHITE_W),
        height: String(WHITE_H),
        fill: 'var(--card)',
        stroke: 'var(--ink)',
        'stroke-width': '1',
      });
      const g = svgEl('g', { class: 'pk pk--white', 'data-midi': String(def.midi) });
      g.append(rect);
      const text = addLabel(g, def, x + WHITE_W / 2, WHITE_H - 7, 'var(--ink)');
      root.append(g);
      refs.push({ def, rect, text, baseFill: 'var(--card)', baseTextFill: 'var(--ink)' });
      whiteIndex++;
      if (opts.interactive) bindToggle(g, def.midi);
    }
  }

  function addLabel(g: SVGGElement, def: PianoKeyDef, cx: number, y: number, fill: string): SVGTextElement | null {
    const label = labelOf(def, opts);
    if (!label) return null;
    const text = svgEl('text', {
      class: 'pk__label',
      x: String(cx),
      y: String(y),
      'text-anchor': 'middle',
      'font-family': 'var(--sans)',
      'font-size': String(def.isBlack ? 8 : 9),
      fill,
    });
    text.textContent = label;
    g.append(text);
    return text;
  }

  function bindToggle(g: SVGGElement, midi: number): void {
    g.addEventListener('click', () => {
      if (disabled) return;
      const on = !selected.has(midi);
      if (on) selected.add(midi);
      else selected.delete(midi);
      applyMarks();
      opts.onToggle?.(midi, on);
    });
  }

  let marks: KeyMark[] = opts.marks ?? [];

  /** 标记样式：外部 marks 优先，其次内部选中态 */
  function applyMarks(currentMarks: KeyMark[] = marks): void {
    const markMap = new Map<number, KeyMark>();
    for (const m of currentMarks) markMap.set(m.midi, m);
    for (const r of refs) {
      const mark = markMap.get(r.def.midi);
      const kind: KeyMarkKind | undefined = mark ? mark.kind : selected.has(r.def.midi) ? 'selected' : undefined;
      const fill = kind ? MARK_FILL[kind] ?? r.baseFill : r.baseFill;
      r.rect.setAttribute('fill', fill);
      if (kind === 'target') {
        r.rect.setAttribute('stroke', 'var(--accent)');
        r.rect.setAttribute('stroke-width', '2.4');
      } else if (kind === 'ghost') {
        r.rect.setAttribute('stroke', 'var(--muted)');
        r.rect.setAttribute('stroke-width', '1.6');
        r.rect.setAttribute('stroke-dasharray', '3 3');
      } else {
        r.rect.setAttribute('stroke', 'var(--ink)');
        r.rect.setAttribute('stroke-width', '1');
        r.rect.removeAttribute('stroke-dasharray');
      }
      if (r.text) {
        r.text.setAttribute('fill', fill === r.baseFill ? r.baseTextFill : 'var(--card)');
        const label = mark?.label ?? labelOf(r.def, opts);
        if (label) r.text.textContent = label;
      }
    }
  }

  applyMarks();

  return {
    root,
    setMarks(next: KeyMark[]): void {
      marks = next;
      applyMarks(marks);
    },
    getSelected(): number[] {
      return [...selected].sort((a, b) => a - b);
    },
    setSelected(midis: number[]): void {
      selected.clear();
      for (const m of midis) selected.add(m);
      applyMarks(marks);
    },
    setDisabled(b: boolean): void {
      disabled = b;
      root.classList.toggle('is-disabled', b);
    },
    destroy(): void {
      root.remove();
    },
  };
}
