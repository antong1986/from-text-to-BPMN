import test from "node:test";
import assert from "node:assert/strict";
import {
  getCorsAllowedOrigins,
  getSessionCookieOptions,
  PRODUCTION_FRONTEND_ORIGIN,
} from "../src/lib/cross-origin-auth.ts";

test("production CORS allows only the exact Vercel application origin", () => {
  assert.deepEqual(
    getCorsAllowedOrigins({
      NODE_ENV: "production",
      CORS_ORIGIN: "*",
      FRONTEND_URL: "https://vercel.app/",
    }),
    [PRODUCTION_FRONTEND_ORIGIN],
  );
});

test("development CORS keeps configured local origins", () => {
  assert.deepEqual(
    getCorsAllowedOrigins({
      NODE_ENV: "development",
      CORS_ORIGIN: "http://localhost:3000, https://preview.example",
      FRONTEND_URL: "https://preview.example",
    }),
    ["http://localhost:3000", "https://preview.example"],
  );
});

test("production session cookies are cross-site, secure, and expire after one day", () => {
  assert.deepEqual(
    getSessionCookieOptions({
      NODE_ENV: "production",
      SESSION_COOKIE_SAME_SITE: "lax",
    }),
    { secure: true, sameSite: "none", maxAge: 24 * 60 * 60 * 1000 },
  );
});

test("development session cookies retain local-compatible settings", () => {
  assert.deepEqual(
    getSessionCookieOptions({ NODE_ENV: "development" }),
    { secure: false, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 },
  );
});
