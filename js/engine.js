// 퀘스트 판정·XP·레벨·연속 학습일 순수 로직. DOM·저장소 비의존.
import { isDue, addDays } from './srs.js';

/** 레벨 n이 시작되는 누적 XP: 50·(n−1)·n → L2 100, L3 300, L4 600, L5 1000 … */
export const xpForLevel = (n) => 50 * (n - 1) * n;

export function levelInfo(xp) {
  const total = Math.max(0, Math.floor(xp));
  let level = 1;
  while (xpForLevel(level + 1) <= total) level += 1;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp: total, floor, next, into: total - floor, span: next - floor };
}

/** 누적 XP = 완료한 메인·보스 퀘스트의 XP + 일일 퀘스트 지급 장부의 합. 건너뛴 퀘스트는 0. */
export function totalXp(questStates, xplog) {
  let sum = 0;
  for (const q of Object.values(questStates ?? {})) if (q.status === 'done') sum += q.xp;
  for (const v of Object.values(xplog ?? {})) sum += v;
  return sum;
}

/** 완료한 퀘스트의 보상 중 "칭호:이름" 형식을 획득 순으로 모은다. */
export function earnedTitles(quests, questStates) {
  return quests
    .filter((q) => questStates[q.id]?.status === 'done' && typeof q.reward === 'string' && q.reward.startsWith('칭호:'))
    .map((q) => ({ id: q.id, title: q.reward.slice(3).trim(), at: questStates[q.id].at }))
    .sort((a, b) => a.at - b.at);
}

const isActiveDay = (d) => !!d && (d.reviewed > 0 || d.drillTotal > 0 || d.bossAttempts > 0);

/**
 * 연속 학습일. 오늘 학습했으면 오늘부터, 아직이면 어제까지의 연속(오늘 안에 이으면 유지)을 센다.
 * @param {Record<string, object>} dailyAll 날짜 키 → 일별 집계
 * @param {string} today
 */
export function computeStreak(dailyAll, today) {
  const days = Object.keys(dailyAll ?? {}).filter((k) => isActiveDay(dailyAll[k])).sort();
  const set = new Set(days);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const activeToday = set.has(today);
  let cursor = activeToday ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, best, activeToday };
}

/** 판정 지표 문자열 해석. 알 수 없으면 null. */
export function parseMetric(metric) {
  if (typeof metric !== 'string') return null;
  if (metric === 'cards_seen') return { kind: 'cards_seen' };
  let m = metric.match(/^cards_correct:([^.]+)\.\.(.+)$/);
  if (m) return { kind: 'cards_correct', from: m[1], to: m[2] };
  m = metric.match(/^drill_correct:(M|S[1-5])$/);
  if (m) return { kind: 'drill_correct', subject: m[1] };
  m = metric.match(/^boss_(ch\d+)_correct$/);
  if (m) return { kind: 'boss', key: m[1] };
  if (['daily_cards_reviewed', 'daily_drill_correct', 'daily_due_cleared'].includes(metric)) return { kind: metric };
  return null;
}

/**
 * 지표의 현재 값.
 * @param {string} metric
 * @param {{ cardIds: string[], states: Record<string, object>, drill: Record<string, object>, boss: Record<string, object>, daily: object, dueNow: number }} ctx
 */
export function metricValue(metric, ctx) {
  const m = parseMetric(metric);
  if (!m) return 0;
  switch (m.kind) {
    case 'cards_seen':
      return Object.values(ctx.states).filter((s) => s.reps > 0).length;
    case 'cards_correct': {
      const a = ctx.cardIds.indexOf(m.from);
      const b = ctx.cardIds.indexOf(m.to);
      if (a < 0 || b < 0 || a > b) return 0;
      return ctx.cardIds.slice(a, b + 1).filter((id) => (ctx.states[id]?.correct ?? 0) > 0).length;
    }
    case 'drill_correct':
      return ctx.drill[m.subject]?.correct ?? 0;
    case 'boss':
      return ctx.boss[m.key]?.best ?? 0;
    case 'daily_cards_reviewed':
      return ctx.daily.reviewed;
    case 'daily_drill_correct':
      return ctx.daily.drillCorrect;
    case 'daily_due_cleared':
      // 복습 예정 카드가 하나도 안 남았고, 오늘 이미 본 카드(새 카드 제외)를 한 장 이상 복습했을 때만 달성
      return ctx.dueNow === 0 && ctx.daily.reviewed - (ctx.daily.newCards ?? 0) >= 1 ? 1 : 0;
    default:
      return 0;
  }
}

/** 이 지표가 해당 카드의 오답으로 "실패 횟수"가 늘어나는 퀘스트인지. */
export function metricCoversCard(metric, cardId, cardIds) {
  const m = parseMetric(metric);
  if (!m || m.kind !== 'cards_correct') return false;
  const a = cardIds.indexOf(m.from);
  const b = cardIds.indexOf(m.to);
  const i = cardIds.indexOf(cardId);
  return a >= 0 && b >= a && i >= a && i <= b;
}

const isDoneLike = (s) => s?.status === 'done' || s?.status === 'skipped';

/**
 * 퀘스트별 화면용 상태.
 * status: done | skipped | available | locked (일일 퀘스트는 오늘 완료면 done)
 * @returns {{ quest: object, status: string, value: number, target: number, ratio: number, fails: number, canSkip: boolean }[]}
 */
export function buildQuestModel({ quests, questStates, xplog, ctx, today }) {
  const open = new Set(quests.filter((q) => q.type !== 'daily' && isDoneLike(questStates[q.id])).map((q) => q.id));
  return quests.map((q) => {
    const s = questStates[q.id];
    const value = metricValue(q.metric, ctx);
    let status;
    if (q.type === 'daily') status = xplog[`${today}/${q.id}`] !== undefined ? 'done' : 'available';
    else if (s?.status === 'done') status = 'done';
    else if (s?.status === 'skipped') status = 'skipped';
    else status = q.prereq.every((p) => open.has(p)) ? 'available' : 'locked';
    const fails = s?.fails ?? 0;
    return {
      quest: q,
      status,
      value,
      target: q.target,
      ratio: q.target > 0 ? Math.min(1, value / q.target) : 0,
      fails,
      canSkip: q.type === 'main' && status === 'available' && fails >= SKIP_AFTER_FAILS,
    };
  });
}

export const SKIP_AFTER_FAILS = 3;

/**
 * 새로 달성한 퀘스트를 찾는다(선행이 연쇄로 풀리는 경우까지 반복).
 * 메인·보스: 선행이 완료/건너뜀이고 값이 목표 이상이면 완료. 일일: 오늘 아직 지급 전이고 목표 이상이면 지급.
 * @returns {{ completed: { id: string, xp: number, quest: object }[], dailies: { id: string, xp: number, quest: object }[] }}
 */
export function evaluate({ quests, questStates, xplog, ctx, today }) {
  const open = new Set(quests.filter((q) => q.type !== 'daily' && isDoneLike(questStates[q.id])).map((q) => q.id));
  const completed = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const q of quests) {
      if (q.type === 'daily' || open.has(q.id)) continue;
      if (!q.prereq.every((p) => open.has(p))) continue;
      if (metricValue(q.metric, ctx) >= q.target) {
        completed.push({ id: q.id, xp: q.xp, quest: q });
        open.add(q.id);
        changed = true;
      }
    }
  }
  const dailies = quests
    .filter((q) => q.type === 'daily' && xplog[`${today}/${q.id}`] === undefined && metricValue(q.metric, ctx) >= q.target)
    .map((q) => ({ id: q.id, xp: q.xp, quest: q }));
  return { completed, dailies };
}

/** 지금 복습 예정(기한 도래·미졸업) 카드 수. */
export function countDue(cards, states, today) {
  return cards.filter((c) => isDue(states[c.id], today)).length;
}
