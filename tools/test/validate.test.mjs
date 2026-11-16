import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFreqmap, validateCards, validateRules } from '../validate-data.mjs';

const load = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));

test('실제 freqmap.json 통과', () => {
  const r = validateFreqmap(load('data/freqmap.json'));
  assert.deepEqual(r.errors, []);
});

test('freqmap: 단원 누락과 음수 count 감지', () => {
  const fm = load('data/freqmap.json');
  delete fm.units['S1-U01'];
  fm.units['S1-U02'].counts['2013-17'] = -1;
  const r = validateFreqmap(fm);
  assert.ok(r.errors.some((e) => /단원 수/.test(e)));
  assert.ok(r.errors.some((e) => /S1-U02 counts/.test(e)));
});

test('실제 database.rules.json 통과, 쓰기 허용 시 실패', () => {
  const rules = load('database.rules.json');
  assert.deepEqual(validateRules(rules).errors, []);
  rules.rules.elec.pool['.write'] = 'auth != null';
  assert.ok(validateRules(rules).errors.some((e) => /pool/.test(e)));
});

test('cards: strict에서 미검수는 오류, 기본은 경고', () => {
  const doc = {
    count: 1, reviewed: 0,
    cards: [{ id: 'M01', subject: 'M', front: 'a', back: 'b', concept: 'M-x', status: '대기', reviewed: false, types: ['choice'] }],
  };
  assert.deepEqual(validateCards(doc).errors, []);
  assert.equal(validateCards(doc).warnings.length, 1);
  assert.equal(validateCards(doc, { strict: true }).errors.length, 1);
});
