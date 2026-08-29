# DPS 데이터 처리 및 재계산 지침

## 1. 목적과 근거

이 문서는 로스트아크 Open API에서 받은 캐릭터 데이터를 보존·정규화하고, 사용자가 세팅을 변경했을 때 DPS 입력값과 결과를 재계산하는 기준을 정의한다.

참고 자료:

- [로스트아크의 데미지 계산식 한 장 정리 및 해설](https://www.inven.co.kr/board/lostark/4821/109679)
- 사용자가 제공한 계산식 이미지와 프로젝트에서 확정한 보정 사항

참고 글은 유저 실험을 바탕으로 작성된 자료이므로 공식 명세로 취급하지 않는다. 데모닉 전용 스킬 피해 적용 방식과 다른 직업에 검증되지 않은 규칙은 창술사 공식으로 일반화하지 않는다. 검증되지 않은 계산 규칙은 `assumed` 또는 `unverified` 상태로 저장하고 결과 화면에 표시한다.

## 2. 현재 계산 범위

- 엘릭서 효과는 삭제된 시스템이므로 입력과 계산에서 제외한다.
- 장비 세트 효과는 포함한다.
- 파티 시너지와 서포터 효과는 현재 계산에서 모두 제외한다.
- 받는 피해 배율은 현재 `1`로 고정한다.
- 대상 기본 방어력은 모든 계산에서 하나의 공통 기준을 사용한다. 방어력 감소 효과가 없는 상태에서 방어력 배율 `J`는 `0.402678946212752`로 고정한다.
- 스킬별 계수, 모션 계수, 스킬 레벨 배율은 별도 데이터가 확보될 때까지 미지원 상태로 둔다.
- 퍼센트는 내부에서 소수로 저장한다. 예를 들어 `6%`는 `0.06`이며 적용 시 `1 + 0.06`을 사용한다.

## 3. 계산 공통 원칙

### 3.1 표시값과 내부값 분리

참고 글에 따르면 게임 화면에는 내림된 정수 값이 표시되더라도 소수점 이하 값은 내부 계산에 영향을 줄 수 있다. 따라서 다음 원칙을 적용한다.

- API 원문과 파싱 전 문자열을 그대로 보존한다.
- 정규화한 수치는 가능한 정밀도를 유지한다.
- 계산 중간값을 임의로 반올림하거나 잘라내지 않는다.
- 화면 표시가 필요한 지점에만 `Math.floor` 기반 표시 함수를 사용한다.
- 실제 게임과의 회귀 테스트로 내림이 적용되는 정확한 단계가 확인되면 해당 단계만 명시적으로 고정한다.

### 3.2 공격력 단계 구분

공격력은 하나의 값으로 덮어쓰지 않고 아래 단계를 별도로 계산한다.

```text
A = 주 스탯 합계 × (1 + 주 스탯 증가율 합계)
B = 무기 공격력 합계 × (1 + 무기 공격력 증가율 합계)
C = sqrt((A × B) / 6)                         // 순수 공격력
D = C × (1 + 기본 공격력 증가율 합계)         // 기본 공격력
E = (D + 공격력 고정 증가 합계)
    × (1 + 공격력 증가율 합계)                // 최종 공격력
```

- `C`는 힘/민첩/지능과 무기 공격력만으로 계산한다.
- `D`에는 보석과 어빌리티 스톤 등의 기본 공격력 증가율을 반영한다.
- `E`에는 공격력 고정 증가와 공격력 증가율을 반영한다.
- 스킬 툴팁 수치를 역산하거나 계수를 검증하는 경로와 실제 전투 피해 계산 경로를 분리한다.
- 스킬 데이터가 확정될 때까지 모션 상수의 존재 여부를 코드에 고정하지 않는다.

### 3.3 효과 합산과 곱연산

효과 문구만 보고 합연산 또는 곱연산을 추측하지 않는다. 각 효과 정의에 계산 버킷과 중첩 그룹을 명시한다.

```text
같은 additiveGroup 안의 값       = 먼저 합산
서로 다른 multiplicativeGroup 값 = 각각 (1 + 값)으로 곱함
고정 수치                         = 지정된 계산 단계에서 더함
```

예시 버킷:

- `primary_stat_flat`, `primary_stat_pct`
- `weapon_attack_flat`, `weapon_attack_pct`
- `base_attack_pct`
- `attack_power_flat`, `attack_power_pct`
- `crit_rate`, `crit_damage`, `crit_outgoing`
- `additional_damage`
- `outgoing_damage`, `equipment_set_outgoing`
- `target_defense_reduction`
- `skill_damage`, `skill_cooldown`

아크 패시브 내부 합산, 아크 그리드 개별 곱연산과 같은 직업별 사례는 효과 정의별로 검증한 후 등록한다. 데모닉에서 확인된 스킬 피해 중첩 규칙을 창술사에 그대로 적용하지 않는다.

### 3.4 현재 최종 피해 골격

```text
F = 스킬 기본 피해                       // 계수 데이터 확보 후 구현
G = 개인 치명타 기대 배율
H = 개인 주는 피해 배율 × 장비 세트 배율
I = 1                                    // 받는 피해 배율, 현재 고정
J = 공통 대상 방어력으로 계산한 방어력 배율
K = F × G × H × I × J
```

`G`는 기대값 방식으로 계산한다.

```text
G = (1 - 치명타 확률) + 치명타 확률 × 치명타 피해 배율
```

`J`의 방어력 감소 효과가 없는 기본값은 다음과 같이 고정한다.

```text
BASE_DEFENSE_MULTIPLIER = 0.402678946212752
방어력 적용 전 피해 1 × J = 방어력 적용 후 피해 0.402678946212752
```

방어력 상수 `6,500`을 사용하는 공식으로 역산하면 공통 대상 방어력은 약 `9,641.89184990511`이다.

```text
TARGET_DEFENSE = 6,500 × (1 / 0.402678946212752 - 1)
               ≈ 9,641.89184990511
```

방어력 감소 효과를 계산할 때는 역산된 `TARGET_DEFENSE`를 기준으로 유효 방어력을 구한 뒤 `J`를 다시 계산한다. 파티 방어력 감소는 제외하고, 캐릭터 자신의 장착 효과 중 계산 대상으로 확정된 효과만 반영한다.

## 4. 데이터 모델

### 4.1 원본 API 스냅샷

API 응답은 수정하지 않고 한 번만 저장한다.

```ts
type ApiSnapshot = {
  id: string;
  characterName: string;
  fetchedAt: string;
  raw: CharacterApiResponse;
  parserVersion: string;
  contentVersion: string;
};
```

### 4.2 정규화 캐릭터 스냅샷

문자열 중심의 화면 모델과 계산용 수치 모델을 분리한다.

```ts
type CharacterSnapshot = {
  id: string;
  apiSnapshotId: string;
  identity: CharacterIdentity;
  stats: NormalizedStats;
  equipment: NormalizedEquipment[];
  skills: NormalizedSkill[];
  effects: EffectInstance[];
  unresolvedEffects: UnresolvedEffect[];
};
```

```ts
type EffectInstance = {
  definitionId: string;
  source: {
    system: "equipment" | "accessory" | "bracelet" | "engraving" | "gem" | "arkPassive" | "arkGrid" | "avatar";
    entityId: string;
    apiPath?: string;
    rawText?: string;
  };
  operation: "flat" | "additivePct" | "multiplicativePct";
  bucket: string;
  stackingGroup: string;
  value: number;
  skillFilter?: string[];
  conditions?: string[];
  status: "verified" | "assumed" | "unverified" | "ignored";
};
```

파싱에 실패한 옵션을 버리지 않고 `unresolvedEffects`에 원문, 출처, 실패 이유를 저장한다. 계산에는 포함하지 않되 현재 장착 상태로는 표시할 수 있어야 한다.

### 4.3 시뮬레이션 세팅

사용자 편집값은 원본 객체 복사본을 직접 변경하지 않고 원본에 대한 오버라이드로 저장한다.

```ts
type SimulationLoadout = {
  id: string;
  snapshotId: string;
  name: string;
  overrides: LoadoutOverrides;
  gems: GemAssignment[];
  skillCycle: SimulationAction[];
  combatConditions: CombatConditions;
  createdAt: string;
  updatedAt: string;
};
```

- 오버라이드가 없으면 API 원본값을 사용한다.
- 값을 초기화하면 해당 오버라이드를 제거하여 원본값으로 복원한다.
- API를 다시 조회해 새 스냅샷을 만들 때 기존 세팅은 안정적인 슬롯·효과 ID를 기준으로 재적용하고 충돌을 표시한다.
- 사용자가 값을 변경할 때 API를 다시 호출하지 않는다.

### 4.4 계산 결과

```ts
type SimulationResult = {
  loadoutId: string;
  snapshotId: string;
  dataVersion: string;
  formulaVersion: string;
  calculatedAt: string;
  derived: { A: number; B: number; C: number; D: number; E: number; G: number; H: number; I: 1; J: number };
  totalDamage: number | null;
  dps: number | null;
  trace: CalculationTrace[];
  assumptions: string[];
  unresolvedEffectIds: string[];
};
```

결과에는 최종값뿐 아니라 각 효과가 어느 버킷에 얼마를 더했는지 추적 정보를 저장한다.

## 5. 브라우저 저장 구조

IndexedDB는 다음 저장소로 분리한다.

| 저장소 | 내용 | 갱신 시점 |
| --- | --- | --- |
| `apiSnapshots` | 수정하지 않은 API 응답 | 캐릭터 조회 성공 시 |
| `characterSnapshots` | 파싱·정규화 결과 | 스냅샷 생성 또는 파서 마이그레이션 시 |
| `simulationLoadouts` | 사용자 세팅과 전투 사이클 | 편집 후 디바운스 저장 또는 명시적 저장 시 |
| `simulationResults` | 입력·공식 버전에 연결된 결과 | 계산 완료 시 |

API 키는 메모리에서 조회 요청에만 사용하고 어떤 저장소에도 저장하지 않는다.

## 6. 값 변경 시 반영 순서

```text
UI 입력
→ 입력 범위 검증
→ SimulationLoadout 오버라이드 갱신
→ 원본 스냅샷 + 오버라이드를 합쳐 ResolvedLoadout 생성
→ 효과 카탈로그로 EffectInstance 수집
→ 계산 버킷별 합산·곱연산
→ A~J 파생값 재계산
→ 영향을 받는 스킬 및 사이클 결과 무효화
→ 가능한 범위까지 재계산
→ 화면 갱신
→ IndexedDB에 세팅 저장
```

의존성 기준:

| 변경 값 | 반드시 다시 계산할 값 |
| --- | --- |
| 힘/민첩/지능, 무기 공격력 | A~E, 모든 스킬 피해, 총 피해, DPS |
| 기본 공격력 증가 | D~E, 모든 스킬 피해, 총 피해, DPS |
| 공격력 고정/증가율 | E, 모든 스킬 피해, 총 피해, DPS |
| 치명/치적/치피/회심 | G, 해당 스킬 피해, 총 피해, DPS |
| 추가 피해/주는 피해/장비 세트 | H, 해당 스킬 피해, 총 피해, DPS |
| 방어력 감소/대상 방어력 | J, 모든 스킬 피해, 총 피해, DPS |
| 스킬 레벨/트라이포드/피해 보석 | 해당 스킬 F와 피해, 총 피해, DPS |
| 신속/쿨다운 보석/재사용 감소 | 스킬 사용 가능 시점과 사이클 DPS |
| 스킬 순서/전투 시간 | 총 피해와 DPS만 재시뮬레이션 |

가벼운 A~J 파생값은 입력 즉시 계산하고, 전체 이벤트 시뮬레이션은 짧은 디바운스 또는 계산 버튼으로 실행한다.

## 7. 현재 구현 점검

### 정상 방향

- API 응답의 `raw`를 `CharacterProfile`에 보존하고 있다.
- API 키는 React 메모리에만 있고 영구 저장하지 않는다.
- 장비, 보석, 아크 패시브, 아크 그리드를 각각 매퍼에서 분리해 읽고 있다.
- 팔찌 옵션 카탈로그처럼 API 원문을 내부 옵션으로 매핑하는 기반이 있다.

### 수정이 필요한 부분

1. `src/lib/character-storage.ts`는 `source`와 `loadout`을 같은 `CharacterProfile` 복사본으로 저장하지만 실제 화면은 `loadout`을 사용하지 않는다.
2. `src/app/page.tsx`의 장비·각인·아크 패시브·그리드 편집기는 `CharacterProfile`을 직접 변경한다.
3. 보석, 아바타, 어빌리티 스톤 편집값은 별도 React 상태라 캐릭터 세팅과 하나의 저장 단위가 아니다.
4. 현재 세팅 저장은 이름, 사이클, 아이템 레벨, 공격력만 `localStorage`에 남기므로 전체 세팅 비교와 재현이 불가능하다.
5. `combat-stat-parser.ts`는 공격 속도·이동 속도·치명타를 `%` 문자열로 반환하여 계산 엔진에서 다시 파싱해야 한다.
6. `equipment-parser.ts`의 `baseStats`와 `options`가 문자열 배열이라 효과 버킷, 단위, 수치, 출처를 안정적으로 계산할 수 없다.
7. 원본 API 응답이 포함된 `CharacterProfile`을 `source`와 `loadout`에 각각 복제해 저장하므로 중복 용량이 발생한다.
8. 파싱 실패 옵션을 별도 목록으로 남기지 않아 계산 누락 여부를 사용자에게 설명하기 어렵다.

## 8. 구현 순서

1. `ApiSnapshot`, `CharacterSnapshot`, `SimulationLoadout`, `SimulationResult` 타입을 먼저 정의한다.
2. 퍼센트 문자열을 소수 숫자로 바꾸는 공통 파서와 `EffectInstance` 카탈로그를 만든다.
3. 기존 장비·팔찌·각인·보석·아크 시스템 매퍼가 화면 문자열과 계산 효과를 함께 반환하도록 변경한다.
4. IndexedDB를 네 저장소 구조로 마이그레이션하고 기존 저장 데이터는 `raw`에서 다시 정규화한다.
5. `page.tsx`의 직접 변경 코드를 `LoadoutOverrides` 갱신으로 교체한다.
6. `resolveLoadout`과 버킷 집계기를 순수 함수로 구현한다.
7. A~E, G~J 계산기와 계산 추적 출력을 구현한다.
8. 스킬 계수 데이터가 확보되면 F, K, 사이클 DPS를 연결한다.
9. 실제 게임 기준 캐릭터 스냅샷으로 단계별 수치 회귀 테스트를 작성한다.

## 9. 완료 조건

- API 원본과 사용자 변경값을 독립적으로 복원할 수 있다.
- 같은 스냅샷, 세팅, 데이터 버전, 공식 버전은 같은 결과를 만든다.
- 어떤 UI 값을 바꿨을 때 영향을 받은 계산 단계만 명확히 추적할 수 있다.
- 파싱 실패·미지원·가정 효과가 결과에 숨겨지지 않는다.
- 세팅 저장 후 새로고침해도 장비, 각인, 보석, 패시브, 그리드, 사이클이 모두 동일하게 복원된다.

## 10. 계산 엔진 구현 상태

구현 파일:

- `src/domain/combat/combat-engine.ts`: A~E, G~J 순수 계산 엔진과 단계별 추적 정보
- `src/domain/combat/character-combat-adapter.ts`: 현재 `CharacterProfile`에서 계산 가능한 값을 입력 모델로 변환하는 어댑터
- `tests/unit/combat-engine.test.ts`: 공격력 단계, 효과 중첩, 치명타 기대값, 방어력, 미검증 효과 제외에 대한 회귀 테스트

현재 엔진은 다음을 지원한다.

- 주 스탯·무기 공격력·공격력의 고정 증가 및 증가율
- 기본 공격력 증가율
- 치명타 적중률·치명타 피해·치명타 적중 시 주는 피해의 기대값
- 추가 피해, 일반 주는 피해, 장비 세트 피해의 중첩 그룹 계산
- 기준 방어력 배율과 개인 방어력 감소
- 효과별 적용 여부와 A~K 단계별 계산 추적
- 미검증 효과의 기본 제외와 명시적 포함

스킬 계수 데이터가 없으므로 F와 K는 `null`이며, `damageScaleBeforeSkillCoefficient`로 `E × G × H × I × J`까지만 제공한다.

현재 캐릭터 어댑터는 구조화가 완료된 팔찌 효과만 일부 자동 연결한다. 무기 공격력 원본, 각인, 보석 기본 공격력, 아바타, 장비 세트, 아크 패시브, 아크 그리드는 카탈로그가 연결될 때까지 `issues`에 누락 사유를 반환하고 계산에서 제외한다.
