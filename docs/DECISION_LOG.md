# Decision Log

## 1. Use JSON as the Mock Shopify Source of Truth

Decision: Store products, policies, and orders in `data/shopify-store.json`.

Reasoning: The challenge asks for synthetic Shopify data. A single inspectable JSON file makes grounding easy for an evaluator to verify. It also avoids hiding behavior behind seeded databases or network setup.

Tradeoff: This is not a real Shopify OAuth app. The shape is Shopify-like enough to demonstrate native commerce concepts while staying runnable tonight.

## 2. Make Deterministic Tools Own Commerce Consequences

Decision: Order tracking and return initiation are deterministic, not LLM-decided.

Reasoning: These flows have clear rules and customer-impacting consequences. Return eligibility depends on delivery date, policy window, and final-sale state. Letting a model infer that would create unnecessary risk.

Tradeoff: The code is a little more explicit, but the behavior is testable and auditable.

## 3. Let AI Phrase Retrieved Product and Policy Answers

Decision: Product and policy answers can use OpenAI or Claude when configured.

Reasoning: Natural language synthesis is where the model adds value. The prompt receives retrieved facts only and is told to return strict JSON with citations, actions, and escalation state.

Tradeoff: The model can still fail or return malformed output, so the backend catches parse/provider failures and falls back to deterministic composition.

## 4. Include a No-Key Deterministic Mode

Decision: The default provider is `deterministic`.

Reasoning: Hackathon evaluation should not fail because an API key is unavailable. The app still demonstrates the AI boundary, retrieval path, and operational behavior. Adding a key upgrades phrasing without changing the underlying support rules.

Tradeoff: The no-key mode is less conversational than a live model, but it is safer and more reproducible.

## 5. Escalate Narrowly

Decision: The agent escalates only when a human genuinely has discretion or required authority.

Escalation cases:

- Expired return-window exception.
- Pre-delivery cancellation or reroute after fulfillment.
- Privacy-sensitive account changes.
- Missing store data after asking for a clarifying detail.

Reasoning: Customer support agents often over-escalate. For this track, the stronger product is one that completes support work while staying inside policy.

## 6. Privacy Filter for Orders

Decision: Matching order number alone returns status and tracking, but full destination details require matching customer email.

Reasoning: Tracking status is useful, but revealing city/state or other order details should require a second piece of verification.

Tradeoff: The demo needs an email field, but the behavior is closer to a real support integration.
