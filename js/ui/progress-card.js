// 레벨·XP·연속 학습일 요약 카드(맵·프로필 공용).
import { h } from '../dom.js';
import { levelInfo, totalXp, computeStreak } from '../engine.js';

export function progressSummary(store) {
  const xp = totalXp(store.questStates(), store.xplog());
  const lv = levelInfo(xp);
  const streak = computeStreak(store.dailyAll(), store.today());
  return { xp, lv, streak };
}

export function summaryCard(store) {
  const { lv, streak } = progressSummary(store);
  const pct = lv.span ? Math.round((lv.into / lv.span) * 100) : 0;
  return h('div', { class: 'card is-accent' },
    h('div', { class: 'row' },
      h('p', { class: 'card-title' }, `Lv.${lv.level}`),
      h('span', { class: 'badge is-accent' }, streak.current > 0 ? `연속 ${streak.current}일${streak.activeToday ? '' : ' (오늘 이어가세요)'}` : '오늘 시작하세요')),
    h('div', { class: 'bar', role: 'img', 'aria-label': `다음 레벨까지 ${lv.into}/${lv.span} XP` }, h('span', { style: `width:${pct}%` })),
    h('p', { class: 'card-sub', style: 'margin-top:6px' }, `${lv.xp} XP · 다음 레벨 ${lv.next} XP`));
}
