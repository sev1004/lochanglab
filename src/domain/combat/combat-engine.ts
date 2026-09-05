import {
  GLAVIER_SKILL_BY_NAME,
  type GlavierSkillData,
  type GlavierTripodEffect,
} from "../../data/generated/glavier-skill-data.ts";
import gemDamageValues from "../../data/gem-damage-values.json" with { type: "json" };
import enlightenmentSkillEffects from "../../data/enlightenment-skill-effects.json" with { type: "json" };
import {
  createArkGridOrderSkillModifierSnapshot,
  type ArkGridOrderSkillEffect,
  type ArkGridOrderSkillModifierSnapshot,
} from "../../data/ark-grid-order-skill-effects.ts";
import {
  baseEvolutionDamageRate,
  evolutionDamageRate,
  skillSpecificEvolutionDamageRate,
  type EvolutionDamageInput,
} from "./t5-evolution.ts";

export const DEFENSE_CONSTANT = 6_500;
// 방어력 상수 6500에서 기준 배율을 만들기 위한 대상 방어력이다.
export const DEFAULT_TARGET_DEFENSE = 7_830;
export const BASE_DEFENSE_MULTIPLIER =
  DEFENSE_CONSTANT / (DEFENSE_CONSTANT + DEFAULT_TARGET_DEFENSE);
export const DEFAULT_CRITICAL_DAMAGE_MULTIPLIER = 2;
/** 치명 스탯 1당 치명타 적중률 0.0357% (내부 배율로 변환해 사용). */
export const CRITICAL_RATE_PER_STAT_PERCENT = 0.0357;
export const CRITICAL_RATE_PER_STAT = CRITICAL_RATE_PER_STAT_PERCENT / 100;

export function criticalRateFromStat(criticalStat: number) {
  if (!Number.isFinite(criticalStat) || criticalStat < 0)
    throw new Error("치명 스탯은 0 이상의 유한한 숫자여야 합니다.");
  return criticalStat * CRITICAL_RATE_PER_STAT;
}

export type CombatEffectBucket =
  | "primaryStatFlat"
  | "primaryStatRate"
  | "weaponAttackFlat"
  | "weaponAttackRate"
  | "baseAttackRate"
  | "attackPowerFlat"
  | "attackPowerRate"
  | "criticalRate"
  | "criticalDamage"
  | "criticalOutgoingDamage"
  | "additionalDamage"
  | "outgoingDamage"
  | "equipmentSetDamage"
  | "incomingDamage"
  | "defenseReduction";

export type CombatEffectStatus =
  "verified" | "assumed" | "unverified" | "ignored";

export type CombatEffectSource = {
  system:
    | "profile"
    | "equipment"
    | "accessory"
    | "bracelet"
    | "engraving"
    | "gem"
    | "arkPassive"
    | "arkGrid"
    | "avatar"
    | "manual";
  entityId?: string;
  rawText?: string;
};

export type CombatEffect = {
  id: string;
  label: string;
  bucket: CombatEffectBucket;
  /** 퍼센트 효과는 6%를 0.06으로 전달한다. */
  value: number;
  /** 같은 그룹은 먼저 더하고, 서로 다른 그룹은 곱한다. */
  stackingGroup?: string;
  status?: CombatEffectStatus;
  enabled?: boolean;
  condition?: string;
  source?: CombatEffectSource;
};

export type CombatCalculationInput = {
  base: {
    /** 퍼센트 효과가 적용되기 전 주 스탯 합계 */
    primaryStat: number;
    /** 퍼센트 효과가 적용되기 전 무기 공격력 합계 */
    weaponAttack: number;
    /** 10%는 0.1로 전달한다. */
    criticalRate: number;
    /** 기본값은 2.0(200%)이다. */
    criticalDamageMultiplier?: number;
  };
  effects: CombatEffect[];
  target?: {
    defense?: number;
  };
  options?: {
    includeUnverifiedEffects?: boolean;
  };
};

export type CombatStage =
  "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

export type CombatCalculationTrace = {
  stage: CombatStage;
  label: string;
  value: number | null;
  formula: string;
  effectIds: string[];
};

export type CombatCalculationResult = {
  stages: {
    primaryStat: number;
    weaponAttack: number;
    pureAttackPower: number;
    baseAttackPower: number;
    finalAttackPower: number;
    skillBaseDamage: null;
    criticalRate: number;
    criticalDamageMultiplier: number;
    criticalOutgoingMultiplier: number;
    criticalMultiplier: number;
    outgoingDamageMultiplier: number;
    incomingDamageMultiplier: number;
    defenseMultiplier: number;
    finalSkillDamage: null;
  };
  /** 스킬 계수 F를 제외하고 E × G × H × I × J까지 적용한 값이다. */
  damageScaleBeforeSkillCoefficient: number;
  targetDefense: number;
  effectiveTargetDefense: number;
  appliedEffectIds: string[];
  excludedEffectIds: string[];
  trace: CombatCalculationTrace[];
};

function assertFinite(name: string, value: number) {
  if (!Number.isFinite(value))
    throw new Error(`${name} 값은 유한한 숫자여야 합니다.`);
}

function assertInput(input: CombatCalculationInput) {
  assertFinite("주 스탯", input.base.primaryStat);
  assertFinite("무기 공격력", input.base.weaponAttack);
  assertFinite("치명타 적중률", input.base.criticalRate);
  if (input.base.primaryStat < 0)
    throw new Error("주 스탯은 0 이상이어야 합니다.");
  if (input.base.weaponAttack < 0)
    throw new Error("무기 공격력은 0 이상이어야 합니다.");
  const criticalDamage =
    input.base.criticalDamageMultiplier ?? DEFAULT_CRITICAL_DAMAGE_MULTIPLIER;
  assertFinite("치명타 피해 배율", criticalDamage);
  if (criticalDamage < 0)
    throw new Error("치명타 피해 배율은 0 이상이어야 합니다.");
  for (const effect of input.effects)
    assertFinite(`효과 ${effect.id}`, effect.value);
  const targetDefense = input.target?.defense ?? DEFAULT_TARGET_DEFENSE;
  assertFinite("대상 방어력", targetDefense);
  if (targetDefense < 0) throw new Error("대상 방어력은 0 이상이어야 합니다.");
}

function activeEffects(input: CombatCalculationInput) {
  const includeUnverified = input.options?.includeUnverifiedEffects === true;
  const applied: CombatEffect[] = [];
  const excluded: CombatEffect[] = [];
  for (const effect of input.effects) {
    const status = effect.status ?? "verified";
    const isApplied =
      effect.enabled !== false &&
      status !== "ignored" &&
      (status !== "unverified" || includeUnverified);
    (isApplied ? applied : excluded).push(effect);
  }
  return { applied, excluded };
}

function bucketEffects(effects: CombatEffect[], bucket: CombatEffectBucket) {
  return effects.filter((effect) => effect.bucket === bucket);
}

function sumBucket(effects: CombatEffect[], bucket: CombatEffectBucket) {
  return bucketEffects(effects, bucket).reduce(
    (sum, effect) => sum + effect.value,
    0,
  );
}

function productByAdditiveGroup(effects: CombatEffect[]) {
  const groups = new Map<string, number>();
  effects.forEach((effect) => {
    const group = effect.stackingGroup ?? effect.id;
    groups.set(group, (groups.get(group) ?? 0) + effect.value);
  });
  return [...groups.values()].reduce(
    (product, value) => product * (1 + value),
    1,
  );
}

function remainingDefenseRate(effects: CombatEffect[]) {
  const groups = new Map<string, number>();
  effects.forEach((effect) => {
    const group = effect.stackingGroup ?? effect.id;
    groups.set(group, (groups.get(group) ?? 0) + effect.value);
  });
  return [...groups.values()].reduce(
    (product, value) => product * (1 - Math.min(1, Math.max(0, value))),
    1,
  );
}

function ids(effects: CombatEffect[], buckets: CombatEffectBucket[]) {
  return effects
    .filter((effect) => buckets.includes(effect.bucket))
    .map((effect) => effect.id);
}

/**
 * 스킬 계수 없이 A~E, G~J를 계산한다.
 * 내부값은 반올림하지 않으며 화면 표시 단계에서만 내림 처리한다.
 */
export function calculateCombatStages(
  input: CombatCalculationInput,
): CombatCalculationResult {
  assertInput(input);
  const { applied, excluded } = activeEffects(input);

  const primaryStat =
    (input.base.primaryStat + sumBucket(applied, "primaryStatFlat")) *
    (1 + sumBucket(applied, "primaryStatRate"));
  const weaponAttack =
    (input.base.weaponAttack + sumBucket(applied, "weaponAttackFlat")) *
    (1 + sumBucket(applied, "weaponAttackRate"));
  const pureAttackPower = Math.sqrt((primaryStat * weaponAttack) / 6);
  const baseAttackPower =
    pureAttackPower * (1 + sumBucket(applied, "baseAttackRate"));
  const finalAttackPower =
    (baseAttackPower + sumBucket(applied, "attackPowerFlat")) *
    (1 + sumBucket(applied, "attackPowerRate"));

  const criticalRate = Math.min(
    1,
    Math.max(0, input.base.criticalRate + sumBucket(applied, "criticalRate")),
  );
  const criticalDamage = Math.max(
    0,
    (input.base.criticalDamageMultiplier ??
      DEFAULT_CRITICAL_DAMAGE_MULTIPLIER) +
      sumBucket(applied, "criticalDamage"),
  );
  const criticalOutgoing = productByAdditiveGroup(
    bucketEffects(applied, "criticalOutgoingDamage"),
  );
  const criticalMultiplier =
    1 - criticalRate + criticalRate * criticalDamage * criticalOutgoing;

  const additionalDamage = 1 + sumBucket(applied, "additionalDamage");
  const outgoingEffects = applied.filter(
    (effect) =>
      effect.bucket === "outgoingDamage" ||
      effect.bucket === "equipmentSetDamage",
  );
  const outgoingDamageMultiplier =
    additionalDamage * productByAdditiveGroup(outgoingEffects);
  const incomingDamageMultiplier = 1 + sumBucket(applied, "incomingDamage");

  const targetDefense = input.target?.defense ?? DEFAULT_TARGET_DEFENSE;
  const effectiveTargetDefense =
    targetDefense *
    remainingDefenseRate(bucketEffects(applied, "defenseReduction"));
  const defenseMultiplier =
    DEFENSE_CONSTANT / (DEFENSE_CONSTANT + effectiveTargetDefense);
  const damageScaleBeforeSkillCoefficient =
    finalAttackPower *
    criticalMultiplier *
    outgoingDamageMultiplier *
    incomingDamageMultiplier *
    defenseMultiplier;

  return {
    stages: {
      primaryStat,
      weaponAttack,
      pureAttackPower,
      baseAttackPower,
      finalAttackPower,
      skillBaseDamage: null,
      criticalRate,
      criticalDamageMultiplier: criticalDamage,
      criticalOutgoingMultiplier: criticalOutgoing,
      criticalMultiplier,
      outgoingDamageMultiplier,
      incomingDamageMultiplier,
      defenseMultiplier,
      finalSkillDamage: null,
    },
    damageScaleBeforeSkillCoefficient,
    targetDefense,
    effectiveTargetDefense,
    appliedEffectIds: applied.map((effect) => effect.id),
    excludedEffectIds: excluded.map((effect) => effect.id),
    trace: [
      {
        stage: "A",
        label: "주 스탯",
        value: primaryStat,
        formula: "(주 스탯 + 고정 증가) × (1 + 증가율 합계)",
        effectIds: ids(applied, ["primaryStatFlat", "primaryStatRate"]),
      },
      {
        stage: "B",
        label: "무기 공격력",
        value: weaponAttack,
        formula: "(무기 공격력 + 고정 증가) × (1 + 증가율 합계)",
        effectIds: ids(applied, ["weaponAttackFlat", "weaponAttackRate"]),
      },
      {
        stage: "C",
        label: "순수 공격력",
        value: pureAttackPower,
        formula: "sqrt((A × B) / 6)",
        effectIds: [],
      },
      {
        stage: "D",
        label: "기본 공격력",
        value: baseAttackPower,
        formula: "C × (1 + 기본 공격력 증가율 합계)",
        effectIds: ids(applied, ["baseAttackRate"]),
      },
      {
        stage: "E",
        label: "최종 공격력",
        value: finalAttackPower,
        formula: "(D + 공격력 고정 증가) × (1 + 공격력 증가율 합계)",
        effectIds: ids(applied, ["attackPowerFlat", "attackPowerRate"]),
      },
      {
        stage: "F",
        label: "스킬 기본 피해",
        value: null,
        formula: "스킬 계수 데이터 대기",
        effectIds: [],
      },
      {
        stage: "G",
        label: "치명타 기대 배율",
        value: criticalMultiplier,
        formula: "(1 - 치적) + 치적 × 치피 × 치명타 주는 피해 그룹",
        effectIds: ids(applied, [
          "criticalRate",
          "criticalDamage",
          "criticalOutgoingDamage",
        ]),
      },
      {
        stage: "H",
        label: "주는 피해 배율",
        value: outgoingDamageMultiplier,
        formula: "(1 + 추가 피해 합계) × 주는 피해 그룹별 배율",
        effectIds: ids(applied, [
          "additionalDamage",
          "outgoingDamage",
          "equipmentSetDamage",
        ]),
      },
      {
        stage: "I",
        label: "받는 피해 배율",
        value: incomingDamageMultiplier,
        formula: "1 + 받는 피해 증가율 합계",
        effectIds: ids(applied, ["incomingDamage"]),
      },
      {
        stage: "J",
        label: "방어력 배율",
        value: defenseMultiplier,
        formula: "6500 / (6500 + 유효 대상 방어력)",
        effectIds: ids(applied, ["defenseReduction"]),
      },
      {
        stage: "K",
        label: "최종 스킬 피해",
        value: null,
        formula: "F × G × H × I × J; 스킬 계수 데이터 대기",
        effectIds: [],
      },
    ],
  };
}

export type SingleSkillCalculationInput = CombatCalculationInput & {
  /** UI/API 원본이 아닌 내부 스냅샷에서 확정한 계산 단계 값. */
  snapshot?: {
    finalAttackPower?: number;
    criticalDamageMultiplier?: number;
    criticalOutgoingMultiplier?: number;
    additionalDamageMultiplier?: number;
    specificTypeDamageMultiplier?: number;
    cardAttributeDamageMultiplier?: number;
    commonEnemyDamageMultiplier?: number;
    /** 기존 호출부 호환용 통합 배율. 분리 배율이 있으면 사용하지 않는다. */
    outgoingDamageMultiplier?: number;
    /** 팔찌 백어택 스킬 자체 피해. 스킬 타입이면 항상 적용한다. */
    backAttackSkillDamageMultiplier?: number;
    /** 기본 백어택 피해와 기습의 대가. 백어택 성공 시에만 적용한다. */
    backAttackSuccessDamageMultiplier?: number;
    focusSkillDamageMultiplier?: number;
    flurrySkillDamageMultiplier?: number;
    manaSkillDamageMultiplier?: number;
    holdingCastingSkillDamageMultiplier?: number;
    superChargeSkillDamageMultiplier?: number;
    /** UI에서 확정된 질서 코어 선택을 계산용 효과로 변환한 목록. */
    arkGridOrderSkillEffects?: readonly ArkGridOrderSkillEffect[];
  };
  /**
   * UI 스냅샷에서 확정된 공통 진화 정보다. 엔진이 선택 트라이포드까지 해석한 뒤
   * 스킬별 진화형 피해를 한 번만 계산한다.
   */
  evolutionContext?: Omit<EvolutionDamageInput, "criticalRate" | "skillName">;
  leapEffects?: readonly { name: string; level: number | null }[];
  skill: {
    name: string;
    level: number;
    selectedTripodNames?: readonly string[];
    /** 조건부 트라이포드가 시뮬레이션 조건에서 충족됐을 때만 true로 전달한다. */
    includeConditionalTripods?: boolean;
    gems?: readonly { type: string; level: number | null }[];
  };
};

export type SingleSkillCalculationResult = {
  skill: Pick<
    GlavierSkillData,
    "name" | "code" | "operationType" | "tags" | "baseCooldownSeconds"
  >;
  level: number;
  motionConstant: number;
  motionMultiplier: number;
  tripodDamageMultiplier: number;
  awakeningDamageMultiplier: number;
  awakeningCriticalRateBonus: number;
  arkGridOrder: ArkGridOrderSkillModifierSnapshot;
  gemDamageMultiplier: number;
  skillBaseDamage: number;
  normalDamage: number;
  maximumCriticalDamage: number;
  expectedDamage: number;
  scenarios: readonly SkillDamageScenarioResult[];
  selectedTripods: readonly GlavierTripodEffect[];
  pendingConditionalTripods: readonly GlavierTripodEffect[];
  evolution: {
    base: number;
    withoutBackAttack: number;
    withBackAttack: number;
    skillSpecificWithoutBackAttack: number;
    isBackAttackSkill: boolean;
  };
  combat: CombatCalculationResult;
};

export type SkillDamageScenarioConditions = {
  azureDragonBuff: boolean;
  backAttack: boolean;
  yeongaSimGong: boolean;
};

export type SkillDamageScenarioResult = {
  conditions: SkillDamageScenarioConditions;
  rawCriticalRate: number;
  criticalRate: number;
  evolutionDamageRate: number;
  yeongaSimGongMultiplier: number;
  skillTypeDamageMultiplier: number;
  backAttackDamageMultiplier: number;
  nonCriticalDamage: number;
  maximumDamage: number;
  averageDamage: number;
};

function selectedTripodEffects(
  skill: GlavierSkillData,
  names: readonly string[],
  includeConditional: boolean,
) {
  const selectedNames = new Set(
    names.filter((name) => name && name !== "없음"),
  );
  const selected: GlavierTripodEffect[] = [];
  const pending: GlavierTripodEffect[] = [];
  for (const effect of skill.tripods) {
    if (!selectedNames.has(effect.name)) continue;
    // 스킬 선택 UI에서 선택한 트라이포드는 해당 조작(차지·홀딩 등)을 수행하는
    // 최대 피해 기준으로 계산한다. 실제 전투 조건에 따른 별도 스위치만 조건부로 남긴다.
    const conditional = effect.status === "조건부 적용";
    if (conditional && !includeConditional) pending.push(effect);
    else if (effect.status === "적용") selected.push(effect);
  }
  return { selected, pending };
}

/**
 * 단일 스킬의 1회 피해를 계산한다.
 * F = (최종 공격력 × 모션 배율 + 모션 상수) × 트라이포드 배율 × 보석 대미지 배율
 * K = F × G × H × I × J
 */
export function calculateSingleSkillDamage(
  input: SingleSkillCalculationInput,
): SingleSkillCalculationResult {
  const skill = GLAVIER_SKILL_BY_NAME[input.skill.name];
  if (!skill) throw new Error(`알 수 없는 스킬입니다: ${input.skill.name}`);
  const level = input.skill.level;
  if (!Number.isInteger(level) || level < 1 || level > 14)
    throw new Error("스킬 레벨은 1~14 정수여야 합니다.");

  const { selected, pending } = selectedTripodEffects(
    skill,
    input.skill.selectedTripodNames ?? [],
    input.skill.includeConditionalTripods === true,
  );
  const arkGridOrder = createArkGridOrderSkillModifierSnapshot(
    input.snapshot?.arkGridOrderSkillEffects ?? [],
    {
      skillName: skill.name,
      operationType: skill.operationType,
      tags: skill.tags,
      selectedTripodNames: input.skill.selectedTripodNames ?? [],
    },
  );
  const isAwakeningSkill =
    skill.name === "맹룡난무" || skill.name === "적룡필살";
  const leapLevel = (name: string) =>
    isAwakeningSkill
      ? (input.leapEffects?.find((effect) => effect.name === name)?.level ?? 0)
      : 0;
  // 관통 필살은 레벨마다 치적이 누적되는 효과가 아니라, 선택 시 초각성 스킬의
  // 치명타 적중률을 100% 증가시키는 단일 효과다. 레벨은 피해량 단계에만 사용한다.
  const awakeningCriticalRate =
    skill.name === "적룡필살" && leapLevel("관통 필살") > 0 ? 1 : 0;
  const criticalEffects: CombatEffect[] = selected.flatMap(
    (effect): CombatEffect[] => {
      if (effect.percentValue === null) return [];
      if (effect.effectType === "치명타 확률 가산") {
        return [
          {
            id: `tripod-${skill.code}-crit-rate-${effect.tier}-${effect.name}`,
            label: `${skill.name} · ${effect.name}`,
            bucket: "criticalRate",
            value: effect.percentValue,
            source: { system: "manual" },
          },
        ];
      }
      if (effect.effectType === "치명타 피해 가산") {
        return [
          {
            id: `tripod-${skill.code}-crit-damage-${effect.tier}-${effect.name}`,
            label: `${skill.name} · ${effect.name}`,
            bucket: "criticalDamage",
            value: effect.percentValue,
            source: { system: "manual" },
          },
        ];
      }
      return [];
    },
  );
  const enlightenmentLevel = (name: string) =>
    input.evolutionContext?.enlightenment?.find((effect) => effect.name === name)
      ?.level ?? 0;
  const enlightenmentEffects: CombatEffect[] = [
    ...(skill.tags.flurry && enlightenmentLevel("치명적인 베기") > 0
      ? [
          {
            id: `enlightenment-${skill.code}-critical-damage`,
            label: `${skill.name} · 치명적인 베기`,
            bucket: "criticalDamage" as const,
            value: enlightenmentLevel("치명적인 베기") * 0.04,
            source: { system: "arkPassive" as const },
          },
        ]
      : []),
    ...(skill.tags.flurry && enlightenmentLevel("전환 난무") > 0
      ? [
          {
            id: `enlightenment-${skill.code}-conversion-critical-rate`,
            label: `${skill.name} · 전환 난무`,
            bucket: "criticalRate" as const,
            value: enlightenmentLevel("전환 난무") * 0.008,
            source: { system: "arkPassive" as const },
          },
        ]
      : []),
  ];
  const skillEffects: CombatEffect[] = [
    ...input.effects,
    ...criticalEffects,
    ...enlightenmentEffects,
    ...(awakeningCriticalRate > 0
      ? [
          {
            id: `leap-${skill.code}-crit-rate`,
            label: `${skill.name} · 관통 필살`,
            bucket: "criticalRate" as const,
            value: awakeningCriticalRate,
            source: { system: "manual" as const },
          },
        ]
      : []),
  ];
  const combat = calculateCombatStages({
    ...input,
    effects: skillEffects,
  });
  const appliedSkillEffects = activeEffects({
    ...input,
    effects: skillEffects,
  }).applied;
  const appliedSkillSpecificEffects = activeEffects({
    ...input,
    effects: [...criticalEffects, ...enlightenmentEffects],
  }).applied;
  const snapshot = input.snapshot;
  if (snapshot) {
    const stages = combat.stages;
    if (snapshot.finalAttackPower !== undefined)
      stages.finalAttackPower = snapshot.finalAttackPower;
    if (snapshot.criticalDamageMultiplier !== undefined) {
      stages.criticalDamageMultiplier =
        snapshot.criticalDamageMultiplier +
        sumBucket(appliedSkillSpecificEffects, "criticalDamage");
    }
    if (snapshot.criticalOutgoingMultiplier !== undefined)
      stages.criticalOutgoingMultiplier =
        snapshot.criticalOutgoingMultiplier *
        arkGridOrder.criticalOutgoingMultiplier;
    const hasSeparatedOutgoingMultipliers =
      snapshot.additionalDamageMultiplier !== undefined ||
      snapshot.specificTypeDamageMultiplier !== undefined ||
      snapshot.cardAttributeDamageMultiplier !== undefined ||
      snapshot.commonEnemyDamageMultiplier !== undefined;
    if (hasSeparatedOutgoingMultipliers) {
      stages.outgoingDamageMultiplier =
        (snapshot.additionalDamageMultiplier ?? 1) *
        (snapshot.specificTypeDamageMultiplier ?? 1) *
        (snapshot.cardAttributeDamageMultiplier ?? 1) *
        (snapshot.commonEnemyDamageMultiplier ?? 1);
    } else if (snapshot.outgoingDamageMultiplier !== undefined) {
      stages.outgoingDamageMultiplier = snapshot.outgoingDamageMultiplier;
    }
    stages.criticalMultiplier =
      1 -
      stages.criticalRate +
      stages.criticalRate *
        stages.criticalDamageMultiplier *
        stages.criticalOutgoingMultiplier;
    combat.damageScaleBeforeSkillCoefficient =
      stages.finalAttackPower *
      stages.criticalMultiplier *
      stages.outgoingDamageMultiplier *
      stages.incomingDamageMultiplier *
      stages.defenseMultiplier;
    const traceValues: Partial<Record<CombatStage, number>> = {
      E: stages.finalAttackPower,
      G: stages.criticalMultiplier,
      H: stages.outgoingDamageMultiplier,
      I: stages.incomingDamageMultiplier,
      J: stages.defenseMultiplier,
    };
    combat.trace.forEach((trace) => {
      if (traceValues[trace.stage] !== undefined) {
        trace.value = traceValues[trace.stage]!;
      }
    });
  }
  const motionMultiplier = skill.motionMultiplier[level - 1] ?? 0;
  const motionConstant = skill.damageCoefficientRows.reduce(
    (total, row) => total + (row.values[level - 1] ?? 0),
    0,
  );
  const tripodDamageMultiplier = selected
    .filter((effect) => effect.effectType === "대미지 배율")
    .reduce((product, effect) => product * (effect.appliedMultiplier ?? 1), 1);
  const gemDamageMultiplier = (input.skill.gems ?? [])
    .filter((gem) => gem.type === "겁화" || gem.type === "멸화")
    .reduce((product, gem) => {
      const levelValues = gemDamageValues[
        gem.type as keyof typeof gemDamageValues
      ] as Record<string, number> | undefined;
      return product * (1 + (levelValues?.[String(gem.level ?? 0)] ?? 0));
    }, 1);
  const awakeningDamageMultiplier = isAwakeningSkill
    ? (1 + leapLevel("풀려난 힘") * 0.03) *
      (skill.name === "적룡필살"
        ? (1 + Math.max(0, leapLevel("관통 필살") - 1) * 0.1) *
          (1 + leapLevel("내지르기") * 0.25)
        : 1) *
      (skill.name === "맹룡난무"
        ? (1 + leapLevel("강인한 타격") * 0.25) *
          (1 + leapLevel("최후의 판단") * 0.3)
        : 1)
    : 1;
  const rawSkillCriticalRate =
    input.base.criticalRate +
    sumBucket(appliedSkillEffects, "criticalRate") +
    arkGridOrder.criticalRateBonus;
  combat.stages.criticalRate = Math.min(1, Math.max(0, rawSkillCriticalRate));
  combat.stages.criticalMultiplier =
    1 -
    combat.stages.criticalRate +
    combat.stages.criticalRate *
      combat.stages.criticalDamageMultiplier *
      combat.stages.criticalOutgoingMultiplier;
  const evolutionInput = input.evolutionContext
    ? {
        ...input.evolutionContext,
        // 뭉툭한 가시의 초과 치적 전환은 표기/기대값용 상한 이전의 원본 치적을 쓴다.
        criticalRate: rawSkillCriticalRate,
        skillName: skill.name,
      }
    : null;
  const evolutionWithoutBackAttack = evolutionInput
    ? baseEvolutionDamageRate(evolutionInput) +
      skillSpecificEvolutionDamageRate({
        ...evolutionInput,
        isBackAttack: arkGridOrder.forceBackAttack,
      })
    : 0;
  const evolutionWithBackAttack =
    evolutionInput && skill.tags.backAttack
      ? baseEvolutionDamageRate(evolutionInput) +
        skillSpecificEvolutionDamageRate({
          ...evolutionInput,
          isBackAttack: true,
        })
      : evolutionWithoutBackAttack;
  const baseEvolutionDamage = evolutionInput
    ? baseEvolutionDamageRate(evolutionInput)
    : 0;
  const skillSpecificEvolutionDamage = evolutionInput
    ? skillSpecificEvolutionDamageRate({
        ...evolutionInput,
        isBackAttack: false,
      })
    : 0;
  const bluntSpikesLevel =
    evolutionInput?.evolution.find((effect) => effect.name === "뭉툭한 가시")
      ?.level ?? 0;
  if (bluntSpikesLevel > 0) {
    // 뭉툭한 가시의 80% 상한은 표기와 기대 피해 양쪽에 적용한다.
    combat.stages.criticalRate = Math.min(0.8, combat.stages.criticalRate);
    combat.stages.criticalMultiplier =
      1 -
      combat.stages.criticalRate +
      combat.stages.criticalRate *
        combat.stages.criticalDamageMultiplier *
        combat.stages.criticalOutgoingMultiplier;
  }
  const evolutionDamageMultiplier = 1 + evolutionWithoutBackAttack;
  const skillBaseDamage =
    (combat.stages.finalAttackPower * motionMultiplier + motionConstant) *
    tripodDamageMultiplier *
    gemDamageMultiplier *
    evolutionDamageMultiplier *
    awakeningDamageMultiplier;
  const nonCriticalScale =
    combat.stages.outgoingDamageMultiplier *
    combat.stages.incomingDamageMultiplier *
    combat.stages.defenseMultiplier;
  const backAttackSkillScale = skill.tags.backAttack
    ? (input.snapshot?.backAttackSkillDamageMultiplier ?? 1)
    : 1;
  const backAttackSuccessScale = skill.tags.backAttack
    ? (input.snapshot?.backAttackSuccessDamageMultiplier ?? 1)
    : 1;
  const focusSkillScale = skill.tags.focus
    ? (input.snapshot?.focusSkillDamageMultiplier ?? 1)
    : 1;
  const flurrySkillScale = skill.tags.flurry
    ? (input.snapshot?.flurrySkillDamageMultiplier ?? 1)
    : 1;
  const manaSkillScale = skill.tags.mana
    ? (input.snapshot?.manaSkillDamageMultiplier ?? 1)
    : 1;
  const holdingCastingSkillScale = skill.tags.holdingOrCasting
    ? (input.snapshot?.holdingCastingSkillDamageMultiplier ?? 1)
    : 1;
  const superChargeActive =
    skill.tags.superChargeCandidate &&
    (skill.tags.superChargeCondition === "상시" ||
      selected.some((effect) => effect.name === "진화하는 창술"));
  const superChargeSkillScale = superChargeActive
    ? (input.snapshot?.superChargeSkillDamageMultiplier ?? 1)
    : 1;
  const enlightenmentSkillScale =
    (skill.tags.flurry ? 1 + enlightenmentLevel("전환 난무") * 0.007 : 1) *
    (skill.tags.focus ? 1 + enlightenmentLevel("강력한 찌르기") * 0.012 : 1);
  const skillTypeDamageMultiplier =
    focusSkillScale *
    flurrySkillScale *
    manaSkillScale *
    holdingCastingSkillScale *
    superChargeSkillScale *
    enlightenmentSkillScale *
    arkGridOrder.damageMultiplier;
  const yeongaSimGongLevel = enlightenmentLevel("연가심공");
  const yeongaDefinition = enlightenmentSkillEffects["연가심공"];
  const yeongaSimGongMultiplier =
    1 + (yeongaSimGongLevel * yeongaDefinition.damagePerLevelPercent) / 100;
  const bluntSpikesCriticalCap = bluntSpikesLevel > 0 ? 0.8 : 1;
  const scenarioBackAttackValues = skill.tags.backAttack
    ? [false, true]
    : [false];
  const scenarios: SkillDamageScenarioResult[] = [];
  for (const azureDragonBuff of [false, true]) {
    for (const backAttack of scenarioBackAttackValues) {
      for (const yeongaSimGong of [false, true]) {
        const effectiveBackAttack = backAttack || arkGridOrder.forceBackAttack;
        const rawCriticalRate =
          rawSkillCriticalRate +
          (azureDragonBuff ? 0.2 : 0) +
          (effectiveBackAttack && skill.tags.backAttack ? 0.1 : 0);
        const criticalRate = Math.min(
          bluntSpikesCriticalCap,
          Math.max(0, rawCriticalRate),
        );
        const scenarioEvolutionDamageRate = input.evolutionContext
          ? evolutionDamageRate({
              ...input.evolutionContext,
              criticalRate: rawCriticalRate,
              skillName: skill.name,
            })
          : 0;
        const scenarioSkillBaseDamage =
          (combat.stages.finalAttackPower * motionMultiplier + motionConstant) *
          tripodDamageMultiplier *
          gemDamageMultiplier *
          (1 + scenarioEvolutionDamageRate) *
          awakeningDamageMultiplier;
        const nonCriticalDamage =
          scenarioSkillBaseDamage *
          nonCriticalScale *
          backAttackSkillScale *
          (effectiveBackAttack ? backAttackSuccessScale : 1) *
          skillTypeDamageMultiplier *
          (yeongaSimGong ? yeongaSimGongMultiplier : 1);
        const maximumDamage =
          nonCriticalDamage *
          combat.stages.criticalDamageMultiplier *
          combat.stages.criticalOutgoingMultiplier;
        const criticalExpectedMultiplier =
          1 -
          criticalRate +
          criticalRate *
            combat.stages.criticalDamageMultiplier *
            combat.stages.criticalOutgoingMultiplier;
        scenarios.push({
          conditions: { azureDragonBuff, backAttack, yeongaSimGong },
          rawCriticalRate,
          criticalRate,
          evolutionDamageRate: scenarioEvolutionDamageRate,
          yeongaSimGongMultiplier: yeongaSimGong ? yeongaSimGongMultiplier : 1,
          skillTypeDamageMultiplier,
          backAttackDamageMultiplier: effectiveBackAttack
            ? backAttackSuccessScale
            : 1,
          nonCriticalDamage,
          maximumDamage,
          averageDamage: nonCriticalDamage * criticalExpectedMultiplier,
        });
      }
    }
  }
  const defaultScenario = scenarios.find(
    (scenario) =>
      !scenario.conditions.azureDragonBuff &&
      !scenario.conditions.backAttack &&
      !scenario.conditions.yeongaSimGong,
  )!;
  const normalDamage = defaultScenario.nonCriticalDamage;
  const maximumCriticalDamage = defaultScenario.maximumDamage;
  const expectedDamage = defaultScenario.averageDamage;

  return {
    skill: {
      name: skill.name,
      code: skill.code,
      operationType: skill.operationType,
      tags: skill.tags,
      baseCooldownSeconds: skill.baseCooldownSeconds,
    },
    level,
    motionConstant,
    motionMultiplier,
    tripodDamageMultiplier,
    awakeningDamageMultiplier,
    awakeningCriticalRateBonus: awakeningCriticalRate,
    arkGridOrder,
    gemDamageMultiplier,
    skillBaseDamage,
    normalDamage,
    maximumCriticalDamage,
    expectedDamage,
    scenarios,
    selectedTripods: selected,
    pendingConditionalTripods: pending,
    evolution: {
      base: baseEvolutionDamage,
      withoutBackAttack: evolutionWithoutBackAttack,
      withBackAttack: evolutionWithBackAttack,
      skillSpecificWithoutBackAttack: skillSpecificEvolutionDamage,
      isBackAttackSkill: skill.tags.backAttack,
    },
    combat,
  };
}

export function floorForDisplay(value: number) {
  assertFinite("표시값", value);
  return Math.floor(value);
}
