import { describe, expect, it } from 'vitest';
import {
  BADGES,
  BUILD_BADGE_NEED,
  DOM_KEY_BADGE_NEED,
  MODE_TRIO_NEED,
  checkBadges,
} from '../src/content/badges';
import { createInitialState, type AppState } from '../src/core/store';
import { emptyItemStat, itemKey, type ItemStat } from '../src/core/stats';
import { chordItemExtra, CHORD_TRAIN_KINDS, type QKind, type TrainMode } from '../src/core/question-generator';
import type { ScaleKind } from '../src/core/scale-theory';

function stateWith(items: Record<string, Partial<ItemStat>>): AppState {
  const base = createInitialState();
  const merged: Record<string, ItemStat> = {};
  for (const [k, v] of Object.entries(items)) merged[k] = { ...emptyItemStat(), ...v };
  return { ...base, stats: { items: merged, records: [] } };
}

function trainOf(kind: QKind): TrainMode {
  for (const t of ['func', 'diatonic', 'degrees', 'build'] as const) {
    if (CHORD_TRAIN_KINDS[t].includes(kind)) return t;
  }
  return 'func';
}

function keyOf(kind: QKind, scale?: ScaleKind): string {
  return itemKey(trainOf(kind), 'sh', 1, 'treble', 'maj', chordItemExtra(kind, scale));
}

const ids = (s: AppState): string[] => checkBadges(s).map((b) => b.id);

describe('新徽章：dom-keys-30 属七归屋', () => {
  const domKey = keyOf('dom-key');

  it('文案与门槛定义', () => {
    const def = BADGES.find((b) => b.id === 'dom-keys-30')!;
    expect(def.title).toBe('属七归屋');
    expect(DOM_KEY_BADGE_NEED).toBe(30);
  });

  it('dom-key 题 30 题且 EMA ≥0.95 触发；题数或 EMA 不足不触发', () => {
    expect(ids(stateWith({ [domKey]: { attempts: 30, emaAccuracy: 0.96 } }))).toContain('dom-keys-30');
    expect(ids(stateWith({ [domKey]: { attempts: 29, emaAccuracy: 1 } }))).not.toContain('dom-keys-30');
    expect(ids(stateWith({ [domKey]: { attempts: 30, emaAccuracy: 0.9 } }))).not.toContain('dom-keys-30');
  });

  it('多个 dom-key 条目按题数累计并加权 EMA；已解锁不再返回', () => {
    const other = itemKey('func', 'fl', 2, 'treble', 'maj', chordItemExtra('dom-key'));
    const s = stateWith({
      [domKey]: { attempts: 18, emaAccuracy: 0.96 },
      [other]: { attempts: 12, emaAccuracy: 0.96 },
    });
    expect(ids(s)).toContain('dom-keys-30');
    expect(ids({ ...s, badges: ['dom-keys-30'] })).not.toContain('dom-keys-30');
    // 其它题型不计入
    expect(ids(stateWith({ [keyOf('key-dom', 'maj')]: { attempts: 30, emaAccuracy: 1 } }))).not.toContain('dom-keys-30');
  });
});

describe('新徽章：chord-builder-50 拼和弦工匠', () => {
  it('build-* 题累计 50 题触发；不足或只练 notes2quality 不触发', () => {
    expect(BADGES.find((b) => b.id === 'chord-builder-50')?.title).toBe('拼和弦工匠');
    expect(BUILD_BADGE_NEED).toBe(50);
    const bn = keyOf('build-notes');
    const bm = keyOf('build-mc');
    const nq = keyOf('notes2quality');
    expect(ids(stateWith({ [bn]: { attempts: 20 }, [bm]: { attempts: 30 } }))).toContain('chord-builder-50');
    expect(ids(stateWith({ [bn]: { attempts: 20 }, [bm]: { attempts: 29 } }))).not.toContain('chord-builder-50');
    // notes2quality 不属于 build-*，不计入
    expect(ids(stateWith({ [bn]: { attempts: 20 }, [bm]: { attempts: 20 }, [nq]: { attempts: 30 } }))).not.toContain(
      'chord-builder-50',
    );
  });
});

describe('新徽章：mode-trio 三调巡游', () => {
  const scales: ScaleKind[] = ['maj', 'harmMin', 'melMin'];

  it('maj / harmMin / melMin 各 10 题触发；任一调式不足不触发', () => {
    expect(BADGES.find((b) => b.id === 'mode-trio')?.title).toBe('三调巡游');
    expect(MODE_TRIO_NEED).toBe(10);
    const full = stateWith(Object.fromEntries(scales.map((sc) => [keyOf('deg2chord', sc), { attempts: 10 }])));
    expect(ids(full)).toContain('mode-trio');

    const short = stateWith({
      [keyOf('deg2chord', 'maj')]: { attempts: 10 },
      [keyOf('deg2chord', 'harmMin')]: { attempts: 10 },
      [keyOf('deg2chord', 'melMin')]: { attempts: 9 },
    });
    expect(ids(short)).not.toContain('mode-trio');
  });

  it('不同题型按调式累计；不带调式的题型不计入', () => {
    const s = stateWith({
      [keyOf('deg2chord', 'maj')]: { attempts: 6 },
      [keyOf('chord2func', 'maj')]: { attempts: 4 },
      [keyOf('chord2deg', 'harmMin')]: { attempts: 10 },
      [keyOf('acc2key', 'melMin')]: { attempts: 5 },
      [keyOf('deg2note', 'melMin')]: { attempts: 5 },
      [keyOf('dom-key')]: { attempts: 30, emaAccuracy: 1 },
    });
    expect(ids(s)).toContain('mode-trio');
  });
});
