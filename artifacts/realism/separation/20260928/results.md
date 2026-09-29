# Stateful separation suite

Scripted proposal streams against sandbox adapters on a local SQLite file. "Restart" closes and reopens the store and clears in-process state; it is not a power loss, a second host or a blockchain. The strong baseline is an in-process monitor by construction, and a durable hard-reject monitor is included as the fair comparison. Not a statement about third-party implementations.

48 cases; pre-restart parity between the in-process and durable monitors: true.

| Arm | Unauthorized payments | Unauthorized USDC | Duplicate external payments | Probes authorized after restart | Clipped delivery | Audit valid |
|---|---:|---:|---:|---:|---:|---|
| unguarded | 12 | 45 | 9 | 9 | 0 | true |
| strict_stateful_memory | 9 | 27 | 9 | 9 | 0 | true |
| strict_stateful_durable | 0 | 0 | 0 | 0 | 0 | true |
| sentinel | 0 | 0 | 0 | 0 | 3 | true |
