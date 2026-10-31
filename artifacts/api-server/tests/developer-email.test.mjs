import test from "node:test";
import assert from "node:assert/strict";
import { isDeveloperEmail } from "../src/lib/developer-email.ts";

test("matches any comma-separated developer email", () => {
  assert.equal(
    isDeveloperEmail("second@example.com", "first@example.com, second@example.com"),
    true,
  );
});

test("trims whitespace and compares email addresses case-insensitively", () => {
  assert.equal(
    isDeveloperEmail("  ADMIN@example.com ", "admin@example.com, other@example.com"),
    true,
  );
});

test("does not match partial addresses or empty allowlist entries", () => {
  assert.equal(isDeveloperEmail("admin@example.com", "admin@example.com.evil, ,"), false);
  assert.equal(isDeveloperEmail("admin@example.com", " , , "), false);
});

test("uses the environment allowlist when no explicit value is provided", () => {
  const previousValue = process.env.MY_DEVELOPER_EMAIL;
  process.env.MY_DEVELOPER_EMAIL = "first@example.com, second@example.com";
  try {
    assert.equal(isDeveloperEmail("second@example.com"), true);
  } finally {
    if (previousValue === undefined) delete process.env.MY_DEVELOPER_EMAIL;
    else process.env.MY_DEVELOPER_EMAIL = previousValue;
  }
});
