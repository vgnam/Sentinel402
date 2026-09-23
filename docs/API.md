# HTTP API v0.1

Base URL: `http://127.0.0.1:4020`. JSON request/response, 32 KiB request limit. `Authorization: Bearer <token>`. Core authorization has no model dependency; optional `/api/llm` routes use the configured provider. API route names are case-sensitive.

## Credential separation

| Endpoint | Method | Credential | Effect |
|---|---|---|---|
| `/health` | GET | None | Health, version, sandbox flag |
| `/api/session` | GET | None | Secure mode flag; local demo also returns ephemeral control key |
| `/api/intents` | POST | Control | Create immutable contract and one-time agent token |
| `/api/intents/:id/revoke` | POST | Control | Stop new reservations |
| `/api/payments` | POST | Intent-scoped agent | Reserve, sandbox execute, return decision/status |
| `/api/console/payments` | POST | Control | Operator playground execution |
| `/api/overview` | GET | Control | Contracts, totals, latest 100 transactions and audit events |
| `/api/transactions/:id/reconcile` | POST | Control | Ask trusted adapter for receipt |
| `/api/audit/verify?head=...` | GET | Control | Check chain and optionally externally retained head |
| `/api/audit/export` | GET | Control | Full audit JSON export with chain head |
| `/api/demo/scenario` | POST | Control | Run isolated sandbox scenario; body `{"id":"split"}` |
| `/api/research` | GET | Control | Latest saved benchmark summary |
| `/api/research/run` | POST | Control | Run benchmark; `{seed:402,repetitions:50}`; max 100 |
| `/api/research/export/:filename` | GET | Control | `metrics.csv`, `table.tex`, `summary.json`, `results.md`, `traces.jsonl`, `corpus.jsonl` |
| `/api/llm` | GET | Control | Sanitized provider configuration, cases and recent live runs |
| `/api/llm/run` | POST | Control | Start bounded real-model sandbox job; returns 202 with run ID |
| `/api/llm/runs/:id` | GET | Control | Live/persisted job trace; see `LLM.md` |
| `/api/research/llm/export/:filename` | GET | Control | Live pilot `summary.json`, `metrics.csv`, `results.md`, `runs.jsonl` |

No API allows an agent to supply settlement status or edit its contract. The control credential itself is not accepted at `/api/payments`.

## Create intent

```json
{
  "name": "Research pilot",
  "purpose": "Buy metered search credits for the market research task",
  "budget": "10.000000",
  "perTransaction": "5.000000",
  "recipients": ["merchant:search"],
  "resources": ["api:search"],
  "validFrom": "2026-09-21T00:00:00Z",
  "validUntil": "2026-09-22T00:00:00Z",
  "maxTransactions": 10,
  "frequency": { "max": 3, "windowSeconds": 60 },
  "repairResources": [],
  "escalateAbove": "4.000000"
}
```

Replace validity dates with your actual window. Optional: `frequency`, `repairResources`, `escalateAbove`. Response: `{contract, agentToken}`. Contract amount fields in the response are integer micro-USDC; validity fields are Unix milliseconds. A `repairResources` entry authorizes clipping to `perTransaction`; only use for purchases whose meaning survives lower amounts. All fields unknown to the schema fail validation.

## Propose payment

```json
{
  "intentId": "int_<created UUID>",
  "amount": "2.000000",
  "recipient": "merchant:search",
  "resource": "api:search",
  "reference": "merchant-invoice-123",
  "note": "Optional untrusted context"
}
```

Illustrative response:

```json
{
  "decision": "Allow",
  "reasons": ["ALL_CONSTRAINTS_SATISFIED"],
  "executable": {
    "intentId": "int_<created UUID>",
    "amount": 2000000,
    "recipient": "merchant:search",
    "resource": "api:search",
    "reference": "merchant-invoice-123"
  },
  "transactionId": "txn_<UUID>",
  "status": "succeeded",
  "mode": "sandbox",
  "auditHead": "<proposal-stage SHA-256>",
  "receipt": { "status": "succeeded", "transaction": "sandbox_txn_<UUID>", "mode": "sandbox" }
}
```

The returned `executable` is an audit description of the adapter action, not a transferable payment capability. **Do not execute it again in the agent**. `auditHead` is the head after proposal/reservation; the final chain head may advance at settlement and is available from `/api/audit/verify`.

Decisions: `Allow`, `Repair`, `Escalate`, `Block`. Statuses: `succeeded`, `failed`, `reserved`, `unknown`, `not_executed`. Successful policy evaluation does not imply successful execution. An escalated request requires a new user-authorized contract, not resubmission of the old proposal.

Policy denials return HTTP 200 and a decision. Invalid credentials: 401. Host/origin: 403. Invalid control-plane input/JSON: 400. Unknown route: 404. Concurrent benchmark run: 409. Infrastructure failure: 503; no new executable authority is issued. A 503/network loss after an adapter submission requires reconciliation rather than assuming no payment occurred.

## x402 integration boundary

`src/x402.mjs` exports an **offline** normalizer for an explicitly selected x402 v2 `exact` offer. Configure expected `network`, `asset`, `decimals:6`, `index`, `intentId`, and `reference` outside untrusted text. Atomic token amounts map to integer micro-units only when asset precision is exactly 6.

The deployed API executes sandbox actions. It does not advertise protocol conformance, auto-pay HTTP 402 responses, manage a wallet, validate a signature or call a facilitator. A real adapter must pin the chain/asset into the immutable contract and reserved action, bind invoice details to trusted evidence, isolate signing, verify settlement receipts and provide idempotent lookup. Never connect `normalizeX402()` directly to an unrestricted agent wallet.
