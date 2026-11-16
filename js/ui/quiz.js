// 문제 풀이(자동 채점): 카드에서 4지 선택 / 2×2 매칭 / 공식 빈칸 문제를 만들어 낸다.
// 결과는 카드 복습 기록(SRS)에 그대로 반영된다. 오답은 세션 끝에서 새 보기로 한 번 더 낸다(기록 제외).
import { h, fill } from '../dom.js';
import { buildQueue, summarize, SESSION_SIZE, NEW_PER_DAY } from '../srs.js';
import { buildQuestion, isValidQuestion } from '../questions.js';
import { makeRng } from '../rng.js';
import { SUBJECT_LABEL, errorCard } from './common.js';
import { topBar, reasonPicker, resultSheet } from './widgets.js';

const KIND_LABEL = { choice: '4지 선택', match: '2×2 매칭', blank: '공식 빈칸' };

export function render(container, app, params = {}) {
  const { store, data } = app;
  const subject = Object.hasOwn(SUBJECT_LABEL, params.subject) ? params.subject : undefined;
  const today = store.today();
  const rng = makeRng();
  const exit = () => {
    window.location.hash = '#/practice';
  };

  const { queue } = buildQueue({
    cards: data.cards,
    states: store.cardStates(),
    today,
    newLimit: NEW_PER_DAY,
    newDoneToday: store.daily(today).newCards,
    size: SESSION_SIZE,
    subject,
  });

  const items = [];
  for (const card of queue) {
    const q = buildQuestion(card, data.cards, rng);
    if (isValidQuestion(q)) items.push({ card, q, retry: false });
  }

  if (items.length === 0) {
    const reason = queue.length === 0
      ? '복습 예정 카드가 없고, 오늘 새 카드 한도를 모두 썼거나 사용 가능한 카드가 없습니다.'
      : '보기를 만들 카드가 부족합니다. 서로 다른 카드가 최소 4장 필요합니다.';
    fill(container, h('div', { class: 'session' },
      h('div', { class: 'session-top' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: exit }, '✕')),
      h('div', { class: 'card is-accent' },
        h('p', { class: 'card-title' }, '지금 풀 문제가 없습니다'),
        h('p', { class: 'card-sub' }, reason),
        h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: exit }, '연습으로 돌아가기')))));
    return;
  }

  const total = items.length;
  let idx = 0;
  let firstDone = 0;
  let correctFirst = 0;

  const bar = () => topBar({ total, done: firstDone, onExit: exit });

  function showQuestion() {
    const item = items[idx];
    const { q } = item;
    let selected = null;
    const check = h('button', { class: 'btn is-wide', type: 'button', disabled: true, onclick: () => grade(item, selected, optButtons) }, '확인');
    const optButtons = q.choices.map((text, i) =>
      h('button', {
        class: 'opt',
        type: 'button',
        'aria-pressed': 'false',
        onclick: () => {
          selected = i;
          optButtons.forEach((b, j) => {
            b.classList.toggle('is-selected', j === i);
            b.setAttribute('aria-pressed', String(j === i));
          });
          check.disabled = false;
        },
      }, text));

    fill(container, h('div', { class: 'session' },
      bar(),
      h('div', { class: 'flash' },
        h('p', { class: 'flash-kind' }, `${KIND_LABEL[q.kind]} · ${SUBJECT_LABEL[q.subject] ?? q.subject}${item.retry ? ' · 다시 확인' : ''}`),
        h('p', { class: 'flash-front' }, q.prompt),
        q.display ? h('p', { class: 'flash-formula' }, q.display) : null),
      h('div', { class: `opts is-${q.layout}`, role: 'group', 'aria-label': '보기' }, optButtons),
      h('div', { class: 'session-actions' }, check)));
  }

  function grade(item, selected, optButtons) {
    if (selected === null) return;
    const { q } = item;
    const correct = selected === q.answerIndex;
    optButtons.forEach((b, i) => {
      b.disabled = true;
      if (i === q.answerIndex) b.classList.add('is-correct');
      else if (i === selected) b.classList.add('is-wrong');
    });

    if (!item.retry) {
      store.recordReview(item.card.id, correct, undefined);
      firstDone += 1;
      if (correct) correctFirst += 1;
      if (!correct) {
        const again = buildQuestion(item.card, data.cards, rng);
        items.push({ card: item.card, q: isValidQuestion(again) ? again : q, retry: true });
      }
    }

    const showReasons = !correct && !item.retry;
    const reasons = showReasons ? reasonPicker({ onChange: (prev, next) => store.tagReason(item.card.id, prev, next) }) : null;
    const sheet = resultSheet({
      correct,
      title: correct ? '정답이에요!' : item.retry ? '한 번 더 확인하세요' : '아쉬워요, 다시 볼게요',
      lines: correct ? [] : [`정답: ${q.choices[q.answerIndex]}`, `공식: ${q.explain}`],
      reasons,
      onNext: next,
    });
    container.querySelector('.session')?.classList.add('has-sheet');
    container.querySelector('.session')?.append(sheet);
  }

  function next() {
    idx += 1;
    if (idx >= items.length) finish();
    else showQuestion();
  }

  function finish() {
    const sum = summarize(data.cards, store.cardStates(), today);
    fill(container, h('div', { class: 'session' },
      h('div', { class: 'card is-accent' },
        h('p', { class: 'card-title' }, '문제 풀이 완료!'),
        h('p', { class: 'card-sub' }, `${total}문제 중 ${correctFirst}문제를 바로 맞혔습니다.`)),
      h('div', { class: 'card' }, h('dl', { class: 'kv' },
        h('dt', null, '지금 복습 예정'), h('dd', null, `${sum.total.due}장`),
        h('dt', null, '학습 중'), h('dd', null, `${sum.total.learning}장`),
        h('dt', null, '졸업'), h('dd', null, `${sum.total.graduated}장`))),
      h('div', { class: 'session-actions two' },
        h('button', { class: 'btn is-secondary is-wide', type: 'button', onclick: exit }, '연습으로'),
        h('button', { class: 'btn is-wide', type: 'button', onclick: () => render(container, app, params) }, '한 번 더'))));
  }

  try {
    showQuestion();
  } catch (e) {
    console.error(e);
    fill(container, errorCard(`문제를 그리지 못했습니다: ${e.message}`, exit));
  }
}
