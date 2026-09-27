# Sentinel402 demo and pitch

## Preparation

1. Use Node.js 22.18 or newer. From the repository, run `npm run check`, `npm test`, and `npm run demo:judge`. In PowerShell use `npm.cmd` if needed. No dependency install is required.
2. Run `npm run dev` and open `http://127.0.0.1:4020/#demo`. Keep the terminal available. Local demo mode is loopback-only.
3. Click **Run guided demo**. Confirm 6/6 cases, 10 proposals, and a verified 21-record audit chain. Total simulated spend is 17 USDC across SIX separate 10-USDC contracts; it is not one overspent contract.
4. Download **Export evidence** as a recording fallback. The report uses fresh synthetic data and makes no provider calls. The CLI generates equivalent fresh evidence in `artifacts/demo/`.
5. If demonstrating real AI, configure the provider per [LLM.md](LLM.md), create a fresh default intent, and rehearse a benign run. Live inference is separate and may cost money. Never show `.env` or the one-time credential dialog in a public recording. A provider outage does not stop the deterministic guided tour.

## Five-minute walkthrough

| Time | Show | Say |
|---|---|---|
| 0:00–0:35 | Guided demo story | “An agent needs to buy search credits. I authorize 10 USDC total, at most 5 per purchase, for one approved merchant. The model may propose; it cannot grant itself spending authority.” |
| 0:35–1:30 | Run tour; expand split-payment case | “Four concurrent requests ask for 4 each. Two settle for 8 total; two are blocked. Reservations count before execution, so concurrent requests cannot all see an untouched budget.” |
| 1:30–2:15 | Replay and recipient substitution | “A repeated invoice is rejected. Tool text that redirects the recipient does not change the contract. These are scripted adversarial proposals, not proof that a model was successfully injected.” |
| 2:15–2:55 | Repair and escalation | “Only an explicitly repairable metered purchase is clipped to 5. A fixed-price over-limit request needs new authority and executes nothing.” |
| 2:55–3:35 | Optional Live LLM agent | “Here a real model proposes the payment through a tool and sees the sandbox receipt. The same deterministic service is used.” If not configured, state that and show the integration diagram/API instead. Never present the scripted tour as live inference. |
| 3:35–4:15 | Evidence export and checks | “This report contains actual generated contracts, decisions, receipts, and a verifiable hash chain. It excludes private workspace data. Hash chaining needs an external trusted head to detect a complete rewrite.” |
| 4:15–5:00 | Closing product case | “We target developers of purchasing agents. Next we will validate integration pain with teams and implement a testnet adapter. Today's working scope is sandbox authorization and an optional live AI loop, not Solana settlement.” |

This timing is a suggested recording format; the official pages do not specify a five-minute limit.

## Short pitch

AI agents can decide what to buy, but who decides how much authority they receive? If an agent has a 5-USDC per-payment cap, four apparently valid 4-USDC purchases can still exceed a user's 10-USDC task budget.

Sentinel402 gives each task an immutable spending contract. It checks the recipient, resource, amount, history, and remaining budget, then reserves authority before execution. The agent gets a scoped token and a clear outcome: allow, block, explicitly repair, or escalate. Uncertain payments keep their reservations until the adapter can reconcile them.

Our working prototype includes an API, SDK, dashboard, optional real AI tool loop, and reproducible sandbox evidence. The model provides flexible task execution; deterministic authorization keeps spending tied to the user's delegation. We can demonstrate concurrency, replay protection, and intervention with no external API dependency.

Our initial users are teams building agents that purchase paid APIs. That market hypothesis still needs interviews. The next milestone is one testnet adapter with authenticated invoice binding and recovery tests. We are submitting a working AI payment-control prototype with explicit limits and reproducible evidence.

## Questions to prepare for

- **Why not a system prompt?** A prompt guides model behavior; this service checks structured payment effects using trusted state outside the model. The sandbox demonstrates that boundary, not universal model safety.
- **Is this only a budget limiter?** Budget is one constraint. Intent-bound credentials, destination/resource restrictions, replay/frequency checks, atomic reservations, and uncertain-outcome recovery are also enforced.
- **What if the agent bypasses it?** The architecture requires payment credentials and signing authority to remain behind the trusted adapter. Giving the agent a separate wallet would bypass the boundary.
- **How does AI add value?** A model can interpret a user task and invoice and propose purchases; the service constrains those flexible proposals. Enforcement itself does not need an LLM.
- **Is it Solana/x402 live?** No. x402 quote normalization is offline and settlement is simulated. Do not present sandbox receipt IDs as explorer transaction signatures.
- **What proves safety?** Tests and synthetic evidence cover stated invariants. They are not an independent audit, a formal proof, or a real-world prompt-injection success-rate study.
- **How will it make money?** Self-hosted developer tooling plus a possible hosted control plane is a hypothesis. Validate willingness to pay before claiming pricing, revenue, or customers.
- **Why keep unknown payments reserved?** A timeout does not prove failure. Releasing the budget could allow a second spend before the first payment is discovered to have succeeded.

## Recording and submission

Record a clean screen with no credentials, show a fresh run and expanded receipt, and narrate the AI/sandbox distinction. Use the short pitch for an introductory segment. Verify all uploaded links from a signed-out/private window. The repository's local demo URL cannot be used by remote judges. Prepare the Corelia fields in [SUBMISSION.md](SUBMISSION.md), then verify the final submitted status yourself.
