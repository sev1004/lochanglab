import assert from "node:assert/strict";
import test from "node:test";
import "./runtime.test.ts";

test("worker configuration keeps the public origin and cache contract explicit", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./index.ts", import.meta.url), "utf8"));
  assert.match(source, /https:\/\/lochanglab\.pages\.dev/);
  assert.match(source, /60_000/);
  assert.match(source, /LOSTARK_API_KEY/);
  assert.match(source, /lostark-operator-budget-v1/);
  assert.match(source, /inFlight/);
  assert.match(source, /reserveUpstreamBudget/);
});
