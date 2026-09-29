import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchCharacterFromOperator,
  OperatorApiError,
} from "../../src/lib/lostark-api/operator-client.ts";
import { fetchCharacter } from "../../src/lib/lostark-api/client.ts";

test("operator client sends only the normalized character name", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input) => {
    request = new Request(input);
    return Response.json({ data: { profile: { CharacterName: "라멜이얌" } } });
  };
  try {
    const result = await fetchCharacterFromOperator("  라멜이얌  ", "https://operator.example");
    assert.equal(result.profile?.CharacterName, "라멜이얌");
    assert.equal(request?.url, "https://operator.example/v1/characters?name=%EB%9D%BC%EB%A9%9C%EC%9D%B4%EC%96%8C");
    assert.equal(request?.headers.get("authorization"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("operator client maps structured errors without exposing upstream details", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { error: { code: "RATE_LIMITED", retryAfterSeconds: 12, message: "internal" } },
    { status: 429 },
  );
  try {
    await assert.rejects(
      fetchCharacterFromOperator("라멜이얌", "https://operator.example"),
      (error: unknown) => {
        assert.ok(error instanceof OperatorApiError);
        assert.equal(error.code, "RATE_LIMITED");
        assert.equal(error.retryAfterSeconds, 12);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("operator lookup stays off by default and does not issue a network request", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return Response.json({});
  };
  try {
    await assert.rejects(
      fetchCharacter("라멜이얌"),
      (error: unknown) => error instanceof OperatorApiError && error.code === "OPERATOR_DISABLED",
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
