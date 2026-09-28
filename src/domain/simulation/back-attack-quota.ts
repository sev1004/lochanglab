import type { SimulationPlayerLevel } from "./combat-simulation.ts";

export type BackAttackCategory = "finisher" | "regular" | "red-dragon-cannon" | "half-moon" | "sadu";

export type BackAttackRange = { min: number; max: number };

const RANGES: Record<SimulationPlayerLevel, Record<BackAttackCategory, BackAttackRange>> = {
  100: { finisher: { min: 100, max: 100 }, regular: { min: 100, max: 100 }, "red-dragon-cannon": { min: 100, max: 100 }, "half-moon": { min: 100, max: 100 }, sadu: { min: 100, max: 100 } },
  90: { finisher: { min: 95, max: 100 }, regular: { min: 88, max: 100 }, "red-dragon-cannon": { min: 92, max: 100 }, "half-moon": { min: 87, max: 99 }, sadu: { min: 86, max: 100 } },
  85: { finisher: { min: 87, max: 95 }, regular: { min: 76, max: 88 }, "red-dragon-cannon": { min: 82, max: 90 }, "half-moon": { min: 75, max: 87 }, sadu: { min: 74, max: 88 } },
  80: { finisher: { min: 80, max: 89 }, regular: { min: 70, max: 80 }, "red-dragon-cannon": { min: 77, max: 85 }, "half-moon": { min: 69, max: 79 }, sadu: { min: 68, max: 80 } },
  70: { finisher: { min: 76, max: 82 }, regular: { min: 67, max: 75 }, "red-dragon-cannon": { min: 72, max: 78 }, "half-moon": { min: 66, max: 74 }, sadu: { min: 65, max: 75 } },
  60: { finisher: { min: 70, max: 78 }, regular: { min: 65, max: 70 }, "red-dragon-cannon": { min: 70, max: 75 }, "half-moon": { min: 64, max: 69 }, sadu: { min: 63, max: 70 } },
};

export type BackAttackQuota = {
  range: BackAttackRange;
  hitCount: number;
  successCount: number;
  rate: number | null;
  fallback: boolean;
};

export function backAttackRange(level: SimulationPlayerLevel, category: BackAttackCategory): BackAttackRange {
  return RANGES[level][category];
}

function integerCandidates(hitCount: number, range: BackAttackRange) {
  const min = Math.ceil(hitCount * range.min / 100);
  const max = Math.floor(hitCount * range.max / 100);
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);
}

export function chooseBackAttackSuccessCount(
  hitCount: number,
  range: BackAttackRange,
  random: () => number,
): { successCount: number; fallback: boolean } {
  if (!Number.isInteger(hitCount) || hitCount < 0) throw new Error("hitCount must be a non-negative integer");
  if (hitCount === 0) return { successCount: 0, fallback: false };
  const candidates = integerCandidates(hitCount, range);
  if (candidates.length > 0) return { successCount: candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))], fallback: false };
  const targetMin = hitCount * range.min / 100;
  const targetMax = hitCount * range.max / 100;
  const distances = Array.from({ length: hitCount + 1 }, (_, count) => ({ count, distance: count < targetMin ? targetMin - count : count > targetMax ? count - targetMax : 0 }));
  const minimum = Math.min(...distances.map((item) => item.distance));
  const nearest = distances.filter((item) => item.distance === minimum).map((item) => item.count);
  return { successCount: nearest[Math.min(nearest.length - 1, Math.floor(random() * nearest.length))], fallback: true };
}

export function resolveBackAttackQuota(
  level: SimulationPlayerLevel,
  category: BackAttackCategory,
  hitCount: number,
  random: () => number,
): BackAttackQuota {
  const range = backAttackRange(level, category);
  const chosen = chooseBackAttackSuccessCount(hitCount, range, random);
  return { range, hitCount, successCount: chosen.successCount, rate: hitCount === 0 ? null : chosen.successCount / hitCount, fallback: chosen.fallback };
}

export function chooseBackAttackIndices(hitCount: number, successCount: number, random: () => number): Set<number> {
  if (!Number.isInteger(hitCount) || !Number.isInteger(successCount) || successCount < 0 || successCount > hitCount) throw new Error("invalid back attack quota");
  const indices = Array.from({ length: hitCount }, (_, index) => index);
  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [indices[index], indices[swap]] = [indices[swap], indices[index]];
  }
  return new Set(indices.slice(0, successCount));
}

/** Allocate a quota across ordered hit events using a progressing RNG stream. */
export function allocateBackAttackQuotaToHits(
  hitCount: number,
  quota: BackAttackQuota,
  random: () => number,
): Set<number> {
  return chooseBackAttackIndices(hitCount, quota.successCount, random);
}
