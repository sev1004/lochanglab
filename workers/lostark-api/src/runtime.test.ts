import test from "node:test";
import assert from "node:assert/strict";
import worker, { Coordinator, type Env } from "./index.ts";

test("Coordinator executed error, cache and concurrency contracts", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.error;
  const logs: string[] = [];
  console.error = (value: string) => { logs.push(value); };
  const values = new Map<string, unknown>();
  let storageFailure = "";
  const state = { storage: {
    async get<T>(key: string) { if (storageFailure === "read") throw new Error("secret-sentinel"); return values.get(key) as T | undefined; },
    async put<T>(key: string, value: T) { if (storageFailure === "write") throw new Error("secret-sentinel"); values.set(key, value); },
    async list<T>() { return new Map([...values].filter(([key]) => key.startsWith("character:"))) as Map<string, T>; },
    async delete(key: string) { return values.delete(key); },
  }};
  const env = { LOSTARK_API_KEY: "secret-sentinel", OPERATOR_LOOKUP_ENABLED: "true" } as Env;
  let coordinator = new Coordinator(state, env);
  env.COORDINATOR = {
    idFromName: () => ({}),
    get: () => ({ fetch: async (url, init) => coordinator.fetch(new Request(url, init)) }),
  };
  let calls = 0;
  let endpointFailure = "arkgrid";
  let mode: number | string = "success";
  globalThis.fetch = async (url) => {
    calls++;
    const endpoint = String(url).endsWith("/arkgrid") ? "arkgrid" : String(url).endsWith("/arkpassive") ? "arkpassive" : "armory";
    if (endpoint === endpointFailure) {
      if (mode === "throw") throw new TypeError("secret-sentinel");
      if (mode === "timeout") throw new DOMException("secret-sentinel", "AbortError");
      if (mode === "json") return new Response("secret-sentinel");
      if (typeof mode === "number") return new Response("", { status: mode, headers: { "Retry-After": "17" } });
    }
    return Response.json(endpoint === "armory" ? { ArmoryProfile: { CharacterName: "test" }, ArkGrid: { fallback: true } } : {});
  };
  const query = () => worker.fetch(new Request("https://worker/v1/characters?name=test"), env);
  const reset = () => { values.clear(); logs.length = 0; calls = 0; storageFailure = ""; mode = "success"; endpointFailure = "arkgrid"; coordinator = new Coordinator(state, env); };
  try {
    await t.test("101 identical requests coalesce and successful result is cached", async () => {
      reset();
      const responses = await Promise.all(Array.from({ length: 101 }, query));
      assert.ok(responses.every((response) => response.status === 200));
      assert.equal(calls, 3);
      assert.equal((await (await query()).json()).meta.cache, "hit");
      assert.equal(calls, 3);
    });
    for (const endpoint of ["armory", "arkpassive", "arkgrid"]) {
      for (const status of [401, 403]) await t.test(endpoint + " authentication " + status, async () => {
        reset(); endpointFailure = endpoint; mode = status;
        const response = await query();
        assert.equal(response.status, 503);
        assert.equal((await response.json()).error.code, "OPERATOR_AUTH_UNAVAILABLE");
      });
    }
    await t.test("failure endpoint is accurate; followers fail safely and retry succeeds", async () => {
      reset(); mode = "throw";
      const responses = await Promise.all(Array.from({ length: 10 }, query));
      assert.ok(responses.every((r) => r.status === 502));
      assert.equal(calls, 3);
      const diagnostic = logs.map((v) => JSON.parse(v)).find((v) => v.stage === "upstream_fetch");
      assert.equal(diagnostic.endpoint, "arkgrid");
      assert.ok(!logs.join("").includes("secret-sentinel"));
      mode = "success";
      assert.equal((await query()).status, 200);
      assert.equal(calls, 6);
    });
    await t.test("fallback responses are returned but never cached", async () => {
      reset(); mode = 503;
      assert.deepEqual((await (await query()).json()).data.arkGrid, { fallback: true });
      await query();
      assert.equal(calls, 6);
    });
    await t.test("429 retry interval survives outer boundary and Coordinator restart", async () => {
      reset(); mode = 429;
      const first = await query();
      assert.equal(first.status, 429);
      assert.equal(first.headers.get("Retry-After"), "17");
      assert.equal((await first.json()).error.retryAfterSeconds, 17);
      coordinator = new Coordinator(state, env);
      mode = "success";
      assert.equal((await query()).status, 429);
      assert.equal(calls, 3);
      values.set("blocked-until:v1", Date.now() - 1);
      coordinator = new Coordinator(state, env);
      assert.equal((await query()).status, 200);
    });
    for (const failure of ["timeout", "json"]) await t.test(failure + " is classified", async () => {
      reset(); mode = failure;
      const response = await query();
      assert.equal(response.status, failure === "timeout" ? 504 : 502);
      assert.ok(!JSON.stringify(await response.json()).includes("secret-sentinel"));
    });
    for (const failure of ["read", "write"]) await t.test("storage " + failure + " returns safe error", async () => {
      reset(); storageFailure = failure;
      const response = await query();
      assert.equal(response.status, 502);
      assert.ok(!JSON.stringify(await response.json()).includes("secret-sentinel"));
    });
    await t.test("disabled worker never calls upstream", async () => {
      reset(); env.OPERATOR_LOOKUP_ENABLED = "false";
      assert.equal((await query()).status, 503);
      assert.equal(calls, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalLog;
  }
});
