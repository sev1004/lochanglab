import { CharacterApiResponse } from "@/types/lostark-api";
import { mapEquipment, type EquipmentProfile } from "@/domain/character/equipment-parser";
import {
  mapArkGrid,
  mapArkPassive,
  mapGems,
  type ArkGridProfile,
  type ArkPassiveProfile,
  type GemProfile,
} from "@/domain/character/character-systems-parser";

export type CharacterProfile = {
  name: string;
  server: string;
  className: string;
  engraving: string;
  level: string;
  characterImage: string | null;
  stats: [string, string][];
  equipment: EquipmentProfile[];
  engravings: string[];
  skills: NonNullable<CharacterApiResponse["skills"]>;
  gems: GemProfile[];
  arkPassive: ArkPassiveProfile;
  arkGrid: ArkGridProfile;
  raw: CharacterApiResponse;
};

export function mapCharacterResponse(data: CharacterApiResponse): CharacterProfile {
  const profile = data.profile ?? {};
  const stats = (profile.Stats ?? []).map((stat) => [stat.Type ?? "알 수 없음", stat.Value ?? "-"] as [string, string]);
  const engravingItems = data.engravings?.Engravings ?? data.engravings?.ArkPassiveEffects ?? [];
  return {
    name: profile.CharacterName ?? "이름 없음",
    server: profile.ServerName ?? "서버 미상",
    className: profile.CharacterClassName ?? "직업 미상",
    engraving: engravingItems[0]?.Name ?? "직업 각인 미상",
    level: profile.ItemAvgLevel ?? profile.ItemMaxLevel ?? "-",
    characterImage: profile.CharacterImage ?? null,
    stats,
    equipment: mapEquipment(data.equipment ?? []),
    engravings: engravingItems.map((item) => item.Name ?? "이름 없음"),
    skills: data.skills ?? [],
    gems: mapGems(data.gems),
    arkPassive: mapArkPassive(data.arkPassive),
    arkGrid: mapArkGrid(data.arkGrid),
    raw: data,
  };
}
