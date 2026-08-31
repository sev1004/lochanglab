import records from "./generated/ark-grid-common-core.json" with { type: "json" };

export type ArkGridCommonCoreRecord = {
  grade: string;
  area: string;
  coreName: string;
  supplyWill: number;
  point: number;
  effect: string | null;
  operation: string | null;
  value: number | null;
  originalEffect: string | null;
  source: string | null;
};

export const ARK_GRID_COMMON_CORE_DATA = records as ArkGridCommonCoreRecord[];

function normalizeGrade(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.includes("고대")) return "고대";
  if (value.includes("유물")) return "유물";
  if (value.includes("전설")) return "전설";
  return null;
}

function supplyWillOf(core: { grade?: string | null; description?: string | null; point?: number | null }) {
  const fromDescription = core.description?.match(/공급\s*의지력\s*(\d+)/)?.[1];
  return fromDescription ? Number(fromDescription) : null;
}

export function resolveArkGridCommonCoreEffects(core: {
  name: string;
  grade?: string | null;
  description?: string | null;
  point?: number | null;
}) {
  const grade = normalizeGrade(core.grade);
  const supply = supplyWillOf(core);
  return ARK_GRID_COMMON_CORE_DATA.filter((record) =>
    record.coreName === core.name &&
    (!grade || record.grade === grade) &&
    (!supply || record.supplyWill === supply) &&
    record.point <= (core.point ?? 0),
  );
}
