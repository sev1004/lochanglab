/**
 * Source: 아크패시브 시트의 깨달음 레벨 효과 옵션/진화 효과 랭크 테이블.
 * 퍼센트는 계산 엔진 규칙에 맞춰 0.01 단위로 보관한다.
 */
export const ENLIGHTENMENT_WEAPON_ATTACK_RATE_PER_LEVEL = 0.001;
export const EVOLUTION_DAMAGE_RATE_BY_RANK: Readonly<Record<number, number>> = {
  1: 0.01,
  2: 0.02,
  3: 0.03,
  4: 0.04,
  5: 0.05,
  6: 0.06,
};

export function enlightenmentWeaponAttackRate(level: number | null | undefined) {
  return Math.max(0, level ?? 0) * ENLIGHTENMENT_WEAPON_ATTACK_RATE_PER_LEVEL;
}

export function evolutionDamageRate(rank: number | null | undefined) {
  return EVOLUTION_DAMAGE_RATE_BY_RANK[rank ?? 0] ?? 0;
}
