# Randomized service trajectories

Seeded sequential model-based stress of the actual service with in-memory SQLite. Independent effect/state ledger and audit checks; not a formal proof, a concurrent stress run, or a representative attack distribution. Random UUIDs normalized only for reproducibility hashing.

50 trajectories × 80 steps = 4000 proposals. Invariant failures: 0.

| Event | Count |
|---|---:|
| Allow | 463 |
| Repair | 50 |
| Escalate | 147 |
| Block | 3340 |
| succeeded | 302 |
| failed | 89 |
| unknown | 122 |
| malformed | 349 |
| revocations | 10 |

Stimulus SHA-256: 95f9238147fa7a59c80af5fd2d75afd0e57e4c3e133ebdcc414e7e297dd4df49.
