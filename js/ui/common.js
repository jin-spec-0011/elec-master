import { h } from '../dom.js';

export const SUBJECT_LABEL = {
  M: '기초수학',
  S1: '전기자기학',
  S2: '전력공학',
  S3: '전기기기',
  S4: '회로이론·제어',
  S5: '전기설비기술기준(KEC)',
};

export const TYPE_LABEL = { main: '메인', daily: '일일', boss: '보스' };

export const pageTitle = (text) => h('h2', { class: 'page-title' }, text);
export const sectionTitle = (text) => h('h3', { class: 'section-title' }, text);
export const notice = (...children) => h('div', { class: 'notice', role: 'note' }, ...children);

export function errorCard(message, onRetry) {
  return h(
    'div',
    { class: 'card is-error', role: 'alert' },
    h('p', { class: 'card-title' }, '문제가 발생했습니다'),
    h('p', { class: 'card-sub' }, message),
    onRetry ? h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: onRetry }, '다시 시도')) : null,
  );
}
