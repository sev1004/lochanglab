import type { CharacterApiResponse, LostArkArmoryResponse } from "../../types/lostark-api.ts";
import { fetchCharacterFromOperator, OperatorApiError } from "./operator-client.ts";

const BASE_URL = "https://developer-lostark.game.onstove.com";

export class LostArkApiError extends Error {
  public readonly status: number;
  constructor(status: number) {
    super(`Lost Ark API returned ${status}`);
    this.name = "LostArkApiError";
    this.status = status;
  }
}

function normalizeApiKey(apiKey: string) {
  return apiKey.trim().replace(/^bearer\s+/i, "");
}

async function request<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "application/json", Authorization: `bearer ${normalizeApiKey(apiKey)}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new LostArkApiError(response.status);
  }
  return response.json() as Promise<T>;
}

async function optionalRequest<T>(path: string, apiKey: string, fallback: T): Promise<T> {
  try {
    return await request<T>(path, apiKey);
  } catch (error) {
    if (error instanceof LostArkApiError && [404, 500, 503].includes(error.status)) return fallback;
    throw error;
  }
}

export async function fetchCharacterWithApiKey(characterName: string, apiKey: string): Promise<CharacterApiResponse> {
  const encodedName = encodeURIComponent(characterName);
  const armory = await request<LostArkArmoryResponse>(`/armories/characters/${encodedName}`, apiKey);
  const [arkPassive, arkGrid] = await Promise.all([
    optionalRequest(`/armories/characters/${encodedName}/arkpassive`, apiKey, armory.ArkPassive),
    optionalRequest(`/armories/characters/${encodedName}/arkgrid`, apiKey, armory.ArkGrid),
  ]);
  return {
    profile: armory.ArmoryProfile ?? undefined,
    equipment: armory.ArmoryEquipment ?? undefined,
    engravings: armory.ArmoryEngraving ?? undefined,
    skills: armory.ArmorySkills ?? undefined,
    gems: armory.ArmoryGem ?? undefined,
    cards: armory.ArmoryCard,
    avatars: armory.ArmoryAvatars,
    arkPassive,
    arkGrid,
  };
}

export const OPERATOR_API_BASE_URL =
  process.env.NEXT_PUBLIC_OPERATOR_API_BASE_URL?.trim() ?? "";

export const OPERATOR_API_ENABLED =
  process.env.NEXT_PUBLIC_OPERATOR_API_ENABLED === "true" &&
  OPERATOR_API_BASE_URL.length > 0;

export async function fetchCharacter(characterName: string, apiKey?: string): Promise<CharacterApiResponse> {
  if (apiKey?.trim()) return fetchCharacterWithApiKey(characterName, apiKey);
  if (!OPERATOR_API_ENABLED) {
    throw new OperatorApiError("OPERATOR_DISABLED");
  }
  return fetchCharacterFromOperator(characterName, OPERATOR_API_BASE_URL);
}
