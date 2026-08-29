import { BRACELET_OPTION_CATALOG } from "@/domain/bracelet/bracelet-catalog";

export const BRACELET_STAT_TYPES = ["없음", "치명", "신속", "특화", "제압", "숙련", "인내", "체력"] as const;
export const BRACELET_PRIMARY_STAT_TYPES = ["힘", "민첩", "지능"] as const;

export const BRACELET_EFFECT_OPTIONS = ["없음", ...BRACELET_OPTION_CATALOG.filter((option) => option.selectable).map((option) => option.label)];
