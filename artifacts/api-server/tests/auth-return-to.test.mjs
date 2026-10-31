import test from "node:test";
import assert from "node:assert/strict";
import { getSafeReturnTo } from "../src/lib/auth-redirect.ts";

test("allows same-origin relative OAuth return paths", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    assert.equal(getSafeReturnTo("/"), "/");
    assert.equal(getSafeReturnTo("/admin-panel?source=production"), "/admin-panel?source=production");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("allows absolute OAuth return URLs only for the configured frontend", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousValue = process.env.FRONTEND_URL;
  process.env.NODE_ENV = "development";
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
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousValue === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousValue;
  }
});

test("rejects protocol-relative and malformed redirect targets", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    assert.equal(getSafeReturnTo("//evil.example/"), "/");
    assert.equal(getSafeReturnTo("/\\evil.example/"), "/");
    assert.equal(getSafeReturnTo("javascript:alert(1)"), "/");
    assert.equal(getSafeReturnTo(null), "/");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("production redirects always resolve to the trusted Vercel frontend", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFrontendUrl = process.env.FRONTEND_URL;
  process.env.NODE_ENV = "production";
  delete process.env.FRONTEND_URL;

  try {
    assert.equal(
      getSafeReturnTo("/"),
      "https://from-text-to-bpmn.vercel.app/",
    );
    assert.equal(
      getSafeReturnTo("/admin-panel?source=production"),
      "https://from-text-to-bpmn.vercel.app/admin-panel?source=production",
    );
    assert.equal(
      getSafeReturnTo(undefined),
      "https://from-text-to-bpmn.vercel.app/",
    );
    assert.equal(
      getSafeReturnTo("https://evil.example/"),
      "https://from-text-to-bpmn.vercel.app/",
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousFrontendUrl;
  }
});
