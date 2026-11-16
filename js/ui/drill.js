// 계산 드릴: 템플릿에 난수를 넣어 문제를 만들고 숫자 키패드로 답한다. 정답은 코드로 계산한다.
import { h, fill } from '../dom.js';
import { buildDrillQueue, gradeNumeric, applyKey, formatNumber } from '../drills.js';
import { makeRng } from '../rng.js';
import { SUBJECT_LABEL, errorCard } from './common.js';
import { topBar, reasonPicker, resultSheet } from './widgets.js';

const SIZE = 10;
let keyHandler = null; // 화면을 다시 그릴 때 이전 키보드 핸들러를 정리한다

function detachKeys() {
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
}

export function render(container, app, params = {}) {
  detachKeys();
  const { store, data } = app;
  const subject = Object.hasOwn(SUBJECT_LABEL, params.subject) ? params.subject : undefined;
  const exit = () => {
    detachKeys();
    window.location.hash = '#/practice';
  };

  let queue;
  try {
    queue = buildDrillQueue(data.drills, { subject, size: SIZE, rng: makeRng() });
  } catch (e) {
    console.error(e);
    fill(container, errorCard(`드릴 문제를 만들지 못했습니다: ${e.message}`, exit));
    return;
  }
  if (queue.length === 0) {
    fill(container, h('div', { class: 'session' },
      h('div', { class: 'session-top' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: exit }, '✕')),
      h('div', { class: 'card is-accent' },
        h('p', { class: 'card-title' }, '이 과목에는 아직 계산 드릴이 없습니다'),
        h('p', { class: 'card-sub' }, 'KEC는 계산 문제가 없습니다. 다른 과목을 선택하세요.'),
        h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: exit }, '연습으로 돌아가기')))));
    return;
  }

  const total = queue.length;
  let idx = 0;
  let correctCount = 0;
  let input = '';
  let locked = false;

  function showQuestion() {
    const q = queue[idx];
    input = '';
    locked = false;
    const display = h('div', { class: 'answer-box', 'aria-live': 'polite' });
    const draw = () => {
      display.replaceChildren(
        h('span', { class: input ? 'answer-value' : 'answer-placeholder' }, input || '정답 입력'),
        q.unit ? h('span', { class: 'answer-unit' }, q.unit) : null);
    };
    const press = (key) => {
      if (locked) return;
      input = applyKey(input, key);
      draw();
    };
    const submit = () => {
      if (locked || input === '' || input === '-' || input === '.') return;
      locked = true;
      detachKeys();
      grade(q, input);
    };
    const key = (label, k, cls = '') => h('button', { class: `key ${cls}`.trim(), type: 'button', 'aria-label': k === 'back' ? '지우기' : label, onclick: () => press(k) }, label);

    fill(container, h('div', { class: 'session' },
      topBar({ total, done: idx, onExit: exit }),
      h('div', { class: 'flash' },
        h('p', { class: 'flash-kind' }, `계산 드릴 · ${SUBJECT_LABEL[q.subject] ?? q.subject} · ${q.title}`),
        h('p', { class: 'flash-front' }, q.stem)),
      display,
      h('div', { class: 'keypad', role: 'group', 'aria-label': '숫자 키패드' },
        ['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => key(d, d)),
        key('±', '±', 'is-op'), key('0', '0'), key('.', '.', 'is-op'),
        key('⌫', 'back', 'is-op is-half'),
        h('button', { class: 'key is-submit is-half', type: 'button', onclick: submit }, '확인'))));
    draw();

    keyHandler = (e) => {
      if (!container.isConnected || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === '.' || e.key === ',') press('.');
      else if (e.key === '-') press('±');
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Enter') submit();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', keyHandler);
  }

  function grade(q, raw) {
    const { ok } = gradeNumeric(raw, q.answer, { tol: q.tol, decimals: q.decimals });
    if (ok) correctCount += 1;
    store.recordDrill(q.subject, ok);
    const reasons = ok ? null : reasonPicker({ onChange: (prev, next) => store.tagDrillReason(q.subject, prev, next) });
    const sheet = resultSheet({
      correct: ok,
      title: ok ? '정답이에요!' : '틀렸어요',
      lines: [ok ? q.solution : `정답: ${formatNumber(q.answer, q.decimals)}${q.unit ? ` ${q.unit}` : ''}`, ...(ok ? [] : [q.solution])],
      reasons,
      onNext: () => {
        idx += 1;
        if (idx >= total) finish();
        else showQuestion();
      },
    });
    container.querySelector('.session')?.classList.add('has-sheet');
    container.querySelector('.session')?.append(sheet);
  }

  function finish() {
    detachKeys();
    const stats = subject ? store.drillStats()[subject] : null;
    fill(container, h('div', { class: 'session' },
      h('div', { class: 'card is-accent' },
        h('p', { class: 'card-title' }, '계산 드릴 완료!'),
        h('p', { class: 'card-sub' }, `${total}문제 중 ${correctCount}문제 정답`)),
      stats ? h('div', { class: 'card' }, h('dl', { class: 'kv' },
        h('dt', null, `${SUBJECT_LABEL[subject]} 누적 정답`), h('dd', null, `${stats.correct}/${stats.total}`))) : null,
      h('div', { class: 'session-actions two' },
        h('button', { class: 'btn is-secondary is-wide', type: 'button', onclick: exit }, '연습으로'),
        h('button', { class: 'btn is-wide', type: 'button', onclick: () => render(container, app, params) }, '한 번 더'))));
  }

  showQuestion();
}
