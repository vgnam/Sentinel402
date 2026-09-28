import { Store } from '../src/store.mjs';
import { Sentinel } from '../src/service.mjs';
import { demoContract } from '../src/demo.mjs';
import { ExternalLedger } from './external-ledger.mjs';

process.once('message', async config => {
  const store = new Store(config.db), adapter = new ExternalLedger(config.ledger);
  const service = new Sentinel(store, adapter);
  if (config.mode === 'recover') {
    try {
      const start = performance.now();
      const before = store.state(config.intentId);
      const reconciled = await service.reconcile(config.transactionId);
      const after = store.state(config.intentId);
      const externalBeforeRetry = adapter.effects();
      if (['succeeded', 'failed'].includes(reconciled.status)) {
        // Repeating the same external idempotency key cannot produce a new effect.
        await adapter.pay(reconciled.action, config.transactionId);
      }
      const repeatedEffectCount = adapter.effects().length;
      const recoveryMs = performance.now() - start;
      const retry = await service.execute({ ...config.action, reference: 'fresh-invoice' }, config.intentId);
      process.send({ type: 'recovered', before: before.spent, after: after.spent, status: reconciled.status,
        recoveryMs, retry: { decision: retry.decision, status: retry.status },
        externalBeforeRetry, repeatedEffectCount, audit: store.verifyAudit(), finalState: store.state(config.intentId) });
    } finally { adapter.close(); store.close(); process.disconnect(); }
    return;
  }
  const { contract } = service.createIntent(demoContract(Date.now(), { budget: '1', perTransaction: '1' }));
  const action = { intentId: contract.id, amount: '1', recipient: 'merchant:search', resource: 'api:search', reference: 'crash-invoice' };
  const result = service.reserve(action, contract.id);
  if (config.phase === 'external_failure') adapter.outcome = 'failed';
  if (config.phase !== 'reserved_only' && config.phase !== 'unknown') {
    const receipt = await adapter.pay(result.executable, result.transactionId);
    if (config.phase === 'finalized') service.finish(result.transactionId, receipt);
  }
  if (config.phase === 'unknown') service.finish(result.transactionId, { status: 'unknown', reason: 'FIXTURE_LOST_RESPONSE' });
  process.send({ type: 'checkpoint', intentId: contract.id, transactionId: result.transactionId, action });
  // The parent kills this process. Do not run graceful shutdown or close SQLite.
  setInterval(() => {}, 1000);
});
