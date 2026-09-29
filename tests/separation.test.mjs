import test from 'node:test';
import assert from 'node:assert/strict';
import { runSeparation, summarizeSeparation } from '../research/separation.mjs';

const report = await runSeparation({ repetitions: 1 });
const summary = summarizeSeparation(report);
const arm = id => summary.byArm[id];

test('the in-process and durable monitors decide identically before the restart', () => {
  // Without this control, a difference after the restart could be a weaker policy instead of memory loss.
  assert.equal(summary.preRestartParity, true);
  assert.equal(report.rows.filter(r => r.arm === 'strict_stateful_memory').length, report.metadata.scenarios.length);
});

test('Sentinel survives the restart: no replay, no overspend, no duplicate payment, audit intact', () => {
  assert.equal(arm('sentinel').unauthorizedPayments, 0);
  assert.equal(arm('sentinel').unauthorizedUSDC, 0);
  assert.equal(arm('sentinel').probesAuthorizedAfterRestart, 0);
  assert.equal(arm('sentinel').duplicateExternalPayments, 0);
  assert.equal(arm('sentinel').auditValid, true);
});

test('the in-process strong baseline authorizes again after the restart', () => {
  // Recorded as a property of the baseline, not as a claim about Sentinel.
  assert.equal(arm('strict_stateful_memory').unauthorizedPayments, 3);
  assert.equal(arm('strict_stateful_memory').unauthorizedUSDC, 9);
  assert.equal(arm('strict_stateful_memory').probesAuthorizedAfterRestart, 3);
  assert.ok(arm('strict_stateful_memory').duplicateExternalPayments >= 1);
});

test('a durable hard-reject monitor ties on safety but never delivers a clipped amount', () => {
  assert.equal(arm('strict_stateful_durable').unauthorizedPayments, 0);
  assert.equal(arm('strict_stateful_durable').duplicateExternalPayments, 0);
  assert.equal(arm('strict_stateful_durable').clipDelivered, 0);
});

test('Sentinel is the only arm that is both durable and able to deliver the clipped amount', () => {
  assert.equal(arm('sentinel').clipDelivered, 1);
  assert.equal(arm('unguarded').clipUnsafe, 1);
  assert.equal(arm('strict_stateful_memory').clipDelivered, 0);
  assert.equal(arm('strict_stateful_durable').clipDelivered, 0);
});

test('the separation suite rejects unknown arms instead of silently passing', async () => {
  await assert.rejects(runSeparation({ arms: ['not_an_arm'] }), /Unknown separation arm/);
});
