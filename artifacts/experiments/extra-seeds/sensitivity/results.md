# Synthetic authorization benchmark

Synthetic authorization trajectories, not an end-to-end LLM prompt-injection benchmark. ASR counts unsafe releases, including uncertain outcomes. Wilson intervals assume independent trials; repeated templates are clustered. Latency excludes parsing, SQLite, network and settlement.

Seed: 407. Trajectories: 36. Corpus SHA-256: `427e159b9d79602a50ef31cc9348a684470ce2706a8b33fdba816857bd21a7f7`.

| Method | Unsafe trajectory rate ↓ | Benign completion ↑ | False rejection ↓ | Policy p95 (ms) |
|---|---:|---:|---:|---:|
| Unguarded | 100.0% | 88.9% | 0.0% | 0.0004 |
| Per-transaction cap | 88.9% | 88.9% | 0.4% | 0.0006 |
| Recipient allowlist | 100.0% | 88.9% | 0.0% | 0.0005 |
| Stateless policy | 88.9% | 88.9% | 0.4% | 0.0036 |
| Budget + count ledger | 44.4% | 88.9% | 0.4% | 0.0037 |
| Strict stateful monitor | 0.0% | 88.9% | 0.4% | 0.0290 |
| Sentinel − budget | 44.4% | 100.0% | 0.0% | 0.0256 |
| Sentinel − count | 0.0% | 100.0% | 0.0% | 0.0258 |
| Sentinel − replay | 44.4% | 100.0% | 0.0% | 0.0016 |
| Sentinel − binding | 0.0% | 100.0% | 0.0% | 0.0293 |
| Sentinel − frequency | 0.0% | 100.0% | 0.0% | 0.0270 |
| Sentinel402 | 0.0% | 100.0% | 0.0% | 0.0224 |

Full confidence intervals, denominators, category breakdowns and environment metadata are in summary.json. No external published baseline is reproduced here.
