# Synthetic authorization benchmark

Synthetic authorization trajectories, not an end-to-end LLM prompt-injection benchmark. ASR counts unsafe releases, including uncertain outcomes. Wilson intervals assume independent trials; repeated templates are clustered. Latency excludes parsing, SQLite, network and settlement.

Seed: 408. Trajectories: 900. Corpus SHA-256: `58426ff6d2e72218b4df89dcc8c7c643d2dd47ca8a86c968a4fa534f24ccd5b9`.

| Method | Unsafe trajectory rate ↓ | Benign completion ↑ | False rejection ↓ | Policy p95 (ms) |
|---|---:|---:|---:|---:|
| Unguarded | 100.0% | 80.0% | 0.0% | 0.0008 |
| Per-transaction cap | 84.6% | 80.0% | 11.1% | 0.0021 |
| Recipient allowlist | 84.6% | 80.0% | 0.0% | 0.0016 |
| Stateless policy | 46.2% | 80.0% | 11.1% | 0.0025 |
| Budget + count ledger | 23.1% | 80.0% | 11.1% | 0.0022 |
| Strict stateful monitor | 0.0% | 80.0% | 11.1% | 0.0254 |
| Sentinel − budget | 15.4% | 100.0% | 0.0% | 0.0260 |
| Sentinel − count | 7.7% | 100.0% | 0.0% | 0.0246 |
| Sentinel − replay | 15.4% | 100.0% | 0.0% | 0.0017 |
| Sentinel − binding | 7.7% | 100.0% | 0.0% | 0.0255 |
| Sentinel − frequency | 7.7% | 100.0% | 0.0% | 0.0253 |
| Sentinel402 | 0.0% | 100.0% | 0.0% | 0.0243 |

Full confidence intervals, denominators, category breakdowns and environment metadata are in summary.json. No external published baseline is reproduced here.
