import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { SolanaDevnetAdapter } from '../src/solana-devnet.mjs';
import { Sentinel } from '../src/service.mjs';
import { demoContract } from '../src/demo.mjs';

function fixture(t, { wrongChain = false, wrongAmount = false, lostResponse = false } = {}) {
  const store = new Store(); t.after(() => store.close());
  let sends = 0, prepared = 0, confirmed = false;
  const action = { intentId: 'test', amount: 1_000_000, recipient: 'recipient', resource: 'api:search', reference: 'invoice' };
  const invoices = new Map([['invoice', { ...action, payer: 'payer', mint: 'mint', expiresAt: Date.now() + 60_000 }]]);
  const adapter = new SolanaDevnetAdapter(store, { payer: 'payer', mint: 'mint', invoices,
    prepareTransfer: async () => { prepared++; return { signature: 'signature', wire: 'signed-wire', source: 'source', destination: 'destination', tokenProgram: 'token-program', lastValidHeight: 100 }; },
    rpc: async (method, args) => {
      if (method === 'getGenesisHash') return wrongChain ? 'mainnet' : 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
      if (method === 'sendTransaction') { sends++; assert.equal(args[0], 'signed-wire'); confirmed = true; if (lostResponse) throw new Error('LOST_RESPONSE'); return 'signature'; }
      if (method === 'getSignatureStatuses') return { value: [confirmed ? { confirmationStatus: 'confirmed', err: null } : null] };
      if (method === 'getTransaction') return { slot: 42, meta: { err: null }, transaction: { signatures: ['signature'], message: { instructions: [
        { programId: 'token-program', parsed: { type: 'transferChecked', info: { source: 'source', destination: 'destination', authority: 'payer', mint: 'mint', tokenAmount: { amount: wrongAmount ? '999' : '1000000', decimals: 6 } } } },
      ] } } };
      throw new Error('Unexpected RPC');
    } });
  return { store, adapter, action, counts: () => ({ sends, prepared }) };
}
test('devnet outbox reuses one signed transaction and verifies the exact confirmed token effect', async t => {
  const f = fixture(t);
  const a = await f.adapter.pay(f.action, 'key'), b = await f.adapter.pay(f.action, 'key');
  assert.equal(a.status, 'succeeded'); assert.equal(b.transaction, a.transaction);
  assert.deepEqual(f.counts(), { sends: 1, prepared: 1 });
  await assert.rejects(f.adapter.pay({ ...f.action, amount: 2_000_000 }, 'key'), /MISMATCH/);
});
test('devnet fails closed on wrong chain before signing or broadcasting', async t => {
  const f = fixture(t, { wrongChain: true }); await assert.rejects(f.adapter.pay(f.action, 'key'), /GENESIS/);
  assert.deepEqual(f.counts(), { sends: 0, prepared: 0 });
});
test('untrusted invoice changes cannot reach signing', async t => {
  const f = fixture(t); assert.equal((await f.adapter.pay({ ...f.action, amount: 500_000 }, 'key')).status, 'failed');
  assert.deepEqual(f.counts(), { sends: 0, prepared: 0 });
});
test('lost send response is uncertain until lookup verifies a confirmed effect', async t => {
  const f = fixture(t, { lostResponse: true });
  assert.equal((await f.adapter.pay(f.action, 'key')).status, 'unknown');
  assert.equal((await f.adapter.lookup('key')).status, 'succeeded');
  assert.equal(f.counts().sends, 1);
});
test('a successful signature with the wrong transfer amount is not a verified receipt', async t => {
  const f = fixture(t, { wrongAmount: true });
  assert.equal((await f.adapter.pay(f.action, 'key')).status, 'unknown');
  assert.equal((await f.adapter.lookup('key')).reason, 'TOKEN_EFFECT_NOT_VERIFIED');
});

test('invoice expiry and adapter configuration changes fail closed', async t => {
  const f = fixture(t);
  f.adapter.invoices.get('invoice').expiresAt = Date.now() - 1000;
  assert.equal((await f.adapter.pay(f.action, 'expired')).reason, 'TRUSTED_INVOICE_MISMATCH');
  assert.equal(f.counts().prepared, 0);
  f.adapter.invoices.get('invoice').expiresAt = Date.now() + 60000;
  await f.adapter.pay(f.action, 'key');
  f.adapter.mint = 'another-mint';
  await assert.rejects(f.adapter.lookup('key'), /CONFIGURATION_MISMATCH/);
  await assert.rejects(f.adapter.pay(f.action, 'key'), /CONFIGURATION_MISMATCH/);
  assert.equal(f.counts().sends, 1);
});

test('Sentinel retains devnet authority on lost response and commits only after verified reconciliation', async t => {
  const f = fixture(t, { lostResponse: true }), service = new Sentinel(f.store, f.adapter);
  const { contract } = service.createIntent(demoContract(Date.now(), { budget: '1', perTransaction: '1', recipients: ['recipient'], resources: ['api:search'] }));
  const raw = { ...f.action, intentId: contract.id, amount: '1' };
  const result = await service.execute(raw, contract.id);
  assert.equal(result.status, 'unknown'); assert.equal(result.mode, 'solana-devnet');
  assert.equal(f.store.intents()[0].reserved, 1_000_000); assert.equal(f.store.intents()[0].committed, 0);
  const retry = await service.execute({ ...raw, reference: 'another-invoice' }, contract.id);
  assert.equal(retry.decision, 'Block');
  assert.equal((await service.reconcile(result.transactionId)).status, 'succeeded');
  assert.equal(f.store.intents()[0].committed, 1_000_000); assert.equal(f.store.intents()[0].reserved, 0);
  assert.equal(f.counts().sends, 1); assert.equal(f.store.verifyAudit().valid, true);
});
