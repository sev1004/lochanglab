export type BossWindow = {
  start: number;
  end: number;
  attackable: boolean;
  backAllowed: boolean;
  /** During a forced mechanic opening, directional skills count as back attacks. */
  forceBackAttack?: boolean;
  /** Movement can be possible even when damage or back attacks are not. */
  movementAllowed?: boolean;
  damageMultiplier: number;
  allowedSkills?: readonly string[];
  directionVersion: number;
  freeDamage: boolean;
  source: string;
  /** Unique pattern occurrence. Internal subwindows share this value. */
  patternId?: number;
};

export type BossTimeline = {
  windows: BossWindow[];
  patterns: { id: number; start: number; end: number }[];
  mechanics: { name: string; scheduledAt: number; start: number; end: number; damageMultiplier: number }[];
  /** Potential player mistakes, generated with the boss schedule rather than player RNG. */
  riskEvents: BossRiskEvent[];
};

export type BossRiskEvent = {
  time: number;
  type: "knockdown" | "stagger" | "stumble";
  /** Uniform draw shared between all player-level comparisons. */
  roll: number;
  /** Only used for a get-up unavailable knockdown, in the agreed 4~6 second range. */
  longKnockdownSeconds: number;
  patternId: number;
};

const DURATIONS = [6, 10, 8, 10, 8, 10, 6, 15, 12, 8, 6, 9.5, 8, 10, 8.5, 9, 6, 8, 9, 9, 8.5, 8.5, 5, 8];
const SIDE_DAMAGE_SKILLS = ["적룡포", "굉열파"] as const;

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function append(
  windows: BossWindow[], start: number, end: number, source: string,
  options: Partial<Omit<BossWindow, "start" | "end" | "source">>, directionVersion: number,
) {
  if (end <= start) return;
  windows.push({ start, end, source, attackable: true, backAllowed: true, movementAllowed: true, damageMultiplier: 1, freeDamage: false, directionVersion, ...options });
}

function appendPattern(windows: BossWindow[], id: number, start: number, roll: number, targeted: number, direction: number, occurrenceId: number) {
  const end = start + DURATIONS[id - 1];
  const on = (from: number, to: number, options: Parameters<typeof append>[4] = {}) => append(windows, start + from, start + to, `패턴 ${id}`, { ...options, patternId: occurrenceId }, direction);
  const off = (from: number, to: number) => on(from, to, { attackable: false });
  const free = (from: number, to: number, options: Parameters<typeof append>[4] = {}) => on(from, to, { freeDamage: true, ...options });
  switch (id) {
    case 1: free(0, 2); free(2, 4, { directionVersion: direction + 1 }); free(4, 6); break;
    case 2: free(0, 8); free(8, 9, { allowedSkills: ["적룡포"], backAllowed: false }); off(9, 10); break;
    case 3: free(0, 4); free(4, 8, { directionVersion: direction + 1 }); break;
    case 4: off(0, 0.3); free(0.3, 10); break;
    case 5: targeted < 0.26 ? (off(0, 5), free(5, 8)) : free(0, 8); break;
    case 6: off(0, 4); free(4, 8); (roll < 0.5 ? free : off)(8, 10); break;
    case 7: off(0, 0.5 + roll * 1.8); free(0.5 + roll * 1.8, 6, { backAllowed: false }); break;
    case 8: free(0, 15); break;
    case 9: free(0, 2); off(2, 5); free(5, 12, { backAllowed: targeted >= 0.26 }); break;
    case 10: free(0, 6, { backAllowed: roll < 0.5 }); on(6, 8, { backAllowed: false, allowedSkills: SIDE_DAMAGE_SKILLS }); break;
    case 11: free(0, 3); free(3, 6, { directionVersion: direction + 1 }); break;
    case 12: free(0, 7); off(7, 8); free(8, 9.5); break;
    case 13: off(0, 5); free(5, 8); break;
    case 14: off(0, 1); free(1, 9); off(9, 10); break;
    case 15: free(0, 4); free(4, 8.5, { directionVersion: direction + 1 }); break;
    case 16: free(0, 3); free(3, 9, { backAllowed: false }); break;
    case 17: free(0, 2.5); off(2.5, 3.5); free(3.5, 6); break;
    case 18: free(0, 3); free(3, 8, { backAllowed: roll < 0.5 }); break;
    case 19: free(0, 1); off(1, 7); free(7, 9); break;
    case 20: free(0, 4); off(4, 5); free(5, 8); off(8, 9); break;
    case 21: off(0, 3); free(3, 4); free(4, 8.5, { directionVersion: direction + 1 }); break;
    case 22: off(0, 2); free(2, 5); free(5, 8.5, { directionVersion: direction + 1 }); break;
    case 23: free(0, 2); off(2, 4); free(4, 5); break;
    case 24: free(0, 2); off(2, 4); free(4, 6); off(6, 6.5); free(6.5, 8); break;
    default: free(0, end - start);
  }
  return end;
}

export function createBossTimeline(durationSeconds: number, seed: number): BossTimeline {
  const boss = random(seed ^ 0x13579bdf);
  const mechanic = random(seed ^ 0x5a17);
  const risk = random(seed ^ 0x6d2b79f5);
  const scheduled = [
    { name: "360줄", at: 60 + mechanic() * 20, segments: [{ seconds: 30, multiplier: 1, forceBackAttack: true }, { seconds: mechanic() < 0.5 ? 30 : 50, multiplier: 0 }] },
    { name: "320줄", at: 165 + mechanic() * 25, segments: [{ seconds: 30, multiplier: 0, forceBackAttack: true }, { seconds: 20 + mechanic() * 10, multiplier: 0.5 }, { seconds: 10, multiplier: 1 }, { seconds: 5, multiplier: 0 }] },
    { name: "첫 3잡", at: 330 + mechanic() * 50, segments: [{ seconds: 18, multiplier: 1 }] },
    { name: "두 번째 3잡", at: 520 + mechanic() * 40, segments: [{ seconds: 18, multiplier: 1 }] },
    { name: "앵버", at: 580 + mechanic() * 50, segments: [{ seconds: 12, multiplier: 0 }] },
  ];
  const windows: BossWindow[] = [];
  const patterns: BossTimeline["patterns"] = [];
  const mechanics: BossTimeline["mechanics"] = [];
  let now = 0;
  let nextMechanic = 0;
  let previous = 0;
  let direction = 0;
  while (now < durationSeconds) {
    const upcoming = scheduled[nextMechanic];
    if (upcoming && now >= upcoming.at) {
      for (const [segmentIndex, segment] of upcoming.segments.entries()) {
        const end = Math.min(durationSeconds, now + segment.seconds);
        append(windows, now, end, upcoming.name, {
          // 0배율이어도 320줄 첫 30초처럼 스킬 시전 자체는 가능한
          // 구간이 있다. 공격 불가와 피해 0을 분리한다.
          attackable: segment.multiplier > 0 || Boolean(segment.forceBackAttack),
          backAllowed: segment.multiplier > 0 || Boolean(segment.forceBackAttack),
          // 사용자가 확정한 규칙상 메인 기믹에도 이동 자체는 가능하다.
          // 공격 불가와 이동 불가를 분리하되, 컷씬으로 이동을 잠그지 않는다.
          movementAllowed: true,
          damageMultiplier: segment.multiplier,
          freeDamage: segment.multiplier > 0,
          forceBackAttack: segment.forceBackAttack,
        }, direction);
        if (end > now) {
          mechanics.push({ name: upcoming.name, scheduledAt: upcoming.at, start: now, end, damageMultiplier: segment.multiplier });
        }
        now = end;
      }
      nextMechanic += 1;
      continue;
    }
    const draw = Math.floor(boss() * (previous === 0 ? 24 : 23));
    const id = previous === 0 ? draw + 1 : draw >= previous - 1 ? draw + 2 : draw + 1;
    const start = now;
    const end = appendPattern(windows, id, start, boss(), boss(), direction, patterns.length + 1) ?? start;
    patterns.push({ id, start, end: Math.min(end, durationSeconds) });
    now = Math.min(end, durationSeconds);
    previous = id;
    // A new pattern does not itself rotate the boss. Only explicit direction
    // changes inside the pattern template advance this counter.
    const patternWindows = windows.filter((window) => window.source === `패턴 ${id}` && window.start >= start && window.end <= end);
    direction = Math.max(direction, ...patternWindows.map((window) => window.directionVersion));
    if (now < durationSeconds && !(scheduled[nextMechanic] && now >= scheduled[nextMechanic].at)) {
      const gapEnd = Math.min(durationSeconds, now + 2 + boss());
      append(windows, now, gapEnd, "패턴 사이", { freeDamage: true }, direction);
      now = gapEnd;
    }
  }
  // Pattern templates are written in their natural duration. The combat
  // timeline itself is half-open [0, duration), so clip the final template
  // instead of allowing a player action to start after combat has ended.
  const clippedWindows = windows
    .map((window) => ({ ...window, end: Math.min(window.end, durationSeconds) }))
    .filter((window) => window.start < window.end);
  const riskEvents: BossRiskEvent[] = [];
  const movementPatternIds = new Set([4, 7, 11, 12, 15, 21, 22, 24]);
  for (let patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
    const pattern = patterns[patternIndex];
    const patternSeconds = pattern.end - pattern.start;
    if (patternSeconds <= 0) continue;
    const patternWindows = clippedWindows.filter((window) => window.source === `패턴 ${pattern.id}` && window.start < pattern.end && window.end > pattern.start);
    const dangerWindows = patternWindows.filter((window) => !window.freeDamage);
    const dangerRanges = dangerWindows.map((window) => ({ start: Math.max(pattern.start, window.start), end: Math.min(pattern.end, window.end) })).filter((range) => range.end > range.start);
    const pickDangerTime = () => {
      if (!dangerRanges.length) return null;
      const total = dangerRanges.reduce((sum, range) => sum + range.end - range.start, 0);
      let cursor = risk() * total;
      for (const range of dangerRanges) {
        const length = range.end - range.start;
        if (cursor <= length) return range.start + cursor;
        cursor -= length;
      }
      return dangerRanges[dangerRanges.length - 1].end - 1e-6;
    };
    const eventAt = () => pickDangerTime();
    const knockdownTime = eventAt();
    if (knockdownTime !== null) {
      riskEvents.push({ time: knockdownTime, type: "knockdown", roll: risk(), longKnockdownSeconds: 4 + risk() * 2, patternId: pattern.id });
    }
    if (dangerWindows.some((window) => !window.attackable)) {
      const extraKnockdownTime = eventAt();
      if (extraKnockdownTime !== null) riskEvents.push({ time: extraKnockdownTime, type: "knockdown", roll: risk(), longKnockdownSeconds: 4 + risk() * 2, patternId: pattern.id });
    }
    for (const range of dangerRanges) {
      const length = range.end - range.start;
      const opportunities = Math.ceil(length / 4);
      for (let index = 0; index < opportunities; index += 1) {
        // 4초 단위 기회를 기본으로 하되, 합의한 7초 위험 구간 2회처럼
        // 경계에 걸리는 기회도 별도 사건으로 보존한다.
        const time = range.start + ((index + 1) * length) / (opportunities + 1);
        riskEvents.push({ time, type: "stagger", roll: risk(), longKnockdownSeconds: 0, patternId: pattern.id });
      }
    }
    // Moving patterns and the immediately following pattern both receive a
    // stumble opportunity. The exact eligible pattern IDs come from the
    // supplied movement descriptions.
    const previousPatternMoved = patternIndex > 0 && movementPatternIds.has(patterns[patternIndex - 1].id);
    if (movementPatternIds.has(pattern.id) || previousPatternMoved) {
      const stumbleTime = eventAt();
      if (stumbleTime !== null) riskEvents.push({ time: stumbleTime, type: "stumble", roll: risk(), longKnockdownSeconds: 0, patternId: pattern.id });
    }
  }
  riskEvents.sort((left, right) => left.time - right.time || ({ knockdown: 0, stagger: 1, stumble: 2 }[left.type] - ({ knockdown: 0, stagger: 1, stumble: 2 }[right.type])));
  return { windows: clippedWindows, patterns, mechanics, riskEvents };
}

export function bossWindowAt(timeline: BossTimeline, time: number, includeEnd = false) {
  if (includeEnd && time > 0) {
    const endingWindow = timeline.windows.find((window) => time === window.end);
    if (endingWindow) return endingWindow;
  }
  return timeline.windows.find((window) => time >= window.start && time < window.end) ?? null;
}
