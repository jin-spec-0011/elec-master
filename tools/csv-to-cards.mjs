#!/usr/bin/env node
// 공식카드 CSV → data/cards.json
// 사용: node tools/csv-to-cards.mjs [--in data/src/cards.csv] [--out data/cards.json]
// 검수가 "OK"인 카드만 reviewed:true 로 표시한다. 앱은 reviewed:true 카드만 사용한다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeBuffer, csvToRecords, nullIfEmpty } from './lib/csv.mjs';

const REQUIRED = ['카드ID', '과목', '앞면', '뒷면', '단위', '검수', '비고', '문제유형', '개념ID'];

/** CSV 과목명 → 과목 코드 (freqmap의 S1~S5와 맞춤, M은 기초수학) */
export const SUBJECT_CODES = {
  기초수학: 'M',
  전기자기학: 'S1',
  전력공학: 'S2',
  전기기기: 'S3',
  '회로·제어': 'S4',
  회로이론및제어공학: 'S4',
  KEC: 'S5',
  전기설비기술기준: 'S5',
  '전기설비기술기준(KEC)': 'S5',
};

/** CSV 문제유형 → 앱 내부 코드 */
export const TYPE_CODES = { '4지': 'choice', 매칭: 'match', 빈칸: 'blank', 계산: 'calc' };

const ID_PATTERN = /^(M\d{2}|S[1-5]-\d{2})$/;

/**
 * @param {string} text CSV 본문
 * @returns {{ cards: object[], errors: string[], warnings: string[], stats: object|null }}
 */
export function convertCards(text) {
  const errors = [];
  const warnings = [];
  let parsed;
  try {
    parsed = csvToRecords(text, REQUIRED);
  } catch (e) {
    return { cards: [], errors: [e.message], warnings, stats: null };
  }
  errors.push(...parsed.errors);

  const cards = [];
  const seen = new Map();
  const statusCount = {};

  for (const { line, values: v } of parsed.records) {
    const id = v['카드ID'];
    const tag = `${line}행 [${id || '카드ID 없음'}]`;
    const problems = [];

    if (!ID_PATTERN.test(id)) problems.push('카드ID 형식이 올바르지 않습니다(예: M01, S1-01).');
    if (seen.has(id)) problems.push(`카드ID가 ${seen.get(id)}행과 중복됩니다.`);
    else if (id) seen.set(id, line);

    const subject = SUBJECT_CODES[v['과목']];
    if (!subject) problems.push(`알 수 없는 과목: "${v['과목']}"`);
    else if (ID_PATTERN.test(id)) {
      const prefix = id.startsWith('M') ? 'M' : id.split('-')[0];
      if (prefix !== subject) problems.push(`카드ID 접두(${prefix})와 과목(${v['과목']}→${subject})이 다릅니다.`);
    }

    const front = v['앞면'];
    const back = v['뒷면'];
    if (!front) problems.push('앞면이 비어 있습니다.');
    if (!back) problems.push('뒷면이 비어 있습니다.');

    const status = v['검수'];
    if (!status) problems.push('검수 열이 비어 있습니다.');
    else statusCount[status] = (statusCount[status] ?? 0) + 1;

    const typeTokens = v['문제유형'].split(/[·,/]/).map((t) => t.trim()).filter(Boolean);
    const types = [];
    if (typeTokens.length === 0) problems.push('문제유형이 비어 있습니다.');
    for (const t of typeTokens) {
      const code = TYPE_CODES[t];
      if (!code) problems.push(`알 수 없는 문제유형: "${t}" (허용: ${Object.keys(TYPE_CODES).join(', ')})`);
      else if (!types.includes(code)) types.push(code);
    }

    const concept = v['개념ID'];
    if (!concept) problems.push('개념ID가 비어 있습니다.');
    else if (subject) {
      const conceptPrefix = concept.split('-')[0];
      if (conceptPrefix !== subject) problems.push(`개념ID 접두(${conceptPrefix})가 과목 코드(${subject})와 다릅니다.`);
    }

    if (problems.length > 0) {
      problems.forEach((p) => errors.push(`${tag} ${p}`));
      continue;
    }

    cards.push({
      id,
      subject,
      subjectName: v['과목'],
      front,
      back,
      unit: nullIfEmpty(v['단위']),
      note: nullIfEmpty(v['비고']),
      types,
      concept,
      status,
      reviewed: status === 'OK',
    });
  }

  const extraStatuses = Object.keys(statusCount).filter((s) => s !== 'OK' && s !== '대기');
  if (extraStatuses.length > 0) {
    warnings.push(`"OK"/"대기" 외 검수 값이 있습니다(미검수로 처리): ${extraStatuses.join(', ')}`);
  }

  const bySubject = {};
  cards.forEach((c) => {
    bySubject[c.subject] = (bySubject[c.subject] ?? 0) + 1;
  });
  const stats = {
    total: cards.length,
    reviewed: cards.filter((c) => c.reviewed).length,
    bySubject,
    statusCount,
  };
  return { cards, errors, warnings, stats };
}

function main() {
  const { values } = parseArgs({
    options: {
      in: { type: 'string', default: 'data/src/cards.csv' },
      out: { type: 'string', default: 'data/cards.json' },
    },
  });

  let buffer;
  try {
    buffer = readFileSync(values.in);
  } catch (e) {
    console.error(`입력 파일을 읽을 수 없습니다: ${values.in} (${e.code ?? e.message})`);
    process.exit(1);
  }

  let decoded;
  try {
    decoded = decodeBuffer(buffer);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  if (decoded.encoding !== 'utf-8') {
    console.warn(`경고: ${values.in}이 UTF-8이 아니라 ${decoded.encoding}로 해석되었습니다. "CSV UTF-8"로 다시 저장하세요.`);
  }

  const { cards, errors, warnings, stats } = convertCards(decoded.text);
  warnings.forEach((w) => console.warn(`경고: ${w}`));
  if (errors.length > 0) {
    console.error(`변환 실패: 오류 ${errors.length}건 (파일은 쓰지 않았습니다)`);
    errors.forEach((e) => console.error(` - ${e}`));
    process.exit(1);
  }

  const output = {
    version: 1,
    source: values.in.replace(/\\/g, '/'),
    count: stats.total,
    reviewed: stats.reviewed,
    cards,
  };
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`변환 완료: ${values.out}`);
  console.log(`  전체 ${stats.total}장 / 검수 OK ${stats.reviewed}장 / 미검수 ${stats.total - stats.reviewed}장`);
  console.log(`  과목별: ${Object.entries(stats.bySubject).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
