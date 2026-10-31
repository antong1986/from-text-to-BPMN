const createSessionTableSql = `
  CREATE TABLE IF NOT EXISTS "sessions" (
    "sid" varchar NOT NULL,
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
  )
`;

const createSessionExpireIndexSql = `
  CREATE INDEX IF NOT EXISTS "IDX_session_expire"
  ON "sessions" ("expire")
`;

export async function ensureSessionStoreTable(
  query: (sql: string) => Promise<unknown>,
): Promise<void> {
  await query(createSessionTableSql);
  await query(createSessionExpireIndexSql);
}
