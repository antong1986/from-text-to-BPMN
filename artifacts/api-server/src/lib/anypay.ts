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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized.slice(0, 600) : null;
}

export function getAnyPayErrorMessage(
  payload: unknown,
  rawBody: string,
  status: number,
): string {
  const root = isRecord(payload) ? payload : null;
  const nestedError = isRecord(root?.error) ? root.error : null;
  const result = isRecord(root?.result) ? root.result : null;
  const errors = Array.isArray(root?.errors) ? root.errors : [];
  const firstValidationError = errors.map((entry) => {
    if (typeof entry === "string") return entry;
    if (!isRecord(entry)) return null;
    return entry.message ?? entry.description ?? entry.error;
  }).find((entry) => typeof entry === "string");
  const candidates = [
    root?.message,
    root?.description,
    root?.error_description,
    root?.error,
    nestedError?.message,
    nestedError?.description,
    nestedError?.error,
    result?.message,
    result?.error,
    firstValidationError,
  ];
  for (const candidate of candidates) {
    const message = errorText(candidate);
    if (message) return message;
  }

  const errorCode = [root?.code, root?.error_code, nestedError?.code]
    .find((value) => typeof value === "string" || typeof value === "number");
  const safeRawBody = redactAnyPayResponseText(rawBody)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (safeRawBody) {
    const prefix = errorCode === undefined ? "" : `AnyPay error ${errorCode}: `;
    return `${prefix}${safeRawBody}`.slice(0, 600);
  }
  return errorCode === undefined
    ? `AnyPay returned HTTP ${status}`
    : `AnyPay error ${errorCode} (HTTP ${status})`;
}

export function redactAnyPayResponseText(value: string): string {
  return value
    .replace(
      /("(?:sign|secret(?:_key)?|api[_-]?key|authorization)"\s*:\s*")[^"]*"/gi,
      '$1[REDACTED]"',
    )
    .replace(
      /((?:sign|secret(?:_key)?|api[_-]?key|authorization)\s*[=:]\s*)[^&\s,}]+/gi,
      "$1[REDACTED]",
    )
    .slice(0, 2_000);
}
