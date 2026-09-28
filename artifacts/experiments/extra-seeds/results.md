# Expanded Sentinel402 experiments

Synthetic, paired mechanism evaluation. Family-cluster bootstrap intervals describe sensitivity within these hand-designed families; not a representative population confidence claim. Leave-one-family-out is composition sensitivity, not unseen-family training/test generalization. Repair prevalence is a reweighting calculation. System timings include SQLite and sandbox, not a real payment network.

2700 trajectories across 3 seeds, 12 methods; 36 sensitivity conditions; 12 contention cells, 27 fault cells, 5 recovery cases.

## Paired differences: Sentinel minus baseline

Family-macro averages; intervals resample entire families. Zero-width intervals do not bound unseen risk.

| Baseline | Metric | Difference | Family bootstrap 95% interval |
|---|---|---:|---|
| unguarded | unsafeRate | -1.0000 | [-1.0000, -1.0000] |
| unguarded | completion | 0.2000 | [0.0000, 0.6000] |
| per_tx_cap | unsafeRate | -0.8462 | [-1.0000, -0.6154] |
| per_tx_cap | completion | 0.2000 | [0.0000, 0.6000] |
| allowlist | unsafeRate | -0.8462 | [-1.0000, -0.6154] |
| allowlist | completion | 0.2000 | [0.0000, 0.6000] |
| stateless | unsafeRate | -0.4615 | [-0.7692, -0.2308] |
| stateless | completion | 0.2000 | [0.0000, 0.6000] |
| budget_ledger | unsafeRate | -0.2308 | [-0.4615, 0.0000] |
| budget_ledger | completion | 0.2000 | [0.0000, 0.6000] |
| strict_stateful | unsafeRate | 0.0000 | [0.0000, 0.0000] |
| strict_stateful | completion | 0.2000 | [0.0000, 0.6000] |
| no_budget | unsafeRate | -0.1538 | [-0.3846, 0.0000] |
| no_budget | completion | 0.0000 | [0.0000, 0.0000] |
| no_count | unsafeRate | -0.0769 | [-0.2308, 0.0000] |
| no_count | completion | 0.0000 | [0.0000, 0.0000] |
| no_replay | unsafeRate | -0.1538 | [-0.3846, 0.0000] |
| no_replay | completion | 0.0000 | [0.0000, 0.0000] |
| no_binding | unsafeRate | -0.0769 | [-0.2308, 0.0000] |
| no_binding | completion | 0.0000 | [0.0000, 0.0000] |
| no_frequency | unsafeRate | -0.0769 | [-0.2308, 0.0000] |
| no_frequency | completion | 0.0000 | [0.0000, 0.0000] |

## Files

- Per-seed raw corpus, traces, metrics and LaTeX tables: seed-*/
- Family breakdown: familyRows.csv
- Leave-one-family-out composition sensitivity: leaveOneOut.csv
- Repair prevalence reweighting: repairMix.csv
- Budget pressure / horizon / replay / repair: sensitivity.csv and sensitivity/
- Real SQLite contention, faults and restart boundaries: systems/

System invariant failures: 0. Live-model experiments remain separate from these results.

Randomized actual-service stress: 4000 proposals; 0 invariant failures. Raw stimuli, contracts and state/effect evidence are in randomized/.
