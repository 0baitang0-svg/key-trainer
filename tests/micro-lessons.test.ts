import { describe, expect, it } from 'vitest';
import {
  LESSONS,
  LESSON_ORDER,
  getLesson,
  moduleForQuestion,
  remapLegacySeenKeys,
  type LessonId,
} from '../src/content/micro-lessons';
import { DEMOS, getDemo } from '../src/content/lesson-demos';
import { migrate } from '../src/core/store';
import type { QKind, Question } from '../src/core/question-generator';
import type { PlaySeq } from '../src/core/seq-generator';

/** 构造最小题目（只填归属判定需要的字段） */
function q(partial: Partial<Question>): Question {
  return { id: 'q1', train: 'sig', type: 'sh', n: 3, clef: 'treble', ask: 'maj', options: [], ...partial };
}

const EMPTY_SEQ: PlaySeq = { notes: [], bars: [], loMidi: 0, hiMidi: 0 };

describe('moduleForQuestion 归属', () => {
  it('sig / piece 认调题（无 cq 无 seq）→ mc|key', () => {
    expect(moduleForQuestion(q({ train: 'sig' }))).toBe('mc|key');
    expect(moduleForQuestion(q({ train: 'piece', pieceId: 'p1', pieceKind: 'listen' }))).toBe('mc|key');
  });

  it('视奏串题（q.seq）→ mc|seq，且优先于 cq 判定', () => {
    expect(moduleForQuestion(q({ train: 'note', seq: EMPTY_SEQ }))).toBe('mc|seq');
    expect(moduleForQuestion(q({ train: 'note', seq: EMPTY_SEQ, cq: { kind: 'deg2note' } }))).toBe('mc|seq');
  });

  it('12 个 QKind 各构造一题断言归属（表穷尽全部题型）', () => {
    const table: Array<[QKind, LessonId]> = [
      ['dom-key', 'mc|chord-func'],
      ['key-dom', 'mc|chord-func'],
      ['listen-func', 'mc|chord-func'],
      ['deg2chord', 'mc|chord-func'],
      ['chord2deg', 'mc|chord-func'],
      ['chord2func', 'mc|chord-func'],
      ['key2acc', 'mc|deg'],
      ['deg2note', 'mc|deg'],
      ['acc2key', 'mc|deg'],
      ['build-notes', 'mc|chord-build'],
      ['build-mc', 'mc|chord-build'],
      ['notes2quality', 'mc|chord-build'],
    ];
    const allKinds: QKind[] = [
      'dom-key', 'key-dom', 'listen-func', 'deg2chord', 'chord2deg', 'chord2func',
      'key2acc', 'deg2note', 'acc2key', 'build-notes', 'build-mc', 'notes2quality',
    ];
    expect(table.map(([kind]) => kind).sort()).toEqual([...allKinds].sort());
    for (const [kind, want] of table) {
      expect(moduleForQuestion(q({ cq: { kind } }))).toBe(want);
    }
  });

  it('kind 优先于 scale（harmMin / melMin 的 scale 不改 kind 归属）', () => {
    expect(moduleForQuestion(q({ cq: { kind: 'dom-key', scale: 'harmMin' } }))).toBe('mc|chord-func');
    expect(moduleForQuestion(q({ cq: { kind: 'key2acc', scale: 'harmMin' } }))).toBe('mc|deg');
    expect(moduleForQuestion(q({ cq: { kind: 'deg2note', scale: 'melMin' } }))).toBe('mc|deg');
  });
});

describe('remapLegacySeenKeys 旧卡重映射', () => {
  it('调号卡 rc|… 任意后缀 → mc|key', () => {
    expect(remapLegacySeenKeys(['rc|sh|3|maj', 'rc|fl|1|min', 'rc|sh|0|maj'])).toEqual(['mc|key']);
  });

  it('视奏卡 rcq|bar / rcq|scroll → mc|seq', () => {
    expect(remapLegacySeenKeys(['rcq|bar', 'rcq|scroll'])).toEqual(['mc|seq']);
  });

  it('功能类 rcq|dom* / harmMin* / melMin* → mc|chord-func；rcq|func 额外产出 mc|deg', () => {
    expect(remapLegacySeenKeys(['rcq|dom'])).toEqual(['mc|chord-func']);
    expect(remapLegacySeenKeys(['rcq|harmMin'])).toEqual(['mc|chord-func']);
    expect(remapLegacySeenKeys(['rcq|melMin'])).toEqual(['mc|chord-func']);
    expect(remapLegacySeenKeys(['rcq|func'])).toEqual(['mc|chord-func', 'mc|deg']);
  });

  it('构建卡 rcq|build* → mc|chord-build', () => {
    expect(remapLegacySeenKeys(['rcq|build'])).toEqual(['mc|chord-build']);
  });

  it('非 legacy（mc| 开头 / 未知 key）原样保留', () => {
    expect(remapLegacySeenKeys(['mc|key', 'mc|deg', 'weird-key'])).toEqual(['mc|key', 'mc|deg', 'weird-key']);
  });

  it('输出去重、顺序稳定、映射后无 rc| / rcq| 残留', () => {
    const input = ['rc|sh|3|maj', 'rc|fl|2|maj', 'rcq|func', 'rcq|bar', 'rcq|func', 'mc|deg'];
    const out = remapLegacySeenKeys(input);
    expect(out).toEqual(['mc|key', 'mc|chord-func', 'mc|deg', 'mc|seq']);
    expect(out.every((k) => !k.startsWith('rc|') && !k.startsWith('rcq|'))).toBe(true);
    expect(remapLegacySeenKeys(input)).toEqual(out); // 同输入同输出
  });

  it('幂等：跑两遍结果相同', () => {
    const input = ['rc|sh|3|maj', 'rcq|func', 'rcq|build', 'rcq|bar', 'mc|seq'];
    const once = remapLegacySeenKeys(input);
    expect(remapLegacySeenKeys(once)).toEqual(once);
  });
});

describe('微课结构', () => {
  it('5 课 id / 课序 / eyebrow / title / secs 完整', () => {
    expect(LESSON_ORDER).toEqual(['mc|key', 'mc|seq', 'mc|chord-func', 'mc|chord-build', 'mc|deg']);
    expect(Object.keys(LESSONS)).toEqual(LESSON_ORDER);
    LESSON_ORDER.forEach((id, i) => {
      const lesson = LESSONS[id];
      expect(lesson.id).toBe(id);
      expect(lesson.no).toBe(i + 1);
      expect(lesson.eyebrow).toContain(`微课 ${i + 1} / 5`);
      expect(lesson.title.length).toBeGreaterThan(0);
      expect(lesson.secs.length).toBeGreaterThan(0);
      for (const sec of lesson.secs) {
        expect(sec.heading.length).toBeGreaterThan(0);
        // 每节至少有条目或示例
        expect(sec.lines.length > 0 || (sec.example?.length ?? 0) > 0).toBe(true);
        for (const line of sec.lines) expect(line.length).toBeGreaterThan(0);
      }
    });
  });

  it('getLesson 命中 / 未知 id', () => {
    expect(getLesson('mc|key')?.title).toBe('读调号直读');
    expect(getLesson('mc|deg')?.no).toBe(5);
    expect(getLesson('nope')).toBeUndefined();
  });

  it('课里引用的 demo 都在 DEMOS 且 label 一致', () => {
    const refs: string[] = [];
    for (const id of LESSON_ORDER) {
      for (const ref of LESSONS[id].demos ?? []) {
        refs.push(ref.id);
        const demo = DEMOS[ref.id];
        expect(demo).toBeDefined();
        expect(demo.label).toBe(ref.label);
      }
    }
    expect(refs).toEqual(['demo-key-sh', 'demo-key-fl', 'demo-seq-bar']);
  });
});

describe('演示脚本', () => {
  it('3 个 demo、每步 3~5 步、文案非空；getDemo 命中 / 未知 id', () => {
    expect(Object.keys(DEMOS).sort()).toEqual(['demo-key-fl', 'demo-key-sh', 'demo-seq-bar']);
    for (const demo of Object.values(DEMOS)) {
      expect(demo.id.length).toBeGreaterThan(0);
      expect(demo.steps.length).toBeGreaterThanOrEqual(3);
      expect(demo.steps.length).toBeLessThanOrEqual(5);
      for (const step of demo.steps) expect(step.text.length).toBeGreaterThan(0);
    }
    expect(getDemo('demo-key-sh')?.steps.length).toBe(4);
    expect(getDemo('demo-key-fl')?.steps.length).toBe(5);
    expect(getDemo('nope')).toBeUndefined();
  });

  it('demo-seq-bar 的 PlaySeq 合法（小节对齐 + 记号规则 + 音域）', () => {
    const demo = getDemo('demo-seq-bar');
    expect(demo).toBeDefined();
    const seq = demo!.steps[0].seq!.seq;

    // bars 严格递增
    for (let i = 1; i < seq.bars.length; i++) expect(seq.bars[i]).toBeGreaterThan(seq.bars[i - 1]);
    // notes[i].bar 与 bars 对齐（bars[b] ≤ i < bars[b+1]）
    seq.notes.forEach((note, i) => {
      let bar = -1;
      for (let b = seq.bars.length - 1; b >= 0; b--) {
        if (i >= seq.bars[b]) {
          bar = b;
          break;
        }
      }
      expect(note.bar).toBe(bar);
    });

    // bar0 的 F(step1)：首现画 ♯（mark=1，弹 66）；同小节第二个 F 不画记号但照样弹 ♯（延续=66）
    const bar0F = seq.notes.filter((nt) => nt.bar === 0 && nt.step === 1);
    expect(bar0F).toHaveLength(2);
    expect(bar0F[0].mark).toBe(1);
    expect([...bar0F[0].midis]).toEqual([66]);
    expect(bar0F[1].mark).toBeUndefined();
    expect([...bar0F[1].midis]).toEqual([66]);
    // bar1 的 F：跨小节还原，无 mark（无调号原样=65）
    const bar1F = seq.notes.filter((nt) => nt.bar === 1 && nt.step === 1);
    expect(bar1F).toHaveLength(1);
    expect(bar1F[0].mark).toBeUndefined();
    expect([...bar1F[0].midis]).toEqual([65]);

    // lo/hi 覆盖全串；步骤 current 拍点都在串内
    const midis = seq.notes.flatMap((nt) => [...nt.midis]);
    expect(Math.min(...midis)).toBe(seq.loMidi);
    expect(Math.max(...midis)).toBe(seq.hiMidi);
    for (const step of demo!.steps) {
      if (step.seq?.current !== undefined) expect(step.seq.current).toBeLessThan(seq.notes.length);
    }
  });
});

describe('migrate seenKeys 重映射（幂等）', () => {
  it('旧 rc| / rcq| key 迁移为 mc|，新 key 原样保留', () => {
    const s = migrate({ seenKeys: ['rc|sh|3|maj', 'rcq|bar', 'rcq|func', 'rcq|build', 'mc|deg'] });
    expect(s.seenKeys).toEqual(['mc|key', 'mc|seq', 'mc|chord-func', 'mc|deg', 'mc|chord-build']);
  });

  it('migrate 跑两遍结果一致', () => {
    const raw = JSON.stringify({ seenKeys: ['rc|fl|2|min', 'rcq|scroll', 'rcq|dom'] });
    const once = migrate(raw);
    expect(once.seenKeys).toEqual(['mc|key', 'mc|seq', 'mc|chord-func']);
    const twice = migrate(JSON.parse(JSON.stringify(once)));
    expect(twice.seenKeys).toEqual(once.seenKeys);
    expect(migrate(once).seenKeys).toEqual(once.seenKeys);
  });
});
