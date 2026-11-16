// 화면 하단 알림(토스트). 스크린 리더에는 role=status 로 읽힌다.
import { h } from '../dom.js';

export function showToast(message, { kind = 'info', ms = 4500 } = {}) {
  let stack = document.getElementById('toasts');
  if (!stack) {
    stack = h('div', { id: 'toasts', class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.append(stack);
  }
  const node = h('div', { class: `toast is-${kind}` }, message);
  stack.append(node);
  setTimeout(() => node.remove(), ms);
  return node;
}
