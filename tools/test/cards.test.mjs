import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertCards } from '../csv-to-cards.mjs';

const H = '카드ID,과목,앞면 (개념),뒷면 (공식·답),단위,검수,비고,문제유형,개념ID\n';

test('정상 변환: 없음→null, 문제유형 분리, 검수 OK만 reviewed', () => {
  const csv = H +
    'M01,기초수학,사인,sin θ = 대변 / 빗변,없음,OK,없음,4지·빈칸,M-삼각-sin\n' +
    'S1-01,전기자기학,쿨롱,"F = Q₁Q₂ / (4πε₀r²)",[N],대기,"거리, 제곱",4지·빈칸·계산,S1-쿨롱\n';
  const { cards, errors, stats } = convertCards(csv);
  assert.deepEqual(errors, []);
  assert.equal(cards[0].unit, null);
  assert.equal(cards[0].note, null);
  assert.deepEqual(cards[0].types, ['choice', 'blank']);
  assert.equal(cards[0].reviewed, true);
  assert.equal(cards[1].reviewed, false);
  assert.equal(cards[1].note, '거리, 제곱');
  assert.equal(stats.reviewed, 1);
});

test('오류: 중복 ID, 알 수 없는 유형·과목, 접두 불일치', () => {
  const csv = H +
    'M01,기초수학,a,b,없음,OK,없음,4지,M-x\n' +
    'M01,기초수학,a,b,없음,OK,없음,4지,M-x\n' +
    'S9-01,전기자기학,a,b,없음,OK,없음,4지,S1-x\n' +
    'S2-01,전기자기학,a,b,없음,OK,없음,주관식,S1-x\n' +
    'S3-01,없는과목,a,b,없음,OK,없음,4지,S3-x\n';
  const { errors, cards } = convertCards(csv);
  assert.equal(cards.length, 1);
  assert.ok(errors.some((e) => /중복/.test(e)));
  assert.ok(errors.some((e) => /카드ID 형식/.test(e)));
  assert.ok(errors.some((e) => /알 수 없는 문제유형/.test(e)));
  assert.ok(errors.some((e) => /알 수 없는 과목/.test(e)));
  assert.ok(errors.some((e) => /접두/.test(e)));
});

test('오류: 필수 열 없음', () => {
  const { errors } = convertCards('카드ID,과목\nM01,기초수학\n');
  assert.match(errors[0], /필수 열이 없습니다/);
});

test('경고: OK/대기 외 검수 값', () => {
  const csv = H + 'M01,기초수학,a,b,없음,수정,없음,4지,M-x\n';
  const { warnings, cards } = convertCards(csv);
  assert.equal(cards[0].reviewed, false);
  assert.match(warnings[0], /수정/);
});
