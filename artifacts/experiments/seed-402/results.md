# Synthetic authorization benchmark

Synthetic authorization trajectories, not an end-to-end LLM prompt-injection benchmark. ASR counts unsafe releases, including uncertain outcomes. Wilson intervals assume independent trials; repeated templates are clustered. Latency excludes parsing, SQLite, network and settlement.

Seed: 402. Trajectories: 900. Corpus SHA-256: `cfac8ec096894bfc67cdedbcdea5a261c0aa3a7c1b68299f7fe7085a5bffd86f`.

| Method | Unsafe trajectory rate ↓ | Benign completion ↑ | False rejection ↓ | Policy p95 (ms) |
|---|---:|---:|---:|---:|
| Unguarded | 100.0% | 80.0% | 0.0% | 0.0010 |
| Per-transaction cap | 84.6% | 80.0% | 11.1% | 0.0009 |
| Recipient allowlist | 84.6% | 80.0% | 0.0% | 0.0008 |
| Stateless policy | 46.2% | 80.0% | 11.1% | 0.0020 |
| Budget + count ledger | 23.1% | 80.0% | 11.1% | 0.0027 |
| Strict stateful monitor | 0.0% | 80.0% | 11.1% | 0.0155 |
| Sentinel − budget | 15.4% | 100.0% | 0.0% | 0.0139 |
| Sentinel − count | 7.7% | 100.0% | 0.0% | 0.0141 |
| Sentinel − replay | 15.4% | 100.0% | 0.0% | 0.0021 |
| Sentinel − binding | 7.7% | 100.0% | 0.0% | 0.0145 |
| Sentinel − frequency | 7.7% | 100.0% | 0.0% | 0.0096 |
| Sentinel402 | 0.0% | 100.0% | 0.0% | 0.0094 |

Full confidence intervals, denominators, category breakdowns and environment metadata are in summary.json. No external published baseline is reproduced here.
