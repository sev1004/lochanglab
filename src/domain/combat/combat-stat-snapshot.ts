import type { EquipmentProfile } from "../character/equipment-parser.ts";
import { createInternalGearSnapshot } from "./internal-gear-snapshot.ts";
import { findBraceletOption } from "../bracelet/bracelet-catalog.ts";
import { gemBaseAttackRate } from "../../data/gem-base-attack-rate.ts";
import { adrenalineStoneAttackRate, ADRENALINE_ENGRAVING_ATTACK_RATE } from "../../data/attack-power-effects.ts";
import { arkGridGemRate } from "../../data/ark-grid-gem-values.ts";
import { resolveArkGridCommonCoreEffects, resolveArkGridOrderCoreEffects } from "../../data/ark-grid-common-core.ts";
import { engravingCriticalRatePercent, PRECISION_DAGGER_CRITICAL_DAMAGE_RATE, PRECISION_DAGGER_STONE_CRITICAL_RATE_PERCENT } from "../../data/critical-rate-effects.ts";
import engravingValues from "../../data/engraving-outgoing-damage.json" with { type: "json" };
export type CombatStatSnapshot = { base:number; gear:number; accessories:number; bracelet:number; subtotal:number; petRate:number; avatarRate:number; total:number };
export type CriticalStatSnapshot = { apiTotal:number; evolutionStat:number; braceletStat:number; petStat:number; characterBaseStat:number; internalTotal:number; criticalRate:number; petIncluded:boolean };
export type CombatAttributeSnapshot = { apiTotal:number; evolutionStat:number; braceletStat:number; petStat:number; characterBaseStat:number; internalTotal:number; petIncluded:boolean };
export type CombatAttributeBaseline = Record<string, { apiTotal:number; evolutionStat:number; braceletStat:number; petStat:number; characterBaseStat:number; petIncluded:boolean }>;
export type CriticalRateOptionSnapshot = { statRate:number; accessoryRate:number; braceletRate:number; evolutionRate:number; engravingRate:number; stoneRate:number; arkGridRate:number; total:number };
export type CriticalDamageSnapshot = { base:number; enlightenment:number; engraving:number; stone:number; accessories:number; bracelet:number; arkGrid:number; total:number };
export type CriticalOutgoingSnapshot = { classSynergy:number; evolution:number; arkGrid:number; bracelet:number; total:number };
export type AdditionalDamageSnapshot = { weaponQuality:number; accessories:number; evolution:number; bracelet:number; pet:number; arkGridCore:number; arkGridGems:number; total:number };
export type SpecificTypeDamageSnapshot = { base:number; bracelet:number; total:number };
export type CardAttributeDamageSnapshot = { base:number; vulnerableMultiplier:number; totalMultiplier:number };
export type BackAttackDamageSnapshot = { baseMultiplier:number; engravingMultiplier:number; totalMultiplier:number };
export type EngravingOutgoingDamageSnapshot = { groups: Record<string, number>; totalMultiplier: number };
export type EnemyDamageSnapshot = { engravingAndStone: number; commanderDamage: number; necklace: number; bracelet: number; gems: number; orderCore: number; chaosCore: number; enlightenment: number; accessoriesBraceletMultiplier: number; arkGridMultiplier: number; enlightenmentMultiplier: number; totalMultiplier: number };
export const FOCUS_SKILL_DAMAGE_PER_SPECIALIZATION_PERCENT = 0.06008;
export const FLURRY_SKILL_DAMAGE_MULTIPLIER = 1;
export type WeaponAttackSnapshot = { gear:number; accessoriesFlat:number; bracelet:number; arkGridFlat:number; flatTotal:number; accessoriesRate:number; enlightenmentRate:number; arkGridRate:number; rateTotal:number; total:number };
export type PureAttackPowerSnapshot = { primaryStat:number; weaponAttack:number; total:number };
export type BaseAttackPowerSnapshot = { pureAttackPower:number; gauntletFlat:number; gauntletRate:number; stoneRate:number; gemRate:number; rateTotal:number; total:number };
export type FinalAttackPowerSnapshot = { baseAttackPower:number; accessoriesFlat:number; arkGridFlat:number; accessoriesRate:number; arkGridRate:number; adrenalineEngravingRate:number; adrenalineStoneRate:number; rateTotal:number; total:number };
export type CombatStatSnapshotSource = { equipment: readonly EquipmentProfile[]; avatarGrades: Record<string, string>; azenaBonus?: number };
function numeric(value:string){const n=Number(value.replaceAll(",","").replace(/[^\d.-]/g,""));return Number.isFinite(n)?n:0;}
function snapshotCombatAttribute(apiTotal:number,evolutionLevel:number,braceletStat:number,petIncluded:boolean):CombatAttributeSnapshot { const safeApi=Number.isFinite(apiTotal)?Math.max(0,apiTotal):0; const evolutionStat=Math.max(0,evolutionLevel)*50; const safeBracelet=Math.max(0,Number.isFinite(braceletStat)?braceletStat:0); const residual=Math.max(0,safeApi-evolutionStat-safeBracelet); const petStat=petIncluded?160:0; const characterBaseStat=Math.max(0,residual-petStat); const internalTotal=safeApi+petStat; return {apiTotal:safeApi,evolutionStat,braceletStat:safeBracelet,petStat,characterBaseStat,internalTotal,petIncluded}; }
export function createCombatAttributeSnapshots(source:{apiTotals:Record<string,number>; evolution:readonly {name:string; level:number|null}[]; braceletStats:Record<string,number>}):Record<string,CombatAttributeSnapshot> { const names=["특화","신속","치명","제압","인내","숙련"]; const residuals=names.map((name)=>({name,residual:Math.max(0,(source.apiTotals[name]??0)-((source.evolution.find((effect)=>effect.name===name)?.level??0)*50)-(source.braceletStats[name]??0))})); /* 펫 효과는 한 특성에만 적용되며, 캐릭터 기본값(100 미만)을 고려해 잔여 200 초과일 때만 식별한다. */ const petCandidate=residuals.find((item)=>item.residual>200)?.name; return Object.fromEntries(names.map((name)=>{ const effect=source.evolution.find((item)=>item.name===name); return [name,snapshotCombatAttribute(source.apiTotals[name]??0,effect?.level??0,source.braceletStats[name]??0,name===petCandidate)]; })); }
export function createCurrentCombatAttributeSnapshots(source:{baseline:CombatAttributeBaseline; evolution:readonly {name:string; level:number|null}[]; braceletStats:Record<string,number>}):Record<string,CombatAttributeSnapshot> { return Object.fromEntries(Object.entries(source.baseline).map(([name,base])=>{ const evolutionStat=(source.evolution.find((effect)=>effect.name===name)?.level??0)*50; const braceletStat=source.braceletStats[name]??0; const internalTotal=base.characterBaseStat+base.petStat+evolutionStat+braceletStat; return [name,{apiTotal:base.apiTotal,evolutionStat,braceletStat,petStat:base.petStat,characterBaseStat:base.characterBaseStat,internalTotal,petIncluded:base.petIncluded}]; })); }
// 창술사의 계산용 주 스탯은 힘이다. 이 값은 API 표기값이 아니라 직업 규칙이다.
function primaryStatType() { return "힘"; }
function itemStats(items:readonly EquipmentProfile[], type:string){const re=new RegExp(`^${type}\\s*\\+?([\\d,]+)`); return items.reduce((s,item)=>s+item.baseStats.reduce((t,stat)=>{const m=stat.match(re); const rawNumeric=/^[\d,]+$/.test(stat.trim()); return t+(m?numeric(m[1]):rawNumeric?numeric(stat):0);},0),0);}
function optionValue(option:string, percent:boolean){const match=option.match(/무기\s*공격력\s*\+\s*([\d.]+)\s*(%?)/); return match && (match[2]==="%")===percent ? Number(match[1]) : 0;}
function attackPowerOptionValue(option:string, percent:boolean){const match=option.trim().match(/^공격력\s*\+\s*([\d.]+)\s*(%?)/); return match && (match[2]==="%")===percent ? Number(match[1]) : 0;}
function statValue(items:readonly EquipmentProfile[], type:string){return items.reduce((total,item)=>total+item.baseStats.reduce((sum,value)=>{const match=value.match(new RegExp(`^${type}\\s*\\+?([\\d,]+)`)); return sum+(match?numeric(match[1]):0);},0),0);}

/** API의 합산 치명 스탯을 내부 조정값으로 분해한다. 펫 수치는 포함 시 160으로 고정한다. */
export function createCriticalStatSnapshot(source:{apiTotal:number; evolutionT1Level:number; braceletStat:number; baselineEvolutionT1Level?:number; baselineBraceletStat?:number}):CriticalStatSnapshot {
 const apiTotal=Number.isFinite(source.apiTotal)?Math.max(0,source.apiTotal):0;
 const evolutionLevel=Number.isFinite(source.evolutionT1Level)?Math.max(0,source.evolutionT1Level):0;
 const braceletStat=Number.isFinite(source.braceletStat)?Math.max(0,source.braceletStat):0;
 const evolutionStat=evolutionLevel*50;
 const baselineEvolutionLevel=source.baselineEvolutionT1Level ?? evolutionLevel;
 const baselineEvolutionStat=(Number.isFinite(baselineEvolutionLevel) ? Math.max(0,baselineEvolutionLevel) : evolutionLevel)*50;
 const baselineBraceletStat=Number.isFinite(source.baselineBraceletStat ?? NaN) ? Math.max(0,source.baselineBraceletStat ?? 0) : braceletStat;
 const residual=Math.max(0,apiTotal-baselineEvolutionStat-baselineBraceletStat);
 const petIncluded=residual>200;
 const petStat=petIncluded?160:0;
 const characterBaseStat=Math.max(0,residual-petStat);
 const internalTotal=evolutionStat+braceletStat+petStat+characterBaseStat;
 return {apiTotal,evolutionStat,braceletStat,petStat,characterBaseStat,internalTotal,criticalRate:internalTotal*0.000357,petIncluded};
}

/** 기본 캐릭터 치명타 적중률 옵션을 UI 스냅샷과 내부 카탈로그 값만으로 합산한다. */
export function createCriticalRateOptionSnapshot(source:{criticalStat:CriticalStatSnapshot; accessories:readonly EquipmentProfile[]; bracelet?:EquipmentProfile; evolution:readonly {name:string; level:number|null}[]; engravings:readonly {name:string; grade:"유물"|"전설"; level:number}[]; stoneEffects:readonly {engraving:string; level:number}[]; arkGridCores?:readonly {name:string; grade?:string|null; description?:string|null; point?:number|null}[]}):CriticalRateOptionSnapshot {
 const statRate=source.criticalStat.criticalRate;
 const accessoryRate=source.accessories.reduce((total,item)=>total+item.options.reduce((sum,text)=>sum+(text.match(/^치명타 적중률\s*\+\s*([\d.]+)%/)?.[1] ? Number(text.match(/^치명타 적중률\s*\+\s*([\d.]+)%/)?.[1])/100 : 0),0),0);
 const braceletRate=(source.bracelet?.options??[]).reduce((total,text)=>{const option=findBraceletOption(text);return total+(option?.modifiers.filter((m)=>m.type==="criticalRatePct"||m.type==="enemyCriticalResistanceReductionPct").reduce((sum,m)=>sum+m.value/100,0)??0);},0);
 const evolutionRate=source.evolution.reduce((total,effect)=>{const perLevel:{[key:string]:number}={"예리한 감각":4,"혼신의 강타":12,"일격":10,"달인":7};return total+(perLevel[effect.name]??0)*(effect.level??0)/100;},0);
 const engravingRate=source.engravings.reduce((total,effect)=>total+engravingCriticalRatePercent(effect.name,effect.grade,effect.level)/100,0);
 const stoneRate=source.stoneEffects.reduce((total,effect)=>total+(effect.engraving==="정밀단도"?(PRECISION_DAGGER_STONE_CRITICAL_RATE_PERCENT[effect.level]??0)/100:0),0);
 const arkGridRate=(source.arkGridCores??[]).flatMap((core)=>resolveArkGridCommonCoreEffects(core)).filter((effect)=>effect.effect==="critRate").reduce((total,effect)=>total+(effect.value??0)/100,0);
 const total=statRate+accessoryRate+braceletRate+evolutionRate+engravingRate+stoneRate+arkGridRate;
 return {statRate,accessoryRate,braceletRate,evolutionRate,engravingRate,stoneRate,arkGridRate,total};
}
export function createCriticalDamageSnapshot(source:{accessories:readonly EquipmentProfile[]; bracelet?:EquipmentProfile; enlightenment:readonly {name:string; level:number|null}[]; engravings:readonly {name:string; grade:"유물"|"전설"; level:number}[]; stoneEffects:readonly {engraving:string; level:number}[]; arkGridCores?:readonly {name:string; grade?:string|null; description?:string|null; point?:number|null}[]}):CriticalDamageSnapshot {
 const base=2;
 const enlightenment=source.enlightenment.some((effect)=>/^절정\s*[I1]/.test(effect.name)||effect.name==="절정 II"||effect.name==="절정 III")?0.7:0;
 const engraving=source.engravings.reduce((total,effect)=>total
  + (effect.name==="예리한 둔기"?(effect.grade==="전설"?engravingValues.criticalDamage["예리한 둔기"]["전설4"]:(engravingValues.criticalDamage["예리한 둔기"] as Record<string,number>)[`유물${effect.level}`]??0):0)/100
  // 정밀단도는 등급·레벨과 무관하게 기본 치명타 피해량 6%를 감소시킨다.
  + (effect.name==="정밀단도"?PRECISION_DAGGER_CRITICAL_DAMAGE_RATE:0),0);
 const stone=source.stoneEffects.reduce((total,effect)=>total+(effect.engraving==="예리한 둔기"?(engravingValues.criticalDamage["어빌리티 스톤·예리한 둔기"] as Record<string,number>)[String(effect.level)]??0:0)/100,0);
 const optionRate=(text:string)=>Number(text.match(/치명타 피해(?:량)?\s*\+\s*([\d.]+)%/)?.[1]??0)/100;
 const accessories=source.accessories.reduce((total,item)=>total+item.options.reduce((sum,text)=>sum+optionRate(text),0),0);
 const bracelet=(source.bracelet?.options??[]).reduce((total,text)=>{const definition=findBraceletOption(text); return total+(definition?.modifiers.filter((modifier)=>modifier.type==="criticalDamagePct"||modifier.type==="enemyCriticalDamageResistanceReductionPct").reduce((sum,modifier)=>sum+modifier.value/100,0)??optionRate(text));},0);
 const arkGrid=(source.arkGridCores??[]).flatMap((core)=>resolveArkGridCommonCoreEffects(core)).filter((effect)=>effect.effect==="critDamage").reduce((total,effect)=>total+(effect.value??0)/100,0);
 return {base,enlightenment,engraving,stone,accessories,bracelet,arkGrid,total:base+enlightenment+engraving+stone+accessories+bracelet+arkGrid};
}
export function createCriticalOutgoingSnapshot(source:{evolution:readonly {name:string; level:number|null}[]; bracelet?:EquipmentProfile; arkGridCores?:readonly {name:string; grade?:string|null; description?:string|null; point?:number|null}[]}):CriticalOutgoingSnapshot {
 const classSynergy=0.08;
 const evolution=source.evolution.some((effect)=>effect.name==="회심")?0.12:0;
 const arkGrid=(source.arkGridCores??[]).flatMap((core)=>resolveArkGridCommonCoreEffects(core)).filter((effect)=>effect.effect==="critDamageToEnemy").reduce((total,effect)=>total+(effect.value??0)/100,0);
 const bracelet=(source.bracelet?.options??[]).reduce((total,text)=>{const definition=findBraceletOption(text);return total+(definition?.modifiers.filter((modifier)=>modifier.type==="enemyDamagePct"&&modifier.condition==="치명타 적중 시").reduce((sum,modifier)=>sum+modifier.value/100,0)??0);},0);
 return {classSynergy,evolution,arkGrid,bracelet,total:(1+classSynergy)*(1+evolution)*(1+arkGrid)*(1+bracelet)};
}
export function createAdditionalDamageSnapshot(source:{weaponQuality:number|null; accessories:readonly EquipmentProfile[]; evolution:readonly {name:string; level:number|null}[]; bracelet?:EquipmentProfile; arkGridCores?:readonly {name:string; grade?:string|null; description?:string|null; point?:number|null}[]; arkGridEffects?:readonly {name:string; level:number|null}[]}):AdditionalDamageSnapshot {
 const quality=Math.max(0,Math.min(100,source.weaponQuality??0));
 const weaponQuality=10+0.002*quality*quality;
 const accessories=source.accessories.reduce((total,item)=>total+item.options.reduce((sum,text)=>sum+Number(text.match(/^추가 피해\s*\+\s*([\d.]+)%/)?.[1]??0),0),0);
 const evolution=source.evolution.reduce((total,effect)=>total+(effect.name==="달인"?7*(effect.level??0):0),0);
 const bracelet=(source.bracelet?.options??[]).reduce((total,text)=>{const definition=findBraceletOption(text);return total+(definition?.modifiers.filter((modifier)=>modifier.type==="additionalDamagePct").reduce((sum,modifier)=>sum+modifier.value,0)??Number(text.match(/추피\s*\+\s*([\d.]+)%/)?.[1]??0));},0);
 const pet=1;
 const arkGridCore=(source.arkGridCores??[]).flatMap((core)=>resolveArkGridCommonCoreEffects(core)).filter((effect)=>effect.effect==="additionalDamage").reduce((total,effect)=>total+(effect.value??0),0);
 const arkGridGems=(source.arkGridEffects??[]).filter((effect)=>effect.name.includes("추가 피해")).reduce((total,effect)=>total+arkGridGemRate("additionalDamage",effect.level??0)*100,0);
 return {weaponQuality,accessories,evolution,bracelet,pet,arkGridCore,arkGridGems,total:weaponQuality+accessories+evolution+bracelet+pet+arkGridCore+arkGridGems};
}
/** 특정 타입 피해(현재는 악마·대악마 대상): 기본값과 팔찌의 악마 피해만 합산한다. */
export function createSpecificTypeDamageSnapshot(source:{bracelet?:EquipmentProfile}):SpecificTypeDamageSnapshot {
 const base=7.5;
 const bracelet=(source.bracelet?.options??[]).reduce((total,text)=>{
  const definition=findBraceletOption(text);
  return total+(definition?.modifiers.filter((modifier)=>modifier.type==="demonDamagePct").reduce((sum,modifier)=>sum+modifier.value,0)??0);
 },0);
 return {base,bracelet,total:base+bracelet};
}
export function createCardAttributeDamageSnapshot(vulnerable: boolean): CardAttributeDamageSnapshot {
 const base=15;
 const vulnerableMultiplier=vulnerable?1.1:1;
 return {base,vulnerableMultiplier,totalMultiplier:(1+base/100)*vulnerableMultiplier};
}
export function createBackAttackDamageSnapshot(engravings: readonly {name:string}[]): BackAttackDamageSnapshot {
 const baseMultiplier=1+engravingValues.backAttack.baseDamagePercent/100;
 const engravingMultiplier=engravings.some((engraving)=>engraving.name==="기습의 대가")?1+engravingValues.backAttack["기습의 대가"]/100:1;
 return {baseMultiplier,engravingMultiplier,totalMultiplier:baseMultiplier*engravingMultiplier};
}

/** 각인과 해당 어빌리티 스톤의 동일 효과는 먼저 합산하고, 각인 그룹끼리는 곱연산한다. */
export function createEngravingOutgoingDamageSnapshot(source: {
  engravings: readonly {name:string; grade:"유물"|"전설"; level:number; abilityStoneLevel?:number}[];
  stoneEffects: readonly {engraving:string; level:number}[];
}): EngravingOutgoingDamageSnapshot {
  const groups: Record<string, number> = {};
  for (const engraving of source.engravings) {
    const definition = (engravingValues.engravings as Record<string, { type:string; levels:Record<string,number> }>)[engraving.name];
    if (!definition || definition.type !== "outgoingDamage") continue;
    const gradeKey = engraving.grade === "전설" ? "전설4" : `유물${engraving.level}`;
    groups[engraving.name] = (groups[engraving.name] ?? 0) + (definition.levels[gradeKey] ?? 0);
  }
  for (const stone of source.stoneEffects) {
    const definition = (engravingValues.abilityStone as Record<string, { type:string; levels:Record<string,number> }>)[stone.engraving];
    if (!definition || definition.type !== "outgoingDamage") continue;
    groups[stone.engraving] = (groups[stone.engraving] ?? 0) + (definition.levels[String(stone.level)] ?? 0);
  }
  const totalMultiplier = Object.values(groups).reduce((product, percent) => product * (1 + percent / 100), 1);
  return { groups, totalMultiplier };
}

/** 적에게 주는 피해의 공통 배율. 각 분류 내부는 합산하지 않고, 독립 효과끼리 곱한다. */
export function createEnemyDamageSnapshot(source: {
  engravings: readonly {name:string; grade:"유물"|"전설"; level:number}[];
  stoneEffects: readonly {engraving:string; level:number}[];
  accessories: readonly EquipmentProfile[];
  bracelet?: EquipmentProfile;
  arkGridCores?: readonly {name:string; grade?:string|null; description?:string|null; point?:number|null}[];
  arkGridEffects?: readonly {name:string; level:number|null}[];
  enlightenment: readonly {name:string; level:number|null}[];
  moveSpeedPercent: number;
}): EnemyDamageSnapshot {
  const engravingSnapshot = createEngravingOutgoingDamageSnapshot({ engravings: source.engravings, stoneEffects: source.stoneEffects });
  const commanderEngraving = source.engravings.find((engraving) => engraving.name === "돌격대장");
  const commanderDefinition = (engravingValues.engravings as Record<string, { type:string; levels:Record<string,number> }>)["돌격대장"];
  const commanderGradeKey = commanderEngraving ? (commanderEngraving.grade === "전설" ? "전설4" : `유물${commanderEngraving.level}`) : "";
  const commanderRate = commanderDefinition?.levels[commanderGradeKey] ?? 0;
  const commanderStone = source.stoneEffects.filter((stone) => stone.engraving === "돌격대장").reduce((total, stone) => total + (((engravingValues.abilityStone as Record<string, { type:string; levels:Record<string,number> }>)["돌격대장"]?.levels[String(stone.level)] ?? 0)), 0);
  const effectiveMoveSpeed = Math.min(140, Math.max(100, source.moveSpeedPercent));
  const commanderDamage = (effectiveMoveSpeed - 100) * (commanderRate + commanderStone) / 100;
  const necklace = source.accessories.filter((item) => item.slot === "목걸이").reduce((total, item) => total + item.options.reduce((sum, text) => sum + Number(text.match(/적에게\s*주는\s*피해\s*\+\s*([\d.]+)%/)?.[1] ?? 0), 0), 0);
  const bracelet = (source.bracelet?.options ?? []).reduce((total, text) => {
    const definition = findBraceletOption(text);
    return total + (definition?.modifiers.filter((modifier) => modifier.type === "enemyDamagePct" && modifier.condition !== "치명타 적중 시").reduce((sum, modifier) => sum + modifier.value, 0) ?? 0);
  }, 0);
  const gems = (source.arkGridEffects ?? []).reduce((total, effect) => total + (effect.name.includes("보스 피해") ? arkGridGemRate("bossDamage", effect.level ?? 0) : 0), 0);
  const resolved = (source.arkGridCores ?? []).flatMap((core) =>
    core.name.includes("안정적인 공격") || core.name.includes("흡수의 일격") || core.name.includes("현란한 공격") || core.name.includes("불타는 일격")
      ? resolveArkGridCommonCoreEffects(core)
      : resolveArkGridOrderCoreEffects(core),
  );
  const coreMultiplier = (effects: readonly { value?: number | null }[]) => effects.reduce((product, effect) => product * (1 + (effect.value ?? 0) / 100), 1);
  const isDirectEnemyDamage = (effect: { effect?: string | null; originalEffect?: string | null }) =>
    effect.effect === "damageToEnemy" && /적에게\s*주는\s*피해/.test(effect.originalEffect ?? "");
  const coreValue = (coreNames: string[]) => coreMultiplier(resolved.filter((effect) => coreNames.some((name) => effect.coreName?.includes(name)) && isDirectEnemyDamage(effect)));
  const orderCore = coreMultiplier(resolved.filter((effect) => effect.area.startsWith("질서") && isDirectEnemyDamage(effect)));
  const chaosCore = coreValue(["흡수의 일격", "현란한 공격", "불타는 일격"]);
  const enlightenment = source.enlightenment.some((effect) => ["절정 I", "절정 II", "절정 III", "절정 Ⅰ", "절정 Ⅱ", "절정 Ⅲ"].includes(effect.name)) ? 25 : 0;
  const accessoriesBraceletMultiplier = (1 + necklace / 100) * (1 + bracelet / 100);
  const arkGridMultiplier = (1 + gems / 100) * orderCore * chaosCore;
  const enlightenmentMultiplier = 1 + enlightenment / 100;
  const totalMultiplier = engravingSnapshot.totalMultiplier * (1 + commanderDamage / 100) * accessoriesBraceletMultiplier * arkGridMultiplier * enlightenmentMultiplier;
  return { engravingAndStone: engravingSnapshot.totalMultiplier, commanderDamage, necklace, bracelet, gems, orderCore: (orderCore - 1) * 100, chaosCore: (chaosCore - 1) * 100, enlightenment, accessoriesBraceletMultiplier, arkGridMultiplier, enlightenmentMultiplier, totalMultiplier };
}
function braceletWeaponAttack(item:EquipmentProfile|undefined){return (item?.options??[]).reduce((total,text)=>{const option=findBraceletOption(text); if(!option) return total; return total+option.modifiers.filter((modifier)=>modifier.type==="weaponAttack").reduce((sum,modifier)=>{const stacks=modifier.condition?.includes("최대 6중첩")?6:modifier.condition?.includes("스택")?10:1; return sum+modifier.value*stacks;},0);},0);}
/** UI에서 확정된 스냅샷만 받는다. API 응답이나 API 전투 스탯은 받지 않는다. */
export function createCombatStatSnapshot(source:CombatStatSnapshotSource):CombatStatSnapshot{
 const type=primaryStatType();
 const gear=createInternalGearSnapshot(source.equipment.filter(i=>i.category==="gear")).primaryStat;
 const accessories=itemStats(source.equipment.filter(i=>["목걸이","귀걸이","반지"].includes(i.slot)),type);
 // UI에서 확인한 8,573은 펫 특기 1%가 이미 적용되어 반올림된 값이다. (8,488 × 1.01 = 8,572.88)
 const bracelet=itemStats(source.equipment.filter(i=>i.slot==="팔찌"),type); const base=8488; const petRate=.01;
 const avatarRate=["무기","머리","상의","하의"].reduce((s,slot)=>s+(source.avatarGrades[slot]==="전설"?.02:source.avatarGrades[slot]==="영웅"?.01:0),0);
 const subtotal=base+gear+accessories+bracelet+(source.azenaBonus ?? 0); return {base,gear,accessories,bracelet,subtotal,petRate,avatarRate,total:subtotal*(1+petRate+avatarRate)};
}

/** 무공도 장착 UI와 내부 장비·팔찌 카탈로그만으로 계산한다. */
export function createWeaponAttackSnapshot(source:{equipment:readonly EquipmentProfile[]; enlightenmentRate?:number; banquetBonus?:number; arkGridCores?:readonly {name:string; grade?:string|null; description?:string|null; point?:number|null}[]}):WeaponAttackSnapshot{
 const gear=createInternalGearSnapshot(source.equipment.filter((item)=>item.category==="gear")).weaponAttack;
 const accessories=source.equipment.filter((item)=>["목걸이","귀걸이","반지"].includes(item.slot));
 const accessoriesFlat=accessories.reduce((total,item)=>total+item.options.reduce((sum,option)=>sum+optionValue(option,false),0),0);
 const accessoriesRate=accessories.filter((item)=>item.slot==="귀걸이").reduce((total,item)=>total+item.options.reduce((sum,option)=>sum+optionValue(option,true)/100,0),0);
 const bracelet=braceletWeaponAttack(source.equipment.find((item)=>item.slot==="팔찌"));
 const commonCore=(source.arkGridCores??[]).flatMap((core)=>resolveArkGridCommonCoreEffects(core)).filter((effect)=>effect.effect==="weaponAttack");
 const arkGridFlat=commonCore.filter((effect)=>effect.operation==="flat_add").reduce((total,effect)=>total+(effect.value??0),0);
 const arkGridRate=commonCore.filter((effect)=>effect.operation==="rate_add").reduce((total,effect)=>total+(effect.value??0)/100,0);
 const enlightenmentRate=source.enlightenmentRate??0;
 const flatTotal=gear+accessoriesFlat+bracelet+arkGridFlat+(source.banquetBonus ?? 0);
 const rateTotal=accessoriesRate+enlightenmentRate+arkGridRate;
 return {gear,accessoriesFlat,bracelet,arkGridFlat,flatTotal,accessoriesRate,enlightenmentRate,arkGridRate,rateTotal,total:flatTotal*(1+rateTotal)};
}

/** C. 순수 공격력 = √(A. 최종 주 스탯 × B. 최종 무기 공격력 ÷ 6) */
export function createPureAttackPowerSnapshot(primaryStat:number, weaponAttack:number):PureAttackPowerSnapshot {
 if (!Number.isFinite(primaryStat) || !Number.isFinite(weaponAttack) || primaryStat < 0 || weaponAttack < 0) throw new Error("순수 공격력은 0 이상의 유한한 A·B 값이 필요합니다.");
 return { primaryStat, weaponAttack, total: Math.sqrt((primaryStat * weaponAttack) / 6) };
}

export function createBaseAttackPowerSnapshot(source:{pureAttackPower:number; gauntletFlat:number; gauntletRate:number; stoneLevels:readonly number[]; gems:readonly {name:string; type:string; level:number|null}[]}):BaseAttackPowerSnapshot {
 const stoneRate=source.stoneLevels.reduce((total,level)=>total+level,0)>=5?0.015:0;
 const gemRate=source.gems.reduce((total,gem)=>{
   if (gem.name.includes("멸화") || gem.name.includes("홍염")) return total;
   return gem.type==="겁화" || gem.type==="작열" || gem.name.includes("광휘") ? total+gemBaseAttackRate(gem.level) : total;
 },0);
 const rateTotal=source.gauntletRate+stoneRate+gemRate;
 return {pureAttackPower:source.pureAttackPower,gauntletFlat:source.gauntletFlat,gauntletRate:source.gauntletRate,stoneRate,gemRate,rateTotal,total:(source.pureAttackPower+source.gauntletFlat)*(1+rateTotal)};
}

/** E. 최종 공격력 = (D + 공격력 고정 증가) × (1 + 공격력 증가율 합계) */
export function createFinalAttackPowerSnapshot(source:{baseAttackPower:number; equipment:readonly EquipmentProfile[]; arkGridEffects:readonly {name:string; level:number|null}[]; arkGridCores?:readonly {name:string; grade?:string|null; description?:string|null; point?:number|null}[]; engravings:readonly {name:string}[]; stoneEffects:readonly {engraving:string; level:number}[]}):FinalAttackPowerSnapshot {
 const accessories=source.equipment.filter((item)=>["목걸이","귀걸이","반지"].includes(item.slot));
 const accessoriesFlat=accessories.reduce((total,item)=>total+item.options.reduce((sum,option)=>sum+attackPowerOptionValue(option,false),0),0);
 const accessoriesRate=accessories.filter((item)=>item.slot==="귀걸이").reduce((total,item)=>total+item.options.reduce((sum,option)=>sum+attackPowerOptionValue(option,true)/100,0),0);
 const arkGridRate=source.arkGridEffects.filter((effect)=>effect.name.includes("공격력")).reduce((total,effect)=>total+arkGridGemRate("attack",effect.level??0),0);
 const commonCore= (source.arkGridCores??[]).flatMap((core)=>resolveArkGridCommonCoreEffects(core)).filter((effect)=>effect.effect==="attackPower");
 const arkGridFlat=commonCore.filter((effect)=>effect.operation==="flat_add").reduce((total,effect)=>total+(effect.value??0),0);
 const arkGridCoreRate=commonCore.filter((effect)=>effect.operation==="rate_add").reduce((total,effect)=>total+(effect.value??0)/100,0);
 const adrenalineEngravingRate=source.engravings.some((engraving)=>engraving.name==="아드레날린")?ADRENALINE_ENGRAVING_ATTACK_RATE:0;
 const adrenalineStoneRate=source.stoneEffects.filter((effect)=>effect.engraving==="아드레날린").reduce((total,effect)=>total+adrenalineStoneAttackRate(effect.level),0);
 const rateTotal=accessoriesRate+arkGridRate+arkGridCoreRate+adrenalineEngravingRate+adrenalineStoneRate;
 return {baseAttackPower:source.baseAttackPower,accessoriesFlat,arkGridFlat,accessoriesRate,arkGridRate:arkGridRate+arkGridCoreRate,adrenalineEngravingRate,adrenalineStoneRate,rateTotal,total:(source.baseAttackPower+accessoriesFlat+arkGridFlat)*(1+rateTotal)};
}
