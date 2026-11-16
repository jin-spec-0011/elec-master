import { h, fill } from '../dom.js';
import { pageTitle, sectionTitle, notice, SUBJECT_LABEL } from './common.js';
import { weeklyActivity, subjectAccuracy, drillAccuracy, reasonTotals, weakCards, pct } from '../stats.js';
import { columnChart, barList } from './charts.js';

const SUBJECTS = Object.keys(SUBJECT_LABEL);

export function render(container, app) {
  const { store, data } = app;
  const today = store.today();
  const states = store.cardStates();

  const week = weeklyActivity(store.dailyAll(), today, 7);
  const weekTotal = week.reduce((s, r) => s + r.value, 0);
  const cardAcc = subjectAccuracy(data.cardsAll, states, SUBJECTS);
  const drillAcc = drillAccuracy(store.drillStats(), SUBJECTS);
  const reasons = reasonTotals(states, store.drillStats());
  const reasonSum = reasons.reduce((s, r) => s + r.count, 0);
  const reasonMax = Math.max(1, ...reasons.map((r) => r.count));
  const weak = weakCards(data.cardsAll, states, 5);
  const hasAny = weekTotal > 0 || cardAcc.some((r) => r.reps > 0) || drillAcc.some((r) => r.total > 0);

  const units = Object.entries(data.freqmap.units).map(([id, u]) => ({ id, ...u }));
  const freq = (code) => {
    const top = units.filter((u) => u.subject === code).sort((a, b) => b.share - a.share).slice(0, 5);
    const max = top[0]?.share || 1;
    return barList({
      title: SUBJECT_LABEL[code],
      rows: top.map((u) => ({ label: u.name, ratio: u.share / max, text: `${u.share}%`, tip: `${u.name} 출제비중 ${u.share}%` })),
    });
  };

  fill(container,
    pageTitle('통계'),
    hasAny ? null : notice('아직 학습 기록이 없습니다. 연습 탭에서 카드 복습·문제 풀이·계산 드릴을 시작하면 이곳에 쌓입니다.'),
    sectionTitle('최근 7일'),
    h('div', { class: 'card' },
      columnChart({
        title: '하루에 푼 문제 수 (카드 복습 + 계산 드릴)',
        unit: '문제',
        rows: week.map((r) => ({ label: r.label, value: r.value, highlight: r.isToday, tip: `${r.isToday ? '오늘' : `${r.label}요일`}: ${r.value}문제 (카드 ${r.reviewed} · 드릴 ${r.drill})` })),
      }),
      h('p', { class: 'chart-note' }, `최근 7일 합계 ${weekTotal}문제`)),

    sectionTitle('과목별 카드 정답률'),
    h('div', { class: 'card' },
      barList({
        title: '카드 복습 정답률 (복습 횟수 기준)',
        rows: cardAcc.map((r) => ({
          label: SUBJECT_LABEL[r.subject], ratio: r.rate, text: pct(r.rate),
          tip: r.reps > 0 ? `${SUBJECT_LABEL[r.subject]}: ${r.correct}/${r.reps}회 정답 (${pct(r.rate)}), ${r.cards}장` : `${SUBJECT_LABEL[r.subject]}: 복습 기록 없음`,
        })),
        note: '카드를 여러 번 복습하면 횟수가 모두 반영됩니다.',
      })),

    sectionTitle('계산 드릴 정답률'),
    h('div', { class: 'card' },
      barList({
        title: '과목별 계산 드릴 정답률',
        rows: drillAcc.map((r) => ({
          label: SUBJECT_LABEL[r.subject], ratio: r.rate, text: pct(r.rate),
          tip: r.total > 0 ? `${SUBJECT_LABEL[r.subject]}: ${r.correct}/${r.total}문제 정답 (${pct(r.rate)})` : `${SUBJECT_LABEL[r.subject]}: 드릴 기록 없음`,
        })),
      })),

    sectionTitle('틀린 이유'),
    h('div', { class: 'card' },
      reasonSum > 0
        ? barList({
            title: `틀린 이유 분류 (총 ${reasonSum}회)`,
            rows: reasons.map((r) => ({ label: r.label, ratio: r.count / reasonMax, text: `${r.count}회`, tip: `${r.label}: ${r.count}회` })),
            note: '틀렸을 때 결과 시트에서 고른 이유가 집계됩니다. 가장 많은 항목부터 보완하세요.',
          })
        : h('p', { class: 'card-sub' }, '아직 선택한 틀린 이유가 없습니다. 틀렸을 때 결과 시트에서 이유를 고르면 여기에 집계됩니다.')),

    sectionTitle('자주 틀리는 카드'),
    weak.length
      ? weak.map((w) => h('div', { class: 'card' },
          h('div', { class: 'row' }, h('p', { class: 'card-title' }, w.card.front), h('span', { class: 'badge is-accent' }, `${w.wrong}회 오답`)),
          h('p', { class: 'flash-formula', style: 'font-size:17px' }, w.card.back),
          h('p', { class: 'card-sub' }, `${SUBJECT_LABEL[w.card.subject] ?? w.card.subject} · 복습 ${w.reps}회`)))
      : h('p', { class: 'card-sub' }, '아직 틀린 카드가 없습니다.'),

    sectionTitle('기출 빈도 (과목별 상위 5개 단원)'),
    h('p', { class: 'card-sub' }, `${String(data.freqmap.source ?? '')} · 막대는 과목 내 출제비중(%)입니다.`),
    ['S1', 'S2', 'S3', 'S4', 'S5'].map((code) => h('div', { class: 'card' }, freq(code))),
  );
}
