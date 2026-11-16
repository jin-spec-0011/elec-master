import { APP_VERSION } from './version.js';
import { TABS } from './tabs.js';
import { startRouter, FULLSCREEN_ROUTES } from './router.js';
import { h, clear, iconNode } from './dom.js';
import { loadAll, resolveDevMode } from './data.js';
import { createAuth } from './auth.js';
import { createStore } from './store.js';
import { createSync } from './sync.js';
import { createQuestRunner } from './runner.js';
import { showToast } from './ui/toast.js';
import { firebaseConfig } from './firebase-config.js';
import { errorCard } from './ui/common.js';

const VIEWS = {
  map: () => import('./ui/map.js'),
  practice: () => import('./ui/practice.js'),
  quests: () => import('./ui/quests.js'),
  stats: () => import('./ui/stats.js'),
  profile: () => import('./ui/profile.js'),
  session: () => import('./ui/session.js'),
  quiz: () => import('./ui/quiz.js'),
  drill: () => import('./ui/drill.js'),
  boss: () => import('./ui/boss.js'),
};

const auth = createAuth();
const store = createStore();
const sync = createSync({ store, auth, config: firebaseConfig });
const app = { data: null, auth, store, sync, runner: null, focusedRoute: null, rerender: () => {}, swReg: null, route: { id: 'map', tab: 'map', params: {} } };
app.runner = createQuestRunner({ store, getData: () => app.data });

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function buildTabbar(tabbar) {
  clear(tabbar).append(
    ...TABS.map((t) => h('a', { class: 'nav-item', href: `#/${t.id}`, dataset: { tab: t.id } }, iconNode(t.icon), h('span', null, t.label))),
  );
}

function markActive(tabbar, tabId) {
  tabbar.querySelectorAll('.nav-item').forEach((a) => {
    if (a.dataset.tab === tabId) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function updateChip(chip) {
  const s = auth.state;
  let text = '게스트';
  let warn = true;
  if (s.status === 'signed-in') {
    text = s.user?.name || s.user?.email || '로그인됨';
    warn = false;
  } else if (s.status === 'loading') {
    text = '확인 중…';
  } else if (s.status === 'signed-out') {
    text = '로그아웃';
  } else if (s.status === 'error') {
    text = '로그인 오류';
  }
  if (app.data?.dev) text = `DEV · ${text}`;
  chip.textContent = text;
  chip.classList.toggle('is-warn', warn);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('sw.js', { scope: './' });
  } catch (e) {
    console.warn('서비스워커 등록 실패', e);
    return null;
  }
}

async function boot() {
  const view = document.getElementById('view');
  const tabbar = document.getElementById('tabbar');
  const chip = document.getElementById('status-chip');
  buildTabbar(tabbar);

  const dev = resolveDevMode(window.location.search, safeStorage());

  async function renderRoute(loc) {
    app.route = loc;
    markActive(tabbar, loc.tab);
    document.body.classList.toggle('in-session', FULLSCREEN_ROUTES.includes(loc.id));
    if (!app.data) return;
    try {
      const mod = await VIEWS[loc.id]();
      if (app.route !== loc) return; // 비동기 로딩 중 다른 화면으로 이동한 경우
      mod.render(view, app, loc.params);
      view.scrollTo?.(0, 0);
      if (app.focusedRoute !== loc.id) {
        app.focusedRoute = loc.id;
        view.focus({ preventScroll: true }); // 화면이 바뀌면 스크린 리더가 새 내용을 읽도록 본문으로 포커스 이동
      }
    } catch (e) {
      console.error(e);
      clear(view).append(errorCard(`화면을 그리지 못했습니다: ${e.message}`, () => renderRoute(loc)));
    }
  }

  async function loadData() {
    clear(view).append(h('p', { class: 'loading' }, '불러오는 중…'));
    try {
      app.data = await loadAll({ dev });
      updateChip(chip);
      renderRoute(app.route);
      app.runner.check(); // 이미 달성한 퀘스트가 있으면 반영
    } catch (e) {
      clear(view).append(errorCard(e.message, loadData));
    }
  }

  app.rerender = () => renderRoute(app.route);
  // 퀘스트 완료·XP·레벨업 알림. 학습 화면(세션·퀴즈·드릴·보스) 중에는 화면을 다시 그리지 않는다.
  app.runner.subscribe((events) => {
    for (const e of events) {
      if (e.kind === 'quest') showToast(`퀘스트 완료! ${e.quest.title} +${e.xp} XP${e.quest.reward ? ` · ${e.quest.reward.replace(/^칭호:\s*/, '칭호 획득: ')}` : ''}`, { kind: 'good' });
      else if (e.kind === 'daily') showToast(`일일 퀘스트 달성! ${e.quest.title} +${e.xp} XP`, { kind: 'good' });
      else if (e.kind === 'summary' && e.levelUp) showToast(`레벨 업! Lv.${e.level}`, { kind: 'level', ms: 6000 });
    }
    if (['map', 'quests', 'profile'].includes(app.route.id)) renderRoute(app.route);
  });

  auth.subscribe(() => {
    updateChip(chip);
    if (app.route.id === 'profile') renderRoute(app.route);
  });
  sync.subscribe(() => {
    if (app.route.id === 'profile') renderRoute(app.route); // 복습 세션 중에는 다시 그리지 않는다
  });
  updateChip(chip);

  window.addEventListener('online', () => sync.syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && auth.state.status === 'signed-in') sync.schedule();
  });

  startRouter((loc) => renderRoute(loc));
  await loadData();
  sync.start();
  auth.init();
  app.swReg = await registerServiceWorker();
  console.info(`전기기사 마스터 ${APP_VERSION}`);
}

boot().catch((e) => {
  console.error(e);
  const view = document.getElementById('view');
  if (view) clear(view).append(errorCard(`앱을 시작하지 못했습니다: ${e.message}`, () => window.location.reload()));
});
