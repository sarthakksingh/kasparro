# Product Document

## Product

Kasparro Home Support Agent is a Shopify-native AI customer support agent for a mock commerce store that sells compact smart-home and desk products. It handles four support surfaces from one chat experience:

- Product questions about specs, compatibility, materials, care, price, variants, and stock.
- Policy explanations for shipping, returns, warranty, and privacy.
- Order tracking from synthetic Shopify-style order records.
- Return initiation when deterministic eligibility checks pass.

The product is intentionally not a generic FAQ bot. It retrieves store records, applies commerce rules, and only then lets an LLM phrase the response when a generative answer is helpful.

## Primary User

The main user is a shopper who wants a fast answer without waiting for a human agent. The secondary user is the merchant evaluating whether the agent behaves safely: it should protect order privacy, avoid invented product claims, and escalate only when a real exception path is required.

## Core Experience

The shopper enters a support request. The backend classifies intent, retrieves relevant products, policies, or orders from `data/shopify-store.json`, and decides whether deterministic logic must own the answer.

Examples:

- "Is the AirDock compatible with iPhone 15?" retrieves the AirDock product record and answers from compatibility/material fields.
- "Track KS-1002" uses order lookup and returns carrier, tracking number, delivery status, and a limited destination if the email matches.
- "I want to return KS-1004" checks delivery date and product return eligibility, then blocks the return because the Archive Sample Bundle is final sale.
- "Do you ship internationally?" answers directly from the shipping policy.

## Success Criteria

- Answers cite the source record used: product, policy, or order.
- Order and return flows do not depend on the LLM to calculate eligibility.
- Missing order numbers, unknown products, expired windows, final sale items, and API failures produce useful responses.
- Human escalation is narrow: expired return exceptions, pre-delivery shipment changes, unavailable data after clarification, and privacy-sensitive changes.

## Merchant Configuration

A store owner would configure the agent by connecting Shopify store JSON for a mock deployment or Shopify Admin API credentials for a real deployment. They would define which products are final-sale, set the return window in days, and optionally customize the escalation email used when a human review is genuinely required.

## Scope

Included:

- Mock Shopify data.
- React support console.
- Express API.
- Optional OpenAI or Claude response generation.
- Deterministic fallback for demos without API keys.
- Unit tests for core support rules.

Not included:

- Real Shopify Admin API OAuth.
- Real return label creation.
- Persistent chat history.
- Real payment, address editing, or fraud workflows.

Those exclusions keep the submission focused on the hard part of the challenge: the boundary between AI conversation and deterministic commerce operations.
