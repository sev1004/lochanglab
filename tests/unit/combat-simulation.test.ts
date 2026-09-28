import assert from "node:assert/strict";
import test from "node:test";
import { calculateReadyIdleFromActions, decideFinisherAction, isFinisherBasicPatternRelaxed, resolveSimulationInputDelay, runCombatSimulation, runCombatSimulations, shouldSkipFocusCard } from "../../src/domain/simulation/combat-simulation.ts";
import { createBossTimeline, type BossTimeline } from "../../src/domain/simulation/boss-timeline.ts";
import { resolveBehaviorProfile } from "../../src/domain/simulation/behavior-profile.ts";
import { sampleDecision } from "../../src/domain/simulation/regular-skill-decision.ts";
import { allocateBackAttackQuotaToHits, chooseBackAttackIndices, chooseBackAttackSuccessCount, resolveBackAttackQuota } from "../../src/domain/simulation/back-attack-quota.ts";

test("행동 프로필은 피해 배율이 아니라 선제 이동과 재개 판단값만 제공한다", () => {
  const top = resolveBehaviorProfile(90);
  const lower = resolveBehaviorProfile(80);
  assert.ok(top.finisherPrepositionLeadSeconds > lower.finisherPrepositionLeadSeconds);
  assert.ok(top.attackResumeDecisionDelaySeconds < lower.attackResumeDecisionDelaySeconds);
  assert.equal(resolveBehaviorProfile(100).cycleResumeProbability, 0);
  assert.equal(resolveBehaviorProfile(90).cycleResumeProbability, 0.1);
  assert.equal(resolveBehaviorProfile(90).shortWindowProbability, 0.1);
});

test("행동 판단은 사건별 확률과 지연을 한 번 계산하고 범위 밖 값을 만들지 않는다", () => {
  const profile = resolveBehaviorProfile(80);
  const delayed = sampleDecision(profile, "cycle-start", 0.1, 0.5);
  assert.equal(delayed.occurs, true);
  assert.ok(delayed.delaySeconds >= 0.55 && delayed.delaySeconds <= 1.1);
  const notDelayed = sampleDecision(profile, "cycle-start", 0.43, 0);
  assert.equal(notDelayed.occurs, false);
  assert.equal(notDelayed.delaySeconds, 0);
});

test("필살 우선 판단은 상태를 변경하지 않고 우선순위를 일관되게 반환한다", () => {
  const base = {
    phase: "repeat" as const, stance: "집중" as const, finisherReserved: true,
    finisherReady: true, encounterFinisher: false, regularCardAvailable: true,
    regularCardReady: true, backAllowed: true, playerAtBack: true, movementAllowed: true,
  };
  assert.equal(decideFinisherAction(base).kind, "cast-finisher");
  assert.equal(decideFinisherAction({ ...base, playerAtBack: false }).kind, "prepare-movement");
  assert.equal(decideFinisherAction({ ...base, finisherReady: false }).kind, "use-regular");
  assert.equal(decideFinisherAction({ ...base, finisherReady: false, regularCardReady: false }).kind, "wait");
  assert.equal(decideFinisherAction({ ...base, phase: "encounter", stance: "난무", finisherReserved: false, encounterFinisher: true }).kind, "cast-finisher");
});

test("실력별 정수 백어택 후보를 적중 횟수 기준으로 선택한다", () => {
  assert.deepEqual(
    [0, 0.99].map((random) => chooseBackAttackSuccessCount(20, { min: 95, max: 100 }, () => random).successCount),
    [19, 20],
  );
  assert.equal(chooseBackAttackSuccessCount(17, { min: 95, max: 100 }, () => 0).successCount, 17);
  assert.equal(chooseBackAttackSuccessCount(3, { min: 87, max: 95 }, () => 0).successCount, 3);
  assert.equal(resolveBackAttackQuota(90, "finisher", 0, () => 0).rate, null);
  assert.deepEqual(resolveBackAttackQuota(85, "red-dragon-cannon", 100, () => 0).range, { min: 82, max: 90 });
  assert.deepEqual(resolveBackAttackQuota(85, "half-moon", 100, () => 0).range, { min: 75, max: 87 });
  assert.deepEqual(resolveBackAttackQuota(85, "sadu", 100, () => 0).range, { min: 74, max: 88 });
});

test("백어택 성공 횟수는 개별 적중 이벤트에 중복 없이 무작위 배정한다", () => {
  const selected = chooseBackAttackIndices(20, 19, () => 0.25);
  assert.equal(selected.size, 19);
  assert.equal([...selected].every((index) => index >= 0 && index < 20), true);
});

test("적룡필살 완화 판정은 기본 패턴의 딜 불가 구간에만 0.5초 후 적용한다", () => {
  const basicOff = { source: "패턴 9", patternId: 3, start: 10, attackable: false };
  const mechanicOff = { source: "360줄", start: 10, attackable: false };
  assert.equal(isFinisherBasicPatternRelaxed(basicOff, 10.49), false);
  assert.equal(isFinisherBasicPatternRelaxed(basicOff, 10.5), true);
  assert.equal(isFinisherBasicPatternRelaxed(mechanicOff, 10.5), false);
});

test("백어택 quota 사건 배정은 셔플 단계마다 난수를 소비한다", () => {
  const draws: number[] = [];
  const selected = allocateBackAttackQuotaToHits(8, { hitCount: 8, successCount: 4, rate: 0.5, fallback: false, range: { min: 50, max: 50 } }, () => {
    const value = draws.length / 20;
    draws.push(value);
    return value;
  });
  assert.equal(selected.size, 4);
  assert.ok(draws.length > 1);
});

test("quota 백어택은 행동 횟수를 바꾸지 않고 적중 타격의 피해 조건만 재배정한다", () => {
  const input = {
    seed: 44,
    durationSeconds: 20,
    playerLevel: 90 as const,
    recordActions: true,
    backAttackModel: "quota" as const,
    skills: [{ skillName: "테스트 백어택", damage: 10, backAttackDamage: 20, criticalDamage: 10, backAttackCriticalDamage: 20, criticalRate: 0, backAttackCriticalRate: 0, cooldown: 0, duration: 1, isBackAttackSkill: true }],
    bossTimeline: { windows: [{ start: 0, end: 20, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  };
  const result = runCombatSimulation(input);
  const row = result.skillStatistics[0];
  assert.ok(row.hits <= row.uses);
  assert.equal(result.backAttackQuotas?.["테스트 백어택"]?.range.min, 88);
  assert.ok(row.backAttacks <= row.hits);
  assert.equal(result.backAttackQuotas?.["테스트 백어택"]?.hitCount, row.hits);
});

test("quota 모델은 물리적 백 금지를 준비 후 미사용 원인으로 재분류하지 않는다", () => {
  const result = runCombatSimulation({
    seed: 51,
    durationSeconds: 20,
    playerLevel: 90,
    recordActions: true,
    backAttackModel: "quota",
    skills: [
      { skillName: "일반", damage: 10, cooldown: 3, duration: 1 },
      { skillName: "적룡필살", damage: 10, backAttackDamage: 20, criticalDamage: 10, backAttackCriticalDamage: 20, criticalRate: 0, backAttackCriticalRate: 0, cooldown: 5, duration: 1, isBackAttackSkill: true, isDragonFinisher: true },
    ],
    bossTimeline: { windows: [{ start: 0, end: 20, attackable: true, backAllowed: false, damageMultiplier: 1, directionVersion: 0, freeDamage: false, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  assert.equal(result.skillStatistics.find((row) => row.skillName === "적룡필살")?.uses, 4);
  assert.equal(result.movementEvents.length, 0);
  assert.equal(result.finisherReadyIdleBreakdown.backForbidden, 0);
  assert.ok(result.finisherReadyIdleBreakdown.stanceOrOrderWait >= 0);
});

test("동일 전투 조건에서 물리·quota 모델의 시전 횟수와 준비 대기는 비교 가능하다", () => {
  const base = {
    seed: 52,
    durationSeconds: 20,
    playerLevel: 90 as const,
    recordActions: true,
    skills: [{ skillName: "테스트 백어택", damage: 10, backAttackDamage: 20, criticalDamage: 10, backAttackCriticalDamage: 20, criticalRate: 0, backAttackCriticalRate: 0, cooldown: 5, duration: 1, isBackAttackSkill: true }],
    bossTimeline: { windows: [{ start: 0, end: 20, attackable: true, backAllowed: false, damageMultiplier: 1, directionVersion: 0, freeDamage: false, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  };
  const physical = runCombatSimulation({ ...base, backAttackModel: "physical" });
  const quota = runCombatSimulation({ ...base, backAttackModel: "quota" });
  assert.equal(quota.attemptedUses, physical.attemptedUses);
  assert.equal(quota.successfulUses, physical.successfulUses);
  assert.equal(quota.skillStatistics[0].readyIdleSeconds, physical.skillStatistics[0].readyIdleSeconds);
  assert.equal(quota.finisherReadyIdleBreakdown.bossUnavailable, physical.finisherReadyIdleBreakdown.bossUnavailable);
});

test("시드가 있는 반복 실행은 동일 입력에서 동일한 batch를 재현한다", () => {
  const input = {
    seed: 905,
    durationSeconds: 18,
    playerLevel: 100 as const,
    skills: [{ skillName: "재현", damage: 10, cooldown: 3, duration: 0.2 }],
  };
  const first = runCombatSimulations(input, 4);
  const second = runCombatSimulations(input, 4);
  assert.equal(first.totalDamage, second.totalDamage);
  assert.deepEqual(first.skillStatistics, second.skillStatistics);
});


test("실력 프로필은 낮은 수준이 재개·이동에서 더 유리해지지 않도록 단조성을 유지한다", () => {
  const levels = [100, 90, 85, 80, 70, 60] as const;
  const profiles = levels.map((level) => resolveBehaviorProfile(level));
  for (let index = 1; index < profiles.length; index += 1) {
    assert.ok(profiles[index].attackResumeDecisionDelaySeconds >= profiles[index - 1].attackResumeDecisionDelaySeconds);
    assert.ok(profiles[index].repositionDurationMultiplier >= profiles[index - 1].repositionDurationMultiplier);
    assert.ok(profiles[index].cueRecognitionProbability <= profiles[index - 1].cueRecognitionProbability);
  }
});

test("적룡필살 판단 실수 확률은 합의한 수준별 공식과 일치한다", () => {
  const expected = new Map([[100, [0, 0]], [90, [0, 0]], [85, [9, 4.5]], [80, [18, 9]], [70, [36, 18]], [60, [40, 27]]]);
  for (const [level, [reservationMiss, readyDelay]] of expected) {
    const profile = resolveBehaviorProfile(level as 100 | 90 | 85 | 80 | 70 | 60);
    assert.equal(profile.finisherReservationMissProbability * 100, reservationMiss);
    assert.equal(profile.finisherReadyDelayProbability * 100, readyDelay);
  }
});

test("백어택 불가와 이동 불가를 분리하고 모든 기믹에서 이동은 가능하다", () => {
  const timeline = createBossTimeline(400, 11);
  const unavailable = timeline.windows.filter((window) => !window.attackable);
  assert.ok(unavailable.length > 0);
  assert.ok(unavailable.every((window) => window.movementAllowed !== false));
  const noBack = timeline.windows.find((window) => window.source === "패턴 7" && !window.backAllowed);
  if (noBack) assert.equal(noBack.movementAllowed, true);
});

test("360줄 시작 30초는 공격 가능하고 방향성 스킬을 백어택으로 처리한다", () => {
  const timeline = createBossTimeline(200, 11);
  const first360 = timeline.windows.find((window) => window.source === "360줄");
  assert.ok(first360);
  assert.equal(first360.end - first360.start, 30);
  assert.equal(first360.attackable, true);
  assert.equal(first360.damageMultiplier, 1);
  assert.equal(first360.forceBackAttack, true);
  const following360 = timeline.windows.find((window) => window.source === "360줄" && window !== first360);
  assert.ok(following360);
  assert.equal(following360.attackable, false);
  assert.equal(following360.damageMultiplier, 0);
});

test("320줄 첫 30초는 스킬을 사용하지만 피해와 백어택 피해는 0이다", () => {
  const timeline = createBossTimeline(260, 11);
  const first320 = timeline.windows.find((window) => window.source === "320줄");
  assert.ok(first320);
  assert.equal(first320.end - first320.start, 30);
  assert.equal(first320.attackable, true);
  assert.equal(first320.damageMultiplier, 0);
  assert.equal(first320.forceBackAttack, true);
});

test("위험 구간의 경직 기회 수는 길이 기준으로 올림 계산한다", () => {
  const timeline = createBossTimeline(660, 19);
  const dangerRanges = timeline.windows.filter((window) => !window.freeDamage && window.source.startsWith("패턴"));
  assert.ok(dangerRanges.length > 0);
  for (const range of dangerRanges) {
    const events = timeline.riskEvents.filter((event) =>
      event.type === "stagger" && event.time >= range.start && event.time < range.end,
    );
    assert.equal(events.length, Math.ceil((range.end - range.start) / 4));
  }
});

const simulate = (seed = 1, durationSeconds = 720, motion = 0.2) => runCombatSimulation({
  seed, durationSeconds, playerLevel: 100, finisherPolicy: "ready",
  skills: [{ skillName: "test", damage: 100, cooldown: 0, duration: motion }],
});

const sectioned = (names: string[], prefix: string) => names.map((skillName, index) => ({
  cardId: `${prefix}-${index}`,
  skillName,
  section: index < 3 ? "repeat-flurry" as const : "repeat-focus" as const,
  azureDragon: false,
  yeongaSimGong: false,
}));

test("input delay follows the agreed level curves and clamps below 60%", () => {
  // 2026-09-28: 100% 연계 입력만 사용자 확정 예외 0.05초 적용.
  assert.equal(resolveSimulationInputDelay(100, false), 0.05);
  assert.equal(resolveSimulationInputDelay(60, false), 0.25);
  assert.ok(Math.abs(resolveSimulationInputDelay(70, false) - 0.2375) < 1e-9);
  assert.equal(resolveSimulationInputDelay(100, true), 0.3);
  assert.equal(resolveSimulationInputDelay(90, true), 0.35);
  assert.equal(resolveSimulationInputDelay(60, true), 0.5);
});

test("굉열파 방문 생략은 최종 쿨의 50% 경계를 포함한다", () => {
  assert.equal(shouldSkipFocusCard("굉열파", 3, 5.01, 10), true);
  assert.equal(shouldSkipFocusCard("굉열파", 3, 5, 10), true);
  assert.equal(shouldSkipFocusCard("굉열파", 3, 4.99, 10), false);
  assert.equal(shouldSkipFocusCard("굉열파", 2, 9, 10), false);
  assert.equal(shouldSkipFocusCard("사두룡격", 3, 0.01, 5), true);
  assert.equal(shouldSkipFocusCard("사두룡격", 3, 0, 5), false);
});

test("original cycle cards are validated and a cycle without 맹룡열파 is blocked", () => {
  const skill = (skillName: string) => ({ skillName, damage: 100, cooldown: 0, duration: 0.5 });
  const base = {
    seed: 1, durationSeconds: 10, playerLevel: 100 as const, finisherPolicy: "ready" as const,
    skills: [skill("청룡진"), skill("맹룡열파")],
  };
  assert.throws(() => runCombatSimulation({
    ...base,
    cycle: [
      { cardId: "a", skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
      { cardId: "b", skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
    ],
  }), /원본 사이클과 스킬 정의 순서/);
  assert.throws(() => runCombatSimulation({
    ...base,
    skills: [skill("청룡진")],
    cycle: [{ cardId: "a", skillName: "청룡진", azureDragon: false, yeongaSimGong: false }],
  }), /맹룡열파가 포함된 절정 사이클/);
  assert.throws(() => runCombatSimulation({
    ...base,
    cycle: [
      { cardId: "a", skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
      { cardId: "a", skillName: "맹룡열파", azureDragon: false, yeongaSimGong: false },
    ],
  }), /카드 ID가 중복/);
  assert.throws(() => runCombatSimulation({
    ...base,
    simulationBuild: "jeoljeong-non222",
  }), /원본 사이클 카드가 필요/);
});

test("ordered cycle execution keeps stance cards grouped and switches only after visit minimums", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격"];
  const skills = names.map((skillName) => ({ skillName, damage: 100, cooldown: 0, duration: 0.1 }));
  const result = runCombatSimulation({
    seed: 4, durationSeconds: 12, playerLevel: 100, finisherPolicy: "ready", recordActions: true,
    skills,
    cycle: names.map((skillName, index) => ({ cardId: `card-${index}`, skillName, azureDragon: skillName === "청룡진", yeongaSimGong: false })),
  });
  const castNames = result.actions.map((action) => action.skillName);
  const firstFocus = castNames.findIndex((name) => ["유성강천", "적룡포", "굉열파", "사두룡격"].includes(name));
  assert.ok(firstFocus >= 2);
  assert.deepEqual(new Set(castNames.slice(0, firstFocus).filter((name) => ["청룡진", "맹룡열파", "반월섬"].includes(name)).slice(0, 2)).size >= 2, true);
  for (const action of result.actions) assert.ok(action.start < action.motionEnd);
});

test("cycle card data is preserved for repeated skills and finisher stays in focus stance", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격", "적룡필살"];
  const skills = names.map((skillName, index) => ({
    cardId: `card-${index}`, skillName, damage: index === 0 ? 10 : 100,
    yeongaDamage: skillName === "적룡필살" ? 777 : undefined,
    cooldown: 0, duration: 0.1,
    // 카드/연가 보존 검사는 기존 고정 시간 입력으로 유지한다.
    // 100% 기본 지연 0.05초는 입력 지연 공식 테스트에서 별도 검증한다.
    inputDelaySeconds: 0.2,
    isDragonFinisher: skillName === "적룡필살",
  }));
  const result = runCombatSimulation({
    seed: 4, durationSeconds: 2, playerLevel: 100, finisherPolicy: "ready", recordActions: true,
    skills,
    cycle: sectioned(names, "card"),
  });
  assert.notEqual(result.actions[0]?.skillName, "적룡필살");
  assert.ok(result.skillStatistics.find((row) => row.skillName === "청룡진")?.totalDamage !== 0);
  const finisherRow = result.skillStatistics.find((row) => row.skillName === "적룡필살");
  assert.equal(finisherRow?.uses, 1);
  assert.ok((finisherRow?.totalDamage ?? 0) >= 777);
  assert.throws(() => runCombatSimulation({
    durationSeconds: 10, playerLevel: 100, finisherReserveThresholdSeconds: 10.1,
    skills, cycle: names.map((skillName, index) => ({ cardId: `card-${index}`, skillName, azureDragon: false, yeongaSimGong: false })),
  }), /1~10초/);
});

test("청룡진은 카드 플래그가 아니라 실제 시전 시작 후 6초 버프로 적용된다", () => {
  const cycle = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격"];
  const baseSkills = cycle.map((skillName, index) => ({
    cardId: `azure-${index}`,
    skillName,
    damage: 10,
    criticalDamage: 10,
    azureDamage: skillName === "맹룡열파" ? 100 : 10,
    azureCriticalDamage: skillName === "맹룡열파" ? 100 : 10,
    cooldown: 99,
    duration: 0.1,
    motionSeconds: 0.1,
  }));
  const run = (azureFlag: boolean) => runCombatSimulation({
    seed: 4,
    durationSeconds: 2,
    playerLevel: 100,
    recordActions: true,
    skills: baseSkills,
    cycle: cycle.map((skillName, index) => ({
      cardId: `azure-${index}`, skillName, azureDragon: azureFlag, yeongaSimGong: false,
    })),
  });
  const flagged = run(true);
  const unflagged = run(false);
  assert.equal(flagged.totalDamage, unflagged.totalDamage);
  const target = flagged.skillStatistics.find((row) => row.skillName === "맹룡열파");
  assert.ok((target?.totalDamage ?? 0) >= 100);
});

test("필살 사용 후 원래 집중 카드 커서로 복귀하며 일반 카드를 중복 사용하지 않는다", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격", "적룡필살"];
  const skills = names.map((skillName, index) => ({
    cardId: `resume-${index}`, skillName, damage: 100, cooldown: 0, duration: 0.1,
    motionSeconds: 0.1, isDragonFinisher: skillName === "적룡필살",
  }));
  const result = runCombatSimulation({
    seed: 22, durationSeconds: 20, playerLevel: 100, recordActions: true,
    finisherReserveThresholdSeconds: 7.5, skills,
    cycle: names.map((skillName, index) => ({ cardId: `resume-${index}`, skillName, azureDragon: false, yeongaSimGong: false })),
  });
  const firstFinisher = result.actions.findIndex((action) => action.skillName === "적룡필살");
  assert.ok(firstFinisher >= 0);
  assert.notEqual(result.actions[firstFinisher + 1]?.skillName, "청룡진");
  assert.ok(["적룡포", "굉열파", "사두룡격", "유성강천"].includes(result.actions[firstFinisher + 1]?.skillName ?? ""));
});

test("back repositioning consumes time and cooldown ratios stay within bounds", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격", "적룡필살"];
  const result = runCombatSimulation({
    seed: 19, durationSeconds: 120, playerLevel: 100, finisherReserveThresholdSeconds: 7.5, recordActions: true,
    simulationBuild: "jeoljeong-non222",
    skills: names.map((skillName, index) => ({
      cardId: `card-${index}`, skillName, damage: 100, cooldown: skillName === "적룡필살" ? 12 : 2,
      duration: 0.2, isDragonFinisher: skillName === "적룡필살", isBackAttackSkill: skillName === "적룡필살",
    })),
    cycle: sectioned(names, "card"),
  });
  assert.ok(result.lossBreakdown.movement >= 0);
  assert.ok(result.movementEvents.every((event) => event.duration >= 0 && event.duration <= 2.99));
  assert.ok(result.skillStatistics.every((row) => row.cooldownRatio >= 0 && row.cooldownRatio <= 1));
  for (let index = 1; index < result.actions.length; index += 1) {
    assert.ok(result.actions[index].start >= result.actions[index - 1].motionEnd);
  }
});

test("이동 진단은 실제 소요 시간과 도달 위치를 기록하고 방향 변경 후 백을 강제하지 않는다", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격", "적룡필살"];
  const input = {
    durationSeconds: 180, playerLevel: 100 as const, finisherReserveThresholdSeconds: 7.5,
    simulationBuild: "jeoljeong-non222" as const,
    skills: names.map((skillName, index) => ({
      cardId: `move-${index}`, skillName, damage: 100, cooldown: skillName === "적룡필살" ? 4 : 2,
      duration: 0.1, motionSeconds: 0.1, isBackAttackSkill: skillName === "적룡필살",
      isDragonFinisher: skillName === "적룡필살",
    })),
    cycle: sectioned(names, "move"),
  };
  const results = Array.from({ length: 20 }, (_, index) => runCombatSimulation({ ...input, seed: index + 1, recordActions: true }));
  const events = results.flatMap((result) => result.movementEvents);
  assert.ok(events.length > 0);
  // 패턴·전투 종료 경계에서 잘린 이동은 원래 분포보다 짧게 기록될 수 있다.
  assert.ok(events.every((event) => event.duration <= 2.99));
  assert.ok(events.every((event) => event.completed === event.reachedBack));
  assert.ok(results.every((result) => result.actions.every((action) => action.start < action.motionEnd)));
});

test("고정 타임라인에서 경직 면역과 비면역의 타격 전 취소를 구분한다", () => {
  const timeline: BossTimeline = {
    windows: [{ start: 0, end: 4, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: false, source: "fixture" }],
    patterns: [], mechanics: [],
    riskEvents: [{ time: 0.8, type: "stagger", roll: 0, longKnockdownSeconds: 0, patternId: 1 }],
  };
  const run = (staggerImmune: boolean) => runCombatSimulation({
    seed: 1, durationSeconds: 4, playerLevel: 60, bossTimeline: timeline,
    skills: [{ skillName: "fixture", damage: 100, cooldown: 99, duration: 1, motionSeconds: 1, staggerImmune }],
  });
  const vulnerable = run(false);
  const immune = run(true);
  assert.equal(vulnerable.skillStatistics[0]?.misses, 1);
  assert.equal(vulnerable.skillStatistics[0]?.totalDamage, 0);
  assert.equal(immune.skillStatistics[0]?.hits, 1);
  assert.equal(immune.skillStatistics[0]?.totalDamage, 100);
});

test("정상 시전 후 미적중과 타격 전 취소를 별도로 기록한다", () => {
  const timeline: BossTimeline = {
    windows: [{ start: 0, end: 2, attackable: true, backAllowed: true, movementAllowed: true, damageMultiplier: 1, allowedSkills: ["다른 스킬"], directionVersion: 0, freeDamage: true, source: "fixture" }],
    patterns: [], mechanics: [], riskEvents: [],
  };
  const result = runCombatSimulation({
    durationSeconds: 2,
    playerLevel: 100,
    recordActions: true,
    bossTimeline: timeline,
    skills: [{ skillName: "시험 스킬", damage: 100, cooldown: 0, duration: 0.2 }],
  });
  assert.ok(result.actions.some((action) => action.hit === false && action.cancelled === false));
  assert.ok(result.actions.every((action) => action.cancelReason === undefined));
});

test("반복 실행은 원본 순서를 유지하면서 독립 전투의 평균을 집계한다", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격"];
  const skills = names.map((skillName, index) => ({
    cardId: `batch-${index}`, skillName, damage: 100, cooldown: 2, duration: 0.2, motionSeconds: 0.2,
  }));
  const result = runCombatSimulations({
    durationSeconds: 120, playerLevel: 100, simulationBuild: "jeoljeong-non222",
    skills, cycle: sectioned(names, "batch"),
  }, 100);
  assert.equal(result.runs, 100);
  assert.equal(result.seed, undefined);
  assert.ok(result.totalDamage > 0);
  assert.deepEqual(result.skillStatistics.map((row) => row.skillName), names);
  assert.ok(result.skillStatistics.every((row) => row.cooldownRatio >= 0 && row.cooldownRatio <= 1));
  for (const row of result.skillStatistics) {
    const allocated = Object.values(row.readyIdleBreakdown).reduce((sum, seconds) => sum + seconds, 0);
    assert.ok(Math.abs(allocated - row.readyIdleSeconds) < 0.00001, `${row.skillName} ready-idle breakdown mismatch`);
  }
});

test("필살 판단 진단은 방문별로 집계되고 상위 이론·최상위 수준에서 실수가 발생하지 않는다", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격", "적룡필살"];
  const input = {
    durationSeconds: 120,
    simulationBuild: "jeoljeong-non222" as const,
    finisherReserveThresholdSeconds: 7.5,
    skills: names.map((skillName, index) => ({
      cardId: `diagnostic-${index}`,
      skillName,
      damage: 100,
      cooldown: skillName === "적룡필살" ? 8 : 2,
      duration: 0.1,
      motionSeconds: 0.1,
      isDragonFinisher: skillName === "적룡필살",
    })),
    cycle: sectioned(names, "diagnostic"),
  };
  const theoretical = runCombatSimulations({ ...input, playerLevel: 100 }, 8);
  const top = runCombatSimulations({ ...input, playerLevel: 90 }, 8);
  assert.equal(theoretical.finisherDecisionDiagnostics.reservationMisses, 0);
  assert.equal(theoretical.finisherDecisionDiagnostics.readyDelayOccurrences, 0);
  assert.equal(top.finisherDecisionDiagnostics.reservationMisses, 0);
  assert.equal(top.finisherDecisionDiagnostics.readyDelayOccurrences, 0);
  assert.ok(top.finisherDecisionDiagnostics.reservationEligibleVisits >= 0);
  assert.ok(top.finisherDecisionDiagnostics.thresholdDeferredVisits >= 0);
});

test("배치 진단 모드는 첫 회차의 카드·구간·방문 로그를 보존한다", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격"];
  const result = runCombatSimulations({
    durationSeconds: 12, playerLevel: 100, recordActions: true,
    simulationBuild: "jeoljeong-non222",
    skills: names.map((skillName, index) => ({ cardId: `batch-log-${index}`, skillName, damage: 100, cooldown: 0, duration: 0.1, motionSeconds: 0.1 })),
    cycle: names.map((skillName, index) => ({
      cardId: `batch-log-${index}`, skillName,
      section: index < 3 ? "repeat-flurry" as const : "repeat-focus" as const,
      azureDragon: false, yeongaSimGong: false,
    })),
  }, 3);
  assert.ok(result.actions.length > 0);
  assert.ok(result.actions.every((action) => action.cardId?.startsWith("batch-log-")));
  assert.ok(result.actions.every((action) => action.section));
  assert.ok(result.actions.every((action) => typeof action.visitId === "number"));
});

test("360줄 종료 후 쿨과 대기를 보존한 채 일반 난무 구간으로 재개한다", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격"];
  const timeline: BossTimeline = {
    windows: [
      { start: 0, end: 1, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "패턴 1" },
      { start: 1, end: 4, attackable: false, backAllowed: false, damageMultiplier: 0, directionVersion: 0, freeDamage: false, source: "360줄" },
      { start: 4, end: 12, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "패턴 2" },
    ],
    patterns: [{ id: 1, start: 0, end: 1 }, { id: 2, start: 4, end: 12 }],
    mechanics: [{ name: "360줄", scheduledAt: 1, start: 1, end: 4, damageMultiplier: 0 }],
    riskEvents: [],
  };
  const result = runCombatSimulation({
    seed: 1, durationSeconds: 12, playerLevel: 100, bossTimeline: timeline, recordActions: true,
    simulationBuild: "jeoljeong-non222",
    skills: names.map((skillName, index) => ({ cardId: `reset-${index}`, skillName, damage: 100, cooldown: 0, duration: 0.1, motionSeconds: 0.1 })),
    cycle: sectioned(names, "reset"),
  });
  const resumed = result.actions.find((action) => action.start >= 4);
  assert.equal(resumed?.skillName, "청룡진");
  assert.ok(result.mechanicPhases.some((phase) => phase.name === "360줄" && phase.damageMultiplier === 0 && phase.end === 4));
});

test("실제 23개 사이클은 360줄 이후 첫 청룡진이 아니라 일반 난무 구간으로 복귀한다", () => {
  const names = [
    "청룡진", "유성강천", "적룡포", "굉열파", "사두룡격",
    "반월섬", "청룡진", "맹룡열파", "유성강천", "적룡포", "굉열파", "사두룡격", "반월섬",
    "청룡진", "맹룡열파", "유성강천", "적룡포", "굉열파", "사두룡격", "반월섬",
    "청룡진", "맹룡열파", "유성강천",
  ];
  const timeline: BossTimeline = {
    windows: [
      { start: 0, end: 1, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "패턴 1" },
      { start: 1, end: 4, attackable: false, backAllowed: false, damageMultiplier: 0, directionVersion: 0, freeDamage: false, source: "360줄" },
      { start: 4, end: 14, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "패턴 2" },
    ],
    patterns: [{ id: 1, start: 0, end: 1 }, { id: 2, start: 4, end: 14 }],
    mechanics: [{ name: "360줄", scheduledAt: 1, start: 1, end: 4, damageMultiplier: 0 }],
    riskEvents: [],
  };
  const result = runCombatSimulation({
    seed: 1, durationSeconds: 14, playerLevel: 100, bossTimeline: timeline, recordActions: true,
    simulationBuild: "jeoljeong-non222",
    skills: names.map((skillName, index) => ({ cardId: `real-${index}`, skillName, damage: 100, cooldown: 0, duration: 0.1, motionSeconds: 0.1 })),
    cycle: names.map((skillName, index) => ({
      cardId: `real-${index}`, skillName, azureDragon: false, yeongaSimGong: false,
      section: index < 5 ? "encounter" as const : ["청룡진", "맹룡열파", "반월섬"].includes(skillName) ? "repeat-flurry" as const : "repeat-focus" as const,
    })),
  });
  const resumedActions = result.actions.filter((action) => action.start >= 4);
  assert.deepEqual(resumedActions.slice(0, 3).map((action) => action.skillName), [
    "반월섬", "청룡진", "맹룡열파",
  ]);
});

test("조우 사이클은 한 번만 실행하고 반복 난무 구간으로 이어진다", () => {
  const cards = [
    ["청룡진", "encounter"], ["유성강천", "encounter"], ["적룡포", "encounter"],
    ["굉열파", "encounter"], ["사두룡격", "encounter"],
    ["청룡진", "repeat-flurry"], ["맹룡열파", "repeat-flurry"], ["반월섬", "repeat-flurry"],
    ["유성강천", "repeat-focus"], ["적룡포", "repeat-focus"], ["굉열파", "repeat-focus"], ["사두룡격", "repeat-focus"],
  ] as const;
  const result = runCombatSimulation({
    seed: 7, durationSeconds: 8, playerLevel: 100, recordActions: true,
    skills: cards.map(([skillName], index) => ({ cardId: `section-${index}`, skillName, damage: 100, cooldown: 0, duration: 0.1 })),
    cycle: cards.map(([skillName, section], index) => ({ cardId: `section-${index}`, skillName, section, azureDragon: false, yeongaSimGong: false })),
    bossTimeline: { windows: [{ start: 0, end: 8, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "테스트" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  const names = result.actions.map((action) => action.skillName);
  assert.deepEqual(names.slice(0, 5), ["청룡진", "유성강천", "적룡포", "굉열파", "사두룡격"]);
  assert.deepEqual(names.slice(5, 8), ["청룡진", "맹룡열파", "반월섬"]);
  assert.equal(names.slice(5).includes("청룡진"), true);
});

test("명시된 조우 적룡필살은 조우 카드 순서에서 한 번 실행된다", () => {
  const names = ["청룡진", "유성강천", "적룡필살", "적룡포", "굉열파", "사두룡격", "맹룡열파", "반월섬", "유성강천", "적룡포"];
  const result = runCombatSimulation({
    seed: 11, durationSeconds: 8, playerLevel: 100, recordActions: true, simulationBuild: "jeoljeong-non222",
    skills: names.map((skillName, index) => ({ cardId: `encounter-finisher-${index}`, skillName, damage: 100, cooldown: skillName === "적룡필살" ? 99 : 0, duration: 0.1, motionSeconds: 0.1, isDragonFinisher: skillName === "적룡필살" })),
    cycle: names.map((skillName, index) => ({
      cardId: `encounter-finisher-${index}`, skillName,
      section: index < 6 ? "encounter" as const : index < 8 ? "repeat-flurry" as const : "repeat-focus" as const,
      azureDragon: false, yeongaSimGong: false,
    })),
    bossTimeline: { windows: [{ start: 0, end: 8, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  const namesUsed = result.actions.map((action) => action.skillName);
  const finisherIndex = namesUsed.indexOf("적룡필살");
  assert.equal(finisherIndex, 2);
  assert.equal(namesUsed.filter((name) => name === "적룡필살").length, 1);
  assert.equal(result.actions[finisherIndex]?.cardId, "encounter-finisher-2");
  assert.equal(result.actions[finisherIndex]?.section, "encounter");
  assert.equal(result.actions[finisherIndex]?.visitId, 1);
});

test("반복 예약 필살은 일반 집중 카드 커서를 건너뛰지 않고 맹룡에 연가심공을 적용한다", () => {
  const names = ["청룡진", "유성강천", "적룡필살", "적룡포", "굉열파", "사두룡격", "청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격"];
  const result = runCombatSimulation({
    seed: 12, durationSeconds: 18, playerLevel: 100, recordActions: true,
    simulationBuild: "jeoljeong-non222", finisherReserveThresholdSeconds: 7.5,
    skills: names.map((skillName, index) => ({
      cardId: `reserved-${index}`, skillName, damage: 100,
      yeongaDamage: 200, cooldown: skillName === "적룡필살" ? 8 : 0,
      duration: 0.1, motionSeconds: 0.1, isDragonFinisher: skillName === "적룡필살",
    })),
    cycle: names.map((skillName, index) => ({
      cardId: `reserved-${index}`, skillName,
      section: index < 6 ? "encounter" as const : index < 9 ? "repeat-flurry" as const : "repeat-focus" as const,
      azureDragon: false, yeongaSimGong: false,
    })),
    bossTimeline: { windows: [{ start: 0, end: 18, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  const actions = result.actions.map((action) => action.skillName);
  const firstRepeatFocus = actions.indexOf("유성강천", actions.indexOf("반월섬") + 1);
  assert.ok(firstRepeatFocus >= 0);
  assert.deepEqual(actions.slice(firstRepeatFocus, firstRepeatFocus + 5), ["유성강천", "적룡포", "굉열파", "사두룡격", "적룡필살"]);
  const flurryYeongaDamage = result.skillStatistics.find((row) => row.skillName === "맹룡열파")?.totalDamage ?? 0;
  assert.ok(flurryYeongaDamage >= 200);
});

test("집중에서 필살이 준비되면 남은 일반 카드와 다음 스탠스 전환보다 먼저 사용한다", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격"];
  const result = runCombatSimulation({
    seed: 121, durationSeconds: 12, playerLevel: 100, recordActions: true,
    simulationBuild: "jeoljeong-non222", finisherReserveThresholdSeconds: 7.5,
    skills: names.map((skillName, index) => ({
      cardId: `priority-${index}`, skillName, damage: 100,
      cooldown: skillName === "적룡필살" ? 0 : 0, duration: 0.1, motionSeconds: 0.1,
      isDragonFinisher: skillName === "적룡필살",
    })).concat([{ cardId: "priority-finisher", skillName: "적룡필살", damage: 100, cooldown: 0, duration: 0.1, motionSeconds: 0.1, isDragonFinisher: true }]),
    cycle: names.map((skillName, index) => ({
      cardId: `priority-${index}`, skillName,
      section: index < 3 ? "repeat-flurry" as const : "repeat-focus" as const,
      azureDragon: false, yeongaSimGong: false,
    })),
    bossTimeline: { windows: [{ start: 0, end: 12, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  const actions = result.actions.map((action) => action.skillName);
  const flurryEnd = actions.indexOf("반월섬");
  const finisherIndex = actions.indexOf("적룡필살", flurryEnd + 1);
  assert.ok(flurryEnd >= 0);
  assert.equal(finisherIndex, flurryEnd + 1);
});

test("일반 카드 쿨을 기다리는 중 준비된 필살은 일반 쿨 완료까지 기다리지 않는다", () => {
  const encounter = ["청룡진", "유성강천", "적룡필살", "적룡포", "굉열파", "사두룡격"];
  const flurry = ["청룡진", "맹룡열파", "반월섬"];
  const focus = ["유성강천", "적룡포", "굉열파", "사두룡격"];
  const names = [...encounter, ...flurry, ...focus];
  const result = runCombatSimulation({
    seed: 122, durationSeconds: 12, playerLevel: 100, recordActions: true,
    simulationBuild: "jeoljeong-non222", finisherReserveThresholdSeconds: 7.5,
    skills: names.map((skillName, index) => ({
      cardId: `priority-wait-${index}`, skillName, damage: 100,
      cooldown: skillName === "적룡필살" ? 5 : skillName === "적룡포" ? 20 : 0,
      duration: 0.1, motionSeconds: 0.1, isDragonFinisher: skillName === "적룡필살",
    })),
    cycle: names.map((skillName, index) => ({
      cardId: `priority-wait-${index}`, skillName,
      section: index < encounter.length ? "encounter" as const : index < encounter.length + flurry.length ? "repeat-flurry" as const : "repeat-focus" as const,
      azureDragon: false, yeongaSimGong: false,
    })),
    bossTimeline: { windows: [{ start: 0, end: 12, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  const actions = result.actions;
  const focusStart = actions.findIndex((action, index) => action.section === "repeat-focus" && index > 0);
  const finisherIndex = actions.findIndex((action, index) => index > focusStart && action.skillName === "적룡필살");
  assert.ok(focusStart >= 0);
  assert.ok(finisherIndex >= 0);
  // 적룡포의 쿨 완료 시각(20초)을 기다렸다면 전투가 끝날 때까지
  // 필살을 시전할 수 없다. 필살이 5.95초에 실행되는 것이 직접 증명이다.
  assert.ok(actions[finisherIndex]!.start < 20);
});

test("필살 판단 진단 플래그는 대표 판단을 기록하지만 결과·난수에는 영향을 주지 않는다", () => {
  const base = {
    seed: 123, durationSeconds: 20, playerLevel: 100 as const,
    simulationBuild: "jeoljeong-non222" as const, finisherReserveThresholdSeconds: 7.5,
    skills: [
      { cardId: "diag-flurry", skillName: "맹룡열파", damage: 10, cooldown: 0, duration: 0.1 },
      { cardId: "diag-half", skillName: "반월섬", damage: 10, cooldown: 0, duration: 0.1 },
      { cardId: "diag-focus", skillName: "유성강천", damage: 10, cooldown: 20, duration: 0.1 },
      { cardId: "diag-finisher", skillName: "적룡필살", damage: 10, cooldown: 0, duration: 0.1, isDragonFinisher: true },
    ],
    cycle: [
      { cardId: "diag-flurry", skillName: "맹룡열파", section: "repeat-flurry" as const, azureDragon: false, yeongaSimGong: false },
      { cardId: "diag-half", skillName: "반월섬", section: "repeat-flurry" as const, azureDragon: false, yeongaSimGong: false },
      { cardId: "diag-focus", skillName: "유성강천", section: "repeat-focus" as const, azureDragon: false, yeongaSimGong: false },
    ],
    bossTimeline: { windows: [{ start: 0, end: 20, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  };
  const without = runCombatSimulation(base);
  const withDiagnostics = runCombatSimulation({ ...base, recordDecisionDiagnostics: true });
  assert.deepEqual(
    { damage: withDiagnostics.totalDamage, actions: withDiagnostics.actions, idle: withDiagnostics.finisherReadyIdleBreakdown },
    { damage: without.totalDamage, actions: without.actions, idle: without.finisherReadyIdleBreakdown },
  );
  assert.ok(withDiagnostics.finisherDecisionSnapshots.length > 0);
  assert.ok(withDiagnostics.finisherDecisionSnapshots.every((snapshot) => snapshot.visitId >= 0));
});

test("반복 청룡진은 맹룡열파 잔여 쿨이 1초 이하일 때까지 기다린다", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격"];
  const result = runCombatSimulation({
    seed: 13, durationSeconds: 20, playerLevel: 100, recordActions: true,
    simulationBuild: "jeoljeong-non222",
    skills: names.map((skillName, index) => ({
      cardId: `azure-wait-${index}`, skillName, damage: 100,
      cooldown: skillName === "맹룡열파" ? 10 : 0, duration: 0.1, motionSeconds: 0.1,
    })),
    cycle: names.map((skillName, index) => ({
      cardId: `azure-wait-${index}`, skillName,
      section: index < 3 ? "repeat-flurry" as const : "repeat-focus" as const,
      azureDragon: false, yeongaSimGong: false,
    })),
    bossTimeline: { windows: [{ start: 0, end: 20, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  const azureStarts = result.actions.filter((action) => action.skillName === "청룡진").map((action) => action.start);
  const firstMongStart = result.actions.find((action) => action.skillName === "맹룡열파")?.start ?? 0;
  assert.ok(azureStarts.length >= 2);
  assert.ok(azureStarts[1] >= firstMongStart + 9);
});

test("맹룡·반월·청룡진 순서에서는 청룡진이 다음 맹룡 쿨을 기다리지 않는다", () => {
  const flurry = ["맹룡열파", "반월섬", "청룡진"];
  const focus = ["유성강천", "적룡포", "굉열파", "사두룡격"];
  const names = [...flurry, ...focus];
  const result = runCombatSimulation({
    seed: 14, durationSeconds: 12, playerLevel: 100, recordActions: true,
    simulationBuild: "jeoljeong-non222",
    skills: names.map((skillName, index) => ({
      cardId: `azure-after-${index}`, skillName, damage: 100,
      cooldown: skillName === "맹룡열파" ? 4 : 0, duration: 0.1, motionSeconds: 0.1,
    })),
    cycle: names.map((skillName, index) => ({
      cardId: `azure-after-${index}`, skillName,
      section: index < flurry.length ? "repeat-flurry" as const : "repeat-focus" as const,
      azureDragon: false, yeongaSimGong: false,
    })),
    bossTimeline: { windows: [{ start: 0, end: 12, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  const azureStarts = result.actions.filter((action) => action.skillName === "청룡진").map((action) => action.start);
  assert.ok(azureStarts.length >= 2);
  assert.ok(azureStarts[1]! < 9);
});

test("집중 3회 이후 쿨이 남은 사두·굉열파는 해당 방문에서만 생략한다", () => {
  const encounter = ["청룡진", "맹룡열파", "반월섬", "유성강천", "굉열파"];
  const flurry = ["청룡진", "맹룡열파", "반월섬"];
  const focus = ["유성강천", "적룡포", "굉열파", "사두룡격"];
  const names = [...encounter, ...flurry, ...focus];
  const result = runCombatSimulation({
    seed: 31, durationSeconds: 8, playerLevel: 100, recordActions: true,
    simulationBuild: "jeoljeong-non222",
    skills: names.map((skillName, index) => ({
      cardId: `skip-${index}`, skillName, damage: 100,
      cooldown: skillName === "굉열파" ? 10 : skillName === "사두룡격" ? 5 : 0,
      duration: 0, motionSeconds: 0,
    })),
    cycle: names.map((skillName, index) => ({
      cardId: `skip-${index}`, skillName,
      section: index < encounter.length ? "encounter" as const : index < encounter.length + flurry.length ? "repeat-flurry" as const : "repeat-focus" as const,
      azureDragon: false, yeongaSimGong: false,
    })),
    bossTimeline: { windows: [{ start: 0, end: 8, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  const actions = result.actions.map((action) => action.skillName);
  assert.equal(actions.filter((skillName) => skillName === "굉열파").length, 1, "첫 방문의 굉열파만 사용되어야 한다");
  assert.equal(actions.filter((skillName) => skillName === "사두룡격").length, 0, "준비되지 않은 사두룡격은 방문에서 생략되어야 한다");
  assert.ok(actions.includes("적룡포"), "생략 조건이 아닌 다음 집중 카드는 계속 처리해야 한다");
});

test("사용하지 않은 스킬의 쿨비는 준비 상태 전체를 유휴시간으로 계산한다", () => {
  const result = runCombatSimulation({
    seed: 1, durationSeconds: 10, playerLevel: 100,
    skills: [
      { skillName: "차단", damage: 1, cooldown: 99, duration: 100 },
      { skillName: "미사용", damage: 1, cooldown: 10, duration: 0.1 },
    ],
  });
  assert.equal(result.skillStatistics.find((row) => row.skillName === "미사용")?.cooldownRatio, 0);
});

test("action time never reverses or overlaps across patterns and mechanic boundaries", () => {
  for (const motion of [0.2, 7.3, 22]) {
    for (let seed = 1; seed <= 20; seed++) {
      const result = runCombatSimulation({ seed, durationSeconds: 720,
        playerLevel: 90, finisherPolicy: "ready", recordActions: true,
        skills: [{ skillName: "regular", damage: 100, cooldown: 11.73, duration: motion },
          { skillName: "finisher", damage: 500, cooldown: 60, duration: 2, isDragonFinisher: true }],
      });
      const nextReady = new Map<string, number>();
      result.actions.forEach((action, i) => {
        assert.ok(action.start < 720);
        if (i) assert.ok(action.start >= result.actions[i - 1].motionEnd);
        assert.ok(action.start >= (nextReady.get(action.skillName) ?? 0));
        nextReady.set(action.skillName, action.start + (action.skillName === "regular" ? 11.73 : 60));
        for (const phase of result.mechanicPhases.filter(p => p.damageMultiplier === 0)) {
          if (phase.name === "320줄" && phase.end - phase.start === 30) continue;
          assert.ok(action.start < phase.start || action.start >= phase.end);
        }
      });
    }
  }
});

test("main mechanics respect scheduled windows, fixed durations and invulnerability", () => {
  const durations = new Set<number>();
  for (let seed = 1; seed <= 50; seed++) {
    const result = simulate(seed);
    const phases = result.mechanicPhases.filter((phase) => phase.name !== "패턴 사이");
    assert.equal(phases.length, 9);
    const ranges = [[60,80],[60,80],[165,190],[165,190],[165,190],[165,190],[330,380],[520,560],[580,630]];
    phases.forEach((phase, i) => {
      assert.ok(phase.scheduledAt >= ranges[i][0] && phase.scheduledAt <= ranges[i][1]);
      assert.ok(phase.start >= phase.scheduledAt);
      if (i) assert.ok(phase.start >= phases[i-1].end);
      if (phase.damageMultiplier === 0) {
        assert.equal(phase.damage, 0);
        if (phase.name === "360줄") assert.equal(phase.attacks, 0);
      }
    });
    const seconds360 = phases[0].end - phases[0].start + phases[1].end - phases[1].start;
    assert.ok(Math.abs(seconds360 - 60) < 1e-8 || Math.abs(seconds360 - 80) < 1e-8);
    durations.add(Math.round(seconds360));
    assert.equal(phases[1].end - phases[1].start, seconds360 - 30);
    assert.equal(phases[2].end - phases[2].start, 30);
    assert.ok(phases[3].end - phases[3].start >= 20 && phases[3].end - phases[3].start <= 30);
    assert.equal(phases[3].damage, phases[3].attacks * 50);
    assert.ok(Math.abs(phases[4].end - phases[4].start - 10) < 0.02);
    assert.equal(phases[4].damage, phases[4].attacks * 100);
    assert.ok(Math.abs(phases[5].end - phases[5].start - 5) < 0.02);
    assert.ok(Math.abs(phases[6].end - phases[6].start - 18) < 0.02);
    assert.ok(Math.abs(phases[7].end - phases[7].start - 18) < 0.02);
    assert.ok(Math.abs(phases[8].end - phases[8].start - 12) < 0.02);
  }
  assert.deepEqual([...durations].sort(), [60,80]);
});

test("fight end clips a mechanic and long casts do not extend fixed mechanic phases", () => {
  const baseline = simulate();
  const stop = baseline.mechanicPhases[0].start + 20;
  const clipped = simulate(1, stop);
  const clippedMechanics = clipped.mechanicPhases.filter((phase) => phase.name !== "패턴 사이");
  assert.equal(clippedMechanics.length, 1);
  assert.equal(clippedMechanics[0].end, stop);
  for (const phase of simulate(1, 720, 7.3).mechanicPhases.filter((phase) => phase.name !== "패턴 사이")) {
    if (phase.name.includes("3잡")) assert.equal(phase.end - phase.start, 18);
  }
});

test("boss timeline is pre-generated and does not depend on player motion", () => {
  const timeline = createBossTimeline(720, 37);
  const fast = runCombatSimulation({
    seed: 37, durationSeconds: 720, playerLevel: 100, finisherPolicy: "ready",
    skills: [{ skillName: "regular", damage: 100, cooldown: 5, duration: 0.2 }],
  });
  const slow = runCombatSimulation({
    seed: 37, durationSeconds: 720, playerLevel: 100, finisherPolicy: "ready",
    skills: [{ skillName: "regular", damage: 100, cooldown: 5, duration: 8 }],
  });
  assert.deepEqual(fast.mechanicPhases.map(({ name, scheduledAt, start, end }) => ({ name, scheduledAt, start, end })),
    slow.mechanicPhases.map(({ name, scheduledAt, start, end }) => ({ name, scheduledAt, start, end })));
  assert.ok(timeline.windows.every((window) => window.start >= 0 && window.end <= 720 && window.start < window.end));
});

test("timeline encodes the agreed special pattern windows", () => {
  const locate = (id: number) => {
    const durationById: Record<number, number> = { 6: 10, 10: 8, 11: 6, 12: 9.5, 13: 8, 22: 8.5 };
    for (let seed = 1; seed <= 300; seed += 1) {
      const timeline = createBossTimeline(720, seed);
      const pattern = timeline.patterns.find((candidate) => candidate.id === id && candidate.end - candidate.start >= durationById[id] - 1e-6);
      if (pattern) return { timeline, pattern };
    }
    throw new Error(`pattern ${id} was not sampled`);
  };
  const segments = (id: number) => {
    const { timeline, pattern } = locate(id);
    return timeline.windows
      .filter((window) => window.source === `패턴 ${id}` && window.start >= pattern.start && window.end <= pattern.end)
      .map((window) => ({ ...window, start: Number((window.start - pattern.start).toFixed(2)), end: Number((window.end - pattern.start).toFixed(2)) }));
  };
  const six = segments(6);
  assert.deepEqual(six.slice(0, 2).map(({ start, end, attackable }) => ({ start, end, attackable })), [
    { start: 0, end: 4, attackable: false }, { start: 4, end: 8, attackable: true },
  ]);
  const ten = segments(10);
  assert.equal(ten[0].end, 6);
  assert.deepEqual(ten[1].allowedSkills, ["적룡포", "굉열파"]);
  const twelve = segments(12);
  assert.deepEqual(twelve.map(({ start, end, attackable }) => ({ start, end, attackable })), [
    { start: 0, end: 7, attackable: true }, { start: 7, end: 8, attackable: false }, { start: 8, end: 9.5, attackable: true },
  ]);
  const thirteen = segments(13);
  assert.deepEqual(thirteen.map(({ start, end, attackable }) => ({ start, end, attackable })), [
    { start: 0, end: 5, attackable: false }, { start: 5, end: 8, attackable: true },
  ]);
  const eleven = segments(11);
  assert.notEqual(eleven[0].directionVersion, eleven[1].directionVersion);
  const twentyTwo = segments(22);
  assert.equal(twentyTwo[1].end, 5);
  assert.notEqual(twentyTwo[1].directionVersion, twentyTwo[2].directionVersion);
});

test("pattern selection is uniform among candidates and does not rotate the boss by itself", () => {
  const timeline = createBossTimeline(180, 77);
  for (let index = 1; index < timeline.patterns.length; index += 1) {
    assert.notEqual(timeline.patterns[index - 1].id, timeline.patterns[index].id);
  }
  const patternWindows = timeline.windows.filter((window) => window.source.startsWith("패턴 "));
  for (let index = 1; index < patternWindows.length; index += 1) {
    const previous = patternWindows[index - 1];
    const current = patternWindows[index];
    if (previous.source !== current.source && previous.end === current.start) {
      assert.equal(current.directionVersion, previous.directionVersion);
    }
  }
});

test("mistake opportunities are placed only in dangerous pattern windows", () => {
  const timeline = createBossTimeline(240, 3);
  for (const event of timeline.riskEvents) {
    const window = timeline.windows.find((candidate) => event.time >= candidate.start && event.time < candidate.end);
    assert.ok(window);
    assert.equal(window!.freeDamage, false);
  }
});

test("a supplied boss seed shares external combat conditions across player levels", () => {
  const input = {
    bossSeed: 911, durationSeconds: 720, finisherPolicy: "ready" as const,
    skills: [{ skillName: "regular", damage: 100, cooldown: 5, duration: 0.2 }],
  };
  const high = runCombatSimulation({ ...input, seed: 1, playerLevel: 100 });
  const low = runCombatSimulation({ ...input, seed: 2, playerLevel: 80 });
  assert.deepEqual(
    high.mechanicPhases.map(({ name, scheduledAt, start, end }) => ({ name, scheduledAt, start, end })),
    low.mechanicPhases.map(({ name, scheduledAt, start, end }) => ({ name, scheduledAt, start, end })),
  );
});

test("actions and hits cannot begin or resolve after combat ends", () => {
  const result = runCombatSimulation({
    seed: 9, durationSeconds: 1, playerLevel: 100, finisherPolicy: "ready", recordActions: true,
    skills: [{ skillName: "regular", damage: 100, cooldown: 0, duration: 2 }],
  });
  assert.ok(result.actions.every((action) => action.start < 1));
  assert.equal(result.totalDamage, 0);
});

test("risk events are external to player input and 100% play has no mistake status", () => {
  const input = {
    seed: 7, durationSeconds: 60, finisherPolicy: "ready" as const, recordActions: true,
    skills: [{ skillName: "regular", damage: 1, cooldown: 0, duration: 0.2 }],
  };
  const perfect = runCombatSimulation({ ...input, playerLevel: 100 });
  const lower = runCombatSimulation({ ...input, playerLevel: 60 });
  assert.equal(perfect.statusLossSeconds, 0);
  assert.ok(createBossTimeline(input.durationSeconds, input.seed).riskEvents.some((event) => event.type === "stagger"));
  assert.ok(lower.statusLossSeconds >= 0);
});

test("stagger-immune casts ignore stagger but not by forcing a damage result", () => {
  const input = {
    seed: 7, durationSeconds: 60, playerLevel: 60 as const, finisherPolicy: "ready" as const, recordActions: true,
    skills: [{ skillName: "regular", damage: 1, cooldown: 0, duration: 0.2 }],
  };
  const vulnerable = runCombatSimulation(input);
  const immune = runCombatSimulation({
    ...input,
    skills: [{ ...input.skills[0], staggerImmune: true }],
  });
  assert.ok(immune.successfulUses >= vulnerable.successfulUses);
});

test("3잡 applies at most one one-second delay to each eligible use", () => {
  const result = runCombatSimulation({
    seed: 1, durationSeconds: 720, playerLevel: 100, finisherPolicy: "ready", recordActions: true,
    skills: [{ skillName: "regular", damage: 1, cooldown: 0, duration: 0.2 }],
  });
  assert.ok(result.threeJobDelayedUses > 0);
  assert.equal(result.threeJobDelaySeconds, result.threeJobDelayedUses);
  assert.ok(result.threeJobDelayedUses <= result.attemptedUses);
});

test("loss breakdown assigns overlapping time to one reason only", () => {
  const result = runCombatSimulation({
    seed: 1, durationSeconds: 120, playerLevel: 60, finisherPolicy: "ready",
    skills: [{ skillName: "regular", damage: 1, cooldown: 0, duration: 0.2 }],
  });
  const allocated = Object.values(result.lossBreakdown).reduce((sum, seconds) => sum + seconds, 0);
  assert.ok(allocated <= 120);
  assert.ok(Math.abs(allocated - result.lostSeconds) < 1e-9);
  assert.ok(result.lossBreakdown.bossUnavailable > 0);
  assert.ok(result.lossBreakdown.input > 0);
  assert.ok(result.lossBreakdown.orderMotion > 0);
});

test("스킬별 쿨비 장부는 시전 시작 기록으로 독립 재계산할 수 있다", () => {
  const durationSeconds = 20;
  const result = runCombatSimulation({
    seed: 124, durationSeconds, playerLevel: 100, recordActions: true,
    skills: [
      { skillName: "일반", damage: 1, cooldown: 10, duration: 0.2, motionSeconds: 0.2 },
      { skillName: "적룡필살", damage: 1, cooldown: 30, duration: 0.2, motionSeconds: 0.2, isDragonFinisher: true },
    ],
    bossTimeline: { windows: [{ start: 0, end: durationSeconds, attackable: true, backAllowed: true, damageMultiplier: 1, directionVersion: 0, freeDamage: true, source: "fixture" }], patterns: [], mechanics: [], riskEvents: [] },
  });
  for (const [skillName, cooldown] of [["일반", 10], ["적룡필살", 30]] as const) {
    const row = result.skillStatistics.find((entry) => entry.skillName === skillName)!;
    const independentlyCalculated = calculateReadyIdleFromActions(result.actions, skillName, cooldown, durationSeconds);
    assert.ok(Math.abs(row.readyIdleSeconds - independentlyCalculated) < 1e-9, `${skillName} ready-idle mismatch`);
    const allocated = Object.values(row.readyIdleBreakdown).reduce((sum, seconds) => sum + seconds, 0);
    assert.ok(Math.abs(allocated - independentlyCalculated) < 1e-9, `${skillName} cause allocation mismatch`);
  }
});

test("same seed reproduces mechanic schedule and results", () => {
  assert.deepEqual(simulate(42), simulate(42));
  assert.deepEqual(
    simulate(42).mechanicPhases.filter((p) => p.name !== "패턴 사이").map(p => p.scheduledAt),
    simulate(42,720,1.7).mechanicPhases.filter((p) => p.name !== "패턴 사이").map(p => p.scheduledAt),
  );
});

test("660초 500회 반복은 유한한 결과를 만들고 스킬 통계를 집계한다", () => {
  const names = ["청룡진", "맹룡열파", "반월섬", "유성강천", "적룡포", "굉열파", "사두룡격", "적룡필살"];
  const skills = names.map((skillName) => ({
    skillName,
    damage: 100,
    cooldown: skillName === "적룡필살" ? 12 : 5,
    duration: 0.5,
    isDragonFinisher: skillName === "적룡필살",
    isBackAttackSkill: true,
    staggerImmune: ["맹룡열파", "반월섬", "적룡포", "유성강천", "굉열파", "적룡필살"].includes(skillName),
  }));
  const cycle = names.map((skillName, index) => ({
    cardId: `batch-${index}`,
    skillName,
    azureDragon: skillName === "청룡진",
    yeongaSimGong: false,
    section: index < 3 ? "repeat-flurry" as const : "repeat-focus" as const,
  }));
  const result = runCombatSimulations({
    durationSeconds: 660,
    playerLevel: 90,
    finisherReserveThresholdSeconds: 7.5,
    skills,
    cycle,
  }, 500);
  assert.equal(result.runs, 500);
  assert.ok(Number.isFinite(result.totalDamage));
  assert.ok(result.skillStatistics.every((row) => Number.isFinite(row.cooldownRatio)));
  assert.ok(result.skillStatistics.some((row) => row.skillName === "적룡필살"));
});
