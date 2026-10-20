/**
 * 弱项查找与专练计划小测：findWeakest（样本门槛 / 最低 ema / 描述）
 * + weakTargetOf / planFromWeak（train/type/n 聚焦 + 变式）。
 */

import { describe, expect, it } from 'vitest';
import {
  WEAK_MIN_ATTEMPTS,
  emptyItemStat,
  findWeakest,
  weakSpotOf,
  type ItemStat,
  type StatsState,
} from '../src/core/stats';
import { planFromWeak, weakTargetOf } from '../src/ui/session-controller';

function item(over: Partial<ItemStat>): ItemStat {
  return { ...emptyItemStat(), ...over };
}

function statsWith(entries: Record<string, ItemStat>): StatsState {
  return { items: entries, records: [] };
}

describe('findWeakest 弱项查找', () => {
  it('attempts 达标的条目里取 emaAccuracy 最低项', () => {
    const stats = statsWith({
      'sig|sh|3|treble|maj': item({ attempts: 6, emaAccuracy: 0.5 }),
      'sig|fl|2|treble|maj': item({ attempts: 8, emaAccuracy: 0.72 }),
      'sig|sh|0|bass|min': item({ attempts: 10, emaAccuracy: 0.9 }),
    });
    const weak = findWeakest(stats);
    expect(weak?.key).toBe('sig|sh|3|treble|maj');
    expect(weak?.emaAccuracy).toBe(0.5);
  });

  it(`attempts < ${WEAK_MIN_ATTEMPTS} 的条目不参与判定`, () => {
    expect(WEAK_MIN_ATTEMPTS).toBe(5);
    const stats = statsWith({
      'sig|sh|3|treble|maj': item({ attempts: 4, emaAccuracy: 0.1 }),
      'sig|fl|2|treble|maj': item({ attempts: 5, emaAccuracy: 0.6 }),
    });
    expect(findWeakest(stats)?.key).toBe('sig|fl|2|treble|maj');
  });

  it('没有够样本的条目返回 null', () => {
    const stats = statsWith({
      'sig|sh|3|treble|maj': item({ attempts: 3, emaAccuracy: 0.1 }),
    });
    expect(findWeakest(stats)).toBeNull();
    expect(findWeakest(statsWith({}))).toBeNull();
  });

  it('ema 并列时取样本多的', () => {
    const stats = statsWith({
      'sig|sh|3|treble|maj': item({ attempts: 5, emaAccuracy: 0.6 }),
      'sig|fl|4|treble|maj': item({ attempts: 9, emaAccuracy: 0.6 }),
    });
    expect(findWeakest(stats)?.key).toBe('sig|fl|4|treble|maj');
  });

  it('label 给出调号 / 模式描述，正确率取 emaAccuracy', () => {
    const sig = findWeakest(
      statsWith({ 'sig|sh|3|treble|maj': item({ attempts: 6, emaAccuracy: 0.62 }) }),
    );
    expect(sig?.label).toBe('3♯ · 认调');
    expect(sig?.emaAccuracy).toBe(0.62);

    const chord = findWeakest(
      statsWith({ 'func|fl|2|treble|maj|dom-key': item({ attempts: 6, emaAccuracy: 0.55 }) }),
    );
    expect(chord?.label).toBe('和弦归属 · 属七归调');
    expect(chord?.qkind).toBe('dom-key');
  });

  it('weakSpotOf 对非法 key 返回 null', () => {
    expect(weakSpotOf('garbage', item({ attempts: 6 }))).toBeNull();
  });
});

describe('weakTargetOf 弱项 → 专练目标', () => {
  it('认调弱项按 train/type/n 聚焦', () => {
    const spot = findWeakest(
      statsWith({ 'sig|sh|3|treble|maj': item({ attempts: 6, emaAccuracy: 0.5 }) }),
    );
    expect(spot).not.toBeNull();
    const target = weakTargetOf(spot!);
    expect(target.train).toBe('sig');
    expect(target.keys).toEqual([{ type: 'sh', n: 3 }]);
  });

  it('曲目认调退回认调直读', () => {
    const target = weakTargetOf({ train: 'piece', label: '2♭ · 曲目认调', type: 'fl', n: 2 });
    expect(target.train).toBe('sig');
    expect(target.keys).toEqual([{ type: 'fl', n: 2 }]);
  });

  it('和弦弱项按题型聚焦（焦点 + 少量变式）', () => {
    const target = weakTargetOf({
      train: 'func',
      label: '和弦归属 · 属七归调',
      qkind: 'dom-key',
    });
    expect(target.kinds?.[0]).toBe('dom-key');
    expect(target.kinds?.length).toBeLessThanOrEqual(3);
    expect(target.keys).toBeUndefined();
  });
});

describe('planFromWeak 弱项专练计划', () => {
  it('单块限时：3 分钟 / 24 题 / kind=weak，标题带描述', () => {
    const plan = planFromWeak({ train: 'sig', label: '3♯ · 认调', keys: [{ type: 'sh', n: 3 }] });
    expect(plan.blocks).toHaveLength(1);
    const block = plan.blocks[0];
    expect(block.kind).toBe('weak');
    expect(block.minutes).toBe(3);
    expect(block.durationMs).toBe(180_000);
    expect(block.questionCount).toBe(24);
    expect(plan.title).toContain('3♯ · 认调');
  });

  it('keys 池：弱项调号为主（×2）+ 邻近升降号数变式', () => {
    const plan = planFromWeak({ train: 'sig', label: '3♯ · 认调', keys: [{ type: 'sh', n: 3 }] });
    expect(plan.blocks[0].pick.keys).toEqual([
      { type: 'sh', n: 3 },
      { type: 'sh', n: 3 },
      { type: 'sh', n: 2 },
      { type: 'sh', n: 4 },
    ]);
  });

  it('0 个升降号只往上取变式（0..7 边界内）', () => {
    const plan = planFromWeak({ train: 'note', label: '0♯♭ · 认音', keys: [{ type: 'fl', n: 0 }] });
    expect(plan.blocks[0].pick.keys).toEqual([
      { type: 'fl', n: 0 },
      { type: 'fl', n: 0 },
      { type: 'fl', n: 1 },
    ]);
    expect(plan.blocks[0].pick.train).toBe('note');
    expect(plan.blocks[0].pick.asks).toEqual(['maj']);
  });

  it('和弦专练：焦点题型在池首且权重最高', () => {
    const target = weakTargetOf({ train: 'func', label: '和弦归属 · 属七归调', qkind: 'dom-key' });
    const plan = planFromWeak(target);
    const pick = plan.blocks[0].pick;
    expect(pick.kinds?.[0]).toBe('dom-key');
    expect(pick.kindWeights?.['dom-key']).toBe(3);
    for (const k of pick.kinds ?? []) {
      expect(pick.kindWeights?.[k]).toBeGreaterThanOrEqual(1);
    }
  });

  it('无调号聚焦（模式级弱项）不锁 keys 池', () => {
    const plan = planFromWeak({ train: 'sig', label: '认调' });
    expect(plan.blocks[0].pick.keys).toBeUndefined();
    expect(plan.blocks[0].pick.asks).toEqual(['maj', 'min']);
  });
});
