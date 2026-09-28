# Storage and adapter experiments

Worker threads use independent SQLite connections and a ready/start barrier. 80 requests compete for 20 successful slots; request throughput includes rejections. One measurement per cell, not a throughput confidence interval. Recovery closes/reopens storage at saga boundaries; this is not a power-loss or forced-process-kill test. Recovery elapsed time includes a deliberate drain wait.

Invariant failures: 0.

| Workers | Adapter delay ms | Succeeded / requests | Overshoot USDC | Request p95 ms | Successful p95 ms |
|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 20/80 | 0 | 245.50 | 259.00 |
| 1 | 5 | 20/80 | 0 | 192.78 | 194.87 |
| 1 | 25 | 20/80 | 0 | 201.61 | 204.19 |
| 2 | 0 | 20/80 | 0 | 145.47 | 153.10 |
| 2 | 5 | 20/80 | 0 | 119.55 | 122.99 |
| 2 | 25 | 20/80 | 0 | 225.24 | 229.69 |
| 4 | 0 | 20/80 | 0 | 122.31 | 122.31 |
| 4 | 5 | 20/80 | 0 | 84.32 | 85.13 |
| 4 | 25 | 20/80 | 0 | 80.58 | 80.58 |
| 8 | 0 | 20/80 | 0 | 287.93 | 78.88 |
| 8 | 5 | 20/80 | 0 | 228.53 | 109.81 |
| 8 | 25 | 20/80 | 0 | 235.06 | 47.91 |

Fault matrix: 27 cells. Reopen/reconciliation: 5 boundaries. See CSV and summary.json for every condition and outcome.
