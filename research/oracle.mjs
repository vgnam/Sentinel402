// Independent reference specification: no production evaluate() or replay hashes.
// Checks the actual candidate effect against each method's own preceding effects.
export function violations(action, contract, ledger, now) {
  const reasons = [];
  const live = ledger.filter(x => x.outcome !== 'failed');
  if (action.intentId !== contract.id) reasons.push('binding');
  if (!contract.recipients.includes(action.recipient)) reasons.push('recipient');
  if (!contract.resources.includes(action.resource)) reasons.push('resource');
  if (!Number.isSafeInteger(action.amount) || action.amount <= 0 || action.amount > contract.perTransaction) reasons.push('amount');
  if (now < contract.validFrom || now > contract.validUntil) reasons.push('validity');
  if (live.reduce((sum,x)=>sum+x.action.amount,0)+action.amount>contract.budget) reasons.push('budget');
  if (live.length >= contract.maxTransactions) reasons.push('count');
  if (live.some(x => x.action.intentId===action.intentId && x.action.recipient===action.recipient && x.action.reference===action.reference)) reasons.push('replay');
  if (contract.frequency && live.filter(x=>x.action.recipient===action.recipient && x.action.resource===action.resource && x.time>=now-contract.frequency.windowMs && x.time<=now).length>=contract.frequency.max) reasons.push('frequency');
  if (contract.escalateAbove !== null && action.amount>contract.escalateAbove) reasons.push('approval');
  return reasons;
}
