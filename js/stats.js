// 내 학습 통계 순수 로직(DOM 비의존). 입력은 저장소의 읽기 전용 스냅샷.
import { addDays, WRONG_REASONS } from './srs.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** yyyymmdd → 요일 글자(KST 날짜 키는 달력 날짜이므로 UTC로 해석해도 같다). */
export function weekdayLabel(key) {
  const d = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8))));
  return WEEKDAYS[d.getUTCDay()];
}

/**
 * 최근 N일(오늘 포함)의 푼 문제 수 = 카드 복습 + 계산 드릴.
 * @returns {{ day: string, label: string, value: number, reviewed: number, drill: number, isToday: boolean }[]} 오래된 날부터
 */
export function weeklyActivity(dailyAll, today, days = 7) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    const d = dailyAll?.[day];
    const reviewed = d?.reviewed ?? 0;
    const drill = d?.drillTotal ?? 0;
    out.push({ day, label: i === 0 ? '오늘' : weekdayLabel(day), value: reviewed + drill, reviewed, drill, isToday: i === 0 });
  }
  return out;
}

/** 축 상단에 쓸 깔끔한 최댓값(5 / 10 / 20 / 50 / 100 …). */
export function niceMax(v) {
  if (!(v > 5)) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

/** 과목별 카드 복습 정답률(복습 횟수 가중). 복습 기록이 없으면 rate는 null. */
export function subjectAccuracy(cardsAll, states, subjects) {
  const acc = Object.fromEntries(subjects.map((s) => [s, { subject: s, reps: 0, correct: 0, cards: 0 }]));
  for (const c of cardsAll) {
    const s = states[c.id];
    if (!s || !acc[c.subject] || s.reps <= 0) continue;
    acc[c.subject].reps += s.reps;
    acc[c.subject].correct += Math.min(s.correct ?? 0, s.reps);
    acc[c.subject].cards += 1;
  }
  return subjects.map((k) => ({ ...acc[k], rate: acc[k].reps > 0 ? acc[k].correct / acc[k].reps : null }));
}

/** 과목별 계산 드릴 정답률. */
export function drillAccuracy(drill, subjects) {
  return subjects.map((k) => {
    const d = drill?.[k];
    const total = d?.total ?? 0;
    return { subject: k, correct: d?.correct ?? 0, total, rate: total > 0 ? (d.correct / total) : null };
  });
}

/** 틀린 이유 4분류 누적(카드 + 드릴). */
export function reasonTotals(states, drill) {
  return WRONG_REASONS.map((r) => {
    let count = 0;
    for (const s of Object.values(states ?? {})) count += s.reasons?.[r.id] ?? 0;
    for (const d of Object.values(drill ?? {})) count += d.reasons?.[r.id] ?? 0;
    return { id: r.id, label: r.label, count };
  });
}

/** 자주 틀리는 카드: (복습 횟수 − 정답 횟수)가 큰 순, 같으면 lapses가 큰 순. 틀린 적 없으면 제외. */
export function weakCards(cardsAll, states, n = 5) {
  return cardsAll
    .map((card) => {
      const s = states[card.id];
      const wrong = s ? Math.max(0, s.reps - (s.correct ?? 0)) : 0;
      return { card, wrong, reps: s?.reps ?? 0, lapses: s?.lapses ?? 0 };
    })
    .filter((x) => x.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.lapses - a.lapses || a.card.id.localeCompare(b.card.id))
    .slice(0, n);
}

export const pct = (rate) => (rate === null ? '-' : `${Math.round(rate * 100)}%`);
