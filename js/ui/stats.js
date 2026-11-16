import { h, fill } from '../dom.js';
import { pageTitle, sectionTitle, notice, SUBJECT_LABEL } from './common.js';

export function render(container, app) {
  const units = Object.entries(app.data.freqmap.units).map(([id, u]) => ({ id, ...u }));
  const subjects = ['S1', 'S2', 'S3', 'S4', 'S5'];

  const cards = subjects.map((code) => {
    const top = units.filter((u) => u.subject === code).sort((a, b) => b.share - a.share).slice(0, 5);
    const max = top[0]?.share || 1;
    return h(
      'div',
      { class: 'card' },
      h('p', { class: 'card-title' }, SUBJECT_LABEL[code]),
      top.map((u) =>
        h(
          'div',
          { style: 'margin-top:10px' },
          h('div', { class: 'row' }, h('span', null, u.name), h('span', { class: 'badge' }, `${u.share}%`)),
          h('div', { class: 'bar', role: 'img', 'aria-label': `${u.name} 출제비중 ${u.share}%` }, h('span', { style: `width:${Math.round((u.share / max) * 100)}%` })),
        ),
      ),
    );
  });

  fill(container,
    pageTitle('통계'),
    notice('기출 출제비중(과목 내 %, 상위 5개 단원). 내 학습 통계는 P4-2 이후 연결됩니다.'),
    sectionTitle('출처'),
    h('p', { class: 'card-sub' }, String(app.data.freqmap.source ?? '')),
    sectionTitle('과목별 빈출 단원'),
    cards,
  );
}
