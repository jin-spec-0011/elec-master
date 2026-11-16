import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { compile, evaluate, ExprError } from '../../js/expr.js';
import { makeRng, shuffle, pick } from '../../js/rng.js';
import { generateDrill, evalAnswer, gradeNumeric, parseInput, applyKey, buildDrillQueue, formatNumber } from '../../js/drills.js';
import { buildQuestion, buildChoiceQuestion, buildBlankQuestion, isBlankable, isValidQuestion, kindsFor, normText, operandIndices, tokenClass, BLANK_MARK } from '../../js/questions.js';
import { validateDrills } from '../validate-data.mjs';
import { createStore } from '../../js/store.js';
import { parseLocation } from '../../js/router.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const cards = json('data/cards.json').cards;
const drills = json('data/drills.json').templates;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('수식 계산기: 연산자 우선순위·거듭제곱·함수·상수', () => {
  assert.equal(evaluate('1+2*3'), 7);
  assert.equal(evaluate('(1+2)*3'), 9);
  assert.equal(evaluate('2^3^2'), 512); // 우결합
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('2*-3'), -6);
  close(evaluate('sqrt(3)*sqrt(3)'), 3);
  close(evaluate('sin(30)'), 0.5);
  close(evaluate('cos(60)'), 0.5);
  close(evaluate('atan(1)'), 45);
  close(evaluate('2*pi*60'), 2 * Math.PI * 60);
  close(evaluate('9.8*Q*H*eta', { Q: 10, H: 100, eta: 0.9 }), 8820);
  close(evaluate('1e-6*5'), 5e-6);
  close(evaluate('1/(2*pi*sqrt(L*0.001*C*0.000001))', { L: 10, C: 10 }), 503.29, 0.01);
});

test('수식 계산기: 오류 입력은 ExprError, 코드 실행 불가', () => {
  for (const bad of ['', '1+', '(1+2', '1 2', 'foo(1)', '2x', '1 $ 2', 'process.exit(1)', 'constructor', '__proto__']) {
    assert.throws(() => evaluate(bad, {}), ExprError, bad);
  }
  assert.throws(() => evaluate('x+1', {}), /변수 x 값이 없습니다/);
  assert.throws(() => evaluate('toString', {}), ExprError); // 프로토타입 속성은 변수가 아니다
  assert.equal(compile('a+1')({ a: 2 }), 3);
});

test('난수: 같은 시드는 같은 결과, shuffle은 원본 불변', () => {
  assert.equal(makeRng(5)(), makeRng(5)());
  const arr = [1, 2, 3, 4, 5];
  const out = shuffle(arr, makeRng(1));
  assert.deepEqual(arr, [1, 2, 3, 4, 5]);
  assert.deepEqual([...out].sort(), arr);
  assert.throws(() => pick([], makeRng(1)), RangeError);
});

test('드릴 템플릿 61개: 독립 계산 예시값과 일치, 카드 연결, 검증기 통과', () => {
  assert.ok(drills.length >= 40);
  const r = validateDrills(json('data/drills.json'), json('data/cards.json'));
  assert.deepEqual(r.errors, []);
  for (const t of drills) close(evalAnswer(t, t.example.vars), t.example.answer);
});

test('드릴 기준 문제: 손으로 계산한 대표값', () => {
  const byId = Object.fromEntries(drills.map((t) => [t.id, t]));
  assert.equal(evalAnswer(byId['DR-S3-01'], { f: 60, P: 6 }), 1200); // Ns = 120×60/6
  assert.equal(evalAnswer(byId['DR-S3-02'], { Ns: 1800, N: 1746 }), 0.03);
  assert.equal(evalAnswer(byId['DR-M11'], { a: 6, b: 8 }), 10);
  assert.equal(evalAnswer(byId['DR-S2-03'], { P: 30, Q: 40 }), 50);
  assert.equal(evalAnswer(byId['DR-S2-02'], { V: 380, I: 10, pf: 0.8 }), 5265.6 > 0 ? Math.round(Math.sqrt(3) * 380 * 10 * 0.8) : 0);
  assert.equal(evalAnswer(byId['DR-S4-07'], { R: 3, XL: 8, XC: 4 }), 5);
  assert.equal(evalAnswer(byId['DR-S4-14'], { R: 2, C: 50 }), 100); // 2kΩ×50μF = 100ms
  assert.equal(evalAnswer(byId['DR-S1-01'], { q1: 2, q2: 3, r: 3 }), 6000);
  assert.equal(evalAnswer(byId['DR-S3-06'], { a: 30, V1: 6600 }), 220);
  assert.equal(evalAnswer(byId['DR-S2-10'], { P: 100, p1: 0.8, p2: 1 }), 75); // 100×(0.75−0)
});

test('드릴 생성: 모든 템플릿 200회 생성해도 정상, 치환 누락 없음', () => {
  const rng = makeRng(99);
  for (const t of drills) {
    for (let i = 0; i < 200; i += 1) {
      const q = generateDrill(t, rng);
      assert.ok(Number.isFinite(q.answer), t.id);
      assert.ok(!/[{}]|NaN|undefined/.test(q.stem + q.solution), `${t.id}: ${q.stem}`);
      assert.ok(gradeNumeric(String(q.answer), q.answer, q).ok, `${t.id}: 정답 입력이 오답 처리됨`);
    }
  }
});

test('채점: 허용 오차·형식·부호', () => {
  assert.equal(gradeNumeric('1200', 1200).ok, true);
  assert.equal(gradeNumeric('1,200', 1200).ok, true);
  assert.equal(gradeNumeric('1205', 1200, { decimals: 0 }).ok, true); // 1% 이내
  assert.equal(gradeNumeric('1220', 1200, { decimals: 0 }).ok, false);
  assert.equal(gradeNumeric('0.52', 0.5, { decimals: 3, tol: 0.01 }).ok, false);
  assert.equal(gradeNumeric('0.504', 0.5, { decimals: 3, tol: 0.01 }).ok, true);
  assert.equal(gradeNumeric('-5', -5).ok, true);
  assert.equal(gradeNumeric('5', -5).ok, false);
  assert.equal(gradeNumeric('0', 0, { decimals: 2 }).ok, true);
  for (const bad of ['', 'abc', '1.2.3', '--1', '1e5', '١٢٣', '5kV']) assert.equal(gradeNumeric(bad, 5).ok, false, bad);
  assert.equal(parseInput('−3.5'), -3.5); // 유니코드 마이너스
  assert.equal(parseInput('5.'), 5);
  assert.equal(formatNumber(1234.5, 1), '1,234.5');
  assert.equal(formatNumber(0.03, 3), '0.03');
});

test('키패드 입력 규칙', () => {
  const type = (keys) => keys.reduce((acc, k) => applyKey(acc, k), '');
  assert.equal(type(['1', '2', '.', '5']), '12.5');
  assert.equal(type(['.', '5']), '0.5');
  assert.equal(type(['1', '.', '.', '5']), '1.5');
  assert.equal(type(['0', '0', '5']), '5');
  assert.equal(type(['±', '5']), '-5');
  assert.equal(type(['5', '±', '±']), '5');
  assert.equal(type(['±', '.', '5']), '-0.5');
  assert.equal(type(['1', '2', 'back']), '1');
  assert.equal(type(['back']), '');
  assert.equal(type(Array(20).fill('7')).length, 12);
  assert.equal(applyKey('5', 'x'), '5');
});

test('드릴 큐: 크기·과목 필터·연속 중복 방지·KEC 비어 있음', () => {
  const q = buildDrillQueue(drills, { subject: 'S3', size: 10, rng: makeRng(3) });
  assert.equal(q.length, 10);
  assert.ok(q.every((x) => x.subject === 'S3'));
  for (let i = 1; i < q.length; i += 1) assert.notEqual(q[i].id, q[i - 1].id);
  assert.equal(buildDrillQueue(drills, { subject: 'S5', size: 10, rng: makeRng(3) }).length, 0);
  assert.equal(buildDrillQueue(drills, { size: 25, rng: makeRng(3) }).length, 25);
});

test('문제 생성: 100장 × 여러 시드에서 항상 유효한 보기 4개, 정답 보존', () => {
  let made = 0;
  const kinds = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const rng = makeRng(seed);
    for (const card of cards) {
      const q = buildQuestion(card, cards, rng);
      assert.ok(q, `${card.id}: 문제 생성 실패`);
      assert.ok(isValidQuestion(q), `${card.id}: 보기가 유효하지 않음`);
      kinds.add(q.kind);
      made += 1;
      if (q.kind === 'blank') {
        assert.ok(q.display.includes(BLANK_MARK));
        // 빈칸에 정답 토큰을 넣으면 원래 공식과 같아야 한다
        assert.equal(normText(q.display.replace(BLANK_MARK, q.choices[q.answerIndex])), normText(card.back), card.id);
      } else {
        assert.equal(q.choices[q.answerIndex], card.back, card.id);
        assert.equal(q.explain, card.back);
      }
    }
  }
  assert.equal(made, 2000);
  assert.deepEqual([...kinds].sort(), ['blank', 'choice', 'match']);
});

test('문제 생성: 오답 보기는 정답·다른 보기와 겹치지 않고, 같은 공식 안 토큰은 오답으로 쓰지 않는다', () => {
  const rng = makeRng(11);
  for (const card of cards) {
    const c = buildChoiceQuestion(card, cards, rng, 'choice');
    assert.equal(new Set(c.choices.map(normText)).size, 4);
    const b = buildBlankQuestion(card, cards, rng);
    if (!b) continue;
    const own = new Set(card.back.split(/\s+/).map(normText));
    b.choices.forEach((x, i) => {
      if (i !== b.answerIndex) assert.ok(!own.has(normText(x)), `${card.id}: 같은 공식의 토큰 ${x}이 오답으로 사용됨`);
    });
  }
});

test('빈칸 보기 품질: 설명문 어절·짝 안 맞는 괄호 조각은 보기로 쓰지 않는다', () => {
  const tokens = (back) => back.split(/\s+/);
  const idx = operandIndices('크기는 곱하고 각은 더함: A₁A₂ = |A₁||A₂|∠(θ₁ + θ₂)');
  const picked = idx.map((i) => tokens('크기는 곱하고 각은 더함: A₁A₂ = |A₁||A₂|∠(θ₁ + θ₂)')[i]);
  assert.ok(!picked.includes('곱하고') && !picked.includes('각은') && !picked.includes('|A₁||A₂|∠(θ₁'));
  assert.ok(picked.includes('A₁A₂'));
  assert.deepEqual(operandIndices('sin θ = 대변 / 빗변').map((i) => tokens('sin θ = 대변 / 빗변')[i]), ['θ', '대변', '빗변']);
  const rng = makeRng(77);
  for (let n = 0; n < 5; n += 1) {
    for (const card of cards) {
      const b = buildBlankQuestion(card, cards, rng);
      if (!b) continue;
      for (const c of b.choices) assert.ok(!/[:,]$/.test(c) && (c.split('(').length === c.split(')').length), `${card.id}: 부적절한 보기 "${c}"`);
      assert.equal(new Set(b.choices.map(tokenClass)).size, 1, `${card.id}: 보기의 종류가 섞임 ${b.choices.join(' / ')}`);
      assert.notEqual(tokenClass(b.choices[b.answerIndex]), 'ko', `${card.id}: 한글 낱말이 빈칸으로 출제됨`);
    }
  }
});

test('문제 생성: 카드 수가 부족하면 null, 유형 선택·빈칸 가능 판정', () => {
  const rng = makeRng(1);
  assert.equal(buildQuestion(cards[0], [cards[0]], rng), null); // 오답 보기를 만들 다른 카드가 없음
  assert.equal(buildChoiceQuestion(cards[0], cards.slice(0, 3), rng), null); // 4지 선택은 다른 카드가 3장 이상 필요
  assert.equal(buildChoiceQuestion(cards[0], [], rng), null);
  assert.deepEqual(kindsFor({ types: ['calc'] }), ['choice']);
  assert.deepEqual(kindsFor({ types: ['choice', 'blank', 'calc'] }), ['choice', 'blank']);
  assert.equal(isBlankable({ back: '갈색' }), false);
  assert.equal(isBlankable({ back: 'x'.repeat(80) + ' a = b' }), false);
  assert.equal(isBlankable({ back: 'sin θ = 대변 / 빗변' }), true);
  assert.equal(isValidQuestion({ choices: ['a', 'a', 'b', 'c'], answerIndex: 0 }), false);
  assert.equal(isValidQuestion(null), false);
});

test('저장소: 계산 드릴 기록·이유 집계·일별 집계', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  const T0 = Date.UTC(2026, 10, 16, 3);
  const store = createStore({ storage, now: () => T0 });
  store.recordDrill('S3', true);
  store.recordDrill('S3', false);
  store.tagDrillReason('S3', null, 'calc');
  store.tagDrillReason('S3', 'calc', 'misread');
  assert.deepEqual(store.drillStats().S3, { correct: 1, total: 2, reasons: { concept: 0, formula: 0, calc: 0, misread: 1 } });
  assert.deepEqual(store.daily('20261116'), { reviewed: 0, newCards: 0, correct: 0, drillCorrect: 1, drillTotal: 2, bossAttempts: 0 });
  assert.throws(() => store.recordDrill('X9', true), RangeError);
  assert.deepEqual(Object.keys(store.dirtySnapshot().drill), ['S3']);
  const again = createStore({ storage, now: () => T0 });
  assert.equal(again.drillStats().S3.total, 2);
  // 카드 복습이 일별 드릴 집계를 지우지 않는다
  store.recordReview('M01', true);
  assert.equal(store.daily('20261116').drillTotal, 2);
});

test('라우터: quiz·drill·boss도 전체 화면', () => {
  assert.deepEqual(parseLocation('#/boss'), { id: 'boss', tab: 'map', params: {} });
  assert.deepEqual(parseLocation('#/quiz?subject=S2'), { id: 'quiz', tab: 'practice', params: { subject: 'S2' } });
  assert.deepEqual(parseLocation('#/drill'), { id: 'drill', tab: 'practice', params: {} });
});
