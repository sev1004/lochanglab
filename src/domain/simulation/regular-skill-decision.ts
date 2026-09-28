import type { BehaviorProfile } from "./behavior-profile.ts";

export type DecisionKind = "cycle-start" | "interruption-recovery" | "short-window" | "link-hesitation";

export type DecisionTicket = {
  eventId: string;
  kind: DecisionKind;
  visitId: number;
  cardId?: string;
  startedAt: number;
  readyAt: number;
  sampled: boolean;
  resolved: boolean;
  delaySeconds: number;
};

export function uniformDelay(random: number, range: readonly [number, number]) {
  return range[0] + Math.max(0, Math.min(1, random)) * (range[1] - range[0]);
}

export function sampleDecision(
  profile: BehaviorProfile,
  kind: DecisionKind,
  random: number,
  delayRandom: number,
): { occurs: boolean; delaySeconds: number } {
  const probability = kind === "cycle-start" ? profile.cycleResumeProbability
    : kind === "interruption-recovery" ? profile.interruptionRecoveryProbability
      : kind === "short-window" ? profile.shortWindowProbability
        : profile.linkHesitationProbability;
  const range = kind === "cycle-start" ? profile.cycleResumeDelaySeconds
    : kind === "interruption-recovery" ? profile.interruptionRecoveryDelaySeconds
      : kind === "short-window" ? profile.shortWindowSafetyMarginSeconds
        : profile.linkHesitationDelaySeconds;
  return { occurs: random < probability, delaySeconds: random < probability ? uniformDelay(delayRandom, range) : 0 };
}
