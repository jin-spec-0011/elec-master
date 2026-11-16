/**
 * 퀘스트 해금 상태를 계산한다. (진행 기록 연동은 P4-4)
 * - done: 완료됨
 * - available: 선행이 모두 완료됐거나 일일 퀘스트
 * - locked: 선행 미완료
 * @param {{ id: string, type: string, prereq: string[] }[]} quests
 * @param {Set<string>} [completedIds]
 * @returns {Map<string, 'done' | 'available' | 'locked'>}
 */
export function computeAvailability(quests, completedIds = new Set()) {
  const result = new Map();
  for (const q of quests) {
    if (completedIds.has(q.id)) {
      result.set(q.id, 'done');
    } else if (q.type === 'daily') {
      result.set(q.id, 'available');
    } else {
      const open = (q.prereq ?? []).every((p) => completedIds.has(p));
      result.set(q.id, open ? 'available' : 'locked');
    }
  }
  return result;
}
