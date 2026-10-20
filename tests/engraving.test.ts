import { describe, expect, it } from 'vitest';
import {
  ACCENT_STROKE,
  buildStaff,
  STAFF_BOTTOM,
  STAFF_S,
  STAFF_VIEWBOX,
  type Clef,
  type SigType,
} from '../src/engraving/staff';
import { BFL, BSH, TFL, TSH } from '../src/engraving/key-signature-slots';
import { GLYPHS } from '../src/engraving/smufl-glyphs';

const SIGS: Array<{ type: SigType; n: number }> = [];
for (const type of ['sh', 'fl'] as const) {
  for (let n = 0; n <= 7; n++) SIGS.push({ type, n });
}

function slotsFor(clef: Clef, type: SigType): number[] {
  return clef === 'treble' ? (type === 'sh' ? TSH : TFL) : type === 'sh' ? BSH : BFL;
}

/** 提取所有升降号槽位的 y 坐标（glyph translate 的 y） */
function accYs(svg: string): number[] {
  const ys: number[] = [];
  const re = /<g class="acc(?: [^"]*)?" transform="translate\([-?\d.]+ ([-?\d.]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) ys.push(parseFloat(m[1]));
  return ys;
}

function accCount(svg: string): number {
  return (svg.match(/<g class="acc/g) ?? []).length;
}

describe('槽位数据表（2026-10 修复后的权威数值，禁止改动）', () => {
  it('TSH / TFL / BSH / BFL 逐值相等', () => {
    expect(TSH).toEqual([8, 5, 9, 6, 3, 7, 4]);
    expect(TFL).toEqual([4, 7, 3, 6, 2, 5, 1]);
    expect(BSH).toEqual([6, 3, 7, 4, 1, 5, 2]);
    expect(BFL).toEqual([2, 5, 1, 4, 0, 3, -1]);
  });
});

describe('28 个调号 × 2 谱号渲染', () => {
  for (const clef of ['treble', 'bass'] as const) {
    for (const { type, n } of SIGS) {
      it(`${clef} ${type}${n}：升降号数量与槽位 y 坐标正确`, () => {
        const svg = buildStaff({ clef, type, n });
        expect(accCount(svg)).toBe(n);
        const slots = slotsFor(clef, type).slice(0, n);
        const ys = accYs(svg);
        expect(ys).toHaveLength(n);
        ys.forEach((y, i) => {
          // y = bottom - step * (S / 2)
          expect(y).toBe(STAFF_BOTTOM - slots[i] * (STAFF_S / 2));
        });
      });
    }
  }
});

describe('槽位回归（2026-10 修复点）', () => {
  it('sh6 第 6 个升号 E♯ 在 step 7（高音谱号 y=78）', () => {
    expect(TSH[5]).toBe(7);
    const ys = accYs(buildStaff({ clef: 'treble', type: 'sh', n: 6 }));
    expect(ys[5]).toBe(78); // 120 - 7 * 6
  });

  it('fl7 第 7 个降号 F♭ 在 step -1（低音谱号 y=126）', () => {
    expect(BFL[6]).toBe(-1);
    const ys = accYs(buildStaff({ clef: 'bass', type: 'fl', n: 7 }));
    expect(ys[6]).toBe(126); // 120 - (-1) * 6
  });

  it('sh7 高音谱号 7 个升号整体高低交错、无贴底线错位', () => {
    const ys = accYs(buildStaff({ clef: 'treble', type: 'sh', n: 7 }));
    // step 8,5,9,6,3,7,4 → y 72,90,66,84,102,78,96（高低交错，最低 y=102 不贴底线 120）
    expect(ys).toEqual([72, 90, 66, 84, 102, 78, 96]);
  });
});

describe('accent 高亮（直读锚点动画）', () => {
  it('accent=k 时第 k 个升降号加朱红描边', () => {
    const svg = buildStaff({ clef: 'treble', type: 'sh', n: 3, accent: 2 });
    const groups = svg.match(/<g class="acc[^"]*"[^>]*>/g) ?? [];
    expect(groups).toHaveLength(3);
    expect(groups.filter((g) => g.includes('acc-accent'))).toHaveLength(1);
    expect(groups[2]).toContain('acc-accent');
    expect(svg).toContain(`stroke="${ACCENT_STROKE}"`);
    expect(ACCENT_STROKE).toBe('#B5402D');
    // 非高亮的升降号不带 stroke
    expect(groups[0]).not.toContain('stroke');
    expect(groups[1]).not.toContain('stroke');
  });

  it('不传 accent 时无高亮', () => {
    const svg = buildStaff({ clef: 'treble', type: 'fl', n: 4 });
    expect(svg).not.toContain('acc-accent');
    expect(svg).not.toContain(ACCENT_STROKE);
  });

  it('accent 越界抛 RangeError', () => {
    expect(() => buildStaff({ clef: 'treble', type: 'sh', n: 3, accent: 3 })).toThrow(RangeError);
    expect(() => buildStaff({ clef: 'treble', type: 'sh', n: 0, accent: 0 })).toThrow(RangeError);
  });
});

describe('谱号 / 目标音符 / 加线', () => {
  it('谱号字形正确', () => {
    expect(buildStaff({ clef: 'treble', type: 'sh', n: 0 })).toContain(GLYPHS.gClef.d.slice(0, 24));
    expect(buildStaff({ clef: 'bass', type: 'sh', n: 0 })).toContain(GLYPHS.fClef.d.slice(0, 24));
  });

  it('目标音符：符头 cy = bottom - step*(S/2)，符干方向正确', () => {
    const up = buildStaff({ clef: 'treble', type: 'sh', n: 0, step: 2 });
    expect(up).toContain('class="notehead"');
    expect(up).toContain('cy="108"'); // 120 - 2 * 6
    expect(up).toContain('<rect class="stem" x="356.9"'); // step < 4 符干朝上（右侧）
    const down = buildStaff({ clef: 'treble', type: 'sh', n: 0, step: 8 });
    expect(down).toContain('cy="72"'); // 120 - 8 * 6
    expect(down).toContain('<rect class="stem" x="341.4"'); // step >= 4 符干朝下（左侧）
  });

  it('加线：step 谱外时按偶数 step 补短横线', () => {
    const above = buildStaff({ clef: 'treble', type: 'sh', n: 0, step: 10 });
    expect(above).toContain('class="ledger"');
    expect(above).toContain('y1="60"'); // step 10 的加线
    expect(above.match(/class="ledger"/g)).toHaveLength(1);

    const below = buildStaff({ clef: 'treble', type: 'sh', n: 0, step: -4 });
    expect(below.match(/class="ledger"/g)).toHaveLength(2);
    expect(below).toContain('y1="132"'); // step -2
    expect(below).toContain('y1="144"'); // step -4

    const inside = buildStaff({ clef: 'treble', type: 'sh', n: 0, step: 4 });
    expect(inside).not.toContain('class="ledger"');
  });

  it('viewBox 常量导出', () => {
    expect(STAFF_VIEWBOX).toBe('0 0 640 170');
    expect(STAFF_S).toBe(12);
    expect(STAFF_BOTTOM).toBe(120);
  });
});

describe('和弦堆叠渲染（notes / chordSymbolText）', () => {
  /** 提取所有符头的 cx / cy */
  function noteheads(svg: string): Array<{ cx: number; cy: number }> {
    const out: Array<{ cx: number; cy: number }> = [];
    const re = /<ellipse class="notehead" cx="([\d.]+)" cy="([\d.]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(svg)) !== null) out.push({ cx: parseFloat(m[1]), cy: parseFloat(m[2]) });
    return out;
  }

  /** 符头左侧的临时记号个数（acc=±2 画两个并排） */
  function noteAccCount(svg: string): number {
    return (svg.match(/<g class="note-acc/g) ?? []).length;
  }

  it('和弦堆叠：每个符头 cy = bottom - step*(S/2) 逐音正确', () => {
    const svg = buildStaff({
      clef: 'treble',
      type: 'sh',
      n: 0,
      notes: [{ step: 0 }, { step: 2 }, { step: 4 }, { step: 6 }],
    });
    const heads = noteheads(svg);
    expect(heads).toHaveLength(4);
    heads.forEach((hd, i) => {
      expect(hd.cy).toBe(STAFF_BOTTOM - [0, 2, 4, 6][i] * (STAFF_S / 2));
      expect(hd.cx).toBe(350); // 三度叠置同 x 对齐
    });
    expect(heads.map((hd) => hd.cy)).toEqual([120, 108, 96, 84]);
    // 单符干
    expect(svg.match(/<rect class="stem"/g)).toHaveLength(1);
  });

  it('二度错位：相邻 step 差 1 时后一个符头 x 偏移 9px', () => {
    const seconds = buildStaff({ clef: 'treble', type: 'sh', n: 0, notes: [{ step: 0 }, { step: 1 }] });
    const a = noteheads(seconds);
    expect(a.map((hd) => hd.cx)).toEqual([350, 359]);
    const thirds = buildStaff({ clef: 'treble', type: 'sh', n: 0, notes: [{ step: 0 }, { step: 2 }] });
    expect(noteheads(thirds).map((hd) => hd.cx)).toEqual([350, 350]);
  });

  it('临时记号数量：acc=±1 各 1 个、acc=±2（双升/双降）各 2 个、acc=0 不画', () => {
    const svg = buildStaff({
      clef: 'treble',
      type: 'sh',
      n: 0,
      notes: [
        { step: 0, acc: 1 },
        { step: 2, acc: -1 },
        { step: 4, acc: 2 },
        { step: 6, acc: -2 },
      ],
    });
    expect(noteAccCount(svg)).toBe(1 + 1 + 2 + 2);
    const plain = buildStaff({ clef: 'treble', type: 'sh', n: 0, notes: [{ step: 0, acc: 0 }, { step: 2 }] });
    expect(noteAccCount(plain)).toBe(0);
  });

  it('chordSymbolText：谱面左上 <text>，第 5 线上方约 18 单位，serif 字体', () => {
    const svg = buildStaff({ clef: 'treble', type: 'sh', n: 0, step: 4, chordSymbolText: 'G7' });
    expect(svg).toContain('<text class="chord-symbol"');
    expect(svg).toContain('>G7</text>');
    expect(svg).toContain('x="42"');
    expect(svg).toContain('y="54"'); // 120 - 4*12 - 18
    expect(svg).toContain('font-family="var(--serif)"');
    expect(svg).toContain('fill="var(--ink)"');
  });

  it('notes 与单音 step 并存时 notes 优先', () => {
    const svg = buildStaff({ clef: 'treble', type: 'sh', n: 0, step: 8, notes: [{ step: 0 }, { step: 4 }] });
    const heads = noteheads(svg);
    expect(heads).toHaveLength(2);
    expect(heads.map((hd) => hd.cy)).toEqual([120, 96]);
    expect(svg).not.toContain('cy="72"'); // step: 8 的符头不出现
  });
});
