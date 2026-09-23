import { parentPort,workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { Store } from '../src/store.mjs';
import { Sentinel } from '../src/service.mjs';
import { SandboxAdapter } from '../src/adapter.mjs';
const {path,intentId,worker,requests,delayMs}=workerData;
const store=new Store(path),service=new Sentinel(store,new SandboxAdapter(store,{delayMs}));
parentPort.postMessage({ready:true});
parentPort.once('message',async()=>{
  const rows=await Promise.all(Array.from({length:requests},async(_,i)=>{
    const start=performance.now();try{const result=await service.execute({intentId,amount:'1',recipient:'merchant:search',resource:'api:search',reference:`w${worker}-${i}`},intentId);return {status:result.status,latencyMs:performance.now()-start};}catch{return {status:'error',latencyMs:performance.now()-start};}
  }));
  store.close();parentPort.postMessage({rows});
});
