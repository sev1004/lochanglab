import type { EquipmentProfile } from "../character/equipment-parser.ts";
import { createInternalGearSnapshot } from "./internal-gear-snapshot.ts";
import { findBraceletOption } from "../bracelet/bracelet-catalog.ts";
import { gemBaseAttackRate } from "../../data/gem-base-attack-rate.ts";
import { adrenalineStoneAttackRate, ADRENALINE_ENGRAVING_ATTACK_RATE } from "../../data/attack-power-effects.ts";
import { arkGridGemRate } from "../../data/ark-grid-gem-values.ts";
import { resolveArkGridCommonCoreEffects } from "../../data/ark-grid-common-core.ts";
export type CombatStatSnapshot = { base:number; gear:number; accessories:number; bracelet:number; subtotal:number; petRate:number; avatarRate:number; total:number };
export type WeaponAttackSnapshot = { gear:number; accessoriesFlat:number; bracelet:number; arkGridFlat:number; flatTotal:number; accessoriesRate:number; enlightenmentRate:number; arkGridRate:number; rateTotal:number; total:number };
export type PureAttackPowerSnapshot = { primaryStat:number; weaponAttack:number; total:number };
export type BaseAttackPowerSnapshot = { pureAttackPower:number; gauntletFlat:number; gauntletRate:number; stoneRate:number; gemRate:number; rateTotal:number; total:number };
export type FinalAttackPowerSnapshot = { baseAttackPower:number; accessoriesFlat:number; arkGridFlat:number; accessoriesRate:number; arkGridRate:number; adrenalineEngravingRate:number; adrenalineStoneRate:number; rateTotal:number; total:number };
export type CombatStatSnapshotSource = { equipment: readonly EquipmentProfile[]; avatarGrades: Record<string, string> };
function numeric(value:string){const n=Number(value.replaceAll(",","").replace(/[^\d.-]/g,""));return Number.isFinite(n)?n:0;}
// 창술사의 계산용 주 스탯은 힘이다. 이 값은 API 표기값이 아니라 직업 규칙이다.
function primaryStatType() { return "힘"; }
function itemStats(items:readonly EquipmentProfile[], type:string){const re=new RegExp(`^${type}\\s*\\+?([\\d,]+)`); return items.reduce((s,item)=>s+item.baseStats.reduce((t,stat)=>{const m=stat.match(re); const rawNumeric=/^[\d,]+$/.test(stat.trim()); return t+(m?numeric(m[1]):rawNumeric?numeric(stat):0);},0),0);}
function optionValue(option:string, percent:boolean){const match=option.match(/무기\s*공격력\s*\+\s*([\d.]+)\s*(%?)/); return match && (match[2]==="%")===percent ? Number(match[1]) : 0;}
function attackPowerOptionValue(option:string, percent:boolean){const match=option.trim().match(/^공격력\s*\+\s*([\d.]+)\s*(%?)/); return match && (match[2]==="%")===percent ? Number(match[1]) : 0;}
function braceletWeaponAttack(item:EquipmentProfile|undefined){return (item?.options??[]).reduce((total,text)=>{const option=findBraceletOption(text); if(!option) return total; return total+option.modifiers.filter((modifier)=>modifier.type==="weaponAttack").reduce((sum,modifier)=>{const stacks=modifier.condition?.includes("최대 6중첩")?6:modifier.condition?.includes("스택")?10:1; return sum+modifier.value*stacks;},0);},0);}
/** UI에서 확정된 스냅샷만 받는다. API 응답이나 API 전투 스탯은 받지 않는다. */
export function createCombatStatSnapshot(source:CombatStatSnapshotSource):CombatStatSnapshot{
 const type=primaryStatType();
 const gear=createInternalGearSnapshot(source.equipment.filter(i=>i.category==="gear")).primaryStat;
 const accessories=itemStats(source.equipment.filter(i=>["목걸이","귀걸이","반지"].includes(i.slot)),type);
 // UI에서 확인한 8,573은 펫 특기 1%가 이미 적용되어 반올림된 값이다. (8,488 × 1.01 = 8,572.88)
 const bracelet=itemStats(source.equipment.filter(i=>i.slot==="팔찌"),type); const base=8488; const petRate=.01;
 const avatarRate=["무기","머리","상의","하의"].reduce((s,slot)=>s+(source.avatarGrades[slot]==="전설"?.02:source.avatarGrades[slot]==="영웅"?.01:0),0);
 const subtotal=base+gear+accessories+bracelet; return {base,gear,accessories,bracelet,subtotal,petRate,avatarRate,total:subtotal*(1+petRate+avatarRate)};
}

/** 무공도 장착 UI와 내부 장비·팔찌 카탈로그만으로 계산한다. */
export function createWeaponAttackSnapshot(source:{equipment:readonly EquipmentProfile[]; enlightenmentRate?:number; arkGridCores?:readonly {name:string; grade?:string|null; description?:string|null; point?:number|null}[]}):WeaponAttackSnapshot{
 const gear=createInternalGearSnapshot(source.equipment.filter((item)=>item.category==="gear")).weaponAttack;
 const accessories=source.equipment.filter((item)=>["목걸이","귀걸이","반지"].includes(item.slot));
 const accessoriesFlat=accessories.reduce((total,item)=>total+item.options.reduce((sum,option)=>sum+optionValue(option,false),0),0);
 const accessoriesRate=accessories.filter((item)=>item.slot==="귀걸이").reduce((total,item)=>total+item.options.reduce((sum,option)=>sum+optionValue(option,true)/100,0),0);
 const bracelet=braceletWeaponAttack(source.equipment.find((item)=>item.slot==="팔찌"));
 const commonCore=(source.arkGridCores??[]).flatMap((core)=>resolveArkGridCommonCoreEffects(core)).filter((effect)=>effect.effect==="weaponAttack");
 const arkGridFlat=commonCore.filter((effect)=>effect.operation==="flat_add").reduce((total,effect)=>total+(effect.value??0),0);
 const arkGridRate=commonCore.filter((effect)=>effect.operation==="rate_add").reduce((total,effect)=>total+(effect.value??0)/100,0);
 const enlightenmentRate=source.enlightenmentRate??0;
 const flatTotal=gear+accessoriesFlat+bracelet+arkGridFlat;
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
