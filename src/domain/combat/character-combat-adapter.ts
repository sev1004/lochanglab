import type { CharacterProfile } from "@/domain/character/character-mapper";
import { findBraceletOption, type BraceletModifier } from "@/domain/bracelet/bracelet-catalog";
import type { CombatCalculationInput, CombatEffect, CombatEffectBucket } from "@/domain/combat/combat-engine";

export type CharacterCombatDraft = {
  input: CombatCalculationInput | null;
  observedFinalAttackPower: number | null;
  primaryStatType: "힘" | "민첩" | "지능" | null;
  effects: CombatEffect[];
  issues: string[];
};

export type CharacterCombatOverrides = {
  primaryStat?: number;
  weaponAttack?: number;
  criticalRate?: number;
  criticalDamageMultiplier?: number;
};

function parseNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.replaceAll(",", "").replace(/[^d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value: string | null | undefined) {
  const parsed = parseNumber(value);
  return parsed === null ? null : parsed / 100;
}

function primaryStats(profile: CharacterProfile) {
  const totals = { 힘: 0, 민첩: 0, 지능: 0 };
  for (const item of profile.equipment) {
    for (const stat of item.baseStats) {
      const match = stat.match(/^(힘|민첩|지능)\s*\+?([\d,]+)/);
      if (match) totals[match[1] as keyof typeof totals] += Number(match[2].replaceAll(",", ""));
    }
  }
  const type = (Object.entries(totals) as Array<[keyof typeof totals, number]>).sort((left, right) => right[1] - left[1])[0];
  return type && type[1] > 0 ? { type: type[0], value: type[1] } : { type: null, value: null };
}

function modifierBucket(modifier: BraceletModifier): CombatEffectBucket | null {
  switch (modifier.type) {
    case "weaponAttack": return "weaponAttackFlat";
    case "additionalDamagePct": return "additionalDamage";
    case "criticalRatePct": return "criticalRate";
    case "criticalDamagePct": return "criticalDamage";
    case "enemyDamagePct": return modifier.condition === "치명타 적중 시" ? "criticalOutgoingDamage" : "outgoingDamage";
    default: return null;
  }
}

function braceletEffects(profile: CharacterProfile) {
  const bracelet = profile.equipment.find((item) => item.slot === "팔찌");
  if (!bracelet) return { effects: [], unsupported: [] };
  const effects: CombatEffect[] = [];
  const unsupported: string[] = [];

  bracelet.options.forEach((optionText, optionIndex) => {
    const definition = findBraceletOption(optionText);
    if (!definition) {
      unsupported.push(`팔찌 옵션을 카탈로그에 매칭하지 못했습니다: ${optionText}`);
      return;
    }
    definition.modifiers.forEach((modifier, modifierIndex) => {
      const bucket = modifierBucket(modifier);
      if (!bucket || definition.group === "지원") {
        unsupported.push(`현재 계산 범위에서 제외된 팔찌 효과입니다: ${definition.label} / ${modifier.type}`);
        return;
      }
      const conditionSupported = !modifier.condition || modifier.condition === "치명타 적중 시";
      effects.push({
        id: `bracelet-${optionIndex}-${modifierIndex}-${definition.id}`,
        label: definition.label,
        bucket,
        value: modifier.unit === "percent" ? modifier.value / 100 : modifier.value,
        stackingGroup: bucket === "outgoingDamage" ? definition.family : bucket,
        status: conditionSupported ? "verified" : "unverified",
        condition: modifier.condition,
        source: { system: "bracelet", entityId: bracelet.id, rawText: optionText },
      });
    });
  });
  return { effects, unsupported };
}

/**
 * 현재 CharacterProfile에서 확실하게 읽을 수 있는 값만 계산 입력으로 변환한다.
 * 무기 공격력 원본이 아직 정규화되지 않았으므로 overrides.weaponAttack 없이는 input을 만들지 않는다.
 */
export function createCharacterCombatDraft(profile: CharacterProfile, overrides: CharacterCombatOverrides = {}): CharacterCombatDraft {
  const primary = primaryStats(profile);
  const bracelet = braceletEffects(profile);
  const issues = [...bracelet.unsupported];
  const primaryStat = overrides.primaryStat ?? primary.value;
  const weaponAttack = overrides.weaponAttack ?? null;
  const criticalRate = overrides.criticalRate ?? parsePercent(profile.combat.criticalChance) ?? 0;
  const observedFinalAttackPower = parseNumber(profile.combat.attackPower);

  if (primaryStat === null) issues.push("장비 기본 효과에서 주 스탯을 확인하지 못했습니다.");
  if (weaponAttack === null) issues.push("API 장비 툴팁의 무기 공격력을 아직 숫자형 데이터로 정규화하지 않았습니다.");
  if (profile.engravingDetails.length) issues.push("각인 효과 카탈로그 연결 전이므로 각인 수치는 계산에서 제외됩니다.");
  if (profile.gems.length) issues.push("보석의 기본 공격력 및 스킬 효과 카탈로그 연결 전이므로 계산에서 제외됩니다.");
  if (profile.avatars.length) issues.push("아바타 주 스탯 증가율 카탈로그 연결 전이므로 계산에서 제외됩니다.");
  if (profile.equipment.some((item) => item.category === "gear")) issues.push("장비 세트 효과 카탈로그 연결 전이므로 계산에서 제외됩니다.");
  if (profile.arkPassive.evolution.length || profile.arkPassive.enlightenment.length || profile.arkPassive.leap.length) {
    issues.push("아크 패시브 효과 카탈로그 연결 전이므로 T1 외 수치는 계산에서 제외됩니다.");
  }
  if (profile.arkGrid.cores.length || profile.arkGrid.effects.length) issues.push("아크 그리드 효과 카탈로그 연결 전이므로 계산에서 제외됩니다.");

  const input = primaryStat === null || weaponAttack === null ? null : {
    base: {
      primaryStat,
      weaponAttack,
      criticalRate,
      criticalDamageMultiplier: overrides.criticalDamageMultiplier,
    },
    effects: bracelet.effects,
  } satisfies CombatCalculationInput;

  return {
    input,
    observedFinalAttackPower,
    primaryStatType: primary.type,
    effects: bracelet.effects,
    issues,
  };
}
