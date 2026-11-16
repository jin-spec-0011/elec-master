import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertQuests } from '../csv-to-quests.mjs';
import { validateQuests } from '../validate-data.mjs';

const H = '퀘스트ID,유형,제목,완료 조건,XP,보상,선행,판정 지표,목표값\n';

test('정상 변환', () => {
  const csv = H +
    'Q1-01,메인,시작,카드 5장 복습,50,칭호A,없음,cards_reviewed,5\n' +
    'Q1-02,메인,다음,정답 10개,"1,200 XP",없음,Q1-01,correct_count,10\n' +
    'D-01,일일,매일,오늘 복습,20,없음,없음,daily_reviews,3\n';
  const { quests, errors } = convertQuests(csv);
  assert.deepEqual(errors, []);
  assert.deepEqual(quests[1].prereq, ['Q1-01']);
  assert.equal(quests[1].xp, 1200);
  assert.equal(quests[0].reward, '칭호A');
  assert.equal(quests[2].type, 'daily');
});

test('오류: 유형·XP·목표값·선행 형식', () => {
  const csv = H + 'Q1-01,기타,t,c,abc,없음,zzz,m,x\n';
  const { errors, quests } = convertQuests(csv);
  assert.equal(quests.length, 0);
  assert.ok(errors.length >= 4);
});

const doc = (quests) => ({ count: quests.length, quests });
const q = (id, prereq = [], type = 'main') => ({ id, type, xp: 10, target: 1, metric: 'm', prereq });

test('validateQuests: 존재하지 않는 선행, 순환, 자기참조', () => {
  assert.ok(validateQuests(doc([q('Q1-01', ['Q1-09'])])).errors.some((e) => /존재하지 않습니다/.test(e)));
  assert.ok(validateQuests(doc([q('Q1-01', ['Q1-02']), q('Q1-02', ['Q1-01'])])).errors.some((e) => /순환/.test(e)));
  assert.ok(validateQuests(doc([q('Q1-01', ['Q1-01'])])).errors.some((e) => /자기 자신/.test(e)));
});

test('validateQuests: 정상 그래프와 지표 목록', () => {
  const r = validateQuests(doc([q('Q1-01'), q('Q1-02', ['Q1-01']), q('D-01', [], 'daily')]));
  assert.deepEqual(r.errors, []);
  assert.ok(r.info.some((l) => l.includes('- m: Q1-01, Q1-02, D-01')));
});
