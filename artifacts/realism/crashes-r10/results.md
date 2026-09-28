# Forced process crash experiment

SIGKILL/TerminateProcess at acknowledged phase boundaries; not power loss, disk failure, or a blockchain. Unknown/no receipt retains funds indefinitely; no automatic safe-release claim.

50 cases; 0 invariant failures; 20 unresolved reservations.

| Phase | Repeat | Result | Retained USDC | Restart + reconciliation ms |
|---|---:|---|---:|---:|
| reserved_only | 0 | unknown | 1 | 223.36 |
| external_success | 0 | succeeded | 1 | 201.97 |
| external_failure | 0 | failed | 0 | 230.09 |
| finalized | 0 | succeeded | 1 | 213.95 |
| unknown | 0 | unknown | 1 | 213.53 |
| reserved_only | 1 | unknown | 1 | 205.77 |
| external_success | 1 | succeeded | 1 | 225.90 |
| external_failure | 1 | failed | 0 | 234.65 |
| finalized | 1 | succeeded | 1 | 221.11 |
| unknown | 1 | unknown | 1 | 257.98 |
| reserved_only | 2 | unknown | 1 | 255.43 |
| external_success | 2 | succeeded | 1 | 289.05 |
| external_failure | 2 | failed | 0 | 251.22 |
| finalized | 2 | succeeded | 1 | 219.22 |
| unknown | 2 | unknown | 1 | 229.42 |
| reserved_only | 3 | unknown | 1 | 250.79 |
| external_success | 3 | succeeded | 1 | 210.35 |
| external_failure | 3 | failed | 0 | 214.17 |
| finalized | 3 | succeeded | 1 | 223.31 |
| unknown | 3 | unknown | 1 | 240.43 |
| reserved_only | 4 | unknown | 1 | 215.55 |
| external_success | 4 | succeeded | 1 | 252.60 |
| external_failure | 4 | failed | 0 | 239.29 |
| finalized | 4 | succeeded | 1 | 213.65 |
| unknown | 4 | unknown | 1 | 226.35 |
| reserved_only | 5 | unknown | 1 | 228.52 |
| external_success | 5 | succeeded | 1 | 212.39 |
| external_failure | 5 | failed | 0 | 203.40 |
| finalized | 5 | succeeded | 1 | 189.31 |
| unknown | 5 | unknown | 1 | 219.46 |
| reserved_only | 6 | unknown | 1 | 206.77 |
| external_success | 6 | succeeded | 1 | 210.94 |
| external_failure | 6 | failed | 0 | 217.76 |
| finalized | 6 | succeeded | 1 | 222.24 |
| unknown | 6 | unknown | 1 | 212.33 |
| reserved_only | 7 | unknown | 1 | 214.06 |
| external_success | 7 | succeeded | 1 | 217.67 |
| external_failure | 7 | failed | 0 | 268.44 |
| finalized | 7 | succeeded | 1 | 311.98 |
| unknown | 7 | unknown | 1 | 292.87 |
| reserved_only | 8 | unknown | 1 | 318.52 |
| external_success | 8 | succeeded | 1 | 302.68 |
| external_failure | 8 | failed | 0 | 291.65 |
| finalized | 8 | succeeded | 1 | 299.62 |
| unknown | 8 | unknown | 1 | 413.53 |
| reserved_only | 9 | unknown | 1 | 594.32 |
| external_success | 9 | succeeded | 1 | 381.18 |
| external_failure | 9 | failed | 0 | 294.10 |
| finalized | 9 | succeeded | 1 | 293.15 |
| unknown | 9 | unknown | 1 | 328.02 |
