import { TABS, DEFAULT_TAB } from './tabs.js';

/**
 * location.hash 해석. 탭 5개와 전체 화면 "session"(복습 세션)을 지원한다.
 * 알 수 없는 값은 기본 탭으로 되돌린다. 해시 라우팅이라 GitHub Pages에서 새로고침·딥링크가 404가 나지 않는다.
 * @param {string} hash 예) "#/quests", "#/session?subject=S1"
 * @returns {{ id: string, tab: string, params: Record<string, string> }} id는 화면, tab은 강조할 탭
 */
export function parseLocation(hash) {
  const m = String(hash ?? '').match(/^#\/?([a-z]+)(?:\?(.*))?$/);
  const id = m ? m[1] : '';
  if (id === 'session') return { id: 'session', tab: 'practice', params: Object.fromEntries(new URLSearchParams(m[2] ?? '')) };
  const tab = TABS.some((t) => t.id === id) ? id : DEFAULT_TAB;
  return { id: tab, tab, params: {} };
}

/** 탭 ID만 필요할 때(세션 화면은 연습 탭으로 취급). */
export function parseRoute(hash) {
  return parseLocation(hash).tab;
}

/**
 * 해시 변경을 구독한다. 시작 시 한 번 즉시 호출된다.
 * @param {(loc: { id: string, tab: string, params: Record<string, string> }) => void} onRoute
 * @param {Window} [win]
 * @returns {() => void} 구독 해제 함수
 */
export function startRouter(onRoute, win = window) {
  const handler = () => onRoute(parseLocation(win.location.hash));
  win.addEventListener('hashchange', handler);
  handler();
  return () => win.removeEventListener('hashchange', handler);
}
