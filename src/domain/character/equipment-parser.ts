import type { LostArkEquipment } from "@/types/lostark-api";

export type EquipmentCategory = "gear" | "accessory";

export type EquipmentProfile = {
  id: string;
  slot: string;
  category: EquipmentCategory;
  name: string;
  icon: string | null;
  grade: string;
  simulationGrade: "T4 유물" | "T4 고대" | "T4 전율" | "영웅" | "전설" | "유물" | "고대";
  tier: number | null;
  quality: number | null;
  itemLevel: string | null;
  enhancement: number | null;
  advancedHoning: number | null;
  baseStats: string[];
  options: string[];
};

const GEAR_SLOTS = new Set(["투구", "어깨", "상의", "하의", "장갑", "무기", "완갑"]);
const ACCESSORY_SLOTS = new Set(["목걸이", "귀걸이", "반지", "팔찌", "어빌리티 스톤"]);

const SLOT_ORDER = [
  "투구",
  "어깨",
  "상의",
  "하의",
  "장갑",
  "무기",
  "완갑",
  "목걸이",
  "귀걸이",
  "반지",
  "팔찌",
  "어빌리티 스톤",
];

const OPTION_KEYWORDS = [
  "추가 피해",
  "적에게 주는 피해",
  "무기 공격력",
  "공격력",
  "치명타 적중률",
  "치명타 피해",
  "낙인력",
  "아군 공격력",
  "아군 피해량",
  "아이덴티티",
  "세레나데",
  "신앙",
  "조화",
  "최대 생명력",
  "최대 마나",
  "전투 자원",
  "상태이상 공격 지속시간",
  "치명",
  "특화",
  "제압",
  "신속",
  "인내",
  "숙련",
  "순환",
  "열정",
  "냉정",
  "쐐기",
  "망치",
  "습격",
  "정밀",
  "우월",
  "기습",
  "결투",
  "돌진",
  "약점 노출",
  "비수",
  "응원",
  "깨달음",
  "도약",
  "수확",
  "반격",
  "오뚝이",
  "긴급수혈",
  "강타",
  "회생",
  "투자",
  "타격",
  "속공",
  "마나회수",
  "멸시",
  "상처악화",
  "공이속",
  "치적",
  "치피",
  "적주피",
  "추피",
  "무공",
  "백어택",
  "헤드어택",
  "타대",
  "방깎",
  "보호 대상 피해량",
  "악마",
  "무력화",
  "재사용 대기시간",
];

type TooltipData = {
  lines: string[];
  quality: number | null;
};

function decodeHtml(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .trim();
}

function parseTooltip(tooltip?: string): TooltipData {
  if (!tooltip) return { lines: [], quality: null };

  let parsed: unknown = tooltip;
  try {
    parsed = JSON.parse(tooltip) as unknown;
  } catch {
    // 일부 구형 데이터는 JSON이 아닌 HTML 문자열로 전달된다.
  }

  const textValues: string[] = [];
  let quality: number | null = null;

  function visit(value: unknown, key = "") {
    if (typeof value === "string") {
      textValues.push(value);
      return;
    }
    if (typeof value === "number") {
      if (key.toLocaleLowerCase() === "qualityvalue" && value >= 0 && value <= 100) quality = value;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => visit(childValue, childKey));
    }
  }

  visit(parsed);
  const lines = textValues
    .flatMap((value) => decodeHtml(value).split("\n"))
    .map((line) => line.replace(/^[·ㆍ◆◇▶▷-]\s*/, "").trim())
    .filter(Boolean)
    .filter((line, index, values) => values.indexOf(line) === index);

  if (quality === null) {
    const qualityMatch = lines.join(" ").match(/품질\s*(\d{1,3})/);
    if (qualityMatch) quality = Number(qualityMatch[1]);
  }

  return { lines, quality };
}

function firstMatch(lines: string[], pattern: RegExp) {
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getAccessoryOptions(lines: string[], slot: string) {
  const effectOptions = lines
    .filter((line) => line.length <= 100)
    .filter((line) => !/아이템\s*레벨|품질|내구도|거래 가능|귀속|기본 효과|연마 효과/.test(line))
    .filter((line) => OPTION_KEYWORDS.some((keyword) => line.includes(keyword)))
    .filter((line) => /[+\-]?\d|상$|중$|하$/.test(line))
    .filter((line, index, values) => values.indexOf(line) === index);

  if (slot !== "어빌리티 스톤") return effectOptions.slice(0, 8);

  const engravingOptions = lines.filter((line) =>
    /Lv\.\s*\d+$|활성도.*[+\-]?\d+$|^[가-힣\s]+\s[+\-]\d+$/.test(line),
  );
  return [...effectOptions, ...engravingOptions]
    .filter((line, index, values) => values.indexOf(line) === index)
    .slice(0, 8);
}

function mapEquipmentItem(item: LostArkEquipment, index: number): EquipmentProfile | null {
  const slot = item.Type?.trim() ?? "";
  const category = GEAR_SLOTS.has(slot) ? "gear" : ACCESSORY_SLOTS.has(slot) ? "accessory" : null;
  if (!category) return null;

  const tooltip = parseTooltip(item.Tooltip);
  const itemLevel = firstMatch(tooltip.lines, /아이템\s*레벨\s*([\d,.]+)/);
  const tierText = firstMatch(tooltip.lines, /(?:아이템\s*)?티어\s*(\d)/) ?? firstMatch(tooltip.lines, /(\d)\s*티어/);
  const enhancementText = item.Name?.match(/^\+(\d+)/)?.[1] ?? null;
  const advancedHoningText =
    firstMatch(tooltip.lines, /상급\s*재련(?:\s*단계)?\s*(\d+)/) ??
    firstMatch(tooltip.lines.filter((line) => line.includes("상급 재련")), /(\d+)\s*단계/);
  const baseStats = tooltip.lines
    .filter((line) => /^(힘|민첩|지능|체력)\s*\+?[\d,]+$/.test(line))
    .filter((line, lineIndex, values) => values.indexOf(line) === lineIndex);
  const simulationGrade = slot === "완갑"
    ? item.Grade === "영웅" || item.Grade === "전설" || item.Grade === "유물" || item.Grade === "고대" ? item.Grade : "유물"
    : item.Name?.includes("전율") ? "T4 전율" : item.Grade === "고대" ? "T4 고대" : "T4 유물";

  return {
    id: `${slot}-${index}`,
    slot,
    category,
    name: item.Name ?? "이름 없음",
    icon: item.Icon ?? null,
    grade: item.Grade ?? "등급 미상",
    simulationGrade,
    tier: tierText ? Number(tierText) : null,
    quality: tooltip.quality,
    itemLevel,
    enhancement: enhancementText ? Number(enhancementText) : null,
    advancedHoning: advancedHoningText ? Number(advancedHoningText) : null,
    baseStats,
    options: category === "accessory" ? getAccessoryOptions(tooltip.lines, slot) : [],
  };
}

export function mapEquipment(items: LostArkEquipment[]) {
  return items
    .map(mapEquipmentItem)
    .filter((item): item is EquipmentProfile => item !== null)
    .sort((left, right) => SLOT_ORDER.indexOf(left.slot) - SLOT_ORDER.indexOf(right.slot));
}
