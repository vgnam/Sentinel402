# Local validation record

## Realism extension — 28 September 2026

- Windows x64, Node.js v22.18.0: syntax check passed and **70/70 tests passed**. Added actual forced-child-process recovery, HTTP paid-resource workflow, model-loop mock integration/error accounting, development-only feedback search, and devnet outbox/receipt verification tests. No paid API calls are made by these tests.
- Ran 48 complete scripted workflow episodes through actual loopback HTTP. Strict stateful and Sentinel each had 0 unsafe effects across 16 episodes, but four task deviations from duplicate purchases across the two splits. They had identical results. Full artifacts: `artifacts/realism/workflow/`.
- Forced 15 process terminations across five checkpoints, reopened with a fresh process and independent durable ledger: 0 invariant failures; six unresolved reservations retained capacity. Full artifacts: `artifacts/realism/crashes/`.
- Ran randomized service stress: 50 × 80 = 4,000 proposals, 0 invariant failures. Full artifacts: `artifacts/experiments/randomized/`.
- Ran development-only feedback selection with a scripted actor: rejection of authority spoof caused a switch to cumulative pressure; trial two produced duplicate purchases without violating the formal contract. This is not an LLM attack-success result. Artifacts: `artifacts/realism/adaptive/`.
- Created a dedicated test wallet after user authorization and requested free Solana devnet SOL. The full devnet genesis hash matched. Faucet requests failed with RPC -32603 and then HTTP 429; requests stopped. No mint or payment transaction was created. `artifacts/realism/devnet/summary.json` is explicitly **incomplete**. Secrets remain in ignored `data/devnet/`.
- The optional Solana SDK package was installed with scripts disabled. Default server/root package still requires no third-party runtime dependencies. Test-token adapter is CLI-only, uses no real funds, and is not a deployed Solana program or full x402 settlement integration.
- No new paid inference, remote CI, public deployment or submission was performed. Live two-model runner and bounded search are ready, but the inference-budget choice is still pending. Research scope and reproduction instructions: [REALISM.md](REALISM.md).

## Hackathon preparation — 27 September 2026

- Windows x64, Node.js v22.18.0. `npm run check` passed; `npm test` passed **53/53** tests. The pre-change baseline was 50/50. SQLite still emits its experimental-feature warning.
- `npm run demo:judge` passed all six scenarios: 10 proposals, 17 simulated USDC committed across six separate 10-USDC contracts, and a valid 21-record audit chain. Generated evidence is in `artifacts/demo/`.
- New regression checks verify the exported audit hashes independently, check expected effects, ensure adapter failures produce a failing report, and confirm the demo endpoint requires control auth and leaves existing workspace data unchanged.
- Chrome verification: opened `/#demo`, ran all six scenarios, inspected desktop results, clicked evidence export, and verified the downloaded JSON's summary and audit head against the displayed result. The browser automation download-event listener timed out, but the actual downloaded file was present and correct. No browser error/warning logs were returned.
- Visually checked the 390-pixel phone layout; measured document width did not exceed the viewport. Restored the desktop viewport afterward.
- Started the current source as a local loopback demo on port 4020 with a separate `data/hackathon-demo.sqlite` database. Existing `data/sentinel.sqlite` was not used for this review. Startup logs are in `data/hackathon-server*.log`.
- Read the three requested Corelia pages and the project form; did not create or submit a public project. No paid inference, public deployment, real payment, Solana transaction, remote CI, or Docker build was performed during this pass. Earlier live-provider evidence below is historical and was not rerun.

## Earlier validation record

Environment: Windows x64, Node.js v22.18.0, built-in SQLite. Initial validation: 2026-09-21; live LLM integration validated subsequently on 2026-09-22. No hosted deployment or real payment transfer was performed. The LLM integration uses the operator-provided MintRouter credential with model `glm-5.3`.

## Automated checks

- `npm run check`: syntax checks for source, SDK, scripts, browser code and tests.
- `npm test`: 42 tests covering decimal precision, immutable-contract validation, four decisions and precedence, stable-invoice replay, intent-scoped credentials, trusted time, revocation, frequency boundaries, reservation contention, definite failure, unknown outcomes, timeout/late receipt, audit rollback, restart, HTTP auth/origin/Host checks, SDK integration, independent oracle, corpus reproducibility, secret handling, bounded tool loops, control-only LLM jobs and concurrent run admission. These automated tests use mock model transports and do not call a paid API.
- Cross-connection test: 4 independent workers submit 40 requests against one on-disk database and a 5-USDC budget; exactly five 1-USDC payments succeed.
- `npm run benchmark`: 900 synthetic trajectories × 12 methods, raw traces and artifacts saved under `artifacts/benchmark`.
- `npm run benchmark:systems`: real-service reservation/failure/unknown/recovery experiments plus an explicitly non-atomic counterexample, saved under `artifacts/systems`.

## Browser checks

Used Chrome on the local application. Verified actual UI interactions for creating an immutable intent and showing its one-time agent token, executing a permitted sandbox payment, running a concurrent split-payment scenario, executing the research benchmark from the console, inspecting the resulting 12-method table, and viewing the verified audit chain. Desktop screenshots were visually inspected; no browser error/warning logs were observed at that point.

This is implementation validation, not an independent security review. CI configuration is included for Windows/Linux but remote CI has not been run in this session. Docker packaging has not been built here. Research limitations and the broader model/adaptive evaluations still needed are in `PAPER_PLAN.md`.

## Live model evidence

- A clean CLI task with `glm-5.3` completed using 2 real provider calls and one `Allow / succeeded` sandbox payment. Reported usage: 1,879 tokens. The detailed trace is private under `data/llm-runs`.
- A browser run through the Live LLM agent form completed with 2 real provider calls, 1,950 reported tokens and one `Allow / succeeded` sandbox payment. The UI showed the final answer, tool receipt, persisted run and pilot comparison table. No browser errors or warnings were observed.
- The initial live pilot ran 4 methods × 2 fixtures × 1 repetition: 8 episodes, 18 provider calls, 16,896 reported tokens, zero API/judge errors and zero truncated episodes. Every method completed its clean task and had zero unauthorized effects on the single recipient-injection fixture. This verifies integration and gives no demonstrated comparative safety advantage.
- Full pilot results: `artifacts/llm/results.md`, `summary.json`, `metrics.csv`, `runs.jsonl`. These local traces/results are excluded from Git by default; inspect before sharing. The 900-trajectory deterministic benchmark remains a separate dataset.

## Earlier development process note (superseded)

At the earlier validation session, the concurrent-run admission patch passed the automated suite, but an automatic approval review rejected a server restart. That note no longer describes the current process: the 27 September preparation pass successfully started the current source and verified it in Chrome as recorded above.
