import { TABS, DEFAULT_TAB } from './tabs.js';

/**
 * location.hash → 탭 ID. 알 수 없는 값은 기본 탭으로 되돌린다.
 * 해시 라우팅이라 GitHub Pages에서 새로고침·딥링크가 404가 나지 않는다.
 * @param {string} hash 예) "#/quests"
 * @returns {string}
 */
export function parseRoute(hash) {
  const m = String(hash ?? '').match(/^#\/?([a-z]+)/);
  const id = m ? m[1] : '';
  return TABS.some((t) => t.id === id) ? id : DEFAULT_TAB;
}

/**
 * 해시 변경을 구독한다. 시작 시 한 번 즉시 호출된다.
 * @param {(tabId: string) => void} onRoute
 * @param {Window} [win]
 * @returns {() => void} 구독 해제 함수
 */
export function startRouter(onRoute, win = window) {
  const handler = () => onRoute(parseRoute(win.location.hash));
  win.addEventListener('hashchange', handler);
  handler();
  return () => win.removeEventListener('hashchange', handler);
}
