const createUsersTableSql = `
  CREATE TABLE IF NOT EXISTS "users" (
    "id" SERIAL PRIMARY KEY,
    "email" VARCHAR(255) NOT NULL UNIQUE,
    "google_id" VARCHAR(255) NOT NULL UNIQUE,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "premium_until" TIMESTAMP,
    "is_whitelisted" BOOLEAN NOT NULL DEFAULT false,
    "free_generations_left" INTEGER NOT NULL DEFAULT 3,
    "premium_generations_used" INTEGER NOT NULL DEFAULT 0,
    "premium_window_started_at" TIMESTAMP,
    "total_generations" INTEGER NOT NULL DEFAULT 0,
    "environment" VARCHAR(10) NOT NULL DEFAULT 'production',
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

export async function ensureUsersTable(
  query: (sql: string) => Promise<unknown>,
): Promise<void> {
  await query(createUsersTableSql);
}
