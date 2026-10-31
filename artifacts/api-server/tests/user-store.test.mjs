import test from "node:test";
import assert from "node:assert/strict";
import { ensureUsersTable } from "../src/lib/user-store.ts";

test("creates the PostgreSQL users table with the columns used by auth and quotas", async () => {
  const statements = [];
  await ensureUsersTable(async (sql) => {
    statements.push(sql);
  });

  assert.equal(statements.length, 1);
  const sql = statements[0];
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "users"/);
  assert.match(sql, /"id" SERIAL PRIMARY KEY/);
  assert.match(sql, /"email" VARCHAR\(255\) NOT NULL UNIQUE/);
  assert.match(sql, /"google_id" VARCHAR\(255\) NOT NULL UNIQUE/);
  assert.match(sql, /"is_premium" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /"premium_until" TIMESTAMP/);
  assert.match(sql, /"is_whitelisted" BOOLEAN NOT NULL DEFAULT false/);
  assert.match(sql, /"free_generations_left" INTEGER NOT NULL DEFAULT 3/);
  assert.match(sql, /"premium_generations_used" INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /"premium_window_started_at" TIMESTAMP/);
  assert.match(sql, /"total_generations" INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /"environment" VARCHAR\(10\) NOT NULL DEFAULT 'production'/);
  assert.match(sql, /"created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP/);
});
