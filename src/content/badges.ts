/**
 * 徽章内容层：徽章定义 + 解锁判定（纯函数）。
 */

import type { AppState } from '../core/store';
import { LEVELS } from '../core/levels';
import { aggregate, type ItemStat } from '../core/stats';

export interface BadgeDef {
  id: string;
  title: string;
  desc: string;
  /** 图标（emoji 占位，UI 可替换为 SVG） */
  icon: string;
}

/** 全部徽章定义 */
export const BADGES: readonly BadgeDef[] = [
  { id: 'first-answer', title: '第一题', desc: '完成第一次作答', icon: '🎵' },
  { id: 'first-pass', title: '首通关', desc: '第一次通过任意关卡', icon: '🏁' },
  { id: 'checkin-7', title: '七日打卡', desc: '连续 7 天打卡（每周可补卡 1 次）', icon: '📅' },
  { id: 'key-30', title: '调号巩固', desc: '同一个调号练满 30 题且 EMA 正确率 ≥95%', icon: '🔐' },
  { id: 'flat-chapter', title: '降号通关', desc: '所有纯降号关卡全部通过', icon: '🎼' },
  { id: 'combo-20', title: '二十连击', desc: '单次连击达到 20 题', icon: '🔥' },
  { id: 'perfect-3star', title: '三星满分', desc: '任意关卡拿到 3 星', icon: '⭐' },
  { id: 'chapters-4', title: '四章点亮', desc: '每一章都至少通过 1 关', icon: '🏆' },
  { id: 'dom-keys-30', title: '属七归屋', desc: 'dom-key 题累计 30 题且 EMA 正确率 ≥95%', icon: '🏠' },
  { id: 'chord-builder-50', title: '拼和弦工匠', desc: 'build-* 拼和弦题累计 50 题', icon: '🧱' },
  { id: 'mode-trio', title: '三调巡游', desc: '大调 / 和声小调 / 旋律小调三种调式各答满 10 题', icon: '🌀' },
];

/** 纯降号关（dist 中全部为降号） */
const FLAT_LEVEL_IDS = LEVELS.filter((l) => l.dist.every((k) => k.type === 'fl')).map((l) => l.id);

/** 连击徽章门槛 */
export const COMBO_BADGE_NEED = 20;
/** 调号巩固徽章：题数与 EMA 门槛 */
export const KEY_BADGE_NEED = 30;
export const KEY_BADGE_EMA = 0.95;
/** 属七归屋徽章：dom-key 题数与 EMA 门槛 */
export const DOM_KEY_BADGE_NEED = 30;
export const DOM_KEY_BADGE_EMA = 0.95;
/** 拼和弦工匠徽章：build-* 题累计门槛 */
export const BUILD_BADGE_NEED = 50;
/** 三调巡游徽章：每种调式题数门槛 */
export const MODE_TRIO_NEED = 10;
/** 三调巡游覆盖的调式 */
export const MODE_TRIO_SCALES: readonly string[] = ['maj', 'harmMin', 'melMin'];

/** 条目 key 第 6 段：题型（可带 `~调式`，见 chordItemExtra） */
function kindPart(key: string): { kind: string; scale: string } {
  const [kind = '', scale = ''] = (key.split('|')[5] ?? '').split('~');
  return { kind, scale };
}

/** 满足条件的条目表 */
function chordItems(state: AppState, pred: (p: { kind: string; scale: string }) => boolean): Array<[string, ItemStat]> {
  return Object.entries(state.stats.items).filter(([k]) => pred(kindPart(k)));
}

/** 近 7 天打卡天数（含补卡） */
function recentCheckinDays(state: AppState, now: number): number {
  const days = new Set([...state.streak.dates, ...state.streak.makeupDates]);
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    if (days.has(`${d.getFullYear()}-${m}-${day}`)) count++;
  }
  return count;
}

/**
 * 解锁判定：返回「新解锁」的徽章（不在 state.badges 里且满足条件）。
 * @param now 「今天」参考时间戳（打卡判定用），默认 Date.now()
 */
export function checkBadges(state: AppState, now: number = Date.now()): BadgeDef[] {
  const agg = aggregate(state.stats.records, now);
  const passed = new Set(state.levelProgress.passed);
  const domItems = chordItems(state, (p) => p.kind === 'dom-key');
  const domAttempts = domItems.reduce((a, [, s]) => a + s.attempts, 0);
  // dom-key 条目 EMA 按题数加权平均
  const domEma =
    domAttempts > 0 ? domItems.reduce((a, [, s]) => a + s.emaAccuracy * s.attempts, 0) / domAttempts : 0;
  const scaleAttempts = (scale: string): number =>
    chordItems(state, (p) => p.scale === scale).reduce((a, [, s]) => a + s.attempts, 0);
  const earned: Record<string, boolean> = {
    'first-answer': state.stats.records.length >= 1,
    'first-pass': passed.size >= 1,
    'checkin-7': recentCheckinDays(state, now) >= 7,
    'key-30': Object.values(state.stats.items).some(
      (s) => s.attempts >= KEY_BADGE_NEED && s.emaAccuracy >= KEY_BADGE_EMA,
    ),
    'flat-chapter': FLAT_LEVEL_IDS.length > 0 && FLAT_LEVEL_IDS.every((id) => passed.has(id)),
    'combo-20': agg.bestStreak >= COMBO_BADGE_NEED,
    'perfect-3star': Object.values(state.levelProgress.stars).some((s) => s >= 3),
    'chapters-4': [1, 2, 3, 4].every((ch) =>
      LEVELS.some((l) => l.chapter === ch && passed.has(l.id)),
    ),
    'dom-keys-30': domAttempts >= DOM_KEY_BADGE_NEED && domEma >= DOM_KEY_BADGE_EMA,
    'chord-builder-50':
      chordItems(state, (p) => p.kind.startsWith('build-')).reduce((a, [, s]) => a + s.attempts, 0) >=
      BUILD_BADGE_NEED,
    'mode-trio': MODE_TRIO_SCALES.every((sc) => scaleAttempts(sc) >= MODE_TRIO_NEED),
  };
  return BADGES.filter((b) => earned[b.id] && !state.badges.includes(b.id));
}
