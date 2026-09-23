# MVP → startup pilot

## Product hypothesis

Sentinel402 is a payment authorization API for teams building autonomous agents that buy paid APIs or metered resources. The first target is a technical team that already owns its agent and payment stack, and needs per-task spending authority plus an explanation of every payment. This is a positioning hypothesis to test, not a claim of validated demand.

The MVP's concrete workflow is: operator defines an intent, agent receives a scoped credential, SDK submits structured purchases, deterministic enforcement mediates execution, operator inspects and exports evidence. The selling point to test is reduced integration effort for explicit delegated spending and reliable state accounting under concurrency and uncertain settlement.

## Demo script: 5 minutes

1. Show an immutable 10-USDC contract with a 5-USDC per-payment cap.
2. Run four concurrent 4-USDC requests. Two settle; two block because reserved spend is already 8.
3. Replay an invoice with an altered amount. It is rejected by the stable invoice binding.
4. Compare an oversized fixed-price request (Escalate) and an explicitly repairable metered request (Repair).
5. Export audit evidence and open the benchmark lab. Explain the synthetic dataset and the strong baseline's equally safe result.

## Pilot milestones

| Stage | Deliverable | Exit criterion |
|---|---|---|
| Current MVP | Local API, SDK, console, SQLite, sandbox, benchmark | Tests pass; demo reproducible from clean checkout |
| Design-partner validation | Interviews and sandbox integrations with 3–5 target teams | Teams can describe actual pain, integration constraints, and willingness to pilot |
| Testnet integration | One x402 chain/asset and isolated signer; authenticated invoice + receipt lookup | Crash, retry, timeout and concurrent settlement tests pass against testnet |
| Controlled paid pilot | Tenant isolation, operator identity/RBAC, TLS, key lifecycle, alerts, durable recovery | Security review, external audit anchoring, backup/restore and agreed support procedures |
| Hosted service | Usage metering, billing, onboarding and operational SLO | Demonstrated demand and measured support burden; pricing validated by customers |

Do not equate a simulated receipt with chain finality or describe the current app as production-ready SaaS. The Node built-in SQLite implementation favors zero-install reproducibility; larger deployments need benchmarked persistence, isolation and recovery rather than simply changing the UI.

## Commercial experiments

Test a developer self-hosted package and a hosted control plane. Candidate charging dimensions are workspace subscription plus authorization volume; enterprise features may include SSO, retention and private deployment. Actual prices should follow interviews and measured operating costs. No market size, customer testimonials or revenue assumptions are fabricated here.

Measure time to first protected request, percentage of payments mediated, correct intervention rate, unnecessary intervention rate, unresolved reservations, reconciliation latency and developer support time. Choose pilot thresholds with the design partners. Synthetic benchmark ASR alone is not a product KPI.

## Deliberate MVP limits

One workspace, one fixed accounting unit, no real funds, no automatic natural-language intent extraction, no universal prompt-injection detector. Production authority must remain outside agent control. The important next deliverable is a validated testnet adapter plus recovery evidence, followed by tenant and identity isolation.
