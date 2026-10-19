/**
 * 闯关地图：4 章纵向关卡列表，卡片显示曲目名 + 一句 blurb、星级、通关标记。
 */

import { h, icon } from '../dom';
import type { AppContext, ScreenInstance } from '../router';
import { CHAPTERS, chapterLevels, type Level } from '../../core/levels';
import { findPiece } from '../../content/repertoire';
import { planFromLevel } from '../session-controller';

function stars(earned: number): HTMLElement {
  return h(
    'div',
    { className: 'stars' },
    ...[0, 1, 2].map((i) => (i < earned ? icon('star-fill', 15) : icon('star', 15))),
  );
}

function levelCard(level: Level, starCount: number, passed: boolean, onPlay: () => void): HTMLElement {
  const piece = level.pieceId ? findPiece(level.pieceId) : undefined;
  const title = piece ? piece.title : level.title;
  const blurb = piece ? piece.blurb : level.theme;
  return h(
    'button',
    {
      className: `level-card${passed ? ' is-passed' : ''}`,
      attrs: { type: 'button' },
      on: { click: onPlay },
    },
    h(
      'div',
      { className: 'level-card__head' },
      h('span', { className: 'level-card__title', text: title }),
      passed ? h('span', { className: 'level-card__passed', text: '已通关' }) : null,
    ),
    h('p', { className: 'level-card__blurb', text: blurb }),
    h(
      'div',
      { className: 'level-card__foot' },
      stars(starCount),
      h('span', { className: 'level-card__count', text: `${level.questionCount} 题${level.bossQuestion ? ' · 含 Boss' : ''}` }),
    ),
  );
}

export function levelMapScreen(ctx: AppContext): ScreenInstance {
  const state = ctx.getState();
  const passed = new Set(state.levelProgress.passed);
  const body = h('div', { className: 'screen__body' });

  for (const chapter of CHAPTERS) {
    const levels = chapterLevels(chapter.id);
    const cleared = levels.filter((l) => passed.has(l.id)).length;
    body.append(
      h(
        'section',
        { className: 'chapter' },
        h(
          'header',
          { className: 'chapter__head' },
          h('h2', { className: 'chapter__title', text: chapter.title }),
          h('span', { className: 'chapter__range', text: `${chapter.range} · ${cleared}/${levels.length}` }),
        ),
        h(
          'div',
          { className: 'chapter__list' },
          ...levels.map((l) =>
            levelCard(l, state.levelProgress.stars[l.id] ?? 0, passed.has(l.id), () =>
              ctx.navigate({ name: 'session', params: { plan: planFromLevel(l) } }),
            ),
          ),
        ),
      ),
    );
  }

  const root = h(
    'section',
    { className: 'screen screen--level-map' },
    h(
      'header',
      { className: 'topbar' },
      h('button', {
        className: 'icon-btn',
        attrs: { type: 'button', 'aria-label': '返回' },
        html: icon('back', 22).outerHTML,
        on: { click: () => ctx.back() },
      }),
      h('h1', { className: 'app-title' }, '闯关', h('span', { className: 'app-title__sub', text: '27 关 · 4 章' })),
    ),
    body,
  );
  return { root };
}
