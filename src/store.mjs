import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonical, hash, emptyState } from './domain.mjs';

export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS intents(id TEXT PRIMARY KEY, contract TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS grants(token_hash TEXT PRIMARY KEY, intent_id TEXT NOT NULL REFERENCES intents(id));
      CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY, intent_id TEXT NOT NULL REFERENCES intents(id), action TEXT NOT NULL, original TEXT NOT NULL, fingerprint TEXT NOT NULL, invoice_key TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), decision TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('reserved','succeeded','failed','unknown')), created_at INTEGER NOT NULL, receipt TEXT);
      CREATE INDEX IF NOT EXISTS transactions_intent ON transactions(intent_id,status);
      CREATE UNIQUE INDEX IF NOT EXISTS live_invoice ON transactions(intent_id,invoice_key) WHERE status != 'failed';
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, record TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sandbox_ledger(id TEXT PRIMARY KEY, action_hash TEXT NOT NULL, status TEXT NOT NULL, receipt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS llm_runs(id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at INTEGER NOT NULL, report TEXT NOT NULL);`);
  }
  atomic(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  intent(id) {
    const row = this.db.prepare('SELECT * FROM intents WHERE id=?').get(id);
    return row ? { ...JSON.parse(row.contract), revoked: Boolean(row.revoked), createdAt: row.created_at } : null;
  }
  state(id) {
    const s = emptyState(); s.revoked = this.intent(id)?.revoked ?? true;
    for (const row of this.db.prepare("SELECT * FROM transactions WHERE intent_id=? AND status!='failed'").all(id)) {
      const a = JSON.parse(row.action);
      s.spent += row.amount; s.count++;
      s.history.push({ recipient: a.recipient, resource: a.resource, time: row.created_at });
      s.fingerprints.push(row.fingerprint); s.invoices.push(row.invoice_key);
    }
    return s;
  }
  audit(record) {
    const prev = this.db.prepare('SELECT hash FROM audit ORDER BY seq DESC LIMIT 1').get()?.hash ?? '0'.repeat(64);
    const encoded = canonical(record), digest = hash(prev + encoded);
    this.db.prepare('INSERT INTO audit(record,prev_hash,hash) VALUES(?,?,?)').run(encoded, prev, digest);
    return digest;
  }
  auditRecords(limit = 100) {
    return this.db.prepare('SELECT * FROM audit ORDER BY seq DESC LIMIT ?').all(limit).map(r => ({ seq: r.seq, ...JSON.parse(r.record), prevHash: r.prev_hash, hash: r.hash }));
  }
  verifyAudit(expectedHead) {
    let head = '0'.repeat(64), count = 0;
    for (const r of this.db.prepare('SELECT * FROM audit ORDER BY seq').iterate()) {
      if (r.prev_hash !== head || hash(head + r.record) !== r.hash) return { valid: false, brokenAt: r.seq, count, head, anchored: Boolean(expectedHead) };
      head = r.hash; count++;
    }
    return { valid: !expectedHead || expectedHead === head, count, head, anchored: Boolean(expectedHead) };
  }
  transaction(id) {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id=?').get(id);
    return row ? { id: row.id, intentId: row.intent_id, action: JSON.parse(row.action), original: JSON.parse(row.original), decision: row.decision, status: row.status, createdAt: row.created_at, receipt: row.receipt ? JSON.parse(row.receipt) : null } : null;
  }
  transactions(limit = 100) {
    return this.db.prepare('SELECT id FROM transactions ORDER BY created_at DESC,rowid DESC LIMIT ?').all(limit).map(r => this.transaction(r.id));
  }
  intents() {
    return this.db.prepare('SELECT id FROM intents ORDER BY created_at DESC,rowid DESC').all().map(({id}) => {
      const c = this.intent(id), s = this.state(id);
      const committed = this.db.prepare("SELECT COALESCE(SUM(amount),0) AS amount,COUNT(*) AS count FROM transactions WHERE intent_id=? AND status='succeeded'").get(id);
      return { ...c, committed: committed.amount, committedCount: committed.count, reserved: s.spent - committed.amount, usedSlots: s.count, available: c.budget - s.spent };
    });
  }
  close() { this.db.close(); }
}
