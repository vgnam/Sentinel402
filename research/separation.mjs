// Separation suite: finds the axes on which Sentinel differs from the strong stateful baseline.
//
// The baseline in research/baselines.mjs is a *pure decision function* over state handed to it by
// the caller. That makes it structurally unable to survive a process restart, and, because it runs
// with repair disabled, unable to deliver a clipped amount. Both differences are invisible to a
// single-process, single-shot comparison, which is why the existing suites reported a tie.
//
// This suite runs every arm twice - before and after a restart - against the same scenarios, with an
// independent oracle (research/oracle.mjs) scoring the effects that actually happened, and with the
// merchant ledger as ground truth for what was really paid.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.mjs';
import { Sentinel } from '../src/service.mjs';
import { SandboxAdapter } from '../src/adapter.mjs';
import { demoContract } from '../src/demo.mjs';
import { emptyState, evaluate, fingerprint, invoiceKey, proposal } from '../src/domain.mjs';
import { violations } from './oracle.mjs';

export const SEPARATION_ARMS = ['unguarded', 'strict_stateful_memory', 'strict_stateful_durable', 'sentinel'];

/** In-process monitor: same policy as the strong baseline, state kept in RAM only. */
class MemoryMonitor {
  constructor() { this.accepted = []; }
  state() {
    const s = emptyState();
    for (const { action, time } of this.accepted) {
      s.spent += action.executableAmount; s.count++;
      s.fingerprints.push(fingerprint(action.proposed)); s.invoices.push(invoiceKey(action.proposed));
      s.history.push({ recipient: action.proposed.recipient, resource: action.proposed.resource, time });
    }
    return s;
  }
  record(proposed, executableAmount, time) { this.accepted.push({ action: { proposed, executableAmount }, time }); }
}

/** Durable monitor: identical policy, but the counters live in its own SQLite file so they survive
 *  a restart. This is the fair "persistent hard-reject" comparison, not a handicapped baseline. */
class DurableMonitor {
  constructor(path) {
    this.path = path;
    this.db = new DatabaseSync(path);
    this.db.exec('CREATE TABLE IF NOT EXISTS accepted(id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, executable_amount INTEGER NOT NULL, created_at INTEGER NOT NULL)');
  }
  state() {
    const s = emptyState();
    for (const row of this.db.prepare('SELECT * FROM accepted ORDER BY id').all()) {
      const proposed = JSON.parse(row.action);
      s.spent += row.executable_amount; s.count++;
      s.fingerprints.push(fingerprint(proposed)); s.invoices.push(invoiceKey(proposed));
      s.history.push({ recipient: proposed.recipient, resource: proposed.resource, time: row.created_at });
    }
    return s;
  }
  record(proposed, executableAmount, time) {
    this.db.prepare('INSERT INTO accepted(action,executable_amount,created_at) VALUES(?,?,?)').run(JSON.stringify(proposed), executableAmount, time);
  }
  close() { this.db.close(); }
  reopen() { this.close(); this.db = new DatabaseSync(this.path); }
}

/** Scenarios are fixed proposal streams. `probe` runs after the restart, so it is the only place
 *  where a monitor that forgot its own state can be observed to authorize something it already
 *  authorized or could not afford. */
export const SEPARATION_SCENARIOS = [
  { id: 'replay_after_restart', contractOverrides: {}, pre: [{ reference: 'inv-a', amount: '2.00' }], probe: [{ reference: 'inv-a', amount: '2.00' }], restart: true },
  { id: 'budget_after_restart', contractOverrides: {}, pre: [1, 2, 3, 4].map(i => ({ reference: `inv-b${i}`, amount: '2.00' })), probe: [{ reference: 'inv-b9', amount: '5.00' }], restart: true },
  { id: 'count_after_restart', contractOverrides: { maxTransactions: 3 }, pre: [1, 2, 3].map(i => ({ reference: `inv-c${i}`, amount: '2.00' })), probe: [{ reference: 'inv-c9', amount: '2.00' }], restart: true },
  { id: 'clip_requires_repair', contractOverrides: { repairResources: ['api:search'] }, pre: [], probe: [{ reference: 'clip-001', amount: '6.00' }], restart: false, clippedAmount: 5e6 },
];

export async function runSeparation({ repetitions = 3, arms = SEPARATION_ARMS, scenarios = SEPARATION_SCENARIOS } = {}) {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 50) throw new Error('Invalid separation configuration');
  if (arms.some(a => !SEPARATION_ARMS.includes(a)) || !arms.length) throw new Error('Unknown separation arm');
  if (!scenarios.length || scenarios.some(s => !s.id || !Array.isArray(s.pre) || !Array.isArray(s.probe))) throw new Error('Invalid separation scenario');
  const directory = mkdtempSync(join(tmpdir(), 'sentinel-separation-')), rows = [];
  try {
    for (let repeat = 0; repeat < repetitions; repeat++) for (const arm of arms) for (const scenario of scenarios) {
      const stem = `${arm}-${scenario.id}-${repeat}`, dbPath = join(directory, `${stem}.sqlite`);
      const monitorPath = join(directory, `${stem}-monitor.sqlite`);
      let store = new Store(dbPath), adapter = new SandboxAdapter(store, { delayMs: 0 }), service = new Sentinel(store, adapter);
      let monitor = arm === 'strict_stateful_memory' ? new MemoryMonitor() : arm === 'strict_stateful_durable' ? new DurableMonitor(monitorPath) : null;
      const now = Date.now();
      const { contract } = service.createIntent(demoContract(now, scenario.contractOverrides));
      const ledger = [], effects = [], decisions = [], preRestartDecisions = [];

      const decide = async ({ reference, amount }) => {
        const proposed = proposal({ intentId: contract.id, amount, recipient: 'merchant:search', resource: 'api:search', reference });
        const time = Date.now();
        if (arm === 'unguarded') {
          await adapter.pay(proposed, `ext_${randomUUID()}`);
          return { decision: 'Allow', executable: proposed, status: 'succeeded', reasons: ['BASELINE_ALLOW'] };
        }
        if (arm === 'sentinel') return service.execute({ ...proposed, amount }, contract.id);
        const state = monitor.state();
        const result = evaluate(proposed, contract, state, time, { repair: false });
        if (!result.executable) return { ...result, status: 'not_executed' };
        monitor.record(proposed, result.executable.amount, time);
        const receipt = await adapter.pay(result.executable, `ext_${randomUUID()}`);
        return { ...result, status: receipt.status, receipt };
      };

      const apply = async stream => {
        for (const item of stream) {
          const result = await decide(item);
          decisions.push({ reference: item.reference, requested: Number(item.amount) * 1e6, decision: result.decision, status: result.status, executable: result.executable?.amount ?? null });
          if (result.executable) {
            const time = Date.now(), found = violations(result.executable, contract, ledger, time);
            effects.push({ action: result.executable, time, violations: found });
            ledger.push({ action: result.executable, time, outcome: result.status === 'failed' ? 'failed' : 'succeeded' });
          }
        }
      };

      await apply(scenario.pre);
      const afterPre = decisions.slice();
      const externalBeforeRestart = store.db.prepare('SELECT COUNT(*) AS n FROM sandbox_ledger').get().n;
      if (scenario.restart) {
        if (arm === 'sentinel') { store.close(); store = new Store(dbPath); adapter = new SandboxAdapter(store, { delayMs: 0 }); service = new Sentinel(store, adapter); }
        else if (arm === 'strict_stateful_memory') monitor = new MemoryMonitor();
        else if (arm === 'strict_stateful_durable') monitor.reopen();
      }
      const probeStart = decisions.length;
      await apply(scenario.probe);
      const probe = decisions.slice(probeStart);
      const externalPayments = store.db.prepare('SELECT COUNT(*) AS n FROM sandbox_ledger').get().n;
      const unauthorized = effects.filter(e => e.violations.length);
      const expectedPayments = scenario.pre.length + (scenario.clippedAmount ? 1 : 0);
      const clipped = scenario.clippedAmount ? effects.find(e => e.action.amount === scenario.clippedAmount) : null;
      const audit = store.verifyAudit();
      rows.push({
        arm, scenario: scenario.id, repeat,
        preDecisions: afterPre.map(d => `${d.decision}${d.executable ? `@${d.executable / 1e6}` : ''}`),
        probeDecisions: probe.map(d => `${d.decision}${d.executable ? `@${d.executable / 1e6}` : ''}`),
        probeAuthorized: probe.some(d => d.executable !== null),
        restart: Boolean(scenario.restart),
        externalPayments, expectedPayments, duplicateExternalPayments: Math.max(0, externalPayments - expectedPayments),
        unauthorizedPayments: unauthorized.length, unauthorizedUSDC: unauthorized.reduce((n, e) => n + e.action.amount, 0) / 1e6,
        violations: [...new Set(unauthorized.flatMap(e => e.violations))],
        paidUSDC: effects.reduce((n, e) => n + e.action.amount, 0) / 1e6,
        safeCompletion: scenario.clippedAmount ? Boolean(clipped) && unauthorized.length === 0 : effects.length === expectedPayments && unauthorized.length === 0,
        auditValid: audit.valid,
      });
      if (arm === 'strict_stateful_durable' || arm === 'strict_stateful_memory') monitor.close?.();
      store.close();
    }
    return { metadata: { suite: 'sentinel-stateful-separation-v1', generatedAt: new Date().toISOString(), node: process.version, repetitions, arms, scenarios: scenarios.map(s => s.id), cases: rows.length,
      limitation: 'Scripted proposal streams against sandbox adapters on a local SQLite file. "Restart" closes and reopens the store and clears in-process state; it is not a power loss, a second host or a blockchain. The strong baseline is an in-process monitor by construction, and a durable hard-reject monitor is included as the fair comparison. Not a statement about third-party implementations.' }, rows };
  } finally {
    const target = resolve(directory);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1).startsWith('sentinel-separation-')) throw new Error('Unsafe cleanup target');
    rmSync(target, { recursive: true, force: true });
  }
}

export function summarizeSeparation(report) {
  const byArm = {};
  for (const arm of [...new Set(report.rows.map(r => r.arm))]) {
    const rows = report.rows.filter(r => r.arm === arm);
    const memoryRows = rows.filter(r => r.restart);
    byArm[arm] = {
      cases: rows.length,
      unauthorizedPayments: rows.reduce((n, r) => n + r.unauthorizedPayments, 0),
      unauthorizedUSDC: Number(rows.reduce((n, r) => n + r.unauthorizedUSDC, 0).toFixed(2)),
      duplicateExternalPayments: rows.reduce((n, r) => n + r.duplicateExternalPayments, 0),
      probesAuthorizedAfterRestart: memoryRows.filter(r => r.probeAuthorized).length,
      probesBlockedAfterRestart: memoryRows.filter(r => !r.probeAuthorized).length,
      safeCompletions: rows.filter(r => r.safeCompletion).length,
      clipDelivered: rows.filter(r => r.scenario === 'clip_requires_repair' && r.paidUSDC === 5).length,
      clipUnsafe: rows.filter(r => r.scenario === 'clip_requires_repair' && r.unauthorizedPayments > 0).length,
      auditValid: rows.every(r => r.auditValid),
    };
  }
  // Fairness control: before the restart, the in-process and durable monitors must decide identically.
  const parity = report.rows.filter(r => r.arm === 'strict_stateful_memory').every(r => {
    const twin = report.rows.find(x => x.arm === 'strict_stateful_durable' && x.scenario === r.scenario && x.repeat === r.repeat);
    return twin && JSON.stringify(twin.preDecisions) === JSON.stringify(r.preDecisions);
  });
  return { byArm, preRestartParity: parity };
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1]).replace(/\\/g, '/')}`).href) {
  const args = process.argv.slice(2), option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  const report = await runSeparation({ repetitions: Number(option('--repetitions', 3)) });
  const summary = summarizeSeparation(report);
  const out = resolve(option('--out', join('artifacts/realism/separation', new Date().toISOString().replace(/[:.]/g, '-'))));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'summary.json'), JSON.stringify({ ...report, summary }, null, 2));
  const table = Object.entries(summary.byArm).map(([arm, s]) => `| ${arm} | ${s.unauthorizedPayments} | ${s.unauthorizedUSDC} | ${s.duplicateExternalPayments} | ${s.probesAuthorizedAfterRestart} | ${s.clipDelivered} | ${s.auditValid} |`);
  writeFileSync(join(out, 'results.md'), `# Stateful separation suite\n\n${report.metadata.limitation}\n\n${report.metadata.cases} cases; pre-restart parity between the in-process and durable monitors: ${summary.preRestartParity}.\n\n| Arm | Unauthorized payments | Unauthorized USDC | Duplicate external payments | Probes authorized after restart | Clipped delivery | Audit valid |\n|---|---:|---:|---:|---:|---:|---|\n${table.join('\n')}\n`);
  console.table(Object.entries(summary.byArm).map(([arm, s]) => ({ arm, unauthorized: s.unauthorizedPayments, unauthorizedUSDC: s.unauthorizedUSDC, duplicates: s.duplicateExternalPayments, authorizedAfterRestart: s.probesAuthorizedAfterRestart, clipDelivered: s.clipDelivered, auditValid: s.auditValid })));
  console.log(`Separation results saved to ${out} (pre-restart parity: ${summary.preRestartParity}).`);
  const sentinel = summary.byArm.sentinel;
  if (!summary.preRestartParity || sentinel.unauthorizedPayments || sentinel.duplicateExternalPayments || sentinel.probesAuthorizedAfterRestart || sentinel.clipDelivered !== report.metadata.repetitions || !sentinel.auditValid) process.exitCode = 1;
}
