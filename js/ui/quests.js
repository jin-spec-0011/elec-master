import { h, fill } from '../dom.js';
import { pageTitle, sectionTitle, TYPE_LABEL } from './common.js';

const STATUS_LABEL = { done: '완료', skipped: '건너뜀', available: '진행 중', locked: '잠김' };

export function render(container, app) {
  const rows = app.runner.model();
  const group = (type) => rows.filter((r) => r.quest.type === type);

  const item = (r) => {
    const q = r.quest;
    const shown = r.status === 'done' ? r.target : Math.min(r.value, r.target);
    return h('div', { class: `card${r.status === 'locked' ? ' is-locked' : ''}` },
      h('div', { class: 'row' },
        h('p', { class: 'card-title' }, `${q.id} · ${q.title}`),
        h('span', { class: `badge${r.status === 'done' ? '' : ' is-accent'}` }, `${STATUS_LABEL[r.status]} · ${q.xp} XP`)),
      h('p', { class: 'card-sub' }, q.condition),
      r.status !== 'locked'
        ? [h('div', { class: 'bar', style: 'margin-top:8px', role: 'img', 'aria-label': `진행 ${shown}/${r.target}` }, h('span', { style: `width:${r.status === 'done' ? 100 : Math.round(r.ratio * 100)}%` })),
           h('p', { class: 'card-sub', style: 'margin-top:4px' }, `${shown} / ${r.target}${r.fails ? ` · 실패 ${r.fails}회` : ''}`)]
        : h('p', { class: 'card-sub' }, `선행: ${q.prereq.join(', ')}`),
      q.reward ? h('p', { class: 'card-sub' }, `보상: ${q.reward}`) : null);
  };

  const mainBoss = rows.filter((r) => r.quest.type !== 'daily');
  const doneCount = mainBoss.filter((r) => r.status === 'done' || r.status === 'skipped').length;
  fill(container,
    pageTitle('퀘스트'),
    h('p', { class: 'card-sub' }, `1챕터 ${doneCount}/${mainBoss.length} 완료. 완료 여부는 학습 기록으로 자동 판정됩니다.`),
    ['daily', 'main', 'boss'].flatMap((t) => [sectionTitle(`${TYPE_LABEL[t]} 퀘스트 ${group(t).length}개`), group(t).map(item)]),
  );
}
