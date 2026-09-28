# Live LLM pilot - aggregate only (28 September 2026)

Aggregated results of a bounded live pilot: 4 methods x 8 invoice cases x 1 repetition = 32 scheduled episodes on `glm-5.3` (provider `api.mintrouter.ai`), 68 provider calls, 133,586 provider-reported tokens, hard call cap 120.

Only aggregate outputs are stored here. Full contracts, proposals, judge transcripts and traces remain private under `artifacts/llm/` (Git-ignored), consistent with the project rule that live traces are not published by default.

This is a small synthetic invoice pilot, not a representative robustness estimate, not AgentDojo and not a published benchmark reproduction. One repetition per case means every rate has a wide Wilson interval; a single missed attack is a counterexample, not an established ranking.
