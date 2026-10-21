/**
 * SVG 钢琴键盘组件：触控视窗（std = 1.5 八度 10 白 7 黑；wide = 2 八度 14 白 10 黑）。
 * 触控重设计：白键 36 单位（std 375px 屏≈32 CSS px）、黑键 22 单位（≈20 px），
 * 黑键热区左右 +6 / 下方 +12 盖住白键缝隙且命中优先；点滑连续选择、按压反馈、
 * 八度切换（‹ › 按钮 + 键盘左右边缘 24px 内水平滑动翻页）。
 * 视奏作答走 pressMode 独立手势分支（多指并发按下/抬起，不进 toggle/点滑路径）；
 * ensureRange 出题时把视窗平移到覆盖目标区间的 C 对齐窗口。
 * 标记（target/selected/correct/wrong/ghost）、键底小字标签沿用原体系。
 * midi↔音名换算与 audio/melody-synth.ts 的 noteToMidi 一致（C4=60）。
 */

import { h } from '../dom';
import type { PitchName } from '../../core/chord-theory';
import { keyAlterations, scaleNotes } from '../../core/scale-theory';
import type { ScaleKind } from '../../core/scale-theory';
import { playMelody } from '../../audio/melody-synth';
import { haptic } from '../../platform/haptics';

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
  /** 视窗起始 MIDI（1.5 八度 17 键），默认 48（C3） */
  startMidi?: number;
  /**
   * 八度切换跨度（兼容旧参数）：窗口起点在 [startMidi, startMidi+(octaves-1)*12] 内步进切换；
   * 缺省时默认 C2–C6（起点 36..84 步进 12，限幅）。
   */
  octaves?: number;
  /** 视窗几何：std=1.5 八度（缺省，零回归）；wide=2 八度满宽（视奏用） */
  view?: KeyboardView;
  marks?: KeyMark[];
  /** 键底小字：音名 / 音级（需 tonic+scale）/ 变化记号 */
  labels?: 'none' | 'degree' | 'noteName' | 'alteration';
  tonic?: { letter: string; acc: number };
  scale?: 'maj' | 'harmMin' | 'melMin';
  interactive?: boolean;
  onToggle?: (midi: number, on: boolean) => void;
  /**
   * 视奏作答手势（独立分支，多指并发）：按下/抬起只上报，不进 toggle 选中态，
   * 也不走点滑连选。onPress 缺省时内部播单音反馈。
   */
  pressMode?: boolean;
  /** 按下发声回调（缺省内部调 melody-synth 单音） */
  onPress?: (midi: number) => void;
  onPressDown?: (midi: number) => void;
  onPressUp?: (midi: number) => void;
  /** 八度（视窗）切换回调 */
  onViewChange?: (view: { startMidi: number; endMidi: number }) => void;
}

export interface PianoKeyboard {
  root: HTMLElement;
  /** 键盘 SVG（root 内层） */
  svg: SVGSVGElement;
  setMarks(marks: KeyMark[]): void;
  getSelected(): number[];
  setSelected(midis: number[]): void;
  setDisabled(b: boolean): void;
  /** 当前视窗音域（含端点 midi） */
  getViewRange(): { startMidi: number; endMidi: number };
  /** 切换八度：+1 下一个 / -1 上一个（限幅），返回是否真的切换 */
  shiftOctave(dir: number): boolean;
  /**
   * 保证 [loMidi,hiMidi] 在视窗内：不在则平移到覆盖该区间的 C 对齐窗口
   * （clamp C2–C6）并重绘；返回是否发生了移动。
   */
  ensureRange(loMidi: number, hiMidi: number): boolean;
  /** 八度指示旁提示（如「其他八度已选 N 键」），null 隐藏 */
  setHint(text: string | null): void;
  destroy(): void;
}

/* ---------- 几何常量（viewBox 单位）：按视窗查表 ---------- */

export const GEOMETRY = {
  /** std：1.5 八度触控视窗（10 白 7 黑），375px 屏白键 ≈32 CSS px */
  std: {
    /** 白键宽：375px 屏上 ≈32 CSS px（360px 屏宽时 36 CSS px） */
    WHITE_W: 36,
    WHITE_H: 110,
    BLACK_W: 22,
    BLACK_H: 68,
    VIEW_H: 130,
    /** 视窗白键数（1.5 八度） */
    VIEW_WHITE: 10,
    /** 视窗黑键数 */
    VIEW_BLACK: 7,
    /** 视窗总键数 */
    VIEW_KEYS: 17,
    /** viewBox 宽 = 10 × 36 */
    VIEW_W: 360,
    /** 黑键中心相对白键缝隙的右移 */
    BLACK_DX: 3,
    /** 黑键热区左右外扩 */
    HIT_PAD_X: 6,
    /** 黑键热区下延（盖住白键缝隙） */
    HIT_PAD_BOTTOM: 12,
  },
  /** wide：2 八度满宽视窗（14 白 10 黑，2-3-2 黑键分组），横屏键宽 ≈61px / 键高 ≈100px */
  wide: {
    WHITE_W: 36,
    WHITE_H: 62,
    BLACK_W: 22,
    BLACK_H: 40,
    VIEW_H: 76,
    VIEW_WHITE: 14,
    VIEW_BLACK: 10,
    /** 2 八度 24 键 */
    VIEW_KEYS: 24,
    /** viewBox 宽 = 14 × 36 */
    VIEW_W: 504,
    BLACK_DX: 3,
    HIT_PAD_X: 6,
    HIT_PAD_BOTTOM: 12,
  },
} as const;

export type KeyboardView = keyof typeof GEOMETRY;

type KeyGeometry = (typeof GEOMETRY)[KeyboardView];

/** 按视窗取几何（缺省 std） */
export function keyGeometry(view: KeyboardView = 'std'): KeyGeometry {
  return GEOMETRY[view];
}

/** 兼容导出：缺省（std）视窗几何，现值与原 KEY_GEOMETRY 一致 */
export const KEY_GEOMETRY = GEOMETRY.std;

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

/** 视窗键定义：startMidi 起按视窗取键数（std=17 键 10 白 7 黑；wide=24 键 2 八度） */
export function viewportKeyDefs(startMidi: number, view: KeyboardView = 'std'): PianoKeyDef[] {
  return pianoKeyDefs(startMidi, 2).slice(0, keyGeometry(view).VIEW_KEYS);
}

/* ---------- 命中矩形（可测性） ---------- */

export interface KeyHitRect {
  midi: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isBlack: boolean;
}

/** startMidi 起第几个白键（midi 所在 / 所贴的白键序号） */
function whiteIndexOf(midi: number, startMidi: number): number {
  let n = 0;
  for (let m = startMidi; m < midi; m++) {
    if (!midiToKeyDef(m).isBlack) n++;
  }
  return n;
}

/**
 * 键命中矩形（viewBox 单位）：白键 = 键面；
 * 黑键热区左右各 +6、下方 +12，盖住白键缝隙并压在白键之上（命中优先）。
 */
export function keyHitRect(midi: number, startMidi: number, view: KeyboardView = 'std'): KeyHitRect {
  const K = keyGeometry(view);
  const def = midiToKeyDef(midi);
  const wi = whiteIndexOf(midi, startMidi);
  if (!def.isBlack) {
    return {
      midi,
      x: wi * K.WHITE_W,
      y: 0,
      width: K.WHITE_W,
      height: K.WHITE_H,
      isBlack: false,
    };
  }
  return {
    midi,
    x: wi * K.WHITE_W + K.BLACK_DX - K.BLACK_W / 2 - K.HIT_PAD_X,
    y: 0,
    width: K.BLACK_W + K.HIT_PAD_X * 2,
    height: K.BLACK_H + K.HIT_PAD_BOTTOM,
    isBlack: true,
  };
}

/* ---------- 视窗对齐（ensureRange 的纯计算） ---------- */

/**
 * 覆盖 [loMidi,hiMidi] 的 C 对齐视窗起点。
 * 区间已在当前视窗（viewStart 起 keys 键）→ null（不移）；
 * 否则取含 loMidi 的 C 窗口，放不下时右移到含 hiMidi 的 C 窗口，
 * 最后 clamp 到 [minStart,maxStart]（缺省 C2–C6 起点 36..84）。
 */
export function cWindowStart(
  loMidi: number,
  hiMidi: number,
  viewStart: number,
  keys: number,
  minStart = 36,
  maxStart = 84,
): number | null {
  if (loMidi >= viewStart && hiMidi <= viewStart + keys - 1) return null;
  let start = Math.floor(loMidi / 12) * 12;
  if (hiMidi > start + keys - 1) start = Math.floor((hiMidi - (keys - 1)) / 12) * 12;
  return Math.min(maxStart, Math.max(minStart, start));
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
  selected: 'var(--accent)',
  correct: 'var(--good)',
  wrong: 'var(--bad)',
};

/** 短音反馈：复用 melody-synth 单音（选中播、撤销不播） */
function playKeyNote(midi: number): void {
  const def = midiToKeyDef(midi);
  try {
    playMelody([{ letter: def.letter, oct: def.oct, acc: def.acc, dur: 0.22 }], 120);
  } catch {
    // 音频不可用时静默
  }
}

interface KeyRefs {
  def: PianoKeyDef;
  g: SVGGElement;
  rect: SVGRectElement;
  text: SVGTextElement | null;
  baseFill: string;
  baseTextFill: string;
}

/** 黑键深紫渐变 defs（每个键盘实例唯一 id） */
let gradSeq = 0;

function appendKeyDefs(svg: SVGSVGElement, gradId: string): void {
  const defs = svgEl('defs', {});
  const grad = svgEl('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0.35', y2: '1' });
  grad.append(
    svgEl('stop', { offset: '0', style: 'stop-color: var(--key-black-1)' }),
    svgEl('stop', { offset: '1', style: 'stop-color: var(--key-black-2)' }),
  );
  defs.append(grad);
  svg.append(defs);
}

/** 手势状态：tap=点选 / slide=点滑连续选择 / edge=翻页候选 */
interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  startMidi: number | null;
  /** 起点在键盘左右边缘 24px 内（可能是翻页手势） */
  edge: boolean;
  /**
   * 'press'   起点键已选中（非边缘 pointerdown 立即选）
   * 'pending' 边缘区待判定（位移 ≤8px 仍算点击）
   * 'edge'    已进翻页模式（不再选键）
   * 'slide'   点滑连续选择
   */
  mode: 'press' | 'pending' | 'edge' | 'slide';
  lastMidi: number | null;
  flipped: boolean;
}

export function pianoKeyboard(opts: KeyboardOptions): PianoKeyboard {
  const initialStart = opts.startMidi ?? 48;
  const gradId = `pk-black-${++gradSeq}`;
  const view: KeyboardView = opts.view ?? 'std';
  const G = keyGeometry(view);
  // 八度切换范围：octaves 给定按旧跨度推导，缺省默认 C2–C6（限幅）
  const minStart = opts.octaves !== undefined ? initialStart : 36;
  const maxStart = opts.octaves !== undefined ? initialStart + (opts.octaves - 1) * 12 : 84;
  let viewStart = Math.min(maxStart, Math.max(minStart, initialStart));

  const selected = new Set<number>();
  let disabled = false;
  let refs: KeyRefs[] = [];
  let gesture: Gesture | null = null;
  /** pressMode：pointerId → 按下的键（多指并发，独立于 gesture 单指锁） */
  const pointers = new Map<number, number>();

  const svg = svgEl('svg', {
    viewBox: `0 0 ${G.VIEW_W} ${G.VIEW_H}`,
    class: opts.interactive ? 'piano is-interactive' : 'piano',
    role: 'group',
    'aria-label': '钢琴键盘',
    preserveAspectRatio: 'xMidYMid meet',
  });

  /* ---------- 八度切换条（‹ 音域 ›） ---------- */

  const rangeEl = h('span', { className: 'piano-bar__range' });
  const hintText = h('span', { className: 'piano-bar__hint-text' });
  const hintEl = h(
    'span',
    { className: 'piano-bar__hint', attrs: { hidden: '' } },
    h('span', { className: 'piano-bar__dot' }),
    hintText,
  );
  const prevBtn = h('button', {
    className: 'piano-bar__btn piano-bar__btn--prev',
    attrs: { type: 'button', 'aria-label': '上一个八度' },
    text: '‹',
    on: { click: () => void shiftOctave(-1) },
  });
  const nextBtn = h('button', {
    className: 'piano-bar__btn piano-bar__btn--next',
    attrs: { type: 'button', 'aria-label': '下一个八度' },
    text: '›',
    on: { click: () => void shiftOctave(1) },
  });
  const bar = h(
    'div',
    { className: 'piano-bar' },
    prevBtn,
    h('div', { className: 'piano-bar__center' }, rangeEl, hintEl),
    nextBtn,
  );
  const root = h('div', { className: 'piano-wrap' }, bar, svg);

  /* ---------- 键位渲染 ---------- */

  function addLabel(cap: SVGGElement, def: PianoKeyDef, cx: number, y: number, fill: string): SVGTextElement | null {
    const label = labelOf(def, opts);
    if (!label) return null;
    const text = svgEl('text', {
      class: 'pk__label',
      x: String(cx),
      y: String(y),
      'text-anchor': 'middle',
      'font-family': 'var(--sans)',
      'font-size': String(def.isBlack ? 9 : 10),
      fill,
    });
    text.textContent = label;
    cap.append(text);
    return text;
  }

  function buildKey(def: PianoKeyDef): KeyRefs {
    const K = G;
    const hitRect = keyHitRect(def.midi, viewStart, view);
    const faceX = def.isBlack ? hitRect.x + K.HIT_PAD_X : hitRect.x;
    const faceW = def.isBlack ? K.BLACK_W : K.WHITE_W;
    const faceH = def.isBlack ? K.BLACK_H : K.WHITE_H;
    // 玻璃键帽：白键 var(--glass) 半透明、黑键深紫渐变
    const baseFill = def.isBlack ? `url(#${gradId})` : 'var(--glass)';
    const baseTextFill = def.isBlack ? 'var(--key-black-ink)' : 'var(--ink)';

    const g = svgEl('g', {
      class: `pk ${def.isBlack ? 'pk--black' : 'pk--white'}`,
      'data-midi': String(def.midi),
    });
    const cap = svgEl('g', { class: 'pk__cap' });
    const rect = svgEl('rect', {
      class: 'pk__face',
      x: String(faceX),
      y: '0',
      width: String(faceW),
      height: String(faceH),
      fill: baseFill,
      stroke: 'var(--key-stroke)',
      'stroke-width': '1',
    });
    // 顶缘高光（按压时 150ms 扫过）
    const shine = svgEl('rect', {
      class: 'pk__shine',
      x: String(faceX),
      y: '0',
      width: String(faceW),
      height: '3',
      fill: 'var(--accent)',
    });
    cap.append(rect, shine);
    const text = addLabel(
      cap,
      def,
      faceX + faceW / 2,
      def.isBlack ? K.BLACK_H - 8 : K.WHITE_H - 7,
      baseTextFill,
    );
    // 透明热区：黑键左右 +6 / 下方 +12，盖住白键缝隙
    const hit = svgEl('rect', {
      class: 'pk__hit',
      x: String(hitRect.x),
      y: String(hitRect.y),
      width: String(hitRect.width),
      height: String(hitRect.height),
      fill: 'transparent',
    });
    g.append(cap, hit);
    svg.append(g);
    return { def, g, rect, text, baseFill, baseTextFill };
  }

  function render(): void {
    const defs = viewportKeyDefs(viewStart, view);
    svg.replaceChildren();
    appendKeyDefs(svg, gradId);
    refs = [];
    // 白键先铺、黑键后置：黑键命中优先于白键（z 序）
    for (const def of defs) if (!def.isBlack) refs.push(buildKey(def));
    for (const def of defs) if (def.isBlack) refs.push(buildKey(def));
    applyMarks();
    if (opts.pressMode) refreshPressed();
    rangeEl.textContent = `${keyDefName(defs[0], true)}–${keyDefName(defs[defs.length - 1], true)}`;
    updateBar();
  }

  function updateBar(): void {
    prevBtn.disabled = disabled || viewStart <= minStart;
    nextBtn.disabled = disabled || viewStart >= maxStart;
  }

  /* ---------- 标记 / 选中 ---------- */

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
        r.rect.setAttribute('stroke', 'var(--key-stroke)');
        r.rect.setAttribute('stroke-width', '1');
        r.rect.removeAttribute('stroke-dasharray');
      }
      if (r.text) {
        r.text.setAttribute('fill', fill === r.baseFill ? r.baseTextFill : 'var(--on-accent)');
        const label = mark?.label ?? labelOf(r.def, opts);
        if (label) r.text.textContent = label;
      }
    }
  }

  /** 选中 / 撤销：选中播短音，选中与撤销都给 light 震感 */
  function toggleMidi(midi: number): void {
    const on = !selected.has(midi);
    if (on) selected.add(midi);
    else selected.delete(midi);
    applyMarks();
    if (on) playKeyNote(midi);
    void haptic('light');
    opts.onToggle?.(midi, on);
  }

  /* ---------- 按压反馈 ---------- */

  function setPressed(midi: number | null): void {
    for (const r of refs) r.g.classList.toggle('is-pressed', midi !== null && r.def.midi === midi);
  }

  /* ---------- 视奏作答：多指按下（独立分支，不进 toggle / 点滑路径） ---------- */

  /** 按 pointers 集合恢复多键下沉视觉（重绘后也调用） */
  function refreshPressed(): void {
    const on = new Set(pointers.values());
    for (const r of refs) r.g.classList.toggle('is-pressed', on.has(r.def.midi));
  }

  function pressDown(e: PointerEvent): void {
    if (disabled || !opts.interactive) return;
    const midi = midiFromEventTarget(e);
    if (midi === null) return;
    e.preventDefault();
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // 指针捕获不可用时走 window 监听兜底
    }
    pointers.set(e.pointerId, midi);
    refreshPressed();
    if (opts.onPress) opts.onPress(midi);
    else playKeyNote(midi);
    void haptic('light');
    opts.onPressDown?.(midi);
  }

  function pressUp(e: PointerEvent): void {
    const midi = pointers.get(e.pointerId);
    if (midi === undefined) return;
    pointers.delete(e.pointerId);
    refreshPressed();
    opts.onPressUp?.(midi);
  }

  /* ---------- 手势：点选 / 点滑 / 边缘翻八度 ---------- */

  function midiFromEventTarget(e: PointerEvent): number | null {
    const el = e.target instanceof Element ? e.target.closest('[data-midi]') : null;
    return el && svg.contains(el) ? Number(el.getAttribute('data-midi')) : null;
  }

  function midiAtPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const hit = el instanceof Element ? el.closest('[data-midi]') : null;
    return hit && svg.contains(hit) ? Number(hit.getAttribute('data-midi')) : null;
  }

  function onPointerDown(e: PointerEvent): void {
    if (opts.pressMode) {
      pressDown(e);
      return;
    }
    if (disabled || !opts.interactive || gesture !== null) return;
    const midi = midiFromEventTarget(e);
    const rect = svg.getBoundingClientRect();
    // 键盘左右边缘 24px 内按下：可能是翻八度手势，先不选键
    const edge = e.clientX - rect.left <= 24 || rect.right - e.clientX <= 24;
    e.preventDefault();
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {
      // 指针捕获不可用时走 window 监听兜底
    }
    setPressed(midi);
    if (!edge && midi !== null) {
      toggleMidi(midi);
      gesture = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startMidi: midi, edge, mode: 'press', lastMidi: midi, flipped: false };
    } else {
      gesture = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startMidi: midi, edge, mode: 'pending', lastMidi: null, flipped: false };
    }
  }

  function onPointerMove(e: PointerEvent): void {
    const g = gesture;
    if (g === null || e.pointerId !== g.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    // 位移 >8px 才进手势模式，未超仍按点击处理
    if (g.mode === 'pending') {
      if (Math.hypot(dx, dy) <= 8) return;
      g.mode = g.edge ? 'edge' : 'slide';
    }
    if (g.mode === 'edge') {
      // 翻八度：水平位移 >40px 且倾角 <15°
      if (!g.flipped && Math.abs(dx) > 40 && Math.atan2(Math.abs(dy), Math.abs(dx)) < Math.PI / 12) {
        g.flipped = true;
        shiftOctave(dx < 0 ? 1 : -1);
      }
      return;
    }
    // 点滑连续选择：命中新键即 toggle（同键划回可撤销）
    g.mode = 'slide';
    const midi = midiAtPoint(e.clientX, e.clientY);
    if (midi !== null && midi !== g.lastMidi) {
      toggleMidi(midi);
      g.lastMidi = midi;
      setPressed(midi);
    }
  }

  function endGesture(e: PointerEvent, tap: boolean): void {
    const g = gesture;
    if (g === null || e.pointerId !== g.pointerId) return;
    const dist = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
    if (tap && g.mode === 'pending' && dist <= 8 && g.startMidi !== null) toggleMidi(g.startMidi);
    setPressed(null);
    gesture = null;
  }

  const onPointerUp = (e: PointerEvent): void => {
    if (opts.pressMode) {
      pressUp(e);
      return;
    }
    endGesture(e, true);
  };
  const onPointerCancel = (e: PointerEvent): void => {
    if (opts.pressMode) {
      pressUp(e);
      return;
    }
    endGesture(e, false);
  };

  if (opts.interactive) {
    svg.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
  }

  /* ---------- 八度切换 ---------- */

  function getViewRange(): { startMidi: number; endMidi: number } {
    return { startMidi: viewStart, endMidi: viewStart + G.VIEW_KEYS - 1 };
  }

  function shiftOctave(dir: number): boolean {
    const next = Math.min(maxStart, Math.max(minStart, viewStart + dir * 12));
    if (next === viewStart) return false;
    viewStart = next;
    setPressed(null);
    render();
    opts.onViewChange?.(getViewRange());
    return true;
  }

  function ensureRange(loMidi: number, hiMidi: number): boolean {
    const next = cWindowStart(loMidi, hiMidi, viewStart, G.VIEW_KEYS, minStart, maxStart);
    if (next === null || next === viewStart) return false;
    viewStart = next;
    setPressed(null);
    render();
    opts.onViewChange?.(getViewRange());
    return true;
  }

  render();

  return {
    root,
    svg,
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
      updateBar();
    },
    getViewRange,
    shiftOctave,
    ensureRange,
    setHint(text: string | null): void {
      hintText.textContent = text ?? '';
      hintEl.hidden = text === null;
    },
    destroy(): void {
      if (opts.interactive) {
        svg.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
      }
      gesture = null;
      pointers.clear();
      root.remove();
    },
  };
}
