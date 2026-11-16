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

export function render(container, app) {
  const { auth, data } = app;
  const s = auth.state;
  const updateMsg = h('p', { class: 'card-sub', role: 'status' });

  const accountCard = h(
    'div',
    { class: 'card' },
    h('p', { class: 'card-title' }, '계정'),
    h(
      'dl',
      { class: 'kv' },
      h('dt', null, '상태'), h('dd', null, STATUS_TEXT[s.status] ?? s.status),
      s.user ? [h('dt', null, '이름'), h('dd', null, s.user.name || '-'), h('dt', null, '이메일'), h('dd', null, s.user.email || '-')] : null,
    ),
    s.message ? h('p', { class: 'card-sub', style: 'margin-top:10px' }, s.message) : null,
    h(
      'div',
      { style: 'margin-top:12px' },
      s.status === 'signed-in'
        ? h('button', { class: 'btn is-secondary', type: 'button', onclick: () => auth.signOut() }, '로그아웃')
        : h('button', { class: 'btn', type: 'button', disabled: !(auth.configured && (s.status === 'signed-out' || s.status === 'error')), onclick: () => auth.signIn() }, 'Google로 로그인'),
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

  fill(container,
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
        h('dt', null, '앱 버전'), h('dd', null, APP_VERSION),
      ),
      h('div', { style: 'margin-top:12px; display:flex; gap:8px; flex-wrap:wrap' },
        data.dev ? h('a', { class: 'btn is-secondary', href: '?dev=0' }, '정식 모드로') : h('a', { class: 'btn is-secondary', href: '?dev=1' }, '개발 모드로'),
        h('button', { class: 'btn is-secondary', type: 'button', onclick: checkUpdate }, '업데이트 확인'),
      ),
      updateMsg,
    ),
  );
}
