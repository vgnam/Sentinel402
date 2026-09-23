# Systems experiments

Sandbox fault/concurrency checks. The non-atomic row is an intentionally unsafe in-memory counterexample; timings are not a fair latency comparison with SQLite. Cross-connection worker contention is additionally tested by npm test.

| Experiment | Outcome | Encumbered USDC | Overshoot USDC |
|---|---|---:|---:|
| Non-atomic snapshot counterexample | 40/40 released | 40 | 35 |
| SQLite atomic reservations | 5/40 released | 5 | 0 |
| Confirmed adapter failure | failed | 0 | n/a |
| Unknown result and missing receipt | unknown | 1 | n/a |
| Late success after lost response | succeeded | 1 | n/a |
| Restart after reservation, before submission | reserved | 1 | n/a |
