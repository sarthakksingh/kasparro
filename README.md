# Kasparro Agentic Commerce Hackathon Submission

Track 4: AI Customer Support Agent for Commerce

This is a Shopify-native mock support agent for **Kasparro Home**, a synthetic store. It answers product questions, explains policies, tracks orders, and initiates eligible returns from store data instead of generic FAQ text.

## What Is Included

- React frontend support console.
- Express API backend.
- Optional Claude or OpenAI provider.
- Deterministic no-key fallback.
- Synthetic Shopify store data in [`data/shopify-store.json`](./data/shopify-store.json).
- Product, technical, and decision documentation in [`docs/`](./docs).
- Tests for the core support engine.

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://127.0.0.1:5173`.

The API runs on `http://127.0.0.1:8787`.

## Optional AI Provider

The app runs without an API key using deterministic mode. To use OpenAI or Claude, copy `.env.example` to `.env` and set one provider:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

or:

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

## Test Cases to Try

- `Is the AirDock compatible with iPhone 15 and what is it made from?`
- `Do you ship internationally?`
- `Track order KS-1002 for mira@example.com`
- `Where is my order?`
- `I want to return KS-1002`
- `I want to return KS-1003`
- `I want to return KS-1004`
- `Do you sell motorcycles?`

## Run Tests

```bash
npm test
```

## Key Design Point

The agent separates language from authority. The LLM can summarize retrieved product and policy facts, but deterministic code owns order lookup, privacy filtering, return eligibility, final-sale handling, and escalation decisions.

This makes the system more judgeable: an evaluator can inspect the JSON, trigger edge cases, and see why each answer was allowed.
