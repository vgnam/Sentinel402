import { Keypair, Connection, Transaction, SystemProgram, TransactionInstruction, PublicKey } from '@solana/web3.js';
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMint2Instruction, createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../../src/store.mjs';
import { Sentinel } from '../../src/service.mjs';
import { SolanaDevnetAdapter, DEVNET_GENESIS } from '../../src/solana-devnet.mjs';
import { demoContract } from '../../src/demo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const data = resolve(root, 'data/devnet'), out = resolve(root, 'artifacts/realism/devnet');
mkdirSync(data, { recursive: true }); mkdirSync(out, { recursive: true });
const walletFile = resolve(data, 'test-wallets.json'), stateFile = resolve(data, 'demo-state.json');
const wallet = existsSync(walletFile) ? JSON.parse(readFileSync(walletFile, 'utf8')) : {
  payer: [...Keypair.generate().secretKey], merchant: [...Keypair.generate().secretKey], mint: [...Keypair.generate().secretKey],
};
if (!existsSync(walletFile)) writeFileSync(walletFile, JSON.stringify(wallet), { mode: 0o600, flag: 'wx' });
const payer = Keypair.fromSecretKey(Uint8Array.from(wallet.payer)), merchant = Keypair.fromSecretKey(Uint8Array.from(wallet.merchant)), mint = Keypair.fromSecretKey(Uint8Array.from(wallet.mint));
const endpoint = 'https://api.devnet.solana.com';
const boundedFetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000), redirect: 'error' });
const connection = new Connection(endpoint, { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: boundedFetch });
let requestId = 0, broadcasts = 0, loseNextResponse = false;
const rpc = async (method, params) => {
  const response = await boundedFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) });
  if (!response.ok) throw Object.assign(new Error(`DEVNET_RPC_HTTP_${response.status}`), { code: `DEVNET_RPC_HTTP_${response.status}` });
  const body = await response.json();
  if (body.error) throw Object.assign(new Error(`DEVNET_RPC_${body.error.code}`), { code: `DEVNET_RPC_${body.error.code}` });
  if (method === 'sendTransaction') { broadcasts++; if (loseNextResponse) { loseNextResponse = false; throw new Error('SIMULATED_LOST_RESPONSE_AFTER_REAL_BROADCAST'); } }
  return body.result;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitSignature = async signature => {
  for (let i = 0; i < 20; i++) {
    const status = (await rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value?.[0];
    if (status && ['confirmed', 'finalized'].includes(status.confirmationStatus)) {
      if (status.err) throw new Error('DEVNET_TRANSACTION_FAILED'); return;
    }
    await sleep(1500);
  }
  throw new Error('DEVNET_CONFIRMATION_PENDING');
};
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const saveState = () => writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 });
// Fixed base58 alphabet, encoding only a signature produced by the official SDK.
function base58(bytes) {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + Buffer.from(bytes).toString('hex')), result = '';
  while (n) { result = alphabet[Number(n % 58n)] + result; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; result = '1' + result; } return result;
}
const report = { generatedAt: new Date().toISOString(), network: 'Solana devnet', status: 'starting',
  asset: 'New six-decimal test token; NOT USDC and NOT money', payer: payer.publicKey.toBase58(), merchant: merchant.publicKey.toBase58(),
  mint: mint.publicKey.toBase58(), rpc: endpoint, transactions: [], limitations: [
    'One client-side SPL test-token adapter; not a deployed Sentinel Solana program or complete x402 protocol integration.',
    'Invoices are pinned by the trusted demo operator; external merchant signatures/provenance are not demonstrated.',
    'Token budgets exclude SOL fees and account rent. Unknown outbox entries never generate a fresh replacement transaction automatically.',
  ] };
let store;
try {
  if (await rpc('getGenesisHash', []) !== DEVNET_GENESIS) throw new Error('DEVNET_GENESIS_REQUIRED');
  const source = getAssociatedTokenAddressSync(mint.publicKey, payer.publicKey), destination = getAssociatedTokenAddressSync(mint.publicKey, merchant.publicKey);
  if (!state.setupConfirmed) {
    const balance = await connection.getBalance(payer.publicKey);
    if (balance < 20_000_000) {
      console.log(`Requesting free devnet SOL for test wallet ${report.payer}`);
      // One request per invocation. Rate limits are reported, never bypassed.
      const faucetSignature = await rpc('requestAirdrop', [report.payer, 100_000_000, { commitment: 'confirmed' }]);
      state.airdropSignature = faucetSignature; saveState(); await waitSignature(faucetSignature);
    }
    if (!state.setupWire) {
      const rent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
      const lifetime = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: lifetime.blockhash }).add(
        SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: mint.publicKey, space: MINT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
        createInitializeMint2Instruction(mint.publicKey, 6, payer.publicKey, null),
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, source, payer.publicKey, mint.publicKey),
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, destination, merchant.publicKey, mint.publicKey),
        createMintToInstruction(mint.publicKey, source, payer.publicKey, 10_000_000n),
      );
      tx.sign(payer, mint); state.setupWire = tx.serialize().toString('base64'); state.setupSignature = base58(tx.signature);
      state.setupLastValidHeight = lifetime.lastValidBlockHeight; saveState();
    }
    console.log('Creating the dedicated test mint and token accounts on devnet.');
    const status = (await rpc('getSignatureStatuses', [[state.setupSignature], { searchTransactionHistory: true }])).value?.[0];
    if (!status) await rpc('sendTransaction', [state.setupWire, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 }]);
    await waitSignature(state.setupSignature); state.setupConfirmed = true; saveState();
  }
  report.setupSignature = state.setupSignature;
  store = new Store(resolve(data, 'authorization.sqlite'));
  const resource = 'https://fixtures.sentinel.test/devnet/search';
  const invoices = new Map(['invoice-clean', 'invoice-lost-response'].map(reference => [reference, { reference, amount: 1_000_000,
    recipient: report.merchant, resource, payer: report.payer, mint: report.mint, expiresAt: Date.now() + 3600_000 }]));
  const adapter = new SolanaDevnetAdapter(store, { rpc, payer: report.payer, mint: report.mint, invoices,
    prepareTransfer: async ({ action, key }) => {
      const lifetime = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ feePayer: payer.publicKey, recentBlockhash: lifetime.blockhash }).add(
        createTransferCheckedInstruction(source, mint.publicKey, destination, payer.publicKey, BigInt(action.amount), 6),
        new TransactionInstruction({ programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), keys: [], data: Buffer.from(key) }),
      );
      tx.sign(payer);
      return { signature: base58(tx.signature), wire: tx.serialize().toString('base64'), source: source.toBase58(),
        destination: destination.toBase58(), tokenProgram: TOKEN_PROGRAM_ID.toBase58(), lastValidHeight: lifetime.lastValidBlockHeight };
    } });
  const service = new Sentinel(store, adapter, { paymentTimeoutMs: 20_000 });
  if (!state.intentId) {
    const { contract } = service.createIntent(demoContract(Date.now(), { name: 'Devnet test-token purchases', purpose: 'Pay two pinned test invoices',
      budget: '2', perTransaction: '1', recipients: [report.merchant], resources: [resource], maxTransactions: 2 }));
    state.intentId = contract.id; saveState();
  }
  for (const reference of invoices.keys()) {
    const existing = store.transactions().find(t => t.intentId === state.intentId && t.original.reference === reference);
    let outcome;
    if (existing) outcome = { ...existing, transactionId: existing.id };
    else {
      loseNextResponse = reference === 'invoice-lost-response';
      outcome = await service.execute({ intentId: state.intentId, amount: '1', recipient: report.merchant, resource, reference }, state.intentId);
    }
    const initialStatus = outcome.status;
    for (let i = 0; outcome.transactionId && !['succeeded', 'failed'].includes(outcome.status) && i < 20; i++) {
      await sleep(1500); const tx = await service.reconcile(outcome.transactionId); outcome = { ...outcome, status: tx.status, receipt: tx.receipt };
    }
    report.transactions.push({ reference, initialStatus, status: outcome.status, receipt: outcome.receipt });
    if (outcome.status !== 'succeeded') throw new Error('DEVNET_PAYMENT_NOT_CONFIRMED');
  }
  const blocked = await service.execute({ intentId: state.intentId, amount: '1', recipient: report.payer, resource, reference: 'unauthorized-recipient' }, state.intentId);
  report.blocked = { decision: blocked.decision, status: blocked.status, reasons: blocked.reasons };
  report.committedTestTokens = store.intents().find(i => i.id === state.intentId).committed / 1e6;
  report.audit = store.verifyAudit(); report.broadcastsThisInvocation = broadcasts;
  report.status = report.transactions.every(t => t.status === 'succeeded') && blocked.decision === 'Block' && report.audit.valid ? 'passed' : 'failed';
} catch (error) {
  report.status = 'incomplete'; report.reason = error.code ?? error.message;
  report.nextStep = 'Inspect the reported devnet RPC/faucet condition. Rerun reuses the same wallet, setup transaction, and payment outbox. Do not treat an incomplete report as chain evidence.';
  process.exitCode = 1;
} finally {
  store?.close(); writeFileSync(resolve(out, 'summary.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
