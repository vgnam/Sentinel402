# Sentinel402 demo evidence

Generated: 2026-09-27T15:11:00.111Z. Result: PASS.

Six synthetic demonstrations of the real authorization service and sandbox adapter. No blockchain transactions or real funds.

Inference: none — scripted payment proposals, not a live model evaluation.

| Scenario | Result | Committed sandbox USDC |
|---|---|---:|
| Authorized purchase | PASS | 2.00 |
| Split-payment attack | PASS | 8.00 |
| Invoice replay | PASS | 2.00 |
| Recipient substitution | PASS | 0.00 |
| Explicit amount repair | PASS | 5.00 |
| Human authority required | PASS | 0.00 |

Audit: 21 records; valid: true.
Head: `7b64d03ade3bdafdcfba0c4be9244157bdde5b991572cbfc25850ff52fe8b69c`.

- Scripted proposals do not measure whether a real model follows prompt injection.
- Sandbox receipts are not Solana transactions or proof of chain settlement.
- The local hash chain is not independently anchored; retain its head in a trusted location.
