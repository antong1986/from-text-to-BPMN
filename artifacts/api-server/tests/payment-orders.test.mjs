import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureLemonSqueezyWebhookEventsTable,
  ensurePaymentOrdersTable,
} from "../src/lib/payment-orders.ts";

test("creates payment orders, safely renames the legacy provider column, and indexes users", async () => {
  const statements = [];
  await ensurePaymentOrdersTable(async (sql) => statements.push(sql));

  assert.equal(statements.length, 3);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS "payment_orders"/);
  assert.match(statements[0], /"order_id" VARCHAR\(64\) PRIMARY KEY/);
  assert.match(statements[0], /REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(statements[0], /'pending', 'paid', 'failed'/);
  assert.match(statements[0], /"provider_reference" VARCHAR\(128\)/);
  assert.match(statements[1], /RENAME COLUMN "aaio_invoice_id" TO "provider_reference"/);
  assert.match(statements[2], /CREATE INDEX IF NOT EXISTS "IDX_payment_orders_user_id"/);
});

test("creates an idempotency table for Lemon Squeezy orders", async () => {
  const statements = [];
  await ensureLemonSqueezyWebhookEventsTable(async (sql) => statements.push(sql));

  assert.equal(statements.length, 1);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS "lemon_squeezy_webhook_events"/);
  assert.match(statements[0], /"order_id" VARCHAR\(100\) PRIMARY KEY/);
  assert.match(statements[0], /"user_id" INTEGER NOT NULL REFERENCES users\(id\)/);
});
