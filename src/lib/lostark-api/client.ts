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

export async function fetchCharacter(characterName: string, apiKey: string): Promise<CharacterApiResponse> {
  const encodedName = encodeURIComponent(characterName);
  const armory = await request<LostArkArmoryResponse>(`/armories/characters/${encodedName}`, apiKey);
  return {
    profile: armory.ArmoryProfile ?? undefined,
    equipment: armory.ArmoryEquipment ?? undefined,
    engravings: armory.ArmoryEngraving ?? undefined,
    skills: armory.ArmorySkills ?? undefined,
    gems: armory.ArmoryGem ?? undefined,
    cards: armory.ArmoryCard,
    avatars: armory.ArmoryAvatars,
    arkPassive: armory.ArkPassive,
    arkGrid: armory.ArkGrid,
  };
}
