import assert from "node:assert/strict";
import { loadStoreData } from "../storeData.js";
import { SupportEngine } from "../supportEngine.js";

const engine = new SupportEngine(loadStoreData(), { provider: "deterministic" });

async function ask(message, customer = {}) {
  return engine.respond({ message, conversation: [], customer, requestId: "test" });
}

const product = await ask("Is the AirDock compatible with iPhone and what is it made from?");
assert.match(product.answer, /iPhone/i);
assert.match(product.answer, /recycled aluminum/i);
assert.equal(product.needsHuman, false);

const tracking = await ask("Track KS-1002", { email: "mira@example.com" });
assert.match(tracking.answer, /KS-1002/);
assert.match(tracking.answer, /UPS/);
assert.equal(tracking.needsHuman, false);
assert.deepEqual(
  tracking.actions.find((action) => action.type === "start_return"),
  {
    type: "start_return",
    label: "Start a return for this order",
    orderId: "KS-1002"
  }
);

const missingOrder = await ask("Where is my order?");
assert.equal(missingOrder.reason, "missing_order_number");

const expiredReturn = await ask("I want to return KS-1003");
assert.equal(expiredReturn.needsHuman, true);
assert.equal(expiredReturn.reason, "return_window_expired");

const unknown = await ask("Do you sell motorcycles?");
assert.equal(unknown.reason, "out_of_scope");

console.log("Support engine tests passed");
