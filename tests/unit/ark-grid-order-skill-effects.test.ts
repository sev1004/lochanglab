import assert from "node:assert/strict";
import test from "node:test";

import {
  ARK_GRID_ORDER_CORE_CATALOG,
  arkGridOrderCoreOptions,
  findArkGridOrderCoreDefinition,
} from "../../src/data/ark-grid-order-core-catalog.ts";
import {
  ARK_GRID_ORDER_SKILL_EFFECT_EXCLUSIONS,
  createArkGridOrderCommonDamageSnapshot,
  createArkGridOrderSkillModifierSnapshot,
  resolveArkGridOrderSkillEffects,
} from "../../src/data/ark-grid-order-skill-effects.ts";

test("질서 코어 18개는 직각·넘버링·타입을 갖고 절정 123 다음 절제 123으로 정렬된다", () => {
  assert.equal(ARK_GRID_ORDER_CORE_CATALOG.length, 18);
  assert.deepEqual(arkGridOrderCoreOptions("해"), [
    "적룡의 기운",
    "적룡연격",
    "연가 창식",
    "질풍연격",
    "연가일섬",
    "맹룡오격",
  ]);
  assert.deepEqual(arkGridOrderCoreOptions("달"), [
    "일점 집중",
    "집중 강화",
    "청룡기",
    "맹룡의 기운",
    "비기승화",
    "연환 타격",
  ]);
  assert.deepEqual(arkGridOrderCoreOptions("별"), [
    "진화의 끝",
    "한 점 돌파",
    "맹룡 회도",
    "이중 비기",
    "환영",
    "연격 난무",
  ]);
  assert.deepEqual(findArkGridOrderCoreDefinition("맹룡회도"), {
    name: "맹룡 회도",
    classEngraving: "절정",
    number: 3,
    type: "별",
  });
});

test("질서 코어 계산은 현재 직업 각인과 일치하는 코어만 사용한다", () => {
  const cores = [
    { name: "적룡의 기운", grade: "고대", point: 20 },
    { name: "질풍연격", grade: "고대", point: 20 },
  ];

  const pinnacle = resolveArkGridOrderSkillEffects(cores, "절정");
  const control = resolveArkGridOrderSkillEffects(cores, "절제");
  const pinnacleCommon = createArkGridOrderCommonDamageSnapshot(cores, "절정");
  const controlCommon = createArkGridOrderCommonDamageSnapshot(cores, "절제");

  assert.ok(pinnacle.every((effect) => effect.coreName === "적룡의 기운"));
  assert.ok(control.every((effect) => effect.coreName === "질풍연격"));
  assert.ok(pinnacleCommon.rows.every((row) => row.coreName === "적룡의 기운"));
  assert.ok(controlCommon.rows.every((row) => row.coreName === "질풍연격"));
});

test("질서 코어 18개는 고대·유물 특수 효과가 모두 계산 resolver에 연결된다", () => {
  const catalogNames = ARK_GRID_ORDER_CORE_CATALOG.map((core) => core.name);
  const effectNames = [
    ...new Set(
      resolveArkGridOrderSkillEffects(
        catalogNames.map((name) => ({ name, grade: "고대", point: 20 })),
      ).map((effect) => effect.coreName),
    ),
  ];

  assert.deepEqual([...effectNames].sort(), [...catalogNames].sort());

  for (const grade of ["고대", "유물"] as const) {
    for (const coreName of catalogNames) {
      const effects = resolveArkGridOrderSkillEffects([
        { name: coreName, grade, point: 20 },
      ]);
      assert.ok(
        effects.length > 0,
        `${grade} ${coreName} 특수 효과가 없습니다.`,
      );

      for (const effect of effects) {
        if (!effect.skillNames?.length) continue;
        const skillName = effect.skillNames[0];
        const modifier = createArkGridOrderSkillModifierSnapshot(effects, {
          skillName,
          operationType: effect.operationType ?? "일반",
          tags: {
            focus: effect.skillType === "focus",
            flurry: effect.skillType === "flurry",
          },
          selectedTripodNames: effect.tripodName ? [effect.tripodName] : [],
        });
        assert.ok(
          modifier.appliedEffects.includes(effect),
          `${grade} ${coreName}의 ${effect.kind} 효과가 스킬 modifier에 도달하지 않습니다.`,
        );
      }
    }
  }
});

test("적룡연격 14P는 적주피 감소만 상시 적용하고 지정한 효과는 제외한다", () => {
  const common = createArkGridOrderCommonDamageSnapshot([
    { name: "적룡연격", grade: "고대", point: 14 },
  ]);

  assert.equal(common.totalMultiplier, 0.85);
  assert.deepEqual(
    ARK_GRID_ORDER_SKILL_EFFECT_EXCLUSIONS.filter(
      (effect) => effect.coreName === "적룡연격" && effect.point === 14,
    ).map((effect) => effect.effect),
    ["집중 스킬 재사용 대기시간 60% 감소", "약점 공략 받는 피해 8% 증가"],
  );
});

test("운명 발동 시 직접 적주피와 일반 적주피는 각각 독립 배율로 곱한다", () => {
  const common = createArkGridOrderCommonDamageSnapshot([
    { name: "연가일섬", grade: "고대", point: 17 },
  ]);

  assert.equal(common.rows.length, 2);
  assert.equal(common.totalMultiplier, 1.02 * 1.01);
});

test("고대 질서 코어의 스킬 타입과 특정 스킬 피해를 모두 해석한다", () => {
  const effects = resolveArkGridOrderSkillEffects([
    { name: "적룡연격", grade: "고대", point: 17 },
    { name: "일점 집중", grade: "고대", point: 17 },
  ]);
  const modifier = createArkGridOrderSkillModifierSnapshot(effects, {
    skillName: "적룡포",
    operationType: "홀딩",
    tags: { focus: true, flurry: false },
    selectedTripodNames: [],
  });

  assert.equal(modifier.damageMultiplier, 1.05 * 1.05 * 1.01 * 1.018 * 1.23);
});

test("적룡연격 17P 지정 피해는 현재 사이클 조건 없이 지정 스킬 7개에 모두 적용한다", () => {
  const targetSkills = [
    "맹룡열파",
    "반월섬",
    "맹룡난무",
    "적룡포",
    "적룡필살",
    "굉열파",
    "유성강천",
  ];
  const effects = resolveArkGridOrderSkillEffects([
    { name: "적룡연격", grade: "고대", point: 17 },
  ]);

  for (const skillName of targetSkills) {
    const modifier = createArkGridOrderSkillModifierSnapshot(effects, {
      skillName,
      operationType: "일반",
      tags: { focus: false, flurry: false },
      selectedTripodNames: [],
    });
    const designatedEffect = modifier.appliedEffects.find(
      (effect) =>
        effect.coreName === "적룡연격" &&
        effect.point === 17 &&
        effect.kind === "skillDamage" &&
        effect.percent === 5,
    );

    assert.ok(
      designatedEffect,
      `${skillName}에 적룡연격 17P가 적용되어야 합니다.`,
    );
  }
});

test("트라이포드와 조작 타입 조건은 일치하는 스킬에만 적용한다", () => {
  const effects = resolveArkGridOrderSkillEffects([
    { name: "맹룡 회도", grade: "유물", point: 17 },
    { name: "연환 타격", grade: "유물", point: 17 },
  ]);
  const modifier = createArkGridOrderSkillModifierSnapshot(effects, {
    skillName: "맹룡열파",
    operationType: "일반",
    tags: { focus: false, flurry: true },
    selectedTripodNames: ["우회 베기"],
  });

  assert.equal(modifier.damageMultiplier, 1.3 * 1.13 * 1.015);
});

test("연격 난무의 쿨타임 증가는 스킬별 정량 초로 반환한다", () => {
  const effects = resolveArkGridOrderSkillEffects([
    { name: "연격 난무", grade: "유물", point: 14 },
  ]);
  const modifier = createArkGridOrderSkillModifierSnapshot(effects, {
    skillName: "공의연무",
    operationType: "콤보",
    tags: { focus: false, flurry: true },
    selectedTripodNames: [],
  });

  assert.equal(modifier.damageMultiplier, 4.5);
  assert.equal(modifier.cooldownFlatSeconds, 10);
});
