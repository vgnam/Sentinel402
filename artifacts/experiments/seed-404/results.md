# Synthetic authorization benchmark

Synthetic authorization trajectories, not an end-to-end LLM prompt-injection benchmark. ASR counts unsafe releases, including uncertain outcomes. Wilson intervals assume independent trials; repeated templates are clustered. Latency excludes parsing, SQLite, network and settlement.

Seed: 404. Trajectories: 900. Corpus SHA-256: `8fc434bd0ac6dd60e61094eadd43ef334e9db8e713e738c0ad93410529271b74`.

| Method | Unsafe trajectory rate ↓ | Benign completion ↑ | False rejection ↓ | Policy p95 (ms) |
|---|---:|---:|---:|---:|
| Unguarded | 100.0% | 80.0% | 0.0% | 0.0002 |
| Per-transaction cap | 84.6% | 80.0% | 11.1% | 0.0006 |
| Recipient allowlist | 84.6% | 80.0% | 0.0% | 0.0005 |
| Stateless policy | 46.2% | 80.0% | 11.1% | 0.0008 |
| Budget + count ledger | 23.1% | 80.0% | 11.1% | 0.0006 |
| Strict stateful monitor | 0.0% | 80.0% | 11.1% | 0.0142 |
| Sentinel − budget | 15.4% | 100.0% | 0.0% | 0.0111 |
| Sentinel − count | 7.7% | 100.0% | 0.0% | 0.0142 |
| Sentinel − replay | 15.4% | 100.0% | 0.0% | 0.0006 |
| Sentinel − binding | 7.7% | 100.0% | 0.0% | 0.0146 |
| Sentinel − frequency | 7.7% | 100.0% | 0.0% | 0.0146 |
| Sentinel402 | 0.0% | 100.0% | 0.0% | 0.0126 |

Full confidence intervals, denominators, category breakdowns and environment metadata are in summary.json. No external published baseline is reproduced here.
