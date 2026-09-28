# Randomized service trajectories

Seeded sequential model-based stress of the actual service with in-memory SQLite. Independent effect/state ledger and audit checks; not a formal proof, a concurrent stress run, or a representative attack distribution. Random UUIDs normalized only for reproducibility hashing.

50 trajectories × 80 steps = 4000 proposals. Invariant failures: 0.

| Event | Count |
|---|---:|
| Allow | 418 |
| Repair | 38 |
| Escalate | 155 |
| Block | 3389 |
| succeeded | 276 |
| failed | 94 |
| unknown | 86 |
| malformed | 326 |
| revocations | 12 |

Stimulus SHA-256: dd3e83bee51b31e6ebba5ffd67ff0bdf6bc3ad3b7bb3c4747df19fa8a549578c.
