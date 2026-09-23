import test from 'node:test';
import assert from 'node:assert/strict';
import { runBenchmark, wilson } from '../research/run.mjs';
import { corpus } from '../research/corpus.mjs';
import { violations } from '../research/oracle.mjs';
import { hash } from '../src/domain.mjs';

test('seeded corpus is reproducible and changes with seed',()=>{assert.equal(hash(corpus(402,3)),hash(corpus(402,3)));assert.notEqual(hash(corpus(402,3)),hash(corpus(403,3)));assert.equal(new Set(corpus(402,3).map(t=>t.category)).size,18);});
test('independent oracle flags a mutated invoice and cumulative overspend',()=>{
  const cases=corpus(402,1),t=cases.find(t=>t.category==='mutated_invoice_replay'),s=t.steps;
  assert.ok(violations(s[1].action,t.contract,[{...s[0]}],s[1].time).includes('replay'));
  const b=cases.find(t=>t.category==='budget_splitting');
  assert.ok(violations(b.steps[2].action,b.contract,b.steps.slice(0,2),b.steps[2].time).includes('budget'));
});
test('benchmark exposes weak baselines, distinguishes strict repair utility, and records denominators',()=>{
  const r=runBenchmark({seed:402,repetitions:3}),byId=Object.fromEntries(r.summaries.map(s=>[s.id,s]));
  assert.equal(r.metadata.trajectoryCount,54);assert.equal(r.metadata.methodCount,12);assert.equal(byId.sentinel.attackSuccessRate,0);assert.equal(byId.sentinel.benignCompletionRate,1);
  assert.equal(byId.strict_stateful.attackSuccessRate,0);assert.ok(byId.strict_stateful.benignCompletionRate<1);
  for(const method of ['unguarded','per_tx_cap','allowlist','stateless','budget_ledger','no_budget','no_count','no_replay','no_binding','no_frequency'])assert.ok(byId[method].attackSuccessRate>0,method);
  assert.equal(byId.sentinel.attackTrajectories,39);assert.equal(byId.sentinel.benignTrajectories,15);assert.ok(byId.sentinel.attackSuccessCI95[1]>0);assert.ok(r.rows.every(row=>typeof row.unsafe==='boolean'));
  assert.equal(byId.unguarded.falseRejectionRate,0); // Unsafe allows are not rejections.
});
test('zero observed attacks has a nonzero confidence upper bound',()=>{const [lo,hi]=wilson(0,100);assert.equal(lo,0);assert.ok(hi>.03&&hi<.04);});
