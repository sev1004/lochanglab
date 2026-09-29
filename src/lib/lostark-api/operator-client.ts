import type { CharacterApiResponse } from "../../types/lostark-api.ts";

export type OperatorErrorCode =
  | "OPERATOR_DISABLED"
  | "OPERATOR_AUTH_UNAVAILABLE"
  | "CHARACTER_NOT_FOUND"
  | "RATE_LIMITED"
  | "OPERATOR_UNAVAILABLE"
  | "OPERATOR_TIMEOUT";

export class OperatorApiError extends Error {
  public readonly code: OperatorErrorCode;
  public readonly retryAfterSeconds?: number;
  constructor(
    code: OperatorErrorCode,
    retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = "OperatorApiError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type OperatorEnvelope = {
  data?: CharacterApiResponse;
  error?: { code?: string; message?: string; retryAfterSeconds?: number };
};

function normalizeName(name: string) {
  return name.trim().normalize("NFC");
}

function mapError(code: string | undefined, retryAfterSeconds?: number) {
  const known = new Set<OperatorErrorCode>([
    "OPERATOR_DISABLED",
    "OPERATOR_AUTH_UNAVAILABLE",
    "CHARACTER_NOT_FOUND",
    "RATE_LIMITED",
    "OPERATOR_UNAVAILABLE",
    "OPERATOR_TIMEOUT",
  ]);
  return new OperatorApiError(
    known.has(code as OperatorErrorCode)
      ? (code as OperatorErrorCode)
      : "OPERATOR_UNAVAILABLE",
    retryAfterSeconds,
  );
}

export async function fetchCharacterFromOperator(
  characterName: string,
  baseUrl: string,
  signal?: AbortSignal,
): Promise<CharacterApiResponse> {
  const normalizedName = normalizeName(characterName);
  if (!normalizedName) throw new OperatorApiError("CHARACTER_NOT_FOUND");

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/v1/characters?name=${encodeURIComponent(normalizedName)}`,
      { headers: { Accept: "application/json" }, signal },
    );
  } catch {
    throw new OperatorApiError("OPERATOR_UNAVAILABLE");
  }

  let body: OperatorEnvelope = {};
  try {
    body = (await response.json()) as OperatorEnvelope;
  } catch {
    if (!response.ok) throw new OperatorApiError("OPERATOR_UNAVAILABLE");
  }
  if (!response.ok || !body.data) {
    throw mapError(body.error?.code, body.error?.retryAfterSeconds);
  }
  return body.data;
}
