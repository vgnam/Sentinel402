import { hash } from './domain.mjs';

/** Durable, idempotent sandbox only. A real adapter must implement pay + lookup. */
export class SandboxAdapter {
  constructor(store, { delayMs = 20, outcome = 'succeeded' } = {}) {
    this.store = store; this.delayMs = delayMs; this.outcome = outcome;
  }
  async pay(action, key) {
    if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return this.store.atomic(() => {
      const previous = this.store.db.prepare('SELECT * FROM sandbox_ledger WHERE id=?').get(key);
      if (previous) {
        if (previous.action_hash !== hash(action)) throw new Error('Idempotency key payload conflict');
        return JSON.parse(previous.receipt);
      }
      if (this.outcome === 'unknown') return { status: 'unknown', mode: 'sandbox' };
      const receipt = { status: this.outcome, transaction: `sandbox_${key}`, mode: 'sandbox' };
      this.store.db.prepare('INSERT INTO sandbox_ledger VALUES(?,?,?,?)').run(key, hash(action), receipt.status, JSON.stringify(receipt));
      return receipt;
    });
  }
  async lookup(key) {
    const row = this.store.db.prepare('SELECT receipt FROM sandbox_ledger WHERE id=?').get(key);
    return row ? JSON.parse(row.receipt) : { status: 'unknown', mode: 'sandbox' };
  }
}
