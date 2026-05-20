import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export class SupportEngine {
  constructor(store, config = {}) {
    this.store = store;
    this.config = config;
    this.provider = chooseProvider(config);
  }

  providerName() {
    return this.provider.name;
  }

  async respond({ message, conversation = [], customer = {}, requestId, slots = {} }) {
    const resolvedSlots = resolveSlots(this.store, {
      message,
      conversation,
      customer,
      slots: Object.keys(slots || {}).length ? slots : customer?.slots
    });
    const resolvedMessage = resolveMessageWithSlots(this.store, message, resolvedSlots);
    const intent = classifyIntent(resolvedMessage);
    const context = buildContext(this.store, resolvedMessage, intent, customer);
    const deterministic = resolveDeterministic(this.store, resolvedMessage, intent, customer, context);

    if (deterministic.locked) {
      const responseSlots = updateSlotsFromResponse(this.store, resolvedSlots, deterministic.response, context, customer, intent);
      return {
        ...deterministic.response,
        slots: responseSlots,
        meta: { intent, mode: "deterministic", requestId }
      };
    }

    try {
      const aiAnswer = await this.provider.complete({
        message: resolvedMessage,
        conversation,
        context,
        deterministic,
        storeName: this.store.store.name
      });
      const enrichedAnswer = enrichProductResponse(aiAnswer, context, intent);
      const confidence = confidenceFor(context, intent, enrichedAnswer.reason);
      const responseSlots = updateSlotsFromResponse(this.store, resolvedSlots, enrichedAnswer, context, customer, intent);
      return {
        ...enrichedAnswer,
        ...(confidence ? { confidence } : {}),
        slots: responseSlots,
        meta: { intent, mode: this.provider.name, requestId, retrieved: context.map((item) => item.id) }
      };
    } catch (error) {
      console.error(`[${requestId}] provider failed, using fallback`, error);
      const fallbackAnswer = composeFallbackAnswer(resolvedMessage, intent, context, deterministic);
      const responseSlots = updateSlotsFromResponse(this.store, resolvedSlots, fallbackAnswer, context, customer, intent);
      return {
        ...fallbackAnswer,
        slots: responseSlots,
        meta: { intent, mode: "fallback_after_provider_error", requestId }
      };
    }
  }
}

function chooseProvider(config) {
  const provider = String(config.provider || "deterministic").toLowerCase();
  if (provider === "openai" && config.openAiKey) {
    const client = new OpenAI({ apiKey: config.openAiKey });
    return {
      name: "openai",
      complete: (payload) => completeWithOpenAI(client, config.openAiModel, payload)
    };
  }
  if ((provider === "anthropic" || provider === "claude") && config.anthropicKey) {
    const client = new Anthropic({ apiKey: config.anthropicKey });
    return {
      name: "anthropic",
      complete: (payload) => completeWithAnthropic(client, config.anthropicModel, payload)
    };
  }
  return {
    name: "deterministic",
    complete: async (payload) => composeFallbackAnswer(
      payload.message,
      classifyIntent(payload.message),
      payload.context,
      payload.deterministic
    )
  };
}

function resolveSlots(store, { message, conversation = [], customer = {}, slots = {} }) {
  const resolved = cleanSlots(slots);
  const currentOrderNumber = extractOrderId(message);
  const currentEmail = extractEmail(message) || customer?.email;

  if (currentOrderNumber) {
    resolved.orderNumber = normalizeOrderId(currentOrderNumber);
  }

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const turn = conversation[index] || {};
    const orderNumber = extractOrderId(turn.content || "");
    if (!resolved.orderNumber && orderNumber) {
      resolved.orderNumber = normalizeOrderId(orderNumber);
    }

    const productHandle = productHandleFromTurn(store, turn);
    if (!resolved.productHandle && productHandle) {
      resolved.productHandle = productHandle;
    }

    if (!resolved.customerEmail && turn.reason === "order_found_verified") {
      resolved.customerEmail = findNearestPriorEmail(conversation, index) || currentEmail || "";
    }
  }

  if (currentEmail && resolved.orderNumber) {
    const order = store.orders.find((candidate) => candidate.name === resolved.orderNumber);
    if (order?.customer.email.toLowerCase() === String(currentEmail).toLowerCase()) {
      resolved.customerEmail = order.customer.email;
    }
  }

  return cleanSlots(resolved);
}

function resolveMessageWithSlots(store, message, slots) {
  const text = String(message);
  const product = slots.productHandle
    ? store.products.find((candidate) => candidate.handle === slots.productHandle)
    : null;

  if (isAmbiguousReturnQuery(text) && slots.orderNumber && !extractOrderId(text)) {
    return `${text} for order ${slots.orderNumber}`;
  }

  if (isAmbiguousOrderQuery(text) && slots.orderNumber && !extractOrderId(text)) {
    return `${text} for order ${slots.orderNumber}`;
  }

  if (isAmbiguousProductQuery(text) && product) {
    return `${text} about product ${product.title} ${product.handle} price material stock compatibility`;
  }

  return text;
}

function updateSlotsFromResponse(store, slots, response, context, customer = {}, intent = "general") {
  const next = cleanSlots(slots);
  const productCitation = response?.citations?.find((citation) => citation.type === "product");
  const citedProduct = productCitation
    ? store.products.find((candidate) => candidate.id === productCitation.id)
    : null;
  const contextProduct = intent === "product"
    ? context.find((item) => item.type === "product")?.data
    : null;
  const product = citedProduct || contextProduct;
  const orderCitation = response?.citations?.find((citation) => citation.type === "order")?.id;

  if (product?.handle) {
    next.productHandle = product.handle;
  }

  if (orderCitation) {
    next.orderNumber = normalizeOrderId(orderCitation);
  }

  if (response?.reason === "order_found_verified" && customer?.email) {
    next.customerEmail = String(customer.email).toLowerCase();
  }

  const actionHandle = response?.actions?.find((action) => action.productHandle)?.productHandle;
  if (actionHandle) {
    next.productHandle = actionHandle;
  }

  return cleanSlots(next);
}

function cleanSlots(slots = {}) {
  return {
    ...(slots.productHandle ? { productHandle: String(slots.productHandle) } : {}),
    ...(slots.orderNumber ? { orderNumber: normalizeOrderId(slots.orderNumber) } : {}),
    ...(slots.customerEmail ? { customerEmail: String(slots.customerEmail).toLowerCase() } : {})
  };
}

function productHandleFromTurn(store, turn) {
  const addToCartAction = turn.actions?.find((action) => action.productHandle);
  if (addToCartAction?.productHandle) return addToCartAction.productHandle;

  const productCitation = turn.citations?.find((citation) => citation.type === "product");
  if (!productCitation) return "";

  const product = store.products.find((candidate) => candidate.id === productCitation.id);
  return product?.handle || "";
}

function findNearestPriorEmail(conversation, startIndex) {
  for (let index = startIndex; index >= 0; index -= 1) {
    const email = extractEmail(conversation[index]?.content || "");
    if (email) return email;
  }
  return "";
}

function isAmbiguousReturnQuery(message) {
  const text = message.toLowerCase();
  return /\b(return|refund|exchange|send back|rma)\b/.test(text) && /\b(it|this|that|them|one)\b/.test(text);
}

function isAmbiguousOrderQuery(message) {
  const text = message.toLowerCase();
  return /\b(where is it|where's it|has it arrived|arrived yet|tracking|track it|status)\b/.test(text);
}

function isAmbiguousProductQuery(message) {
  const text = message.toLowerCase().trim();
  return /\b(tell me more|what'?s the price|how much|what does it cost|is it available|in stock|what colors|what material|does it fit|compatible)\b/.test(text);
}

function classifyIntent(message) {
  const text = message.toLowerCase();
  if (/\b(return|refund|exchange|send back|rma)\b/.test(text)) return "return";
  if (/\b(order|tracking|track|shipment|where is|delivered|status)\b/.test(text)) return "order";
  if (/\b(ship|shipping|delivery|international|expedited)\b/.test(text)) return "policy_shipping";
  if (/\b(warranty|guarantee|policy|privacy|support|contact)\b/.test(text)) return "policy";
  if (/\b(size|fit|compatible|material|wash|battery|dimension|color|stock|available|compare|price|cost)\b/.test(text)) {
    return "product";
  }
  return "general";
}

function buildContext(store, message, intent, customer) {
  const terms = tokenize(message);
  const context = [];

  for (const product of store.products) {
    const haystack = [
      product.title,
      product.handle,
      product.description,
      product.category,
      product.tags.join(" "),
      product.materials.join(" "),
      product.compatibility.join(" "),
      product.variants.map((variant) => `${variant.title} ${variant.sku}`).join(" ")
    ].join(" ").toLowerCase();
    const score = scoreTerms(haystack, terms) + (intent === "product" ? 1 : 0);
    if (score > 0) {
      context.push({
        type: "product",
        id: product.id,
        score,
        data: product
      });
    }
  }

  const orderId = extractOrderId(message);
  for (const order of store.orders) {
    const customerMatch = customer?.email && order.customer.email.toLowerCase() === String(customer.email).toLowerCase();
    if (orderId && normalizeOrderId(order.name) === normalizeOrderId(orderId)) {
      context.push({ type: "order", id: order.name, score: 10, data: scrubOrder(order, customerMatch) });
    } else if (customerMatch && intent === "order") {
      context.push({ type: "order", id: order.name, score: 4, data: scrubOrder(order, true) });
    }
  }

  for (const [key, policy] of Object.entries(store.policies)) {
    const haystack = `${key} ${policy.summary} ${policy.rules.join(" ")}`.toLowerCase();
    const score = scoreTerms(haystack, terms) + (intent.startsWith("policy") || intent === "return" ? 1 : 0);
    if (score > 0) {
      context.push({ type: "policy", id: key, score, data: policy });
    }
  }

  return context.sort((a, b) => b.score - a.score).slice(0, 7);
}

function resolveDeterministic(store, message, intent, customer, context) {
  if (intent === "order") return resolveOrder(store, message, customer);
  if (intent === "return") return resolveReturn(store, message, customer);

  if (intent === "general" && context.length === 0) {
    return {
      locked: true,
      response: {
        answer:
          "I do not have enough store data to answer that confidently. I can help with products, shipping, warranty, order tracking, or returns for this mock Shopify store.",
        actions: [],
        citations: [],
        needsHuman: false,
        reason: "out_of_scope",
        confidence: "low"
      }
    };
  }

  return {
    locked: false,
    response: null,
    facts: summarizeFacts(context)
  };
}

function resolveOrder(store, message, customer) {
  const orderId = extractOrderId(message);
  if (!orderId) {
    return {
      locked: true,
      response: {
        answer: "Please provide your order number, for example KS-1002, so I can look up tracking without guessing.",
        actions: [{ type: "collect_order_number", label: "Ask for order number" }],
        citations: [],
        needsHuman: false,
        reason: "missing_order_number"
      }
    };
  }

  const order = store.orders.find((candidate) => normalizeOrderId(candidate.name) === normalizeOrderId(orderId));
  if (!order) {
    return {
      locked: true,
      response: {
        answer: `I could not find order ${orderId} in this store. Please check the order number and try again.`,
        actions: [{ type: "collect_order_number", label: "Re-enter order number" }],
        citations: [],
        needsHuman: false,
        reason: "order_not_found"
      }
    };
  }

  const customerEmail = String(customer?.email || "").toLowerCase();
  const verified = customerEmail && order.customer.email.toLowerCase() === customerEmail;
  const tracking = order.fulfillment.trackingNumber
    ? `Tracking is ${order.fulfillment.carrier} ${order.fulfillment.trackingNumber}.`
    : "No tracking number has been issued yet.";
  const addressLine = verified ? ` It is shipping to ${order.shippingAddress.city}, ${order.shippingAddress.province}.` : "";
  const actions = order.fulfillment.trackingUrl
    ? [{ type: "open_tracking", label: "Open tracking", url: order.fulfillment.trackingUrl }]
    : [{ type: "notify_when_shipped", label: "Notify when shipped" }];

  // This proactive action lives in order tracking because delivered status is an authoritative commerce signal here.
  // The agent can offer the next support step without letting the LLM infer return eligibility or mutate order state.
  if (order.fulfillment.status === "delivered") {
    actions.push({
      type: "start_return",
      label: "Start a return for this order",
      orderId: order.name
    });
  }

  return {
    locked: true,
    response: {
      answer: `${order.name} is ${order.fulfillment.status}. ${tracking} ${order.fulfillment.eta ? `Estimated delivery is ${order.fulfillment.eta}.` : ""}${addressLine}`.replace(/\s+/g, " ").trim(),
      actions,
      citations: [{ type: "order", id: order.name }],
      needsHuman: false,
      reason: verified ? "order_found_verified" : "order_found_limited_privacy"
    }
  };
}

function resolveReturn(store, message, customer) {
  const orderId = extractOrderId(message);
  const returnPolicy = store.policies.returns;
  if (!orderId) {
    return {
      locked: true,
      response: {
        answer: `I can start a return after I have the order number. Returns are available within ${returnPolicy.windowDays} days for eligible items.`,
        actions: [{ type: "collect_order_number", label: "Ask for order number" }],
        citations: [{ type: "policy", id: "returns" }],
        needsHuman: false,
        reason: "missing_order_number"
      }
    };
  }

  const order = store.orders.find((candidate) => normalizeOrderId(candidate.name) === normalizeOrderId(orderId));
  if (!order) {
    return {
      locked: true,
      response: {
        answer: `I could not find order ${orderId}, so I cannot initiate a return yet. Please verify the number from your confirmation email.`,
        actions: [{ type: "collect_order_number", label: "Re-enter order number" }],
        citations: [{ type: "policy", id: "returns" }],
        needsHuman: false,
        reason: "order_not_found"
      }
    };
  }

  const daysSinceDelivery = order.deliveredAt ? daysBetween(order.deliveredAt, store.store.currentDate) : null;
  if (!order.deliveredAt) {
    return {
      locked: true,
      response: {
        answer: `${order.name} has not been delivered yet, so the return window has not started. If you need to cancel or redirect the shipment, that may require human review.`,
        actions: [{ type: "review_shipment_change", label: "Review shipment change" }],
        citations: [{ type: "order", id: order.name }, { type: "policy", id: "returns" }],
        needsHuman: true,
        reason: "pre_delivery_return"
      }
    };
  }

  const finalSaleItems = order.items.filter((item) => {
    const product = store.products.find((candidate) => candidate.id === item.productId);
    return product?.returnEligibility === "final_sale";
  });

  if (daysSinceDelivery > returnPolicy.windowDays) {
    return {
      locked: true,
      response: {
        answer: `${order.name} was delivered ${daysSinceDelivery} days ago, outside the ${returnPolicy.windowDays}-day return window. A human can review warranty or exception options if the item is defective.`,
        actions: [{ type: "human_review", label: "Request exception review" }],
        citations: [{ type: "order", id: order.name }, { type: "policy", id: "returns" }],
        needsHuman: true,
        reason: "return_window_expired"
      }
    };
  }

  if (finalSaleItems.length === order.items.length) {
    return {
      locked: true,
      response: {
        answer: `${order.name} only contains final-sale items, which are not returnable under the return policy.`,
        actions: [{ type: "show_policy", label: "Show return policy" }],
        citations: [{ type: "order", id: order.name }, { type: "policy", id: "returns" }],
        needsHuman: false,
        reason: "final_sale"
      }
    };
  }

  const eligibleItems = order.items.filter((item) => !finalSaleItems.includes(item));
  return {
    locked: true,
    response: {
      answer: `I can start a return for ${eligibleItems.map((item) => `${item.quantity} x ${item.title}`).join(", ")} from ${order.name}. The refund returns to the original payment method after inspection.`,
      actions: [{
        type: "initiate_return",
        label: "Create return authorization",
        payload: {
          order: order.name,
          eligibleLineItemIds: eligibleItems.map((item) => item.lineItemId)
        }
      }],
      citations: [{ type: "order", id: order.name }, { type: "policy", id: "returns" }],
      needsHuman: false,
      reason: "return_eligible"
    }
  };
}

async function completeWithOpenAI(client, model, payload) {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt(payload.storeName) },
      { role: "user", content: JSON.stringify(toPromptPayload(payload)) }
    ]
  });
  return parseAiJson(completion.choices[0]?.message?.content);
}

async function completeWithAnthropic(client, model, payload) {
  const response = await client.messages.create({
    model,
    max_tokens: 700,
    temperature: 0.2,
    system: systemPrompt(payload.storeName),
    messages: [{ role: "user", content: JSON.stringify(toPromptPayload(payload)) }]
  });
  return parseAiJson(response.content?.[0]?.text);
}

function systemPrompt(storeName) {
  return [
    `You are the Shopify-native support agent for ${storeName}.`,
    "Answer only from the provided retrieved store data and deterministic tool facts.",
    "If the data does not contain an answer, say what is missing. Do not invent materials, measurements, discounts, policies, or tracking.",
    "Return strict JSON with keys: answer string, actions array, citations array, needsHuman boolean, reason string.",
    "Escalate only for expired return exceptions, shipment reroutes/cancellations after fulfillment, suspected fraud, or data not available after asking a clarifying question."
  ].join(" ");
}

function toPromptPayload(payload) {
  return {
    shopperMessage: payload.message,
    recentConversation: payload.conversation,
    deterministicFacts: payload.deterministic.facts,
    retrievedContext: summarizeFacts(payload.context)
  };
}

function parseAiJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    return {
      answer: String(parsed.answer || "I could not form an answer from the available store data."),
      actions: Array.isArray(parsed.actions) ? parsed.actions : [],
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      needsHuman: Boolean(parsed.needsHuman),
      reason: String(parsed.reason || "ai_response")
    };
  } catch {
    return {
      answer: "I could not safely parse the AI response, so I am stopping instead of guessing.",
      actions: [],
      citations: [],
      needsHuman: false,
      reason: "ai_parse_failure"
    };
  }
}

function composeFallbackAnswer(message, intent, context, deterministic) {
  if (deterministic?.response) return deterministic.response;
  if (!context.length) {
    return {
      answer: "I do not have store data for that question. I can answer product, shipping, order, warranty, and return questions for Kasparro Home.",
      actions: [],
      citations: [],
      needsHuman: false,
      reason: "no_retrieved_context",
      confidence: "low"
    };
  }

  const product = context.find((item) => item.type === "product")?.data;
  const policy = context.find((item) => item.type === "policy")?.data;

  if (intent === "product" && product) {
    const stock = product.variants
      .map((variant) => `${variant.title}: ${variant.inventory > 0 ? `${variant.inventory} in stock` : "out of stock"}`)
      .join("; ");
    const shippingLine = productIsInStock(product) && product.shippingEstimate
      ? ` ${product.shippingEstimate}`
      : "";
    return {
      answer: `${product.title} is ${MONEY.format(product.price)}. ${product.description} Materials: ${product.materials.join(", ")}. Compatibility: ${product.compatibility.join(", ")}. Stock: ${stock}.${shippingLine}`,
      actions: [
        { type: "view_product", label: "View product", productId: product.id },
        { type: "add_to_cart", label: `Add ${product.title} to cart`, productHandle: product.handle }
      ],
      citations: [{ type: "product", id: product.id }],
      needsHuman: false,
      reason: "product_answer_from_retrieval"
    };
  }

  if (policy) {
    return {
      answer: `${policy.summary} ${policy.rules.join(" ")}`,
      actions: [{ type: "show_policy", label: "Show policy" }],
      citations: [{ type: "policy", id: context.find((item) => item.type === "policy")?.id }],
      needsHuman: false,
      reason: "policy_answer_from_retrieval"
    };
  }

  return {
    answer: summarizeFacts(context).map((item) => item.summary).join(" "),
    actions: [],
    citations: context.map((item) => ({ type: item.type, id: item.id })),
    needsHuman: false,
    reason: "retrieval_summary",
    ...(confidenceFor(context, intent, "retrieval_summary") ? { confidence: "low" } : {})
  };
}

function enrichProductResponse(response, context, intent) {
  if (intent !== "product" || response?.needsHuman) return response;
  const product = context.find((item) => item.type === "product")?.data;
  if (!product) return response;

  const actions = Array.isArray(response.actions) ? [...response.actions] : [];
  if (!actions.some((action) => action.type === "add_to_cart" && action.productHandle === product.handle)) {
    actions.push({
      type: "add_to_cart",
      label: `Add ${product.title} to cart`,
      productHandle: product.handle
    });
  }

  let answer = response.answer;
  if (
    productIsInStock(product) &&
    product.shippingEstimate &&
    !String(answer).toLowerCase().includes(product.shippingEstimate.toLowerCase())
  ) {
    answer = `${answer} ${product.shippingEstimate}`;
  }

  return { ...response, answer, actions };
}

function confidenceFor(context, intent, reason) {
  if (reason === "out_of_scope" || reason === "no_retrieved_context") return "low";
  if (!context.length) return "low";
  if (intent === "general" && context[0]?.score <= 1) return "low";
  return null;
}

function productIsInStock(product) {
  return product.variants.some((variant) => variant.inventory > 0);
}

function summarizeFacts(context) {
  return context.map((item) => {
    if (item.type === "product") {
      const p = item.data;
      return {
        type: "product",
        id: p.id,
        summary: `${p.title}: ${p.description} Price ${MONEY.format(p.price)}. Materials ${p.materials.join(", ")}. Compatibility ${p.compatibility.join(", ")}. Return eligibility ${p.returnEligibility}. Shipping estimate ${p.shippingEstimate || "not specified"}. Variants ${p.variants.map((v) => `${v.title} sku ${v.sku} inventory ${v.inventory}`).join("; ")}.`
      };
    }
    if (item.type === "order") {
      const o = item.data;
      return {
        type: "order",
        id: o.name,
        summary: `${o.name}: financial ${o.financialStatus}, fulfillment ${o.fulfillment.status}, eta ${o.fulfillment.eta || "none"}, delivered ${o.deliveredAt || "not delivered"}. Items ${o.items.map((line) => `${line.quantity} x ${line.title}`).join(", ")}.`
      };
    }
    return {
      type: "policy",
      id: item.id,
      summary: `${item.data.summary} ${item.data.rules.join(" ")}`
    };
  });
}

function scrubOrder(order, verified) {
  if (verified) return order;
  return {
    name: order.name,
    financialStatus: order.financialStatus,
    fulfillment: order.fulfillment,
    deliveredAt: order.deliveredAt,
    items: order.items
  };
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9#\-\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2);
}

function scoreTerms(haystack, terms) {
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function extractOrderId(message) {
  return String(message).match(/\b(?:KS[-\s]?)?\d{4}\b/i)?.[0] || null;
}

function extractEmail(message) {
  return String(message).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
}

function normalizeOrderId(orderId) {
  const digits = String(orderId).match(/\d{4}/)?.[0];
  return digits ? `KS-${digits}` : String(orderId).toUpperCase();
}

function daysBetween(start, end) {
  const ms = Date.parse(end) - Date.parse(start);
  return Math.floor(ms / 86400000);
}
