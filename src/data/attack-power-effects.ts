import engravingValues from "./engraving-outgoing-damage.json" with { type: "json" };

/** 아드레날린은 6중첩을 전제로 한 공격력 증가율이다. */
export const ADRENALINE_ENGRAVING_ATTACK_RATE = engravingValues.finalAttackPower.아드레날린.basePerStack * engravingValues.finalAttackPower.아드레날린.stacks / 100;
export const ADRENALINE_STONE_ATTACK_RATE: Readonly<Record<number, number>> = Object.fromEntries(
  Object.entries(engravingValues.finalAttackPower.아드레날린StonePerStack).map(([level, value]) => [Number(level), value * engravingValues.finalAttackPower.아드레날린.stacks / 100]),
);

export function adrenalineStoneAttackRate(level: number) {
  return ADRENALINE_STONE_ATTACK_RATE[level] ?? 0;
}
