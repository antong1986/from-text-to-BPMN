import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmsAaioPaidOrder,
  createAaioSignature,
  isAaioPaidStatus,
  isAaioPremiumAmount,
  verifyAaioSignature,
} from "../src/lib/aaio.ts";

const order = {
  merchantId: "merchant-123",
  amount: "990.00",
  currency: "RUB",
  orderId: "BPMN-1720000000000-1234abcd",
};

test("creates the AAIO invoice signature using documented field order", () => {
  assert.equal(
    createAaioSignature(order, "secret-1"),
    "4d53231dc7aac5cecd0fe6ac49f7cb43ed793b5c96a8adae3b32dd8dde11f3d1",
  );
});

test("verifies notification signatures and rejects modified payment data", () => {
  const signature = createAaioSignature(order, "secret-2");
  assert.equal(verifyAaioSignature(order, signature, "secret-2"), true);
  assert.equal(verifyAaioSignature({ ...order, amount: "990.01" }, signature, "secret-2"), false);
  assert.equal(verifyAaioSignature(order, signature, "wrong-secret"), false);
  assert.equal(verifyAaioSignature(order, "not-a-signature", "secret-2"), false);
});

test("accepts exactly 990 RUB and recognized AAIO paid statuses", () => {
  assert.equal(isAaioPremiumAmount("990.00"), true);
  assert.equal(isAaioPremiumAmount(990), true);
  assert.equal(isAaioPremiumAmount("990.01"), false);
  assert.equal(isAaioPremiumAmount("9.9e2"), false);
  assert.equal(isAaioPaidStatus("success"), true);
  assert.equal(isAaioPaidStatus("hold"), true);
  assert.equal(isAaioPaidStatus("in_process"), false);
});

test("requires AAIO order-info confirmation to match merchant, order, amount, currency, and status", () => {
  const confirmation = {
    type: "success",
    merchant_id: order.merchantId,
    order_id: order.orderId,
    amount: 990,
    currency: "RUB",
    status: "hold",
  };
  assert.equal(
    confirmsAaioPaidOrder(confirmation, order.merchantId, order.orderId),
    true,
  );
  assert.equal(
    confirmsAaioPaidOrder({ ...confirmation, order_id: "other-order" }, order.merchantId, order.orderId),
    false,
  );
  assert.equal(
    confirmsAaioPaidOrder({ ...confirmation, status: "in_process" }, order.merchantId, order.orderId),
    false,
  );
  assert.equal(
    confirmsAaioPaidOrder({ ...confirmation, amount: 991 }, order.merchantId, order.orderId),
    false,
  );
});
