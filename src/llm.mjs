import { performance } from 'node:perf_hooks';

export class ProviderError extends Error {
  constructor(code,status=null){super(status?`${code} (HTTP ${status})`:code);this.code=code;this.status=status;}
}
/** OpenAI-compatible Chat Completions transport; never logs keys or raw errors. */
export class LLMClient {
  constructor(config,{fetchImpl=fetch}={}) {this.config=config;this.fetch=fetchImpl;}
  info(){return {configured:true,model:this.config.model,providerHost:new URL(this.config.baseUrl).hostname,reasoningEffort:this.config.reasoningEffort,maxOutputTokens:this.config.maxTokens,timeoutMs:this.config.timeoutMs};}
  async complete(messages,{tools,toolChoice,maxTokens=this.config.maxTokens}={}) {
    const c=this.config,start=performance.now();
    const payload={model:c.model,messages,max_tokens:maxTokens,stream:false,
      ...(c.reasoningEffort?{reasoning_effort:c.reasoningEffort}:{}),
      ...(tools?{tools,tool_choice:toolChoice??'auto'}:{})};
    let response;
    try {response=await this.fetch(`${c.baseUrl}/chat/completions`,{
      method:'POST',redirect:'error',headers:{Authorization:`Bearer ${c.apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(c.timeoutMs)});
    }catch(error){throw new ProviderError(error.name==='TimeoutError'||error.name==='AbortError'?'LLM_TIMEOUT':'LLM_CONNECTION_FAILED');}
    if(!response.ok){await response.body?.cancel();throw new ProviderError('LLM_PROVIDER_REJECTED',response.status);}
    // Bound response buffering without trusting a provider's Content-Length.
    const reader=response.body.getReader();let length=0;const chunks=[];
    try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>2_000_000){await reader.cancel();throw new ProviderError('LLM_RESPONSE_TOO_LARGE');}chunks.push(value);}}
    catch(error){if(error instanceof ProviderError)throw error;throw new ProviderError('LLM_RESPONSE_INTERRUPTED');}
    let result;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ProviderError('LLM_INVALID_JSON');}
    const choice=result.choices?.[0];
    if(!choice?.message||choice.message.role!=='assistant')throw new ProviderError('LLM_INVALID_RESPONSE');
    const usage={};for(const key of ['prompt_tokens','completion_tokens','total_tokens'])if(Number.isFinite(result.usage?.[key]))usage[key]=result.usage[key];
    return {message:choice.message,finishReason:choice.finish_reason??null,usage,latencyMs:performance.now()-start,model:typeof result.model==='string'?result.model:c.model};
  }
}
