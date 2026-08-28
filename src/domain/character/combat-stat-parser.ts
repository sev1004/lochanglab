type StatSource = { Type?: string; Value?: string; Tooltip?: string };

function tooltipText(value?: string) {
  if (!value) return "";
  let parsed: unknown = value;
  try { parsed = JSON.parse(value) as unknown; } catch { /* HTML 문자열도 지원한다. */ }
  const values: string[] = [];
  function collect(item: unknown) {
    if (typeof item === "string") values.push(item);
    else if (Array.isArray(item)) item.forEach(collect);
    else if (item && typeof item === "object") Object.values(item as Record<string, unknown>).forEach(collect);
  }
  collect(parsed);
  return values.join(" ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCombatStats(stats: StatSource[]) {
  const statText = stats.map((stat) => `${stat.Type ?? ""} ${tooltipText(stat.Tooltip)}`).join(" ");
  const percent = (pattern: RegExp) => {
    const value = statText.match(pattern)?.[1];
    return value ? `${value}%` : "-";
  };
  const speedPercent = (pattern: RegExp) => {
    const value = Number(statText.match(pattern)?.[1] ?? NaN);
    if (!Number.isFinite(value)) return "-";
    return `${(value >= 100 ? value : 100 + value).toFixed(2).replace(/\.00$/, "")}%`;
  };
  return {
    attackSpeed: speedPercent(/공격\s*속도[^\d%]{0,40}(\d+(?:\.\d+)?)\s*%/),
    moveSpeed: speedPercent(/이동\s*속도[^\d%]{0,40}(\d+(?:\.\d+)?)\s*%/),
    criticalChance: percent(/치명타\s*적중률[^\d%]{0,40}(\d+(?:\.\d+)?)\s*%/),
    attackPower: stats.find((stat) => stat.Type === "공격력")?.Value ?? "-",
  };
}
