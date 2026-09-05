import catalog from "./ark-grid-order-core-catalog.json" with { type: "json" };

export type GlavierClassEngraving = "절정" | "절제";
export type ArkGridOrderCoreType = "해" | "달" | "별";

export type ArkGridOrderCoreDefinition = {
  name: string;
  classEngraving: GlavierClassEngraving;
  number: 1 | 2 | 3;
  type: ArkGridOrderCoreType;
};

export const ARK_GRID_ORDER_CORE_CATALOG =
  catalog.cores as ArkGridOrderCoreDefinition[];

export const ARK_GRID_ORDER_CORE_TYPES = ["해", "달", "별"] as const;

function normalizeCoreName(name: string) {
  return name.replace(/\s+/g, "");
}

export function findArkGridOrderCoreDefinition(name: string) {
  const normalized = normalizeCoreName(name);
  return (
    ARK_GRID_ORDER_CORE_CATALOG.find(
      (core) => normalizeCoreName(core.name) === normalized,
    ) ?? null
  );
}

export function arkGridOrderCoreOptions(type: ArkGridOrderCoreType) {
  return ARK_GRID_ORDER_CORE_CATALOG.filter((core) => core.type === type)
    .sort((left, right) => {
      const engravingOrder =
        Number(left.classEngraving === "절제") -
        Number(right.classEngraving === "절제");
      return engravingOrder || left.number - right.number;
    })
    .map((core) => core.name);
}

export function arkGridOrderCoreNumber(name: string) {
  return findArkGridOrderCoreDefinition(name)?.number ?? null;
}

export function arkGridOrderCoreMatchesEngraving(
  name: string,
  classEngraving?: GlavierClassEngraving | null,
) {
  if (!classEngraving) return true;
  return (
    findArkGridOrderCoreDefinition(name)?.classEngraving === classEngraving
  );
}
