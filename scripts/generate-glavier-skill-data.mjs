import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(root, "data/source/glavier-skill-sheets.json");
const equipmentOverridesPath = resolve(root, "data/source/equipment-overrides.json");
const outputPath = resolve(root, "src/data/generated/glavier-skill-data.ts");
const levels = Array.from({ length: 14 }, (_, index) => "Lv." + (index + 1));
const required = {
  "창술사 스킬 계수": ["스킬명", "스킬 코드", "스킬 유형", "기본 쿨타임(초)", "마나 사용", "백어택", "방향성", "홀딩/캐스팅", "슈퍼 차지 후보", "슈퍼 차지 조건", "집중", "난무", ...levels],
  "창술사 모션 배율": ["스킬명", ...levels],
  "창술사 트라이포드 효과": ["스킬명", "스킬 코드", "단계", "트라이포드", "계산 상태", "효과 유형", "수치", "정량 수치(초)", "적용 배율", "조건", "적용 대상", "인벤 설명", "출처"],
};
const text = (value) => value === undefined || value === null ? "" : String(value).trim();
const number = (value, label, optional = false) => {
  if (value === "" || value === undefined || value === null) {
    if (optional) return null;
    throw new Error(label + ": 값이 비어 있습니다.");
  }
  const result = Number(value);
  if (!Number.isFinite(result)) {
    if (optional) return null;
    throw new Error(label + ": 숫자가 아닙니다 (" + value + ").");
  }
  return result;
};
const bool = (value, label) => {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (["true", "예", "y"].includes(normalized)) return true;
  if (["false", "아니오", "n", ""].includes(normalized)) return false;
  throw new Error(label + ": 불리언 값이 아닙니다 (" + value + ").");
};
const levelValues = (row, name, suffix = "") => {
  const values = levels.map((level) => number(row[level], name + suffix + " " + level, true));
  if (values.every((value) => value !== null)) return values;
  if (["맹룡난무", "적룡필살", "연가비기"].includes(name) && values[0] !== null && values.slice(1).every((value) => value === null)) {
    return Array.from({ length: 14 }, () => values[0]);
  }
  throw new Error(name + suffix + ": Lv.1~Lv.14 값이 완전하지 않습니다.");
};
const snapshot = JSON.parse(await readFile(inputPath, "utf8"));
const equipmentOverrides = JSON.parse(await readFile(equipmentOverridesPath, "utf8"));
const sheets = Object.fromEntries((snapshot?.source?.sheets ?? []).map((sheet) => [sheet.title, sheet]));
for (const [title, columns] of Object.entries(required)) {
  const sheet = sheets[title];
  if (!sheet) throw new Error("필수 시트가 없습니다: " + title);
  const missing = columns.filter((column) => !sheet.headers.includes(column));
  if (missing.length) throw new Error(title + ": 필수 열 누락 - " + missing.join(", "));
}
const skills = new Map();
const codes = new Map();
for (const row of sheets["창술사 스킬 계수"].rows.filter((row) => text(row["스킬명"]))) {
  const name = text(row["스킬명"]);
  const code = text(row["스킬 코드"]);
  if (!name || !code) throw new Error("스킬명 또는 스킬 코드가 비어 있습니다.");
  let skill = skills.get(name);
  if (!skill) {
    if (codes.has(code)) throw new Error("중복 스킬 코드: " + code);
    skill = {
      name, code, operationType: text(row["스킬 유형"]),
      baseCooldownSeconds: number(row["기본 쿨타임(초)"], name + " 기본 쿨타임"),
      tags: {
        mana: bool(row["마나 사용"], name + " 마나 사용"), backAttack: bool(row["백어택"], name + " 백어택"),
        directional: bool(row["방향성"], name + " 방향성"), holdingOrCasting: bool(row["홀딩/캐스팅"], name + " 홀딩/캐스팅"),
        superChargeCandidate: bool(row["슈퍼 차지 후보"], name + " 슈퍼 차지 후보"), superChargeCondition: text(row["슈퍼 차지 조건"]) || null,
        focus: bool(row["집중"], name + " 집중"), flurry: bool(row["난무"], name + " 난무"),
      },
      damageCoefficientRows: [], motionMultiplier: null, tripods: [],
    };
    skills.set(name, skill);
    codes.set(code, name);
  }
  if (skill.code !== code) throw new Error("스킬명/코드 불일치: " + name + "/" + code);
  skill.damageCoefficientRows.push({
    sequence: text(row["피해값 순서"]) || "피해값 " + (skill.damageCoefficientRows.length + 1),
    values: levelValues(row, name),
  });
}
for (const row of sheets["창술사 모션 배율"].rows.filter((row) => text(row["스킬명"]))) {
  const name = text(row["스킬명"]);
  const skill = skills.get(name);
  if (!skill || skill.motionMultiplier) throw new Error("유효하지 않거나 중복된 모션 배율: " + name);
  skill.motionMultiplier = levelValues(row, name, " 모션");
}
for (const skill of skills.values()) if (!skill.motionMultiplier) throw new Error(skill.name + ": 모션 배율 행이 없습니다.");
for (const row of sheets["창술사 트라이포드 효과"].rows.filter((row) => text(row["스킬명"]) && text(row["트라이포드"]))) {
  const name = text(row["스킬명"]);
  const code = text(row["스킬 코드"]);
  const skill = skills.get(name);
  if (!skill || codes.get(code) !== name) throw new Error("알 수 없는 트라이포드 스킬/코드: " + name + "/" + code);
  const tier = number(row["단계"], name + " " + row["트라이포드"] + " 단계");
  if (![1, 2, 3].includes(tier)) throw new Error(name + " " + row["트라이포드"] + ": 단계는 1~3이어야 합니다.");
  skill.tripods.push({
    tier, name: text(row["트라이포드"]), status: text(row["계산 상태"]), effectType: text(row["효과 유형"]),
    percentValue: number(row["수치"], name + " " + row["트라이포드"] + " 수치", true),
    flatValue: number(row["정량 수치(초)"], name + " " + row["트라이포드"] + " 정량 수치", true),
    appliedMultiplier: number(row["적용 배율"], name + " " + row["트라이포드"] + " 적용 배율", true),
    condition: text(row["조건"]) || null, target: text(row["적용 대상"]) || null,
    description: text(row["인벤 설명"]) || null, sourceUrl: text(row["출처"]) || null,
  });
}
const catalog = [...skills.values()].map((skill) => ({ ...skill, tripods: skill.tripods.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "ko")) }));
const tripodNames = Object.fromEntries(catalog.map((skill) => [skill.name, [1, 2, 3].map((tier) => [...new Set(skill.tripods.filter((tripod) => tripod.tier === tier).map((tripod) => tripod.name))])]));
const tripodDetails = Object.fromEntries(catalog.map((skill) => {
  const seen = new Set();
  return [skill.name, skill.tripods.filter((tripod) => {
    const key = tripod.tier + ":" + tripod.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((tripod) => ({ tier: tripod.tier, name: tripod.name, description: tripod.description || tripod.name, modifiers: [] }))];
}));
const equipmentSheet = sheets["장비 "];
if (!equipmentSheet?.matrixRows) throw new Error("장비 시트의 다중 헤더 원본이 없습니다.");
const equipmentMatrix = equipmentSheet.matrixRows;
const equipmentSlots = [
  ["무기", 6], ["투구", 7], ["어깨", 8], ["상의", 9], ["하의", 10], ["장갑", 11],
];
let currentTier = "";
let currentCategory = "";
let currentName = "";
let currentGauntletGrade = "";
const internalGear = [];
for (const row of equipmentMatrix.slice(3)) {
  if (text(row[1])) currentTier = text(row[1]);
  if (text(row[2])) currentCategory = text(row[2]).replaceAll("\n", " ").replaceAll("\\n", " ").replaceAll(/\s+/g, " ").trim();
  if (text(row[3])) currentName = text(row[3]).replaceAll("\n", " ").replaceAll("\\n", " ").replaceAll(/\s+/g, " ").trim();
  const enhancement = Number(row[4]);
  const itemLevel = Number(row[5]);
  if (!Number.isFinite(enhancement) || !Number.isFinite(itemLevel) || currentTier === "장비 티어" || currentName === "장비 이름") continue;
  for (const [slot, column] of equipmentSlots) {
    const stat = number(row[column], slot + " " + itemLevel + " 스탯", true);
    const weaponAttack = slot === "무기" ? number(row[6], slot + " " + itemLevel + " 무기 공격력", true) : 0;
    if (stat === null && weaponAttack === null) continue;
    internalGear.push({
      slot, sourceName: currentName || null, tier: currentTier || null, category: currentCategory || null,
      itemLevel, enhancement, primaryStat: stat, weaponAttack, baseAttackFlat: 0, baseAttackRate: 0,
    });
  }
  const gauntletEnhancement = text(row[29]) === "" ? NaN : Number(row[29]);
  if (Number.isFinite(gauntletEnhancement)) {
    if (text(row[31])) currentGauntletGrade = text(row[31]);
    const gauntletStat = number(row[33], "완갑 +" + gauntletEnhancement + " 스탯", true);
    const gauntletWeaponAttack = number(row[32], "완갑 +" + gauntletEnhancement + " 무기 공격력", true);
    const gauntletBaseAttackFlat = number(row[34], "완갑 +" + gauntletEnhancement + " 기본 공격력", true);
    const gauntletBaseAttackRate = number(row[35], "완갑 +" + gauntletEnhancement + " 기본 공격력 증가율", true);
    if (gauntletStat !== null || gauntletWeaponAttack !== null || gauntletBaseAttackRate !== null) {
      internalGear.push({
        slot: "완갑", sourceName: currentGauntletGrade || null, tier: null, category: null,
        itemLevel: 0, enhancement: gauntletEnhancement,
        primaryStat: gauntletStat, weaponAttack: gauntletWeaponAttack ?? 0, baseAttackFlat: gauntletBaseAttackFlat ?? 0, baseAttackRate: gauntletBaseAttackRate ?? 0,
      });
    }
  }
}
if (!internalGear.length) throw new Error("장비 재련 데이터가 없습니다.");
for (const series of equipmentOverrides.series ?? []) {
  for (const row of series.rows ?? []) {
    const [enhancement, itemLevel, weapon, head, shoulder, top, bottom, gloves] = row;
    const values = { 무기: weapon, 투구: head, 어깨: shoulder, 상의: top, 하의: bottom, 장갑: gloves };
    for (const [slot, value] of Object.entries(values)) {
      internalGear.push({ slot, sourceName: series.name, tier: series.tier, category: series.category, itemLevel, enhancement, primaryStat: slot === "무기" ? null : value, weaponAttack: slot === "무기" ? value : 0, baseAttackFlat: 0, baseAttackRate: 0 });
    }
  }
}
const hash = createHash("sha256").update(JSON.stringify({ skills: catalog, internalGear })).digest("hex");
const version = "sheet-" + hash.slice(0, 12);
const output = "/* eslint-disable */\\n// Generated from data/source/glavier-skill-sheets.json. Do not edit directly.\\n\\n" +
  "export type GlavierTripodDetail = { tier: 1 | 2 | 3; name: string; description: string; modifiers: readonly string[] };\\n" +
  "export type GlavierTripodEffect = { tier: 1 | 2 | 3; name: string; status: string; effectType: string; percentValue: number | null; flatValue: number | null; appliedMultiplier: number | null; condition: string | null; target: string | null; description: string | null; sourceUrl: string | null };\\n" +
  "export type GlavierSkillData = { name: string; code: string; operationType: string; baseCooldownSeconds: number; tags: { mana: boolean; backAttack: boolean; directional: boolean; holdingOrCasting: boolean; superChargeCandidate: boolean; superChargeCondition: string | null; focus: boolean; flurry: boolean }; damageCoefficientRows: readonly { sequence: string; values: readonly number[] }[]; motionMultiplier: readonly number[]; tripods: readonly GlavierTripodEffect[] };\\n\\n" +
  "export const GLAVIER_SKILL_DATA_VERSION = " + JSON.stringify(version) + ";\\n" +
  "export const GLAVIER_SKILL_DATA_HASH = " + JSON.stringify(hash) + ";\\n" +
  "export const GLAVIER_SKILLS: readonly GlavierSkillData[] = " + JSON.stringify(catalog, null, 2) + ";\\n" +
  "export const GLAVIER_SKILL_BY_NAME: Readonly<Record<string, GlavierSkillData>> = Object.fromEntries(GLAVIER_SKILLS.map((skill) => [skill.name, skill]));\\n" +
  "export const GLAVIER_SKILL_TRIPODS: Record<string, readonly (readonly string[])[]> = " + JSON.stringify(tripodNames, null, 2) + ";\\n" +
  "export const GLAVIER_SKILL_TRIPOD_DETAILS: Record<string, readonly GlavierTripodDetail[]> = " + JSON.stringify(tripodDetails, null, 2) + ";\\n" +
  "export type InternalGearStatDefinition = { slot: string; sourceName: string | null; tier: string | null; category: string | null; itemLevel: number; enhancement: number; primaryStat: number | null; weaponAttack: number; baseAttackFlat?: number; baseAttackRate: number };\\n" +
  "export const INTERNAL_GEAR_STAT_CATALOG: readonly InternalGearStatDefinition[] = " + JSON.stringify(internalGear, null, 2) + ";\\n";
const generated = output.replaceAll("\\n", "\n");
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== generated) throw new Error("생성 데이터가 최신이 아닙니다. pnpm generate:glavier-data 를 실행하세요.");
  console.log("Generated data is current: " + version);
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated, "utf8");
  console.log("Generated " + outputPath + " (" + version + ")");
}
