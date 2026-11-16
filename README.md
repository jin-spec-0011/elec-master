# elec-master

2027 전기기사 필기·실기 연속 응시를 위한 퀘스트형 학습 PWA (바닐라 JS, Firebase Realtime Database, GitHub Pages).

## 현재 상태

| 단계 | 상태 |
|---|---|
| P1 레포·데이터 준비 | 진행 중 (카드 검수, 퀘스트 CSV 대기) |
| 문제 생성·검증 파이프라인 (Claude 생성 / Gemini 검수) | **보류 — 별도 프로젝트로 분기** |
| P4 앱 빌드 | 별도 계획서 승인 후 |

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

GOGO와 분리된 **새 Firebase 프로젝트**를 사용합니다. 데이터 경로는 `/elec` 접두를 유지합니다.

1. 새 프로젝트 생성 → Realtime Database를 **잠금 모드**로 생성합니다(테스트 모드 금지).
2. Authentication → Google 제공업체를 사용 설정하고, 승인된 도메인에 `jin-spec-0011.github.io`를 추가합니다.
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

## 보안

- `guard.yml`이 PDF와 자격 증명 패턴이 커밋되면 실패 처리합니다 (`bash tools/guard.sh`로 로컬 실행 가능).
- 기출 PDF, 서비스 계정 JSON, `.env`는 레포에 올리지 않습니다 (`.gitignore` 참고).
