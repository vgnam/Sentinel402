Dưới đây là nội dung đã được định dạng chuẩn Markdown, tối ưu hóa cú pháp toán học (sử dụng `$` cho inline và `$$` cho block) để khi copy vào Notion, các công thức sẽ tự động hiển thị đẹp mắt:

***

# Sentinel402: Stateful Authorization Layer

## Problem Formulation

We consider an autonomous agent that performs user-directed tasks involving financial transactions. At step $t$, the agent observes its interaction context $h_t$ and proposes an action

$$
a_t = \pi(h_t)
$$

where $\pi$ denotes the agent policy. A payment action is represented as

$$
a_t = (v_t, r_t, q_t, \tau_t, m_t)
$$

where $v_t$ is the transaction amount, $r_t$ is the recipient, $q_t$ is the requested resource or service, $\tau_t$ is the transaction time, and $m_t$ contains protocol-specific metadata.

Direct execution of $a_t$ is unsafe because an agent's proposed transaction may deviate from the user's original authorization. Such deviations may arise from prompt injection, incorrect reasoning, malicious external content, task confusion, replayed requests, or sequences of individually valid transactions whose cumulative effect exceeds the user's intended scope. We therefore assume that the user defines an explicit authorization contract before the agent is permitted to produce payment effects.

We represent this authorization as an **intent contract**

$$
I = (\mathrm{id}, p, B, \ell, \mathcal{R}, \mathcal{Q}, [t_s, t_e], N, \Gamma)
$$

where $\mathrm{id}$ uniquely identifies the authorized task, $p$ specifies its purpose, $B$ is the total spending budget, $\ell$ is the maximum amount permitted per transaction, $\mathcal{R}$ is the set of authorized recipients, $\mathcal{Q}$ is the set of authorized resources or services, $[t_s, t_e]$ is the validity interval, $N$ is the maximum number of successful transactions, and $\Gamma$ contains optional history-dependent authorization rules.

Because authorization may depend on previous payments, transaction validity cannot in general be determined from $a_t$ alone. Sentinel402 therefore maintains a per-intent **authorization state**

$$
s_t = (c_t, n_t, \mathcal{H}_t, \mathcal{D}_t)
$$

where $c_t$ is the cumulative committed spending, $n_t$ is the number of successfully executed transactions, $\mathcal{H}_t$ is the transaction history, and $\mathcal{D}_t$ stores previously committed transaction fingerprints for replay and duplicate detection.

Given a proposed transaction $a_t$, state $s_t$, and intent contract $I$, Sentinel402 applies an authorization function

$$
S(s_t, a_t, I) \rightarrow (a_t', d_t)
$$

where

$$
d_t \in \{\text{Allow}, \text{Repair}, \text{Escalate}, \text{Block}\}
$$

Here, $a_t'$ is the executable transaction when authorization succeeds, possibly after an explicitly permitted repair. No executable transaction is returned for blocked or escalated requests.

The authorization decision depends on both transaction-local and state-dependent constraints. We write

$$
C_t = C_{\mathrm{local}}(a_t, I) \land C_{\mathrm{state}}(s_t, a_t, I)
$$

The basic local constraints include

$$
v_t \leq \ell, \quad r_t \in \mathcal{R}, \quad q_t \in \mathcal{Q}, \quad t_s \leq \tau_t \leq t_e
$$

together with a valid binding between the proposed transaction and the corresponding intent contract. Stateful constraints include

$$
c_t + v_t \leq B
$$

and

$$
n_t + 1 \leq N
$$

as well as duplicate, replay, frequency, and other history-dependent rules defined in $\Gamma$.

The corresponding **safe action set** is

$$
\mathcal{A}_{\mathrm{safe}}(s_t, I) = \left\{ a \in \mathcal{A} : C_{\mathrm{local}}(a, I) \land C_{\mathrm{state}}(s_t, a, I) \right\}
$$

This stateful formulation captures attacks that cannot be detected by evaluating transactions independently. For example, an attacker may decompose an unauthorized payment $V$ into a sequence

$$
V = \sum_{k=1}^{K} v_k, \quad v_k \leq \ell
$$

Each transaction may individually satisfy the per-transaction limit, while the sequence collectively exceeds the authorized budget, transaction count, or payment-frequency constraints. Since Sentinel402 evaluates each new transaction with respect to the evolving authorization state, such sequences can be rejected before their cumulative effect exceeds the user's authorization.

Our objective is therefore not to modify the internal reasoning policy $\pi$, but to enforce an independent boundary on its external financial effects:

$$
a_t' \in \mathcal{A}_{\mathrm{safe}}(s_t, I)
$$

Sentinel402 acts as a stateful, intent-bound reference monitor between the autonomous agent and the payment execution layer, ensuring that executable payments remain within the authority explicitly delegated by the user.

---

## Methodology

Sentinel402 is implemented as a deterministic authorization layer placed between an autonomous agent and the payment execution interface. The agent may generate arbitrary payment proposals, but it cannot directly invoke the wallet or payment protocol. Every proposed transaction must pass through Sentinel402 before it can produce an external financial effect.

The runtime procedure consists of six stages: intent-contract construction, transaction interception and normalization, policy evaluation, intervention, atomic execution and state update, and audit logging.

### 1. Intent Contract Construction

Before payment execution is enabled, the user's authorization is converted into the structured intent contract

$$
I = (\mathrm{id}, p, B, \ell, \mathcal{R}, \mathcal{Q}, [t_s, t_e], N, \Gamma)
$$

The contract may be constructed from a user interface, application configuration, or natural-language authorization. If natural language is used, it is translated into the structured representation before enforcement begins. The enforcement path operates exclusively on the resulting structured contract rather than on subsequent natural-language agent messages.

Each contract is assigned a unique identifier $\mathrm{id}$ and bound to a single authorized task. Once the user confirms the authorization, the contract is stored outside the agent's writable context and cannot be modified through subsequent prompts, tool outputs, or retrieved external content.

This task binding prevents authority granted for one purpose from being reused for another. For example, an authorization to purchase API credits cannot be reused to purchase an unrelated product even when the recipient and payment amount would otherwise satisfy the contract.

For a newly authorized intent, Sentinel402 initializes

$$
s_0 = (c_0, n_0, \mathcal{H}_0, \mathcal{D}_0)
$$

with

$$
c_0 = 0, \quad n_0 = 0, \quad \mathcal{H}_0 = \emptyset, \quad \mathcal{D}_0 = \emptyset
$$

### 2. Transaction Interception and Normalization

When the agent initiates a payment, Sentinel402 intercepts the raw payment request $x_t$ before it reaches the underlying payment interface.

A deterministic normalization function

$$
\phi: x_t \mapsto a_t
$$

converts the request into the canonical representation

$$
a_t = \phi(x_t) = (v_t, r_t, q_t, \tau_t, m_t)
$$

Normalization ensures that semantically equivalent payment requests are represented consistently. Recipient aliases are resolved to canonical recipient identifiers, monetary values are converted to a fixed currency and precision, resource identifiers are canonicalized, and protocol-specific identifiers such as invoice IDs or request IDs are extracted into $m_t$.

Security-relevant fields must be unambiguous after normalization. If the amount, recipient, resource, intent identifier, or other required authorization field is missing or cannot be parsed reliably, Sentinel402 rejects the request rather than inferring a value.

Each transaction proposal must reference the intent identifier under which the payment is requested. Sentinel402 retrieves only the corresponding contract $I$ and state $s_t$. A payment cannot inherit authorization from another task or intent.

### 3. Stateful Policy Evaluation

For each normalized transaction, Sentinel402 evaluates a fixed set of authorization predicates.

The local authorization condition is

$$
C_{\mathrm{local}} = C_{\mathrm{intent}} \land C_{\mathrm{amount}} \land C_{\mathrm{recipient}} \land C_{\mathrm{resource}} \land C_{\mathrm{time}}
$$

These predicates verify that

$$
v_t \leq \ell
$$
$$
r_t \in \mathcal{R}
$$
$$
q_t \in \mathcal{Q}
$$

and

$$
t_s \leq \tau_t \leq t_e
$$

together with a valid association between the transaction and the current intent identifier.

State-dependent constraints are evaluated using $s_t$. The cumulative-budget constraint requires

$$
c_t + v_t \leq B
$$

while the transaction-count constraint requires

$$
n_t + 1 \leq N
$$

Sentinel402 also performs replay and duplicate detection. For each transaction, it computes a fingerprint

$$
f_t = H(\mathrm{id} \Vert r_t \Vert q_t \Vert v_t \Vert \mathrm{ref}_t)
$$

where $\mathrm{ref}_t$ denotes a protocol-level invoice, payment-request, or transaction identifier when available. A request is classified as a replay when the same fingerprint is already contained in $\mathcal{D}_t$.

Additional history-dependent policies are represented by $\Gamma$. For example, suppose a contract permits at most $K$ matching transactions to a recipient-resource pair during a time window $w$. Sentinel402 evaluates

$$
\operatorname{count}(\mathcal{H}_t, r_t, q_t, [\tau_t-w, \tau_t]) + 1 \leq K
$$

The complete authorization predicate is

$$
C_t = C_{\mathrm{local}}(a_t, I) \land C_{\mathrm{state}}(s_t, a_t, I)
$$

Because $C_{\mathrm{state}}$ depends on committed transaction history, a payment can be rejected even when the same transaction would have been valid earlier in the trajectory. This prevents authorization from being treated as an independent per-request classification problem.

Sentinel402 follows **fail-closed semantics**. If the intent contract cannot be resolved, state retrieval fails, normalization is incomplete, or policy evaluation cannot be completed reliably, the transaction is not released for execution.

### 4. Intervention Decision

After policy evaluation, Sentinel402 returns one of four decisions:

$$
d_t \in \{\text{Allow}, \text{Repair}, \text{Escalate}, \text{Block}\}
$$

- **Allow**: Returned when all applicable authorization constraints hold.
- **Block**: Used for hard violations for which the current contract provides no valid execution path. Examples include an invalid intent binding, unauthorized recipient, unauthorized resource, expired authorization, replayed transaction, exhausted total budget, or exhausted transaction count.
- **Escalate**: Returned when execution requires new user authority. The original transaction remains non-executable until an updated or new intent contract is explicitly authorized by the user.
- **Repair**: Permitted only when the intent contract explicitly marks a field and transformation as repairable. Repairs must preserve the semantics authorized by the user. Sentinel402 does not silently replace recipients or resources, and it does not infer alternative purchases.

For example, if the contract explicitly permits amount clipping for a payment type whose semantics remain unchanged, the system may apply

$$
v_t' = \min(v_t, \ell)
$$

The complete policy evaluation is then repeated on the repaired transaction. The modified action is released only if every authorization constraint succeeds after repair.

If multiple constraints fail simultaneously, Sentinel402 applies the fixed precedence

$$
\text{Block} > \text{Escalate} > \text{Repair} > \text{Allow}
$$

Consequently,

$$
S(s_t, a_t, I) \rightarrow (a_t', d_t)
$$

where $a_t' = a_t$ for an allowed transaction, $a_t'$ is the fully revalidated modified action for a permitted repair, and no executable action is returned for blocked or escalated requests.

### 5. Atomic Execution and State Update

Authorization and state modification must be atomic with respect to concurrent payment requests. Otherwise, multiple requests may evaluate the same state and independently satisfy constraints such as

$$
c_t + v_t \leq B
$$

even though executing all of them would exceed the budget.

Before an authorized transaction is released to the payment layer, Sentinel402 reserves the corresponding spending amount and transaction slot in the state store. Concurrent authorization checks therefore observe the reservation rather than the previous unmodified state.

If execution of

$$
a_t' = (v_t', r_t', q_t', \tau_t', m_t')
$$

succeeds, the reservation is committed and the state becomes

$$
c_{t+1} = c_t + v_t'
$$
$$
n_{t+1} = n_t + 1
$$

The executed transaction is appended to $\mathcal{H}_t$, and its fingerprint is added to $\mathcal{D}_t$.

If payment execution fails, the reservation is rolled back. Failed, blocked, and escalated transactions do not consume committed spending budget or successful-transaction capacity.

This **commit-on-success** rule ensures that the authorization state reflects actual external financial effects rather than merely attempted payments.

### 6. Audit Record

Sentinel402 generates an audit record for every intercepted proposal, including requests that are blocked, repaired, escalated, or fail during execution.

We represent an audit record as

$$
R_t = (\mathrm{id}, a_t, a_t', d_t, \mathcal{V}_t, s_t, \tau_t)
$$

where $\mathcal{V}_t$ contains the authorization predicates or constraints that contributed to the decision.

Records may be linked through a hash chain,

$$
h_t = H(h_{t-1} \Vert R_t)
$$

making later modification of previously recorded decisions detectable when the current chain head is maintained in a trusted location. The hash chain provides tamper evidence rather than preventing modification of the underlying storage.

The complete execution path is therefore:

1. **Agent Proposal** $\rightarrow$
2. **Interception** $\rightarrow$
3. **Normalization** $\rightarrow$
4. **Stateful Authorization** $\rightarrow$
5. **Intervention** $\rightarrow$
6. **Atomic Execution** $\rightarrow$
7. **State Commit/Rollback**

No language model is required in the enforcement path. Once the intent contract has been established, authorization is performed by deterministic checks over the structured transaction, trusted contract, and evolving payment state. Sentinel402 therefore constrains autonomous payment behavior over an entire transaction trajectory while remaining independent of the agent's internal reasoning process.
