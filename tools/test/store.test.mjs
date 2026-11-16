import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, reconcile, emptyProgress, sanitizeCardState, mergeDaily } from '../../js/store.js';
import { createSync, classifySyncError } from '../../js/sync.js';
import { review, addDays } from '../../js/srs.js';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), _m: m };
};
const T0 = Date.UTC(2026, 10, 16, 3, 0, 0);
const DAY = '20261116';

test('저장소: 복습 기록·일별 집계·영속화', () => {
  const storage = memory();
  const store = createStore({ storage, now: () => T0 });
  store.recordReview('M01', true);
  store.recordReview('M02', false, 'concept');
  store.recordReview('M01', true); // 두 번째 복습은 새 카드가 아님
  const d = store.daily(DAY);
  assert.deepEqual(d, { reviewed: 3, newCards: 2, correct: 2, drillCorrect: 0, drillTotal: 0 });
  assert.equal(store.cardStates().M02.reasons.concept, 1);
  const again = createStore({ storage, now: () => T0 });
  assert.equal(again.cardStates().M01.reps, 2);
  assert.deepEqual(again.dirtySnapshot().cards.M02.reasons.concept, 1);
  assert.equal(again.today(), DAY);
});

test('저장소: 깨진 JSON·저장 실패에도 동작', () => {
  const bad = memory();
  bad.setItem('elec.v1.progress', '{not json');
  assert.deepEqual(createStore({ storage: bad }).cardStates(), {});
  const full = { getItem: () => null, setItem() { throw new Error('quota'); } };
  const store = createStore({ storage: full, now: () => T0 });
  store.recordReview('M01', true);
  assert.equal(store.persistOk, false);
  assert.equal(store.cardStates().M01.reps, 1);
});

test('이유 태깅은 dirty 처리되고 집계가 보정된다', () => {
  const store = createStore({ storage: memory(), now: () => T0 });
  store.recordReview('M01', false);
  store.tagReason('M01', null, 'formula');
  store.tagReason('M01', 'formula', 'calc');
  assert.equal(store.cardStates().M01.reasons.formula, 0);
  assert.equal(store.cardStates().M01.reasons.calc, 1);
  assert.equal(store.tagReason('NOPE', null, 'calc'), null);
});

test('서버 데이터 검증: 잘못된 값은 버리고 범위는 보정', () => {
  assert.equal(sanitizeCardState(null), null);
  assert.equal(sanitizeCardState({ stage: 'x' }), null);
  assert.equal(sanitizeCardState({ stage: 1, due: 'bad' }), null);
  const s = sanitizeCardState({ stage: 99, due: DAY, reps: -5, lapses: 2.7, last: 5, reasons: { concept: 3, bogus: 9 } });
  assert.equal(s.stage, 4);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 2);
  assert.deepEqual(s.reasons, { concept: 3, formula: 0, calc: 0, misread: 0 });
  assert.equal(sanitizeCardState({ stage: 4, graduated: true }).due, null);
  assert.deepEqual(
    mergeDaily({ reviewed: 3, newCards: 1, correct: 2, drillCorrect: 4, drillTotal: 5 }, { reviewed: 2, newCards: 2, correct: 2, drillCorrect: 1, drillTotal: 9 }),
    { reviewed: 3, newCards: 2, correct: 2, drillCorrect: 4, drillTotal: 9 },
  );
});

test('병합: 최신 우선, 서버에 없는 로컬은 올리기, 다른 계정이면 로컬 폐기', () => {
  const local = emptyProgress();
  local.cards.M01 = review(null, true, DAY, 2000); // 로컬이 최신
  local.cards.M02 = review(null, true, DAY, 1000); // 서버가 최신
  local.cards.M03 = review(null, true, DAY, 1000); // 서버에 없음
  local.daily[DAY] = { reviewed: 5, newCards: 3, correct: 4, drillCorrect: 0, drillTotal: 0 };
  const remote = {
    cards: { M01: review(null, false, DAY, 1000), M02: review(null, true, DAY, 3000), BAD: { stage: 'x' } },
    daily: { [DAY]: { reviewed: 2, newCards: 5, correct: 1 }, '2026-xx': { reviewed: 1 } },
  };
  const out = reconcile(local, 'u1', remote);
  assert.equal(out.owner, 'u1');
  assert.equal(out.cards.M01.last, 2000);
  assert.equal(out.cards.M02.last, 3000);
  assert.ok(out.cards.M03);
  assert.equal(out.cards.BAD, undefined);
  assert.deepEqual(out.dirty.cards, { M01: true, M03: true });
  assert.deepEqual(out.daily[DAY], { reviewed: 5, newCards: 5, correct: 4, drillCorrect: 0, drillTotal: 0 });
  assert.deepEqual(out.dirty.daily, { [DAY]: true });
  assert.equal(out.daily['2026-xx'], undefined);

  const other = { ...local, owner: 'someone-else' };
  const swapped = reconcile(other, 'u1', { cards: { M09: review(null, true, DAY, 1) } });
  assert.deepEqual(Object.keys(swapped.cards), ['M09']);
  assert.deepEqual(swapped.dirty.cards, {});
});

function fakeDb(initial = {}) {
  const tree = JSON.parse(JSON.stringify(initial));
  const log = [];
  return {
    tree, log,
    mod: {
      getDatabase: (_app, url) => ({ url }),
      ref: (_db, path) => ({ path }),
      get: async (r) => { log.push(['get', r.path]); return { val: () => tree[r.path] ?? null }; },
      update: async (r, updates) => { log.push(['update', r.path, Object.keys(updates).sort()]); tree[r.path] = { ...(tree[r.path] ?? {}) }; for (const [k, v] of Object.entries(updates)) { const [group, id] = k.split('/'); tree[r.path][group] = { ...(tree[r.path][group] ?? {}), [id]: v }; } },
    },
  };
}
const fakeAuth = (user) => ({ configured: true, app: {}, state: { status: user ? 'signed-in' : 'signed-out', user }, subscribe() {} });
const CONFIG = { databaseURL: 'https://elec-master-default-rtdb.asia-southeast1.firebasedatabase.app' };

test('동기화: 서버 병합 후 변경분만 업로드하고 dirty 해제', async () => {
  const store = createStore({ storage: memory(), now: () => T0 });
  store.recordReview('M01', true);
  const db = fakeDb({ 'elec/users/u1': { cards: { M05: review(null, true, DAY, 10) } } });
  const sync = createSync({ store, auth: fakeAuth({ uid: 'u1' }), config: CONFIG, importer: async () => db.mod, now: () => 42 });
  const st = await sync.syncNow();
  assert.equal(st.state, 'ok');
  assert.equal(st.lastOkAt, 42);
  assert.deepEqual(db.log.map((l) => l[0]), ['get', 'update']);
  assert.deepEqual(db.log[1][2], [`cards/M01`, `daily/${DAY}`]);
  assert.ok(store.cardStates().M05); // 서버 → 로컬
  assert.deepEqual(store.dirtySnapshot(), { cards: {}, daily: {}, drill: {} });
  assert.equal(store.owner, 'u1');
  await sync.syncNow(); // 변경 없으면 업로드 없음
  assert.deepEqual(db.log.slice(2).map((l) => l[0]), ['get']);
});

test('동기화: 권한 거부·오프라인 분류, 로그아웃·설정 없음은 건너뜀', async () => {
  assert.equal(classifySyncError({ code: 'PERMISSION_DENIED' }).state, 'error');
  assert.match(classifySyncError(new Error('Permission denied')).message, /규칙/);
  assert.equal(classifySyncError(new Error('x'), false).state, 'offline');
  assert.equal(classifySyncError(new Error('Failed to fetch')).state, 'offline');

  const store = createStore({ storage: memory(), now: () => T0 });
  const denied = { getDatabase: () => ({}), ref: () => ({}), get: async () => { const e = new Error('PERMISSION_DENIED: x'); e.code = 'PERMISSION_DENIED'; throw e; }, update: async () => {} };
  const s1 = createSync({ store, auth: fakeAuth({ uid: 'u1' }), config: CONFIG, importer: async () => denied });
  assert.equal((await s1.syncNow()).state, 'error');

  const s2 = createSync({ store, auth: fakeAuth(null), config: CONFIG, importer: async () => { throw new Error('no'); } });
  assert.equal((await s2.syncNow()).state, 'idle');

  const s3 = createSync({ store, auth: { configured: false, state: {}, subscribe() {} }, config: {} });
  assert.equal(s3.status.state, 'disabled');
  assert.equal((await s3.syncNow()).state, 'disabled');
  const s4 = createSync({ store, auth: fakeAuth({ uid: 'u1' }), config: { databaseURL: '' } });
  assert.equal(s4.status.state, 'disabled');

  const noApp = { ...fakeAuth({ uid: 'u1' }), app: null };
  const s5 = createSync({ store, auth: noApp, config: CONFIG, importer: async () => ({}) });
  assert.equal((await s5.syncNow()).state, 'error');
  assert.equal(addDays(DAY, 0), DAY);
});
