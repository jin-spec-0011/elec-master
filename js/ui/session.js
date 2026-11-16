// 공식카드 복습 세션(전체 화면). 카드 앞면 → 답 확인 → 알았다/몰랐다 → 하단 결과 시트(오답이면 이유 4분류).
import { h, fill } from '../dom.js';
import { buildQueue, summarize, WRONG_REASONS, SESSION_SIZE, NEW_PER_DAY } from '../srs.js';
import { SUBJECT_LABEL, errorCard } from './common.js';

export function render(container, app, params = {}) {
  const { store, data } = app;
  const subject = Object.hasOwn(SUBJECT_LABEL, params.subject) ? params.subject : undefined;
  const today = store.today();
  const { queue } = buildQueue({
    cards: data.cards,
    states: store.cardStates(),
    today,
    newLimit: NEW_PER_DAY,
    newDoneToday: store.daily(today).newCards,
    size: SESSION_SIZE,
    subject,
  });

  const exit = () => {
    window.location.hash = '#/practice';
  };

  if (queue.length === 0) {
    fill(
      container,
      h('div', { class: 'session' },
        h('div', { class: 'session-top' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: exit }, '✕')),
        h('div', { class: 'card is-accent' },
          h('p', { class: 'card-title' }, '지금 복습할 카드가 없습니다'),
          h('p', { class: 'card-sub' }, '복습 예정 카드가 없고, 오늘 새 카드 한도를 모두 썼거나 사용 가능한 카드가 없습니다. 내일 다시 오세요.'),
          h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: exit }, '연습으로 돌아가기')),
        ),
      ),
    );
    return;
  }

  const items = queue.map((card) => ({ card, retry: false }));
  const total = queue.length;
  let idx = 0;
  let firstPassDone = 0;
  let correctFirst = 0;
  const wrongReasons = {}; // reasonId -> count (이번 세션)

  const topBar = () =>
    h('div', { class: 'session-top' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '세션 종료', onclick: exit }, '✕'),
      h('div', { class: 'bar is-lg', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(firstPassDone) },
        h('span', { style: `width:${Math.round((firstPassDone / total) * 100)}%` })),
    );

  const flash = (card, showBack) =>
    h('div', { class: 'flash', 'aria-live': 'polite' },
      h('p', { class: 'flash-kind' }, `${SUBJECT_LABEL[card.subject] ?? card.subject} · ${card.concept}`),
      h('p', { class: 'flash-front' }, card.front),
      showBack
        ? h('div', { class: 'flash-back' },
            h('p', { class: 'flash-formula' }, card.back),
            card.unit ? h('p', { class: 'card-sub' }, `단위 ${card.unit}`) : null,
            card.note ? h('p', { class: 'card-sub' }, card.note) : null)
        : null,
    );

  function showQuestion() {
    const { card } = items[idx];
    fill(
      container,
      h('div', { class: 'session' },
        topBar(),
        flash(card, false),
        h('div', { class: 'session-actions' },
          h('button', { class: 'btn is-wide', type: 'button', onclick: showAnswer }, '답 확인')),
      ),
    );
  }

  function showAnswer() {
    const { card } = items[idx];
    fill(
      container,
      h('div', { class: 'session' },
        topBar(),
        flash(card, true),
        h('p', { class: 'session-hint' }, '떠올린 것과 비교해 스스로 채점하세요.'),
        h('div', { class: 'session-actions two' },
          h('button', { class: 'btn is-secondary is-wide', type: 'button', onclick: () => grade(false) }, '몰랐다'),
          h('button', { class: 'btn is-wide', type: 'button', onclick: () => grade(true) }, '알았다')),
      ),
    );
  }

  function grade(correct) {
    const item = items[idx];
    let chosen = null;
    if (!item.retry) {
      store.recordReview(item.card.id, correct, undefined);
      firstPassDone += 1;
      if (correct) correctFirst += 1;
    }
    if (!correct && !item.retry) items.push({ card: item.card, retry: true }); // 세션 끝에서 한 번 더(기록에는 반영하지 않음)

    const reasonBox = h('div', { class: 'reasons', role: 'group', 'aria-label': '틀린 이유' });
    const drawReasons = () =>
      fill(
        reasonBox,
        WRONG_REASONS.map((r) =>
          h('button', {
            class: `reason${chosen === r.id ? ' is-on' : ''}`,
            type: 'button',
            'aria-pressed': String(chosen === r.id),
            onclick: () => {
              const prev = chosen;
              chosen = chosen === r.id ? null : r.id;
              store.tagReason(item.card.id, prev, chosen);
              if (prev) wrongReasons[prev] = Math.max(0, (wrongReasons[prev] ?? 1) - 1);
              if (chosen) wrongReasons[chosen] = (wrongReasons[chosen] ?? 0) + 1;
              drawReasons();
            },
          }, r.label),
        ),
      );
    const showReasons = !correct && !item.retry;
    if (showReasons) drawReasons();

    const sheet = h('div', { class: `sheet ${correct ? 'is-ok' : 'is-bad'}`, role: 'status' },
      h('p', { class: 'sheet-title' }, correct ? '좋아요! 기억하고 있네요' : item.retry ? '한 번 더 확인하세요' : '다시 복습할게요'),
      !correct ? h('p', { class: 'sheet-sub' }, `정답: ${item.card.back}`) : null,
      showReasons ? h('p', { class: 'sheet-sub' }, '왜 틀렸나요? (선택)') : null,
      showReasons ? reasonBox : null,
      h('button', { class: 'btn is-wide', type: 'button', onclick: next }, '계속'),
    );

    fill(
      container,
      h('div', { class: 'session has-sheet' },
        topBar(),
        flash(item.card, true),
        sheet,
      ),
    );
  }

  function next() {
    idx += 1;
    if (idx >= items.length) finish();
    else showQuestion();
  }

  function finish() {
    const states = store.cardStates();
    const sum = summarize(data.cards, states, today);
    const reasons = WRONG_REASONS.filter((r) => (wrongReasons[r.id] ?? 0) > 0);
    fill(
      container,
      h('div', { class: 'session' },
        h('div', { class: 'card is-accent' },
          h('p', { class: 'card-title' }, '복습 완료!'),
          h('p', { class: 'card-sub' }, `${total}장 중 ${correctFirst}장을 바로 맞혔습니다.`),
        ),
        reasons.length
          ? h('div', { class: 'card' },
              h('p', { class: 'card-title' }, '오답 이유'),
              h('dl', { class: 'kv' }, reasons.flatMap((r) => [h('dt', null, r.label), h('dd', null, `${wrongReasons[r.id]}장`)])))
          : null,
        h('div', { class: 'card' },
          h('dl', { class: 'kv' },
            h('dt', null, '지금 복습 예정'), h('dd', null, `${sum.total.due}장`),
            h('dt', null, '학습 중'), h('dd', null, `${sum.total.learning}장`),
            h('dt', null, '졸업'), h('dd', null, `${sum.total.graduated}장`)),
        ),
        h('div', { class: 'session-actions two' },
          h('button', { class: 'btn is-secondary is-wide', type: 'button', onclick: exit }, '연습으로'),
          h('button', { class: 'btn is-wide', type: 'button', onclick: () => render(container, app, params) }, '한 번 더')),
      ),
    );
  }

  try {
    showQuestion();
  } catch (e) {
    console.error(e);
    fill(container, errorCard(`복습 화면을 그리지 못했습니다: ${e.message}`, exit));
  }
}
