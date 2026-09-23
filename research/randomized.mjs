import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { random,EPOCH } from './corpus.mjs';
import { violations } from './oracle.mjs';
import { Store } from '../src/store.mjs';
import { Sentinel } from '../src/service.mjs';
import { SandboxAdapter } from '../src/adapter.mjs';
import { demoContract } from '../src/demo.mjs';
import { money,hash } from '../src/domain.mjs';

export async function randomizedTrajectories({seed=402,trajectories=50,steps=80}={}){
  if(!Number.isInteger(seed)||seed<0||seed>4294967295||!Number.isInteger(trajectories)||trajectories<1||trajectories>1000||!Number.isInteger(steps)||steps<1||steps>1000)throw new Error('Invalid randomized experiment settings');
  const rng=random(seed),pick=xs=>xs[Math.floor(rng()*xs.length)],rows=[],contracts=[],failures=[],counts={Allow:0,Repair:0,Escalate:0,Block:0,succeeded:0,failed:0,unknown:0,malformed:0,revocations:0};
  for(let t=0;t<trajectories;t++){
    let now=EPOCH;const store=new Store(),adapter=new SandboxAdapter(store,{delayMs:0}),service=new Sentinel(store,adapter,{clock:()=>now});
    const cap=pick([1,2,3,5]),input=demoContract(now,{budget:String(pick([5,10,20,50])),perTransaction:String(cap),maxTransactions:pick([2,5,10,30]),validUntil:new Date(now+20000).toISOString(),repairResources:rng()<.5?['api:search']:[],...(rng()<.5?{frequency:{max:pick([1,2,4]),windowSeconds:1}}:{}),...(rng()<.2?{escalateAbove:'1'}:{})});
    const {contract}=service.createIntent(input),ledger=[];let revoked=false;contracts.push({trajectory:t,contract});
    try{
      for(let step=0;step<steps;step++){
        now+=pick([0,0,1,50,200,1001]);
        if(step===Math.floor(steps*.75)&&rng()<.2){service.revoke(contract.id);revoked=true;counts.revocations++;}
        const previous=ledger.length?pick(ledger).action.reference:null,reference=previous&&rng()<.25?previous:`t${t}-invoice-${step}`;
        const raw={intentId:rng()<.04?'intent-other':contract.id,amount:money(pick([1,500000,1000000,2000000,5000000,9000000])),recipient:rng()<.12?'merchant:attacker':'merchant:search',resource:rng()<.1?'api:unrelated':'api:search',reference};
        const malformed=rng()<.08;if(malformed){raw.amount=pick(['1e3','-1','0.0000001',1,0,null]);counts.malformed++;}
        adapter.outcome=pick(['succeeded','succeeded','succeeded','failed','unknown']);
        const result=await service.execute(raw,contract.id);counts[result.decision]++;
        const bad=result.executable?violations(result.executable,contract,ledger,now):[];
        if(result.executable&&revoked)bad.push('revoked');if(result.executable&&malformed)bad.push('malformed_released');
        if(result.executable){ledger.push({action:result.executable,time:now,outcome:result.status});counts[result.status]++;}
        const expected=ledger.filter(e=>e.outcome!=='failed'),state=store.state(contract.id);
        if(state.spent!==expected.reduce((n,e)=>n+e.action.amount,0))bad.push('ledger_amount_mismatch');
        if(state.count!==expected.length)bad.push('ledger_count_mismatch');
        if(state.spent>contract.budget||state.count>contract.maxTransactions)bad.push('authority_exceeded');
        const row={trajectory:t,step,time:now,proposal:raw,adapterOutcome:adapter.outcome,decision:result.decision,status:result.status,executable:result.executable,encumbered:state.spent,slots:state.count,violations:bad};rows.push(row);if(bad.length)failures.push(row);
      }
      if(!store.verifyAudit().valid)failures.push({trajectory:t,violations:['audit_chain']});
    }finally{store.close();}
  }
  // Random UUIDs are implementation identity, not generated-condition entropy.
  const normalized=contracts.map(({trajectory,contract:c})=>({trajectory,contract:{...c,id:`intent-${trajectory}`}}));
  const stimuli=rows.map(({trajectory,step,time,proposal:p,adapterOutcome})=>({trajectory,step,time,proposal:{...p,intentId:p.intentId==='intent-other'?p.intentId:`intent-${trajectory}`},adapterOutcome}));
  return {metadata:{suite:'sentinel-randomized-service-v1',seed,trajectories,steps,proposals:rows.length,stimulusHash:hash({contracts:normalized,stimuli}),generatedAt:new Date().toISOString(),warning:'Seeded sequential model-based stress of the actual service with in-memory SQLite. Independent effect/state ledger and audit checks; not a formal proof, a concurrent stress run, or a representative attack distribution. Random UUIDs normalized only for reproducibility hashing.'},counts,invariantFailures:failures.length,failures,contracts,rows};
}
export async function runRandomized({out='artifacts/experiments/randomized',...options}={}){
  const result=await randomizedTrajectories(options);mkdirSync(out,{recursive:true});const {rows,contracts,...summary}=result;
  writeFileSync(resolve(out,'summary.json'),JSON.stringify(summary,null,2));writeFileSync(resolve(out,'contracts.json'),JSON.stringify(contracts,null,2));writeFileSync(resolve(out,'traces.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  writeFileSync(resolve(out,'results.md'),`# Randomized service trajectories\n\n${result.metadata.warning}\n\n${result.metadata.trajectories} trajectories × ${result.metadata.steps} steps = ${rows.length} proposals. Invariant failures: ${result.invariantFailures}.\n\n| Event | Count |\n|---|---:|\n`+Object.entries(result.counts).map(([k,v])=>`| ${k} | ${v} |`).join('\n')+`\n\nStimulus SHA-256: ${result.metadata.stimulusHash}.\n`);
  if(result.invariantFailures)throw new Error(`Randomized invariant failures: ${result.invariantFailures}`);return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const r=await runRandomized();console.log(JSON.stringify({proposals:r.metadata.proposals,invariantFailures:r.invariantFailures,counts:r.counts},null,2));}
