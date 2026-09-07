import assert from "node:assert/strict";
import test from "node:test";
import { readBraceletStats } from "../../src/domain/bracelet/bracelet-stats.ts";
import { createCombatAttributeSnapshots, createCurrentCombatAttributeSnapshots } from "../../src/domain/combat/combat-stat-snapshot.ts";

test("API options stats and edited baseStats produce identical totals and removal deltas", () => {
  for (const name of ["치명", "특화", "신속"]) {
    const api = { baseStats: ["힘 +12,000"], options: [`${name} + 100`] };
    const evolution = [{ name, level: 10 }];
    const baseline = createCombatAttributeSnapshots({ apiTotals: { [name]: 650 }, evolution, braceletStats: readBraceletStats(api) });
    const total = (braceletStats: Record<string, number>) => createCurrentCombatAttributeSnapshots({ baseline, evolution, braceletStats })[name].internalTotal;
    assert.equal(total(readBraceletStats(api)), 650);
    assert.equal(total(readBraceletStats({ baseStats: [`${name} +100`], options: [] })), 650);
    assert.equal(total(readBraceletStats({ baseStats: [`${name} +101`], options: [] })), 651);
    assert.equal(total(readBraceletStats(undefined)), 550);
  }
});

test("duplicates are not summed and explicit zero overrides API options", () => {
  assert.equal(readBraceletStats({ baseStats: ["신속 +0"], options: ["신속 +100"] }).신속, 0);
  assert.deepEqual(readBraceletStats({ baseStats: ["특화 +100"], options: ["특화 + 100", "치명타 피해 +4%", "힘 +12,000"] }), { 특화: 100, 힘: 12000 });
});
