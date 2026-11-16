import { h, fill } from '../dom.js';
import { pageTitle, sectionTitle, notice, SUBJECT_LABEL } from './common.js';

export function render(container, app) {
  const { cardsAll, cards } = app.data;
  const usable = new Set(cards.map((c) => c.id));
  const subjects = Object.keys(SUBJECT_LABEL);

  const tiles = subjects.map((code) => {
    const total = cardsAll.filter((c) => c.subject === code).length;
    const ready = cardsAll.filter((c) => c.subject === code && usable.has(c.id)).length;
    return h(
      'div',
      { class: 'card' },
      h('div', { class: 'row' }, h('p', { class: 'card-title' }, SUBJECT_LABEL[code]), h('span', { class: 'badge' }, `${ready}/${total}장`)),
      h('div', { class: 'bar', role: 'img', 'aria-label': `사용 가능 ${ready}장, 전체 ${total}장` }, h('span', { style: `width:${total ? Math.round((ready / total) * 100) : 0}%` })),
    );
  });

  fill(container,
    pageTitle('연습'),
    notice('공식카드 복습과 계산 드릴은 P4-2·P4-3에서 열립니다. 아래는 과목별 사용 가능한 카드 현황입니다.'),
    app.data.dev ? null : notice(`검수 OK 카드만 표시됩니다(현재 ${cards.length}장). 개발 모드는 주소 끝에 ?dev=1 을 붙이세요.`),
    sectionTitle('과목별 카드'),
    tiles,
  );
}
