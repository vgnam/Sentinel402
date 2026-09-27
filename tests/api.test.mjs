import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.mjs';
import { demoContract } from '../src/demo.mjs';
import { SentinelClient } from '../sdk/client.mjs';
import http from 'node:http';

async function fixture(t,demo=false){const key='test-control-key-that-is-at-least-32-chars',app=createApp({demo,controlKey:key});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;t.after(async()=>{await new Promise(r=>app.server.close(r));app.store.close();});const request=async(path,{token=key,body,headers={}}={})=>fetch(`${base}${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {...app,key,base,request};}
test('secure control plane does not expose credentials; unauthenticated writes rejected',async t=>{
  const f=await fixture(t);assert.deepEqual(await(await f.request('/api/session')).json(),{demo:false,paymentMode:'sandbox'});
  assert.equal((await f.request('/api/overview',{token:''})).status,401);assert.equal((await f.request('/api/intents',{token:'',body:demoContract()})).status,401);
  assert.equal((await f.request('/health',{token:''})).status,200);
});
test('demo bootstrap is explicit; cross-origin and rebinding hosts rejected',async t=>{
  const f=await fixture(t,true);assert.equal((await(await f.request('/api/session')).json()).controlKey,f.key);
  assert.equal((await f.request('/api/session',{headers:{Origin:'https://attacker.test'}})).status,403);
  // fetch owns the Host header; use a raw HTTP client to exercise DNS rebinding.
  const status=await new Promise((ok,fail)=>{http.get(`${f.base}/api/session`,{headers:{Host:'attacker.test'}},r=>{r.resume();ok(r.statusCode);}).on('error',fail);});
  assert.equal(status,403);
});
test('SDK agent token can pay only its bound intent and cannot alter control plane',async t=>{
  const f=await fixture(t),created=await(await f.request('/api/intents',{body:demoContract()})).json();
  const client=new SentinelClient({baseUrl:f.base,agentToken:created.agentToken});
  const p={intentId:created.contract.id,amount:'1',recipient:'merchant:search',resource:'api:search',reference:'a'};
  assert.equal((await client.pay(p)).status,'succeeded');
  assert.equal((await f.request('/api/intents',{token:created.agentToken,body:demoContract()})).status,401);
  assert.equal((await f.request('/api/overview',{token:created.agentToken})).status,401);
  const other=await(await f.request('/api/intents',{body:demoContract()})).json();
  assert.equal((await client.pay({...p,intentId:other.contract.id,reference:'b'})).decision,'Block');
  assert.equal((await f.request('/api/payments',{body:p})).status,401);
});
test('malformed request returns controlled error; static console has security headers',async t=>{
  const f=await fixture(t);const response=await fetch(`${f.base}/api/intents`,{method:'POST',headers:{Authorization:`Bearer ${f.key}`},body:'{'});assert.equal(response.status,400);
  const oversized=await fetch(`${f.base}/api/intents`,{method:'POST',headers:{Authorization:`Bearer ${f.key}`},body:JSON.stringify({huge:'x'.repeat(40000)})});assert.equal(oversized.status,400);
  const home=await f.request('/');assert.equal(home.status,200);assert.match(home.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.match(await home.text(),/Sentinel402/);
  assert.equal((await f.request('/api/research/export/..%2F..%2Fpackage.json')).status,404);
  assert.equal((await f.request('/api/research/run',{body:null})).status,400);
  assert.equal((await f.request('/api/demo/scenario',{body:null})).status,400);
});
test('demo scenario and audit export reflect actual executions',async t=>{
  const f=await fixture(t),r=await(await f.request('/api/demo/scenario',{body:{id:'split'}})).json();
  assert.equal(r.results.filter(x=>x.status==='succeeded').length,2);assert.equal(r.results.filter(x=>x.decision==='Block').length,2);
  const overview=await(await f.request('/api/overview')).json();assert.equal(overview.totals.committed,8e6);assert.equal(overview.decisions.Block,2);
  const audit=await(await f.request('/api/audit/export')).json();assert.equal(audit.integrity.valid,true);assert.equal(audit.records.length,7);
});
test('guided demo requires control auth and cannot read or change workspace data',async t=>{
  const f=await fixture(t),created=await(await f.request('/api/intents',{body:demoContract()})).json();
  assert.equal((await f.request('/api/demo/walkthrough',{token:'',body:{}})).status,401);
  assert.equal((await f.request('/api/demo/walkthrough',{token:created.agentToken,body:{}})).status,401);
  assert.equal((await f.request('/api/demo/walkthrough',{body:null})).status,400);
  assert.equal((await f.request('/api/demo/walkthrough',{body:{intentId:created.contract.id}})).status,400);
  const before=await(await f.request('/api/overview')).json();
  const response=await f.request('/api/demo/walkthrough',{body:{}}),report=await response.json();
  assert.equal(response.status,200);assert.equal(report.passed,true);
  assert.ok(report.scenarios.every(s=>s.intentId!==created.contract.id));
  assert.deepEqual(await(await f.request('/api/overview')).json(),before);
});
