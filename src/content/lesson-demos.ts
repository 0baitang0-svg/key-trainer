/**
 * 微课动画演示脚本（v0.1.5 第 1 批：纯脚本数据，播放器下一批实现）。
 * 每个 demo = 一串按序播放的步骤（文案 + 谱面 / 视奏串 / 吉祥物 / 停留时长）。
 */

import type { PlaySeq } from '../core/seq-generator';

export interface DemoStep {
  /** 步文案（画面解说词） */
  text: string;
  /**
   * 本步谱面参数（与 StaffViewOptions 子集兼容，实现方传给 staffView；
   * 视奏步用它携带 clef/type/n 调号上下文）。
   * 播放器约定：缺省（undefined）= 沿用上一步谱面；给定 = 整体替换上一步谱面。
   */
  staff?: {
    clef: 'treble' | 'bass';
    type: 'sh' | 'fl';
    n: number;
    /** 高亮第 k 个升降号（0 起索引） */
    accent?: number;
    notes?: Array<{ step: number; acc?: number }>;
  };
  /** 视奏串演示（当前拍点 + 判题状态） */
  seq?: {
    seq: PlaySeq;
    current?: number;
    state?: 'done' | 'miss';
  };
  mascot?: 'neutral' | 'thinking' | 'happy' | 'oops' | 'cheer';
  /** 本步停留时长（ms；缺省由播放器取默认值） */
  ms?: number;
}

export interface LessonDemo {
  id: string;
  label: string;
  steps: DemoStep[];
}

/* ---------- demo-key-sh：升号直读（3♯ → A 大调） ---------- */

const DEMO_KEY_SH: LessonDemo = {
  id: 'demo-key-sh',
  label: '看动画 · 升号直读',
  steps: [
    { text: '3 个升号：F♯ C♯ G♯', staff: { clef: 'treble', type: 'sh', n: 3 }, mascot: 'thinking', ms: 1600 },
    { text: '看最右：G♯', staff: { clef: 'treble', type: 'sh', n: 3, accent: 2 }, ms: 1500 },
    { text: 'G♯ 再升半音 = A → 主音', staff: { clef: 'treble', type: 'sh', n: 3, accent: 2 }, ms: 1600 },
    {
      text: '= A 大调；同号小调 a',
      staff: { clef: 'treble', type: 'sh', n: 3, notes: [{ step: 3 }] }, // A4 第2间落谱
      mascot: 'happy',
      ms: 2000,
    },
  ],
};

/* ---------- demo-key-fl：降号直读（2♭ → B♭ 大调 + 1♭ 特例） ---------- */

const DEMO_KEY_FL: LessonDemo = {
  id: 'demo-key-fl',
  label: '看动画 · 降号直读',
  steps: [
    { text: '2 个降号：B♭ E♭', staff: { clef: 'treble', type: 'fl', n: 2 }, mascot: 'thinking' },
    // n=2 时倒数第二个降号 index = n-2 = 0 → 高亮第一个（B♭）
    { text: '倒数第二个：B♭', staff: { clef: 'treble', type: 'fl', n: 2, accent: 0 } },
    { text: '倒数第二个降号本身就是主音' }, // staff 缺省 = 沿用上一步（accent:0 保持）
    { text: '= B♭ 大调', staff: { clef: 'treble', type: 'fl', n: 2, notes: [{ step: 4, acc: -1 }] }, mascot: 'happy' }, // B♭4 第3线
    { text: '特例：只有 1 个降号（B♭）= F 大调' }, // 纯文案步：沿用上一步谱面
  ],
};

/* ---------- demo-seq-bar：记号跟小节走 ---------- */

/**
 * 手写视奏串（type:'fl' n:0 无调号 → F4 天然 = 65）：
 * 拍0 F♯4=66 mark1 首现 → 拍1 A4 → 拍2 同小节 F4 无 mark → 拍3 G4 →
 * 拍4 跨小节 F4 无 mark 还原 → 拍5 C5。
 * step 高音基准：F4=1 G4=2 A4=3 C5=5。
 */
const SEQ_BAR: PlaySeq = {
  notes: [
    { step: 1, mark: 1, midis: [66], bar: 0 },
    { step: 3, midis: [69], bar: 0 },
    { step: 1, midis: [66], bar: 0 },
    { step: 2, midis: [67], bar: 0 },
    { step: 1, midis: [65], bar: 1 },
    { step: 5, midis: [72], bar: 1 },
  ],
  bars: [0, 4],
  loMidi: 65,
  hiMidi: 72,
};

const DEMO_SEQ_BAR: LessonDemo = {
  id: 'demo-seq-bar',
  label: '看动画 · 记号跟小节走',
  steps: [
    // staff 只在首步给一次：携带 seq 视图的 clef/type/n（0 降号无调号），后续步沿用
    { text: '第 1 拍 F 画了 ♯，本小节它说了算', staff: { clef: 'treble', type: 'fl', n: 0 }, seq: { seq: SEQ_BAR, current: 0 }, mascot: 'thinking' },
    { text: '同小节再遇 F：不画记号，照样弹 ♯', seq: { seq: SEQ_BAR, current: 2, state: 'done' } },
    { text: '跨过小节线：记号失效，F 回调号原样', seq: { seq: SEQ_BAR, current: 4 } },
    { text: '记号跟小节走：同小节延续、新小节还原', seq: { seq: SEQ_BAR, current: 4 }, mascot: 'happy' },
  ],
};

/** 全部演示脚本（key = demo id，与 MicroLesson.demos 引用对应） */
export const DEMOS: Record<string, LessonDemo> = {
  'demo-key-sh': DEMO_KEY_SH,
  'demo-key-fl': DEMO_KEY_FL,
  'demo-seq-bar': DEMO_SEQ_BAR,
};

/** 按 id 取演示脚本（未知 id 返回 undefined） */
export function getDemo(id: string): LessonDemo | undefined {
  return DEMOS[id];
}
