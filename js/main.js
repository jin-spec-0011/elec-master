import { APP_VERSION } from './version.js';
import { TABS } from './tabs.js';
import { startRouter } from './router.js';
import { h, clear, iconNode } from './dom.js';
import { loadAll, resolveDevMode } from './data.js';
import { createAuth } from './auth.js';
import { errorCard } from './ui/common.js';

const VIEWS = {
  map: () => import('./ui/map.js'),
  practice: () => import('./ui/practice.js'),
  quests: () => import('./ui/quests.js'),
  stats: () => import('./ui/stats.js'),
  profile: () => import('./ui/profile.js'),
};

const app = { data: null, auth: createAuth(), swReg: null, tab: null };

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
  const s = app.auth.state;
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

  async function renderTab(tabId) {
    app.tab = tabId;
    markActive(tabbar, tabId);
    if (!app.data) return;
    try {
      const mod = await VIEWS[tabId]();
      if (app.tab !== tabId) return; // 비동기 로딩 중 다른 탭으로 이동한 경우
      mod.render(view, app);
      view.scrollTo?.(0, 0);
    } catch (e) {
      console.error(e);
      clear(view).append(errorCard(`화면을 그리지 못했습니다: ${e.message}`, () => renderTab(tabId)));
    }
  }

  async function loadData() {
    clear(view).append(h('p', { class: 'loading' }, '불러오는 중…'));
    try {
      app.data = await loadAll({ dev });
      updateChip(chip);
      renderTab(app.tab ?? 'map');
    } catch (e) {
      clear(view).append(errorCard(e.message, loadData));
    }
  }

  app.auth.subscribe(() => {
    updateChip(chip);
    if (app.tab === 'profile') renderTab('profile');
  });
  updateChip(chip);

  startRouter((tabId) => renderTab(tabId));
  await loadData();
  app.auth.init();
  app.swReg = await registerServiceWorker();
  console.info(`전기기사 마스터 ${APP_VERSION}`);
}

boot().catch((e) => {
  console.error(e);
  const view = document.getElementById('view');
  if (view) clear(view).append(errorCard(`앱을 시작하지 못했습니다: ${e.message}`, () => window.location.reload()));
});
