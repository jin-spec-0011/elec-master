// 복습 간격(SRS) 순수 로직. DOM·저장소 비의존.
// 간격: 1 → 3 → 7 → 14 → 30일. 틀리면 1일 단계로 리셋, 30일 단계에서 정답이면 졸업.
// 날짜 키는 KST 기준 "yyyymmdd" 문자열.

export const INTERVALS = [1, 3, 7, 14, 30];
export const SESSION_SIZE = 10;
export const NEW_PER_DAY = 10;

/** 틀린 이유 4분류 */
export const WRONG_REASONS = [
  { id: 'concept', label: '개념 모름' },
  { id: 'formula', label: '공식 암기' },
  { id: 'calc', label: '계산 실수' },
  { id: 'misread', label: '문제 오독' },
];
const REASON_IDS = WRONG_REASONS.map((r) => r.id);

/** KST(UTC+9) 기준 날짜 키 */
export function kstDateKey(date = new Date()) {
  const t = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return t.toISOString().slice(0, 10).replace(/-/g, '');
}

function parseKey(key) {
  if (typeof key !== 'string' || !/^\d{8}$/.test(key)) throw new RangeError(`날짜 키 형식 오류: ${key}`);
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
}

export function isDateKey(key) {
  try {
    const t = parseKey(key);
    return new Date(t).toISOString().slice(0, 10).replace(/-/g, '') === key;
  } catch {
    return false;
  }
}

/** 날짜 키에 일수를 더한다. */
export function addDays(key, days) {
  const t = parseKey(key) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
}

export function emptyReasons() {
  return { concept: 0, formula: 0, calc: 0, misread: 0 };
}

export function newState() {
  return { stage: 0, due: null, reps: 0, lapses: 0, graduated: false, last: 0, reasons: emptyReasons() };
}

/**
 * 카드 하나의 복습 결과를 반영한 새 상태를 돌려준다(원본 불변).
 * - 정답: 새 카드는 1일 단계, 이후 한 단계씩 올라가며 30일 단계에서 정답이면 졸업
 * - 오답: 1일 단계로 리셋, 내일 다시
 * @param {object | null | undefined} state 이전 상태(없으면 새 카드)
 * @param {boolean} correct
 * @param {string} todayKey
 * @param {number} nowMs
 * @param {string} [reason] 틀린 이유 ID (오답일 때만 반영)
 */
export function review(state, correct, todayKey, nowMs, reason) {
  const prev = state ?? newState();
  const next = { ...prev, reasons: { ...emptyReasons(), ...prev.reasons }, reps: prev.reps + 1, last: nowMs };
  if (correct) {
    if (!state) {
      next.stage = 0;
      next.due = addDays(todayKey, INTERVALS[0]);
    } else if (prev.stage >= INTERVALS.length - 1) {
      next.graduated = true;
      next.due = null;
    } else {
      next.stage = prev.stage + 1;
      next.due = addDays(todayKey, INTERVALS[next.stage]);
    }
    next.graduated = next.graduated === true;
  } else {
    next.stage = 0;
    next.due = addDays(todayKey, INTERVALS[0]);
    next.graduated = false;
    if (state) next.lapses = prev.lapses + 1;
    if (REASON_IDS.includes(reason)) next.reasons[reason] += 1;
  }
  return next;
}

/** 오답 후 이유를 나중에 고르거나 바꿀 때 집계를 보정한다. */
export function retag(state, previous, reason) {
  const next = { ...state, reasons: { ...emptyReasons(), ...state.reasons } };
  if (REASON_IDS.includes(previous) && next.reasons[previous] > 0) next.reasons[previous] -= 1;
  if (REASON_IDS.includes(reason)) next.reasons[reason] += 1;
  return next;
}

export function isDue(state, todayKey) {
  return !!state && !state.graduated && typeof state.due === 'string' && state.due <= todayKey;
}

/**
 * 오늘의 복습 큐를 만든다: 복습 예정(기한 빠른 순) → 새 카드(데이터 순서, 하루 상한).
 * @param {{ cards: object[], states: Record<string, object>, today: string, newLimit?: number, newDoneToday?: number, size?: number, subject?: string }} opts
 */
export function buildQueue({ cards, states, today, newLimit = NEW_PER_DAY, newDoneToday = 0, size = SESSION_SIZE, subject }) {
  const pool = subject ? cards.filter((c) => c.subject === subject) : cards;
  const due = pool
    .filter((c) => isDue(states[c.id], today))
    .sort((a, b) => (states[a.id].due === states[b.id].due ? a.id.localeCompare(b.id) : states[a.id].due < states[b.id].due ? -1 : 1));
  const fresh = pool.filter((c) => !states[c.id]);
  const newSlots = Math.max(0, newLimit - newDoneToday);
  const newCards = fresh.slice(0, newSlots);
  return {
    queue: [...due, ...newCards].slice(0, Math.max(0, size)),
    dueCount: due.length,
    newAvailable: newCards.length,
    freshTotal: fresh.length,
  };
}

/** 과목·상태별 집계(연습 화면 표시용). */
export function summarize(cards, states, today) {
  const total = { cards: cards.length, due: 0, fresh: 0, learning: 0, graduated: 0 };
  const bySubject = {};
  for (const c of cards) {
    const s = states[c.id];
    const b = (bySubject[c.subject] ??= { cards: 0, due: 0, fresh: 0, learning: 0, graduated: 0 });
    b.cards += 1;
    if (!s) b.fresh += 1;
    else if (s.graduated) b.graduated += 1;
    else {
      b.learning += 1;
      if (isDue(s, today)) b.due += 1;
    }
  }
  for (const b of Object.values(bySubject)) {
    total.due += b.due;
    total.fresh += b.fresh;
    total.learning += b.learning;
    total.graduated += b.graduated;
  }
  return { total, bySubject };
}
