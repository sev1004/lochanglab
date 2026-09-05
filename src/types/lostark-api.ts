export type LostArkProfile = {
  CharacterImage?: string;
  ServerName?: string;
  CharacterName?: string;
  CharacterLevel?: number;
  CharacterClassName?: string;
  CombatPower?: string | number;
  ItemAvgLevel?: string;
  ItemMaxLevel?: string;
  ExpeditionLevel?: number;
  Title?: string;
  GuildName?: string;
  GuildMemberGrade?: string;
  PvpGradeName?: string;
  TownLevel?: number;
  TownName?: string;
  Stats?: Array<{ Type?: string; Value?: string; Tooltip?: string }>;
};

export type LostArkEquipment = {
  Type?: string;
  Name?: string;
  Icon?: string;
  Grade?: string;
  Tooltip?: string;
};

export type LostArkEngravings = {
  Engravings?: Array<{ Slot?: number; Name?: string; Description?: string; Icon?: string }>;
  ArkPassiveEffects?: Array<{
    Name?: string;
    Description?: string;
    Icon?: string;
    Grade?: string;
    Level?: number;
    AbilityStoneLevel?: number;
  }>;
};

export type LostArkSkill = {
  Name?: string;
  Icon?: string;
  Level?: number;
  Type?: string;
  SkillType?: string;
  Tripods?: Array<{ Tier?: number; Slot?: number; Name?: string; IsSelected?: boolean; Level?: number }>;
  Rune?: { Name?: string; Grade?: string; Icon?: string } | null;
  IsAwakening?: boolean;
  Tooltip?: string;
};

export type LostArkGem = { Name?: string; Icon?: string; Level?: number; Grade?: string; Type?: string; Tooltip?: string };

export type LostArkGems = {
  Gems?: LostArkGem[];
  Effects?: Array<{ Name?: string; Description?: string; Icon?: string; Tooltip?: string }>;
};

export type CharacterApiResponse = {
  profile?: LostArkProfile;
  equipment?: LostArkEquipment[];
  engravings?: LostArkEngravings;
  skills?: LostArkSkill[];
  gems?: LostArkGems | LostArkGem[] | null;
  cards?: unknown;
  avatars?: unknown;
  arkPassive?: unknown;
  arkGrid?: unknown;
};

export type LostArkArmoryResponse = {
  ArmoryProfile?: LostArkProfile | null;
  ArmoryEquipment?: LostArkEquipment[] | null;
  ArmoryAvatars?: unknown;
  ArmorySkills?: LostArkSkill[] | null;
  ArmoryEngraving?: LostArkEngravings | null;
  ArmoryCard?: unknown;
  ArmoryGem?: LostArkGems | null;
  ArkPassive?: unknown;
  ArkGrid?: unknown;
};
