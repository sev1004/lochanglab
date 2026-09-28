import { bossWindowAt, createBossTimeline, type BossTimeline } from "./boss-timeline.ts";
import { resolveBehaviorProfile } from "./behavior-profile.ts";
import { sampleDecision } from "./regular-skill-decision.ts";
import { allocateBackAttackQuotaToHits, resolveBackAttackQuota, type BackAttackCategory } from "./back-attack-quota.ts";

export type SimulationPlayerLevel = 100 | 90 | 85 | 80 | 70 | 60;
export const MAIN_MECHANIC_FINISHER_LEAD_SECONDS = 5;

/** A pre-mechanic priority cast must finish before the mechanic boundary. */
export function canFinishBeforeMechanic(now: number, mechanicStart: number, inputSeconds: number, motionSeconds: number) {
  return mechanicStart > now && mechanicStart - now <= MAIN_MECHANIC_FINISHER_LEAD_SECONDS
    && now + inputSeconds + motionSeconds < mechanicStart;
}
export type SimulationCycleCard = {
  cardId: string;
  skillName: string;
  azureDragon: boolean;
  yeongaSimGong: boolean;
  useCount?: number;
  section?: "encounter" | "repeat-flurry" | "repeat-focus";
};
export type SimulationSkill = {
  cardId?: string;
  skillName: string;
  damage: number;
  yeongaDamage?: number;
  yeongaCriticalDamage?: number;
  criticalDamage?: number;
  cooldown: number;
  duration: number;
  motionSeconds?: number;
  inputDelaySeconds?: number;
  patternChangeDelaySeconds?: number;
  criticalRate?: number;
  backAttackCriticalRate?: number;
  backAttackDamage?: number;
  backAttackCriticalDamage?: number;
  yeongaBackAttackDamage?: number;
  yeongaBackAttackCriticalDamage?: number;
  isBackAttackSkill?: boolean;
  backAttackRate?: number;
  isDragonFinisher?: boolean;
  staggerImmune?: boolean;
  /** Damage/scenario values while the runtime 청룡진 buff is active. */
  azureDamage?: number;
  azureCriticalDamage?: number;
  azureBackAttackDamage?: number;
  azureBackAttackCriticalDamage?: number;
  azureYeongaDamage?: number;
  azureYeongaCriticalDamage?: number;
  azureYeongaBackAttackDamage?: number;
  azureYeongaBackAttackCriticalDamage?: number;
  azureCriticalRate?: number;
  azureBackAttackCriticalRate?: number;
};
export type SkillStatistics = {
  skillName: string;
  uses: number;
  hits: number;
  misses: number;
  azureHits: number;
  criticals: number;
  nonCriticals: number;
  backAttacks: number;
  totalDamage: number;
  usesPerMinute: number;
  cooldownRatio: number;
  /** Cooldown-ready time that elapsed before the next use or fight end. */
  readyIdleSeconds: number;
  /** Ready-idle time allocated to mutually exclusive causes for this skill. */
  readyIdleBreakdown: SkillReadyIdleBreakdown;
};
export type SimulationMovementEvent = {
  start: number;
  end: number;
  duration: number;
  reason: "pattern-gap" | "finisher-reposition";
  completed: boolean;
  directionVersionAtStart: number;
  directionVersionAtEnd: number;
  reachedBack: boolean;
};
export type SimulationLossReason = "bossUnavailable" | "status" | "movement" | "patternResponse" | "input" | "cooldownWait" | "orderMotion";
export type SimulationLossBreakdown = Record<SimulationLossReason, number>;
export type FinisherReadyIdleBreakdown = {
  bossUnavailable: number;
  stanceOrOrderWait: number;
  reserveDeferred: number;
  patternResponse: number;
  backForbidden: number;
  reposition: number;
  status: number;
  otherMotion: number;
  input: number;
  /** Forced unavailable time grouped by the actual boss timeline source. */
  bossUnavailableBySource: Record<string, number>;
};
export type SkillReadyIdleBreakdown = Omit<FinisherReadyIdleBreakdown, "bossUnavailableBySource">;
export type FinisherDecisionDiagnostics = {
  reservationEligibleVisits: number;
  reservationMisses: number;
  thresholdDeferredVisits: number;
  readyDelayJudgments: number;
  readyDelayOccurrences: number;
  earlyRegularCardIds: string[];
  immediateAfterNoRegular: number;
};
export type FinisherDecisionSnapshot = {
  at: number;
  trigger: "focus-entry" | "cooldown-ready";
  phase: "encounter" | "repeat";
  visitId: number;
  stance: "난무" | "집중";
  readyAt: number;
  reservation: FinisherReservationState | "none";
  nextRegularCardId?: string;
  decision: "cast" | "wait" | "regular" | "prepare";
  reason: string;
};
export type FinisherActionDecision =
  | { kind: "none"; reason: string }
  | { kind: "wait"; reason: string }
  | { kind: "prepare-movement"; reason: string }
  | { kind: "cast-finisher"; reason: string }
  | { kind: "use-regular"; reason: string };

/**
 * Pure priority decision used after the event loop has synchronized its
 * motion, control and boss state. It deliberately does not roll randomness
 * or mutate a cycle cursor; callers apply the returned action.
 */
export function decideFinisherAction(input: {
  phase: "encounter" | "repeat";
  stance: "난무" | "집중";
  finisherReserved: boolean;
  finisherReady: boolean;
  encounterFinisher: boolean;
  regularCardAvailable: boolean;
  regularCardReady: boolean;
  backAllowed: boolean;
  playerAtBack: boolean;
  movementAllowed: boolean;
}) : FinisherActionDecision {
  if (input.encounterFinisher) return { kind: "cast-finisher", reason: "조우 카드 위치" };
  if (input.phase !== "repeat" || input.stance !== "집중" || !input.finisherReserved) {
    return input.regularCardAvailable
      ? (input.regularCardReady ? { kind: "use-regular", reason: "예약 필살 없음" } : { kind: "wait", reason: "일반 카드 쿨 대기" })
      : { kind: "none", reason: "처리할 카드 없음" };
  }
  if (!input.finisherReady) {
    return input.regularCardAvailable
      ? (input.regularCardReady ? { kind: "use-regular", reason: "필살 쿨 대기 중" } : { kind: "wait", reason: "필살·일반 카드 쿨 대기" })
      : { kind: "wait", reason: "예약 필살 준비 대기" };
  }
  if (!input.backAllowed || !input.playerAtBack) {
    return input.movementAllowed ? { kind: "prepare-movement", reason: "필살 백 확보" } : { kind: "wait", reason: "필살 백 조건 대기" };
  }
  return { kind: "cast-finisher", reason: "준비된 필살 우선" };
}
export type SimulationResult = {
  actions: {
    castId?: string;
    skillName: string;
    cardId?: string;
    section?: SimulationCycleCard["section"];
    visitId?: number;
    start: number;
    motionEnd: number;
    hit?: boolean;
    backAttack?: boolean;
    critical?: boolean;
    damage?: number;
    damageMultiplier?: number;
    azureActive?: boolean;
    yeongaApplied?: boolean;
    hitOrdinal?: number;
    cancelled?: boolean;
    cancelReason?: string;
    missReason?: "boss-window" | "skill-restriction";
  }[];
  movementEvents: SimulationMovementEvent[];
  mechanicPhases: { name: string; scheduledAt: number; start: number; end: number; damageMultiplier: number; attacks: number; damage: number }[];
  totalDamage: number;
  dps: number;
  attemptedUses: number;
  successfulUses: number;
  criticals: number;
  patternCount: number;
  skillStatistics: SkillStatistics[];
  lostSeconds: number;
  /** Time spent in a triggered player status, without counting overlapping statuses twice. */
  statusLossSeconds: number;
  /** One-second 3잡 response delays, counted once per eligible use opportunity. */
  threeJobDelaySeconds: number;
  threeJobDelayedUses: number;
  /**
   * Mutually exclusive allocation of recorded time intervals. It is not a
   * sum of per-skill ready-idle intervals, which may legitimately overlap.
   */
  lossBreakdown: SimulationLossBreakdown;
  /** 적룡필살이 준비된 뒤 사용되지 않은 시간을 원인별로 나눈 평균값. */
  finisherReadyIdleBreakdown: FinisherReadyIdleBreakdown;
  finisherDecisionDiagnostics: FinisherDecisionDiagnostics;
  finisherDecisionSnapshots: FinisherDecisionSnapshot[];
  cooldownWaitSeconds: number;
  durationSeconds: number;
  seed: number;
  backAttackQuotas?: Record<string, { hitCount: number; successCount: number; rate: number | null; fallback: boolean; range: { min: number; max: number } }>;
};
export type SimulationInput = {
  durationSeconds: number;
  playerLevel: SimulationPlayerLevel;
  /** Reserve the finisher when its remaining cooldown on focus entry is <= this value. */
  finisherReserveThresholdSeconds?: number;
  /** Whether the repeat-focus phase may reserve an independent finisher use. */
  repeatFinisherEnabled?: boolean;
  /** @deprecated kept only for synthetic legacy callers during migration. */
  finisherPolicy?: "ready" | "next-cycle";
  skills: SimulationSkill[];
  /** Original ordered editor cards, kept separate from skill definitions. */
  cycle?: SimulationCycleCard[];
  /** Runtime guard supplied by the page for the supported non-222 build. */
  simulationBuild?: "jeoljeong-non222";
  /**
   * Optional external-condition seed. Supplying the same value to multiple
   * levels gives them the same boss timeline; it never depends on their
   * action count.
   */
  bossSeed?: number;
  /** Deterministic event fixture for unit tests; product runs leave this unset. */
  bossTimeline?: BossTimeline;
  seed?: number;
  /** Record actual action timestamps for diagnostics without slowing normal runs. */
  recordActions?: boolean;
  /** Keep representative finisher decision snapshots for diagnostics. */
  recordDecisionDiagnostics?: boolean;
  /** Statistical per-hit back-attack assignment. Internal two-pass input. */
  backAttackModel?: "physical" | "quota";
  backAttackAssignments?: Record<string, Set<number>>;
};

export type SimulationBatchResult = Omit<SimulationResult, "seed" | "actions"> & {
  runs: number;
  seed?: number;
  actions: SimulationResult["actions"];
};

export function resolveSimulationInputDelay(
  playerLevel: SimulationPlayerLevel,
  patternChanged: boolean,
) {
  const level = Math.max(60, Math.min(100, playerLevel));
  return patternChanged
    ? 0.3 + (100 - level) * 0.005
    : level === 100 ? 0.05 : 0.2 + (100 - level) * 0.00125;
}

/**
 * Independent ready-idle audit used by tests and diagnostics. It treats every
 * attempted cast start (including a cancelled cast) as a cooldown start and
 * clips ready-idle intervals to the finite fight duration.
 */
export function calculateReadyIdleFromActions(
  actions: Pick<SimulationResult["actions"][number], "skillName" | "start">[],
  skillName: string,
  cooldown: number,
  durationSeconds: number,
) {
  const starts = actions
    .filter((action) => action.skillName === skillName && action.start < durationSeconds)
    .map((action) => Math.max(0, action.start))
    .sort((left, right) => left - right);
  let readyAt = 0;
  let idle = 0;
  for (const start of starts) {
    if (start > readyAt) idle += start - readyAt;
    readyAt = Math.max(readyAt, start) + Math.max(0, cooldown);
  }
  if (readyAt < durationSeconds) idle += durationSeconds - readyAt;
  return idle;
}

/** Independent cooldown ledger used by the post-action damage pass and tests. */
export function calculateCooldownMetricsFromActions(
  actions: Pick<SimulationResult["actions"][number], "skillName" | "start">[],
  skillName: string,
  cooldown: number,
  durationSeconds: number,
) {
  const readyIdleSeconds = calculateReadyIdleFromActions(actions, skillName, cooldown, durationSeconds);
  return {
    readyIdleSeconds,
    cooldownRatio: durationSeconds <= 0 ? 0 : Math.max(0, Math.min(1, 1 - readyIdleSeconds / durationSeconds)),
  };
}

/** 집중 방문에서 최소 시전 횟수 충족 후 적용하는 방문 한정 생략 판정. */
export function shouldSkipFocusCard(
  skillName: string,
  castsSinceStanceEntry: number,
  remainingCooldown: number,
  finalCooldown: number,
) {
  if (castsSinceStanceEntry < 3 || remainingCooldown <= 0) return false;
  if (skillName === "사두룡격") return true;
  return skillName === "굉열파" && remainingCooldown >= finalCooldown * 0.5;
}

/**
 * The user-approved exception for the finisher only.  A basic pattern can
 * still forbid ordinary attacks, but the finisher may be committed after the
 * first 0.5 seconds of that pattern sub-window. Main mechanics have no
 * patternId and therefore never receive this exception.
 */
export function isFinisherBasicPatternRelaxed(window: { source: string; patternId?: number; attackable: boolean; start: number }, at: number) {
  return window.source.startsWith("패턴 ")
    && window.patternId !== undefined
    && !window.attackable
    && at - window.start >= 0.5;
}

function riskChance(playerLevel: SimulationPlayerLevel, type: "knockdown" | "stagger" | "stumble") {
  const coefficient = { stumble: 5, stagger: 7, knockdown: 3 }[type];
  const level = Math.max(60, Math.min(100, playerLevel));
  return Math.round(coefficient * ((100 - level) / 10) ** 1.2) / 100;
}

function deterministicRoll(seed: number, key: string) {
  // FNV-1a만으로 문자열을 끝내면 인접한 방문 키가 비슷한 값을
  // 만들 수 있다. 판단 이벤트용 해시는 마지막에 avalanche를 적용해
  // 방문 간 상관을 줄이고, 보스 난수 스트림과 분리된 재현성을 유지한다.
  let value = (seed ^ 2166136261) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    value ^= key.charCodeAt(index);
    value = Math.imul(value, 16777619) >>> 0;
  }
  value ^= value >>> 16;
  value = Math.imul(value, 2246822507) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 3266489909) >>> 0;
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

function createDeterministicStream(seed: number, namespace: string) {
  let draw = 0;
  return () => deterministicRoll(seed, `${namespace}:${draw++}`);
}

function resolveQuotaDamageFromActions(
  input: SimulationInput,
  actionResult: SimulationResult,
  assignments: Record<string, Set<number>>,
): SimulationResult {
  const rows = new Map<string, SkillStatistics>();
  for (const skill of input.skills) rows.set(skill.skillName, {
    skillName: skill.skillName, uses: 0, hits: 0, misses: 0, criticals: 0,
    nonCriticals: 0, backAttacks: 0, azureHits: 0, totalDamage: 0, usesPerMinute: 0,
    cooldownRatio: 0, readyIdleSeconds: 0, readyIdleBreakdown: emptySkillReadyIdleBreakdown(),
  });
  const skills = new Map(input.skills.map((skill) => [skill.skillName, skill]));
  let criticals = 0;
  const mechanicPhases = actionResult.mechanicPhases.map((phase) => ({ ...phase, attacks: 0, damage: 0 }));
  const actions = actionResult.actions.map((action) => {
    const skill = skills.get(action.skillName);
    const row = rows.get(action.skillName);
    if (!skill || !row) return action;
    row.uses += 1;
    if (!action.hit) {
      row.misses += 1;
      return { ...action, backAttack: false, critical: false, damage: 0 };
    }
    row.hits += 1;
    const ordinal = action.hitOrdinal ?? (row.hits - 1);
    const backAttack = Boolean(skill.isBackAttackSkill && assignments[skill.skillName]?.has(ordinal));
    const azure = action.azureActive === true;
    row.azureHits += Number(azure);
    const yeonga = action.yeongaApplied === true;
    const criticalRate = backAttack
      ? (azure ? skill.azureBackAttackCriticalRate : undefined) ?? skill.backAttackCriticalRate ?? skill.criticalRate ?? 0
      : (azure ? skill.azureCriticalRate : undefined) ?? skill.criticalRate ?? 0;
    const critical = deterministicRoll(input.seed ?? 1, `damage-critical:${action.castId ?? `${action.skillName}:${action.start}`}`) < criticalRate;
    const normal = yeonga
      ? (backAttack
        ? (azure ? skill.azureYeongaBackAttackDamage ?? skill.azureYeongaDamage : undefined) ?? skill.yeongaBackAttackDamage ?? skill.yeongaDamage ?? skill.backAttackDamage ?? skill.damage
        : (azure ? skill.azureYeongaDamage : undefined) ?? skill.yeongaDamage ?? skill.damage)
      : (backAttack
        ? (azure ? skill.azureBackAttackDamage : undefined) ?? skill.backAttackDamage ?? skill.damage
        : (azure ? skill.azureDamage : undefined) ?? skill.damage);
    const critDamage = yeonga
      ? (backAttack
        ? (azure ? skill.azureYeongaBackAttackCriticalDamage ?? skill.azureYeongaCriticalDamage : undefined) ?? skill.yeongaBackAttackCriticalDamage ?? skill.yeongaCriticalDamage ?? skill.backAttackCriticalDamage ?? skill.criticalDamage ?? normal
        : (azure ? skill.azureYeongaCriticalDamage : undefined) ?? skill.yeongaCriticalDamage ?? skill.criticalDamage ?? normal)
      : (backAttack
        ? (azure ? skill.azureBackAttackCriticalDamage : undefined) ?? skill.azureBackAttackCriticalDamage ?? skill.backAttackCriticalDamage ?? skill.criticalDamage ?? normal
        : (azure ? skill.azureCriticalDamage : undefined) ?? skill.criticalDamage ?? normal);
    const damage = (critical ? critDamage : normal) * (action.damageMultiplier ?? 1);
    row.criticals += Number(critical);
    row.nonCriticals += Number(!critical);
    row.backAttacks += Number(backAttack);
    row.totalDamage += damage;
    criticals += Number(critical);
    const phase = mechanicPhases.find((item) => action.motionEnd >= item.start && action.motionEnd < item.end);
    if (phase) { phase.attacks += 1; phase.damage += damage; }
    return { ...action, backAttack, critical, damage };
  });
  const skillStatistics = [...rows.values()].map((row) => {
    const original = actionResult.skillStatistics.find((item) => item.skillName === row.skillName);
    const skill = skills.get(row.skillName);
    const cooldown = skill?.cooldown ?? 0;
    const cooldownMetrics = calculateCooldownMetricsFromActions(actions, row.skillName, cooldown, actionResult.durationSeconds);
    return {
      ...row,
      usesPerMinute: row.uses * 60 / actionResult.durationSeconds,
      cooldownRatio: cooldownMetrics.cooldownRatio,
      readyIdleSeconds: cooldownMetrics.readyIdleSeconds,
      readyIdleBreakdown: original?.readyIdleBreakdown ?? emptySkillReadyIdleBreakdown(),
    };
  });
  const totalDamage = skillStatistics.reduce((sum, row) => sum + row.totalDamage, 0);
  return {
    ...actionResult,
    actions,
    mechanicPhases,
    criticals,
    skillStatistics,
    totalDamage,
    dps: totalDamage / actionResult.durationSeconds,
  };
}

const LOSS_REASONS: SimulationLossReason[] = ["bossUnavailable", "status", "movement", "patternResponse", "input", "cooldownWait", "orderMotion"];

function emptyFinisherReadyIdleBreakdown(): FinisherReadyIdleBreakdown {
  return { bossUnavailable: 0, stanceOrOrderWait: 0, reserveDeferred: 0, patternResponse: 0, backForbidden: 0, reposition: 0, status: 0, otherMotion: 0, input: 0, bossUnavailableBySource: {} };
}

function emptySkillReadyIdleBreakdown(): SkillReadyIdleBreakdown {
  return { bossUnavailable: 0, stanceOrOrderWait: 0, reserveDeferred: 0, patternResponse: 0, backForbidden: 0, reposition: 0, status: 0, otherMotion: 0, input: 0 };
}

function emptyFinisherDecisionDiagnostics(): FinisherDecisionDiagnostics {
  return { reservationEligibleVisits: 0, reservationMisses: 0, thresholdDeferredVisits: 0, readyDelayJudgments: 0, readyDelayOccurrences: 0, earlyRegularCardIds: [], immediateAfterNoRegular: 0 };
}

function emptyLossBreakdown(): SimulationLossBreakdown {
  return Object.fromEntries(LOSS_REASONS.map((reason) => [reason, 0])) as SimulationLossBreakdown;
}

function resolveLossBreakdown(
  intervals: { start: number; end: number; reason: SimulationLossReason }[],
  duration: number,
) {
  const result = emptyLossBreakdown();
  const events = intervals.flatMap((interval) => {
    const start = Math.max(0, Math.min(duration, interval.start));
    const end = Math.max(0, Math.min(duration, interval.end));
    return end > start ? [{ time: start, reason: interval.reason, delta: 1 }, { time: end, reason: interval.reason, delta: -1 }] : [];
  }).sort((left, right) => left.time - right.time);
  const active = emptyLossBreakdown();
  let previous = 0;
  for (let index = 0; index < events.length;) {
    const time = events[index].time;
    const reason = LOSS_REASONS.find((candidate) => active[candidate] > 0);
    if (reason && time > previous) result[reason] += time - previous;
    while (index < events.length && events[index].time === time) {
      active[events[index].reason] += events[index].delta;
      index += 1;
    }
    previous = time;
  }
  return result;
}

const PATTERN_DURATIONS = [6, 10, 8, 10, 8, 10, 6, 15, 12, 8, 6, 9.5, 8, 10, 8.5, 9, 6, 8, 9, 9, 8.5, 8.5, 5, 8];
export const SUPPORTED_SIMULATION_SKILLS = ["청룡진", "맹룡열파", "반월섬", "사두룡격", "적룡포", "유성강천", "굉열파", "적룡필살"] as const;
type SimulationStance = "난무" | "집중";
type FinisherReservationState = "none" | "threshold-deferred" | "judgment-missed" | "reserved" | "ready-delay-pending" | "ready-delay-used" | "completed";
const FLURRY_SKILLS = new Set(["청룡진", "맹룡열파", "반월섬"]);
const FOCUS_SKILLS = new Set(["사두룡격", "적룡포", "유성강천", "굉열파", "적룡필살"]);

function stanceForSkill(skillName: string): SimulationStance | null {
  if (FLURRY_SKILLS.has(skillName)) return "난무";
  if (FOCUS_SKILLS.has(skillName)) return "집중";
  return null;
}

function isBackAttackAvailable(
  pattern: number,
  elapsed: number,
  patternRoll: number,
  targetedRoll: number,
) {
  if (pattern === 0) return Math.floor(elapsed / 2) % 2 === 0;
  if (pattern === 2) return elapsed < 4;
  if (pattern === 5) return elapsed >= 4;
  if (pattern === 8) {
    if (elapsed < 2) return true;
    if (elapsed < 5) return false;
    return targetedRoll >= 0.26;
  }
  if (pattern === 9) return elapsed < 6 ? patternRoll < 0.5 : false;
  if (pattern === 10) return Math.floor(elapsed / 3) % 2 === 0;
  if (pattern === 11) return elapsed < 3;
  if (pattern === 12) return elapsed >= 1;
  if (pattern === 13) return elapsed >= 5;
  if (pattern === 14) return elapsed >= 1;
  if (pattern === 15) return elapsed < 3;
  if (pattern === 16) return elapsed < 2.5 || elapsed >= 3.5;
  if (pattern === 17) return elapsed < 3 || patternRoll < 0.5;
  if (pattern === 18) return elapsed < 1 || elapsed >= 7;
  if (pattern === 20) return elapsed >= 4;
  if (pattern === 21) return elapsed >= 2;
  if (pattern === 22) return elapsed < 2 || elapsed >= 4;
  if (pattern === 23) return elapsed < 2 || elapsed >= 4;
  return true;
}

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function triangular(random: () => number, min: number, mode: number, max: number) {
  const split = (mode - min) / (max - min);
  const value = random();
  return value < split
    ? min + Math.sqrt(value * (max - min) * (mode - min))
    : max - Math.sqrt((1 - value) * (max - min) * (max - mode));
}

function errorCheck(input: SimulationInput) {
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 1) throw new Error("전투시간은 1초 이상이어야 합니다.");
  if (!input.skills.length) throw new Error("순서 방식 사이클을 먼저 구성하세요.");
  if (input.cycle) {
    if (!input.cycle.length) throw new Error("순서 방식 사이클을 먼저 구성하세요.");
    const cycleNames = input.cycle.map((card) => card.skillName);
    const hasCardDefinitions = input.skills.some((skill) => Boolean(skill.cardId));
    if (
      !hasCardDefinitions &&
      (input.skills.length !== cycleNames.length ||
        input.skills.some((skill, index) => skill.skillName !== cycleNames[index]))
    ) {
      throw new Error("시뮬레이션 입력의 원본 사이클과 스킬 정의 순서가 일치하지 않습니다.");
    }
    const cardDefinitions = input.cycle.map((card) =>
      input.skills.find((skill) => skill.cardId === card.cardId) ??
      (!hasCardDefinitions ? input.skills.find((skill) => skill.skillName === card.skillName) : undefined),
    );
    if (cardDefinitions.some((skill, index) => !skill || skill.skillName !== cycleNames[index])) {
      throw new Error("시뮬레이션 입력의 원본 사이클과 스킬 정의 순서가 일치하지 않습니다.");
    }
    if (!input.cycle.some((card) => card.skillName === "맹룡열파")) {
      throw new Error("현재 시뮬레이션은 맹룡열파가 포함된 절정 사이클만 지원합니다.");
    }
    if (new Set(input.cycle.map((card) => card.cardId)).size !== input.cycle.length) {
      throw new Error("원본 사이클 카드 ID가 중복되었습니다.");
    }
    if (input.simulationBuild === "jeoljeong-non222") {
      if (input.cycle.some((card) => !card.section)) {
        throw new Error("조우·반복 사이클 구간을 먼저 지정하세요.");
      }
      if (!input.cycle.some((card) => card.section === "repeat-flurry")) {
        throw new Error("반복 난무 사이클을 구성하세요.");
      }
      if (!input.cycle.some((card) => card.section === "repeat-focus")) {
        throw new Error("반복 집중 사이클을 구성하세요.");
      }
      for (const card of input.cycle) {
        const stance = stanceForSkill(card.skillName);
        if (card.section === "repeat-flurry" && stance !== "난무") {
          throw new Error(`반복 난무에 ${card.skillName}을 배치할 수 없습니다.`);
        }
        if (card.section === "repeat-focus" && stance !== "집중") {
          throw new Error(`반복 집중에 ${card.skillName}을 배치할 수 없습니다.`);
        }
      }
    }
  }
  if (input.simulationBuild && input.simulationBuild !== "jeoljeong-non222") {
    throw new Error("현재 시뮬레이션은 절정 비222 세팅만 지원합니다.");
  }
  if (input.simulationBuild && !input.cycle) {
    throw new Error("실행 시 원본 사이클 카드가 필요합니다.");
  }
  if (input.finisherReserveThresholdSeconds !== undefined &&
      (!Number.isFinite(input.finisherReserveThresholdSeconds) || input.finisherReserveThresholdSeconds < 1 || input.finisherReserveThresholdSeconds > 10)) {
    throw new Error("적룡필살 예약 기준은 1~10초 사이여야 합니다.");
  }
  if (![100, 90, 85, 80, 70, 60].includes(input.playerLevel)) throw new Error("플레이 수준을 확인하세요.");
}

/**
 * 실력 차이는 타격 대미지 배율이 아니라, 짧은 공격 기회를 실제로
 * 활용하는 비율로 반영한다. 초기 모델의 미측정 가정이며 평균값 검증으로
 * 조정할 수 있도록 한 곳에 둔다.
 */
function resolveAttackOpportunityRate(playerLevel: SimulationPlayerLevel) {
  return {
    100: 1,
    90: 0.98,
    85: 0.96,
    80: 0.94,
    70: 0.88,
    60: 0.82,
  }[playerLevel];
}

function resolvePostActionRecovery(playerLevel: SimulationPlayerLevel) {
  // 일반 스킬 연계에서만 발생하는 추가 재개 지연. 피해 배율이 아니라
  // 다음 입력 시각을 늦춰 사용 기회를 줄이는 실력 모델이다.
  return (100 - playerLevel) * 0.005;
}

function resolveRegularOpportunityRate(playerLevel: SimulationPlayerLevel) {
  return {
    100: 1,
    90: 0.96,
    85: 0.92,
    80: 0.88,
    70: 0.6,
    60: 0.5,
  }[playerLevel];
}

function resolveBackExecutionRate(playerLevel: SimulationPlayerLevel) {
  return {
    100: 1,
    90: 0.93,
    85: 0.89,
    80: 0.84,
    70: 0.72,
    60: 0.62,
  }[playerLevel];
}

function resolveFinisherBackExecutionRate(playerLevel: SimulationPlayerLevel) {
  return {
    100: 1,
    90: 0.9,
    85: 0.85,
    80: 0.8,
    70: 0.7,
    60: 0.6,
  }[playerLevel];
}

function runLegacyCombatSimulation(input: SimulationInput): SimulationResult {
  errorCheck(input);
  const duration = input.durationSeconds;
  const baseSeed = input.seed ?? 1;
  // 보스 타임라인과 플레이어 행동 난수는 서로의 호출 횟수에 영향을 주지 않는다.
  const bossRandom = rng(baseSeed ^ 0x13579bdf);
  const mechanicRandom = rng(baseSeed ^ 0x5a17);
  const playerRandom = rng(baseSeed ^ 0x2468ace0);
  const between = (min: number, max: number) => min + mechanicRandom() * (max - min);
  const mechanics = [
    { name: "360줄", at: between(60, 80), phases: [{ seconds: mechanicRandom() < 0.5 ? 60 : 80, multiplier: 0 }] },
    { name: "320줄", at: between(165, 190), phases: [
      { seconds: 30, multiplier: 0 }, { seconds: between(20, 30), multiplier: 0.5 },
      { seconds: 10, multiplier: 1 }, { seconds: 5, multiplier: 0 },
    ] },
    { name: "첫 3잡", at: between(330, 380), phases: [{ seconds: 18, multiplier: 1 }] },
    { name: "두 번째 3잡", at: between(520, 560), phases: [{ seconds: 18, multiplier: 1 }] },
    { name: "앵버", at: between(580, 630), phases: [{ seconds: 12, multiplier: 0 }] },
  ];
  const mechanicPhases: SimulationResult["mechanicPhases"] = [];
  const pendingPhases: { name: string; scheduledAt: number; start: number; end: number; multiplier: number; grab: boolean; resetCycle: boolean }[] = [];
  let mechanicIndex = 0;
  const readyAt = new Map<string, number>();
  const lastStartedAt = new Map<string, number>();
  const readyIdleSeconds = new Map<string, number>();
  const actions: SimulationResult["actions"] = [];
  const rows = new Map<string, SkillStatistics>();
  for (const skill of input.skills) rows.set(skill.skillName, {
    skillName: skill.skillName, uses: 0, hits: 0, misses: 0, criticals: 0,
    nonCriticals: 0, backAttacks: 0, azureHits: 0, totalDamage: 0, usesPerMinute: 0, cooldownRatio: 0, readyIdleSeconds: 0, readyIdleBreakdown: emptySkillReadyIdleBreakdown(),
  });
  const regular = input.skills.filter((skill) => !skill.isDragonFinisher);
  const finisher = input.skills.find((skill) => skill.isDragonFinisher);
  const repeatFinisher = finisher;
  let now = 0;
  let busyUntil = 0;
  let cursor = 0;
  let previousPattern = -1;
  let patternCount = 0;
  let lostSeconds = 0;
  let cooldownWaitSeconds = 0;
  let attemptedUses = 0;
  let successfulUses = 0;
  let criticals = 0;
  let lastKnockdownAt = -Infinity;
  const experience = Math.max(60, Math.min(100, input.playerLevel));
  const attackOpportunityRate = resolveAttackOpportunityRate(input.playerLevel);
  const postActionRecovery = resolvePostActionRecovery(input.playerLevel);
  const regularOpportunityRate = resolveRegularOpportunityRate(input.playerLevel);
  const backExecutionRate = resolveBackExecutionRate(input.playerLevel);
  const finisherBackExecutionRate = resolveFinisherBackExecutionRate(input.playerLevel);
  const stumbleChance = Math.round(5 * (((100 - experience) / 10) ** 1.2)) / 100;
  const staggerChance = Math.round(7 * (((100 - experience) / 10) ** 1.2)) / 100;
  const knockdownChance = Math.round(3 * (((100 - experience) / 10) ** 1.2)) / 100;
  while (now < duration && regular.length) {
    if (!pendingPhases.length && mechanicIndex < mechanics.length && now >= mechanics[mechanicIndex].at) {
      const mechanic = mechanics[mechanicIndex++];
      let end = now;
      for (const segment of mechanic.phases) {
        const start = end;
        end += segment.seconds;
        pendingPhases.push({ name: mechanic.name, scheduledAt: mechanic.at, start, end,
          multiplier: segment.multiplier, grab: mechanic.name.includes("3잡"), resetCycle: mechanic.name === "360줄" });
      }
    }
    const phase = pendingPhases.shift();
    if (phase && now >= phase.end) continue;
    if (phase && now < phase.start) now = phase.start;
    const phaseLog = phase ? { name: phase.name, scheduledAt: phase.scheduledAt, start: phase.start,
      end: Math.min(duration, phase.end), damageMultiplier: phase.multiplier, attacks: 0, damage: 0 } : null;
    if (phaseLog) mechanicPhases.push(phaseLog);
    if (phase && phase.multiplier === 0) {
      lostSeconds += Math.max(0, Math.min(duration, phase.end) - now);
      now = Math.min(duration, phase.end);
      // 360줄 종료 후에도 기믹 중 자연스럽게 진행된 쿨 완료 시각을 보존한다.
      if (phase.resetCycle && now < duration) {
        cursor = 0;
      }
      continue;
    }
    let pattern = Math.floor(bossRandom() * 24);
    if (pattern === previousPattern) pattern = (pattern + 1) % 24;
    if (!phase) { previousPattern = pattern; patternCount += 1; }
    const length = phase ? phase.end - now : PATTERN_DURATIONS[pattern];
    const patternRoll = bossRandom();
    const targetedRoll = bossRandom();
    const freeDamage = phase ? length : pattern === 4 ? (bossRandom() < 0.26 ? 3 : 8) : pattern === 12 || pattern === 17 || pattern === 22 ? 3 : length;
    const patternStart = now;
    const patternEnd = Math.min(duration, now + length);
    const penaltyChance = Math.round(5 * (((100 - input.playerLevel) / 10) ** 1.2)) / 100;
    const usableDamageSeconds = phase
      ? freeDamage
      : freeDamage * attackOpportunityRate;
    const availableEnd = Math.min(patternEnd, now + Math.max(0, usableDamageSeconds - (!phase && playerRandom() < penaltyChance ? 1 : 0)));
    if (availableEnd <= now) { lostSeconds += patternEnd - now; now = patternEnd; continue; }
    let controlEvent: { at: number; end: number; type: "stagger" | "knockdown" | "stumble" } | null = null;
    if (!phase) {
      const dangerousSeconds = Math.max(0, length - freeDamage);
      const staggerOpportunities = Math.ceil(dangerousSeconds / 4);
      const knockedDown = dangerousSeconds > 0 && playerRandom() < knockdownChance;
      let controlLoss = 0;
      let controlType: "stagger" | "knockdown" | "stumble" | null = null;
      if (knockedDown) {
        const canUseGetup = now - lastKnockdownAt >= 26;
        controlLoss = canUseGetup ? 2 : 4 + playerRandom() * 2;
        lastKnockdownAt = now;
        controlType = "knockdown";
      } else {
        const staggered = staggerOpportunities > 0 && playerRandom() < staggerChance;
        controlLoss = staggered ? 0.5 : (dangerousSeconds > 0 && playerRandom() < stumbleChance ? 1 : 0);
        controlType = staggered ? "stagger" : controlLoss > 0 ? "stumble" : null;
      }
      if (controlType && controlLoss > 0) {
        const eventAt = patternStart + Math.min(dangerousSeconds, Math.max(0, freeDamage + playerRandom() * dangerousSeconds));
        controlEvent = { at: eventAt, end: eventAt + controlLoss, type: controlType };
      }
    }
    let firstActionInWindow = true;
    let finisherMoveAttempted = false;
    while (now < availableEnd) {
      now = Math.min(availableEnd, Math.max(now, busyUntil));
      if (controlEvent && now >= controlEvent.at) {
        busyUntil = Math.max(busyUntil, controlEvent.end);
        if (now < busyUntil) now = Math.min(availableEnd, busyUntil);
        controlEvent = null;
      }
      if (now >= availableEnd) break;
      const isBoundary = cursor === 0;
      const elapsed = now - patternStart;
      const backAttackAvailable = input.backAttackModel === "quota"
        ? true
        : phase ? true : isBackAttackAvailable(pattern, elapsed, patternRoll, targetedRoll);
      let skill = regular[cursor];
      const finisherPolicyMatches = input.finisherPolicy === "ready" || (input.finisherPolicy === "next-cycle" && isBoundary);
      const finisherReady = Boolean(finisher && finisherPolicyMatches && (readyAt.get(finisher.skillName) ?? 0) <= now);
      if (finisherReady && !backAttackAvailable && !finisherMoveAttempted) {
        finisherMoveAttempted = true;
        const moveSeconds = triangular(playerRandom, 0.5, 2, 2.99);
        now += moveSeconds;
        if (now >= availableEnd) break;
        continue;
      }
      if (finisherReady && backAttackAvailable) skill = finisher!;
      // 준비 시각은 스킬 이름 단위로 공유한다. 패턴/기믹 경계가 바뀌어도
      // 같은 스킬의 마지막 시전에서 계산한 쿨타임보다 먼저 시작할 수 없다.
      const ready = Math.max(
        readyAt.get(skill.skillName) ?? 0,
        (lastStartedAt.get(skill.skillName) ?? -Infinity) + Math.max(0, skill.cooldown),
      );
      if (ready > now) {
        if (ready >= availableEnd) {
          cooldownWaitSeconds += Math.max(0, availableEnd - now);
          now = availableEnd;
          break;
        }
        const wait = ready - now;
        cooldownWaitSeconds += wait;
        now = ready;
      }
      const isFirstAction = firstActionInWindow;
      const inputDelay = isFirstAction
        ? (skill.patternChangeDelaySeconds ?? 0)
        : (skill.inputDelaySeconds ?? 0);
      if (inputDelay > 0) {
        const delay = Math.min(inputDelay, availableEnd - now);
        now += delay;
        if (delay < inputDelay || now >= availableEnd) break;
      }
      const start = now;
      // 일반 스킬은 짧은 공격 기회를 놓칠 수 있다. 피해를 줄이지 않고
      // 다음 입력으로 넘어가는 시간만 소모한다.
      if (!skill.isDragonFinisher && playerRandom() > regularOpportunityRate) {
        const missedOpportunityDelay = 0.35 + (100 - input.playerLevel) * 0.01;
        const delay = Math.min(missedOpportunityDelay, availableEnd - now);
        now += delay;
        lostSeconds += delay;
        // 같은 패턴 안에서 같은 스킬을 무한 재시도하지 않고,
        // 해당 순서의 기회를 놓친 뒤 다음 사이클에서 다시 시도한다.
        cursor = (cursor + 1) % regular.length;
        firstActionInWindow = false;
        continue;
      }
      // 3잡 공격 기회는 스킬 사용 시도마다 20% 확률로 한 번만 1초 늦어진다.
      if (phase?.grab && playerRandom() >= 0.8) {
        const wait = Math.min(1, availableEnd - now);
        lostSeconds += wait;
        now += wait;
        continue;
      }
      const impact = start + Math.max(0.1, skill.motionSeconds ?? skill.duration);
      lastStartedAt.set(skill.skillName, start);
      const interruptedByControl = controlEvent && controlEvent.at > start && controlEvent.at < impact &&
        (controlEvent.type === "knockdown" || (controlEvent.type === "stagger" && !skill.staggerImmune));
      if (interruptedByControl) {
        const event = controlEvent!;
        if (input.recordActions) actions.push({ skillName: skill.skillName, start, motionEnd: event.end, cancelled: true, cancelReason: event.type });
        now = Math.min(duration, event.end);
        busyUntil = Math.max(busyUntil, event.end);
        controlEvent = null;
        const row = rows.get(skill.skillName)!;
        row.uses += 1;
        row.misses += 1;
        attemptedUses += 1;
        const previousReadyAt = readyAt.get(skill.skillName);
        const unusedBeforeUse = previousReadyAt === undefined ? start : Math.max(0, start - previousReadyAt);
        readyIdleSeconds.set(skill.skillName, (readyIdleSeconds.get(skill.skillName) ?? 0) + unusedBeforeUse);
        readyAt.set(skill.skillName, start + Math.max(0, skill.cooldown));
        if (skill.isDragonFinisher) {
          if (finisher) readyAt.set(finisher.skillName, start + finisher.cooldown);
        } else cursor = (cursor + 1) % regular.length;
        firstActionInWindow = false;
        continue;
      }
      if (input.recordActions) actions.push({ castId: `${skill.skillName}:${attemptedUses}`, skillName: skill.skillName, start, motionEnd: impact });
      // 딜 가능 시간 안에 시전을 시작했다면 패턴 종료까지 시전이 이어져도 적중으로 본다.
      // 딜 불가 구간에서는 while 진입 자체를 막으므로 별도 미적중을 만들지 않는다.
      const hit = start < duration;
      // 백어택은 시전 시작이 아니라 실제 타격 시점의 보스 방향으로 판정한다.
      // 적룡필살은 백에서 시전해도 모션 중 방향이 바뀌면 비백으로 처리될 수 있다.
      const impactElapsed = elapsed + Math.max(0, impact - start);
      const backAttackAtImpact = phase
        ? true
        : isBackAttackAvailable(pattern, impactElapsed, patternRoll, targetedRoll);
      const backAttack = Boolean(
        hit && skill.isBackAttackSkill && backAttackAtImpact &&
        playerRandom() <= (skill.isDragonFinisher ? finisherBackExecutionRate : backExecutionRate),
      );
      const criticalRate = backAttack ? skill.backAttackCriticalRate ?? skill.criticalRate ?? 0 : skill.criticalRate ?? 0;
      const critical = Boolean(hit && playerRandom() < criticalRate);
      const normalDamage = backAttack && skill.backAttackDamage !== undefined ? skill.backAttackDamage : skill.damage;
      const normalCriticalDamage = backAttack && skill.backAttackCriticalDamage !== undefined
        ? skill.backAttackCriticalDamage
        : (skill.criticalDamage ?? normalDamage);
      const damage = (hit ? (critical ? normalCriticalDamage : normalDamage) : 0) * (phase?.multiplier ?? 1);
      if (phaseLog) { phaseLog.attacks += 1; phaseLog.damage += damage; }
  const row = rows.get(skill.skillName)!;
      row.uses += 1; row.hits += Number(hit); row.misses += Number(!hit);
      row.criticals += Number(critical); row.nonCriticals += Number(hit && !critical);
      row.backAttacks += Number(backAttack); row.totalDamage += damage;
      attemptedUses += 1; successfulUses += Number(hit); criticals += Number(critical);
      const previousReadyAt = readyAt.get(skill.skillName);
      const unusedBeforeUse = previousReadyAt === undefined
        ? start
        : Math.max(0, start - previousReadyAt);
      readyIdleSeconds.set(skill.skillName, (readyIdleSeconds.get(skill.skillName) ?? 0) + unusedBeforeUse);
      readyAt.set(skill.skillName, start + Math.max(0, skill.cooldown));
      busyUntil = impact + (skill.isDragonFinisher ? 0 : postActionRecovery);
      // 패턴·기믹 경계를 넘어간 모션도 실제 종료 시각까지 시간을 점유한다.
      // 다음 구간을 경계 시각으로 되돌리지 않는다.
      now = Math.min(busyUntil, duration);
      if (skill.isDragonFinisher) {
        if (finisher) readyAt.set(finisher.skillName, start + finisher.cooldown);
      } else cursor = (cursor + 1) % regular.length;
      firstActionInWindow = false;
    }
    lostSeconds += Math.max(0, patternEnd - availableEnd);
    now = Math.max(now, patternEnd, Math.min(duration, busyUntil));
    // 기본 패턴 사이 2~3초는 백어택 프리딜 구간이다. 보스 시간축에
    // 포함하되, 다음 기본 패턴 추첨과 분리된 phase로 처리한다.
    if (!phase && now < duration) {
      const gapSeconds = 2 + bossRandom();
      pendingPhases.push({
        name: "패턴 사이",
        scheduledAt: now,
        start: now,
        end: Math.min(duration, now + gapSeconds),
        multiplier: 1,
        grab: false,
        resetCycle: false,
      });
    }
  }
  const skillStatistics = [...rows.values()].map((row) => ({
    ...row,
    usesPerMinute: row.uses * 60 / duration,
    cooldownRatio: Math.max(0, 1 - (
      (readyIdleSeconds.get(row.skillName) ?? 0) +
      (readyAt.has(row.skillName) ? Math.max(0, duration - (readyAt.get(row.skillName) ?? duration)) : duration)
    ) / duration),
    readyIdleSeconds: (readyIdleSeconds.get(row.skillName) ?? 0) +
      (readyAt.has(row.skillName) ? Math.max(0, duration - (readyAt.get(row.skillName) ?? duration)) : duration),
  }));
  const totalDamage = skillStatistics.reduce((sum, row) => sum + row.totalDamage, 0);
  return { actions, movementEvents: [], mechanicPhases, totalDamage, dps: totalDamage / duration, attemptedUses, successfulUses, criticals, patternCount, skillStatistics, lostSeconds, statusLossSeconds: 0, threeJobDelaySeconds: 0, threeJobDelayedUses: 0, lossBreakdown: emptyLossBreakdown(), finisherReadyIdleBreakdown: emptyFinisherReadyIdleBreakdown(), finisherDecisionDiagnostics: emptyFinisherDecisionDiagnostics(), finisherDecisionSnapshots: [], cooldownWaitSeconds, durationSeconds: duration, seed: input.seed ?? 1 };
}

/**
 * Fixed boss timeline simulation. The boss schedule is generated before any
 * player action and is therefore identical for different player levels.
 */
function runCombatSimulationInternal(input: SimulationInput): SimulationResult {
  errorCheck(input);
  const duration = input.durationSeconds;
  const seed = input.seed ?? 1;
  const timeline = input.bossTimeline ?? createBossTimeline(duration, input.bossSeed ?? seed);
  const playerRandom = rng(seed ^ 0x2468ace0);
  const readyAt = new Map<string, number>();
  const readyIdle = new Map<string, number>();
  const readyIdleBreakdowns = new Map<string, SkillReadyIdleBreakdown>();
  const rows = new Map<string, SkillStatistics>();
  const hitOrdinals = new Map<string, number>();
  const actions: SimulationResult["actions"] = [];
  const movementEvents: SimulationMovementEvent[] = [];
  const sourceCycleCards = input.cycle;
  const encounterCards = sourceCycleCards?.filter((card) => card.section === "encounter") ?? [];
  const repeatFlurryCards = sourceCycleCards?.filter((card) => card.section === "repeat-flurry") ?? [];
  const repeatFocusCards = sourceCycleCards?.filter((card) => card.section === "repeat-focus") ?? [];
  const hasCycleSections = Boolean(sourceCycleCards?.some((card) => card.section));
  const cycleCards = sourceCycleCards
    ? (hasCycleSections
      ? [...encounterCards, ...repeatFlurryCards, ...repeatFocusCards]
      : sourceCycleCards)
    : undefined;
  const sectionedExecution = Boolean(input.simulationBuild && hasCycleSections);
  const executionCards = sectionedExecution ? encounterCards : cycleCards ?? [];
  const repeatCards = sectionedExecution ? [...repeatFlurryCards, ...repeatFocusCards] : [];
  const regular = cycleCards
    ? cycleCards.map((card) => input.skills.find((skill) => skill.cardId === card.cardId) ?? input.skills.find((skill) => skill.skillName === card.skillName)!).filter(Boolean)
    : input.skills.filter((skill) => !skill.isDragonFinisher);
  const regularCardNames = cycleCards?.map((card) => card.skillName) ?? regular.map((skill) => skill.skillName);
  const repeatStartCursor = encounterCards.length;
  const repeatEndCursor = regularCardNames.length;
  const nextCycleCursor = (current: number) => {
    const next = current + 1;
    if (sectionedExecution) return next;
    if (!cycleCards) return regular.length ? next % regular.length : 0;
    if (next < repeatEndCursor) return next;
    return repeatStartCursor < repeatEndCursor ? repeatStartCursor : 0;
  };
  const finisher = input.skills.find((skill) => skill.isDragonFinisher);
  const repeatFinisher = finisher;
  for (const skill of input.skills) {
    rows.set(skill.skillName, { skillName: skill.skillName, uses: 0, hits: 0, misses: 0, criticals: 0, nonCriticals: 0, backAttacks: 0, azureHits: 0, totalDamage: 0, usesPerMinute: 0, cooldownRatio: 0, readyIdleSeconds: 0, readyIdleBreakdown: emptySkillReadyIdleBreakdown() });
    // 전투 시작 시 모든 스킬은 준비 상태다. undefined를 “미사용”으로
    // 해석하면 일반 쿨비와 필살 원인별 미사용 장부가 서로 다른 시간축을
    // 사용하게 되므로, 초기 준비 시각을 명시적으로 0으로 둔다.
    readyAt.set(skill.skillName, 0);
    readyIdleBreakdowns.set(skill.skillName, emptySkillReadyIdleBreakdown());
  }
  const mechanicPhases = timeline.mechanics.map((phase) => ({ ...phase, attacks: 0, damage: 0 }));
  let now = 0;
  let cursor = 0;
  let executionPhase: "encounter" | "repeat" = encounterCards.length > 0 ? "encounter" : "repeat";
  let repeatStance: "repeat-flurry" | "repeat-focus" = "repeat-flurry";
  let phaseCursor = 0;
  let controlUntil = 0;
  let castUntil = 0;
  let stanceSwitchUntil = 0;
  let playerAtBack = true;
  let knownDirection = 0;
  let attemptedUses = 0;
  let successfulUses = 0;
  let criticals = 0;
  let cooldownWaitSeconds = 0;
  let lostSeconds = 0;
  let statusLossSeconds = 0;
  let threeJobDelaySeconds = 0;
  let threeJobDelayedUses = 0;
  let getUpReadyAt = 0;
  let riskIndex = 0;
  let firstInWindow = true;
  let lastPatternKey: string | number | undefined;
  let previousWindowAttackable: boolean | undefined;
  let recoveryReadyAt = 0;
  let recoveryTicketId = 0;
  let cycleResumeUntil = 0;
  const resolvedLinkHesitations = new Set<string>();
  const resolvedShortWindows = new Set<string>();
  let pendingDirectionObservation: { version: number; availableAt: number } | null = null;
  const stanceMode = Boolean(input.cycle);
  let stance: SimulationStance = "난무";
  let isInitialFlurry = true;
  let castsSinceStanceEntry = 0;
  const usedSkillNamesSinceStanceEntry = new Set<string>();
  let yeongaAvailable = false;
  let yeongaArmed = false;
  let finisherReserved = false;
  let finisherReservationState: FinisherReservationState = "none";
  let finisherReadyDelayPending = false;
  let finisherReadyDelayJudged = false;
  const finisherDecisionDiagnostics = emptyFinisherDecisionDiagnostics();
  const finisherDecisionSnapshots: FinisherDecisionSnapshot[] = [];
  const recordFinisherDecision = (snapshot: FinisherDecisionSnapshot) => {
    if (input.recordDecisionDiagnostics === true) finisherDecisionSnapshots.push(snapshot);
  };
  let visitId = 0;
  let azureExpiresAt = -Infinity;
  const delayedThreeJobOpportunities = new Set<string>();
  const behaviorProfile = resolveBehaviorProfile(input.playerLevel);
  let activeMovement: {
    reason: "pattern-gap" | "finisher-reposition";
    remaining: number;
    directionVersionAtStart: number;
  } | null = null;
  const drawRepositionDuration = (reason: "pattern-gap" | "finisher-reposition") => {
    if (!activeMovement || activeMovement.reason !== reason) {
      activeMovement = {
        reason,
        remaining: triangular(playerRandom, 0.5, 2, 2.99) * behaviorProfile.repositionDurationMultiplier,
        directionVersionAtStart: knownDirection,
      };
    }
    return activeMovement.remaining;
  };
  const getActiveMovementRemaining = () => activeMovement?.remaining ?? 0;
  const lossIntervals: { start: number; end: number; reason: SimulationLossReason }[] = [];
  const statusIntervals: { start: number; end: number }[] = [];
  const finisherReadyIdleBreakdown = emptyFinisherReadyIdleBreakdown();
  const finisherReservationIntervals: {
    start: number;
    end: number;
    state: FinisherReservationState;
  }[] = [];
  let finisherReservationStateStartedAt = 0;
  const setFinisherReservationState = (next: FinisherReservationState) => {
    if (next === finisherReservationState) return;
    if (finisherReservationStateStartedAt < now) {
      finisherReservationIntervals.push({
        start: finisherReservationStateStartedAt,
        end: now,
        state: finisherReservationState,
      });
    }
    finisherReservationStateStartedAt = now;
    finisherReservationState = next;
  };
  const recordLoss = (reason: SimulationLossReason, start: number, end: number) => {
    if (end > start) lossIntervals.push({ reason, start: Math.max(0, start), end: Math.min(duration, end) });
  };
  const recordStatusLoss = (start: number, end: number) => {
    if (end > start) statusIntervals.push({ start: Math.max(0, start), end: Math.min(duration, end) });
  };
  const registerDirectionChange = (at: number, version: number) => {
    playerAtBack = false;
    if (pendingDirectionObservation?.version === version) return;
    const key = `direction:${at.toFixed(3)}:${version}`;
    const recognized = deterministicRoll(input.bossSeed ?? seed, key) < behaviorProfile.cueRecognitionProbability;
    pendingDirectionObservation = {
      version,
      availableAt: at + behaviorProfile.cueRecognitionDelaySeconds + (recognized ? 0 : 0.5),
    };
  };
  const syncDirectionObservation = (at: number) => {
    if (pendingDirectionObservation && at >= pendingDirectionObservation.availableAt) {
      knownDirection = pendingDirectionObservation.version;
      pendingDirectionObservation = null;
    }
  };
  const recordFinisherReadyIdle = (start: number, end: number) => {
    let cursor = Math.max(0, start);
    const finish = Math.min(duration, end);
    while (cursor < finish) {
      const window = bossWindowAt(timeline, cursor);
      const lossBoundaries = lossIntervals
        .flatMap((interval) => [interval.start, interval.end])
        .filter((boundary) => boundary > cursor && boundary < finish);
      const nextLossBoundary = lossBoundaries.length > 0 ? Math.min(...lossBoundaries) : finish;
      const reservationInterval = finisherReservationIntervals.find((interval) => interval.start <= cursor && interval.end > cursor);
      const reservationState = reservationInterval?.state ?? (cursor >= finisherReservationStateStartedAt ? finisherReservationState : "none");
      const reservationBoundaries = finisherReservationIntervals
        .flatMap((interval) => [interval.start, interval.end])
        .filter((boundary) => boundary > cursor && boundary < finish);
      const nextReservationBoundary = reservationBoundaries.length > 0 ? Math.min(...reservationBoundaries) : finish;
      const segmentEnd = Math.min(finish, window?.end ?? finish, nextLossBoundary, nextReservationBoundary);
      const seconds = Math.max(0, segmentEnd - cursor);
      const activeLoss = lossIntervals
        .filter((interval) => interval.start <= cursor && interval.end > cursor)
        .sort((left, right) => LOSS_REASONS.indexOf(left.reason) - LOSS_REASONS.indexOf(right.reason))[0];
      if (!window || !window.attackable) {
        finisherReadyIdleBreakdown.bossUnavailable += seconds;
        const source = window?.source ?? "알 수 없는 구간";
        finisherReadyIdleBreakdown.bossUnavailableBySource[source] =
          (finisherReadyIdleBreakdown.bossUnavailableBySource[source] ?? 0) + seconds;
      }
      else if (activeLoss?.reason === "status") finisherReadyIdleBreakdown.status += seconds;
      else if (activeLoss?.reason === "movement") finisherReadyIdleBreakdown.reposition += seconds;
      else if (activeLoss?.reason === "input") finisherReadyIdleBreakdown.input += seconds;
      else if (reservationState === "threshold-deferred" || reservationState === "judgment-missed") finisherReadyIdleBreakdown.reserveDeferred += seconds;
      else if (activeLoss?.reason === "orderMotion") finisherReadyIdleBreakdown.otherMotion += seconds;
      else if (activeLoss?.reason === "patternResponse") finisherReadyIdleBreakdown.patternResponse += seconds;
      else if (activeLoss?.reason === "cooldownWait") finisherReadyIdleBreakdown.stanceOrOrderWait += seconds;
      else if (input.backAttackModel !== "quota" && !window.backAllowed) finisherReadyIdleBreakdown.backForbidden += seconds;
      else finisherReadyIdleBreakdown.stanceOrOrderWait += seconds;
      cursor = segmentEnd > cursor ? segmentEnd : finish;
    }
  };
  const recordSkillReadyIdle = (skillName: string, start: number, end: number) => {
    const breakdown = readyIdleBreakdowns.get(skillName);
    if (!breakdown) return;
    let cursor = Math.max(0, start);
    const finish = Math.min(duration, end);
    while (cursor < finish) {
      const window = bossWindowAt(timeline, cursor);
      const lossBoundaries = lossIntervals
        .flatMap((interval) => [interval.start, interval.end])
        .filter((boundary) => boundary > cursor && boundary < finish);
      const nextLossBoundary = lossBoundaries.length > 0 ? Math.min(...lossBoundaries) : finish;
      const segmentEnd = Math.min(finish, window?.end ?? finish, nextLossBoundary);
      const seconds = Math.max(0, segmentEnd - cursor);
      const activeLoss = lossIntervals
        .filter((interval) => interval.start <= cursor && interval.end > cursor)
        .sort((left, right) => LOSS_REASONS.indexOf(left.reason) - LOSS_REASONS.indexOf(right.reason))[0];
      if (!window || !window.attackable) breakdown.bossUnavailable += seconds;
      else if (activeLoss?.reason === "status") breakdown.status += seconds;
      else if (activeLoss?.reason === "movement") breakdown.reposition += seconds;
      else if (activeLoss?.reason === "input") breakdown.input += seconds;
      else if (activeLoss?.reason === "orderMotion") breakdown.otherMotion += seconds;
      else if (activeLoss?.reason === "patternResponse") breakdown.patternResponse += seconds;
      else if (activeLoss?.reason === "cooldownWait") breakdown.stanceOrOrderWait += seconds;
      else if (input.backAttackModel !== "quota" && !window.backAllowed) breakdown.backForbidden += seconds;
      else breakdown.stanceOrOrderWait += seconds;
      cursor = segmentEnd > cursor ? segmentEnd : finish;
    }
  };
  const addIdle = (skill: SimulationSkill, start: number) => {
    const ready = readyAt.get(skill.skillName);
    const idleSeconds = ready === undefined ? start : Math.max(0, start - ready);
    readyIdle.set(skill.skillName, (readyIdle.get(skill.skillName) ?? 0) + idleSeconds);
    if (ready !== undefined) recordSkillReadyIdle(skill.skillName, ready, start);
    if (skill.isDragonFinisher && ready !== undefined) recordFinisherReadyIdle(ready, start);
  };
  const registerCast = (skill: SimulationSkill) => {
    if (!stanceMode) return;
    castsSinceStanceEntry += 1;
    usedSkillNamesSinceStanceEntry.add(skill.skillName);
  };
  const canSwitchStance = () => stance === "난무"
    ? (isInitialFlurry ? castsSinceStanceEntry >= 1 : usedSkillNamesSinceStanceEntry.size >= 2)
    : castsSinceStanceEntry >= 3 && !finisherReserved;
  const resetStanceEntry = (next: SimulationStance) => {
    setFinisherReservationState("none");
    visitId += 1;
    stance = next;
    castsSinceStanceEntry = 0;
    usedSkillNamesSinceStanceEntry.clear();
    isInitialFlurry = false;
    yeongaAvailable = true;
    yeongaArmed = false;
    finisherReserved = false;
    finisherReadyDelayPending = false;
    finisherReadyDelayJudged = false;
    if (next === "난무" && executionPhase === "repeat" && visitId > 1) {
      const decision = sampleDecision(
        behaviorProfile,
        "cycle-start",
        deterministicRoll(input.bossSeed ?? seed, `cycle-start:${visitId}`),
        deterministicRoll(input.bossSeed ?? seed, `cycle-start-delay:${visitId}`),
      );
      if (decision.occurs) {
        cycleResumeUntil = now + decision.delaySeconds;
        recordLoss("patternResponse", now, cycleResumeUntil);
      }
    }
    if (next === "집중" && executionPhase === "repeat" && repeatFinisher) {
      const threshold = input.finisherReserveThresholdSeconds ?? 7.5;
      const finisherReadyAt = readyAt.get(repeatFinisher.skillName) ?? 0;
      const remaining = Math.max(0, finisherReadyAt - now);
      if (remaining <= threshold) {
        finisherDecisionDiagnostics.reservationEligibleVisits += 1;
        const missed = deterministicRoll(input.bossSeed ?? seed, `finisher-reservation:${visitId}`) < behaviorProfile.finisherReservationMissProbability;
        if (missed) {
          setFinisherReservationState("judgment-missed");
          finisherDecisionDiagnostics.reservationMisses += 1;
        } else {
          finisherReserved = true;
          setFinisherReservationState("reserved");
        }
      } else {
        setFinisherReservationState("threshold-deferred");
        finisherDecisionDiagnostics.thresholdDeferredVisits += 1;
      }
      recordFinisherDecision({
        at: now,
        trigger: "focus-entry",
        phase: executionPhase,
        visitId,
        stance: next,
        readyAt: finisherReadyAt,
        reservation: finisherReservationState,
        nextRegularCardId: activeSectionCards()?.[0]?.cardId,
        decision: finisherReserved ? "prepare" : "wait",
        reason: remaining <= threshold ? (finisherReserved ? "예약 완료" : "예약 판단 누락") : "N초 초과",
      });
    }
  };
  const activeSectionCards = () => executionPhase === "encounter"
    ? encounterCards
    : repeatStance === "repeat-flurry" ? repeatFlurryCards : repeatFocusCards;
  const advanceSectionCard = () => {
    if (!sectionedExecution) return;
    const cards = activeSectionCards();
    const nextCursor = phaseCursor + 1;
    if (executionPhase === "repeat" && repeatStance === "repeat-focus" && nextCursor >= cards.length && finisherReserved) {
      // 일반 집중 카드가 끝나도 예약 필살이 남아 있으면 같은 방문을
      // 유지하고, 다음 루프에서 필살 전용 대기 상태로 진입한다.
      phaseCursor = cards.length;
      return;
    }
    phaseCursor = nextCursor;
    if (phaseCursor < cards.length) return;
    phaseCursor = 0;
    if (executionPhase === "encounter") {
      executionPhase = "repeat";
      repeatStance = "repeat-flurry";
      stanceSwitchUntil = Math.max(stanceSwitchUntil, now + 0.3);
      now = stanceSwitchUntil;
      resetStanceEntry("난무");
    } else {
      repeatStance = repeatStance === "repeat-flurry" ? "repeat-focus" : "repeat-flurry";
      stanceSwitchUntil = Math.max(stanceSwitchUntil, now + 0.3);
      now = stanceSwitchUntil;
      resetStanceEntry(repeatStance === "repeat-flurry" ? "난무" : "집중");
    }
  };
  const findMechanicRecoveryCursor = () => {
    const required = new Set(["맹룡열파", "반월섬", "청룡진"]);
    for (let start = 0; start < regularCardNames.length; start += 1) {
      if (stanceForSkill(regularCardNames[start]) !== "난무") continue;
      const seen = new Set<string>();
      for (let index = start; index < regularCardNames.length; index += 1) {
        const name = regularCardNames[index];
        if (stanceForSkill(name) !== "난무") break;
        seen.add(name);
      }
      if ([...required].every((name) => seen.has(name))) return start;
    }
    return 0;
  };
  const resolveRisk = (event: typeof timeline.riskEvents[number], castingSkill?: SimulationSkill) => {
    if (event.roll >= riskChance(input.playerLevel, event.type)) return null;
    if (event.type === "stagger" && castingSkill?.staggerImmune) return null;
    // A prior status already owns this time range; do not stack its duration.
    // 넘어짐은 진행 중인 경직을 끊을 수 있다. 반대로 경직·버벅임은
    // 기존 넘어짐을 중첩시키지 않는다.
    if (event.type !== "knockdown" && event.time < controlUntil) return null;
    if (event.type === "knockdown") {
      const hasGetUp = event.time >= getUpReadyAt;
      const seconds = hasGetUp ? 2 : event.longKnockdownSeconds;
      if (hasGetUp) getUpReadyAt = event.time + 26;
      return { end: event.time + seconds, reason: hasGetUp ? "knockdown-get-up" : "knockdown" };
    }
    return { end: event.time + (event.type === "stagger" ? 0.5 : 1), reason: event.type };
  };
  const scheduleRecoveryDecision = (eventTime: number, end: number) => {
    const ticket = recoveryTicketId++;
    const decision = sampleDecision(
      behaviorProfile,
      "interruption-recovery",
      deterministicRoll(input.bossSeed ?? seed, `recovery:${ticket}:${eventTime}`),
      deterministicRoll(input.bossSeed ?? seed, `recovery-delay:${ticket}:${eventTime}`),
    );
    recoveryReadyAt = Math.max(recoveryReadyAt, end + (decision.occurs ? decision.delaySeconds : 0));
    if (decision.occurs) recordLoss("patternResponse", end, end + decision.delaySeconds);
  };
  const advanceMovement = (start: number, requestedEnd: number) => {
    let end = Math.min(duration, requestedEnd);
    let cursor = start;
    syncDirectionObservation(cursor);
    while (cursor < end) {
      const directionChange = timeline.windows
        .filter((candidate) => candidate.start > cursor && candidate.start < end && candidate.directionVersion !== knownDirection)
        .sort((left, right) => left.start - right.start)[0];
      const nextRisk = timeline.riskEvents[riskIndex];
      const nextDirectionTime = directionChange?.start ?? end;
      const nextRiskTime = nextRisk && nextRisk.time < end ? nextRisk.time : end;
      const nextEventTime = Math.min(nextDirectionTime, nextRiskTime);
      if (nextEventTime > cursor && nextEventTime < end && nextEventTime === nextDirectionTime) {
        cursor = nextEventTime;
        registerDirectionChange(cursor, directionChange!.directionVersion);
        syncDirectionObservation(cursor);
        // 이미 이동한 상대 위치는 유지하되, 이전 방향을 전제로 한
        // 뒤잡기 목표는 더 이상 유효하지 않다. 회복·이동 완료 후
        // 다음 판단에서 새 방향 기준으로 다시 경로를 잡는다.
        playerAtBack = false;
        continue;
      }
      if (nextRiskTime >= end) break;
      const event = timeline.riskEvents[riskIndex];
      riskIndex += 1;
      const effect = resolveRisk(event);
      if (!effect) continue;
      const statusEnd = Math.min(duration, effect.end);
      recordLoss("status", event.time, statusEnd);
      recordStatusLoss(event.time, statusEnd);
      controlUntil = Math.max(controlUntil, statusEnd);
      scheduleRecoveryDecision(event.time, statusEnd);
      const movementEnd = Math.max(start, event.time);
      if (activeMovement) {
        activeMovement.remaining = Math.max(0, activeMovement.remaining - Math.max(0, movementEnd - start));
      }
      return { end: movementEnd, interrupted: true };
    }
    if (activeMovement) {
      activeMovement.remaining = Math.max(0, activeMovement.remaining - Math.max(0, end - start));
      if (activeMovement.remaining <= 0.000001) activeMovement = null;
    }
    return { end, interrupted: false };
  };
  while (now < duration && regular.length) {
    syncDirectionObservation(now);
    while (riskIndex < timeline.riskEvents.length && timeline.riskEvents[riskIndex].time <= now) {
      const effect = resolveRisk(timeline.riskEvents[riskIndex]);
      riskIndex += 1;
      if (effect) {
        const end = Math.min(duration, effect.end);
        recordStatusLoss(timeline.riskEvents[riskIndex - 1].time, end);
        recordLoss("status", timeline.riskEvents[riskIndex - 1].time, end);
        controlUntil = Math.max(controlUntil, end);
        scheduleRecoveryDecision(timeline.riskEvents[riskIndex - 1].time, end);
      }
    }
    // 물리적 행동 제한만 먼저 해제한다. 일반 카드 복구 판단의
    // recoveryReadyAt은 필살 후보 판단을 막는 전역 busy 상태가 아니다.
    if (controlUntil > now) now = controlUntil;
    const window = bossWindowAt(timeline, now);
    if (!window) break;
    const encounterFinisherPending = executionPhase === "encounter" && encounterCards[phaseCursor]?.skillName === "적룡필살";
    const finisherRelaxedCandidate = Boolean(
      sectionedExecution && ((executionPhase === "repeat" && (repeatStance as string) === "repeat-focus" && finisherReserved && repeatFinisher) || encounterFinisherPending) &&
      window.source.startsWith("패턴 ") && window.patternId !== undefined && !window.attackable,
    );
    const finisherRelaxedWindow = Boolean(
      sectionedExecution && ((executionPhase === "repeat" && (repeatStance as string) === "repeat-focus" && finisherReserved && repeatFinisher) || encounterFinisherPending) &&
      isFinisherBasicPatternRelaxed(window, now),
    );
    previousWindowAttackable = window.attackable;
    if (window.directionVersion !== knownDirection) {
      // 방향 변경 자체는 즉시 발생하지만, 플레이어가 행동에 사용할 수
      // 있는 시점은 실력별 인지 확률·인지 지연 이후다.
      registerDirectionChange(window.start, window.directionVersion);
      syncDirectionObservation(now);
    }
    if (window.source === "패턴 사이" && window.backAllowed) {
      // The gap permits a back attack, but reaching it consumes real time.
      // Do not teleport the player to the back at the gap boundary.
      if (!playerAtBack) {
        const movement = drawRepositionDuration("pattern-gap");
        const movementStart = now;
        const movementResult = advanceMovement(now, Math.min(window.end, now + movement));
        const movementEnd = movementResult.end;
        recordLoss("movement", now, movementEnd);
        now = movementEnd;
        const reachedBack = !movementResult.interrupted && !activeMovement && now < window.end;
        movementEvents.push({ start: movementStart, end: movementEnd, duration: movementEnd - movementStart, reason: "pattern-gap", completed: reachedBack, directionVersionAtStart: window.directionVersion, directionVersionAtEnd: bossWindowAt(timeline, now)?.directionVersion ?? window.directionVersion, reachedBack });
        if (reachedBack) playerAtBack = true;
        if (movementResult.interrupted || now >= window.end) continue;
      }
      playerAtBack = true;
    }
    const patternKey = window.patternId ?? window.source;
    if (patternKey !== lastPatternKey) {
      firstInWindow = true;
      lastPatternKey = patternKey;
    }
    if (
      !window.attackable &&
      !finisherRelaxedCandidate &&
      window.movementAllowed !== false &&
      sectionedExecution &&
      executionPhase === "repeat" &&
      (repeatStance as string) === "repeat-focus" &&
      finisherReserved &&
      repeatFinisher &&
      input.backAttackModel !== "quota" &&
      !playerAtBack
    ) {
      // 딜 불가지만 이동 가능한 구간에서는 예약 필살을 위해 미리
      // 이동한다. 이 이동은 현재 구간의 피해를 허용하지 않으며,
      // 다음 백 가능 구간에서만 타격 판정을 통과한다.
      const movementStart = now;
      const movement = drawRepositionDuration("finisher-reposition");
      const movementResult = advanceMovement(now, Math.min(window.end, now + movement));
      const movementEnd = movementResult.end;
      recordLoss("movement", movementStart, movementEnd);
      now = movementEnd;
      const afterMove = bossWindowAt(timeline, now);
      const reachedPosition = !movementResult.interrupted && !activeMovement && Boolean(afterMove && afterMove.directionVersion === knownDirection && now < window.end);
      movementEvents.push({ start: movementStart, end: movementEnd, duration: movementEnd - movementStart, reason: "finisher-reposition", completed: reachedPosition, directionVersionAtStart: knownDirection, directionVersionAtEnd: afterMove?.directionVersion ?? knownDirection, reachedBack: reachedPosition });
      if (reachedPosition) playerAtBack = true;
      if (movementResult.interrupted || now < window.end) continue;
    }
    if (!window.attackable && !finisherRelaxedCandidate) {
      // 공격 불가라도 진행 중인 이동은 구간 경계에서 끊지 않는다.
      // 이동 가능 여부와 피해 가능 여부는 별도 상태다.
      const remainingMovement = getActiveMovementRemaining();
      if (remainingMovement > 0 && window.movementAllowed !== false) {
        const movementStart = now;
        const movement = remainingMovement;
        const movementResult = advanceMovement(now, Math.min(window.end, now + movement));
        const movementEnd = movementResult.end;
        recordLoss("movement", movementStart, movementEnd);
        now = movementEnd;
        if (movementResult.interrupted || now < window.end) continue;
      }
      lostSeconds += window.end - now;
      recordLoss("bossUnavailable", now, window.end);
      now = window.end;
      if (window.source === "360줄") {
        if (sectionedExecution) {
          executionPhase = "repeat";
          repeatStance = "repeat-flurry";
          phaseCursor = 0;
          // 360줄 종료 후 반복 난무로 복귀하는 것은 실제 스탠스 전환이
          // 아니다. 이미 난무인 상태라면 전환 보상(연가심공)을 새로
          // 지급하지 않는다.
          if (stance !== "난무") {
            resetStanceEntry("난무");
          } else {
            castsSinceStanceEntry = 0;
            usedSkillNamesSinceStanceEntry.clear();
            isInitialFlurry = false;
            yeongaAvailable = false;
            yeongaArmed = false;
            finisherReserved = false;
          }
        } else {
          cursor = findMechanicRecoveryCursor();
          if (stanceMode) resetStanceEntry("난무");
        }
      }
      continue;
    }
    if (!window.attackable && finisherRelaxedCandidate && (repeatFinisher || encounterFinisherPending)) {
      const finisherReadyAt = encounterFinisherPending
        ? now
        : readyAt.get(repeatFinisher!.skillName) ?? Infinity;
      const earliestFinisherAt = Math.max(window.start + 0.5, finisherReadyAt);
      if (now < earliestFinisherAt && earliestFinisherAt < window.end) {
        recordLoss("cooldownWait", now, earliestFinisherAt);
        now = earliestFinisherAt;
        continue;
      }
      if (now >= window.end || finisherReadyAt > now) {
        lostSeconds += Math.max(0, window.end - now);
        recordLoss("bossUnavailable", now, window.end);
        now = window.end;
        continue;
      }
    }
    now = Math.max(now, controlUntil, castUntil, stanceSwitchUntil, cycleResumeUntil, recoveryReadyAt);
    if (now >= window.end) continue;
    const atBoundary = sectionedExecution ? phaseCursor === 0 : cursor === 0;
    if (stanceMode) {
      const sectionCards = activeSectionCards();
      const currentName = sectionedExecution
        ? sectionCards[phaseCursor]?.skillName ?? (
            executionPhase === "repeat" && (repeatStance as string) === "repeat-focus" && finisherReserved
              ? "적룡필살"
              : undefined
          )
        : regularCardNames[cursor];
      if (!currentName) {
        if (sectionedExecution) {
          // 예약 필살이 남은 집중 방문은 일반 카드가 끝나도 전환하지
          // 않고, 필살 전용 대기 상태로 남는다.
          if (executionPhase === "repeat" && (repeatStance as string) === "repeat-focus" && finisherReserved) {
            const finisherReadyAt = repeatFinisher ? (readyAt.get(repeatFinisher.skillName) ?? 0) : now;
            now = Math.min(window.end, Math.max(now, finisherReadyAt));
            continue;
          }
          if (executionPhase === "repeat" && !canSwitchStance()) {
            throw new Error(`${repeatStance} 방문의 최소 스킬 사용 조건을 충족하지 못했습니다.`);
          }
          advanceSectionCard();
          continue;
        }
        break;
      }
      const currentStance = stanceForSkill(currentName);
      if (!currentStance) throw new Error(`지원하지 않는 스탠스 스킬입니다: ${currentName}`);
      if (sectionedExecution && currentStance !== stance) {
        stanceSwitchUntil = Math.max(stanceSwitchUntil, now + 0.3);
        now = stanceSwitchUntil;
        resetStanceEntry(currentStance);
        firstInWindow = false;
        continue;
      }
      if (!sectionedExecution && currentStance !== stance) {
        if (canSwitchStance()) {
          stanceSwitchUntil = Math.max(stanceSwitchUntil, now + 0.3);
          now = stanceSwitchUntil;
          resetStanceEntry(currentStance);
          firstInWindow = false;
          continue;
        }
        const nextIndex = regularCardNames.findIndex((name, index) => index !== cursor && stanceForSkill(name) === stance);
        if (nextIndex < 0) throw new Error(`${stance} 스탠스의 최소 사용 횟수를 충족할 카드가 없습니다.`);
        cursor = nextIndex;
      }
    }
    const currentCard = sectionedExecution ? activeSectionCards()[phaseCursor] : cycleCards?.[cursor];
    let skill = sectionedExecution
      ? input.skills.find((candidate) => candidate.cardId === currentCard?.cardId) ?? input.skills.find((candidate) => candidate.skillName === currentCard?.skillName)
      : regular[cursor];
    if (!skill && sectionedExecution && !currentCard && executionPhase === "repeat" && (repeatStance as string) === "repeat-focus" && finisherReserved) skill = repeatFinisher;
    if (!skill) break;
    const finisherDefinition = repeatFinisher ?? finisher;
    const finisherReadyAtForPriority = finisherDefinition
      ? (readyAt.get(finisherDefinition.skillName) ?? 0)
      : Infinity;
    const finisherPriorityMotion = finisherDefinition
      ? Math.max(0.1, finisherDefinition.motionSeconds ?? finisherDefinition.duration)
      : Infinity;
    const finisherPriorityInput = firstInWindow
      ? finisherDefinition?.patternChangeDelaySeconds ?? resolveSimulationInputDelay(input.playerLevel, true)
      : finisherDefinition?.inputDelaySeconds ?? resolveSimulationInputDelay(input.playerLevel, false);
    const mechanicStartsDuringFinisher = timeline.mechanics.some((mechanic) =>
      mechanic.start === Math.min(...timeline.mechanics.filter((phase) => phase.name === mechanic.name).map((phase) => phase.start))
      && canFinishBeforeMechanic(now, mechanic.start, finisherPriorityInput, finisherPriorityMotion),
    );
    const mainMechanicFinisherPriority = Boolean(
      sectionedExecution && executionPhase === "repeat" && (repeatStance as string) === "repeat-focus" &&
      finisherDefinition && finisherReadyAtForPriority <= now && (yeongaAvailable || yeongaArmed) &&
      ((window.source === "360줄" && window.attackable && now + finisherPriorityInput + finisherPriorityMotion < window.end) || mechanicStartsDuringFinisher),
    );
    const legacyPolicyAllows = input.finisherReserveThresholdSeconds === undefined
      ? (input.finisherPolicy === undefined || input.finisherPolicy === "ready" || atBoundary)
      : true;
    let usingReservedFinisher = false;
    let finisherReady = Boolean(repeatFinisher && (!sectionedExecution || executionPhase === "repeat") && (!stanceMode || stance === ("집중" as SimulationStance)) &&
      (!stanceMode || finisherReserved) && legacyPolicyAllows &&
      (readyAt.get(repeatFinisher?.skillName ?? "") ?? 0) <= now);
    if (mainMechanicFinisherPriority) finisherReady = true;
    const finisherReservedForDecision = finisherReserved || mainMechanicFinisherPriority;
    if (finisherReady && finisherReserved && (repeatStance as string) === "repeat-focus" && !finisherReadyDelayJudged && playerAtBack && (input.backAttackModel === "quota" || window.backAllowed)) {
      finisherReadyDelayJudged = true;
      finisherDecisionDiagnostics.readyDelayJudgments += 1;
      const delayed = deterministicRoll(input.bossSeed ?? seed, `finisher-ready-delay:${visitId}`) < behaviorProfile.finisherReadyDelayProbability;
      if (delayed && currentCard && !skill.isDragonFinisher) {
        finisherReadyDelayPending = true;
        setFinisherReservationState("ready-delay-pending");
        finisherDecisionDiagnostics.readyDelayOccurrences += 1;
      }
      if (!currentCard || skill.isDragonFinisher) finisherDecisionDiagnostics.immediateAfterNoRegular += 1;
    }
    const canDelayReservedFinisher = Boolean(finisherReadyDelayPending && finisherReady && finisherReserved && executionPhase === "repeat" && (repeatStance as string) === "repeat-focus" && !skill.isDragonFinisher && currentCard);
    const finisherDecision = decideFinisherAction({
      phase: executionPhase,
      stance,
      finisherReserved: finisherReservedForDecision,
      finisherReady,
      encounterFinisher: Boolean(skill.isDragonFinisher && executionPhase === "encounter"),
      regularCardAvailable: Boolean(currentCard && !skill.isDragonFinisher),
      regularCardReady: readyAt.get(skill.skillName) === undefined || (readyAt.get(skill.skillName) ?? 0) <= now,
      backAllowed: window.backAllowed === true,
      playerAtBack: playerAtBack || finisherRelaxedWindow,
      movementAllowed: window.movementAllowed !== false,
    });
    if ((finisherDecision.kind === "cast-finisher" || finisherDecision.kind === "prepare-movement" || skill.isDragonFinisher || (!sectionedExecution && finisherReady) || mainMechanicFinisherPriority) && !canDelayReservedFinisher) {
      if (finisherReady && input.recordDecisionDiagnostics === true) {
        recordFinisherDecision({
          at: now,
          trigger: "cooldown-ready",
          phase: executionPhase,
          visitId,
          stance,
          readyAt: readyAt.get(repeatFinisher?.skillName ?? "") ?? now,
          reservation: finisherReservationState,
          nextRegularCardId: currentCard?.cardId,
          decision: skill.isDragonFinisher ? "cast" : "regular",
          reason: skill.isDragonFinisher ? "필살 우선 사용" : "일반 카드 선행 허용",
        });
      }
      if (!window.backAllowed && input.backAttackModel !== "quota") {
        // 백어택은 불가능해도 이동 가능한 구간이면 다음 백 가능 구간을
        // 위해 위치를 먼저 준비할 수 있다. 현재 구간에서는 타격하지 않고,
        // 다음 판단에서 실제 backAllowed를 다시 확인한다.
        if (!playerAtBack && window.movementAllowed !== false) {
          const movementStart = now;
          const movement = drawRepositionDuration("finisher-reposition");
          const movementResult = advanceMovement(now, Math.min(window.end, now + movement));
          const movementEnd = movementResult.end;
          recordLoss("movement", movementStart, movementEnd);
          now = movementEnd;
          const afterMove = bossWindowAt(timeline, now);
          const reachedPosition = !movementResult.interrupted && !activeMovement && Boolean(afterMove && afterMove.directionVersion === knownDirection && now < window.end);
          movementEvents.push({ start: movementStart, end: movementEnd, duration: movementEnd - movementStart, reason: "finisher-reposition", completed: reachedPosition, directionVersionAtStart: knownDirection, directionVersionAtEnd: afterMove?.directionVersion ?? knownDirection, reachedBack: reachedPosition });
          if (reachedPosition) playerAtBack = true;
          if (movementEnd > movementStart) continue;
        }
        // The finisher is deferred, but it must not be used in a window that
        // forbids back attacks.
        if (skill.isDragonFinisher) {
          now = window.end;
          continue;
        }
        // 예약 필살이 백 금지 구간에 걸리면 필살만 보류하고,
        // 현재 집중 카드에는 일반 스킬을 계속 적용한다.
        finisherReady = false;
      } else if (input.backAttackModel !== "quota" && !playerAtBack) {
        const movement = drawRepositionDuration("finisher-reposition");
        const movementStart = now;
        const movementResult = advanceMovement(now, Math.min(window.end, now + movement));
        const movementEnd = movementResult.end;
        recordLoss("movement", movementStart, movementEnd);
        now = movementEnd;
        const afterMove = bossWindowAt(timeline, now);
        const reachedBack = !movementResult.interrupted && !activeMovement && Boolean(afterMove && afterMove.directionVersion === knownDirection && afterMove.attackable && afterMove.backAllowed);
        movementEvents.push({ start: movementStart, end: movementEnd, duration: movementEnd - movementStart, reason: "finisher-reposition", completed: reachedBack, directionVersionAtStart: knownDirection, directionVersionAtEnd: afterMove?.directionVersion ?? knownDirection, reachedBack });
        if (reachedBack) playerAtBack = true;
        continue;
      } else {
        if (finisherReady) {
          skill = finisherDefinition!;
          usingReservedFinisher = true;
        }
      }
    }
    const ready = readyAt.get(skill.skillName) ?? 0;
    if (sectionedExecution && executionPhase === "repeat" && (repeatStance as string) === "repeat-focus" && castsSinceStanceEntry >= 3 && !skill.isDragonFinisher) {
      const remainingCooldown = Math.max(0, ready - now);
      if (shouldSkipFocusCard(skill.skillName, castsSinceStanceEntry, remainingCooldown, skill.cooldown)) {
        // 최소 집중 횟수 이후에만 방문 한정 생략을 허용한다.
        // 카드를 사용한 것으로 기록하지 않고 다음 미사용 카드로 이동한다.
        advanceSectionCard();
        continue;
      }
    }
    if (ready > now) {
      // 예약 필살이 아직 쿨인 동안에도, 이동 가능한 백 프리딜 구간이면
      // 상위 프로필은 준비 시각 전에 뒤잡기를 시작한다. 이동시간을 쿨
      // 완료 후 다시 더하지 않으며, 필살 준비 후에는 기존 타격 판정을 따른다.
      if (
        sectionedExecution &&
        executionPhase === "repeat" &&
        (repeatStance as string) === "repeat-focus" &&
        finisherReserved &&
        input.backAttackModel !== "quota" &&
        repeatFinisher &&
        !playerAtBack &&
        window.movementAllowed !== false
      ) {
        const finisherReadyAt = readyAt.get(repeatFinisher.skillName);
        const prepositionStartAt = (finisherReadyAt ?? now) - behaviorProfile.finisherPrepositionLeadSeconds;
        if (finisherReadyAt !== undefined && prepositionStartAt > now && prepositionStartAt < ready && prepositionStartAt < window.end) {
          cooldownWaitSeconds += prepositionStartAt - now;
          recordLoss("cooldownWait", now, prepositionStartAt);
          now = prepositionStartAt;
          continue;
        }
      }
      if (
        sectionedExecution &&
        executionPhase === "repeat" &&
        (repeatStance as string) === "repeat-focus" &&
        finisherReserved &&
        input.backAttackModel !== "quota" &&
        repeatFinisher &&
        !playerAtBack &&
        window.movementAllowed !== false &&
        readyAt.get(repeatFinisher.skillName) !== undefined
      ) {
        const finisherRemaining = Math.max(0, (readyAt.get(repeatFinisher.skillName) ?? now) - now);
        if (finisherRemaining > 0 && finisherRemaining <= behaviorProfile.finisherPrepositionLeadSeconds) {
          const movementStart = now;
          const movement = drawRepositionDuration("finisher-reposition");
          const movementResult = advanceMovement(now, Math.min(window.end, now + movement));
          const movementEnd = movementResult.end;
          recordLoss("movement", movementStart, movementEnd);
          now = movementEnd;
          const afterMove = bossWindowAt(timeline, now);
          const reachedBack = !movementResult.interrupted && !activeMovement && Boolean(afterMove && afterMove.directionVersion === knownDirection && afterMove.attackable && afterMove.backAllowed && now < window.end);
          movementEvents.push({ start: movementStart, end: movementEnd, duration: movementEnd - movementStart, reason: "finisher-reposition", completed: reachedBack, directionVersionAtStart: knownDirection, directionVersionAtEnd: afterMove?.directionVersion ?? knownDirection, reachedBack });
          if (reachedBack) playerAtBack = true;
          if (movementEnd > movementStart) continue;
        }
      }
      if (sectionedExecution && executionPhase === "repeat" && (repeatStance as string) === "repeat-focus" && finisherReserved && finisher) {
        const finisherReadyAt = readyAt.get(finisher.skillName) ?? 0;
        if (finisherReadyAt > now && finisherReadyAt < ready) {
          now = Math.min(window.end, finisherReadyAt);
          continue;
        }
      }
      const waited = Math.min(ready, window.end) - now;
      cooldownWaitSeconds += Math.max(0, waited);
      recordLoss("cooldownWait", now, now + Math.max(0, waited));
      now += Math.max(0, waited);
      continue;
    }
    if (sectionedExecution && executionPhase === "repeat" && repeatStance === "repeat-flurry" && skill.skillName === "청룡진") {
      const mongryongIndex = repeatFlurryCards.findIndex((card) => card.skillName === "맹룡열파");
      // 청룡진이 맹룡보다 앞에 있을 때만 맹룡 직전 사용 조건을 적용한다.
      // 맹룡 → 반월 → 청룡진 순서에서는 청룡진이 다음 맹룡 쿨을
      // 기다리면 안 되며, 현재 방문의 카드 순서를 그대로 진행한다.
      if (mongryongIndex >= 0 && phaseCursor < mongryongIndex) {
        const mongryongReadyAt = readyAt.get("맹룡열파") ?? 0;
        const mongryongRemaining = Math.max(0, mongryongReadyAt - now);
        if (mongryongRemaining > 1) {
          const waitUntil = Math.min(window.end, mongryongReadyAt - 1);
          if (waitUntil > now) {
            cooldownWaitSeconds += waitUntil - now;
            recordLoss("cooldownWait", now, waitUntil);
            now = waitUntil;
            continue;
          }
        }
      }
    }
    const inputDelay = firstInWindow
      ? (skill.patternChangeDelaySeconds ?? resolveSimulationInputDelay(input.playerLevel, true))
      : (skill.inputDelaySeconds ?? resolveSimulationInputDelay(input.playerLevel, false));
    const linkKey = `${visitId}:${phaseCursor}:${skill.skillName}`;
    if (castsSinceStanceEntry > 0 && !skill.isDragonFinisher && !resolvedLinkHesitations.has(linkKey)) {
      resolvedLinkHesitations.add(linkKey);
      const decision = sampleDecision(
        behaviorProfile,
        "link-hesitation",
        deterministicRoll(input.bossSeed ?? seed, `link:${linkKey}`),
        deterministicRoll(input.bossSeed ?? seed, `link-delay:${linkKey}`),
      );
      if (decision.occurs) {
        recordLoss("input", now, now + decision.delaySeconds);
        now += decision.delaySeconds;
      }
    }
    const shortWindowKey = `${visitId}:${phaseCursor}:${window.source}:${window.start}`;
    const predictedImpact = now + inputDelay + Math.max(0.1, skill.motionSeconds ?? skill.duration);
    if (!skill.isDragonFinisher && window.attackable && predictedImpact < window.end && !resolvedShortWindows.has(shortWindowKey)) {
      resolvedShortWindows.add(shortWindowKey);
      const decision = sampleDecision(
        behaviorProfile,
        "short-window",
        deterministicRoll(input.bossSeed ?? seed, `short-window:${shortWindowKey}`),
        deterministicRoll(input.bossSeed ?? seed, `short-window-margin:${shortWindowKey}`),
      );
      if (decision.occurs && predictedImpact + decision.delaySeconds >= window.end) {
        recordLoss("patternResponse", now, window.end);
        now = window.end;
        firstInWindow = false;
        continue;
      }
    }
    if (now + inputDelay >= window.end) { now = window.end; firstInWindow = false; continue; }
    const threeJob = mechanicPhases.find((phase) =>
      (phase.name === "첫 3잡" || phase.name === "두 번째 3잡") && now >= phase.start && now < phase.end,
    );
    if (threeJob) {
      // The key remains stable while the same card is delayed, so a loop
      // re-entry cannot reroll or apply more than one second to this use.
      const opportunity = `${threeJob.start}:${skill.skillName}:${rows.get(skill.skillName)!.uses}:${cursor}`;
      if (!delayedThreeJobOpportunities.has(opportunity)) {
        delayedThreeJobOpportunities.add(opportunity);
        if (deterministicRoll(input.bossSeed ?? seed, opportunity) < 0.2) {
          threeJobDelayedUses += 1;
          now = Math.min(duration, now + 1);
          threeJobDelaySeconds += Math.max(0, Math.min(1, duration - now + 1));
          recordLoss("patternResponse", now - 1, now);
          continue;
        }
      }
    }
    const start = now + inputDelay;
    // A risk event during input cancels the pending input. Re-evaluate the
    // same card once the status ends; cards are never skipped here.
    const preInputRisk = timeline.riskEvents[riskIndex];
    if (preInputRisk && preInputRisk.time <= start) {
      const effect = resolveRisk(preInputRisk);
      riskIndex += 1;
      if (effect) {
        const end = Math.min(duration, effect.end);
        recordStatusLoss(preInputRisk.time, end);
        recordLoss("status", preInputRisk.time, end);
        controlUntil = Math.max(controlUntil, end);
        scheduleRecoveryDecision(preInputRisk.time, end);
        now = preInputRisk.time;
      }
      continue;
    }
    if (finisherReadyDelayPending && finisherReady && currentCard && !skill.isDragonFinisher) {
      // 준비 확인 지연은 실제 일반 스킬 시전이 시작될 때만 소모한다.
      // 입력 중 피격·상태이상으로 시전하지 못하면 다음 판단에서 같은
      // 카드와 지연 상태를 유지한다.
      finisherReadyDelayPending = false;
      setFinisherReservationState("ready-delay-used");
      finisherDecisionDiagnostics.earlyRegularCardIds.push(currentCard.cardId);
    }
    const cardRequestsYeonga = Boolean(currentCard?.yeongaSimGong);
    if (stanceMode && (
      (skill.skillName === "맹룡열파" && !isInitialFlurry && yeongaAvailable) ||
      (stance === ("집중" as SimulationStance) &&
        ((skill.isDragonFinisher && (finisherReserved || cardRequestsYeonga || (mainMechanicFinisherPriority && yeongaAvailable))) ||
          (skill.skillName === "적룡포" && !finisherReserved && yeongaAvailable))) ||
      (skill.isDragonFinisher && cardRequestsYeonga)
    )) {
      yeongaArmed = true;
      yeongaAvailable = false;
    }
    // 청룡진 버프는 카드의 정적 플래그가 아니라 실제 시전 시작부터 6초다.
    // 시전이 취소되어도 시전 시작은 발생했으므로 버프 시간은 시작한다.
    if (skill.skillName === "청룡진") azureExpiresAt = start + 6;
    const impact = start + Math.max(0.1, skill.motionSeconds ?? skill.duration);
    let interruption: { end: number; reason: string } | null = null;
    while (riskIndex < timeline.riskEvents.length && timeline.riskEvents[riskIndex].time < impact) {
      const event = timeline.riskEvents[riskIndex];
      riskIndex += 1;
      const effect = resolveRisk(event, skill);
      if (effect) {
        interruption = effect;
        const end = Math.min(duration, effect.end);
        recordStatusLoss(event.time, end);
        recordLoss("status", event.time, end);
        controlUntil = Math.max(controlUntil, end);
        scheduleRecoveryDecision(event.time, end);
        break;
      }
    }
    if (interruption) {
      const row = rows.get(skill.skillName)!;
        row.uses += 1;
      row.misses += 1;
      attemptedUses += 1;
      recordLoss("input", now, start);
      recordLoss("orderMotion", start, Math.min(interruption.end, duration));
      addIdle(skill, start);
      readyAt.set(skill.skillName, start + skill.cooldown);
      if (yeongaArmed) yeongaArmed = false;
      if (skill.isDragonFinisher) {
        finisherReserved = false;
        setFinisherReservationState("completed");
      }
        registerCast(skill);
      if (input.recordActions) actions.push({ castId: `${skill.skillName}:${attemptedUses}`, skillName: skill.skillName, cardId: currentCard?.cardId, section: currentCard?.section, visitId, start, motionEnd: interruption.end, hit: false, backAttack: false, cancelled: true, cancelReason: interruption.reason });
      now = Math.min(duration, interruption.end);
      if (sectionedExecution && !usingReservedFinisher) advanceSectionCard();
      else if (!skill.isDragonFinisher) cursor = nextCycleCursor(cursor);
      firstInWindow = false;
      continue;
    }
    const impactWindow = impact <= duration ? bossWindowAt(timeline, impact, impact === duration) : null;
    const finisherRelaxedAtImpact = Boolean(
      skill.isDragonFinisher && impactWindow && isFinisherBasicPatternRelaxed(impactWindow, impact),
    );
    const allowed = finisherRelaxedAtImpact || !impactWindow?.allowedSkills || impactWindow.allowedSkills.includes(skill.skillName);
    const hit = Boolean((impactWindow?.attackable || finisherRelaxedAtImpact) && allowed && impact <= duration);
    const hitOrdinal = hit ? (hitOrdinals.get(skill.skillName) ?? 0) : -1;
    if (hit) hitOrdinals.set(skill.skillName, hitOrdinal + 1);
    const quotaAssignment = input.backAttackAssignments?.[skill.skillName];
    const quotaBackAttack = hit && quotaAssignment ? quotaAssignment.has(hitOrdinal) : false;
    const backAttack = Boolean(
      hit &&
        skill.isBackAttackSkill &&
        (quotaAssignment
          ? quotaBackAttack
          : (impactWindow!.backAllowed || finisherRelaxedAtImpact) &&
            (impactWindow!.forceBackAttack || (playerAtBack && impactWindow!.directionVersion === knownDirection))),
    );
    const azureActive = impact >= 0 && impact <= azureExpiresAt;
    const criticalRate = backAttack
      ? (azureActive ? skill.azureBackAttackCriticalRate : undefined) ?? skill.backAttackCriticalRate ?? skill.criticalRate ?? 0
      : (azureActive ? skill.azureCriticalRate : undefined) ?? skill.criticalRate ?? 0;
    const critical = Boolean(hit && playerRandom() < criticalRate);
    const withYeonga = yeongaArmed;
    const normal = withYeonga
      ? (backAttack
        ? (azureActive ? skill.azureYeongaBackAttackDamage ?? skill.azureYeongaDamage : undefined) ?? skill.yeongaBackAttackDamage ?? skill.yeongaDamage ?? skill.backAttackDamage ?? skill.damage
        : (azureActive ? skill.azureYeongaDamage : undefined) ?? skill.yeongaDamage ?? skill.damage)
      : (backAttack
        ? (azureActive ? skill.azureBackAttackDamage : undefined) ?? skill.backAttackDamage ?? skill.damage
        : (azureActive ? skill.azureDamage : undefined) ?? skill.damage);
    const crit = withYeonga
      ? (backAttack
        ? (azureActive ? skill.azureYeongaBackAttackCriticalDamage ?? skill.azureYeongaCriticalDamage : undefined) ?? skill.yeongaBackAttackCriticalDamage ?? skill.yeongaCriticalDamage ?? skill.backAttackCriticalDamage ?? skill.criticalDamage ?? normal
        : (azureActive ? skill.azureYeongaCriticalDamage : undefined) ?? skill.yeongaCriticalDamage ?? skill.criticalDamage ?? normal)
      : (backAttack
        ? (azureActive ? skill.azureBackAttackCriticalDamage : undefined) ?? skill.backAttackCriticalDamage ?? skill.criticalDamage ?? normal
        : (azureActive ? skill.azureCriticalDamage : undefined) ?? skill.criticalDamage ?? normal);
    const effectiveCriticalRate = backAttack
      ? (azureActive ? skill.azureBackAttackCriticalRate : undefined) ?? skill.backAttackCriticalRate ?? skill.criticalRate ?? 0
      : (azureActive ? skill.azureCriticalRate : undefined) ?? skill.criticalRate ?? 0;
    const damage = hit ? (critical ? crit : normal) * (impactWindow?.damageMultiplier ?? 1) : 0;
    const row = rows.get(skill.skillName)!;
    row.uses += 1; row.hits += Number(hit); row.misses += Number(!hit); row.azureHits += Number(hit && azureActive); row.criticals += Number(critical); row.nonCriticals += Number(hit && !critical); row.backAttacks += Number(backAttack); row.totalDamage += damage;
    attemptedUses += 1; successfulUses += Number(hit); criticals += Number(critical);
    recordLoss("input", now, start);
    recordLoss("orderMotion", start, Math.min(impact, duration));
    addIdle(skill, start);
        readyAt.set(skill.skillName, start + skill.cooldown);
        registerCast(skill);
        if (yeongaArmed) yeongaArmed = false;
        if (skill.isDragonFinisher) {
          finisherReserved = false;
          setFinisherReservationState("completed");
        }
    if (input.recordActions) actions.push({
      castId: `${skill.skillName}:${attemptedUses}`,
      skillName: skill.skillName,
      cardId: currentCard?.cardId,
      section: currentCard?.section,
      visitId,
      start,
      motionEnd: impact,
      hit,
      hitOrdinal: hit ? hitOrdinal : undefined,
      backAttack,
      critical,
      damage,
      damageMultiplier: impactWindow?.damageMultiplier ?? 1,
      azureActive,
      yeongaApplied: withYeonga,
      // 보스 상태 때문에 피해가 발생하지 않은 것은 정상 시전 후 미적중이다.
      // 타격 전 상태이상으로 중단된 시전만 cancelled로 기록한다.
      cancelled: false,
      missReason: hit ? undefined : (allowed ? "boss-window" : "skill-restriction"),
    });
    const phase = mechanicPhases.find((item) => impact >= item.start && impact < item.end);
    if (phase) { phase.attacks += Number(hit); phase.damage += damage; }
    castUntil = impact;
    now = impact;
    if (sectionedExecution && !usingReservedFinisher) advanceSectionCard();
    else if (!skill.isDragonFinisher) cursor = nextCycleCursor(cursor);
    firstInWindow = false;
  }
  if (finisherReservationStateStartedAt < duration) {
    finisherReservationIntervals.push({ start: finisherReservationStateStartedAt, end: duration, state: finisherReservationState });
  }
  for (const [skillName, ready] of readyAt) {
    if (ready < duration) {
      recordSkillReadyIdle(skillName, ready, duration);
      if (input.skills.find((skill) => skill.skillName === skillName)?.isDragonFinisher) recordFinisherReadyIdle(ready, duration);
    }
  }
  const skillStatistics = [...rows.values()].map((row) => ({
    ...row,
    usesPerMinute: row.uses * 60 / duration,
    cooldownRatio: Math.max(0, 1 - ((readyIdle.get(row.skillName) ?? 0) + (
      readyAt.has(row.skillName)
        ? Math.max(0, duration - (readyAt.get(row.skillName) ?? duration))
        : duration
    )) / duration),
    readyIdleSeconds: (readyIdle.get(row.skillName) ?? 0) + (
      readyAt.has(row.skillName)
        ? Math.max(0, duration - (readyAt.get(row.skillName) ?? duration))
        : duration
    ),
    readyIdleBreakdown: readyIdleBreakdowns.get(row.skillName) ?? emptySkillReadyIdleBreakdown(),
  }));
  const totalDamage = skillStatistics.reduce((sum, row) => sum + row.totalDamage, 0);
  const mergedStatusIntervals = statusIntervals
    .slice()
    .sort((left, right) => left.start - right.start)
    .reduce<{ start: number; end: number }[]>((merged, interval) => {
      const previous = merged[merged.length - 1];
      if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end);
      else merged.push({ ...interval });
      return merged;
    }, []);
  statusLossSeconds = mergedStatusIntervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  const lossBreakdown = resolveLossBreakdown(lossIntervals, duration);
  lostSeconds = Object.values(lossBreakdown).reduce((sum, seconds) => sum + seconds, 0);
  return { actions, movementEvents, mechanicPhases, totalDamage, dps: totalDamage / duration, attemptedUses, successfulUses, criticals, patternCount: timeline.patterns.length, skillStatistics, lostSeconds, statusLossSeconds, threeJobDelaySeconds, threeJobDelayedUses, lossBreakdown, finisherReadyIdleBreakdown, finisherDecisionDiagnostics, finisherDecisionSnapshots, cooldownWaitSeconds, durationSeconds: duration, seed };
}

/**
 * Applies the confirmed integer back-attack quota after the action timeline
 * has been established. The first pass is intentionally physical-only so the
 * quota cannot change cooldowns, casts, or boss events.
 */
export function runCombatSimulation(input: SimulationInput): SimulationResult {
  if (input.backAttackModel !== "quota") return runCombatSimulationInternal(input);
  // The discovery pass uses the same quota behavior policy but no assignment.
  // This keeps hit/cast timing identical to the resolving pass.
  // This pass is the authoritative action trace. Quota assignment must never
  // cause a second movement/cooldown decision path.
  const physical = runCombatSimulationInternal({ ...input, backAttackModel: "quota", backAttackAssignments: undefined, recordActions: true });
  const assignments: Record<string, Set<number>> = {};
  const quotas: NonNullable<SimulationResult["backAttackQuotas"]> = {};
  const skillsByName = new Map(input.skills.map((skill) => [skill.skillName, skill]));
  const hitCounts = new Map<string, number>();
  for (const row of physical.skillStatistics) if (row.hits > 0) hitCounts.set(row.skillName, Math.round(row.hits));
  for (const [skillName, hitCount] of hitCounts) {
    const skill = skillsByName.get(skillName);
    if (!skill?.isBackAttackSkill) continue;
    const category: BackAttackCategory = skill.isDragonFinisher
      ? "finisher"
      : skill.skillName === "적룡포" ? "red-dragon-cannon"
        : skill.skillName === "반월섬" ? "half-moon"
          : skill.skillName === "사두룡격" ? "sadu" : "regular";
    const quota = resolveBackAttackQuota(input.playerLevel, category, hitCount, () => deterministicRoll(input.seed ?? 1, `back-quota-count:${skillName}`));
    const selected = allocateBackAttackQuotaToHits(
      hitCount,
      quota,
      createDeterministicStream(input.seed ?? 1, `back-quota-allocation:${skillName}`),
    );
    assignments[skillName] = selected;
    quotas[skillName] = quota;
  }
  const resolved = resolveQuotaDamageFromActions(input, physical, assignments);
  return { ...resolved, backAttackQuotas: quotas };
}

function createRandomSeed() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Runs independent combat situations and returns their arithmetic mean. */
export function runCombatSimulations(input: SimulationInput, runs: number): SimulationBatchResult {
  const count = Math.max(1, Math.floor(runs));
  const results = Array.from({ length: count }, (_, index) => {
    // A supplied seed makes the whole batch reproducible while still giving
    // every repetition an independent situation. Do not mix Math.random into
    // a seeded batch: that made identical inputs produce different batches.
    const runSeed = input.seed === undefined
      ? createRandomSeed()
      : deterministicRoll(input.seed >>> 0, `batch-run:${index}`) * 0x100000000 >>> 0;
    return runCombatSimulation({
      ...input,
      // A normal batch intentionally produces independent combat situations.
      // Comparison callers retain this value and pass it to every level.
      bossSeed: input.bossSeed ?? runSeed,
      seed: runSeed,
      recordActions: input.recordActions === true,
    });
  });
  const first = results[0];
  const skillNames = [...new Set(results.flatMap((result) => result.skillStatistics.map((row) => row.skillName)))];
  const average = (selector: (result: SimulationResult) => number) =>
    results.reduce((sum, result) => sum + selector(result), 0) / count;
  const skillStatistics = skillNames.map((skillName) => {
    return {
      skillName,
      uses: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.uses ?? 0),
      hits: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.hits ?? 0),
      misses: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.misses ?? 0),
      criticals: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.criticals ?? 0),
      nonCriticals: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.nonCriticals ?? 0),
      backAttacks: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.backAttacks ?? 0),
      azureHits: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.azureHits ?? 0),
      totalDamage: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.totalDamage ?? 0),
      usesPerMinute: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.usesPerMinute ?? 0),
      cooldownRatio: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.cooldownRatio ?? 0),
      readyIdleSeconds: average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.readyIdleSeconds ?? 0),
      readyIdleBreakdown: Object.fromEntries(
        (["bossUnavailable", "stanceOrOrderWait", "reserveDeferred", "patternResponse", "backForbidden", "reposition", "status", "otherMotion", "input"] as const).map((reason) => [
          reason,
          average((result) => result.skillStatistics.find((row) => row.skillName === skillName)?.readyIdleBreakdown[reason] ?? 0),
        ]),
      ) as SkillReadyIdleBreakdown,
    };
  });
  const backAttackQuotas = input.backAttackModel === "quota"
    ? Object.fromEntries(skillNames
      .filter((skillName) => results.some((result) => result.backAttackQuotas?.[skillName]))
      .map((skillName) => {
        const entries = results.map((result) => result.backAttackQuotas?.[skillName]).filter((entry): entry is NonNullable<SimulationResult["backAttackQuotas"]>[string] => Boolean(entry));
        const hitCount = entries.reduce((sum, entry) => sum + entry.hitCount, 0);
        const successCount = entries.reduce((sum, entry) => sum + entry.successCount, 0);
        const fallback = entries.some((entry) => entry.fallback);
        return [skillName, { ...entries[0], hitCount: hitCount / count, successCount: successCount / count, rate: hitCount > 0 ? successCount / hitCount : null, fallback }];
      }))
    : undefined;
  const lossBreakdown = Object.fromEntries(LOSS_REASONS.map((reason) => [reason, average((result) => result.lossBreakdown[reason])])) as SimulationLossBreakdown;
  return {
    ...first,
    // 배치 평균은 기존과 동일하게 계산하되, 진단 모드에서는 첫 회차의
    // 카드·구간·방문 로그를 보존해 평균값의 원인을 추적할 수 있게 한다.
    actions: input.recordActions === true ? first.actions : [],
    totalDamage: average((result) => result.totalDamage),
    dps: average((result) => result.dps),
    attemptedUses: average((result) => result.attemptedUses),
    successfulUses: average((result) => result.successfulUses),
    criticals: average((result) => result.criticals),
    patternCount: average((result) => result.patternCount),
    skillStatistics,
    backAttackQuotas,
    lostSeconds: average((result) => result.lostSeconds),
    statusLossSeconds: average((result) => result.statusLossSeconds),
    threeJobDelaySeconds: average((result) => result.threeJobDelaySeconds),
    threeJobDelayedUses: average((result) => result.threeJobDelayedUses),
    lossBreakdown,
    finisherReadyIdleBreakdown: (() => {
      const breakdown = emptyFinisherReadyIdleBreakdown();
      for (const key of ["bossUnavailable", "stanceOrOrderWait", "reserveDeferred", "patternResponse", "backForbidden", "reposition", "status", "otherMotion", "input"] as const) {
        breakdown[key] = average((result) => result.finisherReadyIdleBreakdown[key]);
      }
      const sources = new Set(results.flatMap((result) => Object.keys(result.finisherReadyIdleBreakdown.bossUnavailableBySource)));
      for (const source of sources) {
        breakdown.bossUnavailableBySource[source] = results.reduce(
          (sum, result) => sum + (result.finisherReadyIdleBreakdown.bossUnavailableBySource[source] ?? 0),
          0,
        ) / count;
      }
      return breakdown;
    })(),
    finisherDecisionDiagnostics: {
      reservationEligibleVisits: average((result) => result.finisherDecisionDiagnostics.reservationEligibleVisits),
      reservationMisses: average((result) => result.finisherDecisionDiagnostics.reservationMisses),
      thresholdDeferredVisits: average((result) => result.finisherDecisionDiagnostics.thresholdDeferredVisits),
      readyDelayJudgments: average((result) => result.finisherDecisionDiagnostics.readyDelayJudgments),
      readyDelayOccurrences: average((result) => result.finisherDecisionDiagnostics.readyDelayOccurrences),
      earlyRegularCardIds: first.finisherDecisionDiagnostics.earlyRegularCardIds,
      immediateAfterNoRegular: average((result) => result.finisherDecisionDiagnostics.immediateAfterNoRegular),
    },
    cooldownWaitSeconds: average((result) => result.cooldownWaitSeconds),
    durationSeconds: input.durationSeconds,
    runs: count,
    seed: undefined,
  };
}

