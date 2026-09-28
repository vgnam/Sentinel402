import { DatabaseSync } from 'node:sqlite';
import { hash } from '../src/domain.mjs';

// An independent durable fixture ledger, not the monitor's transaction database.
// This models a remote payment service's durable effects; no real funds move.
export class ExternalLedger {
  constructor(path, { outcome = 'succeeded' } = {}) {
    this.mode = 'sandbox';
    this.db = new DatabaseSync(path);
    this.outcome = outcome;
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS effects(id TEXT PRIMARY KEY, action_hash TEXT NOT NULL, action TEXT NOT NULL, receipt TEXT NOT NULL);`);
  }
  async pay(action, key) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db.prepare('SELECT * FROM effects WHERE id=?').get(key);
      if (previous && previous.action_hash !== hash(action)) throw new Error('Idempotency payload mismatch');
      const receipt = previous ? JSON.parse(previous.receipt) : { status: this.outcome, mode: this.mode, transaction: `fixture_${key}` };
      if (!previous) this.db.prepare('INSERT INTO effects VALUES(?,?,?,?)').run(key, hash(action), JSON.stringify(action), JSON.stringify(receipt));
      this.db.exec('COMMIT');
      return receipt;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async lookup(key) {
    const row = this.db.prepare('SELECT receipt FROM effects WHERE id=?').get(key);
    return row ? JSON.parse(row.receipt) : { status: 'unknown', mode: this.mode, reason: 'NO_CONCLUSIVE_RECEIPT' };
  }
  effects() { return this.db.prepare('SELECT * FROM effects').all().map(row => ({ id: row.id, action: JSON.parse(row.action), receipt: JSON.parse(row.receipt) })); }
  close() { this.db.close(); }
}
