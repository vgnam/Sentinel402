import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Store } from '../src/store.mjs';
import { SolanaLocalAdapter } from '../src/solana-local.mjs';
import { SolanaDevnetAdapter } from '../src/solana-devnet.mjs';
import { testNetwork, localEndpoint, DEVNET_GENESIS, PUBLIC_GENESIS } from '../src/solana-network.mjs';
import { demoOptions } from '../integrations/solana/demo-options.mjs';

const GENESIS = '11111111111111111111111111111111';
function config(overrides = {}) {
  return { endpoint: 'http://127.0.0.1:8899', genesis: GENESIS, payer: 'payer', mint: 'mint', invoices: new Map(),
    rpc: async () => GENESIS, prepareTransfer: async () => { throw new Error('MUST_NOT_SIGN'); }, ...overrides };
}

test('local mode accepts only numeric loopback HTTP and rejects public cluster genesis hashes', () => {
  assert.equal(localEndpoint(), 'http://127.0.0.1:8899');
  assert.equal(localEndpoint('http://[::1]:8899/'), 'http://[::1]:8899');
  for (const endpoint of ['https://api.devnet.solana.com', 'http://192.168.1.5:8899', 'http://localhost:8899',
    'http://127.0.0.1:8899/proxy', 'http://user:password@127.0.0.1:8899', 'http://127.0.0.1:8899/?url=mainnet']) {
    assert.throws(() => testNetwork({ network: 'local', endpoint, genesis: GENESIS }), /LOOPBACK/);
  }
  for (const genesis of [...PUBLIC_GENESIS, '', 'garbage', undefined]) {
    assert.throws(() => testNetwork({ network: 'local', genesis }), /LOCAL_GENESIS/);
  }
  assert.throws(() => testNetwork({ network: 'mainnet' }), /TEST_NETWORK/);
});

test('devnet entry point cannot be switched to local through caller options', async t => {
  const store = new Store(); t.after(() => store.close());
  const a = new SolanaDevnetAdapter(store, config({ network: 'local' }));
  assert.equal(a.mode, 'solana-devnet');
  await assert.rejects(a.pay({}, 'key'), /DEVNET_GENESIS/);
});

test('a reset or public-network proxy is rejected before local signing or broadcasting', async t => {
  const store = new Store(); t.after(() => store.close()); let current = GENESIS;
  const a = new SolanaLocalAdapter(store, config({ rpc: async () => current }));
  assert.equal(a.mode, 'solana-local'); await a.assertNetwork();
  for (current of ['21111111111111111111111111111111', DEVNET_GENESIS]) {
    await assert.rejects(a.pay({}, 'key'), /LOCAL_GENESIS_CHANGED/);
    await assert.rejects(a.lookup('key'), /LOCAL_GENESIS_CHANGED/);
  }
});

test('persisted adapter store refuses a changed chain or local/devnet reuse', t => {
  const store = new Store(); t.after(() => store.close());
  new SolanaLocalAdapter(store, config());
  assert.doesNotThrow(() => new SolanaLocalAdapter(store, config()));
  assert.throws(() => new SolanaLocalAdapter(store, config({ genesis: '21111111111111111111111111111111' })), /OUTBOX_NETWORK/);
  assert.throws(() => new SolanaDevnetAdapter(store, config()), /OUTBOX_NETWORK/);
});

test('local receipts verify exact token effects and retries do not broadcast twice', async t => {
  const store = new Store(); t.after(() => store.close()); let sent = 0;
  const action = { intentId: 'local-test', amount: 1000000, recipient: 'merchant', resource: 'api:test', reference: 'invoice' };
  const a = new SolanaLocalAdapter(store, config({
    invoices: new Map([['invoice', { ...action, payer: 'payer', mint: 'mint', expiresAt: Date.now() + 60000 }]]),
    prepareTransfer: async () => ({ signature: 'local-signature', wire: 'signed-wire', source: 'source', destination: 'destination', tokenProgram: 'token-program', lastValidHeight: 500 }),
    rpc: async method => {
      if (method === 'getGenesisHash') return GENESIS;
      if (method === 'sendTransaction') { sent++; throw new Error('LOST_RESPONSE'); }
      if (method === 'getSignatureStatuses') return { value: [sent ? { confirmationStatus: 'confirmed', err: null } : null] };
      if (method === 'getTransaction') return { slot: 1, meta: { err: null }, transaction: { signatures: ['local-signature'], message: { instructions: [
        { programId: 'token-program', parsed: { type: 'transferChecked', info: { source: 'source', destination: 'destination', authority: 'payer', mint: 'mint', tokenAmount: { amount: '1000000', decimals: 6 } } } },
      ] } } };
      throw new Error('UNEXPECTED_RPC');
    },
  }));
  assert.equal((await a.pay(action, 'key')).status, 'unknown');
  const receipt = await a.lookup('key');
  assert.equal(receipt.status, 'succeeded'); assert.equal(receipt.mode, 'solana-local'); assert.equal(receipt.genesis, GENESIS);
  assert.equal(receipt.explorer, undefined); assert.equal((await a.pay(action, 'key')).transaction, receipt.transaction);
  assert.equal(sent, 1);
});

test('local demo gets fresh isolated runs, explicit resume IDs and no devnet RPC overrides', () => {
  const root = resolve('.'), a = demoOptions(['--local'], root), b = demoOptions(['--local'], root);
  assert.notEqual(a.runId, b.runId); assert.notEqual(a.data, b.data);
  const c = demoOptions(['--local', '--run-id', 'repeat-1'], root);
  assert.equal(c.data, demoOptions(['--local', '--run-id', 'repeat-1'], root).data);
  assert.equal(demoOptions([], root).data, resolve(root, 'data/devnet'));
  for (const args of [['--run-id', 'x'], ['--rpc', 'http://127.0.0.1:8899'], ['--local', '--run-id', '../devnet'],
    ['--local', '--rpc', 'https://api.devnet.solana.com'], ['--local', '--reset'], ['--local', '--run-id']]) assert.throws(() => demoOptions(args, root));
});
