import { h, fill } from '../dom.js';
import { pageTitle, sectionTitle, TYPE_LABEL } from './common.js';

export function render(container, app) {
  const { quests } = app.data;
  const group = (type) => quests.filter((q) => q.type === type);
  const item = (q) =>
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'row' }, h('p', { class: 'card-title' }, `${q.id} · ${q.title}`), h('span', { class: 'badge is-accent' }, `${q.xp} XP`)),
      h('p', { class: 'card-sub' }, q.condition),
      q.reward ? h('p', { class: 'card-sub' }, `보상: ${q.reward}`) : null,
    );

  const totalXp = quests.filter((q) => q.type !== 'daily').reduce((s, q) => s + q.xp, 0);
  fill(container,
    pageTitle('퀘스트'),
    h('p', { class: 'card-sub' }, `1챕터 메인·보스 XP 합계 ${totalXp} XP. 완료 여부는 데이터로 자동 판정됩니다(P4-4).`),
    ['daily', 'main', 'boss'].flatMap((t) => [sectionTitle(`${TYPE_LABEL[t]} 퀘스트 ${group(t).length}개`), group(t).map(item)]),
  );
}
