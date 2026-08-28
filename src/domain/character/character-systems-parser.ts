import type { LostArkGem, LostArkGems } from "@/types/lostark-api";

type UnknownRecord = Record<string, unknown>;

export type GemProfile = {
  id: string;
  name: string;
  type: string;
  level: number | null;
  grade: string;
  icon: string | null;
  skill: string | null;
  effect: string | null;
};

export type ArkPointProfile = {
  name: string;
  value: string;
};

export type ArkEffectProfile = {
  id: string;
  name: string;
  level: number | null;
  grade: string | null;
  icon: string | null;
  description: string | null;
};

export type ArkPassiveProfile = {
  isActive: boolean;
  points: ArkPointProfile[];
  evolution: ArkEffectProfile[];
  enlightenment: ArkEffectProfile[];
  leap: ArkEffectProfile[];
  effects: ArkEffectProfile[];
};

export type ArkGridProfile = {
  effects: ArkEffectProfile[];
};

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function plainText(value: string | null) {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, " · ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function tooltipText(tooltip?: string) {
  if (!tooltip) return null;
  let value: unknown = tooltip;
  try {
    value = JSON.parse(tooltip) as unknown;
  } catch {
    return plainText(tooltip);
  }

  const strings: string[] = [];
  function collect(item: unknown) {
    if (typeof item === "string") strings.push(item);
    else if (Array.isArray(item)) item.forEach(collect);
    else if (item && typeof item === "object") Object.values(item as UnknownRecord).forEach(collect);
  }
  collect(value);
  return plainText(strings.join("<br>"));
}

function firstString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return null;
}

function firstNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function mapArkEffects(value: unknown, prefix: string) {
  return asArray(value)
    .map((item, index): ArkEffectProfile | null => {
      const record = asRecord(item);
      if (!record) return null;
      const name = firstString(record, ["Name", "EffectName", "Title"]);
      if (!name) return null;
      return {
        id: `${prefix}-${index}-${name}`,
        name,
        level: firstNumber(record, ["Level", "Rank", "Stage"]),
        grade: firstString(record, ["Grade", "Rarity"]),
        icon: firstString(record, ["Icon", "Image"]) ?? null,
        description: plainText(firstString(record, ["Description", "Tooltip", "Detail"])),
      };
    })
    .filter((item): item is ArkEffectProfile => item !== null);
}

function findEffectArray(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key];
  }
  return [];
}

function gemType(name: string) {
  return ["겁화", "작열", "멸화", "홍염"].find((type) => name.includes(type)) ?? "보석";
}

function gemTooltipInfo(tooltip?: string) {
  const text = tooltipText(tooltip);
  if (!text) return { skill: null, effect: null };
  const match = text.match(/(.+?)\s+(?:피해량|재사용 대기시간|쿨타임)(?:이|이)?\s*/);
  if (!match) return { skill: null, effect: text };
  return { skill: match[1].trim().split(" · ").at(-1) ?? null, effect: text };
}

export function mapGems(gems: LostArkGems | LostArkGem[] | null | undefined): GemProfile[] {
  const gemItems = Array.isArray(gems) ? gems : gems?.Gems ?? [];
  const effectItems = Array.isArray(gems) ? [] : gems?.Effects ?? [];
  return gemItems.map((gem, index) => {
    const info = gemTooltipInfo(gem.Tooltip);
    const effect = effectItems[index];
    const fallbackEffect = plainText(effect?.Description ?? effect?.Tooltip ?? null);
    const fallbackSkill = effect?.Name?.replace(/\s*(효과|보석)$/g, "") ?? null;
    return {
      id: `gem-${index}-${gem.Name ?? "unknown"}`,
      name: gem.Name ?? "이름 없는 보석",
      type: gemType(gem.Name ?? ""),
      level: gem.Level ?? null,
      grade: gem.Grade ?? "등급 미상",
      icon: gem.Icon ?? null,
      skill: info.skill ?? fallbackSkill,
      effect: info.effect ?? fallbackEffect,
    };
  });
}

export function mapArkPassive(value: unknown): ArkPassiveProfile {
  const record = asRecord(value);
  if (!record) return { isActive: false, points: [], evolution: [], enlightenment: [], leap: [], effects: [] };
  const points = findEffectArray(record, ["Points", "Point"])
    .map((item): ArkPointProfile | null => {
      const point = asRecord(item);
      const name = point ? firstString(point, ["Name", "Type"]) : null;
      if (!point || !name) return null;
      return { name, value: String(point.Value ?? point.Level ?? "-") };
    })
    .filter((item): item is ArkPointProfile => item !== null);

  return {
    isActive: record.IsArkPassive === true || record.IsActive === true,
    points,
    evolution: mapArkEffects(findEffectArray(record, ["EvolutionEffects", "Evolution"]), "evolution"),
    enlightenment: mapArkEffects(findEffectArray(record, ["EnlightenmentEffects", "Enlightenment"]), "enlightenment"),
    leap: mapArkEffects(findEffectArray(record, ["LeapEffects", "Leap"]), "leap"),
    effects: mapArkEffects(findEffectArray(record, ["Effects", "ArkPassiveEffects"]), "effect"),
  };
}

export function mapArkGrid(value: unknown): ArkGridProfile {
  if (Array.isArray(value)) return { effects: mapArkEffects(value, "grid") };
  const record = asRecord(value);
  if (!record) return { effects: [] };
  const candidates = ["Effects", "ArkGridEffects", "Cores", "Nodes"];
  const effects = candidates
    .flatMap((key) => mapArkEffects(record[key], key.toLocaleLowerCase()))
    .filter((item, index, values) => values.findIndex((value) => value.name === item.name && value.level === item.level) === index);
  return { effects };
}
