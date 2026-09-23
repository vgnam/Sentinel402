# Storage and adapter experiments

Worker threads use independent SQLite connections and a ready/start barrier. 80 requests compete for 20 successful slots; request throughput includes rejections. One measurement per cell, not a throughput confidence interval. Recovery closes/reopens storage at saga boundaries; this is not a power-loss or forced-process-kill test. Recovery elapsed time includes a deliberate drain wait.

Invariant failures: 0.

| Workers | Adapter delay ms | Succeeded / requests | Overshoot USDC | Request p95 ms | Successful p95 ms |
|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 20/80 | 0 | 188.82 | 198.83 |
| 1 | 5 | 20/80 | 0 | 162.47 | 165.03 |
| 1 | 25 | 20/80 | 0 | 165.61 | 167.72 |
| 2 | 0 | 20/80 | 0 | 136.15 | 143.28 |
| 2 | 5 | 20/80 | 0 | 101.72 | 103.58 |
| 2 | 25 | 20/80 | 0 | 99.93 | 101.48 |
| 4 | 0 | 20/80 | 0 | 206.84 | 213.08 |
| 4 | 5 | 20/80 | 0 | 70.86 | 70.86 |
| 4 | 25 | 20/80 | 0 | 80.13 | 69.82 |
| 8 | 0 | 20/80 | 0 | 221.52 | 221.52 |
| 8 | 5 | 20/80 | 0 | 174.31 | 113.31 |
| 8 | 25 | 20/80 | 0 | 237.70 | 237.70 |

Fault matrix: 27 cells. Reopen/reconciliation: 5 boundaries. See CSV and summary.json for every condition and outcome.
