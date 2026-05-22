# Kasparro Home — AI Support Agent

**Kasparro Agentic Commerce Hackathon · Track 4: AI Customer Support Agent for Commerce**

> A Shopify-native support agent that answers from store data, not guesswork. Product questions, policy explanations, order tracking, and return initiation — all grounded in deterministic commerce logic.

---

## 🔴 Live Demo

### **[https://kasparro-support-agent.onrender.com](https://kasparro-support-agent.onrender.com)**

> First load may take 20–30 seconds — Render free tier spins down inactive services.

---

<img width="1919" height="943" alt="Kasparro Home Support Agent" src="https://github.com/user-attachments/assets/6443a660-9c65-4a37-805b-2a55ec3c422b" />

---

## What This Is

Most support bots are FAQ wrappers. This one actually understands the store it runs on.

The agent retrieves product specs, policies, and order records from a synthetic Shopify store JSON, applies deterministic commerce rules, and only then generates a response. The LLM handles phrasing. Deterministic code handles authority — return eligibility, order privacy, final-sale enforcement, and escalation decisions are never delegated to the model.

---

## Key Design Decision

**The agent separates language from authority.**

| Owned by deterministic code | Owned by the LLM |
|-----------------------------|-----------------|
| Order lookup & privacy filtering | Summarizing product facts |
| Return window calculation | Explaining policy text naturally |
| Final-sale enforcement | Combining retrieved facts into an answer |
| Escalation decisions | — |
| API failure fallback | — |

This makes the system auditable: an evaluator can inspect the JSON, trigger edge cases, and verify exactly why each answer was produced.

---

## Quick Start

```bash
npm install
npm run dev
```

Frontend: `http://127.0.0.1:5173`  
API: `http://127.0.0.1:8787`

---

## Optional AI Provider

Runs fully without an API key in deterministic mode. To enable natural language responses, copy `.env.example` to `.env`:

**OpenAI**
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
```

**Claude**
```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL=claude-3-5-haiku-latest
```

---

## Test Cases

| Query | What it tests |
|-------|--------------|
| `Is the AirDock compatible with iPhone 15 and what is it made from?` | Product retrieval + spec grounding |
| `Do you ship internationally?` | Policy lookup |
| `Track order KS-1002 for mira@example.com` | Order tracking + privacy filter |
| `Where is my order?` | Missing order number handling |
| `I want to return KS-1002` | Eligible return flow + proactive suggestion |
| `I want to return KS-1003` | Expired return window → escalation |
| `I want to return KS-1004` | Final-sale block |
| `Do you sell motorcycles?` | Out-of-scope + low confidence signal |

---

## Run Tests

```bash
npm test
```

Covers: product grounding, order tracking, missing order number, expired return escalation, out-of-scope handling.

---

## Project Structure

```
kasparro/
├── data/
│   └── shopify-store.json     # Synthetic Shopify store data
├── docs/
│   ├── PRODUCT.md             # Product document
│   ├── TECHNICAL.md           # Technical document
│   └── DECISION_LOG.md        # Decision log
├── server/
│   ├── index.js               # Express API
│   ├── supportEngine.js       # Core support logic
│   ├── storeData.js           # Store data loader
│   └── tests/
│       └── supportEngine.test.js
└── src/
    ├── main.jsx               # React frontend
    └── styles.css
```

---

## Documentation

Full thinking documented in [`docs/`](./docs):

- **[Product Document](./docs/PRODUCT.md)** — problem framing, user definition, scope decisions, tradeoffs
- **[Technical Document](./docs/TECHNICAL.md)** — architecture, AI boundary, failure handling, known limitations
- **[Decision Log](./docs/DECISION_LOG.md)** — every key decision made during the build, with reasoning

---

## Contribution Note

Solo submission. Time split approximately 40% product thinking and documentation, 60% engineering and implementation.
