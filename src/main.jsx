import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bot, CheckCircle2, ChevronDown, ClipboardList, Loader2, PackageSearch, RefreshCcw, Send, ShieldCheck, Sparkles, Store, User } from "lucide-react";
import "./styles.css";

const starterMessages = [
  "Is the AirDock compatible with iPhone 15 and what is it made from?",
  "Track order KS-1002 for mira@example.com",
  "I want to return KS-1004",
  "Do you ship internationally?"
];

function App() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi, I am the Kasparro Home support agent. Ask about products, shipping, tracking, warranty, or returns. I will cite the store record I used.",
      meta: { mode: "welcome" },
      citations: []
    }
  ]);
  const [input, setInput] = useState("");
  const [email, setEmail] = useState("");
  const [slots, setSlots] = useState({});
  const [loading, setLoading] = useState(false);
  const [merchantConfigOpen, setMerchantConfigOpen] = useState(false);
  const [merchantConfig, setMerchantConfig] = useState({
    returnWindowDays: 30,
    finalSaleTag: "final-sale",
    escalationEmail: "support@kasparrohome.com"
  });

  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787", []);

  async function sendMessage(nextInput = input) {
    const clean = nextInput.trim();
    if (!clean || loading) return;

    const userMessage = { role: "user", content: clean };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(`${apiBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          conversation: nextMessages.slice(-8).map(({ role, content, citations, actions, reason }) => ({
            role,
            content,
            citations,
            actions,
            reason
          })),
          customer: { email: extractEmail(clean) || slots.customerEmail || email, slots },
          slots,
          merchantConfig
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.safeReply || data.error || "Request failed");
      setSlots(data.slots || slots);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.answer,
          actions: data.actions || [],
          citations: data.citations || [],
          meta: data.meta,
          needsHuman: data.needsHuman,
          reason: data.reason,
          confidence: data.confidence,
          slots: data.slots
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `The support API did not answer cleanly: ${error.message}. Try again or check that the backend is running.`,
          actions: [],
          citations: [],
          meta: { mode: "client_error" },
          needsHuman: false
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="appShell">
      <aside className="sidePanel">
        <div className="brandBlock">
          <div className="mark"><Sparkles size={20} /></div>
          <div>
            <h1>Kasparro Home</h1>
            <p>Shopify-native support agent</p>
          </div>
        </div>

        <section className="panelSection">
          <h2>Agent Boundaries</h2>
          <div className="boundary"><CheckCircle2 size={17} /> Answers from product, policy, and order JSON</div>
          <div className="boundary"><ShieldCheck size={17} /> Uses deterministic checks for returns and tracking</div>
          <div className="boundary"><RefreshCcw size={17} /> Falls back safely on API failure</div>
        </section>

        <section className="panelSection">
          <h2>Shopper Email</h2>
          <input
            className="emailInput"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="mira@example.com"
            aria-label="Shopper email for order verification"
          />
        </section>

        <section className="panelSection">
          <h2>Try Cases</h2>
          <div className="starterList">
            {starterMessages.map((message) => (
              <button key={message} onClick={() => sendMessage(message)} disabled={loading}>
                {message}
              </button>
            ))}
          </div>
        </section>

        <section className="panelSection merchantConfig">
          <button
            className="merchantToggle"
            type="button"
            onClick={() => setMerchantConfigOpen((open) => !open)}
            aria-expanded={merchantConfigOpen}
          >
            <span><Store size={16} /> Merchant Config</span>
            <ChevronDown className={merchantConfigOpen ? "chevron open" : "chevron"} size={17} />
          </button>

          {merchantConfigOpen && (
            <div className="merchantFields">
              <label>
                <span>Return window in days</span>
                <input
                  className="emailInput"
                  type="number"
                  min="0"
                  value={merchantConfig.returnWindowDays}
                  onChange={(event) => setMerchantConfig((config) => ({
                    ...config,
                    returnWindowDays: Number(event.target.value)
                  }))}
                />
              </label>
              <label>
                <span>Final sale tag</span>
                <input
                  className="emailInput"
                  value={merchantConfig.finalSaleTag}
                  onChange={(event) => setMerchantConfig((config) => ({
                    ...config,
                    finalSaleTag: event.target.value
                  }))}
                />
              </label>
              <label>
                <span>Escalation email</span>
                <input
                  className="emailInput"
                  type="email"
                  value={merchantConfig.escalationEmail}
                  onChange={(event) => setMerchantConfig((config) => ({
                    ...config,
                    escalationEmail: event.target.value
                  }))}
                />
              </label>
            </div>
          )}
        </section>
      </aside>

      <section className="chatPanel">
        <header className="chatHeader">
          <div>
            <h2>Support Conversation</h2>
            <p>Product questions, policy explanations, order tracking, and return initiation.</p>
          </div>
          <div className="statusPill"><PackageSearch size={16} /> Mock Shopify data</div>
        </header>

        <div className="messages" aria-live="polite">
          {messages.map((message, index) => (
            <MessageBubble key={`${message.role}-${index}`} message={message} />
          ))}
          {loading && (
            <div className="message assistant">
              <div className="avatar"><Loader2 className="spin" size={18} /></div>
              <div className="bubble">Looking up the store records...</div>
            </div>
          )}
        </div>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about a product, policy, order, or return..."
            aria-label="Support message"
          />
          <button type="submit" disabled={loading || !input.trim()} aria-label="Send message">
            <Send size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const [cartConfirmation, setCartConfirmation] = useState("");

  function handleAction(action) {
    if (action.type === "add_to_cart") {
      setCartConfirmation("Added to cart — proceed to checkout.");
    }
  }

  return (
    <div className={`message ${isUser ? "user" : "assistant"}`}>
      <div className="avatar">{isUser ? <User size={18} /> : <Bot size={18} />}</div>
      <div className="bubble">
        <p>{message.content}</p>
        {!isUser && (
          <div className="messageMeta">
            {message.meta?.mode && <span>{message.meta.mode}</span>}
            {message.reason && <span>{message.reason}</span>}
            {message.needsHuman && <span className="human">human review</span>}
            {message.confidence === "low" && <span className="lowConfidence">low confidence — verify with store</span>}
          </div>
        )}
        {!!message.citations?.length && (
          <div className="citations">
            {message.citations.map((citation) => (
              <span key={`${citation.type}-${citation.id}`}>
                <ClipboardList size={13} /> {citation.type}: {citation.id}
              </span>
            ))}
          </div>
        )}
        {!!message.actions?.length && (
          <div className="actions">
            {message.actions.map((action, index) => (
              <button key={`${action.type}-${index}`} type="button" onClick={() => handleAction(action)}>
                {action.label || action.type}
              </button>
            ))}
          </div>
        )}
        {cartConfirmation && <div className="cartConfirmation">{cartConfirmation}</div>}
      </div>
    </div>
  );
}

function extractEmail(text) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

createRoot(document.getElementById("root")).render(<App />);
