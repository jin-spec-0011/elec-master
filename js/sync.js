// 학습 기록 ↔ Firebase Realtime Database 동기화. 오프라인이면 로컬에 쌓아 두었다가 연결되면 올린다.
// 경로: elec/users/{uid}/cards/{카드ID}, elec/users/{uid}/daily/{yyyymmdd}
import { FIREBASE_SDK_VERSION, isDatabaseConfigured } from './auth.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

export function classifySyncError(e, online = true) {
  const text = `${e?.code ?? ''} ${e?.message ?? ''}`;
  if (/permission[\s_-]?denied/i.test(text)) {
    return { state: 'error', message: '서버가 저장을 거부했습니다. Realtime Database 규칙이 게시됐는지, 로그인 계정이 맞는지 확인하세요.' };
  }
  if (!online || /network|offline|failed to fetch|timeout|unavailable/i.test(text)) {
    return { state: 'offline', message: '오프라인입니다. 연결되면 자동으로 동기화됩니다.' };
  }
  return { state: 'error', message: `동기화에 실패했습니다. (${e?.code ?? e?.message ?? '알 수 없는 오류'})` };
}

/**
 * @param {{ store: ReturnType<typeof import('./store.js').createStore>, auth: any, config: object, importer?: (url: string) => Promise<any>, debounceMs?: number, now?: () => number, isOnline?: () => boolean }} opts
 */
export function createSync({ store, auth, config, importer = (url) => import(url), debounceMs = 1500, now = () => Date.now(), isOnline = () => globalThis.navigator?.onLine !== false }) {
  const usable = auth.configured && isDatabaseConfigured(config);
  let status = {
    state: usable ? 'idle' : 'disabled',
    message: !auth.configured ? '로그인 설정이 없어 동기화가 꺼져 있습니다.' : !isDatabaseConfigured(config) ? 'Database 주소가 없어 동기화가 꺼져 있습니다.' : '로그인하면 기록이 동기화됩니다.',
    lastOkAt: 0,
  };
  const listeners = new Set();
  let dbMod = null;
  let db = null;
  let running = false;
  let again = false;
  let timer = null;

  const set = (patch) => {
    status = { ...status, ...patch };
    listeners.forEach((fn) => {
      try {
        fn(status);
      } catch (e) {
        console.error(e);
      }
    });
  };

  async function ensureDb() {
    if (db) return;
    const app = auth.app;
    if (!app) throw new Error('로그인 모듈이 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.');
    dbMod = await importer(`${CDN}/firebase-database.js`);
    db = dbMod.getDatabase(app, config.databaseURL);
  }

  function schedule() {
    if (!usable) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      syncNow();
    }, debounceMs);
  }

  async function syncNow() {
    if (!usable) return status;
    const user = auth.state.user;
    if (!user) {
      set({ state: 'idle', message: '로그인하면 기록이 동기화됩니다.' });
      return status;
    }
    if (running) {
      again = true;
      return status;
    }
    running = true;
    set({ state: 'syncing', message: '' });
    try {
      await ensureDb();
      const base = `elec/users/${user.uid}`;
      const snap = await dbMod.get(dbMod.ref(db, base));
      store.attachUser(user.uid, snap.val() ?? {});
      const dirty = store.dirtySnapshot();
      const updates = {};
      for (const [id, s] of Object.entries(dirty.cards)) updates[`cards/${id}`] = s;
      for (const [d, v] of Object.entries(dirty.daily)) updates[`daily/${d}`] = v;
      if (Object.keys(updates).length > 0) {
        await dbMod.update(dbMod.ref(db, base), updates);
        store.markSynced(dirty);
      }
      set({ state: 'ok', message: '', lastOkAt: now() });
    } catch (e) {
      set(classifySyncError(e, isOnline()));
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule();
      }
    }
    return status;
  }

  function start() {
    store.subscribe((_p, meta) => {
      if (meta?.source !== 'sync') schedule(); // 서버 병합이 일으킨 변경은 다시 올리지 않는다(무한 루프 방지)
    });
    auth.subscribe((s) => {
      if (s.status === 'signed-in') syncNow();
      else if (s.status === 'signed-out') set({ state: 'idle', message: '로그인하면 기록이 동기화됩니다.' });
    });
    if (auth.state.status === 'signed-in') syncNow();
  }

  return {
    get status() {
      return status;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    start,
    syncNow,
    schedule,
  };
}
