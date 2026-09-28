import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (!['--wsl', '--rpc-port', '--faucet-port'].includes(key) || Object.hasOwn(options, key)) throw new Error('Use --wsl, --rpc-port N and/or --faucet-port N');
  if (key === '--wsl') options[key] = true;
  else { const value = args[++i]; if (!value || !/^\d+$/.test(value)) throw new Error(`Integer port required for ${key}`); options[key] = value; }
}
const useWsl = options['--wsl'] === true, rpcPort = Number(options['--rpc-port'] ?? 8899), faucetPort = Number(options['--faucet-port'] ?? 9900);
if (![rpcPort, faucetPort].every(p => Number.isInteger(p) && p >= 1024 && p < 65535) || faucetPort === rpcPort || faucetPort === rpcPort + 1) throw new Error('Choose distinct unprivileged RPC/websocket/faucet ports');
if (useWsl && process.platform !== 'win32') throw new Error('--wsl is only needed on Windows');
const bundled = resolve(root, '.tools/solana-release/bin', process.platform === 'win32' ? 'solana-test-validator.exe' : 'solana-test-validator');
const executable = process.env.SOLANA_VALIDATOR_BIN || (existsSync(bundled) ? bundled : 'solana-test-validator');
const ledger = resolve(root, 'data/local-validator/ledger'); mkdirSync(dirname(ledger), { recursive: true });
console.log(`Local RPC: http://127.0.0.1:${rpcPort}\nLedger: ${useWsl ? '~/sentinel402-local-ledger (inside WSL)' : ledger}\nExisting ledger is preserved. Stop with Ctrl+C.`);
// --log avoids Windows' optional log symlink. It does not require Developer Mode.
// --limit-blockstore-size replaces the deprecated --limit-ledger-size on Agave >= 2.3 and keeps the
// blockstore bounded, so repeated sessions cannot exhaust the host disk that holds the WSL image.
const nativeArgs = ['--ledger', ledger, '--bind-address', '127.0.0.1', '--rpc-port', String(rpcPort), '--faucet-port', String(faucetPort), '--limit-blockstore-size', '10000', '--log'];
// Static shell text; no user-supplied values are interpolated into the command.
const wslCommand = 'export RUST_LOG="${RUST_LOG:-warn}"; export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.local/share/sentinel402/solana-release/bin:$PATH"; mkdir -p "$HOME/sentinel402-local-ledger"; exec solana-test-validator --ledger "$HOME/sentinel402-local-ledger" --bind-address 127.0.0.1 --rpc-port "$1" --faucet-port "$2" --limit-blockstore-size 10000 --log';
const wslArgs = ['--distribution', process.env.SENTINEL_WSL_DISTRO || 'Ubuntu',
  ...(process.env.SENTINEL_WSL_USER ? ['--user', process.env.SENTINEL_WSL_USER] : []), '--exec', 'bash', '-lc', wslCommand, 'sentinel-validator', String(rpcPort), String(faucetPort)];
const child = spawn(useWsl ? 'wsl.exe' : executable, useWsl ? wslArgs : nativeArgs, { cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, RUST_LOG: process.env.RUST_LOG || 'warn' } });
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; child.kill(signal); });
child.on('error', error => {
  console.error(`Validator could not start (${error.code ?? 'START_ERROR'}). See docs/LOCAL_VALIDATOR.md for installation.`);
  process.exitCode = 1;
});
child.on('close', code => {
  process.exitCode = stopping ? 0 : code ?? 1;
  if (!stopping && process.exitCode !== 0 && process.platform === 'win32' && !useWsl) {
    console.error('If the native binary cannot create its ledger, run the validator inside Ubuntu/WSL. See docs/LOCAL_VALIDATOR.md.');
  }
});
