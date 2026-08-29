import assert from "node:assert/strict";
import test from "node:test";

import {
  BASE_DEFENSE_MULTIPLIER,
  DEFAULT_TARGET_DEFENSE,
  calculateCombatStages,
  floorForDisplay,
  type CombatCalculationInput,
} from "../../src/domain/combat/combat-engine.ts";

const closeTo = (actual: number, expected: number, epsilon = 1e-12) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not within ${epsilon} of ${expected}`);
};

function baseInput(patch: Partial<CombatCalculationInput> = {}): CombatCalculationInput {
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
  const result = calculateCombatStages(baseInput({
    base: { primaryStat: 600_000, weaponAttack: 100_000, criticalRate: 0 },
    effects: [
      { id: "stat-rate", label: "주 스탯 10%", bucket: "primaryStatRate", value: 0.1 },
      { id: "weapon-flat", label: "무기 공격력 10,000", bucket: "weaponAttackFlat", value: 10_000 },
      { id: "base-attack", label: "기본 공격력 6%", bucket: "baseAttackRate", value: 0.06 },
      { id: "attack-flat", label: "공격력 1,000", bucket: "attackPowerFlat", value: 1_000 },
      { id: "attack-rate", label: "공격력 5%", bucket: "attackPowerRate", value: 0.05 },
    ],
  }));

  assert.equal(result.stages.primaryStat, 660_000);
  assert.equal(result.stages.weaponAttack, 110_000);
  closeTo(result.stages.pureAttackPower, 110_000);
  closeTo(result.stages.baseAttackPower, 116_600);
  closeTo(result.stages.finalAttackPower, 123_480);
});

test("같은 중첩 그룹은 합산하고 서로 다른 그룹은 곱한다", () => {
  const result = calculateCombatStages(baseInput({
    effects: [
      { id: "additional-a", label: "추가 피해", bucket: "additionalDamage", value: 0.1 },
      { id: "additional-b", label: "추가 피해", bucket: "additionalDamage", value: 0.05 },
      { id: "outgoing-a", label: "주는 피해 A", bucket: "outgoingDamage", value: 0.1, stackingGroup: "group-a" },
      { id: "outgoing-b", label: "주는 피해 B", bucket: "outgoingDamage", value: 0.05, stackingGroup: "group-a" },
      { id: "set", label: "장비 세트", bucket: "equipmentSetDamage", value: 0.1, stackingGroup: "equipment-set" },
    ],
  }));

  closeTo(result.stages.outgoingDamageMultiplier, 1.15 * 1.15 * 1.1);
});

test("치명타 조건부 주는 피해를 치명타 기대값 안에서만 적용한다", () => {
  const result = calculateCombatStages(baseInput({
    effects: [
      { id: "crit-damage", label: "치명타 피해", bucket: "criticalDamage", value: 0.1 },
      { id: "crit-outgoing", label: "회심", bucket: "criticalOutgoingDamage", value: 0.05, stackingGroup: "bracelet-critical" },
    ],
  }));

  closeTo(result.stages.criticalMultiplier, 0.5 + 0.5 * 2.1 * 1.05);
});

test("미검증 효과는 기본적으로 제외하고 명시할 때만 포함한다", () => {
  const effect = { id: "unknown", label: "미검증", bucket: "outgoingDamage" as const, value: 0.2, status: "unverified" as const };
  const excluded = calculateCombatStages(baseInput({ effects: [effect] }));
  const included = calculateCombatStages(baseInput({ effects: [effect], options: { includeUnverifiedEffects: true } }));

  assert.equal(excluded.stages.outgoingDamageMultiplier, 1);
  assert.deepEqual(excluded.excludedEffectIds, ["unknown"]);
  assert.equal(included.stages.outgoingDamageMultiplier, 1.2);
});

test("개인 방어력 감소는 유효 대상 방어력을 줄여 J를 다시 계산한다", () => {
  const result = calculateCombatStages(baseInput({
    effects: [{ id: "defense-down", label: "방어력 감소", bucket: "defenseReduction", value: 0.2, stackingGroup: "personal" }],
  }));
  const expectedDefense = DEFAULT_TARGET_DEFENSE * 0.8;
  const expectedMultiplier = 6_500 / (6_500 + expectedDefense);

  closeTo(result.effectiveTargetDefense, expectedDefense);
  closeTo(result.stages.defenseMultiplier, expectedMultiplier);
});

test("내림 처리는 계산 엔진이 아닌 표시 함수에서 수행한다", () => {
  assert.equal(floorForDisplay(854.93), 854);
  assert.equal(floorForDisplay(-0.1), -1);
});
