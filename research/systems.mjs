import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Sentinel } from '../src/service.mjs';
import { SandboxAdapter } from '../src/adapter.mjs';
import { demoContract } from '../src/demo.mjs';

const temp=mkdtempSync(join(tmpdir(),'sentinel-systems-'));
const rows=[];
const make=(label,adapterOptions={})=>{
  const path=join(temp,`${label}.sqlite`),store=new Store(path),adapter=new SandboxAdapter(store,{delayMs:5,...adapterOptions});
  const service=new Sentinel(store,adapter),{contract}=service.createIntent(demoContract(Date.now(),{budget:'5',perTransaction:'1'}));
  const action=i=>({intentId:contract.id,amount:'1',recipient:'merchant:search',resource:'api:search',reference:`invoice-${i}`});
  return {path,store,adapter,service,contract,action};
};
try {
  // Deliberate counterexample: all tasks read spend before any update. This is
  // an in-memory non-atomic model, not a third-party implementation benchmark.
  let spent=0;
  const unsafe=await Promise.all(Array.from({length:40},async()=>{
    const permitted=spent+1<=5;
    await new Promise(r=>setTimeout(r,5));
    if(permitted)spent++;
    return permitted;
  }));
  rows.push({test:'Non-atomic snapshot counterexample',kind:'illustrative unsafe model',requests:40,released:unsafe.filter(Boolean).length,encumberedUSDC:spent,budgetUSDC:5,overshootUSDC:Math.max(0,spent-5)});
  assert.equal(spent,40);

  const f=make('concurrent');
  try {
    const latencies=[],start=performance.now();
    const results=await Promise.all(Array.from({length:40},async(_,i)=>{const before=performance.now(),r=await f.service.execute(f.action(i),f.contract.id);latencies.push(performance.now()-before);return r;}));
    const state=f.store.state(f.contract.id),elapsed=performance.now()-start;
    assert.equal(state.spent,5e6);assert.equal(results.filter(r=>r.status==='succeeded').length,5);assert.equal(f.store.verifyAudit().valid,true);
    rows.push({test:'SQLite atomic reservations',kind:'actual service; single process, concurrent requests',requests:40,released:5,encumberedUSDC:state.spent/1e6,budgetUSDC:5,overshootUSDC:0,elapsedMs:elapsed,p95RequestMs:latencies.sort((a,b)=>a-b)[37],adapterDelayMs:5});
  }finally{f.store.close();}

  const failed=make('failed',{outcome:'failed'});
  try {
    const result=await failed.service.execute(failed.action(1),failed.contract.id);
    assert.equal(result.status,'failed');assert.equal(failed.store.state(failed.contract.id).spent,0);
    rows.push({test:'Confirmed adapter failure',kind:'actual service',status:result.status,encumberedUSDC:0});
  }finally{failed.store.close();}

  const uncertain=make('uncertain',{outcome:'unknown'});
  try {
    const result=await uncertain.service.execute(uncertain.action(1),uncertain.contract.id);
    const reconciled=await uncertain.service.reconcile(result.transactionId);
    assert.equal(reconciled.status,'unknown');assert.equal(uncertain.store.state(uncertain.contract.id).spent,1e6);
    rows.push({test:'Unknown result and missing receipt',kind:'actual service',status:reconciled.status,encumberedUSDC:1});
  }finally{uncertain.store.close();}

  const late=make('late',{delayMs:40});late.service.paymentTimeoutMs=5;
  try {
    const result=await late.service.execute(late.action(1),late.contract.id);assert.equal(result.status,'unknown');
    await new Promise(r=>setTimeout(r,60));const reconciled=await late.service.reconcile(result.transactionId);
    assert.equal(reconciled.status,'succeeded');assert.equal(late.store.state(late.contract.id).spent,1e6);
    rows.push({test:'Late success after lost response',kind:'actual service',initialStatus:result.status,status:reconciled.status,encumberedUSDC:1});
  }finally{late.store.close();}

  const restart=make('restart');restart.service.reserve(restart.action(1),restart.contract.id);restart.store.close();
  const reopened=new Store(restart.path);
  try {
    assert.equal(reopened.state(restart.contract.id).spent,1e6);assert.equal(reopened.transactions()[0].status,'reserved');
    rows.push({test:'Restart after reservation, before submission',kind:'actual persistent store',status:'reserved',encumberedUSDC:1});
  }finally{reopened.close();}
  const out=resolve('artifacts/systems');mkdirSync(out,{recursive:true});
  const report={metadata:{generatedAt:new Date().toISOString(),node:process.version,platform:platform(),warning:'Sandbox fault/concurrency checks. The non-atomic row is an intentionally unsafe in-memory counterexample; timings are not a fair latency comparison with SQLite. Cross-connection worker contention is additionally tested by npm test.'},rows};
  writeFileSync(join(out,'summary.json'),JSON.stringify(report,null,2));
  writeFileSync(join(out,'results.md'),'# Systems experiments\n\n'+report.metadata.warning+'\n\n| Experiment | Outcome | Encumbered USDC | Overshoot USDC |\n|---|---|---:|---:|\n'+rows.map(r=>`| ${r.test} | ${r.status??`${r.released}/${r.requests} released`} | ${r.encumberedUSDC} | ${r.overshootUSDC??'n/a'} |`).join('\n')+'\n');
  console.table(rows.map(({test,status,released,encumberedUSDC,overshootUSDC})=>({test,status:status??`${released} released`,encumberedUSDC,overshootUSDC:overshootUSDC??'n/a'})));
  console.log('Systems results saved to artifacts/systems.');
} finally {
  const target=resolve(temp),parent=resolve(tmpdir())+sep;
  if(!target.startsWith(parent)||!target.split(sep).at(-1).startsWith('sentinel-systems-'))throw new Error('Refusing cleanup outside experiment temporary directory');
  rmSync(target,{recursive:true,force:true});
}
