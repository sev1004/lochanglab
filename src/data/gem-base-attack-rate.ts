/** 겁화·작열·광휘 보석의 기본 공격력 증가율. 멸화·홍염은 적용하지 않는다. */
export const GEM_BASE_ATTACK_RATE_BY_LEVEL: Readonly<Record<number, number>> = {
  6: 0.0045,
  7: 0.006,
  8: 0.008,
  9: 0.01,
  10: 0.012,
};

export function gemBaseAttackRate(level: number | null | undefined) {
  return GEM_BASE_ATTACK_RATE_BY_LEVEL[level ?? 0] ?? 0;
}
