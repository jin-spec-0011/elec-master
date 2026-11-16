// 하단 5탭 정의. DOM에 의존하지 않는 순수 데이터.
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const DEFAULT_TAB = 'map';

export const TABS = [
  { id: 'map', label: '맵', icon: svg('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>') },
  { id: 'practice', label: '연습', icon: svg('<rect x="3" y="8" width="13" height="12" rx="2"/><path d="M8 4h11a2 2 0 0 1 2 2v10"/>') },
  { id: 'quests', label: '퀘스트', icon: svg('<path d="M5 3v18"/><path d="M5 4h12l-2 4 2 4H5"/>') },
  { id: 'stats', label: '통계', icon: svg('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>') },
  { id: 'profile', label: '프로필', icon: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>') },
];
