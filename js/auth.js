// Google 로그인. Firebase SDK는 설정이 있을 때만 CDN(고정 버전)에서 동적으로 불러온다.
// 설정이 비어 있거나 모듈을 불러오지 못하면 게스트(로컬) 모드로 계속 동작한다.
import { firebaseConfig } from './firebase-config.js';

export const FIREBASE_SDK_VERSION = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
// 로그인에는 databaseURL이 필요 없다. Realtime Database 연동(P4-2)부터 isDatabaseConfigured로 따로 확인한다.
const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];

/** 필수 키가 모두 채워진 문자열인지(자리표시 값 제외) 확인한다. */
export function isConfigValid(cfg) {
  return (
    !!cfg &&
    typeof cfg === 'object' &&
    REQUIRED_KEYS.every((k) => typeof cfg[k] === 'string' && cfg[k].trim() !== '' && !/^(YOUR_|<|TODO)/i.test(cfg[k].trim()))
  );
}

/** Realtime Database 주소가 채워져 있는지 확인한다. */
export function isDatabaseConfigured(cfg) {
  return typeof cfg?.databaseURL === 'string' && /^https:\/\/.+\.(firebaseio\.com|firebasedatabase\.app)\/?$/.test(cfg.databaseURL.trim());
}

const MESSAGES = {
  'auth/unauthorized-domain': '이 주소가 Firebase 승인된 도메인에 없습니다. Authentication → 설정 → 승인된 도메인에 jin-spec-0011.github.io를 추가하세요.',
  'auth/operation-not-allowed': 'Firebase 콘솔에서 Google 로그인이 사용 설정되지 않았습니다.',
  'auth/network-request-failed': '네트워크 오류입니다. 연결을 확인한 뒤 다시 시도하세요.',
  'auth/popup-blocked': '팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용하세요.',
  'auth/too-many-requests': '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  'auth/user-disabled': '비활성화된 계정입니다.',
  'auth/web-storage-unsupported': '이 브라우저는 로그인에 필요한 저장소를 지원하지 않습니다(시크릿 모드·저장소 차단 확인).',
};

export function authErrorMessage(code) {
  return MESSAGES[code] ?? `로그인에 실패했습니다.${code ? ` (${code})` : ''}`;
}

/**
 * 인증 컨트롤러를 만든다. 테스트에서는 config·importer를 주입한다.
 * state.status: guest | loading | signed-in | signed-out | unavailable | error
 */
export function createAuth({ config = firebaseConfig, importer = (url) => import(url) } = {}) {
  const configured = isConfigValid(config);
  let state = {
    status: configured ? 'loading' : 'guest',
    user: null,
    message: configured ? '' : 'Firebase 설정이 없어 게스트(로컬) 모드로 실행 중입니다.',
  };
  const listeners = new Set();
  let sdk = null;
  let auth = null;

  const set = (patch) => {
    state = { ...state, ...patch };
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (e) {
        console.error(e);
      }
    });
  };

  async function init() {
    if (!configured) return state;
    try {
      const [appMod, authMod] = await Promise.all([importer(`${CDN}/firebase-app.js`), importer(`${CDN}/firebase-auth.js`)]);
      const app = appMod.initializeApp(config);
      sdk = authMod;
      auth = authMod.getAuth(app);
      authMod.onAuthStateChanged(
        auth,
        (user) =>
          set(
            user
              ? { status: 'signed-in', user: { uid: user.uid, name: user.displayName ?? '', email: user.email ?? '' }, message: '' }
              : { status: 'signed-out', user: null, message: '' },
          ),
        (err) => set({ status: 'error', message: authErrorMessage(err?.code) }),
      );
      try {
        await authMod.getRedirectResult(auth);
      } catch (e) {
        set({ status: 'error', message: authErrorMessage(e?.code) });
      }
    } catch {
      set({ status: 'unavailable', message: '로그인 모듈을 불러오지 못했습니다(오프라인일 수 있음). 게스트 모드로 계속합니다.' });
    }
    return state;
  }

  async function signIn() {
    if (!sdk || !auth) {
      set({ message: '로그인을 사용할 수 없습니다. 설정과 네트워크를 확인하세요.' });
      return;
    }
    const provider = new sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await sdk.signInWithPopup(auth, provider);
    } catch (e) {
      const code = e?.code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await sdk.signInWithRedirect(auth, provider);
          return;
        } catch (e2) {
          set({ message: authErrorMessage(e2?.code) });
          return;
        }
      }
      set({ message: authErrorMessage(code) });
    }
  }

  async function signOut() {
    if (!sdk || !auth) return;
    try {
      await sdk.signOut(auth);
    } catch (e) {
      set({ message: authErrorMessage(e?.code) });
    }
  }

  return {
    get state() {
      return state;
    },
    get configured() {
      return configured;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    init,
    signIn,
    signOut,
  };
}
