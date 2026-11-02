const createPaymentOrdersTableSql = `
  CREATE TABLE IF NOT EXISTS "payment_orders" (
    "order_id" VARCHAR(64) PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "amount" NUMERIC(10, 2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK ("status" IN ('pending', 'paid', 'failed')),
    "aaio_invoice_id" VARCHAR(64),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP
  )
`;

const createPaymentOrdersUserIndexSql = `
  CREATE INDEX IF NOT EXISTS "IDX_payment_orders_user_id"
  ON "payment_orders" ("user_id")
`;

const createLemonSqueezyWebhookEventsTableSql = `
  CREATE TABLE IF NOT EXISTS "lemon_squeezy_webhook_events" (
    "order_id" VARCHAR(100) PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "processed_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

export async function ensurePaymentOrdersTable(
  query: (sql: string) => Promise<unknown>,
): Promise<void> {
  await query(createPaymentOrdersTableSql);
  await query(createPaymentOrdersUserIndexSql);
}

export async function ensureLemonSqueezyWebhookEventsTable(
  query: (sql: string) => Promise<unknown>,
): Promise<void> {
  await query(createLemonSqueezyWebhookEventsTableSql);
}
