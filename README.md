# elec-master

2027 전기기사 필기·실기 연속 응시를 위한 퀘스트형 학습 PWA (바닐라 JS, Firebase Realtime Database, GitHub Pages).

## 현재 상태

| 단계 | 상태 |
|---|---|
| P1 레포·데이터 준비 | 진행 중 (카드 검수, 퀘스트 CSV 대기) |
| 문제 생성·검증 파이프라인 (Claude 생성 / Gemini 검수) | **보류 — 별도 프로젝트로 분기** |
| P4-1 앱 뼈대(5탭·PWA·이메일 로그인·데이터 로딩) | 완료·배포됨 |
| P4-2 공식카드 복습(간격 반복·오답 이유·기록 동기화) | 구현 완료, 승인 대기 |
| P4-3~6 문제 엔진·퀘스트 엔진·UI 마감·QA | 승인된 계획서 순서대로 진행 |

## 데이터

| 파일 | 설명 | 생성 방법 |
|---|---|---|
| `data/freqmap.json` | 62개 단원 출제비중 | 제공 파일 |
| `data/src/cards.csv` → `data/cards.json` | 공식카드 100장. `reviewed:true`(검수 OK)만 앱에서 사용 | `npm run convert:cards` |
| `data/src/quests-ch1.csv` → `data/quests/ch1.json` | 1챕터 퀘스트 | `npm run convert:quests` |
| `database.rules.json` | 전용 Realtime Database 전체 규칙 (콘솔에 그대로 붙여넣기) | 직접 작성 |

CSV는 엑셀에서 **"CSV UTF-8"** 로 저장하세요. 수정 후에는 변환 → 검증 순서로 실행합니다.

```bash
npm run convert:cards
npm run validate
npm run validate:strict   # P1 완료 판정: 검수 OK가 아닌 카드가 있으면 실패
npm test
```

## Firebase 설정과 규칙 (전용 Realtime Database)

GOGO와 분리된 **새 Firebase 프로젝트(elec-master)** 와 Realtime Database(싱가포르)를 사용합니다. 데이터 경로는 `/elec` 접두를 유지합니다.

1. 새 프로젝트 생성 → Realtime Database를 **잠금 모드**로 생성합니다(테스트 모드 금지).
2. Authentication → Sign-in method에서 **이메일/비밀번호**를 사용 설정하고(이메일 링크는 끔), Users → 사용자 추가로 본인 계정을 직접 만듭니다. 계정 생성 후 설정 → 사용자 작업에서 **가입 비활성화**를 켭니다(앱에는 가입 기능이 없음).
3. 규칙 탭에 `database.rules.json` **전체 내용**을 붙여넣고 게시합니다(루트는 기본 거부).
4. Rules Playground에서 아래 케이스를 확인합니다.

| 경로 | 동작 | 인증 | 기대 |
|---|---|---|---|
| `/elec/pool/S3-U02/q1` | 읽기 | 로그인 | 허용 |
| `/elec/pool/S3-U02/q1` | 읽기 | 비로그인 | 거부 |
| `/elec/pool/S3-U02/q1` | 쓰기 | 로그인 | 거부 |
| `/elec/meta/genlog/20261117` | 쓰기 | 로그인 | 거부 |
| `/elec/users/{내 uid}/attempts/q1` | 읽기·쓰기 | 내 uid | 허용 |
| `/elec/users/{다른 uid}/attempts/q1` | 읽기·쓰기 | 내 uid | 거부 |
| `/elec/x` 또는 `/` (elec 밖) | 읽기·쓰기 | 로그인 | 거부 |

서비스 계정(Admin SDK)은 규칙을 우회하므로 `pool`·`meta` 쓰기는 서비스 계정으로만 가능합니다.
GOGO와 UID가 다르므로 GOGO 데이터는 자동으로 이어지지 않습니다.

## 앱 실행과 배포

- 로컬 확인: `python3 -m http.server 8000` 후 `http://localhost:8000/?dev=1` (`?dev=1`은 검수 전 카드까지 사용, `?dev=0`으로 해제).
- 배포: `main`에 병합하면 GitHub Pages가 자동 게시합니다(`https://jin-spec-0011.github.io/elec-master/`). 서비스워커는 network-first라 배포 때 버전을 올릴 필요가 없습니다.
- 로그인: 이메일/비밀번호(프로필 탭). `js/firebase-config.js`의 `firebaseConfig`(공개용 값)가 비어 있으면 게스트(로컬) 모드로 동작합니다.
- 앱 파일을 추가·삭제하면 `sw.js`의 `SHELL_FILES`도 함께 고치세요(`npm test`가 불일치를 잡습니다). 경로는 모두 상대 경로여야 합니다.

## 학습 기록 저장 구조

- 로컬 우선: 브라우저 `localStorage`(`elec.v1.progress`)에 먼저 저장하고, 로그인 상태면 Firebase에 동기화합니다.
- 서버 경로: `elec/users/{uid}/cards/{카드ID}`(복습 단계·기한·오답 이유 집계), `elec/users/{uid}/daily/{yyyymmdd}`(일별 복습 수). 날짜는 KST 기준입니다.
- 복습 간격 1→3→7→14→30일, 틀리면 1일로 리셋, 30일 단계 정답이면 졸업. 새 카드는 하루 10장, 세션은 10장.
- 병합: 카드는 `last`가 최신인 쪽, 일별 집계는 항목별 최댓값. 게스트로 쌓은 기록은 첫 로그인 때 계정으로 올라갑니다.

## 보안

- `guard.yml`이 PDF와 자격 증명 패턴이 커밋되면 실패 처리합니다 (`bash tools/guard.sh`로 로컬 실행 가능).
- 기출 PDF, 서비스 계정 JSON, `.env`는 레포에 올리지 않습니다 (`.gitignore` 참고).
