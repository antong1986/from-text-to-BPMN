import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildLemonSqueezyCheckoutPayload,
  isAllowedLemonSqueezyCheckoutUrl,
  parseLemonSqueezyWebhook,
  verifyLemonSqueezySignature,
} from "../src/lib/lemonsqueezy.ts";

const webhookSecret = "test-lemon-webhook-secret";
const variantId = "4200";

function signedBody(payload) {
  const body = Buffer.from(JSON.stringify(payload));
  const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
  return { body, signature };
}

const orderCreated = {
  meta: {
    event_name: "order_created",
    custom_data: { userId: "37" },
  },
  data: {
    type: "orders",
    id: "order-abc-12",
    attributes: {
      first_order_item: { variant_id: Number(variantId) },
    },
  },
};

test("builds a JSON:API checkout with the configured variant and user metadata", () => {
  const payload = buildLemonSqueezyCheckoutPayload({
    storeId: "23",
    variantId,
    userId: 37,
    email: "buyer@example.com",
  });

  assert.equal(payload.data.type, "checkouts");
  assert.equal(payload.data.attributes.store_id, 23);
  assert.equal(payload.data.attributes.variant_id, 4200);
  assert.deepEqual(payload.data.attributes.product_options.enabled_variants, [4200]);
  assert.equal(payload.data.attributes.checkout_data.email, "buyer@example.com");
  assert.deepEqual(payload.data.attributes.checkout_data.custom, { userId: "37" });
  assert.equal(payload.data.relationships.store.data.id, "23");
  assert.equal(payload.data.relationships.variant.data.id, "4200");
});

test("accepts only HTTPS Lemon Squeezy checkout URLs", () => {
  assert.equal(isAllowedLemonSqueezyCheckoutUrl("https://demo.lemonsqueezy.com/checkout/buy/abc"), true);
  assert.equal(isAllowedLemonSqueezyCheckoutUrl("http://demo.lemonsqueezy.com/checkout"), false);
  assert.equal(isAllowedLemonSqueezyCheckoutUrl("https://example.com/checkout"), false);
});

test("verifies HMAC-SHA256 against the exact raw webhook body", () => {
  const { body, signature } = signedBody(orderCreated);
  assert.equal(verifyLemonSqueezySignature(body, signature, webhookSecret), true);
  assert.equal(verifyLemonSqueezySignature(body, signature, "wrong-secret"), false);
  assert.equal(verifyLemonSqueezySignature(Buffer.from(`${body.toString()} `), signature, webhookSecret), false);
  assert.equal(verifyLemonSqueezySignature(body, "not-a-signature", webhookSecret), false);
});

test("extracts the user and order from a matching order_created event", () => {
  const { body } = signedBody(orderCreated);
  assert.deepEqual(parseLemonSqueezyWebhook(body, variantId), {
    kind: "order_created",
    orderId: "order-abc-12",
    userId: 37,
  });
});

test("does not grant Premium for other events or different variants", () => {
  const otherEvent = signedBody({
    ...orderCreated,
    meta: { ...orderCreated.meta, event_name: "order_refunded" },
  }).body;
  assert.deepEqual(parseLemonSqueezyWebhook(otherEvent, variantId), {
    kind: "ignored",
    reason: "Unsupported event: order_refunded",
  });

  const otherVariant = signedBody({
    ...orderCreated,
    data: {
      ...orderCreated.data,
      attributes: { first_order_item: { variant_id: 99 } },
    },
  }).body;
  assert.equal(parseLemonSqueezyWebhook(otherVariant, variantId).kind, "ignored");
});

test("rejects malformed JSON and invalid custom user IDs", () => {
  assert.equal(parseLemonSqueezyWebhook(Buffer.from("{"), variantId).kind, "invalid");
  const invalidUser = signedBody({
    ...orderCreated,
    meta: { ...orderCreated.meta, custom_data: { userId: "not-a-user" } },
  }).body;
  assert.equal(parseLemonSqueezyWebhook(invalidUser, variantId).kind, "invalid");
});
