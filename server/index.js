import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadStoreData } from "./storeData.js";
import { SupportEngine } from "./supportEngine.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 8787;
const store = loadStoreData();
const engine = new SupportEngine(store, {
  provider: process.env.AI_PROVIDER || "deterministic",
  openAiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest"
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    store: store.store.name,
    products: store.products.length,
    orders: store.orders.length,
    provider: engine.providerName()
  });
});

app.get("/api/store", (_req, res) => {
  res.json({
    store: store.store,
    products: store.products.map((product) => ({
      id: product.id,
      title: product.title,
      price: product.price,
      tags: product.tags,
      image: product.image,
      variants: product.variants.map((variant) => ({
        sku: variant.sku,
        title: variant.title,
        inStock: variant.inventory > 0
      }))
    })),
    policies: store.policies
  });
});

app.post("/api/chat", async (req, res) => {
  const requestId = randomUUID();
  try {
    const { message, conversation = [], customer = {} } = req.body || {};
    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        requestId,
        error: "Message is required.",
        safeReply: "Please send a support question, order number, or return request."
      });
    }

    const result = await engine.respond({
      message: message.trim(),
      conversation: Array.isArray(conversation) ? conversation.slice(-8) : [],
      customer,
      requestId
    });

    res.json({ requestId, ...result });
  } catch (error) {
    console.error(`[${requestId}] chat failed`, error);
    res.status(500).json({
      requestId,
      answer:
        "I could not complete that request because the support service had a temporary problem. Please retry in a moment.",
      actions: [],
      citations: [],
      needsHuman: false,
      reason: "api_failure"
    });
  }
});

app.use(express.static(path.join(__dirname, "../dist")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "../dist/index.html"));
});

app.listen(port, () => {
  console.log(`Kasparro support agent API running on http://127.0.0.1:${port}`);
});