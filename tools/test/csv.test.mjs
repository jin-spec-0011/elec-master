import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBuffer, parseCsv, csvToRecords, normalizeHeader, nullIfEmpty } from '../lib/csv.mjs';

test('parseCsv: 따옴표 안의 쉼표·줄바꿈·이중따옴표', () => {
  const { rows } = parseCsv('a,"b,c","d\ne","f""g"\r\n1,2,3,4\n');
  assert.deepEqual(rows, [['a', 'b,c', 'd\ne', 'f"g'], ['1', '2', '3', '4']]);
});

test('parseCsv: 닫히지 않은 따옴표는 오류', () => {
  assert.throws(() => parseCsv('a,"b\nc'), /닫히지 않았습니다/);
});

test('parseCsv: 마지막 줄 개행 없음', () => {
  assert.deepEqual(parseCsv('a,b\n1,2').rows, [['a', 'b'], ['1', '2']]);
});

test('decodeBuffer: UTF-8 BOM 제거', () => {
  const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('가나')]);
  assert.deepEqual(decodeBuffer(buf), { text: '가나', encoding: 'utf-8' });
});

test('decodeBuffer: CP949 폴백', () => {
  const buf = Buffer.from([0xb0, 0xa1]); // 가 (CP949)
  assert.deepEqual(decodeBuffer(buf), { text: '가', encoding: 'cp949' });
});

test('normalizeHeader: 괄호 설명과 공백 제거', () => {
  assert.equal(normalizeHeader('앞면 (개념)'), '앞면');
  assert.equal(normalizeHeader('완료 조건'), '완료조건');
});

test('csvToRecords: 필수 열 누락과 열 개수 불일치', () => {
  assert.throws(() => csvToRecords('a,b\n1,2', ['a', 'c']), /필수 열이 없습니다: c/);
  const { records, errors } = csvToRecords('a,b\n1,2\n3\n\n4,5', ['a', 'b']);
  assert.equal(records.length, 2);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /3행/);
});

test('nullIfEmpty', () => {
  assert.equal(nullIfEmpty('없음'), null);
  assert.equal(nullIfEmpty(' '), null);
  assert.equal(nullIfEmpty('[W]'), '[W]');
});
