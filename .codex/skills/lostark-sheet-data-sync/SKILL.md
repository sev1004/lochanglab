---
name: lostark-sheet-data-sync
description: Sync and validate the Glaivier skill, motion, and tripod calculation data from the project Google Sheet into the static simulator catalog.
---

# Lost Ark sheet data sync

Use this skill when the source spreadsheet has been updated and the simulator's generated skill data must be refreshed.

## Source of truth

- Spreadsheet ID: `1nYoi4fKBucaiVYeYRDS-v0w9rmkpwVeIWFsg4XiQODs`
- Required tabs: `창술사 스킬 계수`, `창술사 모션 배율`, `창술사 트라이포드 효과`
- Checked-in raw snapshot: `data/source/glavier-skill-sheets.json`
- Generated output: `src/data/generated/glavier-skill-data.ts`

## Procedure

1. Read the required tabs with the Google Sheets connector, including headers and every populated row.
2. Preserve headers exactly and update the raw snapshot. Never hand-edit generated TypeScript.
3. Run `pnpm generate:glavier-data`.
4. Run `pnpm check:glavier-data`, `pnpm typecheck`, and `pnpm test`.
5. Report the snapshot hash, generated data version, and changed files.

## Contract

- `창술사 스킬 계수`: identity, tags, base cooldown, Lv.1–Lv.14 coefficients.
- `창술사 모션 배율`: one Lv.1–Lv.14 row per skill.
- `창술사 트라이포드 효과`: normalized effects. `수치` is a decimal rate; `정량 수치(초)` is seconds.
- Conditional effects remain conditional; only apply them when a caller explicitly opts in.

Stop on missing headers, invalid level rows, missing motion rows, or unknown tripod skill/code references. The browser uses only generated static data, so spreadsheet edits are applied through sync, review, and deployment—never at runtime.
