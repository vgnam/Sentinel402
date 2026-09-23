# Synthetic authorization benchmark

Synthetic authorization trajectories, not an end-to-end LLM prompt-injection benchmark. ASR counts unsafe releases, including uncertain outcomes. Wilson intervals assume independent trials; repeated templates are clustered. Latency excludes parsing, SQLite, network and settlement.

Seed: 403. Trajectories: 900. Corpus SHA-256: `b7272e8246a4b15932a8eda6a486108b36d9312aa70d106983f6496f39639004`.

| Method | Unsafe trajectory rate ↓ | Benign completion ↑ | False rejection ↓ | Policy p95 (ms) |
|---|---:|---:|---:|---:|
| Unguarded | 100.0% | 80.0% | 0.0% | 0.0003 |
| Per-transaction cap | 84.6% | 80.0% | 11.1% | 0.0008 |
| Recipient allowlist | 84.6% | 80.0% | 0.0% | 0.0005 |
| Stateless policy | 46.2% | 80.0% | 11.1% | 0.0011 |
| Budget + count ledger | 23.1% | 80.0% | 11.1% | 0.0016 |
| Strict stateful monitor | 0.0% | 80.0% | 11.1% | 0.0116 |
| Sentinel − budget | 15.4% | 100.0% | 0.0% | 0.0108 |
| Sentinel − count | 7.7% | 100.0% | 0.0% | 0.0091 |
| Sentinel − replay | 15.4% | 100.0% | 0.0% | 0.0009 |
| Sentinel − binding | 7.7% | 100.0% | 0.0% | 0.0104 |
| Sentinel − frequency | 7.7% | 100.0% | 0.0% | 0.0098 |
| Sentinel402 | 0.0% | 100.0% | 0.0% | 0.0119 |

Full confidence intervals, denominators, category breakdowns and environment metadata are in summary.json. No external published baseline is reproduced here.
