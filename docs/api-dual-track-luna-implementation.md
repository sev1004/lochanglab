# 개인 키 우선·운영 키 보조 API 구현 계획

## 2026-09-29 리뷰 수정 검증

- 요청별 오류 endpoint를 기록하도록 수정했다. optional 401/403도 인증 오류로 전달한다.
- optional fallback은 반환하되 캐시하지 않는다. 병렬 요청 종료 후 inFlight를 정리한다.
- Retry-After 초/날짜를 처리하고, 유효하지 않으면 30초를 사용한다. blocked-until:v1 저장으로 재생성 후에도 신규 upstream 호출을 차단한다. 이미 진행 중인 요청은 남을 수 있다.
- Node 모의 실행 Worker 테스트 17개 통과: 101개 동시 조회, 인증, 실패 재시도, fallback 미캐시, 429 재생성, timeout 예외, JSON/저장소 오류, OFF 차단. Cloudflare 실환경 검증과 실제 시간 경과 timeout 검증은 별도다.
- UPSTREAM_REQUEST_LIMIT=0은 자체 예산 제한 비활성이다. upstream 429 공통 차단은 0이어도 적용된다.
- 운영 TypeError의 근본 원인은 아직 미확인이다. 이번 작업은 로컬 수정이며 배포하지 않았다.
- 후속 승인 배포 명령: npx wrangler deploy --config workers/lostark-api/wrangler.jsonc --var OPERATOR_LOOKUP_ENABLED:true
- 기본 OFF 덮어쓰기와 로그 설정을 배포 후 확인한다. 롤백은 본문 R1~R4를 따른다.

작성일: 2026-09-29. 상태: A~C 구현 진행 중. 운영 배포·실서비스 검증 전.

## 1. Luna 작업 지시와 범위

`AGENTS.md`, 이 문서, `docs/ui-layout-rules.md`, 관련 Next.js 로컬 문서를 읽고 A부터 F까지 순서대로 구현한다. 각 단계의 핵심 테스트가 통과하면 다음 단계로 진행하고 결과를 이 문서에 기록한다. G는 실제 배포 승인 이후 수행한다. 기존 사용자 변경을 보존한다.

목적은 개인 API 키를 입력하지 않아도 캐릭터를 검색할 수 있도록 하는 것이다. 개인 키 입력 UI·선택적 저장·삭제 기능은 유지한다. 일반 DPS, 전투 시뮬레이션, 프리셋, 세팅 저장 구조를 변경하지 않는다. 실패 테스트 삭제·허용오차 완화로 통과시키지 않는다.

확정 운영 origin은 `https://lochanglab.pages.dev`다. Cloudflare 계정 보유와 CLI 인증 완료를 혼동하지 않는다. 계정 이메일은 인증 증거가 아니다. 운영 키를 채팅·소스·명령행 인수로 받지 않고 사용자가 Secret으로 등록한다.

## 2. 확정 분기 계약

| 검색 시 상태 | 실행 경로 | 실패 시 처리 |
| --- | --- | --- |
| 공백 제거 후 개인 키 있음 | 브라우저 → Lost Ark API | 개인 키 오류 안내. 운영 키 자동 재시도 없음 |
| 개인 키 없음 + 운영 경로 설정됨 | 브라우저 → Worker → Lost Ark API | 운영 조회 오류 안내, 개인 키 설정 안내 |
| 개인 키 없음 + 운영 경로 비활성/미설정 | 기존 개인 키 입력 안내 | Worker 호출 없음 또는 비활성 응답 처리 |

개인 키는 Worker 요청의 헤더·본문·쿼리·로그에 절대 전달하지 않는다. Worker가 중단되어도 개인 키 경로는 Worker 상태 확인 없이 바로 동작해야 한다. 사용자가 개인 키를 지우고 다시 검색하면 운영 경로를 사용한다. 잘못된 개인 키를 자동으로 지우지 않는다.

검색 시작 시 캐릭터명과 경로를 확정한다. 요청 중 키 입력 변경으로 경로를 바꾸지 않는다. 늦게 도착한 이전 검색 응답이 새 검색 결과를 덮지 않게 요청 식별자 또는 취소 처리를 적용한다.

## 3. 현재 코드에서 확인한 충돌 지점

- `src/lib/lostark-api/client.ts`: `fetchCharacter(name, apiKey)`가 기본 armory 조회 후 arkpassive·arkgrid를 추가 조회한다. 캐릭터 검색 한 번은 현재 최대 3개 upstream 요청이다.
- `src/app/page.tsx`: `search()`가 키가 없으면 바로 API 메뉴로 이동한다. 이 검사를 분기 계약에 맞춰 변경해야 한다.
- 개인 키는 선택적으로 localStorage에 저장된다. `docs/deployment.md`, `docs/development-guide.md`, `docs/implementation-plan.md`의 “저장하지 않는다” 설명은 현재 코드와 다르다.
- `next.config.ts`는 `output: "export"`다. 운영 API를 Next Route Handler로 추가해 정적 배포에서 실행된다고 가정하면 안 된다.
- GitHub Actions용 basePath 분기가 존재한다. Cloudflare 실제 프로젝트의 빌드 명령·출력 디렉터리·환경을 확인하고 기존 배포 경로를 임의로 변경하지 않는다.
- 현재 `optionalRequest`는 404/500/503에 기존 armory 필드로 fallback한다. 개인 키 경로의 이 계약을 이번 작업에서 조용히 변경하지 않는다.
- 현재 npm test는 테스트 파일 목록을 명시한다. 새 테스트는 실행 스크립트와 CI에 실제로 등록해야 한다.

## 4. 목표 구성과 변경 파일

정적 프론트는 유지하고 별도 Worker를 추가한다. 성공 데이터는 양쪽 모두 기존 `CharacterApiResponse`와 동일하며 `mapCharacterResponse` 이후 처리를 공유한다.

예정 파일(이름은 역할이 유지되는 범위에서 조정 가능):

| 파일 | 역할 |
| --- | --- |
| `src/lib/lostark-api/client.ts` | 공개 검색 함수와 개인 키 우선 분기 |
| `src/lib/lostark-api/operator-client.ts` | Worker 호출·응답 검증·오류 변환 |
| `src/app/page.tsx` | 키 없는 검색 허용, 오류 및 조회 시각 안내 |
| `workers/lostark-api/src/index.ts` | HTTP 입력 검증, CORS, 응답 |
| `workers/lostark-api/src/upstream.ts` | 고정 Lost Ark 경로 호출·응답 조합 |
| `workers/lostark-api/src/coordinator.ts` | Durable Object의 캐시·동시 요청 통합·전역 예산 |
| `workers/lostark-api/wrangler.jsonc` | 환경별 Worker 설정·DO binding·migration |
| `workers/lostark-api/package.json`, lockfile, tsconfig | Worker 의존성과 검사 분리 |
| API 전용 테스트, CI, 환경 예시, 문서 | 회귀·운영·롤백 검증 |

Worker 런타임 의존성을 브라우저 번들로 import하지 않는다. 공유하는 타입·순수 매핑만 의존성 없이 재사용한다. Worker 코드가 루트 Next TypeScript 검사에 잘못 포함되지 않도록 검사 범위를 정리하고 Worker 자체 타입 검사를 별도로 필수화한다. 도구 버전은 구현 시 확인해 고정하고 불필요한 기존 의존성 업그레이드는 하지 않는다.

## 5. API·캐시·호출량 계약

### HTTP

- `GET /v1/characters?name=...`, OPTIONS 지원. 다른 메서드·경로·알 수 없는 쿼리는 명시적으로 거부한다.
- 이름은 trim 및 NFC 정규화. 빈 값·제어문자·과도한 길이를 거부한다. 게임의 유효 문자 규칙은 공식 근거 확인 없이 좁히지 않는다. 이름은 경로 조각으로 encode한다.
- 임의 upstream URL·경로·Authorization을 입력받지 않는다. upstream redirect는 자동 추종하지 않는다.
- 성공은 `{ data: CharacterApiResponse, meta: { fetchedAt, expiresAt, cache: "hit" | "miss" | "coalesced", schemaVersion: 1 } }` 형태로 한다. 프론트에서 data만 기존 mapper에 전달한다.
- 오류는 `{ error: { code, message, requestId, retryAfterSeconds? } }`. 원문 upstream 오류·토큰·stack을 반환하지 않는다.
- `Cache-Control: no-store`로 브라우저/CDN의 별도 캐시를 막고 내부 캐시만 통제한다.
- 운영 CORS는 정확한 origin 일치. 로컬 localhost:3000은 개발 환경에서만 허용. preview는 필요한 origin을 명시한다. `*`, 쿠키 credentials는 사용하지 않는다. 오류 응답에도 허용 origin의 CORS를 적용한다. CORS는 인증 수단이 아니므로 호출량 제한은 별도로 적용한다.

### 60초 캐시

- 운영 경로에만 적용한다. 성공 조회 완료 시각부터 60초, 만료 시각 이상이면 재조회한다. cache hit로 만료를 연장하지 않는다.
- 캐시 키는 schemaVersion + 정규화 이름. 사용자 키를 포함하지 않는다.
- 같은 이름의 동시 요청은 하나의 조회 작업을 공유한다. “한 작업”은 현재 최대 3번의 upstream 호출이며 1회 HTTP 호출을 뜻하지 않는다.
- 완전한 성공 결과만 캐시한다. 오류·부분 응답을 정상 캐시로 저장하지 않는다. 기존 optional fallback으로 응답한 경우 별도 degraded 판정 후 캐시하지 않는다.
- 만료 후 upstream 실패 시 오래된 값을 새 결과로 반환하지 않는다. 화면의 기존 캐릭터는 유지하고 실패를 표시한다.
- 캐시에는 개수/크기 상한과 만료 정리가 있어야 한다. 초기 제안 상한은 100개, 값은 설정으로 분리한다. 응답 크기와 실제 Worker 메모리 한도를 확인한다.
- 표시 문구는 “조회 시각 … · 최대 60초 내 조회 결과가 재사용될 수 있습니다” 정도로 제한한다. 스킬·장비 편집 자체는 API 재조회 대상이 아니다.

### 전역 예산과 동시성

- 운영 키별 고정 ID의 Durable Object 하나를 통해 모든 upstream 호출을 통과시킨다. Worker 전역 Map만으로 여러 인스턴스의 호출 제한을 구현하지 않는다.
- 공식 키 제한/창 단위를 MY CLIENTS 및 응답 헤더에서 확인한다. 분당 100회를 확정값으로 하드코딩하지 않는다. 실제 값을 확보하지 못하면 mock 검증을 진행하고 운영 활성화는 보류한다.
- 예산은 검색 횟수가 아니라 실제 HTTP 호출 수다. 추가 조회·재시도도 소비한다. cache hit/coalesced follower는 추가 upstream 예산을 소비하지 않는다.
- 시작 전 3개 호출에 필요한 슬롯을 원자적으로 예약하는 보수적 구현을 우선한다. 미전송 슬롯 반환과 전송 후 실패 슬롯 유지 규칙을 테스트한다.
- 예산 카운터/차단 종료 시각은 재시작 후 초기화되어 한도를 우회하지 않게 저장한다. 저장 형식은 버전 관리한다. async 대기 중 다른 요청의 진입을 고려해 예약을 처리한다.
- 첫 버전은 긴 대기열 없이 예산 부족 시 429와 Retry-After를 반환한다. upstream 429 이후 재시도 가능 시각까지 공통 차단한다. 브라우저 무한 자동 재시도는 금지한다.
- timeout 초기 제안: upstream 각 8초, 전체 작업 20초, 브라우저 25초. 작업 종료/실패 시 in-flight 항목은 finally로 정리한다. follower 하나의 취소로 공유 작업 전체를 취소하지 않는다.
- 401/403은 운영 인증 문제로 503 `OPERATOR_AUTH_UNAVAILABLE`; 이름 없음 404; 예산/429는 429; upstream 5xx는 502; timeout은 504; 비활성은 503 `OPERATOR_DISABLED`로 구분한다.
- 첫 버전은 upstream 자동 재시도 0회로 시작한다. 개인 키 경로 오류를 운영 예산으로 우회하지 않는다.
- IP 제한은 보조 수단이다. 전역 예산으로 운영 키를 보호하되 공개 서비스의 남용을 완전히 막는다고 주장하지 않는다. 필요 시 Turnstile은 별도 후속 범위다.

## 6. 단계별 구현·검증·중단 기준

### A. 기준 확보 및 롤백 지점 기록

1. git status/현재 SHA/배포 중인 Pages deployment ID를 기록한다. 사용자 변경 파일을 따로 목록화한다. `.codex`, 분석데이터 등 unrelated 파일을 포함하지 않는다.
2. 실제 Cloudflare Pages 프로젝트의 production branch, build/output 설정, 현재 정상 주소를 확인한다. GitHub main SHA만으로 운영 버전을 추측하지 않는다.
3. 개인 키 정상·401·403·429·네트워크 실패·키 저장/삭제 동작을 확인한다. 키는 수집·로그 기록하지 않는다.
4. 비밀값 없는 API fixture로 기존 `CharacterApiResponse`와 mapper 결과를 기준으로 보관한다. 실제 검증을 못 했으면 mock 결과와 구분한다.
5. 현재 테스트·타입·빌드 결과를 기록하고 기존 실패를 구분한다.

완료 기준: 복구할 코드 SHA와 배포 ID, 기존 직접 조회 계약, 무관 변경 목록이 확인됨. 외부 계정 접근이 없어도 로컬 구현 B~F는 계속할 수 있다.

### B. 개인 키 경로 보존과 분기 골격

1. 직접 조회 함수를 보존하거나 최소 추출한다. 공개 함수는 개인 키를 optional로 받아 분기한다.
2. 공개 설정 `NEXT_PUBLIC_OPERATOR_API_ENABLED`(기본 false), `NEXT_PUBLIC_OPERATOR_API_BASE_URL`을 추가한다. 이것들은 비밀이 아니며 정적 빌드 시 확정된다.
3. 개인 키가 있으면 enabled/URL 여부와 무관하게 직접 경로를 선택한다. 키가 없는 경우에만 operator client를 사용한다.
4. mock으로 양쪽 동일 fixture → 동일 mapper 결과를 검사한다. 개인 키 오류 시 Worker 호출 0회, 개인 키 값의 Worker 유출 0회를 검사한다.

완료 기준: 운영 경로 OFF 상태에서 기존 개인 키 기능 그대로 동작. 독립적으로 되돌릴 수 있는 변경 단위 B 확보.

### C. Worker·전역 예산·캐시

1. 개발용 Worker/DO와 환경 분리 설정을 만든다. `LOSTARK_API_KEY`는 Secret. `.dev.vars`, `.dev.vars.*`, `.wrangler/`를 ignore하되 값 없는 example만 허용한다.
2. upstream 호출은 현재 3개 경로를 보존한다. endpoint 축소는 이번 최초 버전에 섞지 않는다.
3. 입력·CORS·응답 계약과 캐시·예산을 구현한다. 서버 환경 `OPERATOR_LOOKUP_ENABLED=false`를 기본값으로 한다.
4. DO storage schema는 additive하게 작성한다. 캐시 schema 변경은 새 키 prefix로 무효화한다. migration 삭제/rename을 롤백 수단으로 사용하지 않는다.
5. 운영 조회 OFF 시 캐시 반환·upstream 신규 호출 모두 차단한다. 이미 시작한 요청은 종료/timeout까지 남을 수 있음을 기록한다.

핵심 테스트: TTL 59.999/60초 경계, hit로 TTL 미연장, 실패 후 재검색, timeout 후 재검색, 이름 충돌 방지, partial 미캐시, 101개 같은 이름 = 한 조회 작업, 101개 다른 이름 = 설정 예산 이내 호출 + 명시적 429, DO 재시작 후 예산 유지, 두 Worker 인스턴스의 동일 DO 사용, CORS 오류 응답, OFF에서 upstream 0회.

완료 기준: Worker 런타임 통합 테스트 통과. 단순 class mock만으로 DO 동시성 검증 완료라고 하지 않는다. 실제 API에 101회 부하를 보내지 않는다.

### D. 검색 UI 연결

1. 페이지의 키 필수 검사를 B의 분기와 연결한다. 개인 키 입력/저장/삭제 UI를 그대로 유지한다.
2. 안내는 “개인 API 키를 입력하면 우선 사용합니다. 입력하지 않으면 사이트 조회 기능을 사용합니다.”로 정리한다.
3. Worker가 비활성/오류일 때 키 설정 위치를 안내한다. 개인 키 401을 운영 장애로 표시하지 않는다.
4. 응답 검증 후 기존 mapper/applyProfile/saveCharacter 흐름을 적용한다. 요청 실패 시 현재 캐릭터/세팅을 초기화하지 않는다. IndexedDB 저장 실패를 API 조회 실패와 구분한다.
5. API key localStorage 항목과 캐릭터 DB version을 변경하지 않는다. 원래 캐릭터 조회 성공 시 초기화되는 사이클 동작을 임의로 바꾸지 않는다.

완료 기준: 키 있음/없음, 운영 OFF, timeout, 연속 검색, 저장소 실패에서 올바른 UI와 기존 데이터 보존. 엔진 파일 diff 없음.

### E. 회귀 및 브라우저 검증

1. 새 API 테스트를 명시적 실행 스크립트와 CI에 등록한다. Worker install/lockfile/타입 검사도 별도 작업으로 실행한다.
2. 프로젝트 typecheck, 관련 API/mapper/storage 테스트, `npm run check:ui`, production build 수행.
3. 실제 브라우저에서 검색과 API 설정 탭을 각각 활성화하고 1920/1440/1024/768/390px DOM 하네스·화면을 검사한다. 기존 오류와 신규 오류를 구분한다.
4. mock 브라우저 검증과 실제 운영 API 검증을 구분한다. 실제 데이터는 동시각 fixture 비교 없이 서로 다른 시각의 응답이 완전히 같다고 요구하지 않는다.
5. 운영 키 대신 sentinel secret을 넣은 테스트 빌드로 브라우저 번들/응답에 노출되지 않는지 검사한다. 실제 비밀값을 검색 명령이나 로그에 출력하지 않는다.

완료 기준: 개인 키 조회 회귀 없음, 새 테스트가 CI에서 실제 실행됨, 검증 화면/입력/결과 기록.

### F. 롤백 리허설과 인계

1. 로컬/preview에서 Worker ON → OFF → 개인 키 검색 성공을 확인한다.
2. 신규 프론트 + 비활성 Worker, 구 프론트 + 신규 Worker 조합을 확인한다.
3. 로컬 storage에 기존 키 선택 저장 상태·프리셋·캐릭터가 있는 상태로 프론트 복구를 재현하고 보존을 확인한다.
4. 운영용 설정 목록과 배포 ID 기록 양식을 채운다. 단계별 커밋 또는 분리 diff를 제공한다. 미검증 항목을 완료라고 표시하지 않는다.

완료 기준: Worker 없이도 기존 개인 키 방식으로 복귀 가능하고 저장 데이터 마이그레이션 불필요. 구현 완료 보고는 A~F와 실제 배포 검증을 구분한다.

### G. 승인 후 실제 배포

1. release-deploy skill과 현재 배포 환경을 확인한다. Workers 및 Durable Objects 이용 가능 여부/요금 조건을 확인한다. 계정/요금제 변경은 자동 수행하지 않는다.
2. 사용자 Secret 등록 후 Worker를 비활성 상태로 먼저 배포한다. Worker version ID와 DO migration/binding을 기록한다.
3. preview 프론트 및 Worker에서 실제 키 없는 검색·개인 키 검색을 확인한다. 공개 origin에는 production 주소, preview는 명시 허용만 추가한다.
4. 운영 Worker 활성화 후 프론트를 공개 설정 ON으로 빌드/배포한다. 기본 OFF 설정을 파일에 유지하고 환경별로 활성화한다.
5. `https://lochanglab.pages.dev`에서 실제 양쪽 검색과 캐시 TTL/오류 안내를 확인한다. 정적 HTML 200만으로 성공 처리하지 않는다.
6. 오류 발생 시 아래 롤백 절차를 수행한다. 관측 기준은 요청 수, upstream 수, cache hit, 429/5xx/timeout, 지연이며 키·Authorization·캐릭터 응답 본문은 로그에 남기지 않는다.

## 7. 롤백 실행 계획

### 배포 전 반드시 채울 복구표

| 항목 | 값 |
| --- | --- |
| 기존 정상 코드 SHA | 미확인 — A에서 기록 |
| 기존 정상 Pages deployment ID 및 URL | 미확인 — A에서 기록 |
| 신규 Pages deployment ID | G에서 기록 |
| Worker 이름/환경/계정 ID | G 전에 확인 |
| 정상 Worker version ID | 최초 배포에는 없음; 비활성 기준 버전을 먼저 확보 |
| DO binding/class/migration/storage schema | C/G에서 기록 |
| 설정 snapshot | 비밀값 제외하고 OFF/ON, URL, 예산/창/TTL 기록 |
| Secret 이름 | LOSTARK_API_KEY (값 기록 금지) |

### R1. 즉시 운영 조회 중지

Worker의 `OPERATOR_LOOKUP_ENABLED=false`를 적용한 버전을 배포해 신규 upstream 호출을 중지한다. 정적 프론트의 NEXT_PUBLIC 값을 대시보드에서 바꾸는 것만으로 이미 배포된 JS가 바뀌지는 않는다. 운영 중지 후 무키 검색은 안내 메시지, 개인 키 검색은 기존 경로로 동작해야 한다. 진행 중 호출의 잔여 timeout도 확인한다.

첫 배포부터 동작이 불안정하면 검증된 비활성 Worker 버전으로 돌린다. 기능 OFF는 프론트/Worker 장애 전체를 해결하지 않으므로 다음 단계로 실제 복구를 확인한다.

### R2. 프론트 복구

Cloudflare Pages에서 기록한 정상 production 배포로 복구한다. 해당 배포를 재사용할 수 없으면 기록한 SHA와 동일 환경으로 새 복구 배포를 만든다. main의 후속 기능까지 과거 시점으로 덮지 않도록 장기 수정은 API 변경 커밋만 revert하는 새 PR로 처리한다. `git reset --hard`, 사용자 파일 삭제는 사용하지 않는다.

복구 후 실제 운영 주소에서 개인 키 입력·조회·저장/삭제·기존 캐릭터/세팅 복원을 확인한다. 모든 localStorage/IndexedDB/브라우저 캐시를 지우라고 안내하지 않는다.

### R3. Worker 버전 복구

현재 DO migration과 호환되는 검증된 버전만 복구한다. Cloudflare rollback은 연결된 데이터 저장소 내용을 과거로 되돌리지 않는다. DO migration 등으로 이전 버전 복구가 제한되면 binding/class/storage를 유지한 비활성 수정 버전을 새로 배포한다. 롤백 성공을 위해 DO namespace를 삭제하지 않는다.

운영 키 노출이 실제로 확인됐다면 Worker 중지 후 키 폐기/재발급 및 Secret 교체가 별도로 필요하다. 코드 rollback만으로 노출된 키가 안전해지지 않는다.

### R4. 복구 확인 및 재개 조건

- 개인 키 검색 정상, 운영 조회 중지, upstream 신규 호출 중지 확인.
- 저장된 사용자 키·프리셋·캐릭터 보존 확인.
- 장애 원인과 실패 테스트를 추가한 뒤 B~F 관련 검증을 다시 수행.
- 코드·프론트 배포·Worker 버전·DO 저장소 복구를 서로 구분해 기록.

## 8. 현재 구현·검증 기록

### A

- 기준 SHA: `d4693b694e01374da6a493cb22012c92b1ba5db9`.
- 기존 사용자 변경 `.codex/skills/release-deploy/SKILL.md`, `next-env.d.ts`, 분석데이터는 보존했고 새 변경에 포함하지 않았다.
- 정적 Next 출력 구조와 현재 개인 키 호출 경로를 확인했다. Cloudflare 실제 Worker/Pages 운영 설정과 운영 키는 아직 확인하지 않았다.

### B

- `fetchCharacterWithApiKey`로 기존 직접 조회를 보존하고 `fetchCharacter(name, optionalKey)`를 추가했다.
- 개인 키가 있으면 운영 설정과 무관하게 직접 호출한다. 개인 키가 없을 때만 운영 URL을 사용한다.
- 운영 클라이언트에서 Authorization 헤더를 만들지 않으며, 개인 키 오류 시 운영 경로로 재시도하지 않는다.
- API 설정 안내와 검색 전 검사를 두 경로에 맞게 수정했다. 개인 키 입력·localStorage 저장·삭제 UI는 유지했다.

### C

- `workers/lostark-api`에 고정 upstream 경로, 정확한 CORS, 60초 성공 캐시, 동일 캐릭터 in-flight 통합, Durable Object 저장 예산을 추가했다.
- 실제 API 제한값을 확인하지 못했으므로 `UPSTREAM_REQUEST_LIMIT=0`은 로컬/초기 비활성 기본값이다. 운영 활성화 전에 공식 계정 제한값을 확인하고 환경값을 설정해야 한다.
- Worker secret 예시에는 실제 값을 넣지 않았다.

### 실제 검증 결과

- `npm run typecheck`: 통과.
- `npm run check:ui`: 통과.
- `npm test`: 통과.
- `node --test tests/unit/operator-api-client.test.ts`: 2개 통과.
- `node --test workers/lostark-api/src/index.test.ts`: 1개 통과.
- `tsc --noEmit -p workers/lostark-api/tsconfig.json`: 통과.
- `npm run build`: 통과.
- 운영 Worker, 실제 운영 키, 실제 운영 API 조회, 실제 브라우저의 키 없는 검색은 아직 검증하지 않았다.

### D~F 상태

- D: 코드 연결 완료. 실제 브라우저 화면·키 있음/없음 조합은 E에서 검증해야 한다.
- E: 소스/단위/빌드 검증 완료. `npm run check:ui`와 실제 브라우저 DOM/화면 검증은 남아 있다.
- F: 롤백 절차 문서화 완료. Worker ON/OFF 및 Pages 복구를 실제 환경에서 실행하지 않았다.

### 브라우저·롤백 리허설 결과

- 변경된 static build를 별도 로컬 정적 서버에서 확인했다. 초기 화면에는 개인 키 우선·키가 없으면 운영 조회라는 안내가 표시됐다.
- 운영 조회 설정이 기본 OFF인 상태에서 캐릭터명을 검색하면 API 설정 화면으로 이동하고 개인 키 입력 안내가 표시됐다. 운영 upstream 호출은 발생하지 않는다.
- 기존 캐릭터가 로드된 simulator 탭에서 DOM audit을 1920/1440/1024/768/390 요청 조건으로 실행했고 모든 감사 항목이 통과했다. 브라우저 capability가 실제로 보고한 viewport는 623x695로 고정되어 각 요청 폭이 적용됐는지 확인할 수 없었으므로, 다섯 폭의 반응형 검증 완료로 보고하지 않는다.
- 기존 캐릭터가 로드된 기본 장비 탭의 DOM audit도 통과했다.
- Worker ON→OFF 전환은 실제 Cloudflare 환경에서 실행하지 못했다. 코드 수준에서 `OPERATOR_LOOKUP_ENABLED=false`와 프론트 운영 설정 OFF가 개인 키 경로로 복귀하도록 확인했다.
- 실제 운영 Worker/Secret/Pages 배포, 실제 API 키 조회, 101개 동시 요청, Cloudflare rollback은 G 범위이므로 미실행이다.

### 운영 Worker 예외 조사 및 로컬 수정 기록

- 실제 Worker 로그에서 `Coordinator` Durable Object의 `fetch`가 `outcome: exception`으로 종료되고 외부 응답이 `OPERATOR_UNAVAILABLE`로 변환되는 현상을 확인했다. 로그의 실행 시간만으로 Secret 또는 upstream 인증 실패라고 단정하지 않았다.
- `Coordinator` 내부의 예상 오류와 예상하지 못한 예외를 JSON 응답으로 변환하도록 수정했다. 오류 응답에는 코드·요청 ID·필요한 재시도 시간만 포함한다.
- 외부 Worker와 Coordinator가 동일한 요청 ID를 사용하도록 연결했다.
- upstream armory/arkpassive/arkgrid 단계와 상태 코드를 비밀값 없이 기록하는 제한된 진단 로그를 추가했다. Authorization·Secret·upstream 응답 본문은 기록하지 않는다.
- Secret이 비어 있을 때 `trim()` 예외가 발생하지 않고 `OPERATOR_AUTH_UNAVAILABLE`로 분류되도록 보완했다.
- 로컬 검증: 루트 typecheck, 전체 기존 테스트, Worker typecheck, API/Worker 테스트가 통과했다. Cloudflare 재배포 후 실제 조회는 아직 확인하지 않았다.
- 남은 운영 확인: 수정 Worker 재배포 후 동일 캐릭터 조회, 로그의 `stage`·`endpoint`·`upstreamStatus` 확인, 성공 응답과 개인 키 경로의 데이터 비교.

## 9. 완료 보고 양식

각 단계마다 변경 파일, 입력/fixture, 기대값, 실제 결과, 실행 명령과 종료 코드, 실제 검증 여부, 롤백 지점을 작성한다. 모의 부하 검증과 실 API 검증을 혼동하지 않는다. A~F 완료만으로 운영 적용 완료라고 보고하지 않는다.

## 10. 공식 근거

- Lost Ark 제한 확인 및 상향 신청: https://developer-lostark.game.onstove.com/faq
- Worker Secret 관리: https://developers.cloudflare.com/workers/configuration/secrets/
- Rate Limiting binding의 지역별·비정밀 한계: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Worker rollback 및 migration 제약: https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/

구현 시 최신 공식 문서와 설치된 Wrangler 명령을 다시 확인한다. 이 문서의 TTL/timeout/cache 상한은 서비스 초기 설정이며 게임 공식 또는 플랫폼 고정 제한이 아니다.
