import test from "node:test";
import assert from "node:assert/strict";
import { getSafeReturnTo } from "../src/lib/auth-redirect.ts";

test("allows same-origin relative OAuth return paths", () => {
  assert.equal(getSafeReturnTo("/"), "/");
  assert.equal(getSafeReturnTo("/admin-panel?source=production"), "/admin-panel?source=production");
});

test("allows absolute OAuth return URLs only for the configured frontend", () => {
  const previousValue = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = "https://from-text-to-bpmn.vercel.app";
  try {
    assert.equal(
      getSafeReturnTo("https://from-text-to-bpmn.vercel.app/"),
      "https://from-text-to-bpmn.vercel.app/",
    );
    assert.equal(
      getSafeReturnTo("https://from-text-to-bpmn.vercel.app/admin-panel"),
      "https://from-text-to-bpmn.vercel.app/admin-panel",
    );
    assert.equal(getSafeReturnTo("https://evil.example/"), "/");
    assert.equal(getSafeReturnTo("http://from-text-to-bpmn.vercel.app/"), "/");
  } finally {
    if (previousValue === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousValue;
  }
});

test("rejects protocol-relative and malformed redirect targets", () => {
  assert.equal(getSafeReturnTo("//evil.example/"), "/");
  assert.equal(getSafeReturnTo("/\\evil.example/"), "/");
  assert.equal(getSafeReturnTo("javascript:alert(1)"), "/");
  assert.equal(getSafeReturnTo(null), "/");
});
