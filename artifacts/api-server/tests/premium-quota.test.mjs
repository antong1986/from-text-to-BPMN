import test from "node:test";
import assert from "node:assert/strict";
import {
  isPremiumQuotaExceeded,
  PREMIUM_GENERATION_LIMIT,
  PREMIUM_WINDOW_MS,
} from "../src/lib/premium-quota.ts";

const now = Date.UTC(2026, 9, 31, 12);

test("allows premium users before they reach the hidden cap", () => {
  const startedAt = new Date(now - 5 * 24 * 60 * 60 * 1000);
  assert.equal(isPremiumQuotaExceeded(PREMIUM_GENERATION_LIMIT - 1, startedAt, now), false);
});

test("blocks premium users at 500 generations while the 30-day window is active", () => {
  const startedAt = new Date(now - 5 * 24 * 60 * 60 * 1000);
  assert.equal(isPremiumQuotaExceeded(PREMIUM_GENERATION_LIMIT, startedAt, now), true);
});

test("resets the hidden premium cap after the 30-day window", () => {
  const startedAt = new Date(now - PREMIUM_WINDOW_MS);
  assert.equal(isPremiumQuotaExceeded(PREMIUM_GENERATION_LIMIT, startedAt, now), false);
});

test("does not treat an unset or invalid window start as an active exhausted window", () => {
  assert.equal(isPremiumQuotaExceeded(PREMIUM_GENERATION_LIMIT, null, now), false);
  assert.equal(isPremiumQuotaExceeded(PREMIUM_GENERATION_LIMIT, "invalid-date", now), false);
});
