import { evaluate } from '../src/domain.mjs';

const allow = a => ({ decision: 'Allow', executable: a, reasons: ['BASELINE_ALLOW'] });
const block = () => ({ decision: 'Block', executable: null, reasons: ['BASELINE_REJECT'] });
export const METHODS = [
  { id: 'unguarded', name: 'Unguarded', kind: 'baseline', run: a => allow(a) },
  { id: 'per_tx_cap', name: 'Per-transaction cap', kind: 'baseline', run: (a,c) => a.amount <= c.perTransaction ? allow(a) : block() },
  { id: 'allowlist', name: 'Recipient allowlist', kind: 'baseline', run: (a,c) => c.recipients.includes(a.recipient) ? allow(a) : block() },
  { id: 'stateless', name: 'Stateless policy', kind: 'baseline', run: (a,c,s,t) => evaluate(a,c,s,t,{ budget:false, count:false, replay:false, frequency:false, repair:false }) },
  { id: 'budget_ledger', name: 'Budget + count ledger', kind: 'baseline', run: (a,c,s,t) => evaluate(a,c,s,t,{ replay:false, frequency:false, repair:false }) },
  { id: 'strict_stateful', name: 'Strict stateful monitor', kind: 'strong baseline', run: (a,c,s,t) => evaluate(a,c,s,t,{ repair:false }) },
  { id: 'no_budget', name: 'Sentinel − budget', kind: 'ablation', run: (a,c,s,t) => evaluate(a,c,s,t,{ budget:false }) },
  { id: 'no_count', name: 'Sentinel − count', kind: 'ablation', run: (a,c,s,t) => evaluate(a,c,s,t,{ count:false }) },
  { id: 'no_replay', name: 'Sentinel − replay', kind: 'ablation', run: (a,c,s,t) => evaluate(a,c,s,t,{ replay:false }) },
  { id: 'no_binding', name: 'Sentinel − binding', kind: 'ablation', run: (a,c,s,t) => evaluate(a,c,s,t,{ binding:false }) },
  { id: 'no_frequency', name: 'Sentinel − frequency', kind: 'ablation', run: (a,c,s,t) => evaluate(a,c,s,t,{ frequency:false }) },
  { id: 'sentinel', name: 'Sentinel402', kind: 'proposed', run: (a,c,s,t) => evaluate(a,c,s,t) }
];
