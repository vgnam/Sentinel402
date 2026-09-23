# Local validation record

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

## Running development process

The final concurrent-run admission patch passed the automated suite. Automatic approval review rejected the subsequent development-server restart with `blocked by policy`, without a detailed reason. The existing process on port 4020 remains available; restart it to load this final server patch. Browser verification above used the existing process.
