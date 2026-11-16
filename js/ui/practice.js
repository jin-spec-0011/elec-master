import { h, fill } from '../dom.js';
import { pageTitle, sectionTitle, notice, SUBJECT_LABEL } from './common.js';
import { buildQueue, summarize, NEW_PER_DAY, SESSION_SIZE } from '../srs.js';

export function render(container, app) {
  const { cards, cardsAll } = app.data;
  const { store } = app;
  const today = store.today();
  const states = store.cardStates();
  const doneToday = store.daily(today);
  const sum = summarize(cards, states, today);
  const q = buildQueue({ cards, states, today, newLimit: NEW_PER_DAY, newDoneToday: doneToday.newCards, size: SESSION_SIZE });

  const startBtn = (label, subject, primary = true) =>
    h('a', { class: `btn${primary ? '' : ' is-secondary'}`, href: `#/session${subject ? `?subject=${subject}` : ''}` }, label);

  const drillSubjects = new Set((app.data.drills ?? []).map((t) => t.subject));
  const tiles = Object.keys(SUBJECT_LABEL).map((code) => {
    const total = cardsAll.filter((c) => c.subject === code).length;
    const b = sum.bySubject[code] ?? { cards: 0, due: 0, fresh: 0, learning: 0, graduated: 0 };
    const sq = buildQueue({ cards, states, today, newLimit: NEW_PER_DAY, newDoneToday: doneToday.newCards, size: SESSION_SIZE, subject: code });
    const touched = b.learning + b.graduated;
    const drillStat = store.drillStats()[code];
    return h(
      'div',
      { class: 'card' },
      h('div', { class: 'row' }, h('p', { class: 'card-title' }, SUBJECT_LABEL[code]), h('span', { class: 'badge' }, `${b.cards}/${total}장 사용`)),
      h('div', { class: 'bar', role: 'img', 'aria-label': `학습 시작 ${touched}장, 사용 가능 ${b.cards}장` }, h('span', { style: `width:${b.cards ? Math.round((touched / b.cards) * 100) : 0}%` })),
      h('p', { class: 'card-sub', style: 'margin-top:8px' }, `복습 ${b.due} · 새 카드 ${b.fresh} · 졸업 ${b.graduated}${drillStat ? ` · 드릴 ${drillStat.correct}/${drillStat.total}` : ''}`),
      h('div', { class: 'mode-row' },
        sq.queue.length ? h('a', { class: 'btn is-secondary is-small', href: `#/session?subject=${code}` }, '카드') : null,
        sq.queue.length ? h('a', { class: 'btn is-secondary is-small', href: `#/quiz?subject=${code}` }, '문제') : null,
        drillSubjects.has(code) ? h('a', { class: 'btn is-secondary is-small', href: `#/drill?subject=${code}` }, '드릴') : null,
        !sq.queue.length && !drillSubjects.has(code) ? h('span', { class: 'card-sub' }, '대기 없음') : null),
    );
  });

  fill(
    container,
    pageTitle('연습'),
    app.data.dev ? null : notice(`검수 OK 카드만 사용됩니다(현재 ${cards.length}장). 개발 모드는 프로필에서 켤 수 있습니다.`),
    h('div', { class: 'card is-accent' },
      h('p', { class: 'card-title' }, q.queue.length ? `오늘의 복습 ${q.queue.length}장` : '오늘 복습할 카드가 없습니다'),
      h('p', { class: 'card-sub' }, `복습 예정 ${q.dueCount}장 · 새 카드 ${q.newAvailable}장(하루 최대 ${NEW_PER_DAY}장) · 오늘 복습 ${doneToday.reviewed}장`),
      h('div', { class: 'mode-row' },
        q.queue.length ? startBtn('카드 복습') : null,
        q.queue.length ? h('a', { class: 'btn is-secondary', href: '#/quiz' }, '문제 풀이') : null,
        h('a', { class: 'btn is-secondary', href: '#/drill' }, '계산 드릴')),
      h('p', { class: 'card-sub', style: 'margin-top:8px' }, `오늘 드릴 ${doneToday.drillCorrect}/${doneToday.drillTotal} 정답`),
    ),
    sectionTitle('과목별 카드'),
    tiles,
  );
}
