// 퀘스트 러너: 학습 기록이 바뀔 때마다 퀘스트를 자동 판정해 완료·XP 지급·실패 횟수를 저장소에 반영한다.
import { evaluate, buildQuestModel, metricCoversCard, parseMetric, totalXp, levelInfo, countDue } from './engine.js';

/**
 * @param {{ store: ReturnType<typeof import('./store.js').createStore>, getData: () => ({ cardsAll: object[], cards: object[], quests: object[] } | null) }} opts
 */
export function createQuestRunner({ store, getData }) {
  const listeners = new Set();
  let running = false;
  let again = false;

  function context(data) {
    const today = store.today();
    const states = store.cardStates();
    return {
      today,
      ctx: {
        cardIds: data.cardsAll.map((c) => c.id),
        states,
        drill: store.drillStats(),
        boss: store.bossStats(),
        daily: store.daily(today),
        dueNow: countDue(data.cards, states, today),
      },
    };
  }

  /** 화면용 모델(진행도·상태·건너뛰기 가능 여부). */
  function model() {
    const data = getData();
    if (!data) return [];
    const { today, ctx } = context(data);
    return buildQuestModel({ quests: data.quests, questStates: store.questStates(), xplog: store.xplog(), ctx, today });
  }

  function emit(events) {
    listeners.forEach((fn) => {
      try {
        fn(events);
      } catch (e) {
        console.error(e);
      }
    });
  }

  /** 새로 달성한 퀘스트를 반영한다. 연쇄 해금은 한 번의 호출 안에서 처리된다. */
  function check() {
    const data = getData();
    if (!data) return [];
    if (running) {
      again = true;
      return [];
    }
    running = true;
    const events = [];
    try {
      const before = totalXp(store.questStates(), store.xplog());
      for (let round = 0; round < 5; round += 1) {
        again = false;
        const { today, ctx } = context(data);
        const res = evaluate({ quests: data.quests, questStates: store.questStates(), xplog: store.xplog(), ctx, today });
        for (const c of res.completed) if (store.completeQuest(c.id, c.xp)) events.push({ kind: 'quest', quest: c.quest, xp: c.xp });
        for (const d of res.dailies) if (store.awardDaily(today, d.id, d.xp)) events.push({ kind: 'daily', quest: d.quest, xp: d.xp });
        if (!again && res.completed.length === 0 && res.dailies.length === 0) break;
      }
      if (events.length) {
        const after = totalXp(store.questStates(), store.xplog());
        const lb = levelInfo(before).level;
        const la = levelInfo(after).level;
        events.push({ kind: 'summary', gained: after - before, level: la, levelUp: la > lb });
      }
    } finally {
      running = false;
    }
    if (events.length) emit(events);
    return events;
  }

  /** 오답이 나오면, 그 카드·과목·보스가 걸린 "진행 중인" 메인·보스 퀘스트의 실패 횟수를 올린다. */
  function noteFailure(detail) {
    const data = getData();
    if (!data || !detail) return;
    const cardIds = data.cardsAll.map((c) => c.id);
    for (const row of model()) {
      if (row.status !== 'available' || row.quest.type === 'daily') continue;
      const m = parseMetric(row.quest.metric);
      if (!m) continue;
      const hit =
        (detail.type === 'review' && !detail.correct && metricCoversCard(row.quest.metric, detail.cardId, cardIds)) ||
        (detail.type === 'drill' && !detail.correct && m.kind === 'drill_correct' && m.subject === detail.subject) ||
        (detail.type === 'boss' && !detail.cleared && m.kind === 'boss' && m.key === detail.key);
      if (hit) store.bumpQuestFail(row.quest.id);
    }
  }

  store.subscribe((_p, meta) => {
    if (meta?.source === 'local') noteFailure(meta.detail);
    if (meta?.source === 'local' || meta?.source === 'sync') check();
  });

  return {
    check,
    model,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** 건너뛰기: 메인 퀘스트가 실패 3회 이상인 경우만. */
    skip(id) {
      const row = model().find((r) => r.quest.id === id);
      if (!row || !row.canSkip) return false;
      const ok = store.skipQuest(id);
      if (ok) check();
      return ok;
    },
  };
}
