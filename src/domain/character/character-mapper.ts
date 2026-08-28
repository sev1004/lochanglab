import { CharacterApiResponse, LostArkGem } from "@/types/lostark-api";

export type CharacterProfile = {
  name: string;
  server: string;
  className: string;
  engraving: string;
  level: string;
  characterImage: string | null;
  stats: [string, string][];
  equipment: [string, string, string][];
  engravings: string[];
  skills: NonNullable<CharacterApiResponse["skills"]>;
  gems: LostArkGem[];
  raw: CharacterApiResponse;
};

export function mapCharacterResponse(data: CharacterApiResponse): CharacterProfile {
  const profile = data.profile ?? {};
  const stats = (profile.Stats ?? []).map((stat) => [stat.Type ?? "알 수 없음", stat.Value ?? "-"] as [string, string]);
  const engravingItems = data.engravings?.Engravings ?? data.engravings?.ArkPassiveEffects ?? [];
  const gems = Array.isArray(data.gems) ? data.gems : data.gems?.Gems ?? [];
  return {
    name: profile.CharacterName ?? "이름 없음",
    server: profile.ServerName ?? "서버 미상",
    className: profile.CharacterClassName ?? "직업 미상",
    engraving: engravingItems[0]?.Name ?? "직업 각인 미상",
    level: profile.ItemAvgLevel ?? profile.ItemMaxLevel ?? "-",
    characterImage: profile.CharacterImage ?? null,
    stats,
    equipment: (data.equipment ?? []).map((item) => [item.Type ?? item.Name ?? "장비", item.Name ?? "이름 없음", item.Grade ?? ""] as [string, string, string]),
    engravings: engravingItems.map((item) => item.Name ?? "이름 없음"),
    skills: data.skills ?? [],
    gems,
    raw: data,
  };
}
