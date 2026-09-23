import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { Store } from './store.mjs';
import { SandboxAdapter } from './adapter.mjs';
import { Sentinel } from './service.mjs';
import { InputError, only } from './domain.mjs';
import { SCENARIOS, runScenario } from './demo.mjs';
import { loadEnv, llmConfig } from './config.mjs';
import { LLMClient } from './llm.mjs';
import { runAgent } from './agent.mjs';
import { LIVE_CASES } from '../research/live-cases.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const secureEquals=(a,b)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);};
async function body(req) {
  let length=0;const chunks=[];
  for await(const chunk of req){length+=chunk.length;if(length>32_768)throw new InputError('Request body exceeds 32 KiB');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new InputError('Invalid JSON body');}
}
export function createApp({store=new Store(),demo=false,controlKey=randomBytes(32).toString('hex'),adapter,clock=Date.now,benchmarkDir=resolve(ROOT,'artifacts/benchmark'),llmClient=null}={}) {
  const service=new Sentinel(store,adapter??new SandboxAdapter(store),{clock});
  let benchmarkRunning=false,llmRunning=false,activeRun=Promise.resolve();
  store.db.prepare("UPDATE llm_runs SET status='interrupted' WHERE status='running'").run();
  const readRun=row=>({...JSON.parse(row.report),status:row.status});
  const handler=async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control','no-store');
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    let path;
    try {
      const host=req.headers.host??'';
      if(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))return json(403,{error:'Host rejected; place an authenticated proxy on a loopback upstream'});
      if(req.headers.origin && req.headers.origin!==`http://${host}` && req.headers.origin!==`https://${host}`)return json(403,{error:'Cross-origin requests are not allowed'});
      const url=new URL(req.url,`http://${host}`);path=url.pathname;
      const method=req.method;
      if(method==='GET'&&path==='/health')return json(200,{ok:true,version:'0.1.0',paymentMode:'sandbox',demo});
      if(method==='GET'&&path==='/api/session')return json(200,demo?{demo:true,controlKey,paymentMode:'sandbox'}:{demo:false,paymentMode:'sandbox'});
      if(method==='GET'&&['/','/app.js','/style.css','/favicon.svg'].includes(path)){
        const file=path==='/'?'index.html':path.slice(1);
        const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html';
        res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`});return res.end(readFileSync(resolve(ROOT,'public',file)));
      }
      const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):'';
      const isControl=Boolean(token)&&secureEquals(token,controlKey);
      if(path==='/api/payments'&&method==='POST'){
        const bound=token?service.resolveGrant(token):null;
        if(!bound)return json(401,{error:'An intent-scoped agent credential is required'});
        return json(200,await service.execute(await body(req),bound));
      }
      if(!isControl)return json(401,{error:'Control-plane credential required'});
      if(method==='GET'&&path==='/api/llm')return json(200,{
        provider:llmClient?.info()??{configured:false},running:llmRunning,cases:LIVE_CASES,
        benchmark:existsSync(resolve(ROOT,'artifacts/llm/summary.json'))?JSON.parse(readFileSync(resolve(ROOT,'artifacts/llm/summary.json'),'utf8')):null,
        runs:store.db.prepare('SELECT * FROM llm_runs ORDER BY created_at DESC LIMIT 10').all().map(readRun)
      });
      const llmArtifact=path.match(/^\/api\/research\/llm\/export\/(summary\.json|metrics\.csv|results\.md|runs\.jsonl)$/);
      if(method==='GET'&&llmArtifact){
        const file=resolve(ROOT,'artifacts/llm',llmArtifact[1]);if(!existsSync(file))return json(404,{error:'Run npm run benchmark:llm first'});
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="llm-${llmArtifact[1]}"`});return res.end(readFileSync(file));
      }
      const llmRun=path.match(/^\/api\/llm\/runs\/(run_[a-z0-9-]+)$/);
      if(method==='GET'&&llmRun){const row=store.db.prepare('SELECT * FROM llm_runs WHERE id=?').get(llmRun[1]);return row?json(200,readRun(row)):json(404,{error:'Unknown agent run'});}
      if(method==='POST'&&path==='/api/llm/run'){
        if(!llmClient)return json(409,{error:'Configure OPENAI_API_KEY, OPENAI_BASE_URL and OPENAI_MODEL in .env, then restart'});
        if(llmRunning)return json(409,{error:'An LLM run is already active'});
        const input=await body(req);
        if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError('Agent run must be an object');
        only(input,['intentId','task','toolContent','maxTurns']);
        const c=typeof input.intentId==='string'?store.intent(input.intentId):null;
        if(!c||c.revoked||c.validFrom>clock()||c.validUntil<clock())throw new InputError('Select an active intent');
        if(typeof input.task!=='string'||!input.task.trim()||input.task.length>2000||/[\u0000-\u001f\u007f]/.test(input.task))throw new InputError('Task must contain 1–2000 characters without control characters');
        if(typeof input.toolContent!=='string'||!input.toolContent.trim()||input.toolContent.length>8000)throw new InputError('Tool content must contain 1–8000 characters');
        const maxTurns=input.maxTurns??3;
        if(!Number.isInteger(maxTurns)||maxTurns<1||maxTurns>4)throw new InputError('maxTurns must be 1–4');
        // Recheck after body parsing yields: two requests may have passed the
        // early check while their bodies were still streaming.
        if(llmRunning)return json(409,{error:'An LLM run is already active'});
        const id=`run_${randomUUID()}`,partial={id,intentId:c.id,startedAt:new Date().toISOString(),provider:llmClient.info(),task:input.task,toolContent:input.toolContent,status:'running',steps:[],payments:[],calls:[],mode:'sandbox'};
        store.db.prepare('INSERT INTO llm_runs VALUES(?,?,?,?)').run(id,'running',clock(),JSON.stringify(partial));llmRunning=true;
        const update=(status,report)=>store.db.prepare('UPDATE llm_runs SET status=?,report=? WHERE id=?').run(status,JSON.stringify(report),id);
        activeRun=runAgent({client:llmClient,contract:c,task:input.task.trim(),toolContent:input.toolContent,maxTurns,runId:id,
          execute:raw=>service.execute(raw,c.id),onEvent:event=>{partial.steps.push(event);if(event.type==='payment')partial.payments.push({proposal:event.proposal,result:event.result});update('running',partial);}
        }).then(report=>update(report.status,report)).catch(()=>update('failed',{...partial,stopReason:'AGENT_RUN_FAILED'})).finally(()=>{llmRunning=false;});
        return json(202,{id,status:'running'});
      }
      if(method==='GET'&&path==='/api/overview'){
        const intents=store.intents(),transactions=store.transactions(100),audit=store.auditRecords(100);
        const totals=store.db.prepare("SELECT COUNT(*) count,COALESCE(SUM(CASE WHEN status='succeeded' THEN amount ELSE 0 END),0) committed,COALESCE(SUM(CASE WHEN status IN ('reserved','unknown') THEN amount ELSE 0 END),0) reserved FROM transactions").get();
        const decisions=Object.fromEntries(['Allow','Repair','Escalate','Block'].map(d=>[d,store.db.prepare("SELECT COUNT(*) n FROM audit WHERE json_extract(record,'$.event')='payment.proposed' AND json_extract(record,'$.decision')=?").get(d).n]));
        return json(200,{intents,transactions,audit,totals,decisions,scenarios:SCENARIOS,mode:'sandbox'});
      }
      if(method==='POST'&&path==='/api/intents')return json(201,service.createIntent(await body(req)));
      const revoke=path.match(/^\/api\/intents\/(int_[a-z0-9-]+)\/revoke$/);
      if(method==='POST'&&revoke)return json(200,service.revoke(revoke[1]));
      if(method==='POST'&&path==='/api/console/payments'){
        const input=await body(req);if(typeof input?.intentId!=='string')throw new InputError('intentId required');
        return json(200,await service.execute(input,input.intentId));
      }
      if(method==='POST'&&path==='/api/demo/scenario'){
        const input=await body(req);if(!SCENARIOS.some(x=>x.id===input?.id))throw new InputError('Unknown scenario');
        return json(200,await runScenario(service,input.id));
      }
      const reconcile=path.match(/^\/api\/transactions\/(txn_[a-z0-9-]+)\/reconcile$/);
      if(method==='POST'&&reconcile)return json(200,await service.reconcile(reconcile[1]));
      if(method==='GET'&&path==='/api/audit/verify')return json(200,store.verifyAudit(url.searchParams.get('head')||undefined));
      if(method==='GET'&&path==='/api/audit/export'){
        res.setHeader('Content-Disposition','attachment; filename="sentinel402-audit.json"');
        return json(200,{integrity:store.verifyAudit(),records:store.auditRecords(1_000_000).reverse()});
      }
      if(method==='GET'&&path==='/api/research')return json(200,existsSync(resolve(benchmarkDir,'summary.json'))?JSON.parse(readFileSync(resolve(benchmarkDir,'summary.json'),'utf8')):{summaries:[],metadata:null});
      if(method==='POST'&&path==='/api/research/run'){
        if(benchmarkRunning)return json(409,{error:'Benchmark already running'});
        const input=await body(req);
        if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError('Benchmark configuration must be an object');
        const seed=input.seed??402,repetitions=input.repetitions??50;
        if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295||!Number.isSafeInteger(repetitions)||repetitions<1||repetitions>100)throw new InputError('Seed must be a uint32; repetitions must be 1–100');
        if(benchmarkRunning)return json(409,{error:'Benchmark already running'});
        benchmarkRunning=true;
        try{
          await new Promise((ok,fail)=>execFile(process.execPath,[resolve(ROOT,'research/run.mjs'),'--seed',String(seed),'--repetitions',String(repetitions),'--out',benchmarkDir],{cwd:ROOT,windowsHide:true,timeout:60_000},error=>error?fail(error):ok()));
          return json(200,JSON.parse(readFileSync(resolve(benchmarkDir,'summary.json'),'utf8')));
        }finally{benchmarkRunning=false;}
      }
      const artifact=path.match(/^\/api\/research\/export\/(summary\.json|metrics\.csv|results\.md|table\.tex|traces\.jsonl|corpus\.jsonl)$/);
      if(method==='GET'&&artifact){
        const file=resolve(benchmarkDir,artifact[1]);if(!existsSync(file))return json(404,{error:'Run the benchmark first'});
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${artifact[1]}"`});return res.end(readFileSync(file));
      }
      return json(404,{error:'Route not found'});
    }catch(error){
      if(error instanceof InputError)return json(400,{error:error.message,code:error.code});
      console.error(`[sentinel] ${req.method} ${path??'/'}: ${error.message}`);
      // Fail closed: database/adapter/audit failures never yield executable instructions.
      return json(503,{error:'Authorization service unavailable; no new authority issued. A submitted payment may need reconciliation.'});
    }
  };
  const server=http.createServer(handler);server.requestTimeout=15_000;server.headersTimeout=10_000;
  return {server,service,store,waitForLLM:()=>activeRun};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  loadEnv();
  const demo=process.argv.includes('--demo'),host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??4020);
  if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Bind to loopback; use an authenticated TLS reverse proxy for deployment');
  const configuredControl=process.env.SENTINEL_CONTROL_KEY&&!process.env.SENTINEL_CONTROL_KEY.startsWith('replace-with-')?process.env.SENTINEL_CONTROL_KEY:null;
  if(!demo && (!configuredControl||configuredControl.length<32))throw new Error('Set SENTINEL_CONTROL_KEY to at least 32 random characters, or use npm run dev for local sandbox demo');
  const db=resolve(process.env.SENTINEL_DB??resolve(ROOT,'data/sentinel.sqlite'));mkdirSync(dirname(db),{recursive:true});
  const config=llmConfig();
  const app=createApp({store:new Store(db),demo,controlKey:configuredControl??randomBytes(32).toString('hex'),llmClient:config?new LLMClient(config):null});
  app.server.listen(port,host,()=>console.log(`Sentinel402 · http://${host}:${port} · ${demo?'local demo':'authenticated'} · sandbox payments only`));
  const stop=()=>app.server.close(async()=>{await app.waitForLLM();app.store.close();process.exit(0);});process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
