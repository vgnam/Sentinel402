# Stateful separation suite - where Sentinel actually differs (28 September 2026)

Deterministic, scripted proposal streams. No model, no network, no randomness except the sandbox
idempotency keys. 4 arms x 4 scenarios x 3 repetitions = 48 cases.

Scenarios (`research/separation.mjs`): `replay_after_restart`, `budget_after_restart`,
`count_after_restart` and `clip_requires_repair` (invoice 6 USDC, contract clips `api:search` to 5).
Each restart scenario pays a pre-stream, closes and reopens the store (a restart), then submits one
probe that is only distinguishable from the pre-stream through state: an exact replay, a payment that
would exceed the 10 USDC budget, and a payment that would exceed `maxTransactions`.

Arms:

| arm | policy | state |
|---|---|---|
| `unguarded` | allow everything | none |
| `strict_stateful_memory` | `evaluate(..., { repair: false })` | in-process array, lost on restart |
| `strict_stateful_durable` | identical policy | own SQLite file, survives restart |
| `sentinel` | the real service | SQLite store, audit chain, durable outbox |

Result, scored by the independent oracle in `research/oracle.mjs` and cross-checked against the
merchant's own ledger:

| arm | unauthorized payments | unauthorized USDC | duplicate external payments | probes authorized after restart | clipped amount delivered | audit valid |
|---|---:|---:|---:|---:|---:|---|
| unguarded | 12 | 45 | 9 | 9 | 0 | yes |
| strict_stateful_memory | 9 | 27 | 9 | 9 | 0 | yes |
| strict_stateful_durable | 0 | 0 | 0 | 0 | 0 | yes |
| sentinel | 0 | 0 | 0 | 0 | 3 | yes |

Readings this supports:

- **The strong baseline's guarantee is scoped to the process.** After a restart the in-process monitor
  authorized all nine probes: a replayed invoice, a payment that pushed the contract to 13 of 10 USDC,
  and a fourth payment against `maxTransactions = 3`, for 27 USDC of effects the oracle flags.
- **Pre-restart parity is `true`**: before the restart the in-process and durable monitors returned
  byte-identical decisions on every scenario and repetition. The difference is therefore where the
  state lives, not a weaker policy function.
- **Sentinel separates on durability, and a durable hard-reject monitor also passes that axis.**
  `strict_stateful_durable` reaches 0 unauthorized payments, so persistence alone is not unique to
  Sentinel - it is the property that the usual in-process baseline lacks.
- **Sentinel separates again on repair.** In the clip scenario Sentinel delivered the authorized
  5 USDC in 3 of 3 repetitions (the oracle expects exactly that effect), while both hard-reject
  monitors escalated and delivered nothing, and the unguarded arm paid the unauthorized 6 USDC.
  This is the axis on which a repair rule is strictly more useful than a hard reject.
- **Sentinel is the only arm that holds both properties at once.** Neither baseline does: the
  in-process monitor loses it after a restart, the durable monitor can never clip.

Limitations: scripted streams and sandbox adapters on a local SQLite file. A "restart" closes and
reopens the store and clears in-process state; it is not power loss, a second host, or a blockchain.
The strong baseline is an in-process monitor by construction (that is how it is defined in
`research/baselines.mjs`), and a durable hard-reject monitor is included precisely so the comparison
does not rest on that definition.

Reproduce: `npm run research:separation -- --repetitions 3`. Guarding tests: `tests/separation.test.mjs`
(6 tests) assert both the Sentinel invariants and the baseline's documented post-restart failures, so
the suite fails if either side changes.
