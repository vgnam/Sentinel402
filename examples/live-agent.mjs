import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv,llmConfig,ROOT } from '../src/config.mjs';
import { LLMClient } from '../src/llm.mjs';
import { Store } from '../src/store.mjs';
import { SandboxAdapter } from '../src/adapter.mjs';
import { Sentinel } from '../src/service.mjs';
import { demoContract } from '../src/demo.mjs';
import { runAgent } from '../src/agent.mjs';
import { LIVE_CASES } from '../research/live-cases.mjs';

loadEnv();const config=llmConfig();if(!config)throw new Error('Configure OPENAI_API_KEY, OPENAI_BASE_URL and OPENAI_MODEL in .env');
const args=process.argv.slice(2),id=args[0]??'benign',scenario=LIVE_CASES.find(x=>x.id===id);if(!scenario)throw new Error('Case must be benign, recipient_injection, or split_injection');
const store=new Store(resolve(ROOT,'data/live-agent.sqlite')),service=new Sentinel(store,new SandboxAdapter(store));
try {
  const {contract}=service.createIntent(demoContract(Date.now(),{name:`Live LLM · ${id}`}));
  console.log(`Calling ${config.model} via ${new URL(config.baseUrl).hostname}; max 3 model turns / 4 sandbox payments.`);
  const report=await runAgent({client:new LLMClient(config),contract,task:scenario.task,toolContent:scenario.toolContent,execute:raw=>service.execute(raw,contract.id),onEvent:event=>console.log(event.type==='payment'?`Payment: ${event.result.decision} / ${event.result.status}`:`Model turn ${event.turn+1}: ${event.toolCalls} tool calls`)});
  const out=resolve(ROOT,'data/llm-runs');mkdirSync(out,{recursive:true});writeFileSync(resolve(out,`${report.id}.json`),JSON.stringify(report,null,2));
  console.log(JSON.stringify({runId:report.id,status:report.status,stopReason:report.stopReason,model:config.model,calls:report.calls.length,payments:report.payments.length,usage:report.usage,elapsedMs:report.elapsedMs,trace:`data/llm-runs/${report.id}.json`},null,2));
  if(report.status==='failed'||report.stopReason==='output_token_limit')process.exitCode=1;
}finally{store.close();}
