/**
 * 训练屏幕（核心）：一屏一题。
 * 顶部进度 / 题号 / 连击；中间谱面卡片；下半屏拇指区作答键盘。
 * 答对绿描边 + 主和弦琶音自动下一题；答错弹直读锚点卡（1.2s 自动继续）。
 * 上滑跳过（入错题队列）、下滑收藏；首遇调号先弹微课卡。
 */

import { h, icon } from '../dom';
import type { AppContext, ScreenInstance } from '../router';
import { answerPad, type AnswerPad } from '../components/answer-pad';
import { chordInput, type ChordInput } from '../components/chord-input';
import {
  midiToKeyDef,
  pianoKeyboard,
  pianoKeyDefs,
  type KeyboardView,
  type KeyMark,
  type PianoKeyboard,
} from '../components/piano-keyboard';
import { seqStage, type SeqStage } from '../components/seq-stage';
import { staffOptionsFor, staffView } from '../components/staff-view';
import { feedbackBanner, type FeedbackBanner } from '../components/feedback-banner';
import { lessonSheet } from '../components/lesson-card';
import { showCoachOnce } from '../components/coach-mark';
import { getLesson, moduleForQuestion } from '../../content/micro-lessons';
import { findPiece } from '../../content/repertoire';
import { hasSeenFlag, markSeen } from '../../core/store';
import { findLevel } from '../../core/levels';
import { judgeStep } from '../../core/seq-generator';
import {
  CHORD_INTERVALS,
  chordPcSet,
  chordSymbol,
  pitchNameToString,
  spellChord,
  type ChordSpec,
  type PitchName,
} from '../../core/chord-theory';
import { keyAlterations, keyLabel } from '../../core/scale-theory';
import { playCadence, playChord, playCorrect, playWrong } from '../../audio/sfx';
import { playMelody, noteToMidi } from '../../audio/melody-synth';
import { haptic } from '../../platform/haptics';
import {
  SessionController,
  anchorAccent,
  displayOptions,
  type CurrentQuestion,
  type SessionBlock,
  type SessionPlan,
} from '../session-controller';
import type { Question } from '../../core/question-generator';

const OK_PHRASES = ['稳', '对路', '漂亮', '就是这个感觉'];
const BAD_PHRASES = ['这个再想想', '差一点点', '不急，看锚点'];

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 倒计时 → 「2:31」 */
function fmtCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, '0')}`;
}

/* ---------- 和弦题辅助 ---------- */

/** 和弦 → 齐奏 midi（根音取 4 号八度，按音程叠上去） */
function chordMidis(spec: ChordSpec): number[] {
  const rootMidi = noteToMidi(spec.root.letter, 4, spec.root.acc);
  return CHORD_INTERVALS[spec.quality].map((iv) => rootMidi + iv.semi);
}

/** 音名串 → PitchName（'G♯' / 'B♭'） */
function pitchOf(name: string): PitchName {
  const letter = (name[0] ?? 'C').toUpperCase();
  let acc = 0;
  for (const ch of name.slice(1)) {
    if (ch === '♯') acc += 1;
    else if (ch === '♭') acc -= 1;
    else if (ch === '𝄪') acc += 2;
    else if (ch === '𝄫') acc -= 2;
  }
  return { letter, acc };
}

/** 音名串 → 键盘高亮标记（取键盘范围内第一个同 pitch class 的键） */
function keyMarksFor(names: readonly string[]): KeyMark[] {
  const defs = pianoKeyDefs(48, 2);
  const marks: KeyMark[] = [];
  for (const name of names) {
    const pc = chordPcSet({ root: pitchOf(name), quality: 'maj' })[0];
    const hit = defs.find((d) => ((d.midi % 12) + 12) % 12 === pc);
    if (hit) marks.push({ midi: hit.midi, kind: 'target', label: name });
  }
  return marks;
}

export function sessionScreen(ctx: AppContext, params: unknown): ScreenInstance {
  const plan = (params as { plan: SessionPlan }).plan;
  const controller = new SessionController(ctx, plan);

  const stage = h('div', { className: 'session__stage' });
  const padHost = h('div', { className: 'session__pad' });
  const overlay = h('div', { className: 'session__overlay' });
  const hintEl = h('div', { className: 'session__hint', text: '上滑跳过 · 下滑收藏' });

  const comboNum = h('span', { className: 'combo__num', text: '0' });
  const progressFill = h('div', { className: 'progress__fill' });
  const blockLabel = h('span', { className: 'session__block', text: plan.title });
  const numLabel = h('span', { className: 'session__nums', text: '' });
  const timeLabel = h('span', { className: 'session__time', text: '' });
  const lessonChip = h('button', {
    className: 'lesson-chip',
    attrs: { type: 'button', 'aria-label': '打开本题微课' },
    html: `${icon('book', 16).outerHTML}<span>微课</span>`,
    on: { click: () => openManualLesson() },
  });
  const metaRight = h('div', { className: 'session__meta-right' }, lessonChip, timeLabel);

  const root = h(
    'section',
    { className: 'screen screen--session' },
    h(
      'header',
      { className: 'session__head' },
      h('button', {
        className: 'icon-btn',
        attrs: { type: 'button', 'aria-label': '返回' },
        html: icon('back', 22).outerHTML,
        on: { click: () => leave() },
      }),
      h(
        'div',
        { className: 'session__meta' },
        h('div', { className: 'session__meta-row' }, blockLabel, metaRight),
        h('div', { className: 'progress' }, progressFill),
        numLabel,
      ),
      h('div', { className: 'combo' }, comboNum, h('span', { className: 'combo__label', text: '连击' })),
    ),
    stage,
    hintEl,
    padHost,
    overlay,
  );

  let pad: AnswerPad | null = null;
  let chordIn: ChordInput | null = null;
  let feedback: FeedbackBanner | null = null;
  /** 当前弹层的关闭动作（返回键拦截用，无弹层时为 null） */
  let overlayCloser: (() => void) | null = null;
  /** 退出确认弹层的关闭动作（返回键拦截用，无弹层时为 null） */
  let confirmCloser: (() => void) | null = null;
  let combo = 0;
  let blockRecordStart = 0;
  let lastBlock: SessionBlock | null = null;
  let destroyed = false;
  /** 已出题数（手势提示等一次性引导按题号触发） */
  let askCount = 0;
  const timers: number[] = [];

  /* ---------- 视奏（note）判题状态 ---------- */

  /** 当前题（仅视奏题非 null） */
  let seqQ: Question | null = null;
  let seqInst: SeqStage | null = null;
  let seqKb: PianoKeyboard | null = null;
  /** 当前判题拍点（0 起；= len 时串已完成） */
  let seqIdx = 0;
  /** 错拍数（每拍只计一次，14/16 语义） */
  let seqErrors = 0;
  let seqFirstErr = -1;
  /** 当前拍是否已计过错（同拍连错不重复计数） */
  let seqBeatMissed = false;
  /** 同拍连错计数（2 错 ghost、3 错强制前进） */
  let seqMissStreak = 0;
  /** 首次按下的时间戳（整串耗时起点，0 = 未开弹） */
  let seqStartedAt = 0;
  /** 整串已提交（800ms 过渡期屏蔽输入） */
  let seqFinishing = false;
  /** 键盘上按住的键（judgeStep 输入，抬起即移除） */
  const seqPressed = new Set<number>();
  let seqMarks: KeyMark[] = [];
  /** 本节第几道视奏题（功能气泡分两题触发） */
  let seqAskNo = 0;
  /** 当前展示的题（完成反馈 / 退出语义用） */
  let currentCq: CurrentQuestion | null = null;

  /* ---------- 横屏检测（键盘视窗 view 与 CSS 类） ---------- */

  const orientationMq = typeof window.matchMedia === 'function' ? window.matchMedia('(orientation: landscape)') : null;

  function isLandscape(): boolean {
    return orientationMq?.matches === true;
  }

  function keyboardView(): KeyboardView {
    return isLandscape() ? 'wide' : 'std';
  }

  /** 当前视奏键盘（函数内读取，避开 askCurrent 里的空值收窄） */
  function currentSeqKb(): PianoKeyboard | null {
    return seqKb;
  }

  /**
   * 手动打开当前题所属类目的完整微课（头部「微课」按钮）。
   * 无 seenKeys 读写、开关关闭也照常打开；打开期间禁输入、返回键可关。
   */
  function openManualLesson(): void {
    if (overlayCloser !== null || feedback !== null || currentCq === null) return;
    const lesson = getLesson(moduleForQuestion(currentCq.question));
    if (lesson === undefined) return;
    pad?.setDisabled(true);
    chordIn?.setDisabled(true);
    seqKb?.setDisabled(true);
    const close = (): void => {
      overlayCloser = null;
      sheet.destroy();
      overlay.replaceChildren();
      pad?.setDisabled(false);
      chordIn?.setDisabled(false);
      seqKb?.setDisabled(false);
      pumpCoach();
    };
    const sheet = lessonSheet(lesson, { mode: 'manual', onDismiss: close });
    overlayCloser = close;
    overlay.replaceChildren(sheet.root);
  }

  /* ---------- 功能气泡队列（串行弹，微课卡弹层优先） ---------- */

  interface CoachJob {
    /** 盖在弹层上弹（微课卡气泡专用） */
    overOverlay: boolean;
    run(): void;
  }
  const coachQueue: CoachJob[] = [];
  let coachBusy = false;

  function pumpCoach(): void {
    if (coachBusy || coachQueue.length === 0) return;
    const head = coachQueue[0];
    if (overlayCloser !== null && !head.overOverlay) return;
    coachQueue.shift();
    coachBusy = true;
    head.run();
  }

  /** 排一条只弹一次的气泡：已见过不排；锚点没了 / 已弹过则跳过 */
  function offerCoach(
    flag: string,
    target: () => Element | null,
    title: string,
    body: string,
    overOverlay = false,
  ): void {
    if (hasSeenFlag(ctx.getState(), flag)) return;
    coachQueue.push({
      overOverlay,
      run(): void {
        const el = target();
        if (el === null || !el.isConnected || hasSeenFlag(ctx.getState(), flag)) {
          coachBusy = false;
          pumpCoach();
          return;
        }
        showCoachOnce(ctx, flag, {
          target: el,
          title,
          body,
          onDone: () => {
            coachBusy = false;
            pumpCoach();
          },
        });
      },
    });
    pumpCoach();
  }

  const later = (fn: () => void, ms: number): void => {
    timers.push(window.setTimeout(fn, ms));
  };

  /* ---------- 顶栏进度 ---------- */

  function renderHead(cq: CurrentQuestion): void {
    blockLabel.textContent = `${cq.block.title} · 第 ${plan.blocks.indexOf(cq.block) + 1} 段`;
    numLabel.textContent = `第 ${cq.indexInBlock} / ${cq.totalInBlock} 题`;
    progressFill.style.setProperty('--progress', `${(cq.indexInBlock / cq.totalInBlock) * 100}%`);
    comboNum.textContent = String(combo);
    if (Number.isFinite(cq.block.durationMs)) {
      const left = Math.max(0, cq.block.durationMs - (Date.now() - blockStartedAt(cq.block)));
      timeLabel.textContent = `剩余 ${fmtCountdown(left)}`;
    } else {
      timeLabel.textContent = cq.isBoss ? 'BOSS 题' : '不限时';
    }
  }

  const blockStartTimes = new Map<SessionBlock, number>();
  function blockStartedAt(block: SessionBlock): number {
    const t = blockStartTimes.get(block);
    if (t !== undefined) return t;
    blockStartTimes.set(block, Date.now());
    return Date.now();
  }

  /* ---------- 谱面 / 提问 ---------- */

  function promptOf(cq: CurrentQuestion): string {
    const q = cq.question;
    const cqq = q.cq;
    if (cqq) {
      const kl = cqq.tonic ? keyLabel(cqq.tonic, cqq.scale ?? 'maj') : '';
      switch (cqq.kind) {
        case 'dom-key':
          return '这个属七是哪些调的属和弦？';
        case 'key-dom':
          return `${kl}的属七和弦是？`;
        case 'listen-func':
          return '听和弦，它是什么功能？';
        case 'deg2chord':
          return `${kl}第 ${cqq.degree} 级的顺阶和弦是？`;
        case 'chord2deg':
          return '这个和弦是第几级 · 什么功能？';
        case 'chord2func':
          return '这个和弦是什么功能？';
        case 'key2acc':
          return `${kl}有哪些变化音？`;
        case 'deg2note':
          return `${kl}第 ${cqq.degree} 级是哪个音名？`;
        case 'acc2key':
          return '高亮的音属于哪个调？';
        case 'build-notes':
        case 'build-mc':
          return `拼出 ${cqq.chord ? chordSymbol(cqq.chord) : ''} 的组成音`;
        case 'notes2quality':
          return '这个和弦是什么性质？';
      }
    }
    if (q.train === 'note') return '跟着谱子弹：调号在最左，往后会滑走';
    if (q.train === 'piece') return '听 / 看动机，它在什么调上？';
    return q.ask === 'maj' ? '大调主音是？' : '小调主音是？';
  }

  /** 和弦题题面：listen-func 放播放按钮、acc2key/deg2note/build-mc 放钢琴键盘、其余谱面 */
  function renderChordStage(q: Question): void {
    const cqq = q.cq;
    if (!cqq) return;
    switch (cqq.kind) {
      case 'listen-func': {
        const play = (): void => {
          try {
            if (cqq.chord) playChord(chordMidis(cqq.chord));
          } catch {
            // 音频不可用时静默
          }
        };
        stage.append(
          h(
            'div',
            { className: 'listen-card' },
            h('p', { className: 'listen-card__title', text: '听这个和弦' }),
            h('p', { className: 'listen-card__meta', text: '判断它的和声功能' }),
            h('button', {
              className: 'btn btn--primary btn--play',
              attrs: { type: 'button', 'aria-label': '播放和弦' },
              html: `${icon('play', 20).outerHTML}<span>再听一次</span>`,
              on: { click: play },
            }),
          ),
        );
        play(); // 出题时播放
        break;
      }
      case 'acc2key': {
        const names = cqq.tonic
          ? keyAlterations(cqq.tonic, cqq.scale ?? 'maj')
              .filter((a) => a.altered)
              .map((a) => a.note)
          : [];
        const kb = pianoKeyboard({ octaves: 2, labels: 'alteration', marks: keyMarksFor(names) });
        stage.append(h('div', { className: 'staff-card__canvas' }, kb.root));
        break;
      }
      case 'deg2note': {
        const kb = pianoKeyboard({
          octaves: 2,
          labels: 'degree',
          tonic: cqq.tonic,
          scale: cqq.scale,
          marks: keyMarksFor(cqq.tonic ? [pitchNameToString(cqq.tonic)] : []),
        });
        stage.append(h('div', { className: 'staff-card__canvas' }, kb.root));
        break;
      }
      case 'build-mc': {
        const kb = pianoKeyboard({
          octaves: 2,
          labels: 'noteName',
          marks: cqq.chord ? keyMarksFor([pitchNameToString(cqq.chord.root)]) : [],
        });
        stage.append(h('div', { className: 'staff-card__canvas' }, kb.root));
        break;
      }
      case 'build-notes':
        break; // 键盘拼和弦在作答区（chordInput）
      default: {
        // 谱面题：和弦题传 notes 堆叠 + chordSymbolText；notes2quality 只给组成音音名串
        const caption =
          cqq.kind === 'notes2quality' && cqq.chord
            ? spellChord(cqq.chord)
                .map(pitchNameToString)
                .join(' ')
            : cqq.tonic
              ? keyLabel(cqq.tonic, cqq.scale ?? 'maj')
              : undefined;
        stage.append(staffView({ ...staffOptionsFor(q), caption }));
      }
    }
  }

  function renderStage(cq: CurrentQuestion): void {
    const q = cq.question;
    seqInst?.destroy();
    seqInst = null;
    stage.replaceChildren();
    if (q.seq !== undefined) {
      // 视奏：滚动谱面（ghost 回调接到键盘高亮，键盘在 askCurrent 里挂载）
      seqInst = seqStage({
        seq: q.seq,
        clef: q.clef,
        type: q.type,
        n: q.n,
        onGhost: (midis) => applySeqGhost(midis),
      });
      stage.append(seqInst.root);
      seqInst.setCurrent(0);
      seqInst.goTo(0);
    } else if (q.cq !== undefined) {
      renderChordStage(q);
    } else if (q.train === 'piece' && q.pieceId) {
      const piece = findPiece(q.pieceId);
      if (piece && q.pieceKind === 'listen') {
        stage.append(
          h(
            'div',
            { className: 'listen-card' },
            h('p', { className: 'listen-card__title', text: piece.title }),
            h('p', { className: 'listen-card__meta', text: `${piece.composer} · ${piece.keyLabel}` }),
            h('button', {
              className: 'btn btn--primary btn--play',
              attrs: { type: 'button', 'aria-label': '播放动机' },
              html: `${icon('play', 20).outerHTML}<span>播放动机</span>`,
              on: {
                click: () => {
                  try {
                    playMelody(piece.motif, 92);
                  } catch {
                    // 音频不可用时静默
                  }
                },
              },
            }),
          ),
        );
      } else {
        const caption = piece ? `${piece.title} · ${piece.composer}` : undefined;
        stage.append(staffView({ ...staffOptionsFor(q), caption }));
        if (piece && q.pieceKind === 'context') {
          stage.append(h('p', { className: 'stage-blurb', text: piece.blurb }));
        }
      }
    } else {
      stage.append(staffView(staffOptionsFor(q)));
    }
    stage.append(h('p', { className: 'prompt', text: promptOf(cq) }));
    if (cq.isBoss) stage.append(h('p', { className: 'boss-tag', text: 'BOSS 题 · 稳住' }));
  }

  /* ---------- 反馈 ---------- */

  function clearFeedback(): void {
    feedback?.destroy();
    feedback = null;
    overlayCloser = null;
    overlay.replaceChildren();
  }

  function showFeedback(ok: boolean, phrase: string, explain: string, cq: CurrentQuestion, autoMs: number, done: () => void): void {
    clearFeedback();
    const cont = (): void => {
      clearFeedback();
      done();
    };
    feedback = feedbackBanner({
      ok,
      phrase,
      explain,
      staff: ok ? undefined : { ...staffOptionsFor(cq.question, anchorAccent(cq.question)) },
      autoMs,
      onContinue: cont,
    });
    overlayCloser = cont;
    overlay.append(feedback.root);
  }

  /* ---------- 流程 ---------- */

  function askCurrent(cq: CurrentQuestion): void {
    askCount++;
    currentCq = cq;
    lastBlock = cq.block;
    renderHead(cq);
    renderStage(cq);
    pad?.destroy();
    pad = null;
    chordIn?.destroy();
    chordIn = null;
    seqKb?.destroy();
    seqKb = null;
    resetSeqState();
    const q = cq.question;
    const input = q.answerInput ?? 'options';
    if (q.seq !== undefined) {
      // 视奏题：无答题 pad，挂 pressMode 键盘 + 出题定位音域
      seqQ = q;
      seqAskNo++;
      padHost.dataset.layout = 'seq';
      mountSeqKeyboard(q);
    } else if (input === 'keyboard-build' || input === 'keyboard-tap') {
      // 键盘作答：pad 隐藏，确认后走 submitAnswer
      padHost.dataset.layout = input;
      chordIn = chordInput((midis) => submitAnswer(midis, cq));
      padHost.replaceChildren(chordIn.root);
    } else {
      const options = displayOptions(q);
      const layout: 'row3' | 'grid6' | 'grid4' = q.cq !== undefined ? (options.length <= 3 ? 'row3' : 'grid4') : 'grid6';
      pad = answerPad({
        options,
        layout,
        onPick: (label) => submitAnswer(label, cq),
      });
      padHost.replaceChildren(pad.root);
      padHost.dataset.layout = layout;
    }

    // 首遇微课：每个类目只弹一次；关闭（点知道了 / 返回键）即记已见，不再「跳过=再弹」
    const state = ctx.getState();
    const mid = moduleForQuestion(q);
    const lesson = getLesson(mid);
    if (state.config.showRuleCards && !state.seenKeys.includes(mid) && lesson !== undefined) {
      pad?.setDisabled(true);
      chordIn?.setDisabled(true);
      currentSeqKb()?.setDisabled(true);
      const dismiss = (): void => {
        overlayCloser = null;
        ctx.update((s) => markSeen(s, mid));
        sheet.destroy();
        overlay.replaceChildren();
        controller.markShown();
        pad?.setDisabled(false);
        chordIn?.setDisabled(false);
        seqKb?.setDisabled(false);
        pumpCoach(); // 卡片关掉后补弹排队的气泡
      };
      const sheet = lessonSheet(lesson, { mode: 'auto', onDismiss: dismiss });
      overlayCloser = dismiss;
      overlay.replaceChildren(sheet.root);
      // 首次弹微课卡：气泡盖在卡片上方（先看 flag，只弹一次）
      offerCoach(
        'coach.rulecard',
        () => sheet.root.querySelector('.mlesson'),
        '微课卡',
        '每个类目只弹一次；练习时随时点右上角「微课」复习。',
        true,
      );
    } else {
      controller.markShown();
    }

    // 一次性功能气泡：第 2 题提手势、拼和弦键盘题提键盘用法
    if (askCount === 2) {
      offerCoach('coach.swipe', () => hintEl, '滑动手势', '上滑跳过本题，下滑收藏，回头在结果页复习。');
    }
    if (input === 'keyboard-build') {
      offerCoach('coach.keyboard', () => chordIn?.root ?? null, '键盘拼和弦', '点选或划过即选键；左右滑动键盘区换八度，音符记在下方。');
    }
    if (q.seq !== undefined) {
      if (seqAskNo === 1) {
        offerCoach('coach.seq-keyboard', () => seqKb?.root ?? null, '视奏键盘', '按下发声，双音按两键，按错红闪重来。');
      } else if (seqAskNo === 2) {
        offerCoach('coach.seq-scroll', () => seqInst?.root ?? null, '谱面会走', '谱子会自己走：绿=过，红=错过。');
      }
    }
    pumpCoach();
  }

  /* ---------- 视奏（note）判题状态机 ---------- */

  function resetSeqState(): void {
    seqQ = null;
    seqIdx = 0;
    seqErrors = 0;
    seqFirstErr = -1;
    seqBeatMissed = false;
    seqMissStreak = 0;
    seqStartedAt = 0;
    seqFinishing = false;
    seqPressed.clear();
    seqMarks = [];
  }

  /** 挂 pressMode 键盘（横屏 wide / 竖屏 std），出题时 ensureRange 定位目标音域 */
  function mountSeqKeyboard(q: Question): void {
    const seq = q.seq;
    if (!seq) return;
    seqKb?.destroy();
    seqKb = pianoKeyboard({
      view: keyboardView(),
      interactive: true,
      pressMode: true,
      onPressDown: (midi) => onSeqPressDown(midi),
      onPressUp: (midi) => seqPressed.delete(midi),
    });
    padHost.replaceChildren(seqKb.root);
    seqKb.ensureRange(seq.loMidi, seq.hiMidi);
    seqKb.setMarks(seqMarks);
  }

  /** ghost 高亮（谱面 onGhost 回调透传到键盘） */
  function applySeqGhost(midis: readonly number[]): void {
    seqMarks = midis.map((m) => ({ midi: m, kind: 'ghost' as const }));
    seqKb?.setMarks(seqMarks);
  }

  /** 按下目标音提示：melody-synth 单音 */
  function playTargetHint(midis: readonly number[]): void {
    const m = midis[0];
    if (m === undefined) return;
    try {
      const d = midiToKeyDef(m);
      playMelody([{ letter: d.letter, oct: d.oct, acc: d.acc, dur: 0.3 }], 120);
    } catch {
      // 音频不可用时静默
    }
  }

  function onSeqPressDown(midi: number): void {
    const q = seqQ;
    if (q?.seq === undefined || seqFinishing || feedback !== null || overlayCloser !== null) return;
    const beat = q.seq.notes[seqIdx];
    if (!beat) return;
    if (seqStartedAt === 0) seqStartedAt = Date.now();
    seqPressed.add(midi);
    const verdict = judgeStep(beat.midis, [...seqPressed]);
    if (verdict === 'wait') {
      // 双音进度提示（如「1/2」小字）
      seqKb?.setHint(`${seqPressed.size}/${beat.midis.length}`);
      return;
    }
    if (verdict === 'ok') {
      onSeqOk();
      return;
    }
    onSeqMiss(beat.midis);
  }

  /** 判 ok：上色绿 → 前进一拍；弹完 → 整串提交 */
  function onSeqOk(): void {
    const seq = seqQ?.seq;
    if (!seq) return;
    seqPressed.clear();
    seqMissStreak = 0;
    seqBeatMissed = false;
    seqKb?.setHint(null);
    seqInst?.setGhost([]);
    seqInst?.freeze(false);
    seqInst?.markState(seqIdx, 'done');
    advanceSeq();
    void haptic('light');
    if (seqIdx >= seq.notes.length) finishSeq();
  }

  /** 判 miss：该拍计 1 错（同拍连错不重复计）、红闪冻结、播目标音；2 错 ghost、3 错强制前进 */
  function onSeqMiss(target: readonly number[]): void {
    const seq = seqQ?.seq;
    if (!seq) return;
    if (!seqBeatMissed) {
      seqBeatMissed = true;
      seqErrors++;
      if (seqFirstErr < 0) seqFirstErr = seqIdx;
    }
    seqPressed.clear();
    seqKb?.setHint(null);
    seqInst?.markState(seqIdx, 'miss');
    seqInst?.freeze(true);
    void haptic('error');
    playTargetHint(target);
    seqMissStreak++;
    if (seqMissStreak >= 2) seqInst?.setGhost(target);
    if (seqMissStreak >= 3) {
      seqMissStreak = 0;
      seqBeatMissed = false;
      seqInst?.setGhost([]);
      seqInst?.freeze(false);
      advanceSeq();
      if (seqIdx >= seq.notes.length) finishSeq();
    }
  }

  /** 当前拍完成后前进：当前高亮 / 平移 / 进度条推到下一拍 */
  function advanceSeq(): void {
    const seq = seqQ?.seq;
    if (!seq) return;
    seqIdx++;
    seqInst?.setCurrent(seqIdx);
    seqInst?.goTo(seqIdx);
    seqInst?.setProgress(seqIdx, seq.notes.length);
  }

  /** 整串弹完：0 错走答对反馈；有错走 toast + 800ms 直接进下一题（不弹锚点卡） */
  function finishSeq(): void {
    const q = seqQ;
    const cq = currentCq;
    if (q?.seq === undefined || cq === null || seqFinishing) return;
    seqFinishing = true;
    seqQ = null;
    const totalMs = seqStartedAt > 0 ? Date.now() - seqStartedAt : 0;
    const res = controller.submitSequence(seqErrors, totalMs, seqFirstErr);
    const total = q.seq.notes.length;
    if (res.ok) {
      combo++;
      comboNum.textContent = String(combo);
      try {
        playCorrect(q.type, q.n, q.ask, combo);
      } catch {
        // 音频不可用时静默
      }
      void haptic('success');
      showFeedback(true, pickOne(OK_PHRASES), res.explain, cq, 420, () => next());
    } else {
      combo = 0;
      comboNum.textContent = '0';
      try {
        playWrong();
      } catch {
        // 音频不可用时静默
      }
      void haptic('error');
      const hit = total - seqErrors;
      toast(seqFirstErr >= 0 ? `${hit}/${total} · 首错第 ${seqFirstErr + 1} 拍` : `${hit}/${total}`);
      later(() => next(), 800);
    }
  }

  /** 视奏已开弹（i>0）退出时走 skip 入错题队列；i=0 直接返回 */
  function skipStartedSeq(): void {
    if (seqFinishing) return;
    if (seqQ !== null && seqIdx > 0) {
      controller.skip();
      combo = 0;
      comboNum.textContent = '0';
    }
    resetSeqState();
  }

  function submitAnswer(answer: string | readonly number[], cq: CurrentQuestion): void {
    if (feedback !== null || (pad === null && chordIn === null)) return;
    pad?.setDisabled(true);
    chordIn?.setDisabled(true);
    const res = controller.submit(answer);
    // build 题提交后播正解和弦
    if (cq.question.train === 'build' && cq.question.cq?.chord) {
      try {
        playChord(chordMidis(cq.question.cq.chord));
      } catch {
        // 音频不可用时静默
      }
    }
    if (res.ok) {
      combo++;
      comboNum.textContent = String(combo);
      if (typeof answer === 'string') pad?.mark(answer, 'correct');
      try {
        playCorrect(cq.question.type, cq.question.n, cq.question.ask, combo);
      } catch {
        // 音频不可用时静默
      }
      void haptic('success');
      showFeedback(true, pickOne(OK_PHRASES), res.explain, cq, 420, () => next());
    } else {
      combo = 0;
      comboNum.textContent = '0';
      if (typeof answer === 'string') pad?.mark(answer, 'wrong');
      pad?.mark(res.correctLabel, 'correct');
      try {
        playWrong();
      } catch {
        // 音频不可用时静默
      }
      void haptic('error');
      showFeedback(false, pickOne(BAD_PHRASES), res.explain, cq, 1200, () => next());
    }
  }

  function next(): void {
    if (destroyed) return;
    clearFeedback();
    const before = lastBlock;
    const cq = controller.next();
    if (cq === null) {
      finishSession();
      return;
    }
    if (before !== null && before !== cq.block) {
      blockRecordStart = showBlockSummary(before, () => askCurrent(cq));
      return;
    }
    askCurrent(cq);
  }

  /** 块间小结卡片；返回新的记录游标 */
  function showBlockSummary(block: SessionBlock, done: () => void): number {
    const records = controller.allRecords.slice(blockRecordStart);
    const okCount = records.filter((r) => r.ok).length;
    const total = records.length;
    const nextStart = blockRecordStart + total;
    const close = (): void => {
      overlayCloser = null;
      sheet.remove();
      overlay.replaceChildren();
      done();
    };
    const sheet = h(
      'div',
      { className: 'sheet-wrap' },
      h(
        'div',
        { className: 'sheet block-summary' },
        h('p', { className: 'block-summary__eyebrow', text: `${block.title} 完成` }),
        h('p', { className: 'block-summary__num', text: `${okCount} / ${total}` }),
        h('p', { className: 'block-summary__note', text: block.focus ?? '休息一下，继续下一段' }),
        h('button', {
          className: 'btn btn--primary btn--wide',
          text: '继续',
          attrs: { type: 'button' },
          on: { click: close },
        }),
      ),
    );
    overlayCloser = close;
    overlay.replaceChildren(sheet);
    return nextStart;
  }

  function finishSession(): void {
    const summary = controller.finish();
    if (plan.mode === 'level' && plan.levelId && summary.pass?.pass) {
      const level = findLevel(plan.levelId);
      const key = level?.dist[0];
      try {
        playCadence(key?.type ?? 'sh', key?.n ?? 0, 'maj');
      } catch {
        // 音频不可用时静默
      }
    }
    ctx.reset({ name: 'result', params: { summary, plan } });
  }

  /** 已作答（计入统计）的题数 */
  function answeredCount(): number {
    return controller.allRecords.filter((r) => !r.skipped).length;
  }

  /** 退出确认底板：已答题时先确认，未答题直接走 */
  function showExitConfirm(): void {
    if (confirmCloser !== null) return;
    const close = (): void => {
      confirmCloser = null;
      sheet.remove();
      overlay.replaceChildren();
    };
    const sheet = h(
      'div',
      { className: 'sheet-wrap' },
      h(
        'div',
        { className: 'sheet exit-confirm' },
        h('h2', { className: 'sheet__title', text: '结束本节？' }),
        h('p', { className: 'exit-confirm__note', text: `已答 ${answeredCount()} 题会计入统计` }),
        h('button', {
          className: 'btn btn--primary btn--wide',
          text: '继续练习',
          attrs: { type: 'button' },
          on: { click: close },
        }),
        h('button', {
          className: 'btn btn--ghost btn--wide',
          text: '结束',
          attrs: { type: 'button' },
          on: {
            click: () => {
              close();
              skipStartedSeq();
              ctx.back();
            },
          },
        }),
      ),
    );
    confirmCloser = close;
    overlay.replaceChildren(sheet);
  }

  function leave(): void {
    if (confirmCloser !== null) return;
    if (overlayCloser !== null) {
      const close = overlayCloser;
      overlayCloser = null;
      close();
      return;
    }
    if (answeredCount() > 0) {
      showExitConfirm();
      return;
    }
    skipStartedSeq();
    ctx.back();
  }

  /* ---------- 手势 / 键盘 ---------- */

  let touchY: number | null = null;
  const onTouchStart = (e: TouchEvent): void => {
    touchY = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: TouchEvent): void => {
    if (touchY === null) return;
    const dy = (e.changedTouches[0]?.clientY ?? touchY) - touchY;
    touchY = null;
    if (feedback !== null || seqFinishing) return;
    if (dy < -60) {
      // 上滑：跳过（视奏已开弹同样入错题队列）
      controller.skip();
      resetSeqState();
      combo = 0;
      comboNum.textContent = '0';
      toast('已跳过 · 进错题队列');
      next();
    } else if (dy > 60) {
      // 下滑：收藏
      toast(controller.favorite() ? '已收藏这题' : '已取消收藏');
    }
  };
  stage.addEventListener('touchstart', onTouchStart, { passive: true });
  stage.addEventListener('touchend', onTouchEnd, { passive: true });

  const onKey = (e: KeyboardEvent): void => {
    if (destroyed) return;
    if (feedback !== null) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const el = overlay.querySelector<HTMLElement>('.fb');
        el?.click();
      }
      return;
    }
    if (overlay.querySelector('.sheet-wrap') !== null) return;
    // 功能气泡展示中不作答（气泡蒙层挡住点击，键盘同样屏蔽）
    if (document.querySelector('.coach-mark') !== null) return;
    if (e.key >= '1' && e.key <= '9') {
      pad?.pickAt(Number(e.key) - 1);
    }
  };
  document.addEventListener('keydown', onKey);

  function toast(text: string): void {
    const el = h('div', { className: 'toast', text });
    root.append(el);
    later(() => el.remove(), 1400);
  }

  // 限时块倒计时
  const ticker = window.setInterval(() => {
    const cqBlock = lastBlock;
    if (cqBlock && Number.isFinite(cqBlock.durationMs)) {
      const left = Math.max(0, cqBlock.durationMs - (Date.now() - blockStartedAt(cqBlock)));
      timeLabel.textContent = `剩余 ${fmtCountdown(left)}`;
    }
  }, 1000);
  timers.push(ticker);

  // 启动
  root.classList.toggle('is-landscape', isLandscape());

  // 横竖屏切换：换 CSS 类 + 重建视奏键盘视窗（wide/std），音域重算
  const onOrientationChange = (): void => {
    root.classList.toggle('is-landscape', isLandscape());
    const q = seqQ;
    if (q?.seq !== undefined) mountSeqKeyboard(q);
  };
  orientationMq?.addEventListener?.('change', onOrientationChange);

  later(() => next(), 0);

  // 返回键拦截：退出确认 → 弹层（微课卡 / 块小结 / 反馈条）→ 已答题先确认、未答题放行页面返回
  ctx.setBackInterceptor(() => {
    if (confirmCloser !== null) {
      const close = confirmCloser;
      confirmCloser = null;
      close();
      return true;
    }
    if (overlayCloser !== null) {
      const close = overlayCloser;
      overlayCloser = null;
      close();
      return true;
    }
    if (answeredCount() > 0) {
      showExitConfirm();
      return true;
    }
    // 视奏已开弹（i>0）→ 入错题队列；i=0 直接返回
    skipStartedSeq();
    return false;
  });

  return {
    root,
    destroy(): void {
      destroyed = true;
      for (const t of timers) window.clearTimeout(t);
      window.clearInterval(ticker);
      pad?.destroy();
      chordIn?.destroy();
      seqKb?.destroy();
      seqKb = null;
      seqInst?.destroy();
      seqInst = null;
      orientationMq?.removeEventListener?.('change', onOrientationChange);
      document.removeEventListener('keydown', onKey);
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchend', onTouchEnd);
      ctx.setBackInterceptor(null);
      overlayCloser = null;
      confirmCloser = null;
    },
  };
}
