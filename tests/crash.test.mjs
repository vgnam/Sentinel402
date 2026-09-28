import test from 'node:test';
import assert from 'node:assert/strict';
import { runCrashes } from '../research/crash-run.mjs';

test('forced child-process termination preserves separate payment effects and uncertain reservations', async () => {
  const report = await runCrashes({ repetitions: 1 });
  assert.equal(report.rows.length, 5);
  assert.equal(report.invariantFailures, 0);
  assert.ok(report.rows.every(r => r.forcedKill));
  assert.equal(report.unresolvedCases, 2);
  assert.equal(report.rows.find(r => r.phase === 'external_failure').releasedUSDC, 1);
  assert.equal(report.rows.find(r => r.phase === 'external_success').externalSuccessfulPayments, 1);
});
