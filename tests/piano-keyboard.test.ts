import { describe, expect, it } from 'vitest';
import {
  GEOMETRY,
  KEY_GEOMETRY,
  cWindowStart,
  keyDefName,
  keyGeometry,
  keyHitRect,
  midiToKeyDef,
  pianoKeyDefs,
  startFromRatio,
  thumbRatio,
  viewportBoxLayout,
  viewportKeyDefs,
} from '../src/ui/components/piano-keyboard';

/** 与 audio/melody-synth.ts 的 noteToMidi 一致（C4=60） */
const LETTER_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteToMidi(letter: string, oct: number, acc: number): number {
  return (oct + 1) * 12 + LETTER_SEMI[letter] + acc;
}

describe('pianoKeyDefs（纯函数，可单测）', () => {
  it('pianoKeyDefs(48, 2) 生成 24 键（14 白 10 黑），midi 48..71 连续', () => {
    const defs = pianoKeyDefs(48, 2);
    expect(defs).toHaveLength(24);
    expect(defs.filter((d) => !d.isBlack)).toHaveLength(14);
    expect(defs.filter((d) => d.isBlack)).toHaveLength(10);
    expect(defs.map((d) => d.midi)).toEqual(Array.from({ length: 24 }, (_, i) => 48 + i));
    expect(defs[0].midi).toBe(48);
    expect(defs[23].midi).toBe(71);
  });

  it('midi ↔ letter/acc/oct：60→C4、61→C♯4、59→B3、48→C3、71→B4', () => {
    const defs = pianoKeyDefs(48, 2);
    const by = (midi: number) => defs.find((d) => d.midi === midi)!;

    expect(by(60)).toMatchObject({ letter: 'C', acc: 0, oct: 4, isBlack: false });
    expect(by(61)).toMatchObject({ letter: 'C', acc: 1, oct: 4, isBlack: true });
    expect(by(59)).toMatchObject({ letter: 'B', acc: 0, oct: 3, isBlack: false });
    expect(by(48)).toMatchObject({ letter: 'C', acc: 0, oct: 3, isBlack: false });
    expect(by(71)).toMatchObject({ letter: 'B', acc: 0, oct: 4, isBlack: false });
    expect(by(66)).toMatchObject({ letter: 'F', acc: 1, oct: 4, isBlack: true });

    // 显示名与 noteToMidi 换算闭环
    expect(keyDefName(by(60), true)).toBe('C4');
    expect(keyDefName(by(61), true)).toBe('C♯4');
    for (const d of defs) {
      expect(noteToMidi(d.letter, d.oct, d.acc)).toBe(d.midi);
    }
    expect(midiToKeyDef(61)).toMatchObject({ letter: 'C', acc: 1, oct: 4 });
  });

  it('黑键判定：半音 1/3/6/8/10 为黑键，其余白键', () => {
    const blackPcs = new Set([1, 3, 6, 8, 10]);
    for (const d of pianoKeyDefs(48, 2)) {
      expect(d.isBlack).toBe(blackPcs.has(((d.midi % 12) + 12) % 12));
    }
    expect(pianoKeyDefs(48, 2).filter((d) => d.isBlack).map((d) => d.midi)).toEqual([49, 51, 54, 56, 58, 61, 63, 66, 68, 70]);
  });

  it('3 八度：36 键（21 白 15 黑）', () => {
    const defs = pianoKeyDefs(48, 3);
    expect(defs).toHaveLength(36);
    expect(defs.filter((d) => !d.isBlack)).toHaveLength(21);
    expect(defs.filter((d) => d.isBlack)).toHaveLength(15);
    expect(defs[35].midi).toBe(83);
  });
});

describe('触控几何 KEY_GEOMETRY / keyHitRect（1.5 八度视窗）', () => {
  it('视窗 1.5 八度：10 白键 7 黑键共 17 键（C 起 C–E）', () => {
    const defs = viewportKeyDefs(48);
    expect(defs).toHaveLength(KEY_GEOMETRY.VIEW_KEYS);
    expect(defs).toHaveLength(17);
    expect(defs.filter((d) => !d.isBlack)).toHaveLength(KEY_GEOMETRY.VIEW_WHITE);
    expect(defs.filter((d) => !d.isBlack)).toHaveLength(10);
    expect(defs.filter((d) => d.isBlack)).toHaveLength(KEY_GEOMETRY.VIEW_BLACK);
    expect(defs.filter((d) => d.isBlack)).toHaveLength(7);
    expect(defs[0]).toMatchObject({ midi: 48, letter: 'C', isBlack: false });
    expect(defs[16]).toMatchObject({ midi: 64, letter: 'E', isBlack: false });
    expect(KEY_GEOMETRY.VIEW_W).toBe(KEY_GEOMETRY.VIEW_WHITE * KEY_GEOMETRY.WHITE_W);
  });

  it('白键宽 36 单位：360px 屏宽时每白键 36 CSS px（≥ 30 触控达标）', () => {
    expect(KEY_GEOMETRY.WHITE_W).toBe(36);
    expect(KEY_GEOMETRY.WHITE_H).toBe(110);
    expect(KEY_GEOMETRY.VIEW_H).toBe(130);
    expect(KEY_GEOMETRY.VIEW_W).toBe(360);
    const screenPx = 360;
    const cssPerUnit = screenPx / KEY_GEOMETRY.VIEW_W;
    expect(KEY_GEOMETRY.WHITE_W * cssPerUnit).toBeGreaterThanOrEqual(30);
    // 黑键 ≈20 CSS px（375px 屏上白键 ≈32px），热区更宽
    expect(KEY_GEOMETRY.BLACK_W).toBe(22);
    expect(KEY_GEOMETRY.BLACK_H).toBe(68);
  });

  it('黑键热区左右 +6 / 下方 +12，覆盖白键缝隙', () => {
    const hit = keyHitRect(49, 48); // C♯3：贴 C3|D3 缝隙
    expect(hit.isBlack).toBe(true);
    expect(hit.width).toBe(KEY_GEOMETRY.BLACK_W + 2 * KEY_GEOMETRY.HIT_PAD_X);
    expect(hit.height).toBe(KEY_GEOMETRY.BLACK_H + KEY_GEOMETRY.HIT_PAD_BOTTOM);
    // 热区宽于键面并跨过白键接缝
    expect(hit.width).toBeGreaterThan(KEY_GEOMETRY.BLACK_W);
    const seam = KEY_GEOMETRY.WHITE_W; // C3 白键右缘
    expect(hit.x).toBeLessThan(seam);
    expect(hit.x + hit.width).toBeGreaterThan(seam);
    // 白键热区即键面
    const white = keyHitRect(48, 48);
    expect(white.isBlack).toBe(false);
    expect(white).toMatchObject({ x: 0, width: KEY_GEOMETRY.WHITE_W, height: KEY_GEOMETRY.WHITE_H });
  });

  it('黑键 hit 矩形与相邻白键重叠 ≥ 4 单位（命中优先可测）', () => {
    const defs = viewportKeyDefs(48);
    const whites = defs.filter((d) => !d.isBlack);
    const overlap = (a: { x: number; width: number }, b: { x: number; width: number }): number =>
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    for (const black of defs.filter((d) => d.isBlack)) {
      const hit = keyHitRect(black.midi, 48);
      const left = [...whites].reverse().find((w) => w.midi < black.midi);
      const right = whites.find((w) => w.midi > black.midi);
      expect(left, `黑键 ${black.midi} 左邻白键`).toBeDefined();
      expect(right, `黑键 ${black.midi} 右邻白键`).toBeDefined();
      const l = keyHitRect(left!.midi, 48);
      const r = keyHitRect(right!.midi, 48);
      expect(overlap(hit, l)).toBeGreaterThanOrEqual(4);
      expect(overlap(hit, r)).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('wide 视窗几何（2 八度）', () => {
  it('GEOMETRY 查表：std 现值不变，wide = 14 白 10 黑 / viewBox 504×76', () => {
    expect(keyGeometry()).toBe(GEOMETRY.std);
    expect(KEY_GEOMETRY).toBe(GEOMETRY.std);
    expect(KEY_GEOMETRY.VIEW_H).toBe(130);
    const G = keyGeometry('wide');
    expect(G).toBe(GEOMETRY.wide);
    expect(G.VIEW_WHITE).toBe(14);
    expect(G.VIEW_BLACK).toBe(10);
    expect(G.VIEW_KEYS).toBe(24);
    expect(G.VIEW_W).toBe(504);
    expect(G.VIEW_W).toBe(G.VIEW_WHITE * G.WHITE_W);
    expect(G.VIEW_H).toBe(76);
    expect(G.WHITE_W).toBe(36);
    expect(G.WHITE_H).toBe(62);
    expect(G.BLACK_W).toBe(22);
    expect(G.BLACK_H).toBe(40);
    expect(G.HIT_PAD_X).toBe(6);
    expect(G.HIT_PAD_BOTTOM).toBe(12);
  });

  it('viewportKeyDefs wide：24 键（14 白 10 黑）C3–B4，黑键 2-3-2 分组', () => {
    const defs = viewportKeyDefs(48, 'wide');
    expect(defs).toHaveLength(24);
    expect(defs.filter((d) => !d.isBlack)).toHaveLength(14);
    expect(defs.filter((d) => d.isBlack)).toHaveLength(10);
    expect(defs[0]).toMatchObject({ midi: 48, letter: 'C', isBlack: false });
    expect(defs[23]).toMatchObject({ midi: 71, letter: 'B', isBlack: false });
    expect(defs.filter((d) => d.isBlack).map((d) => d.midi)).toEqual([49, 51, 54, 56, 58, 61, 63, 66, 68, 70]);
  });

  it('wide keyHitRect：白键 36×62、黑键热区 34×52、末白键右缘 = 504', () => {
    const white = keyHitRect(48, 48, 'wide');
    expect(white).toMatchObject({ x: 0, y: 0, width: 36, height: 62, isBlack: false });
    const black = keyHitRect(49, 48, 'wide'); // C♯3 贴 C|D 缝
    expect(black.isBlack).toBe(true);
    expect(black.x).toBe(22); // 36 + BLACK_DX3 - 黑宽一半 11 - 外扩 6
    expect(black.width).toBe(22 + 2 * 6);
    expect(black.height).toBe(40 + 12);
    expect(keyHitRect(71, 48, 'wide').x + 36).toBe(504); // 末白键 B4 贴 viewBox 右缘
  });

  it('wide 黑键热区与相邻白键重叠 ≥ 4 单位（命中优先）', () => {
    const defs = viewportKeyDefs(48, 'wide');
    const whites = defs.filter((d) => !d.isBlack);
    const overlap = (a: { x: number; width: number }, b: { x: number; width: number }): number =>
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    for (const black of defs.filter((d) => d.isBlack)) {
      const hit = keyHitRect(black.midi, 48, 'wide');
      const left = [...whites].reverse().find((w) => w.midi < black.midi);
      const right = whites.find((w) => w.midi > black.midi);
      expect(left, `黑键 ${black.midi} 左邻白键`).toBeDefined();
      expect(right, `黑键 ${black.midi} 右邻白键`).toBeDefined();
      expect(overlap(hit, keyHitRect(left!.midi, 48, 'wide'))).toBeGreaterThanOrEqual(4);
      expect(overlap(hit, keyHitRect(right!.midi, 48, 'wide'))).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('cWindowStart（ensureRange 视窗对齐纯计算）', () => {
  it('目标区间已在视窗内 → null（不移动）', () => {
    expect(cWindowStart(48, 71, 48, 24)).toBeNull();
    expect(cWindowStart(50, 60, 48, 17)).toBeNull();
    expect(cWindowStart(48, 64, 48, 17)).toBeNull(); // 下端点贴边
    expect(cWindowStart(49, 71, 48, 24)).toBeNull(); // 上端点贴边
    expect(cWindowStart(48, 65, 48, 17)).not.toBeNull(); // hi 超出 48..64
    expect(cWindowStart(47, 55, 48, 17)).not.toBeNull(); // lo 低于起点
  });

  it('不在内 → 对齐到 C 窗口（12 的倍数）并覆盖目标区间', () => {
    expect(cWindowStart(50, 58, 72, 17)).toBe(48); // 48..64 覆盖 50..58
    expect(cWindowStart(62, 75, 36, 24)).toBe(60); // 60..83 覆盖 62..75
    expect(cWindowStart(85, 95, 36, 17)).toBe(84); // 84..100 覆盖 85..95
    expect(48 % 12).toBe(0);
  });

  it('C 边界 clamp：低不过 C2 起点 36、高不过 C6 起点 84（仍 C 对齐）', () => {
    expect(cWindowStart(30, 45, 60, 24)).toBe(36); // floor(30/12)*12=24 → 抬到 36
    expect(cWindowStart(24, 40, 72, 17)).toBe(36);
    expect(cWindowStart(96, 105, 36, 24)).toBe(84); // 96 → 压到 84（84..107 仍覆盖）
    expect(cWindowStart(97, 100, 36, 17)).toBe(84); // 96 → 84（84..100 覆盖）
  });

  it('扫描：返回值恒为 12 的倍数且落在 [36,84]', () => {
    for (let lo = 30; lo <= 100; lo += 5) {
      for (const keys of [17, 24]) {
        const start = cWindowStart(lo, lo + 11, 36, keys);
        if (start === null) continue;
        expect(start % 12).toBe(0);
        expect(start).toBeGreaterThanOrEqual(36);
        expect(start).toBeLessThanOrEqual(84);
      }
    }
  });
});

describe('thumbRatio / startFromRatio（rangeBar 拖动映射纯函数）', () => {
  it('thumbRatio：端点 0/1、中点、越界 clamp', () => {
    expect(thumbRatio(36, 36, 84)).toBe(0);
    expect(thumbRatio(84, 36, 84)).toBe(1);
    expect(thumbRatio(60, 36, 84)).toBe(0.5);
    expect(thumbRatio(48, 36, 84)).toBe(0.25);
    expect(thumbRatio(30, 36, 84)).toBe(0); // 低于 min → clamp 0
    expect(thumbRatio(96, 36, 84)).toBe(1); // 高于 max → clamp 1
    expect(thumbRatio(60, 48, 48)).toBe(0); // 跨度为 0 → 0
  });

  it('startFromRatio：端点 0/1、中点、round 取整、ratio clamp', () => {
    expect(startFromRatio(0, 36, 84)).toBe(36);
    expect(startFromRatio(1, 36, 84)).toBe(84);
    expect(startFromRatio(0.5, 36, 84)).toBe(60);
    expect(startFromRatio(-0.3, 36, 84)).toBe(36); // ratio clamp 低
    expect(startFromRatio(1.4, 36, 84)).toBe(84); // ratio clamp 高
    // round：36 + ratio×48 取整 → 半音级任意起点（不强制八度对齐）
    expect(startFromRatio(0.1, 36, 84)).toBe(41); // 36+4.8 → 41
    expect(startFromRatio(1 / 3, 36, 84)).toBe(52); // 36+16 → 52
    expect(startFromRatio(0.75, 36, 84)).toBe(72);
    expect(startFromRatio(0.5, 48, 48)).toBe(48); // 跨度为 0 → min
  });

  it('往返闭环：startFromRatio(thumbRatio(s)) === s（36..84 全扫）', () => {
    for (let s = 36; s <= 84; s++) {
      expect(startFromRatio(thumbRatio(s, 36, 84), 36, 84)).toBe(s);
    }
  });
});

describe('viewportBoxLayout（缩略图视窗框布局纯函数）', () => {
  const G = GEOMETRY.std;
  const min = 36;
  const max = 84 + G.VIEW_KEYS - 1; // 100：全可拖末键（maxStart=84 起末窗的末键）
  const total = max - min + 1; // 65 键

  it('框宽 = viewLen/总键数；首窗贴左缘、末窗左+右 = 100%', () => {
    expect(G.VIEW_KEYS).toBe(17);
    expect(total).toBe(65);
    const first = viewportBoxLayout(min, G.VIEW_KEYS, min, max);
    expect(first.leftPct).toBe(0);
    expect(first.widthPct).toBeCloseTo((17 / 65) * 100, 9);
    const last = viewportBoxLayout(84, G.VIEW_KEYS, min, max); // start = maxStart
    expect(last.leftPct + last.widthPct).toBeCloseTo(100, 9);
  });

  it('中间位置：leftPct = (start-min)/总键数×100，与 thumbRatio 起点域等价', () => {
    const box = viewportBoxLayout(60, 17, min, max);
    expect(box.leftPct).toBeCloseTo((24 / 65) * 100, 9);
    expect(thumbRatio(60, 36, 84)).toBe(0.5);
    // 左可用段 = 100% - 框宽：中点起点即该段中点（与 thumbRatio 同一映射）
    expect(box.leftPct).toBeCloseTo(0.5 * (100 - box.widthPct), 9);
  });

  it('start 越界 clamp：低于 min → 贴左；高于末窗 → 贴右；扫描恒在 0..100 内', () => {
    expect(viewportBoxLayout(10, 17, min, max).leftPct).toBe(0);
    const high = viewportBoxLayout(200, 17, min, max);
    expect(high.leftPct + high.widthPct).toBeCloseTo(100, 9);
    for (let s = 20; s <= 110; s++) {
      const b = viewportBoxLayout(s, 17, min, max);
      expect(b.leftPct).toBeGreaterThanOrEqual(0);
      expect(b.widthPct).toBeGreaterThan(0);
      expect(b.leftPct + b.widthPct).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it('wide 视窗（24 键，全可拖末键 107）：末窗左+右 = 100%，框宽 = 24/72', () => {
    const W = GEOMETRY.wide;
    const wMax = 84 + W.VIEW_KEYS - 1; // 107
    expect(wMax - 36 + 1).toBe(72);
    const box = viewportBoxLayout(84, W.VIEW_KEYS, 36, wMax);
    expect(box.widthPct).toBeCloseTo((24 / 72) * 100, 9);
    expect(box.leftPct).toBeCloseTo((48 / 72) * 100, 9);
    expect(box.leftPct + box.widthPct).toBeCloseTo(100, 9);
  });

  it('退化：max <= min → 整条即框 {0,100}；viewLen 超总键数 → 宽 clamp 100%', () => {
    expect(viewportBoxLayout(60, 17, 40, 40)).toEqual({ leftPct: 0, widthPct: 100 });
    expect(viewportBoxLayout(60, 17, 50, 40)).toEqual({ leftPct: 0, widthPct: 100 });
    const over = viewportBoxLayout(36, 17, 36, 40); // 总键 5 < viewLen 17
    expect(over.widthPct).toBe(100);
    expect(over.leftPct).toBe(0);
  });

  it('单调：start 递增 → 框左缘不回退（拖动 / ‹ › 步进视觉一致）', () => {
    let prev = -1;
    for (let s = 36; s <= 84; s++) {
      const b = viewportBoxLayout(s, 17, min, max);
      expect(b.leftPct).toBeGreaterThanOrEqual(prev);
      prev = b.leftPct;
    }
  });
});

describe('任意可视起点（非 C 对齐）的键位与命中矩形', () => {
  const blackPcs = new Set([1, 3, 6, 8, 10]);

  it('start=52（E3）/ 49（C♯3，黑键打头）：17 键连续、黑白键判定逐键正确', () => {
    for (const start of [52, 49]) {
      const defs = viewportKeyDefs(start);
      expect(defs).toHaveLength(17);
      expect(defs.map((d) => d.midi)).toEqual(Array.from({ length: 17 }, (_, i) => start + i));
      for (const d of defs) {
        expect(d.isBlack, `midi ${d.midi}`).toBe(blackPcs.has(((d.midi % 12) + 12) % 12));
        const hit = keyHitRect(d.midi, start);
        expect(hit.isBlack).toBe(d.isBlack);
        expect(hit.width).toBeGreaterThan(0);
      }
    }
  });

  it('start=52（E3 起）：仍 10 白 7 黑，白键连续铺满 360 viewBox', () => {
    const defs = viewportKeyDefs(52);
    expect(defs.filter((d) => !d.isBlack)).toHaveLength(10);
    expect(defs.filter((d) => d.isBlack)).toHaveLength(7);
    expect(defs[0]).toMatchObject({ midi: 52, letter: 'E', oct: 3, isBlack: false });
    expect(defs[16]).toMatchObject({ midi: 68, letter: 'G', acc: 1, oct: 4, isBlack: true });
    const whites = defs.filter((d) => !d.isBlack);
    expect(keyHitRect(whites[0].midi, 52)).toMatchObject({ x: 0, isBlack: false });
    const last = keyHitRect(whites[whites.length - 1].midi, 52);
    expect(last.x + last.width).toBe(KEY_GEOMETRY.VIEW_W); // 360
  });

  it('start=49（C♯3 起，黑键打头）：10 白 7 黑，首键黑键热区贴 viewBox 左缘', () => {
    const defs = viewportKeyDefs(49);
    expect(defs.filter((d) => !d.isBlack)).toHaveLength(10);
    expect(defs.filter((d) => d.isBlack)).toHaveLength(7);
    expect(defs[0]).toMatchObject({ midi: 49, letter: 'C', acc: 1, oct: 3, isBlack: true });
    const first = keyHitRect(49, 49);
    expect(first.isBlack).toBe(true);
    // 黑键热区左右外扩后从缝隙左侧起（x = 3 - 11 - 6 = -14），绘制裁切在 viewBox 内
    expect(first.x).toBe(KEY_GEOMETRY.BLACK_DX - KEY_GEOMETRY.BLACK_W / 2 - KEY_GEOMETRY.HIT_PAD_X);
    expect(first.x + first.width).toBeGreaterThan(0);
  });
});
