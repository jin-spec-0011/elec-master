// 시드 가능한 난수(mulberry32). 테스트에서는 고정 시드, 앱에서는 시간 기반 시드를 쓴다.
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 원본을 바꾸지 않고 섞는다(Fisher-Yates). */
export function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(items, rng) {
  if (!items.length) throw new RangeError('빈 목록에서 고를 수 없습니다.');
  return items[Math.floor(rng() * items.length)];
}
