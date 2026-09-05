"use client";

import {
  FormEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  mapCharacterResponse,
  type CharacterProfile,
  type EngravingProfile,
} from "@/domain/character/character-mapper";
import type { EquipmentProfile } from "@/domain/character/equipment-parser";
import {
  GLAVIER_ORDER_CORE_OPTIONS,
  type ArkEffectProfile,
  type ArkGridCoreProfile,
  type GemProfile,
  type SkillProfile,
} from "@/domain/character/character-systems-parser";
import { loadLatestCharacter, saveCharacter } from "@/lib/character-storage";
import { fetchCharacter, LostArkApiError } from "@/lib/lostark-api/client";
import { ENGRAVING_NAMES, engravingIcon } from "@/data/engraving-catalog";
import {
  BRACELET_EFFECT_OPTIONS,
  BRACELET_PRIMARY_STAT_TYPES,
  BRACELET_STAT_TYPES,
} from "@/data/bracelet-options";
import {
  EVOLUTION_T1_MAX_OPTION_LEVEL,
  EVOLUTION_T1_MAX_TOTAL_LEVEL,
  EVOLUTION_T1_OPTIONS,
  EVOLUTION_T1_STAT_PER_LEVEL,
  EVOLUTION_TIER_CATALOG,
  EVOLUTION_TIER_RULES,
  type EvolutionT1OptionName,
  type EvolutionTier,
} from "@/data/ark-passive-evolution";
import {
  findBraceletOption,
  mergeBraceletOptionTexts,
} from "@/domain/bracelet/bracelet-catalog";
import { arkGridGemPercent } from "@/data/ark-grid-gem-values";
import { resolveArkGridCommonCoreEffects } from "@/data/ark-grid-common-core";
import {
  findArkGridOrderCoreDefinition,
  type GlavierClassEngraving,
} from "@/data/ark-grid-order-core-catalog";
import { resolveArkGridOrderSkillEffects } from "@/data/ark-grid-order-skill-effects";
import { GLAVIER_SKILL_TRIPODS } from "@/data/glavier-skill-tripods";
import { GLAVIER_SKILL_TRIPOD_DETAILS } from "@/data/glavier-skill-tripod-details";
import {
  calculateSingleSkillDamage,
  DEFAULT_TARGET_DEFENSE,
  type SingleSkillCalculationResult,
} from "@/domain/combat/combat-engine";
import { GLAVIER_SKILL_BY_NAME } from "@/data/generated/glavier-skill-data";
import {
  applyCooldownReductionRates,
  getGlavierSkill,
  resolveGlavierSkillCooldown,
} from "@/domain/skill/glavier-skill-catalog";
import { createInternalGearSnapshot } from "@/domain/combat/internal-gear-snapshot";
import {
  createAdditionalDamageSnapshot,
  createSpecificTypeDamageSnapshot,
  createCardAttributeDamageSnapshot,
  createBackAttackDamageSnapshot,
  createConditionalSkillDamageSnapshot,
  createEngravingOutgoingDamageSnapshot,
  createEnemyDamageSnapshot,
  FOCUS_SKILL_DAMAGE_PER_SPECIALIZATION_PERCENT,
  FLURRY_SKILL_DAMAGE_MULTIPLIER,
  createBaseAttackPowerSnapshot,
  createCombatAttributeSnapshots,
  createCurrentCombatAttributeSnapshots,
  createCombatStatSnapshot,
  createCriticalDamageSnapshot,
  createCriticalOutgoingSnapshot,
  createCriticalRateOptionSnapshot,
  createCriticalStatSnapshot,
  createFinalAttackPowerSnapshot,
  createPureAttackPowerSnapshot,
  createWeaponAttackSnapshot,
} from "@/domain/combat/combat-stat-snapshot";
import { enlightenmentWeaponAttackRate } from "@/data/ark-passive-combat-effects";
import {
  baseEvolutionDamageRate,
  evolutionDamageRate,
} from "@/domain/combat/t5-evolution";
import melhaGemIcon from "@/img/10level_a.png";
import hongyeomGemIcon from "@/img/10level_c.png";
import pcBuffIcon from "@/img/pcbuff.png";
import blessingBuffIcon from "@/img/에아달린축복buff.png";
import wineBuffIcon from "@/img/베르닐와인buff.png";
import azenaBuffIcon from "@/img/Azenabuff.png";
import vulnerableAttributeBuffIcon from "@/img/취약속성buff.png";
import engravingValues from "@/data/engraving-outgoing-damage.json";
import enlightenmentSkillEffects from "@/data/enlightenment-skill-effects.json";

type MainMenu = "simulation" | "comparison" | "api";
type SimulationTab = "기본 장비" | "스킬 & 전투 사이클";
type CycleEntry = {
  id: string;
  skillName: string;
  azureDragon: boolean;
  yeongaSimGong: boolean;
};
type CyclePreset = {
  id: string;
  label: string;
  entries: readonly Pick<CycleEntry, "skillName" | "azureDragon" | "yeongaSimGong">[];
  guidanceSeconds?: number;
};
type CycleDurationMode = "guideline" | "manual";
type CycleSkillRatioSettings = Record<
  string,
  {
    backAttackRate: string;
    cooldownRate: string;
  }
>;
type SavedSetting = {
  id: string;
  name: string;
  cycle: string[];
  itemLevel: string;
  attackPower: string;
  savedAt: string;
};
type StoneEffect = { engraving: string; level: number };
type BraceletPrimaryStat = (typeof BRACELET_PRIMARY_STAT_TYPES)[number];
type BraceletStat = {
  type: (typeof BRACELET_STAT_TYPES)[number] | BraceletPrimaryStat;
  value: string;
};
type PassiveGroup = "evolution" | "enlightenment" | "leap";

function selectableTripodCountForSkillLevel(level: number) {
  return level <= 3 ? 0 : level <= 6 ? 1 : level <= 9 ? 2 : 3;
}

function activeTripodNamesForSkill(skill: SkillProfile) {
  const limit = selectableTripodCountForSkillLevel(skill.level);
  return Array.from({ length: 3 }, (_, index) =>
    index < limit ? (skill.tripods[index]?.name ?? "없음") : "없음",
  );
}

function glavierClassEngraving(
  character: CharacterProfile,
): GlavierClassEngraving | null {
  const text = [
    character.buildName,
    ...character.arkPassive.enlightenment.map(
      (effect) => `${effect.name} ${effect.description ?? ""}`,
    ),
  ].join(" ");
  if (text.includes("절제")) return "절제";
  if (text.includes("절정")) return "절정";
  return null;
}

function formatApiCombatPower(value: CharacterProfile["apiCombatPower"]) {
  if (value === null) return "API 미제공";
  const numericValue = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(numericValue)
    ? Math.floor(numericValue).toLocaleString()
    : String(value);
}

const normalJeoljeongFirstRound = [
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "반월섬", azureDragon: true, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
  { skillName: "유성강천", azureDragon: false, yeongaSimGong: false },
  { skillName: "적룡필살", azureDragon: false, yeongaSimGong: true },
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: false },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const normalJeoljeongRedDragonRound = [
  ...normalJeoljeongFirstRound.slice(0, 4),
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: true },
  ...normalJeoljeongFirstRound.slice(6),
] as const;
const normalJeoljeongCycleEntries = [
  ...normalJeoljeongFirstRound,
  ...normalJeoljeongRedDragonRound,
  ...normalJeoljeongRedDragonRound,
] as const;
const bluntJeoljeongFirstRound = [
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "유성강천", azureDragon: true, yeongaSimGong: false },
  { skillName: "적룡필살", azureDragon: true, yeongaSimGong: true },
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: false },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const bluntJeoljeongFollowupRound = [
  { skillName: "반월섬", azureDragon: false, yeongaSimGong: false },
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
  { skillName: "유성강천", azureDragon: true, yeongaSimGong: false },
  { skillName: "적룡포", azureDragon: true, yeongaSimGong: true },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const bluntJeoljeongCycleEntries = [
  ...bluntJeoljeongFirstRound,
  ...bluntJeoljeongFollowupRound,
  ...bluntJeoljeongFollowupRound,
  { skillName: "반월섬", azureDragon: false, yeongaSimGong: false },
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
] as const;
const manaJeoljeongFirstRound = bluntJeoljeongFirstRound;
const manaJeoljeongFollowupRound = [
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "반월섬", azureDragon: true, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
  { skillName: "유성강천", azureDragon: false, yeongaSimGong: false },
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: true },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const manaJeoljeongCycleEntries = [
  ...manaJeoljeongFirstRound,
  ...manaJeoljeongFollowupRound,
  ...manaJeoljeongFollowupRound,
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "반월섬", azureDragon: true, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
] as const;
const jeoljeong222FirstRound = [
  { skillName: "반월섬", azureDragon: false, yeongaSimGong: false },
  { skillName: "회선창", azureDragon: false, yeongaSimGong: false },
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "유성강천", azureDragon: true, yeongaSimGong: false },
  { skillName: "적룡필살", azureDragon: true, yeongaSimGong: true },
  { skillName: "적룡포", azureDragon: true, yeongaSimGong: false },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const jeoljeong222BlueDragonRound = [
  { skillName: "청룡출수", azureDragon: false, yeongaSimGong: false },
  { skillName: "선풍참혼", azureDragon: false, yeongaSimGong: true },
  { skillName: "유성강천", azureDragon: false, yeongaSimGong: false },
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: true },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const jeoljeong222RedDragonRound = [
  { skillName: "반월섬", azureDragon: false, yeongaSimGong: true },
  { skillName: "회선창", azureDragon: false, yeongaSimGong: false },
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "유성강천", azureDragon: true, yeongaSimGong: false },
  { skillName: "적룡포", azureDragon: true, yeongaSimGong: true },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const jeoljeong222CycleEntries = [
  ...jeoljeong222FirstRound,
  ...jeoljeong222BlueDragonRound,
  ...jeoljeong222RedDragonRound,
  ...jeoljeong222BlueDragonRound,
  ...jeoljeong222RedDragonRound,
  ...jeoljeong222BlueDragonRound,
  ...jeoljeong222RedDragonRound,
] as const;

function createCyclePresets(
  classEngraving: GlavierClassEngraving | null,
  shorthand: string | null,
  hasBluntEdge: boolean,
  hasManaFurnace: boolean,
): CyclePreset[] {
  if (classEngraving !== "절정") return [];
  const normalCores = new Set(["113", "111", "122"]);
  const bluntCores = new Set(["333", "323", "322", "331", "332"]);
  if (shorthand === "222") {
    return [
      {
        id: "jeoljeong-222",
        label: "절정 222 기본 사이클 (47개)",
        entries: jeoljeong222CycleEntries,
      },
    ];
  }
  if (hasManaFurnace && shorthand === "333") {
    return [
      {
        id: "jeoljeong-mana",
        label: "절정 333 · 마나 용광로 기본 사이클 (23개)",
        entries: manaJeoljeongCycleEntries,
      },
    ];
  }
  if (hasBluntEdge && bluntCores.has(shorthand ?? "")) {
    return [
      {
        id: "jeoljeong-blunt",
        label: "절정 · 뭉툭한 가시 기본 사이클 (23개)",
        entries: bluntJeoljeongCycleEntries,
      },
    ];
  }
  if (!normalCores.has(shorthand ?? "")) return [];
  return [
    {
      id: "jeoljeong-normal",
      label: "절정 기본 사이클 (22개)",
      entries: normalJeoljeongCycleEntries,
    },
  ];
}

function buildUnifiedCombatSnapshot(
  character: CharacterProfile,
  avatarGrades: Record<string, string>,
  stoneEffects: StoneEffect[],
  gems: GemProfile[],
  supportRageBuff: boolean,
  banquetBuff: boolean,
  blessingFood: boolean,
  wineFood: boolean,
  azenaBuff: boolean,
  vulnerableAttribute = false,
) {
  const classEngraving = glavierClassEngraving(character);
  const attributes = character.initialCombatAttributes
    ? createCurrentCombatAttributeSnapshots({
        baseline: character.initialCombatAttributes,
        evolution: character.arkPassive.evolution,
        braceletStats: combatAttributeInput(character).braceletStats,
      })
    : createCombatAttributeSnapshots(combatAttributeInput(character));
  const speed = buildSpeedSnapshotValues(
    character,
    supportRageBuff,
    banquetBuff,
    blessingFood,
    wineFood,
    attributes["신속"].internalTotal,
  );
  const combatStats = createCombatStatSnapshot({
    equipment: character.equipment,
    avatarGrades,
    azenaBonus: azenaBuff ? 6000 : 0,
  });
  const weaponAttack = createWeaponAttackSnapshot({
    equipment: character.equipment,
    banquetBonus: banquetBuff ? 1600 : 0,
    arkGridCores: character.arkGrid.cores,
    enlightenmentRate: enlightenmentWeaponAttackRate(
      character.arkPassive.points.find((point) => point.name === "깨달음")
        ?.level ?? 0,
    ),
  });
  const pureAttackPower = createPureAttackPowerSnapshot(
    combatStats.total,
    weaponAttack.total,
  );
  const internalGearSnapshot = createInternalGearSnapshot(character.equipment);
  const baseAttackPower = createBaseAttackPowerSnapshot({
    pureAttackPower: pureAttackPower.total,
    gauntletFlat: internalGearSnapshot.baseAttackFlat,
    gauntletRate: internalGearSnapshot.baseAttackRate,
    stoneLevels: stoneEffects.map((effect) => effect.level),
    gems,
  });
  const finalAttackPower = createFinalAttackPowerSnapshot({
    baseAttackPower: baseAttackPower.total,
    equipment: character.equipment,
    arkGridEffects: character.arkGrid.effects,
    arkGridCores: character.arkGrid.cores,
    engravings: character.engravingDetails,
    stoneEffects,
  });
  const criticalStat = createCriticalStatSnapshot({
    apiTotal: attributes["치명"].internalTotal,
    evolutionT1Level: 0,
    braceletStat: 0,
  });
  const criticalRate = createCriticalRateOptionSnapshot({
    criticalStat,
    accessories: character.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ),
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    evolution: character.arkPassive.evolution,
    engravings: character.engravingDetails,
    stoneEffects,
    arkGridCores: character.arkGrid.cores,
  });
  const criticalDamage = createCriticalDamageSnapshot({
    accessories: character.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ),
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    enlightenment: character.arkPassive.enlightenment,
    engravings: character.engravingDetails,
    stoneEffects,
    arkGridCores: character.arkGrid.cores,
  });
  const criticalOutgoing = createCriticalOutgoingSnapshot({
    evolution: character.arkPassive.evolution,
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    arkGridCores: character.arkGrid.cores,
  });
  const additionalDamage = createAdditionalDamageSnapshot({
    weaponQuality:
      character.equipment.find((item) => item.slot === "무기")?.quality ?? 0,
    accessories: character.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ),
    evolution: character.arkPassive.evolution,
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    arkGridCores: character.arkGrid.cores,
    arkGridEffects: character.arkGrid.effects,
  });
  const specificTypeDamage = createSpecificTypeDamageSnapshot({
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
  });
  const cardAttributeDamage =
    createCardAttributeDamageSnapshot(vulnerableAttribute);
  const backAttackDamage = createBackAttackDamageSnapshot(
    character.engravingDetails,
    character.equipment.find((item) => item.slot === "팔찌"),
  );
  const engravingOutgoingDamage = createEngravingOutgoingDamageSnapshot({
    engravings: character.engravingDetails,
    stoneEffects,
  });
  const conditionalSkillDamage = createConditionalSkillDamageSnapshot({
    engravings: character.engravingDetails,
    stoneEffects,
  });
  const enemyDamage = createEnemyDamageSnapshot({
    engravings: character.engravingDetails,
    stoneEffects,
    accessories: character.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ),
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    arkGridCores: character.arkGrid.cores,
    arkGridEffects: character.arkGrid.effects,
    enlightenment: character.arkPassive.enlightenment,
    moveSpeedPercent: speed.moveSpeedPercent,
    classEngraving,
  });
  const braceletDefenseReduction = (
    character.equipment.find((item) => item.slot === "팔찌")?.options ?? []
  ).reduce((total, text) => {
    const definition = findBraceletOption(text);
    return (
      total +
      (definition?.modifiers
        .filter((modifier) => modifier.type === "enemyDefenseReductionPct")
        .reduce((sum, modifier) => sum + modifier.value / 100, 0) ?? 0)
    );
  }, 0);
  return {
    combatAttributes: attributes,
    internalGearSnapshot,
    combatStatsSnapshot: combatStats,
    weaponAttackSnapshot: weaponAttack,
    baseAttackPowerSnapshot: baseAttackPower,
    finalAttackPowerSnapshot: finalAttackPower,
    criticalRateSnapshot: criticalRate,
    criticalDamageSnapshot: criticalDamage,
    criticalOutgoingSnapshot: criticalOutgoing,
    additionalDamageSnapshot: additionalDamage,
    specificTypeDamageSnapshot: specificTypeDamage,
    cardAttributeDamageSnapshot: cardAttributeDamage,
    backAttackDamageSnapshot: backAttackDamage,
    engravingOutgoingDamageSnapshot: engravingOutgoingDamage,
    conditionalSkillDamageSnapshot: conditionalSkillDamage,
    enemyDamageSnapshot: enemyDamage,
    arkGridOrderSkillEffects: resolveArkGridOrderSkillEffects(
      character.arkGrid.cores,
      classEngraving,
    ),
    focusSkillDamageMultiplier:
      1 +
      (attributes["특화"].internalTotal *
        FOCUS_SKILL_DAMAGE_PER_SPECIALIZATION_PERCENT) /
        100,
    flurrySkillDamageMultiplier: FLURRY_SKILL_DAMAGE_MULTIPLIER,
    finalAttackPower: finalAttackPower.total,
    criticalRate: criticalRate.total,
    criticalDamageMultiplier: criticalDamage.total,
    criticalOutgoingMultiplier: criticalOutgoing.total,
    attackSpeedPercent: speed.attackSpeedPercent,
    moveSpeedPercent: speed.moveSpeedPercent,
    targetDefense: DEFAULT_TARGET_DEFENSE,
    defenseReductionRate: braceletDefenseReduction,
    incomingDamageMultiplier:
      1 +
      (character.arkPassive.enlightenment.find(
        (effect) => effect.name === "연가표식",
      )?.level ?? 0) *
        0.012,
    evolution: baseEvolutionDamageRate({
      evolution: character.arkPassive.evolution,
      evolutionRank: character.arkPassive.points.find(
        (point) => point.name === "진화",
      )?.rank,
      attackSpeedPercent: speed.attackSpeedPercent,
      moveSpeedPercent: speed.moveSpeedPercent,
      supportRageBuff,
    }),
  };
}

function buildSpeedSnapshotValues(
  character: CharacterProfile,
  supportRageBuff: boolean,
  banquetBuff: boolean,
  blessingFood: boolean,
  wineFood: boolean,
  internalSwiftness?: number,
) {
  const swiftness = internalSwiftness ?? 0;
  const bracelet = character.equipment.find((item) => item.slot === "팔찌");
  const braceletSpeed = (bracelet?.options ?? []).reduce((total, text) => {
    const definition = findBraceletOption(text);
    return (
      total +
      (definition?.modifiers
        .filter((modifier) => modifier.type === "attackMoveSpeedPct")
        .reduce((sum, modifier) => sum + modifier.value * 6, 0) ?? 0)
    );
  }, 0);
  const speedEngravingLevels = engravingValues.speed["정기 흡수"] as Record<
    string,
    number
  >;
  const speedStoneLevels = engravingValues.speed["정기 흡수Stone"] as Record<
    string,
    number
  >;
  const engravings = character.engravingDetails.reduce((total, engraving) => {
    if (engraving.name !== "정기 흡수") return total;
    return (
      total +
      (engraving.grade === "전설"
        ? speedEngravingLevels.전설4
        : (speedEngravingLevels[`유물${engraving.level}`] ?? 0))
    );
  }, 0);
  const stone = character.engravingDetails.reduce((total, engraving) => {
    if (engraving.name !== "정기 흡수") return total;
    return total + (speedStoneLevels[String(engraving.abilityStoneLevel)] ?? 0);
  }, 0);
  const massIncrease = character.engravingDetails.some(
    (engraving) => engraving.name === "질량 증가",
  )
    ? engravingValues.speed["질량 증가"]
    : 0;
  const destructionTrain =
    (character.arkPassive.evolution.find(
      (effect) => effect.name === "파괴 전차",
    )?.level ?? 0) * 4;
  const classBonus = character.buildName.includes("절정") ? 15 : 0;
  const gridEffects = character.arkGrid.cores.flatMap((core) =>
    resolveArkGridCommonCoreEffects(core),
  );
  const gridAttackSpeed = gridEffects
    .filter((effect) => effect.effect === "attackSpeed")
    .reduce((total, effect) => total + (effect.value ?? 0), 0);
  const gridMoveSpeed = gridEffects
    .filter((effect) => effect.effect === "movementSpeed")
    .reduce((total, effect) => total + (effect.value ?? 0), 0);
  const common =
    swiftness * 0.01716 +
    (supportRageBuff ? 9 : 0) +
    (banquetBuff ? 5 : 0) +
    braceletSpeed +
    engravings +
    stone +
    classBonus;
  const attackFood = blessingFood ? 3 : 0;
  const moveFood = wineFood ? 3 : 0;
  return {
    attackSpeedPercent:
      100 +
      common +
      gridAttackSpeed +
      destructionTrain +
      massIncrease +
      attackFood,
    moveSpeedPercent: 100 + common + gridMoveSpeed + moveFood,
  };
}

const errors: Record<number, string> = {
  401: "API 키가 올바르지 않습니다.",
  403: "API 접근 권한이 없습니다.",
  404: "캐릭터를 찾을 수 없습니다.",
  429: "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
};
const simTabs: SimulationTab[] = ["기본 장비", "스킬 & 전투 사이클"];
const SAVED_SETTINGS_KEY = "glavier-dps-simulator:saved-settings";
const API_KEY_STORAGE_KEY = "glavier-dps-simulator:lostark-api-key";
const gearGrades = ["결단", "전율"] as const;
const armGauntletGrades = ["영웅", "전설", "유물", "고대"] as const;
const enhancementLevels = Array.from({ length: 16 }, (_, index) => 25 - index);
const gauntletEnhancementLevels = Array.from(
  { length: 26 },
  (_, index) => 25 - index,
);
const skillLevels = Array.from({ length: 14 }, (_, index) => index + 1);
const gemLevels = Array.from({ length: 5 }, (_, index) => 10 - index);
const gemTypes = ["겁화", "작열"] as const;
const alwaysVisibleSkills = new Set(["맹룡난무", "적룡필살"]);
const gemIconCdn: Record<string, Record<number, string>> = {
  겁화: {
    10: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_105.png",
    9: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_104.png",
    8: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_103.png",
    7: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_102.png",
    6: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_101.png",
  },
  작열: {
    10: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_115.png",
    9: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_114.png",
    8: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_113.png",
    7: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_112.png",
    6: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_111.png",
  },
};
const radiantGemIconCdn: Record<number, string> = {
  10: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_55.png",
  9: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_54.png",
  8: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_53.png",
  7: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_52.png",
  6: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_51.png",
};
function gemIconFor(type: string, level: number) {
  return gemIconCdn[type]?.[level] ?? null;
}
function isRadiantGem(gem: GemProfile) {
  return gem.name.includes("광휘");
}
function gemDisplayIcon(
  gem: GemProfile,
  type = gem.type,
  level = gem.level ?? 10,
) {
  if (isRadiantGem(gem)) return radiantGemIconCdn[level] ?? gem.icon;
  if (gem.name.includes("멸화")) return melhaGemIcon.src;
  if (gem.name.includes("홍염")) return hongyeomGemIcon.src;
  return gemIconFor(type, level) ?? gem.icon;
}
function normalizeGem(gem: GemProfile): GemProfile {
  const level = Math.max(6, Math.min(10, gem.level ?? 10));
  const cooldown = /재사용 대기시간|쿨타임/.test(gem.effect ?? "");
  const type =
    gem.type === "작열" ||
    gem.type === "홍염" ||
    (isRadiantGem(gem) && cooldown)
      ? "작열"
      : "겁화";
  const normalized = { ...gem, type, level };
  return { ...normalized, icon: gemDisplayIcon(normalized) };
}
function cooldownGemReductionRate(gems: readonly GemProfile[]) {
  return gems.reduce((highestRate, gem) => {
    // 홍염은 현재 계산 입력으로 받지 않으므로 계산에 포함하지 않는다.
    if (gem.name.includes("홍염")) return highestRate;
    const isCooldownGem =
      gem.type === "작열" ||
      (isRadiantGem(gem) && /재사용 대기시간|쿨타임/.test(gem.effect ?? ""));
    if (!isCooldownGem || gem.level === null) return highestRate;
    const rate = Math.max(0, 0.24 - (10 - gem.level) * 0.02);
    return Math.max(highestRate, rate);
  }, 0);
}
function braceletCooldownIncreaseRate(bracelet: EquipmentProfile | undefined) {
  return (bracelet?.options ?? []).reduce((total, option) => {
    const catalogRate = findBraceletOption(option)?.modifiers
      .filter((modifier) => modifier.type === "skillCooldownIncreasePct")
      .reduce((sum, modifier) => sum + modifier.value / 100, 0);
    if (catalogRate) return total + catalogRate;
    const textRate = Number(option.match(/쿨\s*\+\s*([\d.]+)%/)?.[1] ?? 0);
    return total + textRate / 100;
  }, 0);
}
function commonCooldownReductionRate(source: {
  swiftness: number;
  evolution: readonly ArkEffectProfile[];
  bracelet?: EquipmentProfile;
}) {
  const levelOf = (name: string) =>
    source.evolution.find((effect) => effect.name === name)?.level ?? 0;
  const multiplier = applyCooldownReductionRates(1, [
    source.swiftness * 0.000215,
    (levelOf("끝없는 마나") + levelOf("무한한 마력")) * 0.07,
    levelOf("최적화 훈련") * 0.04,
    levelOf("타이밍 지배") * 0.05,
    -braceletCooldownIncreaseRate(source.bracelet),
  ]);
  return 1 - multiplier;
}
const avatarSlots = ["무기", "머리", "상의", "하의"] as const;
const accessoryOptions = [
  "없음",
  "추가 피해 +0.70%",
  "추가 피해 +1.60%",
  "추가 피해 +2.60%",
  "적에게 주는 피해 +0.55%",
  "적에게 주는 피해 +1.20%",
  "적에게 주는 피해 +2.00%",
  "무기 공격력 +0.80%",
  "무기 공격력 +1.80%",
  "무기 공격력 +3.00%",
  "공격력 +0.40%",
  "공격력 +0.95%",
  "공격력 +1.55%",
  "치명타 적중률 +0.40%",
  "치명타 적중률 +0.95%",
  "치명타 적중률 +1.55%",
  "치명타 피해 +1.10%",
  "치명타 피해 +2.40%",
  "치명타 피해 +4.00%",
  "무기 공격력 +195",
  "무기 공격력 +480",
  "무기 공격력 +960",
  "공격력 +80",
  "공격력 +195",
  "공격력 +390",
];
const passiveCatalog: Record<PassiveGroup, string[]> = {
  evolution: [
    "없음",
    "치명",
    "특화",
    "신속",
    "한계 돌파",
    "최적화 훈련",
    "예리한 감각",
    "끝없는 마나",
    "무한한 마력",
    "음속 돌파",
    "뭉툭한 가시",
    "입식 타격가",
    "마나 용광로",
  ],
  enlightenment: [
    "없음",
    "절정 I",
    "절정 II",
    "절정 III",
    "연가표식",
    "연가심공",
    "치명적인 베기",
    "강력한 찌르기",
    "전환 난무",
    "절제",
    "청룡진",
    "난무 강화",
    "집중 강화",
  ],
  leap: ["없음", "초월적인 힘", "풀려난 힘", "즉각적인 주문", "잠재력 해방"],
};
const enlightenmentEffects: Record<
  string,
  { maxLevel: number; description: string }
> = {
  "절정 I": { maxLevel: 3, description: "공격 속도·이동 속도 +5%/Lv" },
  "절정 II": { maxLevel: 3, description: "난무 스탠스 치명타 피해 +23.33%/Lv" },
  "절정 III": {
    maxLevel: 3,
    description: "집중 스탠스 적에게 주는 피해 +8.33%/Lv",
  },
  연가표식: { maxLevel: 5, description: "연가 표식 대상이 받는 피해 +1.2%/Lv" },
  연가심공: {
    maxLevel: enlightenmentSkillEffects["연가심공"].maxLevel,
    description: `다음 스킬 피해 +${enlightenmentSkillEffects["연가심공"].damagePerLevelPercent}%/Lv`,
  },
  "치명적인 베기": { maxLevel: 5, description: "난무 스킬 치명타 피해 +4%/Lv" },
  "강력한 찌르기": {
    maxLevel: 5,
    description: "집중 스킬 적에게 주는 피해 +1.2%/Lv",
  },
  "전환 난무": {
    maxLevel: 5,
    description: "난무 스킬 피해 +0.7%/Lv · 치명타 적중률 +0.8%/Lv",
  },
};
const leapOptions = [
  {
    name: "풀려난 힘",
    maxLevel: 5,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_02/ark_passive_02_2.png",
    description: "초각성 스킬 피해량 Lv당 3% 증가",
  },
  {
    name: "잠재력 해방",
    maxLevel: 5,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_01/ark_passive_01_10.png",
    description: "초각성 스킬 재사용 대기시간 Lv당 2% 감소",
  },
  {
    name: "즉각적인 주문",
    maxLevel: 5,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_02/ark_passive_02_5.png",
    description: "초각성 스킬 시전 시간 Lv당 4% 증가",
  },
  {
    name: "관통 필살",
    maxLevel: 3,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_11.png",
    description: "해당 스킬 피해량 Lv2부터 10%씩 증가",
  },
  {
    name: "내지르기",
    maxLevel: 5,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_12.png",
    description: "해당 스킬 피해량 Lv당 25% 증가",
  },
  {
    name: "강인한 타격",
    maxLevel: 3,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_9.png",
    description: "초각성 스킬 피해량 Lv당 25% 증가",
  },
  {
    name: "최후의 판단",
    maxLevel: 3,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_10.png",
    description: "초각성 스킬 피해량 Lv당 30% 증가",
  },
] as const;
const gridCoreOptions = [
  ...GLAVIER_ORDER_CORE_OPTIONS.map((options) => ["없음", ...options]),
  [
    "없음",
    "현란한 공격",
    "안정적인 공격",
    "재빠른 공격",
    "신념의 강화",
    "흐르는 마나",
    "불굴의 강화",
  ],
  [
    "없음",
    "불타는 일격",
    "흡수의 일격",
    "부수는 일격",
    "낙인의 흔적",
    "강철의 흔적",
    "치명적인 흔적",
  ],
  ["없음", "공격", "무기", "구원", "생명", "속도", "방어"],
];
const gridPoints = [20, 19, 18, 17, 14, 10];

function errorMessage(error: unknown) {
  if (error instanceof LostArkApiError)
    return (
      errors[error.status] ??
      `로스트아크 API 요청에 실패했습니다. (${error.status})`
    );
  return error instanceof TypeError
    ? "로스트아크 API에 연결하지 못했습니다. 네트워크와 브라우저 설정을 확인해주세요."
    : "캐릭터 조회에 실패했습니다.";
}
function Artwork({
  icon,
  label,
  title,
}: {
  icon: string | null;
  label: string;
  title?: string;
}) {
  return (
    <span className="compact-art" aria-label={title} data-tooltip={title}>
      {icon ? <img src={icon} alt="" /> : label}
    </span>
  );
}
function qualityTone(quality: number | null) {
  return quality === 100
    ? "quality-gold"
    : quality !== null && quality >= 90
      ? "quality-purple"
      : "quality-sky";
}
function baseStatValue(item: EquipmentProfile) {
  return item.baseStats[0]?.match(/[\d,]+/)?.[0]?.replaceAll(",", "") ?? "";
}
function primaryStatFromEquipment(
  items: EquipmentProfile[],
): BraceletPrimaryStat {
  const glove = items.find((item) => item.slot === "장갑");
  const candidates = [
    ...(glove?.baseStats ?? []),
    ...items.flatMap((item) => item.baseStats),
  ];
  const stat = candidates
    .map((line) => line.match(/^(힘|민첩|지능)\s*\+?[\d,]+/)?.[1])
    .find(Boolean);
  return BRACELET_PRIMARY_STAT_TYPES.includes(stat as BraceletPrimaryStat)
    ? (stat as BraceletPrimaryStat)
    : "힘";
}
const ACCESSORY_EXCLUDED_OPTIONS: Record<string, string[]> = {
  목걸이: ["무기 공격력", "공격력", "치명타 적중률", "치명타 피해"],
  귀걸이: ["적에게 주는 피해", "추가 피해", "치명타 적중률", "치명타 피해"],
  반지: ["적에게 주는 피해", "추가 피해", "무기 공격력", "공격력"],
};
function optionChoices(slot: string, current: string, catalog: string[]) {
  const excluded = ACCESSORY_EXCLUDED_OPTIONS[slot] ?? [];
  return [
    ...new Set([
      current,
      ...catalog.filter(
        (option) =>
          !excluded.some(
            (prefix) => option.startsWith(prefix) && option.includes("%"),
          ),
      ),
    ]),
  ];
}
function isArkPassivePointOption(option: string) {
  return /^(진화|깨달음|도약)\s*\+?\s*\d+/.test(option.trim());
}
const gauntletLevelRange: Record<string, number[]> = {
  영웅: Array.from({ length: 11 }, (_, i) => i),
  전설: Array.from({ length: 6 }, (_, i) => i + 10),
  유물: Array.from({ length: 6 }, (_, i) => i + 15),
  고대: Array.from({ length: 6 }, (_, i) => i + 20),
};

function GearEditor({
  item,
  onChange,
}: {
  item: EquipmentProfile;
  onChange: (patch: Partial<EquipmentProfile>) => void;
}) {
  const isArmGauntlet = item.slot === "완갑";
  const grades = isArmGauntlet ? armGauntletGrades : gearGrades;
  const selectableEnhancements = isArmGauntlet
    ? (gauntletLevelRange[item.simulationGrade] ?? gauntletEnhancementLevels)
    : enhancementLevels;
  return (
    <article className="gear-editor">
      <div className={`quality-art${isArmGauntlet ? " no-quality" : ""}`}>
        <Artwork icon={item.icon} label="◇" />
        {!isArmGauntlet ? (
          <span className={qualityTone(item.quality)}>
            품질 {item.quality ?? "-"}
          </span>
        ) : null}
      </div>
      <div className={`gear-fields${isArmGauntlet ? " no-quality" : ""}`}>
        {!isArmGauntlet ? <small>{item.itemLevel ?? "-"}</small> : null}
        <select
          aria-label={`${item.slot} 장비 종류`}
          value={
            isArmGauntlet
              ? armGauntletGrades.includes(
                  item.simulationGrade as (typeof armGauntletGrades)[number],
                )
                ? item.simulationGrade
                : "영웅"
              : gearGrades.includes(
                    item.simulationGrade as (typeof gearGrades)[number],
                  )
                ? item.simulationGrade
                : "전율"
          }
          onChange={(event) => {
            const grade = event.target
              .value as EquipmentProfile["simulationGrade"];
            onChange({
              simulationGrade: grade,
              ...(isArmGauntlet
                ? { enhancement: gauntletLevelRange[grade]?.[0] ?? 0 }
                : {}),
            });
          }}
        >
          {grades.map((grade) => (
            <option key={grade}>{grade}</option>
          ))}
        </select>
        {!isArmGauntlet ? (
          <label>
            품질
            <input
              aria-label={`${item.slot} 품질`}
              type="number"
              min="0"
              max="100"
              value={item.quality ?? ""}
              onChange={(event) =>
                onChange({
                  quality:
                    event.target.value === ""
                      ? null
                      : Math.max(0, Math.min(100, Number(event.target.value))),
                })
              }
            />
          </label>
        ) : null}
        <select
          aria-label={`${item.slot} 강화`}
          value={item.enhancement ?? 10}
          onChange={(event) =>
            onChange({ enhancement: Number(event.target.value) })
          }
        >
          {selectableEnhancements.map((level) => (
            <option value={level} key={level}>
              +{level}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function GearBulkControl({ onChange }: { onChange: (level: number) => void }) {
  return (
    <label className="gear-bulk-control">
      일괄 변경
      <select
        aria-label="전투 장비 일괄 강화"
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) {
            onChange(Number(event.target.value));
            event.target.value = "";
          }
        }}
      >
        <option value="">강화 선택</option>
        {enhancementLevels.map((level) => (
          <option value={level} key={level}>
            +{level}
          </option>
        ))}
      </select>
    </label>
  );
}

function parseBraceletStat(
  option: string,
  primaryStat: BraceletPrimaryStat,
): BraceletStat | null {
  const match = option
    .trim()
    .match(
      /^(치명|신속|특화|제압|숙련|인내|체력|힘|민첩|지능|힘\/민\/지)\s*\+?\s*([\d,]+)$/,
    );
  if (!match) return null;
  const type = match[1] === "힘/민/지" ? primaryStat : match[1];
  return {
    type: type as BraceletStat["type"],
    value: match[2].replaceAll(",", ""),
  };
}

function normalizeBraceletEffect(option: string) {
  const catalogOption = findBraceletOption(option);
  if (catalogOption) return catalogOption.label;
  const compact = option.replaceAll(" ", "").replaceAll("\n", "");
  const values = [...compact.matchAll(/(\d+(?:\.\d+)?)%/g)].map(
    (match) => match[1],
  );
  if (/^공격및이동속도가.*증가한다.$/.test(compact) && values.length)
    return `공이속 +${values[0]}%`;
  if (
    /치명타적중률이.*공격이치명타로적중시/.test(compact) &&
    values.length >= 2
  )
    return `치적 +${values[0]}% | 치명타 주는 피해 +${values[1]}%`;
  if (/치명타피해가.*공격이치명타로적중시/.test(compact) && values.length >= 2)
    return `치피 +${values[0]}% | 치명타 주는 피해 +${values[1]}%`;
  if (/^적에게주는피해가.*증가한다.$/.test(compact) && values.length)
    return `적에게 주는 피해 +${values[0]}%`;
  if (/^추가피해가.*증가한다.$/.test(compact) && values.length)
    return `추가 피해 +${values[0]}%`;
  if (/^치명타적중률이.*증가한다.$/.test(compact) && values.length)
    return `치명타 적중률 +${values[0]}%`;
  if (/^치명타피해가.*증가한다.$/.test(compact) && values.length)
    return `치명타 피해 +${values[0]}%`;
  if (
    /적에게주는피해가.*무력화상태의적에게주는피해가/.test(compact) &&
    values.length >= 2
  )
    return `적주피 +${values[0]}% | 무력화 적 피해량 +${values[1]}%`;
  if (/재사용대기시간이.*적에게주는피해가/.test(compact) && values.length >= 2)
    return `쿨 +${values[0]}% | 적에게 주는 피해 +${values[1]}%`;
  if (
    /추가피해가.*악마및대악마계열피해량이/.test(compact) &&
    values.length >= 2
  )
    return `추피 +${values[0]}% | 악마&대악마 피해량 +${values[1]}%`;
  const hitStack = compact.match(
    /무기공격력이(\d+),?공격및이동속도가(\d+(?:\.\d+)?)%/,
  );
  if (hitStack)
    return `공격 적중 시 무공 ${hitStack[1]}, 공이속 ${hitStack[2]}%`;
  const weaponAttackValues = [
    ...compact.matchAll(/무기공격력이(\d+)증가/g),
  ].map((match) => match[1]);
  if (/생명력이50%이상/.test(compact) && weaponAttackValues.length >= 2)
    return `무공 ${weaponAttackValues[0]} | 조건부 무공 ${weaponAttackValues[1]}`;
  if (/공격적중시30초마다/.test(compact) && weaponAttackValues.length >= 2)
    return `무공 ${weaponAttackValues[0]} | 스택당 무공 ${weaponAttackValues[1]}`;
  if (/백어택스킬이적에게주는피해가/.test(compact) && values.length)
    return `백어택 스킬 피해 +${values[0]}%`;
  if (/헤드어택스킬이적에게주는피해가/.test(compact) && values.length)
    return `헤드어택 스킬 피해 +${values[0]}%`;
  if (/방향성공격이아닌스킬이적에게주는피해가/.test(compact) && values.length)
    return `타대 스킬 피해 +${values[0]}%`;
  if (
    /대상의방어력을.*감소.*아군공격력강화효과가/.test(compact) &&
    values.length >= 2
  )
    return `방깎 ${values[0]}% | 아공강 +${values[1]}%`;
  if (
    /대상의치명타저항을.*감소.*아군공격력강화효과가/.test(compact) &&
    values.length >= 2
  )
    return `치명타 저항 -${values[0]}% | 아공강 +${values[1]}%`;
  if (
    /보호효과.*적에게주는피해가.*아군공격력강화효과가/.test(compact) &&
    values.length >= 2
  )
    return `보호 대상 피해량 +${values[0]}% | 아공강 +${values[1]}%`;
  if (
    /치명타피해저항을.*감소.*아군공격력강화효과가/.test(compact) &&
    values.length >= 2
  )
    return `치명타 피해 저항 -${values[0]}% | 아공강 +${values[1]}%`;
  return option;
}

function splitBraceletOptions(
  options: string[],
  primaryStat: BraceletPrimaryStat,
) {
  const stats: BraceletStat[] = [];
  const effects: string[] = [];
  const unavailableEffects: string[] = [];
  mergeBraceletOptionTexts(options).forEach((option) => {
    if (option.includes("도약")) return;
    const stat = parseBraceletStat(option, primaryStat);
    if (
      stat &&
      stats.length < 4 &&
      !stats.some(
        (current) => current.type === stat.type && current.value === stat.value,
      )
    )
      stats.push(stat);
    else {
      const normalized = normalizeBraceletEffect(option);
      const definition = findBraceletOption(normalized);
      if (!definition || !definition.selectable)
        unavailableEffects.push(normalized);
      else effects.push(definition.label);
    }
  });
  while (stats.length < 4) stats.push({ type: "없음", value: "0" });
  while (effects.length < 4) effects.push("없음");
  return {
    stats,
    effects: effects.slice(0, 4),
    unavailableEffects: [...new Set(unavailableEffects)],
  };
}

function formatBraceletStat(stat: BraceletStat) {
  return stat.type === "없음" ? null : `${stat.type} +${stat.value || "0"}`;
}

const ACCESSORY_STAT_RANGES: Record<string, { min: number; max: number }> = {
  목걸이: { min: 15178, max: 17857 },
  귀걸이: { min: 11806, max: 13889 },
  반지: { min: 10962, max: 12897 },
};
function accessoryStatRange(slot: string) {
  return ACCESSORY_STAT_RANGES[slot] ?? null;
}
function accessoryStatPercent(item: EquipmentProfile) {
  const range = accessoryStatRange(item.slot);
  const value = Number(baseStatValue(item).replaceAll(",", ""));
  if (!range || !Number.isFinite(value)) return "-";
  return `${Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100)).toFixed(2)}%`;
}
function accessoryStatTone(item: EquipmentProfile) {
  const percent = Number.parseFloat(accessoryStatPercent(item));
  return percent >= 100
    ? "accessory-stat-gold"
    : percent >= 90
      ? "accessory-stat-purple"
      : percent >= 70
        ? "accessory-stat-blue"
        : percent >= 40
          ? "accessory-stat-teal"
          : "accessory-stat-gray";
}

function AccessoryEditor({
  item,
  onChange,
}: {
  item: EquipmentProfile;
  onChange: (patch: Partial<EquipmentProfile>) => void;
}) {
  const options = Array.from(
    { length: 3 },
    (_, index) =>
      item.options.filter((option) => !isArkPassivePointOption(option))[
        index
      ] ?? "없음",
  );
  const range = accessoryStatRange(item.slot);
  const savedStat = baseStatValue(item);
  const [draftStat, setDraftStat] = useState(savedStat);
  useEffect(() => setDraftStat(savedStat), [savedStat]);
  const commitStat = () => {
    if (!range) return;
    const value = Number(draftStat);
    const normalized =
      Number.isFinite(value) && value >= range.min && value <= range.max
        ? value
        : range.min;
    const next = String(normalized);
    setDraftStat(next);
    onChange({ baseStats: [next] });
  };
  return (
    <article className="accessory-editor">
      <div className="quality-art">
        <Artwork icon={item.icon} label="◇" />
        <span className={accessoryStatTone(item)}>
          {accessoryStatPercent(item)}
        </span>
      </div>
      <div className="accessory-meta">
        <select
          aria-label={`${item.slot} 등급`}
          value={
            item.simulationGrade === "T4 전율" ? "고대" : item.simulationGrade
          }
          onChange={(event) =>
            onChange({
              simulationGrade: event.target
                .value as EquipmentProfile["simulationGrade"],
            })
          }
        >
          <option value="고대">고대</option>
          <option value="유물">유물</option>
        </select>
        <input
          aria-label={`${item.slot} 힘민지`}
          type="number"
          inputMode="numeric"
          value={draftStat}
          onChange={(event) => setDraftStat(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitStat();
            }
          }}
        />
      </div>
      <div className="accessory-option-list">
        {options.map((option, index) => {
          const choices = optionChoices(item.slot, option, accessoryOptions);
          return (
            <select
              aria-label={`${item.slot} 옵션 ${index + 1}`}
              value={option}
              onChange={(event) => {
                const next = [...options];
                next[index] = event.target.value;
                onChange({ options: next });
              }}
              key={index}
            >
              {choices.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          );
        })}
      </div>
    </article>
  );
}

function StoneEditor({
  icon,
  effects,
  engravingNames,
  onChange,
}: {
  icon: string | null;
  effects: StoneEffect[];
  engravingNames: string[];
  onChange: (index: number, patch: Partial<StoneEffect>) => void;
}) {
  return (
    <article className="stone-editor">
      <Artwork icon={icon} label="◇" />
      <div>
        {effects.map((effect, index) => (
          <div className="stone-row" key={index}>
            <select
              aria-label={`어빌리티 스톤 각인 ${index + 1}`}
              value={effect.engraving}
              onChange={(event) =>
                onChange(index, { engraving: event.target.value })
              }
            >
              {engravingNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select
              aria-label={`어빌리티 스톤 레벨 ${index + 1}`}
              value={effect.level}
              onChange={(event) =>
                onChange(index, { level: Number(event.target.value) })
              }
            >
              {Array.from({ length: 5 }, (_, level) => (
                <option value={level} key={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </article>
  );
}

function BraceletEditor({
  item,
  primaryStat,
  onChange,
}: {
  item: EquipmentProfile | null;
  primaryStat: BraceletPrimaryStat;
  onChange: (patch: Partial<EquipmentProfile>) => void;
}) {
  if (!item) return <p className="empty-copy">정보 없음</p>;
  const statTypes: BraceletStat["type"][] = [
    ...new Set<BraceletStat["type"]>([...BRACELET_STAT_TYPES, primaryStat]),
  ];
  const { stats, effects, unavailableEffects } = splitBraceletOptions(
    [...item.baseStats, ...item.options],
    primaryStat,
  );
  function save(nextStats: BraceletStat[], nextEffects: string[]) {
    onChange({
      baseStats: nextStats
        .map(formatBraceletStat)
        .filter((value): value is string => Boolean(value)),
      options: [
        ...unavailableEffects,
        ...nextEffects.filter((effect) => effect !== "없음"),
      ],
    });
  }
  return (
    <article className="bracelet-editor">
      <div className="bracelet-art">
        <Artwork icon={item.icon} label="◇" />
      </div>
      <div className="bracelet-fields">
        <div className="bracelet-stat-list">
          {stats.map((stat, index) => (
            <div className="bracelet-stat-row" key={index}>
              <select
                aria-label={`팔찌 능력치 ${index + 1}`}
                value={stat.type}
                onChange={(event) => {
                  const next = [...stats];
                  next[index] = {
                    ...stat,
                    type: event.target.value as BraceletStat["type"],
                  };
                  save(next, effects);
                }}
              >
                {statTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <input
                aria-label={`팔찌 능력치 수치 ${index + 1}`}
                type="number"
                min="0"
                value={stat.value}
                disabled={stat.type === "없음"}
                onChange={(event) => {
                  const next = [...stats];
                  next[index] = { ...stat, value: event.target.value };
                  save(next, effects);
                }}
              />
            </div>
          ))}
        </div>
        <div className="bracelet-option-list">
          {effects.map((effect, index) => (
            <select
              aria-label={`팔찌 효과 ${index + 1}`}
              value={effect}
              onChange={(event) => {
                const next = [...effects];
                next[index] = event.target.value;
                save(stats, next);
              }}
              key={index}
            >
              {BRACELET_EFFECT_OPTIONS.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          ))}
        </div>
        {unavailableEffects.length ? (
          <div className="bracelet-unavailable">
            <small>현재 장착 · 시뮬레이션 미적용</small>
            {unavailableEffects.map((effect) => (
              <span key={effect}>{effect}</span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
function GemBoard({
  gems,
  skills,
  onChange,
  onAdd,
  onRemove,
  onBulkLevel,
  message,
}: {
  gems: GemProfile[];
  skills: SkillProfile[];
  onChange: (id: string, patch: Partial<GemProfile>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onBulkLevel: (level: number) => void;
  message: string;
}) {
  return (
    <section className="gem-board">
      <div className="gem-board-heading">
        <div>
          <h2>보석</h2>
        </div>
        <div className="gem-bulk-controls">
          <strong>일괄 변경</strong>
          {[10, 9, 8, 7].map((level) => (
            <button
              type="button"
              onClick={() => onBulkLevel(level)}
              key={level}
            >
              {level}겁작
            </button>
          ))}
        </div>
      </div>
      {message ? (
        <p className="validation-message" role="alert">
          {message}
        </p>
      ) : null}
      <div className="gem-board-list">
        {gems.map((gem) => {
          const level = gem.level ?? 10;
          const icon = gemDisplayIcon(gem);
          return (
            <article key={gem.id}>
              <div className="gem-board-art">
                <Artwork icon={icon} label="◆" />
                <b>{level}</b>
              </div>
              <select
                aria-label={`${gem.skill || "미지정"} 보석 종류`}
                value={gem.type}
                onChange={(event) =>
                  onChange(gem.id, { type: event.target.value })
                }
              >
                {gemTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <select
                aria-label={`${gem.skill || "미지정"} 보석 레벨`}
                value={level}
                onChange={(event) =>
                  onChange(gem.id, { level: Number(event.target.value) })
                }
              >
                {gemLevels.map((optionLevel) => (
                  <option value={optionLevel} key={optionLevel}>
                    {optionLevel}
                  </option>
                ))}
              </select>
              <select
                aria-label="보석 적용 스킬"
                value={gem.skill ?? ""}
                onChange={(event) =>
                  onChange(gem.id, { skill: event.target.value })
                }
              >
                <option value="">스킬 선택</option>
                {skills.map((skill) => (
                  <option value={skill.name} key={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="gem-remove-button"
                onClick={() => onRemove(gem.id)}
                aria-label={`${gem.skill || "보석"} 제거`}
              >
                ×
              </button>
            </article>
          );
        })}
        {gems.length < 11 ? (
          <button type="button" className="gem-board-add" onClick={onAdd}>
            + 보석 추가
          </button>
        ) : null}
      </div>
    </section>
  );
}
function SkillEditorV2({
  skill,
  gems,
  calculation,
  cooldown,
  onChange,
  onGemChange,
  onRemoveGem,
  onAddGem,
}: {
  skill: SkillProfile;
  gems: GemProfile[];
  calculation?: SingleSkillCalculationResult;
  cooldown?: ReturnType<typeof resolveGlavierSkillCooldown>;
  onChange: (patch: Partial<SkillProfile>) => void;
  onGemChange: (id: string, patch: Partial<GemProfile>) => void;
  onRemoveGem: (id: string) => void;
  onAddGem: (type: "겁화" | "작열") => void;
}) {
  if (!GLAVIER_SKILL_BY_NAME[skill.name] || !calculation) {
    return (
      <article
        className="skill-card skill-editor skill-unavailable"
        aria-label={`${skill.name} 계산 준비 중`}
      >
        <Artwork icon={skill.icon} label="✦" />
        <div>
          <strong className="skill-name">{skill.name}</strong>
          <p>계산 준비 중입니다.</p>
        </div>
      </article>
    );
  }
  const selectableTripodCount = selectableTripodCountForSkillLevel(skill.level);
  const tripods = Array.from(
    { length: 3 },
    (_, index) => skill.tripods[index] ?? { name: "없음", level: null },
  );
  const activeTripods = tripods.map((tripod, index) =>
    index < selectableTripodCount
      ? tripod
      : { ...tripod, name: "없음", level: null },
  );
  const catalog =
    GLAVIER_SKILL_TRIPODS[skill.name as keyof typeof GLAVIER_SKILL_TRIPODS];
  const details = GLAVIER_SKILL_TRIPOD_DETAILS[skill.name] ?? [];
  const criticalRateBonus = calculation.selectedTripods
    .filter((effect) => effect.effectType === "치명타 확률 가산")
    .reduce((total, effect) => total + (effect.percentValue ?? 0), 0);
  const criticalDamageBonus = calculation.selectedTripods
    .filter((effect) => effect.effectType === "치명타 피해 가산")
    .reduce((total, effect) => total + (effect.percentValue ?? 0), 0);
  const cooldownReduction = cooldown
    ? Math.max(0, cooldown.baseCooldownSeconds - cooldown.cooldownSeconds)
    : 0;
  const criticalRate = calculation.combat.stages.criticalRate;
  const isBackAttackSkill = calculation.evolution.isBackAttackSkill;
  const defaultScenario = calculation.scenarios.find(
    (scenario) =>
      !scenario.conditions.azureDragonBuff &&
      !scenario.conditions.backAttack &&
      !scenario.conditions.yeongaSimGong,
  );
  const azureDragonScenario = calculation.scenarios.find(
    (scenario) =>
      scenario.conditions.azureDragonBuff &&
      !scenario.conditions.backAttack &&
      !scenario.conditions.yeongaSimGong,
  );
  const defaultBackAttackScenario = calculation.scenarios.find(
    (scenario) =>
      !scenario.conditions.azureDragonBuff &&
      scenario.conditions.backAttack &&
      !scenario.conditions.yeongaSimGong,
  );
  const azureDragonBackAttackScenario = calculation.scenarios.find(
    (scenario) =>
      scenario.conditions.azureDragonBuff &&
      scenario.conditions.backAttack &&
      !scenario.conditions.yeongaSimGong,
  );
  const backAttackDisplayScenario =
    defaultBackAttackScenario ?? defaultScenario;
  const displayGemTypes =
    skill.name === "맹룡난무" || skill.name === "적룡필살"
      ? []
      : ["겁화", "작열"];
  return (
    <article className="skill-card skill-editor">
      <div className="skill-icon-column">
        <Artwork icon={skill.icon} label="✦" />
        <select
          className="skill-level-select"
          aria-label={`${skill.name} 레벨`}
          value={skill.level}
          onChange={(event) => {
            const level = Number(event.target.value);
            const limit = level <= 3 ? 0 : level <= 6 ? 1 : level <= 9 ? 2 : 3;
            onChange({
              level,
              tripods: tripods.map((tripod, index) =>
                index < limit
                  ? tripod
                  : { ...tripod, name: "없음", level: null },
              ),
            });
          }}
        >
          {skillLevels.map((level) => (
            <option value={level} key={level}>
              Lv.{level}
            </option>
          ))}
        </select>
      </div>
      <div className="skill-title-column">
        <div className="skill-title-column">
          <strong className="skill-name">{skill.name}</strong>
          <span className="skill-tripod-multiplier">
            트라이포드 배율 ×
            {(
              calculation.tripodDamageMultiplier *
              calculation.awakeningDamageMultiplier
            ).toFixed(3)}
          </span>
          <span className="skill-tripod-effect">
            치명타 확률 +
            {(
              (criticalRateBonus + calculation.awakeningCriticalRateBonus) *
              100
            ).toFixed(1)}
            %
          </span>
          <span className="skill-tripod-effect">
            치명타 피해 +{(criticalDamageBonus * 100).toFixed(1)}%
          </span>
          <span className="skill-tripod-effect">
            쿨타임 감소 {cooldownReduction.toFixed(1)}초
          </span>
        </div>
      </div>
      <div className="skill-tripod-selects">
        {activeTripods.map((tripod, index) => {
          const options = [
            ...new Set([tripod.name, ...(catalog?.[index] ?? [])]),
          ];
          const detail = details.find(
            (item) => item.tier === index + 1 && item.name === tripod.name,
          );
          return (
            <div
              className="skill-tripod-tooltip"
              data-tooltip={detail?.description ?? tripod.name}
              key={`tripod-${skill.id}-${index}`}
            >
              <select
                aria-label={`${skill.name} 트라이포드 ${index + 1}`}
                value={tripod.name}
                disabled={index >= selectableTripodCount}
                onChange={(event) =>
                  onChange({
                    tripods: tripods.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            name: event.target.value,
                            level:
                              event.target.value === "없음" ? null : item.level,
                          }
                        : item,
                    ),
                  })
                }
              >
                {options.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <div className="skill-gem-inline">
        {displayGemTypes.map((type) => {
          const gem = gems.find((candidate) => candidate.type === type);
          return gem ? (
            <div className="skill-gem-slot" key={gem.id}>
              <Artwork icon={gemDisplayIcon(gem)} label="◆" />
              <select
                aria-label={`${type} 보석 종류`}
                value={gem.type}
                onChange={(event) =>
                  onGemChange(gem.id, { type: event.target.value })
                }
              >
                {gemTypes.map((gemType) => (
                  <option key={gemType}>{gemType}</option>
                ))}
              </select>
              <select
                aria-label={`${type} 보석 레벨`}
                value={gem.level ?? 10}
                onChange={(event) =>
                  onGemChange(gem.id, { level: Number(event.target.value) })
                }
              >
                {gemLevels.map((level) => (
                  <option value={level} key={level}>
                    {level}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="skill-gem-remove"
                onClick={() => onRemoveGem(gem.id)}
                aria-label="보석 삭제"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="skill-gem-add-slot"
              key={`gem-add-${type}`}
              onClick={() => onAddGem(type as "겁화" | "작열")}
            >
              {type} 보석 추가
            </button>
          );
        })}
      </div>
      <div className="skill-metrics" aria-label={`${skill.name} 전투 데이터`}>
        <div className="skill-core-metrics">
          <span>
            스킬 쿨타임{" "}
            <b>{cooldown ? `${cooldown.cooldownSeconds.toFixed(2)}초` : "-"}</b>
          </span>
          <span>
            <span
              className="skill-metric-tooltip"
              data-tooltip="백어택 기준 치명타 확률"
            >
              치명타 확률
            </span>{" "}
            <b>
              {(
                (backAttackDisplayScenario?.criticalRate ?? criticalRate) * 100
              ).toFixed(2)}
              %
            </b>
          </span>
          <span>
            최대 대미지{" "}
            <b>
              {Math.floor(
                backAttackDisplayScenario?.maximumDamage ??
                  calculation.maximumCriticalDamage,
              ).toLocaleString()}
            </b>
          </span>
          <span>
            평균 대미지{" "}
            <b>
              {Math.floor(
                backAttackDisplayScenario?.averageDamage ??
                  calculation.expectedDamage,
              ).toLocaleString()}
            </b>
          </span>
        </div>
      </div>
    </article>
  );
}

function UnsupportedSkillTab({ className }: { className: string }) {
  return (
    <section className="skill-tab-unavailable" role="status">
      <h2>스킬 계산 준비 중</h2>
      <p>{className} 스킬 데이터와 계산 엔진은 아직 준비 중입니다.</p>
    </section>
  );
}

function EffectList({
  effects,
  onChange,
}: {
  effects: ArkEffectProfile[];
  onChange: (id: string, level: number) => void;
}) {
  const visibleNames = ["추가 피해", "공격력", "보스 피해"];
  const visibleEffects = effects.filter(
    (effect): effect is ArkEffectProfile =>
      Boolean(effect) &&
      visibleNames.some((name) => effect.name.includes(name)),
  );
  return (
    <ul className="effect-list ark-grid-effect-editor">
      {visibleEffects.map((effect) => {
        const level = effect.level ?? 0;
        const name =
          visibleNames.find((item) => effect.name.includes(item)) ??
          effect.name;
        const kind =
          name === "추가 피해"
            ? "additionalDamage"
            : name === "보스 피해"
              ? "bossDamage"
              : "attack";
        return (
          <li key={effect.id}>
            <Artwork icon={effect.icon} label="✦" />
            <div>
              <strong>{name}</strong>
              <small>젬 효율 {arkGridGemPercent(kind, level)}</small>
            </div>
            <select
              aria-label={`${effect.name} 레벨`}
              value={level}
              onChange={(event) =>
                onChange(effect.id, Number(event.target.value))
              }
            >
              {Array.from({ length: 101 }, (_, value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </li>
        );
      })}
    </ul>
  );
}
function EngravingSection({
  engravings,
  stoneIcon,
  stoneEffects,
  engravingNames,
  onChange,
  onStoneChange,
}: {
  engravings: EngravingProfile[];
  stoneIcon: string | null;
  stoneEffects: StoneEffect[];
  engravingNames: string[];
  onChange: (index: number, patch: Partial<EngravingProfile>) => void;
  onStoneChange: (index: number, patch: Partial<StoneEffect>) => void;
}) {
  return (
    <section className="equipment-section engraving-section">
      <h2>각인</h2>
      <div className="engraving-editor">
        {engravings.slice(0, 5).map((engraving, index) => (
          <div key={engraving.name + "-" + index}>
            <Artwork icon={engraving.icon} label="◆" />
            <div className="engraving-card-content">
              <div className="engraving-controls">
                <select
                  aria-label={engraving.name + " 등급"}
                  value={engraving.grade}
                  onChange={(event) =>
                    onChange(index, {
                      grade: event.target.value as EngravingProfile["grade"],
                    })
                  }
                >
                  <option>유물</option>
                  <option>전설</option>
                </select>
                <select
                  aria-label={engraving.name + " 활성도"}
                  value={engraving.level}
                  disabled={engraving.grade === "전설"}
                  onChange={(event) =>
                    onChange(index, { level: Number(event.target.value) })
                  }
                >
                  {[0, 1, 2, 3, 4].map((level) => (
                    <option value={level} key={level}>
                      +{level}
                    </option>
                  ))}
                </select>
              </div>
              <select
                aria-label={"각인 " + (index + 1)}
                value={engraving.name}
                onChange={(event) =>
                  onChange(index, { name: event.target.value })
                }
              >
                {ENGRAVING_NAMES.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <StoneEditor
          icon={stoneIcon}
          effects={stoneEffects}
          engravingNames={engravingNames}
          onChange={onStoneChange}
        />
      </div>
    </section>
  );
}

function EnlightenmentEditor({
  effects,
  onChange,
}: {
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  const fixed = [
    {
      name: "절정 I",
      icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_2.png",
    },
    {
      name: "절정 II",
      icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_3.png",
    },
    {
      name: "절정 III",
      icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_4.png",
    },
  ];
  const selectable = [
    "연가심공",
    "연가표식",
    "치명적인 베기",
    "강력한 찌르기",
    "전환 난무",
  ];
  const selected = effects
    .map((effect, index) => ({ effect, index }))
    .filter(({ effect }) => selectable.includes(effect.name))
    .sort(
      (a, b) =>
        selectable.indexOf(a.effect.name) - selectable.indexOf(b.effect.name),
    )
    .slice(0, 3);
  const rows = Array.from(
    { length: 3 },
    (_, index) =>
      selected[index] ?? {
        index: effects.length + index,
        effect: {
          id: `enlightenment-${index}`,
          name: "없음",
          level: 0,
          grade: null,
          icon: null,
          description: null,
        },
      },
  );
  const options = ["없음", ...selectable];
  return (
    <section className="passive-editor enlightenment-editor">
      <div className="passive-choice-heading">
        <h3>깨달음</h3>
        <span>3개</span>
      </div>
      <div className="enlightenment-fixed">
        {fixed.map((item) => (
          <div key={item.name}>
            <Artwork icon={item.icon} label="✦" title={item.name} />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
      <div className="enlightenment-selects">
        {rows.map((row, index) => {
          const current = row.effect.name;
          const maxLevel = enlightenmentEffects[current]?.maxLevel ?? 5;
          return (
            <div className="passive-row" key={row.effect.id}>
              <select
                aria-label={`깨달음 옵션 ${index + 1}`}
                value={current}
                onChange={(event) => {
                  const name = event.target.value;
                  const option = effects.find((effect) => effect.name === name);
                  onChange(row.index, {
                    id: `enlightenment-${index}`,
                    name,
                    level:
                      name === "없음"
                        ? 0
                        : Math.min(
                            row.effect.level ?? 0,
                            enlightenmentEffects[name]?.maxLevel ?? 5,
                          ),
                    icon: option?.icon ?? null,
                    description:
                      option?.description ??
                      enlightenmentEffects[name]?.description ??
                      null,
                  });
                }}
              >
                {options.map((option) => (
                  <option
                    value={option}
                    disabled={
                      option !== current &&
                      rows.some((candidate) => candidate.effect.name === option)
                    }
                    key={option}
                  >
                    {option}
                  </option>
                ))}
              </select>
              <select
                aria-label={`깨달음 옵션 ${index + 1} 레벨`}
                value={current === "없음" ? 0 : (row.effect.level ?? 0)}
                disabled={current === "없음"}
                onChange={(event) =>
                  onChange(row.index, {
                    level: Math.min(Number(event.target.value), maxLevel),
                  })
                }
              >
                {Array.from({ length: maxLevel + 1 }, (_, level) => (
                  <option value={level} key={level}>
                    Lv.{level}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function LeapEditor({
  effects,
  onChange,
}: {
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  const safeEffects = effects.filter((effect): effect is ArkEffectProfile =>
    Boolean(effect),
  );
  const selected = safeEffects
    .map((effect, index) => ({ effect, index }))
    .filter(({ effect }) =>
      leapOptions.some((option) => option.name === effect.name),
    );
  const fixedRows = leapOptions.slice(0, 3).map(
    (option, optionIndex) =>
      selected.find((row) => row.effect.name === option.name) ?? {
        index: safeEffects.length + optionIndex,
        effect: {
          id: `leap-fixed-${optionIndex}`,
          name: option.name,
          level: 0,
          grade: null,
          icon: option.icon,
          description: option.description,
        },
      },
  );
  const editableOptions = leapOptions.slice(3);
  const editableRows = selected
    .filter(({ effect }) =>
      editableOptions.some((option) => option.name === effect.name),
    )
    .slice(0, 2);
  const rows = [...fixedRows, ...editableRows];
  const choices = editableOptions.map((option) => option.name);
  return (
    <section className="passive-editor leap-editor">
      <div className="passive-choice-heading">
        <h3>도약</h3>
      </div>
      <div className="leap-options">
        {rows.map((row, index) => {
          const current = leapOptions.find(
            (option) => option.name === row.effect.name,
          );
          const level = current ? (row.effect.level ?? 0) : 0;
          const fixed = index < 3;
          return (
            <div className="leap-option-row" key={`leap-row-${index}`}>
              <Artwork
                icon={current?.icon ?? row.effect.icon ?? null}
                label="✦"
                title={
                  current
                    ? `${current.name}: ${current.description}`
                    : "도약 옵션 선택"
                }
              />
              {fixed ? (
                <strong className="leap-fixed-name">{current?.name}</strong>
              ) : (
                <select
                  aria-label={`도약 옵션 ${index + 1}`}
                  value={current?.name ?? "없음"}
                  onChange={(event) => {
                    const name = event.target.value;
                    const option = leapOptions.find(
                      (item) => item.name === name,
                    );
                    onChange(row.index, {
                      id: `leap-slot-${index}`,
                      name,
                      level:
                        name === "없음"
                          ? 0
                          : Math.min(level || 1, option?.maxLevel ?? 5),
                      icon: option?.icon ?? null,
                      description: option?.description ?? null,
                    });
                  }}
                >
                  {choices.map((choice) => (
                    <option value={choice} key={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label={`도약 옵션 ${index + 1} 레벨`}
                value={level}
                onChange={(event) =>
                  onChange(row.index, {
                    level: Math.min(
                      Number(event.target.value),
                      current?.maxLevel ?? 5,
                    ),
                  })
                }
              >
                {Array.from(
                  { length: (current?.maxLevel ?? 5) + 1 },
                  (_, value) => (
                    <option value={value} key={value}>
                      Lv.{value}
                    </option>
                  ),
                )}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PassiveEditor({
  title,
  group,
  effects,
  onChange,
}: {
  title: string;
  group: PassiveGroup;
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  if (group === "enlightenment")
    return <EnlightenmentEditor effects={effects} onChange={onChange} />;
  if (group === "leap")
    return <LeapEditor effects={effects} onChange={onChange} />;
  const rows = effects.filter((effect): effect is ArkEffectProfile =>
    Boolean(effect),
  );
  const displayRows = rows.length
    ? rows
    : [
        {
          id: `${group}-empty`,
          name: "없음",
          level: 0,
          grade: null,
          icon: null,
          description: null,
        },
      ];
  const choices = [
    ...new Set([
      ...passiveCatalog[group],
      ...rows.map((effect) => effect.name),
    ]),
  ];
  return (
    <section className={`passive-editor passive-choice-editor ${group}-editor`}>
      <div className="passive-choice-heading">
        <h3>{title}</h3>
        <span>{displayRows.length}개</span>
      </div>
      {displayRows.map((effect, index) => (
        <div className="passive-row" key={effect.id}>
          <select
            aria-label={`${title} 옵션 ${index + 1}`}
            value={effect.name}
            onChange={(event) => onChange(index, { name: event.target.value })}
          >
            {choices.map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
          <select
            aria-label={`${title} 옵션 ${index + 1} 레벨`}
            value={effect.level ?? 0}
            onChange={(event) =>
              onChange(index, { level: Number(event.target.value) })
            }
          >
            {Array.from({ length: 7 }, (_, level) => (
              <option value={level} key={level}>
                Lv.{level}
              </option>
            ))}
          </select>
        </div>
      ))}
    </section>
  );
}
function EvolutionTierOneEditor({
  effects,
  onChange,
}: {
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  const statNames = new Set<string>(
    EVOLUTION_T1_OPTIONS.map((option) => option.name),
  );
  const selected = effects
    .filter(
      (effect): effect is ArkEffectProfile =>
        Boolean(effect) && statNames.has(effect.name),
    )
    .slice(0, 3);
  const rows = Array.from(
    { length: 3 },
    (_, index) =>
      selected[index] ?? {
        id: `evolution-t1-${index}`,
        name: "없음",
        level: 0,
        grade: null,
        icon: null,
        description: null,
      },
  );
  const total = rows.reduce(
    (sum, effect) => sum + (effect.name === "없음" ? 0 : (effect.level ?? 0)),
    0,
  );
  return (
    <section className="passive-editor evolution-t1-editor">
      <div className="evolution-t1-heading">
        <div>
          <h3>진화 · T1</h3>
          <p>
            최대 3개 선택 · 합계 {total} / {EVOLUTION_T1_MAX_TOTAL_LEVEL} ·
            레벨당 전투 특성 +{EVOLUTION_T1_STAT_PER_LEVEL}
          </p>
        </div>
      </div>
      <div className="evolution-t1-list">
        {rows.map((effect, index) => {
          const selectedName = effect.name as EvolutionT1OptionName | "없음";
          const selectedOption =
            EVOLUTION_T1_OPTIONS.find(
              (option) => option.name === selectedName,
            ) ?? null;
          const otherTotal = total - (selectedOption ? (effect.level ?? 0) : 0);
          const maxLevel = Math.min(
            EVOLUTION_T1_MAX_OPTION_LEVEL,
            EVOLUTION_T1_MAX_TOTAL_LEVEL - otherTotal,
          );
          const tooltip = selectedOption
            ? `${selectedOption.name}: 레벨당 전투 특성 +${EVOLUTION_T1_STAT_PER_LEVEL} · 현재 총 +${(effect.level ?? 0) * EVOLUTION_T1_STAT_PER_LEVEL}`
            : "전투 특성 선택";
          return (
            <article key={effect.id}>
              <Artwork
                icon={selectedOption?.icon ?? null}
                label="＋"
                title={tooltip}
              />
              <div className="evolution-t1-controls">
                <select
                  aria-label={`T1 전투 특성 ${index + 1}`}
                  value={selectedName}
                  onChange={(event) => {
                    const name = event.target.value as
                      EvolutionT1OptionName | "없음";
                    const option = EVOLUTION_T1_OPTIONS.find(
                      (item) => item.name === name,
                    );
                    onChange(index, {
                      id: `evolution-t1-editor-${index}`,
                      name,
                      level: name === "없음" ? 0 : (effect.level ?? 0),
                      icon: option?.icon ?? null,
                      description: option
                        ? `${option.name}이 레벨당 ${EVOLUTION_T1_STAT_PER_LEVEL} 증가합니다.`
                        : null,
                    });
                  }}
                >
                  <option>없음</option>
                  {EVOLUTION_T1_OPTIONS.map((option) => (
                    <option
                      value={option.name}
                      disabled={
                        option.name !== selectedName &&
                        rows.some((row) => row.name === option.name)
                      }
                      key={option.name}
                    >
                      {option.name}
                    </option>
                  ))}
                </select>
                <strong>{selectedOption?.name ?? "선택 없음"}</strong>
              </div>
              <select
                className="evolution-t1-level"
                aria-label={`${selectedName} 레벨`}
                value={selectedOption ? (effect.level ?? 0) : 0}
                disabled={!selectedOption}
                onChange={(event) =>
                  onChange(index, {
                    id: `evolution-t1-editor-${index}`,
                    name: selectedName,
                    level: Number(event.target.value),
                  })
                }
              >
                {Array.from({ length: maxLevel + 1 }, (_, level) => (
                  <option value={level} key={level}>
                    Lv.{level}
                  </option>
                ))}
              </select>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function scaledEvolutionDescription(description: string, level: number) {
  return description.replace(
    /(\d+(?:\.\d+)?)%/g,
    (_, value: string) => `${Number(value) * level}%`,
  );
}
function EvolutionTierEditor({
  tier,
  effects,
  onChange: rawOnChange,
}: {
  tier: Exclude<EvolutionTier, "T1">;
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  const rule = EVOLUTION_TIER_RULES[tier];
  const options = EVOLUTION_TIER_CATALOG[tier].filter(
    (option) => option.selectable !== false,
  );
  const safeEffects = effects.filter((effect): effect is ArkEffectProfile =>
    Boolean(effect),
  );
  const selected = safeEffects
    .map((effect, index) => ({ effect, index }))
    .filter(({ effect }) =>
      options.some((option) => option.name === effect.name),
    )
    .slice(0, rule.maxSelections);
  const rows = Array.from(
    { length: rule.maxSelections },
    (_, index) =>
      selected[index] ?? {
        index: safeEffects.length + index,
        effect: {
          id: `evolution-${tier}-${index}`,
          name: tier === "T4" ? (options[index]?.name ?? "없음") : "없음",
          level: 0,
          grade: null,
          icon: tier === "T4" ? (options[index]?.icon ?? null) : null,
          description:
            tier === "T4"
              ? (options[index]?.effects.join(" · ") ?? null)
              : null,
        },
      },
  );
  const spentPoints = rows.reduce(
    (total, row) =>
      total +
      (row.effect.name === "없음"
        ? 0
        : (row.effect.level ?? 0) * rule.pointCost),
    0,
  );
  const onChange = (index: number, patch: Partial<ArkEffectProfile>) => {
    const cap = rule.totalPointCap;
    if (cap !== undefined) {
      const nextPoints = rows.reduce((total, row) => {
        const level =
          row.index === index
            ? (patch.level ?? row.effect.level ?? 0)
            : (row.effect.level ?? 0);
        const name =
          row.index === index
            ? (patch.name ?? row.effect.name)
            : row.effect.name;
        return total + (name === "없음" ? 0 : level * rule.pointCost);
      }, 0);
      if (nextPoints > cap) {
        window.alert(
          `${tier} 진화 포인트는 최대 ${cap}P까지 선택할 수 있습니다.`,
        );
        return;
      }
    }
    rawOnChange(index, patch);
  };
  return (
    <section
      className={`passive-editor evolution-tier-editor evolution-${tier.toLowerCase()}-editor`}
    >
      <div className="evolution-t1-heading">
        <div>
          <h3>진화 · {tier}</h3>
          <p>
            최대 {rule.maxSelections}개 선택 · Lv.당 {rule.pointCost} 포인트 ·
            사용 {spentPoints}P
          </p>
        </div>
      </div>
      <div className="evolution-t1-list">
        {rows.map((row, rowIndex) => {
          const current =
            options.find((option) => option.name === row.effect.name) ?? null;
          const level = current ? (row.effect.level ?? 0) : 0;
          const description = current?.effects.length
            ? current.effects
                .map((effect) => scaledEvolutionDescription(effect, level || 1))
                .join(" · ")
            : "효과 데이터 미등록";
          return (
            <article key={row.effect.id}>
              <Artwork
                icon={current?.icon ?? null}
                label="＋"
                title={
                  current
                    ? `${current.name} Lv.${level}: ${description}`
                    : "진화 옵션 선택"
                }
              />
              <div className="evolution-t1-controls">
                <select
                  aria-label={`${tier} 옵션 ${rowIndex + 1}`}
                  value={current?.name ?? "없음"}
                  onChange={(event) => {
                    const name = event.target.value;
                    const next = options.find((option) => option.name === name);
                    onChange(row.index, {
                      id: row.effect.id,
                      name,
                      level:
                        name === "없음"
                          ? 0
                          : Math.min(
                              row.effect.level ?? 0,
                              next?.maxLevel ?? 0,
                            ),
                      icon: next?.icon ?? null,
                      description: next?.effects.join(" · ") ?? null,
                    });
                  }}
                >
                  {tier !== "T4" ? <option>없음</option> : null}
                  {options.map((option) => (
                    <option
                      value={option.name}
                      disabled={
                        option.name !== current?.name &&
                        rows.some(
                          (candidate) => candidate.effect.name === option.name,
                        )
                      }
                      key={option.name}
                    >
                      {option.name}
                    </option>
                  ))}
                </select>
                <strong>{current?.name ?? "선택 없음"}</strong>
              </div>
              <select
                className="evolution-t1-level"
                aria-label={`${tier} ${current?.name ?? "옵션"} 레벨`}
                value={level}
                disabled={!current}
                onChange={(event) =>
                  onChange(row.index, {
                    id: row.effect.id,
                    level: Number(event.target.value),
                  })
                }
              >
                {Array.from(
                  { length: (current?.maxLevel ?? 0) + 1 },
                  (_, levelOption) => (
                    <option value={levelOption} key={levelOption}>
                      Lv.{levelOption}
                    </option>
                  ),
                )}
              </select>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function coreLevel(point: number | null) {
  return point === null
    ? null
    : point >= 20
      ? 3
      : point >= 17
        ? 2
        : point >= 14
          ? 1
          : 0;
}
function deriveGridShorthand(
  cores: ArkGridCoreProfile[],
  classEngraving?: GlavierClassEngraving | null,
) {
  const definitions = cores
    .slice(0, 3)
    .map((core) => findArkGridOrderCoreDefinition(core.name));
  const types = ["해", "달", "별"] as const;
  const valid =
    definitions.length === 3 &&
    definitions.every(
      (definition, index) =>
        definition !== null &&
        definition.type === types[index] &&
        (!classEngraving || definition.classEngraving === classEngraving),
    );
  return valid
    ? definitions.map((definition) => definition!.number).join("")
    : null;
}
function initialStoneEffects(profile: CharacterProfile): StoneEffect[] {
  const active = profile.engravingDetails
    .filter((engraving) => engraving.abilityStoneLevel > 0)
    .slice(0, 2);
  return (active.length ? active : profile.engravingDetails.slice(0, 2)).map(
    (engraving) => ({
      engraving: engraving.name,
      level: engraving.abilityStoneLevel || 1,
    }),
  );
}
function initialAvatarGrades(profile: CharacterProfile) {
  const avatarFor = (slot: (typeof avatarSlots)[number]) => {
    const direct = profile.avatars.find(
      (item) =>
        item.slot.includes(slot) ||
        (slot === "머리" && item.slot.includes("투구")),
    );
    // 상·하의 일체형 아바타는 API에서 상의 한 칸만 내려오는 경우가 있다.
    // 하의 데이터가 없을 때만 상의 등급을 하의에도 적용한다.
    if (slot === "하의" && !direct)
      return profile.avatars.find((item) => item.slot.includes("상의"));
    return direct;
  };
  return Object.fromEntries(
    avatarSlots.map((slot) => {
      const avatar = avatarFor(slot);
      return [
        slot,
        avatar?.grade === "전설" ? "전설" : avatar ? "영웅" : "없음",
      ];
    }),
  ) as Record<(typeof avatarSlots)[number], string>;
}

function criticalBraceletStat(profile: CharacterProfile) {
  return (
    profile.equipment
      .find((item) => item.slot === "팔찌")
      ?.baseStats.reduce(
        (total, value) =>
          total +
          Number(
            value.match(/^치명\s*\+?([\d,]+)/)?.[1]?.replaceAll(",", "") ?? 0,
          ),
        0,
      ) ?? 0
  );
}
function combatAttributeInput(profile: CharacterProfile) {
  const names = ["특화", "신속", "치명", "제압", "인내", "숙련"];
  const bracelet = profile.equipment.find((item) => item.slot === "팔찌");
  return {
    apiTotals: {
      특화: profile.combat.specializationStat ?? 0,
      신속: profile.combat.swiftnessStat ?? 0,
      치명: profile.combat.criticalStat ?? 0,
      제압: profile.combat.dominationStat ?? 0,
      인내: profile.combat.enduranceStat ?? 0,
      숙련: profile.combat.expertiseStat ?? 0,
    },
    evolution: profile.arkPassive.evolution,
    braceletStats: Object.fromEntries(
      names.map((name) => [
        name,
        bracelet?.baseStats.reduce(
          (total, value) =>
            total +
            Number(
              value
                .match(new RegExp(`^${name}\\s*\\+?([\\d,]+)`))?.[1]
                ?.replaceAll(",", "") ?? 0,
            ),
          0,
        ) ?? 0,
      ]),
    ),
  };
}

const ceilPercentToTwoDecimals = (value: number) =>
  Math.ceil((value - Number.EPSILON) * 100) / 100;

/** 단일 시뮬레이션 스냅샷의 표시 전용 뷰. 여기서는 어떤 계산도 다시 수행하지 않는다. */
function InternalGearSnapshotDebug({
  snapshot,
  cycleDamageRows = [],
  onExportJson,
}: {
  snapshot: ReturnType<typeof buildUnifiedCombatSnapshot>;
  cycleDamageRows?: readonly {
    skillName: string;
    count: number;
    totalDamage: number;
    averageDamage: number;
  }[];
  onExportJson?: () => void;
}) {
  const format = (value: number | null, suffix = "") =>
    value === null ? "미등록" : value.toLocaleString() + suffix;
  return (
    <details className="internal-gear-debug">
      <summary>
        내부 장비 스냅샷 ·{" "}
        {snapshot.internalGearSnapshot.unresolvedSlots.length
          ? `${snapshot.internalGearSnapshot.unresolvedSlots.length}개 미등록`
          : "검증 완료"}
      </summary>
      <button
        type="button"
        className="debug-json-export-button"
        onClick={onExportJson}
      >
        현재 세팅·계산 JSON 추출
      </button>
      <div className="internal-gear-debug-summary">
        {(["특화", "신속", "치명", "제압", "인내", "숙련"] as const).map(
          (name) => (
            <span key={name}>
              {name}{" "}
              <b>
                {snapshot.combatAttributes[name].internalTotal.toLocaleString()}
              </b>
            </span>
          ),
        )}
        <span>
          힘/민/지 최종{" "}
          <b>
            {Math.ceil(snapshot.combatStatsSnapshot.total).toLocaleString()}
          </b>
        </span>
        <span>
          최종 무공{" "}
          <b>
            {Math.floor(snapshot.weaponAttackSnapshot.total).toLocaleString()}
          </b>
        </span>
        <span>
          기본 공격력{" "}
          <b>
            {Math.floor(
              snapshot.baseAttackPowerSnapshot.total,
            ).toLocaleString()}
          </b>
        </span>
        <span>
          최종 공격력{" "}
          <b>
            {Math.floor(
              snapshot.finalAttackPowerSnapshot.total,
            ).toLocaleString()}
          </b>
        </span>
        <span>
          치적{" "}
          <b>
            {ceilPercentToTwoDecimals(
              snapshot.criticalRateSnapshot.total * 100,
            ).toFixed(2)}
            %
          </b>
        </span>
        <span>
          치피{" "}
          <b>{(snapshot.criticalDamageSnapshot.total * 100).toFixed(2)}%</b>
        </span>
        <span>
          치명타 주는 피해 배율{" "}
          <b>{snapshot.criticalOutgoingSnapshot.total.toFixed(4)}x</b>
        </span>
        <span>
          추가 피해 <b>{snapshot.additionalDamageSnapshot.total.toFixed(2)}%</b>
        </span>
        <span>
          특정 타입 피해{" "}
          <b>{snapshot.specificTypeDamageSnapshot.total.toFixed(2)}%</b>
        </span>
        <span>
          카드 속성 피해{" "}
          <b>
            {(
              (snapshot.cardAttributeDamageSnapshot.totalMultiplier - 1) *
              100
            ).toFixed(2)}
            %
          </b>
        </span>
        <span>
          백어택 스킬 자체 피해{" "}
          <b>
            {(
              (snapshot.backAttackDamageSnapshot.skillMultiplier - 1) *
              100
            ).toFixed(2)}
            %
          </b>
        </span>
        <span>
          백어택 성공 피해 배율{" "}
          <b>
            {snapshot.backAttackDamageSnapshot.successMultiplier.toFixed(4)}x
          </b>
        </span>
        <span>
          각인 배율{" "}
          <b>
            {snapshot.engravingOutgoingDamageSnapshot.totalMultiplier.toFixed(
              4,
            )}
            x
          </b>
        </span>
        <span>
          돌격대장 피해{" "}
          <b>{snapshot.enemyDamageSnapshot.commanderDamage.toFixed(2)}%</b>
        </span>
        <span>
          악세·팔찌 배율{" "}
          <b>
            {snapshot.enemyDamageSnapshot.accessoriesBraceletMultiplier.toFixed(
              4,
            )}
            x
          </b>
        </span>
        <span>
          아크 그리드 배율{" "}
          <b>{snapshot.enemyDamageSnapshot.arkGridMultiplier.toFixed(4)}x</b>
        </span>
        <span>
          깨달음 배율{" "}
          <b>
            {snapshot.enemyDamageSnapshot.enlightenmentMultiplier.toFixed(4)}x
          </b>
        </span>
        <span>
          집중 스킬 타입 배율{" "}
          <b>{snapshot.focusSkillDamageMultiplier.toFixed(4)}x</b>
        </span>
        <span>
          난무 스킬 타입 배율{" "}
          <b>{snapshot.flurrySkillDamageMultiplier.toFixed(4)}x</b>
        </span>
        <span>
          마나 스킬 각인 배율{" "}
          <b>
            {snapshot.conditionalSkillDamageSnapshot.manaSkill.totalMultiplier.toFixed(
              4,
            )}
            x
          </b>
        </span>
        <span>
          홀딩·캐스팅 각인 배율{" "}
          <b>
            {snapshot.conditionalSkillDamageSnapshot.holdingCastingSkill.totalMultiplier.toFixed(
              4,
            )}
            x
          </b>
        </span>
        <span>
          공격 속도 <b>{snapshot.attackSpeedPercent.toFixed(2)}%</b>
        </span>
        <span>
          이동 속도 <b>{snapshot.moveSpeedPercent.toFixed(2)}%</b>
        </span>
        <span>
          기본 진화형 피해 <b>{(snapshot.evolution * 100).toFixed(2)}%</b>
        </span>
      </div>
      <div className="internal-cycle-damage-debug">
        <strong>전투 사이클 스킬 대미지</strong>
        {cycleDamageRows.length ? (
          <div className="internal-cycle-damage-debug-table">
            <span>스킬</span>
            <span>사용 횟수</span>
            <span>대미지 합계</span>
            <span>1회 평균 대미지</span>
            {cycleDamageRows.map((row) => (
              <Fragment key={row.skillName}>
                <span>{row.skillName}</span>
                <b>{row.count}</b>
                <b>{Math.floor(row.totalDamage).toLocaleString()}</b>
                <b>{Math.floor(row.averageDamage).toLocaleString()}</b>
              </Fragment>
            ))}
          </div>
        ) : (
          <small>전투 사이클이 구성되지 않았습니다.</small>
        )}
      </div>
      <div className="internal-gear-debug-rows">
        {snapshot.internalGearSnapshot.rows.map((row) => (
          <div
            className={row.status === "resolved" ? "" : "unresolved"}
            key={row.slot}
          >
            <strong>{row.slot}</strong>
            <small>
              {row.grade ?? "장비 없음"} · {row.itemLevel ?? "-"} · +
              {row.enhancement ?? 0}
            </small>
            <span>스탯 {format(row.primaryStat)}</span>
            <span>무공 {format(row.weaponAttack)}</span>
            <span>기본공 {format(row.baseAttackFlat)}</span>
            <span>
              기본공%{" "}
              {format(
                row.baseAttackRate === null ? null : row.baseAttackRate * 100,
                "%",
              )}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function Home() {
  const [supportRageBuff, setSupportRageBuff] = useState(false);
  const [banquetBuff, setBanquetBuff] = useState(false);
  const [blessingFood, setBlessingFood] = useState(false);
  const [wineFood, setWineFood] = useState(false);
  const [azenaBuff, setAzenaBuff] = useState(false);
  const [vulnerableAttribute, setVulnerableAttribute] = useState(false);
  const [menu, setMenu] = useState<MainMenu>("simulation");
  const [tab, setTab] = useState<SimulationTab>("기본 장비");
  const [apiKey, setApiKey] = useState("");
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [characterName, setCharacterName] = useState("");
  const [character, setCharacter] = useState<CharacterProfile | null>(null);
  const [message, setMessage] = useState(
    "API 설정에서 API 키를 입력한 뒤 캐릭터를 조회하세요.",
  );
  const [searching, setSearching] = useState(false);
  const [cycle, setCycle] = useState<CycleEntry[]>([]);
  const [cycleSkill, setCycleSkill] = useState("");
  const [cyclePresetId, setCyclePresetId] = useState("");
  const automaticCycleKeyRef = useRef<string | null>(null);
  const manualCycleEditRef = useRef(false);
  const [cycleSkillRatioSettings, setCycleSkillRatioSettings] =
    useState<CycleSkillRatioSettings>({});
  const [allCycleBackAttack, setAllCycleBackAttack] = useState(true);
  const [allCycleCooldown, setAllCycleCooldown] = useState(true);
  const [allCycleBackAttackRate, setAllCycleBackAttackRate] = useState("90");
  const [allCycleCooldownRate, setAllCycleCooldownRate] = useState("80");
  const [cycleDurationMode, setCycleDurationMode] =
    useState<CycleDurationMode>("guideline");
  const [manualCycleSeconds, setManualCycleSeconds] = useState("");
  const [draggedCycleIndex, setDraggedCycleIndex] = useState<number | null>(
    null,
  );
  const [skillToAdd, setSkillToAdd] = useState("");
  const [visibleSkillIds, setVisibleSkillIds] = useState<string[]>([]);
  const [savedSettings, setSavedSettings] = useState<SavedSetting[]>([]);
  const [gems, setGems] = useState<GemProfile[]>([]);
  const [gemMessage, setGemMessage] = useState("");
  const [stoneEffects, setStoneEffects] = useState<StoneEffect[]>([]);
  const [avatarGrades, setAvatarGrades] = useState<Record<string, string>>({});
  const sharedCombatSnapshot = useMemo(
    () =>
      character
        ? buildUnifiedCombatSnapshot(
            character,
            avatarGrades,
            stoneEffects,
            gems,
            supportRageBuff,
            banquetBuff,
            blessingFood,
            wineFood,
            azenaBuff,
            vulnerableAttribute,
          )
        : null,
    [
      character,
      avatarGrades,
      stoneEffects,
      gems,
      supportRageBuff,
      banquetBuff,
      blessingFood,
      wineFood,
      azenaBuff,
      vulnerableAttribute,
    ],
  );
  function applyProfile(profile: CharacterProfile) {
    const cleanProfile = {
      ...profile,
      gems: profile.gems.map(normalizeGem),
      arkPassive: {
        ...profile.arkPassive,
        evolution: profile.arkPassive.evolution.filter(
          (effect): effect is ArkEffectProfile => Boolean(effect),
        ),
        enlightenment: profile.arkPassive.enlightenment
          .filter((effect): effect is ArkEffectProfile => Boolean(effect))
          .map((effect, index) => ({
            ...effect,
            id: `enlightenment-api-${index}-${effect.id}`,
          })),
        leap: profile.arkPassive.leap.filter(
          (effect): effect is ArkEffectProfile => Boolean(effect),
        ),
      },
    };
    cleanProfile.initialCriticalStat = {
      evolutionT1Level:
        cleanProfile.arkPassive.evolution.find(
          (effect) => effect.name === "치명",
        )?.level ?? 0,
      braceletStat: criticalBraceletStat(cleanProfile),
    };
    cleanProfile.initialCombatAttributes = createCombatAttributeSnapshots(
      combatAttributeInput(cleanProfile),
    );
    setCharacter(cleanProfile);
    setCharacterName(cleanProfile.name);
    automaticCycleKeyRef.current = null;
    manualCycleEditRef.current = false;
    setGems(cleanProfile.gems);
    setCycleSkillRatioSettings({});
    setVisibleSkillIds(
      cleanProfile.skills
        .filter(
          (skill) => skill.level >= 2 || alwaysVisibleSkills.has(skill.name),
        )
        .map((skill) => skill.id),
    );
    setStoneEffects(initialStoneEffects(cleanProfile));
    setAvatarGrades(initialAvatarGrades(cleanProfile));
    setGemMessage("");
  }
  useEffect(() => {
    loadLatestCharacter()
      .then((stored) => {
        if (stored) {
          applyProfile(stored.source);
          setMessage(`${stored.source.name}의 저장된 정보를 복원했습니다.`);
        }
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_SETTINGS_KEY);
      if (saved) setSavedSettings(JSON.parse(saved) as SavedSetting[]);
    } catch {
      /* 복원 실패는 무시한다. */
    }
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (saved) {
        setApiKey(saved);
        setRememberApiKey(true);
        setHasSavedApiKey(true);
      }
    } catch {
      /* 브라우저 저장소를 사용할 수 없으면 저장 기능만 비활성화한다. */
    }
  }, []);
  const gear =
    character?.equipment.filter((item) => item.category === "gear") ?? [];
  const accessories =
    character?.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ) ?? [];
  const stone =
    character?.equipment.find((item) => item.slot === "어빌리티 스톤") ?? null;
  const bracelet =
    character?.equipment.find((item) => item.slot === "팔찌") ?? null;
  const primaryStat = primaryStatFromEquipment(gear);
  const classEngraving = character ? glavierClassEngraving(character) : null;
  const arkGridShorthand = character
    ? deriveGridShorthand(character.arkGrid.cores, classEngraving)
    : null;
  const visibleSkills =
    character?.skills.filter((skill) => visibleSkillIds.includes(skill.id)) ??
    [];
  // 사이클 선택지는 현재 스킬 영역에 실제로 노출된 스킬과 완전히 같은 목록을 쓴다.
  // 따라서 사용자가 특정 스킬을 추가하면 별도 목록 갱신 없이 즉시 사이클 선택지에도 나타난다.
  const cycleSkills = visibleSkills;
  const cycleSkillCards = cycle.reduce<SkillProfile[]>((skills, entry) => {
    const skill = visibleSkills.find(
      (candidate) => candidate.name === entry.skillName,
    );
    if (skill && !skills.some((item) => item.name === skill.name)) {
      skills.push(skill);
    }
    return skills;
  }, []);
  const commonCooldownReductionPercent =
    character && sharedCombatSnapshot
      ? commonCooldownReductionRate({
          swiftness:
            sharedCombatSnapshot.combatAttributes["신속"].internalTotal,
          evolution: character.arkPassive.evolution,
          bracelet: character.equipment.find((item) => item.slot === "팔찌"),
        }) * 100
      : 0;
  const cyclePresets = createCyclePresets(
    classEngraving,
    arkGridShorthand,
    character?.arkPassive.evolution.some(
      (effect) => effect.name === "뭉툭한 가시" && (effect.level ?? 0) > 0,
    ) ?? false,
    character?.arkPassive.evolution.some(
      (effect) => effect.name === "마나 용광로" && (effect.level ?? 0) > 0,
    ) ?? false,
  );
  const automaticCyclePreset = cyclePresets[0] ?? null;
  const automaticCycleKey = character
    ? [
        character.name,
        classEngraving ?? "",
        arkGridShorthand ?? "",
        automaticCyclePreset?.id ?? "",
      ].join("|")
    : null;
  const selectedCyclePreset = cyclePresets.find(
    (preset) => preset.id === cyclePresetId,
  );
  const azureDragonCycleIcon =
    visibleSkills.find((skill) => skill.name === "청룡진")?.icon ?? null;
  const yeongaSimGongCycleIcon =
    character?.arkPassive.enlightenment.find(
      (effect) => effect.name === "연가심공",
    )?.icon ?? null;
  const addableSkills =
    character?.skills.filter((skill) => !visibleSkillIds.includes(skill.id)) ??
    [];
  /**
   * 단일 계산 모델: UI 상태를 한 번의 내부 스냅샷으로 고정하고, 디버그와 스킬 UI는
   * 여기서 산출한 결과만 읽는다. API 원본은 applyProfile 단계의 초기값 생성에만 쓰인다.
   */
  const unifiedSimulation = useMemo(() => {
    if (!character || !sharedCombatSnapshot) return null;
    const evolutionRank =
      character.arkPassive.points.find((point) => point.name === "진화")
        ?.rank ?? null;
    const evolutionLevel = (name: string) =>
      character.arkPassive.evolution.find((effect) => effect.name === name)
        ?.level ?? 0;
    const braceletCooldownIncrease = braceletCooldownIncreaseRate(
      character.equipment.find((item) => item.slot === "팔찌"),
    );
    const skills = Object.fromEntries(
      visibleSkills.flatMap((skill) => {
        if (!GLAVIER_SKILL_BY_NAME[skill.name]) return [];
        const selectedTripodNames = activeTripodNamesForSkill(skill);
        const skillGems = gems.filter((gem) => gem.skill === skill.name);
        const calculation = calculateSingleSkillDamage({
          base: {
            primaryStat: 6,
            weaponAttack: sharedCombatSnapshot.finalAttackPower ** 2,
            criticalRate: sharedCombatSnapshot.criticalRate,
          },
          effects: [
            {
              id: "enlightenment-incoming-damage",
              label: "연가 표식",
              bucket: "incomingDamage",
              value: sharedCombatSnapshot.incomingDamageMultiplier - 1,
              source: { system: "arkPassive" },
            },
            {
              id: "bracelet-defense-reduction",
              label: "팔찌 방어력 감소",
              bucket: "defenseReduction",
              value: sharedCombatSnapshot.defenseReductionRate,
              source: { system: "bracelet" },
            },
          ],
          target: { defense: sharedCombatSnapshot.targetDefense },
          snapshot: {
            finalAttackPower: sharedCombatSnapshot.finalAttackPower,
            criticalDamageMultiplier:
              sharedCombatSnapshot.criticalDamageMultiplier,
            criticalOutgoingMultiplier:
              sharedCombatSnapshot.criticalOutgoingMultiplier,
            additionalDamageMultiplier:
              1 + sharedCombatSnapshot.additionalDamageSnapshot.total / 100,
            specificTypeDamageMultiplier:
              1 + sharedCombatSnapshot.specificTypeDamageSnapshot.total / 100,
            cardAttributeDamageMultiplier:
              sharedCombatSnapshot.cardAttributeDamageSnapshot.totalMultiplier,
            commonEnemyDamageMultiplier:
              sharedCombatSnapshot.enemyDamageSnapshot.totalMultiplier,
            backAttackSkillDamageMultiplier:
              sharedCombatSnapshot.backAttackDamageSnapshot.skillMultiplier,
            backAttackSuccessDamageMultiplier:
              sharedCombatSnapshot.backAttackDamageSnapshot.successMultiplier,
            focusSkillDamageMultiplier:
              sharedCombatSnapshot.focusSkillDamageMultiplier,
            flurrySkillDamageMultiplier:
              sharedCombatSnapshot.flurrySkillDamageMultiplier,
            manaSkillDamageMultiplier:
              sharedCombatSnapshot.conditionalSkillDamageSnapshot.manaSkill
                .totalMultiplier,
            holdingCastingSkillDamageMultiplier:
              sharedCombatSnapshot.conditionalSkillDamageSnapshot
                .holdingCastingSkill.totalMultiplier,
            superChargeSkillDamageMultiplier:
              sharedCombatSnapshot.conditionalSkillDamageSnapshot
                .superChargeSkill.totalMultiplier,
            arkGridOrderSkillEffects:
              sharedCombatSnapshot.arkGridOrderSkillEffects,
          },
          evolutionContext: {
            evolution: character.arkPassive.evolution,
            enlightenment: character.arkPassive.enlightenment,
            evolutionRank,
            attackSpeedPercent: sharedCombatSnapshot.attackSpeedPercent,
            moveSpeedPercent: sharedCombatSnapshot.moveSpeedPercent,
            supportRageBuff,
          },
          leapEffects: character.arkPassive.leap,
          skill: {
            name: skill.name,
            level: skill.level,
            selectedTripodNames,
            gems: skillGems,
          },
        });
        const baseCooldown = resolveGlavierSkillCooldown({
          skillName: skill.name,
          selectedTripodNames,
        });
        const catalogSkill = getGlavierSkill(skill.name);
        const manaCooldownReduction = catalogSkill?.tags.mana
          ? (evolutionLevel("끝없는 마나") +
              evolutionLevel("무한한 마력")) *
            0.07
          : 0;
        const awakeningCooldownReduction =
          skill.name === "맹룡난무" || skill.name === "적룡필살"
            ? (character.arkPassive.leap.find(
                (effect) => effect.name === "잠재력 해방",
              )?.level ?? 0) * 0.02
            : 0;
        const cooldown = baseCooldown
          ? {
              ...baseCooldown,
              cooldownSeconds: applyCooldownReductionRates(
                baseCooldown.cooldownSeconds +
                  calculation.arkGridOrder.cooldownFlatSeconds,
                [
                  cooldownGemReductionRate(skillGems),
                  sharedCombatSnapshot.combatAttributes["신속"].internalTotal *
                    0.000215,
                  manaCooldownReduction,
                  evolutionLevel("최적화 훈련") * 0.04,
                  evolutionLevel("타이밍 지배") * 0.05,
                  awakeningCooldownReduction,
                  -braceletCooldownIncrease,
                ],
              ),
            }
          : baseCooldown;
        return [
          [
            skill.id,
            {
              calculation,
              cooldown,
            },
          ],
        ];
      }),
    ) as Record<
      string,
      {
        calculation: SingleSkillCalculationResult;
        cooldown: ReturnType<typeof resolveGlavierSkillCooldown>;
      }
    >;
    return { snapshot: sharedCombatSnapshot, skills };
  }, [character, gems, sharedCombatSnapshot, supportRageBuff, visibleSkills]);
  useEffect(() => {
    if (!character || !unifiedSimulation) return;
    const preset = cyclePresets[0] ?? null;
    if (automaticCycleKeyRef.current === automaticCycleKey) {
      return;
    } else {
      manualCycleEditRef.current = false;
    }
    automaticCycleKeyRef.current = automaticCycleKey;
    if (!preset) {
      setCyclePresetId("");
      setCycle([]);
      return;
    }
    const available = new Map(
      character.skills.map((skill) => [skill.name, skill.id]),
    );
    setVisibleSkillIds((current) => [
      ...current,
      ...preset.entries
        .map((entry) => available.get(entry.skillName))
        .filter(
          (skillId): skillId is string =>
            skillId !== undefined && !current.includes(skillId),
        ),
    ]);
    setCyclePresetId(preset.id);
    setCycle(
      preset.entries
        .filter((entry) => available.has(entry.skillName))
        .map((entry) => ({ ...entry, id: crypto.randomUUID() })),
    );
  }, [
    automaticCycleKey,
    character,
  ]);
  const guidelineCycleSeconds = (() => {
    if (!selectedCyclePreset || !unifiedSimulation) return null;
    const targetSkillName =
      selectedCyclePreset.id === "jeoljeong-222" ? "적룡필살" : "적룡포";
    const targetCooldown = Object.values(unifiedSimulation.skills).find(
      (entry) => entry.calculation.skill.name === targetSkillName,
    )?.cooldown?.cooldownSeconds;
    if (targetCooldown === undefined) return null;
    return selectedCyclePreset.id === "jeoljeong-222"
      ? targetCooldown
      : targetCooldown * 3;
  })();
  const selectedCycleSeconds =
    cycleDurationMode === "guideline"
      ? guidelineCycleSeconds
      : Number(manualCycleSeconds);
  const cycleSeconds =
    typeof selectedCycleSeconds === "number" &&
    Number.isFinite(selectedCycleSeconds)
      ? selectedCycleSeconds
      : 0;
  const cycleDamageRows = (() => {
    if (!unifiedSimulation || cycle.length === 0) return [];
    const rows = new Map<
      string,
      { skillName: string; count: number; totalDamage: number }
    >();
    cycle.forEach((entry) => {
      const skill = visibleSkills.find(
        (candidate) => candidate.name === entry.skillName,
      );
      if (!skill) return;
      const simulationSkill = unifiedSimulation.skills[skill.id];
      if (!simulationSkill) return;
      const ratios = cycleSkillRatioSettings[skill.name] ?? {
        backAttackRate: "0",
        cooldownRate: "0",
      };
      const backAttackRate = allCycleBackAttack
        ? Math.min(100, Math.max(0, Number(allCycleBackAttackRate) || 0))
        : Math.min(100, Math.max(0, Number(ratios.backAttackRate) || 0));
      const cooldownRate = allCycleCooldown
        ? Math.min(100, Math.max(0, Number(allCycleCooldownRate) || 0))
        : Math.min(100, Math.max(0, Number(ratios.cooldownRate) || 0));
      const scenarioFor = (backAttack: boolean) =>
        simulationSkill.calculation.scenarios.find(
          (scenario) =>
            scenario.conditions.azureDragonBuff === entry.azureDragon &&
            scenario.conditions.yeongaSimGong === entry.yeongaSimGong &&
            scenario.conditions.backAttack === backAttack,
        );
      const nonBackAttackScenario = scenarioFor(false);
      const backAttackScenario = scenarioFor(true) ?? nonBackAttackScenario;
      if (!nonBackAttackScenario || !backAttackScenario) return;
      const successWeight = backAttackRate / 100;
      const expectedSkillDamage =
        nonBackAttackScenario.averageDamage * (1 - successWeight) +
        backAttackScenario.averageDamage * successWeight;
      const current = rows.get(skill.name) ?? {
        skillName: skill.name,
        count: 0,
        totalDamage: 0,
      };
      current.count += 1;
      current.totalDamage += expectedSkillDamage * (cooldownRate / 100);
      rows.set(skill.name, current);
    });
    return [...rows.values()].map((row) => ({
      ...row,
      averageDamage: row.totalDamage / row.count,
    }));
  })();
  const expectedDps =
    cycleSeconds > 0 && cycleDamageRows.length > 0
      ? cycleDamageRows.reduce((total, row) => total + row.totalDamage, 0) /
        cycleSeconds
      : null;
  function exportDebugJson() {
    if (!character || !sharedCombatSnapshot) return;
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      character: {
        name: character.name,
        server: character.server,
        className: character.className,
        buildName: character.buildName,
        level: character.level,
        apiCombatPower: character.apiCombatPower,
        equipment: character.equipment,
        engravings: character.engravingDetails,
        avatars: character.avatars,
        gems,
        arkPassive: character.arkPassive,
        arkGrid: character.arkGrid,
      },
      uiSettings: {
        supportRageBuff,
        banquetBuff,
        blessingFood,
        wineFood,
        azenaBuff,
        vulnerableAttribute,
        stoneEffects,
        avatarGrades,
        cyclePresetId,
        cycleDurationMode,
        manualCycleSeconds,
        cycle,
        cycleSkillRatioSettings,
        allCycleBackAttack,
        allCycleCooldown,
        allCycleBackAttackRate,
        allCycleCooldownRate,
      },
      formulas: {
        expectedDps:
          "sum(스킬별 사이클 대미지 합계) / 선택 사이클 시간",
        skillCycleDamage:
          "스킬 시나리오 평균 대미지 × 백어택 비율 × 쿨타임 비율",
        skillDamage:
          "(최종 공격력 × 모션 배율 + 모션 상수) × 트라이포드 배율 × 보석 배율 × 진화형 피해 × 공통 배율",
      },
      calculation: {
        expectedDps,
        cycleSeconds,
        guidelineCycleSeconds,
        selectedCycleSeconds,
        cycleDamageRows,
        combatSnapshot: sharedCombatSnapshot,
        unifiedSimulation,
      },
    };
    const json = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${character.name}-dps-debug-${new Date()
      .toISOString()
      .replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const engravingNames = ENGRAVING_NAMES;
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey.trim()) {
      setMenu("api");
      setMessage("먼저 API 설정에서 키를 입력해주세요.");
      return;
    }
    if (!characterName.trim()) {
      setMessage("캐릭터명을 입력해주세요.");
      return;
    }
    setSearching(true);
    setMessage("로스트아크 API에서 캐릭터 정보를 불러오는 중입니다...");
    try {
      const profile = mapCharacterResponse(
        await fetchCharacter(characterName.trim(), apiKey.trim()),
      );
      applyProfile(profile);
      setCycle([]);
      await saveCharacter(profile);
      setMessage("캐릭터 정보와 현재 세팅을 불러왔습니다.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSearching(false);
    }
  }
  function updateApiKey(value: string) {
    setApiKey(value);
    if (!rememberApiKey) return;
    try {
      if (value.trim()) {
        localStorage.setItem(API_KEY_STORAGE_KEY, value.trim());
        setHasSavedApiKey(true);
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        setHasSavedApiKey(false);
      }
    } catch {
      setMessage("브라우저 저장소에 API 키를 저장하지 못했습니다.");
    }
  }
  function updateCycleSkillRatio(
    skillName: string,
    key: "backAttackRate" | "cooldownRate",
    value: string,
  ) {
    if (value === "") {
      setCycleSkillRatioSettings((current) => ({
        ...current,
        [skillName]: {
          backAttackRate: current[skillName]?.backAttackRate ?? "0",
          cooldownRate: current[skillName]?.cooldownRate ?? "0",
          [key]: "",
        },
      }));
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    const clampedValue = Math.min(100, Math.max(0, numericValue));
    setCycleSkillRatioSettings((current) => ({
      ...current,
      [skillName]: {
        backAttackRate: current[skillName]?.backAttackRate ?? "0",
        cooldownRate: current[skillName]?.cooldownRate ?? "0",
        [key]: String(clampedValue),
      },
    }));
  }
  function toggleApiKeyRemember(checked: boolean) {
    if (checked && !apiKey.trim()) {
      setMessage("저장할 API 키를 먼저 입력해주세요.");
      return;
    }
    try {
      if (checked) {
        localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
        setHasSavedApiKey(true);
        setMessage("이 브라우저에 API 키를 저장했습니다.");
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        setHasSavedApiKey(false);
        setMessage("저장된 API 키를 삭제했습니다.");
      }
      setRememberApiKey(checked);
    } catch {
      setMessage("브라우저 저장소를 사용할 수 없습니다.");
    }
  }
  function removeSavedApiKey() {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      setApiKey("");
      setRememberApiKey(false);
      setHasSavedApiKey(false);
      setMessage("저장된 API 키를 삭제했습니다.");
    } catch {
      setMessage("브라우저 저장소를 사용할 수 없습니다.");
    }
  }
  function updateEquipment(id: string, patch: Partial<EquipmentProfile>) {
    setCharacter((current) =>
      current
        ? {
            ...current,
            equipment: current.equipment.map((item) =>
              item.id === id ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  }
  function updateAllGearEnhancement(level: number) {
    setCharacter((current) =>
      current
        ? {
            ...current,
            equipment: current.equipment.map((item) =>
              item.category === "gear" && item.slot !== "완갑"
                ? { ...item, enhancement: level }
                : item,
            ),
          }
        : current,
    );
  }
  function updateEngraving(index: number, patch: Partial<EngravingProfile>) {
    setCharacter((current) => {
      if (!current) return current;
      const details = current.engravingDetails.map((engraving, itemIndex) =>
        itemIndex === index
          ? {
              ...engraving,
              ...patch,
              level:
                patch.grade === "전설" ? 4 : (patch.level ?? engraving.level),
              icon: patch.name ? engravingIcon(patch.name) : engraving.icon,
            }
          : engraving,
      );
      return {
        ...current,
        engravingDetails: details,
        engravings: details.map((engraving) => engraving.name),
      };
    });
  }
  function updatePassive(
    group: PassiveGroup,
    index: number,
    patch: Partial<ArkEffectProfile>,
  ) {
    setCharacter((current) => {
      if (!current) return current;
      const effects = current.arkPassive[group].filter(
        (effect): effect is ArkEffectProfile => Boolean(effect),
      );
      let targetIndex = Math.min(index, effects.length);

      // T2~T5는 전체 evolution 배열의 위치가 화면 행 순서와 다르므로
      // 기존 항목 수정은 안정적인 effect id로 찾는다.
      if (
        group === "evolution" &&
        patch.id &&
        !patch.id.startsWith("evolution-t1-editor-")
      ) {
        const identifiedIndex = effects.findIndex(
          (effect) => effect.id === patch.id,
        );
        if (identifiedIndex >= 0) targetIndex = identifiedIndex;
      }

      // T1은 evolution 배열 안에 T2~T5가 함께 저장된다. 따라서 배열의
      // 전체 index가 아니라 T1 슬롯 순서만으로 대상 위치를 결정한다.
      if (group === "evolution") {
        const isT1 = (effect: ArkEffectProfile) =>
          EVOLUTION_T1_OPTIONS.some((option) => option.name === effect.name);
        const t1Indexes = effects
          .map((effect, effectIndex) => (isT1(effect) ? effectIndex : -1))
          .filter((effectIndex) => effectIndex >= 0);
        const isT1EditorPatch =
          patch.id?.startsWith("evolution-t1-editor-") ?? false;
        if (
          isT1EditorPatch ||
          (patch.name &&
            isT1({
              id: "candidate",
              name: patch.name,
              level: 0,
              grade: null,
              icon: null,
              description: null,
            }))
        ) {
          targetIndex = t1Indexes[index] ?? effects.length;
        }
      }

      const existing = effects[targetIndex] ?? {
        id: `${group}-slot-${targetIndex}`,
        name: "없음",
        level: 0,
        grade: null,
        icon: null,
        description: null,
      };
      effects[targetIndex] = {
        ...existing,
        ...patch,
        id: existing.id || `${group}-slot-${targetIndex}`,
      };
      return {
        ...current,
        arkPassive: { ...current.arkPassive, [group]: effects },
      };
    });
  }
  function updateCore(index: number, patch: Partial<ArkGridCoreProfile>) {
    setCharacter((current) => {
      if (!current) return current;
      const cores = current.arkGrid.cores.map((core, coreIndex) =>
        coreIndex === index ? { ...core, ...patch } : core,
      );
      return {
        ...current,
        arkGrid: {
          ...current.arkGrid,
          cores,
          shorthand: deriveGridShorthand(cores, glavierClassEngraving(current)),
        },
      };
    });
  }
  function addGem(
    skillName = visibleSkills[0]?.name ?? "",
    type: "겁화" | "작열" = "겁화",
  ) {
    if (gems.length >= 11) {
      setGemMessage("보석은 최대 11개까지만 선택할 수 있습니다.");
      return;
    }
    setGems((current) => [
      ...current,
      {
        id: `custom-${crypto.randomUUID()}`,
        name: `${type} 보석`,
        type,
        level: 10,
        grade: "고대",
        icon: null,
        skill: skillName,
        effect: null,
      },
    ]);
    setGemMessage("");
  }
  function updateGem(id: string, patch: Partial<GemProfile>) {
    setGems((current) =>
      current.map((gem) =>
        gem.id === id ? normalizeGem({ ...gem, ...patch }) : gem,
      ),
    );
  }
  function updateAllGemLevels(level: number) {
    setGems((current) => current.map((gem) => normalizeGem({ ...gem, level })));
    setGemMessage("");
  }
  function updateSkill(id: string, patch: Partial<SkillProfile>) {
    setCharacter((current) =>
      current
        ? {
            ...current,
            skills: current.skills.map((skill) =>
              skill.id === id ? { ...skill, ...patch } : skill,
            ),
          }
        : current,
    );
  }
  function addSkillToList() {
    if (!skillToAdd) return;
    updateSkill(skillToAdd, { level: 2 });
    setVisibleSkillIds((current) =>
      current.includes(skillToAdd) ? current : [...current, skillToAdd],
    );
    setSkillToAdd("");
  }
  function saveSetting() {
    if (!character) return;
    setSavedSettings((value) => {
      const next = [
        ...value,
        {
          id: crypto.randomUUID(),
          name: `${character.name} 세팅 ${value.length + 1}`,
          cycle: cycle.map((entry) => entry.skillName),
          itemLevel: character.level,
          attackPower:
            sharedCombatSnapshot?.finalAttackPowerSnapshot.total.toFixed(2) ??
            "0",
          savedAt: new Date().toLocaleString("ko-KR"),
        },
      ];
      localStorage.setItem(SAVED_SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <main className="shell simulator-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">G</span>
          <div>
            <strong>GLAVIER</strong>
            <small>DPS SIMULATOR</small>
          </div>
        </div>
        <nav className="main-menu">
          {[
            ["simulation", "시뮬레이션"],
            ["comparison", "세팅 비교"],
            ["api", "API 설정"],
          ].map(([id, label]) => (
            <button
              type="button"
              className={menu === id ? "active" : ""}
              onClick={() => setMenu(id as MainMenu)}
              key={id}
            >
              {label}
            </button>
          ))}
          <div className="header-character-search">
            <form onSubmit={search}>
              <input
                aria-label="캐릭터명"
                value={characterName}
                onChange={(event) => setCharacterName(event.target.value)}
                placeholder="캐릭터명 입력"
                maxLength={24}
              />
              <button type="submit" disabled={searching}>
                {searching ? "조회 중" : "검색"}
              </button>
            </form>
          </div>
        </nav>
      </header>
      {menu === "api" ? (
        <section className="workspace api-workspace">
          <div className="workspace-title">
            <span>03</span>
            <div>
              <h1>API 설정</h1>
              <p>
                선택하면 API 키를 현재 브라우저의 localStorage에 저장해 다음
                접속에도 사용합니다.
              </p>
            </div>
          </div>
          <label className="api-field">
            Lost Ark API Key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => updateApiKey(event.target.value)}
              placeholder="API 키 또는 bearer API 키"
              autoComplete="off"
            />
          </label>
          <div className="api-storage-controls">
            <label>
              <input
                type="checkbox"
                checked={rememberApiKey}
                onChange={(event) => toggleApiKeyRemember(event.target.checked)}
              />{" "}
              이 브라우저에 API 키 저장
            </label>
            {hasSavedApiKey ? (
              <>
                <span>
                  저장됨 ·{" "}
                  {apiKey.length > 8
                    ? `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`
                    : "••••••••"}
                </span>
                <button type="button" onClick={removeSavedApiKey}>
                  저장된 키 삭제
                </button>
              </>
            ) : (
              <span>저장하지 않음</span>
            )}
          </div>
          <p className="api-storage-note">
            공용 PC에서는 저장하지 마세요. 키는 이 브라우저에서만 사용됩니다.
          </p>
          <a
            className="guide-link"
            href="https://developer-lostark.game.onstove.com/"
            target="_blank"
            rel="noreferrer"
          >
            로스트아크 Open API 키 발급 가이드 ↗
          </a>
        </section>
      ) : null}
      {menu === "comparison" ? (
        <section className="workspace">
          <div className="workspace-title">
            <span>02</span>
            <div>
              <h1>세팅 비교</h1>
              <p>
                시뮬레이션에서 저장한 세팅의 전투 사이클과 계산 결과를
                비교합니다.
              </p>
            </div>
          </div>
          {savedSettings.length ? (
            <div className="setting-compare">
              {savedSettings.map((setting) => (
                <article key={setting.id}>
                  <strong>{setting.name}</strong>
                  <p>
                    아이템 레벨 {setting.itemLevel} · 공격력{" "}
                    {setting.attackPower}
                  </p>
                  <small>
                    {setting.cycle.length
                      ? setting.cycle.join(" → ")
                      : "전투 사이클 미설정"}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-copy">저장된 세팅이 없습니다.</p>
          )}
        </section>
      ) : null}
      {menu === "simulation" ? (
        <>
          {character ? (
            <section className="workspace simulation-workspace">
              <div className="profile-strip">
                <Artwork icon={character.characterImage} label="⚔" />
                <div className="profile-identity">
                  <span>
                    {character.server} · {character.className}
                  </span>
                  <h1>{character.name}</h1>
                </div>
                <div
                  className="profile-combat-summary"
                  aria-label="현재 계산 스냅샷 요약"
                >
                  <div className="profile-build">
                    <span>직업 · 코어</span>
                    <strong>
                      {classEngraving ?? character.className}
                      {arkGridShorthand ? ` ${arkGridShorthand}` : " · 미구성"}
                    </strong>
                  </div>
                  <div className="profile-dps">
                    <span>예상 DPS</span>
                    <strong>
                      {expectedDps === null
                        ? "계산 준비 중"
                        : Math.floor(expectedDps).toLocaleString()}
                    </strong>
                  </div>
                  <div className="profile-attributes">
                    {(["특화", "신속", "치명", "제압"] as const).map(
                      (name) => (
                        <span key={name}>
                          {name}{" "}
                          <b>
                            {sharedCombatSnapshot!.combatAttributes[
                              name
                            ].internalTotal.toLocaleString()}
                          </b>
                        </span>
                      ),
                    )}
                  </div>
                  <div>
                    <span>최종 공격력</span>
                    <strong>
                      {Math.floor(
                        sharedCombatSnapshot!.finalAttackPower,
                      ).toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span>기본 치적</span>
                    <strong>
                      {ceilPercentToTwoDecimals(
                        sharedCombatSnapshot!.criticalRateSnapshot.total * 100
                      ).toFixed(2)}
                      %
                    </strong>
                  </div>
                  <div>
                    <span>공속 / 이속</span>
                    <strong>
                      {sharedCombatSnapshot!.attackSpeedPercent.toFixed(2)}% /{" "}
                      {sharedCombatSnapshot!.moveSpeedPercent.toFixed(2)}%
                    </strong>
                  </div>
                  <div>
                    <span>쿨타임 감소</span>
                    <strong>{commonCooldownReductionPercent.toFixed(2)}%</strong>
                  </div>
                  <div className="profile-api-combat-power">
                    <span>전투력 · API</span>
                    <strong>{formatApiCombatPower(character.apiCombatPower)}</strong>
                  </div>
                </div>
                <div className="profile-actions">
                  <strong>아이템 레벨 {character.level}</strong>
                  <button type="button" onClick={saveSetting}>
                    현재 세팅 저장
                  </button>
                </div>
              </div>
              <aside className="floating-doping-panel">
                <strong>도핑</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={supportRageBuff}
                    onChange={(event) =>
                      setSupportRageBuff(event.target.checked)
                    }
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="공이속 9% · 진화형 피해 14%"
                  >
                    <Artwork
                      icon="https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_evolution/ark_passive_evolution_33.png"
                      label="정"
                    />
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={banquetBuff}
                    onChange={(event) => setBanquetBuff(event.target.checked)}
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="공이속 5% · 무기 공격력 +1600"
                  >
                    <Artwork icon={pcBuffIcon.src} label="만" />
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={blessingFood}
                    onChange={(event) => setBlessingFood(event.target.checked)}
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="공속 3%"
                  >
                    <Artwork icon={blessingBuffIcon.src} label="축" />
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={wineFood}
                    onChange={(event) => setWineFood(event.target.checked)}
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="이속 3%"
                  >
                    <Artwork icon={wineBuffIcon.src} label="와" />
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={azenaBuff}
                    onChange={(event) => setAzenaBuff(event.target.checked)}
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="힘/민/지 +6000"
                  >
                    <Artwork icon={azenaBuffIcon.src} label="아" />
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={vulnerableAttribute}
                    onChange={(event) =>
                      setVulnerableAttribute(event.target.checked)
                    }
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="피해 10% 증가"
                  >
                    <Artwork icon={vulnerableAttributeBuffIcon.src} label="취" />
                  </span>
                </label>
              </aside>
              <aside className="floating-cycle-ratio-panel">
                <strong>전투 사이클 스킬</strong>
                <div className="cycle-ratio-global-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={allCycleBackAttack}
                      onChange={(event) =>
                        setAllCycleBackAttack(event.target.checked)
                      }
                    />
                    <span className="cycle-global-label">
                      백어택 전체
                    </span>
                    <input
                      aria-label="전체 백어택 비율"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={allCycleBackAttackRate}
                      onChange={(event) =>
                        setAllCycleBackAttackRate(event.target.value)
                      }
                    />
                    <span className="cycle-global-percent">%</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={allCycleCooldown}
                      onChange={(event) =>
                        setAllCycleCooldown(event.target.checked)
                      }
                    />
                    <span className="cycle-global-label">
                      쿨타임 전체
                    </span>
                    <input
                      aria-label="전체 쿨타임 비율"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={allCycleCooldownRate}
                      onChange={(event) =>
                        setAllCycleCooldownRate(event.target.value)
                      }
                    />
                    <span className="cycle-global-percent">%</span>
                  </label>
                </div>
                <div className="cycle-ratio-header">
                  <span>스킬</span>
                  <span>백어택 비율</span>
                  <span>쿨타임 비율</span>
                </div>
                {cycleSkillCards.length ? (
                  <div className="cycle-ratio-list">
                    {cycleSkillCards.map((skill) => {
                      const ratios = cycleSkillRatioSettings[skill.name] ?? {
                        backAttackRate: "0",
                        cooldownRate: "0",
                      };
                      return (
                        <div className="cycle-ratio-row" key={skill.id}>
                          <div className="cycle-ratio-skill">
                            <Artwork
                              icon={skill.icon}
                              label={skill.name.slice(0, 1)}
                              title={skill.name}
                            />
                            <span>{skill.name}</span>
                          </div>
                          <input
                            aria-label={`${skill.name} 백어택 비율`}
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={
                              allCycleBackAttack
                                ? allCycleBackAttackRate
                                : ratios.backAttackRate
                            }
                            disabled={allCycleBackAttack}
                            onChange={(event) =>
                              updateCycleSkillRatio(
                                skill.name,
                                "backAttackRate",
                                event.target.value,
                              )
                            }
                          />
                          <input
                            aria-label={`${skill.name} 쿨타임 비율`}
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={
                              allCycleCooldown
                                ? allCycleCooldownRate
                                : ratios.cooldownRate
                            }
                            disabled={allCycleCooldown}
                            onChange={(event) =>
                              updateCycleSkillRatio(
                                skill.name,
                                "cooldownRate",
                                event.target.value,
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <span className="cycle-ratio-empty">
                    전투 사이클에 스킬을 추가해주세요.
                  </span>
                )}
              </aside>
              <InternalGearSnapshotDebug
                snapshot={sharedCombatSnapshot!}
                cycleDamageRows={cycleDamageRows}
                onExportJson={exportDebugJson}
              />
              <nav className="sim-tabs" aria-label="시뮬레이션 탭">
                {simTabs.map((item) => (
                  <button
                    type="button"
                    className={tab === item ? "active" : ""}
                    onClick={() => setTab(item)}
                    key={item}
                  >
                    {item}
                  </button>
                ))}
              </nav>
              <div className="sim-content">
                {tab === "기본 장비" ? (
                  <div className="equipment-left-stack">
                    <div className="equipment-layout">
                      <div className="equipment-column">
                        <section className="equipment-section">
                          <div className="equipment-section-heading">
                            <h2>전투 장비</h2>
                            <GearBulkControl
                              onChange={updateAllGearEnhancement}
                            />
                          </div>
                          <div className="equipment-edit-grid">
                            {gear.map((item) => (
                              <GearEditor
                                item={item}
                                onChange={(patch) =>
                                  updateEquipment(item.id, patch)
                                }
                                key={item.id}
                              />
                            ))}
                          </div>
                        </section>
                      </div>
                      <div className="equipment-column">
                        <section className="equipment-section">
                          <h2>악세사리</h2>
                          <div className="accessory-edit-grid">
                            {accessories.map((item) => (
                              <AccessoryEditor
                                item={item}
                                onChange={(patch) =>
                                  updateEquipment(item.id, patch)
                                }
                                key={item.id}
                              />
                            ))}
                          </div>
                        </section>
                        <section className="equipment-section">
                          <h2>팔찌</h2>
                          <BraceletEditor
                            item={bracelet}
                            primaryStat={primaryStat}
                            onChange={(patch) =>
                              bracelet && updateEquipment(bracelet.id, patch)
                            }
                          />
                        </section>
                      </div>
                    </div>
                    <EngravingSection
                      engravings={character.engravingDetails}
                      stoneIcon={stone?.icon ?? null}
                      stoneEffects={stoneEffects}
                      engravingNames={engravingNames}
                      onChange={updateEngraving}
                      onStoneChange={(index, patch) =>
                        setStoneEffects((current) =>
                          current.map((effect, effectIndex) =>
                            effectIndex === index
                              ? { ...effect, ...patch }
                              : effect,
                          ),
                        )
                      }
                    />
                  </div>
                ) : null}
                {tab === "기본 장비" ? (
                  <div className="ark-board equipment-ark-grid">
                    <section>
                      <div className="section-heading">
                        <div>
                          <h2>아크패시브</h2>
                        </div>
                      </div>
                      <div className="ark-points">
                        {character.arkPassive.points.map((point) => (
                          <div key={point.name}>
                            <span>{point.name}</span>
                            <strong>
                              {point.rank !== null && point.level !== null
                                ? `${point.rank}랭크 ${point.level}레벨`
                                : point.value}
                            </strong>
                          </div>
                        ))}
                      </div>
                      <div className="ark-columns">
                        <div className="evolution-tier-stack">
                          <EvolutionTierOneEditor
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                          <EvolutionTierEditor
                            tier="T2"
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                          <EvolutionTierEditor
                            tier="T3"
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                          <EvolutionTierEditor
                            tier="T4"
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                          <EvolutionTierEditor
                            tier="T5"
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                        </div>
                        <PassiveEditor
                          title="깨달음"
                          group="enlightenment"
                          effects={character.arkPassive.enlightenment}
                          onChange={(index, patch) =>
                            updatePassive("enlightenment", index, patch)
                          }
                        />
                        <PassiveEditor
                          title="도약"
                          group="leap"
                          effects={character.arkPassive.leap}
                          onChange={(index, patch) =>
                            updatePassive("leap", index, patch)
                          }
                        />
                      </div>
                      <section className="equipment-section avatar-section">
                        <h2>아바타</h2>
                        <div className="avatar-select-list">
                          {avatarSlots.map((slot) => (
                            <label key={slot}>
                              <span>{slot}</span>
                              <select
                                aria-label={`${slot} 아바타 등급`}
                                value={avatarGrades[slot] ?? "없음"}
                                onChange={(event) =>
                                  setAvatarGrades((current) => ({
                                    ...current,
                                    [slot]: event.target.value,
                                  }))
                                }
                              >
                                {["없음", "영웅", "전설"].map((grade) => (
                                  <option value={grade} key={grade}>
                                    {grade}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      </section>
                    </section>
                    <section>
                      <div className="section-heading">
                        <div>
                          <h2>아크그리드</h2>
                        </div>
                      </div>
                      {character.arkGrid.cores.length ? (
                        <div className="core-grid">
                          {character.arkGrid.cores.map((core, index) => {
                            const normalizedName = core.name
                              .replace(
                                /^(?:질서|혼돈)의?\s*(?:해|달|별)\s*코어\s*:\s*/,
                                "",
                              )
                              .trim();
                            const options = [
                              ...new Set([
                                ...(gridCoreOptions[index] ?? []),
                                normalizedName,
                              ]),
                            ].filter((option) => option !== "없음");
                            return (
                              <article key={core.id}>
                                <Artwork
                                  icon={core.icon}
                                  label={index < 3 ? "秩" : "混"}
                                />
                                <select
                                  value={
                                    options.includes(normalizedName)
                                      ? normalizedName
                                      : (options[0] ?? "")
                                  }
                                  onChange={(event) =>
                                    updateCore(index, {
                                      name: event.target.value,
                                    })
                                  }
                                >
                                  {options.map((option) => (
                                    <option key={option}>{option}</option>
                                  ))}
                                </select>
                                <select
                                  value={core.grade ?? "고대"}
                                  onChange={(event) =>
                                    updateCore(index, {
                                      grade: event.target.value,
                                    })
                                  }
                                >
                                  <option value="고대">고대 코어</option>
                                  <option value="유물">유물 코어</option>
                                </select>
                                <select
                                  value={core.point ?? 20}
                                  onChange={(event) => {
                                    const point = Number(event.target.value);
                                    updateCore(index, {
                                      point,
                                      level: coreLevel(point),
                                    });
                                  }}
                                >
                                  {gridPoints.map((point) => (
                                    <option value={point} key={point}>
                                      {point}P
                                    </option>
                                  ))}
                                </select>
                                <b>
                                  Lv.
                                  {core.level ?? coreLevel(core.point) ?? "-"}
                                </b>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="empty-copy">
                          이 캐릭터의 공식 API 응답에 활성 코어 Slots가
                          없습니다.
                        </p>
                      )}
                      <EffectList
                        effects={character.arkGrid.effects}
                        onChange={(id, level) =>
                          setCharacter((current) =>
                            current
                              ? {
                                  ...current,
                                  arkGrid: {
                                    ...current.arkGrid,
                                    effects: current.arkGrid.effects.map(
                                      (effect) =>
                                        effect.id === id
                                          ? { ...effect, level }
                                          : effect,
                                    ),
                                  },
                                }
                              : current,
                          )
                        }
                      />
                    </section>
                  </div>
                ) : null}
                {tab === "스킬 & 전투 사이클" ? (
                  <div className="skills-cycle">
                    <section className="skill-list-section">
                      <div className="section-heading">
                        <div>
                          <h2>스킬</h2>
                        </div>
                        <div className="skill-header-actions">
                          {addableSkills.length ? (
                            <div className="skill-add">
                              <select
                                value={skillToAdd}
                                onChange={(event) =>
                                  setSkillToAdd(event.target.value)
                                }
                              >
                                <option value="">추가할 스킬 선택</option>
                                {addableSkills.map((skill) => (
                                  <option value={skill.id} key={skill.id}>
                                    {skill.name}
                                  </option>
                                ))}
                              </select>
                              <button type="button" onClick={addSkillToList}>
                                스킬 추가
                              </button>
                            </div>
                          ) : null}
                          <div className="skill-bulk-controls">
                            <strong>일괄 변경</strong>
                            {[10, 9, 8, 7].map((level) => (
                              <button
                                type="button"
                                onClick={() => updateAllGemLevels(level)}
                                key={level}
                              >
                                {level}겁작
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="skills-list">
                        {visibleSkills.map((skill) => (
                          <SkillEditorV2
                            skill={skill}
                            gems={gems.filter(
                              (gem) => gem.skill === skill.name,
                            )}
                            calculation={
                              unifiedSimulation?.skills[skill.id]?.calculation
                            }
                            cooldown={
                              unifiedSimulation?.skills[skill.id]?.cooldown
                            }
                            onChange={(patch) => updateSkill(skill.id, patch)}
                            onGemChange={updateGem}
                            onRemoveGem={(id) => {
                              setGems((current) =>
                                current.filter((gem) => gem.id !== id),
                              );
                            }}
                            onAddGem={(type) => addGem(skill.name, type)}
                            key={skill.id}
                          />
                        ))}
                      </div>
                    </section>
                    <section className="cycle-builder">
                      <div className="section-heading">
                        <div>
                          <h2>전투 사이클 구성 ({cycle.length}개)</h2>
                          <p>
                            스킬을 추가한 뒤 위·아래로 이동해 사용 순서를
                            만드세요.
                          </p>
                        </div>
                      </div>
                      <div className="cycle-add">
                        <div className="cycle-selection-controls">
                          <select
                            aria-label="기본 사이클 선택"
                            value={cyclePresetId}
                            onChange={(event) => {
                              manualCycleEditRef.current = true;
                              const preset = cyclePresets.find(
                                (candidate) => candidate.id === event.target.value,
                              );
                              setCyclePresetId(event.target.value);
                              if (!preset) return;
                              const available = new Map(
                                character?.skills.map((skill) => [
                                  skill.name,
                                  skill.id,
                                ]),
                              );
                              setVisibleSkillIds((current) => [
                                ...current,
                                ...preset.entries
                                  .map((entry) => available.get(entry.skillName))
                                  .filter(
                                    (skillId): skillId is string =>
                                      skillId !== undefined &&
                                      !current.includes(skillId),
                                  ),
                              ]);
                              setCycle(
                                preset.entries
                                  .filter((entry) =>
                                    available.has(entry.skillName),
                                  )
                                  .map((entry) => ({
                                    ...entry,
                                    id: crypto.randomUUID(),
                                  })),
                              );
                            }}
                          >
                            <option value="">기본 사이클 불러오기</option>
                            {cyclePresets.map((preset) => (
                              <option value={preset.id} key={preset.id}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={cycleSkill}
                            onChange={(event) => {
                              const selectedSkill = event.target.value;
                              setCycleSkill("");
                              if (!selectedSkill) return;
                              manualCycleEditRef.current = true;
                              setCycle((value) => [
                                ...value,
                                {
                                  id: crypto.randomUUID(),
                                  skillName: selectedSkill,
                                  azureDragon: false,
                                  yeongaSimGong: false,
                                },
                              ]);
                            }}
                          >
                            <option value="">스킬 선택</option>
                            {cycleSkills.map((skill) => (
                              <option value={skill.name} key={skill.id}>
                                {skill.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="cycle-duration-controls">
                          <label className="cycle-duration-option">
                            <input
                              type="checkbox"
                              checked={cycleDurationMode === "guideline"}
                              disabled={guidelineCycleSeconds === null}
                              onChange={() => setCycleDurationMode("guideline")}
                            />
                            <span>예상 사이클 시간</span>
                            <strong>
                              {guidelineCycleSeconds === null
                                ? "내부 지침 미등록"
                                : `${guidelineCycleSeconds.toFixed(2)}초`}
                            </strong>
                          </label>
                          <label className="cycle-duration-option">
                            <input
                              type="checkbox"
                              checked={cycleDurationMode === "manual"}
                              onChange={() => setCycleDurationMode("manual")}
                            />
                            <span>선택 사이클 시간</span>
                            <input
                              aria-label="선택 사이클 시간(초)"
                              type="number"
                              min="0"
                              step="0.1"
                              placeholder="초 입력"
                              value={manualCycleSeconds}
                              disabled={cycleDurationMode !== "manual"}
                              onChange={(event) =>
                                setManualCycleSeconds(event.target.value)
                              }
                            />
                            <em>초</em>
                          </label>
                        </div>
                      </div>
                      {cycle.length ? (
                        <ol className="cycle-list">
                          {cycle.map((entry, index) => {
                            const { skillName } = entry;
                            const skill = visibleSkills.find(
                              (candidate) => candidate.name === skillName,
                            );

                            return (
                              <li
                                className="cycle-skill-tile"
                                key={entry.id}
                                draggable
                                onDragStart={() =>
                                  setDraggedCycleIndex(index)
                                }
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (
                                    draggedCycleIndex === null ||
                                    draggedCycleIndex === index
                                  ) {
                                    setDraggedCycleIndex(null);
                                    return;
                                  }
                                  manualCycleEditRef.current = true;
                                  setCycle((value) => {
                                    const next = [...value];
                                    const [moved] = next.splice(
                                      draggedCycleIndex,
                                      1,
                                    );
                                    next.splice(index, 0, moved);
                                    return next;
                                  });
                                  setDraggedCycleIndex(null);
                                }}
                                onDragEnd={() => setDraggedCycleIndex(null)}
                              >
                                <b className="cycle-skill-order">
                                  {index + 1}
                                </b>
                                <Artwork
                                  icon={skill?.icon ?? null}
                                  label={skillName.slice(0, 1)}
                                  title={skillName}
                                />
                                <span className="cycle-skill-name">
                                  {skillName}
                                </span>
                                <div className="cycle-skill-buffs">
                                  <button
                                    className={
                                      entry.azureDragon ? "active" : ""
                                    }
                                    type="button"
                                    title="청룡진 적용"
                                    aria-label={`${skillName} 청룡진 적용`}
                                    aria-pressed={entry.azureDragon}
                                    onClick={() =>
                                      (manualCycleEditRef.current = true,
                                      setCycle((value) =>
                                        value.map((candidate) =>
                                          candidate.id === entry.id
                                            ? {
                                                ...candidate,
                                                azureDragon:
                                                  !candidate.azureDragon,
                                              }
                                            : candidate,
                                        ),
                                      ))
                                    }
                                  >
                                    {azureDragonCycleIcon ? (
                                      <img src={azureDragonCycleIcon} alt="" />
                                    ) : (
                                      <span>청</span>
                                    )}
                                  </button>
                                  <button
                                    className={
                                      entry.yeongaSimGong ? "active" : ""
                                    }
                                    type="button"
                                    title="연가심공 적용"
                                    aria-label={`${skillName} 연가심공 적용`}
                                    aria-pressed={entry.yeongaSimGong}
                                    onClick={() =>
                                      (manualCycleEditRef.current = true,
                                      setCycle((value) =>
                                        value.map((candidate) =>
                                          candidate.id === entry.id
                                            ? {
                                                ...candidate,
                                                yeongaSimGong:
                                                  !candidate.yeongaSimGong,
                                              }
                                            : candidate,
                                        ),
                                      ))
                                    }
                                  >
                                    {yeongaSimGongCycleIcon ? (
                                      <img
                                        src={yeongaSimGongCycleIcon}
                                        alt=""
                                      />
                                    ) : (
                                      <span>연</span>
                                    )}
                                  </button>
                                </div>
                                <div className="cycle-skill-actions">
                                  <button
                                    type="button"
                                    aria-label={`${skillName} 한 칸 왼쪽 이동`}
                                    disabled={index === 0}
                                    onClick={() =>
                                      (manualCycleEditRef.current = true,
                                      setCycle((value) => {
                                        const next = [...value];
                                        [next[index - 1], next[index]] = [
                                          next[index],
                                          next[index - 1],
                                        ];
                                        return next;
                                      }))
                                    }
                                  >
                                    ←
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`${skillName} 한 칸 오른쪽 이동`}
                                    disabled={index === cycle.length - 1}
                                    onClick={() =>
                                      (manualCycleEditRef.current = true,
                                      setCycle((value) => {
                                        const next = [...value];
                                        [next[index], next[index + 1]] = [
                                          next[index + 1],
                                          next[index],
                                        ];
                                        return next;
                                      }))
                                    }
                                  >
                                    →
                                  </button>
                                </div>
                                <button
                                  className="cycle-skill-remove"
                                  type="button"
                                  aria-label={`${skillName} 삭제`}
                                  onClick={() =>
                                    (manualCycleEditRef.current = true,
                                    setCycle((value) =>
                                      value.filter(
                                        (candidate) => candidate.id !== entry.id,
                                      ),
                                    ))
                                  }
                                >
                                  ×
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      ) : (
                        <p className="empty-copy">
                          전투 사이클에 사용할 스킬을 추가하세요.
                        </p>
                      )}
                    </section>
                  </div>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="empty-start">
              <span>01</span>
              <h1>시뮬레이션 시작</h1>
              <p>
                API 설정 후 캐릭터명을 입력하면 장비, 아크 시스템, 스킬과 보석을
                모두 불러옵니다.
              </p>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
