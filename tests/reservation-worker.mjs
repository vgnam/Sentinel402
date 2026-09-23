import { parentPort, workerData } from 'node:worker_threads';
import { Store } from '../src/store.mjs';
import { Sentinel } from '../src/service.mjs';
import { SandboxAdapter } from '../src/adapter.mjs';
const {path,intentId,worker,now}=workerData;
const store=new Store(path),service=new Sentinel(store,new SandboxAdapter(store,{delayMs:2}),{clock:()=>now});
const results=await Promise.all(Array.from({length:10},(_,i)=>service.execute({intentId,amount:'1',recipient:'merchant:search',resource:'api:search',reference:`worker-${worker}-${i}`},intentId)));
store.close();parentPort.postMessage(results.filter(r=>r.status==='succeeded').length);
