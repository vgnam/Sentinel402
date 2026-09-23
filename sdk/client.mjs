export class SentinelClient {
  constructor({baseUrl='http://127.0.0.1:4020',agentToken}) {
    if(!agentToken)throw new Error('agentToken is required');
    this.baseUrl=baseUrl.replace(/\/$/,'');this.agentToken=agentToken;
  }
  async pay(proposal,{signal}={}) {
    const response=await fetch(`${this.baseUrl}/api/payments`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.agentToken}`},body:JSON.stringify(proposal),signal});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error??`HTTP ${response.status}`);
    return result;
  }
}
