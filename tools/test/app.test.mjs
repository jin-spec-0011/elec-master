import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRoute } from '../../js/router.js';
import { TABS } from '../../js/tabs.js';
import { computeAvailability } from '../../js/quests.js';
import { selectCards, resolveDevMode, loadAll, DataError, validateCardsDoc, fetchJson } from '../../js/data.js';
import { isConfigValid, authErrorMessage, createAuth } from '../../js/auth.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir, acc = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, acc);
    else acc.push(rel);
  }
  return acc;
}

test('라우터: 탭 5개, 알 수 없는 해시는 맵으로', () => {
  assert.equal(TABS.length, 5);
  assert.equal(parseRoute('#/quests'), 'quests');
  assert.equal(parseRoute('#stats'), 'stats');
  assert.equal(parseRoute('#/nope'), 'map');
  assert.equal(parseRoute(''), 'map');
  assert.equal(parseRoute(undefined), 'map');
});

test('퀘스트 해금: 선행 완료 시 열림, 일일은 항상 가능', () => {
  const quests = [
    { id: 'Q1-01', type: 'main', prereq: [] },
    { id: 'Q1-02', type: 'main', prereq: ['Q1-01'] },
    { id: 'D-01', type: 'daily', prereq: [] },
  ];
  const a = computeAvailability(quests);
  assert.equal(a.get('Q1-01'), 'available');
  assert.equal(a.get('Q1-02'), 'locked');
  assert.equal(a.get('D-01'), 'available');
  const b = computeAvailability(quests, new Set(['Q1-01']));
  assert.equal(b.get('Q1-01'), 'done');
  assert.equal(b.get('Q1-02'), 'available');
});

test('카드 선택: 정식은 검수 OK만, 개발은 전체', () => {
  const cards = [{ id: 'a', reviewed: true }, { id: 'b', reviewed: false }];
  assert.deepEqual(selectCards(cards).map((c) => c.id), ['a']);
  assert.deepEqual(selectCards(cards, { dev: true }).map((c) => c.id), ['a', 'b']);
});

test('개발 모드 판정: 쿼리·저장값·저장소 오류', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  assert.equal(resolveDevMode('', storage), false);
  assert.equal(resolveDevMode('?dev=1', storage), true);
  assert.equal(resolveDevMode('', storage), true); // 저장됨
  assert.equal(resolveDevMode('?dev=0', storage), false);
  assert.equal(resolveDevMode('', storage), false);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(resolveDevMode('?dev=1', broken), true);
  assert.equal(resolveDevMode('', broken), false);
  assert.equal(resolveDevMode('?dev=1', null), true);
});

test('데이터 로딩: 실제 JSON 통과, HTTP 오류·잘못된 JSON·형식 오류 처리', async () => {
  const fetchFn = async (url) => ({ ok: true, status: 200, json: async () => JSON.parse(read(url)) });
  const data = await loadAll({ dev: true, fetchFn });
  assert.equal(data.cardsAll.length, 100);
  assert.equal(data.cards.length, 100);
  assert.equal(data.quests.length, 16);
  const prod = await loadAll({ dev: false, fetchFn });
  assert.equal(prod.cards.length, prod.cardsAll.filter((c) => c.reviewed).length);

  await assert.rejects(() => fetchJson('x.json', async () => ({ ok: false, status: 404 })), /HTTP 404/);
  await assert.rejects(() => fetchJson('x.json', async () => ({ ok: true, json: async () => { throw new Error('bad'); } })), /JSON/);
  await assert.rejects(() => fetchJson('x.json', async () => { throw new Error('offline'); }), DataError);
  assert.throws(() => validateCardsDoc({ cards: [{ id: 'a' }] }), /카드 형식 오류/);
});

test('인증: 설정 검증과 오류 메시지', () => {
  assert.equal(isConfigValid(null), false);
  assert.equal(isConfigValid({ apiKey: '', authDomain: '', databaseURL: '', projectId: '', appId: '' }), false);
  assert.equal(isConfigValid({ apiKey: 'a', authDomain: 'b', databaseURL: 'c', projectId: 'd', appId: 'YOUR_APP_ID' }), false);
  assert.equal(isConfigValid({ apiKey: 'a', authDomain: 'b', databaseURL: 'c', projectId: 'd', appId: 'e' }), true);
  assert.match(authErrorMessage('auth/unauthorized-domain'), /승인된 도메인/);
  assert.match(authErrorMessage('auth/unknown-x'), /auth\/unknown-x/);
});

test('인증: 설정이 비면 게스트 모드이고 SDK를 불러오지 않는다', async () => {
  let imported = 0;
  const auth = createAuth({ config: {}, importer: async () => { imported += 1; return {}; } });
  assert.equal(auth.state.status, 'guest');
  assert.equal(auth.configured, false);
  await auth.init();
  assert.equal(imported, 0);
});

function fakeSdk({ popupError } = {}) {
  const calls = [];
  let listener = null;
  const authObj = {};
  return {
    calls,
    emit: (user) => listener?.(user),
    app: { initializeApp: () => ({}) },
    authMod: {
      getAuth: () => authObj,
      onAuthStateChanged: (_a, ok) => { listener = ok; },
      getRedirectResult: async () => null,
      GoogleAuthProvider: class { setCustomParameters() {} },
      signInWithPopup: async () => { calls.push('popup'); if (popupError) { const e = new Error('x'); e.code = popupError; throw e; } },
      signInWithRedirect: async () => { calls.push('redirect'); },
      signOut: async () => { calls.push('signOut'); },
    },
  };
}
const VALID = { apiKey: 'a', authDomain: 'b', databaseURL: 'c', projectId: 'd', appId: 'e' };
const importerFor = (f) => async (url) => (url.endsWith('firebase-app.js') ? f.app : f.authMod);

test('인증: 로그인 상태 전이와 로그아웃', async () => {
  const f = fakeSdk();
  const auth = createAuth({ config: VALID, importer: importerFor(f) });
  assert.equal(auth.state.status, 'loading');
  await auth.init();
  f.emit({ uid: 'u1', displayName: '김', email: 'k@example.com' });
  assert.deepEqual(auth.state.user, { uid: 'u1', name: '김', email: 'k@example.com' });
  assert.equal(auth.state.status, 'signed-in');
  f.emit(null);
  assert.equal(auth.state.status, 'signed-out');
  await auth.signOut();
  assert.ok(f.calls.includes('signOut'));
});

test('인증: 팝업 차단 시 리디렉션으로 대체, 사용자가 닫으면 조용히 무시', async () => {
  const blocked = fakeSdk({ popupError: 'auth/popup-blocked' });
  const a1 = createAuth({ config: VALID, importer: importerFor(blocked) });
  await a1.init();
  await a1.signIn();
  assert.deepEqual(blocked.calls, ['popup', 'redirect']);

  const closed = fakeSdk({ popupError: 'auth/popup-closed-by-user' });
  const a2 = createAuth({ config: VALID, importer: importerFor(closed) });
  await a2.init();
  await a2.signIn();
  assert.deepEqual(closed.calls, ['popup']);
  assert.equal(a2.state.message, '');

  const domain = fakeSdk({ popupError: 'auth/unauthorized-domain' });
  const a3 = createAuth({ config: VALID, importer: importerFor(domain) });
  await a3.init();
  await a3.signIn();
  assert.match(a3.state.message, /승인된 도메인/);
});

test('인증: SDK 로딩 실패는 unavailable(게스트 계속)', async () => {
  const auth = createAuth({ config: VALID, importer: async () => { throw new Error('offline'); } });
  await auth.init();
  assert.equal(auth.state.status, 'unavailable');
});

test('서비스워커: 프리캐시 목록이 실제 파일과 정확히 일치', () => {
  const sw = read('sw.js');
  const listOf = (name) => {
    const m = sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
    assert.ok(m, `${name} 목록을 찾지 못했습니다.`);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  };
  const shellActual = ['index.html', 'manifest.json', ...walk('css'), ...walk('js'), ...walk('icons')].sort();
  assert.deepEqual(listOf('SHELL_FILES'), shellActual);
  const dataListed = listOf('DATA_FILES');
  assert.deepEqual(dataListed, ['data/cards.json', 'data/freqmap.json', 'data/quests/ch1.json']);
  dataListed.forEach((f) => assert.ok(existsSync(join(ROOT, f)), `${f} 없음`));
});

test('Pages 배포: 앱 파일에 절대 경로(/로 시작)가 없다', () => {
  const files = ['index.html', 'manifest.json', 'sw.js', ...walk('css'), ...walk('js')];
  const patterns = [
    /\b(?:src|href)=["']\/(?!\/)/,
    /url\(\s*["']?\/(?!\/)/,
    /fetch\(\s*["'`]\/(?!\/)/,
    /from\s+["']\/(?!\/)/,
    /import\(\s*["'`]\/(?!\/)/,
    /register\(\s*["']\/(?!\/)/,
    /"(?:start_url|scope|src)"\s*:\s*"\/(?!\/)/,
  ];
  for (const f of files) {
    const text = read(f);
    for (const p of patterns) assert.ok(!p.test(text), `${f}: 절대 경로 발견 (${p})`);
  }
});

test('매니페스트: 상대 start_url·scope와 아이콘 파일 존재', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  for (const icon of m.icons) assert.ok(existsSync(join(ROOT, icon.src)), `${icon.src} 없음`);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('index.html: 필수 메타와 모든 로컬 참조 파일 존재', () => {
  const html = read('index.html');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-touch-icon/);
  const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]).filter((r) => !/^https?:/.test(r));
  assert.ok(refs.length >= 4);
  for (const r of refs) assert.ok(existsSync(join(ROOT, r)), `index.html 참조 파일 없음: ${r}`);
  assert.equal(relative(ROOT, join(ROOT, '.nojekyll')), '.nojekyll');
  assert.ok(existsSync(join(ROOT, '.nojekyll')));
});
