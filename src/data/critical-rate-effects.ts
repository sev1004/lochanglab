import engravingValues from "./engraving-outgoing-damage.json" with { type: "json" };

export const ENGRAVING_CRITICAL_RATE_PERCENT: Readonly<Record<string, Readonly<Record<number | "전설", number>>>> = {
  아드레날린: { 전설: engravingValues.criticalRate.아드레날린.전설4, 1: engravingValues.criticalRate.아드레날린.유물1, 2: engravingValues.criticalRate.아드레날린.유물2, 3: engravingValues.criticalRate.아드레날린.유물3, 4: engravingValues.criticalRate.아드레날린.유물4 },
  정밀단도: { 전설: engravingValues.criticalRate.정밀단도.전설4, 1: engravingValues.criticalRate.정밀단도.유물1, 2: engravingValues.criticalRate.정밀단도.유물2, 3: engravingValues.criticalRate.정밀단도.유물3, 4: engravingValues.criticalRate.정밀단도.유물4 },
};

export const PRECISION_DAGGER_CRITICAL_DAMAGE_RATE = engravingValues.criticalDamage.정밀단도.base / 100;
export const PRECISION_DAGGER_STONE_CRITICAL_RATE_PERCENT: Readonly<Record<number, number>> = engravingValues.criticalRateStone.정밀단도;

export function engravingCriticalRatePercent(name: string, grade: "유물" | "전설", level: number) {
  return ENGRAVING_CRITICAL_RATE_PERCENT[name]?.[grade === "전설" ? "전설" : level] ?? 0;
}
