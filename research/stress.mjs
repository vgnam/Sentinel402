import { Worker } from 'node:worker_threads';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir,cpus,platform } from 'node:os';
import { resolve,join,sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Store } from '../src/store.mjs';
import { Sentinel } from '../src/service.mjs';
import { SandboxAdapter } from '../src/adapter.mjs';
import { demoContract } from '../src/demo.mjs';
import { quantile } from './statistics.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function contentionCell(path,workers,delayMs,requests=80){
  const store=new Store(path),service=new Sentinel(store,new SandboxAdapter(store)),{contract}=service.createIntent(demoContract(Date.now(),{budget:'20',perTransaction:'1',maxTransactions:1000}));
  const handles=[];let start;
  try{
    const ready=[],done=[];
    for(let worker=0;worker<workers;worker++){
      const w=new Worker(new URL('./stress-worker.mjs',import.meta.url),{workerData:{path,intentId:contract.id,worker,requests:requests/workers,delayMs}});handles.push(w);
      let onReady,onDone,rejectReady,rejectDone;
      ready.push(new Promise((ok,no)=>{onReady=ok;rejectReady=no;}));done.push(new Promise((ok,no)=>{onDone=ok;rejectDone=no;}));
      w.on('message',m=>{if(m.ready)onReady();else if(m.rows)onDone(m.rows);});w.on('error',e=>{rejectReady(e);rejectDone(e);});w.on('exit',code=>{if(code!==0){const e=new Error(`Worker exited ${code}`);rejectReady(e);rejectDone(e);}});
    }
    const resultsPromise=Promise.all(done); // Attach rejection handling before waiting for readiness.
    resultsPromise.catch(()=>{});
    await Promise.all(ready);start=performance.now();handles.forEach(w=>w.postMessage('start'));
    const rows=(await resultsPromise).flat(),elapsedMs=performance.now()-start,state=store.state(contract.id),successes=rows.filter(r=>r.status==='succeeded'),errors=rows.filter(r=>r.status==='error').length;
    const auditValid=store.verifyAudit().valid,invariantPassed=state.spent<=contract.budget&&state.count<=contract.maxTransactions&&successes.length===20&&errors===0&&auditValid;
    return {workers,connections:workers,requests,delayMs,succeeded:successes.length,rejected:rows.filter(r=>r.status==='not_executed').length,errors,encumberedUSDC:state.spent/1e6,overshootUSDC:Math.max(0,state.spent-contract.budget)/1e6,elapsedMs,requestsPerSecond:requests/elapsedMs*1000,p50RequestMs:quantile(rows.map(r=>r.latencyMs),.5),p95RequestMs:quantile(rows.map(r=>r.latencyMs),.95),p95SuccessMs:quantile(successes.map(r=>r.latencyMs),.95),auditValid,invariantPassed};
  }finally{await Promise.all(handles.map(w=>w.terminate()));store.close();}
}
async function faultCell(delayMs,timeoutMs,outcome){
  const store=new Store(),adapter=new SandboxAdapter(store,{delayMs,outcome}),service=new Sentinel(store,adapter,{paymentTimeoutMs:timeoutMs}),{contract}=service.createIntent(demoContract(Date.now(),{budget:'1',perTransaction:'1'}));
  const action={intentId:contract.id,amount:'1',recipient:'merchant:search',resource:'api:search',reference:'fault-invoice'};
  try{
    const begin=performance.now(),initial=await service.execute(action,contract.id),initialEncumbered=store.state(contract.id).spent;
    // Wait for the sandbox operation to finish even if the caller timed out.
    await sleep(delayMs+2);const final=await service.reconcile(initial.transactionId),encumbered=store.state(contract.id).spent,expected=outcome==='failed'?0:1e6;
    const invariantPassed=final.status===outcome&&encumbered===expected&&(initial.status==='failed'?initialEncumbered===0:initialEncumbered===1e6)&&store.verifyAudit().valid;
    return {delayMs,timeoutMs,outcome,initialStatus:initial.status,finalStatus:final.status,initialEncumberedUSDC:initialEncumbered/1e6,finalEncumberedUSDC:encumbered/1e6,recoveryElapsedMs:performance.now()-begin,invariantPassed};
  }finally{store.close();}
}
async function recoveryCell(path,phase){
  let store=new Store(path),adapter=new SandboxAdapter(store,{delayMs:0}),service=new Sentinel(store,adapter);
  const {contract}=service.createIntent(demoContract(Date.now(),{budget:'1',perTransaction:'1'}));
  const action={intentId:contract.id,amount:'1',recipient:'merchant:search',resource:'api:search',reference:'recovery-invoice'},reserved=service.reserve(action,contract.id);
  const outcome=phase==='external_failure'?'failed':'succeeded';adapter.outcome=outcome;
  if(phase!=='reserved_only'){const receipt=await adapter.pay(reserved.executable,reserved.transactionId);if(phase==='finalized')service.finish(reserved.transactionId,receipt);}
  if(phase==='revoked_pending')service.revoke(contract.id);
  store.close();store=new Store(path);adapter=new SandboxAdapter(store,{delayMs:0});service=new Sentinel(store,adapter);
  try{
    const before=store.transaction(reserved.transactionId).status,after=await service.reconcile(reserved.transactionId),retry=await service.execute({...action,reference:'another-invoice'},contract.id);
    const expected=phase==='reserved_only'?'unknown':outcome;
    const invariantPassed=after.status===expected&&store.state(contract.id).spent<=1e6&&store.verifyAudit().valid&&(phase==='external_failure'?retry.status==='succeeded':retry.status==='not_executed');
    return {phase,beforeStatus:before,reconciledStatus:after.status,newPaymentStatus:retry.status,encumberedUSDC:store.state(contract.id).spent/1e6,invariantPassed};
  }finally{store.close();}
}
export async function runStress({out='artifacts/experiments/systems',workers=[1,2,4,8],delays=[0,5,25],timeouts=[1,10,50],onProgress=()=>{}}={}){
  const temp=mkdtempSync(join(tmpdir(),'sentinel-stress-')),contention=[],faults=[],recovery=[];
  try{
    for(const count of workers)for(const delay of delays){onProgress(`SQLite contention: ${count} workers / ${delay}ms adapter`);contention.push(await contentionCell(join(temp,`w${count}-d${delay}.sqlite`),count,delay));}
    for(const delay of delays)for(const timeout of timeouts)for(const outcome of ['succeeded','failed','unknown'])faults.push(await faultCell(delay,timeout,outcome));
    for(const phase of ['reserved_only','external_success','external_failure','finalized','revoked_pending'])recovery.push(await recoveryCell(join(temp,`${phase}.sqlite`),phase));
    const report={metadata:{suite:'sentinel-stress-v1',node:process.version,cpu:cpus()[0]?.model,platform:platform(),generatedAt:new Date().toISOString(),warning:'Worker threads use independent SQLite connections and a ready/start barrier. 80 requests compete for 20 successful slots; request throughput includes rejections. One measurement per cell, not a throughput confidence interval. Recovery closes/reopens storage at saga boundaries; this is not a power-loss or forced-process-kill test. Recovery elapsed time includes a deliberate drain wait.'},contention,faults,recovery,invariantFailures:[...contention,...faults,...recovery].filter(r=>!r.invariantPassed).length};
    mkdirSync(out,{recursive:true});writeFileSync(resolve(out,'summary.json'),JSON.stringify(report,null,2));
    for(const [name,rows]of Object.entries({contention,faults,recovery})){const keys=Object.keys(rows[0]??{});writeFileSync(resolve(out,`${name}.csv`),keys.join(',')+'\n'+rows.map(r=>keys.map(k=>r[k]).join(',')).join('\n')+'\n');}
    writeFileSync(resolve(out,'results.md'),`# Storage and adapter experiments\n\n${report.metadata.warning}\n\nInvariant failures: ${report.invariantFailures}.\n\n| Workers | Adapter delay ms | Succeeded / requests | Overshoot USDC | Request p95 ms | Successful p95 ms |\n|---:|---:|---:|---:|---:|---:|\n`+contention.map(r=>`| ${r.workers} | ${r.delayMs} | ${r.succeeded}/${r.requests} | ${r.overshootUSDC} | ${r.p95RequestMs.toFixed(2)} | ${r.p95SuccessMs.toFixed(2)} |`).join('\n')+`\n\nFault matrix: ${faults.length} cells. Reopen/reconciliation: ${recovery.length} boundaries. See CSV and summary.json for every condition and outcome.\n`);
    if(report.invariantFailures)throw new Error(`System invariant failures: ${report.invariantFailures}; inspect ${out}`);return report;
  }finally{const target=resolve(temp),parent=resolve(tmpdir())+sep;if(!target.startsWith(parent)||!target.split(sep).at(-1).startsWith('sentinel-stress-'))throw new Error('Unsafe temporary cleanup path');rmSync(target,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await runStress({onProgress:console.log});
