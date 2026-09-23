import { createHash } from 'node:crypto';

export const SCALE = 1_000_000;
export const MAX_UNITS = 1_000_000 * SCALE;
export class InputError extends Error {
  constructor(message, code = 'INVALID_INPUT') { super(message); this.code = code; }
}
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError(`${label} must be an object`);
  return value;
}
export function only(value, fields) {
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new InputError(`Unexpected field: ${key}`);
}
export function text(value, label, max = 160) {
  if (typeof value !== 'string' || !value.length || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) throw new InputError(`Invalid ${label}`);
  return value;
}
export function units(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(value)) throw new InputError('Amount must be a positive decimal string with at most 6 fractional digits');
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * SCALE + Number(fraction.padEnd(6, '0'));
  if (!Number.isSafeInteger(result) || result <= 0 || result > MAX_UNITS) throw new InputError('Amount must be greater than zero and at most 1,000,000 USDC');
  return result;
}
export const money = value => (value / SCALE).toFixed(6);
export function identifier(value, label) {
  text(value, label, 512);
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return value.toLowerCase();
  if (/^https:\/\//.test(value)) {
    const url = new URL(value);
    if (url.username || url.password || url.hash) throw new InputError(`Invalid ${label}: credentials and fragments are forbidden`);
    return url.href;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:._/-]{0,159}$/.test(value)) throw new InputError(`Invalid ${label}`);
  return value;
}
function integer(value, label, min = 1, max = 100_000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new InputError(`Invalid ${label}`);
  return value;
}
function instant(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new InputError(`${label} must be an ISO UTC timestamp`);
  const millis = Date.parse(value);
  if (new Date(millis).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) throw new InputError(`Invalid ${label}`);
  return millis;
}
export function contract(input, id) {
  object(input, 'Contract');
  only(input, ['name','purpose','budget','perTransaction','recipients','resources','validFrom','validUntil','maxTransactions','frequency','repairResources','escalateAbove']);
  const list = (value, label) => {
    if (!Array.isArray(value) || !value.length || value.length > 100) throw new InputError(`${label} must contain 1–100 identifiers`);
    return [...new Set(value.map(x => identifier(x, label)))];
  };
  const c = { id, name: text(input.name, 'name', 80), purpose: text(input.purpose, 'purpose', 500),
    budget: units(input.budget), perTransaction: units(input.perTransaction),
    recipients: list(input.recipients, 'recipients'), resources: list(input.resources, 'resources'),
    validFrom: instant(input.validFrom, 'validFrom'), validUntil: instant(input.validUntil, 'validUntil'),
    maxTransactions: integer(input.maxTransactions, 'maxTransactions'), repairResources: [], frequency: null, escalateAbove: null };
  if (c.validUntil <= c.validFrom) throw new InputError('Validity interval must be increasing');
  if (c.perTransaction > c.budget) throw new InputError('Per-transaction limit exceeds budget');
  if (input.frequency != null) {
    object(input.frequency, 'frequency'); only(input.frequency, ['max','windowSeconds']);
    c.frequency = { max: integer(input.frequency.max, 'frequency.max'), windowMs: integer(input.frequency.windowSeconds, 'frequency.windowSeconds', 1, 86_400) * 1000 };
  }
  if (input.repairResources != null) {
    if (!Array.isArray(input.repairResources)) throw new InputError('repairResources must be an array');
    c.repairResources = input.repairResources.length ? list(input.repairResources, 'repairResources') : [];
    if (c.repairResources.some(r => !c.resources.includes(r))) throw new InputError('Repair resources must be authorized resources');
  }
  if (input.escalateAbove != null) c.escalateAbove = units(input.escalateAbove);
  return c;
}
export function proposal(input) {
  object(input, 'Proposal');
  only(input, ['intentId','amount','recipient','resource','reference','note']);
  const a = { intentId: text(input.intentId, 'intentId', 100), amount: units(input.amount),
    recipient: identifier(input.recipient, 'recipient'), resource: identifier(input.resource, 'resource'),
    reference: text(input.reference, 'reference', 160) };
  if (input.note != null) text(input.note, 'note', 1000); // Untrusted prose is never authority.
  return a;
}
export const fingerprint = a => hash([a.intentId, a.recipient, a.resource, a.amount, a.reference]);
// An invoice cannot be re-used with a changed amount/resource to evade the fingerprint.
export const invoiceKey = a => hash([a.intentId, a.recipient, a.reference]);
export const emptyState = () => ({ spent: 0, count: 0, history: [], fingerprints: [], invoices: [], revoked: false });

/** Pure deterministic evaluator. Options are used only by the offline research harness. */
export function evaluate(a, c, s, now, options = {}) {
  const { budget = true, count = true, replay = true, frequency = true, binding = true, repair = true } = options;
  const hard = [];
  if (s.revoked) hard.push('INTENT_REVOKED');
  if (binding && a.intentId !== c.id) hard.push('INTENT_MISMATCH');
  if (!c.recipients.includes(a.recipient)) hard.push('RECIPIENT_NOT_ALLOWED');
  if (!c.resources.includes(a.resource)) hard.push('RESOURCE_NOT_ALLOWED');
  if (now < c.validFrom || now > c.validUntil) hard.push('OUTSIDE_VALIDITY');
  if (replay && (s.fingerprints.includes(fingerprint(a)) || s.invoices.includes(invoiceKey(a)))) hard.push('REPLAY_DETECTED');
  const canRepair = repair && a.amount > c.perTransaction && c.repairResources.includes(a.resource);
  const executable = { ...a, amount: canRepair ? c.perTransaction : a.amount };
  if (budget && s.spent + executable.amount > c.budget) hard.push('BUDGET_EXCEEDED');
  if (count && s.count + 1 > c.maxTransactions) hard.push('TRANSACTION_COUNT_EXCEEDED');
  if (frequency && c.frequency && s.history.filter(h => h.recipient === a.recipient && h.resource === a.resource && h.time >= now - c.frequency.windowMs && h.time <= now).length >= c.frequency.max) hard.push('FREQUENCY_EXCEEDED');
  if (hard.length) return { decision: 'Block', reasons: hard, executable: null };
  if (executable.amount > c.perTransaction || (c.escalateAbove !== null && executable.amount > c.escalateAbove)) return { decision: 'Escalate', reasons: ['NEW_AUTHORITY_REQUIRED'], executable: null };
  return { decision: canRepair ? 'Repair' : 'Allow', reasons: [canRepair ? 'EXPLICIT_AMOUNT_CLIP' : 'ALL_CONSTRAINTS_SATISFIED'], executable };
}
