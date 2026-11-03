import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import {
  createAnyPayPaymentSignature,
  isAnyPayPaidStatus,
  isAnyPayPaymentUrl,
  isAnyPayPremiumAmount,
  parseAnyPayNotification,
  verifyAnyPayNotificationSignature,
} from "../lib/anypay";
import {
  buildLemonSqueezyCheckoutPayload,
  isAllowedLemonSqueezyCheckoutUrl,
  parseLemonSqueezyWebhook,
  verifyLemonSqueezySignature,
} from "../lib/lemonsqueezy";
import type { AppUser } from "../types/app-user";

const router: IRouter = Router();
const ANYPAY_CREATE_PAYMENT_URL = "https://anypay.io/api/create-payment";
const LEMON_SQUEEZY_API_BASE = "https://api.lemonsqueezy.com/v1";
const LEMON_SQUEEZY_PREMIUM_PRICE_CENTS = 999;
const PREMIUM_AMOUNT = "990.00";
const PREMIUM_CURRENCY = "RUB";
const PAYMENT_REQUEST_TIMEOUT_MS = 15_000;
const LEMON_STORE_CACHE_MS = 30 * 60 * 1000;

type AnyPayConfig = {
  apiId: string;
  projectId: string;
  secretKey: string;
};

type LemonSqueezyConfig = {
  apiKey: string;
  variantId: string;
};

type LemonSqueezyWebhookConfig = {
  webhookSecret: string;
  variantId: string;
};

type AnyPayApiResponse = {
  result?: unknown;
  message?: unknown;
  error?: unknown;
};

type LemonSqueezyJsonApiResponse = {
  data?: unknown;
};

function getAnyPayConfig(): AnyPayConfig | null {
  const apiId = process.env.ANYPAY_API_ID?.trim();
  const projectId = process.env.ANYPAY_PROJECT_ID?.trim();
  const secretKey = process.env.ANYPAY_SECRET_KEY?.trim();
  if (
    !apiId || !/^\d+$/.test(apiId) ||
    !projectId || !/^\d+$/.test(projectId) ||
    !secretKey
  ) {
    return null;
  }
  return { apiId, projectId, secretKey };
}

function getLemonResourceId(value: unknown): string | null {
  const id = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string"
      ? value.trim()
      : "";
  return /^\d{1,32}$/.test(id) &&
      Number.isSafeInteger(Number(id)) &&
      Number(id) > 0
    ? id
    : null;
}

function getLemonSqueezyConfig(): LemonSqueezyConfig | null {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY?.trim();
  const variantId = getLemonResourceId(process.env.LEMON_SQUEEZY_VARIANT_ID);
  if (!apiKey || !variantId) return null;
  return { apiKey, variantId };
}

function getLemonSqueezyWebhookConfig(): LemonSqueezyWebhookConfig | null {
  const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  const variantId = getLemonResourceId(process.env.LEMON_SQUEEZY_VARIANT_ID);
  if (!webhookSecret?.trim() || !variantId) return null;
  return { webhookSecret, variantId };
}

function getString(value: unknown, maxLength = 2048): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function requestLemonSqueezyJson(
  path: string,
  apiKey: string,
  body?: unknown,
): Promise<LemonSqueezyJsonApiResponse> {
  const response = await fetch(`${LEMON_SQUEEZY_API_BASE}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
      ...(body === undefined ? {} : { "Content-Type": "application/vnd.api+json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Lemon Squeezy returned non-JSON status ${response.status}`);
  }
  if (!response.ok || !asRecord(payload)) {
    throw new Error(`Lemon Squeezy request failed with status ${response.status}`);
  }
  return payload as LemonSqueezyJsonApiResponse;
}

let cachedLemonStore:
  | { variantId: string; storeId: string; expiresAt: number }
  | undefined;

async function resolveLemonSqueezyStoreId(
  config: LemonSqueezyConfig,
): Promise<string> {
  const variantResponse = await requestLemonSqueezyJson(
    `/variants/${encodeURIComponent(config.variantId)}`,
    config.apiKey,
  );
  const variant = asRecord(variantResponse.data);
  const variantAttributes = asRecord(variant?.attributes);
  const productId = getLemonResourceId(variantAttributes?.product_id);
  if (variant?.type !== "variants" || variant?.id !== config.variantId || !productId) {
    throw new Error("The configured Lemon Squeezy ID did not resolve to a product variant");
  }
  const variantPriceCents = Number(variantAttributes?.price);
  if (variantPriceCents !== LEMON_SQUEEZY_PREMIUM_PRICE_CENTS) {
    throw new Error(
      `The Lemon Squeezy variant must be priced at ${LEMON_SQUEEZY_PREMIUM_PRICE_CENTS} USD cents; received ${variantPriceCents}`,
    );
  }
  if (
    cachedLemonStore?.variantId === config.variantId &&
    cachedLemonStore.expiresAt > Date.now()
  ) {
    return cachedLemonStore.storeId;
  }

  const productResponse = await requestLemonSqueezyJson(
    `/products/${encodeURIComponent(productId)}`,
    config.apiKey,
  );
  const product = asRecord(productResponse.data);
  const productAttributes = asRecord(product?.attributes);
  const storeId = getLemonResourceId(productAttributes?.store_id);
  if (product?.type !== "products" || !storeId) {
    throw new Error("Lemon Squeezy did not return the variant's store ID");
  }

  const storeResponse = await requestLemonSqueezyJson(
    `/stores/${encodeURIComponent(storeId)}`,
    config.apiKey,
  );
  const store = asRecord(storeResponse.data);
  const storeAttributes = asRecord(store?.attributes);
  if (store?.type !== "stores" || storeAttributes?.currency !== "USD") {
    throw new Error("The configured Lemon Squeezy variant must belong to a USD store");
  }

  cachedLemonStore = {
    variantId: config.variantId,
    storeId,
    expiresAt: Date.now() + LEMON_STORE_CACHE_MS,
  };
  return storeId;
}

type FulfillmentResult = "paid" | "already-paid" | "not-found" | "not-pending";

type LemonSqueezyFulfillmentResult = "paid" | "already-processed" | "user-not-found";

async function grantPremiumForOrder(
  orderId: string,
): Promise<FulfillmentResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query(
      `SELECT user_id, amount, currency, status
       FROM payment_orders WHERE order_id = $1 FOR UPDATE`,
      [orderId],
    );
    const order = orderResult.rows[0] as
      | { user_id: number; amount: string | number; currency: string; status: string }
      | undefined;
    if (!order) {
      await client.query("ROLLBACK");
      return "not-found";
    }
    if (order.status === "paid") {
      await client.query("COMMIT");
      return "already-paid";
    }
    if (
      order.status !== "pending" ||
      !isAnyPayPremiumAmount(order.amount) ||
      order.currency !== PREMIUM_CURRENCY
    ) {
      await client.query("ROLLBACK");
      return "not-pending";
    }

    const userResult = await client.query(
      `UPDATE users
       SET is_premium = true, premium_until = CURRENT_TIMESTAMP + INTERVAL '30 days'
       WHERE id = $1
       RETURNING id`,
      [order.user_id],
    );
    if (userResult.rowCount !== 1) {
      throw new Error(`Payment order ${orderId} references a missing user`);
    }

    await client.query(
      `UPDATE payment_orders
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP
       WHERE order_id = $1`,
      [orderId],
    );
    await client.query("COMMIT");
    return "paid";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function grantPremiumForLemonSqueezyOrder(
  orderId: string,
  userId: number,
): Promise<LemonSqueezyFulfillmentResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      "SELECT id FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    if (!userResult.rows[0]) {
      await client.query("ROLLBACK");
      return "user-not-found";
    }

    const eventResult = await client.query(
      `INSERT INTO lemon_squeezy_webhook_events (order_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (order_id) DO NOTHING
       RETURNING order_id`,
      [orderId, userId],
    );
    if (!eventResult.rows[0]) {
      await client.query("COMMIT");
      return "already-processed";
    }

    const premiumResult = await client.query(
      `UPDATE users
       SET is_premium = true, premium_until = CURRENT_TIMESTAMP + INTERVAL '30 days'
       WHERE id = $1
       RETURNING id`,
      [userId],
    );
    if (!premiumResult.rows[0]) {
      throw new Error(`Lemon Squeezy order ${orderId} references a missing user`);
    }
    await client.query("COMMIT");
    return "paid";
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function sendWebhookOk(res: import("express").Response): void {
  res.status(200).type("text/plain").send("OK");
}

router.post("/payment/create", async (req, res): Promise<void> => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Требуется авторизация." });
    return;
  }
  const requestedProvider: unknown = req.body?.provider ?? "anypay";
  const provider = requestedProvider === "rub" ? "anypay" : requestedProvider;
  if (provider !== "anypay" && provider !== "lemonsqueezy") {
    res.status(400).json({ error: "Неизвестный способ оплаты." });
    return;
  }

  if (provider === "lemonsqueezy") {
    const lemonConfig = getLemonSqueezyConfig();
    if (!lemonConfig) {
      res.status(503).json({
        error: "Lemon Squeezy не настроен. Проверьте API key и variant ID.",
      });
      return;
    }

    const user = req.user as AppUser;
    try {
      const storeId = await resolveLemonSqueezyStoreId(lemonConfig);
      const checkoutPayload = buildLemonSqueezyCheckoutPayload({
        storeId,
        variantId: lemonConfig.variantId,
        userId: user.id,
        email: user.email,
      });
      const checkoutResponse = await requestLemonSqueezyJson(
        "/checkouts",
        lemonConfig.apiKey,
        checkoutPayload,
      );
      const checkout = asRecord(checkoutResponse.data);
      const checkoutAttributes = asRecord(checkout?.attributes);
      const checkoutUrl = checkoutAttributes?.url;
      if (
        checkout?.type !== "checkouts" ||
        !isAllowedLemonSqueezyCheckoutUrl(checkoutUrl)
      ) {
        throw new Error("Lemon Squeezy did not return a valid checkout URL");
      }
      res.json({ url: checkoutUrl, provider: "lemonsqueezy" });
    } catch (error) {
      req.log.error(
        {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Lemon Squeezy checkout creation failed",
      );
      res.status(502).json({
        error: "Не удалось создать платёжную ссылку Lemon Squeezy. Попробуйте позже.",
      });
    }
    return;
  }

  const config = getAnyPayConfig();
  if (!config) {
    res.status(503).json({
      error: "AnyPay не настроен. Проверьте API ID, project ID и secret key.",
    });
    return;
  }

  const method: unknown = req.body?.method ?? "card";
  if (method !== "card" && method !== "sbp") {
    res.status(400).json({ error: "Выберите оплату картой или через СБП." });
    return;
  }

  const user = req.user as AppUser;
  const orderId = (
    BigInt(`0x${randomBytes(8).toString("hex")}`) % 900_000_000_000_000n +
    100_000_000_000_000n
  ).toString();
  const description = "Text-to-BPMN Premium на 30 дней";
  const signature = createAnyPayPaymentSignature({
    apiId: config.apiId,
    projectId: config.projectId,
    payId: orderId,
    amount: PREMIUM_AMOUNT,
    currency: PREMIUM_CURRENCY,
    description,
    method,
  }, config.secretKey);
  let orderCreated = false;
  let definitiveProviderFailure = false;
  try {
    await pool.query(
      `INSERT INTO payment_orders (order_id, user_id, amount, currency)
       VALUES ($1, $2, $3, $4)`,
      [orderId, user.id, PREMIUM_AMOUNT, PREMIUM_CURRENCY],
    );
    orderCreated = true;

    const body = new FormData();
    const fields: Record<string, string> = {
      project_id: config.projectId,
      pay_id: orderId,
      amount: PREMIUM_AMOUNT,
      currency: PREMIUM_CURRENCY,
      desc: description,
      email: user.email,
      method,
      sign: signature,
      lang: "ru",
    };
    for (const [key, value] of Object.entries(fields)) body.set(key, value);

    const response = await fetch(
      `${ANYPAY_CREATE_PAYMENT_URL}/${encodeURIComponent(config.apiId)}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        body,
        signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
      },
    );
    definitiveProviderFailure =
      response.status >= 400 && response.status < 500;
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`AnyPay returned non-JSON status ${response.status}`);
    }
    const responseRecord = asRecord(payload);
    const result = asRecord(responseRecord?.result);
    const paymentUrl = result?.payment_url;
    const responsePayId = result?.pay_id == null ? null : String(result.pay_id);
    if (
      !response.ok ||
      responsePayId !== orderId ||
      !isAnyPayPaymentUrl(paymentUrl)
    ) {
      const errorMessage = getString(responseRecord?.message, 300) ??
        getString(responseRecord?.error, 300);
      throw new Error(
        errorMessage ?? `AnyPay could not create a payment URL (HTTP ${response.status})`,
      );
    }
    res.json({ payment_url: paymentUrl, orderId, provider: "anypay" });
  } catch (error) {
    req.log.error(
      {
        orderId,
        userId: user.id,
        method,
        error: error instanceof Error ? error.message : String(error),
      },
      "AnyPay payment invoice creation failed",
    );
    if (orderCreated && definitiveProviderFailure) {
      await pool.query(
        `UPDATE payment_orders SET status = 'failed'
         WHERE order_id = $1 AND status = 'pending'`,
        [orderId],
      ).catch((dbError) => {
        req.log.error({ orderId, error: dbError }, "Could not mark failed AnyPay payment order");
      });
    }
    res.status(502).json({ error: "Не удалось создать счёт AnyPay. Попробуйте позже." });
  }
});

router.post("/payment/webhook", async (req, res): Promise<void> => {
  const config = getAnyPayConfig();
  if (!config) {
    req.log.error("AnyPay webhook received while payment configuration is missing");
    res.status(503).type("text/plain").send("Payment integration is not configured");
    return;
  }
  const notification = parseAnyPayNotification(req.body);
  if (!notification) {
    res.status(400).type("text/plain").send("Invalid notification");
    return;
  }
  if (
    notification.projectId !== config.projectId ||
    notification.currency.toUpperCase() !== PREMIUM_CURRENCY ||
    !isAnyPayPremiumAmount(notification.amount) ||
    !verifyAnyPayNotificationSignature(notification, config.secretKey)
  ) {
    req.log.warn(
      { orderId: notification.payId },
      "Rejected invalid AnyPay payment notification",
    );
    res.status(401).type("text/plain").send("Invalid payment signature or details");
    return;
  }

  if (!isAnyPayPaidStatus(notification.status)) {
    sendWebhookOk(res);
    return;
  }

  try {
    const result = await grantPremiumForOrder(notification.payId);
    if (result === "not-found" || result === "not-pending") {
      req.log.warn(
        { orderId: notification.payId, result },
        "AnyPay payment has no pending local order",
      );
      res.status(404).type("text/plain").send("Order not found");
      return;
    }
    sendWebhookOk(res);
  } catch (error) {
    req.log.error(
      {
        orderId: notification.payId,
        error: error instanceof Error ? error.message : String(error),
      },
      "AnyPay payment webhook processing failed",
    );
    res.status(503).type("text/plain").send("Temporary payment processing error");
  }
});

router.post("/payment/webhook-lemonsqueezy", async (req, res): Promise<void> => {
  const config = getLemonSqueezyWebhookConfig();
  if (!config) {
    req.log.error("Lemon Squeezy webhook received while webhook configuration is missing");
    res.status(503).type("text/plain").send("Payment integration is not configured");
    return;
  }

  if (!Buffer.isBuffer(req.body)) {
    res.status(400).type("text/plain").send("Expected raw JSON webhook body");
    return;
  }

  const signature = req.get("X-Signature") ?? undefined;
  if (!verifyLemonSqueezySignature(req.body, signature, config.webhookSecret)) {
    req.log.warn("Rejected invalid Lemon Squeezy webhook signature");
    res.status(401).type("text/plain").send("Invalid signature");
    return;
  }

  const webhook = parseLemonSqueezyWebhook(req.body, config.variantId);
  if (webhook.kind === "invalid") {
    req.log.warn({ reason: webhook.reason }, "Rejected malformed Lemon Squeezy webhook");
    res.status(400).type("text/plain").send("Invalid webhook payload");
    return;
  }
  if (webhook.kind === "ignored") {
    req.log.info({ reason: webhook.reason }, "Acknowledged unrelated Lemon Squeezy event");
    sendWebhookOk(res);
    return;
  }

  try {
    const result = await grantPremiumForLemonSqueezyOrder(webhook.orderId, webhook.userId);
    if (result === "user-not-found") {
      req.log.warn(
        { orderId: webhook.orderId, userId: webhook.userId },
        "Lemon Squeezy order references a missing user",
      );
      res.status(404).type("text/plain").send("User not found");
      return;
    }
    sendWebhookOk(res);
  } catch (error) {
    req.log.error(
      {
        orderId: webhook.orderId,
        userId: webhook.userId,
        error: error instanceof Error ? error.message : String(error),
      },
      "Lemon Squeezy webhook processing failed",
    );
    res.status(503).type("text/plain").send("Temporary payment processing error");
  }
});

export default router;
