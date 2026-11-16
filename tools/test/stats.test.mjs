import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyActivity, weekdayLabel, niceMax, subjectAccuracy, drillAccuracy, reasonTotals, weakCards, pct } from '../../js/stats.js';

const SUBJECTS = ['M', 'S1', 'S2'];

test('요일: 2026-11-16은 월요일', () => {
  assert.equal(weekdayLabel('20261116'), '월');
  assert.equal(weekdayLabel('20261115'), '일');
  assert.equal(weekdayLabel('20240229'), '목');
});

test('최근 7일: 오래된 날부터, 오늘 라벨, 기록 없는 날은 0, 월 경계', () => {
  const daily = {
    '20261116': { reviewed: 10, drillTotal: 5 },
    '20261114': { reviewed: 3, drillTotal: 0 },
    '20261031': { reviewed: 99, drillTotal: 99 }, // 범위 밖
  };
  const w = weeklyActivity(daily, '20261116', 7);
  assert.equal(w.length, 7);
  assert.deepEqual(w.map((r) => r.day), ['20261110', '20261111', '20261112', '20261113', '20261114', '20261115', '20261116']);
  assert.equal(w.at(-1).label, '오늘');
  assert.equal(w.at(-1).value, 15);
  assert.equal(w.at(-1).isToday, true);
  assert.equal(w[4].value, 3);
  assert.equal(w[0].value, 0);
  assert.equal(weeklyActivity({}, '20260102', 7)[0].day, '20251227'); // 연 경계
  assert.equal(weeklyActivity(undefined, '20261116', 3).length, 3);
});

test('축 최댓값: 깔끔한 단계', () => {
  assert.equal(niceMax(0), 5);
  assert.equal(niceMax(5), 5);
  assert.equal(niceMax(6), 10);
  assert.equal(niceMax(10), 10);
  assert.equal(niceMax(11), 20);
  assert.equal(niceMax(21), 50);
  assert.equal(niceMax(51), 100);
  assert.equal(niceMax(101), 200);
  assert.equal(niceMax(NaN), 5);
});

const cards = [
  { id: 'M01', subject: 'M', front: 'a', back: 'x' },
  { id: 'M02', subject: 'M', front: 'b', back: 'y' },
  { id: 'S1-01', subject: 'S1', front: 'c', back: 'z' },
  { id: 'S2-01', subject: 'S2', front: 'd', back: 'w' },
];
const st = (reps, correct, lapses = 0, reasons = {}) => ({ reps, correct, lapses, reasons: { concept: 0, formula: 0, calc: 0, misread: 0, ...reasons } });

test('과목별 카드 정답률: 복습 횟수 가중, 기록 없으면 null', () => {
  const acc = subjectAccuracy(cards, { M01: st(4, 3), M02: st(1, 1), 'S1-01': st(2, 0) }, SUBJECTS);
  assert.deepEqual(acc[0], { subject: 'M', reps: 5, correct: 4, cards: 2, rate: 0.8 });
  assert.equal(acc[1].rate, 0);
  assert.equal(acc[2].rate, null);
  assert.equal(subjectAccuracy(cards, { M01: st(2, 9) }, SUBJECTS)[0].correct, 2); // 비정상 값은 복습 횟수로 제한
  assert.equal(pct(0.8), '80%');
  assert.equal(pct(null), '-');
  assert.equal(pct(0.666), '67%');
});

test('드릴 정답률', () => {
  const d = drillAccuracy({ M: { correct: 3, total: 4 }, S1: { correct: 0, total: 0 } }, SUBJECTS);
  assert.deepEqual(d.map((r) => r.rate), [0.75, null, null]);
});

test('틀린 이유 합계: 카드 + 드릴', () => {
  const r = reasonTotals({ M01: st(1, 0, 0, { concept: 2, calc: 1 }), M02: st(1, 0, 0, { concept: 1 }) }, { S1: { correct: 0, total: 1, reasons: { calc: 3, misread: 1 } } });
  assert.deepEqual(r.map((x) => [x.id, x.count]), [['concept', 3], ['formula', 0], ['calc', 4], ['misread', 1]]);
  assert.deepEqual(reasonTotals({}, {}).map((x) => x.count), [0, 0, 0, 0]);
});

test('자주 틀리는 카드: 오답 횟수 순, 틀린 적 없으면 제외, 상위 N', () => {
  const weak = weakCards(cards, { M01: st(5, 2, 1), M02: st(3, 3), 'S1-01': st(2, 0, 2), 'S2-01': st(4, 1, 0) }, 2);
  assert.deepEqual(weak.map((w) => [w.card.id, w.wrong]), [['M01', 3], ['S2-01', 3]]); // 오답 3회 동률 → lapses·ID 순
  assert.equal(weakCards(cards, {}, 5).length, 0);
  assert.equal(weakCards(cards, { M01: st(2, 2) }, 5).length, 0);
});
