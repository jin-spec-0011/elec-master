// Firebase 웹 앱 설정. 이 값들은 공개돼도 되는 식별자이며, 접근 통제는 database.rules.json 이 담당한다.
// 서비스 계정 JSON이나 비밀 키는 절대 넣지 마세요.
// databaseURL은 Realtime Database를 만든 뒤 콘솔 Realtime Database → 데이터 탭 상단의 주소를 붙여넣는다(P4-2에서 필요).
export const firebaseConfig = {
  apiKey: 'AIzaSyB3nXmgJRcE2IIr50TWzfo_COH9XCfnlW8',
  authDomain: 'elec-master.firebaseapp.com',
  projectId: 'elec-master',
  storageBucket: 'elec-master.firebasestorage.app',
  messagingSenderId: '3020358883',
  appId: '1:3020358883:web:ef135c1745e9238024f1d6',
  databaseURL: '',
};
