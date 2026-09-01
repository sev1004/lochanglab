import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_DEFENSE_MULTIPLIER,
  DEFAULT_TARGET_DEFENSE,
  calculateCombatStages,
  calculateSingleSkillDamage,
  floorForDisplay,
  type CombatCalculationInput,
} from "../../src/domain/combat/combat-engine.ts";
import {
  baseEvolutionDamageRate,
  bluntSpikesEvolutionDamage,
  evolutionDamageRate,
  flatT5EvolutionDamage,
  manaFurnaceEvolutionDamage,
  skillEvolutionDamageByBackAttack,
  sonicBreakthroughEvolutionDamage,
  skillSpecificEvolutionDamageRate,
} from "../../src/domain/combat/t5-evolution.ts";

const closeTo = (actual: number, expected: number, epsilon = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} is not within ${epsilon} of ${expected}`,
  );
};

function baseInput(
  patch: Partial<CombatCalculationInput> = {},
): CombatCalculationInput {
  return {
    base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0.5 },
    effects: [],
    ...patch,
  };
}

test("방어력 감소가 없으면 합의한 기본 방어력 배율을 사용한다", () => {
  const result = calculateCombatStages(baseInput());

  closeTo(result.stages.defenseMultiplier, BASE_DEFENSE_MULTIPLIER);
  closeTo(result.targetDefense, DEFAULT_TARGET_DEFENSE);
  closeTo(result.effectiveTargetDefense, DEFAULT_TARGET_DEFENSE);
});

test("A~E 공격력 단계를 구분해 계산한다", () => {
  const result = calculateCombatStages(
    baseInput({
      base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0 },
      effects: [
        {
          id: "stat-rate",
          label: "주 스탯 10%",
          bucket: "primaryStatRate",
          value: 0.1,
        },
        {
          id: "weapon-flat",
          label: "무기 공격력 10,000",
          bucket: "weaponAttackFlat",
          value: 10_000,
        },
        {
          id: "base-attack",
          label: "기본 공격력 6%",
          bucket: "baseAttackRate",
          value: 0.06,
        },
        {
          id: "attack-flat",
          label: "공격력 1,000",
          bucket: "attackPowerFlat",
          value: 1_000,
        },
        {
          id: "attack-rate",
          label: "공격력 5%",
          bucket: "attackPowerRate",
          value: 0.05,
        },
      ],
    }),
  );

  assert.equal(result.stages.primaryStat, 660_000);
  assert.equal(result.stages.weaponAttack, 110_000);
  closeTo(result.stages.pureAttackPower, 110_000);
  closeTo(result.stages.baseAttackPower, 116_600);
  closeTo(result.stages.finalAttackPower, 123_480);
});

test("같은 중첩 그룹은 합산하고 서로 다른 그룹은 곱한다", () => {
  const result = calculateCombatStages(
    baseInput({
      effects: [
        {
          id: "additional-a",
          label: "추가 피해",
          bucket: "additionalDamage",
          value: 0.1,
        },
        {
          id: "additional-b",
          label: "추가 피해",
          bucket: "additionalDamage",
          value: 0.05,
        },
        {
          id: "outgoing-a",
          label: "주는 피해 A",
          bucket: "outgoingDamage",
          value: 0.1,
          stackingGroup: "group-a",
        },
        {
          id: "outgoing-b",
          label: "주는 피해 B",
          bucket: "outgoingDamage",
          value: 0.05,
          stackingGroup: "group-a",
        },
        {
          id: "set",
          label: "장비 세트",
          bucket: "equipmentSetDamage",
          value: 0.1,
          stackingGroup: "equipment-set",
        },
      ],
    }),
  );

  closeTo(result.stages.outgoingDamageMultiplier, 1.15 * 1.15 * 1.1);
});

test("치명타 조건부 주는 피해를 치명타 기대값 안에서만 적용한다", () => {
  const result = calculateCombatStages(
    baseInput({
      effects: [
        {
          id: "crit-damage",
          label: "치명타 피해",
          bucket: "criticalDamage",
          value: 0.1,
        },
        {
          id: "crit-outgoing",
          label: "회심",
          bucket: "criticalOutgoingDamage",
          value: 0.05,
          stackingGroup: "bracelet-critical",
        },
      ],
    }),
  );

  closeTo(result.stages.criticalMultiplier, 0.5 + 0.5 * 2.1 * 1.05);
});

test("미검증 효과는 기본적으로 제외하고 명시할 때만 포함한다", () => {
  const effect = {
    id: "unknown",
    label: "미검증",
    bucket: "outgoingDamage" as const,
    value: 0.2,
    status: "unverified" as const,
  };
  const excluded = calculateCombatStages(baseInput({ effects: [effect] }));
  const included = calculateCombatStages(
    baseInput({
      effects: [effect],
      options: { includeUnverifiedEffects: true },
    }),
  );

  assert.equal(excluded.stages.outgoingDamageMultiplier, 1);
  assert.deepEqual(excluded.excludedEffectIds, ["unknown"]);
  assert.equal(included.stages.outgoingDamageMultiplier, 1.2);
});

test("개인 방어력 감소는 유효 대상 방어력을 줄여 J를 다시 계산한다", () => {
  const result = calculateCombatStages(
    baseInput({
      effects: [
        {
          id: "defense-down",
          label: "방어력 감소",
          bucket: "defenseReduction",
          value: 0.2,
          stackingGroup: "personal",
        },
      ],
    }),
  );
  const expectedDefense = DEFAULT_TARGET_DEFENSE * 0.8;
  const expectedMultiplier = 6_500 / (6_500 + expectedDefense);

  closeTo(result.effectiveTargetDefense, expectedDefense);
  closeTo(result.stages.defenseMultiplier, expectedMultiplier);
});

test("내림 처리는 계산 엔진이 아닌 표시 함수에서 수행한다", () => {
  assert.equal(floorForDisplay(854.93), 854);
  assert.equal(floorForDisplay(-0.1), -1);
});

test("단일 스킬은 모든 타격 계수와 모션 배율을 F에 반영한다", () => {
  const result = calculateSingleSkillDamage({
    ...baseInput({
      base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0 },
    }),
    skill: { name: "적룡포", level: 14 },
  });

  closeTo(result.motionMultiplier, 31.70345837);
  closeTo(result.motionConstant, 4_781);
  closeTo(result.skillBaseDamage, 100_000 * 31.70345837 + 4_781);
  closeTo(
    result.normalDamage,
    result.skillBaseDamage * BASE_DEFENSE_MULTIPLIER,
    1e-6,
  );
  closeTo(result.expectedDamage, result.normalDamage);
});

test("대미지·치명 트라이포드는 단일 스킬에만 각각 적용한다", () => {
  const base = calculateSingleSkillDamage({
    ...baseInput({
      base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0 },
    }),
    skill: { name: "적룡포", level: 14 },
  });
  const enhanced = calculateSingleSkillDamage({
    ...baseInput({
      base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0 },
    }),
    skill: {
      name: "적룡포",
      level: 14,
      selectedTripodNames: ["단호한 의지", "파괴하는 창"],
    },
  });

  closeTo(enhanced.tripodDamageMultiplier, 1.7);
  closeTo(
    enhanced.normalDamage,
    enhanced.skillBaseDamage * BASE_DEFENSE_MULTIPLIER,
  );
  assert.equal(enhanced.combat.stages.criticalRate, 1);
  closeTo(enhanced.expectedDamage, enhanced.maximumCriticalDamage);
  closeTo(enhanced.maximumCriticalDamage / enhanced.normalDamage, 2.6);
});

test("초각성 도약 효과는 적룡필살에만 피해·치적을 적용한다", () => {
  const base = calculateSingleSkillDamage({
    ...baseInput({ base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0.5 } }),
    skill: { name: "적룡필살", level: 1 },
  });
  const enhanced = calculateSingleSkillDamage({
    ...baseInput({ base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0.5 } }),
    leapEffects: [
      { name: "풀려난 힘", level: 2 },
      { name: "관통 필살", level: 2 },
      { name: "내지르기", level: 1 },
      { name: "강인한 타격", level: 1 },
      { name: "최후의 판단", level: 1 },
    ],
    skill: { name: "적룡필살", level: 1 },
  });
  closeTo(enhanced.skillBaseDamage / base.skillBaseDamage, 1.06 * 1.1 * 1.25);
  assert.equal(enhanced.combat.stages.criticalRate, 1);

  const levelThree = calculateSingleSkillDamage({
    ...baseInput({ base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0 } }),
    leapEffects: [{ name: "관통 필살", level: 3 }],
    skill: { name: "적룡필살", level: 1 },
  });
  assert.equal(levelThree.combat.stages.criticalRate, 1);

  const flurryAwakening = calculateSingleSkillDamage({
    ...baseInput({ base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0.5 } }),
    leapEffects: [
      { name: "강인한 타격", level: 1 },
      { name: "최후의 판단", level: 1 },
      { name: "내지르기", level: 1 },
      { name: "관통 필살", level: 1 },
    ],
    skill: { name: "맹룡난무", level: 1 },
  });
  closeTo(flurryAwakening.awakeningDamageMultiplier, 1.25 * 1.3);
  closeTo(flurryAwakening.awakeningCriticalRateBonus, 0);
});
test("뭉툭한 가시는 초과 치적을 진화형 피해로 변환하고 상한을 적용한다", () => {
  assert.equal(bluntSpikesEvolutionDamage(1.2, 1), 0.525);
  assert.equal(bluntSpikesEvolutionDamage(1.25, 2), 0.75);
  assert.equal(bluntSpikesEvolutionDamage(0.65, 2), 0.15);
});

test("음속 돌파는 두 속도가 모두 상한을 넘을 때 각각의 초과분을 합산한다", () => {
  assert.equal(sonicBreakthroughEvolutionDamage(145, 145, 2), 0.19);
  assert.equal(sonicBreakthroughEvolutionDamage(160, 155, 2), 0.24);
  assert.equal(sonicBreakthroughEvolutionDamage(145, 139, 2), 0.079);
});

test("T5 고정 진화형 피해 옵션은 레벨별 고정값을 반환한다", () => {
  assert.equal(flatT5EvolutionDamage("인파이팅", 1), 0.09);
  assert.equal(flatT5EvolutionDamage("인파이팅", 2), 0.18);
  assert.equal(flatT5EvolutionDamage("입식 타격가", 1), 0.105);
  assert.equal(flatT5EvolutionDamage("입식 타격가", 2), 0.21);
});

test("마나 용광로는 스킬별 기본 마나 소모량으로 진화형 피해를 계산한다", () => {
  assert.equal(manaFurnaceEvolutionDamage("적룡포", 1), 0.114);
  assert.equal(manaFurnaceEvolutionDamage("적룡포", 2), 0.228);
  assert.equal(manaFurnaceEvolutionDamage("없는 스킬", 1), 0);
});

test("진화형 피해는 기본 옵션을 합산하고 마나 스킬 추가분을 분리한다", () => {
  const evolution = [
    { name: "금단의 주문", level: 2 },
    { name: "인파이팅", level: 1 },
  ];
  assert.equal(evolutionDamageRate({ evolution, skillName: "적룡포" }), 0.29);
  assert.equal(evolutionDamageRate({ evolution }), 0.19);
  assert.equal(evolutionDamageRate({ evolution: [], evolutionRank: 6 }), 0.06);
});

test("백어택 스킬은 백어택 치적 10%를 뭉툭한 가시 변환에만 추가한다", () => {
  const evolution = [{ name: "뭉툭한 가시", level: 1 }];
  assert.equal(
    skillEvolutionDamageByBackAttack({
      evolution,
      skillName: "적룡포",
      criticalRate: 0.75,
      isBackAttack: false,
    }),
    0.075,
  );
  assert.equal(
    skillEvolutionDamageByBackAttack({
      evolution,
      skillName: "적룡포",
      criticalRate: 0.75,
      isBackAttack: true,
    }),
    0.1375,
  );
  assert.equal(
    skillEvolutionDamageByBackAttack({
      evolution,
      skillName: "질풍참",
      criticalRate: 0.75,
      isBackAttack: true,
    }),
    0.075,
  );
});

test("스킬별 진화형 피해는 공통 피해와 조건부 추가분의 합과 같다", () => {
  const input = {
    evolution: [{ name: "금단의 주문", level: 2 }],
    skillName: "적룡포",
    criticalRate: 0.5,
  };
  assert.equal(baseEvolutionDamageRate(input), 0.1);
  assert.equal(skillSpecificEvolutionDamageRate(input), 0.1);
  assert.equal(
    baseEvolutionDamageRate(input) + skillSpecificEvolutionDamageRate(input),
    evolutionDamageRate(input),
  );
});
