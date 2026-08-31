import assert from "node:assert/strict";
import test from "node:test";

import { createInternalGearSnapshot } from "../../src/domain/combat/internal-gear-snapshot.ts";
import type { EquipmentProfile } from "../../src/domain/character/equipment-parser.ts";

const helmet: EquipmentProfile = {
  id: "helmet",
  slot: "투구",
  category: "gear",
  name: "운명의 전율 투구",
  icon: null,
  grade: "고대",
  simulationGrade: "T4 전율",
  tier: 4,
  quality: 100,
  itemLevel: "1800.00",
  enhancement: 25,
  advancedHoning: null,
  baseStats: ["힘 999999"],
  options: [],
};

test("내부 장비 스냅샷은 API 툴팁 스탯이 아니라 카탈로그와 강화값을 사용한다", () => {
  const snapshot = createInternalGearSnapshot([helmet], [{
    slot: "투구",
    itemLevel: 1800,
    sourceName: "운명의 전율",
    tier: "4T",
    category: "세르카",
    enhancement: 25,
    primaryStat: 1_200,
    weaponAttack: 0,
    baseAttackRate: 0,
  }]);

  const row = snapshot.rows.find((item) => item.slot === "투구");
  assert.equal(row?.primaryStat, 1_200);
  assert.notEqual(row?.primaryStat, 999_999);
  assert.equal(snapshot.primaryStat, 1_200);
  assert.deepEqual(snapshot.unresolvedSlots, ["어깨", "상의", "하의", "장갑", "무기", "완갑"]);
});

test("장비 부위 별칭과 UI 티어명은 시트의 내부 장비 계열로 정규화된다", () => {
  const snapshot = createInternalGearSnapshot([{ ...helmet, slot: "머리", name: "API 원본 장비명" }], [{
    slot: "투구",
    itemLevel: 1800,
    sourceName: "운명의 전율",
    tier: "4T",
    category: "세르카",
    enhancement: 25,
    primaryStat: 1_500,
    weaponAttack: 0,
    baseAttackRate: 0,
  }]);

  assert.equal(snapshot.rows.find((item) => item.slot === "투구")?.status, "resolved");
  assert.equal(snapshot.primaryStat, 1_500);
});

test("강화 단계 변경 시 API의 기존 아이템 레벨에 묶이지 않는다", () => {
  const snapshot = createInternalGearSnapshot([{ ...helmet, enhancement: 24, itemLevel: "1800.00" }], [
    { slot: "투구", itemLevel: 1795, sourceName: "운명의 전율", tier: "4T", category: "세르카", enhancement: 24, primaryStat: 1_350, weaponAttack: 0, baseAttackRate: 0 },
    { slot: "투구", itemLevel: 1800, sourceName: "운명의 전율", tier: "4T", category: "세르카", enhancement: 25, primaryStat: 1_400, weaponAttack: 0, baseAttackRate: 0 },
  ]);

  assert.equal(snapshot.rows.find((item) => item.slot === "투구")?.status, "resolved");
  assert.equal(snapshot.primaryStat, 1_350);
});

test("완갑은 재련 단계별 내부 표를 사용한다", () => {
  const snapshot = createInternalGearSnapshot([{
    ...helmet,
    id: "gauntlet",
    slot: "완갑",
    simulationGrade: "고대",
    enhancement: 25,
    itemLevel: "1800.00",
    baseStats: ["힘 1"],
  }]);

  const row = snapshot.rows.find((item) => item.slot === "완갑");
  assert.equal(row?.status, "resolved");
  assert.equal(row?.primaryStat, 73_710);
  assert.equal(row?.weaponAttack, 22_940);
  assert.equal(row?.baseAttackFlat, 9_050);
  assert.equal(row?.baseAttackRate, 0.03);
});

test("결단 데이터가 없을 때 전율 수치로 대체하지 않는다", () => {
  const snapshot = createInternalGearSnapshot([{ ...helmet, simulationGrade: "결단", enhancement: 30, itemLevel: "1800.00" }], [{
    slot: "투구", itemLevel: 1800, sourceName: "운명의 전율", tier: "4T", category: "다른 분류", enhancement: 30,
    primaryStat: 9_999, weaponAttack: 0, baseAttackRate: 0,
  }]);
  assert.equal(snapshot.rows.find((item) => item.slot === "투구")?.status, "unregistered");
});

test("결단 +25는 결단 전용 재련 표의 아이템 레벨과 부위 스탯을 사용한다", () => {
  const snapshot = createInternalGearSnapshot([
    { ...helmet, id: "decision-head", simulationGrade: "결단", enhancement: 25, itemLevel: "1800.00" },
    { ...helmet, id: "decision-weapon", slot: "무기", simulationGrade: "결단", enhancement: 25, itemLevel: "1800.00" },
  ]);
  const head = snapshot.rows.find((item) => item.slot === "투구");
  const weapon = snapshot.rows.find((item) => item.slot === "무기");
  assert.equal(head?.status, "resolved");
  assert.equal(head?.itemLevel, 1715);
  assert.equal(head?.primaryStat, 84_845);
  assert.equal(weapon?.itemLevel, 1715);
  assert.equal(weapon?.weaponAttack, 147_000);
});

test("무기는 무기 공격력만 사용하고 주 스탯 합계에서는 제외한다", () => {
  const snapshot = createInternalGearSnapshot([{
    ...helmet, id: "weapon", slot: "무기", simulationGrade: "결단", enhancement: 25, itemLevel: "1800.00",
  }]);
  const row = snapshot.rows.find((item) => item.slot === "무기");
  assert.equal(row?.primaryStat, null);
  assert.equal(row?.weaponAttack, 147_000);
  assert.equal(snapshot.primaryStat, 0);
});
