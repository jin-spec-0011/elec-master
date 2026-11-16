import { h, fill } from '../dom.js';
import { pageTitle, sectionTitle, notice } from './common.js';
import { APP_VERSION } from '../version.js';

const STATUS_TEXT = {
  guest: '게스트(로컬) 모드',
  loading: '로그인 모듈 확인 중…',
  'signed-in': '로그인됨',
  'signed-out': '로그아웃 상태',
  unavailable: '로그인 사용 불가(게스트)',
  error: '로그인 오류',
};

// 인증 상태 변경으로 화면이 다시 그려져도 입력한 이메일이 사라지지 않게 보관한다(비밀번호는 보관하지 않음).
let draftEmail = '';

const SYNC_TEXT = {
  disabled: '꺼짐',
  idle: '대기',
  syncing: '동기화 중…',
  ok: '완료',
  offline: '오프라인',
  error: '오류',
};

function syncTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return ` (${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')})`;
}

function loginForm(auth) {
  const canUse = auth.configured && (auth.state.status === 'signed-out' || auth.state.status === 'error');
  const email = h('input', {
    id: 'login-email',
    class: 'field',
    type: 'email',
    name: 'email',
    autocomplete: 'username',
    inputmode: 'email',
    autocapitalize: 'none',
    autocorrect: 'off',
    spellcheck: 'false',
    required: true,
    disabled: !canUse,
    value: draftEmail,
  });
  const password = h('input', {
    id: 'login-password',
    class: 'field',
    type: 'password',
    name: 'password',
    autocomplete: 'current-password',
    required: true,
    disabled: !canUse,
  });
  const submit = h('button', { class: 'btn', type: 'submit', disabled: !canUse }, '로그인');
  const reset = h('button', { class: 'btn is-secondary', type: 'button', disabled: !canUse }, '비밀번호 재설정 메일');

  email.addEventListener('input', () => {
    draftEmail = email.value;
  });

  const busy = (on) => {
    [email, password, submit, reset].forEach((el) => {
      el.disabled = on || !canUse;
    });
  };

  const form = h(
    'form',
    {
      novalidate: true,
      onsubmit: async (e) => {
        e.preventDefault();
        busy(true);
        const ok = await auth.signIn(email.value, password.value);
        if (!ok) {
          busy(false);
          password.value = '';
        }
      },
    },
    h('label', { class: 'label', for: 'login-email' }, '이메일'),
    email,
    h('label', { class: 'label', for: 'login-password' }, '비밀번호'),
    password,
    h('div', { class: 'form-actions' }, submit, reset),
  );

  reset.addEventListener('click', async () => {
    busy(true);
    await auth.resetPassword(email.value);
    busy(false);
  });
  return form;
}

export function render(container, app) {
  const { auth, data, sync, store } = app;
  const s = auth.state;
  const ss = sync.status;
  const updateMsg = h('p', { class: 'card-sub', role: 'status' });

  const accountCard = h(
    'div',
    { class: 'card' },
    h('p', { class: 'card-title' }, '계정'),
    h(
      'dl',
      { class: 'kv' },
      h('dt', null, '상태'), h('dd', null, STATUS_TEXT[s.status] ?? s.status),
      s.user ? [h('dt', null, '이메일'), h('dd', null, s.user.email || '-')] : null,
    ),
    s.message ? h('p', { class: 'card-sub', role: 'alert', style: 'margin-top:10px' }, s.message) : null,
    h(
      'div',
      { style: 'margin-top:12px' },
      s.status === 'signed-in'
        ? h('button', { class: 'btn is-secondary', type: 'button', onclick: () => auth.signOut() }, '로그아웃')
        : auth.configured && s.status !== 'unavailable'
          ? loginForm(auth)
          : null,
    ),
  );

  const checkUpdate = async () => {
    const reg = app.swReg;
    if (!reg) {
      updateMsg.textContent = '서비스워커가 없어 확인할 수 없습니다(오프라인 설치 전이거나 미지원 브라우저).';
      return;
    }
    try {
      await reg.update();
      updateMsg.textContent = '확인 완료. 새 버전은 앱을 완전히 종료했다가 다시 열면 적용됩니다.';
    } catch {
      updateMsg.textContent = '업데이트를 확인하지 못했습니다. 네트워크를 확인하세요.';
    }
  };

  fill(
    container,
    pageTitle('프로필'),
    !auth.configured ? notice('Firebase 설정이 비어 있어 로그인·동기화는 꺼져 있습니다. js/firebase-config.js 를 채우면 활성화됩니다.') : null,
    accountCard,
    sectionTitle('데이터'),
    h(
      'div',
      { class: 'card' },
      h(
        'dl',
        { class: 'kv' },
        h('dt', null, '모드'), h('dd', null, data.dev ? '개발 (?dev=1)' : '정식'),
        h('dt', null, '카드(전체/사용)'), h('dd', null, `${data.cardsAll.length} / ${data.cards.length}`),
        h('dt', null, '퀘스트'), h('dd', null, `${data.quests.length}개`),
        h('dt', null, '동기화'), h('dd', null, `${SYNC_TEXT[ss.state] ?? ss.state}${ss.state === 'ok' ? syncTime(ss.lastOkAt) : ''}`),
        h('dt', null, '앱 버전'), h('dd', null, APP_VERSION),
      ),
      ss.message ? h('p', { class: 'card-sub', style: 'margin-top:10px', role: 'status' }, ss.message) : null,
      !store.persistOk ? h('p', { class: 'card-sub', role: 'alert' }, '이 브라우저에 학습 기록을 저장하지 못하고 있습니다(저장소 차단·용량). 로그인하면 서버에는 저장됩니다.') : null,
      h('div', { style: 'margin-top:12px; display:flex; gap:8px; flex-wrap:wrap' },
        data.dev ? h('a', { class: 'btn is-secondary', href: '?dev=0' }, '정식 모드로') : h('a', { class: 'btn is-secondary', href: '?dev=1' }, '개발 모드로'),
        h('button', { class: 'btn is-secondary', type: 'button', onclick: checkUpdate }, '업데이트 확인'),
        h('button', { class: 'btn is-secondary', type: 'button', disabled: ss.state === 'disabled' || ss.state === 'syncing', onclick: () => sync.syncNow() }, '지금 동기화'),
      ),
      updateMsg,
    ),
  );
}
