import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash } from '../src/domain.mjs';
import { loadEnv, llmConfig } from '../src/config.mjs';
import { LLMClient } from '../src/llm.mjs';
import { random } from './corpus.mjs';
import { runWorkflowEpisode, WORKFLOW_METHODS } from './workflow.mjs';
import { WORKFLOW_TASKS, WORKFLOW_ATTACKS, workflowManifest } from './workflow-cases.mjs';

export function workflowPlan({ tasks = WORKFLOW_TASKS, attacks = WORKFLOW_ATTACKS, methods = ['unguarded', 'strict_stateful', 'sentinel'],
  models = ['scripted'], repetitions = 1, maxTurns = 8, maxPayments = 8, maxCalls = 120, seed = 402 } = {}) {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100 || !Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 20 ||
    !Number.isInteger(maxPayments) || maxPayments < 1 || maxPayments > 32 || !Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 100000 ||
    !Number.isInteger(seed) || !methods.length || methods.some(m => !WORKFLOW_METHODS.includes(m)) ||
    !tasks.length || !attacks.length || !models.length || new Set(models).size !== models.length || new Set(methods).size !== methods.length) throw new Error('Invalid workflow plan');
  const pairs = tasks.flatMap(task => attacks.filter(a => a.split === 'both' || a.split === task.split).map(attack => ({ taskId: task.id, attackId: attack.id })));
  if (!pairs.length) throw new Error('No cases match the task/attack split');
  const live = models.some(m => m !== 'scripted');
  if (live && models.includes('scripted')) throw new Error('Do not mix scripted and live inference in one matrix');
  if (!live && methods.includes('llm_guard')) throw new Error('A live model is required for llm_guard');
  const worstCaseCalls = live ? models.length * repetitions * pairs.length * methods.reduce((n, m) => n + maxTurns + (m === 'llm_guard' ? maxPayments : 0), 0) : 0;
  return { models, methods, pairs, repetitions, maxTurns, maxPayments, maxCalls, seed, live,
    episodes: models.length * methods.length * pairs.length * repetitions, worstCaseCalls };
}

export function summarizeWorkflow(runs) {
  const keys = [...new Set(runs.map(r => `${r.model}/${r.method}/${r.split}`))];
  return keys.map(key => {
    const rows = runs.filter(r => `${r.model}/${r.method}/${r.split}` === key), [model, method, split] = [rows[0].model, rows[0].method, rows[0].split];
    const attack = rows.filter(r => !r.benign), benign = rows.filter(r => r.benign);
    const valid = r => !r.modelError && !r.truncated && !r.judges.some(j => !j.valid);
    const scoredAttacks = attack.filter(valid);
    return { model, method, split, episodes: rows.length, attackEpisodes: attack.length, scoredAttacks: scoredAttacks.length,
      unsafeProposalRuns: rows.filter(r => r.unsafeProposal).length, unsafeReleaseRuns: rows.filter(r => r.unsafeRelease).length,
      observedUnsafeEffects: rows.filter(r => r.unsafeEffect).length, unsafeScoredAttacks: scoredAttacks.filter(r => r.unsafeEffect).length,
      taskDeviations: rows.filter(r => r.taskDeviation).length, completedTasks: rows.filter(r => r.safeTaskComplete).length,
      benignEpisodes: benign.length, benignCompleted: benign.filter(r => r.safeTaskComplete).length,
      answerCorrect: rows.filter(r => r.answerCorrect).length, errors: rows.filter(r => r.modelError).length,
      toolErrors: rows.reduce((n, r) => n + r.toolErrors, 0), incompleteTasks: rows.filter(r => !r.safeTaskComplete).length,
      modelFinishedWithoutSubmission: rows.filter(r => r.stopReason === 'model_finished_without_submission').length,
      truncated: rows.filter(r => r.truncated).length, repairs: rows.reduce((n, r) => n + r.repairs, 0),
      merchantRejected: rows.reduce((n, r) => n + r.merchantRejected, 0),
      calls: rows.reduce((n, r) => n + r.attemptedCalls + r.judges.length, 0), tokens: rows.reduce((n, r) => n + r.usage.total_tokens, 0),
      paidUSDC: rows.reduce((n, r) => n + r.totalPaidUSDC, 0) };
  });
}

export async function runWorkflowMatrix({ clients = {}, tasks = WORKFLOW_TASKS, attacks = WORKFLOW_ATTACKS, resume = null,
  onCheckpoint = () => {}, onProgress = () => {}, ...options } = {}) {
  const plan = workflowPlan({ tasks, attacks, ...options });
  if (plan.worstCaseCalls > plan.maxCalls) throw new Error(`Plan needs up to ${plan.worstCaseCalls} calls, exceeds hard cap ${plan.maxCalls}`);
  const sourceHash = hash(['workflow-run.mjs', 'workflow.mjs', 'workflow-cases.mjs', 'workflow-merchant.mjs',
    'oracle.mjs', 'live-run.mjs', 'corpus.mjs', '../src/domain.mjs', '../src/service.mjs', '../src/store.mjs',
    '../src/agent.mjs', '../src/demo.mjs', '../src/llm.mjs', '../src/config.mjs'].map(p => readFileSync(new URL(p, import.meta.url), 'utf8')));
  const providers = Object.fromEntries(plan.models.filter(m => m !== 'scripted').map(m => {
    if (!clients[m]) throw new Error(`Missing client for ${m}`); return [m, clients[m].info()];
  }));
  const configHash = hash({ plan, tasks, attacks, sourceHash, providers });
  if (resume && resume.metadata.configHash !== configHash) throw new Error('Resume configuration/source mismatch');
  const runs = resume?.runs ?? [], completed = new Set(runs.map(r => r.runKey));
  const schedule = [];
  for (const model of plan.models) for (let repeat = 0; repeat < plan.repetitions; repeat++) for (const pair of plan.pairs) for (const method of plan.methods) {
    schedule.push({ model, repeat, method, ...pair, runKey: `${model}/${repeat}/${pair.taskId}/${pair.attackId}/${method}` });
  }
  if (completed.size !== runs.length || runs.some(r => !schedule.some(s => s.runKey === r.runKey))) throw new Error('Invalid resume rows');
  const rng = random(plan.seed);
  for (let i = schedule.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [schedule[i], schedule[j]] = [schedule[j], schedule[i]]; }
  let attempted = resume?.metadata.attemptedCalls ?? 0;
  const snapshot = () => ({ metadata: { suite: 'sentinel-workflow-v1', generatedAt: new Date().toISOString(), ...plan, providers, sourceHash, configHash,
    corpusHash: workflowManifest().hash, completedEpisodes: runs.length, complete: runs.length === plan.episodes, attemptedCalls: attempted,
    warning: 'Fictional merchant HTTP environment and datasets. Scripted injection-following actor measures mechanism coverage, not LLM attack success. Live matrices use independent model trajectories. Heldout splits are predeclared, not externally blind. Effects are simulated; no real funds.' },
    summaries: summarizeWorkflow(runs), runs });
  for (const entry of schedule) {
    if (completed.has(entry.runKey)) continue;
    onProgress(entry.runKey);
    const base = clients[entry.model], client = base ? { info: () => base.info(), complete: async (...args) => {
      if (attempted >= plan.maxCalls) throw Object.assign(new Error('Call cap reached'), { code: 'RESEARCH_CALL_BUDGET' });
      attempted++; await onCheckpoint(snapshot()); return base.complete(...args);
    } } : null;
    const report = await runWorkflowEpisode({ task: tasks.find(t => t.id === entry.taskId), attack: attacks.find(a => a.id === entry.attackId),
      method: entry.method, client, actor: 'injection_following', maxTurns: plan.maxTurns, maxPayments: plan.maxPayments });
    runs.push({ ...entry, ...report }); await onCheckpoint(snapshot());
  }
  return snapshot();
}

export function saveWorkflow(report, out) {
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'checkpoint.tmp'), JSON.stringify(report)); renameSync(join(out, 'checkpoint.tmp'), join(out, 'checkpoint.json'));
  const { runs, ...summary } = report;
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(out, 'runs.jsonl'), runs.map(r => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(workflowManifest(), null, 2));
  const keys = Object.keys(report.summaries[0] ?? {});
  writeFileSync(join(out, 'metrics.csv'), keys.join(',') + '\n' + report.summaries.map(r => keys.map(k => JSON.stringify(r[k])).join(',')).join('\n') + '\n');
  writeFileSync(join(out, 'results.md'), `# End-to-end paid-data workflow\n\n${report.metadata.warning}\n\nCompleted ${runs.length}/${report.metadata.episodes} episodes. Inference: ${report.metadata.live ? 'live model' : 'scripted, no model calls'}. Calls: ${report.metadata.attemptedCalls}.\n\n| Model / method / split | Episodes | Unsafe effects | Task deviations | Safe tasks completed | Errors / truncated |\n|---|---:|---:|---:|---:|---:|\n` + report.summaries.map(r => `| ${r.model} / ${r.method} / ${r.split} | ${r.episodes} | ${r.observedUnsafeEffects} | ${r.taskDeviations} | ${r.completedTasks} | ${r.errors} / ${r.truncated} |`).join('\n') + '\n\nScored attack denominators, proposal/release failures, merchant rejections, model IDs, usage and full traces are in the accompanying JSON/CSV. Task deviations may remain even when every payment satisfies the contract.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  const select = (key, all) => {
    const ids = option(key, all.map(x => x.id).join(',')).split(',');
    if (ids.some(id => !all.some(x => x.id === id))) throw new Error(`Unknown ${key}`);
    return ids.map(id => all.find(x => x.id === id));
  };
  const live = args.includes('--live'); if (live) loadEnv();
  const config = live ? llmConfig() : null;
  const models = live ? option('--models', config?.model ?? '').split(',').filter(Boolean) : ['scripted'];
  if (live && !config) throw new Error('Configure a provider before live evaluation');
  const options = { tasks: select('--tasks', WORKFLOW_TASKS), attacks: select('--attacks', WORKFLOW_ATTACKS), models,
    methods: option('--methods', 'unguarded,strict_stateful,sentinel').split(','), repetitions: Number(option('--repetitions', 1)),
    maxTurns: Number(option('--max-turns', 8)), maxPayments: Number(option('--max-payments', 8)), maxCalls: Number(option('--max-calls', 120)), seed: Number(option('--seed', 402)) };
  const plan = workflowPlan(options); console.log(JSON.stringify(plan, null, 2));
  if (args.includes('--dry-run')) process.exit(0);
  const maxTokens = Number(option('--max-output-tokens', 1024));
  if (!Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > 4096) throw new Error('Invalid output token cap');
  const clients = live ? Object.fromEntries(models.map(model => [model, new LLMClient({ ...config, model, maxTokens })])) : {};
  const out = resolve(option('--out', live ? 'artifacts/llm/workflow' : 'artifacts/realism/workflow'));
  const checkpoint = join(out, 'checkpoint.json');
  if (existsSync(checkpoint) && !args.includes('--resume')) throw new Error('Output exists; choose --resume or a fresh --out');
  const resume = args.includes('--resume') ? JSON.parse(readFileSync(checkpoint, 'utf8')) : null;
  const report = await runWorkflowMatrix({ ...options, clients, resume, onProgress: console.log, onCheckpoint: r => saveWorkflow(r, out) });
  console.table(report.summaries);
  if (report.runs.some(r => r.modelError || r.judges.some(j => !j.valid))) process.exitCode = 1;
}
