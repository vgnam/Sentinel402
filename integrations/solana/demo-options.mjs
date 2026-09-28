import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { localEndpoint } from '../../src/solana-network.mjs';

export function demoOptions(args, root) {
  const flags = new Set(['--local', '--rpc', '--run-id']), values = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!flags.has(key) || Object.hasOwn(values, key)) throw new Error('Unknown or repeated demo option');
    if (key === '--local') values[key] = true;
    else { const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`Value required for ${key}`); values[key] = value; }
  }
  const local = values['--local'] === true;
  if (!local && (values['--rpc'] || values['--run-id'])) throw new Error('Custom RPC and run ID are local-only');
  const runId = local ? values['--run-id'] ?? `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}` : null;
  if (local && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(runId)) throw new Error('Run ID must be 1–96 letters, digits, hyphens or underscores');
  return { local, runId, endpoint: local ? localEndpoint(values['--rpc']) : 'https://api.devnet.solana.com',
    data: resolve(root, local ? `data/solana-local/runs/${runId}` : 'data/devnet'),
    out: resolve(root, local ? `artifacts/realism/local/${runId}` : 'artifacts/realism/devnet') };
}
