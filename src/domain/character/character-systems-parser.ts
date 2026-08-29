import type { LostArkGem, LostArkGems, LostArkSkill } from "@/types/lostark-api";

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
  cores: ArkGridCoreProfile[];
  effects: ArkEffectProfile[];
  shorthand: string | null;
};

export type ArkGridCoreProfile = {
  id: string;
  name: string;
  grade: string | null;
  point: number | null;
  level: number | null;
  icon: string | null;
  description: string | null;
};

export type SkillProfile = {
  id: string;
  name: string;
  level: number;
  type: string;
  icon: string | null;
  tripods: Array<{ name: string; level: number | null }>;
  rune: string | null;
  gems: GemProfile[];
};

export type AvatarProfile = { id: string; slot: string; name: string; icon: string | null; grade: string | null };

export const GLAVIER_ORDER_CORE_OPTIONS = [
  ["적룡의 기운", "적룡연격", "연가 창식"],
  ["일점 집중", "집중 강화", "청룡기"],
  ["진화의 끝", "한 점 돌파", "맹룡 회도"],
] as const;

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

function tooltipLines(tooltip?: string) {
  if (!tooltip) return null;
  let value: unknown = tooltip;
  try {
    value = JSON.parse(tooltip) as unknown;
  } catch {
    return [plainText(tooltip)].filter((line): line is string => Boolean(line));
  }

  const strings: string[] = [];
  function collect(item: unknown) {
    if (typeof item === "string") strings.push(item);
    else if (Array.isArray(item)) item.forEach(collect);
    else if (item && typeof item === "object") Object.values(item as UnknownRecord).forEach(collect);
  }
  collect(value);
  return strings
    .flatMap((item) => item.split(/<br\s*\/?>/i))
    .map((item) => plainText(item))
    .filter((line): line is string => Boolean(line));
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

function nestedRecord(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = asRecord(record[key]);
    if (value) return value;
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

function normalizePassiveEffect(effect: ArkEffectProfile) {
  const match = effect.description?.match(/^(진화|깨달음|도약)\s*\d?티어\s+(.+?)(?:\s+Lv\.(\d+))?$/);
  if (!match) return effect;
  return {
    ...effect,
    name: match[2],
    level: match[3] ? Number(match[3]) : effect.level,
  };
}

function gemType(name: string) {
  return ["겁화", "작열", "멸화", "홍염"].find((type) => name.includes(type)) ?? "보석";
}

function gemTooltipInfo(tooltip?: string) {
  const lines = tooltipLines(tooltip);
  if (!lines?.length) return { skill: null, effect: null };
  const effect = lines.find((line) => /\[[^\]]+\].*(?:피해량?|재사용 대기시간|쿨타임).*?(?:증가|감소)/.test(line))
    ?? lines.find((line) => /(?:피해량?|재사용 대기시간|쿨타임).*?(?:증가|감소)/.test(line))
    ?? null;
  if (!effect) return { skill: null, effect: lines.join(" · ") };
  const match = effect.match(/(?:\[[^\]]+\]\s*)?(.+?)\s+(?:피해량?|재사용 대기시간|쿨타임)/);
  return { skill: match?.[1].trim() ?? null, effect };
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

export function mapSkills(skills: LostArkSkill[] | null | undefined, gems: GemProfile[]): SkillProfile[] {
  return (skills ?? []).map((skill, index) => ({
    id: `skill-${index}-${skill.Name ?? "unknown"}`,
    name: skill.Name ?? "이름 없는 스킬",
    level: skill.Level ?? 0,
    type: skill.Type ?? skill.SkillType ?? "일반",
    icon: skill.Icon ?? null,
    tripods: (skill.Tripods ?? []).filter((tripod) => tripod.IsSelected !== false).map((tripod) => ({ name: tripod.Name ?? "트라이포드", level: tripod.Level ?? null })),
    rune: skill.Rune?.Name ?? null,
    gems: gems.filter((gem) => gem.skill === skill.Name),
  }));
}

export function mapAvatars(value: unknown): AvatarProfile[] {
  const record = asRecord(value);
  const items = Array.isArray(value) ? value : asArray(record?.Avatars ?? record?.Items);
  return items.map((item, index): AvatarProfile | null => {
    const avatar = asRecord(item);
    const slot = avatar ? firstString(avatar, ["Type", "Slot"]) : null;
    if (!avatar || !slot) return null;
    return { id: `avatar-${index}-${slot}`, slot, name: firstString(avatar, ["Name"]) ?? "아바타", icon: firstString(avatar, ["Icon", "Image"]), grade: firstString(avatar, ["Grade"]) };
  }).filter((item): item is AvatarProfile => item !== null);
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

  const directEvolution = mapArkEffects(findEffectArray(record, ["EvolutionEffects", "Evolution"]), "evolution");
  const directEnlightenment = mapArkEffects(findEffectArray(record, ["EnlightenmentEffects", "Enlightenment"]), "enlightenment");
  const directLeap = mapArkEffects(findEffectArray(record, ["LeapEffects", "Leap"]), "leap");
  const commonEffects = mapArkEffects(findEffectArray(record, ["Effects", "ArkPassiveEffects"]), "effect");
  const commonByPath = (path: string) => commonEffects.filter((effect) => effect.name === path).map(normalizePassiveEffect);

  return {
    isActive: record.IsArkPassive === true || record.IsActive === true,
    points,
    evolution: directEvolution.length ? directEvolution : commonByPath("진화"),
    enlightenment: directEnlightenment.length ? directEnlightenment : commonByPath("깨달음"),
    leap: directLeap.length ? directLeap : commonByPath("도약"),
    effects: commonEffects.filter((effect) => !["진화", "깨달음", "도약"].includes(effect.name)),
  };
}

export function mapArkGrid(value: unknown): ArkGridProfile {
  if (Array.isArray(value)) return { cores: [], effects: mapArkEffects(value, "grid"), shorthand: null };
  const record = asRecord(value);
  if (!record) return { cores: [], effects: [], shorthand: null };
  const slots = findEffectArray(record, ["Slots", "Cores", "Nodes"]);
  const cores = slots.map((item, index): ArkGridCoreProfile | null => {
    const slot = asRecord(item);
    if (!slot) return null;
    const core = nestedRecord(slot, ["Core", "Data", "Item"]) ?? slot;
    const description = plainText(firstString(core, ["Description", "Tooltip", "Detail"]) ?? firstString(slot, ["Description", "Tooltip", "Detail"]));
    const name = firstString(core, ["Name", "CoreName", "Title"]) ?? firstString(slot, ["Name", "CoreName", "Title"]);
    const point = firstNumber(slot, ["Point", "Points", "TotalPoint", "Value"])
      ?? firstNumber(core, ["Point", "Points", "TotalPoint", "Value"])
      ?? Number(description?.match(/(\d+)\s*P/i)?.[1] ?? NaN);
    const normalizedPoint = Number.isFinite(point) ? point : null;
    const explicitLevel = firstNumber(slot, ["Level", "Rank", "Stage"])
      ?? firstNumber(core, ["Level", "Rank", "Stage"])
      ?? Number(description?.match(/Lv\.\s*(\d+)/i)?.[1] ?? NaN);
    const level = Number.isFinite(explicitLevel)
      ? explicitLevel
      : normalizedPoint === null ? null : normalizedPoint >= 20 ? 3 : normalizedPoint >= 17 ? 2 : normalizedPoint >= 14 ? 1 : 0;
    if (!name && normalizedPoint === null) return null;
    return {
      id: `core-${index}-${name ?? "unknown"}`,
      name: name ?? `${index < 3 ? "질서" : "혼돈"} 코어 ${index + 1}`,
      grade: firstString(core, ["Grade", "Rarity"]) ?? firstString(slot, ["Grade", "Rarity"]),
      point: normalizedPoint,
      level,
      icon: firstString(core, ["Icon", "Image"]) ?? firstString(slot, ["Icon", "Image"]),
      description,
    };
  }).filter((item): item is ArkGridCoreProfile => item !== null);
  const candidates = ["Effects", "ArkGridEffects", "Cores", "Nodes"];
  const effects = candidates
    .flatMap((key) => mapArkEffects(record[key], key.toLocaleLowerCase()))
    .filter((item, index, values) => values.findIndex((value) => value.name === item.name && value.level === item.level) === index);
  const orderNames = cores.length >= 3 ? cores.slice(0, 3).map((core) => core.name) : effects.slice(0, 3).map((effect) => effect.name);
  const optionIndexes = orderNames.map((name, index) => GLAVIER_ORDER_CORE_OPTIONS[index]?.findIndex((option) => option === name) ?? -1);
  const shorthand = optionIndexes.length === 3 && optionIndexes.every((optionIndex) => optionIndex >= 0)
    ? optionIndexes.map((optionIndex) => optionIndex + 1).join("")
    : null;
  return { cores, effects, shorthand };
}
