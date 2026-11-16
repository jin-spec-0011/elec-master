// 안전한 수식 계산기(eval 미사용). 숫자·변수·+ - * / ^ ( ) 와 함수(sqrt, abs, sin, cos, tan, atan, ln, log10)를 지원한다.
// 삼각함수는 "도(degree)" 단위. 상수 pi. 암묵적 곱셈(2x)은 지원하지 않는다.

export class ExprError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExprError';
  }
}

const RAD = Math.PI / 180;
const FUNCS = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: (x) => Math.sin(x * RAD),
  cos: (x) => Math.cos(x * RAD),
  tan: (x) => Math.tan(x * RAD),
  atan: (x) => Math.atan(x) / RAD,
  ln: Math.log,
  log10: Math.log10,
};
const CONSTS = { pi: Math.PI };

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/^(),]))/y;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) {
      if (src.slice(pos).trim() === '') break;
      throw new ExprError(`수식 해석 오류(${pos}번째 근처): ${src}`);
    }
    pos = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2] });
    else tokens.push({ t: 'op', v: m[3] });
  }
  return tokens;
}

/**
 * 수식을 한 번 파싱해 평가 함수로 만든다.
 * @param {string} src
 * @returns {(vars?: Record<string, number>) => number}
 */
export function compile(src) {
  if (typeof src !== 'string' || src.trim() === '') throw new ExprError('빈 수식입니다.');
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i];
  const eat = (v) => {
    const t = tokens[i];
    if (!t || t.t !== 'op' || t.v !== v) throw new ExprError(`'${v}'가 필요합니다: ${src}`);
    i += 1;
  };
  const isOp = (v) => tokens[i]?.t === 'op' && tokens[i].v === v;

  function parseExpr() {
    let left = parseTerm();
    while (isOp('+') || isOp('-')) {
      const op = tokens[i].v;
      i += 1;
      const l = left;
      const r = parseTerm();
      left = op === '+' ? (v) => l(v) + r(v) : (v) => l(v) - r(v);
    }
    return left;
  }
  function parseTerm() {
    let left = parseUnary();
    while (isOp('*') || isOp('/')) {
      const op = tokens[i].v;
      i += 1;
      const l = left;
      const r = parseUnary();
      left = op === '*' ? (v) => l(v) * r(v) : (v) => l(v) / r(v);
    }
    return left;
  }
  function parseUnary() {
    if (isOp('-')) {
      i += 1;
      const e = parseUnary();
      return (v) => -e(v);
    }
    if (isOp('+')) {
      i += 1;
      return parseUnary();
    }
    return parsePower();
  }
  function parsePower() {
    const base = parsePrimary();
    if (isOp('^')) {
      i += 1;
      const exp = parseUnary(); // 우결합, -x 지수 허용
      return (v) => base(v) ** exp(v);
    }
    return base;
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new ExprError(`수식이 끝났습니다: ${src}`);
    if (t.t === 'num') {
      i += 1;
      return () => t.v;
    }
    if (t.t === 'id') {
      i += 1;
      if (isOp('(')) {
        const fn = FUNCS[t.v];
        if (!fn) throw new ExprError(`알 수 없는 함수: ${t.v}`);
        i += 1;
        const arg = parseExpr();
        eat(')');
        return (v) => fn(arg(v));
      }
      if (Object.hasOwn(CONSTS, t.v)) return () => CONSTS[t.v];
      const name = t.v;
      return (v) => {
        if (!v || !Object.hasOwn(v, name)) throw new ExprError(`변수 ${name} 값이 없습니다.`);
        return v[name];
      };
    }
    if (t.t === 'op' && t.v === '(') {
      i += 1;
      const e = parseExpr();
      eat(')');
      return e;
    }
    throw new ExprError(`예상하지 못한 토큰 '${t.v}': ${src}`);
  }

  const fn = parseExpr();
  if (i < tokens.length) throw new ExprError(`수식 끝에 남은 토큰 '${tokens[i].v}': ${src}`);
  return fn;
}

export function evaluate(src, vars = {}) {
  return compile(src)(vars);
}
