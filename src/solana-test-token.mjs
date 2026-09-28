import { hash } from './domain.mjs';
import { testNetwork } from './solana-network.mjs';

/** Optional exact-price SPL test-token adapter. No mainnet and no private key in this module.
 * prepareTransfer is a trusted isolated signer capability, never supplied by an agent.
 * The outbox is committed before any network send; retry always reuses its signed wire.
 */
export class SolanaTestTokenAdapter {
  constructor(store, { rpc, prepareTransfer, payer, mint, invoices, clock = Date.now, ...networkOptions }) {
    const network = testNetwork(networkOptions);
    if (typeof rpc !== 'function' || typeof prepareTransfer !== 'function' || !payer || !mint || !(invoices instanceof Map)) throw new Error('Trusted test-token configuration required');
    this.store = store; this.rpc = rpc; this.prepareTransfer = prepareTransfer;
    this.payer = payer; this.mint = mint; this.invoices = invoices; this.clock = clock; this.mode = network.mode; this.network = Object.freeze(network);
    // The outbox keeps its legacy name so existing devnet demo DBs remain readable.
    store.db.exec(`CREATE TABLE IF NOT EXISTS devnet_outbox(id TEXT PRIMARY KEY, action_hash TEXT NOT NULL, signature TEXT NOT NULL,
      wire TEXT NOT NULL, transfer TEXT NOT NULL, last_valid_height INTEGER NOT NULL, invoice_hash TEXT NOT NULL);`);
    store.db.exec('CREATE TABLE IF NOT EXISTS solana_network(id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL, genesis TEXT NOT NULL);');
    store.atomic(() => {
      const prior = store.db.prepare('SELECT * FROM solana_network WHERE id=1').get();
      if (prior && (prior.mode !== network.mode || prior.genesis !== network.genesis)) throw new Error('OUTBOX_NETWORK_MISMATCH');
      if (!prior && network.mode === 'solana-local' && store.db.prepare('SELECT COUNT(*) AS n FROM devnet_outbox').get().n) throw new Error('LOCAL_REQUIRES_SEPARATE_STORE');
      store.db.prepare('INSERT OR IGNORE INTO solana_network VALUES(1,?,?)').run(network.mode, network.genesis);
    });
  }
  async assertNetwork() {
    if (await this.rpc('getGenesisHash', []) !== this.network.genesis) throw new Error(this.mode === 'solana-local' ? 'LOCAL_GENESIS_CHANGED' : 'DEVNET_GENESIS_REQUIRED');
  }
  async pay(action, key) {
    await this.assertNetwork();
    let row = this.store.db.prepare('SELECT * FROM devnet_outbox WHERE id=?').get(key);
    if (row && row.action_hash !== hash(action)) throw new Error('IDEMPOTENCY_PAYLOAD_MISMATCH');
    if (row && (JSON.parse(row.transfer).mint !== this.mint || JSON.parse(row.transfer).authority !== this.payer)) throw new Error('ADAPTER_CONFIGURATION_MISMATCH');
    if (!row) {
      const invoice = this.invoices.get(action.reference);
      if (!invoice || invoice.amount !== action.amount || invoice.recipient !== action.recipient || invoice.resource !== action.resource ||
          invoice.mint !== this.mint || invoice.payer !== this.payer || !Number.isFinite(invoice.expiresAt) || invoice.expiresAt < this.clock()) {
        return { status: 'failed', reason: 'TRUSTED_INVOICE_MISMATCH', mode: this.mode };
      }
      const prepared = await this.prepareTransfer({ action: { ...action }, key, mint: this.mint, payer: this.payer });
      if (!prepared?.signature || !prepared.wire || !prepared.source || !prepared.destination || !prepared.tokenProgram || !Number.isSafeInteger(prepared.lastValidHeight)) throw new Error('INVALID_SIGNER_RESPONSE');
      const transfer = { source: prepared.source, destination: prepared.destination, authority: this.payer,
        mint: this.mint, amount: String(action.amount), decimals: 6, tokenProgram: prepared.tokenProgram };
      this.store.atomic(() => this.store.db.prepare('INSERT OR IGNORE INTO devnet_outbox VALUES(?,?,?,?,?,?,?)')
        .run(key, hash(action), prepared.signature, prepared.wire, JSON.stringify(transfer), prepared.lastValidHeight, hash(invoice)));
      row = this.store.db.prepare('SELECT * FROM devnet_outbox WHERE id=?').get(key);
      if (row.action_hash !== hash(action)) throw new Error('IDEMPOTENCY_PAYLOAD_MISMATCH');
    }
    const existing = await this.lookup(key);
    if (existing.status !== 'unknown') return existing;
    try {
      const returned = await this.rpc('sendTransaction', [row.wire, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 }]);
      if (returned !== row.signature) return { status: 'unknown', reason: 'SIGNATURE_MISMATCH', mode: this.mode, transaction: row.signature };
    } catch { return { status: 'unknown', reason: 'BROADCAST_UNCERTAIN', mode: this.mode, transaction: row.signature }; }
    return this.lookup(key);
  }
  async lookup(key) {
    await this.assertNetwork();
    const row = this.store.db.prepare('SELECT * FROM devnet_outbox WHERE id=?').get(key);
    if (!row) return { status: 'unknown', reason: 'NO_OUTBOX', mode: this.mode };
    const expected = JSON.parse(row.transfer);
    if (expected.mint !== this.mint || expected.authority !== this.payer) throw new Error('ADAPTER_CONFIGURATION_MISMATCH');
    const base = { mode: this.mode, transaction: row.signature, network: this.mode, genesis: this.network.genesis, mint: this.mint,
      ...(this.mode === 'solana-devnet' ? { explorer: `https://explorer.solana.com/tx/${row.signature}?cluster=devnet` } : { rpc: this.network.endpoint }) };
    const result = await this.rpc('getSignatureStatuses', [[row.signature], { searchTransactionHistory: true }]);
    const status = result?.value?.[0];
    if (!status || !['confirmed', 'finalized'].includes(status.confirmationStatus)) return { ...base, status: 'unknown', reason: 'NOT_CONFIRMED' };
    if (status.err) return { ...base, status: 'failed', reason: 'CONFIRMED_CHAIN_FAILURE' };
    const tx = await this.rpc('getTransaction', [row.signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]);
    if (!tx || tx.meta?.err !== null || !tx.transaction?.signatures?.includes(row.signature)) return { ...base, status: 'unknown', reason: 'RECEIPT_NOT_VERIFIED' };
    const instructions = [...(tx.transaction.message?.instructions ?? []), ...(tx.meta.innerInstructions ?? []).flatMap(i => i.instructions ?? [])];
    const matches = instructions.filter(i => i.programId === expected.tokenProgram && i.parsed?.type === 'transferChecked' &&
      i.parsed.info?.source === expected.source && i.parsed.info.destination === expected.destination &&
      i.parsed.info.authority === expected.authority && i.parsed.info.mint === expected.mint &&
      i.parsed.info.tokenAmount?.amount === expected.amount && i.parsed.info.tokenAmount.decimals === expected.decimals);
    if (matches.length !== 1) return { ...base, status: 'unknown', reason: 'TOKEN_EFFECT_NOT_VERIFIED' };
    return { ...base, status: 'succeeded', amount: expected.amount, slot: tx.slot, finality: status.confirmationStatus };
  }
}
