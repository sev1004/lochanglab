import fs from "node:fs";
const source = fs.readFileSync("C:/Users/sev10/AppData/Local/Temp/order-core.html", "utf8");
const decode = (x) => x.replace(/<[^>]+>/g, "").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const rows = [];
const grades = { 7: "고대", 6: "유물", 5: "전설", 4: "영웅" };
for (const m of source.matchAll(/<tr data-item-grade=([^>]+)>([\s\S]*?)<\/tr>/g)) {
  const grade = grades[m[1]]; if (!["고대", "유물"].includes(grade)) continue;
  const block = m[2], nameMatch = block.match(/class="name"[^>]*>([^<]+)</); if (!nameMatch) continue;
  const name = decode(nameMatch[1]), core = name.match(/^질서의 (해|달|별) 코어 : (.+)$/); if (!core) continue;
  const optionMatch = block.match(/<p class="layersubtitle coretitle">코어 옵션<\/p><p class="itemdesc">([\s\S]*?)<\/p>/); if (!optionMatch) continue;
  for (const part of decode(optionMatch[1]).split(/(?=\[\d+P\])/).filter((x) => /^\[\d+P\]/.test(x))) {
    const point = part.match(/^\[(\d+)P\]\s*(.*)$/); if (!point) continue;
    const originalEffect = point[2], percent = originalEffect.match(/([\d]+(?:\.[\d]+)?)%/);
    let effect = null;
    if (/무기 공격력/.test(originalEffect)) effect = "weaponAttack";
    else if (/공격력/.test(originalEffect)) effect = "attackPower";
    else if (/치명타 적중률/.test(originalEffect)) effect = "critRate";
    else if (/치명타 피해/.test(originalEffect)) effect = "critDamage";
    else if (/이동 속도/.test(originalEffect)) effect = "movementSpeed";
    else if (/공격 속도/.test(originalEffect)) effect = "attackSpeed";
    else if (/재사용 대기시간/.test(originalEffect)) effect = "cooldown";
    else if (/피해/.test(originalEffect)) effect = "damageToEnemy";
    rows.push({ grade, area: `질서의 ${core[1]}`, coreName: core[2], point: Number(point[1]), effect, operation: percent ? "rate_add" : null, value: percent ? Number(percent[1]) : null, originalEffect });
  }
}
process.stdout.write(JSON.stringify(rows));
