import test from "node:test";
import assert from "node:assert/strict";
import { getGoogleCallbackUrl } from "../src/lib/oauth-config.ts";

const renderCallback =
  "https://from-text-to-bpmn-api.onrender.com/api/auth/google/callback";

test("uses the public Render callback in production even when PORT is internal", () => {
  assert.equal(
    getGoogleCallbackUrl({
      NODE_ENV: "production",
      PORT: "10000",
      GOOGLE_CALLBACK_URL: "http://localhost:10000/api/auth/google/callback",
    }),
    renderCallback,
  );
});

test("honors an explicit callback URL outside production", () => {
  const configured = "https://example.test/api/auth/google/callback";
  assert.equal(
    getGoogleCallbackUrl({
      NODE_ENV: "development",
      GOOGLE_CALLBACK_URL: configured,
    }),
    configured,
  );
});

test("uses the Replit domain for local OAuth when no callback is configured", () => {
  assert.equal(
    getGoogleCallbackUrl({
      NODE_ENV: "development",
      REPLIT_DOMAINS: "studio.example.repl.co,other.example.repl.co",
      PORT: "8080",
    }),
    "https://studio.example.repl.co/api/auth/google/callback",
  );
});
