import { createHmac, timingSafeEqual } from "node:crypto";

type JsonObject = Record<string, unknown>;

export type LemonSqueezyWebhookResult =
  | { kind: "ignored"; reason: string }
  | { kind: "invalid"; reason: string }
  | { kind: "order_created"; orderId: string; userId: number };

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function positiveResourceId(value: unknown): string | null {
  const id = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === "string"
      ? value
      : "";
  return /^\d{1,32}$/.test(id) &&
      Number.isSafeInteger(Number(id)) &&
      Number(id) > 0
    ? id
    : null;
}

export function buildLemonSqueezyCheckoutPayload(input: {
  storeId: string;
  variantId: string;
  userId: number;
  email: string;
}) {
  const storeId = positiveResourceId(input.storeId);
  const variantId = positiveResourceId(input.variantId);
  if (!storeId || !variantId || !Number.isSafeInteger(input.userId) || input.userId <= 0) {
    throw new Error("Invalid Lemon Squeezy checkout identifiers");
  }

  const storeNumericId = Number(storeId);
  const variantNumericId = Number(variantId);
  return {
    data: {
      type: "checkouts",
      attributes: {
        store_id: storeNumericId,
        variant_id: variantNumericId,
        product_options: {
          enabled_variants: [variantNumericId],
        },
        checkout_data: {
          email: input.email,
          custom: {
            userId: String(input.userId),
          },
        },
      },
      relationships: {
        store: {
          data: { type: "stores", id: storeId },
        },
        variant: {
          data: { type: "variants", id: variantId },
        },
      },
    },
  };
}

export function isAllowedLemonSqueezyCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "lemonsqueezy.com" || url.hostname.endsWith(".lemonsqueezy.com"));
  } catch {
    return false;
  }
}

export function verifyLemonSqueezySignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(expected, received);
}

export function parseLemonSqueezyWebhook(
  rawBody: Buffer,
  expectedVariantId: string,
): LemonSqueezyWebhookResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { kind: "invalid", reason: "Webhook body is not valid JSON" };
  }

  const payload = asObject(parsed);
  const meta = asObject(payload?.meta);
  const eventName = meta?.event_name;
  if (typeof eventName !== "string") {
    return { kind: "invalid", reason: "Webhook event name is missing" };
  }
  if (eventName !== "order_created") {
    return { kind: "ignored", reason: `Unsupported event: ${eventName}` };
  }

  const data = asObject(payload?.data);
  const attributes = asObject(data?.attributes);
  const firstOrderItem = asObject(attributes?.first_order_item);
  const customData = asObject(meta?.custom_data);
  const orderId = typeof data?.id === "string" || typeof data?.id === "number"
    ? String(data.id)
    : "";
  const userIdValue = customData?.userId;
  const userIdString = typeof userIdValue === "number" && Number.isSafeInteger(userIdValue)
    ? String(userIdValue)
    : typeof userIdValue === "string"
      ? userIdValue
      : "";
  const userId = /^\d{1,10}$/.test(userIdString) ? Number(userIdString) : 0;
  const variantId = positiveResourceId(firstOrderItem?.variant_id);

  if (
    data?.type !== "orders" ||
    !/^[\w-]{1,100}$/.test(orderId) ||
    !variantId
  ) {
    return { kind: "invalid", reason: "Order data is invalid" };
  }
  if (variantId !== expectedVariantId) {
    return { kind: "ignored", reason: "Order does not contain the configured Premium variant" };
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { kind: "invalid", reason: "Order custom user ID is invalid" };
  }

  return { kind: "order_created", orderId, userId };
}
