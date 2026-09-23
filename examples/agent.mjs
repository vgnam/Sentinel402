import { SentinelClient } from '../sdk/client.mjs';
const {SENTINEL_AGENT_TOKEN,SENTINEL_INTENT_ID}=process.env;
if(!SENTINEL_AGENT_TOKEN||!SENTINEL_INTENT_ID)throw new Error('Create an intent in the console, then set SENTINEL_AGENT_TOKEN and SENTINEL_INTENT_ID');
const client=new SentinelClient({agentToken:SENTINEL_AGENT_TOKEN,baseUrl:process.env.SENTINEL_URL});
console.log(await client.pay({intentId:SENTINEL_INTENT_ID,amount:'1.250000',recipient:'merchant:search',resource:'api:search',reference:`example-${Date.now()}`}));
