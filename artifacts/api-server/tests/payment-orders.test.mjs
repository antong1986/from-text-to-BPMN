import test from "node:test";
import assert from "node:assert/strict";
import { ensurePaymentOrdersTable } from "../src/lib/payment-orders.ts";

test("creates an idempotent payment orders table and user index", async () => {
  const statements = [];
  await ensurePaymentOrdersTable(async (sql) => statements.push(sql));

  assert.equal(statements.length, 2);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS "payment_orders"/);
  assert.match(statements[0], /"order_id" VARCHAR\(64\) PRIMARY KEY/);
  assert.match(statements[0], /REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(statements[0], /'pending', 'paid', 'failed'/);
  assert.match(statements[1], /CREATE INDEX IF NOT EXISTS "IDX_payment_orders_user_id"/);
});
