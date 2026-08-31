/** 아드레날린은 6중첩을 전제로 한 공격력 증가율이다. */
export const ADRENALINE_ENGRAVING_ATTACK_RATE = 0.009 * 6;
export const ADRENALINE_STONE_ATTACK_RATE: Readonly<Record<number, number>> = {
  1: 0.0048 * 6,
  2: 0.006 * 6,
  3: 0.0083 * 6,
  4: 0.0095 * 6,
};

export function adrenalineStoneAttackRate(level: number) {
  return ADRENALINE_STONE_ATTACK_RATE[level] ?? 0;
}
