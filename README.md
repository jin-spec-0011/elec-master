# elec-master

2027 전기기사 필기·실기 연속 응시를 위한 퀘스트형 학습 PWA (바닐라 JS, Firebase Realtime Database, GitHub Pages).

## 현재 상태

| 단계 | 상태 |
|---|---|
| P1 레포·데이터 준비 | 진행 중 (카드 검수, 퀘스트 CSV 대기) |
| 문제 생성·검증 파이프라인 (Claude 생성 / Gemini 검수) | **보류 — 별도 프로젝트로 분기** |
| P4-1 앱 뼈대(5탭·PWA·이메일 로그인·데이터 로딩) | 완료·배포됨 |
| P4-2 공식카드 복습(간격 반복·오답 이유·기록 동기화) | 완료·배포됨 |
| P4-3 문제 엔진(4지·2×2 매칭·공식 빈칸)·계산 드릴 | 완료·배포됨 |
| P4-4 퀘스트 엔진(자동 판정·XP·레벨·연속일·보스) | 완료·배포됨 |
| P4-5 UI 마감(내 학습 통계·맵 연결선·접근성·전환 효과) | 구현 완료, 승인 대기 |
| P4-6 실기기 QA·배포 절차 | 승인된 계획서 순서대로 진행 |

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

## 문제 풀이와 계산 드릴

- **문제 풀이**(`#/quiz`): 카드에서 객관식을 자동 생성합니다(AI 호출 없음). 정답은 카드 뒷면, 오답 보기는 다른 카드의 뒷면·토큰입니다. 4지 선택, 2×2 매칭, 공식 빈칸(숫자·기호 토큰만). 결과는 카드 복습 기록(SRS)에 반영됩니다.
- **계산 드릴**(`#/drill`): `data/drills.json` 템플릿에 난수를 넣어 문제를 만들고 숫자 키패드로 답합니다. 정답은 코드로 계산하므로 오답이 나올 수 없고, 허용 오차는 기본 1%입니다. 결과는 `drill/{과목}`에 누적됩니다(퀘스트 Q1-07·D-02 판정용).
- 드릴 템플릿 필드: `id`(DR-…), `card`, `subject`, `stem`·`solution`(`{변수}`·`{answer}` 자리표시), `answer`(수식: `+ - * / ^ ( )`, `sqrt sin cos tan atan abs ln log10 pi`, 각도는 도 단위), `vars`(`values` 목록) 또는 `sets`(묶음), `unit`, `decimals`, `tol`, `example`(독립 계산한 예시값, 검증기가 대조).
- 템플릿을 추가·수정하면 `npm run validate`와 `npm test`로 수식·치환·예시값을 확인하세요.

## 퀘스트 엔진

- **자동 판정**: 학습 기록이 바뀔 때마다 `js/runner.js`가 `data/quests/ch1.json`의 판정 지표로 달성 여부를 계산합니다(수동 완료 버튼 없음). 선행 퀘스트가 완료·건너뜀이어야 해금되며, 연쇄 해금은 한 번에 처리됩니다.
- **지표**: `cards_seen`(복습한 서로 다른 카드 수), `cards_correct:시작..끝`(범위 안에서 한 번이라도 맞힌 카드 수), `drill_correct:과목`(드릴 누적 정답), `boss_ch1_correct`(한 번의 도전에서 맞힌 최대 문제 수), `daily_cards_reviewed`, `daily_drill_correct`, `daily_due_cleared`(복습 예정 카드를 모두 처리하고 새 카드가 아닌 카드를 1장 이상 복습한 날).
- **XP**: 메인·보스는 완료 시 한 번, 일일 퀘스트는 `날짜/퀘스트ID` 장부로 하루 한 번만 지급합니다. 레벨은 누적 XP로 `50·(n−1)·n`(L2 100, L3 300, L4 600, L5 1000 …).
- **실패와 건너뛰기**: 진행 중인(해금된) 메인 퀘스트의 범위 카드·과목 드릴에서 틀리면 실패 횟수가 늘고, 3회 이상이면 건너뛸 수 있습니다(XP 없음). 보스는 건너뛸 수 없습니다.
- **보스전**(`#/boss`): 챕터 카드에서 10문제, 하트 3개, 8문제 이상 맞히고 하트가 남으면 클리어. 카드 복습 간격에는 영향이 없습니다.
- **연속 학습일**: 카드 복습·드릴·보스 도전 중 하나라도 한 날. 오늘 아직 안 했으면 어제까지의 연속을 유지합니다.
- 서버 경로: `quests/{퀘스트ID}`, `xplog/{날짜}/{D-xx}`, `boss/{ch1}` (모두 `users/$uid` 규칙으로 본인만 접근).

## 통계 탭

- 최근 7일 푼 문제 수(카드 복습 + 계산 드릴), 과목별 카드 정답률, 과목별 드릴 정답률, 틀린 이유 4분류 누적, 자주 틀리는 카드 TOP 5, 기출 빈도.
- 차트는 단일 색의 얇은 막대(두께 24px 이하)이며, 값은 오늘·최댓값에만 표시하고 나머지는 막대를 탭하거나 포커스하면 툴팁으로 보입니다. 모든 차트에 "표로 보기"(스크린 리더용 표)가 있고 라이트·다크 모드를 지원합니다.
- 계산 로직은 `js/stats.js`(순수 함수), 그리기는 `js/ui/charts.js`입니다.

## 보안

- `guard.yml`이 PDF와 자격 증명 패턴이 커밋되면 실패 처리합니다 (`bash tools/guard.sh`로 로컬 실행 가능).
- 기출 PDF, 서비스 계정 JSON, `.env`는 레포에 올리지 않습니다 (`.gitignore` 참고).
