#!/usr/bin/env node
// 데이터 정합성 검증: freqmap / cards / quests / database.rules
// 사용: node tools/validate-data.mjs [--strict] [--dir .]
//   --strict : 검수 OK가 아닌 카드가 있으면 오류 처리 (P1 완료 판정용)
// 종료 코드: 0 = 오류 없음, 1 = 오류 있음
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const EXPECTED_UNITS = 62;
export const EXPECTED_TOTAL_QUESTIONS = 3361;
const SUBJECTS = ['S1', 'S2', 'S3', 'S4', 'S5'];
const COUNT_KEYS = ['2013-17', '2018-21', '2022-25'];

const result = () => ({ errors: [], warnings: [], info: [] });
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

/** @param {unknown} fm freqmap.json 파싱 결과 */
export function validateFreqmap(fm) {
  const r = result();
  if (!isObj(fm)) {
    r.errors.push('freqmap: 최상위가 객체가 아닙니다.');
    return r;
  }
  if (!isObj(fm.weights) || COUNT_KEYS.some((k) => typeof fm.weights[k] !== 'number')) {
    r.errors.push(`freqmap: weights에 ${COUNT_KEYS.join(', ')} 숫자 값이 필요합니다.`);
  } else if (COUNT_KEYS.map((k) => fm.weights[k]).join() !== '1,2,3') {
    r.warnings.push(`freqmap: 가중치가 1/2/3이 아닙니다(${COUNT_KEYS.map((k) => fm.weights[k]).join('/')}).`);
  }
  if (!isObj(fm.units)) {
    r.errors.push('freqmap: units 객체가 없습니다.');
    return r;
  }

  const ids = Object.keys(fm.units);
  if (ids.length !== EXPECTED_UNITS) r.errors.push(`freqmap: 단원 수 ${ids.length} (기대 ${EXPECTED_UNITS}).`);

  const shareBySubject = {};
  const countBySubject = {};
  let total = 0;
  for (const id of ids) {
    const u = fm.units[id];
    if (!/^S[1-5]-U\d{2}$/.test(id)) r.errors.push(`freqmap: 단원ID 형식 오류 ${id}`);
    if (!isObj(u)) {
      r.errors.push(`freqmap: ${id} 값이 객체가 아닙니다.`);
      continue;
    }
    if (u.subject !== id.split('-')[0]) r.errors.push(`freqmap: ${id}의 subject(${u.subject})가 ID 접두와 다릅니다.`);
    if (typeof u.name !== 'string' || u.name === '') r.errors.push(`freqmap: ${id} name이 비어 있습니다.`);
    if (typeof u.share !== 'number' || u.share < 0 || u.share > 100) r.errors.push(`freqmap: ${id} share가 0~100 숫자가 아닙니다(${u.share}).`);
    if (!isObj(u.counts) || COUNT_KEYS.some((k) => !Number.isInteger(u.counts[k]) || u.counts[k] < 0)) {
      r.errors.push(`freqmap: ${id} counts가 ${COUNT_KEYS.join('/')} 0 이상 정수가 아닙니다.`);
      continue;
    }
    const n = COUNT_KEYS.reduce((s, k) => s + u.counts[k], 0);
    total += n;
    shareBySubject[u.subject] = (shareBySubject[u.subject] ?? 0) + (u.share || 0);
    countBySubject[u.subject] = (countBySubject[u.subject] ?? 0) + n;
    if (u.subject === 'S5' && u.counts['2013-17'] !== 0) {
      r.warnings.push(`freqmap: ${id}(KEC)는 2021년 이후만 집계해야 하는데 2013-17 값이 ${u.counts['2013-17']}입니다.`);
    }
  }
  for (const s of SUBJECTS) {
    if (!(s in shareBySubject)) {
      r.errors.push(`freqmap: 과목 ${s} 단원이 없습니다.`);
      continue;
    }
    const sum = Math.round(shareBySubject[s] * 10) / 10;
    if (sum > 100.5) r.errors.push(`freqmap: ${s} share 합계가 100을 초과합니다(${sum}).`);
    else if (sum < 90) r.warnings.push(`freqmap: ${s} share 합계가 ${sum}%로 낮습니다('기타' 비중이 큰지 확인).`);
  }

  r.info.push(`freqmap: 단원 ${ids.length}개, 분류된 문항 ${total}개`);
  r.info.push(`  과목별 문항: ${SUBJECTS.map((s) => `${s} ${countBySubject[s] ?? 0}`).join(', ')}`);
  if (total > EXPECTED_TOTAL_QUESTIONS) {
    r.errors.push(`freqmap: 분류 합계 ${total}가 전체 문항 ${EXPECTED_TOTAL_QUESTIONS}를 초과합니다.`);
  } else {
    r.info.push(`  전체 ${EXPECTED_TOTAL_QUESTIONS} − 분류 ${total} = '기타' 추정 ${EXPECTED_TOTAL_QUESTIONS - total}문항 (사용자 확인 필요)`);
  }
  return r;
}

/**
 * @param {unknown} cardsDoc cards.json 파싱 결과
 * @param {{ strict?: boolean }} [opts]
 */
export function validateCards(cardsDoc, opts = {}) {
  const r = result();
  if (!isObj(cardsDoc) || !Array.isArray(cardsDoc.cards)) {
    r.errors.push('cards: { cards: [] } 구조가 아닙니다.');
    return r;
  }
  const cards = cardsDoc.cards;
  const ids = new Set();
  const concepts = new Map();
  let reviewed = 0;
  cards.forEach((c, i) => {
    const tag = `cards[${i}] ${c?.id ?? ''}`.trim();
    if (!isObj(c)) {
      r.errors.push(`cards: ${tag} 객체가 아닙니다.`);
      return;
    }
    for (const k of ['id', 'subject', 'front', 'back', 'concept', 'status']) {
      if (typeof c[k] !== 'string' || c[k] === '') r.errors.push(`cards: ${tag} ${k}가 비어 있습니다.`);
    }
    if (ids.has(c.id)) r.errors.push(`cards: 카드ID 중복 ${c.id}`);
    ids.add(c.id);
    if (!Array.isArray(c.types) || c.types.length === 0 || c.types.some((t) => !['choice', 'match', 'blank', 'calc'].includes(t))) {
      r.errors.push(`cards: ${tag} types가 올바르지 않습니다.`);
    }
    if (typeof c.reviewed !== 'boolean') r.errors.push(`cards: ${tag} reviewed가 boolean이 아닙니다.`);
    if (c.reviewed !== (c.status === 'OK')) r.errors.push(`cards: ${tag} reviewed와 status(${c.status})가 일치하지 않습니다.`);
    if (c.reviewed) reviewed += 1;
    if (typeof c.concept === 'string') concepts.set(c.concept, (concepts.get(c.concept) ?? 0) + 1);
  });
  if (cardsDoc.count !== cards.length) r.errors.push(`cards: count(${cardsDoc.count})와 실제 장수(${cards.length})가 다릅니다.`);
  if (cardsDoc.reviewed !== reviewed) r.errors.push(`cards: reviewed(${cardsDoc.reviewed})와 실제 검수 OK 수(${reviewed})가 다릅니다.`);

  r.info.push(`cards: ${cards.length}장, 검수 OK ${reviewed}장, 미검수 ${cards.length - reviewed}장, 개념ID ${concepts.size}종`);
  if (reviewed < cards.length) {
    const msg = `cards: 미검수 카드 ${cards.length - reviewed}장 (P1 완료 조건은 전부 검수 OK)`;
    (opts.strict ? r.errors : r.warnings).push(msg);
  }
  return r;
}

/**
 * @param {unknown} qDoc quests/ch1.json 파싱 결과
 * @param {unknown} [cardsDoc] cards.json 파싱 결과 (있으면 cards_correct 범위 지표를 교차 검증)
 */
export function validateQuests(qDoc, cardsDoc = null) {
  const r = result();
  if (!isObj(qDoc) || !Array.isArray(qDoc.quests)) {
    r.errors.push('quests: { quests: [] } 구조가 아닙니다.');
    return r;
  }
  const quests = qDoc.quests;
  const byId = new Map();
  for (const q of quests) {
    if (!isObj(q) || typeof q.id !== 'string') {
      r.errors.push('quests: id가 없는 항목이 있습니다.');
      continue;
    }
    if (byId.has(q.id)) r.errors.push(`quests: ID 중복 ${q.id}`);
    byId.set(q.id, q);
    if (!['main', 'daily', 'boss'].includes(q.type)) r.errors.push(`quests: ${q.id} type 오류(${q.type})`);
    if (!Number.isInteger(q.xp) || q.xp < 0) r.errors.push(`quests: ${q.id} xp가 0 이상 정수가 아닙니다(${q.xp}).`);
    if (typeof q.target !== 'number' || !Number.isFinite(q.target)) r.errors.push(`quests: ${q.id} target이 숫자가 아닙니다.`);
    if (typeof q.metric !== 'string' || q.metric === '') r.errors.push(`quests: ${q.id} metric이 비어 있습니다.`);
    if (!Array.isArray(q.prereq)) r.errors.push(`quests: ${q.id} prereq가 배열이 아닙니다.`);
  }
  if (qDoc.count !== quests.length) r.errors.push(`quests: count(${qDoc.count})와 실제 개수(${quests.length})가 다릅니다.`);

  // 선행 참조 존재·자기참조
  for (const q of quests) {
    for (const p of Array.isArray(q.prereq) ? q.prereq : []) {
      if (p === q.id) r.errors.push(`quests: ${q.id}가 자기 자신을 선행으로 가집니다.`);
      else if (!byId.has(p)) r.errors.push(`quests: ${q.id}의 선행 ${p}가 존재하지 않습니다.`);
    }
  }

  // 순환 검사 (DFS 3색)
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const p of byId.get(id)?.prereq ?? []) {
      if (!byId.has(p)) continue;
      if (state.get(p) === 1) {
        r.errors.push(`quests: 선행 순환 발견: ${[...stack.slice(stack.indexOf(p)), p].join(' → ')}`);
      } else if (!state.has(p)) {
        visit(p);
      }
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const id of byId.keys()) if (!state.has(id)) visit(id);

  // cards_correct:<시작ID>..<끝ID> 지표는 cards.json의 실제 카드 범위와 목표값을 대조한다.
  if (isObj(cardsDoc) && Array.isArray(cardsDoc.cards)) {
    const order = cardsDoc.cards.map((c) => c.id);
    for (const q of quests) {
      const m = typeof q.metric === 'string' ? q.metric.match(/^cards_correct:([^.]+)\.\.(.+)$/) : null;
      if (!m) continue;
      const a = order.indexOf(m[1]);
      const b = order.indexOf(m[2]);
      if (a < 0 || b < 0) r.errors.push(`quests: ${q.id} 지표의 카드ID가 cards.json에 없습니다(${m[1]}..${m[2]}).`);
      else if (a > b) r.errors.push(`quests: ${q.id} 지표의 카드 범위 순서가 거꾸로입니다(${m[1]}..${m[2]}).`);
      else if (q.target > b - a + 1) r.errors.push(`quests: ${q.id} 목표값 ${q.target}이 범위 카드 수 ${b - a + 1}보다 큽니다.`);
    }
  }

  const roots = quests.filter((q) => q.type !== 'daily' && (q.prereq?.length ?? 0) === 0);
  if (quests.length > 0 && roots.length === 0) r.errors.push('quests: 선행 없는 시작 퀘스트가 없습니다(해금 불가).');

  const byType = quests.reduce((a, q) => ({ ...a, [q.type]: (a[q.type] ?? 0) + 1 }), {});
  r.info.push(`quests: ${quests.length}개 (${Object.entries(byType).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  const metrics = new Map();
  quests.forEach((q) => metrics.set(q.metric, [...(metrics.get(q.metric) ?? []), q.id]));
  r.info.push('  판정 지표 목록 (P4 구현 대상):');
  [...metrics.entries()].forEach(([m, qs]) => r.info.push(`    - ${m}: ${qs.join(', ')}`));
  return r;
}

/** @param {unknown} rules database.rules.json 파싱 결과 (elec 블록만 담은 병합용 파일) */
export function validateRules(rules) {
  const r = result();
  const elec = rules?.rules?.elec;
  if (!isObj(elec)) {
    r.errors.push('rules: rules.elec 블록이 없습니다.');
    return r;
  }
  if (Object.keys(rules.rules).some((k) => k !== 'elec')) {
    r.errors.push('rules: 병합용 파일에는 elec 블록만 있어야 합니다(기존 GOGO 규칙과 섞이면 안 됨).');
  }
  for (const k of ['pool', 'meta']) {
    if (elec[k]?.['.write'] !== false) r.errors.push(`rules: elec.${k}.\".write\"는 false여야 합니다.`);
    if (elec[k]?.['.read'] !== 'auth != null') r.errors.push(`rules: elec.${k}.\".read\"는 "auth != null"이어야 합니다.`);
  }
  const u = elec.users?.$uid;
  if (u?.['.read'] !== 'auth != null && auth.uid === $uid') r.errors.push('rules: elec.users.$uid .read가 본인 한정이 아닙니다.');
  if (u?.['.write'] !== 'auth != null && auth.uid === $uid') r.errors.push('rules: elec.users.$uid .write가 본인 한정이 아닙니다.');
  r.info.push('rules: elec 블록 구조 확인 완료');
  return r;
}

function readJson(path, errors, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${label}: ${path}을(를) 읽거나 파싱할 수 없습니다 (${e.message})`);
    return null;
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      strict: { type: 'boolean', default: false },
      dir: { type: 'string', default: '.' },
    },
  });
  const all = result();
  const merge = (r) => {
    all.errors.push(...r.errors);
    all.warnings.push(...r.warnings);
    all.info.push(...r.info);
  };

  const targets = [
    ['freqmap', 'data/freqmap.json', (j) => validateFreqmap(j), true],
    ['cards', 'data/cards.json', (j) => validateCards(j, { strict: values.strict }), true],
    ['quests', 'data/quests/ch1.json', (j, ctx) => validateQuests(j, ctx.cards), false],
    ['rules', 'database.rules.json', (j) => validateRules(j), true],
  ];
  const ctx = { cards: null };
  for (const [label, rel, fn, required] of targets) {
    const path = join(values.dir, rel);
    if (!existsSync(path)) {
      (required ? all.errors : all.warnings).push(`${label}: ${rel} 파일이 아직 없습니다.`);
      continue;
    }
    const json = readJson(path, all.errors, label);
    if (json !== null) {
      if (label === 'cards') ctx.cards = json;
      merge(fn(json, ctx));
    }
  }

  console.log('== 정보 ==');
  all.info.forEach((l) => console.log(l));
  console.log(`\n== 경고 ${all.warnings.length}건 ==`);
  all.warnings.forEach((l) => console.log(` - ${l}`));
  console.log(`\n== 오류 ${all.errors.length}건 ==`);
  all.errors.forEach((l) => console.log(` - ${l}`));
  console.log(all.errors.length === 0 ? '\n결과: 통과' : '\n결과: 실패');
  process.exit(all.errors.length === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
