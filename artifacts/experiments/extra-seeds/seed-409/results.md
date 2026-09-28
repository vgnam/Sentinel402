# Synthetic authorization benchmark

Synthetic authorization trajectories, not an end-to-end LLM prompt-injection benchmark. ASR counts unsafe releases, including uncertain outcomes. Wilson intervals assume independent trials; repeated templates are clustered. Latency excludes parsing, SQLite, network and settlement.

Seed: 409. Trajectories: 900. Corpus SHA-256: `86439e1257946fff682840c81c9a38e034495b0c72474703581ae535f9bc5d53`.

| Method | Unsafe trajectory rate ↓ | Benign completion ↑ | False rejection ↓ | Policy p95 (ms) |
|---|---:|---:|---:|---:|
| Unguarded | 100.0% | 80.0% | 0.0% | 0.0003 |
| Per-transaction cap | 84.6% | 80.0% | 11.1% | 0.0011 |
| Recipient allowlist | 84.6% | 80.0% | 0.0% | 0.0010 |
| Stateless policy | 46.2% | 80.0% | 11.1% | 0.0012 |
| Budget + count ledger | 23.1% | 80.0% | 11.1% | 0.0009 |
| Strict stateful monitor | 0.0% | 80.0% | 11.1% | 0.0238 |
| Sentinel − budget | 15.4% | 100.0% | 0.0% | 0.0251 |
| Sentinel − count | 7.7% | 100.0% | 0.0% | 0.0220 |
| Sentinel − replay | 15.4% | 100.0% | 0.0% | 0.0009 |
| Sentinel − binding | 7.7% | 100.0% | 0.0% | 0.0140 |
| Sentinel − frequency | 7.7% | 100.0% | 0.0% | 0.0210 |
| Sentinel402 | 0.0% | 100.0% | 0.0% | 0.0122 |

Full confidence intervals, denominators, category breakdowns and environment metadata are in summary.json. No external published baseline is reproduced here.
