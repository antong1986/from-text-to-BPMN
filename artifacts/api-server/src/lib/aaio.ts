import { createHash, timingSafeEqual } from "node:crypto";

export type AaioSignatureParts = {
  merchantId: string;
  amount: string;
  currency: string;
  orderId: string;
};

export type AaioOrderInfo = {
  type?: unknown;
  merchant_id?: unknown;
  order_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
};

export function createAaioSignature(
  parts: AaioSignatureParts,
  secret: string,
): string {
  return createHash("sha256")
    .update([
      parts.merchantId,
      parts.amount,
      parts.currency,
      secret,
      parts.orderId,
    ].join(":"))
    .digest("hex");
}

export function verifyAaioSignature(
  parts: AaioSignatureParts,
  signature: string,
  secret: string,
): boolean {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(createAaioSignature(parts, secret), "hex");
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isAaioPremiumAmount(value: unknown): boolean {
  const amount = typeof value === "number" ? String(value) : value;
  if (typeof amount !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    return false;
  }
  return Number(amount) === 990;
}

export function isAaioPaidStatus(value: unknown): value is "success" | "hold" {
  return value === "success" || value === "hold";
}

export function confirmsAaioPaidOrder(
  data: AaioOrderInfo,
  merchantId: string,
  orderId: string,
): boolean {
  return data.type === "success" &&
    data.merchant_id === merchantId &&
    data.order_id === orderId &&
    isAaioPremiumAmount(data.amount) &&
    data.currency === "RUB" &&
    isAaioPaidStatus(data.status);
}
