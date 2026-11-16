// 계산 드릴: 템플릿(data/drills.json)에 난수 값을 넣어 문제를 만들고, 정답은 코드로 계산한다(AI 없음 → 오답 불가).
import { compile } from './expr.js';
import { pick, shuffle } from './rng.js';

export const DRILL_FILE = 'data/drills.json';

const compiled = new Map();
function fn(src) {
  let f = compiled.get(src);
  if (!f) {
    f = compile(src);
    compiled.set(src, f);
  }
  return f;
}

const plain = (x) => String(Number(x.toPrecision(12)));

/** 표시용 숫자(천 단위 구분, 소수 자릿수 고정 후 불필요한 0 제거). */
export function formatNumber(x, decimals = 2) {
  const d = Math.max(0, decimals);
  return Number(x.toFixed(d)).toLocaleString('en-US', { maximumFractionDigits: d, useGrouping: true });
}

function rangeValues({ min, max, step = 1 }) {
  const out = [];
  for (let v = min; v <= max + 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** 템플릿의 변수 값을 뽑는다: sets(묶음) → vars(독립 변수) → derive(파생 변수) 순. */
export function expandVars(t, rng) {
  const vars = {};
  if (Array.isArray(t.sets) && t.sets.length) Object.assign(vars, pick(t.sets, rng));
  for (const [name, spec] of Object.entries(t.vars ?? {})) {
    const values = Array.isArray(spec.values) ? spec.values : rangeValues(spec);
    vars[name] = pick(values, rng);
  }
  for (const [name, expr] of Object.entries(t.derive ?? {})) vars[name] = fn(expr)(vars);
  return vars;
}

export function evalAnswer(t, vars) {
  const raw = fn(t.answer)(vars);
  if (!Number.isFinite(raw)) throw new RangeError(`${t.id}: 정답이 유한한 수가 아닙니다.`);
  const decimals = t.decimals ?? 2;
  return Number(raw.toFixed(decimals));
}

function fill(text, values, id) {
  return String(text).replace(/\{(\w+)\}/g, (_m, name) => {
    if (!Object.hasOwn(values, name)) throw new RangeError(`${id}: 알 수 없는 자리표시 {${name}}`);
    return values[name];
  });
}

/**
 * 템플릿 하나로 문제를 만든다.
 * @returns {{ id: string, card: string, subject: string, title: string, stem: string, unit: string, decimals: number, tol: number, answer: number, solution: string, vars: object }}
 */
export function generateDrill(t, rng) {
  const vars = expandVars(t, rng);
  const decimals = t.decimals ?? 2;
  const answer = evalAnswer(t, vars);
  const shown = {};
  for (const [k, v] of Object.entries(vars)) shown[k] = plain(v);
  shown.answer = formatNumber(answer, decimals);
  return {
    id: t.id,
    card: t.card,
    subject: t.subject,
    title: t.title,
    stem: fill(t.stem, shown, t.id),
    unit: t.unit ?? '',
    decimals,
    tol: t.tol ?? 0.01,
    answer,
    solution: fill(t.solution, shown, t.id),
    vars,
  };
}

/** 사용자가 입력한 문자열을 숫자로. 형식이 틀리면 null. */
export function parseInput(raw) {
  const s = String(raw ?? '').trim().replace(/[,\s]/g, '').replace(/[−–]/g, '-');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/** 상대 오차(기본 1%) 또는 표시 자릿수의 반(half unit) 중 큰 쪽 이내면 정답. */
export function gradeNumeric(raw, expected, { tol = 0.01, decimals = 2 } = {}) {
  const value = parseInput(raw);
  if (value === null) return { ok: false, value: null };
  const allowed = Math.max(Math.abs(expected) * tol, 0.5 * 10 ** -decimals);
  return { ok: Math.abs(value - expected) <= allowed + 1e-12, value };
}

/**
 * 드릴 세션 문제를 만든다(같은 템플릿이 연속되지 않게 섞는다).
 * @param {object[]} templates
 * @param {{ subject?: string, size?: number, rng: () => number }} opts
 */
export function buildDrillQueue(templates, { subject, size = 10, rng }) {
  const pool = subject ? templates.filter((t) => t.subject === subject) : templates;
  if (pool.length === 0) return [];
  const out = [];
  let bag = [];
  let last = null;
  while (out.length < size) {
    if (bag.length === 0) {
      bag = shuffle(pool, rng);
      if (bag.length > 1 && bag[0].id === last) bag.push(bag.shift());
    }
    const t = bag.shift();
    last = t.id;
    out.push(generateDrill(t, rng));
  }
  return out;
}

/**
 * 숫자 키패드 입력 규칙(순수 함수). 키: 0-9, '.', '±', 'back'
 * - 최대 12자, 소수점은 한 번, 맨 앞 0 정리, '±'는 부호 전환
 */
export function applyKey(input, key) {
  const cur = String(input ?? '');
  if (key === 'back') return cur.slice(0, -1);
  if (key === '±') return cur.startsWith('-') ? cur.slice(1) : cur === '' ? '-' : `-${cur}`;
  if (cur.replace('-', '').length >= 12) return cur;
  if (key === '.') {
    if (cur.includes('.')) return cur;
    return cur === '' || cur === '-' ? `${cur}0.` : `${cur}.`;
  }
  if (!/^\d$/.test(key)) return cur;
  const sign = cur.startsWith('-') ? '-' : '';
  const body = cur.replace('-', '');
  if (body === '0') return `${sign}${key}`; // 0 뒤에 숫자는 0을 대체
  return `${sign}${body}${key}`;
}
