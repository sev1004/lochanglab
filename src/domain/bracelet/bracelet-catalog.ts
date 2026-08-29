export type BraceletOptionRank = "하" | "중" | "상";

export type BraceletModifierType =
  | "magicDefense"
  | "physicalDefense"
  | "combatHpRecovery"
  | "combatResourceRecoveryPct"
  | "maxHp"
  | "ccImmunitySeconds"
  | "seedDamageTakenReductionPct"
  | "seedDamagePct"
  | "attackMoveSpeedPct"
  | "mobilityCooldownReductionPct"
  | "weaponAttack"
  | "additionalDamagePct"
  | "criticalRatePct"
  | "criticalDamagePct"
  | "enemyDamagePct"
  | "staggeredEnemyDamagePct"
  | "nonDirectionalSkillDamagePct"
  | "backAttackSkillDamagePct"
  | "headAttackSkillDamagePct"
  | "allyAttackBuffPct"
  | "allyDamageBuffPct"
  | "enemyDefenseReductionPct"
  | "enemyCriticalResistanceReductionPct"
  | "enemyCriticalDamageResistanceReductionPct"
  | "demonDamagePct"
  | "protectedTargetDamagePct"
  | "shieldAndHealPct"
  | "skillCooldownIncreasePct";

export type BraceletModifier = {
  type: BraceletModifierType;
  value: number;
  unit: "flat" | "percent" | "seconds";
  condition?: string;
};

export type BraceletOptionDefinition = {
  id: string;
  family: string;
  group: "공격" | "지원" | "방어·유틸";
  selectable: boolean;
  rank: BraceletOptionRank;
  label: string;
  apiText: string[];
  modifiers: BraceletModifier[];
};

const RANKS: BraceletOptionRank[] = ["하", "중", "상"];

type TieredFamily = {
  id: string;
  family: string;
  group: BraceletOptionDefinition["group"];
  labels: [string, string, string];
  apiText: [string[], string[], string[]];
  modifiers: [BraceletModifier[], BraceletModifier[], BraceletModifier[]];
};

function tiered(definition: TieredFamily): BraceletOptionDefinition[] {
  return RANKS.map((rank, index) => ({
    id: `${definition.id}-${["low", "mid", "high"][index]}`,
    family: definition.family,
    group: definition.group,
    selectable: !NON_DPS_BRACELET_FAMILIES.has(definition.family),
    rank,
    label: definition.labels[index],
    apiText: definition.apiText[index],
    modifiers: definition.modifiers[index],
  }));
}

const flat = (type: BraceletModifierType, values: [number, number, number], condition?: string): [BraceletModifier[], BraceletModifier[], BraceletModifier[]] =>
  values.map((value) => [{ type, value, unit: "flat", condition }]) as [BraceletModifier[], BraceletModifier[], BraceletModifier[]];

const percent = (type: BraceletModifierType, values: [number, number, number], condition?: string): [BraceletModifier[], BraceletModifier[], BraceletModifier[]] =>
  values.map((value) => [{ type, value, unit: "percent", condition }]) as [BraceletModifier[], BraceletModifier[], BraceletModifier[]];

const simpleApi = (texts: [string, string, string]): [string[], string[], string[]] => texts.map((text) => [text]) as [string[], string[], string[]];

// 현재 장착 정보에는 남기되, 창술사 개인 DPS 시뮬레이션 선택지에서는 제외한다.
const NON_DPS_BRACELET_FAMILIES = new Set([
  "마법 방어력",
  "물리 방어력",
  "전투 중 생명력 회복량",
  "전투자원 자연 회복량",
  "최대 생명력",
  "경직·피격이상 면역",
  "시드 이하 받는 피해 감소",
  "시드 이하 주는 피해",
  "이동기 및 기상기 재사용 대기시간",
  "아군 공격력 강화",
  "아군 피해량 강화",
  "보호 대상 피해·아공강",
  "파티 보호 및 회복",
]);

export const BRACELET_OPTION_CATALOG: BraceletOptionDefinition[] = [
  ...tiered({ id: "magic-defense", family: "마법 방어력", group: "방어·유틸", labels: ["마법 방어력 +5000", "마법 방어력 +6000", "마법 방어력 +7000"], apiText: simpleApi(["마법 방어력 +5000", "마법 방어력 +6000", "마법 방어력 +7000"]), modifiers: flat("magicDefense", [5000, 6000, 7000]) }),
  ...tiered({ id: "physical-defense", family: "물리 방어력", group: "방어·유틸", labels: ["물리 방어력 +5000", "물리 방어력 +6000", "물리 방어력 +7000"], apiText: simpleApi(["물리 방어력 +5000", "물리 방어력 +6000", "물리 방어력 +7000"]), modifiers: flat("physicalDefense", [5000, 6000, 7000]) }),
  ...tiered({ id: "combat-hp-recovery", family: "전투 중 생명력 회복량", group: "방어·유틸", labels: ["전투 중 생명력 회복량 +100", "전투 중 생명력 회복량 +130", "전투 중 생명력 회복량 +160"], apiText: simpleApi(["전투 중 생명력 회복량 +100", "전투 중 생명력 회복량 +130", "전투 중 생명력 회복량 +160"]), modifiers: flat("combatHpRecovery", [100, 130, 160]) }),
  ...tiered({ id: "resource-recovery", family: "전투자원 자연 회복량", group: "방어·유틸", labels: ["전투자원 자연 회복량 +8%", "전투자원 자연 회복량 +10%", "전투자원 자연 회복량 +12%"], apiText: simpleApi(["전투자원 자연 회복량 +8.00%", "전투자원 자연 회복량 +10.00%", "전투자원 자연 회복량 +12.00%"]), modifiers: percent("combatResourceRecoveryPct", [8, 10, 12]) }),
  ...tiered({ id: "max-hp", family: "최대 생명력", group: "방어·유틸", labels: ["최대 생명력 +11200", "최대 생명력 +14000", "최대 생명력 +16800"], apiText: simpleApi(["최대 생명력 +11200", "최대 생명력 +14000", "최대 생명력 +16800"]), modifiers: flat("maxHp", [11200, 14000, 16800]) }),
  ...tiered({ id: "cc-immunity", family: "경직·피격이상 면역", group: "방어·유틸", labels: ["공격 적중 시 80초간 경피면", "공격 적중 시 70초간 경피면", "공격 적중 시 60초간 경피면"], apiText: simpleApi(["공격 적중 시 80초 동안 경직 및 피격 이상에 면역", "공격 적중 시 70초 동안 경직 및 피격 이상에 면역", "공격 적중 시 60초 동안 경직 및 피격 이상에 면역"]), modifiers: [80, 70, 60].map((value) => [{ type: "ccImmunitySeconds", value, unit: "seconds", condition: "공격 적중 시 1회, 재사용 대기시간은 동일 시간" }]) as [BraceletModifier[], BraceletModifier[], BraceletModifier[]] }),
  ...tiered({ id: "seed-damage-taken", family: "시드 이하 받는 피해 감소", group: "방어·유틸", labels: ["시드 이하 받는 피해 -6%", "시드 이하 받는 피해 -8%", "시드 이하 받는 피해 -10%"], apiText: simpleApi(["시드 등급 이하 몬스터에게 받는 피해량이 6% 감소", "시드 등급 이하 몬스터에게 받는 피해량이 8% 감소", "시드 등급 이하 몬스터에게 받는 피해량이 10% 감소"]), modifiers: percent("seedDamageTakenReductionPct", [6, 8, 10], "시드 이하") }),
  ...tiered({ id: "seed-damage", family: "시드 이하 주는 피해", group: "공격", labels: ["시드 이하 몬스터 피해 +4%", "시드 이하 몬스터 피해 +5%", "시드 이하 몬스터 피해 +6%"], apiText: simpleApi(["시드 등급 이하 몬스터에게 주는 피해량이 4% 증가", "시드 등급 이하 몬스터에게 주는 피해량이 5% 증가", "시드 등급 이하 몬스터에게 주는 피해량이 6% 증가"]), modifiers: percent("seedDamagePct", [4, 5, 6], "시드 이하") }),
  ...tiered({ id: "attack-move-speed", family: "공격 및 이동 속도", group: "공격", labels: ["공이속 +4%", "공이속 +5%", "공이속 +6%"], apiText: simpleApi(["공격 및 이동 속도가 4% 증가", "공격 및 이동 속도가 5% 증가", "공격 및 이동 속도가 6% 증가"]), modifiers: percent("attackMoveSpeedPct", [4, 5, 6]) }),
  ...tiered({ id: "mobility-cooldown", family: "이동기 및 기상기 재사용 대기시간", group: "방어·유틸", labels: ["이동기 및 기상기 쿨감 +8%", "이동기 및 기상기 쿨감 +10%", "이동기 및 기상기 쿨감 +12%"], apiText: simpleApi(["이동기 및 기상기 재사용 대기 시간이 8% 감소", "이동기 및 기상기 재사용 대기 시간이 10% 감소", "이동기 및 기상기 재사용 대기 시간이 12% 감소"]), modifiers: percent("mobilityCooldownReductionPct", [8, 10, 12]) }),
  ...tiered({ id: "weapon-attack", family: "무기 공격력", group: "공격", labels: ["무기 공격력 +7200", "무기 공격력 +8100", "무기 공격력 +9000"], apiText: simpleApi(["무기 공격력 +7200", "무기 공격력 +8100", "무기 공격력 +9000"]), modifiers: flat("weaponAttack", [7200, 8100, 9000]) }),
  ...tiered({ id: "additional-damage", family: "추가 피해", group: "공격", labels: ["추가 피해 +3.0%", "추가 피해 +3.5%", "추가 피해 +4.0%"], apiText: simpleApi(["추가 피해 +3.00%", "추가 피해 +3.50%", "추가 피해 +4.00%"]), modifiers: percent("additionalDamagePct", [3, 3.5, 4]) }),
  ...tiered({ id: "critical-rate", family: "치명타 적중률", group: "공격", labels: ["치명타 적중률 +3.40%", "치명타 적중률 +4.20%", "치명타 적중률 +5.00%"], apiText: simpleApi(["치명타 적중률 +3.40%", "치명타 적중률 +4.20%", "치명타 적중률 +5.00%"]), modifiers: percent("criticalRatePct", [3.4, 4.2, 5]) }),
  ...tiered({ id: "critical-damage", family: "치명타 피해", group: "공격", labels: ["치명타 피해 +6.8%", "치명타 피해 +8.4%", "치명타 피해 +10.0%"], apiText: simpleApi(["치명타 피해 +6.80%", "치명타 피해 +8.40%", "치명타 피해 +10.00%"]), modifiers: percent("criticalDamagePct", [6.8, 8.4, 10]) }),
  ...tiered({ id: "on-hit-weapon-attack-speed", family: "적중 중첩 무공·공이속", group: "공격", labels: ["공격 적중 시 무공 1160, 공이속 1%", "공격 적중 시 무공 1320, 공이속 1%", "공격 적중 시 무공 1480, 공이속 1%"], apiText: simpleApi(["공격 적중 시 매 초마다 10초 동안 무기 공격력이 1160, 공격 및 이동 속도가 1% 증가", "공격 적중 시 매 초마다 10초 동안 무기 공격력이 1320, 공격 및 이동 속도가 1% 증가", "공격 적중 시 매 초마다 10초 동안 무기 공격력이 1480, 공격 및 이동 속도가 1% 증가"]), modifiers: [1160, 1320, 1480].map((value) => [{ type: "weaponAttack", value, unit: "flat", condition: "공격 적중, 최대 6중첩" }, { type: "attackMoveSpeedPct", value: 1, unit: "percent", condition: "공격 적중, 최대 6중첩" }]) as [BraceletModifier[], BraceletModifier[], BraceletModifier[]] }),
  ...tiered({ id: "hit-master-damage", family: "비방향성 스킬 피해", group: "공격", labels: ["타대 스킬 피해 +2.5%", "타대 스킬 피해 +3.0%", "타대 스킬 피해 +3.5%"], apiText: simpleApi(["방향성 공격이 아닌 스킬이 적에게 주는 피해가 2.5% 증가", "방향성 공격이 아닌 스킬이 적에게 주는 피해가 3% 증가", "방향성 공격이 아닌 스킬이 적에게 주는 피해가 3.5% 증가"]), modifiers: percent("nonDirectionalSkillDamagePct", [2.5, 3, 3.5], "각성기 제외") }),
  ...tiered({ id: "back-attack-damage", family: "백어택 스킬 피해", group: "공격", labels: ["백어택 스킬 피해 +2.5%", "백어택 스킬 피해 +3.0%", "백어택 스킬 피해 +3.5%"], apiText: simpleApi(["백어택 스킬이 적에게 주는 피해가 2.5% 증가", "백어택 스킬이 적에게 주는 피해가 3% 증가", "백어택 스킬이 적에게 주는 피해가 3.5% 증가"]), modifiers: percent("backAttackSkillDamagePct", [2.5, 3, 3.5]) }),
  ...tiered({ id: "enemy-stagger-damage", family: "적주피·무력화 피해", group: "공격", labels: ["적주피 +2% | 무력화 적 피해량 +4%", "적주피 +2.5% | 무력화 적 피해량 +4.5%", "적주피 +3% | 무력화 적 피해량 +5%"], apiText: simpleApi(["적에게 주는 피해가 2% 증가하며, 무력화 상태의 적에게 주는 피해가 4% 증가", "적에게 주는 피해가 2.5% 증가하며, 무력화 상태의 적에게 주는 피해가 4.5% 증가", "적에게 주는 피해가 3% 증가하며, 무력화 상태의 적에게 주는 피해가 5% 증가"]), modifiers: [[{ type: "enemyDamagePct", value: 2, unit: "percent" }, { type: "staggeredEnemyDamagePct", value: 4, unit: "percent", condition: "무력화 상태" }], [{ type: "enemyDamagePct", value: 2.5, unit: "percent" }, { type: "staggeredEnemyDamagePct", value: 4.5, unit: "percent", condition: "무력화 상태" }], [{ type: "enemyDamagePct", value: 3, unit: "percent" }, { type: "staggeredEnemyDamagePct", value: 5, unit: "percent", condition: "무력화 상태" }]] }),
  ...tiered({ id: "enemy-damage", family: "적에게 주는 피해", group: "공격", labels: ["적에게 주는 피해 +2%", "적에게 주는 피해 +2.5%", "적에게 주는 피해 +3%"], apiText: simpleApi(["적에게 주는 피해가 2% 증가", "적에게 주는 피해가 2.5% 증가", "적에게 주는 피해가 3% 증가"]), modifiers: percent("enemyDamagePct", [2, 2.5, 3]) }),
  ...tiered({ id: "head-attack-damage", family: "헤드어택 스킬 피해", group: "공격", labels: ["헤드어택 스킬 피해 +2.5%", "헤드어택 스킬 피해 +3.0%", "헤드어택 스킬 피해 +3.5%"], apiText: simpleApi(["헤드어택 스킬이 적에게 주는 피해가 2.5% 증가", "헤드어택 스킬이 적에게 주는 피해가 3% 증가", "헤드어택 스킬이 적에게 주는 피해가 3.5% 증가"]), modifiers: percent("headAttackSkillDamagePct", [2.5, 3, 3.5]) }),
  ...tiered({ id: "ally-attack-buff", family: "아군 공격력 강화", group: "지원", labels: ["아군 공격력 강화 +4.0%", "아군 공격력 강화 +5.0%", "아군 공격력 강화 +6.0%"], apiText: simpleApi(["아군 공격력 강화 효과 +4.00%", "아군 공격력 강화 효과 +5.00%", "아군 공격력 강화 효과 +6.00%"]), modifiers: percent("allyAttackBuffPct", [4, 5, 6]) }),
  ...tiered({ id: "ally-damage-buff", family: "아군 피해량 강화", group: "지원", labels: ["아군 피해량 강화 +6.0%", "아군 피해량 강화 +7.5%", "아군 피해량 강화 +9.0%"], apiText: simpleApi(["아군 피해량 강화 효과 +6.00%", "아군 피해량 강화 효과 +7.50%", "아군 피해량 강화 효과 +9.00%"]), modifiers: percent("allyDamageBuffPct", [6, 7.5, 9]) }),
  ...tiered({ id: "defense-reduction-party-attack", family: "방어력 감소·아공강", group: "지원", labels: ["방깎 1.8% | 아공강 +2.0%", "방깎 2.1% | 아공강 +2.5%", "방깎 2.5% | 아공강 +3.0%"], apiText: [["대상의 방어력을 1.8% 감소", "아군 공격력 강화 효과가 2% 증가"], ["대상의 방어력을 2.1% 감소", "아군 공격력 강화 효과가 2.5% 증가"], ["대상의 방어력을 2.5% 감소", "아군 공격력 강화 효과가 3% 증가"]], modifiers: [[{ type: "enemyDefenseReductionPct", value: 1.8, unit: "percent", condition: "공격 적중 시 8초" }, { type: "allyAttackBuffPct", value: 2, unit: "percent" }], [{ type: "enemyDefenseReductionPct", value: 2.1, unit: "percent", condition: "공격 적중 시 8초" }, { type: "allyAttackBuffPct", value: 2.5, unit: "percent" }], [{ type: "enemyDefenseReductionPct", value: 2.5, unit: "percent", condition: "공격 적중 시 8초" }, { type: "allyAttackBuffPct", value: 3, unit: "percent" }]] }),
  ...tiered({ id: "crit-resistance-party-attack", family: "치명타 저항 감소·아공강", group: "지원", labels: ["치명타 저항 -1.8% | 아공강 +2.0%", "치명타 저항 -2.1% | 아공강 +2.5%", "치명타 저항 -2.5% | 아공강 +3.0%"], apiText: [["대상의 치명타 저항을 1.8% 감소", "아군 공격력 강화 효과가 2% 증가"], ["대상의 치명타 저항을 2.1% 감소", "아군 공격력 강화 효과가 2.5% 증가"], ["대상의 치명타 저항을 2.5% 감소", "아군 공격력 강화 효과가 3% 증가"]], modifiers: [[{ type: "enemyCriticalResistanceReductionPct", value: 1.8, unit: "percent", condition: "공격 적중 시 8초" }, { type: "allyAttackBuffPct", value: 2, unit: "percent" }], [{ type: "enemyCriticalResistanceReductionPct", value: 2.1, unit: "percent", condition: "공격 적중 시 8초" }, { type: "allyAttackBuffPct", value: 2.5, unit: "percent" }], [{ type: "enemyCriticalResistanceReductionPct", value: 2.5, unit: "percent", condition: "공격 적중 시 8초" }, { type: "allyAttackBuffPct", value: 3, unit: "percent" }]] }),
  ...tiered({ id: "crit-damage-resistance-party-attack", family: "치명타 피해 저항 감소·아공강", group: "지원", labels: ["치명타 피해 저항 -3.6% | 아공강 +2.0%", "치명타 피해 저항 -4.2% | 아공강 +2.5%", "치명타 피해 저항 -4.8% | 아공강 +3.0%"], apiText: [["대상의 치명타 피해 저항을 3.6% 감소", "아군 공격력 강화 효과가 2% 증가"], ["대상의 치명타 피해 저항을 4.2% 감소", "아군 공격력 강화 효과가 2.5% 증가"], ["대상의 치명타 피해 저항을 4.8% 감소", "아군 공격력 강화 효과가 3% 증가"]], modifiers: [[{ type: "enemyCriticalDamageResistanceReductionPct", value: 3.6, unit: "percent", condition: "공격 적중 시 8초" }, { type: "allyAttackBuffPct", value: 2, unit: "percent" }], [{ type: "enemyCriticalDamageResistanceReductionPct", value: 4.2, unit: "percent", condition: "공격 적중 시 8초" }, { type: "allyAttackBuffPct", value: 2.5, unit: "percent" }], [{ type: "enemyCriticalDamageResistanceReductionPct", value: 4.8, unit: "percent", condition: "공격 적중 시 8초" }, { type: "allyAttackBuffPct", value: 3, unit: "percent" }]] }),
  ...tiered({ id: "stacking-weapon-attack", family: "기본·중첩 무기 공격력", group: "공격", labels: ["무공 6900 | 스택당 무공 130", "무공 7800 | 스택당 무공 140", "무공 8700 | 스택당 무공 150"], apiText: [["무기 공격력이 6900 증가", "30초 마다 120초 동안 무기 공격력이 130 증가"], ["무기 공격력이 7800 증가", "30초 마다 120초 동안 무기 공격력이 140 증가"], ["무기 공격력이 8700 증가", "30초 마다 120초 동안 무기 공격력이 150 증가"]], modifiers: [[{ type: "weaponAttack", value: 6900, unit: "flat" }, { type: "weaponAttack", value: 130, unit: "flat", condition: "공격 적중 시 30초마다, 120초, 최대 30중첩" }], [{ type: "weaponAttack", value: 7800, unit: "flat" }, { type: "weaponAttack", value: 140, unit: "flat", condition: "공격 적중 시 30초마다, 120초, 최대 30중첩" }], [{ type: "weaponAttack", value: 8700, unit: "flat" }, { type: "weaponAttack", value: 150, unit: "flat", condition: "공격 적중 시 30초마다, 120초, 최대 30중첩" }]] }),
  ...tiered({ id: "conditional-weapon-attack", family: "기본·조건부 무기 공격력", group: "공격", labels: ["무공 7200 | 조건부 무공 2000", "무공 8100 | 조건부 무공 2200", "무공 9000 | 조건부 무공 2400"], apiText: [["무기 공격력이 7200 증가", "생명력이 50% 이상일 경우 적에게 공격 적중 시 5초 동안 무기 공격력이 2000 증가"], ["무기 공격력이 8100 증가", "생명력이 50% 이상일 경우 적에게 공격 적중 시 5초 동안 무기 공격력이 2200 증가"], ["무기 공격력이 9000 증가", "생명력이 50% 이상일 경우 적에게 공격 적중 시 5초 동안 무기 공격력이 2400 증가"]], modifiers: [[{ type: "weaponAttack", value: 7200, unit: "flat" }, { type: "weaponAttack", value: 2000, unit: "flat", condition: "생명력 50% 이상, 공격 적중 시 5초" }], [{ type: "weaponAttack", value: 8100, unit: "flat" }, { type: "weaponAttack", value: 2200, unit: "flat", condition: "생명력 50% 이상, 공격 적중 시 5초" }], [{ type: "weaponAttack", value: 9000, unit: "flat" }, { type: "weaponAttack", value: 2400, unit: "flat", condition: "생명력 50% 이상, 공격 적중 시 5초" }]] }),
  ...tiered({ id: "cooldown-enemy-damage", family: "쿨타임 증가·적주피", group: "공격", labels: ["쿨 +2% | 적에게 주는 피해 +4.5%", "쿨 +2% | 적에게 주는 피해 +5.0%", "쿨 +2% | 적에게 주는 피해 +5.5%"], apiText: simpleApi(["스킬의 재사용 대기 시간이 2% 증가하지만, 적에게 주는 피해가 4.5% 증가", "스킬의 재사용 대기 시간이 2% 증가하지만, 적에게 주는 피해가 5% 증가", "스킬의 재사용 대기 시간이 2% 증가하지만, 적에게 주는 피해가 5.5% 증가"]), modifiers: [[{ type: "skillCooldownIncreasePct", value: 2, unit: "percent" }, { type: "enemyDamagePct", value: 4.5, unit: "percent" }], [{ type: "skillCooldownIncreasePct", value: 2, unit: "percent" }, { type: "enemyDamagePct", value: 5, unit: "percent" }], [{ type: "skillCooldownIncreasePct", value: 2, unit: "percent" }, { type: "enemyDamagePct", value: 5.5, unit: "percent" }]] }),
  ...tiered({ id: "additional-demon-damage", family: "추피·악마 피해", group: "공격", labels: ["추피 +2.5% | 악마&대악마 피해량 +2.5%", "추피 +3.0% | 악마&대악마 피해량 +2.5%", "추피 +3.5% | 악마&대악마 피해량 +2.5%"], apiText: [["추가 피해가 2.5% 증가", "악마 및 대악마 계열 피해량이 2.5% 증가"], ["추가 피해가 3% 증가", "악마 및 대악마 계열 피해량이 2.5% 증가"], ["추가 피해가 3.5% 증가", "악마 및 대악마 계열 피해량이 2.5% 증가"]], modifiers: [[{ type: "additionalDamagePct", value: 2.5, unit: "percent" }, { type: "demonDamagePct", value: 2.5, unit: "percent", condition: "악마 및 대악마" }], [{ type: "additionalDamagePct", value: 3, unit: "percent" }, { type: "demonDamagePct", value: 2.5, unit: "percent", condition: "악마 및 대악마" }], [{ type: "additionalDamagePct", value: 3.5, unit: "percent" }, { type: "demonDamagePct", value: 2.5, unit: "percent", condition: "악마 및 대악마" }]] }),
  ...tiered({ id: "critical-rate-on-crit", family: "치적·치명타 적중 피해", group: "공격", labels: ["치적 +3.4% | 치명타 주는 피해 +1.5%", "치적 +4.2% | 치명타 주는 피해 +1.5%", "치적 +5.0% | 치명타 주는 피해 +1.5%"], apiText: [["치명타 적중률이 3.4% 증가", "공격이 치명타로 적중 시 적에게 주는 피해가 1.5% 증가"], ["치명타 적중률이 4.2% 증가", "공격이 치명타로 적중 시 적에게 주는 피해가 1.5% 증가"], ["치명타 적중률이 5% 증가", "공격이 치명타로 적중 시 적에게 주는 피해가 1.5% 증가"]], modifiers: [[{ type: "criticalRatePct", value: 3.4, unit: "percent" }, { type: "enemyDamagePct", value: 1.5, unit: "percent", condition: "치명타 적중 시" }], [{ type: "criticalRatePct", value: 4.2, unit: "percent" }, { type: "enemyDamagePct", value: 1.5, unit: "percent", condition: "치명타 적중 시" }], [{ type: "criticalRatePct", value: 5, unit: "percent" }, { type: "enemyDamagePct", value: 1.5, unit: "percent", condition: "치명타 적중 시" }]] }),
  ...tiered({ id: "critical-damage-on-crit", family: "치피·치명타 적중 피해", group: "공격", labels: ["치피 +6.8% | 치명타 주는 피해 +1.5%", "치피 +8.4% | 치명타 주는 피해 +1.5%", "치피 +10.0% | 치명타 주는 피해 +1.5%"], apiText: [["치명타 피해가 6.8% 증가", "공격이 치명타로 적중 시 적에게 주는 피해가 1.5% 증가"], ["치명타 피해가 8.4% 증가", "공격이 치명타로 적중 시 적에게 주는 피해가 1.5% 증가"], ["치명타 피해가 10% 증가", "공격이 치명타로 적중 시 적에게 주는 피해가 1.5% 증가"]], modifiers: [[{ type: "criticalDamagePct", value: 6.8, unit: "percent" }, { type: "enemyDamagePct", value: 1.5, unit: "percent", condition: "치명타 적중 시" }], [{ type: "criticalDamagePct", value: 8.4, unit: "percent" }, { type: "enemyDamagePct", value: 1.5, unit: "percent", condition: "치명타 적중 시" }], [{ type: "criticalDamagePct", value: 10, unit: "percent" }, { type: "enemyDamagePct", value: 1.5, unit: "percent", condition: "치명타 적중 시" }]] }),
  ...tiered({ id: "protected-target-party-attack", family: "보호 대상 피해·아공강", group: "지원", labels: ["보호 대상 피해량 +0.9% | 아공강 +2.0%", "보호 대상 피해량 +1.1% | 아공강 +2.5%", "보호 대상 피해량 +1.3% | 아공강 +3.0%"], apiText: [["파티 효과로 보호 효과가 적용된 대상이 5초 동안 적에게 주는 피해가 0.9% 증가", "아군 공격력 강화 효과가 2% 증가"], ["파티 효과로 보호 효과가 적용된 대상이 5초 동안 적에게 주는 피해가 1.1% 증가", "아군 공격력 강화 효과가 2.5% 증가"], ["파티 효과로 보호 효과가 적용된 대상이 5초 동안 적에게 주는 피해가 1.3% 증가", "아군 공격력 강화 효과가 3% 증가"]], modifiers: [[{ type: "protectedTargetDamagePct", value: 0.9, unit: "percent", condition: "파티 보호 효과 적용 후 5초" }, { type: "allyAttackBuffPct", value: 2, unit: "percent" }], [{ type: "protectedTargetDamagePct", value: 1.1, unit: "percent", condition: "파티 보호 효과 적용 후 5초" }, { type: "allyAttackBuffPct", value: 2.5, unit: "percent" }], [{ type: "protectedTargetDamagePct", value: 1.3, unit: "percent", condition: "파티 보호 효과 적용 후 5초" }, { type: "allyAttackBuffPct", value: 3, unit: "percent" }]] }),
  ...tiered({ id: "shield-heal", family: "파티 보호 및 회복", group: "지원", labels: ["보호 및 회복 효과 +2.5%", "보호 및 회복 효과 +3.0%", "보호 및 회복 효과 +3.5%"], apiText: simpleApi(["파티원 보호 및 회복 효과가 2.5% 증가", "파티원 보호 및 회복 효과가 3% 증가", "파티원 보호 및 회복 효과가 3.5% 증가"]), modifiers: percent("shieldAndHealPct", [2.5, 3, 3.5]) }),
];

export const BRACELET_OPTION_BY_ID = new Map(BRACELET_OPTION_CATALOG.map((option) => [option.id, option]));
export const BRACELET_OPTION_BY_LABEL = new Map(BRACELET_OPTION_CATALOG.map((option) => [option.label, option]));

export function normalizeBraceletApiText(text: string) {
  return text
    .replaceAll("[부여로만 획득]", "")
    .replace(/\s+/g, "")
    .replace(/[.,()]/g, "")
    .replace(/(\d+)\.0+(?=%)/g, "$1")
    .replace(/(\d+\.\d*?[1-9])0+(?=%)/g, "$1");
}

function findBraceletOptionFromApiText(value: string, compoundOnly: boolean) {
  const normalized = normalizeBraceletApiText(value);
  return [...BRACELET_OPTION_CATALOG]
    .filter((option) => !compoundOnly || option.modifiers.length > 1)
    .sort((left, right) => right.apiText.length - left.apiText.length || right.apiText.join("").length - left.apiText.join("").length)
    .find((option) => option.apiText.every((fragment) => normalized.includes(normalizeBraceletApiText(fragment))));
}

export function findBraceletOption(value: string) {
  return BRACELET_OPTION_BY_ID.get(value) ?? BRACELET_OPTION_BY_LABEL.get(value) ?? findBraceletOptionFromApiText(value, false);
}

export function findCompoundBraceletOption(value: string) {
  return findBraceletOptionFromApiText(value, true);
}

export function mergeBraceletOptionTexts(options: string[]) {
  const merged: string[] = [];
  for (let index = 0; index < options.length;) {
    const current = options[index];
    let match: BraceletOptionDefinition | undefined;
    let consumed = 0;

    for (let size = 1; size <= Math.min(4, options.length - index); size += 1) {
      const candidate = options.slice(index, index + size).join(" ");
      const candidateMatch = findCompoundBraceletOption(candidate);
      if (!candidateMatch) continue;
      const currentText = normalizeBraceletApiText(current);
      const firstApiText = normalizeBraceletApiText(candidateMatch.apiText[0]);
      if (!currentText.includes(firstApiText) && !firstApiText.includes(currentText)) continue;
      match = candidateMatch;
      consumed = size;
      break;
    }

    if (match && consumed > 0) {
      merged.push(match.label);
      index += consumed;
      continue;
    }

    merged.push(findBraceletOption(current)?.label ?? current);
    index += 1;
  }
  return merged;
}

export const BRACELET_CATALOG_VALIDATION = {
  expectedCount: 99,
  actualCount: BRACELET_OPTION_CATALOG.length,
  duplicateIds: BRACELET_OPTION_CATALOG.filter((option, index, all) => all.findIndex((candidate) => candidate.id === option.id) !== index).map((option) => option.id),
  duplicateLabels: BRACELET_OPTION_CATALOG.filter((option, index, all) => all.findIndex((candidate) => candidate.label === option.label) !== index).map((option) => option.label),
};
