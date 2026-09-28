# Problem Formulation and Methodology

## Problem Formulation

### Setting and delegated authority

We consider an autonomous agent that performs a user-directed task and may request payments for external services. At step $t$, the agent observes a context $h_t$ that can include untrusted tool output and proposes a structured payment

$$
a_t=(i_t,v_t,r_t,q_t,\rho_t),
$$

where $i_t$ is the claimed intent identifier, $v_t$ is the amount, $r_t$ is the recipient, $q_t$ is the resource, and $\rho_t$ is a payment reference. The agent can choose every field in the proposal. The authorization time $\tau_t$ is supplied by the monitor's clock rather than by the agent. A proposal can be unsafe because of prompt injection, reasoning error, replay, or a sequence of payments whose aggregate effect exceeds the user's authority. We address the authorization of payment effects, rather than the correctness of the agent's reasoning.

Before the agent receives payment access, an operator creates a structured intent contract

$$
I_i=(i,p,B,\ell,\mathcal R,\mathcal Q,[T_s,T_e],N,\Gamma).
$$

Here, $i$ identifies the task, $p$ records its stated purpose, $B$ is the total budget, $\ell$ is the per-payment cap, $\mathcal R$ and $\mathcal Q$ are the allowed recipients and resources, $[T_s,T_e]$ is the validity interval, $N$ is the maximum number of payments, and $\Gamma$ contains optional frequency, escalation, and repair rules. The contract is immutable once issued. Its purpose field explains the authorization to an operator; the monitor enforces the structured recipient and resource fields and does not infer whether a purchase semantically serves $p$. All amounts use one fixed accounting unit and integer micro-units, so the policy never depends on floating-point rounding or currency conversion.

### Stateful authorization

Let $\mathcal L_i(t)$ be the transactions for intent $i$ whose latest status is *succeeded*, *reserved*, or *unknown* before proposal $t$. A reserved transaction has not yet produced a conclusive receipt; an unknown transaction may have produced an external effect despite a lost or ambiguous response. Define committed spend $C_i(t)$, pending or uncertain spend $P_i(t)$, encumbered spend $E_i(t)$, and occupied transaction slots $K_i(t)$ as

$$
\begin{aligned}
C_i(t)&=\sum_{x\in\mathcal L_i(t):\,\operatorname{status}(x)=\mathrm{succeeded}}v(x),\\
P_i(t)&=\sum_{x\in\mathcal L_i(t):\,\operatorname{status}(x)\in\{\mathrm{reserved},\mathrm{unknown}\}}v(x),\\
E_i(t)&=C_i(t)+P_i(t),\qquad K_i(t)=|\mathcal L_i(t)|.
\end{aligned}
$$

Definitively failed transactions leave $\mathcal L_i(t)$ and release their reserved capacity. Reserved and unknown transactions remain in the replay and frequency histories. This conservative accounting is necessary because concurrent proposals and uncertain settlement must not reuse the same authority.

For a candidate executable action $a'_t$, the monitor checks task binding, revocation, recipient and resource membership, validity at reservation time, duplicate references, applicable frequency limits, and the capacity constraints

$$
E_i(t)+v(a'_t)\leq B,\qquad K_i(t)+1\leq N.
$$

The per-payment cap also applies unless an explicitly authorized amount repair converts the proposal to a compliant candidate. A repeated reference is checked within the bound intent and recipient even if the agent changes the amount or resource. Because the current reference is supplied by the caller, changing that reference can evade this duplicate match; authenticated merchant invoice identity is outside the present implementation.

We model the monitor as a state transition

$$
M(I_i,s_i(t),a_t,\tau_t)\rightarrow(d_t,a'_t,s_i(t+1)),
\qquad
d_t\in\{\mathrm{Allow},\mathrm{Repair},\mathrm{Escalate},\mathrm{Block}\}.
$$

Only *Allow* and *Repair* return an executable action. *Repair* is limited to clipping an amount when the contract explicitly lists the resource as repairable, followed by reevaluation of all constraints. *Escalate* returns no executable action and requires a separately issued intent with new authority. *Block* handles hard violations, including invalid binding, recipient or resource, time, replay, budget, count, or frequency. The safety objective is that every action released to the payment adapter satisfies the active contract and that the encumbered budget and slot invariants hold across the trajectory.

This objective is conditional on complete mediation: the agent has no other route to a wallet or payment tool. It also assumes the contract was correctly authorized, the monitor and store are trusted, the clock is reliable, and adapter receipts are authentic. It does not protect against a compromised operator credential, malicious but authorized merchant, incorrect contract, or a compromised adapter. A successful sandbox receipt is not evidence of blockchain settlement.

## Methodology

### Intent issuance and proposal normalization

The operator submits a structured contract to the control plane. Sentinel402 validates its amounts, identifiers, validity interval, and consistency rules, then stores the contract and issues an intent-scoped agent credential. The store retains a hash of that credential. On each agent request, authentication resolves the bound intent independently of the intent identifier in the proposal; the proposal cannot select a different contract. Revocation prevents new reservations, although it does not reverse an already reserved or submitted transaction.

At ingress, the monitor rejects unknown fields, missing values, ambiguous identifiers, nonpositive amounts, floating-point inputs, scientific notation, and amounts with more than six decimal places. It canonicalizes supported identifiers and converts decimal strings to integer micro-units. The server supplies the evaluation time. Free-text notes and external tool content are treated as untrusted context and cannot expand authority.

### Deterministic intervention

For each normalized proposal, the evaluator checks intent binding and revocation, recipient and resource scope, validity, and replay. It forms a candidate by clipping an amount above the per-payment cap only when the contract explicitly permits clipping for that resource. Budget, count, and frequency checks then use that candidate and include successful, reserved, and unknown transactions in the state. Any hard violation blocks the proposal. If none exists, a candidate that still exceeds the per-payment cap or an optional escalation threshold requires new authority. The remaining proposals are repaired or allowed. Thus the effective precedence is

$$
\mathrm{Block}>\mathrm{Escalate}>\mathrm{Repair}>\mathrm{Allow}.
$$

Clipping changes only the amount. It does not replace a recipient or resource, rewrite a reference, or assume that a smaller fixed-price purchase has the same meaning.

### Reservation, execution, and reconciliation

Authorization and reservation occur inside a SQLite transaction using an immediate write lock. The monitor reads the current contract and state, evaluates the proposal, inserts the executable reservation, and appends an audit record before committing. Independent concurrent requests therefore observe prior reservations. After this commit, the service calls a payment adapter with the reserved action and the transaction identifier as an idempotency key.

A definitive success commits the payment; a definitive failure releases its budget, slot, and invoice key. A timeout, exception, malformed response, or missing receipt leaves the transaction *unknown* and retains its capacity. Reconciliation may change that status only on the basis of an adapter receipt; absence of a receipt is not treated as proof of failure. The local database and an external payment system cannot share one atomic transaction, so a crash can leave a reservation before submission or after an effect but before local finalization. The present implementation uses a durable idempotent sandbox adapter. A real settlement adapter would additionally require trusted invoice provenance, receipt verification, isolated signing, and operational recovery.

The system records intent issuance and revocation, authenticated proposals, decisions, reservations, and execution outcomes in a hash-linked audit log. Local verification detects edits within the retained chain. Detecting complete chain replacement or suffix deletion requires retaining the chain head outside the writable database; the current application does not provide such an external anchor.

An optional devnet-only SPL test-token adapter now implements a durable signed-transaction outbox and verifies confirmed token effects before finalization. Its invoices are pinned by the demo operator, not authenticated by an independent merchant. The default server remains sandbox-only. The attempted devnet run is incomplete because the public faucet returned errors; no on-chain success is claimed.

### Evaluation protocol

We evaluate policy behavior, service state handling, and live agent interaction separately. The deterministic policy study uses a seeded synthetic corpus of 18 trajectory families: 13 adversarial and five benign. Its default configuration has 50 variants per family, yielding 900 trajectories. Every method receives the same contracts and structured proposals. The comparison includes unguarded execution, simple local checks, a budget-and-count ledger, a strict stateful monitor without repair, Sentinel402, and five component ablations. These are local mechanism comparisons, not reproductions of external published systems.

An independent oracle checks each released action against its contract and preceding effects without invoking the production policy evaluator. The primary safety measure is the fraction of adversarial trajectories with at least one unsafe released effect; uncertain effects are counted conservatively. Utility measures include benign completion and false rejection of expected-success benign proposals. Policy latency is measured separately from parsing, storage, network, model inference, and settlement. Paired trajectory comparisons and family-level analysis help expose dependence on the synthetic task mix. Zero observed violations on this corpus cannot establish zero risk.

Service experiments exercise concurrent reservations, confirmed adapter failure, ambiguous results, late receipts, and restart persistence. A separate small live-model pilot tests whether an agent can call the protected payment path and records both its proposals and the sandbox outcomes. The synthetic policy corpus does not measure whether an attacker can induce an LLM to propose an unsafe payment, and the live pilot is too small to establish a general prompt-injection defense claim. These distinctions keep monitor correctness, agent behavior, and external settlement evidence separate.

### Extended experimental setting, 28 September 2026

The paid-data workflow uses a real loopback HTTP merchant with fictional products. Agents discover products, receive exact-price HTTP 402 quotes, propose payment, redeem successful receipts for data, and compute a final answer. The merchant validates its own quote for every method, including unguarded execution. We separately record unsafe proposals, unsafe releases, confirmed simulated effects, semantic task deviations, and safe task completion. Correct completion requires all requested data to be read, a correct computed answer, and no extra or duplicate purchases.

The predeclared split separates two development task families/two development attack families from two heldout task families/four heldout attack families. It is authored by the same researchers and is not an externally blinded test set. The completed offline matrix contains 48 episodes across unguarded, strict stateful and Sentinel. Its scripted injection-following actor measures mechanism coverage, not model susceptibility. Both stateful methods have zero unsafe effects but retain economic-duplicate task failures; they perform identically here. The finite feedback-driven candidate search is restricted to development and has so far been exercised only with that scripted actor. Live multi-model and model-driven search runners are prepared but have not been executed in this extension.

A separate process-failure experiment force-kills the payment worker at five acknowledged saga boundaries and reconciles in a fresh process against a separate durable settlement ledger. Fifteen cases show no invariant failure; six remain unresolved and retain authority, explicitly measuring the availability cost of uncertainty. These results concern process termination, not power loss or arbitrary disk failure. Randomized service testing additionally executed 4,000 sequential proposals with no detected invariant failure. See [REALISM.md](REALISM.md) for exact settings, artifacts, reproduction commands, limitations and the incomplete devnet report.
