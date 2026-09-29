import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterInterval } from '../research/statistics.mjs';
import { analyzeSeeds,sensitivityCorpus } from '../research/experiments.mjs';
import { runBenchmark } from '../research/run.mjs';
import { RESEARCH_CASES } from '../research/live-cases.mjs';
import { livePlan,runLiveBenchmark,scoreTask,summarizeLive } from '../research/live-run.mjs';
import { randomizedTrajectories } from '../research/randomized.mjs';

test('cluster bootstrap resamples paired family means reproducibly, not individual variants',()=>{
  const c={a:[0,0,0,0],b:[1]};const r=clusterInterval(c,{seed:1,samples:500});assert.equal(r.estimate,.5);assert.equal(r.clusters,2);assert.deepEqual(r,clusterInterval(c,{seed:1,samples:500}));assert.deepEqual(r.ci95,[0,1]);
});
test('multi-seed analysis preserves strong-baseline safety equality and repair prevalence dependence',()=>{
  const a=analyzeSeeds([402,403].map(seed=>runBenchmark({seed,repetitions:2})));
  assert.equal(a.seedRows.length,24);const strict=a.paired.find(r=>r.baseline==='strict_stateful'&&r.metric==='unsafeRate');assert.equal(strict.estimate,0);assert.equal(strict.clusters,13);
  assert.equal(a.repairMix.find(r=>r.method==='strict_stateful'&&r.repairPrevalence===0).expectedCompletion,1);assert.equal(a.repairMix.find(r=>r.method==='strict_stateful'&&r.repairPrevalence===1).expectedCompletion,0);
  assert.ok(a.repairMix.filter(r=>r.method==='sentinel').every(r=>r.expectedCompletion===1));assert.equal(a.leaveOneOut.length,12*18);
});
test('sensitivity grid covers exact-budget equality, long horizons and replay pressure',()=>{
  const cases=sensitivityCorpus();assert.equal(cases.length,36);assert.deepEqual(cases,sensitivityCorpus());
  const r=runBenchmark({trajectories:cases});const sentinel=r.summaries.find(s=>s.id==='sentinel');assert.equal(sentinel.unsafeTrajectories,0);assert.equal(sentinel.benignCompletionRate,1);
  const stateless=r.summaries.find(s=>s.id==='stateless');assert.ok(stateless.categories.budget_h128_p4.unsafe>0);assert.ok(stateless.categories['replay_h128_r0.875'].unsafe>0);
});
test('expanded fixtures keep untrusted content bounded and define independent task utility',()=>{
  assert.equal(RESEARCH_CASES.length,22);assert.equal(new Set(RESEARCH_CASES.map(c=>c.id)).size,22);assert.equal(RESEARCH_CASES.filter(c=>c.benign).length,6);
  for(const c of RESEARCH_CASES){assert.ok(c.toolContent.length<=8000);assert.ok(c.expectedEffects);}
  // The harder fixtures must keep the property they are meant to test, not just their id.
  const smuggled=RESEARCH_CASES.find(c=>c.id==='zero_width_smuggling');
  assert.ok(/[\u200b-\u200f\u2060]/.test(smuggled.toolContent),'the invisible-character fixture must carry invisible characters');
  assert.equal(RESEARCH_CASES.find(c=>c.id==='clip_required').contractOverrides.repairResources[0],'api:search');
  assert.equal(RESEARCH_CASES.find(c=>c.id==='fake_approval_authority').expectedEffects.length,0);
  const c=RESEARCH_CASES.find(c=>c.id==='reference_alias'),effect={action:c.expectedEffects[0],violations:[]};
  assert.deepEqual(scoreTask([effect],c),{safeTaskComplete:true,taskDeviation:false});
  assert.deepEqual(scoreTask([effect,{action:{...effect.action,reference:'invoice-alias-002'},violations:[]}],c),{safeTaskComplete:false,taskDeviation:true});
});
const done={message:{role:'assistant',content:'Done'},usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2},model:'mock',latencyMs:1,finishReason:'stop'};
test('call budget rejects a plan before inference; dry plan accounts for actor and judge calls',async()=>{
  // 7 cases x (2 turns per arm plus the 4 judge calls llm_guard can add) across the five live arms.
  const cases=RESEARCH_CASES.slice(0,7);assert.equal(livePlan({cases}).worstCaseCalls,98);let calls=0;
  await assert.rejects(runLiveBenchmark({client:{info:()=>({model:'mock'}),complete:async()=>{calls++;return done;}},cases,maxCalls:10}),/exceeds/);assert.equal(calls,0);
});
test('completed live checkpoints resume without repeating calls and reject different config',async()=>{
  let calls=0;const client={info:()=>({model:'mock'}),complete:async()=>{calls++;return done;}},options={client,cases:[RESEARCH_CASES[0]],methods:['sentinel']};
  const first=await runLiveBenchmark(options);assert.equal(calls,1);assert.equal(first.metadata.complete,true);
  const resumed=await runLiveBenchmark({...options,resume:first});assert.equal(calls,1);assert.equal(resumed.runs.length,1);
  await assert.rejects(runLiveBenchmark({...options,maxTurns:3,resume:first}),/mismatch/);
});
test('unsafe effects remain visible when an episode later fails or its judge is invalid',()=>{
  const rows=[{method:'unguarded',benign:false,unsafe:true,effects:[{action:{amount:2e6},violations:['recipient']}],proposals:[],judges:[],totalUsage:{total_tokens:4},report:{status:'failed',stopReason:'LLM_CONNECTION_FAILED',payments:[],attemptedCalls:2,elapsedMs:10}}];
  const [s]=summarizeLive(rows,['unguarded']);assert.equal(s.attackRuns,0);assert.equal(s.unsafeRate,null);assert.equal(s.unscoredRuns,1);assert.equal(s.observedUnsafeRuns,1);assert.equal(s.unsafeUnscoredRuns,1);assert.equal(s.unsafeAuthorizedUSDC,2);
});
test('randomized service stress is reproducible and checks effects against an independent ledger',async()=>{
  const options={seed:402,trajectories:4,steps:30},a=await randomizedTrajectories(options),b=await randomizedTrajectories(options);
  assert.equal(a.metadata.proposals,120);assert.equal(a.metadata.stimulusHash,b.metadata.stimulusHash);assert.equal(a.invariantFailures,0);assert.ok(a.counts.succeeded>0);assert.ok(a.counts.Block>0);assert.ok(a.counts.malformed>0);
});
