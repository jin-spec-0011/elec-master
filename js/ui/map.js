import { h, fill } from '../dom.js';
import { pageTitle, sectionTitle, notice, TYPE_LABEL } from './common.js';
import { summaryCard } from './progress-card.js';
import { showToast } from './toast.js';

const OFFSETS = [-56, 0, 56, 0];
const STATUS_LABEL = { done: '완료', skipped: '건너뜀', available: '도전 가능', locked: '잠김' };

export function render(container, app) {
  const { cards } = app.data;
  const rows = app.runner.model();
  const path = rows.filter((r) => r.quest.type !== 'daily');
  const dailies = rows.filter((r) => r.quest.type === 'daily');
  let selectedId = null;
  let confirmSkip = false;

  const detail = h('div', { id: 'quest-detail', 'aria-live': 'polite' });

  function drawDetail() {
    const row = rows.find((r) => r.quest.id === selectedId);
    if (!row) {
      detail.replaceChildren();
      return;
    }
    const q = row.quest;
    const isBoss = q.type === 'boss';
    detail.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'row' }, h('p', { class: 'card-title' }, `${q.id} · ${q.title}`), h('span', { class: 'badge' }, TYPE_LABEL[q.type] ?? q.type)),
        h('p', { class: 'card-sub' }, q.condition),
        h('div', { class: 'bar', style: 'margin-top:10px', role: 'img', 'aria-label': `진행 ${row.value}/${row.target}` }, h('span', { style: `width:${Math.round(row.ratio * 100)}%` })),
        h('dl', { class: 'kv', style: 'margin-top:10px' },
          h('dt', null, '진행'), h('dd', null, `${Math.min(row.value, row.target)} / ${row.target}`),
          h('dt', null, '보상'), h('dd', null, `${q.xp} XP${q.reward ? ` · ${q.reward}` : ''}`),
          h('dt', null, '선행'), h('dd', null, q.prereq.length ? q.prereq.join(', ') : '없음'),
          h('dt', null, '상태'), h('dd', null, STATUS_LABEL[row.status] ?? ''),
          row.fails ? [h('dt', null, '실패'), h('dd', null, `${row.fails}회`)] : null),
        h('div', { class: 'mode-row' },
          isBoss && (row.status === 'available' || row.status === 'done') ? h('a', { class: 'btn', href: '#/boss' }, row.status === 'done' ? '다시 도전' : '보스 도전') : null,
          row.canSkip && !confirmSkip ? h('button', { class: 'btn is-secondary', type: 'button', onclick: () => { confirmSkip = true; drawDetail(); } }, '건너뛰기') : null,
          row.canSkip && confirmSkip
            ? [h('button', { class: 'btn', type: 'button', onclick: () => {
                if (app.runner.skip(q.id)) showToast(`${q.title}을(를) 건너뛰었습니다(XP 없음).`);
                app.rerender();
              } }, '정말 건너뛰기'),
              h('button', { class: 'btn is-secondary', type: 'button', onclick: () => { confirmSkip = false; drawDetail(); } }, '취소')]
            : null),
        row.fails >= 3 && row.quest.type === 'main' && row.status === 'available' ? h('p', { class: 'card-sub', style: 'margin-top:8px' }, '3회 이상 틀려서 건너뛸 수 있습니다. 건너뛰면 XP는 없습니다.') : null),
    );
  }

  function select(id) {
    selectedId = selectedId === id ? null : id;
    confirmSkip = false;
    container.querySelectorAll('.node').forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.id === selectedId)));
    drawDetail();
  }

  const nodes = path.map((r, i) => {
    const q = r.quest;
    const cls = ['node', r.status === 'locked' ? 'is-locked' : '', r.status === 'done' ? 'is-done' : '', r.status === 'skipped' ? 'is-skipped' : '', q.type === 'boss' ? 'is-boss' : ''].filter(Boolean).join(' ');
    const face = r.status === 'done' ? '✓' : r.status === 'skipped' ? '»' : q.type === 'boss' ? '보스' : q.id.replace('Q1-', '');
    return h('div', { class: 'node-wrap', style: `--dx:${OFFSETS[i % OFFSETS.length]}px` },
      h('button', { class: cls, type: 'button', 'aria-pressed': 'false', 'aria-label': `${q.id} ${q.title}, ${STATUS_LABEL[r.status]}`, dataset: { id: q.id }, onclick: () => select(q.id) }, face),
      h('span', { class: 'node-label' }, q.title));
  });

  fill(container,
    pageTitle('1챕터 · 기초'),
    app.data.dev ? notice('개발 모드: 검수 전 카드까지 모두 사용합니다.') : null,
    summaryCard(app.store),
    h('p', { class: 'card-sub' }, `퀘스트 ${rows.length}개 · 사용 가능한 카드 ${cards.length}장 · 노드를 눌러 진행도를 확인하세요.`),
    h('div', { class: 'map-path' }, nodes),
    detail,
    sectionTitle('오늘의 일일 퀘스트'),
    dailies.map((r) => h('div', { class: 'card' },
      h('div', { class: 'row' }, h('p', { class: 'card-title' }, r.quest.title), h('span', { class: `badge${r.status === 'done' ? '' : ' is-accent'}` }, r.status === 'done' ? '오늘 완료 ✓' : `${r.quest.xp} XP`)),
      h('p', { class: 'card-sub' }, r.quest.condition),
      h('div', { class: 'bar', style: 'margin-top:8px' }, h('span', { style: `width:${r.status === 'done' ? 100 : Math.round(r.ratio * 100)}%` })),
      h('p', { class: 'card-sub', style: 'margin-top:4px' }, `${r.status === 'done' ? r.target : Math.min(r.value, r.target)} / ${r.target}`))),
  );
}
