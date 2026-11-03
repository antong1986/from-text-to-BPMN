const createPaymentOrdersTableSql = `
  CREATE TABLE IF NOT EXISTS "payment_orders" (
    "order_id" VARCHAR(64) PRIMARY KEY,
    "user_id" INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "amount" NUMERIC(10, 2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK ("status" IN ('pending', 'paid', 'failed')),
    "provider_reference" VARCHAR(128),
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMP
  )
`;

const renameLegacyAaioInvoiceColumnSql = `
  DO $$
  BEGIN
    LOCK TABLE "payment_orders" IN ACCESS EXCLUSIVE MODE;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'payment_orders'
        AND column_name = 'aaio_invoice_id'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'payment_orders'
        AND column_name = 'provider_reference'
    ) THEN
      ALTER TABLE "payment_orders"
      RENAME COLUMN "aaio_invoice_id" TO "provider_reference";
    END IF;
  END;
  $$
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
  await query(renameLegacyAaioInvoiceColumnSql);
  await query(createPaymentOrdersUserIndexSql);
}

export async function ensureLemonSqueezyWebhookEventsTable(
  query: (sql: string) => Promise<unknown>,
): Promise<void> {
  await query(createLemonSqueezyWebhookEventsTableSql);
}
