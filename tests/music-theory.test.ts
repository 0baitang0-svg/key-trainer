import { describe, expect, it } from 'vitest';
import {
  anchorText,
  keyInfo,
  minorTonicByRule,
  noteInfo,
  sharpTonicByRule,
  flatTonicByRule,
  tonicByRule,
  FL_MAJ,
  FL_MIN,
  SH_MAJ,
  SH_MIN,
} from '../src/core/music-theory';

// 28 个调号期望主音（独立硬编码，防止实现端自证）
const KEYS: Array<{ type: 'sh' | 'fl'; n: number; maj: string; min: string }> = [
  { type: 'sh', n: 0, maj: 'C', min: 'a' },
  { type: 'sh', n: 1, maj: 'G', min: 'e' },
  { type: 'sh', n: 2, maj: 'D', min: 'b' },
  { type: 'sh', n: 3, maj: 'A', min: 'f♯' },
  { type: 'sh', n: 4, maj: 'E', min: 'c♯' },
  { type: 'sh', n: 5, maj: 'B', min: 'g♯' },
  { type: 'sh', n: 6, maj: 'F♯', min: 'd♯' },
  { type: 'sh', n: 7, maj: 'C♯', min: 'a♯' },
  { type: 'fl', n: 0, maj: 'C', min: 'a' },
  { type: 'fl', n: 1, maj: 'F', min: 'd' },
  { type: 'fl', n: 2, maj: 'B♭', min: 'g' },
  { type: 'fl', n: 3, maj: 'E♭', min: 'c' },
  { type: 'fl', n: 4, maj: 'A♭', min: 'f' },
  { type: 'fl', n: 5, maj: 'D♭', min: 'b♭' },
  { type: 'fl', n: 6, maj: 'G♭', min: 'e♭' },
  { type: 'fl', n: 7, maj: 'C♭', min: 'a♭' },
];

describe('keyInfo：28 个调号 × 大/小调主音名逐一断言', () => {
  for (const { type, n, maj, min } of KEYS) {
    it(`${type}${n} → ${maj} 大调 / ${min} 小调`, () => {
      const info = keyInfo(type, n);
      expect(info.maj).toBe(maj);
      expect(info.min).toBe(min);
      expect(info.tonicMaj).toBe(maj);
      expect(info.tonicMin).toBe(min);
      expect(info.sign).toBe(type === 'sh' ? '♯' : '♭');
    });
  }

  it('数据表本身与期望值一致（禁止改动数值）', () => {
    expect(SH_MAJ).toEqual(KEYS.filter((k) => k.type === 'sh').map((k) => k.maj));
    expect(SH_MIN).toEqual(KEYS.filter((k) => k.type === 'sh').map((k) => k.min));
    expect(FL_MAJ).toEqual(KEYS.filter((k) => k.type === 'fl').map((k) => k.maj));
    expect(FL_MIN).toEqual(KEYS.filter((k) => k.type === 'fl').map((k) => k.min));
  });

  it('letters = 升/降序前 n 个音名', () => {
    expect(keyInfo('sh', 0).letters).toEqual([]);
    expect(keyInfo('sh', 3).letters).toEqual(['F', 'C', 'G']);
    expect(keyInfo('sh', 7).letters).toEqual(['F', 'C', 'G', 'D', 'A', 'E', 'B']);
    expect(keyInfo('fl', 2).letters).toEqual(['B', 'E']);
    expect(keyInfo('fl', 7).letters).toEqual(['B', 'E', 'A', 'D', 'G', 'C', 'F']);
  });

  it('n 越界抛 RangeError', () => {
    expect(() => keyInfo('sh', -1)).toThrow(RangeError);
    expect(() => keyInfo('fl', 8)).toThrow(RangeError);
    expect(() => keyInfo('sh', 1.5)).toThrow(RangeError);
  });
});

describe('判定口诀纯函数', () => {
  it('升号调主音 = 最右升号再升半音', () => {
    expect(sharpTonicByRule(1)).toBe('G'); // F♯→G
    expect(sharpTonicByRule(2)).toBe('D'); // C♯→D
    expect(sharpTonicByRule(3)).toBe('A'); // G♯→A
    expect(sharpTonicByRule(4)).toBe('E'); // D♯→E
    expect(sharpTonicByRule(5)).toBe('B'); // A♯→B
    expect(sharpTonicByRule(6)).toBe('F♯'); // E♯→F♯
    expect(sharpTonicByRule(7)).toBe('C♯'); // B♯→C♯
    expect(sharpTonicByRule(0)).toBe('C');
  });

  it('降号调主音 = 倒二降号音名（1♭ 特例 = F）', () => {
    expect(flatTonicByRule(1)).toBe('F');
    expect(flatTonicByRule(2)).toBe('B♭');
    expect(flatTonicByRule(3)).toBe('E♭');
    expect(flatTonicByRule(7)).toBe('C♭');
  });

  it('小调主音 = 大调主音下小三度', () => {
    expect(minorTonicByRule('C')).toBe('a');
    expect(minorTonicByRule('F')).toBe('d');
    expect(minorTonicByRule('C♯')).toBe('a♯');
    expect(minorTonicByRule('C♭')).toBe('a♭');
    expect(minorTonicByRule('B♭')).toBe('g');
    expect(minorTonicByRule('G♭')).toBe('e♭');
  });

  it('tonicByRule 与 28 个调号期望值全部吻合', () => {
    for (const { type, n, maj, min } of KEYS) {
      expect(tonicByRule(type, n), `${type}${n}`).toEqual({ maj, min });
    }
  });
});

describe('anchorText：直读锚点文案', () => {
  it('升号调：最右升 X♯+半音 = 主音', () => {
    expect(anchorText('sh', 3, 'maj')).toBe('最右升 G♯+半音 = 主音 A');
    expect(anchorText('sh', 7, 'maj')).toBe('最右升 B♯+半音 = 主音 C♯');
  });

  it('降号调：倒二降 = 主音', () => {
    expect(anchorText('fl', 2, 'maj')).toBe('倒二降 B♭ = 主音 B♭');
    expect(anchorText('fl', 7, 'maj')).toBe('倒二降 C♭ = 主音 C♭');
  });

  it('1♭ 特例', () => {
    expect(anchorText('fl', 1, 'maj')).toBe('只有 B♭ → F 大调');
  });

  it('0♯♭', () => {
    expect(anchorText('sh', 0, 'maj')).toBe('无升降号 = C 大调');
  });

  it('小调附「大调主音下小三度」', () => {
    expect(anchorText('sh', 7, 'min')).toBe('最右升 B♯+半音 = 主音 C♯（小调 = 大调主音下小三度 → a♯）');
    expect(anchorText('fl', 1, 'min')).toBe('只有 B♭ → F 大调（小调 = 大调主音下小三度 → d）');
    expect(anchorText('fl', 7, 'min')).toBe('倒二降 C♭ = 主音 C♭（小调 = 大调主音下小三度 → a♭）');
    expect(anchorText('sh', 0, 'min')).toBe('无升降号 = C 大调（小调 = 大调主音下小三度 → a）');
    for (const { type, n } of KEYS) {
      expect(anchorText(type, n, 'min')).toContain('大调主音下小三度');
    }
  });
});

describe('noteInfo：认音逻辑', () => {
  it('6♯ 下的 E♯（高音谱号 step 0 = E4）', () => {
    expect(noteInfo(0, 'sh', 6, 'treble')).toEqual({
      letter: 'E',
      oct: 4,
      acc: 1,
      deg: 7,
      posName: '第1线',
    });
  });

  it('6♯ 下的 C♯（高音谱号 step 5 = C5）', () => {
    expect(noteInfo(5, 'sh', 6, 'treble')).toEqual({
      letter: 'C',
      oct: 5,
      acc: 1,
      deg: 5,
      posName: '第3间',
    });
  });

  it('7♭ 下的 F♭（高音谱号 step 8 = F5 / 低音谱号 step 6 = F3）', () => {
    expect(noteInfo(8, 'fl', 7, 'treble')).toEqual({
      letter: 'F',
      oct: 5,
      acc: -1,
      deg: 4,
      posName: '第5线',
    });
    expect(noteInfo(6, 'fl', 7, 'bass')).toEqual({
      letter: 'F',
      oct: 3,
      acc: -1,
      deg: 4,
      posName: '第4线',
    });
  });

  it('低音谱号抽样', () => {
    // 3♯（F♯ C♯ G♯）：低音谱号 step 0 = G2 → G♯2 = A 大调第 7 级
    expect(noteInfo(0, 'sh', 3, 'bass')).toEqual({
      letter: 'G',
      oct: 2,
      acc: 1,
      deg: 7,
      posName: '第1线',
    });
    // 2♭（B♭ E♭）：低音谱号 step 2 = B2 → B♭2 = B♭ 大调第 1 级
    expect(noteInfo(2, 'fl', 2, 'bass')).toEqual({
      letter: 'B',
      oct: 2,
      acc: -1,
      deg: 1,
      posName: '第2线',
    });
    // 0♯♭：低音谱号 step 4 = D3 = C 大调第 2 级
    expect(noteInfo(4, 'sh', 0, 'bass')).toEqual({
      letter: 'D',
      oct: 3,
      acc: 0,
      deg: 2,
      posName: '第3线',
    });
  });

  it('高音谱号抽样', () => {
    // 0♯♭：step 4 = B4 = C 大调第 7 级
    expect(noteInfo(4, 'sh', 0, 'treble')).toEqual({
      letter: 'B',
      oct: 4,
      acc: 0,
      deg: 7,
      posName: '第3线',
    });
    // 5♭（B♭ E♭ A♭ D♭ G♭）：step 0 = E4 → E♭4 = D♭ 大调第 2 级
    expect(noteInfo(0, 'fl', 5, 'treble')).toEqual({
      letter: 'E',
      oct: 4,
      acc: -1,
      deg: 2,
      posName: '第1线',
    });
  });

  it('posName 覆盖 step 0..8', () => {
    const names = ['第1线', '第1间', '第2线', '第2间', '第3线', '第3间', '第4线', '第4间', '第5线'];
    names.forEach((name, step) => {
      expect(noteInfo(step, 'sh', 0, 'treble').posName).toBe(name);
    });
  });

  it('step 越界抛 RangeError', () => {
    expect(() => noteInfo(-1, 'sh', 0, 'treble')).toThrow(RangeError);
    expect(() => noteInfo(9, 'sh', 0, 'treble')).toThrow(RangeError);
  });
});
