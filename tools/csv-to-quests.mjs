#!/usr/bin/env node
// 챕터 퀘스트 CSV → data/quests/ch1.json
// 사용: node tools/csv-to-quests.mjs [--in data/src/quests-ch1.csv] [--out data/quests/ch1.json] [--chapter 1]
// 열: 퀘스트ID, 유형, 제목, 완료 조건, XP, 보상, 선행, 판정 지표, 목표값
// 선행·순환 참조 같은 퀘스트 간 검사는 tools/validate-data.mjs 가 담당한다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { decodeBuffer, csvToRecords, nullIfEmpty } from './lib/csv.mjs';

const REQUIRED = ['퀘스트ID', '유형', '제목', '완료조건', 'XP', '보상', '선행', '판정지표', '목표값'];

/** CSV 유형 → 내부 코드 (대소문자 무시) */
export const QUEST_TYPES = {
  메인: 'main',
  main: 'main',
  일일: 'daily',
  데일리: 'daily',
  daily: 'daily',
  보스: 'boss',
  boss: 'boss',
};

const ID_PATTERN = /^(Q\d+-\d{2}|D-\d{2})$/;

/** "50", "50 XP", "1,200" → 숫자. 해석 불가면 null */
function parseNumber(raw) {
  const m = String(raw).replace(/,/g, '').trim().match(/^(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/**
 * @param {string} text CSV 본문
 * @returns {{ quests: object[], errors: string[], warnings: string[] }}
 */
export function convertQuests(text) {
  const errors = [];
  const warnings = [];
  let parsed;
  try {
    parsed = csvToRecords(text, REQUIRED);
  } catch (e) {
    return { quests: [], errors: [e.message], warnings };
  }
  errors.push(...parsed.errors);

  const quests = [];
  const seen = new Map();

  for (const { line, values: v } of parsed.records) {
    const id = v['퀘스트ID'];
    const tag = `${line}행 [${id || '퀘스트ID 없음'}]`;
    const problems = [];

    if (!ID_PATTERN.test(id)) problems.push('퀘스트ID 형식이 올바르지 않습니다(예: Q1-01, D-01).');
    if (seen.has(id)) problems.push(`퀘스트ID가 ${seen.get(id)}행과 중복됩니다.`);
    else if (id) seen.set(id, line);

    const type = QUEST_TYPES[v['유형'].toLowerCase()];
    if (!type) problems.push(`알 수 없는 유형: "${v['유형']}" (허용: ${[...new Set(Object.keys(QUEST_TYPES))].join(', ')})`);

    if (!v['제목']) problems.push('제목이 비어 있습니다.');
    if (!v['완료조건']) problems.push('완료 조건이 비어 있습니다.');

    const xp = parseNumber(v['XP']);
    if (xp === null || !Number.isInteger(xp) || xp < 0) problems.push(`XP는 0 이상의 정수여야 합니다: "${v['XP']}"`);

    const metric = nullIfEmpty(v['판정지표']);
    if (!metric) problems.push('판정 지표가 비어 있습니다(수동 완료 버튼이 없으므로 필수).');

    const target = parseNumber(v['목표값']);
    if (target === null) problems.push(`목표값을 숫자로 읽을 수 없습니다: "${v['목표값']}"`);
    else if (!/^-?[\d,]+(\.\d+)?$/.test(v['목표값'].trim())) {
      warnings.push(`${tag} 목표값 "${v['목표값']}"에서 숫자만 사용했습니다(${target}).`);
    }

    const prereqRaw = nullIfEmpty(v['선행']);
    const prereq = prereqRaw ? [...new Set(prereqRaw.split(/[\s,;·/]+/).filter(Boolean))] : [];
    const badPrereq = prereq.filter((p) => !ID_PATTERN.test(p));
    if (badPrereq.length > 0) problems.push(`선행 값 형식 오류: ${badPrereq.join(', ')}`);

    if (type && /^D-/.test(id) && type !== 'daily') warnings.push(`${tag} D- 접두 ID인데 유형이 ${type}입니다.`);
    if (type === 'daily' && id && !/^D-/.test(id)) warnings.push(`${tag} 일일 퀘스트인데 ID가 D-로 시작하지 않습니다.`);

    if (problems.length > 0) {
      problems.forEach((p) => errors.push(`${tag} ${p}`));
      continue;
    }

    quests.push({
      id,
      type,
      title: v['제목'],
      condition: v['완료조건'],
      xp,
      reward: nullIfEmpty(v['보상']),
      prereq,
      metric,
      target,
    });
  }
  return { quests, errors, warnings };
}

function main() {
  const { values } = parseArgs({
    options: {
      in: { type: 'string', default: 'data/src/quests-ch1.csv' },
      out: { type: 'string', default: 'data/quests/ch1.json' },
      chapter: { type: 'string', default: '1' },
    },
  });
  const chapter = Number(values.chapter);
  if (!Number.isInteger(chapter) || chapter < 1) {
    console.error(`--chapter는 1 이상의 정수여야 합니다: ${values.chapter}`);
    process.exit(1);
  }

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

  const { quests, errors, warnings } = convertQuests(decoded.text);
  warnings.forEach((w) => console.warn(`경고: ${w}`));
  if (errors.length > 0) {
    console.error(`변환 실패: 오류 ${errors.length}건 (파일은 쓰지 않았습니다)`);
    errors.forEach((e) => console.error(` - ${e}`));
    process.exit(1);
  }

  const output = {
    version: 1,
    chapter,
    source: values.in.replace(/\\/g, '/'),
    count: quests.length,
    quests,
  };
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  const byType = quests.reduce((acc, q) => ({ ...acc, [q.type]: (acc[q.type] ?? 0) + 1 }), {});
  console.log(`변환 완료: ${values.out}`);
  console.log(`  퀘스트 ${quests.length}개 (${Object.entries(byType).map(([k, n]) => `${k} ${n}`).join(', ')})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
