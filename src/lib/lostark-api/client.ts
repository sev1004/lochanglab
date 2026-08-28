import { CharacterApiResponse, LostArkArmoryResponse } from "@/types/lostark-api";

const BASE_URL = "https://developer-lostark.game.onstove.com";

export class LostArkApiError extends Error {
  constructor(public readonly status: number) {
    super(`Lost Ark API returned ${status}`);
    this.name = "LostArkApiError";
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

export async function fetchCharacter(characterName: string, apiKey: string): Promise<CharacterApiResponse> {
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
