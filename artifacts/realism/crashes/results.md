# Forced process crash experiment

SIGKILL/TerminateProcess at acknowledged phase boundaries; not power loss, disk failure, or a blockchain. Unknown/no receipt retains funds indefinitely; no automatic safe-release claim.

15 cases; 0 invariant failures; 6 unresolved reservations.

| Phase | Repeat | Result | Retained USDC | Restart + reconciliation ms |
|---|---:|---|---:|---:|
| reserved_only | 0 | unknown | 1 | 104.46 |
| external_success | 0 | succeeded | 1 | 100.01 |
| external_failure | 0 | failed | 0 | 121.50 |
| finalized | 0 | succeeded | 1 | 105.51 |
| unknown | 0 | unknown | 1 | 114.96 |
| reserved_only | 1 | unknown | 1 | 97.85 |
| external_success | 1 | succeeded | 1 | 101.82 |
| external_failure | 1 | failed | 0 | 149.87 |
| finalized | 1 | succeeded | 1 | 126.22 |
| unknown | 1 | unknown | 1 | 126.02 |
| reserved_only | 2 | unknown | 1 | 120.19 |
| external_success | 2 | succeeded | 1 | 122.52 |
| external_failure | 2 | failed | 0 | 121.80 |
| finalized | 2 | succeeded | 1 | 112.55 |
| unknown | 2 | unknown | 1 | 112.39 |
