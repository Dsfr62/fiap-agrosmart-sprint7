import type { WindowAggregates } from "./aggregate";

export const RISK_LEVELS = ["low", "moderate", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const ACTIONS = [
  "none",
  "notify",
  "irrigate",
  "suggest_agronomist",
  "generate_report",
] as const;
export type Action = (typeof ACTIONS)[number];

export const riskRank = (level: RiskLevel): number =>
  RISK_LEVELS.indexOf(level);

export const RISK_TYPES = ["fungal", "water", "heat"] as const;
export type RiskType = (typeof RISK_TYPES)[number];
export type RiskLevels = Record<RiskType, RiskLevel>;

const ACTION_RANK: Record<Action, number> = {
  none: 0,
  notify: 1,
  irrigate: 2,
  generate_report: 2,
  suggest_agronomist: 3,
};

/** Minimum action each risk type demands at high and critical levels. */
const ACTION_FLOOR: Record<RiskType, Partial<Record<RiskLevel, Action>>> = {
  fungal: { high: "notify", critical: "suggest_agronomist" },
  water: { high: "irrigate", critical: "irrigate" },
  heat: { high: "notify", critical: "notify" },
};

/** Highest level among the risk types and which type produced it. */
export const overallRisk = (
  levels: RiskLevels,
): { level: RiskLevel; type: RiskType } =>
  RISK_TYPES.reduce(
    (worst, type) =>
      riskRank(levels[type]) > riskRank(worst.level)
        ? { level: levels[type], type }
        : worst,
    { level: levels.fungal, type: "fungal" as RiskType },
  );

/**
 * Jev answers each question independently, so a high risk can come with
 * "none". The floor keeps the action at least as strong as every risk demands.
 */
export const applyActionFloor = (levels: RiskLevels, action: Action): Action =>
  RISK_TYPES.reduce((current, type) => {
    const floor = ACTION_FLOOR[type][levels[type]];
    return floor && ACTION_RANK[current] < ACTION_RANK[floor] ? floor : current;
  }, action);

/**
 * Threshold rules used when the decision model is unavailable.
 * Based on favourable wet hours (humid air at 15–25 °C) in the last 24 h.
 */
export const decideByRules = (
  aggregates: WindowAggregates,
): { riskLevel: RiskLevel; action: Action } => {
  const hours = aggregates.favorableWetHours;
  if (hours >= 10)
    return { riskLevel: "critical", action: "suggest_agronomist" };
  if (hours >= 6) return { riskLevel: "high", action: "notify" };
  if (hours >= 3) return { riskLevel: "moderate", action: "none" };
  return { riskLevel: "low", action: "none" };
};

/** Water stress from dry-soil hours and the current soil moisture. */
export const waterRiskByRules = (aggregates: WindowAggregates): RiskLevel => {
  const { drySoilHours } = aggregates;
  const soil = aggregates.soilMoisturePct.last;
  if (drySoilHours >= 12 || soil <= 17) return "critical";
  if (drySoilHours >= 4 || soil <= 20) return "high";
  if (soil <= 23) return "moderate";
  return "low";
};

/** Heat stress from hours at or above 32 °C. */
export const heatRiskByRules = (aggregates: WindowAggregates): RiskLevel => {
  const { hotHours } = aggregates;
  if (hotHours >= 6) return "critical";
  if (hotHours >= 3) return "high";
  if (hotHours >= 1) return "moderate";
  return "low";
};
