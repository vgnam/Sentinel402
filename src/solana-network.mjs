export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const PUBLIC_GENESIS = Object.freeze([
  DEVNET_GENESIS,
  '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',
  '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY',
]);

export function localEndpoint(value = 'http://127.0.0.1:8899') {
  let url;
  try { url = new URL(value); } catch { throw new Error('LOCAL_LOOPBACK_RPC_REQUIRED'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/') throw new Error('LOCAL_LOOPBACK_RPC_REQUIRED');
  return url.origin;
}

export function testNetwork({ network = 'devnet', endpoint, genesis } = {}) {
  if (network === 'devnet') return { mode: 'solana-devnet', endpoint: 'https://api.devnet.solana.com', genesis: DEVNET_GENESIS };
  if (network !== 'local') throw new Error('TEST_NETWORK_REQUIRED');
  const rpc = localEndpoint(endpoint);
  if (typeof genesis !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(genesis) || PUBLIC_GENESIS.includes(genesis)) throw new Error('NON_PUBLIC_LOCAL_GENESIS_REQUIRED');
  return { mode: 'solana-local', endpoint: rpc, genesis };
}
