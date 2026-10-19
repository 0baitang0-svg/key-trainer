/**
 * 训练屏幕（核心）：一屏一题。
 * 顶部进度 / 题号 / 连击；中间谱面卡片；下半屏拇指区作答键盘。
 * 答对绿描边 + 主和弦琶音自动下一题；答错弹直读锚点卡（1.2s 自动继续）。
 * 上滑跳过（入错题队列）、下滑收藏；首遇调号先弹微课卡。
 */

import { h, icon } from '../dom';
import type { AppContext, ScreenInstance } from '../router';
import { answerPad, type AnswerPad } from '../components/answer-pad';
import { staffOptionsFor, staffView } from '../components/staff-view';
import { feedbackBanner, ruleCardSheet, type FeedbackBanner } from '../components/feedback-banner';
import { firstSeen, ruleCardId } from '../../content/rules-cards';
import { findPiece } from '../../content/repertoire';
import { markSeen } from '../../core/store';
import { findLevel } from '../../core/levels';
import { playCadence, playCorrect, playWrong } from '../../audio/sfx';
import { playMelody } from '../../audio/melody-synth';
import { haptic } from '../../platform/haptics';
import {
  SessionController,
  anchorAccent,
  displayOptions,
  type CurrentQuestion,
  type SessionBlock,
  type SessionPlan,
} from '../session-controller';

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

export function sessionScreen(ctx: AppContext, params: unknown): ScreenInstance {
  const plan = (params as { plan: SessionPlan }).plan;
  const controller = new SessionController(ctx, plan);

  const stage = h('div', { className: 'session__stage' });
  const padHost = h('div', { className: 'session__pad' });
  const overlay = h('div', { className: 'session__overlay' });

  const comboNum = h('span', { className: 'combo__num', text: '0' });
  const progressFill = h('div', { className: 'progress__fill' });
  const blockLabel = h('span', { className: 'session__block', text: plan.title });
  const numLabel = h('span', { className: 'session__nums', text: '' });
  const timeLabel = h('span', { className: 'session__time', text: '' });

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
        h('div', { className: 'session__meta-row' }, blockLabel, timeLabel),
        h('div', { className: 'progress' }, progressFill),
        numLabel,
      ),
      h('div', { className: 'combo' }, comboNum, h('span', { className: 'combo__label', text: '连击' })),
    ),
    stage,
    h('div', { className: 'session__hint', text: '上滑跳过 · 下滑收藏' }),
    padHost,
    overlay,
  );

  let pad: AnswerPad | null = null;
  let feedback: FeedbackBanner | null = null;
  let combo = 0;
  let blockRecordStart = 0;
  let lastBlock: SessionBlock | null = null;
  let destroyed = false;
  const timers: number[] = [];

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
      timeLabel.textContent = cq.isBoss ? 'BOSS 题' : '';
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
    if (q.train === 'note') return '这个音在该调里唱什么？';
    if (q.train === 'piece') return '听 / 看动机，它在什么调上？';
    return q.ask === 'maj' ? '大调主音是？' : '小调主音是？';
  }

  function renderStage(cq: CurrentQuestion): void {
    const q = cq.question;
    stage.replaceChildren();
    if (q.train === 'piece' && q.pieceId) {
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
    overlay.replaceChildren();
  }

  function showFeedback(ok: boolean, phrase: string, explain: string, cq: CurrentQuestion, autoMs: number, done: () => void): void {
    clearFeedback();
    feedback = feedbackBanner({
      ok,
      phrase,
      explain,
      staff: ok ? undefined : { ...staffOptionsFor(cq.question, anchorAccent(cq.question)) },
      autoMs,
      onContinue: () => {
        clearFeedback();
        done();
      },
    });
    overlay.append(feedback.root);
  }

  /* ---------- 流程 ---------- */

  function askCurrent(cq: CurrentQuestion): void {
    lastBlock = cq.block;
    renderHead(cq);
    renderStage(cq);
    pad?.destroy();
    const options = displayOptions(cq.question);
    pad = answerPad({
      options,
      layout: cq.question.train === 'note' ? 'row3' : 'grid6',
      onPick: (label) => submitAnswer(label, cq),
    });
    padHost.replaceChildren(pad.root);
    padHost.dataset.layout = cq.question.train === 'note' ? 'row3' : 'grid6';

    // 首遇微课卡
    const state = ctx.getState();
    const cid = ruleCardId(cq.question.type, cq.question.n, cq.question.ask);
    if (!state.seenKeys.includes(cid)) {
      const card = firstSeen(cq.question.type, cq.question.n, cq.question.ask);
      pad.setDisabled(true);
      const sheet = ruleCardSheet(card, (remember) => {
        if (remember) ctx.update((s) => markSeen(s, cid));
        sheet.destroy();
        overlay.replaceChildren();
        controller.markShown();
        pad?.setDisabled(false);
      });
      overlay.replaceChildren(sheet.root);
    } else {
      controller.markShown();
    }
  }

  function submitAnswer(label: string, cq: CurrentQuestion): void {
    if (pad === null || feedback !== null) return;
    pad.setDisabled(true);
    const res = controller.submit(label);
    if (res.ok) {
      combo++;
      comboNum.textContent = String(combo);
      pad.mark(label, 'correct');
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
      pad.mark(label, 'wrong');
      pad.mark(res.correctLabel, 'correct');
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
          on: {
            click: () => {
              sheet.remove();
              overlay.replaceChildren();
              done();
            },
          },
        }),
      ),
    );
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

  function leave(): void {
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
    if (feedback !== null) return;
    if (dy < -60) {
      // 上滑：跳过
      controller.skip();
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
  later(() => next(), 0);

  return {
    root,
    destroy(): void {
      destroyed = true;
      for (const t of timers) window.clearTimeout(t);
      window.clearInterval(ticker);
      document.removeEventListener('keydown', onKey);
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchend', onTouchEnd);
    },
  };
}
