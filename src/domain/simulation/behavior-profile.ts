import type { SimulationPlayerLevel } from "./combat-simulation.ts";

/**
 * 미측정 행동 모델의 초기값이다.
 * 피해나 백어택 성공률을 직접 보정하지 않고, 공개된 패턴 정보를 보고
 * 언제 이동을 시작하고 언제 공격을 재개하는지만 표현한다.
 */
export type BehaviorProfile = {
  /** 반복 난무 방문 시작 시 재개 판단이 추가로 발생할 확률. */
  cycleResumeProbability: number;
  cycleResumeDelaySeconds: readonly [number, number];
  /** 중단 사건이 끝난 뒤 공격 재개 판단이 추가로 발생할 확률. */
  interruptionRecoveryProbability: number;
  interruptionRecoveryDelaySeconds: readonly [number, number];
  /** 현재 패턴의 짧은 공격 기회를 보수적으로 포기할 확률과 여유 시간. */
  shortWindowProbability: number;
  shortWindowSafetyMarginSeconds: readonly [number, number];
  /** 같은 방문에서 일반 카드 사이에 추가되는 연계 망설임. */
  linkHesitationProbability: number;
  linkHesitationDelaySeconds: readonly [number, number];
  /** 예약 필살이 준비되기 전에 뒤잡기를 시작할 수 있는 최대 선행 시간. */
  finisherPrepositionLeadSeconds: number;
  /** 공격 가능 상태를 인지한 뒤 공격 재개를 판단하는 지연. */
  attackResumeDecisionDelaySeconds: number;
  /** 뒤잡기·추적 이동의 경로 효율. 1보다 클수록 같은 경로에 더 오래 걸린다. */
  repositionDurationMultiplier: number;
  /** 현재 패턴의 방향 변경을 인지할 확률. 미측정 초기 가정이다. */
  cueRecognitionProbability: number;
  /** 방향 변경을 인지한 뒤 행동에 사용할 수 있을 때까지의 지연. */
  cueRecognitionDelaySeconds: number;
  /** 집중 진입 시 예약 판단을 놓칠 확률. 미측정 초기 가정이다. */
  finisherReservationMissProbability: number;
  /** 준비된 예약 필살을 한 일반 스킬 늦게 사용할 확률. 미측정 초기 가정이다. */
  finisherReadyDelayProbability: number;
};

function finisherJudgmentProbability(level: SimulationPlayerLevel, coefficient: number) {
  return Math.min(40, Math.max(0, coefficient * (90 - level))) / 100;
}

/**
 * 100/90/80 등의 실력별 초기 행동값.
 * 사용자 관측으로 확정된 실측값이 아니라 1차 검증용 가정이다.
 */
export function resolveBehaviorProfile(level: SimulationPlayerLevel): BehaviorProfile {
  switch (level) {
    case 100:
      return profile(100, 0, [0, 0], 0, [0, 0], 0, [0, 0], 0, [0, 0], 2, 0, 1, 1, 0);
    case 90:
      return profile(90, 0.1, [0.15, 0.35], 1, [0.1, 0.3], 0.1, [0.1, 0.25], 0.03, [0.1, 0.2], 1.5, 0.2, 1.16, 0.98, 0.1);
    case 85:
      return profile(85, 0.3, [0.35, 0.8], 1, [0.2, 0.55], 0.46, [0.3, 0.7], 0.15, [0.25, 0.45], 1.1, 0.3, 1.22, 0.95, 0.14);
    case 80:
      return profile(80, 0.42, [0.55, 1.1], 1, [0.35, 0.9], 0.52, [0.45, 0.95], 0.22, [0.4, 0.9], 0.7, 0.55, 1.34, 0.87, 0.35);
    case 70:
      return profile(70, 0.6, [1.0, 1.8], 1, [0.4, 1.0], 0.6, [0.6, 1.25], 0.28, [0.5, 0.9], 0.25, 0.6, 1.38, 0.82, 0.35);
    case 60:
      return profile(60, 0.75, [1.3, 2.2], 1, [0.5, 1.2], 0.62, [0.65, 1.25], 0.34, [0.6, 1.0], 0, 0.7, 1.42, 0.72, 0.5);
  }
}

function profile(
  level: SimulationPlayerLevel,
  cycleResumeProbability: number,
  cycleResumeDelaySeconds: readonly [number, number],
  interruptionRecoveryProbability: number,
  interruptionRecoveryDelaySeconds: readonly [number, number],
  shortWindowProbability: number,
  shortWindowSafetyMarginSeconds: readonly [number, number],
  linkHesitationProbability: number,
  linkHesitationDelaySeconds: readonly [number, number],
  finisherPrepositionLeadSeconds: number,
  attackResumeDecisionDelaySeconds: number,
  repositionDurationMultiplier: number,
  cueRecognitionProbability: number,
  cueRecognitionDelaySeconds: number,
): BehaviorProfile {
  return { cycleResumeProbability, cycleResumeDelaySeconds, interruptionRecoveryProbability, interruptionRecoveryDelaySeconds, shortWindowProbability, shortWindowSafetyMarginSeconds, linkHesitationProbability, linkHesitationDelaySeconds, finisherPrepositionLeadSeconds, attackResumeDecisionDelaySeconds, repositionDurationMultiplier, cueRecognitionProbability, cueRecognitionDelaySeconds, finisherReservationMissProbability: finisherJudgmentProbability(level, 1.8), finisherReadyDelayProbability: finisherJudgmentProbability(level, 0.9) };
}
