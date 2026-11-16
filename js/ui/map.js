import { h, clear, fill } from '../dom.js';
import { computeAvailability } from '../quests.js';
import { pageTitle, sectionTitle, notice, TYPE_LABEL } from './common.js';

const OFFSETS = [-56, 0, 56, 0];
const STATUS_LABEL = { done: '완료', available: '도전 가능', locked: '잠김' };

export function render(container, app) {
  const { quests, cards } = app.data;
  const availability = computeAvailability(quests); // 진행 기록 연동은 P4-4
  const path = quests.filter((q) => q.type !== 'daily');
  const dailies = quests.filter((q) => q.type === 'daily');
  let selectedId = null;

  const detail = h('div', { id: 'quest-detail', 'aria-live': 'polite' });

  function showDetail() {
    clear(detail);
    const q = quests.find((x) => x.id === selectedId);
    if (!q) return;
    detail.append(
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'row' }, h('p', { class: 'card-title' }, `${q.id} · ${q.title}`), h('span', { class: 'badge' }, TYPE_LABEL[q.type] ?? q.type)),
        h('p', { class: 'card-sub' }, q.condition),
        h(
          'dl',
          { class: 'kv', style: 'margin-top:10px' },
          h('dt', null, '보상 XP'), h('dd', null, `${q.xp} XP`),
          h('dt', null, '추가 보상'), h('dd', null, q.reward ?? '없음'),
          h('dt', null, '선행'), h('dd', null, q.prereq.length ? q.prereq.join(', ') : '없음'),
          h('dt', null, '상태'), h('dd', null, STATUS_LABEL[availability.get(q.id)] ?? ''),
        ),
        h('p', { class: 'card-sub', style: 'margin-top:10px' }, '퀘스트 진행·판정은 P4-4에서 활성화됩니다.'),
      ),
    );
  }

  function select(id) {
    selectedId = selectedId === id ? null : id;
    container.querySelectorAll('.node').forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.id === selectedId)));
    showDetail();
  }

  const nodes = path.map((q, i) => {
    const state = availability.get(q.id);
    const cls = ['node', state === 'locked' ? 'is-locked' : '', state === 'done' ? 'is-done' : '', q.type === 'boss' ? 'is-boss' : ''].filter(Boolean).join(' ');
    return h(
      'div',
      { class: 'node-wrap', style: `--dx:${OFFSETS[i % OFFSETS.length]}px` },
      h('button', { class: cls, type: 'button', 'aria-pressed': 'false', 'aria-label': `${q.id} ${q.title}, ${STATUS_LABEL[state]}`, dataset: { id: q.id }, onclick: () => select(q.id) }, q.type === 'boss' ? '보스' : q.id.replace('Q1-', '')),
      h('span', { class: 'node-label' }, q.title),
    );
  });

  fill(container,
    pageTitle('1챕터 · 기초'),
    app.data.dev ? notice('개발 모드: 검수 전 카드까지 모두 사용합니다.') : null,
    h('div', { class: 'card is-accent' }, h('p', { class: 'card-title' }, `퀘스트 ${quests.length}개 · 사용 가능한 카드 ${cards.length}장`), h('p', { class: 'card-sub' }, '노드를 눌러 조건을 확인하세요.')),
    h('div', { class: 'map-path' }, nodes),
    detail,
    sectionTitle('오늘의 일일 퀘스트'),
    dailies.map((q) => h('div', { class: 'card' }, h('div', { class: 'row' }, h('p', { class: 'card-title' }, q.title), h('span', { class: 'badge is-accent' }, `${q.xp} XP`)), h('p', { class: 'card-sub' }, q.condition))),
  );
}
