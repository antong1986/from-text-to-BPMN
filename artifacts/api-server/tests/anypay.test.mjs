import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createAnyPayNotificationSignature,
  createAnyPayPaymentSignature,
  getAnyPayErrorMessage,
  isAnyPayPaidStatus,
  isAnyPayPaymentUrl,
  isAnyPayPremiumAmount,
  parseAnyPayNotification,
  redactAnyPayResponseText,
  verifyAnyPayNotificationSignature,
} from "../src/lib/anypay.ts";

const paymentFields = {
  apiId: "api-123",
  projectId: "1399",
  payId: "172000000000123",
  amount: "990.00",
  currency: "RUB",
  description: "Text-to-BPMN Premium на 30 дней",
  method: "card",
};

test("creates AnyPay payment signature using API_ID and documented concatenation order", () => {
  const signature = createAnyPayPaymentSignature(paymentFields, "api-secret");
  const expected = createHash("sha256")
    .update(
      "create-paymentapi-1231399172000000000123990.00RUBText-to-BPMN Premium на 30 днейcardapi-secret",
    )
    .digest("hex");
  assert.equal(signature, expected);
});

test("validates AnyPay notifications with the documented colon-delimited signature", () => {
  const notification = {
    projectId: "1399",
    payId: "172000000000123",
    amount: "990.00",
    currency: "RUB",
    status: "paid",
  };
  const sign = createAnyPayNotificationSignature(notification, "api-secret");
  assert.equal(
    sign,
    createHash("sha256").update(
      "RUB:990.00:172000000000123:1399:paid:api-secret",
    ).digest("hex"),
  );
  assert.equal(verifyAnyPayNotificationSignature({ ...notification, sign }, "api-secret"), true);
  assert.equal(
    verifyAnyPayNotificationSignature({ ...notification, amount: "990.01", sign }, "api-secret"),
    false,
  );
  assert.equal(verifyAnyPayNotificationSignature({ ...notification, sign }, "wrong-secret"), false);
  assert.equal(verifyAnyPayNotificationSignature({ ...notification, sign: "invalid" }, "api-secret"), false);
});

test("parses a signed notification and rejects invalid order IDs", () => {
  const sign = createAnyPayNotificationSignature({
    projectId: "1399",
    payId: "123456789012345",
    amount: "990.00",
    currency: "RUB",
    status: "paid",
  }, "api-secret");
  assert.deepEqual(
    parseAnyPayNotification({
      merchant_id: 1399,
      pay_id: "123456789012345",
      amount: "990.00",
      currency: "RUB",
      status: "paid",
      sign,
    }),
    {
      projectId: "1399",
      payId: "123456789012345",
      amount: "990.00",
      currency: "RUB",
      status: "paid",
      sign,
    },
  );
  assert.equal(
    parseAnyPayNotification({
      project_id: "1399",
      pay_id: "123456789012345",
      amount: "990.00",
      currency: "RUB",
      status: "paid",
      sign,
    })?.projectId,
    "1399",
  );
  assert.equal(parseAnyPayNotification({ pay_id: "1234567890123456" }), null);
});

test("accepts only the configured RUB premium price and official payment domain", () => {
  assert.equal(isAnyPayPremiumAmount("990.00"), true);
  assert.equal(isAnyPayPremiumAmount(990), true);
  assert.equal(isAnyPayPremiumAmount("990.01"), false);
  assert.equal(isAnyPayPremiumAmount("9.9e2"), false);
  assert.equal(isAnyPayPaidStatus("paid"), true);
  assert.equal(isAnyPayPaidStatus("waiting"), false);
  assert.equal(isAnyPayPaymentUrl("https://anypay.io/pay/example"), true);
  assert.equal(isAnyPayPaymentUrl("https://sub.anypay.io/pay/example"), true);
  assert.equal(isAnyPayPaymentUrl("https://anypay.io.attacker.example/pay"), false);
  assert.equal(isAnyPayPaymentUrl("http://anypay.io/pay/example"), false);
});

test("extracts useful AnyPay API errors without exposing credential fields", () => {
  assert.equal(
    getAnyPayErrorMessage(
      { error: { message: "Invalid signature" } },
      '{"error":{"message":"Invalid signature"}}',
      400,
    ),
    "Invalid signature",
  );
  assert.equal(
    getAnyPayErrorMessage(null, "method is not enabled", 403),
    "method is not enabled",
  );
  assert.equal(
    redactAnyPayResponseText('{"message":"no","sign":"private","api_key":"secret"}'),
    '{"message":"no","sign":"[REDACTED]","api_key":"[REDACTED]"}',
  );
});
