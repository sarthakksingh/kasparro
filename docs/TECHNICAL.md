# Technical Document

## Architecture

The app is a Vite React frontend plus an Express API backend.

- `src/main.jsx` renders the support console.
- `server/index.js` exposes `/api/chat`, `/api/store`, and `/api/health`.
- `server/supportEngine.js` owns intent classification, retrieval, deterministic commerce tools, optional LLM calls, and fallback behavior.
- `data/shopify-store.json` is the synthetic Shopify source of truth.

The backend is intentionally the authority. The frontend never computes return eligibility or order status; it only displays the answer, citations, and actions returned by the API.

## Request Flow

1. Shopper sends a message.
2. API validates non-empty input.
3. `classifyIntent` chooses a coarse intent: product, order, return, shipping policy, policy, or general.
4. `buildContext` retrieves products, policies, and orders by keyword and order-number matching.
5. `resolveDeterministic` takes over when the answer has operational consequences.
6. If deterministic logic does not lock the response, the configured LLM receives only retrieved context and deterministic facts.
7. If the LLM fails, the deterministic fallback composes a safe answer from retrieved fields.

## AI Boundary

The LLM is used for natural-language synthesis, not authority.

Deterministic code owns:

- Order lookup.
- Order-number validation.
- Return-window calculation.
- Final-sale checks.
- Pre-delivery return handling.
- Privacy-sensitive order detail filtering.
- Unknown and out-of-scope responses.
- API failure fallback.

The LLM may:

- Summarize product facts.
- Explain policy text in a friendlier way.
- Combine retrieved facts into a concise answer.

The LLM may not:

- Invent missing specs.
- Decide return eligibility.
- Reveal address details without email match.
- Create escalation categories outside the allowed set.

## Data Model

The JSON file uses Shopify-like identifiers and fields:

- Products have `gid://shopify/Product/...` ids, handles, variants, SKUs, inventory, materials, compatibility, specs, and `returnEligibility`.
- Policies are structured summaries plus rule arrays.
- Orders have order names such as `KS-1002`, customer email, fulfillment status, tracking data, delivery date, and line items.

The mock data also has `store.currentDate` so return-window tests remain deterministic.

## Error Handling

- Empty message: HTTP 400 with a safe prompt.
- Missing order number: ask for the order number.
- Unknown order: ask the shopper to verify the number.
- Unknown topic: say the store data does not contain the answer.
- LLM/API failure: use local fallback answer composition.
- Unverified email: return only limited order status and tracking.

## Provider Configuration

Set `AI_PROVIDER=openai` with `OPENAI_API_KEY` to use OpenAI, or `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` to use Claude. If no key is present, the engine runs in deterministic mode. This makes judging reliable even without secrets.

## Slot Memory

The frontend stores the latest `slots` object returned by the assistant and sends it with the next `/api/chat` request. The backend tracks three slots: last referenced product handle, last referenced order number, and last verified customer email after a successful verified order lookup. Before intent classification, ambiguous follow-ups such as "tell me more", "what's the price", or "can I return it" are resolved against those slots so the existing product, order, and return logic can run without changing architecture. With more time, I would add stronger intent disambiguation for compound follow-ups and multi-product comparison state so the agent can remember several referenced products at once.

## Known Limitations

- Intent classification uses keyword matching and will misclassify ambiguous or compound queries. For example, "my thing hasn't arrived" does not currently match the order-tracking intent unless the shopper also provides clearer order or tracking language.
- The LLM prompt does not currently use prior conversation turns as true context. The frontend passes the last 8 messages, but the backend does not resolve follow-up references or maintain slot state, so each turn is effectively stateless.
- With more time, I would improve this with semantic intent classification using embeddings and session-level memory for order numbers, verified email state, product references, and unresolved follow-up questions.

## Tests

`npm test` covers:
- Product answer grounded in product data.
- Order tracking.
- Missing order number handling.
- Expired return escalation.
- Out-of-scope question handling.
