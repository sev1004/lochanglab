export const DEFENSE_CONSTANT = 6_500;
export const BASE_DEFENSE_MULTIPLIER = 0.402678946212752;
export const DEFAULT_TARGET_DEFENSE = DEFENSE_CONSTANT * (1 / BASE_DEFENSE_MULTIPLIER - 1);
export const DEFAULT_CRITICAL_DAMAGE_MULTIPLIER = 2;

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
  | "defenseReduction";

export type CombatEffectStatus = "verified" | "assumed" | "unverified" | "ignored";

export type CombatEffectSource = {
  system: "profile" | "equipment" | "accessory" | "bracelet" | "engraving" | "gem" | "arkPassive" | "arkGrid" | "avatar" | "manual";
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

export type CombatStage = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";

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
    criticalMultiplier: number;
    outgoingDamageMultiplier: number;
    incomingDamageMultiplier: 1;
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
  if (!Number.isFinite(value)) throw new Error(`${name} 값은 유한한 숫자여야 합니다.`);
}

function assertInput(input: CombatCalculationInput) {
  assertFinite("주 스탯", input.base.primaryStat);
  assertFinite("무기 공격력", input.base.weaponAttack);
  assertFinite("치명타 적중률", input.base.criticalRate);
  if (input.base.primaryStat < 0) throw new Error("주 스탯은 0 이상이어야 합니다.");
  if (input.base.weaponAttack < 0) throw new Error("무기 공격력은 0 이상이어야 합니다.");
  const criticalDamage = input.base.criticalDamageMultiplier ?? DEFAULT_CRITICAL_DAMAGE_MULTIPLIER;
  assertFinite("치명타 피해 배율", criticalDamage);
  if (criticalDamage < 0) throw new Error("치명타 피해 배율은 0 이상이어야 합니다.");
  for (const effect of input.effects) assertFinite(`효과 ${effect.id}`, effect.value);
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
    const isApplied = effect.enabled !== false && status !== "ignored" && (status !== "unverified" || includeUnverified);
    (isApplied ? applied : excluded).push(effect);
  }
  return { applied, excluded };
}

function bucketEffects(effects: CombatEffect[], bucket: CombatEffectBucket) {
  return effects.filter((effect) => effect.bucket === bucket);
}

function sumBucket(effects: CombatEffect[], bucket: CombatEffectBucket) {
  return bucketEffects(effects, bucket).reduce((sum, effect) => sum + effect.value, 0);
}

function productByAdditiveGroup(effects: CombatEffect[]) {
  const groups = new Map<string, number>();
  effects.forEach((effect) => {
    const group = effect.stackingGroup ?? effect.id;
    groups.set(group, (groups.get(group) ?? 0) + effect.value);
  });
  return [...groups.values()].reduce((product, value) => product * (1 + value), 1);
}

function remainingDefenseRate(effects: CombatEffect[]) {
  const groups = new Map<string, number>();
  effects.forEach((effect) => {
    const group = effect.stackingGroup ?? effect.id;
    groups.set(group, (groups.get(group) ?? 0) + effect.value);
  });
  return [...groups.values()].reduce((product, value) => product * (1 - Math.min(1, Math.max(0, value))), 1);
}

function ids(effects: CombatEffect[], buckets: CombatEffectBucket[]) {
  return effects.filter((effect) => buckets.includes(effect.bucket)).map((effect) => effect.id);
}

/**
 * 스킬 계수 없이 A~E, G~J를 계산한다.
 * 내부값은 반올림하지 않으며 화면 표시 단계에서만 내림 처리한다.
 */
export function calculateCombatStages(input: CombatCalculationInput): CombatCalculationResult {
  assertInput(input);
  const { applied, excluded } = activeEffects(input);

  const primaryStat = (input.base.primaryStat + sumBucket(applied, "primaryStatFlat"))
    * (1 + sumBucket(applied, "primaryStatRate"));
  const weaponAttack = (input.base.weaponAttack + sumBucket(applied, "weaponAttackFlat"))
    * (1 + sumBucket(applied, "weaponAttackRate"));
  const pureAttackPower = Math.sqrt((primaryStat * weaponAttack) / 6);
  const baseAttackPower = pureAttackPower * (1 + sumBucket(applied, "baseAttackRate"));
  const finalAttackPower = (baseAttackPower + sumBucket(applied, "attackPowerFlat"))
    * (1 + sumBucket(applied, "attackPowerRate"));

  const criticalRate = Math.min(1, Math.max(0, input.base.criticalRate + sumBucket(applied, "criticalRate")));
  const criticalDamage = Math.max(0, (input.base.criticalDamageMultiplier ?? DEFAULT_CRITICAL_DAMAGE_MULTIPLIER)
    + sumBucket(applied, "criticalDamage"));
  const criticalOutgoing = productByAdditiveGroup(bucketEffects(applied, "criticalOutgoingDamage"));
  const criticalMultiplier = (1 - criticalRate) + criticalRate * criticalDamage * criticalOutgoing;

  const additionalDamage = 1 + sumBucket(applied, "additionalDamage");
  const outgoingEffects = applied.filter((effect) => effect.bucket === "outgoingDamage" || effect.bucket === "equipmentSetDamage");
  const outgoingDamageMultiplier = additionalDamage * productByAdditiveGroup(outgoingEffects);
  const incomingDamageMultiplier = 1 as const;

  const targetDefense = input.target?.defense ?? DEFAULT_TARGET_DEFENSE;
  const effectiveTargetDefense = targetDefense * remainingDefenseRate(bucketEffects(applied, "defenseReduction"));
  const defenseMultiplier = DEFENSE_CONSTANT / (DEFENSE_CONSTANT + effectiveTargetDefense);
  const damageScaleBeforeSkillCoefficient = finalAttackPower
    * criticalMultiplier
    * outgoingDamageMultiplier
    * incomingDamageMultiplier
    * defenseMultiplier;

  return {
    stages: {
      primaryStat,
      weaponAttack,
      pureAttackPower,
      baseAttackPower,
      finalAttackPower,
      skillBaseDamage: null,
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
      { stage: "A", label: "주 스탯", value: primaryStat, formula: "(주 스탯 + 고정 증가) × (1 + 증가율 합계)", effectIds: ids(applied, ["primaryStatFlat", "primaryStatRate"]) },
      { stage: "B", label: "무기 공격력", value: weaponAttack, formula: "(무기 공격력 + 고정 증가) × (1 + 증가율 합계)", effectIds: ids(applied, ["weaponAttackFlat", "weaponAttackRate"]) },
      { stage: "C", label: "순수 공격력", value: pureAttackPower, formula: "sqrt((A × B) / 6)", effectIds: [] },
      { stage: "D", label: "기본 공격력", value: baseAttackPower, formula: "C × (1 + 기본 공격력 증가율 합계)", effectIds: ids(applied, ["baseAttackRate"]) },
      { stage: "E", label: "최종 공격력", value: finalAttackPower, formula: "(D + 공격력 고정 증가) × (1 + 공격력 증가율 합계)", effectIds: ids(applied, ["attackPowerFlat", "attackPowerRate"]) },
      { stage: "F", label: "스킬 기본 피해", value: null, formula: "스킬 계수 데이터 대기", effectIds: [] },
      { stage: "G", label: "치명타 기대 배율", value: criticalMultiplier, formula: "(1 - 치적) + 치적 × 치피 × 치명타 주는 피해 그룹", effectIds: ids(applied, ["criticalRate", "criticalDamage", "criticalOutgoingDamage"]) },
      { stage: "H", label: "주는 피해 배율", value: outgoingDamageMultiplier, formula: "(1 + 추가 피해 합계) × 주는 피해 그룹별 배율", effectIds: ids(applied, ["additionalDamage", "outgoingDamage", "equipmentSetDamage"]) },
      { stage: "I", label: "받는 피해 배율", value: incomingDamageMultiplier, formula: "현재 범위에서 1로 고정", effectIds: [] },
      { stage: "J", label: "방어력 배율", value: defenseMultiplier, formula: "6500 / (6500 + 유효 대상 방어력)", effectIds: ids(applied, ["defenseReduction"]) },
      { stage: "K", label: "최종 스킬 피해", value: null, formula: "F × G × H × I × J; 스킬 계수 데이터 대기", effectIds: [] },
    ],
  };
}

export function floorForDisplay(value: number) {
  assertFinite("표시값", value);
  return Math.floor(value);
}
