import t5Options from "../../data/t5-evolution-options.json" with { type: "json" };
import skillMana from "../../data/glavier-skill-mana.json" with { type: "json" };
import { evolutionDamageRate as evolutionRankDamageRate } from "../../data/ark-passive-combat-effects.ts";
import { GLAVIER_SKILL_BY_NAME } from "../../data/generated/glavier-skill-data.ts";

type T5OptionLevel = {
  baseEvolutionDamagePercent: number;
  criticalRateCapPercent: number;
  conversionRate: number;
  maxEvolutionDamagePercent: number;
};
type SpeedOptionLevel = {
  speedToEvolutionRate: number;
  baseSpeedIncreaseCapPercent: number;
  thresholdBonusPercent: number;
  conversionRate: number;
  maxEvolutionDamagePercent: number;
};

export function bluntSpikesEvolutionDamage(
  criticalRate: number,
  level: number,
): number {
  const option = (
    t5Options["뭉툭한 가시"].levels as Record<string, T5OptionLevel>
  )[String(level)];
  if (!option || !Number.isFinite(criticalRate)) return 0;
  const criticalRatePercent = criticalRate * 100;
  const excess = Math.max(
    0,
    criticalRatePercent - option.criticalRateCapPercent,
  );
  return (
    Math.min(
      option.maxEvolutionDamagePercent,
      option.baseEvolutionDamagePercent + excess * option.conversionRate,
    ) / 100
  );
}

export function sonicBreakthroughEvolutionDamage(
  attackSpeedPercent: number,
  moveSpeedPercent: number,
  level: number,
): number {
  const option = (
    t5Options["음속 돌파"].levels as unknown as Record<string, SpeedOptionLevel>
  )[String(level)];
  if (
    !option ||
    !Number.isFinite(attackSpeedPercent) ||
    !Number.isFinite(moveSpeedPercent)
  )
    return 0;
  const baseSpeed = t5Options["음속 돌파"].baseSpeedPercent;
  const attackIncrease = Math.max(0, attackSpeedPercent - baseSpeed);
  const moveIncrease = Math.max(0, moveSpeedPercent - baseSpeed);
  const baseDamage =
    (Math.min(attackIncrease, option.baseSpeedIncreaseCapPercent) +
      Math.min(moveIncrease, option.baseSpeedIncreaseCapPercent)) *
    option.speedToEvolutionRate;
  const bothExceedCap =
    attackSpeedPercent > t5Options["음속 돌파"].speedCapPercent &&
    moveSpeedPercent > t5Options["음속 돌파"].speedCapPercent;
  const thresholdBonus = bothExceedCap ? option.thresholdBonusPercent : 0;
  const converted = bothExceedCap
    ? (attackSpeedPercent -
        t5Options["음속 돌파"].speedCapPercent +
        moveSpeedPercent -
        t5Options["음속 돌파"].speedCapPercent) *
      option.conversionRate
    : 0;
  return (
    Math.min(
      option.maxEvolutionDamagePercent,
      baseDamage + thresholdBonus + converted,
    ) / 100
  );
}

export function flatT5EvolutionDamage(
  optionName: "인파이팅" | "입식 타격가",
  level: number,
): number {
  const option = (
    t5Options[optionName].levels as Record<
      string,
      { evolutionDamagePercent: number }
    >
  )[String(level)];
  return option ? option.evolutionDamagePercent / 100 : 0;
}

export function manaFurnaceEvolutionDamage(
  skillName: string,
  level: number,
): number {
  const manaCost = skillMana[skillName as keyof typeof skillMana];
  const option = (
    { 1: { rate: 0.025, cap: 12 }, 2: { rate: 0.05, cap: 24 } } as const
  )[level as 1 | 2];
  if (manaCost === undefined || !option) return 0;
  return Math.min(option.cap, manaCost * option.rate) / 100;
}

/** 백어택 적중/미적중 상태별 스킬 진화형 피해를 계산한다. */
export function skillEvolutionDamageByBackAttack(
  input: EvolutionDamageInput & { isBackAttack: boolean },
): number {
  const skill = input.skillName ? GLAVIER_SKILL_BY_NAME[input.skillName] : null;
  const backAttackBonus =
    input.isBackAttack && skill?.tags.backAttack ? 0.1 : 0;
  return evolutionDamageRate({
    ...input,
    criticalRate: (input.criticalRate ?? 0) + backAttackBonus,
  });
}

export type EvolutionDamageInput = {
  evolution: readonly { name: string; level: number | null }[];
  evolutionRank?: number | null;
  attackSpeedPercent?: number;
  moveSpeedPercent?: number;
  criticalRate?: number;
  skillName?: string;
  supportRageBuff?: boolean;
};

/** H의 진화형 피해 그룹. 그룹 내부 원천은 합산하고, 결과는 내부 배율로 반환한다. */
export function evolutionDamageRate(input: EvolutionDamageInput): number {
  const levelOf = (name: string) =>
    input.evolution.find((effect) => effect.name === name)?.level ?? 0;
  const skill = input.skillName ? GLAVIER_SKILL_BY_NAME[input.skillName] : null;
  const fixedPerLevel: Record<string, number> = {
    "금단의 주문": 5,
    "예리한 감각": 5,
    "한계 돌파": 10,
    "최적화 훈련": 5,
    "무한한 마력": 8,
    "혼신의 강타": 2,
    "파괴 전차": 12,
    "타이밍 지배": 8,
    분쇄: 20,
  };
  let percent = input.supportRageBuff ? 14 : 0;
  percent += evolutionRankDamageRate(input.evolutionRank) * 100;
  for (const [name, value] of Object.entries(fixedPerLevel))
    percent += value * levelOf(name);
  percent += levelOf("인파이팅")
    ? flatT5EvolutionDamage("인파이팅", levelOf("인파이팅")) * 100
    : 0;
  percent += levelOf("입식 타격가")
    ? flatT5EvolutionDamage("입식 타격가", levelOf("입식 타격가")) * 100
    : 0;
  if (levelOf("뭉툭한 가시"))
    percent +=
      bluntSpikesEvolutionDamage(
        input.criticalRate ?? 0,
        levelOf("뭉툭한 가시"),
      ) * 100;
  if (levelOf("음속 돌파"))
    percent +=
      sonicBreakthroughEvolutionDamage(
        input.attackSpeedPercent ?? 100,
        input.moveSpeedPercent ?? 100,
        levelOf("음속 돌파"),
      ) * 100;
  if (levelOf("마나 용광로") && input.skillName && skill?.tags.mana)
    percent +=
      manaFurnaceEvolutionDamage(input.skillName, levelOf("마나 용광로")) * 100;
  if (input.skillName && skill?.tags.mana && levelOf("금단의 주문"))
    percent += levelOf("금단의 주문") * 5;
  return percent / 100;
}

/** 스킬 조건을 제외한 공통 진화형 피해만 계산한다. */
export function baseEvolutionDamageRate(input: EvolutionDamageInput): number {
  return evolutionDamageRate({
    ...input,
    skillName: undefined,
    criticalRate: 0,
  });
}

/** 공통 진화형 피해를 제외한 스킬별 추가분을 계산한다. */
export function skillSpecificEvolutionDamageRate(
  input: EvolutionDamageInput & { isBackAttack?: boolean },
): number {
  const total = skillEvolutionDamageByBackAttack({
    ...input,
    isBackAttack: input.isBackAttack ?? false,
  });
  return Math.max(0, total - baseEvolutionDamageRate(input));
}
