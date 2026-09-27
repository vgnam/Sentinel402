import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runWalkthrough } from '../src/walkthrough.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out' || !args[1])) {
  throw new Error('Usage: npm run demo:judge -- [--out directory]');
}
const report = await runWalkthrough();
const out = resolve(args[1] ?? 'artifacts/demo');
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(resolve(out, 'results.md'), [
  '# Sentinel402 demo evidence', '',
  `Generated: ${report.generatedAt}. Result: ${report.passed ? 'PASS' : 'FAIL'}.`, '',
  report.scope, '', `Inference: ${report.inference}.`, '',
  '| Scenario | Result | Committed sandbox USDC |', '|---|---|---:|',
  ...report.scenarios.map(s => `| ${s.scenario.name} | ${s.passed ? 'PASS' : 'FAIL'} | ${(s.intent.committed / 1e6).toFixed(2)} |`), '',
  `Audit: ${report.audit.integrity.count} records; valid: ${report.audit.integrity.valid}.`,
  `Head: \`${report.audit.integrity.head}\`.`, '',
  ...report.limitations.map(s => `- ${s}`), '',
].join('\n'));
console.table(report.scenarios.map(s => ({ scenario: s.scenario.name, passed: s.passed, committedUSDC: s.intent.committed / 1e6 })));
console.log(`Saved synthetic demo evidence to ${out}`);
if (!report.passed) process.exitCode = 1;
