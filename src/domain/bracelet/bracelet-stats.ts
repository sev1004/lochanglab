import type { EquipmentProfile } from "../character/equipment-parser.ts";

/** Explicit baseStats (including zero) take precedence over legacy API options. */
export function readBraceletStats(item: Pick<EquipmentProfile, "baseStats" | "options"> | undefined): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const text of [...(item?.baseStats ?? []), ...(item?.options ?? [])]) {
    const match = text.trim().match(/^(치명|특화|신속|제압|인내|숙련|힘|민첩|지능|체력)\s*\+?\s*([\d,]+)$/);
    if (!match || stats[match[1]] !== undefined) continue;
    const value = Number(match[2].replaceAll(",", ""));
    if (Number.isFinite(value)) stats[match[1]] = value;
  }
  return stats;
}
