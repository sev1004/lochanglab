type Json = Record<string, unknown>;

export type Env = {
  LOSTARK_API_KEY: string;
  OPERATOR_LOOKUP_ENABLED?: string;
  UPSTREAM_REQUEST_LIMIT?: string;
  UPSTREAM_WINDOW_SECONDS?: string;
  COORDINATOR: DurableObjectNamespace;
};

const UPSTREAM = "https://developer-lostark.game.onstove.com";
const ALLOWED_ORIGINS = new Set([
  "https://lochanglab.pages.dev",
  "http://localhost:3000",
]);

function corsHeaders(origin: string | null) {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}

function json(body: Json, status: number, origin: string | null, retryAfter?: number) {
  const headers = corsHeaders(origin);
  if (retryAfter !== undefined) headers.set("Retry-After", String(retryAfter));
  return new Response(JSON.stringify(body), { status, headers });
}

function diagnosticFailure(
  requestIdValue: string,
  stage: string,
  errorCode: string,
  endpoint?: string,
  upstreamStatus?: number,
  errorType?: string,
) {
  console.error(JSON.stringify({
    event: "operator_lookup_failed",
    requestId: requestIdValue,
    stage,
    ...(endpoint ? { endpoint } : {}),
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
    ...(errorType ? { errorType } : {}),
    errorCode,
  }));
}

function errorBody(code: string, message: string, requestId: string, retryAfterSeconds?: number) {
  return {
    error: { code, message, requestId, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) },
  };
}

function requestId() {
  return crypto.randomUUID();
}

function normalizeName(value: string) {
  return value.trim().normalize("NFC");
}

async function fetchUpstream(name: string, apiKey: string, requestIdValue: string) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    diagnosticFailure(requestIdValue, "upstream_auth", "OPERATOR_AUTH_UNAVAILABLE");
    throw new OperatorFailure("OPERATOR_AUTH_UNAVAILABLE", 503);
  }
  const encoded = encodeURIComponent(name);
  const headers = {
    Accept: "application/json",
    Authorization: `bearer ${apiKey.trim().replace(/^bearer\s+/i, "")}`,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const fetchOptions = { headers, redirect: "manual" as const, signal: controller.signal };
  let degraded = false;
  const request = async (path: string, endpoint: string) => {
    let stage = "upstream_fetch";
    let status: number | undefined;
    try {
      const response = await fetch(`${UPSTREAM}${path}`, fetchOptions);
      status = response.status;
      stage = "upstream_response";
      if (status === 401 || status === 403) throw new OperatorFailure("OPERATOR_AUTH_UNAVAILABLE", 503);
      if (status === 429) {
        const raw = response.headers.get("Retry-After");
        const seconds = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? (Date.parse(raw) - Date.now()) / 1000 : NaN;
        throw new OperatorFailure("RATE_LIMITED", 429, Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 30);
      }
      if (endpoint !== "armory" && [404, 500, 503].includes(status)) {
        degraded = true;
        return undefined;
      }
      if (status === 404) throw new OperatorFailure("CHARACTER_NOT_FOUND", 404);
      if (!response.ok) {
        if (status >= 300 && status < 400) stage = "upstream_redirect";
        throw new OperatorFailure("OPERATOR_UNAVAILABLE", 502);
      }
      stage = "upstream_json";
      return await response.json();
    } catch (error) {
      const failure = error instanceof OperatorFailure ? error :
        new OperatorFailure(controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") ? "OPERATOR_TIMEOUT" : "OPERATOR_UNAVAILABLE",
          controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") ? 504 : 502);
      diagnosticFailure(requestIdValue, stage, failure.code, endpoint, status,
        error instanceof TypeError ? "TypeError" : error instanceof SyntaxError ? "SyntaxError" : undefined);
      throw failure;
    }
  };
  try {
    const armory = await request(`/armories/characters/${encoded}`, "armory") as Record<string, unknown> | null;
    if (!armory || typeof armory !== "object" || Array.isArray(armory)) {
      diagnosticFailure(requestIdValue, "upstream_schema", "OPERATOR_UNAVAILABLE", "armory");
      throw new OperatorFailure("OPERATOR_UNAVAILABLE", 502);
    }
    const optionalResults = await Promise.allSettled([
      request(`/armories/characters/${encoded}/arkpassive`, "arkpassive"),
      request(`/armories/characters/${encoded}/arkgrid`, "arkgrid"),
    ]);
    const failures = optionalResults.filter((result) => result.status === "rejected");
    if (failures.length) {
      const rateLimit = failures.find((result) => result.reason instanceof OperatorFailure && result.reason.code === "RATE_LIMITED");
      throw (rateLimit ?? failures[0]).reason;
    }
    const [arkPassive, arkGrid] = optionalResults.map((result) => result.status === "fulfilled" ? result.value : undefined);
    return {
      degraded,
      data: {
      profile: armory.ArmoryProfile ?? undefined,
      equipment: armory.ArmoryEquipment ?? undefined,
      engravings: armory.ArmoryEngraving ?? undefined,
      skills: armory.ArmorySkills ?? undefined,
      gems: armory.ArmoryGem ?? undefined,
      cards: armory.ArmoryCard,
      avatars: armory.ArmoryAvatars,
      arkPassive: arkPassive === undefined ? armory.ArkPassive : arkPassive,
      arkGrid: arkGrid === undefined ? armory.ArkGrid : arkGrid,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

class OperatorFailure extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly retryAfterSeconds?: number;
  constructor(code: string, status: number, retryAfterSeconds?: number) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class Coordinator implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private budgetLock: Promise<void> = Promise.resolve();
  private blockedUntil = 0;
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    const requestIdValue = url.searchParams.get("requestId") ?? crypto.randomUUID();
    try {
      const name = normalizeName(url.searchParams.get("name") ?? "");
      if (!name || name.length > 32 || [...name].some((char) => /[\u0000-\u001f\u007f]/.test(char))) {
        return new Response(JSON.stringify({ error: { code: "INVALID_NAME", message: "캐릭터명을 확인해주세요.", requestId: requestIdValue } }), { status: 400 });
      }
      const key = `character:v1:${name}`;
      const cached = await this.state.storage.get<{ data: unknown; expiresAt: number }>(key);
      if (cached && cached.expiresAt > Date.now()) {
        return Response.json({ data: cached.data, meta: { fetchedAt: cached.expiresAt - 60_000, expiresAt: cached.expiresAt, cache: "hit", schemaVersion: 1 } });
      }
      const existing = this.inFlight.get(key);
      if (existing) {
        const result = await existing;
        return Response.json({ data: result, meta: { cache: "coalesced", schemaVersion: 1 } });
      }
      const task = this.loadAndCache(key, name, requestIdValue);
      this.inFlight.set(key, task);
      try {
        const result = await task;
        return Response.json({ data: result, meta: { cache: "miss", schemaVersion: 1 } });
      } finally {
        this.inFlight.delete(key);
      }
    } catch (error) {
      if (error instanceof OperatorFailure) {
        diagnosticFailure(requestIdValue, "coordinator", error.code);
        return Response.json({ error: { code: error.code, message: "운영 API 조회에 실패했습니다.", requestId: requestIdValue, ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }) } }, { status: error.status, headers: error.retryAfterSeconds === undefined ? undefined : { "Retry-After": String(error.retryAfterSeconds) } });
      }
      diagnosticFailure(requestIdValue, "coordinator_exception", "OPERATOR_UNAVAILABLE");
      return Response.json({ error: { code: "OPERATOR_UNAVAILABLE", message: "운영 API에 연결하지 못했습니다.", requestId: requestIdValue } }, { status: 502 });
    }
  }

  private async loadAndCache(key: string, name: string, requestIdValue: string) {
    await this.reserveUpstreamBudget(3);
    let result: Awaited<ReturnType<typeof fetchUpstream>>;
    try {
      result = await fetchUpstream(name, this.env.LOSTARK_API_KEY, requestIdValue);
    } catch (error) {
      if (error instanceof OperatorFailure && error.code === "RATE_LIMITED") {
        this.blockedUntil = Math.max(this.blockedUntil, Date.now() + (error.retryAfterSeconds ?? 30) * 1000);
        const previous = this.budgetLock;
        let release!: () => void;
        this.budgetLock = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try {
          const saved = await this.state.storage.get<number>("blocked-until:v1") ?? 0;
          this.blockedUntil = Math.max(this.blockedUntil, saved);
          await this.state.storage.put("blocked-until:v1", this.blockedUntil);
        } finally { release(); }
      }
      throw error;
    }
    if (result.degraded) return result.data;
    const expiresAt = Date.now() + 60_000;
    await this.state.storage.put(key, { data: result.data, expiresAt });
    await this.trimCache();
    return result.data;
  }

  private async trimCache() {
    const entries = await this.state.storage.list<{ data: unknown; expiresAt: number }>({ prefix: "character:v1:" });
    const now = Date.now();
    const candidates = [...entries.entries()]
      .filter(([, value]) => value.expiresAt <= now)
      .map(([entryKey]) => entryKey);
    for (const entryKey of candidates) await this.state.storage.delete(entryKey);
    const remaining = [...entries.entries()]
      .filter(([, value]) => value.expiresAt > now)
      .sort(([, left], [, right]) => left.expiresAt - right.expiresAt);
    for (const [entryKey] of remaining.slice(0, Math.max(0, remaining.length - 100))) {
      await this.state.storage.delete(entryKey);
    }
  }

  private async reserveUpstreamBudget(requestCount: number) {
    const previous = this.budgetLock;
    let release!: () => void;
    this.budgetLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
    this.blockedUntil = Math.max(this.blockedUntil, await this.state.storage.get<number>("blocked-until:v1") ?? 0);
    if (this.blockedUntil > Date.now()) {
      throw new OperatorFailure("RATE_LIMITED", 429, Math.max(1, Math.ceil((this.blockedUntil - Date.now()) / 1000)));
    }
    const limit = Number(this.env.UPSTREAM_REQUEST_LIMIT ?? "0");
    const windowMs = Math.max(1, Number(this.env.UPSTREAM_WINDOW_SECONDS ?? "60")) * 1_000;
    if (!Number.isFinite(limit) || limit <= 0) return;
    const now = Date.now();
    const current = await this.state.storage.get<{ startedAt: number; count: number }>("budget:v1");
    const budget = !current || now - current.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : current;
    if (budget.count + requestCount > limit) {
      const retryAfter = Math.max(1, Math.ceil((budget.startedAt + windowMs - now) / 1_000));
      throw new OperatorFailure("RATE_LIMITED", 429, retryAfter);
    }
    await this.state.storage.put("budget:v1", { startedAt: budget.startedAt, count: budget.count + requestCount });
    } finally {
      release();
    }
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const origin = request.headers.get("Origin");
    const id = requestId();
    if (request.method === "OPTIONS") {
      const headers = corsHeaders(origin);
      headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "Accept, Content-Type");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET") return json(errorBody("METHOD_NOT_ALLOWED", "지원하지 않는 요청입니다.", id), 405, origin);
    const url = new URL(request.url);
    if (url.pathname !== "/v1/characters") return json(errorBody("NOT_FOUND", "요청 경로를 찾을 수 없습니다.", id), 404, origin);
    if (env.OPERATOR_LOOKUP_ENABLED !== "true") return json(errorBody("OPERATOR_DISABLED", "운영 조회가 비활성화되어 있습니다.", id), 503, origin);
    if (typeof env.LOSTARK_API_KEY !== "string" || !env.LOSTARK_API_KEY.trim()) return json(errorBody("OPERATOR_AUTH_UNAVAILABLE", "운영 API가 설정되지 않았습니다.", id), 503, origin);
    const name = normalizeName(url.searchParams.get("name") ?? "");
    if (!name || name.length > 32 || [...name].some((char) => /[\u0000-\u001f\u007f]/.test(char))) return json(errorBody("INVALID_NAME", "캐릭터명을 확인해주세요.", id), 400, origin);
    try {
      const coordinator = env.COORDINATOR.get(env.COORDINATOR.idFromName("lostark-operator-budget-v1"));
      const response = await coordinator.fetch(`https://coordinator/v1/characters?name=${encodeURIComponent(name)}&requestId=${encodeURIComponent(id)}`);
      if (response.ok) {
        const body = await response.json() as Json;
        const headers = corsHeaders(origin);
        return new Response(JSON.stringify(body), { status: 200, headers });
      }
      const failure = await response.json() as Json;
      return json({ ...failure, error: { ...(failure.error as Json), requestId: id } }, response.status, origin, response.headers.get("Retry-After") ? Number(response.headers.get("Retry-After")) : undefined);
    } catch (error) {
      if (error instanceof OperatorFailure) return json(errorBody(error.code, "운영 API 조회에 실패했습니다.", id, error.retryAfterSeconds), error.status, origin, error.retryAfterSeconds);
      return json(errorBody("OPERATOR_UNAVAILABLE", "운영 API에 연결하지 못했습니다.", id), 502, origin);
    }
  },
};
