import { SolanaTestTokenAdapter } from './solana-test-token.mjs';

/** Separate local ledger, numeric loopback endpoint, pinned non-public genesis. */
export class SolanaLocalAdapter extends SolanaTestTokenAdapter {
  constructor(store, options) { super(store, { ...options, network: 'local' }); }
}
