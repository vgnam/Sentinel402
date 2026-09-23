import { randomUUID, randomBytes } from 'node:crypto';
import { contract, proposal, hash, fingerprint, invoiceKey, evaluate, InputError } from './domain.mjs';

export class Sentinel {
  constructor(store, adapter, { clock = Date.now, paymentTimeoutMs = 5000 } = {}) {
    this.store = store; this.adapter = adapter; this.clock = clock; this.paymentTimeoutMs = paymentTimeoutMs;
  }
  createIntent(input) {
    const id = `int_${randomUUID()}`, c = contract(input, id), token = `s402_agent_${randomBytes(32).toString('hex')}`;
    this.store.atomic(() => {
      this.store.db.prepare('INSERT INTO intents(id,contract,created_at) VALUES(?,?,?)').run(id, JSON.stringify(c), this.clock());
      this.store.db.prepare('INSERT INTO grants VALUES(?,?)').run(hash(token), id);
      this.store.audit({ event: 'intent.created', intentId: id, contract: c, time: this.clock() });
    });
    return { contract: c, agentToken: token };
  }
  resolveGrant(token) { return this.store.db.prepare('SELECT intent_id FROM grants WHERE token_hash=?').get(hash(token))?.intent_id; }
  revoke(id) {
    return this.store.atomic(() => {
      if (!this.store.intent(id)) throw new InputError('Unknown intent');
      this.store.db.prepare('UPDATE intents SET revoked=1 WHERE id=?').run(id);
      this.store.audit({ event: 'intent.revoked', intentId: id, time: this.clock() });
      return { revoked: true, intentId: id };
    });
  }
  reserve(raw, boundIntent) {
    return this.store.atomic(() => {
      const now = this.clock();
      let a, c, s, result;
      try {
        a = proposal(raw); c = this.store.intent(boundIntent);
        if (!c) throw new InputError('Unknown bound intent', 'UNKNOWN_INTENT');
        s = this.store.state(boundIntent);
        result = evaluate(a, c, s, now);
      } catch (error) {
        if (!(error instanceof InputError) && !(error instanceof TypeError)) throw error;
        result = { decision: 'Block', reasons: [error.code ?? 'NORMALIZATION_FAILED'], executable: null, message: error.message };
      }
      let transactionId = null;
      if (result.executable) {
        transactionId = `txn_${randomUUID()}`;
        this.store.db.prepare('INSERT INTO transactions(id,intent_id,action,original,fingerprint,invoice_key,amount,decision,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run(transactionId, c.id, JSON.stringify(result.executable), JSON.stringify(raw), fingerprint(a), invoiceKey(a), result.executable.amount, result.decision, 'reserved', now);
      }
      const auditHead = this.store.audit({ event: 'payment.proposed', intentId: boundIntent, original: raw, ...result, transactionId,
        stateBefore: s ? { encumbered: s.spent, usedSlots: s.count } : null, time: now });
      return { ...result, transactionId, auditHead, status: transactionId ? 'reserved' : 'not_executed', mode: 'sandbox' };
    });
  }
  finish(id, receipt) {
    return this.store.atomic(() => {
      const tx = this.store.transaction(id);
      if (!tx) throw new InputError('Unknown transaction');
      if (['succeeded','failed'].includes(tx.status)) return tx;
      const status = ['succeeded','failed'].includes(receipt?.status) ? receipt.status : 'unknown';
      this.store.db.prepare('UPDATE transactions SET status=?,receipt=? WHERE id=?').run(status, JSON.stringify(receipt ?? {status}), id);
      this.store.audit({ event: `payment.${status}`, intentId: tx.intentId, transactionId: id, receipt: receipt ?? {status}, time: this.clock() });
      return this.store.transaction(id);
    });
  }
  async execute(raw, boundIntent) {
    const result = this.reserve(raw, boundIntent);
    if (!result.executable) return result;
    let timer, receipt;
    try {
      receipt = await Promise.race([
        this.adapter.pay(Object.freeze({ ...result.executable }), result.transactionId),
        new Promise(resolve => { timer = setTimeout(() => resolve({ status: 'unknown', reason: 'ADAPTER_TIMEOUT' }), this.paymentTimeoutMs); })
      ]);
    } catch { receipt = { status: 'unknown', reason: 'ADAPTER_ERROR' }; }
    finally { clearTimeout(timer); }
    const tx = this.finish(result.transactionId, receipt);
    return { ...result, status: tx.status, receipt: tx.receipt };
  }
  async reconcile(id) {
    const tx = this.store.transaction(id);
    if (!tx) throw new InputError('Unknown transaction');
    if (['succeeded','failed'].includes(tx.status)) return tx;
    // Absence/timeout is not evidence of failure. Never release ambiguous funds.
    let receipt;
    try { receipt = await this.adapter.lookup(id); }
    catch { receipt = { status: 'unknown', reason: 'LOOKUP_FAILED' }; }
    return this.finish(id, receipt);
  }
}
