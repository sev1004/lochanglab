export const EVOLUTION_T1_MAX_TOTAL_LEVEL = 40;
export const EVOLUTION_T1_MAX_OPTION_LEVEL = 30;
export const EVOLUTION_T1_STAT_PER_LEVEL = 50;

export const EVOLUTION_T1_OPTIONS = [
  { name: "치명", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_evolution/ark_passive_evolution_1.png" },
  { name: "특화", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_evolution/ark_passive_evolution_2.png" },
  { name: "제압", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_evolution/ark_passive_evolution_3.png" },
  { name: "신속", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_evolution/ark_passive_evolution_4.png" },
  { name: "인내", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_evolution/ark_passive_evolution_5.png" },
  { name: "숙련", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_evolution/ark_passive_evolution_6.png" },
] as const;

export type EvolutionT1OptionName = (typeof EVOLUTION_T1_OPTIONS)[number]["name"];

export type EvolutionTier = "T1" | "T2" | "T3" | "T4" | "T5";
export type EvolutionCatalogOption = { name: string; icon: string; maxLevel: number; effects: string[]; selectable?: boolean };
const evolutionIcon = (number: number) => `https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_evolution/ark_passive_evolution_${number}.png`;

export const EVOLUTION_TIER_CATALOG: Record<EvolutionTier, EvolutionCatalogOption[]> = {
  T1: EVOLUTION_T1_OPTIONS.map((option) => ({ name: option.name, icon: option.icon, maxLevel: 30, effects: [`전투 특성-${option.name} +50`] })),
  T2: [
    ["끝없는 마나", 16, 2, "마나 사용 스킬 재사용 대기시간 7% 감소 · 마나 소모량 10% 감소", true], ["금단의 주문", 12, 2, "진화형 피해 5% 증가 · 마나 스킬 진화형 피해 5% 증가 · 마나 소모량 6% 감소", true], ["예리한 감각", 29, 2, "치명타 적중률 4% 증가 · 진화형 피해 5% 증가", true], ["한계 돌파", 34, 3, "진화형 피해 10% 증가", true], ["최적화 훈련", 22, 2, "스킬 재사용 대기시간 4% 감소 · 진화형 피해 5% 증가", true], ["축복의 여신", 19, 3, "서포터 옵션", false],
  ].map(([name, icon, maxLevel, effect, selectable]) => ({ name: name as string, icon: evolutionIcon(icon as number), maxLevel: maxLevel as number, effects: [effect as string], selectable: selectable as boolean })),
  T3: [
    ["무한한 마력", 14, 2, "진화형 피해 8% 증가 · 마나 스킬 재사용 대기시간 7% 감소 · 마나 소모량 8% 감소", true], ["혼신의 강타", 27, 2, "치명타 적중률 12% 증가 · 진화형 피해 2% 증가", true], ["일격", 32, 2, "치명타 적중률 10% 증가 · 방향성 공격 스킬 치명타 피해 16% 증가", true], ["파괴 전차", 35, 2, "진화형 피해 12% 증가 · 공격 속도 4% 증가", true], ["타이밍 지배", 23, 2, "스킬 재사용 대기시간 5% 감소 · 진화형 피해 8% 증가", true], ["정열의 춤사위", 33, 2, "서포터 옵션", false],
  ].map(([name, icon, maxLevel, effect, selectable]) => ({ name: name as string, icon: evolutionIcon(icon as number), maxLevel: maxLevel as number, effects: [effect as string], selectable: selectable as boolean })),
  T4: [
    ["회심", 40, 1, "회심 12% 증가", true], ["달인", 41, 1, "치명타 적중률 7% · 추가 피해 7%", true], ["분쇄", 44, 1, "진화형 피해 20% 증가", true], ["선각자", 42, 1, "서포터 옵션", false], ["진군", 43, 1, "서포터 옵션", false], ["기원", 45, 1, "서포터 옵션", false],
  ].map(([name, icon, maxLevel, effect, selectable]) => ({ name: name as string, icon: evolutionIcon(icon as number), maxLevel: maxLevel as number, effects: [effect as string], selectable: selectable as boolean })),
  T5: [
    ["뭉툭한 가시", 20, 2], ["음속 돌파", 21, 2], ["인파이팅", 38, 2], ["입식 타격가", 18, 2], ["마나 용광로", 24, 2], ["안정된 관리자", 25, 2],
  ].map(([name, icon, maxLevel]) => ({ name: name as string, icon: evolutionIcon(icon as number), maxLevel: maxLevel as number, effects: [] })),
};

export const EVOLUTION_TIER_RULES: Record<EvolutionTier, { maxSelections: number; pointCost: number; totalLevelCap?: number }> = {
  T1: { maxSelections: 3, pointCost: 1, totalLevelCap: EVOLUTION_T1_MAX_TOTAL_LEVEL },
  T2: { maxSelections: 3, pointCost: 10 },
  T3: { maxSelections: 2, pointCost: 10 },
  T4: { maxSelections: 1, pointCost: 20 },
  T5: { maxSelections: 2, pointCost: 10 },
};
