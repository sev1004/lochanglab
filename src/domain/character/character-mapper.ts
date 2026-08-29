import { CharacterApiResponse } from "@/types/lostark-api";
import { mapEquipment, type EquipmentProfile } from "@/domain/character/equipment-parser";
import { parseCombatStats } from "@/domain/character/combat-stat-parser";
import { engravingIcon } from "@/data/engraving-catalog";
import {
  mapArkGrid,
  mapArkPassive,
  mapAvatars,
  mapGems,
  mapSkills,
  type AvatarProfile,
  type ArkGridProfile,
  type ArkPassiveProfile,
  type GemProfile,
  type SkillProfile,
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
  engravingDetails: EngravingProfile[];
  buildName: string;
  skills: SkillProfile[];
  avatars: AvatarProfile[];
  combat: { attackSpeed: string; moveSpeed: string; criticalChance: string; attackPower: string };
  gems: GemProfile[];
  arkPassive: ArkPassiveProfile;
  arkGrid: ArkGridProfile;
  raw: CharacterApiResponse;
};

export type EngravingProfile = {
  name: string;
  grade: "유물" | "전설";
  level: number;
  abilityStoneLevel: number;
  icon: string | null;
};

export function mapCharacterResponse(data: CharacterApiResponse): CharacterProfile {
  const profile = data.profile ?? {};
  const stats = (profile.Stats ?? []).map((stat) => [stat.Type ?? "알 수 없음", stat.Value ?? "-"] as [string, string]);
  const engravingItems = data.engravings?.ArkPassiveEffects?.length
    ? data.engravings.ArkPassiveEffects
    : data.engravings?.Engravings ?? [];
  const gems = mapGems(data.gems);
  const arkPassive = mapArkPassive(data.arkPassive);
  const arkGrid = mapArkGrid(data.arkGrid);
  const combat = parseCombatStats(profile.Stats ?? []);
  const engravingDetails: EngravingProfile[] = engravingItems.map((item) => {
    const descriptionLevel = item.Description?.match(/(?:Lv\.|레벨)\s*(\d+)/i)?.[1];
    const level = "Level" in item && typeof item.Level === "number" ? item.Level : Number(descriptionLevel ?? 0);
    const grade = "Grade" in item && item.Grade === "전설" ? "전설" : "유물";
    const abilityStoneLevel = "AbilityStoneLevel" in item && typeof item.AbilityStoneLevel === "number" ? item.AbilityStoneLevel : 0;
    const name = item.Name ?? "이름 없음";
    return { name, grade, level: Math.min(4, Math.max(0, level)), abilityStoneLevel: Math.min(4, Math.max(0, abilityStoneLevel)), icon: engravingIcon(name) ?? item.Icon ?? null };
  });
  const identityText = [...arkPassive.enlightenment, ...arkPassive.effects].map((effect) => `${effect.name} ${effect.description ?? ""}`).join(" ");
  const identity = identityText.includes("절제") ? "절제" : identityText.includes("절정") ? "절정" : engravingItems.some((item) => item.Name?.includes("절제")) ? "절제" : engravingItems.some((item) => item.Name?.includes("절정")) ? "절정" : "직업 각인 미상";
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
    engravingDetails,
    buildName: `${identity}${arkGrid.shorthand ? ` ${arkGrid.shorthand}` : ""}`,
    gems,
    skills: mapSkills(data.skills, gems),
    avatars: mapAvatars(data.avatars),
    combat,
    arkPassive,
    arkGrid,
    raw: data,
  };
}
