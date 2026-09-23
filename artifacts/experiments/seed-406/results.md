# Synthetic authorization benchmark

Synthetic authorization trajectories, not an end-to-end LLM prompt-injection benchmark. ASR counts unsafe releases, including uncertain outcomes. Wilson intervals assume independent trials; repeated templates are clustered. Latency excludes parsing, SQLite, network and settlement.

Seed: 406. Trajectories: 900. Corpus SHA-256: `82ec6fbd335df68a20ec4e2b5008603ab5927f92e6c917c1418d8ca83d6bd28e`.

| Method | Unsafe trajectory rate ↓ | Benign completion ↑ | False rejection ↓ | Policy p95 (ms) |
|---|---:|---:|---:|---:|
| Unguarded | 100.0% | 80.0% | 0.0% | 0.0002 |
| Per-transaction cap | 84.6% | 80.0% | 11.1% | 0.0006 |
| Recipient allowlist | 84.6% | 80.0% | 0.0% | 0.0007 |
| Stateless policy | 46.2% | 80.0% | 11.1% | 0.0009 |
| Budget + count ledger | 23.1% | 80.0% | 11.1% | 0.0009 |
| Strict stateful monitor | 0.0% | 80.0% | 11.1% | 0.0111 |
| Sentinel − budget | 15.4% | 100.0% | 0.0% | 0.0121 |
| Sentinel − count | 7.7% | 100.0% | 0.0% | 0.0111 |
| Sentinel − replay | 15.4% | 100.0% | 0.0% | 0.0009 |
| Sentinel − binding | 7.7% | 100.0% | 0.0% | 0.0128 |
| Sentinel − frequency | 7.7% | 100.0% | 0.0% | 0.0098 |
| Sentinel402 | 0.0% | 100.0% | 0.0% | 0.0104 |

Full confidence intervals, denominators, category breakdowns and environment metadata are in summary.json. No external published baseline is reproduced here.
