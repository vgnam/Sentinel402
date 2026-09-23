import { random } from './corpus.mjs';

export const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
export function quantile(xs,p){if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b),i=(s.length-1)*p,lo=Math.floor(i);return s[lo]+(s[Math.ceil(i)]-s[lo])*(i-lo);}
/** Paired family-cluster bootstrap. Each cluster contains matched differences;
 * resampling whole families preserves all seeds/variants within a family.
 * This is descriptive corpus sensitivity, not population-level risk inference. */
export function clusterInterval(clusters,{seed=402,samples=2000}={}){
  const values=Object.values(clusters).map(mean);
  if(!values.length)return {estimate:null,ci95:null,clusters:0};
  const rng=random(seed),draws=[];
  for(let b=0;b<samples;b++)draws.push(mean(values.map(()=>values[Math.floor(rng()*values.length)])));
  return {estimate:mean(values),ci95:[quantile(draws,.025),quantile(draws,.975)],clusters:values.length,samples};
}
