import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Worker } from 'node:worker_threads';
import { Store } from '../src/store.mjs';
import { Sentinel } from '../src/service.mjs';
import { SandboxAdapter } from '../src/adapter.mjs';
import { units, money, contract, evaluate, proposal, emptyState } from '../src/domain.mjs';
import { demoContract } from '../src/demo.mjs';
import { normalizeX402 } from '../src/x402.mjs';

const now=Date.parse('2026-01-01T12:00:00Z');
function cleanupTemporary(path) {
  const target=resolve(path);
  if(!target.startsWith(resolve(tmpdir())+sep)||!target.split(sep).at(-1).startsWith('sentinel-'))throw new Error('Unsafe test cleanup path');
  rmSync(target,{recursive:true,force:true});
}
function fixture(overrides={},options={}) {
  const store=new Store(),adapter=new SandboxAdapter(store,{delayMs:0,...options}),service=new Sentinel(store,adapter,{clock:()=>now});
  const created=service.createIntent(demoContract(now,overrides));
  const a=(fields={})=>({intentId:created.contract.id,amount:'2',recipient:'merchant:search',resource:'api:search',reference:'invoice-1',...fields});
  return {store,adapter,service,a,...created};
}
test('exact fixed precision rejects ambiguous and invalid amounts',()=>{
  assert.equal(units('0.000001'),1);assert.equal(money(units('999999.999999')),'999999.999999');
  for(const value of [1,'0','-1','NaN','1e3','01','1.0000001','1,000',' 1','1.','1000001','Infinity',null])assert.throws(()=>units(value));
});
test('immutable contracts reject contradictory or ambiguous policy',()=>{
  for(const fields of [{budget:'1',perTransaction:'2'},{maxTransactions:0},{resources:[]},{repairResources:['api:other']},{validUntil:'2026-02-30T00:00:00Z'},{validUntil:'2026-01-01T00:00:00'},{surprise:true}])assert.throws(()=>contract(demoContract(now,fields),'i'));
});
test('successful execution commits spend, audit, and only token hash',async t=>{
  const f=fixture();t.after(()=>f.store.close());
  const result=await f.service.execute(f.a(),f.contract.id);
  assert.equal(result.decision,'Allow');assert.equal(result.status,'succeeded');assert.equal(f.store.state(f.contract.id).spent,2e6);
  assert.equal(f.service.resolveGrant(f.agentToken),f.contract.id);assert.equal(f.store.verifyAudit().valid,true);
  assert.notEqual(f.store.db.prepare('SELECT token_hash FROM grants').get().token_hash,f.agentToken);
});
test('hard constraints override amount repair and escalation',async t=>{
  const f=fixture({repairResources:['api:search']});t.after(()=>f.store.close());
  const result=await f.service.execute(f.a({amount:'6',recipient:'merchant:attacker'}),f.contract.id);
  assert.equal(result.decision,'Block');assert.equal(result.executable,null);assert.equal(f.store.transactions().length,0);
});
test('explicit repair clips amount and reevaluates remaining budget',async t=>{
  const f=fixture({budget:'7',repairResources:['api:search']});t.after(()=>f.store.close());
  const first=await f.service.execute(f.a({amount:'6'}),f.contract.id);
  assert.equal(first.decision,'Repair');assert.equal(first.executable.amount,5e6);
  const second=await f.service.execute(f.a({amount:'6',reference:'two'}),f.contract.id);
  assert.equal(second.decision,'Block');assert.deepEqual(second.reasons,['BUDGET_EXCEEDED']);assert.equal(f.store.state(f.contract.id).spent,5e6);
});
test('unauthorized increase escalates without executable authority',async t=>{
  const f=fixture();t.after(()=>f.store.close());
  const result=await f.service.execute(f.a({amount:'6'}),f.contract.id);
  assert.equal(result.decision,'Escalate');assert.equal(result.executable,null);assert.equal(f.store.state(f.contract.id).count,0);
});
test('replay also rejects changed invoice amounts and resources',async t=>{
  const f=fixture({resources:['api:search','api:other']});t.after(()=>f.store.close());
  await f.service.execute(f.a(),f.contract.id);
  for(const fields of [{},{amount:'1'},{resource:'api:other'}]){
    const r=await f.service.execute(f.a(fields),f.contract.id);assert.equal(r.decision,'Block');assert.ok(r.reasons.includes('REPLAY_DETECTED'));
  }
  assert.equal(f.store.state(f.contract.id).spent,2e6);
});
test('trusted grant prevents borrowing another contract',async t=>{
  const f=fixture();t.after(()=>f.store.close());const other=f.service.createIntent(demoContract(now));
  const r=await f.service.execute(f.a({intentId:other.contract.id}),f.contract.id);
  assert.equal(r.decision,'Block');assert.ok(r.reasons.includes('INTENT_MISMATCH'));
});
test('agent-supplied time or execution instructions fail closed and are audited',async t=>{
  const f=fixture();t.after(()=>f.store.close());
  for(const fields of [{time:now},{simulateFailure:true},{currency:'USD'},{amount:2}]){
    const result=await f.service.execute(f.a(fields),f.contract.id);assert.equal(result.decision,'Block');assert.equal(result.executable,null);
  }
  assert.equal(f.store.auditRecords().filter(x=>x.event==='payment.proposed').length,4);
});
test('expired and revoked authority cannot execute',async t=>{
  const f=fixture();t.after(()=>f.store.close());f.service.revoke(f.contract.id);
  assert.ok((await f.service.execute(f.a(),f.contract.id)).reasons.includes('INTENT_REVOKED'));
  const c=contract(demoContract(now,{validUntil:new Date(now-1).toISOString()}),'i');
  assert.ok(evaluate(proposal({...f.a(),intentId:'i'}),c,emptyState(),now).reasons.includes('OUTSIDE_VALIDITY'));
});
test('concurrent requests see reservations for budget and count',async t=>{
  const f=fixture({budget:'5',perTransaction:'1',maxTransactions:4},{delayMs:20});t.after(()=>f.store.close());
  const results=await Promise.all(Array.from({length:30},(_,i)=>f.service.execute(f.a({amount:'1',reference:`inv-${i}`}),f.contract.id)));
  assert.equal(results.filter(r=>r.status==='succeeded').length,4);assert.equal(f.store.state(f.contract.id).spent,4e6);
});
test('pending duplicates and frequency bursts are blocked',async t=>{
  const f=fixture({frequency:{max:1,windowSeconds:60}},{delayMs:20});t.after(()=>f.store.close());
  const pending=f.service.execute(f.a(),f.contract.id);
  assert.ok((await f.service.execute(f.a(),f.contract.id)).reasons.includes('REPLAY_DETECTED'));
  assert.ok((await f.service.execute(f.a({reference:'two'}),f.contract.id)).reasons.includes('FREQUENCY_EXCEEDED'));
  await pending;
});
test('frequency window inclusive boundary is enforced',()=>{
  const c=contract(demoContract(now,{frequency:{max:1,windowSeconds:10}}),'i'),a=proposal({intentId:'i',amount:'1',recipient:'merchant:search',resource:'api:search',reference:'new'});
  const s={...emptyState(),history:[{recipient:a.recipient,resource:a.resource,time:now-10000}]};
  assert.equal(evaluate(a,c,s,now).decision,'Block');assert.equal(evaluate(a,c,s,now+1).decision,'Allow');
});
test('definitive failure frees budget and allows same invoice retry',async t=>{
  const f=fixture({budget:'2',perTransaction:'2'},{outcome:'failed'});t.after(()=>f.store.close());
  assert.equal((await f.service.execute(f.a(),f.contract.id)).status,'failed');assert.equal(f.store.state(f.contract.id).spent,0);
  f.adapter.outcome='succeeded';assert.equal((await f.service.execute(f.a(),f.contract.id)).status,'succeeded');assert.equal(f.store.state(f.contract.id).spent,2e6);
});
test('unknown execution holds authority and lookup absence cannot free it',async t=>{
  const f=fixture({budget:'2',perTransaction:'2'},{outcome:'unknown'});t.after(()=>f.store.close());
  const r=await f.service.execute(f.a(),f.contract.id);assert.equal(r.status,'unknown');assert.equal(f.store.state(f.contract.id).spent,2e6);
  assert.equal((await f.service.reconcile(r.transactionId)).status,'unknown');assert.equal(f.store.state(f.contract.id).spent,2e6);
  assert.equal((await f.service.execute(f.a({reference:'two'}),f.contract.id)).decision,'Block');
});
test('timeout after external submission can later reconcile successful receipt',async t=>{
  const f=fixture({}, {delayMs:40});t.after(()=>f.store.close());f.service.paymentTimeoutMs=5;
  const r=await f.service.execute(f.a(),f.contract.id);assert.equal(r.status,'unknown');
  await new Promise(resolve=>setTimeout(resolve,65));
  assert.equal((await f.service.reconcile(r.transactionId)).status,'succeeded');assert.equal(f.store.state(f.contract.id).spent,2e6);
  assert.equal((await f.service.reconcile(r.transactionId)).status,'succeeded');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM sandbox_ledger').get().n,1);
});
test('payment exceptions do not create free budget',async t=>{
  const f=fixture();t.after(()=>f.store.close());f.adapter.pay=async()=>{throw new Error('transport lost');};
  assert.equal((await f.service.execute(f.a(),f.contract.id)).status,'unknown');assert.equal(f.store.state(f.contract.id).spent,2e6);
});
test('audit failure rolls back reservation before adapter execution',async t=>{
  const f=fixture();t.after(()=>f.store.close());let called=false;f.adapter.pay=async()=>{called=true;};f.store.audit=()=>{throw new Error('disk failed');};
  await assert.rejects(f.service.execute(f.a(),f.contract.id));assert.equal(called,false);assert.equal(f.store.transactions().length,0);
});
test('audit detects editing, and external head detects truncation',async t=>{
  const f=fixture();t.after(()=>f.store.close());await f.service.execute(f.a(),f.contract.id);const head=f.store.verifyAudit().head;
  f.store.db.prepare('DELETE FROM audit WHERE seq=(SELECT MAX(seq) FROM audit)').run();
  assert.equal(f.store.verifyAudit().valid,true);assert.equal(f.store.verifyAudit(head).valid,false);
  f.store.db.prepare("UPDATE audit SET record='{}' WHERE seq=1").run();assert.equal(f.store.verifyAudit().valid,false);
});
test('crash/restart preserves pending reservation',t=>{
  const dir=mkdtempSync(join(tmpdir(),'sentinel-restart-'));t.after(()=>cleanupTemporary(dir));const path=join(dir,'state.sqlite');
  const first=new Store(path),service=new Sentinel(first,new SandboxAdapter(first),{clock:()=>now});const {contract:c}=service.createIntent(demoContract(now));
  service.reserve({intentId:c.id,amount:'2',recipient:'merchant:search',resource:'api:search',reference:'a'},c.id);first.close();
  const restored=new Store(path);assert.equal(restored.state(c.id).spent,2e6);assert.equal(restored.transactions()[0].status,'reserved');assert.equal(restored.verifyAudit().valid,true);restored.close();
});
test('SQLite reservations remain bounded across independent workers',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'sentinel-workers-'));t.after(()=>cleanupTemporary(dir));const path=join(dir,'state.sqlite');
  const store=new Store(path),service=new Sentinel(store,new SandboxAdapter(store),{clock:()=>now});
  const {contract:c}=service.createIntent(demoContract(now,{budget:'5',perTransaction:'1'}));store.close();
  const results=await Promise.all(Array.from({length:4},(_,worker)=>new Promise((ok,fail)=>{
    const w=new Worker(new URL('./reservation-worker.mjs',import.meta.url),{workerData:{path,intentId:c.id,worker,now}});w.on('message',ok);w.on('error',fail);w.on('exit',code=>{if(code)fail(new Error(`worker exit ${code}`));});
  })));
  const check=new Store(path);assert.equal(results.reduce((a,b)=>a+b,0),5);assert.equal(check.state(c.id).spent,5e6);assert.equal(check.verifyAudit().valid,true);check.close();
});
test('x402 adapter requires explicit selected v2 exact offer and pinned asset',()=>{
  const q={x402Version:2,resource:{url:'https://api.example.test/search'},accepts:[{scheme:'exact',network:'eip155:84532',asset:'test-usdc',amount:'1200000',payTo:'merchant:search'}]};
  const binding={intentId:'i',reference:'invoice',index:0,network:'eip155:84532',asset:'test-usdc'};
  assert.equal(normalizeX402(q,binding).amount,'1.200000');assert.throws(()=>normalizeX402(q,{...binding,network:'other'}));assert.throws(()=>normalizeX402(q,{...binding,index:undefined}));assert.throws(()=>normalizeX402({...q,x402Version:1},binding));
});
