import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { xpForLevel, levelInfo, totalXp, earnedTitles, computeStreak, parseMetric, metricValue, metricCoversCard, buildQuestModel, evaluate, countDue } from '../../js/engine.js';
import { createQuestRunner } from '../../js/runner.js';
import { createStore, reconcile, emptyProgress, mergeQuestStates, mergeBoss } from '../../js/store.js';
import { createSync } from '../../js/sync.js';
import { addDays } from '../../js/srs.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const cardsAll = json('data/cards.json').cards;
const quests = json('data/quests/ch1.json').quests;
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};
const T0 = Date.UTC(2026, 10, 16, 3, 0, 0); // 2026-11-16 12:00 KST
const DAY = '20261116';

function setup() {
  const clock = { t: T0 };
  const store = createStore({ storage: memory(), now: () => clock.t });
  const data = { cardsAll, cards: cardsAll, quests };
  const runner = createQuestRunner({ store, getData: () => data });
  const events = [];
  runner.subscribe((e) => events.push(...e));
  return { store, runner, events, clock, data };
}
const ids = (from, to) => cardsAll.map((c) => c.id).slice(cardsAll.findIndex((c) => c.id === from), cardsAll.findIndex((c) => c.id === to) + 1);
const status = (runner, id) => runner.model().find((r) => r.quest.id === id);

test('레벨: 임계값 50·(n−1)·n', () => {
  assert.equal(xpForLevel(1), 0);
  assert.equal(xpForLevel(2), 100);
  assert.equal(xpForLevel(5), 1000);
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(99).level, 1);
  assert.equal(levelInfo(100).level, 2);
  assert.equal(levelInfo(299).level, 2);
  assert.equal(levelInfo(300).level, 3);
  assert.deepEqual(levelInfo(150), { level: 2, xp: 150, floor: 100, next: 300, into: 50, span: 200 });
  assert.equal(levelInfo(-5).level, 1);
});

test('XP 합계: 완료 퀘스트 + 일일 장부, 건너뜀은 0', () => {
  const states = { 'Q1-01': { status: 'done', xp: 20 }, 'Q1-02': { status: 'skipped', xp: 0 }, 'Q1-03': { status: 'active', xp: 99 } };
  assert.equal(totalXp(states, { '20261116/D-01': 15, '20261117/D-01': 15 }), 50);
  assert.equal(totalXp({}, {}), 0);
});

test('연속 학습일: 오늘·어제 유예·끊김·최고 기록', () => {
  const day = (d, n = 1) => ({ reviewed: n, drillTotal: 0, bossAttempts: 0 });
  const daily = { '20261112': day(), '20261113': day(), '20261114': day(), '20261115': day(), '20261116': day() };
  assert.deepEqual(computeStreak(daily, '20261116'), { current: 5, best: 5, activeToday: true });
  assert.deepEqual(computeStreak(daily, '20261117'), { current: 5, best: 5, activeToday: false }); // 오늘 안에 이으면 유지
  assert.equal(computeStreak(daily, '20261118').current, 0); // 하루 건너뜀
  const gap = { '20261101': day(), '20261102': day(), '20261103': day(), '20261115': day() };
  assert.deepEqual(computeStreak(gap, '20261116'), { current: 1, best: 3, activeToday: false });
  assert.equal(computeStreak({ '20261116': { reviewed: 0, drillTotal: 0, bossAttempts: 0 } }, '20261116').current, 0);
  assert.equal(computeStreak({ '20261116': { reviewed: 0, drillTotal: 3, bossAttempts: 0 } }, '20261116').current, 1);
  assert.equal(computeStreak({ '20261116': { reviewed: 0, drillTotal: 0, bossAttempts: 1 } }, '20261116').current, 1);
  assert.deepEqual(computeStreak({}, DAY), { current: 0, best: 0, activeToday: false });
});

test('지표 해석과 값 계산', () => {
  assert.deepEqual(parseMetric('cards_correct:M01..M07'), { kind: 'cards_correct', from: 'M01', to: 'M07' });
  assert.deepEqual(parseMetric('drill_correct:S3'), { kind: 'drill_correct', subject: 'S3' });
  assert.deepEqual(parseMetric('boss_ch1_correct'), { kind: 'boss', key: 'ch1' });
  assert.equal(parseMetric('nope'), null);
  assert.equal(parseMetric(null), null);
  const cardIds = ['M01', 'M02', 'M03', 'M04'];
  const ctx = {
    cardIds,
    states: { M01: { reps: 2, correct: 1 }, M02: { reps: 1, correct: 0 }, M04: { reps: 1, correct: 3 } },
    drill: { M: { correct: 7, total: 9 } },
    boss: { ch1: { best: 6 } },
    daily: { reviewed: 4, newCards: 1, drillCorrect: 2 },
    dueNow: 0,
  };
  assert.equal(metricValue('cards_seen', ctx), 3);
  assert.equal(metricValue('cards_correct:M01..M04', ctx), 2); // M01, M04
  assert.equal(metricValue('cards_correct:M02..M03', ctx), 0);
  assert.equal(metricValue('cards_correct:M04..M01', ctx), 0); // 거꾸로 된 범위
  assert.equal(metricValue('cards_correct:X1..X2', ctx), 0);
  assert.equal(metricValue('drill_correct:M', ctx), 7);
  assert.equal(metricValue('drill_correct:S1', ctx), 0);
  assert.equal(metricValue('boss_ch1_correct', ctx), 6);
  assert.equal(metricValue('daily_cards_reviewed', ctx), 4);
  assert.equal(metricValue('daily_drill_correct', ctx), 2);
  assert.equal(metricValue('daily_due_cleared', ctx), 1);
  assert.equal(metricValue('daily_due_cleared', { ...ctx, dueNow: 2 }), 0);
  assert.equal(metricValue('daily_due_cleared', { ...ctx, daily: { reviewed: 0, newCards: 0, drillCorrect: 0 } }), 0); // 오늘 복습이 없으면 미달성
  assert.equal(metricValue('daily_due_cleared', { ...ctx, daily: { reviewed: 3, newCards: 3, drillCorrect: 0 } }), 0); // 새 카드만 본 날은 "복습 큐 비우기"가 아님
  assert.equal(metricValue('unknown_metric', ctx), 0);
  assert.equal(metricCoversCard('cards_correct:M01..M04', 'M03', cardIds), true);
  assert.equal(metricCoversCard('cards_correct:M01..M02', 'M03', cardIds), false);
  assert.equal(metricCoversCard('drill_correct:M', 'M03', cardIds), false);
});

test('모든 퀘스트의 지표가 해석된다(P4 구현 대상 누락 없음)', () => {
  for (const q of quests) assert.ok(parseMetric(q.metric), `${q.id}: ${q.metric}`);
});

test('판정: 선행이 연쇄로 풀리면 한 번에 완료, 선행 미완료면 값이 차도 대기', () => {
  const ctx = (extra = {}) => ({
    cardIds: cardsAll.map((c) => c.id),
    states: Object.fromEntries(ids('M01', 'M07').map((id) => [id, { reps: 1, correct: 1 }])),
    drill: {}, boss: {}, daily: { reviewed: 0, drillCorrect: 0 }, dueNow: 0, ...extra,
  });
  const res = evaluate({ quests, questStates: {}, xplog: {}, ctx: ctx(), today: DAY });
  assert.deepEqual(res.completed.map((c) => c.id), ['Q1-01', 'Q1-02']); // M01~M07 정답 → 열람 7장 ≥ 5
  const only = evaluate({ quests, questStates: { 'Q1-01': { status: 'done' } }, xplog: {}, ctx: ctx(), today: DAY });
  assert.deepEqual(only.completed.map((c) => c.id), ['Q1-02']);
  const none = evaluate({ quests, questStates: {}, xplog: {}, ctx: ctx({ states: Object.fromEntries(ids('M02', 'M07').map((id) => [id, { reps: 1, correct: 1 }])) }), today: DAY });
  assert.deepEqual(none.completed.map((c) => c.id), ['Q1-01']); // M01 미정답 → Q1-02 대기
});

test('러너: 카드 복습으로 Q1-01·Q1-02 완료, XP·알림, 중복 지급 없음', () => {
  const { store, runner, events } = setup();
  assert.equal(status(runner, 'Q1-01').status, 'available');
  assert.equal(status(runner, 'Q1-02').status, 'locked');
  ids('M01', 'M05').forEach((id) => store.recordReview(id, true));
  assert.equal(status(runner, 'Q1-01').status, 'done');
  const mainXp = () => totalXp(store.questStates(), {}); // 일일 퀘스트(D-03 등) XP는 제외하고 메인 퀘스트만 확인
  assert.equal(mainXp(), 20);
  const quest01 = events.find((e) => e.kind === 'quest');
  assert.equal(quest01.quest.id, 'Q1-01');
  assert.equal(quest01.xp, 20);
  ids('M06', 'M07').forEach((id) => store.recordReview(id, true));
  assert.equal(status(runner, 'Q1-02').status, 'done');
  assert.equal(mainXp(), 50);
  const before = events.length;
  assert.deepEqual(runner.check(), []); // 다시 판정해도 새 이벤트 없음
  assert.equal(events.length, before);
  assert.equal(store.completeQuest('Q1-01', 20), false); // 중복 완료 불가
  assert.equal(mainXp(), 50);
  assert.deepEqual(earnedTitles(quests, store.questStates()).map((t) => t.title), ['견습 전기공']);
});

test('러너: 일일 퀘스트는 하루 한 번만 XP, 다음 날 다시', () => {
  const { store, runner, events, clock } = setup();
  const first = cardsAll.slice(0, 10).map((c) => c.id);
  first.forEach((id) => store.recordReview(id, true));
  const d01 = events.filter((e) => e.kind === 'daily' && e.quest.id === 'D-01');
  assert.equal(d01.length, 1);
  assert.equal(d01[0].xp, 15);
  store.recordReview('M11', true); // 같은 날 추가 복습
  assert.equal(events.filter((e) => e.kind === 'daily' && e.quest.id === 'D-01').length, 1);
  assert.equal(store.awardDaily(DAY, 'D-01', 15), false);
  assert.equal(status(runner, 'D-01').status, 'done');
  clock.t += 24 * 3600 * 1000; // 다음 날
  assert.equal(status(runner, 'D-01').status, 'available');
  cardsAll.slice(11, 21).forEach((c) => store.recordReview(c.id, true));
  assert.equal(events.filter((e) => e.kind === 'daily' && e.quest.id === 'D-01').length, 2);
  assert.ok(store.xplog()[`${addDays(DAY, 1)}/D-01`] === 15);
});

test('러너: 드릴 정답으로 D-02, 복습 예정 카드를 모두 처리하면 D-03(새 카드만 본 날은 제외)', () => {
  const { store, events, clock } = setup();
  for (let i = 0; i < 5; i += 1) store.recordDrill('S3', true);
  assert.ok(events.some((e) => e.kind === 'daily' && e.quest.id === 'D-02'));
  store.recordReview('M01', true); // 새 카드만 본 날
  store.recordReview('M02', true);
  assert.ok(!events.some((e) => e.kind === 'daily' && e.quest.id === 'D-03'));
  clock.t += 24 * 3600 * 1000; // 다음 날: M01·M02가 복습 예정
  store.recordReview('M01', true); // 아직 M02가 남아 있음
  assert.ok(!events.some((e) => e.kind === 'daily' && e.quest.id === 'D-03'));
  store.recordReview('M02', true); // 복습 예정을 모두 처리
  assert.ok(events.some((e) => e.kind === 'daily' && e.quest.id === 'D-03' && e.xp === 25));
});

test('러너: 레벨업 알림(누적 XP가 100을 넘는 순간)', () => {
  const { store, events } = setup();
  store.completeQuest('Q1-01', 90); // 이전까지 90 XP
  ids('M01', 'M07').forEach((id) => store.recordReview(id, true)); // Q1-02 +30 → 120
  const summary = events.find((e) => e.kind === 'summary');
  assert.equal(summary.levelUp, true);
  assert.equal(summary.level, 2);
  assert.equal(summary.gained, 30);
});

test('러너: 실패 3회 후에만 건너뛰기, 건너뛰면 다음 퀘스트 해금·XP 없음, 잠긴 퀘스트는 실패 집계 안 함', () => {
  const { store, runner } = setup();
  ids('M01', 'M07').forEach((id) => store.recordReview(id, true)); // Q1-01, Q1-02 완료
  assert.equal(status(runner, 'Q1-03').status, 'available');
  store.recordReview('M10', false); // Q1-04는 아직 잠김 → 실패로 세지 않음
  assert.equal(status(runner, 'Q1-04').fails, 0);
  store.recordReview('M08', false);
  store.recordReview('M08', false);
  assert.equal(status(runner, 'Q1-03').fails, 2);
  assert.equal(runner.skip('Q1-03'), false); // 아직 불가
  store.recordReview('M09', false);
  const row = status(runner, 'Q1-03');
  assert.equal(row.fails, 3);
  assert.equal(row.canSkip, true);
  const xpBefore = totalXp(store.questStates(), store.xplog());
  assert.equal(runner.skip('Q1-03'), true);
  assert.equal(status(runner, 'Q1-03').status, 'skipped');
  assert.equal(status(runner, 'Q1-04').status, 'available'); // 건너뜀도 선행 충족
  assert.equal(totalXp(store.questStates(), store.xplog()), xpBefore); // XP 없음
  assert.equal(runner.skip('Q1-03'), false); // 이미 처리됨
  assert.equal(runner.skip('Q1-13'), false); // 보스는 건너뛰기 없음
  assert.equal(runner.skip('D-01'), false);
  assert.equal(runner.skip('NOPE'), false);
});

test('러너: 드릴 실패도 해당 퀘스트의 실패로 집계, 누적 20문제 정답이면 Q1-07 완료와 칭호', () => {
  const { store, runner, events } = setup();
  for (const id of ['Q1-01', 'Q1-02', 'Q1-03', 'Q1-04', 'Q1-05', 'Q1-06']) store.completeQuest(id, 0);
  assert.equal(status(runner, 'Q1-07').status, 'available');
  store.recordDrill('M', false);
  assert.equal(status(runner, 'Q1-07').fails, 1);
  for (let i = 0; i < 19; i += 1) store.recordDrill('M', true);
  assert.equal(status(runner, 'Q1-07').status, 'available');
  store.recordDrill('M', true);
  assert.equal(status(runner, 'Q1-07').status, 'done');
  assert.ok(events.some((e) => e.kind === 'quest' && e.quest.id === 'Q1-07' && e.xp === 60));
  assert.ok(earnedTitles(quests, store.questStates()).some((t) => t.title === '수학 워밍업'));
});

test('러너: 보스전 — 실패는 기록만, 8문제 이상 클리어하면 완료·150 XP·칭호·레벨업', () => {
  const { store, runner, events } = setup();
  for (const q of quests.filter((x) => x.type === 'main')) store.completeQuest(q.id, q.xp);
  const xpMain = quests.filter((x) => x.type === 'main').reduce((s, q) => s + q.xp, 0);
  assert.equal(status(runner, 'Q1-13').status, 'available');
  store.recordBoss('ch1', 7, false);
  assert.equal(status(runner, 'Q1-13').status, 'available');
  assert.equal(status(runner, 'Q1-13').fails, 1);
  assert.equal(status(runner, 'Q1-13').canSkip, false);
  const lvBefore = levelInfo(totalXp(store.questStates(), store.xplog())).level;
  store.recordBoss('ch1', 8, true);
  assert.equal(status(runner, 'Q1-13').status, 'done');
  assert.equal(totalXp(store.questStates(), store.xplog()), xpMain + 150);
  const summary = events.find((e) => e.kind === 'summary' && e.gained === 150);
  assert.ok(summary);
  assert.equal(summary.levelUp, levelInfo(xpMain + 150).level > lvBefore);
  assert.deepEqual(store.bossStats().ch1, { best: 8, attempts: 2, clears: 1, last: T0 });
  assert.ok(earnedTitles(quests, store.questStates()).some((t) => t.title === '기초 마스터'));
  store.recordBoss('ch1', 10, true); // 재도전은 기록만, XP 중복 없음
  assert.equal(totalXp(store.questStates(), store.xplog()), xpMain + 150);
  assert.equal(store.bossStats().ch1.best, 10);
});

test('러너: 보스는 선행 미완료면 잠김, 점수가 높아도 완료되지 않음', () => {
  const { store, runner } = setup();
  store.recordBoss('ch1', 10, true);
  assert.equal(status(runner, 'Q1-13').status, 'locked');
  assert.equal(totalXp(store.questStates(), store.xplog()), 0);
});

test('모델: 화면용 진행도(0~1)와 복습 예정 계산', () => {
  const { store, runner, data } = setup();
  ids('M01', 'M03').forEach((id) => store.recordReview(id, true));
  const row = status(runner, 'Q1-01');
  assert.equal(row.value, 3);
  assert.equal(row.target, 5);
  assert.equal(row.ratio, 0.6);
  assert.equal(countDue(data.cards, store.cardStates(), addDays(DAY, 1)), 3); // 내일이면 1일 단계 카드 3장이 도래
  assert.equal(countDue(data.cards, store.cardStates(), DAY), 0);
  assert.equal(buildQuestModel({ quests, questStates: {}, xplog: {}, ctx: { cardIds: [], states: {}, drill: {}, boss: {}, daily: { reviewed: 0, drillCorrect: 0 }, dueNow: 0 }, today: DAY }).length, 16);
});

test('저장소: 완료·건너뜀·일일 지급은 한 번만, 입력 검증', () => {
  const store = createStore({ storage: memory(), now: () => T0 });
  assert.equal(store.completeQuest('Q1-01', 20), true);
  assert.equal(store.completeQuest('Q1-01', 20), false);
  assert.equal(store.skipQuest('Q1-01'), false);
  assert.equal(store.bumpQuestFail('Q1-01'), false);
  assert.equal(store.completeQuest('bad', 5), false);
  assert.equal(store.awardDaily(DAY, 'D-01', 15), true);
  assert.equal(store.awardDaily(DAY, 'D-01', 15), false);
  assert.equal(store.awardDaily('2026-11-16', 'D-01', 15), false);
  assert.equal(store.awardDaily(DAY, 'Q1-01', 15), false); // 일일 장부는 D- 퀘스트만
  assert.throws(() => store.recordBoss('x', 1, false), RangeError);
  const dirty = store.dirtySnapshot();
  assert.deepEqual(Object.keys(dirty.quests), ['Q1-01']);
  assert.deepEqual(Object.keys(dirty.xplog), [`${DAY}/D-01`]);
});

test('병합: 완료 우선·실패 최댓값, 일일 장부 합집합, 보스 최댓값, 서버 xplog 펼치기', () => {
  assert.deepEqual(
    mergeQuestStates({ status: 'active', fails: 4, xp: 0, at: 9, day: null }, { status: 'done', fails: 1, xp: 20, at: 5, day: DAY }),
    { status: 'done', fails: 4, xp: 20, at: 5, day: DAY },
  );
  assert.equal(mergeQuestStates({ status: 'skipped', fails: 3, xp: 0, at: 1, day: null }, { status: 'done', fails: 0, xp: 20, at: 2, day: DAY }).status, 'done');
  assert.deepEqual(mergeBoss({ best: 8, attempts: 2, clears: 1, last: 5 }, { best: 6, attempts: 5, clears: 0, last: 9 }), { best: 8, attempts: 5, clears: 1, last: 9 });
  const local = emptyProgress();
  local.quests['Q1-01'] = { status: 'done', fails: 0, xp: 20, at: 5, day: DAY };
  local.xplog[`${DAY}/D-01`] = 15;
  const remote = {
    quests: { 'Q1-02': { status: 'done', xp: 30, fails: 1, at: 7, day: DAY }, 'bad': { status: 'done' } },
    xplog: { [DAY]: { 'D-02': 20, 'Q1-01': 5, 'D-03': -4 }, '2026-11': { 'D-01': 1 } },
    boss: { ch1: { best: 9, attempts: 3, clears: 1, last: 3 }, x: { best: 1 } },
  };
  const out = reconcile(local, 'u1', remote);
  assert.deepEqual(Object.keys(out.quests).sort(), ['Q1-01', 'Q1-02']);
  assert.deepEqual(out.xplog, { [`${DAY}/D-02`]: 20, [`${DAY}/D-01`]: 15 });
  assert.deepEqual(out.boss, { ch1: { best: 9, attempts: 3, clears: 1, last: 3 } });
  assert.deepEqual(out.dirty.quests, { 'Q1-01': true });
  assert.deepEqual(out.dirty.xplog, { [`${DAY}/D-01`]: true });
});

test('동기화: 퀘스트·XP 장부·보스가 올바른 경로로 올라간다', async () => {
  const store = createStore({ storage: memory(), now: () => T0 });
  store.completeQuest('Q1-01', 20);
  store.awardDaily(DAY, 'D-01', 15);
  store.recordBoss('ch1', 8, true);
  const tree = {};
  const log = [];
  const mod = {
    getDatabase: () => ({}), ref: (_d, p) => ({ path: p }),
    get: async (r) => ({ val: () => tree[r.path] ?? null }),
    update: async (r, u) => { log.push(Object.keys(u).sort()); for (const [k, v] of Object.entries(u)) { const parts = k.split('/'); let n = (tree[r.path] ??= {}); for (const part of parts.slice(0, -1)) n = (n[part] ??= {}); n[parts.at(-1)] = v; } },
  };
  const auth = { configured: true, app: {}, state: { status: 'signed-in', user: { uid: 'u1' } }, subscribe() {} };
  const sync = createSync({ store, auth, config: { databaseURL: 'https://x-default-rtdb.asia-southeast1.firebasedatabase.app' }, importer: async () => mod });
  assert.equal((await sync.syncNow()).state, 'ok');
  const keys = log[0];
  assert.ok(keys.includes('quests/Q1-01'));
  assert.ok(keys.includes(`xplog/${DAY}/D-01`));
  assert.ok(keys.includes('boss/ch1'));
  assert.equal(tree['elec/users/u1'].xplog[DAY]['D-01'], 15);
  assert.equal(tree['elec/users/u1'].quests['Q1-01'].xp, 20);
  // 다른 기기에서 내려받아도 같은 상태가 복원된다
  const store2 = createStore({ storage: memory(), now: () => T0 });
  const sync2 = createSync({ store: store2, auth, config: { databaseURL: 'https://x-default-rtdb.asia-southeast1.firebasedatabase.app' }, importer: async () => mod });
  await sync2.syncNow();
  assert.equal(totalXp(store2.questStates(), store2.xplog()), 35);
  assert.equal(store2.bossStats().ch1.best, 8);
  assert.equal(store2.completeQuest('Q1-01', 20), false); // 기기 B에서 XP 이중 지급 안 됨
});
