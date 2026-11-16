import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseRoute } from '../../js/router.js';
import { TABS } from '../../js/tabs.js';
import { computeAvailability } from '../../js/quests.js';
import { selectCards, resolveDevMode, loadAll, DataError, validateCardsDoc, fetchJson } from '../../js/data.js';
import { isConfigValid, isDatabaseConfigured, authErrorMessage, createAuth, validateEmail, validateCredentials } from '../../js/auth.js';
import { firebaseConfig } from '../../js/firebase-config.js';

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
  assert.ok(data.drills.length >= 40);
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
  assert.equal(isConfigValid({ apiKey: 'a', authDomain: 'b', projectId: 'd', appId: 'e' }), true); // databaseURL 없이도 로그인 가능
  assert.equal(isConfigValid({ apiKey: 'a', authDomain: 'b', projectId: 'd' }), false);
  assert.equal(isDatabaseConfigured({ databaseURL: '' }), false);
  assert.equal(isDatabaseConfigured({ databaseURL: 'https://elec-master-default-rtdb.asia-southeast1.firebasedatabase.app' }), true);
  assert.equal(isDatabaseConfigured({ databaseURL: 'https://elec-master-default-rtdb.firebaseio.com/' }), true);
  assert.equal(isDatabaseConfigured({ databaseURL: 'http://evil.example.com' }), false);
  assert.match(authErrorMessage('auth/invalid-credential'), /올바르지 않습니다/);
  assert.match(authErrorMessage('auth/operation-not-allowed'), /이메일\/비밀번호/);
  assert.match(authErrorMessage('auth/unknown-x'), /auth\/unknown-x/);
});

test('실제 firebase-config.js: 로그인 설정 유효, 프로젝트가 elec-master', () => {
  assert.equal(isConfigValid(firebaseConfig), true);
  assert.equal(firebaseConfig.projectId, 'elec-master');
  assert.equal(firebaseConfig.authDomain, 'elec-master.firebaseapp.com');
  assert.equal(isDatabaseConfigured(firebaseConfig), true);
  assert.match(firebaseConfig.databaseURL, /asia-southeast1/);
});

test('인증: 설정이 비면 게스트 모드이고 SDK를 불러오지 않는다', async () => {
  let imported = 0;
  const auth = createAuth({ config: {}, importer: async () => { imported += 1; return {}; } });
  assert.equal(auth.state.status, 'guest');
  assert.equal(auth.configured, false);
  await auth.init();
  assert.equal(imported, 0);
});

test('입력 검사: 이메일 형식과 빈 값', () => {
  assert.equal(validateEmail(''), '이메일을 입력하세요.');
  assert.match(validateEmail('abc'), /형식/);
  assert.match(validateEmail('a@b'), /형식/);
  assert.equal(validateEmail(' me@example.com '), '');
  assert.equal(validateCredentials('me@example.com', ''), '비밀번호를 입력하세요.');
  assert.equal(validateCredentials('me@example.com', 'pw'), '');
});

function fakeSdk({ signInError, resetError } = {}) {
  const calls = [];
  let listener = null;
  const authObj = {};
  const fail = (code) => { const e = new Error(code); e.code = code; return e; };
  return {
    calls,
    emit: (user) => listener?.(user),
    app: { initializeApp: () => ({}) },
    authMod: {
      getAuth: () => authObj,
      onAuthStateChanged: (_a, ok) => { listener = ok; },
      signInWithEmailAndPassword: async (_a, email, pw) => { calls.push(['signIn', email, pw]); if (signInError) throw fail(signInError); },
      sendPasswordResetEmail: async (_a, email) => { calls.push(['reset', email]); if (resetError) throw fail(resetError); },
      signOut: async () => { calls.push(['signOut']); },
    },
  };
}
const VALID = { apiKey: 'a', authDomain: 'b', projectId: 'd', appId: 'e' };
const importerFor = (f) => async (url) => (url.endsWith('firebase-app.js') ? f.app : f.authMod);

test('인증: 로그인 상태 전이와 로그아웃', async () => {
  const f = fakeSdk();
  const auth = createAuth({ config: VALID, importer: importerFor(f) });
  assert.equal(auth.state.status, 'loading');
  await auth.init();
  f.emit({ uid: 'u1', displayName: '', email: 'k@example.com' });
  assert.deepEqual(auth.state.user, { uid: 'u1', name: '', email: 'k@example.com' });
  assert.equal(auth.state.status, 'signed-in');
  f.emit(null);
  assert.equal(auth.state.status, 'signed-out');
  await auth.signOut();
  assert.deepEqual(f.calls.at(-1), ['signOut']);
});

test('인증: 이메일 로그인 성공 시 공백 제거한 이메일로 호출', async () => {
  const f = fakeSdk();
  const auth = createAuth({ config: VALID, importer: importerFor(f) });
  await auth.init();
  assert.equal(await auth.signIn('  me@example.com ', 'secret-pass'), true);
  assert.deepEqual(f.calls[0], ['signIn', 'me@example.com', 'secret-pass']);
});

test('인증: 잘못된 입력은 SDK를 호출하지 않고, 서버 오류는 한국어 메시지로', async () => {
  const f = fakeSdk({ signInError: 'auth/invalid-credential' });
  const auth = createAuth({ config: VALID, importer: importerFor(f) });
  await auth.init();
  assert.equal(await auth.signIn('bad', 'x'), false);
  assert.equal(f.calls.length, 0);
  assert.match(auth.state.message, /형식/);
  assert.equal(await auth.signIn('me@example.com', 'wrong'), false);
  assert.equal(f.calls.length, 1);
  assert.match(auth.state.message, /이메일 또는 비밀번호가 올바르지 않습니다/);
});

test('인증: 로그인 전에 SDK가 준비되지 않으면 안내', async () => {
  const auth = createAuth({ config: VALID, importer: async () => { throw new Error('offline'); } });
  await auth.init();
  assert.equal(auth.state.status, 'unavailable');
  assert.equal(await auth.signIn('me@example.com', 'pw'), false);
  assert.match(auth.state.message, /사용할 수 없습니다/);
});

test('인증: 비밀번호 재설정은 계정 존재 여부를 노출하지 않는다', async () => {
  const ok = fakeSdk();
  const a1 = createAuth({ config: VALID, importer: importerFor(ok) });
  await a1.init();
  assert.equal(await a1.resetPassword('me@example.com'), true);
  const msg1 = a1.state.message;

  const missing = fakeSdk({ resetError: 'auth/user-not-found' });
  const a2 = createAuth({ config: VALID, importer: importerFor(missing) });
  await a2.init();
  assert.equal(await a2.resetPassword('nobody@example.com'), true);
  assert.equal(a2.state.message, msg1);

  const limited = fakeSdk({ resetError: 'auth/too-many-requests' });
  const a3 = createAuth({ config: VALID, importer: importerFor(limited) });
  await a3.init();
  assert.equal(await a3.resetPassword('me@example.com'), false);
  assert.match(a3.state.message, /너무 많아/);
  assert.equal(await a3.resetPassword('not-an-email'), false);
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
  assert.deepEqual(dataListed, ['data/cards.json', 'data/drills.json', 'data/freqmap.json', 'data/quests/ch1.json']);
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
