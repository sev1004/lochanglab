import assert from "node:assert/strict";
import test from "node:test";
import {
  createBaseAttackPowerSnapshot,
  createBackAttackDamageSnapshot,
  createCombatAttributeSnapshots,
  createCombatStatSnapshot,
  createConditionalSkillDamageSnapshot,
  createEngravingOutgoingDamageSnapshot,
  createEnemyDamageSnapshot,
  createFinalAttackPowerSnapshot,
  createPureAttackPowerSnapshot,
  createWeaponAttackSnapshot,
} from "../../src/domain/combat/combat-stat-snapshot.ts";
import type { CharacterProfile } from "../../src/domain/character/character-mapper.ts";
import {
  enlightenmentWeaponAttackRate,
  evolutionDamageRate,
} from "../../src/data/ark-passive-combat-effects.ts";

test("백어택 성공 배율과 백어택 스킬 자체 배율을 분리한다", () => {
  const snapshot = createBackAttackDamageSnapshot([{ name: "기습의 대가" }], {
    slot: "팔찌",
    options: ["백어택 스킬 피해 +3.5%"],
  } as unknown as CharacterProfile["equipment"][number]);

  assert.equal(snapshot.baseSuccessMultiplier, 1.05);
  assert.equal(snapshot.engravingSuccessMultiplier, 1.15);
  assert.equal(snapshot.successMultiplier, 1.2075);
  assert.equal(snapshot.skillMultiplier, 1.035);
});

test("전투 스탯은 펫 적용 전 기본 힘 8,488에 펫·아바타 배율을 합산 적용한다", () => {
  const profile = { equipment: [] } as unknown as CharacterProfile;
  const snapshot = createCombatStatSnapshot({
    equipment: profile.equipment,
    avatarGrades: { 무기: "전설", 머리: "전설", 상의: "전설", 하의: "전설" },
  });
  assert.equal(snapshot.base, 8488);
  assert.equal(snapshot.subtotal, 8488);
  assert.equal(snapshot.petRate, 0.01);
  assert.equal(snapshot.avatarRate, 0.08);
  assert.equal(snapshot.total, 8488 * 1.09);
});

test("악세사리 UI의 숫자만 있는 전투 스탯도 힘으로 합산한다", () => {
  const equipment = [
    { slot: "목걸이", category: "accessory", baseStats: ["15,178"] },
    { slot: "귀걸이", category: "accessory", baseStats: ["11,806"] },
  ] as unknown as CharacterProfile["equipment"];
  const snapshot = createCombatStatSnapshot({ equipment, avatarGrades: {} });
  assert.equal(snapshot.accessories, 26984);
});

test("동일 각인의 본체와 어빌리티 스톤 값은 합산하고 서로 다른 각인은 곱연산한다", () => {
  const result = createEngravingOutgoingDamageSnapshot({
    engravings: [{ name: "원한", grade: "전설", level: 4 }],
    stoneEffects: [{ engraving: "원한", level: 1 }],
  });
  assert.equal(result.groups["원한"], 21);
  assert.equal(result.totalMultiplier, 1.21);
});

test("질서 코어 공용 적주피는 전용 경로에서 한 번만 적용한다", () => {
  const snapshot = createEnemyDamageSnapshot({
    engravings: [],
    stoneEffects: [],
    accessories: [],
    arkGridCores: [{ name: "맹룡 회도", grade: "고대", point: 20 }],
    arkGridEffects: [],
    enlightenment: [],
    moveSpeedPercent: 100,
  });
  const expected = 1.01 * 1.002 * 1.002 * 1.002;

  assert.ok(Math.abs(snapshot.arkGridMultiplier - expected) < 1e-12);
  assert.ok(Math.abs(snapshot.totalMultiplier - expected) < 1e-12);
});

test("마나·홀딩 각인은 공용 적주피에서 제외하고 스킬 조건별 배율로 보관한다", () => {
  const source = {
    engravings: [
      { name: "원한", grade: "전설" as const, level: 4 },
      { name: "속전속결", grade: "유물" as const, level: 2 },
      { name: "마나 효율 증가", grade: "전설" as const, level: 4 },
    ],
    stoneEffects: [
      { engraving: "속전속결", level: 1 },
      { engraving: "마나 효율 증가", level: 2 },
    ],
  };
  const common = createEngravingOutgoingDamageSnapshot(source);
  const conditional = createConditionalSkillDamageSnapshot(source);

  assert.deepEqual(common.groups, { 원한: 18 });
  assert.equal(common.totalMultiplier, 1.18);
  assert.equal(conditional.holdingCastingSkill.groups["속전속결"], 22.5);
  assert.equal(conditional.holdingCastingSkill.totalMultiplier, 1.225);
  assert.equal(conditional.manaSkill.groups["마나 효율 증가"], 16.75);
  assert.equal(conditional.manaSkill.totalMultiplier, 1.1675);
});

test("무공은 장비·악세·팔찌 고정값을 합산한 뒤 귀걸이 증가율을 적용한다", () => {
  const equipment = [
    {
      slot: "무기",
      category: "gear",
      simulationGrade: "전율",
      enhancement: 25,
      itemLevel: "1700",
      name: "전율 무기",
      baseStats: [],
      options: [],
    },
    {
      slot: "귀걸이",
      category: "accessory",
      baseStats: [],
      options: ["무기 공격력 +195", "무기 공격력 +1.80%"],
    },
    {
      slot: "팔찌",
      category: "accessory",
      baseStats: [],
      options: ["공격 적중 시 무공 1160, 공이속 1%"],
    },
  ] as unknown as CharacterProfile["equipment"];
  const result = createWeaponAttackSnapshot({ equipment });
  assert.equal(result.accessoriesFlat, 195);
  assert.equal(result.bracelet, 6960);
  assert.ok(Math.abs(result.accessoriesRate - 0.018) < 1e-12);
  assert.equal(result.total, (result.gear + 7155) * 1.018);
});

test("아크 패시브 시트의 깨달음 무공과 진화 피해 랭크 값을 사용한다", () => {
  assert.equal(enlightenmentWeaponAttackRate(27), 0.027);
  assert.equal(evolutionDamageRate(6), 0.06);
});

test("API 전투 스탯에는 빠진 펫 160을 내부 스냅샷 최종값에 더한다", () => {
  const snapshots = createCombatAttributeSnapshots({
    apiTotals: { 특화: 0, 신속: 1405, 치명: 0, 제압: 0, 인내: 0, 숙련: 0 },
    evolution: [],
    braceletStats: {},
  });
  assert.equal(snapshots["신속"].petStat, 160);
  assert.equal(snapshots["신속"].characterBaseStat, 1245);
  assert.equal(snapshots["신속"].internalTotal, 1565);
});

test("순수 공격력은 확정된 최종 주 스탯과 최종 무공으로 계산한다", () => {
  const snapshot = createPureAttackPowerSnapshot(600000, 100000);
  assert.equal(snapshot.total, 100000);
});

test("기본 공격력은 완갑 고정값과 스톤·적용 보석 증가율을 합산한다", () => {
  const snapshot = createBaseAttackPowerSnapshot({
    pureAttackPower: 100000,
    gauntletFlat: 9050,
    gauntletRate: 0.03,
    stoneLevels: [2, 3],
    gems: [
      { name: "겁화 보석", type: "겁화", level: 10 },
      { name: "광휘의 보석", type: "작열", level: 6 },
      { name: "멸화 보석", type: "겁화", level: 10 },
    ],
  });
  assert.equal(snapshot.stoneRate, 0.015);
  assert.equal(snapshot.gemRate, 0.0165);
  assert.equal(snapshot.rateTotal, 0.0615);
  assert.equal(snapshot.total, 109050 * 1.0615);
});

test("최종 공격력은 악세 고정값과 귀걸이·아크그리드·아드레날린 증가율을 합산한다", () => {
  const snapshot = createFinalAttackPowerSnapshot({
    baseAttackPower: 100000,
    equipment: [
      { slot: "귀걸이", options: ["공격력 +195", "공격력 +0.95%"] },
    ] as unknown as CharacterProfile["equipment"],
    arkGridEffects: [{ name: "공격력", level: 53 }],
    engravings: [{ name: "아드레날린" }],
    stoneEffects: [{ engraving: "아드레날린", level: 3 }],
  });
  assert.equal(snapshot.accessoriesFlat, 195);
  assert.ok(Math.abs(snapshot.arkGridRate - 0.0194) < 1e-12);
  assert.ok(
    Math.abs(snapshot.rateTotal - (0.0095 + 0.0194 + 0.054 + 0.0498)) < 1e-12,
  );
  assert.equal(snapshot.total, 100195 * (1 + snapshot.rateTotal));
});
