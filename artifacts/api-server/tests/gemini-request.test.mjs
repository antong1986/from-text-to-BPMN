import test from "node:test";
import assert from "node:assert/strict";
import { fetchGeminiWithRetry } from "../src/lib/gemini-request.ts";

test("retries 503/502 without truncating a large description", async () => {
  const body = JSON.stringify({ description: "Кредитный менеджер проверяет заявку. ".repeat(5000) });
  const statuses = [503, 502, 200];
  const delays = [];
  let calls = 0;
  const result = await fetchGeminiWithRetry("https://example.invalid", { body, method: "POST" }, {
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

test("stops after three attempts on persistent 503", async () => {
  let calls = 0;
  const result = await fetchGeminiWithRetry("https://example.invalid", {}, {
    fetchImpl: async () => { calls++; return new Response("{}", { status: 503 }); },
    sleep: async () => {},
  });
  assert.equal(result.status, 503);
  assert.equal(calls, 3);
});

test("does not retry authentication or invalid-input failures", async () => {
  for (const status of [400, 401, 403]) {
    let calls = 0;
    const result = await fetchGeminiWithRetry("https://example.invalid", {}, {
      fetchImpl: async () => { calls++; return new Response("{}", { status }); },
      sleep: async () => assert.fail("must not wait"),
    });
    assert.equal(result.status, status);
    assert.equal(calls, 1);
  }
});

test("respects bounded Retry-After for rate limiting", async () => {
  let calls = 0;
  const waits = [];
  await fetchGeminiWithRetry("https://example.invalid", {}, {
    fetchImpl: async () => new Response("{}", { status: calls++ ? 200 : 429, headers: { "retry-after": "999" } }),
    sleep: async ms => { waits.push(ms); },
  });
  assert.deepEqual(waits, [10000]);
});

test("retries a network failure", async () => {
  let calls = 0;
  const result = await fetchGeminiWithRetry("https://example.invalid", {}, {
    fetchImpl: async () => { if (calls++ === 0) throw new TypeError("network"); return new Response("{}"); },
    sleep: async () => {},
  });
  assert.equal(result.status, 200);
  assert.equal(calls, 2);
});

test("total time budget stops retries", async () => {
  let calls = 0;
  await assert.rejects(fetchGeminiWithRetry("https://example.invalid", {}, {
    totalTimeoutMs: 10,
    fetchImpl: async () => { calls++; return new Response("{}", { status: 503 }); },
    sleep: async () => new Promise(resolve => setTimeout(resolve, 20)),
  }), { name: "TimeoutError" });
  assert.equal(calls, 1);
});
