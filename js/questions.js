// 공식카드 → 객관식 문제 자동 생성(4지 선택 / 2×2 매칭 / 공식 빈칸). DOM 비의존.
// 정답은 카드의 뒷면(공식)이고, 오답 보기는 다른 카드의 뒷면·토큰에서 뽑는다. AI 호출 없음.
import { pick, shuffle } from './rng.js';

export const QUESTION_KINDS = ['choice', 'match', 'blank'];
export const BLANK_MARK = '＿＿＿';
const MAX_BLANK_LEN = 60;

export const normText = (s) => String(s ?? '').replace(/\s+/g, '').normalize('NFC');

const OPERATOR_ONLY = /^[=+\-−×·/÷≈∝∠()[\]{},.:;%]+$/u;
const OPERATORS = new Set(['=', '/', '×', '·', '+', '−', '-', '÷', '≈', '∝']);
const isCandidateToken = (t) => /[\p{L}\p{N}]/u.test(t) && !OPERATOR_ONLY.test(t);

const count = (t, ch) => t.split(ch).length - 1;
/** 괄호가 짝이 맞지 않는 조각(예: "|A₁||A₂|∠(θ₁")은 보기로 부적절하다. */
const isBalanced = (t) => count(t, '(') === count(t, ')') && count(t, '[') === count(t, ']') && !/[:,]$/.test(t);

/**
 * 빈칸·오답 보기로 쓸 "피연산자" 토큰의 위치: 연산자(= / × + − 등) 옆에 있고 괄호가 짝이 맞는 토큰.
 * 설명문 속 어절("나누고", "각은")이 오답 보기로 나오는 것을 막는다.
 */
export function operandIndices(back) {
  const parts = backTokens(back);
  const out = [];
  parts.forEach((t, i) => {
    if (!isCandidateToken(t) || !isBalanced(t)) return;
    const nearOp = (i > 0 && OPERATORS.has(parts[i - 1])) || (i < parts.length - 1 && OPERATORS.has(parts[i + 1]));
    if (nearOp) out.push(i);
  });
  return out;
}

/** 토큰 종류: num(숫자 포함) / ko(한글만) / sym(기호·문자) */
export function tokenClass(t) {
  if (/\d/.test(t)) return 'num';
  if (/^[\p{Script=Hangul}]+$/u.test(t)) return 'ko';
  return 'sym';
}

export function backTokens(back) {
  return String(back).split(/\s+/).filter(Boolean);
}

/** 빈칸 문제로 만들 수 있는 카드인지: 짧은 공식이고 연산자 옆 숫자·기호 토큰이 1개 이상. */
export function isBlankable(card) {
  const back = String(card.back ?? '');
  if (back.length > MAX_BLANK_LEN) return false;
  const parts = backTokens(back);
  return operandIndices(back).some((i) => tokenClass(parts[i]) !== 'ko');
}

function take3(sorted, rng) {
  // 상위 후보 8개 중 3개를 무작위로 골라 매번 다른 오답이 나오게 한다.
  return shuffle(sorted.slice(0, 8), rng).slice(0, 3);
}

const lenGap = (a, b) => Math.abs(String(a).length - String(b).length);

function finish(base, correct, distractors, rng) {
  const options = shuffle([correct, ...distractors], rng);
  return { ...base, choices: options, answerIndex: options.indexOf(correct) };
}

/** 4지 선택(list) / 2×2 매칭(grid): 정답은 이 카드의 뒷면, 오답은 다른 카드의 뒷면. */
export function buildChoiceQuestion(card, pool, rng, kind = 'choice') {
  const seen = new Set([normText(card.back)]);
  const candidates = [];
  for (const c of pool) {
    if (c.id === card.id) continue;
    const key = normText(c.back);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(c);
  }
  if (candidates.length < 3) return null;
  candidates.sort((a, b) => {
    const sa = a.subject === card.subject ? 0 : 1;
    const sb = b.subject === card.subject ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return lenGap(a.back, card.back) - lenGap(b.back, card.back);
  });
  const picked = take3(candidates, rng).map((c) => c.back);
  return finish(
    {
      kind,
      layout: kind === 'match' ? 'grid' : 'list',
      cardId: card.id,
      subject: card.subject,
      prompt: kind === 'match' ? `「${card.front}」와 짝이 맞는 것은?` : `「${card.front}」에 해당하는 공식·값은?`,
      display: null,
      explain: card.back,
    },
    card.back,
    picked,
    rng,
  );
}

/**
 * 공식 빈칸: 뒷면의 숫자·기호 토큰 하나를 가리고, 다른 카드의 같은 종류 토큰을 오답으로 쓴다.
 * 한글 낱말(대변·합 등)은 오답 보기로 쓸 만한 후보가 부족해 빈칸으로 만들지 않는다(4지 선택으로 대체).
 */
export function buildBlankQuestion(card, pool, rng) {
  if (!isBlankable(card)) return null;
  const parts = backTokens(card.back);
  const own = new Set(parts.map(normText));
  const indices = shuffle(operandIndices(card.back).filter((i) => tokenClass(parts[i]) !== 'ko'), rng);

  for (const blankIdx of indices) {
    const answer = parts[blankIdx];
    const cls = tokenClass(answer);
    const seen = new Set([normText(answer)]);
    const cands = [];
    for (const c of pool) {
      if (c.id === card.id) continue;
      const ctoks = backTokens(c.back);
      for (const ci of operandIndices(c.back)) {
        const t = ctoks[ci];
        const key = normText(t);
        if (seen.has(key) || own.has(key) || tokenClass(t) !== cls) continue;
        seen.add(key);
        cands.push({ t, same: c.subject === card.subject ? 0 : 1 });
      }
    }
    if (cands.length < 3) continue;
    cands.sort((a, b) => a.same - b.same || lenGap(a.t, answer) - lenGap(b.t, answer));
    const picked = take3(cands, rng).map((x) => x.t);
    const display = parts.map((t, i) => (i === blankIdx ? BLANK_MARK : t)).join(' ');
    return finish(
      { kind: 'blank', layout: 'list', cardId: card.id, subject: card.subject, prompt: `「${card.front}」 — 빈칸에 들어갈 것은?`, display, explain: card.back },
      answer,
      picked,
      rng,
    );
  }
  return null;
}

/** 카드가 지원하는 객관식 유형(기본 choice). 계산·매칭 전용 카드도 choice로 대체한다. */
export function kindsFor(card) {
  const map = { choice: 'choice', match: 'match', blank: 'blank' };
  const kinds = (card.types ?? []).map((t) => map[t]).filter(Boolean);
  return kinds.length ? kinds : ['choice'];
}

/**
 * 카드 하나의 문제를 만든다. 선호 유형이 안 되면 다른 유형으로 대체하고, 모두 안 되면 null.
 * 오답 풀이 4장 미만이면 null.
 */
export function buildQuestion(card, pool, rng) {
  const order = shuffle([...new Set([...kindsFor(card), 'choice'])], rng);
  for (const kind of order) {
    const q = kind === 'blank' ? buildBlankQuestion(card, pool, rng) : buildChoiceQuestion(card, pool, rng, kind);
    if (q) return q;
  }
  return null;
}

/** 보기가 4개이고 서로 다르며 정답 인덱스가 맞는지 검사(생성 결과 자체 점검용). */
export function isValidQuestion(q) {
  if (!q || !Array.isArray(q.choices) || q.choices.length !== 4) return false;
  if (new Set(q.choices.map(normText)).size !== 4) return false;
  return Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4;
}
