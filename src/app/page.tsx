"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { mapCharacterResponse, type CharacterProfile, type EngravingProfile } from "@/domain/character/character-mapper";
import type { EquipmentProfile } from "@/domain/character/equipment-parser";
import { GLAVIER_ORDER_CORE_OPTIONS, type ArkEffectProfile, type ArkGridCoreProfile, type GemProfile, type SkillProfile } from "@/domain/character/character-systems-parser";
import { loadLatestCharacter, saveCharacter } from "@/lib/character-storage";
import { fetchCharacter, LostArkApiError } from "@/lib/lostark-api/client";
import { ENGRAVING_NAMES, engravingIcon } from "@/data/engraving-catalog";
import { BRACELET_EFFECT_OPTIONS, BRACELET_PRIMARY_STAT_TYPES, BRACELET_STAT_TYPES } from "@/data/bracelet-options";
import { EVOLUTION_T1_MAX_OPTION_LEVEL, EVOLUTION_T1_MAX_TOTAL_LEVEL, EVOLUTION_T1_OPTIONS, EVOLUTION_T1_STAT_PER_LEVEL, EVOLUTION_TIER_CATALOG, EVOLUTION_TIER_RULES, type EvolutionT1OptionName, type EvolutionTier } from "@/data/ark-passive-evolution";
import { findBraceletOption, mergeBraceletOptionTexts } from "@/domain/bracelet/bracelet-catalog";
import { arkGridGemPercent } from "@/data/ark-grid-gem-values";

type MainMenu = "simulation" | "comparison" | "api";
type SimulationTab = "전체" | "기본 장비" | "스킬 & 전투 사이클";
type SavedSetting = { id: string; name: string; cycle: string[]; itemLevel: string; attackPower: string; savedAt: string };
type StoneEffect = { engraving: string; level: number };
type BraceletPrimaryStat = (typeof BRACELET_PRIMARY_STAT_TYPES)[number];
type BraceletStat = { type: (typeof BRACELET_STAT_TYPES)[number] | BraceletPrimaryStat; value: string };
type PassiveGroup = "evolution" | "enlightenment" | "leap";

const errors: Record<number, string> = { 401: "API 키가 올바르지 않습니다.", 403: "API 접근 권한이 없습니다.", 404: "캐릭터를 찾을 수 없습니다.", 429: "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요." };
const simTabs: SimulationTab[] = ["전체", "기본 장비", "스킬 & 전투 사이클"];
const SAVED_SETTINGS_KEY = "glavier-dps-simulator:saved-settings";
const gearGrades = ["T4 전율", "T4 업화", "T4 결단"] as const;
const armGauntletGrades = ["영웅", "전설", "유물", "고대"] as const;
const enhancementLevels = Array.from({ length: 16 }, (_, index) => 25 - index);
const gemLevels = Array.from({ length: 10 }, (_, index) => 10 - index);
const gemTypes = ["겁화", "작열", "멸화", "홍염"];
const avatarSlots = ["무기", "머리", "상의", "하의"] as const;
const accessoryOptions = ["없음", "추가 피해 +0.70%", "추가 피해 +1.60%", "추가 피해 +2.60%", "적에게 주는 피해 +0.55%", "적에게 주는 피해 +1.20%", "적에게 주는 피해 +2.00%", "무기 공격력 +0.80%", "무기 공격력 +1.80%", "무기 공격력 +3.00%", "공격력 +0.40%", "공격력 +0.95%", "공격력 +1.55%", "치명타 적중률 +0.40%", "치명타 적중률 +0.95%", "치명타 적중률 +1.55%", "치명타 피해 +1.10%", "치명타 피해 +2.40%", "치명타 피해 +4.00%", "무기 공격력 +195", "무기 공격력 +480", "무기 공격력 +960", "공격력 +80", "공격력 +195", "공격력 +390"];
const passiveCatalog: Record<PassiveGroup, string[]> = {
  evolution: ["없음", "치명", "특화", "신속", "한계 돌파", "최적화 훈련", "예리한 감각", "끝없는 마나", "무한한 마력", "음속 돌파", "뭉툭한 가시", "입식 타격가", "마나 용광로"],
  enlightenment: ["없음", "절정 I", "절정 II", "절정 III", "연가표식", "연가심공", "치명적인 베기", "강력한 찌르기", "전환 난무", "절제", "청룡진", "난무 강화", "집중 강화"],
  leap: ["없음", "초월적인 힘", "풀려난 힘", "즉각적인 주문", "잠재력 해방"],
};
const enlightenmentEffects: Record<string, { maxLevel: number; description: string }> = {
  "절정 I": { maxLevel: 3, description: "공격 속도·이동 속도 +5%/Lv" },
  "절정 II": { maxLevel: 3, description: "난무 스탠스 치명타 피해 +23.33%/Lv" },
  "절정 III": { maxLevel: 3, description: "집중 스탠스 적에게 주는 피해 +8.33%/Lv" },
  "연가표식": { maxLevel: 5, description: "연가 표식 대상이 받는 피해 +1.2%/Lv" },
  "연가심공": { maxLevel: 3, description: "다음 스킬 피해 +25%/Lv" },
  "치명적인 베기": { maxLevel: 5, description: "난무 스킬 치명타 피해 +4%/Lv" },
  "강력한 찌르기": { maxLevel: 5, description: "집중 스킬 적에게 주는 피해 +1.2%/Lv" },
  "전환 난무": { maxLevel: 5, description: "난무 스킬 피해 +0.7%/Lv · 치명타 적중률 +0.8%/Lv" },
};
const leapOptions = [
  { name: "풀려난 힘", maxLevel: 5, icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_02/ark_passive_02_2.png", description: "초각성 스킬 피해량 Lv당 3% 증가" },
  { name: "잠재력 해방", maxLevel: 5, icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_01/ark_passive_01_10.png", description: "초각성 스킬 재사용 대기시간 Lv당 2% 감소" },
  { name: "즉각적인 주문", maxLevel: 5, icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_02/ark_passive_02_5.png", description: "초각성 스킬 시전 시간 Lv당 4% 증가" },
  { name: "관통 필살", maxLevel: 3, icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_11.png", description: "해당 스킬 피해량 Lv2부터 10%씩 증가" },
  { name: "내지르기", maxLevel: 5, icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_12.png", description: "해당 스킬 피해량 Lv당 25% 증가" },
] as const;
const gridCoreOptions = [...GLAVIER_ORDER_CORE_OPTIONS.map((options) => ["없음", ...options]), ["없음", "현란한 공격", "안정적인 공격", "재빠른 공격", "신념의 강화", "흐르는 마나", "불굴의 강화"], ["없음", "불타는 일격", "흡수의 일격", "부수는 일격", "낙인의 흔적", "강철의 흔적", "치명적인 흔적"], ["없음", "공격", "무기", "구원", "생명", "속도", "방어"]];
const gridPoints = [20, 19, 18, 17, 14, 10];

function errorMessage(error: unknown) { if (error instanceof LostArkApiError) return errors[error.status] ?? `로스트아크 API 요청에 실패했습니다. (${error.status})`; return error instanceof TypeError ? "로스트아크 API에 연결하지 못했습니다. 네트워크와 브라우저 설정을 확인해주세요." : "캐릭터 조회에 실패했습니다."; }
function Artwork({ icon, label, title }: { icon: string | null; label: string; title?: string }) { return <span className="compact-art" aria-label={title} data-tooltip={title}>{icon ? <img src={icon} alt="" /> : label}</span>; }
function qualityTone(quality: number | null) { return quality === 100 ? "quality-gold" : quality !== null && quality >= 90 ? "quality-purple" : "quality-sky"; }
function baseStatValue(item: EquipmentProfile) { return item.baseStats[0]?.match(/[\d,]+/)?.[0]?.replaceAll(",", "") ?? ""; }
function primaryStatFromEquipment(items: EquipmentProfile[]): BraceletPrimaryStat {
  const glove = items.find((item) => item.slot === "장갑");
  const candidates = [...(glove?.baseStats ?? []), ...items.flatMap((item) => item.baseStats)];
  const stat = candidates.map((line) => line.match(/^(힘|민첩|지능)\s*\+?[\d,]+/)?.[1]).find(Boolean);
  return BRACELET_PRIMARY_STAT_TYPES.includes(stat as BraceletPrimaryStat) ? stat as BraceletPrimaryStat : "힘";
}
const ACCESSORY_EXCLUDED_OPTIONS: Record<string, string[]> = {
  "목걸이": ["무기 공격력", "공격력", "치명타 적중률", "치명타 피해"],
  "귀걸이": ["적에게 주는 피해", "추가 피해", "치명타 적중률", "치명타 피해"],
  "반지": ["적에게 주는 피해", "추가 피해", "무기 공격력", "공격력"],
};
function optionChoices(slot: string, current: string, catalog: string[]) {
  const excluded = ACCESSORY_EXCLUDED_OPTIONS[slot] ?? [];
  return [...new Set([current, ...catalog.filter((option) => !excluded.some((prefix) => option.startsWith(prefix) && option.includes("%")))])];
}

function GearEditor({ item, onChange }: { item: EquipmentProfile; onChange: (patch: Partial<EquipmentProfile>) => void }) {
  const isArmGauntlet = item.slot === "완갑";
  const grades = isArmGauntlet ? armGauntletGrades : gearGrades;
  return <article className="gear-editor">
    <div className={`quality-art${isArmGauntlet ? " no-quality" : ""}`}><Artwork icon={item.icon} label="◇" />{!isArmGauntlet ? <span className={qualityTone(item.quality)}>품질 {item.quality ?? "-"}</span> : null}</div>
    <div className={`gear-fields${isArmGauntlet ? " no-quality" : ""}`}>{!isArmGauntlet ? <small>{item.itemLevel ?? "-"}</small> : null}<select aria-label={`${item.slot} 장비 종류`} value={gearGrades.includes(item.simulationGrade as (typeof gearGrades)[number]) ? item.simulationGrade : "T4 전율"} onChange={(event) => onChange({ simulationGrade: event.target.value as EquipmentProfile["simulationGrade"] })}>{grades.map((grade) => <option key={grade}>{grade}</option>)}</select>{!isArmGauntlet ? <label>품질<input aria-label={`${item.slot} 품질`} type="number" min="0" max="100" value={item.quality ?? ""} onChange={(event) => onChange({ quality: event.target.value === "" ? null : Math.max(0, Math.min(100, Number(event.target.value))) })} /></label> : null}<select aria-label={`${item.slot} 강화`} value={item.enhancement ?? 10} onChange={(event) => onChange({ enhancement: Number(event.target.value) })}>{enhancementLevels.map((level) => <option value={level} key={level}>+{level}</option>)}</select></div>
  </article>;
}

function GearBulkControl({ onChange }: { onChange: (level: number) => void }) {
  return <label className="gear-bulk-control">일괄 변경<select aria-label="전투 장비 일괄 강화" defaultValue="" onChange={(event) => { if (event.target.value) { onChange(Number(event.target.value)); event.target.value = ""; } }}><option value="">강화 선택</option>{enhancementLevels.map((level) => <option value={level} key={level}>+{level}</option>)}</select></label>;
}

function parseBraceletStat(option: string, primaryStat: BraceletPrimaryStat): BraceletStat | null {
  const match = option.trim().match(/^(치명|신속|특화|제압|숙련|인내|체력|힘|민첩|지능|힘\/민\/지)\s*\+?\s*([\d,]+)$/);
  if (!match) return null;
  const type = match[1] === "힘/민/지" ? primaryStat : match[1];
  return { type: type as BraceletStat["type"], value: match[2].replaceAll(",", "") };
}

function normalizeBraceletEffect(option: string) {
  const catalogOption = findBraceletOption(option);
  if (catalogOption) return catalogOption.label;
  const compact = option.replaceAll(" ", "").replaceAll("\n", "");
  const values = [...compact.matchAll(/(\d+(?:\.\d+)?)%/g)].map((match) => match[1]);
  if (/^공격및이동속도가.*증가한다.$/.test(compact) && values.length) return `공이속 +${values[0]}%`;
  if (/치명타적중률이.*공격이치명타로적중시/.test(compact) && values.length >= 2) return `치적 +${values[0]}% | 치명타 주는 피해 +${values[1]}%`;
  if (/치명타피해가.*공격이치명타로적중시/.test(compact) && values.length >= 2) return `치피 +${values[0]}% | 치명타 주는 피해 +${values[1]}%`;
  if (/^적에게주는피해가.*증가한다.$/.test(compact) && values.length) return `적에게 주는 피해 +${values[0]}%`;
  if (/^추가피해가.*증가한다.$/.test(compact) && values.length) return `추가 피해 +${values[0]}%`;
  if (/^치명타적중률이.*증가한다.$/.test(compact) && values.length) return `치명타 적중률 +${values[0]}%`;
  if (/^치명타피해가.*증가한다.$/.test(compact) && values.length) return `치명타 피해 +${values[0]}%`;
  if (/적에게주는피해가.*무력화상태의적에게주는피해가/.test(compact) && values.length >= 2) return `적주피 +${values[0]}% | 무력화 적 피해량 +${values[1]}%`;
  if (/재사용대기시간이.*적에게주는피해가/.test(compact) && values.length >= 2) return `쿨 +${values[0]}% | 적에게 주는 피해 +${values[1]}%`;
  if (/추가피해가.*악마및대악마계열피해량이/.test(compact) && values.length >= 2) return `추피 +${values[0]}% | 악마&대악마 피해량 +${values[1]}%`;
  const hitStack = compact.match(/무기공격력이(\d+),?공격및이동속도가(\d+(?:\.\d+)?)%/);
  if (hitStack) return `공격 적중 시 무공 ${hitStack[1]}, 공이속 ${hitStack[2]}%`;
  const weaponAttackValues = [...compact.matchAll(/무기공격력이(\d+)증가/g)].map((match) => match[1]);
  if (/생명력이50%이상/.test(compact) && weaponAttackValues.length >= 2) return `무공 ${weaponAttackValues[0]} | 조건부 무공 ${weaponAttackValues[1]}`;
  if (/공격적중시30초마다/.test(compact) && weaponAttackValues.length >= 2) return `무공 ${weaponAttackValues[0]} | 스택당 무공 ${weaponAttackValues[1]}`;
  if (/백어택스킬이적에게주는피해가/.test(compact) && values.length) return `백어택 스킬 피해 +${values[0]}%`;
  if (/헤드어택스킬이적에게주는피해가/.test(compact) && values.length) return `헤드어택 스킬 피해 +${values[0]}%`;
  if (/방향성공격이아닌스킬이적에게주는피해가/.test(compact) && values.length) return `타대 스킬 피해 +${values[0]}%`;
  if (/대상의방어력을.*감소.*아군공격력강화효과가/.test(compact) && values.length >= 2) return `방깎 ${values[0]}% | 아공강 +${values[1]}%`;
  if (/대상의치명타저항을.*감소.*아군공격력강화효과가/.test(compact) && values.length >= 2) return `치명타 저항 -${values[0]}% | 아공강 +${values[1]}%`;
  if (/보호효과.*적에게주는피해가.*아군공격력강화효과가/.test(compact) && values.length >= 2) return `보호 대상 피해량 +${values[0]}% | 아공강 +${values[1]}%`;
  if (/치명타피해저항을.*감소.*아군공격력강화효과가/.test(compact) && values.length >= 2) return `치명타 피해 저항 -${values[0]}% | 아공강 +${values[1]}%`;
  return option;
}

function splitBraceletOptions(options: string[], primaryStat: BraceletPrimaryStat) {
  const stats: BraceletStat[] = [];
  const effects: string[] = [];
  const unavailableEffects: string[] = [];
  mergeBraceletOptionTexts(options).forEach((option) => {
    if (option.includes("도약")) return;
    const stat = parseBraceletStat(option, primaryStat);
    if (stat && stats.length < 4 && !stats.some((current) => current.type === stat.type && current.value === stat.value)) stats.push(stat);
    else {
      const normalized = normalizeBraceletEffect(option);
      const definition = findBraceletOption(normalized);
      if (!definition || !definition.selectable) unavailableEffects.push(normalized);
      else effects.push(definition.label);
    }
  });
  while (stats.length < 4) stats.push({ type: "없음", value: "0" });
  while (effects.length < 4) effects.push("없음");
  return { stats, effects: effects.slice(0, 4), unavailableEffects: [...new Set(unavailableEffects)] };
}

function formatBraceletStat(stat: BraceletStat) { return stat.type === "없음" ? null : `${stat.type} +${stat.value || "0"}`; }

const ACCESSORY_STAT_RANGES: Record<string, { min: number; max: number }> = {
  "목걸이": { min: 15178, max: 17857 },
  "귀걸이": { min: 11806, max: 13889 },
  "반지": { min: 10962, max: 12897 },
};
function accessoryStatRange(slot: string) { return ACCESSORY_STAT_RANGES[slot] ?? null; }
function accessoryStatPercent(item: EquipmentProfile) { const range = accessoryStatRange(item.slot); const value = Number(baseStatValue(item).replaceAll(",", "")); if (!range || !Number.isFinite(value)) return "-"; return `${Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100)).toFixed(2)}%`; }
function accessoryStatTone(item: EquipmentProfile) { const percent = Number.parseFloat(accessoryStatPercent(item)); return percent >= 100 ? "accessory-stat-gold" : percent >= 90 ? "accessory-stat-purple" : percent >= 70 ? "accessory-stat-blue" : percent >= 40 ? "accessory-stat-teal" : "accessory-stat-gray"; }

function AccessoryEditor({ item, onChange }: { item: EquipmentProfile; onChange: (patch: Partial<EquipmentProfile>) => void }) {
  const options = Array.from({ length: 3 }, (_, index) => item.options[index] ?? "없음");
  const range = accessoryStatRange(item.slot);
  return <article className="accessory-editor"><div className="quality-art"><Artwork icon={item.icon} label="◇" /><span className={accessoryStatTone(item)}>{accessoryStatPercent(item)}</span></div><div className="accessory-meta"><select aria-label={`${item.slot} 등급`} value={item.simulationGrade === "T4 전율" ? "고대" : item.simulationGrade} onChange={(event) => onChange({ simulationGrade: event.target.value as EquipmentProfile["simulationGrade"] })}><option value="고대">고대</option><option value="유물">유물</option></select><input aria-label={`${item.slot} 힘민지`} type="number" min={range?.min} max={range?.max} value={baseStatValue(item)} onChange={(event) => { const text = event.target.value; if (text === "") { onChange({ baseStats: [""] }); return; } const value = Number(text); if (range && (value < range.min || value > range.max)) return; onChange({ baseStats: [text] }); }} onBlur={(event) => { const value = Number(event.target.value); if (!range || (value >= range.min && value <= range.max)) return; window.alert(`${item.slot} 전투 스탯은 ${range.min.toLocaleString()}~${range.max.toLocaleString()} 범위로 입력해주세요.`); onChange({ baseStats: [String(Math.min(range.max, Math.max(range.min, value || range.min)))] }); }} /></div><div className="accessory-option-list">{options.map((option, index) => <select aria-label={`${item.slot} 옵션 ${index + 1}`} value={option} onChange={(event) => { const next = [...options]; next[index] = event.target.value; onChange({ options: next }); }} key={index}>{optionChoices(item.slot, option, accessoryOptions).map((value) => <option value={value} key={value}>{value}</option>)}</select>)}</div></article>;
}

function StoneEditor({ icon, effects, engravingNames, onChange }: { icon: string | null; effects: StoneEffect[]; engravingNames: string[]; onChange: (index: number, patch: Partial<StoneEffect>) => void }) {
  return <article className="stone-editor"><Artwork icon={icon} label="◇" /><div>{effects.map((effect, index) => <div className="stone-row" key={index}><select aria-label={`어빌리티 스톤 각인 ${index + 1}`} value={effect.engraving} onChange={(event) => onChange(index, { engraving: event.target.value })}>{engravingNames.map((name) => <option key={name}>{name}</option>)}</select><select aria-label={`어빌리티 스톤 레벨 ${index + 1}`} value={effect.level} onChange={(event) => onChange(index, { level: Number(event.target.value) })}>{[1, 2, 3, 4].map((level) => <option value={level} key={level}>+{level}</option>)}</select></div>)}</div></article>;
}

function BraceletEditor({ item, primaryStat, onChange }: { item: EquipmentProfile | null; primaryStat: BraceletPrimaryStat; onChange: (patch: Partial<EquipmentProfile>) => void }) {
  if (!item) return <p className="empty-copy">정보 없음</p>;
  const statTypes: BraceletStat["type"][] = [...new Set<BraceletStat["type"]>([...BRACELET_STAT_TYPES, primaryStat])];
  const { stats, effects, unavailableEffects } = splitBraceletOptions([...item.baseStats, ...item.options], primaryStat);
  function save(nextStats: BraceletStat[], nextEffects: string[]) { onChange({ baseStats: nextStats.map(formatBraceletStat).filter((value): value is string => Boolean(value)), options: [...unavailableEffects, ...nextEffects.filter((effect) => effect !== "없음")] }); }
  return <article className="bracelet-editor"><div className="bracelet-art"><Artwork icon={item.icon} label="◇" /></div><div className="bracelet-fields"><div className="bracelet-stat-list">{stats.map((stat, index) => <div className="bracelet-stat-row" key={index}><select aria-label={`팔찌 능력치 ${index + 1}`} value={stat.type} onChange={(event) => { const next = [...stats]; next[index] = { ...stat, type: event.target.value as BraceletStat["type"] }; save(next, effects); }}>{statTypes.map((type) => <option key={type}>{type}</option>)}</select><input aria-label={`팔찌 능력치 수치 ${index + 1}`} type="number" min="0" value={stat.value} disabled={stat.type === "없음"} onChange={(event) => { const next = [...stats]; next[index] = { ...stat, value: event.target.value }; save(next, effects); }} /></div>)}</div><div className="bracelet-option-list">{effects.map((effect, index) => <select aria-label={`팔찌 효과 ${index + 1}`} value={effect} onChange={(event) => { const next = [...effects]; next[index] = event.target.value; save(stats, next); }} key={index}>{BRACELET_EFFECT_OPTIONS.map((value) => <option value={value} key={value}>{value}</option>)}</select>)}</div>{unavailableEffects.length ? <div className="bracelet-unavailable"><small>현재 장착 · 시뮬레이션 미적용</small>{unavailableEffects.map((effect) => <span key={effect}>{effect}</span>)}</div> : null}</div></article>;
}
function GemEditor({ gem, onChange, onRemove }: { gem: GemProfile; onChange: (patch: Partial<GemProfile>) => void; onRemove: () => void }) { return <span className="gem-editor"><Artwork icon={gem.icon} label="◆" /><select aria-label="보석 종류" value={gem.type} onChange={(event) => onChange({ type: event.target.value, name: `${event.target.value} 보석` })}>{gemTypes.map((type) => <option key={type}>{type}</option>)}</select><select aria-label="보석 레벨" value={gem.level ?? 10} onChange={(event) => onChange({ level: Number(event.target.value) })}>{gemLevels.map((level) => <option value={level} key={level}>Lv.{level}</option>)}</select><button type="button" onClick={onRemove} aria-label="보석 제거">×</button></span>; }
function SkillEditor({ skill, gems, canAdd, onAdd, onChange, onRemove }: { skill: SkillProfile; gems: GemProfile[]; canAdd: boolean; onAdd: () => void; onChange: (id: string, patch: Partial<GemProfile>) => void; onRemove: (id: string) => void }) { return <article className="skill-card skill-editor"><Artwork icon={skill.icon} label="✦" /><div className="skill-detail"><strong>{skill.name}</strong><span>Lv.{skill.level} · {skill.type}</span><p>{skill.tripods.map((tripod) => `${tripod.name}${tripod.level ? ` ${tripod.level}` : ""}`).join(" · ") || "트라이포드 정보 없음"}</p><small>{skill.rune ? `${skill.rune} 룬` : "룬 없음"}</small></div><div className="skill-gems">{gems.map((gem) => <GemEditor gem={gem} onChange={(patch) => onChange(gem.id, patch)} onRemove={() => onRemove(gem.id)} key={gem.id} />)}<button type="button" className="gem-add-button" onClick={onAdd} disabled={!canAdd}>+ 보석</button></div></article>; }
function EffectList({ effects, onChange }: { effects: ArkEffectProfile[]; onChange: (id: string, level: number) => void }) {
  const visibleNames = ["추가 피해", "공격력", "보스 피해"];
  const visibleEffects = effects.filter((effect): effect is ArkEffectProfile => Boolean(effect) && visibleNames.some((name) => effect.name.includes(name)));
  return <ul className="effect-list ark-grid-effect-editor">{visibleEffects.map((effect) => { const level = effect.level ?? 0; const name = visibleNames.find((item) => effect.name.includes(item)) ?? effect.name; const kind = name === "추가 피해" ? "additionalDamage" : name === "보스 피해" ? "bossDamage" : "attack"; return <li key={effect.id}><Artwork icon={effect.icon} label="✦" /><div><strong>{name}</strong><small>젬 효율 {arkGridGemPercent(kind, level)}</small></div><select aria-label={`${effect.name} 레벨`} value={level} onChange={(event) => onChange(effect.id, Number(event.target.value))}>{Array.from({ length: 101 }, (_, value) => <option value={value} key={value}>{value}</option>)}</select></li>; })}</ul>;
}
function EngravingSection({ engravings, onChange }: { engravings: EngravingProfile[]; onChange: (index: number, patch: Partial<EngravingProfile>) => void }) { return <section className="equipment-section engraving-section"><h2>각인</h2><div className="engraving-editor">{engravings.slice(0, 5).map((engraving, index) => <div key={`${engraving.name}-${index}`}><Artwork icon={engraving.icon} label="◆" /><div className="engraving-card-content"><div className="engraving-controls"><select aria-label={`${engraving.name} 등급`} value={engraving.grade} onChange={(event) => onChange(index, { grade: event.target.value as EngravingProfile["grade"] })}><option>유물</option><option>전설</option></select><select aria-label={`${engraving.name} 활성도`} value={engraving.level} disabled={engraving.grade === "전설"} onChange={(event) => onChange(index, { level: Number(event.target.value) })}>{[0, 1, 2, 3, 4].map((level) => <option value={level} key={level}>+{level}</option>)}</select></div><select aria-label={`각인 ${index + 1}`} value={engraving.name} onChange={(event) => onChange(index, { name: event.target.value })}>{ENGRAVING_NAMES.map((name) => <option key={name}>{name}</option>)}</select></div></div>)}</div></section>; }
function EnlightenmentEditor({ effects, onChange }: { effects: ArkEffectProfile[]; onChange: (index: number, patch: Partial<ArkEffectProfile>) => void }) { const fixed = [{ name: "절정 I", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_2.png" }, { name: "절정 II", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_3.png" }, { name: "절정 III", icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_4.png" }]; const selectable = ["연가심공", "연가표식", "치명적인 베기", "강력한 찌르기", "전환 난무"]; const selected = effects.map((effect, index) => ({ effect, index })).filter(({ effect }) => selectable.includes(effect.name)).sort((a, b) => selectable.indexOf(a.effect.name) - selectable.indexOf(b.effect.name)).slice(0, 3); const rows = Array.from({ length: 3 }, (_, index) => selected[index] ?? { index: effects.length + index, effect: { id: `enlightenment-${index}`, name: "없음", level: 0, grade: null, icon: null, description: null } }); const options = ["없음", ...selectable]; return <section className="passive-editor enlightenment-editor"><div className="passive-choice-heading"><h3>깨달음</h3><span>3개</span></div><div className="enlightenment-fixed">{fixed.map((item) => <div key={item.name}><Artwork icon={item.icon} label="✦" title={item.name} /><span>{item.name}</span></div>)}</div><div className="enlightenment-selects">{rows.map((row, index) => { const current = row.effect.name; const maxLevel = enlightenmentEffects[current]?.maxLevel ?? 5; return <div className="passive-row" key={row.effect.id}><select aria-label={`깨달음 옵션 ${index + 1}`} value={current} onChange={(event) => { const name = event.target.value; const option = effects.find((effect) => effect.name === name); onChange(row.index, { id: `enlightenment-${index}`, name, level: name === "없음" ? 0 : Math.min(row.effect.level ?? 0, enlightenmentEffects[name]?.maxLevel ?? 5), icon: option?.icon ?? null, description: option?.description ?? enlightenmentEffects[name]?.description ?? null }); }}>{options.map((option) => <option value={option} disabled={option !== current && rows.some((candidate) => candidate.effect.name === option)} key={option}>{option}</option>)}</select><select aria-label={`깨달음 옵션 ${index + 1} 레벨`} value={current === "없음" ? 0 : row.effect.level ?? 0} disabled={current === "없음"} onChange={(event) => onChange(row.index, { level: Math.min(Number(event.target.value), maxLevel) })}>{Array.from({ length: maxLevel + 1 }, (_, level) => <option value={level} key={level}>Lv.{level}</option>)}</select></div>; })}</div></section>; }
function LeapEditor({ effects, onChange }: { effects: ArkEffectProfile[]; onChange: (index: number, patch: Partial<ArkEffectProfile>) => void }) {
  const safeEffects = effects.filter((effect): effect is ArkEffectProfile => Boolean(effect));
  const selected = safeEffects.map((effect, index) => ({ effect, index })).filter(({ effect }) => leapOptions.some((option) => option.name === effect.name));
  const fixedRows = leapOptions.slice(0, 3).map((option, optionIndex) => selected.find((row) => row.effect.name === option.name) ?? { index: safeEffects.length + optionIndex, effect: { id: `leap-fixed-${optionIndex}`, name: option.name, level: 0, grade: null, icon: option.icon, description: option.description } });
  const editableOptions = leapOptions.slice(3);
  const editableRows = selected.filter(({ effect }) => editableOptions.some((option) => option.name === effect.name)).slice(0, 2);
  const rows = [...fixedRows, ...editableRows];
  const choices = editableOptions.map((option) => option.name);
  return <section className="passive-editor leap-editor"><div className="passive-choice-heading"><h3>도약</h3></div><div className="leap-options">{rows.map((row, index) => { const current = leapOptions.find((option) => option.name === row.effect.name); const level = current ? row.effect.level ?? 0 : 0; const fixed = index < 3; return <div className="leap-option-row" key={`leap-row-${index}`}><Artwork icon={current?.icon ?? row.effect.icon ?? null} label="✦" title={current ? `${current.name}: ${current.description}` : "도약 옵션 선택"} />{fixed ? <strong className="leap-fixed-name">{current?.name}</strong> : <select aria-label={`도약 옵션 ${index + 1}`} value={current?.name ?? "없음"} onChange={(event) => { const name = event.target.value; const option = leapOptions.find((item) => item.name === name); onChange(row.index, { id: `leap-slot-${index}`, name, level: name === "없음" ? 0 : Math.min(level || 1, option?.maxLevel ?? 5), icon: option?.icon ?? null, description: option?.description ?? null }); }}>{choices.map((choice) => <option value={choice} key={choice}>{choice}</option>)}</select>}<select aria-label={`도약 옵션 ${index + 1} 레벨`} value={level} onChange={(event) => onChange(row.index, { level: Math.min(Number(event.target.value), current?.maxLevel ?? 5) })}>{Array.from({ length: (current?.maxLevel ?? 5) + 1 }, (_, value) => <option value={value} key={value}>Lv.{value}</option>)}</select></div>; })}</div></section>;
}
function PassiveEditor({ title, group, effects, onChange }: { title: string; group: PassiveGroup; effects: ArkEffectProfile[]; onChange: (index: number, patch: Partial<ArkEffectProfile>) => void }) { if (group === "enlightenment") return <EnlightenmentEditor effects={effects} onChange={onChange} />; if (group === "leap") return <LeapEditor effects={effects} onChange={onChange} />; const rows = effects.filter((effect): effect is ArkEffectProfile => Boolean(effect)); const displayRows = rows.length ? rows : [{ id: `${group}-empty`, name: "없음", level: 0, grade: null, icon: null, description: null }]; const choices = [...new Set([...passiveCatalog[group], ...rows.map((effect) => effect.name)])]; return <section className={`passive-editor passive-choice-editor ${group}-editor`}><div className="passive-choice-heading"><h3>{title}</h3><span>{displayRows.length}개</span></div>{displayRows.map((effect, index) => <div className="passive-row" key={effect.id}><select aria-label={`${title} 옵션 ${index + 1}`} value={effect.name} onChange={(event) => onChange(index, { name: event.target.value })}>{choices.map((choice) => <option key={choice}>{choice}</option>)}</select><select aria-label={`${title} 옵션 ${index + 1} 레벨`} value={effect.level ?? 0} onChange={(event) => onChange(index, { level: Number(event.target.value) })}>{Array.from({ length: 7 }, (_, level) => <option value={level} key={level}>Lv.{level}</option>)}</select></div>)}</section>; }
function EvolutionTierOneEditor({ effects, onChange }: { effects: ArkEffectProfile[]; onChange: (index: number, patch: Partial<ArkEffectProfile>) => void }) {
  const statNames = new Set<string>(EVOLUTION_T1_OPTIONS.map((option) => option.name));
  const selected = effects.filter((effect): effect is ArkEffectProfile => Boolean(effect) && statNames.has(effect.name)).slice(0, 3);
  const rows = Array.from({ length: 3 }, (_, index) => selected[index] ?? { id: `evolution-t1-${index}`, name: "없음", level: 0, grade: null, icon: null, description: null });
  const total = rows.reduce((sum, effect) => sum + (effect.name === "없음" ? 0 : effect.level ?? 0), 0);
  return <section className="passive-editor evolution-t1-editor">
<div className="evolution-t1-heading">
<div>
<h3>진화 · T1</h3>
<p>최대 3개 선택 · 합계 {total} / {EVOLUTION_T1_MAX_TOTAL_LEVEL} · 레벨당 전투 특성 +{EVOLUTION_T1_STAT_PER_LEVEL}</p>
</div>
</div>
<div className="evolution-t1-list">{rows.map((effect, index) => { const selectedName = effect.name as EvolutionT1OptionName | "없음"; const selectedOption = EVOLUTION_T1_OPTIONS.find((option) => option.name === selectedName) ?? null; const otherTotal = total - (selectedOption ? effect.level ?? 0 : 0); const maxLevel = Math.min(EVOLUTION_T1_MAX_OPTION_LEVEL, EVOLUTION_T1_MAX_TOTAL_LEVEL - otherTotal); const tooltip = selectedOption ? `${selectedOption.name}: 레벨당 전투 특성 +${EVOLUTION_T1_STAT_PER_LEVEL} · 현재 총 +${(effect.level ?? 0) * EVOLUTION_T1_STAT_PER_LEVEL}` : "전투 특성 선택"; return <article key={effect.id}>
<Artwork icon={selectedOption?.icon ?? null} label="＋" title={tooltip} />
<div className="evolution-t1-controls">
<select aria-label={`T1 전투 특성 ${index + 1}`} value={selectedName} onChange={(event) => { const name = event.target.value as EvolutionT1OptionName | "없음"; const option = EVOLUTION_T1_OPTIONS.find((item) => item.name === name); onChange(index, { name, level: name === "없음" ? 0 : effect.level ?? 0, icon: option?.icon ?? null, description: option ? `${option.name}이 레벨당 ${EVOLUTION_T1_STAT_PER_LEVEL} 증가합니다.` : null }); }}>
<option>없음</option>{EVOLUTION_T1_OPTIONS.map((option) => <option value={option.name} disabled={option.name !== selectedName && rows.some((row) => row.name === option.name)} key={option.name}>{option.name}</option>)}</select>
<strong>{selectedOption?.name ?? "선택 없음"}</strong>
</div>
<select className="evolution-t1-level" aria-label={`${selectedName} 레벨`} value={selectedOption ? effect.level ?? 0 : 0} disabled={!selectedOption} onChange={(event) => onChange(index, { level: Number(event.target.value) })}>{Array.from({ length: maxLevel + 1 }, (_, level) => <option value={level} key={level}>Lv.{level}</option>)}</select>
</article>; })}</div>
</section>;
}
function scaledEvolutionDescription(description: string, level: number) { return description.replace(/(\d+(?:\.\d+)?)%/g, (_, value: string) => `${Number(value) * level}%`); }
function EvolutionTierEditor({ tier, effects, onChange: rawOnChange }: { tier: Exclude<EvolutionTier, "T1">; effects: ArkEffectProfile[]; onChange: (index: number, patch: Partial<ArkEffectProfile>) => void }) {
  const rule = EVOLUTION_TIER_RULES[tier];
  const options = EVOLUTION_TIER_CATALOG[tier].filter((option) => option.selectable !== false);
  const safeEffects = effects.filter((effect): effect is ArkEffectProfile => Boolean(effect));
  const selected = safeEffects.map((effect, index) => ({ effect, index })).filter(({ effect }) => options.some((option) => option.name === effect.name)).slice(0, rule.maxSelections);
  const rows = Array.from({ length: rule.maxSelections }, (_, index) => selected[index] ?? { index: safeEffects.length + index, effect: { id: `evolution-${tier}-${index}`, name: tier === "T4" ? options[index]?.name ?? "없음" : "없음", level: 0, grade: null, icon: tier === "T4" ? options[index]?.icon ?? null : null, description: tier === "T4" ? options[index]?.effects.join(" · ") ?? null : null } });
  const spentPoints = rows.reduce((total, row) => total + (row.effect.name === "없음" ? 0 : (row.effect.level ?? 0) * rule.pointCost), 0);
  const onChange = (index: number, patch: Partial<ArkEffectProfile>) => { const cap = rule.totalPointCap; if (cap !== undefined) { const nextPoints = rows.reduce((total, row) => { const level = row.index === index ? patch.level ?? row.effect.level ?? 0 : row.effect.level ?? 0; const name = row.index === index ? patch.name ?? row.effect.name : row.effect.name; return total + (name === "없음" ? 0 : level * rule.pointCost); }, 0); if (nextPoints > cap) { window.alert(`${tier} 진화 포인트는 최대 ${cap}P까지 선택할 수 있습니다.`); return; } } rawOnChange(index, patch); };
  return <section className={`passive-editor evolution-tier-editor evolution-${tier.toLowerCase()}-editor`}><div className="evolution-t1-heading"><div><h3>진화 · {tier}</h3><p>최대 {rule.maxSelections}개 선택 · Lv.당 {rule.pointCost} 포인트 · 사용 {spentPoints}P</p></div></div><div className="evolution-t1-list">{rows.map((row, rowIndex) => { const current = options.find((option) => option.name === row.effect.name) ?? null; const level = current ? row.effect.level ?? 0 : 0; const description = current?.effects.length ? current.effects.map((effect) => scaledEvolutionDescription(effect, level || 1)).join(" · ") : "효과 데이터 미등록"; return <article key={row.effect.id}><Artwork icon={current?.icon ?? null} label="＋" title={current ? `${current.name} Lv.${level}: ${description}` : "진화 옵션 선택"} /><div className="evolution-t1-controls"><select aria-label={`${tier} 옵션 ${rowIndex + 1}`} value={current?.name ?? "없음"} onChange={(event) => { const name = event.target.value; const next = options.find((option) => option.name === name); onChange(row.index, { id: `evolution-${tier}-${rowIndex}`, name, level: name === "없음" ? 0 : Math.min(row.effect.level ?? 0, next?.maxLevel ?? 0), icon: next?.icon ?? null, description: next?.effects.join(" · ") ?? null }); }}>{tier !== "T4" ? <option>없음</option> : null}{options.map((option) => <option value={option.name} disabled={option.name !== current?.name && rows.some((candidate) => candidate.effect.name === option.name)} key={option.name}>{option.name}</option>)}</select><strong>{current?.name ?? "선택 없음"}</strong></div><select className="evolution-t1-level" aria-label={`${tier} ${current?.name ?? "옵션"} 레벨`} value={level} disabled={!current} onChange={(event) => onChange(row.index, { level: Number(event.target.value) })}>{Array.from({ length: (current?.maxLevel ?? 0) + 1 }, (_, levelOption) => <option value={levelOption} key={levelOption}>Lv.{levelOption}</option>)}</select></article>; })}</div></section>;
}
function coreLevel(point: number | null) { return point === null ? null : point >= 20 ? 3 : point >= 17 ? 2 : point >= 14 ? 1 : 0; }
function deriveGridShorthand(cores: ArkGridCoreProfile[]) { const indexes = cores.slice(0, 3).map((core, index) => GLAVIER_ORDER_CORE_OPTIONS[index]?.findIndex((option) => option === core.name) ?? -1); return indexes.length === 3 && indexes.every((index) => index >= 0) ? indexes.map((index) => index + 1).join("") : null; }
function deriveBuildName(character: CharacterProfile) { const text = character.arkPassive.enlightenment.map((effect) => `${effect.name} ${effect.description ?? ""}`).join(" "); const identity = text.includes("절제") ? "절제" : text.includes("절정") ? "절정" : character.buildName.split(" ")[0]; const shorthand = deriveGridShorthand(character.arkGrid.cores) ?? character.arkGrid.shorthand; return `${identity}${shorthand ? ` ${shorthand}` : ""}`; }
function initialStoneEffects(profile: CharacterProfile): StoneEffect[] { const active = profile.engravingDetails.filter((engraving) => engraving.abilityStoneLevel > 0).slice(0, 2); return (active.length ? active : profile.engravingDetails.slice(0, 2)).map((engraving) => ({ engraving: engraving.name, level: engraving.abilityStoneLevel || 1 })); }
function initialAvatarGrades(profile: CharacterProfile) { return Object.fromEntries(avatarSlots.map((slot) => { const avatar = profile.avatars.find((item) => item.slot.includes(slot) || (slot === "머리" && item.slot.includes("투구"))); return [slot, avatar?.grade === "전설" ? "전설" : avatar ? "영웅" : "없음"]; })) as Record<(typeof avatarSlots)[number], string>; }

export default function Home() {
  const [menu, setMenu] = useState<MainMenu>("simulation"); const [tab, setTab] = useState<SimulationTab>("전체"); const [apiKey, setApiKey] = useState(""); const [characterName, setCharacterName] = useState(""); const [character, setCharacter] = useState<CharacterProfile | null>(null); const [message, setMessage] = useState("API 설정에서 API 키를 입력한 뒤 캐릭터를 조회하세요."); const [searching, setSearching] = useState(false); const [cycle, setCycle] = useState<string[]>([]); const [cycleSkill, setCycleSkill] = useState(""); const [savedSettings, setSavedSettings] = useState<SavedSetting[]>([]); const [gems, setGems] = useState<GemProfile[]>([]); const [gemMessage, setGemMessage] = useState(""); const [stoneEffects, setStoneEffects] = useState<StoneEffect[]>([]); const [avatarGrades, setAvatarGrades] = useState<Record<string, string>>({});
  function applyProfile(profile: CharacterProfile) { const cleanProfile = { ...profile, arkPassive: { ...profile.arkPassive, evolution: profile.arkPassive.evolution.filter((effect): effect is ArkEffectProfile => Boolean(effect)), enlightenment: profile.arkPassive.enlightenment.filter((effect): effect is ArkEffectProfile => Boolean(effect)).map((effect, index) => ({ ...effect, id: `enlightenment-api-${index}-${effect.id}` })), leap: profile.arkPassive.leap.filter((effect): effect is ArkEffectProfile => Boolean(effect)) } }; setCharacter(cleanProfile); setCharacterName(cleanProfile.name); setGems(cleanProfile.gems); setStoneEffects(initialStoneEffects(cleanProfile)); setAvatarGrades(initialAvatarGrades(cleanProfile)); setGemMessage(""); }
  useEffect(() => { loadLatestCharacter().then((stored) => { if (stored) { applyProfile(stored.source); setMessage(`${stored.source.name}의 저장된 정보를 복원했습니다.`); } }).catch(() => undefined); }, []);
  useEffect(() => { try { const saved = localStorage.getItem(SAVED_SETTINGS_KEY); if (saved) setSavedSettings(JSON.parse(saved) as SavedSetting[]); } catch { /* 복원 실패는 무시한다. */ } }, []);
  useEffect(() => {
    if (tab !== "기본 장비") return;
    const columns = document.querySelectorAll<HTMLElement>(".equipment-layout > .equipment-column");
    const [leftColumn, rightColumn] = columns;
    if (!leftColumn || !rightColumn) return;
    const syncRightColumnHeight = () => {
      if (window.innerWidth <= 900) { rightColumn.style.height = ""; return; }
      rightColumn.style.height = `${Math.ceil(leftColumn.getBoundingClientRect().height)}px`;
    };
    const observer = new ResizeObserver(syncRightColumnHeight);
    observer.observe(leftColumn);
    window.addEventListener("resize", syncRightColumnHeight);
    syncRightColumnHeight();
    return () => { observer.disconnect(); window.removeEventListener("resize", syncRightColumnHeight); rightColumn.style.height = ""; };
  }, [tab, character]);
  const gear = character?.equipment.filter((item) => item.category === "gear") ?? []; const accessories = character?.equipment.filter((item) => ["목걸이", "귀걸이", "반지"].includes(item.slot)) ?? []; const stone = character?.equipment.find((item) => item.slot === "어빌리티 스톤") ?? null; const bracelet = character?.equipment.find((item) => item.slot === "팔찌") ?? null; const primaryStat = primaryStatFromEquipment(gear); const cycleSkills = useMemo(() => character?.skills.filter((skill) => skill.level > 0) ?? [], [character]); const engravingNames = ENGRAVING_NAMES;
  async function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!apiKey.trim()) { setMenu("api"); setMessage("먼저 API 설정에서 키를 입력해주세요."); return; } if (!characterName.trim()) { setMessage("캐릭터명을 입력해주세요."); return; } setSearching(true); setMessage("로스트아크 API에서 캐릭터 정보를 불러오는 중입니다..."); try { const profile = mapCharacterResponse(await fetchCharacter(characterName.trim(), apiKey.trim())); applyProfile(profile); setCycle([]); await saveCharacter(profile); setMessage("캐릭터 정보와 현재 세팅을 불러왔습니다."); } catch (error) { setMessage(errorMessage(error)); } finally { setSearching(false); } }
  function updateEquipment(id: string, patch: Partial<EquipmentProfile>) { setCharacter((current) => current ? { ...current, equipment: current.equipment.map((item) => item.id === id ? { ...item, ...patch } : item) } : current); }
  function updateAllGearEnhancement(level: number) { setCharacter((current) => current ? { ...current, equipment: current.equipment.map((item) => item.category === "gear" && item.slot !== "완갑" ? { ...item, enhancement: level } : item) } : current); }
  function updateEngraving(index: number, patch: Partial<EngravingProfile>) { setCharacter((current) => { if (!current) return current; const details = current.engravingDetails.map((engraving, itemIndex) => itemIndex === index ? { ...engraving, ...patch, icon: patch.name ? engravingIcon(patch.name) : engraving.icon } : engraving); return { ...current, engravingDetails: details, engravings: details.map((engraving) => engraving.name) }; }); }
  function updatePassive(group: PassiveGroup, index: number, patch: Partial<ArkEffectProfile>) { setCharacter((current) => { if (!current) return current; const effects = current.arkPassive[group].filter((effect): effect is ArkEffectProfile => Boolean(effect)).map((effect, effectIndex) => ({ ...effect, id: `${group}-slot-${effectIndex}` })); const targetIndex = Math.min(index, effects.length); const existing = effects[targetIndex] ?? { id: `${group}-slot-${targetIndex}`, name: "없음", level: 0, grade: null, icon: null, description: null }; effects[targetIndex] = { ...existing, ...patch, id: `${group}-slot-${targetIndex}` }; return { ...current, arkPassive: { ...current.arkPassive, [group]: effects } }; }); }
  function updateCore(index: number, patch: Partial<ArkGridCoreProfile>) { setCharacter((current) => { if (!current) return current; const cores = current.arkGrid.cores.map((core, coreIndex) => coreIndex === index ? { ...core, ...patch } : core); return { ...current, arkGrid: { ...current.arkGrid, cores, shorthand: deriveGridShorthand(cores) } }; }); }
  function addGem(skill: SkillProfile) { if (gems.length >= 11) { setGemMessage("보석은 최대 11개까지만 선택할 수 있습니다."); return; } setGems((current) => [...current, { id: `custom-${crypto.randomUUID()}`, name: "겁화 보석", type: "겁화", level: 10, grade: "고대", icon: null, skill: skill.name, effect: null }]); setGemMessage(""); }
  function updateGem(id: string, patch: Partial<GemProfile>) { setGems((current) => current.map((gem) => gem.id === id ? { ...gem, ...patch } : gem)); }
  function saveSetting() { if (!character) return; setSavedSettings((value) => { const next = [...value, { id: crypto.randomUUID(), name: `${character.name} 세팅 ${value.length + 1}`, cycle, itemLevel: character.level, attackPower: character.combat.attackPower, savedAt: new Date().toLocaleString("ko-KR") }]; localStorage.setItem(SAVED_SETTINGS_KEY, JSON.stringify(next)); return next; }); }

  return <main className="shell simulator-shell"><header className="topbar"><div className="brand"><span className="brand-mark">G</span><div><strong>GLAVIER</strong><small>DPS SIMULATOR</small></div></div><nav className="main-menu">{[["simulation", "시뮬레이션"], ["comparison", "세팅 비교"], ["api", "API 설정"]].map(([id, label]) => <button type="button" className={menu === id ? "active" : ""} onClick={() => setMenu(id as MainMenu)} key={id}>{label}</button>)}</nav></header>
    {menu === "api" ? <section className="workspace api-workspace"><div className="workspace-title"><span>03</span><div><h1>API 설정</h1><p>키는 현재 브라우저 메모리에서 조회 요청에만 사용하며 저장하지 않습니다.</p></div></div><label className="api-field">Lost Ark API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API 키 또는 bearer API 키" autoComplete="off" /></label><a className="guide-link" href="https://developer-lostark.game.onstove.com/" target="_blank" rel="noreferrer">로스트아크 Open API 키 발급 가이드 ↗</a></section> : null}
    {menu === "comparison" ? <section className="workspace"><div className="workspace-title"><span>02</span><div><h1>세팅 비교</h1><p>시뮬레이션에서 저장한 세팅의 전투 사이클과 계산 결과를 비교합니다.</p></div></div>{savedSettings.length ? <div className="setting-compare">{savedSettings.map((setting) => <article key={setting.id}><strong>{setting.name}</strong><p>아이템 레벨 {setting.itemLevel} · 공격력 {setting.attackPower}</p><small>{setting.cycle.length ? setting.cycle.join(" → ") : "전투 사이클 미설정"}</small></article>)}</div> : <p className="empty-copy">저장된 세팅이 없습니다.</p>}</section> : null}
    {menu === "simulation" ? <><section className="lookup-bar"><form onSubmit={search}><label>캐릭터명<input value={characterName} onChange={(event) => setCharacterName(event.target.value)} placeholder="캐릭터명 입력" maxLength={24} /></label><button type="submit" disabled={searching}>{searching ? "조회 중..." : "캐릭터 불러오기"}</button><button type="button" className="subtle-button" onClick={() => setMenu("api")}>API 설정</button></form><p aria-live="polite">{message}</p></section>
      {character ? <section className="workspace simulation-workspace"><div className="profile-strip"><Artwork icon={character.characterImage} label="⚔" /><div><span>{character.server} · {character.className}</span><h1>{character.name}</h1></div><strong>아이템 레벨 {character.level}</strong><button type="button" onClick={saveSetting}>현재 세팅 저장</button></div><nav className="sim-tabs" aria-label="시뮬레이션 탭">{simTabs.map((item) => <button type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</nav><div className="sim-content">
        {tab === "전체" ? <div className="summary-board">{[["직업", deriveBuildName(character)], ["아이템 레벨", character.level], ["공격 속도", character.combat.attackSpeed], ["이동 속도", character.combat.moveSpeed], ["치명타 적중률", character.combat.criticalChance], ["예상 DPS", "계산 준비 중"], ["예상 1사이클 딜량", "계산 준비 중"]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div> : null}
        {tab === "기본 장비" ? <div className="equipment-layout"><div className="equipment-column"><section className="equipment-section"><div className="equipment-section-heading"><h2>전투 장비</h2><GearBulkControl onChange={updateAllGearEnhancement} /></div><div className="equipment-edit-grid">{gear.map((item) => <GearEditor item={item} onChange={(patch) => updateEquipment(item.id, patch)} key={item.id} />)}</div></section><section className="equipment-section avatar-section"><h2>아바타</h2><div className="avatar-table"><div><span></span>{avatarSlots.map((slot) => <strong key={slot}>{slot}</strong>)}</div>{["없음", "영웅", "전설"].map((grade) => <div key={grade}><span>{grade}</span>{avatarSlots.map((slot) => <label key={slot}><input type="radio" name={`avatar-${slot}`} checked={avatarGrades[slot] === grade} onChange={() => setAvatarGrades((current) => ({ ...current, [slot]: grade }))} /><i /></label>)}</div>)}</div></section></div><div className="equipment-column"><section className="equipment-section"><h2>악세사리</h2><div className="accessory-edit-grid">{accessories.map((item) => <AccessoryEditor item={item} onChange={(patch) => updateEquipment(item.id, patch)} key={item.id} />)}</div></section><section className="equipment-section"><h2>어빌리티 스톤</h2><StoneEditor icon={stone?.icon ?? null} effects={stoneEffects} engravingNames={engravingNames} onChange={(index, patch) => setStoneEffects((current) => current.map((effect, effectIndex) => effectIndex === index ? { ...effect, ...patch } : effect))} /></section><section className="equipment-section"><h2>팔찌</h2><BraceletEditor item={bracelet} primaryStat={primaryStat} onChange={(patch) => bracelet && updateEquipment(bracelet.id, patch)} /></section></div></div> : null}
        {tab === "기본 장비" ? <div className="ark-board equipment-ark-grid">
<section>
<div className="section-heading">
<div>
<h2>아크패시브</h2>
</div>
</div>
<div className="ark-points">{character.arkPassive.points.map((point) => <div key={point.name}>
<span>{point.name}</span>
<strong>{point.rank !== null && point.level !== null ? `${point.rank}랭크 ${point.level}레벨` : point.value}</strong>
</div>)}</div>
<div className="ark-columns">
<div className="evolution-tier-stack">
<EvolutionTierOneEditor effects={character.arkPassive.evolution} onChange={(index, patch) => updatePassive("evolution", index, patch)} />
<EvolutionTierEditor tier="T2" effects={character.arkPassive.evolution} onChange={(index, patch) => updatePassive("evolution", index, patch)} />
<EvolutionTierEditor tier="T3" effects={character.arkPassive.evolution} onChange={(index, patch) => updatePassive("evolution", index, patch)} />
<EvolutionTierEditor tier="T4" effects={character.arkPassive.evolution} onChange={(index, patch) => updatePassive("evolution", index, patch)} />
<EvolutionTierEditor tier="T5" effects={character.arkPassive.evolution} onChange={(index, patch) => updatePassive("evolution", index, patch)} />
</div>
<PassiveEditor title="깨달음" group="enlightenment" effects={character.arkPassive.enlightenment} onChange={(index, patch) => updatePassive("enlightenment", index, patch)} />
<PassiveEditor title="도약" group="leap" effects={character.arkPassive.leap} onChange={(index, patch) => updatePassive("leap", index, patch)} />
</div>
<EngravingSection engravings={character.engravingDetails} onChange={updateEngraving} />
</section>
<section>
<div className="section-heading">
<div>
<h2>아크그리드</h2>
</div>
</div>{character.arkGrid.cores.length ? <div className="core-grid">{character.arkGrid.cores.map((core, index) => {
const normalizedName = core.name.replace(/^(?:질서|혼돈)의?\s*(?:해|달|별)\s*코어\s*:\s*/, "").trim();
const options = [...new Set([normalizedName, ...(gridCoreOptions[index] ?? [])])].filter((option) => option !== "없음"); return <article key={core.id}>
<Artwork icon={core.icon} label={index < 3 ? "秩" : "混"} />
<select value={options.includes(normalizedName) ? normalizedName : options[0] ?? ""} onChange={(event) => updateCore(index, { name: event.target.value })}>{options.map((option) => <option key={option}>{option}</option>)}</select>
<select value={core.grade ?? "고대"} onChange={(event) => updateCore(index, { grade: event.target.value })}>
<option value="고대">고대 코어</option>
<option value="유물">유물 코어</option>
<option value="전설">전설 코어</option>
</select>
<select value={core.point ?? 20} onChange={(event) => { const point = Number(event.target.value); updateCore(index, { point, level: coreLevel(point) }); }}>{gridPoints.map((point) => <option value={point} key={point}>{point}P</option>)}</select>
<b>Lv.{core.level ?? coreLevel(core.point) ?? "-"}</b>
</article>; })}</div> : <p className="empty-copy">이 캐릭터의 공식 API 응답에 활성 코어 Slots가 없습니다.</p>}
<EffectList effects={character.arkGrid.effects} onChange={(id, level) => setCharacter((current) => current ? { ...current, arkGrid: { ...current.arkGrid, effects: current.arkGrid.effects.map((effect) => effect.id === id ? { ...effect, level } : effect) } } : current)} />
</section>
</div> : null}
        {tab === "스킬 & 전투 사이클" ? <div className="skills-cycle"><section><div className="section-heading"><div><h2>스킬과 장착 보석</h2><p>현재 보석을 수정하거나 스킬에 새 보석을 추가할 수 있습니다.</p></div><span className={gems.length >= 11 ? "limit-reached" : ""}>{gems.length} / 11</span></div>{gemMessage ? <p className="validation-message" role="alert">{gemMessage}</p> : null}<div className="skills-list">{character.skills.map((skill) => <SkillEditor skill={skill} gems={gems.filter((gem) => gem.skill === skill.name)} canAdd={gems.length < 11} onAdd={() => addGem(skill)} onChange={updateGem} onRemove={(id) => { setGems((current) => current.filter((gem) => gem.id !== id)); setGemMessage(""); }} key={skill.id} />)}</div></section><section className="cycle-builder"><div className="section-heading"><div><h2>전투 사이클 구성</h2><p>스킬을 추가한 뒤 위·아래로 이동해 사용 순서를 만드세요.</p></div><span>{cycle.length}개</span></div><div className="cycle-add"><select value={cycleSkill} onChange={(event) => setCycleSkill(event.target.value)}><option value="">스킬 선택</option>{cycleSkills.map((skill) => <option value={skill.name} key={skill.id}>{skill.name}</option>)}</select><button type="button" onClick={() => cycleSkill && setCycle((value) => [...value, cycleSkill])}>추가</button></div>{cycle.length ? <ol className="cycle-list">{cycle.map((skill, index) => <li key={`${skill}-${index}`}><b>{index + 1}</b><span>{skill}</span><button type="button" onClick={() => setCycle((value) => { const next = [...value]; if (index > 0) [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button type="button" onClick={() => setCycle((value) => { const next = [...value]; if (index < next.length - 1) [next[index + 1], next[index]] = [next[index], next[index + 1]]; return next; })}>↓</button><button type="button" onClick={() => setCycle((value) => value.filter((_, itemIndex) => itemIndex !== index))}>삭제</button></li>)}</ol> : <p className="empty-copy">전투 사이클에 사용할 스킬을 추가하세요.</p>}</section></div> : null}
      </div></section> : <section className="empty-start"><span>01</span><h1>시뮬레이션 시작</h1><p>API 설정 후 캐릭터명을 입력하면 장비, 아크 시스템, 스킬과 보석을 모두 불러옵니다.</p></section>}</> : null}
  </main>;
}
