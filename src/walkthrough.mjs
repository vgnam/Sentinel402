import { Store } from './store.mjs';
import { SandboxAdapter } from './adapter.mjs';
import { Sentinel } from './service.mjs';
import { SCENARIOS, runScenario } from './demo.mjs';

// Expected effects are specified separately from the authorization evaluator.
const EXPECTED = {
  safe: { decisions: ['Allow'], statuses: ['succeeded'], committed: 2_000_000 },
  split: { decisions: ['Allow', 'Allow', 'Block', 'Block'], statuses: ['succeeded', 'succeeded', 'not_executed', 'not_executed'], committed: 8_000_000 },
  replay: { decisions: ['Allow', 'Block'], statuses: ['succeeded', 'not_executed'], committed: 2_000_000 },
  recipient: { decisions: ['Block'], statuses: ['not_executed'], committed: 0 },
  repair: { decisions: ['Repair'], statuses: ['succeeded'], committed: 5_000_000 },
  escalate: { decisions: ['Escalate'], statuses: ['not_executed'], committed: 0 },
};
const sameMultiset = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Fresh, isolated fixture data: never reads the operator's DB, .env, or LLM traces. */
export async function runWalkthrough({ clock = Date.now, adapterFactory = store => new SandboxAdapter(store) } = {}) {
  const store = new Store();
  try {
    const service = new Sentinel(store, adapterFactory(store), { clock });
    const scenarios = [];
    for (const scenario of SCENARIOS) {
      const run = await runScenario(service, scenario.id);
      const intent = store.intents().find(c => c.id === run.intentId);
      const transactions = store.transactions().filter(t => t.intentId === run.intentId);
      const expected = EXPECTED[scenario.id];
      const checks = [
        { label: 'Expected authorization decisions', passed: sameMultiset(run.results.map(r => r.decision), expected.decisions) },
        { label: 'Expected execution outcomes', passed: sameMultiset(run.results.map(r => r.status), expected.statuses) },
        { label: 'Expected committed spend', passed: intent.committed === expected.committed },
        { label: 'No unresolved reservations', passed: intent.reserved === 0 },
        { label: 'Blocked and escalated requests have no transaction', passed: run.results.filter(r => ['Block', 'Escalate'].includes(r.decision)).every(r => r.transactionId === null && r.executable === null) },
      ];
      scenarios.push({ ...run, intent, transactions, expected, checks, passed: checks.every(c => c.passed) });
    }
    const integrity = store.verifyAudit();
    return {
      schemaVersion: 1,
      project: 'Sentinel402',
      generatedAt: new Date(clock()).toISOString(),
      mode: 'sandbox',
      inference: 'none — scripted payment proposals, not a live model evaluation',
      scope: 'Six synthetic demonstrations of the real authorization service and sandbox adapter. No blockchain transactions or real funds.',
      passed: integrity.valid && scenarios.every(s => s.passed),
      summary: {
        scenarios: scenarios.length,
        passed: scenarios.filter(s => s.passed).length,
        proposals: scenarios.reduce((n, s) => n + s.results.length, 0),
        committedMicroUSDC: scenarios.reduce((n, s) => n + s.intent.committed, 0),
      },
      scenarios,
      audit: { integrity, records: store.auditRecords(1000).reverse() },
      limitations: [
        'Scripted proposals do not measure whether a real model follows prompt injection.',
        'Sandbox receipts are not Solana transactions or proof of chain settlement.',
        'The local hash chain is not independently anchored; retain its head in a trusted location.',
      ],
    };
  } finally { store.close(); }
}
