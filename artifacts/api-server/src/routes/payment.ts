import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import {
  confirmsAaioPaidOrder,
  createAaioSignature,
  isAaioPaidStatus,
  isAaioPremiumAmount,
  verifyAaioSignature,
} from "../lib/aaio";
import {
  buildLemonSqueezyCheckoutPayload,
  isAllowedLemonSqueezyCheckoutUrl,
  parseLemonSqueezyWebhook,
  verifyLemonSqueezySignature,
} from "../lib/lemonsqueezy";
import type { AppUser } from "../types/app-user";

const router: IRouter = Router();
const AAIO_CREATE_ORDER_URL = "https://aaio.so/merchant/get_pay_url";
const AAIO_ORDER_INFO_URL = "https://aaio.so/api/info-pay";
const LEMON_SQUEEZY_API_BASE = "https://api.lemonsqueezy.com/v1";
const PREMIUM_AMOUNT = "990.00";
const PREMIUM_CURRENCY = "RUB";
const PAYMENT_REQUEST_TIMEOUT_MS = 15_000;
const LEMON_STORE_CACHE_MS = 30 * 60 * 1000;

type AaioConfig = {
  merchantId: string;
  secret1: string;
  secret2: string;
  apiKey: string;
};

type LemonSqueezyConfig = {
  apiKey: string;
  variantId: string;
};

type LemonSqueezyWebhookConfig = {
  webhookSecret: string;
  variantId: string;
};

type AaioApiResponse = {
  type?: unknown;
  url?: unknown;
  id?: unknown;
  merchant_id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  message?: unknown;
};

type LemonSqueezyJsonApiResponse = {
  data?: unknown;
};

type PaymentNotification = {
  merchant_id: string;
  amount: string;
  currency: string;
  order_id: string;
  sign: string;
  status: string;
  invoice_id: string | null;
};

function getAaioConfig(): AaioConfig | null {
  const merchantId = process.env.AAIO_MERCHANT_ID?.trim();
  const secret1 = process.env.AAIO_SECRET_1;
  const secret2 = process.env.AAIO_SECRET_2;
  const apiKey = process.env.AAIO_API_KEY;
  if (!merchantId || !secret1 || !secret2 || !apiKey) return null;
  return { merchantId, secret1, secret2, apiKey };
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
  if (
    variant?.type !== "variants" ||
    variant?.id !== config.variantId ||
    !productId ||
    Number(variantAttributes?.price) !== 1500
  ) {
    throw new Error("The Lemon Squeezy variant must be published and priced at 1500 USD cents");
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

function parseNotification(body: unknown): PaymentNotification | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  const merchantId = getString(data.merchant_id, 100);
  const amount = getString(data.amount, 32);
  const currency = getString(data.currency, 3);
  const orderId = getString(data.order_id, 64);
  const signature = getString(data.sign, 128);
  const status = getString(data.status, 32);
  const invoiceId = getString(data.invoice_id, 64);
  if (!merchantId || !amount || !currency || !orderId || !signature || !status) {
    return null;
  }
  return {
    merchant_id: merchantId,
    amount,
    currency,
    order_id: orderId,
    sign: signature,
    status,
    invoice_id: invoiceId,
  };
}

function isAllowedAaioPaymentUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["aaio.so", "aaio.io"].some((domain) =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      );
  } catch {
    return false;
  }
}

async function requestAaioOrderInfo(
  config: AaioConfig,
  orderId: string,
): Promise<AaioApiResponse> {
  const response = await fetch(AAIO_ORDER_INFO_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Api-Key": config.apiKey,
    },
    body: new URLSearchParams({
      merchant_id: config.merchantId,
      order_id: orderId,
    }),
    signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`AAIO info-pay returned non-JSON status ${response.status}`);
  }
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error(`AAIO info-pay failed with status ${response.status}`);
  }
  return payload as AaioApiResponse;
}

type FulfillmentResult = "paid" | "already-paid" | "not-found" | "not-pending";

type LemonSqueezyFulfillmentResult = "paid" | "already-processed" | "user-not-found";

async function grantPremiumForOrder(
  orderId: string,
  invoiceId: string | null,
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
      !isAaioPremiumAmount(order.amount) ||
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
       SET status = 'paid', aaio_invoice_id = $2, paid_at = CURRENT_TIMESTAMP
       WHERE order_id = $1`,
      [orderId, invoiceId],
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
  const provider = req.body?.provider ?? "aaio";
  if (provider !== "aaio" && provider !== "lemonsqueezy") {
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

  const config = getAaioConfig();
  if (!config) {
    res.status(503).json({
      error: "Приём платежей не настроен. Добавьте AAIO-переменные окружения.",
    });
    return;
  }

  const user = req.user as AppUser;
  const orderId = `BPMN-${Date.now()}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const signature = createAaioSignature({
    merchantId: config.merchantId,
    amount: PREMIUM_AMOUNT,
    currency: PREMIUM_CURRENCY,
    orderId,
  }, config.secret1);
  let orderCreated = false;
  try {
    await pool.query(
      `INSERT INTO payment_orders (order_id, user_id, amount, currency)
       VALUES ($1, $2, $3, $4)`,
      [orderId, user.id, PREMIUM_AMOUNT, PREMIUM_CURRENCY],
    );
    orderCreated = true;

    const body = new URLSearchParams({
      merchant_id: config.merchantId,
      amount: PREMIUM_AMOUNT,
      currency: PREMIUM_CURRENCY,
      order_id: orderId,
      sign: signature,
      desc: "Text-to-BPMN Premium на 30 дней",
      email: user.email,
      lang: "ru",
      us_userId: String(user.id),
    });
    const response = await fetch(AAIO_CREATE_ORDER_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(`AAIO get_pay_url returned non-JSON status ${response.status}`);
    }
    const result = payload as AaioApiResponse;
    if (!response.ok || result?.type !== "success" || !isAllowedAaioPaymentUrl(result.url)) {
      throw new Error(`AAIO could not create a payment URL (HTTP ${response.status})`);
    }
    res.json({ url: result.url, orderId });
  } catch (error) {
    req.log.error(
      { orderId, userId: user.id, error: error instanceof Error ? error.message : String(error) },
      "AAIO payment invoice creation failed",
    );
    if (orderCreated) {
      await pool.query(
        `UPDATE payment_orders SET status = 'failed'
         WHERE order_id = $1 AND status = 'pending'`,
        [orderId],
      ).catch((dbError) => {
        req.log.error({ orderId, error: dbError }, "Could not mark failed AAIO payment order");
      });
    }
    res.status(502).json({ error: "Не удалось создать счёт AAIO. Попробуйте позже." });
  }
});

router.post("/payment/webhook", async (req, res): Promise<void> => {
  const config = getAaioConfig();
  if (!config) {
    req.log.error("AAIO webhook received while payment configuration is missing");
    res.status(503).type("text/plain").send("Payment integration is not configured");
    return;
  }
  const notification = parseNotification(req.body);
  if (!notification) {
    res.status(400).type("text/plain").send("Invalid notification");
    return;
  }
  if (
    notification.merchant_id !== config.merchantId ||
    notification.currency !== PREMIUM_CURRENCY ||
    !isAaioPremiumAmount(notification.amount) ||
    !verifyAaioSignature({
      merchantId: notification.merchant_id,
      amount: notification.amount,
      currency: notification.currency,
      orderId: notification.order_id,
    }, notification.sign, config.secret2)
  ) {
    req.log.warn(
      { orderId: notification.order_id },
      "Rejected invalid AAIO payment notification",
    );
    res.status(403).type("text/plain").send("Invalid payment signature or details");
    return;
  }

  if (!isAaioPaidStatus(notification.status)) {
    sendWebhookOk(res);
    return;
  }

  try {
    const confirmation = await requestAaioOrderInfo(config, notification.order_id);
    if (!confirmsAaioPaidOrder(confirmation, config.merchantId, notification.order_id)) {
      req.log.warn(
        { orderId: notification.order_id, providerStatus: confirmation.status },
        "AAIO info-pay did not confirm the paid order",
      );
      res.status(403).type("text/plain").send("Payment not confirmed");
      return;
    }
    const result = await grantPremiumForOrder(
      notification.order_id,
      notification.invoice_id ?? getString(confirmation.id, 64),
    );
    if (result === "not-found" || result === "not-pending") {
      req.log.warn({ orderId: notification.order_id, result }, "AAIO payment has no pending local order");
      res.status(404).type("text/plain").send("Order not found");
      return;
    }
    sendWebhookOk(res);
  } catch (error) {
    req.log.error(
      { orderId: notification.order_id, error: error instanceof Error ? error.message : String(error) },
      "AAIO payment webhook processing failed",
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
