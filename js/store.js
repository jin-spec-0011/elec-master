// 학습 기록 저장소: 로컬 우선(localStorage), 서버와는 sync.js 가 병합한다. DOM 비의존(저장소 주입 가능).
import { review, retag, kstDateKey, isDateKey, emptyReasons, INTERVALS } from './srs.js';

const KEY = 'elec.v1.progress';
const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export function emptyProgress() {
  return { v: 1, owner: null, cards: {}, daily: {}, drill: {}, dirty: { cards: {}, daily: {}, drill: {} } };
}

/** 외부(서버·저장소)에서 읽은 카드 상태를 검증·정규화한다. 못 쓰는 값은 null. */
export function sanitizeCardState(s) {
  if (!s || typeof s !== 'object' || !Number.isInteger(s.stage)) return null;
  const stage = Math.min(Math.max(s.stage, 0), INTERVALS.length - 1);
  const graduated = s.graduated === true;
  const due = graduated ? null : isDateKey(s.due) ? s.due : null;
  if (!graduated && due === null) return null;
  const reasons = emptyReasons();
  for (const k of Object.keys(reasons)) reasons[k] = num(s.reasons?.[k]);
  return { stage, due, reps: num(s.reps), lapses: num(s.lapses), graduated, last: num(s.last), reasons };
}

export function sanitizeDaily(d) {
  if (!d || typeof d !== 'object') return null;
  return { reviewed: num(d.reviewed), newCards: num(d.newCards), correct: num(d.correct), drillCorrect: num(d.drillCorrect), drillTotal: num(d.drillTotal) };
}

const SUBJECT_KEY = /^(M|S[1-5])$/;

/** 계산 드릴 누적 통계(과목별): 정답 수·시도 수·틀린 이유 집계 */
export function sanitizeDrill(d) {
  if (!d || typeof d !== 'object') return null;
  const reasons = emptyReasons();
  for (const k of Object.keys(reasons)) reasons[k] = num(d.reasons?.[k]);
  const total = num(d.total);
  return { correct: Math.min(num(d.correct), total), total, reasons };
}

export function mergeDrill(a, b) {
  const reasons = emptyReasons();
  for (const k of Object.keys(reasons)) reasons[k] = Math.max(a.reasons[k], b.reasons[k]);
  return { correct: Math.max(a.correct, b.correct), total: Math.max(a.total, b.total), reasons };
}

const sameDrill = (a, b) => a.correct === b.correct && a.total === b.total && Object.keys(a.reasons).every((k) => a.reasons[k] === b.reasons[k]);

/** 같은 카드의 두 상태 중 더 최근(last)인 쪽. 같으면 b(서버). */
export function mergeCardStates(a, b) {
  return a.last > b.last ? a : b;
}

/** 일별 집계는 값이 줄어들지 않으므로 항목별 최댓값을 취한다. */
export function mergeDaily(a, b) {
  return {
    reviewed: Math.max(a.reviewed, b.reviewed),
    newCards: Math.max(a.newCards, b.newCards),
    correct: Math.max(a.correct, b.correct),
    drillCorrect: Math.max(a.drillCorrect, b.drillCorrect),
    drillTotal: Math.max(a.drillTotal, b.drillTotal),
  };
}

const sameDaily = (a, b) => a.reviewed === b.reviewed && a.newCards === b.newCards && a.correct === b.correct && a.drillCorrect === b.drillCorrect && a.drillTotal === b.drillTotal;

/**
 * 로컬 진행 상황과 서버 데이터를 병합한다.
 * - 로컬 owner가 null(게스트)이거나 같은 계정이면 병합, 다른 계정이면 로컬을 버리고 서버 값만 사용
 * - 서버보다 새롭거나 서버에 없는 항목은 dirty 로 표시해 다음에 올린다
 */
export function reconcile(local, uid, remote) {
  const remoteCards = {};
  const remoteDaily = {};
  const remoteDrill = {};
  for (const [id, s] of Object.entries(remote?.cards ?? {})) {
    const c = sanitizeCardState(s);
    if (c) remoteCards[id] = c;
  }
  for (const [d, v] of Object.entries(remote?.daily ?? {})) {
    const x = isDateKey(d) ? sanitizeDaily(v) : null;
    if (x) remoteDaily[d] = x;
  }
  for (const [k, v] of Object.entries(remote?.drill ?? {})) {
    const x = SUBJECT_KEY.test(k) ? sanitizeDrill(v) : null;
    if (x) remoteDrill[k] = x;
  }
  const base = local.owner === null || local.owner === uid ? local : emptyProgress();
  const out = { v: 1, owner: uid, cards: { ...remoteCards }, daily: { ...remoteDaily }, drill: { ...remoteDrill }, dirty: { cards: {}, daily: {}, drill: {} } };
  for (const [id, s] of Object.entries(base.cards)) {
    const r = remoteCards[id];
    if (!r) {
      out.cards[id] = s;
      out.dirty.cards[id] = true;
    } else {
      const m = mergeCardStates(s, r);
      out.cards[id] = m;
      if (m !== r) out.dirty.cards[id] = true;
    }
  }
  for (const [d, v] of Object.entries(base.daily)) {
    const r = remoteDaily[d];
    if (!r) {
      out.daily[d] = v;
      out.dirty.daily[d] = true;
    } else {
      const m = mergeDaily(v, r);
      out.daily[d] = m;
      if (!sameDaily(m, r)) out.dirty.daily[d] = true;
    }
  }
  for (const [k, v] of Object.entries(base.drill ?? {})) {
    const r = remoteDrill[k];
    if (!r) {
      out.drill[k] = v;
      out.dirty.drill[k] = true;
    } else {
      const m = mergeDrill(v, r);
      out.drill[k] = m;
      if (!sameDrill(m, r)) out.dirty.drill[k] = true;
    }
  }
  return out;
}

function normalize(raw) {
  if (!raw || raw.v !== 1) return emptyProgress();
  const p = emptyProgress();
  p.owner = typeof raw.owner === 'string' && raw.owner ? raw.owner : null;
  for (const [id, s] of Object.entries(raw.cards ?? {})) {
    const c = sanitizeCardState(s);
    if (c) p.cards[id] = c;
  }
  for (const [d, v] of Object.entries(raw.daily ?? {})) {
    const x = isDateKey(d) ? sanitizeDaily(v) : null;
    if (x) p.daily[d] = x;
  }
  for (const [k, v] of Object.entries(raw.drill ?? {})) {
    const x = SUBJECT_KEY.test(k) ? sanitizeDrill(v) : null;
    if (x) p.drill[k] = x;
  }
  for (const k of Object.keys(raw.dirty?.drill ?? {})) if (p.drill[k]) p.dirty.drill[k] = true;
  for (const id of Object.keys(raw.dirty?.cards ?? {})) if (p.cards[id]) p.dirty.cards[id] = true;
  for (const d of Object.keys(raw.dirty?.daily ?? {})) if (p.daily[d]) p.dirty.daily[d] = true;
  return p;
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

function defaultStorage() {
  try {
    const ls = globalThis.localStorage;
    if (ls) return ls;
  } catch {
    /* 저장소 차단(시크릿 모드 등) → 메모리 대체 */
  }
  return memoryStorage();
}

/**
 * @param {{ storage?: { getItem(k: string): string | null, setItem(k: string, v: string): void }, now?: () => number }} [opts]
 */
export function createStore({ storage = defaultStorage(), now = () => Date.now() } = {}) {
  let persistOk = true;
  const listeners = new Set();

  function load() {
    try {
      const raw = storage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : emptyProgress();
    } catch {
      return emptyProgress();
    }
  }
  let p = load();

  function save() {
    try {
      storage.setItem(KEY, JSON.stringify(p));
      persistOk = true;
    } catch {
      persistOk = false; // 용량 초과·차단: 메모리에는 남아 있으므로 계속 동작한다
    }
  }
  function notify(source = 'local') {
    listeners.forEach((fn) => {
      try {
        fn(p, { source });
      } catch (e) {
        console.error(e);
      }
    });
  }

  return {
    get owner() {
      return p.owner;
    },
    get persistOk() {
      return persistOk;
    },
    today: () => kstDateKey(new Date(now())),
    cardStates: () => p.cards,
    daily(dateKey) {
      return { reviewed: 0, newCards: 0, correct: 0, drillCorrect: 0, drillTotal: 0, ...(p.daily[dateKey] ?? {}) };
    },
    /** 과목별 계산 드릴 누적 통계 */
    drillStats: () => p.drill,
    /** 계산 드릴 한 문제의 결과를 기록한다(복습 간격 SRS와는 별개). */
    recordDrill(subject, correct) {
      if (!SUBJECT_KEY.test(subject)) throw new RangeError(`알 수 없는 과목: ${subject}`);
      const today = kstDateKey(new Date(now()));
      const cur = p.drill[subject] ?? { correct: 0, total: 0, reasons: emptyReasons() };
      p.drill[subject] = { correct: cur.correct + (correct ? 1 : 0), total: cur.total + 1, reasons: { ...cur.reasons } };
      const d = this.daily(today);
      p.daily[today] = { ...d, drillCorrect: d.drillCorrect + (correct ? 1 : 0), drillTotal: d.drillTotal + 1 };
      p.dirty.drill[subject] = true;
      p.dirty.daily[today] = true;
      save();
      notify();
    },
    /** 드릴 오답 이유를 나중에 고르거나 바꾼다. */
    tagDrillReason(subject, previous, reason) {
      const cur = p.drill[subject];
      if (!cur) return;
      const reasons = { ...cur.reasons };
      if (previous in reasons && reasons[previous] > 0) reasons[previous] -= 1;
      if (reason in reasons) reasons[reason] += 1;
      p.drill[subject] = { ...cur, reasons };
      p.dirty.drill[subject] = true;
      save();
      notify();
    },
    /** 복습 결과를 기록하고 새 상태를 돌려준다. */
    recordReview(cardId, correct, reason) {
      const t = now();
      const today = kstDateKey(new Date(t));
      const prev = p.cards[cardId];
      const next = review(prev, correct, today, t, reason);
      p.cards[cardId] = next;
      const d = this.daily(today);
      p.daily[today] = { ...d, reviewed: d.reviewed + 1, newCards: d.newCards + (prev ? 0 : 1), correct: d.correct + (correct ? 1 : 0) };
      p.dirty.cards[cardId] = true;
      p.dirty.daily[today] = true;
      save();
      notify();
      return next;
    },
    /** 오답 이유를 나중에 고르거나 바꾼다. */
    tagReason(cardId, previous, reason) {
      const cur = p.cards[cardId];
      if (!cur) return null;
      p.cards[cardId] = retag(cur, previous, reason);
      p.dirty.cards[cardId] = true;
      save();
      notify();
      return p.cards[cardId];
    },
    dirtySnapshot() {
      const cards = {};
      const daily = {};
      const drill = {};
      for (const id of Object.keys(p.dirty.cards)) if (p.cards[id]) cards[id] = p.cards[id];
      for (const d of Object.keys(p.dirty.daily)) if (p.daily[d]) daily[d] = p.daily[d];
      for (const k of Object.keys(p.dirty.drill)) if (p.drill[k]) drill[k] = p.drill[k];
      return { cards, daily, drill };
    },
    /** 올린 항목 중 그 사이에 바뀌지 않은 것만 dirty 해제 */
    markSynced(snapshot) {
      for (const [id, s] of Object.entries(snapshot.cards)) if (p.cards[id] && p.cards[id].last === s.last) delete p.dirty.cards[id];
      for (const [d, v] of Object.entries(snapshot.daily)) if (p.daily[d] && sameDaily(p.daily[d], v)) delete p.dirty.daily[d];
      for (const [k, v] of Object.entries(snapshot.drill ?? {})) if (p.drill[k] && sameDrill(p.drill[k], v)) delete p.dirty.drill[k];
      save();
    },
    attachUser(uid, remote) {
      p = reconcile(p, uid, remote);
      save();
      notify('sync');
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
