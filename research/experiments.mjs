import { mkdirSync,writeFileSync,readFileSync,appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { runBenchmark,writeResults } from './run.mjs';
import { METHODS } from './baselines.mjs';
import { baseContract,EPOCH,random } from './corpus.mjs';
import { proposal,money } from '../src/domain.mjs';
import { mean,clusterInterval } from './statistics.mjs';
import { runStress } from './stress.mjs';
import { runRandomized } from './randomized.mjs';

export function sensitivityCorpus(seed=402){
  const rng=random(seed),rows=[];
  const add=(category,benign,c,amounts,refs=amounts.map((_,i)=>`invoice-${i}`))=>rows.push({id:`${category}-${rows.length}`,category,benign,contract:c,steps:amounts.map((a,i)=>({action:proposal({intentId:c.id,amount:money(a),recipient:'merchant:search',resource:'api:search',reference:refs[i]}),time:EPOCH+i*1000,outcome:'succeeded'}))});
  // Full Cartesian pressure x horizon; exact amounts and fixed caps ensure
  // observed changes are caused by cumulative pressure, not local rejection.
  for(const horizon of [4,8,32,128])for(const pressure of [.5,1,2,4]){
    const unit=500000+4*Math.floor(rng()*125000),budget=unit*horizon/pressure;
    add(`budget_h${horizon}_p${pressure}`,pressure<=1,baseContract({budget:money(budget),perTransaction:money(unit),maxTransactions:1000}),Array(horizon).fill(unit));
  }
  for(const horizon of [8,32,128])for(const duplicateRate of [0,.125,.5,.875]){
    const duplicates=Math.floor((horizon-1)*duplicateRate),refs=Array.from({length:horizon},(_,i)=>i>0&&i<=duplicates?'invoice-0':`invoice-${i}`);
    add(`replay_h${horizon}_r${duplicateRate}`,duplicates===0,baseContract({budget:money(horizon*1e6),perTransaction:'1',maxTransactions:1000}),Array(horizon).fill(1e6),refs);
  }
  for(const repair of [false,true])for(const ratio of [.8,1,1.2,2]){
    add(`repair_allowed${Number(repair)}_ratio${ratio}`,ratio<=1||repair,baseContract({budget:'100',repairResources:repair?['api:search']:[]}),[Math.round(5e6*ratio)]);
  }
  return rows;
}
export function analyzeSeeds(results){
  const familyRows=[],seedRows=[];
  for(const r of results)for(const s of r.summaries){seedRows.push({seed:r.metadata.seed,method:s.id,unsafeRate:s.attackSuccessRate,completion:s.benignCompletionRate,corpusHash:r.metadata.corpusHash});for(const [family,f]of Object.entries(s.categories))familyRows.push({seed:r.metadata.seed,method:s.id,family,...f,unsafeRate:f.unsafe/f.trajectories,completion:f.completed/f.trajectories});}
  const paired=[],leaveOneOut=[];
  for(const m of METHODS.filter(m=>m.id!=='sentinel'))for(const metric of ['unsafeRate','completion']){
    const benign=metric==='completion',clusters={};
    for(const r of familyRows.filter(r=>r.method===m.id&&r.benign===benign)){const s=familyRows.find(s=>s.method==='sentinel'&&s.seed===r.seed&&s.family===r.family);(clusters[r.family]??=[]).push(s[metric]-r[metric]);}
    paired.push({baseline:m.id,metric,direction:metric==='unsafeRate'?'negative favors Sentinel':'positive favors Sentinel',...clusterInterval(clusters)});
  }
  for(const m of METHODS)for(const metric of ['unsafeRate','completion']){
    const rows=familyRows.filter(r=>r.method===m.id&&r.benign===(metric==='completion')),families=[...new Set(rows.map(r=>r.family))];
    for(const excluded of families)leaveOneOut.push({method:m.id,metric,excludedFamily:excluded,estimate:mean(rows.filter(r=>r.family!==excluded).map(r=>r[metric]))});
  }
  const repairMix=[];
  for(const m of METHODS){const clean=familyRows.filter(r=>r.method===m.id&&r.benign),normal=mean(clean.filter(r=>r.family!=='benign_explicit_repair').map(r=>r.completion)),repair=mean(clean.filter(r=>r.family==='benign_explicit_repair').map(r=>r.completion));for(const prevalence of [0,.1,.25,.5,1])repairMix.push({method:m.id,repairPrevalence:prevalence,expectedCompletion:(1-prevalence)*normal+prevalence*repair});}
  return {seedRows,familyRows,paired,leaveOneOut,repairMix};
}
export function csv(path,rows){if(!rows.length)return;const keys=Object.keys(rows[0]),escape=v=>'"'+String(typeof v==='object'?JSON.stringify(v):v??'').replaceAll('"','""')+'"';writeFileSync(path,keys.map(escape).join(',')+'\n'+rows.map(r=>keys.map(k=>escape(r[k])).join(',')).join('\n')+'\n');}
export async function runExperiments({seeds=[402,403,404,405,406],repetitions=50,out='artifacts/experiments',systems=true,onProgress=console.log}={}){
  if(!seeds.length||new Set(seeds).size!==seeds.length||seeds.some(s=>!Number.isInteger(s)||s<0||s>4294967295)||!Number.isInteger(repetitions)||repetitions<1||repetitions>1000)throw new Error('Invalid seeds/repetitions');
  const directory=resolve(out);mkdirSync(directory,{recursive:true});const results=[];
  for(const seed of seeds){onProgress(`Paired policy suite: seed ${seed}`);const r=runBenchmark({seed,repetitions});writeResults(r,resolve(directory,`seed-${seed}`));results.push(r);}
  const analysis=analyzeSeeds(results),sensitivity=runBenchmark({seed:seeds[0],repetitions:1,trajectories:sensitivityCorpus(seeds[0]),suite:'sentinel-sensitivity-v1'});writeResults(sensitivity,resolve(directory,'sensitivity'));
  const sensitivityRows=sensitivity.summaries.flatMap(s=>Object.entries(s.categories).map(([condition,r])=>({method:s.id,condition,...r})));
  for(const [name,rows]of Object.entries({...analysis,sensitivity:sensitivityRows}))csv(resolve(directory,`${name}.csv`),rows);
  const stress=systems?await runStress({out:resolve(directory,'systems'),onProgress}):null;
  onProgress('Randomized stateful service trajectories');const randomized=await runRandomized({seed:seeds[0],out:resolve(directory,'randomized')});
  const sourceFiles=['research/experiments.mjs','research/statistics.mjs','research/run.mjs','research/corpus.mjs','research/baselines.mjs','research/oracle.mjs','research/stress.mjs','research/stress-worker.mjs','research/randomized.mjs','src/domain.mjs','src/service.mjs','src/store.mjs','src/adapter.mjs'];
  const summary={metadata:{suite:'sentinel-research-experiments-v1',generatedAt:new Date().toISOString(),seeds,repetitions,sourceHash:createHash('sha256').update(sourceFiles.map(p=>p+'\n'+readFileSync(new URL('../'+p,import.meta.url),'utf8')).join('\n')).digest('hex'),node:process.version,
    warning:'Synthetic, paired mechanism evaluation. Family-cluster bootstrap intervals describe sensitivity within these hand-designed families; not a representative population confidence claim. Leave-one-family-out is composition sensitivity, not unseen-family training/test generalization. Repair prevalence is a reweighting calculation. System timings include SQLite and sandbox, not a real payment network.'},
    counts:{seeds:seeds.length,policyTrajectories:results.reduce((n,r)=>n+r.metadata.trajectoryCount,0),methods:METHODS.length,sensitivityConditions:sensitivity.metadata.trajectoryCount,contentionCells:stress?.contention.length??0,faultCells:stress?.faults.length??0,recoveryCases:stress?.recovery.length??0,randomizedProposals:randomized.metadata.proposals},randomized,
    seedRows:analysis.seedRows,paired:analysis.paired,repairMix:analysis.repairMix,systems:stress?{invariantFailures:stress.invariantFailures}:null};
  writeFileSync(resolve(directory,'summary.json'),JSON.stringify(summary,null,2));
  writeFileSync(resolve(directory,'results.md'),`# Expanded Sentinel402 experiments\n\n${summary.metadata.warning}\n\n${summary.counts.policyTrajectories} trajectories across ${seeds.length} seeds, ${METHODS.length} methods; ${summary.counts.sensitivityConditions} sensitivity conditions; ${summary.counts.contentionCells} contention cells, ${summary.counts.faultCells} fault cells, ${summary.counts.recoveryCases} recovery cases.\n\n## Paired differences: Sentinel minus baseline\n\nFamily-macro averages; intervals resample entire families. Zero-width intervals do not bound unseen risk.\n\n| Baseline | Metric | Difference | Family bootstrap 95% interval |\n|---|---|---:|---|\n`+analysis.paired.map(r=>`| ${r.baseline} | ${r.metric} | ${r.estimate.toFixed(4)} | [${r.ci95.map(x=>x.toFixed(4)).join(', ')}] |`).join('\n')+`\n\n## Files\n\n- Per-seed raw corpus, traces, metrics and LaTeX tables: seed-*/\n- Family breakdown: familyRows.csv\n- Leave-one-family-out composition sensitivity: leaveOneOut.csv\n- Repair prevalence reweighting: repairMix.csv\n- Budget pressure / horizon / replay / repair: sensitivity.csv and sensitivity/\n- Real SQLite contention, faults and restart boundaries: systems/\n\nSystem invariant failures: ${stress?.invariantFailures??'not run'}. Live-model experiments remain separate from these results.\n`);
  appendFileSync(resolve(directory,'results.md'),`\nRandomized actual-service stress: ${randomized.metadata.proposals} proposals; ${randomized.invariantFailures} invariant failures. Raw stimuli, contracts and state/effect evidence are in randomized/.\n`);
  onProgress(`Saved expanded experiments to ${directory}`);return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2),opt=(k,v)=>args.includes(k)?args[args.indexOf(k)+1]:v;await runExperiments({seeds:opt('--seeds','402,403,404,405,406').split(',').map(Number),repetitions:Number(opt('--repetitions',50)),out:opt('--out','artifacts/experiments'),systems:!args.includes('--skip-systems')});}
