// 서비스워커: 앱 셸은 network-first(항상 최신, 오프라인이면 캐시), 데이터 JSON은 stale-while-revalidate.
// network-first라서 배포 때 버전 문자열을 올릴 필요가 없다. 파일 구조를 바꿀 때만 SHELL_CACHE를 올린다.
const SHELL_CACHE = 'elec-shell-v1';
const DATA_CACHE = 'elec-data-v1';
const FIREBASE_PREFIX = 'https://www.gstatic.com/firebasejs/';
const NETWORK_TIMEOUT_MS = 4000;

const SHELL_FILES = [
  'index.html',
  'manifest.json',
  'css/app.css',
  'js/auth.js',
  'js/data.js',
  'js/dom.js',
  'js/drills.js',
  'js/expr.js',
  'js/firebase-config.js',
  'js/main.js',
  'js/questions.js',
  'js/quests.js',
  'js/rng.js',
  'js/router.js',
  'js/srs.js',
  'js/store.js',
  'js/sync.js',
  'js/tabs.js',
  'js/version.js',
  'js/ui/common.js',
  'js/ui/drill.js',
  'js/ui/map.js',
  'js/ui/practice.js',
  'js/ui/profile.js',
  'js/ui/quests.js',
  'js/ui/quiz.js',
  'js/ui/session.js',
  'js/ui/stats.js',
  'js/ui/widgets.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

const DATA_FILES = ['data/cards.json', 'data/quests/ch1.json', 'data/freqmap.json', 'data/drills.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' })));
      const data = await caches.open(DATA_CACHE);
      await data.addAll(DATA_FILES.map((u) => new Request(u, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, DATA_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('elec-') && !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await withTimeout(fetch(request, { cache: 'no-cache' }), NETWORK_TIMEOUT_MS);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const index = await cache.match('index.html');
      if (index) return index;
    }
    return new Response('오프라인이며 캐시된 파일이 없습니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request, { cache: 'no-cache' })
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  const res = await refresh;
  return res ?? new Response('오프라인이며 캐시된 데이터가 없습니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function cacheFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/data/')) event.respondWith(staleWhileRevalidate(request, event));
    else event.respondWith(networkFirst(request));
    return;
  }
  if (request.url.startsWith(FIREBASE_PREFIX)) event.respondWith(cacheFirst(request));
});
