import { SolanaTestTokenAdapter } from './solana-test-token.mjs';
export { DEVNET_GENESIS } from './solana-network.mjs';

/** Public test network only. Caller options cannot relax the devnet lock. */
export class SolanaDevnetAdapter extends SolanaTestTokenAdapter {
  constructor(store, options) { super(store, { ...options, network: 'devnet' }); }
}
