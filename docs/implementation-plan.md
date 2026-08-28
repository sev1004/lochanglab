# DPS 시뮬레이터 구현 준비 문서

## 1. 분석 기준

참고 페이지: [LOALAB 캐릭터 검색](https://lo4.app/characters)

페이지에서 확인되는 핵심 패턴은 다음과 같다.

- 상단 전역 검색창으로 캐릭터를 검색한다.
- 검색 전에는 장비·각인·스킬·보석·아크 그리드·아크 패시브 기능을 카드로 안내한다.
- 캐릭터 검색 후에는 캐릭터 정보를 중심으로 상세 화면이 구성된다.
- 외부 API 기반 데이터임을 하단에 표시한다.
- 라이트·다크 테마 전환과 도구/시세/일정으로 이동하는 전역 내비게이션이 있다.

우리 서비스는 위 정보 구조를 참고하되, DPS 계산과 세팅 편집을 핵심 화면으로 차별화한다.

추가 참고 페이지: [LOPEC 캐릭터 시뮬레이터](https://lopec.kr/character/simulator/%EB%9E%9C%EB%A7%88%EB%AA%BD)

LOPEC은 검색 결과를 시뮬레이션 초기 상태로 사용한다. 서버·직업·직업 각인, 캐릭터 레벨, 아이템 레벨, 장비 품질·강화·세트, 각인, 보석, 아크 패시브, 아크 그리드, 기본 효과와 보정값을 확인하고 수정할 수 있다.

우리 서비스는 원본 데이터와 사용자가 조작하는 데이터를 분리한다.

1. `CharacterProfile`: API에서 가져온 원본 캐릭터 스펙
2. `SimulationLoadout`: 사용자가 수정하는 독립적인 시뮬레이션 세팅
3. `SimulationResult`: 수정 전후의 DPS와 피해 기여도

원본 프로필을 직접 수정하지 않고 시뮬레이션 세팅으로 복사해야 현재 세팅과 가상 세팅을 비교할 수 있다.

## 2. 목표 사용자 흐름

```text
캐릭터명 입력
  → API에서 캐릭터 정보 조회
  → 원본 장비·각인·스킬·보석 확인
  → 시뮬레이션용 세팅 복사
  → 스탯·각인·스킬·전투 조건 조작
  → DPS 계산 실행
  → 스킬별 기여도와 세팅 비교 확인
```

상세 스펙 반영 모델:

```ts
type CharacterProfile = {
  identity: CharacterIdentity;
  combatStats: CombatStats;
  equipment: Equipment[];
  accessories: Accessory[];
  engravings: Engraving[];
  gems: Gem[];
  skills: SkillLoadout[];
  arkPassive?: ArkPassive;
  arkGrid?: ArkGrid;
  effects: CharacterEffect[];
  source: DataSource;
};

type SimulationLoadout = Omit<CharacterProfile, "source"> & {
  combatConditions: CombatConditions;
  actions: SimulationAction[];
};
```

## 6.1 검색 결과 상세 스펙 매핑

| 화면 정보 | 내부 모델 | DPS 반영 |
| --- | --- | --- |
| 서버·직업·직업 각인 | `CharacterIdentity` | 직업별 스킬 세트 선택 |
| 아이템 레벨·장비 레벨 | `Equipment` | 공격력·피해 계수 |
| 장비 품질 | `Equipment.quality` | 품질 기반 추가 스탯 |
| 장비 세트·티어 | `Equipment.set`, `tier` | 세트 효과·티어 보정 |
| 강화·상급 재련 | `refinement` | 장비 스탯 및 추가 효과 |
| 각인 | `Engraving[]` | 각인 레벨별 피해 효과 |
| 보석 | `Gem[]` | 스킬 피해·쿨다운 보정 |
| 스킬·트라이포드 | `SkillLoadout[]` | 스킬 계수·사이클 |
| 아크 패시브 | `ArkPassive` | 패시브 효과 |
| 아크 그리드 | `ArkGrid` | 코어·포인트·옵션 효과 |
| 기본 효과·보정 | `CharacterEffect[]` | 펫·카드·상시 효과 |

API에서 제공하지 않는 값은 사용자 편집값으로 표시하고 자동 추정값과 구분한다.

## 3. 화면 설계

### 3.1 검색 전 화면

- 서비스명과 간단한 설명
- 캐릭터명 검색 입력창
- 최근 검색 또는 예시 캐릭터
- 기능 안내 카드
  - 캐릭터 조회
  - 세팅 편집
  - DPS 시뮬레이션
  - 세팅 비교

### 3.2 검색 후 화면

```text
┌──────────────────────────────────────────────┐
│ 로고       캐릭터 검색             테마 전환 │
├──────────────────────────────────────────────┤
│ 캐릭터 요약: 이름 / 직업 / 아이템 레벨        │
├──────────────┬───────────────────────────────┤
│ 설정 메뉴     │ 결과 영역                      │
│               │ DPS / 총 피해 / 전투 시간      │
│ 스탯          │ 스킬별 피해량 차트              │
│ 장비          │ 기준 세팅과 변경 세팅 비교      │
│ 각인          │ 계산 가정 및 데이터 버전        │
│ 스킬          │                               │
│ 전투 조건     │                               │
└──────────────┴───────────────────────────────┘
```

모바일에서는 좌측 설정 메뉴를 상단 탭 또는 접이식 패널로 변경한다.

## 4. 컴포넌트 계획

```text
AppShell
├─ Header
│  ├─ Logo
│  ├─ CharacterSearch
│  └─ ThemeToggle
├─ EmptyState 또는 CharacterWorkspace
│  ├─ CharacterSummary
│  ├─ SimulationSetup
│  │  ├─ StatsEditor
│  │  ├─ EquipmentEditor
│  │  ├─ EngravingEditor
│  │  ├─ SkillEditor
│  │  └─ CombatConditionEditor
│  └─ SimulationResult
│     ├─ DpsSummary
│     ├─ DamageBreakdown
│     ├─ ComparisonPanel
│     └─ AssumptionsNotice
└─ Footer
```

## 5. 데이터 흐름

### API 조회

`CharacterSearch`는 사용자가 입력한 API 키로 브라우저에서 로스트아크 API를 직접 호출한다. 응답을 `CharacterSnapshot`으로 정규화한 뒤 원본과 편집용 복사본을 IndexedDB에 저장한다. API 키는 저장하지 않는다.

```text
Lost Ark API response
  → LostArkApiClient
  → CharacterMapper
  → CharacterSnapshot
  → SimulationInput 초기값
```

### 시뮬레이션

화면의 편집값은 `SimulationInput`으로 관리하고, 계산 엔진에는 직렬화 가능한 값만 전달한다.

```text
SimulationInput
  → InputValidator
  → SimulationEngine
  → SimulationResult
  → ResultViewModel
```

## 6. 초기 도메인 모델

```ts
type CharacterSnapshot = {
  name: string;
  className: string;
  itemLevel: number;
  stats: CombatStats;
  equipment: Equipment[];
  engravings: Engraving[];
  skills: SkillLoadout[];
  dataVersion: string;
};

type SimulationInput = {
  character: CharacterSnapshot;
  combatDurationSeconds: number;
  targetDefense: number;
  actions: SimulationAction[];
  assumptions: string[];
  simulationVersion: string;
};

type SimulationResult = {
  totalDamage: number;
  dps: number;
  durationSeconds: number;
  skillBreakdown: SkillDamage[];
  appliedEffects: AppliedEffect[];
};
```

실제 타입은 게임 공식과 API 응답을 확인하면서 `src/domain`과 `src/types`에 확정한다.

## 7. MVP 개발 순서

1. Next.js와 TypeScript 프로젝트 초기화
2. 공통 레이아웃·테마·검색 화면 구현
3. 브라우저 캐릭터 조회 클라이언트와 응답 정규화
4. 캐릭터 요약 및 원본 세팅 화면 구현
5. 창술사 핵심 스킬·스탯 데이터 모델 작성
6. 기대값 기반 최소 시뮬레이션 엔진 구현
7. 설정 편집 UI와 DPS 결과 화면 연결
8. 기준 시나리오 단위 테스트 작성
9. GitHub Actions의 lint/test/build 구성
10. GitHub Pages 정적 배포 설정

## 8. 구현 시 주의점

- 참고 사이트의 상표, 로고, 이미지, 문구를 그대로 복사하지 않는다.
- 외부 API 키는 사용자가 입력하고 요청에만 사용하며 저장하지 않는다.
- API 응답이 없거나 캐릭터를 찾지 못한 경우를 별도 상태로 처리한다.
- API 호출 실패, 속도 제한, 오래된 데이터, 미지원 직업을 사용자에게 명확히 표시한다.
- 시뮬레이션 결과에는 데이터 버전·계산 버전·가정을 표시한다.
- 첫 버전에서는 모든 게임 요소를 억지로 지원하지 않고 창술사 핵심 시나리오를 검증한다.

## 9. 완료 기준

MVP는 다음 조건을 만족해야 한다.

- API 키와 캐릭터명을 입력하면 브라우저에서 정보를 조회할 수 있다.
- 조회된 세팅을 시뮬레이션 입력으로 복사할 수 있다.
- 사용자가 최소 하나 이상의 세팅을 수정할 수 있다.
- 동일한 입력에서 동일한 결과가 재현된다.
- 총 DPS와 스킬별 피해량을 확인할 수 있다.
- 실패·미지원·가정 상태가 화면에 표시된다.
- CI에서 lint, test, build가 모두 통과한다.
