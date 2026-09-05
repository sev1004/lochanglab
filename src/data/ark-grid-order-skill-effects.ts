import catalog from "./ark-grid-order-skill-effects.json" with { type: "json" };
import { resolveArkGridOrderCoreEffects } from "./ark-grid-common-core.ts";
import {
  arkGridOrderCoreMatchesEngraving,
  type GlavierClassEngraving,
} from "./ark-grid-order-core-catalog.ts";

export type ArkGridOrderSkillEffectKind =
  | "skillTypeDamage"
  | "operationTypeDamage"
  | "skillDamage"
  | "tripodSkillDamage"
  | "criticalRate"
  | "criticalOutgoingDamage"
  | "cooldownFlatSeconds"
  | "forceBackAttack";

export type ArkGridOrderSkillEffect = {
  grade: "고대" | "유물";
  coreName: string;
  point: number;
  kind: ArkGridOrderSkillEffectKind;
  skillType?: "focus" | "flurry";
  operationType?: string;
  skillNames?: readonly string[];
  tripodName?: string;
  percent?: number;
  seconds?: number;
};

export type ArkGridOrderSkillModifierSnapshot = {
  damageMultiplier: number;
  criticalRateBonus: number;
  criticalOutgoingMultiplier: number;
  cooldownFlatSeconds: number;
  forceBackAttack: boolean;
  appliedEffects: readonly ArkGridOrderSkillEffect[];
};

export type ArkGridCoreSelection = {
  name: string;
  grade?: string | null;
  description?: string | null;
  point?: number | null;
};

const effects = catalog.effects as ArkGridOrderSkillEffect[];

function normalizeGrade(value: string | null | undefined) {
  if (value?.includes("고대")) return "고대" as const;
  if (value?.includes("유물")) return "유물" as const;
  return null;
}

export function resolveArkGridOrderSkillEffects(
  cores: readonly ArkGridCoreSelection[],
  classEngraving?: GlavierClassEngraving | null,
): ArkGridOrderSkillEffect[] {
  return cores.flatMap((core) => {
    if (!arkGridOrderCoreMatchesEngraving(core.name, classEngraving)) return [];
    const grade = normalizeGrade(core.grade);
    if (!grade) return [];
    return effects.filter(
      (effect) =>
        effect.coreName === core.name &&
        effect.grade === grade &&
        effect.point <= (core.point ?? 0),
    );
  });
}

function appliesToSkill(
  effect: ArkGridOrderSkillEffect,
  context: {
    skillName: string;
    operationType: string;
    tags: { focus: boolean; flurry: boolean };
    selectedTripodNames: readonly string[];
  },
) {
  if (effect.skillType === "focus" && !context.tags.focus) return false;
  if (effect.skillType === "flurry" && !context.tags.flurry) return false;
  if (effect.operationType && effect.operationType !== context.operationType)
    return false;
  if (effect.skillNames && !effect.skillNames.includes(context.skillName))
    return false;
  if (
    effect.tripodName &&
    !context.selectedTripodNames.includes(effect.tripodName)
  )
    return false;
  return true;
}

/**
 * 선택된 질서 코어를 한 스킬에 적용할 계산값으로 변환한다.
 * 피해 효과는 같은 타입이어도 각 행을 독립 배율로 곱한다.
 */
export function createArkGridOrderSkillModifierSnapshot(
  effects: readonly ArkGridOrderSkillEffect[],
  context: {
    skillName: string;
    operationType: string;
    tags: { focus: boolean; flurry: boolean };
    selectedTripodNames: readonly string[];
  },
): ArkGridOrderSkillModifierSnapshot {
  const appliedEffects = effects.filter((effect) =>
    appliesToSkill(effect, context),
  );
  const damageKinds = new Set<ArkGridOrderSkillEffectKind>([
    "skillTypeDamage",
    "operationTypeDamage",
    "skillDamage",
    "tripodSkillDamage",
  ]);
  return {
    damageMultiplier: appliedEffects
      .filter(
        (effect) =>
          damageKinds.has(effect.kind) && effect.percent !== undefined,
      )
      .reduce(
        (product, effect) => product * (1 + (effect.percent ?? 0) / 100),
        1,
      ),
    criticalRateBonus: appliedEffects
      .filter(
        (effect) =>
          effect.kind === "criticalRate" && effect.percent !== undefined,
      )
      .reduce((total, effect) => total + (effect.percent ?? 0) / 100, 0),
    criticalOutgoingMultiplier: appliedEffects
      .filter(
        (effect) =>
          effect.kind === "criticalOutgoingDamage" &&
          effect.percent !== undefined,
      )
      .reduce(
        (product, effect) => product * (1 + (effect.percent ?? 0) / 100),
        1,
      ),
    cooldownFlatSeconds: appliedEffects
      .filter(
        (effect) =>
          effect.kind === "cooldownFlatSeconds" && effect.seconds !== undefined,
      )
      .reduce((total, effect) => total + (effect.seconds ?? 0), 0),
    forceBackAttack: appliedEffects.some(
      (effect) => effect.kind === "forceBackAttack",
    ),
    appliedEffects,
  };
}

function directEnemyDamagePercents(originalEffect: string | null | undefined) {
  if (!originalEffect) return [];
  const matches = originalEffect.matchAll(
    /적에게\s*주는\s*피해(?:량)?(?:이|가)?\s*(\d+(?:\.\d+)?)%\s*(증가|감소)/g,
  );
  return [...matches].flatMap((match) => {
    const prefix = originalEffect.slice(
      Math.max(0, (match.index ?? 0) - 60),
      match.index,
    );
    // 연가 창식의 치명타 적중 시 적주피는 치명타 전용 배율로 별도 처리한다.
    if (/치명타로\s*적중\s*시/.test(prefix)) return [];
    const value = Number(match[1]);
    return [match[2] === "감소" ? -value : value];
  });
}

export function createArkGridOrderCommonDamageSnapshot(
  cores: readonly ArkGridCoreSelection[],
  classEngraving?: GlavierClassEngraving | null,
) {
  const rows = cores.flatMap((core) => {
    if (!arkGridOrderCoreMatchesEngraving(core.name, classEngraving)) return [];
    return resolveArkGridOrderCoreEffects(core).flatMap((record) =>
      directEnemyDamagePercents(record.originalEffect).map((percent) => ({
        grade: record.grade,
        coreName: record.coreName,
        point: record.point,
        percent,
      })),
    );
  });
  return {
    rows,
    totalMultiplier: rows.reduce(
      (product, row) => product * (1 + row.percent / 100),
      1,
    ),
  };
}

export const ARK_GRID_ORDER_SKILL_EFFECT_EXCLUSIONS = catalog.excluded;
