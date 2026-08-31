import {
  GLAVIER_SKILL_BY_NAME,
  type GlavierSkillData,
  type GlavierTripodEffect,
} from "../../data/generated/glavier-skill-data.ts";

export type GlavierCooldownResolution = {
  baseCooldownSeconds: number;
  cooldownSeconds: number;
  appliedEffects: readonly GlavierTripodEffect[];
  pendingConditionalEffects: readonly GlavierTripodEffect[];
};

export function getGlavierSkill(skillName: string): GlavierSkillData | null {
  return GLAVIER_SKILL_BY_NAME[skillName] ?? null;
}

export function getGlavierSkillLevelCoefficient(skillName: string, level: number, coefficientRow = 0): number | null {
  const skill = getGlavierSkill(skillName);
  return !skill || level < 1 || level > 14 ? null : skill.damageCoefficientRows[coefficientRow]?.values[level - 1] ?? null;
}

export function getGlavierSkillMotionMultiplier(skillName: string, level: number): number | null {
  const skill = getGlavierSkill(skillName);
  return !skill || level < 1 || level > 14 ? null : skill.motionMultiplier[level - 1] ?? null;
}

export function resolveGlavierSkillCooldown({
  skillName,
  selectedTripodNames,
  includeConditionalEffects = false,
}: {
  skillName: string;
  selectedTripodNames: readonly string[];
  includeConditionalEffects?: boolean;
}): GlavierCooldownResolution | null {
  const skill = getGlavierSkill(skillName);
  if (!skill) return null;
  const selected = new Set(selectedTripodNames.filter((name) => name && name !== "없음"));
  const appliedEffects: GlavierTripodEffect[] = [];
  const pendingConditionalEffects: GlavierTripodEffect[] = [];
  let cooldownSeconds = skill.baseCooldownSeconds;

  for (const effect of skill.tripods) {
    if (!selected.has(effect.name) || effect.flatValue === null) continue;
    if (effect.effectType !== "스킬 쿨타임 정량 감소" && effect.effectType !== "스킬 쿨타임 정량 증가") continue;
    const conditional = effect.status === "조건부 적용" || Boolean(effect.condition);
    if (conditional && !includeConditionalEffects) {
      pendingConditionalEffects.push(effect);
      continue;
    }
    cooldownSeconds += effect.effectType === "스킬 쿨타임 정량 감소" ? -effect.flatValue : effect.flatValue;
    appliedEffects.push(effect);
  }
  return { baseCooldownSeconds: skill.baseCooldownSeconds, cooldownSeconds: Math.max(0, cooldownSeconds), appliedEffects, pendingConditionalEffects };
}
