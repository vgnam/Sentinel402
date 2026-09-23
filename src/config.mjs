import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function loadEnv({path=resolve(ROOT,'.env'),env=process.env}={}) {
  if(existsSync(path))for(const [key,value] of Object.entries(parseEnv(readFileSync(path,'utf8'))))if(env[key]===undefined)env[key]=value;
  return env;
}
export function llmConfig(env=process.env) {
  const apiKey=env.OPENAI_API_KEY?.trim(),model=env.OPENAI_MODEL?.trim();
  if(!apiKey||apiKey==='your-provider-api-key'||!model)return null;
  let url;try{url=new URL(env.OPENAI_BASE_URL||'https://api.openai.com/v1');}catch{throw new Error('Invalid OPENAI_BASE_URL');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if((url.protocol!=='https:'&&!(url.protocol==='http:'&&loopback))||url.username||url.password||url.search||url.hash)throw new Error('Provider URL must use HTTPS and cannot contain credentials, query, or fragment');
  const integer=(name,fallback,min,max)=>{const v=Number(env[name]??fallback);if(!Number.isSafeInteger(v)||v<min||v>max)throw new Error(`Invalid ${name}`);return v;};
  const reasoningEffort=env.OPENAI_REASONING_EFFORT?.trim()||null;
  if(reasoningEffort&&!['none','minimal','low','medium','high','xhigh'].includes(reasoningEffort))throw new Error('Invalid OPENAI_REASONING_EFFORT');
  return {apiKey,model,baseUrl:url.href.replace(/\/$/,''),reasoningEffort,
    maxTokens:integer('OPENAI_MAX_TOKENS',2048,256,16384),timeoutMs:integer('OPENAI_TIMEOUT_MS',60000,1000,120000)};
}
