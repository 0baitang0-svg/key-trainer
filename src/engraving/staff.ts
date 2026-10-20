/**
 * 谱表刻绘：谱表、谱号、调号升降号、可选目标音符（含加线）→ SVG 字符串。
 * 几何逻辑照搬旧版单文件训练器 buildStaff() / glyphSVG()。
 */

import { GLYPHS, GlyphName } from './smufl-glyphs';
import { TSH, TFL, BSH, BFL } from './key-signature-slots';

export type Clef = 'treble' | 'bass';
export type SigType = 'sh' | 'fl';

/** 谱间距（半间 = S/2） */
export const STAFF_S = 12;
export const STAFF_X0 = 40;
export const STAFF_X1 = 600;
/** 谱表底线 y */
export const STAFF_BOTTOM = 120;
export const STAFF_VIEWBOX = '0 0 640 170';
/** 主题 accent 描边（直读锚点高亮，CSS 变量随主题切换） */
export const ACCENT_STROKE = 'var(--accent)';

/** 和弦堆叠里的单个音符头（step 同单音语义：0=第1线，超出范围自动加线） */
export interface StaffNote {
  step: number;
  acc?: -2 | -1 | 0 | 1 | 2;
}

export interface StaffOptions {
  clef: Clef;
  type: SigType;
  /** 升/降号个数 0..7 */
  n: number;
  /** 目标音符 step（0=第1线 … 8=第5线）；超出范围时自动加线 */
  step?: number;
  /** 高亮第 k 个升降号（0 起索引），直读锚点动画用，加朱红描边 */
  accent?: number;
  /** 和弦堆叠音符（同一 x 多符头，三/四音）；与 step 并存时 notes 优先 */
  notes?: StaffNote[];
  /** 和弦号文本（如 'G7'），<text> 画在谱面上方 */
  chordSymbolText?: string;
}

/**
 * 单个字形 → SVG <g> 片段。y 为该字形锚点（已翻转坐标系）。
 * @param stroke 可选描边（accent 高亮用）
 * @param cls    可选 class（测试 / 样式挂钩）
 */
export function glyphSVG(
  name: GlyphName,
  x: number,
  y: number,
  S: number,
  fill: string,
  stroke?: string,
  cls?: string,
): string {
  const u = S / 250;
  return (
    '<g' + (cls ? ' class="' + cls + '"' : '') +
    ' transform="translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') scale(' + u.toFixed(6) + ' -' + u.toFixed(6) + ')">' +
    '<path d="' + GLYPHS[name].d + '" fill="' + fill + '"' +
    (stroke ? ' stroke="' + stroke + '" stroke-width="2.4" vector-effect="non-scaling-stroke"' : '') +
    '/></g>'
  );
}

function ledgerLine(cx: number, y: number): string {
  return (
    '<line class="ledger" x1="' + (cx - 11) + '" y1="' + y + '" x2="' + (cx + 11) + '" y2="' + y +
    '" stroke="var(--staff-ink)" stroke-width="1.6"/>'
  );
}

/**
 * 构建整张谱表 SVG 内容（不含外层 <svg>）。
 * - 谱表 5 线 + 起止小节线
 * - 谱号（高音 gClef / 低音 fClef）
 * - n 个升/降号（槽位查 key-signature-slots.ts）
 * - 可选目标音符（符头旋转椭圆 + 符干 + 加线）
 */
export function buildStaff(opts: StaffOptions): string {
  const { clef, type, n, step, accent, notes, chordSymbolText } = opts;
  if (!Number.isInteger(n) || n < 0 || n > 7) {
    throw new RangeError(`n 必须是 0..7 的整数，收到 ${n}`);
  }
  if (accent !== undefined && (!Number.isInteger(accent) || accent < 0 || accent >= n)) {
    throw new RangeError(`accent 必须是 0..${n - 1} 的整数，收到 ${accent}`);
  }

  const S = STAFF_S;
  const x0 = STAFF_X0;
  const x1 = STAFF_X1;
  const bottom = STAFF_BOTTOM;
  let s = '';

  for (let i = 0; i < 5; i++) {
    s += '<line class="sline" x1="' + x0 + '" y1="' + (bottom - i * S) + '" x2="' + x1 + '" y2="' + (bottom - i * S) +
      '" stroke="var(--staff)" stroke-width="1.1"/>';
  }
  s += '<line class="send" x1="' + x0 + '" y1="' + (bottom - 4 * S) + '" x2="' + x0 + '" y2="' + bottom +
    '" stroke="var(--staff)" stroke-width="1.1"/>';
  s += '<line class="send" x1="' + (x1 - 5) + '" y1="' + (bottom - 4 * S) + '" x2="' + (x1 - 5) + '" y2="' + bottom +
    '" stroke="var(--staff)" stroke-width="1.1"/>';
  s += '<line class="send thick" x1="' + x1 + '" y1="' + (bottom - 4 * S) + '" x2="' + x1 + '" y2="' + bottom +
    '" stroke="var(--staff)" stroke-width="2.6"/>';

  const treble = clef === 'treble';
  const clefName: GlyphName = treble ? 'gClef' : 'fClef';
  const clefY = treble ? bottom - S : bottom - 3 * S;
  s += glyphSVG(clefName, 56, clefY, S, 'var(--staff-ink)', undefined, 'clef');

  if (n > 0) {
    const steps = treble ? (type === 'sh' ? TSH : TFL) : (type === 'sh' ? BSH : BFL);
    const gname: GlyphName = type === 'sh' ? 'accidentalSharp' : 'accidentalFlat';
    const u = S / 250;
    const off = type === 'sh' ? -124.5 * u : -120 * u;
    let x = 56 + GLYPHS[clefName].adv * u + 1.15 * S;
    for (let i = 0; i < n; i++) {
      const hot = accent === i;
      s += glyphSVG(
        gname,
        x + off,
        bottom - steps[i] * (S / 2),
        S,
        'var(--staff-ink)',
        hot ? ACCENT_STROKE : undefined,
        hot ? 'acc acc-accent' : 'acc',
      );
      x += 1.3 * S;
    }
  }

  if (notes && notes.length > 0) {
    // 和弦堆叠：同一 x 多符头，二度（step 差 1）时后一个符头右移 9px 兜底
    const half = S / 2;
    const cx = 350;
    const placed: Array<{ step: number; acc: number; x: number; y: number }> = [];
    for (const nt of notes) {
      let x = cx;
      for (const p of placed) {
        if (Math.abs(p.step - nt.step) === 1) x = Math.max(x, p.x + 9);
      }
      placed.push({ step: nt.step, acc: nt.acc ?? 0, x, y: bottom - nt.step * half });
    }
    // 加线：偶数 step 在谱外时补短横线（step ≤ -2 或 ≥ 10）
    for (const p of placed) {
      for (let e = -2; e >= p.step; e -= 2) s += ledgerLine(p.x, bottom - e * half);
      for (let e = 10; e <= p.step; e += 2) s += ledgerLine(p.x, bottom - e * half);
    }
    // 临时记号：符头左侧，acc=±2 画两个并排（间距 0.7*S），acc=0 不画
    const u = S / 250;
    for (const p of placed) {
      if (p.acc === 0) continue;
      const gname: GlyphName = p.acc > 0 ? 'accidentalSharp' : 'accidentalFlat';
      const count = Math.abs(p.acc) >= 2 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const gap = count === 2 ? (k === 0 ? -0.35 * S : 0.35 * S) : 0;
        const off = -GLYPHS[gname].adv * u * 0.5;
        s += glyphSVG(gname, p.x - 16 + gap + off, p.y, S, 'var(--staff-ink)', undefined, 'note-acc');
      }
    }
    for (const p of placed) {
      s += '<ellipse class="notehead" cx="' + p.x + '" cy="' + p.y + '" rx="7.6" ry="5.4" transform="rotate(-16 ' + p.x + ' ' + p.y + ')" fill="var(--staff-ink)"/>';
    }
    // 单符干：从最低音符头出发（最低音 step<4 向上长 44，否则反向向下）
    const lowest = placed.reduce((a, b) => (b.y > a.y ? b : a));
    if (lowest.step < 4) s += '<rect class="stem" x="' + (lowest.x + 6.9) + '" y="' + (lowest.y - 43) + '" width="1.7" height="44" fill="var(--staff-ink)"/>';
    else s += '<rect class="stem" x="' + (lowest.x - 8.6) + '" y="' + (lowest.y - 1) + '" width="1.7" height="44" fill="var(--staff-ink)"/>';
  } else if (step != null) {
    const y = bottom - step * (S / 2);
    const cx = 350;
    // 加线：偶数 step 在谱外时补短横线（step ≤ -2 或 ≥ 10）
    for (let e = -2; e >= step; e -= 2) s += ledgerLine(cx, bottom - e * (S / 2));
    for (let e = 10; e <= step; e += 2) s += ledgerLine(cx, bottom - e * (S / 2));
    s += '<ellipse class="notehead" cx="' + cx + '" cy="' + y + '" rx="7.6" ry="5.4" transform="rotate(-16 ' + cx + ' ' + y + ')" fill="var(--staff-ink)"/>';
    if (step < 4) s += '<rect class="stem" x="' + (cx + 6.9) + '" y="' + (y - 43) + '" width="1.7" height="44" fill="var(--staff-ink)"/>';
    else s += '<rect class="stem" x="' + (cx - 8.6) + '" y="' + (y - 1) + '" width="1.7" height="44" fill="var(--staff-ink)"/>';
  }

  if (chordSymbolText) {
    // 和弦号：谱面左上、第 5 线上方约 18 单位，serif 字体
    s += '<text class="chord-symbol" x="' + (x0 + 2) + '" y="' + (bottom - 4 * S - 18) +
      '" font-family="var(--serif)" font-size="20" fill="var(--staff-ink)">' + escapeXML(chordSymbolText) + '</text>';
  }

  return s;
}

/** XML 文本转义（和弦号等小文本用） */
function escapeXML(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
