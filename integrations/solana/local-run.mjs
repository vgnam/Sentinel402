import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { localEndpoint } from '../../src/solana-network.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--repetitions', '--rpc'].includes(args[i]) || !args[i + 1] || Object.hasOwn(options, args[i])) throw new Error('Use --repetitions N and optional --rpc http://127.0.0.1:PORT');
  options[args[i]] = args[i + 1];
}
const repetitions = Number(options['--repetitions'] ?? 3), endpoint = localEndpoint(options['--rpc']);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new Error('Repetitions must be 1–100');
const batchId = `batch-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const out = resolve(root, 'artifacts/realism/local', batchId); mkdirSync(out, { recursive: true });
const report = { batchId, generatedAt: new Date().toISOString(), rpc: endpoint, requestedRuns: repetitions, runs: [],
  paymentMode: 'solana-local', warning: 'Independent test wallets/mints on a private local ledger. No public faucet or live model calls. Not public devnet settlement evidence.' };
let activeChild, interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; activeChild?.kill(signal); });
for (let index = 1; index <= repetitions && !interrupted; index++) {
  const runId = `${batchId}-${index}`;
  console.log(`Local trial ${index}/${repetitions}: ${runId}`);
  const exitCode = await new Promise(resolveCode => {
    activeChild = spawn(process.execPath, [resolve(root, 'integrations/solana/demo.mjs'), '--local', '--rpc', endpoint, '--run-id', runId],
      { cwd: root, stdio: 'inherit', windowsHide: true });
    activeChild.on('error', () => resolveCode(1)); activeChild.on('close', code => resolveCode(code ?? 1));
  });
  activeChild = null;
  let result;
  try { result = JSON.parse(readFileSync(resolve(root, 'artifacts/realism/local', runId, 'summary.json'), 'utf8')); }
  catch { result = { status: 'incomplete', reason: 'MISSING_CHILD_REPORT' }; }
  report.runs.push({ runId, exitCode, status: result.status, reason: result.reason ?? null, genesis: result.genesis,
    transactionCount: result.transactions?.length ?? 0, committedTestTokens: result.committedTestTokens ?? 0,
    evidence: `../${runId}/summary.json` });
  report.completedRuns = report.runs.length; report.passedRuns = report.runs.filter(r => r.exitCode === 0 && r.status === 'passed').length;
  report.status = report.passedRuns === repetitions ? 'passed' : 'incomplete';
  writeFileSync(resolve(out, 'summary.json'), JSON.stringify(report, null, 2));
  if (exitCode !== 0 || result.status !== 'passed') break; // Do not hammer an unavailable validator.
}
console.log(`Batch ${report.status ?? 'interrupted'}; ${report.passedRuns ?? 0}/${repetitions} passed. Report: ${out}`);
if (report.status !== 'passed' || interrupted) process.exitCode = 1;
