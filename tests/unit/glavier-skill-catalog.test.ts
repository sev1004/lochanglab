import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCooldownReductionRates,
  getGlavierSkill,
  getGlavierSkillLevelCoefficient,
  getGlavierSkillMotionMultiplier,
  resolveGlavierSkillCooldown,
} from "../../src/domain/skill/glavier-skill-catalog.ts";

test("쿨타임 정량 변화 이후의 보석·신속·아크 패시브 쿨감은 독립 곱연산한다", () => {
  const result = applyCooldownReductionRates(20, [0.24, 0.215, 0.14, 0.08, 0.1]);
  assert.equal(result, 20 * 0.76 * 0.785 * 0.86 * 0.92 * 0.9);
});

test("팔찌 쿨타임 증가는 쿨감 원천과 독립적인 증가 배율로 곱한다", () => {
  assert.equal(applyCooldownReductionRates(20, [0.24, -0.02]), 20 * 0.76 * 1.02);
});

test("시트 카탈로그는 적룡포의 기본 쿨타임과 스킬 태그를 보존한다", () => {
  const skill = getGlavierSkill("적룡포");
  assert.ok(skill);
  assert.equal(skill.baseCooldownSeconds, 24);
  assert.equal(skill.tags.holdingOrCasting, true);
  assert.equal(skill.tags.superChargeCandidate, true);
  // 적룡포의 중복·낮은 모션 상수는 제거하고 유효한 큰 값만 보존한다.
  assert.equal(skill.damageCoefficientRows.length, 1);
});

test("피해 계수와 모션 배율은 Lv.1~Lv.14를 각각 보존한다", () => {
  const skill = getGlavierSkill("적룡포");
  assert.ok(skill);
  assert.equal(skill.damageCoefficientRows[0].values.length, 14);
  assert.equal(skill.motionMultiplier.length, 14);
  assert.equal(getGlavierSkillLevelCoefficient("적룡포", 14), 4781);
  assert.equal(getGlavierSkillMotionMultiplier("적룡포", 14), 31.70345837);
});

test("정량 쿨타임 감소와 증가를 선택 트라이포드로 반영한다", () => {
  const reduced = resolveGlavierSkillCooldown({ skillName: "선풍참혼", selectedTripodNames: ["빠른 준비"] });
  assert.ok(reduced);
  assert.equal(reduced.baseCooldownSeconds, 15);
  assert.equal(reduced.cooldownSeconds, 10);

  const mixed = resolveGlavierSkillCooldown({ skillName: "일섬각", selectedTripodNames: ["기절 효과", "빠른 준비"] });
  assert.ok(mixed);
  assert.equal(mixed.cooldownSeconds, 11);
});

test("범위를 벗어난 레벨 또는 알 수 없는 스킬은 null을 반환한다", () => {
  assert.equal(getGlavierSkillLevelCoefficient("적룡포", 15), null);
  assert.equal(getGlavierSkillMotionMultiplier("없는 스킬", 1), null);
  assert.equal(resolveGlavierSkillCooldown({ skillName: "없는 스킬", selectedTripodNames: [] }), null);
});
