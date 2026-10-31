import test from "node:test";
import assert from "node:assert/strict";
import { ensureSessionStoreTable } from "../src/lib/session-store.ts";

test("creates the connect-pg-simple table and expiry index before startup", async () => {
  const statements = [];
  await ensureSessionStoreTable(async (sql) => {
    statements.push(sql);
  });

  assert.equal(statements.length, 2);
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS "sessions"/);
  assert.match(statements[0], /"sid" varchar NOT NULL/);
  assert.match(statements[0], /"sess" json NOT NULL/);
  assert.match(statements[0], /"expire" timestamp\(6\) NOT NULL/);
  assert.match(statements[0], /PRIMARY KEY \("sid"\)/);
  assert.match(statements[1], /CREATE INDEX IF NOT EXISTS "IDX_session_expire"/);
  assert.match(statements[1], /ON "sessions" \("expire"\)/);
  assert.doesNotMatch(statements.join("\n"), /OIDS/i);
});
