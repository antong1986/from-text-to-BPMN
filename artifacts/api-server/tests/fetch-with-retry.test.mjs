import test from "node:test";
import assert from "node:assert/strict";
import { fetchWithRetry } from "../src/lib/fetch-with-retry.ts";

test("retries transient errors without truncating a large request body", async () => {
  const body = JSON.stringify({ description: "Кредитный менеджер проверяет заявку. ".repeat(5000) });
  const statuses = [503, 502, 200];
  const delays = [];
  let calls = 0;
  const result = await fetchWithRetry("https://example.invalid", { body, method: "POST" }, {
    fetchImpl: async (_url, init) => {
      assert.equal(init.body, body);
      return new Response("{}", { status: statuses[calls++] });
    },
    sleep: async ms => { delays.push(ms); },
  });
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test("stops after three attempts on a persistent transient error", async () => {
  let calls = 0;
  const result = await fetchWithRetry("https://example.invalid", {}, {
    fetchImpl: async () => { calls++; return new Response("{}", { status: 503 }); },
    sleep: async () => {},
  });
  assert.equal(result.status, 503);
  assert.equal(calls, 3);
});

test("does not retry authentication or invalid-input failures", async () => {
  for (const status of [400, 401, 403]) {
    let calls = 0;
    const result = await fetchWithRetry("https://example.invalid", {}, {
      fetchImpl: async () => { calls++; return new Response("{}", { status }); },
      sleep: async () => assert.fail("must not wait"),
    });
    assert.equal(result.status, status);
    assert.equal(calls, 1);
  }
});

test("uses a longer bounded backoff for repeatedly rate-limited model requests", async () => {
  let calls = 0;
  const delays = [];
  const result = await fetchWithRetry("https://example.invalid", {}, {
    initialRetryDelayMs: 5000,
    maxRetryDelayMs: 30000,
    fetchImpl: async () => new Response("{}", { status: [429, 429, 200][calls++] }),
    sleep: async ms => { delays.push(ms); },
  });
  assert.equal(result.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [5000, 10000]);
});

test("respects bounded Retry-After for rate limiting", async () => {
  let calls = 0;
  const waits = [];
  await fetchWithRetry("https://example.invalid", {}, {
    fetchImpl: async () => new Response("{}", {
      status: calls++ ? 200 : 429,
      headers: { "retry-after": "999" },
    }),
    sleep: async ms => { waits.push(ms); },
  });
  assert.deepEqual(waits, [10000]);
});

test("retries a network failure", async () => {
  let calls = 0;
  const result = await fetchWithRetry("https://example.invalid", {}, {
    fetchImpl: async () => { if (calls++ === 0) throw new TypeError("network"); return new Response("{}"); },
    sleep: async () => {},
  });
  assert.equal(result.status, 200);
  assert.equal(calls, 2);
});

test("total time budget stops retries", async () => {
  let calls = 0;
  await assert.rejects(fetchWithRetry("https://example.invalid", {}, {
    totalTimeoutMs: 10,
    fetchImpl: async () => { calls++; return new Response("{}", { status: 503 }); },
    sleep: async () => new Promise(resolve => setTimeout(resolve, 20)),
  }), { name: "TimeoutError" });
  assert.equal(calls, 1);
});
