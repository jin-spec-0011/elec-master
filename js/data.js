// 데이터 로딩·검증. DOM 비의존(테스트 가능). 경로는 모두 상대 경로(GitHub Pages 하위 경로 대응).
export const DATA_FILES = {
  cards: 'data/cards.json',
  quests: 'data/quests/ch1.json',
  freqmap: 'data/freqmap.json',
};

export class DataError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataError';
  }
}

export function validateCardsDoc(doc) {
  if (!doc || !Array.isArray(doc.cards)) throw new DataError('cards.json 형식이 올바르지 않습니다.');
  for (const c of doc.cards) {
    const ok = c && typeof c.id === 'string' && typeof c.front === 'string' && typeof c.back === 'string' && typeof c.reviewed === 'boolean' && typeof c.subject === 'string';
    if (!ok) throw new DataError(`카드 형식 오류: ${c?.id ?? '(id 없음)'}`);
  }
  return doc;
}

export function validateQuestsDoc(doc) {
  if (!doc || !Array.isArray(doc.quests)) throw new DataError('quests 형식이 올바르지 않습니다.');
  for (const q of doc.quests) {
    const ok = q && typeof q.id === 'string' && typeof q.title === 'string' && typeof q.type === 'string' && Number.isInteger(q.xp) && Array.isArray(q.prereq);
    if (!ok) throw new DataError(`퀘스트 형식 오류: ${q?.id ?? '(id 없음)'}`);
  }
  return doc;
}

export function validateFreqmapDoc(doc) {
  if (!doc || typeof doc.units !== 'object' || doc.units === null) throw new DataError('freqmap.json 형식이 올바르지 않습니다.');
  return doc;
}

/** 정식 모드는 검수 OK 카드만, 개발 모드(?dev=1)는 전체 카드를 쓴다. */
export function selectCards(cards, { dev = false } = {}) {
  return dev ? cards : cards.filter((c) => c.reviewed);
}

/**
 * 개발 모드 판정. ?dev=1 켜기, ?dev=0 끄기, 없으면 저장된 값. 저장소 접근 실패는 무시한다.
 * @param {string} search 예) "?dev=1"
 * @param {{ getItem(k: string): string | null, setItem(k: string, v: string): void, removeItem(k: string): void } | null} storage
 */
export function resolveDevMode(search, storage) {
  const param = new URLSearchParams(search ?? '').get('dev');
  try {
    if (param === '1') {
      storage?.setItem('elec.dev', '1');
      return true;
    }
    if (param === '0') {
      storage?.removeItem('elec.dev');
      return false;
    }
    return storage?.getItem('elec.dev') === '1';
  } catch {
    return param === '1';
  }
}

export async function fetchJson(url, fetchFn = globalThis.fetch) {
  let res;
  try {
    res = await fetchFn(url);
  } catch {
    throw new DataError(`${url}을(를) 불러오지 못했습니다. 네트워크를 확인하세요.`);
  }
  if (!res.ok) throw new DataError(`${url} 로드 실패 (HTTP ${res.status})`);
  try {
    return await res.json();
  } catch {
    throw new DataError(`${url}이(가) 올바른 JSON이 아닙니다.`);
  }
}

/**
 * 앱에 필요한 데이터를 모두 읽고 검증한다.
 * @returns {Promise<{ cardsAll: object[], cards: object[], quests: object[], freqmap: object, dev: boolean }>}
 */
export async function loadAll({ dev = false, fetchFn } = {}) {
  const [cardsDoc, questsDoc, freqmap] = await Promise.all([
    fetchJson(DATA_FILES.cards, fetchFn),
    fetchJson(DATA_FILES.quests, fetchFn),
    fetchJson(DATA_FILES.freqmap, fetchFn),
  ]);
  validateCardsDoc(cardsDoc);
  validateQuestsDoc(questsDoc);
  validateFreqmapDoc(freqmap);
  return {
    cardsAll: cardsDoc.cards,
    cards: selectCards(cardsDoc.cards, { dev }),
    quests: questsDoc.quests,
    freqmap,
    dev,
  };
}
