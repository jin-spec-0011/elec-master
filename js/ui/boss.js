// 1챕터 보스전: 챕터 전체 카드에서 10문제, 하트 3개. 8문제 이상 맞히고 하트가 남으면 클리어.
// 결과는 보스 기록(boss/ch1)에만 남고 카드 복습 간격에는 영향을 주지 않는다.
import { h, fill } from '../dom.js';
import { buildQuestion, isValidQuestion } from '../questions.js';
import { makeRng, shuffle } from '../rng.js';
import { errorCard } from './common.js';
import { topBar, resultSheet } from './widgets.js';

export const BOSS = { key: 'ch1', questId: 'Q1-13', size: 10, hearts: 3 };

const hearts = (left) => h('div', { class: 'hearts', role: 'img', 'aria-label': `하트 ${left}개 남음` },
  Array.from({ length: BOSS.hearts }, (_, i) => h('span', { class: i < left ? 'heart' : 'heart is-lost', 'aria-hidden': 'true' }, i < left ? '♥' : '♡')));

export function render(container, app) {
  const { store, data } = app;
  const exit = () => {
    window.location.hash = '#/map';
  };
  const row = app.runner.model().find((r) => r.quest.id === BOSS.questId);
  const target = row?.target ?? 8;

  const message = (title, text) =>
    fill(container, h('div', { class: 'session' },
      h('div', { class: 'session-top' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: exit }, '✕')),
      h('div', { class: 'card is-accent' },
        h('p', { class: 'card-title' }, title),
        h('p', { class: 'card-sub' }, text),
        h('div', { style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: exit }, '맵으로')))));

  if (!row || row.status === 'locked') {
    message('아직 도전할 수 없습니다', `선행 퀘스트(${row ? row.quest.prereq.join(', ') : BOSS.questId})를 먼저 완료하거나 건너뛰어야 합니다.`);
    return;
  }

  const rng = makeRng();
  const items = [];
  for (const card of shuffle(data.cards, rng)) {
    if (items.length >= BOSS.size) break;
    const q = buildQuestion(card, data.cards, rng);
    if (isValidQuestion(q)) items.push({ card, q });
  }
  if (items.length < BOSS.size) {
    message('문제를 만들 카드가 부족합니다', `보스전은 서로 다른 카드 ${BOSS.size}장이 필요합니다(현재 ${items.length}문제). 카드 검수를 더 진행하거나 개발 모드를 사용하세요.`);
    return;
  }

  let idx = 0;
  let correctCount = 0;
  let heartsLeft = BOSS.hearts;

  const header = () => h('div', null, topBar({ total: BOSS.size, done: idx, onExit: exit }), hearts(heartsLeft));

  function showQuestion() {
    const { q } = items[idx];
    let selected = null;
    const check = h('button', { class: 'btn is-wide', type: 'button', disabled: true, onclick: () => grade(selected, optButtons) }, '확인');
    const optButtons = q.choices.map((text, i) =>
      h('button', {
        class: 'opt', type: 'button', 'aria-pressed': 'false',
        onclick: () => {
          selected = i;
          optButtons.forEach((b, j) => {
            b.classList.toggle('is-selected', j === i);
            b.setAttribute('aria-pressed', String(j === i));
          });
          check.disabled = false;
        },
      }, text));
    fill(container, h('div', { class: 'session boss' },
      header(),
      h('div', { class: 'flash' },
        h('p', { class: 'flash-kind' }, `보스전 ${idx + 1}/${BOSS.size} · 목표 ${target}문제 이상`),
        h('p', { class: 'flash-front' }, q.prompt),
        q.display ? h('p', { class: 'flash-formula' }, q.display) : null),
      h('div', { class: `opts is-${q.layout}`, role: 'group', 'aria-label': '보기' }, optButtons),
      h('div', { class: 'session-actions' }, check)));
  }

  function grade(selected, optButtons) {
    if (selected === null) return;
    const { q } = items[idx];
    const correct = selected === q.answerIndex;
    optButtons.forEach((b, i) => {
      b.disabled = true;
      if (i === q.answerIndex) b.classList.add('is-correct');
      else if (i === selected) b.classList.add('is-wrong');
    });
    if (correct) correctCount += 1;
    else heartsLeft -= 1;
    const sheet = resultSheet({
      correct,
      title: correct ? '명중!' : heartsLeft > 0 ? `하트를 잃었어요 (남은 하트 ${heartsLeft})` : '하트를 모두 잃었어요',
      lines: correct ? [] : [`정답: ${q.choices[q.answerIndex]}`, `공식: ${q.explain}`],
      onNext: () => {
        idx += 1;
        if (heartsLeft <= 0) finish(false);
        else if (idx >= BOSS.size) finish(correctCount >= target);
        else showQuestion();
      },
    });
    container.querySelector('.session')?.classList.add('has-sheet');
    container.querySelector('.session')?.append(sheet);
  }

  function finish(cleared) {
    store.recordBoss(BOSS.key, correctCount, cleared); // 러너가 퀘스트 완료·XP를 판정한다
    fill(container, h('div', { class: 'session' },
      h('div', { class: `card ${cleared ? 'is-accent' : 'is-error'}` },
        h('p', { class: 'card-title' }, cleared ? '보스 클리어!' : '아쉽게 실패했어요'),
        h('p', { class: 'card-sub' }, `${Math.min(idx, BOSS.size)}문제 중 ${correctCount}문제 정답 · 남은 하트 ${Math.max(0, heartsLeft)}`),
        h('p', { class: 'card-sub' }, cleared ? '퀘스트 보상은 완료 알림으로 표시됩니다.' : `목표는 ${target}문제 이상이며, 하트는 ${BOSS.hearts}개입니다. 카드 복습 후 다시 도전하세요.`)),
      h('div', { class: 'session-actions two' },
        h('button', { class: 'btn is-secondary is-wide', type: 'button', onclick: exit }, '맵으로'),
        h('button', { class: 'btn is-wide', type: 'button', onclick: () => render(container, app) }, '다시 도전'))));
  }

  try {
    showQuestion();
  } catch (e) {
    console.error(e);
    fill(container, errorCard(`보스전을 그리지 못했습니다: ${e.message}`, exit));
  }
}
