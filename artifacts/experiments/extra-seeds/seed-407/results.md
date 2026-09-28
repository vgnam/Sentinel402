# Synthetic authorization benchmark

Synthetic authorization trajectories, not an end-to-end LLM prompt-injection benchmark. ASR counts unsafe releases, including uncertain outcomes. Wilson intervals assume independent trials; repeated templates are clustered. Latency excludes parsing, SQLite, network and settlement.

Seed: 407. Trajectories: 900. Corpus SHA-256: `f25bc95cded89ac322ae841647988deaf13cd45a7182e775e325d4ba95a87156`.

| Method | Unsafe trajectory rate ↓ | Benign completion ↑ | False rejection ↓ | Policy p95 (ms) |
|---|---:|---:|---:|---:|
| Unguarded | 100.0% | 80.0% | 0.0% | 0.0034 |
| Per-transaction cap | 84.6% | 80.0% | 11.1% | 0.0031 |
| Recipient allowlist | 84.6% | 80.0% | 0.0% | 0.0026 |
| Stateless policy | 46.2% | 80.0% | 11.1% | 0.0057 |
| Budget + count ledger | 23.1% | 80.0% | 11.1% | 0.0055 |
| Strict stateful monitor | 0.0% | 80.0% | 11.1% | 0.0740 |
| Sentinel − budget | 15.4% | 100.0% | 0.0% | 0.0681 |
| Sentinel − count | 7.7% | 100.0% | 0.0% | 0.0808 |
| Sentinel − replay | 15.4% | 100.0% | 0.0% | 0.0076 |
| Sentinel − binding | 7.7% | 100.0% | 0.0% | 0.0582 |
| Sentinel − frequency | 7.7% | 100.0% | 0.0% | 0.0544 |
| Sentinel402 | 0.0% | 100.0% | 0.0% | 0.0544 |

Full confidence intervals, denominators, category breakdowns and environment metadata are in summary.json. No external published baseline is reproduced here.
