import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTERVALS, kstDateKey, addDays, isDateKey, review, retag, isDue, buildQueue, summarize, newState, WRONG_REASONS } from '../../js/srs.js';
import { parseLocation, parseRoute } from '../../js/router.js';

const T0 = Date.UTC(2026, 10, 16, 3, 0, 0); // 2026-11-16 12:00 KST
const DAY = '20261116';

test('KST 날짜 키: 자정 경계와 날짜 연산', () => {
  assert.equal(kstDateKey(new Date(Date.UTC(2026, 10, 16, 14, 59, 59))), '20261116'); // 23:59:59 KST
  assert.equal(kstDateKey(new Date(Date.UTC(2026, 10, 16, 15, 0, 0))), '20261117'); // 00:00 KST
  assert.equal(addDays('20261231', 1), '20270101');
  assert.equal(addDays('20240228', 2), '20240301'); // 윤년
  assert.equal(addDays('20261116', 30), '20261216');
  assert.equal(isDateKey('20261116'), true);
  assert.equal(isDateKey('20261316'), false);
  assert.equal(isDateKey('2026-11-16'), false);
  assert.throws(() => addDays('bad', 1), RangeError);
});

test('SRS: 새 카드 정답 → 1일 단계, 이후 3→7→14→30, 30일 단계 정답이면 졸업', () => {
  let s = review(null, true, DAY, T0);
  assert.equal(s.stage, 0);
  assert.equal(s.due, addDays(DAY, 1));
  const expectDays = [3, 7, 14, 30];
  let today = DAY;
  for (const d of expectDays) {
    today = s.due; // 기한 당일에 복습
    s = review(s, true, today, T0);
    assert.equal(s.due, addDays(today, d), `${d}일 단계`);
  }
  assert.equal(s.stage, 4);
  assert.equal(s.graduated, false);
  s = review(s, true, s.due, T0);
  assert.equal(s.graduated, true);
  assert.equal(s.due, null);
  assert.equal(isDue(s, '29991231'), false); // 졸업 카드는 더 이상 복습 대상이 아님
  assert.equal(s.reps, 6);
});

test('SRS: 오답은 1일 단계로 리셋, 이유 집계·lapses 증가, 원본 불변', () => {
  const base = review(review(null, true, DAY, T0), true, addDays(DAY, 1), T0); // stage 1
  const frozen = JSON.stringify(base);
  const wrong = review(base, false, addDays(DAY, 4), T0, 'formula');
  assert.equal(wrong.stage, 0);
  assert.equal(wrong.due, addDays(DAY, 5));
  assert.equal(wrong.lapses, 1);
  assert.equal(wrong.reasons.formula, 1);
  assert.equal(JSON.stringify(base), frozen);
  const unknown = review(base, false, DAY, T0, 'bogus');
  assert.deepEqual(unknown.reasons, { concept: 0, formula: 0, calc: 0, misread: 0 });
  const firstWrong = review(null, false, DAY, T0);
  assert.equal(firstWrong.lapses, 0); // 처음 보고 틀린 것은 lapse가 아님
  assert.equal(firstWrong.due, addDays(DAY, 1));
  assert.equal(WRONG_REASONS.length, 4);
});

test('SRS: 이유 재선택 보정(retag)', () => {
  let s = review(null, false, DAY, T0, 'concept');
  s = retag(s, 'concept', 'calc');
  assert.equal(s.reasons.concept, 0);
  assert.equal(s.reasons.calc, 1);
  s = retag(s, 'calc', null);
  assert.equal(s.reasons.calc, 0);
  s = retag(s, null, 'misread');
  assert.equal(s.reasons.misread, 1);
});

const cards = ['M01', 'M02', 'M03', 'S1-01', 'S1-02'].map((id) => ({ id, subject: id.startsWith('M') ? 'M' : 'S1' }));

test('큐: 복습 예정(기한순) → 새 카드(상한), 크기 제한, 과목 필터', () => {
  const states = {
    M02: { ...newState(), stage: 1, due: '20261110' },
    M01: { ...newState(), stage: 0, due: '20261112' },
    'S1-01': { ...newState(), stage: 0, due: '20261120' }, // 아직 아님
    M03: { ...newState(), graduated: true },
  };
  const a = buildQueue({ cards, states, today: DAY, newLimit: 10, newDoneToday: 0, size: 10 });
  assert.deepEqual(a.queue.map((c) => c.id), ['M02', 'M01', 'S1-02']);
  assert.equal(a.dueCount, 2);
  assert.equal(a.newAvailable, 1);
  const b = buildQueue({ cards, states, today: DAY, newLimit: 10, newDoneToday: 10, size: 10 });
  assert.deepEqual(b.queue.map((c) => c.id), ['M02', 'M01']); // 새 카드 한도 소진
  const c = buildQueue({ cards, states, today: DAY, size: 1 });
  assert.equal(c.queue.length, 1);
  const d = buildQueue({ cards, states, today: DAY, subject: 'S1' });
  assert.deepEqual(d.queue.map((x) => x.id), ['S1-02']);
  assert.equal(buildQueue({ cards: [], states: {}, today: DAY }).queue.length, 0);
});

test('집계: 과목별 복습·새 카드·졸업', () => {
  const states = { M01: { ...newState(), stage: 0, due: DAY }, M02: { ...newState(), graduated: true } };
  const sum = summarize(cards, states, DAY);
  assert.equal(sum.total.due, 1);
  assert.equal(sum.total.graduated, 1);
  assert.equal(sum.total.fresh, 3);
  assert.equal(sum.bySubject.M.learning, 1);
  assert.equal(INTERVALS.join(','), '1,3,7,14,30');
});

test('라우터: 세션 경로와 쿼리 파라미터', () => {
  assert.deepEqual(parseLocation('#/session?subject=S1'), { id: 'session', tab: 'practice', params: { subject: 'S1' } });
  assert.deepEqual(parseLocation('#/session'), { id: 'session', tab: 'practice', params: {} });
  assert.equal(parseLocation('#/quests').id, 'quests');
  assert.equal(parseLocation('#/zzz').id, 'map');
  assert.equal(parseRoute('#/session?subject=M'), 'practice');
});
