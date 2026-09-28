import { fork } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CRASH_PHASES = ['reserved_only', 'external_success', 'external_failure', 'finalized', 'unknown'];
function worker(config, stopAtCheckpoint = false) {
  return new Promise((resolveResult, reject) => {
    const child = fork(fileURLToPath(new URL('./crash-worker.mjs', import.meta.url)), [], {
      windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let result, killed = false, settled = false, stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    const fail = error => { if (!settled) { settled = true; clearTimeout(timer); child.kill('SIGKILL'); reject(error); } };
    const timer = setTimeout(() => fail(new Error('Crash experiment child timed out')), 15_000);
    child.on('error', fail);
    child.on('message', message => {
      result = message;
      if (stopAtCheckpoint && message.type === 'checkpoint') { killed = child.kill('SIGKILL'); }
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      if (!result || (stopAtCheckpoint ? !killed : code !== 0)) {
        settled = true; reject(new Error(`Crash child failed (${code ?? signal}): ${stderr}`)); return;
      }
      settled = true; resolveResult({ ...result, forcedKill: killed, exitCode: code, signal });
    });
    child.send(config);
  });
}

export async function runCrashes({ repetitions = 3, phases = CRASH_PHASES } = {}) {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20 || !phases.length || phases.some(p => !CRASH_PHASES.includes(p))) throw new Error('Invalid crash configuration');
  const directory = mkdtempSync(join(tmpdir(), 'sentinel-process-crash-')), rows = [];
  try {
    for (let repeat = 0; repeat < repetitions; repeat++) for (const phase of phases) {
      const stem = `${phase}-${repeat}`, db = join(directory, `${stem}.sqlite`), ledger = join(directory, `${stem}-external.sqlite`);
      const killed = await worker({ db, ledger, phase }, true);
      const start = performance.now();
      const recovered = await worker({ mode: 'recover', db, ledger, ...killed });
      const expected = phase === 'external_failure' ? 'failed' : ['reserved_only', 'unknown'].includes(phase) ? 'unknown' : 'succeeded';
      const expectedHeld = expected === 'failed' ? 0 : 1_000_000;
      const successfulExternal = recovered.externalBeforeRetry.filter(e => e.receipt.status === 'succeeded');
      const passed = recovered.status === expected && recovered.after === expectedHeld && recovered.audit.valid &&
        recovered.repeatedEffectCount === recovered.externalBeforeRetry.length && successfulExternal.length <= 1 &&
        recovered.finalState.spent <= 1_000_000 && (expected === 'failed' ? recovered.retry.status === 'succeeded' : recovered.retry.status === 'not_executed');
      rows.push({ phase, repeat, forcedKill: killed.forcedKill, passed, status: recovered.status,
        heldBeforeUSDC: recovered.before / 1e6, heldAfterUSDC: recovered.after / 1e6,
        restartAndRecoveryMs: performance.now() - start, reconciliationMs: recovered.recoveryMs,
        unresolvedReservation: recovered.status === 'unknown', releasedUSDC: (recovered.before - recovered.after) / 1e6,
        externalSuccessfulPayments: successfulExternal.length, retryStatus: recovered.retry.status, auditValid: recovered.audit.valid });
    }
    return { metadata: { suite: 'sentinel-forced-process-crash-v1', generatedAt: new Date().toISOString(), node: process.version,
      repetitions, cases: rows.length, paymentMode: 'independent durable fixture ledger',
      limitation: 'SIGKILL/TerminateProcess at acknowledged phase boundaries; not power loss, disk failure, or a blockchain. Unknown/no receipt retains funds indefinitely; no automatic safe-release claim.' },
      invariantFailures: rows.filter(r => !r.passed).length, unresolvedCases: rows.filter(r => r.unresolvedReservation).length, rows };
  } finally {
    const target = resolve(directory);
    if (!target.startsWith(resolve(tmpdir()) + sep) || !target.split(sep).at(-1).startsWith('sentinel-process-crash-')) throw new Error('Unsafe cleanup target');
    rmSync(target, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  const report = await runCrashes({ repetitions: Number(option('--repetitions', 3)) });
  const out = resolve(option('--out', 'artifacts/realism/crashes')); mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'summary.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(out, 'results.md'), `# Forced process crash experiment\n\n${report.metadata.limitation}\n\n${report.rows.length} cases; ${report.invariantFailures} invariant failures; ${report.unresolvedCases} unresolved reservations.\n\n| Phase | Repeat | Result | Retained USDC | Restart + reconciliation ms |\n|---|---:|---|---:|---:|\n` + report.rows.map(r => `| ${r.phase} | ${r.repeat} | ${r.status} | ${r.heldAfterUSDC} | ${r.restartAndRecoveryMs.toFixed(2)} |`).join('\n') + '\n');
  console.log(JSON.stringify({ cases: report.rows.length, failures: report.invariantFailures, unresolved: report.unresolvedCases, out }));
  if (report.invariantFailures) process.exitCode = 1;
}
