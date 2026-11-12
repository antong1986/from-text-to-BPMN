import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { registerPingRoutes } from "../src/lib/ping.ts";

test("GET and HEAD /ping return a two-byte public response", async () => {
  const app = express();
  registerPingRoutes(app);
  const server = app.listen(0);
  await once(server, "listening");

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/ping`;

    const getResponse = await fetch(url);
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(getResponse.headers.get("content-length"), "2");
    assert.equal(await getResponse.text(), "ok");

    const headResponse = await fetch(url, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(headResponse.headers.get("content-length"), "2");
    assert.equal(await headResponse.text(), "");
  } finally {
    server.close();
    await once(server, "close");
  }
});
