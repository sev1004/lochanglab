import { INTERNAL_GEAR_STAT_CATALOG, type InternalGearStatDefinition } from "../../data/equipment-stat-catalog.ts";
import type { EquipmentProfile } from "../character/equipment-parser.ts";

const slots = ["투구", "어깨", "상의", "하의", "장갑", "무기", "완갑"] as const;
type InternalGearSlot = (typeof slots)[number];

const slotAliases: Record<string, InternalGearSlot> = {
  "투구": "투구", "머리": "투구", "헬멧": "투구",
  "어깨": "어깨", "상의": "상의", "하의": "하의", "장갑": "장갑",
  "무기": "무기", "완갑": "완갑", "건틀릿": "완갑",
};

const simulationSeries: Record<string, { tier: string; categories?: string[]; sourceNames: string[] }> = {
  "전율": { tier: "4T", categories: ["세르카", ""], sourceNames: ["전율", "운명의 전율"] },
  "결단": { tier: "4T", categories: ["케누아트 요새", ""], sourceNames: ["결단", "운명의 결단"] },
  // 기존 저장 데이터와의 호환. 다음 API 응답부터는 UI 값이 전율/결단으로 저장된다.
  "T4 전율": { tier: "4T", categories: ["세르카", ""], sourceNames: ["전율", "운명의 전율"] },
  "T4 결단": { tier: "4T", categories: ["케누아트 요새", ""], sourceNames: ["결단", "운명의 결단"] },
};
const esterWeaponAttackByEnhancement: Record<number, number> = {
  8: 214400,
  9: 242574,
  10: 259554,
};

const gauntletByEnhancement: Record<number, { primaryStat: number; weaponAttack: number; baseAttackFlat?: number; baseAttackRate: number }> = {
  0: { primaryStat: 10500, weaponAttack: 3500, baseAttackFlat: 0, baseAttackRate: 0 },
  1: { primaryStat: 10500, weaponAttack: 5350, baseAttackRate: 0 },
  2: { primaryStat: 10500, weaponAttack: 5350, baseAttackRate: 0 },
  3: { primaryStat: 10500, weaponAttack: 7210, baseAttackRate: 0 },
  4: { primaryStat: 10500, weaponAttack: 7210, baseAttackRate: 0 },
  5: { primaryStat: 850, weaponAttack: 7210, baseAttackRate: 0 },
  6: { primaryStat: 850, weaponAttack: 9077, baseAttackRate: 0 },
  7: { primaryStat: 850, weaponAttack: 9077, baseAttackRate: 0 },
  8: { primaryStat: 850, weaponAttack: 10969, baseAttackRate: 0 },
  9: { primaryStat: 850, weaponAttack: 10969, baseAttackRate: 0 },
  10: { primaryStat: 2030, weaponAttack: 10969, baseAttackRate: 0.01 },
  11: { primaryStat: 2030, weaponAttack: 12873, baseAttackRate: 0.01 },
  12: { primaryStat: 2030, weaponAttack: 12873, baseAttackRate: 0.01 },
  13: { primaryStat: 2030, weaponAttack: 14817, baseAttackRate: 0.01 },
  14: { primaryStat: 2030, weaponAttack: 14817, baseAttackRate: 0.01 },
  15: { primaryStat: 3690, weaponAttack: 14817, baseAttackRate: 0.02 },
  16: { primaryStat: 3690, weaponAttack: 16778, baseAttackRate: 0.02 },
  17: { primaryStat: 3690, weaponAttack: 16778, baseAttackRate: 0.02 },
  18: { primaryStat: 3690, weaponAttack: 18794, baseAttackRate: 0.02 },
  19: { primaryStat: 3690, weaponAttack: 18794, baseAttackRate: 0.02 },
  20: { primaryStat: 5980, weaponAttack: 18794, baseAttackRate: 0.03 },
  21: { primaryStat: 5980, weaponAttack: 20832, baseAttackRate: 0.03 },
  22: { primaryStat: 5980, weaponAttack: 20832, baseAttackRate: 0.03 },
  23: { primaryStat: 5980, weaponAttack: 22940, baseAttackRate: 0.03 },
  24: { primaryStat: 5980, weaponAttack: 22940, baseAttackRate: 0.03 },
  25: { primaryStat: 9050, weaponAttack: 22940, baseAttackRate: 0.03 },
};

export type InternalGearSnapshotRow = {
  slot: InternalGearSlot;
  itemName: string | null;
  grade: EquipmentProfile["simulationGrade"] | null;
  itemLevel: number | null;
  enhancement: number | null;
  status: "resolved" | "missing-item" | "unregistered";
  primaryStat: number | null;
  weaponAttack: number | null;
  baseAttackFlat: number | null;
  baseAttackRate: number | null;
};

export type InternalGearSnapshot = {
  rows: readonly InternalGearSnapshotRow[];
  primaryStat: number;
  weaponAttack: number;
  baseAttackFlat: number;
  baseAttackRate: number;
  unresolvedSlots: readonly InternalGearSlot[];
};

function itemLevelOf(item: EquipmentProfile) {
  const value = Number(item.itemLevel?.replaceAll(",", "") ?? "");
  return Number.isFinite(value) ? value : null;
}

function normalizeSlot(slot: string) {
  return slotAliases[slot.trim()] ?? null;
}

function definitionFor(item: EquipmentProfile, itemLevel: number | null, catalog: readonly InternalGearStatDefinition[]): InternalGearStatDefinition | null {
  const enhancement = item.enhancement ?? 0;
  const slot = normalizeSlot(item.slot);
  if (!slot) return null;
  if (slot === "무기" && item.simulationGrade === "참월 : 의") {
    const weaponAttack = esterWeaponAttackByEnhancement[enhancement];
    return weaponAttack === undefined
      ? null
      : {
          slot: "무기",
          sourceName: "참월 : 의",
          tier: null,
          category: null,
          itemLevel: itemLevel ?? 0,
          enhancement,
          primaryStat: null,
          weaponAttack,
          baseAttackFlat: 0,
          baseAttackRate: 0,
        };
  }
  const candidates = catalog.filter((definition) => normalizeSlot(definition.slot) === slot);
  const series = simulationSeries[item.simulationGrade];
  if (slot === "완갑") {
    const gauntletCandidates = candidates.filter((definition) => definition.enhancement === enhancement);
    return gauntletCandidates.find((definition) => definition.sourceName === item.simulationGrade)
      ?? (gauntletCandidates.length === 1 ? gauntletCandidates[0] : null);
  }
  const seriesCandidates = series
    ? candidates.filter((definition) => definition.tier === series.tier
      && (series.categories?.includes(definition.category ?? "") ?? true)
      && series.sourceNames.includes(definition.sourceName ?? "")
      && definition.enhancement === enhancement)
    : candidates;
  const tierCandidates = series
    ? candidates.filter((definition) => definition.tier === series.tier && definition.enhancement === enhancement)
    : candidates.filter((definition) => definition.enhancement === enhancement);
  const categoryCandidates = series
    ? tierCandidates.filter((definition) => series.categories?.includes(definition.category ?? "") ?? true)
    : tierCandidates;
  const exact = (itemLevel === null ? [] : seriesCandidates.filter((definition) => definition.itemLevel === itemLevel));
  const named = seriesCandidates.find((definition) => definition.sourceName && item.name.includes(definition.sourceName));
  if (named) return named;
  if (exact.length === 1) return exact[0];
  if (seriesCandidates.length === 1) return seriesCandidates[0];

  // 새 장비 표처럼 분류명/장비명이 비어 있거나 API 원본명이 다른 경우에도
  // 선택한 4T 계열과 재련 단계가 유일하면 그 행을 사용한다.
  if (!series && tierCandidates.length === 1) return tierCandidates[0];
  if (categoryCandidates.length === 1) return categoryCandidates[0];
  if (categoryCandidates.length && itemLevel !== null) {
    return categoryCandidates.reduce((closest, definition) =>
      Math.abs(definition.itemLevel - itemLevel) < Math.abs(closest.itemLevel - itemLevel) ? definition : closest,
    );
  }
  if (!series && tierCandidates.length && itemLevel !== null) {
    return tierCandidates.reduce((closest, definition) =>
      Math.abs(definition.itemLevel - itemLevel) < Math.abs(closest.itemLevel - itemLevel) ? definition : closest,
    );
  }

  // UI 강화값은 바뀌지만 API itemLevel은 검색 당시 값으로 유지될 수 있다.
  // 같은 계열/강화 단계에서 현재 itemLevel에 가장 가까운 행을 사용한다.
  const byEnhancement = candidates.filter((definition) => definition.enhancement === enhancement);
  if (!series && byEnhancement.length && itemLevel !== null) {
    return byEnhancement.reduce((closest, definition) =>
      Math.abs(definition.itemLevel - itemLevel) < Math.abs(closest.itemLevel - itemLevel) ? definition : closest,
    );
  }
  // 계열을 선택한 상태에서는 다른 계열(특히 전율)의 행으로 대체하지 않는다.
  // 데이터가 없으면 잘못된 수치 대신 미등록으로 표시해 계산 오염을 막는다.
  if (series) return null;
  return candidates.find((definition) => definition.sourceName && item.name.includes(definition.sourceName))
    ?? (candidates.length === 1 ? candidates[0] : null);
}

export function createInternalGearSnapshot(items: readonly EquipmentProfile[], catalog: readonly InternalGearStatDefinition[] = INTERNAL_GEAR_STAT_CATALOG): InternalGearSnapshot {
  const rows = slots.map((slot): InternalGearSnapshotRow => {
    const item = items.find((candidate) => normalizeSlot(candidate.slot) === slot);
    if (!item) {
      return { slot, itemName: null, grade: null, itemLevel: null, enhancement: null, status: "missing-item", primaryStat: null, weaponAttack: null, baseAttackFlat: null, baseAttackRate: null };
    }
    const itemLevel = itemLevelOf(item);
    const definition = definitionFor(item, itemLevel, catalog);
    if (!definition) {
      return { slot, itemName: item.name, grade: item.simulationGrade, itemLevel, enhancement: item.enhancement, status: "unregistered", primaryStat: null, weaponAttack: null, baseAttackFlat: null, baseAttackRate: null };
    }
    if (definition.enhancement !== (item.enhancement ?? 0)) {
      return { slot, itemName: item.name, grade: item.simulationGrade, itemLevel, enhancement: item.enhancement, status: "unregistered", primaryStat: null, weaponAttack: null, baseAttackFlat: null, baseAttackRate: null };
    }
    return {
      slot,
      itemName: item.name,
      grade: item.simulationGrade,
      itemLevel: definition.itemLevel || itemLevel,
      enhancement: item.enhancement,
      status: "resolved",
      // 무기 표의 주 수치 열은 무기 공격력이다. 무기는 힘/민/지 합산 대상이 아니다.
      primaryStat: slot === "무기" ? null : definition.primaryStat,
      weaponAttack: definition.weaponAttack,
      baseAttackFlat: definition.baseAttackFlat ?? 0,
      baseAttackRate: definition.baseAttackRate,
    };
  });
  const resolved = rows.filter((row) => row.status === "resolved");
  return {
    rows,
    primaryStat: resolved.reduce((total, row) => total + (row.primaryStat ?? 0), 0),
    weaponAttack: resolved.reduce((total, row) => total + (row.weaponAttack ?? 0), 0),
    baseAttackFlat: resolved.reduce((total, row) => total + (row.baseAttackFlat ?? 0), 0),
    baseAttackRate: resolved.reduce((total, row) => total + (row.baseAttackRate ?? 0), 0),
    unresolvedSlots: rows.filter((row) => row.status !== "resolved").map((row) => row.slot),
  };
}
