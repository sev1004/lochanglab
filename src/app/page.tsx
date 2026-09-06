"use client";

import packageJson from "../../package.json";
import {
  type ChangeEvent,
  FormEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  mapCharacterResponse,
  type CharacterProfile,
  type EngravingProfile,
} from "@/domain/character/character-mapper";
import type { EquipmentProfile } from "@/domain/character/equipment-parser";
import {
  GLAVIER_ORDER_CORE_OPTIONS,
  type ArkEffectProfile,
  type ArkGridCoreProfile,
  type GemProfile,
  type SkillProfile,
} from "@/domain/character/character-systems-parser";
import { loadLatestCharacter, saveCharacter } from "@/lib/character-storage";
import { fetchCharacter, LostArkApiError } from "@/lib/lostark-api/client";
import { ENGRAVING_NAMES, engravingIcon } from "@/data/engraving-catalog";
import {
  BRACELET_EFFECT_OPTIONS,
  BRACELET_PRIMARY_STAT_TYPES,
  BRACELET_STAT_TYPES,
} from "@/data/bracelet-options";
import {
  EVOLUTION_T1_MAX_OPTION_LEVEL,
  EVOLUTION_T1_MAX_TOTAL_LEVEL,
  EVOLUTION_T1_OPTIONS,
  EVOLUTION_T1_STAT_PER_LEVEL,
  EVOLUTION_TIER_CATALOG,
  EVOLUTION_TIER_RULES,
  type EvolutionT1OptionName,
  type EvolutionTier,
} from "@/data/ark-passive-evolution";
import {
  findBraceletOption,
  mergeBraceletOptionTexts,
} from "@/domain/bracelet/bracelet-catalog";
import { arkGridGemPercent } from "@/data/ark-grid-gem-values";
import { resolveArkGridCommonCoreEffects } from "@/data/ark-grid-common-core";
import {
  findArkGridOrderCoreDefinition,
  type GlavierClassEngraving,
} from "@/data/ark-grid-order-core-catalog";
import { resolveArkGridOrderSkillEffects } from "@/data/ark-grid-order-skill-effects";
import { GLAVIER_SKILL_TRIPODS } from "@/data/glavier-skill-tripods";
import { GLAVIER_SKILL_TRIPOD_DETAILS } from "@/data/glavier-skill-tripod-details";
import {
  calculateSingleSkillDamage,
  DEFAULT_TARGET_DEFENSE,
  type SingleSkillCalculationResult,
} from "@/domain/combat/combat-engine";
import { GLAVIER_SKILL_BY_NAME } from "@/data/generated/glavier-skill-data";
import {
  applyCooldownReductionRates,
  getGlavierSkill,
  resolveGlavierSkillCooldown,
} from "@/domain/skill/glavier-skill-catalog";
import { createInternalGearSnapshot } from "@/domain/combat/internal-gear-snapshot";
import {
  createAdditionalDamageSnapshot,
  createSpecificTypeDamageSnapshot,
  createCardAttributeDamageSnapshot,
  createBackAttackDamageSnapshot,
  createConditionalSkillDamageSnapshot,
  createEngravingOutgoingDamageSnapshot,
  createEnemyDamageSnapshot,
  FOCUS_SKILL_DAMAGE_PER_SPECIALIZATION_PERCENT,
  FLURRY_SKILL_DAMAGE_MULTIPLIER,
  createBaseAttackPowerSnapshot,
  createCombatAttributeSnapshots,
  createCurrentCombatAttributeSnapshots,
  createCombatStatSnapshot,
  createCriticalDamageSnapshot,
  createCriticalOutgoingSnapshot,
  createCriticalRateOptionSnapshot,
  createCriticalStatSnapshot,
  createFinalAttackPowerSnapshot,
  createPureAttackPowerSnapshot,
  createWeaponAttackSnapshot,
} from "@/domain/combat/combat-stat-snapshot";
import { enlightenmentWeaponAttackRate } from "@/data/ark-passive-combat-effects";
import {
  baseEvolutionDamageRate,
  evolutionDamageRate,
} from "@/domain/combat/t5-evolution";
import melhaGemIcon from "@/img/10level_a.png";
import hongyeomGemIcon from "@/img/10level_c.png";
import pcBuffIcon from "@/img/pcbuff.png";
import blessingBuffIcon from "@/img/에아달린축복buff.png";
import wineBuffIcon from "@/img/베르닐와인buff.png";
import azenaBuffIcon from "@/img/Azenabuff.png";
import vulnerableAttributeBuffIcon from "@/img/취약속성buff.png";
import usageApiImage from "@/img/usage-guide/01-api.png";
import usageSearchImage from "@/img/usage-guide/02-search.png";
import usageEquipmentImage from "@/img/usage-guide/03-equipment.png";
import usageDopingImage from "@/img/usage-guide/04-doping.png";
import usageCycleImage from "@/img/usage-guide/05-cycle.png";
import usageOcrImage from "@/img/usage-guide/06-ocr.png";
import usageSkillCycleImage from "@/img/usage-guide/06-skill-cycle.png";
import usageComparisonImage from "@/img/usage-guide/06-comparison.png";
import engravingValues from "@/data/engraving-outgoing-damage.json";
import enlightenmentSkillEffects from "@/data/enlightenment-skill-effects.json";

const appVersion = packageJson.version;

function formatDamageInEok(value: number, digits = 2) {
  return `${(value / 100_000_000).toFixed(digits)}억`;
}

async function preprocessDpsScreenshot(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const cropTop = Math.floor(bitmap.height * 0.2);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * 2;
  canvas.height = (bitmap.height - cropTop) * 2;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("전분 이미지를 처리할 수 없습니다.");
  }
  context.filter = "grayscale(1) contrast(175%)";
  context.drawImage(
    bitmap,
    0,
    cropTop,
    bitmap.width,
    bitmap.height - cropTop,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("전분 이미지 변환에 실패했습니다."))),
      "image/png",
    );
  });
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("이미지 변환에 실패했습니다."))),
      "image/png",
    );
  });
}

function imageSignature(
  source: CanvasImageSource,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  const size = 24;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const target = canvas.getContext("2d", { willReadFrequently: true });
  if (!target) return [];
  target.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    size,
    size,
  );
  const pixels = target.getImageData(0, 0, size, size).data;
  const channelAverages = [0, 1, 2].map(
    (channel) =>
      Array.from({ length: size * size }, (_, index) => pixels[index * 4 + channel])
        .reduce((total, value) => total + value, 0) /
      (size * size),
  );
  return Array.from({ length: size * size }, (_, index) => {
    const offset = index * 4;
    return [
      pixels[offset] - channelAverages[0],
      pixels[offset + 1] - channelAverages[1],
      pixels[offset + 2] - channelAverages[2],
    ];
  }).flat();
}

function signatureDistance(left: readonly number[], right: readonly number[]) {
  if (!left.length || left.length !== right.length) return Number.POSITIVE_INFINITY;
  return left.reduce((total, value, index) => total + Math.abs(value - right[index]), 0) / left.length;
}

function parseDpsScreenshotPercentage(text: string, allowDash = false) {
  const value = text.match(/\d{1,3}(?:[.,]\d{1,2})?/)?.[0];
  if (value) {
    const numeric = Number(value.replace(",", "."));
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100
      ? numeric
      : null;
  }
  return allowDash && /[-—–]/.test(text) ? 0 : null;
}

async function extractDpsScreenshotRatiosByIcon(
  file: File,
  skills: readonly SkillProfile[],
): Promise<DpsScreenshotSkillRatio[]> {
  const eligibleSkills = [
    ...new Map(
      skills
        .filter((skill) => Boolean(skill.icon))
        .map((skill) => [skill.name, skill]),
    ).values(),
  ];
  if (!eligibleSkills.length) return [];
  const screenshot = await createImageBitmap(file);
  const screenshotCanvas = document.createElement("canvas");
  screenshotCanvas.width = screenshot.width;
  screenshotCanvas.height = screenshot.height;
  const screenshotContext = screenshotCanvas.getContext("2d", { willReadFrequently: true });
  if (!screenshotContext) {
    screenshot.close();
    return [];
  }
  screenshotContext.drawImage(screenshot, 0, 0);

  try {
    const templates = await Promise.all(
      eligibleSkills.map(async (skill) => {
        const response = await fetch(skill.icon!);
        if (!response.ok) throw new Error("스킬 아이콘을 가져오지 못했습니다.");
        const icon = await createImageBitmap(await response.blob());
        const inset = Math.max(1, Math.round(Math.min(icon.width, icon.height) * 0.08));
        const signature = imageSignature(
          icon,
          inset,
          inset,
          icon.width - inset * 2,
          icon.height - inset * 2,
        );
        icon.close();
        return { skill, signature };
      }),
    );
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng");
    try {
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789.,%-—–",
        tessedit_pageseg_mode: PSM.SINGLE_WORD,
      });
      const iconLeft = Math.round(screenshot.width * 0.011);
      const iconSize = Math.max(24, Math.round(screenshot.width * 0.027));
      const baseInset = Math.max(2, Math.round(iconSize * 0.08));
      let bestGeometry = {
        firstRowTop: Math.round(screenshot.height * 0.258),
        rowHeight: Math.max(28, Math.round(screenshot.height * 0.0542)),
        score: Number.NEGATIVE_INFINITY,
      };
      const firstStep = Math.max(2, Math.round(screenshot.height * 0.004));
      const rowHeightStep = Math.max(1, Math.round(screenshot.height * 0.001));
      for (
        let candidateFirst = Math.round(screenshot.height * 0.23);
        candidateFirst <= Math.round(screenshot.height * 0.29);
        candidateFirst += firstStep
      ) {
        for (
          let candidateHeight = Math.max(26, Math.round(screenshot.height * 0.049));
          candidateHeight <= Math.round(screenshot.height * 0.059);
          candidateHeight += rowHeightStep
        ) {
          const rowDistances: number[] = [];
          const rows = Math.min(
            16,
            Math.floor((screenshot.height - candidateFirst) / candidateHeight),
          );
          for (let row = 0; row < rows; row += 1) {
            const signature = imageSignature(
              screenshotCanvas,
              iconLeft + baseInset,
              candidateFirst + row * candidateHeight + baseInset,
              iconSize - baseInset * 2,
              iconSize - baseInset * 2,
            );
            rowDistances.push(
              Math.min(
                ...templates.map((template) =>
                  signatureDistance(signature, template.signature),
                ),
              ),
            );
          }
          const usefulDistances = rowDistances
            .filter((distance) => distance < 58)
            .sort((left, right) => left - right)
            .slice(0, Math.min(eligibleSkills.length, 10));
          const score = usefulDistances.reduce(
            (total, distance) => total + (58 - distance),
            usefulDistances.length * 20,
          );
          if (score > bestGeometry.score) {
            bestGeometry = {
              firstRowTop: candidateFirst,
              rowHeight: candidateHeight,
              score,
            };
          }
        }
      }

      const maximumRows = Math.min(
        16,
        Math.floor(
          (screenshot.height - bestGeometry.firstRowTop) /
            bestGeometry.rowHeight,
        ),
      );
      const pairCandidates: Array<{
        row: number;
        rowTop: number;
        skill: SkillProfile;
        distance: number;
        ambiguity: number;
      }> = [];
      for (let row = 0; row < maximumRows; row += 1) {
        const expectedTop = bestGeometry.firstRowTop + row * bestGeometry.rowHeight;
        const distances = templates.map((template) => {
          let bestDistance = Number.POSITIVE_INFINITY;
          for (const yOffset of [-3, 0, 3]) {
            for (const xOffset of [-0.003, 0, 0.003]) {
              for (const scale of [0.94, 1, 1.06]) {
                const candidateSize = Math.round(iconSize * scale);
                const inset = Math.max(2, Math.round(candidateSize * 0.08));
                const signature = imageSignature(
                  screenshotCanvas,
                  iconLeft + Math.round(screenshot.width * xOffset) + inset,
                  expectedTop + yOffset + inset,
                  candidateSize - inset * 2,
                  candidateSize - inset * 2,
                );
                bestDistance = Math.min(
                  bestDistance,
                  signatureDistance(signature, template.signature),
                );
              }
            }
          }
          return { ...template, distance: bestDistance };
        });
        const sortedDistances = distances.sort(
          (left, right) => left.distance - right.distance,
        );
        sortedDistances.forEach((candidate) => {
          pairCandidates.push({
            row,
            rowTop: expectedTop,
            skill: candidate.skill,
            distance: candidate.distance,
            ambiguity:
              (sortedDistances.find(
                (other) => other.skill.name !== candidate.skill.name,
              )?.distance ?? Number.POSITIVE_INFINITY) - candidate.distance,
          });
        });
      }

      const usedRows = new Set<number>();
      const matchedSkillNames = new Set<string>();
      const matches = pairCandidates
        .sort((left, right) => left.distance - right.distance)
        .filter((candidate) => {
          if (candidate.distance > 52) return false;
          if (candidate.distance > 28 && candidate.ambiguity < 2.5) return false;
          if (
            usedRows.has(candidate.row) ||
            matchedSkillNames.has(candidate.skill.name)
          ) {
            return false;
          }
          usedRows.add(candidate.row);
          matchedSkillNames.add(candidate.skill.name);
          return true;
        })
        .sort((left, right) => left.row - right.row);

      const screenshotPixels = screenshotContext.getImageData(
        0,
        0,
        screenshot.width,
        screenshot.height,
      ).data;
      const luminanceAt = (x: number, y: number) => {
        const offset = (y * screenshot.width + x) * 4;
        return (
          screenshotPixels[offset] * 0.299 +
          screenshotPixels[offset + 1] * 0.587 +
          screenshotPixels[offset + 2] * 0.114
        );
      };
      const refineBoundary = (expectedRatio: number) => {
        const expected = Math.round(screenshot.width * expectedRatio);
        const radius = Math.max(5, Math.round(screenshot.width * 0.018));
        let best = expected;
        let bestScore = Number.NEGATIVE_INFINITY;
        for (let x = expected - radius; x <= expected + radius; x += 1) {
          if (x < 3 || x >= screenshot.width - 3) continue;
          let score = 0;
          matches.forEach((match) => {
            const bottom = Math.min(
              screenshot.height - 1,
              match.rowTop + bestGeometry.rowHeight - 3,
            );
            for (let y = match.rowTop + 3; y <= bottom; y += 3) {
              const center = luminanceAt(x, y);
              score += Math.max(
                Math.abs(center - luminanceAt(x - 2, y)),
                Math.abs(center - luminanceAt(x + 2, y)),
              );
            }
          });
          if (score > bestScore) {
            best = x;
            bestScore = score;
          }
        }
        return best;
      };
      const boundaries = [0.178, 0.293, 0.409, 0.525, 0.641].map(
        refineBoundary,
      );
      const cellPadding = Math.max(4, Math.round(screenshot.width * 0.004));

      const createRatioCell = async (
        left: number,
        right: number,
        rowTop: number,
        binary: boolean,
      ) => {
          const cellCanvas = document.createElement("canvas");
          const sourceWidth = Math.max(20, right - left);
          const sourceHeight = Math.max(20, bestGeometry.rowHeight - 8);
          cellCanvas.width = sourceWidth * 4;
          cellCanvas.height = sourceHeight * 4;
          const cellContext = cellCanvas.getContext("2d", {
            willReadFrequently: binary,
          });
          if (!cellContext) return null;
          cellContext.filter = binary
            ? "grayscale(1)"
            : "grayscale(1) contrast(210%)";
          cellContext.drawImage(
            screenshotCanvas,
            left,
            rowTop + 4,
            sourceWidth,
            sourceHeight,
            0,
            0,
            cellCanvas.width,
            cellCanvas.height,
          );
          if (binary) {
            const image = cellContext.getImageData(
              0,
              0,
              cellCanvas.width,
              cellCanvas.height,
            );
            const grayscale = Array.from(
              { length: image.data.length / 4 },
              (_, index) => image.data[index * 4],
            );
            const average =
              grayscale.reduce((total, value) => total + value, 0) /
              grayscale.length;
            const threshold = Math.min(190, Math.max(95, average + 28));
            grayscale.forEach((value, index) => {
              const output = value >= threshold ? 0 : 255;
              image.data[index * 4] = output;
              image.data[index * 4 + 1] = output;
              image.data[index * 4 + 2] = output;
              image.data[index * 4 + 3] = 255;
            });
            cellContext.putImageData(image, 0, 0);
          }
          return canvasToPng(cellCanvas);
      };
      const recognizePercentage = async (
        left: number,
        right: number,
        rowTop: number,
        allowDash = false,
      ) => {
        let best: { value: number; confidence: number } | null = null;
        for (const binary of [false, true]) {
          const cell = await createRatioCell(left, right, rowTop, binary);
          if (!cell) continue;
          const result = await worker.recognize(cell);
          const value = parseDpsScreenshotPercentage(
            result.data.text,
            allowDash,
          );
          if (value !== null && (!best || result.data.confidence > best.confidence)) {
            best = { value, confidence: result.data.confidence };
          }
          if (best && best.confidence >= 72) break;
        }
        return best?.value ?? null;
      };

      const ratios: DpsScreenshotSkillRatio[] = [];
      for (const match of matches) {
        const backAttackRate = await recognizePercentage(
          boundaries[2] + cellPadding,
          boundaries[3] - cellPadding,
          match.rowTop,
          true,
        );
        const cooldownRate = await recognizePercentage(
          boundaries[3] + cellPadding,
          boundaries[4] - cellPadding,
          match.rowTop,
        );
        if (cooldownRate === null || backAttackRate === null) continue;
        ratios.push({
          skillName: match.skill.name,
          cooldownRate,
          backAttackRate,
        });
      }
      return ratios;
    } finally {
      await worker.terminate();
    }
  } catch {
    return [];
  } finally {
    screenshot.close();
  }
}

type DpsScreenshotSkillRatio = {
  skillName: string;
  cooldownRate: number;
  backAttackRate: number;
};

function parseDpsScreenshotSkillRatios(
  recognizedText: string,
  skillNames: readonly string[],
): DpsScreenshotSkillRatio[] {
  const percentagePattern = /(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
  const extractRatios = (rowText: string) => {
    const matches = [...rowText.matchAll(percentagePattern)];
    const values = matches
      .map((match) => Number(match[1].replace(",", ".")))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
    if (!values.length) return null;
    const firstMatch = matches[0];
    const secondMatch = matches[1];
    const beforeFirstPercentage = rowText.slice(0, firstMatch.index ?? 0);
    const backAttackMissing = /[-—–]/.test(beforeFirstPercentage);
    if (!backAttackMissing && values.length < 2) return null;
    return {
      cooldownRate: backAttackMissing ? values[0] : values[1],
      backAttackRate: backAttackMissing ? 0 : values[0],
    };
  };
  const namePattern = (skillName: string) =>
    new RegExp(skillName.split("").join("\\s*"), "g");
  const skillLocations = skillNames.flatMap((skillName) =>
    [...recognizedText.matchAll(namePattern(skillName))].map((match) => ({
      skillName,
      index: match.index ?? -1,
    })),
  );

  const exactMatches = skillNames.flatMap((skillName) => {
    const currentLocation = skillLocations.find(
      (location) => location.skillName === skillName,
    );
    if (!currentLocation || currentLocation.index < 0) return [];
    const nextLocation = skillLocations
      .filter((location) => location.index > currentLocation.index)
      .sort((left, right) => left.index - right.index)[0];
    const rowText = recognizedText.slice(
      currentLocation.index + skillName.length,
      nextLocation?.index ?? currentLocation.index + 320,
    );
    const ratios = extractRatios(rowText);
    if (!ratios) return [];
    return [
      {
        skillName,
        ...ratios,
      },
    ];
  });
  const matchedNames = new Set(exactMatches.map((ratio) => ratio.skillName));
  const distance = (left: string, right: string) => {
    const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      let diagonal = rows[0];
      rows[0] = rightIndex;
      for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const previous = rows[leftIndex];
        rows[leftIndex] = Math.min(
          rows[leftIndex] + 1,
          rows[leftIndex - 1] + 1,
          diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
        );
        diagonal = previous;
      }
    }
    return rows[left.length];
  };
  const fuzzyMatches = recognizedText.split(/\r?\n/).flatMap((line) => {
    const ratios = extractRatios(line);
    const candidate = line
      .split(/\d/)[0]
      .replace(/[^가-힣]/g, "");
    if (candidate.length < 2 || !ratios) return [];
    const closest = skillNames
      .filter((skillName) => !matchedNames.has(skillName))
      .map((skillName) => ({ skillName, distance: distance(candidate, skillName) }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (!closest || closest.distance > Math.max(1, Math.floor(closest.skillName.length * 0.35))) {
      return [];
    }
    return [{
      skillName: closest.skillName,
      ...ratios,
    }];
  });
  const ratiosBySkillName = new Map(
    fuzzyMatches.map((ratio) => [ratio.skillName, ratio]),
  );
  exactMatches.forEach((ratio) => ratiosBySkillName.set(ratio.skillName, ratio));
  return [...ratiosBySkillName.values()];
}

type MainMenu = "simulation" | "api" | "notice" | "guide";
type SimulationTab = "기본 장비" | "스킬 & 전투 사이클";
type CycleEntry = {
  id: string;
  skillName: string;
  azureDragon: boolean;
  yeongaSimGong: boolean;
};
type CyclePreset = {
  id: string;
  label: string;
  entries: readonly Pick<CycleEntry, "skillName" | "azureDragon" | "yeongaSimGong">[];
  guidanceSeconds?: number;
};
type CycleDurationMode = "guideline" | "manual";
type CycleSkillRatioSettings = Record<
  string,
  {
    backAttackRate: string;
    cooldownRate: string;
  }
>;
type SavedSettingComparisonSummary = {
  classLabel: string;
  coreLabel: string | null;
  expectedDps: number | null;
  cycleSeconds: number;
  skills: Array<{
    skillName: string;
    damageShare: number;
    averageDamage: number;
    usesPerMinute: number;
  }>;
  finalAttackPower: number;
  baseCriticalRate: number;
  attackSpeedPercent: number;
  moveSpeedPercent: number;
  criticalDamagePercent: number;
  braceletEfficiency: number | null;
  averageBackAttackRate: number;
  averageCooldownRate: number;
};
type SavedSettingSnapshot = {
  character: CharacterProfile;
  gems: GemProfile[];
  stoneEffects: StoneEffect[];
  avatarGrades: Record<string, string>;
  visibleSkillIds: string[];
  cycle: CycleEntry[];
  cyclePresetId: string;
  cycleDurationMode: CycleDurationMode;
  manualCycleSeconds: string;
  cycleSkillRatioSettings: CycleSkillRatioSettings;
  allCycleBackAttack: boolean;
  allCycleCooldown: boolean;
  allCycleBackAttackRate: string;
  allCycleCooldownRate: string;
  supportRageBuff: boolean;
  banquetBuff: boolean;
  blessingFood: boolean;
  wineFood: boolean;
  azenaBuff: boolean;
  vulnerableAttribute: boolean;
  criticalRateSynergyEnabled: boolean;
  criticalRateSynergyValue: string;
  comparisonSummary?: SavedSettingComparisonSummary;
};
type SavedSetting = {
  id: string;
  name: string;
  cycle: string[];
  itemLevel: string;
  attackPower: string;
  savedAt: string;
  snapshot?: SavedSettingSnapshot;
};
type StoneEffect = { engraving: string; level: number };
type BraceletPrimaryStat = (typeof BRACELET_PRIMARY_STAT_TYPES)[number];
type BraceletStat = {
  type: (typeof BRACELET_STAT_TYPES)[number] | BraceletPrimaryStat;
  value: string;
};
type PassiveGroup = "evolution" | "enlightenment" | "leap";

function selectableTripodCountForSkillLevel(level: number) {
  return level <= 3 ? 0 : level <= 6 ? 1 : level <= 9 ? 2 : 3;
}

function activeTripodNamesForSkill(skill: SkillProfile) {
  const limit = selectableTripodCountForSkillLevel(skill.level);
  return Array.from({ length: 3 }, (_, index) =>
    index < limit ? (skill.tripods[index]?.name ?? "없음") : "없음",
  );
}

function glavierClassEngraving(
  character: CharacterProfile,
): GlavierClassEngraving | null {
  const text = [
    character.buildName,
    ...character.arkPassive.enlightenment.map(
      (effect) => `${effect.name} ${effect.description ?? ""}`,
    ),
  ].join(" ");
  if (text.includes("절제")) return "절제";
  if (text.includes("절정")) return "절정";
  return null;
}

function formatApiCombatPower(value: CharacterProfile["apiCombatPower"]) {
  if (value === null) return "API 미제공";
  const numericValue = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(numericValue)
    ? Math.floor(numericValue).toLocaleString()
    : String(value);
}

const normalJeoljeongFirstRound = [
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "반월섬", azureDragon: true, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
  { skillName: "유성강천", azureDragon: false, yeongaSimGong: false },
  { skillName: "적룡필살", azureDragon: false, yeongaSimGong: true },
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: false },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const normalJeoljeongRedDragonRound = [
  ...normalJeoljeongFirstRound.slice(0, 4),
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: true },
  ...normalJeoljeongFirstRound.slice(6),
] as const;
const normalJeoljeongCycleEntries = [
  ...normalJeoljeongFirstRound,
  ...normalJeoljeongRedDragonRound,
  ...normalJeoljeongRedDragonRound,
] as const;
const bluntJeoljeongFirstRound = [
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "유성강천", azureDragon: true, yeongaSimGong: false },
  { skillName: "적룡필살", azureDragon: true, yeongaSimGong: true },
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: false },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const bluntJeoljeongFollowupRound = [
  { skillName: "반월섬", azureDragon: false, yeongaSimGong: false },
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
  { skillName: "유성강천", azureDragon: true, yeongaSimGong: false },
  { skillName: "적룡포", azureDragon: true, yeongaSimGong: true },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const bluntJeoljeongCycleEntries = [
  ...bluntJeoljeongFirstRound,
  ...bluntJeoljeongFollowupRound,
  ...bluntJeoljeongFollowupRound,
  { skillName: "반월섬", azureDragon: false, yeongaSimGong: false },
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
] as const;
const manaJeoljeongFirstRound = bluntJeoljeongFirstRound;
const manaJeoljeongFollowupRound = [
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "반월섬", azureDragon: true, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
  { skillName: "유성강천", azureDragon: false, yeongaSimGong: false },
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: true },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const manaJeoljeongCycleEntries = [
  ...manaJeoljeongFirstRound,
  ...manaJeoljeongFollowupRound,
  ...manaJeoljeongFollowupRound,
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "반월섬", azureDragon: true, yeongaSimGong: false },
  { skillName: "맹룡열파", azureDragon: true, yeongaSimGong: true },
] as const;
const jeoljeong222FirstRound = [
  { skillName: "반월섬", azureDragon: false, yeongaSimGong: false },
  { skillName: "회선창", azureDragon: false, yeongaSimGong: false },
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "유성강천", azureDragon: true, yeongaSimGong: false },
  { skillName: "적룡필살", azureDragon: true, yeongaSimGong: true },
  { skillName: "적룡포", azureDragon: true, yeongaSimGong: false },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const jeoljeong222BlueDragonRound = [
  { skillName: "청룡출수", azureDragon: false, yeongaSimGong: false },
  { skillName: "선풍참혼", azureDragon: false, yeongaSimGong: true },
  { skillName: "유성강천", azureDragon: false, yeongaSimGong: false },
  { skillName: "적룡포", azureDragon: false, yeongaSimGong: true },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const jeoljeong222RedDragonRound = [
  { skillName: "반월섬", azureDragon: false, yeongaSimGong: true },
  { skillName: "회선창", azureDragon: false, yeongaSimGong: false },
  { skillName: "청룡진", azureDragon: false, yeongaSimGong: false },
  { skillName: "유성강천", azureDragon: true, yeongaSimGong: false },
  { skillName: "적룡포", azureDragon: true, yeongaSimGong: true },
  { skillName: "굉열파", azureDragon: false, yeongaSimGong: false },
  { skillName: "사두룡격", azureDragon: false, yeongaSimGong: false },
] as const;
const jeoljeong222CycleEntries = [
  ...jeoljeong222FirstRound,
  ...jeoljeong222BlueDragonRound,
  ...jeoljeong222RedDragonRound,
  ...jeoljeong222BlueDragonRound,
  ...jeoljeong222RedDragonRound,
  ...jeoljeong222BlueDragonRound,
  ...jeoljeong222RedDragonRound,
] as const;

function createCyclePresets(
  classEngraving: GlavierClassEngraving | null,
  shorthand: string | null,
  hasBluntEdge: boolean,
  hasManaFurnace: boolean,
): CyclePreset[] {
  if (classEngraving !== "절정") return [];
  const normalCores = new Set(["113", "111", "122"]);
  const bluntCores = new Set(["333", "323", "322", "331", "332"]);
  if (shorthand === "222") {
    return [
      {
        id: "jeoljeong-222",
        label: "절정 222 기본 사이클 (47개)",
        entries: jeoljeong222CycleEntries,
      },
    ];
  }
  if (hasManaFurnace && shorthand === "333") {
    return [
      {
        id: "jeoljeong-mana",
        label: "절정 333 · 마나 용광로 기본 사이클 (23개)",
        entries: manaJeoljeongCycleEntries,
      },
    ];
  }
  if (hasBluntEdge && bluntCores.has(shorthand ?? "")) {
    return [
      {
        id: "jeoljeong-blunt",
        label: "절정 · 뭉툭한 가시 기본 사이클 (23개)",
        entries: bluntJeoljeongCycleEntries,
      },
    ];
  }
  if (!normalCores.has(shorthand ?? "")) return [];
  return [
    {
      id: "jeoljeong-normal",
      label: "절정 기본 사이클 (22개)",
      entries: normalJeoljeongCycleEntries,
    },
  ];
}

function buildUnifiedCombatSnapshot(
  character: CharacterProfile,
  avatarGrades: Record<string, string>,
  stoneEffects: StoneEffect[],
  gems: GemProfile[],
  supportRageBuff: boolean,
  banquetBuff: boolean,
  blessingFood: boolean,
  wineFood: boolean,
  azenaBuff: boolean,
  vulnerableAttribute = false,
  criticalRateSynergyEnabled = false,
  criticalRateSynergyValue = "",
) {
  const classEngraving = glavierClassEngraving(character);
  const attributes = character.initialCombatAttributes
    ? createCurrentCombatAttributeSnapshots({
        baseline: character.initialCombatAttributes,
        evolution: character.arkPassive.evolution,
        braceletStats: combatAttributeInput(character).braceletStats,
      })
    : createCombatAttributeSnapshots(combatAttributeInput(character));
  const speed = buildSpeedSnapshotValues(
    character,
    supportRageBuff,
    banquetBuff,
    blessingFood,
    wineFood,
    attributes["신속"].internalTotal,
  );
  const combatStats = createCombatStatSnapshot({
    equipment: character.equipment,
    avatarGrades,
    azenaBonus: azenaBuff ? 6000 : 0,
  });
  const weaponAttack = createWeaponAttackSnapshot({
    equipment: character.equipment,
    banquetBonus: banquetBuff ? 1600 : 0,
    arkGridCores: character.arkGrid.cores,
    enlightenmentRate: enlightenmentWeaponAttackRate(
      character.arkPassive.points.find((point) => point.name === "깨달음")
        ?.level ?? 0,
    ),
  });
  const pureAttackPower = createPureAttackPowerSnapshot(
    combatStats.total,
    weaponAttack.total,
  );
  const internalGearSnapshot = createInternalGearSnapshot(character.equipment);
  const baseAttackPower = createBaseAttackPowerSnapshot({
    pureAttackPower: pureAttackPower.total,
    gauntletFlat: internalGearSnapshot.baseAttackFlat,
    gauntletRate: internalGearSnapshot.baseAttackRate,
    stoneLevels: stoneEffects.map((effect) => effect.level),
    gems,
  });
  const finalAttackPower = createFinalAttackPowerSnapshot({
    baseAttackPower: baseAttackPower.total,
    equipment: character.equipment,
    arkGridEffects: character.arkGrid.effects,
    arkGridCores: character.arkGrid.cores,
    engravings: character.engravingDetails,
    stoneEffects,
  });
  const criticalStat = createCriticalStatSnapshot({
    apiTotal: attributes["치명"].internalTotal,
    evolutionT1Level: 0,
    braceletStat: 0,
  });
  const criticalRate = createCriticalRateOptionSnapshot({
    criticalStat,
    accessories: character.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ),
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    evolution: character.arkPassive.evolution,
    engravings: character.engravingDetails,
    stoneEffects,
    arkGridCores: character.arkGrid.cores,
    synergyRate:
      criticalRateSynergyEnabled && criticalRateSynergyValue !== ""
        ? Math.min(30, Math.max(0, Number(criticalRateSynergyValue))) / 100
        : 0,
  });
  const criticalDamage = createCriticalDamageSnapshot({
    accessories: character.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ),
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    enlightenment: character.arkPassive.enlightenment,
    engravings: character.engravingDetails,
    stoneEffects,
    arkGridCores: character.arkGrid.cores,
  });
  const criticalOutgoing = createCriticalOutgoingSnapshot({
    evolution: character.arkPassive.evolution,
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    arkGridCores: character.arkGrid.cores,
  });
  const additionalDamage = createAdditionalDamageSnapshot({
    weaponQuality:
      character.equipment.find((item) => item.slot === "무기")?.quality ?? 0,
    accessories: character.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ),
    evolution: character.arkPassive.evolution,
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    arkGridCores: character.arkGrid.cores,
    arkGridEffects: character.arkGrid.effects,
  });
  const specificTypeDamage = createSpecificTypeDamageSnapshot({
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
  });
  const cardAttributeDamage =
    createCardAttributeDamageSnapshot(vulnerableAttribute);
  const backAttackDamage = createBackAttackDamageSnapshot(
    character.engravingDetails,
    character.equipment.find((item) => item.slot === "팔찌"),
  );
  const engravingOutgoingDamage = createEngravingOutgoingDamageSnapshot({
    engravings: character.engravingDetails,
    stoneEffects,
  });
  const conditionalSkillDamage = createConditionalSkillDamageSnapshot({
    engravings: character.engravingDetails,
    stoneEffects,
  });
  const enemyDamage = createEnemyDamageSnapshot({
    engravings: character.engravingDetails,
    stoneEffects,
    accessories: character.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ),
    bracelet: character.equipment.find((item) => item.slot === "팔찌"),
    arkGridCores: character.arkGrid.cores,
    arkGridEffects: character.arkGrid.effects,
    enlightenment: character.arkPassive.enlightenment,
    moveSpeedPercent: speed.moveSpeedPercent,
    classEngraving,
  });
  const braceletDefenseReduction = (
    character.equipment.find((item) => item.slot === "팔찌")?.options ?? []
  ).reduce((total, text) => {
    const definition = findBraceletOption(text);
    return (
      total +
      (definition?.modifiers
        .filter((modifier) => modifier.type === "enemyDefenseReductionPct")
        .reduce((sum, modifier) => sum + modifier.value / 100, 0) ?? 0)
    );
  }, 0);
  return {
    combatAttributes: attributes,
    internalGearSnapshot,
    combatStatsSnapshot: combatStats,
    weaponAttackSnapshot: weaponAttack,
    baseAttackPowerSnapshot: baseAttackPower,
    finalAttackPowerSnapshot: finalAttackPower,
    criticalRateSnapshot: criticalRate,
    criticalDamageSnapshot: criticalDamage,
    criticalOutgoingSnapshot: criticalOutgoing,
    additionalDamageSnapshot: additionalDamage,
    specificTypeDamageSnapshot: specificTypeDamage,
    cardAttributeDamageSnapshot: cardAttributeDamage,
    backAttackDamageSnapshot: backAttackDamage,
    engravingOutgoingDamageSnapshot: engravingOutgoingDamage,
    conditionalSkillDamageSnapshot: conditionalSkillDamage,
    enemyDamageSnapshot: enemyDamage,
    arkGridOrderSkillEffects: resolveArkGridOrderSkillEffects(
      character.arkGrid.cores,
      classEngraving,
    ),
    focusSkillDamageMultiplier:
      1 +
      (attributes["특화"].internalTotal *
        FOCUS_SKILL_DAMAGE_PER_SPECIALIZATION_PERCENT) /
        100,
    flurrySkillDamageMultiplier: FLURRY_SKILL_DAMAGE_MULTIPLIER,
    finalAttackPower: finalAttackPower.total,
    criticalRate: criticalRate.total,
    criticalDamageMultiplier: criticalDamage.total,
    criticalOutgoingMultiplier: criticalOutgoing.total,
    attackSpeedPercent: speed.attackSpeedPercent,
    moveSpeedPercent: speed.moveSpeedPercent,
    targetDefense: DEFAULT_TARGET_DEFENSE,
    defenseReductionRate: braceletDefenseReduction,
    incomingDamageMultiplier:
      1 +
      (character.arkPassive.enlightenment.find(
        (effect) => effect.name === "연가표식",
      )?.level ?? 0) *
        0.012,
    evolution: baseEvolutionDamageRate({
      evolution: character.arkPassive.evolution,
      evolutionRank: character.arkPassive.points.find(
        (point) => point.name === "진화",
      )?.rank,
      attackSpeedPercent: speed.attackSpeedPercent,
      moveSpeedPercent: speed.moveSpeedPercent,
      supportRageBuff,
    }),
  };
}

function buildSpeedSnapshotValues(
  character: CharacterProfile,
  supportRageBuff: boolean,
  banquetBuff: boolean,
  blessingFood: boolean,
  wineFood: boolean,
  internalSwiftness?: number,
) {
  const swiftness = internalSwiftness ?? 0;
  const bracelet = character.equipment.find((item) => item.slot === "팔찌");
  const braceletSpeed = (bracelet?.options ?? []).reduce((total, text) => {
    const definition = findBraceletOption(text);
    return (
      total +
      (definition?.modifiers
        .filter((modifier) => modifier.type === "attackMoveSpeedPct")
        .reduce((sum, modifier) => sum + modifier.value * 6, 0) ?? 0)
    );
  }, 0);
  const speedEngravingLevels = engravingValues.speed["정기 흡수"] as Record<
    string,
    number
  >;
  const speedStoneLevels = engravingValues.speed["정기 흡수Stone"] as Record<
    string,
    number
  >;
  const engravings = character.engravingDetails.reduce((total, engraving) => {
    if (engraving.name !== "정기 흡수") return total;
    return (
      total +
      (engraving.grade === "전설"
        ? speedEngravingLevels.전설4
        : (speedEngravingLevels[`유물${engraving.level}`] ?? 0))
    );
  }, 0);
  const stone = character.engravingDetails.reduce((total, engraving) => {
    if (engraving.name !== "정기 흡수") return total;
    return total + (speedStoneLevels[String(engraving.abilityStoneLevel)] ?? 0);
  }, 0);
  const massIncrease = character.engravingDetails.some(
    (engraving) => engraving.name === "질량 증가",
  )
    ? engravingValues.speed["질량 증가"]
    : 0;
  const destructionTrain =
    (character.arkPassive.evolution.find(
      (effect) => effect.name === "파괴 전차",
    )?.level ?? 0) * 4;
  const classBonus = character.buildName.includes("절정") ? 15 : 0;
  const gridEffects = character.arkGrid.cores.flatMap((core) =>
    resolveArkGridCommonCoreEffects(core),
  );
  const gridAttackSpeed = gridEffects
    .filter((effect) => effect.effect === "attackSpeed")
    .reduce((total, effect) => total + (effect.value ?? 0), 0);
  const gridMoveSpeed = gridEffects
    .filter((effect) => effect.effect === "movementSpeed")
    .reduce((total, effect) => total + (effect.value ?? 0), 0);
  const common =
    swiftness * 0.01716 +
    (supportRageBuff ? 9 : 0) +
    (banquetBuff ? 5 : 0) +
    braceletSpeed +
    engravings +
    stone +
    classBonus;
  const attackFood = blessingFood ? 3 : 0;
  const moveFood = wineFood ? 3 : 0;
  return {
    attackSpeedPercent:
      100 +
      common +
      gridAttackSpeed +
      destructionTrain +
      massIncrease +
      attackFood,
    moveSpeedPercent: 100 + common + gridMoveSpeed + moveFood,
  };
}

const errors: Record<number, string> = {
  401: "API 키가 올바르지 않습니다.",
  403: "API 접근 권한이 없습니다.",
  404: "캐릭터를 찾을 수 없습니다.",
  429: "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.",
};
const simTabs: SimulationTab[] = ["기본 장비", "스킬 & 전투 사이클"];
const siteNotices = [
  {
    version: "v0.1.1",
    date: "2026.09.06",
    title: "전투 분석 및 편의 기능 업데이트",
    items: [
      "전투 분석기 스크린샷에서 스킬 아이콘을 기준으로 스킬을 매칭하고, 백어택 적중률과 쿨타임 비율을 전투 사이클에 반영합니다.",
      "이때 절정 222 연격 세팅은 쿨타임 비율이 적용되지 않습니다. (DPS 계산 방식 개선 건의 받습니다.)",
      "저장한 전체 세팅을 불러오고 현재 세팅과 비교할 수 있는 기능이 추가되었습니다.",
      "스킬별 최대 대미지·평균 대미지·딜지분과 사이클 시간을 확인할 수 있습니다.",
      "자잘한 UI 개선이 진행되었습니다.",
    ],
  },
  {
    version: "v0.1.0",
    date: "2026.09.06",
    title: "서비스 출시일",
    items: [
      "로스트아크 창술사의 장비, 각인, 아크패시브, 보석, 도핑 설정을 바탕으로 전투 스킬 대미지와 예상 DPS를 계산하는 웹 서비스입니다.",
      "캐릭터 API 정보를 불러온 뒤 전투 사이클과 스킬별 조건을 조정해 세팅을 검증할 수 있습니다.",
    ],
  },
];
const sortedSiteNotices = [...siteNotices].sort((left, right) => {
  const versionNumber = (version: string) =>
    version
      .replace(/^v/, "")
      .split(".")
      .map((part) => Number(part) || 0);
  const leftParts = versionNumber(left.version);
  const rightParts = versionNumber(right.version);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
});
const SAVED_SETTINGS_KEY = "glavier-dps-simulator:saved-settings";
const API_KEY_STORAGE_KEY = "glavier-dps-simulator:lostark-api-key";
const gearGrades = ["결단", "전율"] as const;
const esterWeaponGrades = ["참월 : 의"] as const;
const esterWeaponEnhancementLevels = [10, 9, 8] as const;
const armGauntletGrades = ["영웅", "전설", "유물", "고대"] as const;
const enhancementLevels = Array.from({ length: 16 }, (_, index) => 25 - index);
const gauntletEnhancementLevels = Array.from(
  { length: 26 },
  (_, index) => 25 - index,
);
const skillLevels = Array.from({ length: 14 }, (_, index) => index + 1);
const gemLevels = Array.from({ length: 5 }, (_, index) => 10 - index);
const gemTypes = ["겁화", "작열"] as const;
const alwaysVisibleSkills = new Set(["맹룡난무", "적룡필살"]);
const gemIconCdn: Record<string, Record<number, string>> = {
  겁화: {
    10: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_105.png",
    9: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_104.png",
    8: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_103.png",
    7: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_102.png",
    6: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_101.png",
  },
  작열: {
    10: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_115.png",
    9: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_114.png",
    8: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_113.png",
    7: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_112.png",
    6: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_12_111.png",
  },
};
const radiantGemIconCdn: Record<number, string> = {
  10: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_55.png",
  9: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_54.png",
  8: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_53.png",
  7: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_52.png",
  6: "https://cdn-lostark.game.onstove.com/efui_iconatlas/use/use_13_51.png",
};
function gemIconFor(type: string, level: number) {
  return gemIconCdn[type]?.[level] ?? null;
}
function isRadiantGem(gem: GemProfile) {
  return gem.name.includes("광휘");
}
function gemDisplayIcon(
  gem: GemProfile,
  type = gem.type,
  level = gem.level ?? 10,
) {
  if (isRadiantGem(gem)) return radiantGemIconCdn[level] ?? gem.icon;
  if (gem.name.includes("멸화")) return melhaGemIcon.src;
  if (gem.name.includes("홍염")) return hongyeomGemIcon.src;
  return gemIconFor(type, level) ?? gem.icon;
}
function normalizeGem(gem: GemProfile): GemProfile {
  const level = Math.max(6, Math.min(10, gem.level ?? 10));
  const cooldown = /재사용 대기시간|쿨타임/.test(gem.effect ?? "");
  const type =
    gem.type === "작열" ||
    gem.type === "홍염" ||
    (isRadiantGem(gem) && cooldown)
      ? "작열"
      : "겁화";
  const normalized = { ...gem, type, level };
  return { ...normalized, icon: gemDisplayIcon(normalized) };
}
function cooldownGemReductionRate(gems: readonly GemProfile[]) {
  return gems.reduce((highestRate, gem) => {
    // 홍염은 현재 계산 입력으로 받지 않으므로 계산에 포함하지 않는다.
    if (gem.name.includes("홍염")) return highestRate;
    const isCooldownGem =
      gem.type === "작열" ||
      (isRadiantGem(gem) && /재사용 대기시간|쿨타임/.test(gem.effect ?? ""));
    if (!isCooldownGem || gem.level === null) return highestRate;
    const rate = Math.max(0, 0.24 - (10 - gem.level) * 0.02);
    return Math.max(highestRate, rate);
  }, 0);
}
function braceletCooldownIncreaseRate(bracelet: EquipmentProfile | undefined) {
  return (bracelet?.options ?? []).reduce((total, option) => {
    const catalogRate = findBraceletOption(option)?.modifiers
      .filter((modifier) => modifier.type === "skillCooldownIncreasePct")
      .reduce((sum, modifier) => sum + modifier.value / 100, 0);
    if (catalogRate) return total + catalogRate;
    const textRate = Number(option.match(/쿨\s*\+\s*([\d.]+)%/)?.[1] ?? 0);
    return total + textRate / 100;
  }, 0);
}
function commonCooldownReductionRate(source: {
  swiftness: number;
  evolution: readonly ArkEffectProfile[];
  bracelet?: EquipmentProfile;
}) {
  const levelOf = (name: string) =>
    source.evolution.find((effect) => effect.name === name)?.level ?? 0;
  const multiplier = applyCooldownReductionRates(1, [
    source.swiftness * 0.000215,
    (levelOf("끝없는 마나") + levelOf("무한한 마력")) * 0.07,
    levelOf("최적화 훈련") * 0.04,
    levelOf("타이밍 지배") * 0.05,
    -braceletCooldownIncreaseRate(source.bracelet),
  ]);
  return 1 - multiplier;
}
const avatarSlots = ["무기", "머리", "상의", "하의"] as const;
const accessoryOptions = [
  "없음",
  "추가 피해 +0.70%",
  "추가 피해 +1.60%",
  "추가 피해 +2.60%",
  "적에게 주는 피해 +0.55%",
  "적에게 주는 피해 +1.20%",
  "적에게 주는 피해 +2.00%",
  "무기 공격력 +0.80%",
  "무기 공격력 +1.80%",
  "무기 공격력 +3.00%",
  "공격력 +0.40%",
  "공격력 +0.95%",
  "공격력 +1.55%",
  "치명타 적중률 +0.40%",
  "치명타 적중률 +0.95%",
  "치명타 적중률 +1.55%",
  "치명타 피해 +1.10%",
  "치명타 피해 +2.40%",
  "치명타 피해 +4.00%",
  "무기 공격력 +195",
  "무기 공격력 +480",
  "무기 공격력 +960",
  "공격력 +80",
  "공격력 +195",
  "공격력 +390",
];
const passiveCatalog: Record<PassiveGroup, string[]> = {
  evolution: [
    "없음",
    "치명",
    "특화",
    "신속",
    "한계 돌파",
    "최적화 훈련",
    "예리한 감각",
    "끝없는 마나",
    "무한한 마력",
    "음속 돌파",
    "뭉툭한 가시",
    "입식 타격가",
    "마나 용광로",
  ],
  enlightenment: [
    "없음",
    "절정 I",
    "절정 II",
    "절정 III",
    "연가표식",
    "연가심공",
    "치명적인 베기",
    "강력한 찌르기",
    "전환 난무",
    "절제",
    "청룡진",
    "난무 강화",
    "집중 강화",
  ],
  leap: ["없음", "초월적인 힘", "풀려난 힘", "즉각적인 주문", "잠재력 해방"],
};
const enlightenmentEffects: Record<
  string,
  { maxLevel: number; description: string }
> = {
  "절정 I": { maxLevel: 3, description: "공격 속도·이동 속도 +5%/Lv" },
  "절정 II": { maxLevel: 3, description: "난무 스탠스 치명타 피해 +23.33%/Lv" },
  "절정 III": {
    maxLevel: 3,
    description: "집중 스탠스 적에게 주는 피해 +8.33%/Lv",
  },
  연가표식: { maxLevel: 5, description: "연가 표식 대상이 받는 피해 +1.2%/Lv" },
  연가심공: {
    maxLevel: enlightenmentSkillEffects["연가심공"].maxLevel,
    description: `다음 스킬 피해 +${enlightenmentSkillEffects["연가심공"].damagePerLevelPercent}%/Lv`,
  },
  "치명적인 베기": { maxLevel: 5, description: "난무 스킬 치명타 피해 +4%/Lv" },
  "강력한 찌르기": {
    maxLevel: 5,
    description: "집중 스킬 적에게 주는 피해 +1.2%/Lv",
  },
  "전환 난무": {
    maxLevel: 5,
    description: "난무 스킬 피해 +0.7%/Lv · 치명타 적중률 +0.8%/Lv",
  },
};
const leapOptions = [
  {
    name: "풀려난 힘",
    maxLevel: 5,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_02/ark_passive_02_2.png",
    description: "초각성 스킬 피해량 Lv당 3% 증가",
  },
  {
    name: "잠재력 해방",
    maxLevel: 5,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_01/ark_passive_01_10.png",
    description: "초각성 스킬 재사용 대기시간 Lv당 2% 감소",
  },
  {
    name: "즉각적인 주문",
    maxLevel: 5,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_02/ark_passive_02_5.png",
    description: "초각성 스킬 시전 시간 Lv당 4% 증가",
  },
  {
    name: "관통 필살",
    maxLevel: 3,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_11.png",
    description: "해당 스킬 피해량 Lv2부터 10%씩 증가",
  },
  {
    name: "내지르기",
    maxLevel: 5,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_12.png",
    description: "해당 스킬 피해량 Lv당 25% 증가",
  },
  {
    name: "강인한 타격",
    maxLevel: 3,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_9.png",
    description: "초각성 스킬 피해량 Lv당 25% 증가",
  },
  {
    name: "최후의 판단",
    maxLevel: 3,
    icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_10.png",
    description: "초각성 스킬 피해량 Lv당 30% 증가",
  },
] as const;
const gridCoreOptions = [
  ...GLAVIER_ORDER_CORE_OPTIONS.map((options) => ["없음", ...options]),
  [
    "없음",
    "현란한 공격",
    "안정적인 공격",
    "재빠른 공격",
    "신념의 강화",
    "흐르는 마나",
    "불굴의 강화",
  ],
  [
    "없음",
    "불타는 일격",
    "흡수의 일격",
    "부수는 일격",
    "낙인의 흔적",
    "강철의 흔적",
    "치명적인 흔적",
  ],
  ["없음", "공격", "무기", "구원", "생명", "속도", "방어"],
];
const gridPoints = [20, 19, 18, 17, 14, 10];

function errorMessage(error: unknown) {
  if (error instanceof LostArkApiError)
    return (
      errors[error.status] ??
      `로스트아크 API 요청에 실패했습니다. (${error.status})`
    );
  return error instanceof TypeError
    ? "로스트아크 API에 연결하지 못했습니다. 네트워크와 브라우저 설정을 확인해주세요."
    : "캐릭터 조회에 실패했습니다.";
}
function Artwork({
  icon,
  label,
  title,
}: {
  icon: string | null;
  label: string;
  title?: string;
}) {
  return (
    <span
      className={`compact-art${icon ? "" : " compact-art-empty"}`}
      aria-label={title}
      data-tooltip={title}
    >
      {icon ? <img src={icon} alt="" /> : <span>{label}</span>}
    </span>
  );
}
function qualityTone(quality: number | null) {
  return quality === 100
    ? "quality-gold"
    : quality !== null && quality >= 90
      ? "quality-purple"
      : "quality-sky";
}
function baseStatValue(item: EquipmentProfile) {
  return item.baseStats[0]?.match(/[\d,]+/)?.[0]?.replaceAll(",", "") ?? "";
}
function primaryStatFromEquipment(
  items: EquipmentProfile[],
): BraceletPrimaryStat {
  const glove = items.find((item) => item.slot === "장갑");
  const candidates = [
    ...(glove?.baseStats ?? []),
    ...items.flatMap((item) => item.baseStats),
  ];
  const stat = candidates
    .map((line) => line.match(/^(힘|민첩|지능)\s*\+?[\d,]+/)?.[1])
    .find(Boolean);
  return BRACELET_PRIMARY_STAT_TYPES.includes(stat as BraceletPrimaryStat)
    ? (stat as BraceletPrimaryStat)
    : "힘";
}
const ACCESSORY_EXCLUDED_OPTIONS: Record<string, string[]> = {
  목걸이: ["무기 공격력", "공격력", "치명타 적중률", "치명타 피해"],
  귀걸이: ["적에게 주는 피해", "추가 피해", "치명타 적중률", "치명타 피해"],
  반지: ["적에게 주는 피해", "추가 피해", "무기 공격력", "공격력"],
};
function optionChoices(slot: string, current: string, catalog: string[]) {
  const excluded = ACCESSORY_EXCLUDED_OPTIONS[slot] ?? [];
  return [
    ...new Set([
      current,
      ...catalog.filter(
        (option) =>
          !excluded.some(
            (prefix) => option.startsWith(prefix) && option.includes("%"),
          ),
      ),
    ]),
  ];
}
function isArkPassivePointOption(option: string) {
  return /^(진화|깨달음|도약)\s*\+?\s*\d+/.test(option.trim());
}
const gauntletLevelRange: Record<string, number[]> = {
  영웅: Array.from({ length: 11 }, (_, i) => i),
  전설: Array.from({ length: 6 }, (_, i) => i + 10),
  유물: Array.from({ length: 6 }, (_, i) => i + 15),
  고대: Array.from({ length: 6 }, (_, i) => i + 20),
};

function GearEditor({
  item,
  onChange,
}: {
  item: EquipmentProfile;
  onChange: (patch: Partial<EquipmentProfile>) => void;
}) {
  const isArmGauntlet = item.slot === "완갑";
  const isEsterWeapon = item.slot === "무기";
  const grades: string[] = isArmGauntlet
    ? [...armGauntletGrades]
    : isEsterWeapon
      ? [...gearGrades, ...esterWeaponGrades]
      : [...gearGrades];
  const selectableEnhancements = isArmGauntlet
    ? (gauntletLevelRange[item.simulationGrade] ?? gauntletEnhancementLevels)
    : item.simulationGrade === "참월 : 의"
      ? [...esterWeaponEnhancementLevels]
    : enhancementLevels;
  return (
    <article className="gear-editor">
      <div className={`quality-art${isArmGauntlet ? " no-quality" : ""}`}>
        <Artwork icon={item.icon} label="◇" />
        {!isArmGauntlet ? (
          <span className={qualityTone(item.quality)}>
            품질 {item.quality ?? "-"}
          </span>
        ) : null}
      </div>
      <div className={`gear-fields${isArmGauntlet ? " no-quality" : ""}`}>
        <select
          aria-label={`${item.slot} 장비 종류`}
          value={
            isArmGauntlet
              ? armGauntletGrades.includes(
                item.simulationGrade as (typeof armGauntletGrades)[number],
              )
                ? item.simulationGrade
                : "영웅"
              : grades.includes(
                    item.simulationGrade as (typeof gearGrades)[number],
                  )
                ? item.simulationGrade
                : "전율"
          }
          onChange={(event) => {
            const grade = event.target
              .value as EquipmentProfile["simulationGrade"];
            onChange({
              simulationGrade: grade,
              ...(isArmGauntlet
                ? { enhancement: gauntletLevelRange[grade]?.[0] ?? 0 }
                : grade === "참월 : 의"
                  ? { enhancement: 10 }
                : {}),
            });
          }}
        >
          {grades.map((grade) => (
            <option key={grade}>{grade}</option>
          ))}
        </select>
        {!isArmGauntlet ? (
          <label>
            품질
            <input
              aria-label={`${item.slot} 품질`}
              type="number"
              min="0"
              max="100"
              value={item.quality ?? ""}
              onChange={(event) =>
                onChange({
                  quality:
                    event.target.value === ""
                      ? null
                      : Math.max(0, Math.min(100, Number(event.target.value))),
                })
              }
            />
          </label>
        ) : null}
        <select
          aria-label={`${item.slot} 강화`}
          value={item.enhancement ?? 10}
          onChange={(event) =>
            onChange({ enhancement: Number(event.target.value) })
          }
        >
          {selectableEnhancements.map((level) => (
            <option value={level} key={level}>
              +{level}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function GearBulkControl({ onChange }: { onChange: (level: number) => void }) {
  return (
    <label className="gear-bulk-control">
      일괄 변경
      <select
        aria-label="전투 장비 일괄 강화"
        defaultValue=""
        onChange={(event) => {
          if (event.target.value) {
            onChange(Number(event.target.value));
            event.target.value = "";
          }
        }}
      >
        <option value="">강화 선택</option>
        {enhancementLevels.map((level) => (
          <option value={level} key={level}>
            +{level}
          </option>
        ))}
      </select>
    </label>
  );
}

function parseBraceletStat(
  option: string,
  primaryStat: BraceletPrimaryStat,
): BraceletStat | null {
  const match = option
    .trim()
    .match(
      /^(치명|신속|특화|제압|숙련|인내|체력|힘|민첩|지능|힘\/민\/지)\s*\+?\s*([\d,]+)$/,
    );
  if (!match) return null;
  const type = match[1] === "힘/민/지" ? primaryStat : match[1];
  return {
    type: type as BraceletStat["type"],
    value: match[2].replaceAll(",", ""),
  };
}

function normalizeBraceletEffect(option: string) {
  const catalogOption = findBraceletOption(option);
  if (catalogOption) return catalogOption.label;
  const compact = option.replaceAll(" ", "").replaceAll("\n", "");
  const values = [...compact.matchAll(/(\d+(?:\.\d+)?)%/g)].map(
    (match) => match[1],
  );
  if (/^공격및이동속도가.*증가한다.$/.test(compact) && values.length)
    return `공이속 +${values[0]}%`;
  if (
    /치명타적중률이.*공격이치명타로적중시/.test(compact) &&
    values.length >= 2
  )
    return `치적 +${values[0]}% | 치명타 주는 피해 +${values[1]}%`;
  if (/치명타피해가.*공격이치명타로적중시/.test(compact) && values.length >= 2)
    return `치피 +${values[0]}% | 치명타 주는 피해 +${values[1]}%`;
  if (/^적에게주는피해가.*증가한다.$/.test(compact) && values.length)
    return `적에게 주는 피해 +${values[0]}%`;
  if (/^추가피해가.*증가한다.$/.test(compact) && values.length)
    return `추가 피해 +${values[0]}%`;
  if (/^치명타적중률이.*증가한다.$/.test(compact) && values.length)
    return `치명타 적중률 +${values[0]}%`;
  if (/^치명타피해가.*증가한다.$/.test(compact) && values.length)
    return `치명타 피해 +${values[0]}%`;
  if (
    /적에게주는피해가.*무력화상태의적에게주는피해가/.test(compact) &&
    values.length >= 2
  )
    return `적주피 +${values[0]}% | 무력화 적 피해량 +${values[1]}%`;
  if (/재사용대기시간이.*적에게주는피해가/.test(compact) && values.length >= 2)
    return `쿨 +${values[0]}% | 적에게 주는 피해 +${values[1]}%`;
  if (
    /추가피해가.*악마및대악마계열피해량이/.test(compact) &&
    values.length >= 2
  )
    return `추피 +${values[0]}% | 악마&대악마 피해량 +${values[1]}%`;
  const hitStack = compact.match(
    /무기공격력이(\d+),?공격및이동속도가(\d+(?:\.\d+)?)%/,
  );
  if (hitStack)
    return `공격 적중 시 무공 ${hitStack[1]}, 공이속 ${hitStack[2]}%`;
  const weaponAttackValues = [
    ...compact.matchAll(/무기공격력이(\d+)증가/g),
  ].map((match) => match[1]);
  if (/생명력이50%이상/.test(compact) && weaponAttackValues.length >= 2)
    return `무공 ${weaponAttackValues[0]} | 조건부 무공 ${weaponAttackValues[1]}`;
  if (/공격적중시30초마다/.test(compact) && weaponAttackValues.length >= 2)
    return `무공 ${weaponAttackValues[0]} | 스택당 무공 ${weaponAttackValues[1]}`;
  if (/백어택스킬이적에게주는피해가/.test(compact) && values.length)
    return `백어택 스킬 피해 +${values[0]}%`;
  if (/헤드어택스킬이적에게주는피해가/.test(compact) && values.length)
    return `헤드어택 스킬 피해 +${values[0]}%`;
  if (/방향성공격이아닌스킬이적에게주는피해가/.test(compact) && values.length)
    return `타대 스킬 피해 +${values[0]}%`;
  if (
    /대상의방어력을.*감소.*아군공격력강화효과가/.test(compact) &&
    values.length >= 2
  )
    return `방깎 ${values[0]}% | 아공강 +${values[1]}%`;
  if (
    /대상의치명타저항을.*감소.*아군공격력강화효과가/.test(compact) &&
    values.length >= 2
  )
    return `치명타 저항 -${values[0]}% | 아공강 +${values[1]}%`;
  if (
    /보호효과.*적에게주는피해가.*아군공격력강화효과가/.test(compact) &&
    values.length >= 2
  )
    return `보호 대상 피해량 +${values[0]}% | 아공강 +${values[1]}%`;
  if (
    /치명타피해저항을.*감소.*아군공격력강화효과가/.test(compact) &&
    values.length >= 2
  )
    return `치명타 피해 저항 -${values[0]}% | 아공강 +${values[1]}%`;
  return option;
}

function splitBraceletOptions(
  options: string[],
  primaryStat: BraceletPrimaryStat,
) {
  const stats: BraceletStat[] = [];
  const effects: string[] = [];
  const unavailableEffects: string[] = [];
  mergeBraceletOptionTexts(options).forEach((option) => {
    if (option.includes("도약")) return;
    const stat = parseBraceletStat(option, primaryStat);
    if (
      stat &&
      stats.length < 4 &&
      !stats.some(
        (current) => current.type === stat.type && current.value === stat.value,
      )
    )
      stats.push(stat);
    else {
      const normalized = normalizeBraceletEffect(option);
      const definition = findBraceletOption(normalized);
      if (!definition || !definition.selectable)
        unavailableEffects.push(normalized);
      else effects.push(definition.label);
    }
  });
  while (stats.length < 4) stats.push({ type: "없음", value: "0" });
  while (effects.length < 4) effects.push("없음");
  return {
    stats,
    effects: effects.slice(0, 4),
    unavailableEffects: [...new Set(unavailableEffects)],
  };
}

function formatBraceletStat(stat: BraceletStat) {
  return stat.type === "없음" ? null : `${stat.type} +${stat.value || "0"}`;
}

const ACCESSORY_STAT_RANGES: Record<string, { min: number; max: number }> = {
  목걸이: { min: 15178, max: 17857 },
  귀걸이: { min: 11806, max: 13889 },
  반지: { min: 10962, max: 12897 },
};
function accessoryStatRange(slot: string) {
  return ACCESSORY_STAT_RANGES[slot] ?? null;
}
function accessoryStatPercent(item: EquipmentProfile) {
  const range = accessoryStatRange(item.slot);
  const value = Number(baseStatValue(item).replaceAll(",", ""));
  if (!range || !Number.isFinite(value)) return "-";
  return `${Math.max(0, Math.min(100, ((value - range.min) / (range.max - range.min)) * 100)).toFixed(2)}%`;
}
function accessoryStatTone(item: EquipmentProfile) {
  const percent = Number.parseFloat(accessoryStatPercent(item));
  return percent >= 100
    ? "accessory-stat-gold"
    : percent >= 90
      ? "accessory-stat-purple"
      : percent >= 70
        ? "accessory-stat-blue"
        : percent >= 40
          ? "accessory-stat-teal"
          : "accessory-stat-gray";
}

function AccessoryEditor({
  item,
  onChange,
}: {
  item: EquipmentProfile;
  onChange: (patch: Partial<EquipmentProfile>) => void;
}) {
  const options = Array.from(
    { length: 3 },
    (_, index) =>
      item.options.filter((option) => !isArkPassivePointOption(option))[
        index
      ] ?? "없음",
  );
  const range = accessoryStatRange(item.slot);
  const savedStat = baseStatValue(item);
  const [draftStat, setDraftStat] = useState(savedStat);
  useEffect(() => setDraftStat(savedStat), [savedStat]);
  const commitStat = () => {
    if (!range) return;
    const value = Number(draftStat);
    const normalized =
      Number.isFinite(value) && value >= range.min && value <= range.max
        ? value
        : range.min;
    const next = String(normalized);
    setDraftStat(next);
    onChange({ baseStats: [next] });
  };
  return (
    <article className="accessory-editor">
      <div className="quality-art">
        <Artwork icon={item.icon} label="◇" />
        <span className={accessoryStatTone(item)}>
          {accessoryStatPercent(item)}
        </span>
      </div>
      <div className="accessory-meta">
        <select
          aria-label={`${item.slot} 등급`}
          value={
            item.simulationGrade === "T4 전율" ? "고대" : item.simulationGrade
          }
          onChange={(event) =>
            onChange({
              simulationGrade: event.target
                .value as EquipmentProfile["simulationGrade"],
            })
          }
        >
          <option value="고대">고대</option>
          <option value="유물">유물</option>
        </select>
        <input
          aria-label={`${item.slot} 힘민지`}
          type="number"
          inputMode="numeric"
          value={draftStat}
          onChange={(event) => setDraftStat(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitStat();
            }
          }}
        />
      </div>
      <div className="accessory-option-list">
        {options.map((option, index) => {
          const choices = optionChoices(item.slot, option, accessoryOptions);
          return (
            <select
              aria-label={`${item.slot} 옵션 ${index + 1}`}
              value={option}
              onChange={(event) => {
                const next = [...options];
                next[index] = event.target.value;
                onChange({ options: next });
              }}
              key={index}
            >
              {choices.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          );
        })}
      </div>
    </article>
  );
}

function StoneEditor({
  icon,
  effects,
  engravingNames,
  onChange,
}: {
  icon: string | null;
  effects: StoneEffect[];
  engravingNames: string[];
  onChange: (index: number, patch: Partial<StoneEffect>) => void;
}) {
  return (
    <article className="stone-editor">
      <Artwork icon={icon} label="◇" />
      <div className="stone-card-content">
        {effects.map((effect, index) => (
          <div className="stone-row" key={index}>
            <select
              aria-label={`어빌리티 스톤 각인 ${index + 1}`}
              value={effect.engraving}
              onChange={(event) =>
                onChange(index, { engraving: event.target.value })
              }
            >
              {engravingNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select
              aria-label={`어빌리티 스톤 레벨 ${index + 1}`}
              value={effect.level}
              onChange={(event) =>
                onChange(index, { level: Number(event.target.value) })
              }
            >
              {Array.from({ length: 5 }, (_, level) => (
                <option value={level} key={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </article>
  );
}

function BraceletEditor({
  item,
  primaryStat,
  onChange,
}: {
  item: EquipmentProfile | null;
  primaryStat: BraceletPrimaryStat;
  onChange: (patch: Partial<EquipmentProfile>) => void;
}) {
  if (!item) return <p className="empty-copy">정보 없음</p>;
  const statTypes: BraceletStat["type"][] = [
    ...new Set<BraceletStat["type"]>([...BRACELET_STAT_TYPES, primaryStat]),
  ];
  const { stats, effects, unavailableEffects } = splitBraceletOptions(
    [...item.baseStats, ...item.options],
    primaryStat,
  );
  function save(nextStats: BraceletStat[], nextEffects: string[]) {
    onChange({
      baseStats: nextStats
        .map(formatBraceletStat)
        .filter((value): value is string => Boolean(value)),
      options: [
        ...unavailableEffects,
        ...nextEffects.filter((effect) => effect !== "없음"),
      ],
    });
  }
  return (
    <article className="bracelet-editor">
      <div className="bracelet-art">
        <Artwork icon={item.icon} label="◇" />
      </div>
      <div className="bracelet-fields">
        <div className="bracelet-stat-list">
          {stats.map((stat, index) => (
            <div className="bracelet-stat-row" key={index}>
              <select
                aria-label={`팔찌 능력치 ${index + 1}`}
                value={stat.type}
                onChange={(event) => {
                  const next = [...stats];
                  next[index] = {
                    ...stat,
                    type: event.target.value as BraceletStat["type"],
                  };
                  save(next, effects);
                }}
              >
                {statTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <input
                aria-label={`팔찌 능력치 수치 ${index + 1}`}
                type="number"
                min="0"
                value={stat.value}
                disabled={stat.type === "없음"}
                onChange={(event) => {
                  const next = [...stats];
                  next[index] = { ...stat, value: event.target.value };
                  save(next, effects);
                }}
              />
            </div>
          ))}
        </div>
        <div className="bracelet-option-list">
          {effects.map((effect, index) => (
            <select
              aria-label={`팔찌 효과 ${index + 1}`}
              value={effect}
              onChange={(event) => {
                const next = [...effects];
                next[index] = event.target.value;
                save(stats, next);
              }}
              key={index}
            >
              {BRACELET_EFFECT_OPTIONS.map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          ))}
        </div>
        {unavailableEffects.length ? (
          <div className="bracelet-unavailable">
            <small>현재 장착 · 시뮬레이션 미적용</small>
            {unavailableEffects.map((effect) => (
              <span key={effect}>{effect}</span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
function GemBoard({
  gems,
  skills,
  onChange,
  onAdd,
  onRemove,
  onBulkLevel,
  message,
}: {
  gems: GemProfile[];
  skills: SkillProfile[];
  onChange: (id: string, patch: Partial<GemProfile>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onBulkLevel: (level: number) => void;
  message: string;
}) {
  return (
    <section className="gem-board">
      <div className="gem-board-heading">
        <div>
          <h2>보석</h2>
        </div>
        <div className="gem-bulk-controls">
          <strong>일괄 변경</strong>
          {[10, 9, 8, 7].map((level) => (
            <button
              type="button"
              onClick={() => onBulkLevel(level)}
              key={level}
            >
              {level}겁작
            </button>
          ))}
        </div>
      </div>
      {message ? (
        <p className="validation-message" role="alert">
          {message}
        </p>
      ) : null}
      <div className="gem-board-list">
        {gems.map((gem) => {
          const level = gem.level ?? 10;
          const icon = gemDisplayIcon(gem);
          return (
            <article key={gem.id}>
              <div className="gem-board-art">
                <Artwork icon={icon} label="◆" />
                <b>{level}</b>
              </div>
              <select
                aria-label={`${gem.skill || "미지정"} 보석 종류`}
                value={gem.type}
                onChange={(event) =>
                  onChange(gem.id, { type: event.target.value })
                }
              >
                {gemTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <select
                aria-label={`${gem.skill || "미지정"} 보석 레벨`}
                value={level}
                onChange={(event) =>
                  onChange(gem.id, { level: Number(event.target.value) })
                }
              >
                {gemLevels.map((optionLevel) => (
                  <option value={optionLevel} key={optionLevel}>
                    {optionLevel}
                  </option>
                ))}
              </select>
              <select
                aria-label="보석 적용 스킬"
                value={gem.skill ?? ""}
                onChange={(event) =>
                  onChange(gem.id, { skill: event.target.value })
                }
              >
                <option value="">스킬 선택</option>
                {skills.map((skill) => (
                  <option value={skill.name} key={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="gem-remove-button"
                onClick={() => onRemove(gem.id)}
                aria-label={`${gem.skill || "보석"} 제거`}
              >
                ×
              </button>
            </article>
          );
        })}
        {gems.length < 11 ? (
          <button type="button" className="gem-board-add" onClick={onAdd}>
            + 보석 추가
          </button>
        ) : null}
      </div>
    </section>
  );
}
function SkillEditorV2({
  skill,
  gems,
  calculation,
  cooldown,
  onChange,
  onGemChange,
  onRemoveGem,
  onAddGem,
}: {
  skill: SkillProfile;
  gems: GemProfile[];
  calculation?: SingleSkillCalculationResult;
  cooldown?: ReturnType<typeof resolveGlavierSkillCooldown>;
  onChange: (patch: Partial<SkillProfile>) => void;
  onGemChange: (id: string, patch: Partial<GemProfile>) => void;
  onRemoveGem: (id: string) => void;
  onAddGem: (type: "겁화" | "작열") => void;
}) {
  if (!GLAVIER_SKILL_BY_NAME[skill.name] || !calculation) {
    return (
      <article
        className="skill-card skill-editor skill-unavailable"
        aria-label={`${skill.name} 계산 준비 중`}
      >
        <Artwork icon={skill.icon} label="✦" />
        <div>
          <strong className="skill-name">{skill.name}</strong>
          <p>계산 준비 중입니다.</p>
        </div>
      </article>
    );
  }
  const selectableTripodCount = selectableTripodCountForSkillLevel(skill.level);
  const tripods = Array.from(
    { length: 3 },
    (_, index) => skill.tripods[index] ?? { name: "없음", level: null },
  );
  const activeTripods = tripods.map((tripod, index) =>
    index < selectableTripodCount
      ? tripod
      : { ...tripod, name: "없음", level: null },
  );
  const catalog =
    GLAVIER_SKILL_TRIPODS[skill.name as keyof typeof GLAVIER_SKILL_TRIPODS];
  const details = GLAVIER_SKILL_TRIPOD_DETAILS[skill.name] ?? [];
  const criticalRateBonus = calculation.selectedTripods
    .filter((effect) => effect.effectType === "치명타 확률 가산")
    .reduce((total, effect) => total + (effect.percentValue ?? 0), 0);
  const criticalDamageBonus = calculation.selectedTripods
    .filter((effect) => effect.effectType === "치명타 피해 가산")
    .reduce((total, effect) => total + (effect.percentValue ?? 0), 0);
  const cooldownReduction = cooldown
    ? Math.max(0, cooldown.baseCooldownSeconds - cooldown.cooldownSeconds)
    : 0;
  const criticalRate = calculation.combat.stages.criticalRate;
  const isBackAttackSkill = calculation.evolution.isBackAttackSkill;
  const defaultScenario = calculation.scenarios.find(
    (scenario) =>
      !scenario.conditions.azureDragonBuff &&
      !scenario.conditions.backAttack &&
      !scenario.conditions.yeongaSimGong,
  );
  const azureDragonScenario = calculation.scenarios.find(
    (scenario) =>
      scenario.conditions.azureDragonBuff &&
      !scenario.conditions.backAttack &&
      !scenario.conditions.yeongaSimGong,
  );
  const defaultBackAttackScenario = calculation.scenarios.find(
    (scenario) =>
      !scenario.conditions.azureDragonBuff &&
      scenario.conditions.backAttack &&
      !scenario.conditions.yeongaSimGong,
  );
  const azureDragonBackAttackScenario = calculation.scenarios.find(
    (scenario) =>
      scenario.conditions.azureDragonBuff &&
      scenario.conditions.backAttack &&
      !scenario.conditions.yeongaSimGong,
  );
  const backAttackDisplayScenario =
    defaultBackAttackScenario ?? defaultScenario;
  const displayGemTypes =
    skill.name === "맹룡난무" || skill.name === "적룡필살"
      ? []
      : ["겁화", "작열"];
  return (
    <article className="skill-card skill-editor">
      <div className="skill-icon-column">
        <Artwork icon={skill.icon} label="✦" />
        <select
          className="skill-level-select"
          aria-label={`${skill.name} 레벨`}
          value={skill.level}
          onChange={(event) => {
            const level = Number(event.target.value);
            const limit = level <= 3 ? 0 : level <= 6 ? 1 : level <= 9 ? 2 : 3;
            onChange({
              level,
              tripods: tripods.map((tripod, index) =>
                index < limit
                  ? tripod
                  : { ...tripod, name: "없음", level: null },
              ),
            });
          }}
        >
          {skillLevels.map((level) => (
            <option value={level} key={level}>
              Lv.{level}
            </option>
          ))}
        </select>
      </div>
      <div className="skill-title-column">
        <div className="skill-title-column">
          <strong className="skill-name">{skill.name}</strong>
          <span className="skill-tripod-multiplier">
            트라이포드 배율 ×
            {(
              calculation.tripodDamageMultiplier *
              calculation.awakeningDamageMultiplier
            ).toFixed(3)}
          </span>
          <span className="skill-tripod-effect">
            치명타 확률 +
            {(
              (criticalRateBonus + calculation.awakeningCriticalRateBonus) *
              100
            ).toFixed(1)}
            %
          </span>
          <span className="skill-tripod-effect">
            치명타 피해 +{(criticalDamageBonus * 100).toFixed(1)}%
          </span>
          <span className="skill-tripod-effect">
            쿨타임 감소 {cooldownReduction.toFixed(1)}초
          </span>
        </div>
      </div>
      <div className="skill-tripod-selects">
        {activeTripods.map((tripod, index) => {
          const options = [
            ...new Set([tripod.name, ...(catalog?.[index] ?? [])]),
          ];
          const detail = details.find(
            (item) => item.tier === index + 1 && item.name === tripod.name,
          );
          return (
            <div
              className="skill-tripod-tooltip"
              data-tooltip={detail?.description ?? tripod.name}
              key={`tripod-${skill.id}-${index}`}
            >
              <select
                aria-label={`${skill.name} 트라이포드 ${index + 1}`}
                value={tripod.name}
                disabled={index >= selectableTripodCount}
                onChange={(event) =>
                  onChange({
                    tripods: tripods.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            name: event.target.value,
                            level:
                              event.target.value === "없음" ? null : item.level,
                          }
                        : item,
                    ),
                  })
                }
              >
                {options.map((option) => (
                  <option value={option} key={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
      <div className="skill-gem-inline">
        {displayGemTypes.map((type) => {
          const gem = gems.find((candidate) => candidate.type === type);
          return gem ? (
            <div className="skill-gem-slot" key={gem.id}>
              <Artwork icon={gemDisplayIcon(gem)} label="◆" />
              <select
                aria-label={`${type} 보석 종류`}
                value={gem.type}
                onChange={(event) =>
                  onGemChange(gem.id, { type: event.target.value })
                }
              >
                {gemTypes.map((gemType) => (
                  <option key={gemType}>{gemType}</option>
                ))}
              </select>
              <select
                aria-label={`${type} 보석 레벨`}
                value={gem.level ?? 10}
                onChange={(event) =>
                  onGemChange(gem.id, { level: Number(event.target.value) })
                }
              >
                {gemLevels.map((level) => (
                  <option value={level} key={level}>
                    {level}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="skill-gem-remove"
                onClick={() => onRemoveGem(gem.id)}
                aria-label="보석 삭제"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="skill-gem-add-slot"
              key={`gem-add-${type}`}
              onClick={() => onAddGem(type as "겁화" | "작열")}
            >
              {type} 보석 추가
            </button>
          );
        })}
      </div>
      <div className="skill-metrics" aria-label={`${skill.name} 전투 데이터`}>
        <div className="skill-core-metrics">
          <span>
            스킬 쿨타임{" "}
            <b>{cooldown ? `${cooldown.cooldownSeconds.toFixed(2)}초` : "-"}</b>
          </span>
          <span>
            <span
              className="skill-metric-tooltip"
              data-tooltip="백어택 기준 치명타 확률"
            >
              치명타 확률
            </span>{" "}
            <b>
              {(
                (backAttackDisplayScenario?.criticalRate ?? criticalRate) * 100
              ).toFixed(2)}
              %
            </b>
          </span>
          <span>
            최대 대미지{" "}
            <b>
              {formatDamageInEok(
                backAttackDisplayScenario?.maximumDamage ??
                  calculation.maximumCriticalDamage,
                3,
              )}
            </b>
          </span>
          <span>
            평균 대미지{" "}
            <b>
              {formatDamageInEok(
                backAttackDisplayScenario?.averageDamage ??
                  calculation.expectedDamage,
                3,
              )}
            </b>
          </span>
        </div>
      </div>
    </article>
  );
}

function UnsupportedSkillTab({ className }: { className: string }) {
  return (
    <section className="skill-tab-unavailable" role="status">
      <h2>스킬 계산 준비 중</h2>
      <p>{className} 스킬 데이터와 계산 엔진은 아직 준비 중입니다.</p>
    </section>
  );
}

function EffectList({
  effects,
  onChange,
}: {
  effects: ArkEffectProfile[];
  onChange: (id: string, level: number) => void;
}) {
  const visibleNames = ["추가 피해", "공격력", "보스 피해"];
  const visibleEffects = effects.filter(
    (effect): effect is ArkEffectProfile =>
      Boolean(effect) &&
      visibleNames.some((name) => effect.name.includes(name)),
  );
  return (
    <ul className="effect-list ark-grid-effect-editor">
      {visibleEffects.map((effect) => {
        const level = effect.level ?? 0;
        const name =
          visibleNames.find((item) => effect.name.includes(item)) ??
          effect.name;
        const kind =
          name === "추가 피해"
            ? "additionalDamage"
            : name === "보스 피해"
              ? "bossDamage"
              : "attack";
        return (
          <li key={effect.id}>
            <Artwork icon={effect.icon} label="✦" />
            <div>
              <strong>{name}</strong>
              <small>젬 효율 {arkGridGemPercent(kind, level)}</small>
            </div>
            <select
              aria-label={`${effect.name} 레벨`}
              value={level}
              onChange={(event) =>
                onChange(effect.id, Number(event.target.value))
              }
            >
              {Array.from({ length: 101 }, (_, value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
          </li>
        );
      })}
    </ul>
  );
}
function EngravingSection({
  engravings,
  stoneIcon,
  stoneEffects,
  engravingNames,
  onChange,
  onStoneChange,
}: {
  engravings: EngravingProfile[];
  stoneIcon: string | null;
  stoneEffects: StoneEffect[];
  engravingNames: string[];
  onChange: (index: number, patch: Partial<EngravingProfile>) => void;
  onStoneChange: (index: number, patch: Partial<StoneEffect>) => void;
}) {
  return (
    <section className="equipment-section engraving-section">
      <h2>각인</h2>
      <div className="engraving-editor">
        {engravings.slice(0, 5).map((engraving, index) => (
          <div key={engraving.name + "-" + index}>
            <Artwork icon={engraving.icon} label="◆" />
            <div className="engraving-card-content">
              <div className="engraving-controls">
                <select
                  aria-label={engraving.name + " 등급"}
                  value={engraving.grade}
                  onChange={(event) =>
                    onChange(index, {
                      grade: event.target.value as EngravingProfile["grade"],
                    })
                  }
                >
                  <option>유물</option>
                  <option>전설</option>
                </select>
                <select
                  aria-label={engraving.name + " 활성도"}
                  value={engraving.level}
                  disabled={engraving.grade === "전설"}
                  onChange={(event) =>
                    onChange(index, { level: Number(event.target.value) })
                  }
                >
                  {[0, 1, 2, 3, 4].map((level) => (
                    <option value={level} key={level}>
                      +{level}
                    </option>
                  ))}
                </select>
              </div>
              <select
                aria-label={"각인 " + (index + 1)}
                value={engraving.name}
                onChange={(event) =>
                  onChange(index, { name: event.target.value })
                }
              >
                {ENGRAVING_NAMES.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <StoneEditor
          icon={stoneIcon}
          effects={stoneEffects}
          engravingNames={engravingNames}
          onChange={onStoneChange}
        />
      </div>
    </section>
  );
}

function EnlightenmentEditor({
  effects,
  onChange,
}: {
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  const fixed = [
    {
      name: "절정 I",
      icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_2.png",
    },
    {
      name: "절정 II",
      icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_3.png",
    },
    {
      name: "절정 III",
      icon: "https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_lm/ark_passive_lm_4.png",
    },
  ];
  const selectable = [
    "연가심공",
    "연가표식",
    "치명적인 베기",
    "강력한 찌르기",
    "전환 난무",
  ];
  const selected = effects
    .map((effect, index) => ({ effect, index }))
    .filter(({ effect }) => selectable.includes(effect.name))
    .sort(
      (a, b) =>
        selectable.indexOf(a.effect.name) - selectable.indexOf(b.effect.name),
    )
    .slice(0, 3);
  const rows = Array.from(
    { length: 3 },
    (_, index) =>
      selected[index] ?? {
        index: effects.length + index,
        effect: {
          id: `enlightenment-${index}`,
          name: "없음",
          level: 0,
          grade: null,
          icon: null,
          description: null,
        },
      },
  );
  const options = ["없음", ...selectable];
  return (
    <section className="passive-editor enlightenment-editor">
      <div className="passive-choice-heading">
        <h3>깨달음</h3>
        <span>3개</span>
      </div>
      <div className="enlightenment-fixed">
        {fixed.map((item) => (
          <div key={item.name}>
            <Artwork icon={item.icon} label="✦" title={item.name} />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
      <div className="enlightenment-selects">
        {rows.map((row, index) => {
          const current = row.effect.name;
          const maxLevel = enlightenmentEffects[current]?.maxLevel ?? 5;
          return (
            <div className="passive-row" key={row.effect.id}>
              <select
                aria-label={`깨달음 옵션 ${index + 1}`}
                value={current}
                onChange={(event) => {
                  const name = event.target.value;
                  const option = effects.find((effect) => effect.name === name);
                  onChange(row.index, {
                    id: `enlightenment-${index}`,
                    name,
                    level:
                      name === "없음"
                        ? 0
                        : Math.min(
                            row.effect.level ?? 0,
                            enlightenmentEffects[name]?.maxLevel ?? 5,
                          ),
                    icon: option?.icon ?? null,
                    description:
                      option?.description ??
                      enlightenmentEffects[name]?.description ??
                      null,
                  });
                }}
              >
                {options.map((option) => (
                  <option
                    value={option}
                    disabled={
                      option !== current &&
                      rows.some((candidate) => candidate.effect.name === option)
                    }
                    key={option}
                  >
                    {option}
                  </option>
                ))}
              </select>
              <select
                aria-label={`깨달음 옵션 ${index + 1} 레벨`}
                value={current === "없음" ? 0 : (row.effect.level ?? 0)}
                disabled={current === "없음"}
                onChange={(event) =>
                  onChange(row.index, {
                    level: Math.min(Number(event.target.value), maxLevel),
                  })
                }
              >
                {Array.from({ length: maxLevel + 1 }, (_, level) => (
                  <option value={level} key={level}>
                    Lv.{level}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}
function LeapEditor({
  effects,
  onChange,
}: {
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  const safeEffects = effects.filter((effect): effect is ArkEffectProfile =>
    Boolean(effect),
  );
  const selected = safeEffects
    .map((effect, index) => ({ effect, index }))
    .filter(({ effect }) =>
      leapOptions.some((option) => option.name === effect.name),
    );
  const fixedRows = leapOptions.slice(0, 3).map(
    (option, optionIndex) =>
      selected.find((row) => row.effect.name === option.name) ?? {
        index: safeEffects.length + optionIndex,
        effect: {
          id: `leap-fixed-${optionIndex}`,
          name: option.name,
          level: 0,
          grade: null,
          icon: option.icon,
          description: option.description,
        },
      },
  );
  const editableOptions = leapOptions.slice(3);
  const editableRows = selected
    .filter(({ effect }) =>
      editableOptions.some((option) => option.name === effect.name),
    )
    .slice(0, 2);
  const rows = [...fixedRows, ...editableRows];
  const choices = editableOptions.map((option) => option.name);
  return (
    <section className="passive-editor leap-editor">
      <div className="passive-choice-heading">
        <h3>도약</h3>
      </div>
      <div className="leap-options">
        {rows.map((row, index) => {
          const current = leapOptions.find(
            (option) => option.name === row.effect.name,
          );
          const level = current ? (row.effect.level ?? 0) : 0;
          const fixed = index < 3;
          return (
            <div className="leap-option-row" key={`leap-row-${index}`}>
              <Artwork
                icon={current?.icon ?? row.effect.icon ?? null}
                label="✦"
                title={
                  current
                    ? `${current.name}: ${current.description}`
                    : "도약 옵션 선택"
                }
              />
              {fixed ? (
                <strong className="leap-fixed-name">{current?.name}</strong>
              ) : (
                <select
                  aria-label={`도약 옵션 ${index + 1}`}
                  value={current?.name ?? "없음"}
                  onChange={(event) => {
                    const name = event.target.value;
                    const option = leapOptions.find(
                      (item) => item.name === name,
                    );
                    onChange(row.index, {
                      id: `leap-slot-${index}`,
                      name,
                      level:
                        name === "없음"
                          ? 0
                          : Math.min(level || 1, option?.maxLevel ?? 5),
                      icon: option?.icon ?? null,
                      description: option?.description ?? null,
                    });
                  }}
                >
                  {choices.map((choice) => (
                    <option value={choice} key={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label={`도약 옵션 ${index + 1} 레벨`}
                value={level}
                onChange={(event) =>
                  onChange(row.index, {
                    level: Math.min(
                      Number(event.target.value),
                      current?.maxLevel ?? 5,
                    ),
                  })
                }
              >
                {Array.from(
                  { length: (current?.maxLevel ?? 5) + 1 },
                  (_, value) => (
                    <option value={value} key={value}>
                      Lv.{value}
                    </option>
                  ),
                )}
              </select>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PassiveEditor({
  title,
  group,
  effects,
  onChange,
}: {
  title: string;
  group: PassiveGroup;
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  if (group === "enlightenment")
    return <EnlightenmentEditor effects={effects} onChange={onChange} />;
  if (group === "leap")
    return <LeapEditor effects={effects} onChange={onChange} />;
  const rows = effects.filter((effect): effect is ArkEffectProfile =>
    Boolean(effect),
  );
  const displayRows = rows.length
    ? rows
    : [
        {
          id: `${group}-empty`,
          name: "없음",
          level: 0,
          grade: null,
          icon: null,
          description: null,
        },
      ];
  const choices = [
    ...new Set([
      ...passiveCatalog[group],
      ...rows.map((effect) => effect.name),
    ]),
  ];
  return (
    <section className={`passive-editor passive-choice-editor ${group}-editor`}>
      <div className="passive-choice-heading">
        <h3>{title}</h3>
        <span>{displayRows.length}개</span>
      </div>
      {displayRows.map((effect, index) => (
        <div className="passive-row" key={effect.id}>
          <select
            aria-label={`${title} 옵션 ${index + 1}`}
            value={effect.name}
            onChange={(event) => onChange(index, { name: event.target.value })}
          >
            {choices.map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
          <select
            aria-label={`${title} 옵션 ${index + 1} 레벨`}
            value={effect.level ?? 0}
            onChange={(event) =>
              onChange(index, { level: Number(event.target.value) })
            }
          >
            {Array.from({ length: 7 }, (_, level) => (
              <option value={level} key={level}>
                Lv.{level}
              </option>
            ))}
          </select>
        </div>
      ))}
    </section>
  );
}
function EvolutionTierOneEditor({
  effects,
  onChange,
}: {
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  const statNames = new Set<string>(
    EVOLUTION_T1_OPTIONS.map((option) => option.name),
  );
  const selected = effects
    .filter(
      (effect): effect is ArkEffectProfile =>
        Boolean(effect) && statNames.has(effect.name),
    )
    .slice(0, 3);
  const rows = Array.from(
    { length: 3 },
    (_, index) =>
      selected[index] ?? {
        id: `evolution-t1-${index}`,
        name: "없음",
        level: 0,
        grade: null,
        icon: null,
        description: null,
      },
  );
  const total = rows.reduce(
    (sum, effect) => sum + (effect.name === "없음" ? 0 : (effect.level ?? 0)),
    0,
  );
  return (
    <section className="passive-editor evolution-t1-editor">
      <div className="evolution-t1-heading">
        <div>
          <h3>진화 · T1</h3>
          <p>
            최대 3개 선택 · 합계 {total} / {EVOLUTION_T1_MAX_TOTAL_LEVEL} ·
            레벨당 전투 특성 +{EVOLUTION_T1_STAT_PER_LEVEL}
          </p>
        </div>
      </div>
      <div className="evolution-t1-list">
        {rows.map((effect, index) => {
          const selectedName = effect.name as EvolutionT1OptionName | "없음";
          const selectedOption =
            EVOLUTION_T1_OPTIONS.find(
              (option) => option.name === selectedName,
            ) ?? null;
          const otherTotal = total - (selectedOption ? (effect.level ?? 0) : 0);
          const maxLevel = Math.min(
            EVOLUTION_T1_MAX_OPTION_LEVEL,
            EVOLUTION_T1_MAX_TOTAL_LEVEL - otherTotal,
          );
          const tooltip = selectedOption
            ? `${selectedOption.name}: 레벨당 전투 특성 +${EVOLUTION_T1_STAT_PER_LEVEL} · 현재 총 +${(effect.level ?? 0) * EVOLUTION_T1_STAT_PER_LEVEL}`
            : "전투 특성 선택";
          return (
            <article key={effect.id}>
              <Artwork
                icon={selectedOption?.icon ?? null}
                label="＋"
                title={tooltip}
              />
              <div className="evolution-t1-controls">
                <select
                  aria-label={`T1 전투 특성 ${index + 1}`}
                  value={selectedName}
                  onChange={(event) => {
                    const name = event.target.value as
                      EvolutionT1OptionName | "없음";
                    const option = EVOLUTION_T1_OPTIONS.find(
                      (item) => item.name === name,
                    );
                    onChange(index, {
                      id: `evolution-t1-editor-${index}`,
                      name,
                      level: name === "없음" ? 0 : (effect.level ?? 0),
                      icon: option?.icon ?? null,
                      description: option
                        ? `${option.name}이 레벨당 ${EVOLUTION_T1_STAT_PER_LEVEL} 증가합니다.`
                        : null,
                    });
                  }}
                >
                  <option>없음</option>
                  {EVOLUTION_T1_OPTIONS.map((option) => (
                    <option
                      value={option.name}
                      disabled={
                        option.name !== selectedName &&
                        rows.some((row) => row.name === option.name)
                      }
                      key={option.name}
                    >
                      {option.name}
                    </option>
                  ))}
                </select>
                <strong>{selectedOption?.name ?? "선택 없음"}</strong>
              </div>
              <select
                className="evolution-t1-level"
                aria-label={`${selectedName} 레벨`}
                value={selectedOption ? (effect.level ?? 0) : 0}
                disabled={!selectedOption}
                onChange={(event) =>
                  onChange(index, {
                    id: `evolution-t1-editor-${index}`,
                    name: selectedName,
                    level: Number(event.target.value),
                  })
                }
              >
                {Array.from({ length: maxLevel + 1 }, (_, level) => (
                  <option value={level} key={level}>
                    Lv.{level}
                  </option>
                ))}
              </select>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function scaledEvolutionDescription(description: string, level: number) {
  return description.replace(
    /(\d+(?:\.\d+)?)%/g,
    (_, value: string) => `${Number(value) * level}%`,
  );
}
function EvolutionTierEditor({
  tier,
  effects,
  onChange: rawOnChange,
}: {
  tier: Exclude<EvolutionTier, "T1">;
  effects: ArkEffectProfile[];
  onChange: (index: number, patch: Partial<ArkEffectProfile>) => void;
}) {
  const rule = EVOLUTION_TIER_RULES[tier];
  const options = EVOLUTION_TIER_CATALOG[tier].filter(
    (option) => option.selectable !== false,
  );
  const safeEffects = effects.filter((effect): effect is ArkEffectProfile =>
    Boolean(effect),
  );
  const selected = safeEffects
    .map((effect, index) => ({ effect, index }))
    .filter(({ effect }) =>
      options.some((option) => option.name === effect.name),
    )
    .slice(0, rule.maxSelections);
  const rows = Array.from(
    { length: rule.maxSelections },
    (_, index) =>
      selected[index] ?? {
        index: safeEffects.length + index,
        effect: {
          id: `evolution-${tier}-${index}`,
          name: tier === "T4" ? (options[index]?.name ?? "없음") : "없음",
          level: 0,
          grade: null,
          icon: tier === "T4" ? (options[index]?.icon ?? null) : null,
          description:
            tier === "T4"
              ? (options[index]?.effects.join(" · ") ?? null)
              : null,
        },
      },
  );
  const spentPoints = rows.reduce(
    (total, row) =>
      total +
      (row.effect.name === "없음"
        ? 0
        : (row.effect.level ?? 0) * rule.pointCost),
    0,
  );
  const onChange = (index: number, patch: Partial<ArkEffectProfile>) => {
    const cap = rule.totalPointCap;
    if (cap !== undefined) {
      const nextPoints = rows.reduce((total, row) => {
        const level =
          row.index === index
            ? (patch.level ?? row.effect.level ?? 0)
            : (row.effect.level ?? 0);
        const name =
          row.index === index
            ? (patch.name ?? row.effect.name)
            : row.effect.name;
        return total + (name === "없음" ? 0 : level * rule.pointCost);
      }, 0);
      if (nextPoints > cap) {
        window.alert(
          `${tier} 진화 포인트는 최대 ${cap}P까지 선택할 수 있습니다.`,
        );
        return;
      }
    }
    rawOnChange(index, patch);
  };
  return (
    <section
      className={`passive-editor evolution-tier-editor evolution-${tier.toLowerCase()}-editor`}
    >
      <div className="evolution-t1-heading">
        <div>
          <h3>진화 · {tier}</h3>
          <p>
            최대 {rule.maxSelections}개 선택 · Lv.당 {rule.pointCost} 포인트 ·
            사용 {spentPoints}P
          </p>
        </div>
      </div>
      <div className="evolution-t1-list">
        {rows.map((row, rowIndex) => {
          const current =
            options.find((option) => option.name === row.effect.name) ?? null;
          const level = current ? (row.effect.level ?? 0) : 0;
          const description = current?.effects.length
            ? current.effects
                .map((effect) => scaledEvolutionDescription(effect, level || 1))
                .join(" · ")
            : "효과 데이터 미등록";
          return (
            <article key={row.effect.id}>
              <Artwork
                icon={current?.icon ?? null}
                label="＋"
                title={
                  current
                    ? `${current.name} Lv.${level}: ${description}`
                    : "진화 옵션 선택"
                }
              />
              <div className="evolution-t1-controls">
                <select
                  aria-label={`${tier} 옵션 ${rowIndex + 1}`}
                  value={current?.name ?? "없음"}
                  onChange={(event) => {
                    const name = event.target.value;
                    const next = options.find((option) => option.name === name);
                    onChange(row.index, {
                      id: row.effect.id,
                      name,
                      level:
                        name === "없음"
                          ? 0
                          : Math.min(
                              row.effect.level ?? 0,
                              next?.maxLevel ?? 0,
                            ),
                      icon: next?.icon ?? null,
                      description: next?.effects.join(" · ") ?? null,
                    });
                  }}
                >
                  {tier !== "T4" ? <option>없음</option> : null}
                  {options.map((option) => (
                    <option
                      value={option.name}
                      disabled={
                        option.name !== current?.name &&
                        rows.some(
                          (candidate) => candidate.effect.name === option.name,
                        )
                      }
                      key={option.name}
                    >
                      {option.name}
                    </option>
                  ))}
                </select>
                <strong>{current?.name ?? "선택 없음"}</strong>
              </div>
              <select
                className="evolution-t1-level"
                aria-label={`${tier} ${current?.name ?? "옵션"} 레벨`}
                value={level}
                disabled={!current}
                onChange={(event) =>
                  onChange(row.index, {
                    id: row.effect.id,
                    level: Number(event.target.value),
                  })
                }
              >
                {Array.from(
                  { length: (current?.maxLevel ?? 0) + 1 },
                  (_, levelOption) => (
                    <option value={levelOption} key={levelOption}>
                      Lv.{levelOption}
                    </option>
                  ),
                )}
              </select>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function coreLevel(point: number | null) {
  return point === null
    ? null
    : point >= 20
      ? 3
      : point >= 17
        ? 2
        : point >= 14
          ? 1
          : 0;
}
function deriveGridShorthand(
  cores: ArkGridCoreProfile[],
  classEngraving?: GlavierClassEngraving | null,
) {
  const definitions = cores
    .slice(0, 3)
    .map((core) => findArkGridOrderCoreDefinition(core.name));
  const types = ["해", "달", "별"] as const;
  const valid =
    definitions.length === 3 &&
    definitions.every(
      (definition, index) =>
        definition !== null &&
        definition.type === types[index] &&
        (!classEngraving || definition.classEngraving === classEngraving),
    );
  return valid
    ? definitions.map((definition) => definition!.number).join("")
    : null;
}
function initialStoneEffects(profile: CharacterProfile): StoneEffect[] {
  const active = profile.engravingDetails
    .filter((engraving) => engraving.abilityStoneLevel > 0)
    .slice(0, 2);
  return (active.length ? active : profile.engravingDetails.slice(0, 2)).map(
    (engraving) => ({
      engraving: engraving.name,
      level: engraving.abilityStoneLevel || 1,
    }),
  );
}
function initialAvatarGrades(profile: CharacterProfile) {
  const avatarFor = (slot: (typeof avatarSlots)[number]) => {
    const direct = profile.avatars.find(
      (item) =>
        item.slot.includes(slot) ||
        (slot === "머리" && item.slot.includes("투구")),
    );
    // 상·하의 일체형 아바타는 API에서 상의 한 칸만 내려오는 경우가 있다.
    // 하의 데이터가 없을 때만 상의 등급을 하의에도 적용한다.
    if (slot === "하의" && !direct)
      return profile.avatars.find((item) => item.slot.includes("상의"));
    return direct;
  };
  return Object.fromEntries(
    avatarSlots.map((slot) => {
      const avatar = avatarFor(slot);
      return [
        slot,
        avatar?.grade === "전설" ? "전설" : avatar ? "영웅" : "없음",
      ];
    }),
  ) as Record<(typeof avatarSlots)[number], string>;
}

function criticalBraceletStat(profile: CharacterProfile) {
  return (
    profile.equipment
      .find((item) => item.slot === "팔찌")
      ?.baseStats.reduce(
        (total, value) =>
          total +
          Number(
            value.match(/^치명\s*\+?([\d,]+)/)?.[1]?.replaceAll(",", "") ?? 0,
          ),
        0,
      ) ?? 0
  );
}
function combatAttributeInput(profile: CharacterProfile) {
  const names = ["특화", "신속", "치명", "제압", "인내", "숙련"];
  const bracelet = profile.equipment.find((item) => item.slot === "팔찌");
  return {
    apiTotals: {
      특화: profile.combat.specializationStat ?? 0,
      신속: profile.combat.swiftnessStat ?? 0,
      치명: profile.combat.criticalStat ?? 0,
      제압: profile.combat.dominationStat ?? 0,
      인내: profile.combat.enduranceStat ?? 0,
      숙련: profile.combat.expertiseStat ?? 0,
    },
    evolution: profile.arkPassive.evolution,
    braceletStats: Object.fromEntries(
      names.map((name) => [
        name,
        bracelet?.baseStats.reduce(
          (total, value) =>
            total +
            Number(
              value
                .match(new RegExp(`^${name}\\s*\\+?([\\d,]+)`))?.[1]
                ?.replaceAll(",", "") ?? 0,
            ),
          0,
        ) ?? 0,
      ]),
    ),
  };
}

const ceilPercentToTwoDecimals = (value: number) =>
  Math.ceil((value - Number.EPSILON) * 100) / 100;

/** 단일 시뮬레이션 스냅샷의 표시 전용 뷰. 여기서는 어떤 계산도 다시 수행하지 않는다. */
function InternalGearSnapshotDebug({
  snapshot,
  cycleDamageRows = [],
  onExportJson,
}: {
  snapshot: ReturnType<typeof buildUnifiedCombatSnapshot>;
  cycleDamageRows?: readonly {
    skillName: string;
    count: number;
    totalDamage: number;
    averageDamage: number;
  }[];
  onExportJson?: () => void;
}) {
  const format = (value: number | null, suffix = "") =>
    value === null ? "미등록" : value.toLocaleString() + suffix;
  return (
    <details className="internal-gear-debug">
      <summary>
        값 검증 모드 ·{" "}
        {snapshot.internalGearSnapshot.unresolvedSlots.length
          ? `${snapshot.internalGearSnapshot.unresolvedSlots.length}개 미등록`
          : "검증 완료"}
      </summary>
      <button
        type="button"
        className="debug-json-export-button"
        onClick={onExportJson}
      >
        현재 세팅·계산 JSON 추출
      </button>
      <div className="internal-gear-debug-summary">
        {(["특화", "신속", "치명", "제압", "인내", "숙련"] as const).map(
          (name) => (
            <span key={name}>
              {name}{" "}
              <b>
                {snapshot.combatAttributes[name].internalTotal.toLocaleString()}
              </b>
            </span>
          ),
        )}
        <span>
          힘/민/지 최종{" "}
          <b>
            {Math.ceil(snapshot.combatStatsSnapshot.total).toLocaleString()}
          </b>
        </span>
        <span>
          최종 무공{" "}
          <b>
            {Math.floor(snapshot.weaponAttackSnapshot.total).toLocaleString()}
          </b>
        </span>
        <span>
          기본 공격력{" "}
          <b>
            {Math.floor(
              snapshot.baseAttackPowerSnapshot.total,
            ).toLocaleString()}
          </b>
        </span>
        <span>
          최종 공격력{" "}
          <b>
            {Math.floor(
              snapshot.finalAttackPowerSnapshot.total,
            ).toLocaleString()}
          </b>
        </span>
        <span>
          치적{" "}
          <b>
            {ceilPercentToTwoDecimals(
              snapshot.criticalRateSnapshot.total * 100,
            ).toFixed(2)}
            %
          </b>
        </span>
        <span>
          치피{" "}
          <b>{(snapshot.criticalDamageSnapshot.total * 100).toFixed(2)}%</b>
        </span>
        <span>
          치명타 주는 피해 배율{" "}
          <b>{snapshot.criticalOutgoingSnapshot.total.toFixed(4)}x</b>
        </span>
        <span>
          추가 피해 <b>{snapshot.additionalDamageSnapshot.total.toFixed(2)}%</b>
        </span>
        <span>
          특정 타입 피해{" "}
          <b>{snapshot.specificTypeDamageSnapshot.total.toFixed(2)}%</b>
        </span>
        <span>
          카드 속성 피해{" "}
          <b>
            {(
              (snapshot.cardAttributeDamageSnapshot.totalMultiplier - 1) *
              100
            ).toFixed(2)}
            %
          </b>
        </span>
        <span>
          백어택 스킬 자체 피해{" "}
          <b>
            {(
              (snapshot.backAttackDamageSnapshot.skillMultiplier - 1) *
              100
            ).toFixed(2)}
            %
          </b>
        </span>
        <span>
          백어택 성공 피해 배율{" "}
          <b>
            {snapshot.backAttackDamageSnapshot.successMultiplier.toFixed(4)}x
          </b>
        </span>
        <span>
          각인 배율{" "}
          <b>
            {snapshot.engravingOutgoingDamageSnapshot.totalMultiplier.toFixed(
              4,
            )}
            x
          </b>
        </span>
        <span>
          돌격대장 피해{" "}
          <b>{snapshot.enemyDamageSnapshot.commanderDamage.toFixed(2)}%</b>
        </span>
        <span>
          악세·팔찌 배율{" "}
          <b>
            {snapshot.enemyDamageSnapshot.accessoriesBraceletMultiplier.toFixed(
              4,
            )}
            x
          </b>
        </span>
        <span>
          아크 그리드 배율{" "}
          <b>{snapshot.enemyDamageSnapshot.arkGridMultiplier.toFixed(4)}x</b>
        </span>
        <span>
          깨달음 배율{" "}
          <b>
            {snapshot.enemyDamageSnapshot.enlightenmentMultiplier.toFixed(4)}x
          </b>
        </span>
        <span>
          집중 스킬 타입 배율{" "}
          <b>{snapshot.focusSkillDamageMultiplier.toFixed(4)}x</b>
        </span>
        <span>
          난무 스킬 타입 배율{" "}
          <b>{snapshot.flurrySkillDamageMultiplier.toFixed(4)}x</b>
        </span>
        <span>
          마나 스킬 각인 배율{" "}
          <b>
            {snapshot.conditionalSkillDamageSnapshot.manaSkill.totalMultiplier.toFixed(
              4,
            )}
            x
          </b>
        </span>
        <span>
          홀딩·캐스팅 각인 배율{" "}
          <b>
            {snapshot.conditionalSkillDamageSnapshot.holdingCastingSkill.totalMultiplier.toFixed(
              4,
            )}
            x
          </b>
        </span>
        <span>
          공격 속도 <b>{snapshot.attackSpeedPercent.toFixed(2)}%</b>
        </span>
        <span>
          이동 속도 <b>{snapshot.moveSpeedPercent.toFixed(2)}%</b>
        </span>
        <span>
          기본 진화형 피해 <b>{(snapshot.evolution * 100).toFixed(2)}%</b>
        </span>
      </div>
      <div className="internal-cycle-damage-debug">
        <strong>전투 사이클 스킬 대미지</strong>
        {cycleDamageRows.length ? (
          <div className="internal-cycle-damage-debug-table">
            <span>스킬</span>
            <span>사용 횟수</span>
            <span>대미지 합계</span>
            <span>1회 평균 대미지</span>
            {cycleDamageRows.map((row) => (
              <Fragment key={row.skillName}>
                <span>{row.skillName}</span>
                <b>{row.count}</b>
                <b>{Math.floor(row.totalDamage).toLocaleString()}</b>
                <b>{Math.floor(row.averageDamage).toLocaleString()}</b>
              </Fragment>
            ))}
          </div>
        ) : (
          <small>전투 사이클이 구성되지 않았습니다.</small>
        )}
      </div>
      <div className="internal-gear-debug-rows">
        {snapshot.internalGearSnapshot.rows.map((row) => (
          <div
            className={row.status === "resolved" ? "" : "unresolved"}
            key={row.slot}
          >
            <strong>{row.slot}</strong>
            <small>
              {row.grade ?? "장비 없음"} · {row.itemLevel ?? "-"} · +
              {row.enhancement ?? 0}
            </small>
            <span>스탯 {format(row.primaryStat)}</span>
            <span>무공 {format(row.weaponAttack)}</span>
            <span>기본공 {format(row.baseAttackFlat)}</span>
            <span>
              기본공%{" "}
              {format(
                row.baseAttackRate === null ? null : row.baseAttackRate * 100,
                "%",
              )}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

function NoticePage() {
  return (
    <section className="workspace information-workspace">
      <div className="workspace-title">
        <span>04</span>
        <div>
          <h1>공지사항</h1>
          <p>서비스 공지와 업데이트 내역을 확인할 수 있습니다.</p>
        </div>
      </div>
      <div className="notice-list">
        {sortedSiteNotices.map((notice) => (
          <article className="notice-card" key={`${notice.date}-${notice.title}`}>
            <div className="notice-card-heading">
              <div className="notice-version-title">
                <span className="notice-version">{notice.version}</span>
                <h2>{notice.title}</h2>
              </div>
              <time>{notice.date}</time>
            </div>
            <ul>
              {notice.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function UsagePage() {
  const guideSteps = [
    {
      number: "01",
      title: "API 키 설정",
      description:
        "API 설정 탭에서 로스트아크 Open API 키를 입력하세요. 개인 PC에서만 사용하는 경우 저장할 수 있으며, 공용 PC에서는 저장하지 않는 것을 권장합니다.",
      image: usageApiImage,
      alt: "API 키 설정 화면",
    },
    {
      number: "02",
      title: "캐릭터 조회",
      description:
        "상단 캐릭터명 입력란에 조회할 캐릭터명을 입력하고 검색하세요. API 기준의 장비, 각인, 아크패시브, 스킬과 보석을 불러옵니다.",
      image: usageSearchImage,
      alt: "캐릭터 조회 결과 화면",
    },
    {
      number: "03",
      title: "장비와 도핑 조정",
      description:
        "기본 장비 탭에서 장비·악세사리·각인·아크패시브·보석을 확인하고 필요한 값만 수정하세요. 좌측 도핑 패널은 체크한 항목만 계산에 반영됩니다.",
      image: usageEquipmentImage,
      alt: "장비 설정 화면",
    },
    {
      number: "04",
      title: "도핑 효과 확인",
      description:
        "도핑 아이콘에 마우스를 올리면 적용 효과를 확인할 수 있습니다. 정열·만찬·아제나 등 사용할 효과를 체크하면 예상 DPS에 즉시 반영됩니다.",
      image: usageDopingImage,
      alt: "도핑 설정 화면",
    },
    {
      number: "05",
      title: "전투 사이클 구성",
      description:
        "우측 전투 사이클 패널에서 현재 사이클에 포함된 스킬과 백어택·쿨타임 비율을 확인하세요. 전체 비율을 일괄 적용하거나 각 스킬의 값을 개별 수정할 수 있습니다.",
      image: usageCycleImage,
      alt: "전투 사이클 구성 패널 화면",
    },
    {
      number: "06",
      title: "스킬 & 전투 사이클 탭",
      description:
        "스킬 & 전투 사이클 탭에서 자동 구성된 사이클과 예상 사이클 시간을 확인하세요. 스킬을 추가하거나 삭제하고, 좌우 이동 버튼으로 사용 순서를 바꿀 수 있습니다. 아래에서는 스킬 레벨·트라이포드·보석과 스킬별 대미지도 조정할 수 있습니다.",
      image: usageSkillCycleImage,
      alt: "스킬 및 전투 사이클 탭 화면",
    },
    {
      number: "07",
      title: "전분 OCR 반영",
      description:
        "전투 사이클 스킬을 먼저 구성한 뒤 패널 하단의 전분 스크린샷 불러오기를 누르세요. 공격 정보 표에서 백어택 적중률과 쿨타임 비율이 보이도록 캡처하면 스킬 아이콘을 기준으로 값을 인식합니다. 인식 결과를 확인하고 적용하세요. 절정 222는 전분 쿨타임 비율을 사용하지 않습니다.",
      image: usageOcrImage,
      alt: "전분 OCR에 사용할 공격 정보 표 예시",
    },
    {
      number: "08",
      title: "세팅 저장과 비교",
      description:
        "원하는 장비·사이클·비율을 구성했다면 헤더에서 전체 세팅을 저장하세요. 세팅 비교에서 저장된 세팅을 선택하면 예상 DPS, 사이클 시간, 스킬별 딜지분과 주요 지표의 차이를 확인할 수 있습니다.",
      image: usageComparisonImage,
      alt: "세팅 비교 화면",
    },
  ];
  return (
    <section className="workspace information-workspace">
      <div className="workspace-title">
        <span>05</span>
        <div>
          <h1>사용법</h1>
          <p>필요한 값만 입력하고 예상 DPS와 세팅 차이를 확인하세요.</p>
        </div>
      </div>
      <div className="usage-guide-grid">
        {guideSteps.map((step) => (
          <article className="usage-guide-card" key={step.number}>
            <span className="usage-guide-step">{step.number}</span>
            <h2>{step.title}</h2>
            <p>{step.description}</p>
            <img className="usage-guide-image" src={step.image.src} alt={step.alt} />
          </article>
        ))}
      </div>
      <p className="usage-guide-note">
        예상 DPS는 선택한 전투 사이클 시간과 스킬별 설정을 기준으로 계산됩니다. 실제
        인게임 결과와는 전투 상황·버프·패턴에 따라 차이가 있을 수 있습니다.
      </p>
    </section>
  );
}

export default function Home() {
  const [supportRageBuff, setSupportRageBuff] = useState(true);
  const [banquetBuff, setBanquetBuff] = useState(true);
  const [blessingFood, setBlessingFood] = useState(false);
  const [wineFood, setWineFood] = useState(false);
  const [azenaBuff, setAzenaBuff] = useState(true);
  const [vulnerableAttribute, setVulnerableAttribute] = useState(false);
  const [criticalRateSynergyEnabled, setCriticalRateSynergyEnabled] =
    useState(false);
  const [criticalRateSynergyValue, setCriticalRateSynergyValue] =
    useState("");
  const [menu, setMenu] = useState<MainMenu>("simulation");
  const [tab, setTab] = useState<SimulationTab>("기본 장비");
  const [apiKey, setApiKey] = useState("");
  const [rememberApiKey, setRememberApiKey] = useState(false);
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [characterName, setCharacterName] = useState("");
  const [character, setCharacter] = useState<CharacterProfile | null>(null);
  const [message, setMessage] = useState(
    "API 설정에서 API 키를 입력한 뒤 캐릭터를 조회하세요.",
  );
  const [searching, setSearching] = useState(false);
  const [cycle, setCycle] = useState<CycleEntry[]>([]);
  const [cycleSkill, setCycleSkill] = useState("");
  const [cyclePresetId, setCyclePresetId] = useState("");
  const automaticCycleKeyRef = useRef<string | null>(null);
  const manualCycleEditRef = useRef(false);
  const restoreSavedCycleRef = useRef(false);
  const dpsScreenshotInputRef = useRef<HTMLInputElement>(null);
  const [dpsScreenshotStatus, setDpsScreenshotStatus] = useState("");
  const [dpsScreenshotPreview, setDpsScreenshotPreview] = useState<
    DpsScreenshotSkillRatio[] | null
  >(null);
  const [cycleSkillRatioSettings, setCycleSkillRatioSettings] =
    useState<CycleSkillRatioSettings>({});
  const [allCycleBackAttack, setAllCycleBackAttack] = useState(true);
  const [allCycleCooldown, setAllCycleCooldown] = useState(true);
  const [allCycleBackAttackRate, setAllCycleBackAttackRate] = useState("90");
  const [allCycleCooldownRate, setAllCycleCooldownRate] = useState("80");
  const [cycleDurationMode, setCycleDurationMode] =
    useState<CycleDurationMode>("guideline");
  const [manualCycleSeconds, setManualCycleSeconds] = useState("");
  const [draggedCycleIndex, setDraggedCycleIndex] = useState<number | null>(
    null,
  );
  const [skillToAdd, setSkillToAdd] = useState("");
  const [visibleSkillIds, setVisibleSkillIds] = useState<string[]>([]);
  const [savedSettings, setSavedSettings] = useState<SavedSetting[]>([]);
  const [comparisonSettingId, setComparisonSettingId] = useState("");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveSettingName, setSaveSettingName] = useState("");
  const [saveOverwriteId, setSaveOverwriteId] = useState("");
  const [gems, setGems] = useState<GemProfile[]>([]);
  const [gemMessage, setGemMessage] = useState("");
  const [stoneEffects, setStoneEffects] = useState<StoneEffect[]>([]);
  const [avatarGrades, setAvatarGrades] = useState<Record<string, string>>({});
  const sharedCombatSnapshot = useMemo(
    () =>
      character
        ? buildUnifiedCombatSnapshot(
            character,
            avatarGrades,
            stoneEffects,
            gems,
            supportRageBuff,
            banquetBuff,
            blessingFood,
            wineFood,
            azenaBuff,
            vulnerableAttribute,
            criticalRateSynergyEnabled,
            criticalRateSynergyValue,
          )
        : null,
    [
      character,
      avatarGrades,
      stoneEffects,
      gems,
      supportRageBuff,
      banquetBuff,
      blessingFood,
      wineFood,
      azenaBuff,
      vulnerableAttribute,
      criticalRateSynergyEnabled,
      criticalRateSynergyValue,
    ],
  );
  const braceletFreeSnapshot = useMemo(
    () =>
      character
        ? buildUnifiedCombatSnapshot(
            {
              ...character,
              equipment: character.equipment.filter(
                (item) => item.slot !== "팔찌",
              ),
            },
            avatarGrades,
            stoneEffects,
            gems,
            supportRageBuff,
            banquetBuff,
            blessingFood,
            wineFood,
            azenaBuff,
            vulnerableAttribute,
            criticalRateSynergyEnabled,
            criticalRateSynergyValue,
          )
        : null,
    [
      character,
      avatarGrades,
      stoneEffects,
      gems,
      supportRageBuff,
      banquetBuff,
      blessingFood,
      wineFood,
      azenaBuff,
      vulnerableAttribute,
      criticalRateSynergyEnabled,
      criticalRateSynergyValue,
    ],
  );
  function applyProfile(profile: CharacterProfile) {
    const cleanProfile = {
      ...profile,
      gems: profile.gems.map(normalizeGem),
      arkPassive: {
        ...profile.arkPassive,
        evolution: profile.arkPassive.evolution.filter(
          (effect): effect is ArkEffectProfile => Boolean(effect),
        ),
        enlightenment: profile.arkPassive.enlightenment
          .filter((effect): effect is ArkEffectProfile => Boolean(effect))
          .map((effect, index) => ({
            ...effect,
            id: `enlightenment-api-${index}-${effect.id}`,
          })),
        leap: profile.arkPassive.leap.filter(
          (effect): effect is ArkEffectProfile => Boolean(effect),
        ),
      },
    };
    cleanProfile.initialCriticalStat = {
      evolutionT1Level:
        cleanProfile.arkPassive.evolution.find(
          (effect) => effect.name === "치명",
        )?.level ?? 0,
      braceletStat: criticalBraceletStat(cleanProfile),
    };
    cleanProfile.initialCombatAttributes = createCombatAttributeSnapshots(
      combatAttributeInput(cleanProfile),
    );
    setCharacter(cleanProfile);
    setCharacterName(cleanProfile.name);
    automaticCycleKeyRef.current = null;
    manualCycleEditRef.current = false;
    setGems(cleanProfile.gems);
    setCycleSkillRatioSettings({});
    setVisibleSkillIds(
      cleanProfile.skills
        .filter(
          (skill) => skill.level >= 2 || alwaysVisibleSkills.has(skill.name),
        )
        .map((skill) => skill.id),
    );
    setStoneEffects(initialStoneEffects(cleanProfile));
    setAvatarGrades(initialAvatarGrades(cleanProfile));
    setGemMessage("");
  }
  useEffect(() => {
    loadLatestCharacter()
      .then((stored) => {
        if (stored) {
          applyProfile(stored.source);
          setMessage(`${stored.source.name}의 저장된 정보를 복원했습니다.`);
        }
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_SETTINGS_KEY);
      if (saved) setSavedSettings(JSON.parse(saved) as SavedSetting[]);
    } catch {
      /* 복원 실패는 무시한다. */
    }
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(API_KEY_STORAGE_KEY);
      if (saved) {
        setApiKey(saved);
        setRememberApiKey(true);
        setHasSavedApiKey(true);
      }
    } catch {
      /* 브라우저 저장소를 사용할 수 없으면 저장 기능만 비활성화한다. */
    }
  }, []);
  const gear =
    character?.equipment.filter((item) => item.category === "gear") ?? [];
  const accessories =
    character?.equipment.filter((item) =>
      ["목걸이", "귀걸이", "반지"].includes(item.slot),
    ) ?? [];
  const stone =
    character?.equipment.find((item) => item.slot === "어빌리티 스톤") ?? null;
  const bracelet =
    character?.equipment.find((item) => item.slot === "팔찌") ?? null;
  const primaryStat = primaryStatFromEquipment(gear);
  const classEngraving = character ? glavierClassEngraving(character) : null;
  const arkGridShorthand = character
    ? deriveGridShorthand(character.arkGrid.cores, classEngraving)
    : null;
  const excludesScreenshotCooldownRatio =
    classEngraving === "절정" && arkGridShorthand === "222";
  const visibleSkills =
    character?.skills.filter((skill) => visibleSkillIds.includes(skill.id)) ??
    [];
  // 사이클 선택지는 현재 스킬 영역에 실제로 노출된 스킬과 완전히 같은 목록을 쓴다.
  // 따라서 사용자가 특정 스킬을 추가하면 별도 목록 갱신 없이 즉시 사이클 선택지에도 나타난다.
  const cycleSkills = visibleSkills;
  const cycleSkillCards = cycle.reduce<SkillProfile[]>((skills, entry) => {
    const skill = visibleSkills.find(
      (candidate) => candidate.name === entry.skillName,
    );
    if (skill && !skills.some((item) => item.name === skill.name)) {
      skills.push(skill);
    }
    return skills;
  }, []);
  const commonCooldownReductionPercent =
    character && sharedCombatSnapshot
      ? commonCooldownReductionRate({
          swiftness:
            sharedCombatSnapshot.combatAttributes["신속"].internalTotal,
          evolution: character.arkPassive.evolution,
          bracelet: character.equipment.find((item) => item.slot === "팔찌"),
        }) * 100
      : 0;
  const cyclePresets = createCyclePresets(
    classEngraving,
    arkGridShorthand,
    character?.arkPassive.evolution.some(
      (effect) => effect.name === "뭉툭한 가시" && (effect.level ?? 0) > 0,
    ) ?? false,
    character?.arkPassive.evolution.some(
      (effect) => effect.name === "마나 용광로" && (effect.level ?? 0) > 0,
    ) ?? false,
  );
  const automaticCyclePreset = cyclePresets[0] ?? null;
  const automaticCycleKey = character
    ? [
        character.name,
        classEngraving ?? "",
        arkGridShorthand ?? "",
        automaticCyclePreset?.id ?? "",
      ].join("|")
    : null;
  const selectedCyclePreset = cyclePresets.find(
    (preset) => preset.id === cyclePresetId,
  );
  const azureDragonCycleIcon =
    visibleSkills.find((skill) => skill.name === "청룡진")?.icon ?? null;
  const yeongaSimGongCycleIcon =
    character?.arkPassive.enlightenment.find(
      (effect) => effect.name === "연가심공",
    )?.icon ?? null;
  const addableSkills =
    character?.skills.filter((skill) => !visibleSkillIds.includes(skill.id)) ??
    [];
  /**
   * 단일 계산 모델: UI 상태를 한 번의 내부 스냅샷으로 고정하고, 디버그와 스킬 UI는
   * 여기서 산출한 결과만 읽는다. API 원본은 applyProfile 단계의 초기값 생성에만 쓰인다.
   */
  const buildSimulationForSnapshot = (
    simulationSnapshot: NonNullable<typeof sharedCombatSnapshot>,
    includeBracelet = true,
  ) => {
    if (!character) return null;
    const evolutionRank =
      character.arkPassive.points.find((point) => point.name === "진화")
        ?.rank ?? null;
    const evolutionLevel = (name: string) =>
      character.arkPassive.evolution.find((effect) => effect.name === name)
        ?.level ?? 0;
    const braceletCooldownIncrease = includeBracelet
      ? braceletCooldownIncreaseRate(
          character.equipment.find((item) => item.slot === "팔찌"),
        )
      : 0;
    const skills = Object.fromEntries(
      visibleSkills.flatMap((skill) => {
        if (!GLAVIER_SKILL_BY_NAME[skill.name]) return [];
        const selectedTripodNames = activeTripodNamesForSkill(skill);
        const skillGems = gems.filter((gem) => gem.skill === skill.name);
        const calculation = calculateSingleSkillDamage({
          base: {
            primaryStat: 6,
            weaponAttack: simulationSnapshot.finalAttackPower ** 2,
            criticalRate: simulationSnapshot.criticalRate,
          },
          effects: [
            {
              id: "enlightenment-incoming-damage",
              label: "연가 표식",
              bucket: "incomingDamage",
              value: simulationSnapshot.incomingDamageMultiplier - 1,
              source: { system: "arkPassive" },
            },
            {
              id: "bracelet-defense-reduction",
              label: "팔찌 방어력 감소",
              bucket: "defenseReduction",
              value: simulationSnapshot.defenseReductionRate,
              source: { system: "bracelet" },
            },
          ],
          target: { defense: simulationSnapshot.targetDefense },
          snapshot: {
            finalAttackPower: simulationSnapshot.finalAttackPower,
            criticalDamageMultiplier:
              simulationSnapshot.criticalDamageMultiplier,
            criticalOutgoingMultiplier:
              simulationSnapshot.criticalOutgoingMultiplier,
            additionalDamageMultiplier:
              1 + simulationSnapshot.additionalDamageSnapshot.total / 100,
            specificTypeDamageMultiplier:
              1 + simulationSnapshot.specificTypeDamageSnapshot.total / 100,
            cardAttributeDamageMultiplier:
              simulationSnapshot.cardAttributeDamageSnapshot.totalMultiplier,
            commonEnemyDamageMultiplier:
              simulationSnapshot.enemyDamageSnapshot.totalMultiplier,
            backAttackSkillDamageMultiplier:
              simulationSnapshot.backAttackDamageSnapshot.skillMultiplier,
            backAttackSuccessDamageMultiplier:
              simulationSnapshot.backAttackDamageSnapshot.successMultiplier,
            focusSkillDamageMultiplier:
              simulationSnapshot.focusSkillDamageMultiplier,
            flurrySkillDamageMultiplier:
              simulationSnapshot.flurrySkillDamageMultiplier,
            manaSkillDamageMultiplier:
              simulationSnapshot.conditionalSkillDamageSnapshot.manaSkill
                .totalMultiplier,
            holdingCastingSkillDamageMultiplier:
              simulationSnapshot.conditionalSkillDamageSnapshot
                .holdingCastingSkill.totalMultiplier,
            superChargeSkillDamageMultiplier:
              simulationSnapshot.conditionalSkillDamageSnapshot
                .superChargeSkill.totalMultiplier,
            arkGridOrderSkillEffects:
              simulationSnapshot.arkGridOrderSkillEffects,
          },
          evolutionContext: {
            evolution: character.arkPassive.evolution,
            enlightenment: character.arkPassive.enlightenment,
            evolutionRank,
            attackSpeedPercent: simulationSnapshot.attackSpeedPercent,
            moveSpeedPercent: simulationSnapshot.moveSpeedPercent,
            supportRageBuff,
          },
          leapEffects: character.arkPassive.leap,
          skill: {
            name: skill.name,
            level: skill.level,
            selectedTripodNames,
            gems: skillGems,
          },
        });
        const baseCooldown = resolveGlavierSkillCooldown({
          skillName: skill.name,
          selectedTripodNames,
        });
        const catalogSkill = getGlavierSkill(skill.name);
        const manaCooldownReduction = catalogSkill?.tags.mana
          ? (evolutionLevel("끝없는 마나") +
              evolutionLevel("무한한 마력")) *
            0.07
          : 0;
        const awakeningCooldownReduction =
          skill.name === "맹룡난무" || skill.name === "적룡필살"
            ? (character.arkPassive.leap.find(
                (effect) => effect.name === "잠재력 해방",
              )?.level ?? 0) * 0.02
            : 0;
        const cooldown = baseCooldown
          ? {
              ...baseCooldown,
              cooldownSeconds: applyCooldownReductionRates(
                baseCooldown.cooldownSeconds +
                  calculation.arkGridOrder.cooldownFlatSeconds,
                [
                  cooldownGemReductionRate(skillGems),
                  simulationSnapshot.combatAttributes["신속"].internalTotal *
                    0.000215,
                  manaCooldownReduction,
                  evolutionLevel("최적화 훈련") * 0.04,
                  evolutionLevel("타이밍 지배") * 0.05,
                  awakeningCooldownReduction,
                  -braceletCooldownIncrease,
                ],
              ),
            }
          : baseCooldown;
        return [
          [
            skill.id,
            {
              calculation,
              cooldown,
            },
          ],
        ];
      }),
    ) as Record<
      string,
      {
        calculation: SingleSkillCalculationResult;
        cooldown: ReturnType<typeof resolveGlavierSkillCooldown>;
      }
    >;
    return { snapshot: simulationSnapshot, skills };
  };
  const unifiedSimulation = useMemo(
    () =>
      character && sharedCombatSnapshot
        ? buildSimulationForSnapshot(sharedCombatSnapshot)
        : null,
    [character, gems, sharedCombatSnapshot, supportRageBuff, visibleSkills],
  );
  const braceletFreeSimulation = useMemo(
    () =>
      braceletFreeSnapshot
        ? buildSimulationForSnapshot(braceletFreeSnapshot, false)
        : null,
    [character, gems, braceletFreeSnapshot, supportRageBuff, visibleSkills],
  );
  useEffect(() => {
    if (!character || !unifiedSimulation) return;
    if (restoreSavedCycleRef.current) {
      restoreSavedCycleRef.current = false;
      automaticCycleKeyRef.current = automaticCycleKey;
      return;
    }
    const preset = cyclePresets[0] ?? null;
    if (automaticCycleKeyRef.current === automaticCycleKey) {
      return;
    } else {
      manualCycleEditRef.current = false;
    }
    automaticCycleKeyRef.current = automaticCycleKey;
    if (!preset) {
      setCyclePresetId("");
      setCycle([]);
      return;
    }
    const available = new Map(
      character.skills.map((skill) => [skill.name, skill.id]),
    );
    setVisibleSkillIds((current) => [
      ...current,
      ...preset.entries
        .map((entry) => available.get(entry.skillName))
        .filter(
          (skillId): skillId is string =>
            skillId !== undefined && !current.includes(skillId),
        ),
    ]);
    setCyclePresetId(preset.id);
    setCycle(
      preset.entries
        .filter((entry) => available.has(entry.skillName))
        .map((entry) => ({ ...entry, id: crypto.randomUUID() })),
    );
  }, [
    automaticCycleKey,
    character,
  ]);
  const guidelineCycleSeconds = (() => {
    if (!selectedCyclePreset || !unifiedSimulation) return null;
    const targetSkillName =
      selectedCyclePreset.id === "jeoljeong-222" ? "적룡필살" : "적룡포";
    const targetCooldown = Object.values(unifiedSimulation.skills).find(
      (entry) => entry.calculation.skill.name === targetSkillName,
    )?.cooldown?.cooldownSeconds;
    if (targetCooldown === undefined) return null;
    return selectedCyclePreset.id === "jeoljeong-222"
      ? targetCooldown
      : targetCooldown * 3;
  })();
  const selectedCycleSeconds =
    cycleDurationMode === "guideline"
      ? guidelineCycleSeconds
      : Number(manualCycleSeconds);
  const cycleSeconds =
    typeof selectedCycleSeconds === "number" &&
    Number.isFinite(selectedCycleSeconds)
      ? selectedCycleSeconds
      : 0;
  const calculateCycleDamageRows = (
    simulation: typeof unifiedSimulation,
  ) => {
    if (!simulation || cycle.length === 0) return [];
    const rows = new Map<
      string,
      { skillName: string; count: number; totalDamage: number }
    >();
    cycle.forEach((entry) => {
      const skill = visibleSkills.find(
        (candidate) => candidate.name === entry.skillName,
      );
      if (!skill) return;
      const simulationSkill = simulation.skills[skill.id];
      if (!simulationSkill) return;
      const ratios = cycleSkillRatioSettings[skill.name] ?? {
        backAttackRate: "0",
        cooldownRate: "0",
      };
      const backAttackRate = allCycleBackAttack
        ? Math.min(100, Math.max(0, Number(allCycleBackAttackRate) || 0))
        : Math.min(100, Math.max(0, Number(ratios.backAttackRate) || 0));
      const cooldownRate = allCycleCooldown
        ? Math.min(100, Math.max(0, Number(allCycleCooldownRate) || 0))
        : Math.min(100, Math.max(0, Number(ratios.cooldownRate) || 0));
      const scenarioFor = (backAttack: boolean) =>
        simulationSkill.calculation.scenarios.find(
          (scenario) =>
            scenario.conditions.azureDragonBuff === entry.azureDragon &&
            scenario.conditions.yeongaSimGong === entry.yeongaSimGong &&
            scenario.conditions.backAttack === backAttack,
        );
      const nonBackAttackScenario = scenarioFor(false);
      const backAttackScenario = scenarioFor(true) ?? nonBackAttackScenario;
      if (!nonBackAttackScenario || !backAttackScenario) return;
      const successWeight = backAttackRate / 100;
      const expectedSkillDamage =
        nonBackAttackScenario.averageDamage * (1 - successWeight) +
        backAttackScenario.averageDamage * successWeight;
      const current = rows.get(skill.name) ?? {
        skillName: skill.name,
        count: 0,
        totalDamage: 0,
      };
      current.count += 1;
      current.totalDamage += expectedSkillDamage * (cooldownRate / 100);
      rows.set(skill.name, current);
    });
    return [...rows.values()].map((row) => ({
      ...row,
      averageDamage: row.totalDamage / row.count,
    }));
  };
  const cycleDamageRows = calculateCycleDamageRows(unifiedSimulation);
  const braceletFreeCycleDamageRows =
    calculateCycleDamageRows(braceletFreeSimulation);
  const expectedDps =
    cycleSeconds > 0 && cycleDamageRows.length > 0
      ? cycleDamageRows.reduce((total, row) => total + row.totalDamage, 0) /
        cycleSeconds
      : null;
  const braceletFreeExpectedDps =
    cycleSeconds > 0 && braceletFreeCycleDamageRows.length > 0
      ? braceletFreeCycleDamageRows.reduce(
          (total, row) => total + row.totalDamage,
          0,
        ) / cycleSeconds
      : null;
  const braceletEfficiency =
    expectedDps !== null &&
    braceletFreeExpectedDps !== null &&
    braceletFreeExpectedDps > 0
      ? (expectedDps / braceletFreeExpectedDps - 1) * 100
      : null;
  const cycleTotalDamage = cycleDamageRows.reduce(
    (total, row) => total + row.totalDamage,
    0,
  );
  const cycleRatioFor = (
    skillName: string,
    key: "backAttackRate" | "cooldownRate",
  ) => {
    const isGlobal =
      key === "backAttackRate" ? allCycleBackAttack : allCycleCooldown;
    const globalValue =
      key === "backAttackRate"
        ? allCycleBackAttackRate
        : allCycleCooldownRate;
    const configuredValue = cycleSkillRatioSettings[skillName]?.[key] ?? "0";
    const numericValue = Number(isGlobal ? globalValue : configuredValue);
    return Math.min(100, Math.max(0, Number.isFinite(numericValue) ? numericValue : 0));
  };
  const weightedCycleRatio = (key: "backAttackRate" | "cooldownRate") =>
    cycleTotalDamage > 0
      ? cycleDamageRows.reduce(
          (total, row) =>
            total +
            (row.totalDamage / cycleTotalDamage) * cycleRatioFor(row.skillName, key),
          0,
        )
      : 0;
  const currentComparisonSummary: SavedSettingComparisonSummary | null =
    character && sharedCombatSnapshot
      ? {
          classLabel: classEngraving ?? character.className,
          coreLabel: arkGridShorthand,
          expectedDps,
          cycleSeconds,
          skills:
            cycleTotalDamage > 0
              ? cycleDamageRows
                  .map((row) => ({
                    skillName: row.skillName,
                    damageShare: (row.totalDamage / cycleTotalDamage) * 100,
                    averageDamage: row.averageDamage,
                    usesPerMinute:
                      cycleSeconds > 0 ? (row.count * 60) / cycleSeconds : 0,
                  }))
                  .sort((a, b) => b.damageShare - a.damageShare)
              : [],
          finalAttackPower: sharedCombatSnapshot.finalAttackPower,
          baseCriticalRate:
            sharedCombatSnapshot.criticalRateSnapshot.total * 100,
          attackSpeedPercent: sharedCombatSnapshot.attackSpeedPercent,
          moveSpeedPercent: sharedCombatSnapshot.moveSpeedPercent,
          criticalDamagePercent:
            sharedCombatSnapshot.criticalDamageMultiplier * 100,
          braceletEfficiency,
          averageBackAttackRate: weightedCycleRatio("backAttackRate"),
          averageCooldownRate: weightedCycleRatio("cooldownRate"),
        }
      : null;
  const comparisonSetting = savedSettings.find(
    (setting) => setting.id === comparisonSettingId && setting.snapshot,
  );
  const comparisonTargetSummary = comparisonSetting?.snapshot?.comparisonSummary;
  const comparisonDelta = (current: number, target: number) => {
    if (!target || current === target) return null;
    const delta = (current / target - 1) * 100;
    return Math.abs(Number(delta.toFixed(2))) === 0 ? null : delta.toFixed(2);
  };
  const comparisonDifference = (
    current: number,
    target: number,
    suffix: string,
  ) => {
    const difference = current - target;
    return `${difference >= 0 ? "+" : ""}${difference.toFixed(2)}${suffix}`;
  };
  function exportDebugJson() {
    if (!character || !sharedCombatSnapshot) return;
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      character: {
        name: character.name,
        server: character.server,
        className: character.className,
        buildName: character.buildName,
        level: character.level,
        apiCombatPower: character.apiCombatPower,
        equipment: character.equipment,
        engravings: character.engravingDetails,
        avatars: character.avatars,
        gems,
        arkPassive: character.arkPassive,
        arkGrid: character.arkGrid,
      },
      uiSettings: {
        supportRageBuff,
        banquetBuff,
        blessingFood,
        wineFood,
        azenaBuff,
        vulnerableAttribute,
        stoneEffects,
        avatarGrades,
        cyclePresetId,
        cycleDurationMode,
        manualCycleSeconds,
        cycle,
        cycleSkillRatioSettings,
        allCycleBackAttack,
        allCycleCooldown,
        allCycleBackAttackRate,
        allCycleCooldownRate,
      },
      formulas: {
        expectedDps:
          "sum(스킬별 사이클 대미지 합계) / 선택 사이클 시간",
        skillCycleDamage:
          "스킬 시나리오 평균 대미지 × 백어택 비율 × 쿨타임 비율",
        skillDamage:
          "(최종 공격력 × 모션 배율 + 모션 상수) × 트라이포드 배율 × 보석 배율 × 진화형 피해 × 공통 배율",
      },
      calculation: {
        expectedDps,
        cycleSeconds,
        guidelineCycleSeconds,
        selectedCycleSeconds,
        cycleDamageRows,
        combatSnapshot: sharedCombatSnapshot,
        unifiedSimulation,
      },
    };
    const json = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${character.name}-dps-debug-${new Date()
      .toISOString()
      .replaceAll(":", "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const engravingNames = ENGRAVING_NAMES;
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey.trim()) {
      setMenu("api");
      setMessage("먼저 API 설정에서 키를 입력해주세요.");
      return;
    }
    if (!characterName.trim()) {
      setMessage("캐릭터명을 입력해주세요.");
      return;
    }
    setSearching(true);
    setMessage("로스트아크 API에서 캐릭터 정보를 불러오는 중입니다...");
    try {
      const profile = mapCharacterResponse(
        await fetchCharacter(characterName.trim(), apiKey.trim()),
      );
      applyProfile(profile);
      setCycle([]);
      await saveCharacter(profile);
      setMessage("캐릭터 정보와 현재 세팅을 불러왔습니다.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setSearching(false);
    }
  }
  function updateApiKey(value: string) {
    setApiKey(value);
    if (!rememberApiKey) return;
    try {
      if (value.trim()) {
        localStorage.setItem(API_KEY_STORAGE_KEY, value.trim());
        setHasSavedApiKey(true);
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        setHasSavedApiKey(false);
      }
    } catch {
      setMessage("브라우저 저장소에 API 키를 저장하지 못했습니다.");
    }
  }
  function updateCycleSkillRatio(
    skillName: string,
    key: "backAttackRate" | "cooldownRate",
    value: string,
  ) {
    if (value === "") {
      setCycleSkillRatioSettings((current) => ({
        ...current,
        [skillName]: {
          backAttackRate: current[skillName]?.backAttackRate ?? "0",
          cooldownRate: current[skillName]?.cooldownRate ?? "0",
          [key]: "",
        },
      }));
      return;
    }
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    const clampedValue = Math.min(100, Math.max(0, numericValue));
    setCycleSkillRatioSettings((current) => ({
      ...current,
      [skillName]: {
        backAttackRate: current[skillName]?.backAttackRate ?? "0",
        cooldownRate: current[skillName]?.cooldownRate ?? "0",
        [key]: String(clampedValue),
      },
    }));
  }
  async function applyDpsScreenshot(file: File) {
    if (!cycleSkillCards.length) {
      setDpsScreenshotStatus("전분을 반영할 전투 사이클 스킬을 먼저 구성해주세요.");
      return;
    }

    setDpsScreenshotStatus("전분 스크린샷을 분석하는 중...");
    try {
      const screenshotRatioSkills = cycleSkillCards.filter(
        (skill) => skill.name !== "청룡진",
      );
      const iconRatios = await extractDpsScreenshotRatiosByIcon(
        file,
        screenshotRatioSkills,
      );
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("kor+eng");
      let textRatios: DpsScreenshotSkillRatio[] = [];
      try {
        const preparedImage = await preprocessDpsScreenshot(file);
        const originalResult = await worker.recognize(file);
        const preparedResult = await worker.recognize(preparedImage);
        const originalRatios = parseDpsScreenshotSkillRatios(
          originalResult.data.text,
          screenshotRatioSkills.map((skill) => skill.name),
        );
        const preparedRatios = parseDpsScreenshotSkillRatios(
          preparedResult.data.text,
          screenshotRatioSkills.map((skill) => skill.name),
        );
        textRatios = [
          ...new Map(
            [...preparedRatios, ...originalRatios].map((ratio) => [
              ratio.skillName,
              ratio,
            ]),
          ).values(),
        ];
      } finally {
        await worker.terminate();
      }
      const ratios = [
        ...new Map(
          [...textRatios, ...iconRatios].map((ratio) => [
            ratio.skillName,
            ratio,
          ]),
        ).values(),
      ];
      if (!ratios.length) {
        setDpsScreenshotStatus(
          "스킬 아이콘과 비율을 찾지 못했습니다. 공격 정보 탭 전체가 보이는 전분 스크린샷을 사용해주세요.",
        );
        return;
      }

      setDpsScreenshotPreview(ratios);
      setDpsScreenshotStatus(
        `${ratios.length}개 스킬을 인식했습니다. 값을 확인한 뒤 적용해주세요.`,
      );
    } catch {
      setDpsScreenshotStatus(
        "전분 스크린샷을 분석하지 못했습니다. 네트워크 연결과 이미지 상태를 확인해주세요.",
      );
    }
  }
  async function importDpsScreenshot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await applyDpsScreenshot(file);
  }
  function confirmDpsScreenshotPreview() {
    if (!dpsScreenshotPreview?.length) return;
    setAllCycleBackAttack(false);
    if (!excludesScreenshotCooldownRatio) {
      setAllCycleCooldown(false);
    }
    setCycleSkillRatioSettings((current) => {
      const next = { ...current };
      dpsScreenshotPreview.forEach((ratio) => {
        const currentRatio = current[ratio.skillName];
        next[ratio.skillName] = {
          backAttackRate: ratio.backAttackRate.toFixed(2),
          cooldownRate: excludesScreenshotCooldownRatio
            ? (currentRatio?.cooldownRate ??
              (allCycleCooldown ? allCycleCooldownRate : "0"))
            : ratio.cooldownRate.toFixed(2),
        };
      });
      return next;
    });
    setDpsScreenshotStatus(
      excludesScreenshotCooldownRatio
        ? `${dpsScreenshotPreview.length}개 스킬의 백어택 비율을 반영했습니다. 절정 222는 쿨타임 비율을 제외합니다.`
        : `${dpsScreenshotPreview.length}개 스킬의 전분 비율을 반영했습니다.`,
    );
    setDpsScreenshotPreview(null);
  }
  function toggleApiKeyRemember(checked: boolean) {
    if (checked && !apiKey.trim()) {
      setMessage("저장할 API 키를 먼저 입력해주세요.");
      return;
    }
    try {
      if (checked) {
        localStorage.setItem(API_KEY_STORAGE_KEY, apiKey.trim());
        setHasSavedApiKey(true);
        setMessage("이 브라우저에 API 키를 저장했습니다.");
      } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
        setHasSavedApiKey(false);
        setMessage("저장된 API 키를 삭제했습니다.");
      }
      setRememberApiKey(checked);
    } catch {
      setMessage("브라우저 저장소를 사용할 수 없습니다.");
    }
  }
  function removeSavedApiKey() {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      setApiKey("");
      setRememberApiKey(false);
      setHasSavedApiKey(false);
      setMessage("저장된 API 키를 삭제했습니다.");
    } catch {
      setMessage("브라우저 저장소를 사용할 수 없습니다.");
    }
  }
  function updateEquipment(id: string, patch: Partial<EquipmentProfile>) {
    setCharacter((current) =>
      current
        ? {
            ...current,
            equipment: current.equipment.map((item) =>
              item.id === id ? { ...item, ...patch } : item,
            ),
          }
        : current,
    );
  }
  function updateAllGearEnhancement(level: number) {
    setCharacter((current) =>
      current
        ? {
            ...current,
            equipment: current.equipment.map((item) =>
              item.category === "gear" && item.slot !== "완갑"
                ? { ...item, enhancement: level }
                : item,
            ),
          }
        : current,
    );
  }
  function updateEngraving(index: number, patch: Partial<EngravingProfile>) {
    setCharacter((current) => {
      if (!current) return current;
      const details = current.engravingDetails.map((engraving, itemIndex) =>
        itemIndex === index
          ? {
              ...engraving,
              ...patch,
              level:
                patch.grade === "전설" ? 4 : (patch.level ?? engraving.level),
              icon: patch.name ? engravingIcon(patch.name) : engraving.icon,
            }
          : engraving,
      );
      return {
        ...current,
        engravingDetails: details,
        engravings: details.map((engraving) => engraving.name),
      };
    });
  }
  function updatePassive(
    group: PassiveGroup,
    index: number,
    patch: Partial<ArkEffectProfile>,
  ) {
    setCharacter((current) => {
      if (!current) return current;
      const effects = current.arkPassive[group].filter(
        (effect): effect is ArkEffectProfile => Boolean(effect),
      );
      let targetIndex = Math.min(index, effects.length);

      // T2~T5는 전체 evolution 배열의 위치가 화면 행 순서와 다르므로
      // 기존 항목 수정은 안정적인 effect id로 찾는다.
      if (
        group === "evolution" &&
        patch.id &&
        !patch.id.startsWith("evolution-t1-editor-")
      ) {
        const identifiedIndex = effects.findIndex(
          (effect) => effect.id === patch.id,
        );
        if (identifiedIndex >= 0) targetIndex = identifiedIndex;
      }

      // T1은 evolution 배열 안에 T2~T5가 함께 저장된다. 따라서 배열의
      // 전체 index가 아니라 T1 슬롯 순서만으로 대상 위치를 결정한다.
      if (group === "evolution") {
        const isT1 = (effect: ArkEffectProfile) =>
          EVOLUTION_T1_OPTIONS.some((option) => option.name === effect.name);
        const t1Indexes = effects
          .map((effect, effectIndex) => (isT1(effect) ? effectIndex : -1))
          .filter((effectIndex) => effectIndex >= 0);
        const isT1EditorPatch =
          patch.id?.startsWith("evolution-t1-editor-") ?? false;
        if (
          isT1EditorPatch ||
          (patch.name &&
            isT1({
              id: "candidate",
              name: patch.name,
              level: 0,
              grade: null,
              icon: null,
              description: null,
            }))
        ) {
          targetIndex = t1Indexes[index] ?? effects.length;
        }
      }

      const existing = effects[targetIndex] ?? {
        id: `${group}-slot-${targetIndex}`,
        name: "없음",
        level: 0,
        grade: null,
        icon: null,
        description: null,
      };
      effects[targetIndex] = {
        ...existing,
        ...patch,
        id: existing.id || `${group}-slot-${targetIndex}`,
      };
      return {
        ...current,
        arkPassive: { ...current.arkPassive, [group]: effects },
      };
    });
  }
  function updateCore(index: number, patch: Partial<ArkGridCoreProfile>) {
    setCharacter((current) => {
      if (!current) return current;
      const cores = current.arkGrid.cores.map((core, coreIndex) =>
        coreIndex === index ? { ...core, ...patch } : core,
      );
      return {
        ...current,
        arkGrid: {
          ...current.arkGrid,
          cores,
          shorthand: deriveGridShorthand(cores, glavierClassEngraving(current)),
        },
      };
    });
  }
  function addGem(
    skillName = visibleSkills[0]?.name ?? "",
    type: "겁화" | "작열" = "겁화",
  ) {
    if (gems.length >= 11) {
      setGemMessage("보석은 최대 11개까지만 선택할 수 있습니다.");
      return;
    }
    setGems((current) => [
      ...current,
      {
        id: `custom-${crypto.randomUUID()}`,
        name: `${type} 보석`,
        type,
        level: 10,
        grade: "고대",
        icon: null,
        skill: skillName,
        effect: null,
      },
    ]);
    setGemMessage("");
  }
  function updateGem(id: string, patch: Partial<GemProfile>) {
    setGems((current) =>
      current.map((gem) =>
        gem.id === id ? normalizeGem({ ...gem, ...patch }) : gem,
      ),
    );
  }
  function updateAllGemLevels(level: number) {
    setGems((current) => current.map((gem) => normalizeGem({ ...gem, level })));
    setGemMessage("");
  }
  function updateSkill(id: string, patch: Partial<SkillProfile>) {
    setCharacter((current) =>
      current
        ? {
            ...current,
            skills: current.skills.map((skill) =>
              skill.id === id ? { ...skill, ...patch } : skill,
            ),
          }
        : current,
    );
  }
  function addSkillToList() {
    if (!skillToAdd) return;
    updateSkill(skillToAdd, { level: 2 });
    setVisibleSkillIds((current) =>
      current.includes(skillToAdd) ? current : [...current, skillToAdd],
    );
    setSkillToAdd("");
  }
  function openSaveSettingDialog() {
    if (!character) return;
    setSaveSettingName(`${character.name} 세팅 ${savedSettings.length + 1}`);
    setSaveOverwriteId("");
    setSaveDialogOpen(true);
  }
  function toggleAllCycleRatio(
    key: "backAttackRate" | "cooldownRate",
    checked: boolean,
  ) {
    if (!checked) {
      const globalValue =
        key === "backAttackRate"
          ? allCycleBackAttackRate
          : allCycleCooldownRate;
      setCycleSkillRatioSettings((current) => {
        const next = { ...current };
        cycleSkillCards.forEach((skill) => {
          const existing = next[skill.name];
          next[skill.name] = {
            backAttackRate: existing?.backAttackRate ?? "0",
            cooldownRate: existing?.cooldownRate ?? "0",
            [key]: globalValue,
          };
        });
        return next;
      });
    }
    if (key === "backAttackRate") {
      setAllCycleBackAttack(checked);
      return;
    }
    setAllCycleCooldown(checked);
  }

  function currentSettingSnapshot(): SavedSettingSnapshot | null {
    if (!character) return null;
    return JSON.parse(
      JSON.stringify({
        character,
        gems,
        stoneEffects,
        avatarGrades,
        visibleSkillIds,
        cycle,
        cyclePresetId,
        cycleDurationMode,
        manualCycleSeconds,
        cycleSkillRatioSettings,
        allCycleBackAttack,
        allCycleCooldown,
        allCycleBackAttackRate,
        allCycleCooldownRate,
        supportRageBuff,
        banquetBuff,
        blessingFood,
        wineFood,
        azenaBuff,
        vulnerableAttribute,
        criticalRateSynergyEnabled,
        criticalRateSynergyValue,
        comparisonSummary: currentComparisonSummary ?? undefined,
      }),
    ) as SavedSettingSnapshot;
  }

  function saveCurrentSetting() {
    const snapshot = currentSettingSnapshot();
    if (!character || !snapshot) return;
    const name = saveSettingName.trim() || `${character.name} 세팅`;
    const savedAt = new Date().toLocaleString("ko-KR");
    const isOverwriting = Boolean(saveOverwriteId);
    setSavedSettings((current) => {
      const overwrite = current.find((setting) => setting.id === saveOverwriteId);
      const setting: SavedSetting = {
        id: overwrite?.id ?? crypto.randomUUID(),
        name,
        cycle: cycle.map((entry) => entry.skillName),
        itemLevel: character.level,
        attackPower:
          sharedCombatSnapshot?.finalAttackPowerSnapshot.total.toFixed(2) ??
          "0",
        savedAt,
        snapshot,
      };
      const next = overwrite
        ? current.map((candidate) =>
            candidate.id === overwrite.id ? setting : candidate,
          )
        : [...current, setting];
      localStorage.setItem(SAVED_SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
    setSaveDialogOpen(false);
    setMessage(`'${name}' 세팅을 ${isOverwriting ? "덮어써서" : "새로"} 저장했습니다.`);
  }

  function deleteSavedSetting(id: string) {
    const setting = savedSettings.find((candidate) => candidate.id === id);
    if (!setting) return;
    if (!window.confirm(`'${setting.name}' 세팅을 삭제할까요?`)) return;
    const next = savedSettings.filter((candidate) => candidate.id !== id);
    setSavedSettings(next);
    localStorage.setItem(SAVED_SETTINGS_KEY, JSON.stringify(next));
    if (comparisonSettingId === id) setComparisonSettingId("");
    if (saveOverwriteId === id) {
      setSaveOverwriteId("");
      setSaveSettingName("");
    }
    setMessage(`'${setting.name}' 세팅을 삭제했습니다.`);
  }

  function loadSavedSetting(id: string) {
    const setting = savedSettings.find((candidate) => candidate.id === id);
    if (!setting?.snapshot) {
      setMessage("이전 형식으로 저장된 세팅입니다. 현재 세팅을 다시 저장해주세요.");
      return;
    }
    if (!window.confirm(`'${setting.name}' 세팅을 불러올까요? 현재 편집 내용은 덮어씁니다.`)) {
      return;
    }
    const snapshot = JSON.parse(
      JSON.stringify(setting.snapshot),
    ) as SavedSettingSnapshot;
    restoreSavedCycleRef.current = true;
    manualCycleEditRef.current = true;
    setCharacter(snapshot.character);
    setCharacterName(snapshot.character.name);
    setGems(snapshot.gems);
    setStoneEffects(snapshot.stoneEffects);
    setAvatarGrades(snapshot.avatarGrades);
    setVisibleSkillIds(snapshot.visibleSkillIds);
    setCycle(snapshot.cycle);
    setCyclePresetId(snapshot.cyclePresetId);
    setCycleDurationMode(snapshot.cycleDurationMode);
    setManualCycleSeconds(snapshot.manualCycleSeconds);
    setCycleSkillRatioSettings(snapshot.cycleSkillRatioSettings);
    setAllCycleBackAttack(snapshot.allCycleBackAttack);
    setAllCycleCooldown(snapshot.allCycleCooldown);
    setAllCycleBackAttackRate(snapshot.allCycleBackAttackRate);
    setAllCycleCooldownRate(snapshot.allCycleCooldownRate);
    setSupportRageBuff(snapshot.supportRageBuff);
    setBanquetBuff(snapshot.banquetBuff);
    setBlessingFood(snapshot.blessingFood);
    setWineFood(snapshot.wineFood);
    setAzenaBuff(snapshot.azenaBuff);
    setVulnerableAttribute(snapshot.vulnerableAttribute);
    setCriticalRateSynergyEnabled(snapshot.criticalRateSynergyEnabled);
    setCriticalRateSynergyValue(snapshot.criticalRateSynergyValue);
    setTab("기본 장비");
    setMenu("simulation");
    setMessage(`'${setting.name}' 세팅을 불러왔습니다.`);
  }

  return (
    <main className="shell simulator-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">G</span>
          <div>
            <strong>창술사 DPS</strong>
            <small>시뮬레이터 · v{appVersion}</small>
          </div>
        </div>
        <nav className="main-menu">
          {[
            ["simulation", "시뮬레이션"],
            ["api", "API 설정"],
            ["notice", "공지사항"],
            ["guide", "사용법"],
          ].map(([id, label]) => (
            <button
              type="button"
              className={menu === id ? "active" : ""}
              onClick={() => setMenu(id as MainMenu)}
              key={id}
            >
              {label}
            </button>
          ))}
          <div className="header-character-search">
            <form onSubmit={search}>
              <input
                aria-label="캐릭터명"
                value={characterName}
                onChange={(event) => setCharacterName(event.target.value)}
                placeholder="캐릭터명 입력"
                maxLength={24}
              />
              <button type="submit" disabled={searching}>
                {searching ? "조회 중" : "검색"}
              </button>
            </form>
          </div>
        </nav>
      </header>
      {menu === "notice" ? (
        <NoticePage />
      ) : menu === "guide" ? (
        <UsagePage />
      ) : menu === "api" ? (
        <section className="workspace api-workspace">
          <div className="workspace-title">
            <span>03</span>
            <div>
              <h1>API 설정</h1>
              <p>
                선택하면 API 키를 현재 브라우저의 localStorage에 저장해 다음
                접속에도 사용합니다.
              </p>
            </div>
          </div>
          <label className="api-field">
            Lost Ark API Key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => updateApiKey(event.target.value)}
              placeholder="API 키 또는 bearer API 키"
              autoComplete="off"
            />
          </label>
          <div className="api-storage-controls">
            <label>
              <input
                type="checkbox"
                checked={rememberApiKey}
                onChange={(event) => toggleApiKeyRemember(event.target.checked)}
              />{" "}
              이 브라우저에 API 키 저장
            </label>
            {hasSavedApiKey ? (
              <>
                <span>
                  저장됨 ·{" "}
                  {apiKey.length > 8
                    ? `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`
                    : "••••••••"}
                </span>
                <button type="button" onClick={removeSavedApiKey}>
                  저장된 키 삭제
                </button>
              </>
            ) : (
              <span>저장하지 않음</span>
            )}
          </div>
          <p className="api-storage-note">
            공용 PC에서는 저장하지 마세요. 키는 이 브라우저에서만 사용됩니다.
          </p>
          <a
            className="guide-link"
            href="https://developer-lostark.game.onstove.com/"
            target="_blank"
            rel="noreferrer"
          >
            로스트아크 Open API 키 발급 가이드 ↗
          </a>
        </section>
      ) : null}
      {menu === "simulation" ? (
        <>
          {character ? (
            <section className="workspace simulation-workspace">
              <div className="profile-strip">
                <Artwork icon={character.characterImage} label="⚔" />
                <div className="profile-identity">
                  <span>
                    {character.server} · {character.className}
                  </span>
                  <h1>{character.name}</h1>
                </div>
                <div
                  className="profile-combat-summary"
                  aria-label="현재 계산 스냅샷 요약"
                >
                  <div className="profile-build">
                    <span>직업 · 코어</span>
                    <strong>
                      {classEngraving ?? character.className}
                      {arkGridShorthand ? ` ${arkGridShorthand}` : " · 미구성"}
                    </strong>
                  </div>
                  <div className="profile-dps">
                    <span>예상 DPS</span>
                    <strong>
                      {expectedDps === null
                        ? "계산 준비 중"
                        : Math.floor(expectedDps).toLocaleString()}
                    </strong>
                  </div>
                  <div className="profile-attributes">
                    {(["특화", "신속", "치명", "제압"] as const).map(
                      (name) => (
                        <span key={name}>
                          {name}{" "}
                          <b>
                            {sharedCombatSnapshot!.combatAttributes[
                              name
                            ].internalTotal.toLocaleString()}
                          </b>
                        </span>
                      ),
                    )}
                  </div>
                  <div>
                    <span>최종 공격력</span>
                    <strong>
                      {Math.floor(
                        sharedCombatSnapshot!.finalAttackPower,
                      ).toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span>기본 치적</span>
                    <strong>
                      {ceilPercentToTwoDecimals(
                        sharedCombatSnapshot!.criticalRateSnapshot.total * 100
                      ).toFixed(2)}
                      %
                    </strong>
                  </div>
                  <div>
                    <span>공속 / 이속</span>
                    <strong>
                      {sharedCombatSnapshot!.attackSpeedPercent.toFixed(2)}% /{" "}
                      {sharedCombatSnapshot!.moveSpeedPercent.toFixed(2)}%
                    </strong>
                  </div>
                  <div>
                    <span>팔찌 효율</span>
                    <strong>
                      {braceletEfficiency === null
                        ? "계산 준비 중"
                        : `${braceletEfficiency.toFixed(2)}%`}
                    </strong>
                  </div>
                  <div className="profile-api-combat-power">
                    <span>전투력 · API</span>
                    <strong>{formatApiCombatPower(character.apiCombatPower)}</strong>
                  </div>
                </div>
                <div className="profile-actions">
                  {savedSettings.some((setting) => setting.snapshot) ? (
                    <label className="saved-setting-load-control">
                      <select
                        aria-label="저장 세팅 불러오기"
                        defaultValue=""
                        onChange={(event) => {
                          if (event.target.value) {
                            loadSavedSetting(event.target.value);
                            event.target.value = "";
                          }
                        }}
                      >
                        <option value="">세팅 불러오기</option>
                        {savedSettings
                          .filter((setting) => setting.snapshot)
                          .map((setting) => (
                            <option value={setting.id} key={setting.id}>
                              {setting.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="profile-save-setting-button"
                    onClick={openSaveSettingDialog}
                  >
                    현재 세팅 저장
                  </button>
                  {savedSettings.length ? (
                    <details className="saved-setting-management">
                      <summary>세팅 관리</summary>
                      <div className="saved-setting-management-list">
                        {savedSettings.map((setting) => (
                          <div className="saved-setting-delete-row" key={setting.id}>
                            <span title={setting.name}>{setting.name}</span>
                            <button
                              type="button"
                              onClick={() => deleteSavedSetting(setting.id)}
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
              <section className="profile-setting-comparison" aria-label="세팅 비교">
                <div className="profile-setting-comparison-heading">
                  <strong>세팅 비교</strong>
                  <label>
                    <span>비교 세팅 선택</span>
                    <select
                      aria-label="비교 세팅 선택"
                      value={comparisonSettingId}
                      onChange={(event) =>
                        setComparisonSettingId(event.target.value)
                      }
                    >
                      <option value="">세팅 불러오기</option>
                      {savedSettings
                        .filter((setting) => setting.snapshot)
                        .map((setting) => (
                          <option value={setting.id} key={setting.id}>
                            {setting.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                {comparisonSetting && comparisonTargetSummary && currentComparisonSummary ? (
                  <div className="profile-setting-comparison-body">
                    <span className="comparison-setting-name">
                      현재 세팅 ↔ {comparisonSetting.name}
                    </span>
                    <div className="comparison-basic-info">
                      <span>
                        직업 · 코어
                        <b>
                          {currentComparisonSummary.classLabel} {currentComparisonSummary.coreLabel ?? ""}
                          <small className="comparison-inline-target">
                            (B군·{comparisonTargetSummary.classLabel} {comparisonTargetSummary.coreLabel ?? ""})
                          </small>
                        </b>
                      </span>
                      {[
                        ["예상 DPS", currentComparisonSummary.expectedDps, comparisonTargetSummary.expectedDps, "", "percent"],
                        ["사이클 시간", currentComparisonSummary.cycleSeconds, comparisonTargetSummary.cycleSeconds, "초", "difference"],
                      ].map(([label, current, target, suffix, changeType]) => {
                        const numericCurrent = typeof current === "number" ? current : 0;
                        const numericTarget = typeof target === "number" ? target : 0;
                        const delta = comparisonDelta(numericCurrent, numericTarget);
                        return (
                          <span key={String(label)}>
                            {label}
                            <b>
                              {current === null ? "계산 준비 중" : `${label === "예상 DPS" ? formatDamageInEok(numericCurrent, 3) : numericCurrent.toFixed(2)}${String(suffix)}`}
                              <small className="comparison-inline-target">
                                (B군·{target === null ? "계산 준비 중" : `${label === "예상 DPS" ? formatDamageInEok(numericTarget, 3) : numericTarget.toFixed(2)}${String(suffix)}`})
                              </small>
                            </b>
                            {changeType === "difference" ? (
                              <em className="difference">
                                {comparisonDifference(numericCurrent, numericTarget, String(suffix))}
                              </em>
                            ) : delta ? (
                              <em className={Number(delta) > 0 ? "better" : "lower"}>
                                {Number(delta) > 0 ? "▲" : "▼"} {Math.abs(Number(delta)).toFixed(2)}%
                              </em>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                    <div className="comparison-skill-section">
                      <strong>스킬별 딜지분 3% 이상</strong>
                      <div className="comparison-skill-list">
                        {(() => {
                          const comparisonSkills = [
                            ...currentComparisonSummary.skills,
                            ...comparisonTargetSummary.skills.filter(
                              (targetSkill) =>
                                !currentComparisonSummary.skills.some(
                                  (skill) => skill.skillName === targetSkill.skillName,
                                ),
                            ),
                          ]
                            .filter((skill) => {
                              const targetSkill = comparisonTargetSummary.skills.find(
                                (candidate) => candidate.skillName === skill.skillName,
                              );
                              return skill.damageShare >= 3 || (targetSkill?.damageShare ?? 0) >= 3;
                            })
                            .sort((a, b) => {
                              const currentA = currentComparisonSummary.skills.find(
                                (skill) => skill.skillName === a.skillName,
                              );
                              const currentB = currentComparisonSummary.skills.find(
                                (skill) => skill.skillName === b.skillName,
                              );
                              return (currentB?.damageShare ?? 0) - (currentA?.damageShare ?? 0);
                            });
                          return comparisonSkills.length ? comparisonSkills.map((skill) => (
                          (() => {
                            const currentSkill = currentComparisonSummary.skills.find(
                              (candidate) => candidate.skillName === skill.skillName,
                            );
                            const targetSkill = comparisonTargetSummary.skills.find(
                              (candidate) => candidate.skillName === skill.skillName,
                            );
                            const values = [
                              ["딜지분", currentSkill?.damageShare ?? 0, targetSkill?.damageShare, "%"],
                              ["평균 대미지", currentSkill?.averageDamage ?? 0, targetSkill?.averageDamage, ""],
                              ["분당 사용", currentSkill?.usesPerMinute ?? 0, targetSkill?.usesPerMinute, "회"],
                            ] as const;
                            return (
                              <div className="comparison-skill-item" key={skill.skillName}>
                                <strong>{skill.skillName}</strong>
                                {values.map(([label, current, target, suffix]) => {
                                  const delta =
                                    target === undefined
                                      ? null
                                      : comparisonDelta(current, target);
                                  return (
                                    <div className="comparison-skill-value" key={label}>
                                      <span>{label}</span>
                                      <b>
                                        {label === "평균 대미지"
                                          ? formatDamageInEok(current)
                                          : current.toFixed(2)}
                                        {suffix}
                                        <small className="comparison-inline-target">
                                          (B군·{target === undefined
                                            ? "미사용"
                                            : `${label === "평균 대미지" ? formatDamageInEok(target) : target.toFixed(2)}${suffix}`})
                                        </small>
                                      </b>
                                      {target !== undefined && label === "분당 사용" ? (
                                        <em className="difference">
                                          {comparisonDifference(current, target, "회")}
                                        </em>
                                      ) : delta ? (
                                        <em className={Number(delta) > 0 ? "better" : "lower"}>
                                          {Number(delta) > 0 ? "▲" : "▼"} {Math.abs(Number(delta)).toFixed(2)}%
                                        </em>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()
                          )) : <small>딜지분 3% 이상인 스킬이 없습니다.</small>;
                        })()}
                      </div>
                    </div>
                    <div className="comparison-detail-list">
                      <div className="comparison-detail-item">
                        <span>공속</span>
                        <b>
                          {currentComparisonSummary.attackSpeedPercent.toFixed(2)}%
                          <small className="comparison-inline-target">
                            (B군·{comparisonTargetSummary.attackSpeedPercent.toFixed(2)}%)
                          </small>
                        </b>
                        <em className={currentComparisonSummary.attackSpeedPercent >= comparisonTargetSummary.attackSpeedPercent ? "better" : "lower"}>
                          {comparisonDifference(currentComparisonSummary.attackSpeedPercent, comparisonTargetSummary.attackSpeedPercent, "%")}
                        </em>
                      </div>
                      <div className="comparison-detail-item">
                        <span>이속</span>
                        <b>
                          {currentComparisonSummary.moveSpeedPercent.toFixed(2)}%
                          <small className="comparison-inline-target">
                            (B군·{comparisonTargetSummary.moveSpeedPercent.toFixed(2)}%)
                          </small>
                        </b>
                        <em className={currentComparisonSummary.moveSpeedPercent >= comparisonTargetSummary.moveSpeedPercent ? "better" : "lower"}>
                          {comparisonDifference(currentComparisonSummary.moveSpeedPercent, comparisonTargetSummary.moveSpeedPercent, "%")}
                        </em>
                      </div>
                      <div className="comparison-detail-item">
                        <span>평균 백어택 비율</span>
                        <b>
                          {currentComparisonSummary.averageBackAttackRate.toFixed(2)}%
                          <small className="comparison-inline-target">
                            (B군·{typeof comparisonTargetSummary.averageBackAttackRate === "number" ? `${comparisonTargetSummary.averageBackAttackRate.toFixed(2)}%` : "미등록"})
                          </small>
                        </b>
                        {typeof comparisonTargetSummary.averageBackAttackRate === "number" ? (
                          <em className={currentComparisonSummary.averageBackAttackRate >= comparisonTargetSummary.averageBackAttackRate ? "better" : "lower"}>
                            {comparisonDifference(currentComparisonSummary.averageBackAttackRate, comparisonTargetSummary.averageBackAttackRate, "%")}
                          </em>
                        ) : null}
                      </div>
                      <div className="comparison-detail-item">
                        <span>평균 쿨타임 비율</span>
                        <b>
                          {currentComparisonSummary.averageCooldownRate.toFixed(2)}%
                          <small className="comparison-inline-target">
                            (B군·{typeof comparisonTargetSummary.averageCooldownRate === "number" ? `${comparisonTargetSummary.averageCooldownRate.toFixed(2)}%` : "미등록"})
                          </small>
                        </b>
                        {typeof comparisonTargetSummary.averageCooldownRate === "number" ? (
                          <em className={currentComparisonSummary.averageCooldownRate >= comparisonTargetSummary.averageCooldownRate ? "better" : "lower"}>
                            {comparisonDifference(currentComparisonSummary.averageCooldownRate, comparisonTargetSummary.averageCooldownRate, "%")}
                          </em>
                        ) : null}
                      </div>
                      <div className="comparison-detail-item">
                        <span>팔찌 효율</span>
                        <b>
                          {currentComparisonSummary.braceletEfficiency === null ? "계산 준비 중" : `${currentComparisonSummary.braceletEfficiency.toFixed(2)}%`}
                          <small className="comparison-inline-target">
                            (B군·{comparisonTargetSummary.braceletEfficiency === null ? "계산 준비 중" : `${comparisonTargetSummary.braceletEfficiency.toFixed(2)}%`})
                          </small>
                        </b>
                        {currentComparisonSummary.braceletEfficiency !== null && comparisonTargetSummary.braceletEfficiency !== null ? (
                          <em className={currentComparisonSummary.braceletEfficiency >= comparisonTargetSummary.braceletEfficiency ? "better" : "lower"}>
                            {comparisonDifference(currentComparisonSummary.braceletEfficiency, comparisonTargetSummary.braceletEfficiency, "%")}
                          </em>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : comparisonSetting ? (
                  <div className="profile-setting-comparison-empty">
                    이 세팅은 이전 저장 형식입니다. 현재 세팅에서 다시 저장해주세요.
                  </div>
                ) : (
                  <div className="profile-setting-comparison-empty">
                    세팅 불러오기
                  </div>
                )}
              </section>
              <aside className="floating-doping-panel">
                <strong>도핑</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={supportRageBuff}
                    onChange={(event) =>
                      setSupportRageBuff(event.target.checked)
                    }
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="공이속 9% · 진화형 피해 14%"
                  >
                    <Artwork
                      icon="https://cdn-lostark.game.onstove.com/efui_iconatlas/ark_passive_evolution/ark_passive_evolution_33.png"
                      label="정"
                    />
                  </span>
                  <span className="doping-buff-label">정열</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={banquetBuff}
                    onChange={(event) => setBanquetBuff(event.target.checked)}
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="공이속 5% · 무기 공격력 +1600"
                  >
                    <Artwork icon={pcBuffIcon.src} label="만" />
                  </span>
                  <span className="doping-buff-label">만찬</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={blessingFood}
                    onChange={(event) => setBlessingFood(event.target.checked)}
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="공속 3%"
                  >
                    <Artwork icon={blessingBuffIcon.src} label="축" />
                  </span>
                  <span className="doping-buff-label">축복</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={wineFood}
                    onChange={(event) => setWineFood(event.target.checked)}
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="이속 3%"
                  >
                    <Artwork icon={wineBuffIcon.src} label="와" />
                  </span>
                  <span className="doping-buff-label">와인</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={azenaBuff}
                    onChange={(event) => setAzenaBuff(event.target.checked)}
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="힘/민/지 +6000"
                  >
                    <Artwork icon={azenaBuffIcon.src} label="아" />
                  </span>
                  <span className="doping-buff-label">아제나</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={vulnerableAttribute}
                    onChange={(event) =>
                      setVulnerableAttribute(event.target.checked)
                    }
                  />{" "}
                  <span
                    className="doping-buff-icon"
                    data-tooltip="피해 10% 증가"
                  >
                    <Artwork icon={vulnerableAttributeBuffIcon.src} label="취" />
                  </span>
                  <span className="doping-buff-label">취약속성</span>
                </label>
                <label className="critical-rate-synergy-control">
                  <input
                    type="checkbox"
                    checked={criticalRateSynergyEnabled}
                    onChange={(event) =>
                      setCriticalRateSynergyEnabled(event.target.checked)
                    }
                  />
                  <span>치확</span>
                  <input
                    aria-label="치명타 적중률 시너지"
                    type="number"
                    min="0"
                    max="30"
                    step="0.1"
                    value={criticalRateSynergyValue}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      if (nextValue === "") {
                        setCriticalRateSynergyValue("");
                        return;
                      }
                      const numericValue = Number(nextValue);
                      if (!Number.isFinite(numericValue)) return;
                      setCriticalRateSynergyValue(
                        String(Math.min(30, Math.max(0, numericValue))),
                      );
                    }}
                  />
                  <span>%</span>
                </label>
              </aside>
              <aside className="floating-cycle-ratio-panel">
                <strong>전투 사이클 스킬</strong>
                <div className="cycle-ratio-global-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={allCycleBackAttack}
                      onChange={(event) =>
                        toggleAllCycleRatio(
                          "backAttackRate",
                          event.target.checked,
                        )
                      }
                    />
                    <span className="cycle-global-label">
                      백어택 전체
                    </span>
                    <input
                      aria-label="전체 백어택 비율"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={allCycleBackAttackRate}
                      onChange={(event) =>
                        setAllCycleBackAttackRate(event.target.value)
                      }
                    />
                    <span className="cycle-global-percent">%</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={allCycleCooldown}
                      onChange={(event) =>
                        toggleAllCycleRatio(
                          "cooldownRate",
                          event.target.checked,
                        )
                      }
                    />
                    <span className="cycle-global-label">
                      쿨타임 전체
                    </span>
                    <input
                      aria-label="전체 쿨타임 비율"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={allCycleCooldownRate}
                      onChange={(event) =>
                        setAllCycleCooldownRate(event.target.value)
                      }
                    />
                    <span className="cycle-global-percent">%</span>
                  </label>
                </div>
                <div className="cycle-ratio-header">
                  <span>스킬</span>
                  <span>백어택 비율</span>
                  <span>쿨타임 비율</span>
                </div>
                {cycleSkillCards.length ? (
                  <div className="cycle-ratio-list">
                    {cycleSkillCards.map((skill) => {
                      const ratios = cycleSkillRatioSettings[skill.name] ?? {
                        backAttackRate: "0",
                        cooldownRate: "0",
                      };
                      return (
                        <div className="cycle-ratio-row" key={skill.id}>
                          <div className="cycle-ratio-skill">
                            <Artwork
                              icon={skill.icon}
                              label={skill.name.slice(0, 1)}
                              title={skill.name}
                            />
                            <span>{skill.name}</span>
                          </div>
                          <input
                            aria-label={`${skill.name} 백어택 비율`}
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={
                              allCycleBackAttack
                                ? allCycleBackAttackRate
                                : ratios.backAttackRate
                            }
                            disabled={allCycleBackAttack}
                            onChange={(event) =>
                              updateCycleSkillRatio(
                                skill.name,
                                "backAttackRate",
                                event.target.value,
                              )
                            }
                          />
                          <input
                            aria-label={`${skill.name} 쿨타임 비율`}
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={
                              allCycleCooldown
                                ? allCycleCooldownRate
                                : ratios.cooldownRate
                            }
                            disabled={allCycleCooldown}
                            onChange={(event) =>
                              updateCycleSkillRatio(
                                skill.name,
                                "cooldownRate",
                                event.target.value,
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <span className="cycle-ratio-empty">
                    전투 사이클에 스킬을 추가해주세요.
                  </span>
                )}
                <input
                  ref={dpsScreenshotInputRef}
                  className="dps-screenshot-file-input"
                  type="file"
                  accept="image/*"
                  aria-label="전투 분석기 스크린샷 파일"
                  onChange={importDpsScreenshot}
                />
                <button
                  type="button"
                  className="dps-screenshot-upload-button"
                  onClick={() => dpsScreenshotInputRef.current?.click()}
                >
                  전분 스크린샷 불러오기
                </button>
                {dpsScreenshotStatus ? (
                  <small className="dps-screenshot-status">
                    {dpsScreenshotStatus}
                  </small>
                ) : null}
              </aside>
              <nav className="sim-tabs" aria-label="시뮬레이션 탭">
                {simTabs.map((item) => (
                  <button
                    type="button"
                    className={tab === item ? "active" : ""}
                    onClick={() => setTab(item)}
                    key={item}
                  >
                    {item}
                  </button>
                ))}
              </nav>
              <div className="sim-content">
                {tab === "기본 장비" ? (
                  <div className="equipment-left-stack">
                    <div className="equipment-layout">
                      <div className="equipment-column">
                        <section className="equipment-section">
                          <div className="equipment-section-heading">
                            <h2>전투 장비</h2>
                            <GearBulkControl
                              onChange={updateAllGearEnhancement}
                            />
                          </div>
                          <div className="equipment-edit-grid">
                            {gear.map((item) => (
                              <GearEditor
                                item={item}
                                onChange={(patch) =>
                                  updateEquipment(item.id, patch)
                                }
                                key={item.id}
                              />
                            ))}
                          </div>
                        </section>
                      </div>
                      <div className="equipment-column">
                        <section className="equipment-section">
                          <h2>악세사리</h2>
                          <div className="accessory-edit-grid">
                            {accessories.map((item) => (
                              <AccessoryEditor
                                item={item}
                                onChange={(patch) =>
                                  updateEquipment(item.id, patch)
                                }
                                key={item.id}
                              />
                            ))}
                          </div>
                        </section>
                        <section className="equipment-section">
                          <h2>팔찌</h2>
                          <BraceletEditor
                            item={bracelet}
                            primaryStat={primaryStat}
                            onChange={(patch) =>
                              bracelet && updateEquipment(bracelet.id, patch)
                            }
                          />
                        </section>
                      </div>
                    </div>
                    <EngravingSection
                      engravings={character.engravingDetails}
                      stoneIcon={stone?.icon ?? null}
                      stoneEffects={stoneEffects}
                      engravingNames={engravingNames}
                      onChange={updateEngraving}
                      onStoneChange={(index, patch) =>
                        setStoneEffects((current) =>
                          current.map((effect, effectIndex) =>
                            effectIndex === index
                              ? { ...effect, ...patch }
                              : effect,
                          ),
                        )
                      }
                    />
                  </div>
                ) : null}
                {tab === "기본 장비" ? (
                  <div className="ark-board equipment-ark-grid">
                    <section>
                      <div className="section-heading">
                        <div>
                          <h2>아크패시브</h2>
                        </div>
                      </div>
                      <div className="ark-points">
                        {character.arkPassive.points.map((point) => (
                          <div key={point.name}>
                            <span>{point.name}</span>
                            <strong>
                              {point.rank !== null && point.level !== null
                                ? `${point.rank}랭크 ${point.level}레벨`
                                : point.value}
                            </strong>
                          </div>
                        ))}
                      </div>
                      <div className="ark-columns">
                        <div className="evolution-tier-stack">
                          <EvolutionTierOneEditor
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                          <EvolutionTierEditor
                            tier="T2"
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                          <EvolutionTierEditor
                            tier="T3"
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                          <EvolutionTierEditor
                            tier="T4"
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                          <EvolutionTierEditor
                            tier="T5"
                            effects={character.arkPassive.evolution}
                            onChange={(index, patch) =>
                              updatePassive("evolution", index, patch)
                            }
                          />
                        </div>
                        <PassiveEditor
                          title="깨달음"
                          group="enlightenment"
                          effects={character.arkPassive.enlightenment}
                          onChange={(index, patch) =>
                            updatePassive("enlightenment", index, patch)
                          }
                        />
                        <PassiveEditor
                          title="도약"
                          group="leap"
                          effects={character.arkPassive.leap}
                          onChange={(index, patch) =>
                            updatePassive("leap", index, patch)
                          }
                        />
                      </div>
                      <section className="equipment-section avatar-section">
                        <h2>아바타</h2>
                        <div className="avatar-select-list">
                          {avatarSlots.map((slot) => (
                            <label key={slot}>
                              <span>{slot}</span>
                              <select
                                aria-label={`${slot} 아바타 등급`}
                                value={avatarGrades[slot] ?? "없음"}
                                onChange={(event) =>
                                  setAvatarGrades((current) => ({
                                    ...current,
                                    [slot]: event.target.value,
                                  }))
                                }
                              >
                                {["없음", "영웅", "전설"].map((grade) => (
                                  <option value={grade} key={grade}>
                                    {grade}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                      </section>
                    </section>
                    <section>
                      <div className="section-heading">
                        <div>
                          <h2>아크그리드</h2>
                        </div>
                      </div>
                      {character.arkGrid.cores.length ? (
                        <div className="core-grid">
                          {character.arkGrid.cores.map((core, index) => {
                            const normalizedName = core.name
                              .replace(
                                /^(?:질서|혼돈)의?\s*(?:해|달|별)\s*코어\s*:\s*/,
                                "",
                              )
                              .trim();
                            const options = [
                              ...new Set([
                                ...(gridCoreOptions[index] ?? []),
                                normalizedName,
                              ]),
                            ].filter((option) => option !== "없음");
                            return (
                              <article key={core.id}>
                                <Artwork
                                  icon={core.icon}
                                  label={index < 3 ? "秩" : "混"}
                                />
                                <select
                                  value={
                                    options.includes(normalizedName)
                                      ? normalizedName
                                      : (options[0] ?? "")
                                  }
                                  onChange={(event) =>
                                    updateCore(index, {
                                      name: event.target.value,
                                    })
                                  }
                                >
                                  {options.map((option) => (
                                    <option key={option}>{option}</option>
                                  ))}
                                </select>
                                <select
                                  value={core.grade ?? "고대"}
                                  onChange={(event) =>
                                    updateCore(index, {
                                      grade: event.target.value,
                                    })
                                  }
                                >
                                  <option value="고대">고대 코어</option>
                                  <option value="유물">유물 코어</option>
                                </select>
                                <select
                                  value={core.point ?? 20}
                                  onChange={(event) => {
                                    const point = Number(event.target.value);
                                    updateCore(index, {
                                      point,
                                      level: coreLevel(point),
                                    });
                                  }}
                                >
                                  {gridPoints.map((point) => (
                                    <option value={point} key={point}>
                                      {point}P
                                    </option>
                                  ))}
                                </select>
                                <b>
                                  Lv.
                                  {core.level ?? coreLevel(core.point) ?? "-"}
                                </b>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="empty-copy">
                          이 캐릭터의 공식 API 응답에 활성 코어 Slots가
                          없습니다.
                        </p>
                      )}
                      <EffectList
                        effects={character.arkGrid.effects}
                        onChange={(id, level) =>
                          setCharacter((current) =>
                            current
                              ? {
                                  ...current,
                                  arkGrid: {
                                    ...current.arkGrid,
                                    effects: current.arkGrid.effects.map(
                                      (effect) =>
                                        effect.id === id
                                          ? { ...effect, level }
                                          : effect,
                                    ),
                                  },
                                }
                              : current,
                          )
                        }
                      />
                    </section>
                  </div>
                ) : null}
                {tab === "스킬 & 전투 사이클" ? (
                  <div className="skills-cycle">
                    <section className="skill-list-section">
                      <div className="section-heading">
                        <div>
                          <h2>스킬</h2>
                        </div>
                        <div className="skill-header-actions">
                          {addableSkills.length ? (
                            <div className="skill-add">
                              <select
                                value={skillToAdd}
                                onChange={(event) =>
                                  setSkillToAdd(event.target.value)
                                }
                              >
                                <option value="">추가할 스킬 선택</option>
                                {addableSkills.map((skill) => (
                                  <option value={skill.id} key={skill.id}>
                                    {skill.name}
                                  </option>
                                ))}
                              </select>
                              <button type="button" onClick={addSkillToList}>
                                스킬 추가
                              </button>
                            </div>
                          ) : null}
                          <div className="skill-bulk-controls">
                            <strong>일괄 변경</strong>
                            {[10, 9, 8, 7].map((level) => (
                              <button
                                type="button"
                                onClick={() => updateAllGemLevels(level)}
                                key={level}
                              >
                                {level}겁작
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="skills-list">
                        {visibleSkills.map((skill) => (
                          <SkillEditorV2
                            skill={skill}
                            gems={gems.filter(
                              (gem) => gem.skill === skill.name,
                            )}
                            calculation={
                              unifiedSimulation?.skills[skill.id]?.calculation
                            }
                            cooldown={
                              unifiedSimulation?.skills[skill.id]?.cooldown
                            }
                            onChange={(patch) => updateSkill(skill.id, patch)}
                            onGemChange={updateGem}
                            onRemoveGem={(id) => {
                              setGems((current) =>
                                current.filter((gem) => gem.id !== id),
                              );
                            }}
                            onAddGem={(type) => addGem(skill.name, type)}
                            key={skill.id}
                          />
                        ))}
                      </div>
                    </section>
                    <section className="cycle-builder">
                      <div className="section-heading">
                        <div>
                          <h2>전투 사이클 구성 ({cycle.length}개)</h2>
                        </div>
                      </div>
                      <div className="cycle-add">
                        <div className="cycle-selection-controls">
                          <select
                            aria-label="기본 사이클 선택"
                            value={cyclePresetId}
                            onChange={(event) => {
                              manualCycleEditRef.current = true;
                              const preset = cyclePresets.find(
                                (candidate) => candidate.id === event.target.value,
                              );
                              setCyclePresetId(event.target.value);
                              if (!preset) return;
                              const available = new Map(
                                character?.skills.map((skill) => [
                                  skill.name,
                                  skill.id,
                                ]),
                              );
                              setVisibleSkillIds((current) => [
                                ...current,
                                ...preset.entries
                                  .map((entry) => available.get(entry.skillName))
                                  .filter(
                                    (skillId): skillId is string =>
                                      skillId !== undefined &&
                                      !current.includes(skillId),
                                  ),
                              ]);
                              setCycle(
                                preset.entries
                                  .filter((entry) =>
                                    available.has(entry.skillName),
                                  )
                                  .map((entry) => ({
                                    ...entry,
                                    id: crypto.randomUUID(),
                                  })),
                              );
                            }}
                          >
                            <option value="">기본 사이클 불러오기</option>
                            {cyclePresets.map((preset) => (
                              <option value={preset.id} key={preset.id}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={cycleSkill}
                            onChange={(event) => {
                              const selectedSkill = event.target.value;
                              setCycleSkill("");
                              if (!selectedSkill) return;
                              manualCycleEditRef.current = true;
                              setCycle((value) => [
                                ...value,
                                {
                                  id: crypto.randomUUID(),
                                  skillName: selectedSkill,
                                  azureDragon: false,
                                  yeongaSimGong: false,
                                },
                              ]);
                            }}
                          >
                            <option value="">스킬 선택</option>
                            {cycleSkills.map((skill) => (
                              <option value={skill.name} key={skill.id}>
                                {skill.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          className="cycle-clear-button"
                          onClick={() => {
                            manualCycleEditRef.current = true;
                            setCyclePresetId("");
                            setCycle([]);
                          }}
                          disabled={cycle.length === 0}
                        >
                          전체 스킬 제거
                        </button>
                        <div className="cycle-duration-controls">
                          <label className="cycle-duration-option">
                            <input
                              type="checkbox"
                              checked={cycleDurationMode === "guideline"}
                              disabled={guidelineCycleSeconds === null}
                              onChange={() => setCycleDurationMode("guideline")}
                            />
                            <span>예상 사이클 시간</span>
                            <strong>
                              {guidelineCycleSeconds === null
                                ? "내부 지침 미등록"
                                : `${guidelineCycleSeconds.toFixed(2)}초`}
                            </strong>
                          </label>
                          <label className="cycle-duration-option">
                            <input
                              type="checkbox"
                              checked={cycleDurationMode === "manual"}
                              onChange={() => setCycleDurationMode("manual")}
                            />
                            <span>선택 사이클 시간</span>
                            <input
                              aria-label="선택 사이클 시간(초)"
                              type="number"
                              min="0"
                              step="0.1"
                              placeholder="초 입력"
                              value={manualCycleSeconds}
                              disabled={cycleDurationMode !== "manual"}
                              onChange={(event) =>
                                setManualCycleSeconds(event.target.value)
                              }
                            />
                            <em>초</em>
                          </label>
                        </div>
                      </div>
                      {cycle.length ? (
                        <ol className="cycle-list">
                          {cycle.map((entry, index) => {
                            const { skillName } = entry;
                            const skill = visibleSkills.find(
                              (candidate) => candidate.name === skillName,
                            );

                            return (
                              <li
                                className="cycle-skill-tile"
                                key={entry.id}
                                draggable
                                onDragStart={() =>
                                  setDraggedCycleIndex(index)
                                }
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  if (
                                    draggedCycleIndex === null ||
                                    draggedCycleIndex === index
                                  ) {
                                    setDraggedCycleIndex(null);
                                    return;
                                  }
                                  manualCycleEditRef.current = true;
                                  setCycle((value) => {
                                    const next = [...value];
                                    const [moved] = next.splice(
                                      draggedCycleIndex,
                                      1,
                                    );
                                    next.splice(index, 0, moved);
                                    return next;
                                  });
                                  setDraggedCycleIndex(null);
                                }}
                                onDragEnd={() => setDraggedCycleIndex(null)}
                              >
                                <b className="cycle-skill-order">
                                  {index + 1}
                                </b>
                                <Artwork
                                  icon={skill?.icon ?? null}
                                  label={skillName.slice(0, 1)}
                                  title={skillName}
                                />
                                <span className="cycle-skill-name">
                                  {skillName}
                                </span>
                                <div className="cycle-skill-buffs">
                                  <button
                                    className={
                                      entry.azureDragon ? "active" : ""
                                    }
                                    type="button"
                                    title="청룡진 적용"
                                    aria-label={`${skillName} 청룡진 적용`}
                                    aria-pressed={entry.azureDragon}
                                    onClick={() =>
                                      (manualCycleEditRef.current = true,
                                      setCycle((value) =>
                                        value.map((candidate) =>
                                          candidate.id === entry.id
                                            ? {
                                                ...candidate,
                                                azureDragon:
                                                  !candidate.azureDragon,
                                              }
                                            : candidate,
                                        ),
                                      ))
                                    }
                                  >
                                    {azureDragonCycleIcon ? (
                                      <img src={azureDragonCycleIcon} alt="" />
                                    ) : (
                                      <span>청</span>
                                    )}
                                  </button>
                                  <button
                                    className={
                                      entry.yeongaSimGong ? "active" : ""
                                    }
                                    type="button"
                                    title="연가심공 적용"
                                    aria-label={`${skillName} 연가심공 적용`}
                                    aria-pressed={entry.yeongaSimGong}
                                    onClick={() =>
                                      (manualCycleEditRef.current = true,
                                      setCycle((value) =>
                                        value.map((candidate) =>
                                          candidate.id === entry.id
                                            ? {
                                                ...candidate,
                                                yeongaSimGong:
                                                  !candidate.yeongaSimGong,
                                              }
                                            : candidate,
                                        ),
                                      ))
                                    }
                                  >
                                    {yeongaSimGongCycleIcon ? (
                                      <img
                                        src={yeongaSimGongCycleIcon}
                                        alt=""
                                      />
                                    ) : (
                                      <span>연</span>
                                    )}
                                  </button>
                                </div>
                                <div className="cycle-skill-actions">
                                  <button
                                    type="button"
                                    aria-label={`${skillName} 한 칸 왼쪽 이동`}
                                    disabled={index === 0}
                                    onClick={() =>
                                      (manualCycleEditRef.current = true,
                                      setCycle((value) => {
                                        const next = [...value];
                                        [next[index - 1], next[index]] = [
                                          next[index],
                                          next[index - 1],
                                        ];
                                        return next;
                                      }))
                                    }
                                  >
                                    ←
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`${skillName} 한 칸 오른쪽 이동`}
                                    disabled={index === cycle.length - 1}
                                    onClick={() =>
                                      (manualCycleEditRef.current = true,
                                      setCycle((value) => {
                                        const next = [...value];
                                        [next[index], next[index + 1]] = [
                                          next[index + 1],
                                          next[index],
                                        ];
                                        return next;
                                      }))
                                    }
                                  >
                                    →
                                  </button>
                                </div>
                                <button
                                  className="cycle-skill-remove"
                                  type="button"
                                  aria-label={`${skillName} 삭제`}
                                  onClick={() =>
                                    (manualCycleEditRef.current = true,
                                    setCycle((value) =>
                                      value.filter(
                                        (candidate) => candidate.id !== entry.id,
                                      ),
                                    ))
                                  }
                                >
                                  ×
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      ) : (
                        <p className="empty-copy">
                          전투 사이클에 사용할 스킬을 추가하세요.
                        </p>
                      )}
                    </section>
                  </div>
                ) : null}
              </div>
              <footer className="simulation-debug-footer">
                <InternalGearSnapshotDebug
                  snapshot={sharedCombatSnapshot!}
                  cycleDamageRows={cycleDamageRows}
                  onExportJson={exportDebugJson}
                />
              </footer>
            </section>
          ) : (
            <section className="empty-start">
              <span>01</span>
              <h1>시뮬레이션 시작</h1>
              <p>
                API 설정 후 캐릭터명을 입력하면 장비, 아크 시스템, 스킬과 보석을
                모두 불러옵니다.
              </p>
            </section>
          )}
        </>
      ) : null}
      {dpsScreenshotPreview ? (
        <div
          className="dps-screenshot-preview-backdrop"
          role="presentation"
          onMouseDown={() => setDpsScreenshotPreview(null)}
        >
          <section
            className="dps-screenshot-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dps-screenshot-preview-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2 id="dps-screenshot-preview-title">전분 인식 결과 확인</h2>
                <p>
                  잘못 읽힌 값이 있으면 수정한 뒤 전투 사이클에 적용하세요.
                </p>
              </div>
              <button
                type="button"
                aria-label="전분 인식 결과 닫기"
                onClick={() => setDpsScreenshotPreview(null)}
              >
                ×
              </button>
            </header>
            <div className="dps-screenshot-preview-heading">
              <span>스킬</span>
              <span>백어택 비율</span>
              <span>
                쿨타임 비율
                {excludesScreenshotCooldownRatio ? " (미적용)" : ""}
              </span>
            </div>
            <div className="dps-screenshot-preview-list">
              {dpsScreenshotPreview.map((ratio, index) => {
                const skill = cycleSkillCards.find(
                  (candidate) => candidate.name === ratio.skillName,
                );
                const updateRatio = (
                  key: "backAttackRate" | "cooldownRate",
                  value: string,
                ) => {
                  const numeric = Number(value);
                  if (!Number.isFinite(numeric)) return;
                  setDpsScreenshotPreview((current) =>
                    current?.map((item, itemIndex) =>
                      itemIndex === index
                        ? {
                            ...item,
                            [key]: Math.min(100, Math.max(0, numeric)),
                          }
                        : item,
                    ) ?? null,
                  );
                };
                return (
                  <div
                    className="dps-screenshot-preview-row"
                    key={ratio.skillName}
                  >
                    <span>
                      {skill?.icon ? (
                        <img src={skill.icon} alt="" />
                      ) : null}
                      <b>{ratio.skillName}</b>
                    </span>
                    <label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={ratio.backAttackRate}
                        onChange={(event) =>
                          updateRatio("backAttackRate", event.target.value)
                        }
                      />
                      <span>%</span>
                    </label>
                    {excludesScreenshotCooldownRatio ? (
                      <span className="dps-screenshot-preview-excluded">
                        적용 안 함
                      </span>
                    ) : (
                      <label>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={ratio.cooldownRate}
                          onChange={(event) =>
                            updateRatio("cooldownRate", event.target.value)
                          }
                        />
                        <span>%</span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            <footer>
              <button
                type="button"
                onClick={() => setDpsScreenshotPreview(null)}
              >
                취소
              </button>
              <button type="button" onClick={confirmDpsScreenshotPreview}>
                전투 사이클에 적용
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {saveDialogOpen && character ? (
        <div
          className="setting-save-backdrop"
          role="presentation"
          onMouseDown={() => setSaveDialogOpen(false)}
        >
          <form
            className="setting-save-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="setting-save-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              saveCurrentSetting();
            }}
          >
            <div>
              <h2 id="setting-save-dialog-title">현재 세팅 저장</h2>
              <p>
                장비, 각인, 아크패시브, 보석, 도핑, 전투 사이클과 비율을 현재
                상태 그대로 저장합니다.
              </p>
            </div>
            <label>
              <span>세팅 이름</span>
              <input
                autoFocus
                value={saveSettingName}
                onChange={(event) => setSaveSettingName(event.target.value)}
                placeholder={`${character.name} 세팅`}
                maxLength={40}
              />
            </label>
            <label>
              <span>기존 세팅</span>
              <select
                value={saveOverwriteId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setSaveOverwriteId(nextId);
                  const selected = savedSettings.find(
                    (setting) => setting.id === nextId,
                  );
                  if (selected) setSaveSettingName(selected.name);
                }}
              >
                <option value="">새 세팅으로 저장</option>
                {savedSettings.map((setting) => (
                  <option value={setting.id} key={setting.id}>
                    {setting.name} · {setting.savedAt}
                  </option>
                ))}
              </select>
            </label>
            {saveOverwriteId ? (
              <p className="setting-save-overwrite-note">
                선택한 기존 세팅의 전체 스냅샷을 현재 상태로 덮어씁니다.
              </p>
            ) : null}
            <div className="setting-save-actions">
              <button
                type="button"
                onClick={() => setSaveDialogOpen(false)}
              >
                취소
              </button>
              <button type="submit">
                {saveOverwriteId ? "덮어쓰기" : "저장"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
