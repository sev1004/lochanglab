import test from 'node:test';
import assert from 'node:assert/strict';
import { canFinishBeforeMechanic } from '../../src/domain/simulation/combat-simulation.ts';

test('기믹 5초 전부터 우선하며 입력과 모션을 경계 전에 완료해야 한다', () => {
  assert.equal(canFinishBeforeMechanic(94.99, 100, 0.22, 1.3), false);
  assert.equal(canFinishBeforeMechanic(95, 100, 0.22, 1.3), true);
  assert.equal(canFinishBeforeMechanic(98, 100, 0.22, 1.3), true);
  assert.equal(canFinishBeforeMechanic(98.5, 100, 0.2, 1.3), false);
  assert.equal(canFinishBeforeMechanic(99, 100, 0.22, 1.3), false);
  assert.equal(canFinishBeforeMechanic(100, 100, 0.22, 1.3), false);
});
