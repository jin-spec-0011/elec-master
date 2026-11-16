// 학습 화면 공용 부품: 상단 진행 바, 틀린 이유 선택, 하단 결과 시트.
import { h } from '../dom.js';
import { WRONG_REASONS } from '../srs.js';

export function topBar({ total, done, onExit }) {
  return h('div', { class: 'session-top' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '학습 종료', onclick: onExit }, '✕'),
    h('div', { class: 'bar is-lg', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) },
      h('span', { style: `width:${total ? Math.round((done / total) * 100) : 0}%` })),
  );
}

/**
 * 틀린 이유 4분류(2×2). 같은 이유를 다시 누르면 선택이 해제된다.
 * @param {{ onChange: (previous: string | null, next: string | null) => void }} opts
 */
export function reasonPicker({ onChange }) {
  let chosen = null;
  const box = h('div', { class: 'reasons', role: 'group', 'aria-label': '틀린 이유' });
  const draw = () => {
    box.replaceChildren(
      ...WRONG_REASONS.map((r) =>
        h('button', {
          class: `reason${chosen === r.id ? ' is-on' : ''}`,
          type: 'button',
          'aria-pressed': String(chosen === r.id),
          onclick: () => {
            const prev = chosen;
            chosen = chosen === r.id ? null : r.id;
            onChange(prev, chosen);
            draw();
          },
        }, r.label)),
    );
  };
  draw();
  return box;
}

/** 하단 결과 시트. reasons는 reasonPicker 노드(오답일 때만). */
export function resultSheet({ correct, title, lines = [], reasons = null, nextLabel = '계속', onNext }) {
  return h('div', { class: `sheet ${correct ? 'is-ok' : 'is-bad'}`, role: 'status' },
    h('p', { class: 'sheet-title' }, title),
    lines.map((l) => h('p', { class: 'sheet-sub' }, l)),
    reasons ? [h('p', { class: 'sheet-sub' }, '왜 틀렸나요? (선택)'), reasons] : null,
    h('button', { class: 'btn is-wide', type: 'button', onclick: onNext }, nextLabel),
  );
}
