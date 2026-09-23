import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { platform, arch, cpus } from 'node:os';
import { execFileSync } from 'node:child_process';
import { METHODS } from './baselines.mjs';
import { corpus, CORPUS_VERSION } from './corpus.mjs';
import { violations } from './oracle.mjs';
import { emptyState, fingerprint, invoiceKey, hash } from '../src/domain.mjs';

export function wilson(successes, n) {
  if (!n) return [0,0];
  const z=1.96,p=successes/n,d=1+z*z/n,mid=(p+z*z/(2*n))/d,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return [Math.max(0,mid-half),Math.min(1,mid+half)];
}
const percentile = (xs,p) => [...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))] ?? 0;
const rate = (a,b) => b ? a/b : 0;
export function runBenchmark({seed=402,repetitions=50,trajectories=corpus(seed,repetitions),suite=CORPUS_VERSION}={}) {
  if(!trajectories.length||trajectories.some(t=>!t.steps.length))throw new Error('Benchmark requires nonempty trajectories');
  const rows=[], summaries=[];
  for (const method of METHODS) {
    // Unrecorded warm-up. Timing below is policy-only; not an API or DB benchmark.
    for (let i=0;i<200;i++) { const t=trajectories[i%trajectories.length]; method.run(t.steps[0].action,t.contract,emptyState(),t.steps[0].time); }
    const times=[]; let attacks=0,successfulAttacks=0,benign=0,completed=0,benignEffects=0,benignExpected=0,blockedBenign=0,unsafeUnits=0,violatingReleases=0,releases=0,escalations=0,repairs=0;
    const categories={};
    for (const t of trajectories) {
      const state=emptyState(), ledger=[]; let anyViolation=false,complete=true;
      for (let step=0;step<t.steps.length;step++) {
        const {action,time,outcome}=t.steps[step];
        const start=performance.now(), result=method.run(action,t.contract,state,time), ms=performance.now()-start;
        times.push(ms);
        const failures=result.executable ? violations(result.executable,t.contract,ledger,time) : [];
        const released=Boolean(result.executable), unsafe=failures.length>0;
        if (unsafe) { anyViolation=true; violatingReleases++; unsafeUnits+=result.executable.amount; }
        if (released) {
          releases++;
          ledger.push({action:result.executable,time,outcome});
          if (outcome!=='failed') {
            state.spent+=result.executable.amount;state.count++;
            state.history.push({recipient:result.executable.recipient,resource:result.executable.resource,time});
            state.fingerprints.push(fingerprint(action));state.invoices.push(invoiceKey(action));
          }
        }
        if (result.decision==='Escalate') escalations++;
        if (result.decision==='Repair') repairs++;
        if (t.benign && outcome==='succeeded') {
          benignExpected++;
          if (released&&!unsafe) { benignEffects++; } else { complete=false; }
          if (!released) blockedBenign++;
        }
        rows.push({method:method.id,trajectory:t.id,category:t.category,benign:t.benign,step,decision:result.decision,released,outcome:released?outcome:'not_executed',unsafe,violations:failures,amount:result.executable?.amount??0,latencyMs:ms});
      }
      if (t.benign) {benign++;if(complete&&!anyViolation)completed++;} else {attacks++;if(anyViolation)successfulAttacks++;}
      const cat=categories[t.category]??={trajectories:0,unsafe:0,completed:0,benign:t.benign};
      cat.trajectories++;if(anyViolation)cat.unsafe++;if(complete&&!anyViolation)cat.completed++;
    }
    summaries.push({id:method.id,name:method.name,kind:method.kind,attackTrajectories:attacks,unsafeTrajectories:successfulAttacks,
      attackSuccessRate:rate(successfulAttacks,attacks),attackSuccessCI95:wilson(successfulAttacks,attacks),
      benignTrajectories:benign,completedBenign:completed,benignCompletionRate:rate(completed,benign),benignCompletionCI95:wilson(completed,benign),
      benignEffectRate:rate(benignEffects,benignExpected),falseRejectionRate:rate(blockedBenign,benignExpected),
      unsafeAuthorizedUSDC:unsafeUnits/1e6,violatingReleases,releases,escalations,repairs,
      policyLatencyP50Ms:percentile(times,.5),policyLatencyP95Ms:percentile(times,.95),categories});
  }
  let commit=null;try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
  return {metadata:{suite,synthetic:true,seed,repetitions,trajectoryCount:trajectories.length,methodCount:METHODS.length,
    corpusHash:hash(trajectories),generatedAt:new Date().toISOString(),runtime:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,commit,
    warning:'Synthetic authorization trajectories, not an end-to-end LLM prompt-injection benchmark. ASR counts unsafe releases, including uncertain outcomes. Wilson intervals assume independent trials; repeated templates are clustered. Latency excludes parsing, SQLite, network and settlement.'}, summaries, rows, trajectories};
}
const percent=x=>`${(x*100).toFixed(1)}%`;
export function writeResults(result,outDir) {
  mkdirSync(outDir,{recursive:true});
  const {rows,trajectories,...summary}=result;
  writeFileSync(resolve(outDir,'summary.json'),JSON.stringify(summary,null,2));
  writeFileSync(resolve(outDir,'traces.jsonl'),rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
  writeFileSync(resolve(outDir,'corpus.jsonl'),trajectories.map(x=>JSON.stringify(x)).join('\n')+'\n');
  const keys=['id','kind','attackTrajectories','unsafeTrajectories','attackSuccessRate','benignCompletionRate','falseRejectionRate','unsafeAuthorizedUSDC','policyLatencyP50Ms','policyLatencyP95Ms'];
  writeFileSync(resolve(outDir,'metrics.csv'),keys.join(',')+'\n'+result.summaries.map(x=>keys.map(k=>x[k]).join(',')).join('\n')+'\n');
  writeFileSync(resolve(outDir,'results.md'),`# Synthetic authorization benchmark\n\n${result.metadata.warning}\n\nSeed: ${result.metadata.seed}. Trajectories: ${result.metadata.trajectoryCount}. Corpus SHA-256: \`${result.metadata.corpusHash}\`.\n\n| Method | Unsafe trajectory rate ↓ | Benign completion ↑ | False rejection ↓ | Policy p95 (ms) |\n|---|---:|---:|---:|---:|\n`+result.summaries.map(s=>`| ${s.name} | ${percent(s.attackSuccessRate)} | ${percent(s.benignCompletionRate)} | ${percent(s.falseRejectionRate)} | ${s.policyLatencyP95Ms.toFixed(4)} |`).join('\n')+'\n\nFull confidence intervals, denominators, category breakdowns and environment metadata are in summary.json. No external published baseline is reproduced here.\n');
  const latex=['% Synthetic local results; not an LLM robustness claim.','\\begin{tabular}{lrrr}','\\hline','Method & Unsafe (\\%) & Completion (\\%) & p95 (ms) \\\\','\\hline',...result.summaries.map(s=>`${s.name.replaceAll('−','$-$')} & ${(s.attackSuccessRate*100).toFixed(1)} & ${(s.benignCompletionRate*100).toFixed(1)} & ${s.policyLatencyP95Ms.toFixed(4)} \\\\`),'\\hline','\\end{tabular}'];
  writeFileSync(resolve(outDir,'table.tex'),latex.join('\n')+'\n');
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2), option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
  const seed=Number(option('--seed',402)),repetitions=Number(option('--repetitions',50));
  if(!Number.isSafeInteger(seed)||seed<0||seed>4294967295||!Number.isSafeInteger(repetitions)||repetitions<1||repetitions>1000)throw new Error('Invalid seed/repetitions');
  const result=runBenchmark({seed,repetitions});writeResults(result,resolve(option('--out','artifacts/benchmark')));
  console.table(result.summaries.map(s=>({method:s.name,unsafe:percent(s.attackSuccessRate),benign:percent(s.benignCompletionRate)})));
  console.log(`Saved ${result.metadata.trajectoryCount} trajectories × ${result.metadata.methodCount} methods to ${option('--out','artifacts/benchmark')}`);
}
