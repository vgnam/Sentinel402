import test from 'node:test';
import assert from 'node:assert/strict';
import { runWalkthrough } from '../src/walkthrough.mjs';
import { canonical, hash } from '../src/domain.mjs';

test('judge evidence contains actual bounded effects and an independently verifiable audit chain', async () => {
  const report = await runWalkthrough();
  assert.equal(report.passed, true);
  assert.deepEqual(report.summary, { scenarios: 6, passed: 6, proposals: 10, committedMicroUSDC: 17_000_000 });
  const split = report.scenarios.find(s => s.scenario.id === 'split');
  assert.equal(split.transactions.length, 2);
  assert.equal(split.intent.available, 2_000_000);
  assert.ok(report.scenarios.every(s => s.intent.committed <= s.intent.budget && s.intent.reserved === 0));
  let head = '0'.repeat(64);
  for (const { seq, prevHash, hash: digest, ...record } of report.audit.records) {
    assert.equal(prevHash, head);
    head = hash(head + canonical(record));
    assert.equal(digest, head);
  }
  assert.equal(head, report.audit.integrity.head);
  assert.equal(report.audit.records.length, 21);
  assert.doesNotMatch(JSON.stringify(report), /s402_agent_|token_hash|apiKey|controlKey/);
});

test('demo reports execution failure instead of presenting canned passing results', async () => {
  const report = await runWalkthrough({ adapterFactory: () => ({ pay: async () => ({ status: 'failed', reason: 'TEST_OUTAGE' }) }) });
  assert.equal(report.passed, false);
  assert.equal(report.summary.committedMicroUSDC, 0);
  assert.ok(report.scenarios.some(s => s.checks.some(c => !c.passed)));
  assert.equal(report.audit.integrity.valid, true);
});
