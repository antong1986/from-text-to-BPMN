import { createHash, timingSafeEqual } from "node:crypto";

export type AnyPayCreatePaymentFields = {
  apiId: string;
  projectId: string;
  payId: string;
  amount: string;
  currency: string;
  description: string;
  method: string;
};

export type AnyPayNotification = {
  projectId: string;
  payId: string;
  amount: string;
  currency: string;
  status: string;
  sign: string;
};

export function createAnyPayPaymentSignature(
  fields: AnyPayCreatePaymentFields,
  secretKey: string,
): string {
  return createHash("sha256")
    .update([
      "create-payment",
      fields.apiId,
      fields.projectId,
      fields.payId,
      fields.amount,
      fields.currency,
      fields.description,
      fields.method,
      secretKey,
    ].join(""))
    .digest("hex");
}

export function createAnyPayNotificationSignature(
  notification: Omit<AnyPayNotification, "sign">,
  secretKey: string,
): string {
  return createHash("sha256")
    .update([
      notification.currency,
      notification.amount,
      notification.payId,
      notification.projectId,
      notification.status,
      secretKey,
    ].join(":"))
    .digest("hex");
}

export function verifyAnyPayNotificationSignature(
  notification: AnyPayNotification,
  secretKey: string,
): boolean {
  if (!/^[a-f\d]{64}$/i.test(notification.sign)) return false;
  const expected = Buffer.from(
    createAnyPayNotificationSignature(notification, secretKey),
    "hex",
  );
  const actual = Buffer.from(notification.sign, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isAnyPayPremiumAmount(value: unknown): boolean {
  const amount = typeof value === "number" ? String(value) : value;
  if (typeof amount !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    return false;
  }
  return Number(amount) === 990;
}

export function isAnyPayPaymentUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "anypay.io" || url.hostname.endsWith(".anypay.io"));
  } catch {
    return false;
  }
}

function readNotificationField(value: unknown, maxLength: number): string | null {
  const field = typeof value === "string"
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
  return field.length > 0 && field.length <= maxLength ? field : null;
}

export function parseAnyPayNotification(body: unknown): AnyPayNotification | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  const projectId = readNotificationField(data.merchant_id, 32) ??
    readNotificationField(data.project_id, 32);
  const payId = readNotificationField(data.pay_id, 15);
  const amount = readNotificationField(data.amount, 32);
  const currency = readNotificationField(data.currency, 3);
  const status = readNotificationField(data.status, 32);
  const sign = readNotificationField(data.sign, 128);

  if (
    !projectId || !/^\d+$/.test(projectId) ||
    !payId || !/^\d{1,15}$/.test(payId) ||
    !amount || !currency || !status || !sign
  ) {
    return null;
  }
  return { projectId, payId, amount, currency, status, sign };
}

export function isAnyPayPaidStatus(value: unknown): value is "paid" {
  return value === "paid";
}
