# Sentinel402 submission pack

Prepared 27 September 2026. Review team facts and public links before copying into Corelia. No submission has been made. Verified event facts and ambiguities: [HACKATHON.md](HACKATHON.md).

## Form fields

**Title:** Sentinel402

**Suggested slug:** sentinel402 (availability has not been checked)

**Recommended primary track:** Best AI Product

**Theme:** AI x Web3 (state in the description; no theme field was visible)

**Summary:**

Sentinel402 helps developers let AI agents buy paid APIs without handing them unrestricted spending authority. A user defines a task budget and approved recipients; a deterministic service checks each proposed payment, reserves funds before execution, and records the outcome. The working prototype combines a live AI tool loop, a sandbox payment console, and reproducible authorization tests.

## Detailed description — ready to paste

### Problem and users

An AI research assistant may need to buy search or enrichment credits. Prompt injection, task confusion, duplicate invoices, and concurrent requests can cause its payment proposals to exceed the authority the user intended. A per-payment cap alone is insufficient: four 4-USDC requests each fit a 5-USDC cap but together exceed a 10-USDC task budget.

Sentinel402 is for developers building agents that purchase metered APIs. The product hypothesis is that they need a small, inspectable authorization layer between their agent and their payment adapter. Customer demand and willingness to pay have not yet been validated.

### Product and AI integration

The operator creates an immutable intent contract with a task purpose, total budget, per-payment limit, approved recipients/resources, expiry, and optional history rules. An intent-scoped credential lets the agent propose payments only for that contract. The JavaScript SDK and HTTP API provide the integration boundary.

The Live LLM agent feature sends a task, contract, and synthetic retrieved invoice to a configured model. The model chooses tool calls and receives actual sandbox decisions and receipts. API access is optional and provider usage may be billed. The enforcement path is deterministic: the model cannot rewrite its contract or expand its authority. This separates flexible AI task execution from the user's spending policy.

Each proposal produces Allow, Block, Repair, or Escalate. Repair is permitted only for explicitly authorized metered resources and is rechecked. Escalation releases no payment; additional authority requires a new operator-created contract.

### How it works

Node.js serves the API and responsive console. SQLite transactions reserve budget and transaction slots before calling the adapter. Committed and pending amounts both count against the task limit. A definite failure releases the reservation; an unknown outcome keeps it reserved until receipt lookup resolves it. Intent-scoped credentials, replay checks, revocation, and an audit hash chain provide inspectable boundaries.

The six-step Guided demo runs the real service on fresh synthetic contracts, showing an authorized purchase, concurrent split-payment attempt, invoice replay, recipient substitution, explicit repair, and escalation. The downloadable report contains the generated contracts, decisions, sandbox receipts, checks, and audit chain. It is produced from actual execution and does not contain workspace credentials or private model traces.

### Evidence and differentiation

Run `npm run demo:judge` to reproduce the six demo cases without an API key. The concurrent case admits exactly two 4-USDC payments under a 10-USDC budget; the other two are blocked. Replay and unauthorized recipients produce no additional payment, while an explicitly repairable 6-USDC request is clipped to 5 USDC.

The repository also contains tests for concurrency across independent workers, crash/restart, uncertain settlement, credentials, and model-tool integration. A separate 900-trajectory synthetic benchmark compares 12 policies. It evaluates structured authorization, not general prompt-injection robustness. A strong stateful baseline can match Sentinel's safety on that corpus; explicit repair is evaluated for task utility.

### Scope and next steps

Primary track: Best AI Product. Product theme: AI x Web3. The prototype uses simulated USDC payments and synthetic invoices. Its x402 v2 quote normalizer is offline; it does not sign, settle, or submit blockchain transactions. Solana devnet integration and merchant-authenticated invoice binding are future milestones. There is no claim of a deployed Solana program, validated market traction, universal prompt-injection protection, or production financial readiness.

Next steps are interviews with agent developers, an isolated testnet payment adapter with recovery tests, and then operator identity, tenant isolation, external audit anchoring, and security review for a controlled pilot.

## Progress field — verify authorship and dates before use

The repository already contained the authorization service, SDK, sandbox console, optional live model loop, and research suite. This preparation pass added the Guided demo, isolated evidence export, CLI reproduction, regression coverage, event requirement brief, and submission/demo scripts. Check the repository history and your actual work dates before labeling any item as completed during the hackathon. Disclose AI-assisted implementation accurately if requested; do not imply interviews, deployments, or team contributions that did not happen.

## Resource and team checklist

| Item | Current state / action |
|---|---|
| Source | README references `https://github.com/vgnam/Sentinel402`; public accessibility and pushed changes are not verified by this local work |
| Live demo | Local only: `http://127.0.0.1:4020/#demo`; this is not a public submission URL |
| Recorded demo | Record using [DEMO_SCRIPT.md](DEMO_SCRIPT.md); upload to a reviewer-accessible URL |
| Pitch material | Script and Q&A are prepared below; no hosted deck/video link exists |
| Evidence | Run `npm run demo:judge`; generated files are in `artifacts/demo/` |
| Screenshots | Capture Guided demo results and optional live model outcome; exclude credentials and private traces |
| Members and bracket | Supply actual member names, registered accounts, roles, schools, and school-majority bracket |
| Deadline | Decide Round 1 (30 Sep noon UTC+7 + attendance) or Round 2 (5 Oct 23:59 UTC+7) |
| Confirmation | Submit on Corelia, then verify status/email; a local finished build is not a submitted project |

Do not publish `.env`, `data/`, API keys, agent credentials, or private LLM runs. The demo evidence uses only generated fixture data and is the intended shareable artifact.
