// 통계 차트 부품(HTML/CSS). 규칙: 한 가지 색(단일 계열)·얇은 막대(≤24px, 데이터 끝 4px 둥글게, 기준선은 직각)·
// 값은 막대 끝에 한 번만·텍스트는 텍스트 색·막대마다 포커스/탭 툴팁·표로 보기 제공.
import { h } from '../dom.js';
import { niceMax } from '../stats.js';

/**
 * 세로 막대 차트(시간 흐름). 단일 계열이라 범례 없이 제목이 계열을 설명한다.
 * @param {{ title: string, unit: string, rows: { label: string, value: number, tip: string, highlight?: boolean }[], max?: number }} opts
 */
export function columnChart({ title, unit, rows, max }) {
  const top = niceMax(max ?? Math.max(0, ...rows.map((r) => r.value)));
  const peak = Math.max(...rows.map((r) => r.value));
  const ticks = [top, Math.round(top / 2), 0];
  return h('figure', { class: 'chart', role: 'group', 'aria-label': title },
    h('figcaption', { class: 'chart-title' }, title),
    h('div', { class: 'col-chart' },
      h('div', { class: 'col-grid', 'aria-hidden': 'true' }, ticks.map((t) => h('div', { class: 'col-line' }, h('span', { class: 'col-tick' }, String(t))))),
      h('div', { class: 'col-bars' }, rows.map((r, i) =>
        h('div', { class: 'col-slot' },
          h('div', { class: 'col-stack', style: `height:${top > 0 ? (r.value / top) * 100 : 0}%` },
            // 값 라벨은 오늘과 최댓값에만 붙인다(모든 점에 숫자를 달지 않는다).
            r.value > 0 && (r.highlight || r.value === peak) ? h('span', { class: 'col-value' }, String(r.value)) : null,
            h('button', {
              class: `col-bar${r.highlight ? ' is-now' : ''}${i === 0 ? ' tip-start' : ''}${i === rows.length - 1 ? ' tip-end' : ''}`,
              type: 'button',
              'data-tip': r.tip,
              'aria-label': r.tip,
            })),
          h('span', { class: `col-label${r.highlight ? ' is-now' : ''}` }, r.label))))),
    tableView(title, ['항목', unit], rows.map((r) => [r.label, String(r.value)])));
}

/**
 * 가로 막대 목록(범주 비교). 값은 막대 끝(오른쪽)에 한 번만 적는다.
 * @param {{ title: string, rows: { label: string, ratio: number | null, text: string, tip: string }[], note?: string }} opts
 */
export function barList({ title, rows, note }) {
  return h('figure', { class: 'chart', role: 'group', 'aria-label': title },
    h('figcaption', { class: 'chart-title' }, title),
    h('div', { class: 'hbars' }, rows.map((r) =>
      h('div', { class: 'hbar-row' },
        h('span', { class: 'hbar-label' }, r.label),
        h('div', { class: 'hbar-track' },
          r.ratio === null ? null : h('span', { class: 'hbar-fill', style: `width:${Math.max(0, Math.min(1, r.ratio)) * 100}%`, 'data-tip': r.tip })),
        h('button', { class: 'hbar-value', type: 'button', 'data-tip': r.tip, 'aria-label': r.tip }, r.text)))),
    note ? h('p', { class: 'chart-note' }, note) : null,
    tableView(title, ['항목', '값'], rows.map((r) => [r.label, r.tip])));
}

/** 표로 보기: 스크린 리더와 숫자를 정확히 보고 싶은 사용자를 위한 대체 뷰. */
export function tableView(caption, headers, rows) {
  return h('details', { class: 'chart-table' },
    h('summary', null, '표로 보기'),
    h('table', null,
      h('caption', { class: 'sr-only' }, caption),
      h('thead', null, h('tr', null, headers.map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', null, c))))))));
}
