// 학습 기록 저장소: 로컬 우선(localStorage), 서버와는 sync.js 가 병합한다. DOM 비의존(저장소 주입 가능).
// 데이터: cards(복습 상태) / daily(일별 집계) / drill(과목별 계산 드릴) / quests(퀘스트 상태) / xplog(일일 퀘스트 XP 지급 장부) / boss(보스 기록)
import { review, retag, kstDateKey, isDateKey, emptyReasons, INTERVALS } from './srs.js';

const KEY = 'elec.v1.progress';
const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const SUBJECT_KEY = /^(M|S[1-5])$/;
const QUEST_KEY = /^(Q\d+-\d{2}|D-\d{2})$/;
const BOSS_KEY = /^ch\d+$/;
const XPLOG_KEY = /^(\d{8})\/(D-\d{2})$/;
const GROUPS = ['cards', 'daily', 'drill', 'quests', 'xplog', 'boss'];

export function emptyProgress() {
  return { v: 1, owner: null, cards: {}, daily: {}, drill: {}, quests: {}, xplog: {}, boss: {}, dirty: { cards: {}, daily: {}, drill: {}, quests: {}, xplog: {}, boss: {} } };
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
  // correct(정답 누적)가 없는 이전 기록은 졸업·상위 단계면 1회 이상 맞힌 것으로 본다.
  const correct = s.correct === undefined ? (graduated || stage > 0 ? 1 : 0) : num(s.correct);
  return { stage, due, reps: num(s.reps), lapses: num(s.lapses), correct, graduated, last: num(s.last), reasons };
}

export function sanitizeDaily(d) {
  if (!d || typeof d !== 'object') return null;
  return { reviewed: num(d.reviewed), newCards: num(d.newCards), correct: num(d.correct), drillCorrect: num(d.drillCorrect), drillTotal: num(d.drillTotal), bossAttempts: num(d.bossAttempts) };
}

/** 계산 드릴 누적 통계(과목별): 정답 수·시도 수·틀린 이유 집계 */
export function sanitizeDrill(d) {
  if (!d || typeof d !== 'object') return null;
  const reasons = emptyReasons();
  for (const k of Object.keys(reasons)) reasons[k] = num(d.reasons?.[k]);
  const total = num(d.total);
  return { correct: Math.min(num(d.correct), total), total, reasons };
}

const QUEST_RANK = { active: 0, skipped: 1, done: 2 };
export function sanitizeQuestState(q) {
  if (!q || typeof q !== 'object') return null;
  const status = q.status === 'done' || q.status === 'skipped' ? q.status : 'active';
  return { status, fails: num(q.fails), xp: status === 'done' ? num(q.xp) : 0, at: num(q.at), day: isDateKey(q.day) ? q.day : null };
}

export function sanitizeBoss(b) {
  if (!b || typeof b !== 'object') return null;
  const attempts = num(b.attempts);
  return { best: num(b.best), attempts, clears: Math.min(num(b.clears), attempts), last: num(b.last) };
}

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
    bossAttempts: Math.max(a.bossAttempts, b.bossAttempts),
  };
}
export function mergeDrill(a, b) {
  const reasons = emptyReasons();
  for (const k of Object.keys(reasons)) reasons[k] = Math.max(a.reasons[k], b.reasons[k]);
  return { correct: Math.max(a.correct, b.correct), total: Math.max(a.total, b.total), reasons };
}
/** 완료(done) > 건너뜀(skipped) > 진행 중. 같은 단계면 늦게 기록한 쪽, 실패 횟수는 최댓값. */
export function mergeQuestStates(a, b) {
  const winner = QUEST_RANK[a.status] > QUEST_RANK[b.status] ? a : QUEST_RANK[a.status] < QUEST_RANK[b.status] ? b : a.at > b.at ? a : b;
  return { ...winner, fails: Math.max(a.fails, b.fails) };
}
export function mergeBoss(a, b) {
  return { best: Math.max(a.best, b.best), attempts: Math.max(a.attempts, b.attempts), clears: Math.max(a.clears, b.clears), last: Math.max(a.last, b.last) };
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameDaily = sameJson;
const sameDrill = sameJson;

/** 서버의 xplog({날짜:{퀘스트ID:xp}})를 로컬 형식({"날짜/퀘스트ID": xp})으로 편다. */
function flattenXplog(remote) {
  const out = {};
  for (const [day, byQuest] of Object.entries(remote ?? {})) {
    if (!isDateKey(day) || !byQuest || typeof byQuest !== 'object') continue;
    for (const [id, xp] of Object.entries(byQuest)) if (QUEST_KEY.test(id) && /^D-/.test(id) && Number.isFinite(xp) && xp >= 0) out[`${day}/${id}`] = Math.floor(xp);
  }
  return out;
}

function sanitizeMap(raw, keyOk, sanitize) {
  const out = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (!keyOk(k)) continue;
    const x = sanitize(v);
    if (x) out[k] = x;
  }
  return out;
}

function mergeRecords(base, remote, merge, same) {
  const out = { ...remote };
  const dirty = {};
  for (const [k, v] of Object.entries(base)) {
    const r = remote[k];
    if (r === undefined) {
      out[k] = v;
      dirty[k] = true;
    } else {
      const m = merge(v, r);
      out[k] = m;
      if (!same(m, r)) dirty[k] = true;
    }
  }
  return { out, dirty };
}

/**
 * 로컬 진행 상황과 서버 데이터를 병합한다.
 * - 로컬 owner가 null(게스트)이거나 같은 계정이면 병합, 다른 계정이면 로컬을 버리고 서버 값만 사용
 * - 서버보다 새롭거나 서버에 없는 항목은 dirty 로 표시해 다음에 올린다
 */
export function reconcile(local, uid, remote) {
  const base = local.owner === null || local.owner === uid ? local : emptyProgress();
  const r = {
    cards: sanitizeMap(remote?.cards, () => true, sanitizeCardState),
    daily: sanitizeMap(remote?.daily, isDateKey, sanitizeDaily),
    drill: sanitizeMap(remote?.drill, (k) => SUBJECT_KEY.test(k), sanitizeDrill),
    quests: sanitizeMap(remote?.quests, (k) => QUEST_KEY.test(k), sanitizeQuestState),
    boss: sanitizeMap(remote?.boss, (k) => BOSS_KEY.test(k), sanitizeBoss),
    xplog: flattenXplog(remote?.xplog),
  };
  const out = { v: 1, owner: uid, dirty: {} };
  const specs = {
    cards: [mergeCardStates, (m, x) => m === x],
    daily: [mergeDaily, sameDaily],
    drill: [mergeDrill, sameDrill],
    quests: [mergeQuestStates, sameJson],
    boss: [mergeBoss, sameJson],
    xplog: [(a, b) => Math.max(a, b), (m, x) => m === x],
  };
  for (const g of GROUPS) {
    const [merge, same] = specs[g];
    const res = mergeRecords(base[g] ?? {}, r[g], merge, same);
    out[g] = res.out;
    out.dirty[g] = res.dirty;
  }
  return out;
}

function normalize(raw) {
  if (!raw || raw.v !== 1) return emptyProgress();
  const p = emptyProgress();
  p.owner = typeof raw.owner === 'string' && raw.owner ? raw.owner : null;
  p.cards = sanitizeMap(raw.cards, () => true, sanitizeCardState);
  p.daily = sanitizeMap(raw.daily, isDateKey, sanitizeDaily);
  p.drill = sanitizeMap(raw.drill, (k) => SUBJECT_KEY.test(k), sanitizeDrill);
  p.quests = sanitizeMap(raw.quests, (k) => QUEST_KEY.test(k), sanitizeQuestState);
  p.boss = sanitizeMap(raw.boss, (k) => BOSS_KEY.test(k), sanitizeBoss);
  for (const [k, v] of Object.entries(raw.xplog ?? {})) {
    const m = XPLOG_KEY.exec(k);
    if (m && isDateKey(m[1]) && Number.isFinite(v) && v >= 0) p.xplog[k] = Math.floor(v);
  }
  for (const g of GROUPS) for (const k of Object.keys(raw.dirty?.[g] ?? {})) if (p[g][k] !== undefined) p.dirty[g][k] = true;
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

const zeroDaily = () => ({ reviewed: 0, newCards: 0, correct: 0, drillCorrect: 0, drillTotal: 0, bossAttempts: 0 });

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
  function notify(source = 'local', detail = null) {
    listeners.forEach((fn) => {
      try {
        fn(p, { source, detail });
      } catch (e) {
        console.error(e);
      }
    });
  }
  const today = () => kstDateKey(new Date(now()));
  const mark = (group, key) => {
    p.dirty[group][key] = true;
  };

  return {
    get owner() {
      return p.owner;
    },
    get persistOk() {
      return persistOk;
    },
    today,
    cardStates: () => p.cards,
    daily(dateKey) {
      return { ...zeroDaily(), ...(p.daily[dateKey] ?? {}) };
    },
    /** 일별 집계 전체(연속 학습일 계산용, 읽기 전용) */
    dailyAll: () => p.daily,
    drillStats: () => p.drill,
    questStates: () => p.quests,
    xplog: () => p.xplog,
    bossStats: () => p.boss,

    /** 복습 결과를 기록하고 새 상태를 돌려준다. */
    recordReview(cardId, correct, reason) {
      const t = now();
      const day = kstDateKey(new Date(t));
      const prev = p.cards[cardId];
      const next = review(prev, correct, day, t, reason);
      p.cards[cardId] = next;
      const d = this.daily(day);
      p.daily[day] = { ...d, reviewed: d.reviewed + 1, newCards: d.newCards + (prev ? 0 : 1), correct: d.correct + (correct ? 1 : 0) };
      mark('cards', cardId);
      mark('daily', day);
      save();
      notify('local', { type: 'review', cardId, correct });
      return next;
    },
    /** 오답 이유를 나중에 고르거나 바꾼다. */
    tagReason(cardId, previous, reason) {
      const cur = p.cards[cardId];
      if (!cur) return null;
      p.cards[cardId] = retag(cur, previous, reason);
      mark('cards', cardId);
      save();
      notify('local', { type: 'tag' });
      return p.cards[cardId];
    },
    /** 계산 드릴 한 문제의 결과를 기록한다(복습 간격 SRS와는 별개). */
    recordDrill(subject, correct) {
      if (!SUBJECT_KEY.test(subject)) throw new RangeError(`알 수 없는 과목: ${subject}`);
      const day = today();
      const cur = p.drill[subject] ?? { correct: 0, total: 0, reasons: emptyReasons() };
      p.drill[subject] = { correct: cur.correct + (correct ? 1 : 0), total: cur.total + 1, reasons: { ...cur.reasons } };
      const d = this.daily(day);
      p.daily[day] = { ...d, drillCorrect: d.drillCorrect + (correct ? 1 : 0), drillTotal: d.drillTotal + 1 };
      mark('drill', subject);
      mark('daily', day);
      save();
      notify('local', { type: 'drill', subject, correct });
    },
    /** 드릴 오답 이유를 나중에 고르거나 바꾼다. */
    tagDrillReason(subject, previous, reason) {
      const cur = p.drill[subject];
      if (!cur) return;
      const reasons = { ...cur.reasons };
      if (previous in reasons && reasons[previous] > 0) reasons[previous] -= 1;
      if (reason in reasons) reasons[reason] += 1;
      p.drill[subject] = { ...cur, reasons };
      mark('drill', subject);
      save();
      notify('local', { type: 'tag' });
    },
    /** 보스전 한 번의 결과를 기록한다. best는 한 번의 도전에서 맞힌 최대 문제 수. */
    recordBoss(key, correctCount, cleared) {
      if (!BOSS_KEY.test(key)) throw new RangeError(`알 수 없는 보스: ${key}`);
      const cur = p.boss[key] ?? { best: 0, attempts: 0, clears: 0, last: 0 };
      p.boss[key] = { best: Math.max(cur.best, num(correctCount)), attempts: cur.attempts + 1, clears: cur.clears + (cleared ? 1 : 0), last: now() };
      const day = today();
      p.daily[day] = { ...this.daily(day), bossAttempts: this.daily(day).bossAttempts + 1 };
      mark('boss', key);
      mark('daily', day);
      save();
      notify('local', { type: 'boss', key, correct: correctCount, cleared });
    },

    /** 퀘스트 실패 횟수 +1(이미 완료·건너뜀이면 무시). */
    bumpQuestFail(id) {
      if (!QUEST_KEY.test(id)) return false;
      const cur = p.quests[id] ?? { status: 'active', fails: 0, xp: 0, at: 0, day: null };
      if (cur.status !== 'active') return false;
      p.quests[id] = { ...cur, fails: cur.fails + 1, at: now() };
      mark('quests', id);
      save();
      notify('local', { type: 'quest-fail', id });
      return true;
    },
    /** 퀘스트 완료. 이미 완료·건너뜀이면 false(XP 중복 지급 방지). */
    completeQuest(id, xp) {
      if (!QUEST_KEY.test(id)) return false;
      const cur = p.quests[id] ?? { status: 'active', fails: 0, xp: 0, at: 0, day: null };
      if (cur.status !== 'active') return false;
      p.quests[id] = { status: 'done', fails: cur.fails, xp: num(xp), at: now(), day: today() };
      mark('quests', id);
      save();
      notify('local', { type: 'quest-done', id });
      return true;
    },
    /** 메인 퀘스트 건너뛰기(XP 없음). */
    skipQuest(id) {
      if (!QUEST_KEY.test(id)) return false;
      const cur = p.quests[id] ?? { status: 'active', fails: 0, xp: 0, at: 0, day: null };
      if (cur.status !== 'active') return false;
      p.quests[id] = { status: 'skipped', fails: cur.fails, xp: 0, at: now(), day: today() };
      mark('quests', id);
      save();
      notify('local', { type: 'quest-skip', id });
      return true;
    },
    /** 일일 퀘스트 XP 지급: 같은 날 같은 퀘스트는 한 번만. 이미 지급했으면 false. */
    awardDaily(day, id, xp) {
      const k = `${day}/${id}`;
      if (!XPLOG_KEY.test(k) || p.xplog[k] !== undefined) return false;
      p.xplog[k] = num(xp);
      mark('xplog', k);
      save();
      notify('local', { type: 'daily-award', id });
      return true;
    },

    dirtySnapshot() {
      const snap = {};
      for (const g of GROUPS) {
        snap[g] = {};
        for (const k of Object.keys(p.dirty[g])) if (p[g][k] !== undefined) snap[g][k] = p[g][k];
      }
      return snap;
    },
    /** 올린 항목 중 그 사이에 바뀌지 않은 것만 dirty 해제 */
    markSynced(snapshot) {
      for (const g of GROUPS) {
        for (const [k, v] of Object.entries(snapshot[g] ?? {})) {
          if (p[g][k] !== undefined && sameJson(p[g][k], v)) delete p.dirty[g][k];
        }
      }
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
