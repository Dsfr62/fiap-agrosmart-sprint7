import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNotNull, lt, lte } from "drizzle-orm";
import { db } from "@/shared/db/client";
import {
  analyses,
  farms,
  fields,
  riskEvaluations,
  sensorReadings,
} from "@/shared/db/schema";
import { aggregateWindow } from "./aggregate";
import { decideWithJev } from "./jev";
import { generateRiskRecommendation } from "./recommend";
import {
  type Action,
  applyActionFloor,
  decideByRules,
  heatRiskByRules,
  overallRisk,
  type RiskLevel,
  type RiskLevels,
  type RiskType,
  riskRank,
  waterRiskByRules,
} from "./rules";

/** Jev question key that answers each risk type. */
const JEV_QUESTION_BY_TYPE = {
  fungal: "risk",
  water: "water",
  heat: "heat",
} as const;

const HOUR_MS = 3_600_000;
const WINDOW_MS = 24 * HOUR_MS;
const COOLDOWN_MS = 6 * HOUR_MS;

export interface EvaluationSummary {
  fieldLabel: string;
  windowEnd: Date;
  levels: RiskLevels;
  overall: { level: RiskLevel; type: RiskType };
  action: Action;
  decidedBy: "jev" | "rule";
  confidence: number | null;
  recommended: boolean;
  fallbackReason: string | null;
}

/** Escalation to the LLM is skipped within 6 h of the last one unless risk rose. */
const cooldownAllows = (
  fieldId: string,
  windowEnd: Date,
  riskLevel: RiskLevel,
): boolean => {
  const last = db
    .select({
      windowEnd: riskEvaluations.windowEnd,
      riskLevel: riskEvaluations.riskLevel,
      overallRiskLevel: riskEvaluations.overallRiskLevel,
    })
    .from(riskEvaluations)
    .where(
      and(
        eq(riskEvaluations.fieldId, fieldId),
        isNotNull(riskEvaluations.recommendation),
        lt(riskEvaluations.windowEnd, windowEnd),
      ),
    )
    .orderBy(desc(riskEvaluations.windowEnd))
    .limit(1)
    .get();
  if (!last) return true;
  return (
    windowEnd.getTime() - last.windowEnd.getTime() >= COOLDOWN_MS ||
    riskRank(riskLevel) > riskRank(last.overallRiskLevel ?? last.riskLevel)
  );
};

/**
 * Hourly automation for one field: aggregates the last 24 h of readings, asks
 * Jev for fungal, water and heat risk plus the action (threshold rules if Jev
 * fails), escalates high risk to the LLM respecting the cooldown, and records
 * the decision.
 */
export const evaluateField = async (
  fieldId: string,
  windowEnd: Date,
): Promise<
  { success: true; data: EvaluationSummary } | { success: false; error: string }
> => {
  const windowStart = new Date(windowEnd.getTime() - WINDOW_MS);
  const rows = db
    .select()
    .from(sensorReadings)
    .where(
      and(
        eq(sensorReadings.fieldId, fieldId),
        gt(sensorReadings.ts, new Date(windowStart.getTime() - WINDOW_MS)),
        lte(sensorReadings.ts, windowEnd),
      ),
    )
    .all();

  const current = rows.filter((row) => row.ts > windowStart);
  const previous = rows.filter((row) => row.ts <= windowStart);
  const aggregates = aggregateWindow(current, previous);
  if (!aggregates) {
    return { success: false, error: "sem leituras na janela de 24 h" };
  }

  const field = db
    .select({ field: fields.name, farm: farms.name })
    .from(fields)
    .innerJoin(farms, eq(fields.farmId, farms.id))
    .where(eq(fields.id, fieldId))
    .get();
  const fieldLabel = field ? `${field.farm} / ${field.field}` : fieldId;

  const photo = db
    .select({
      pestType: analyses.pestType,
      affectedPct: analyses.affectedPct,
      severity: analyses.severity,
      capturedAt: analyses.capturedAt,
    })
    .from(analyses)
    .where(eq(analyses.fieldId, fieldId))
    .orderBy(desc(analyses.capturedAt))
    .limit(1)
    .get();
  const latestPhoto = photo
    ? {
        pestType: photo.pestType,
        affectedPct: photo.affectedPct,
        daysAgo: Math.max(
          0,
          Math.round(
            (windowEnd.getTime() - photo.capturedAt.getTime()) / (24 * HOUR_MS),
          ),
        ),
      }
    : null;

  const state = {
    field: fieldLabel,
    window_hours: 24,
    ...aggregates,
    latest_photo_analysis: photo
      ? { ...latestPhoto, severity: photo.severity }
      : null,
  };

  const jev = await decideWithJev(state);
  const fungalByRules = decideByRules(aggregates);
  const levels: RiskLevels = jev.success
    ? {
        fungal: jev.data.risks.risk.level,
        water: jev.data.risks.water.level,
        heat: jev.data.risks.heat.level,
      }
    : {
        fungal: fungalByRules.riskLevel,
        water: waterRiskByRules(aggregates),
        heat: heatRiskByRules(aggregates),
      };
  const overall = overallRisk(levels);
  const action = applyActionFloor(
    levels,
    jev.success ? jev.data.action : fungalByRules.action,
  );
  const decidedBy = jev.success ? ("jev" as const) : ("rule" as const);

  let recommendation: { content: string; model: string } | null = null;
  if (
    riskRank(overall.level) >= riskRank("high") &&
    cooldownAllows(fieldId, windowEnd, overall.level)
  ) {
    const generated = await generateRiskRecommendation({
      fieldLabel,
      levels,
      action,
      aggregates,
      latestPhoto,
    });
    if (generated.success) recommendation = generated.data;
  }

  db.insert(riskEvaluations)
    .values({
      id: randomUUID(),
      fieldId,
      windowStart,
      windowEnd,
      aggregates: JSON.stringify(state),
      riskLevel: levels.fungal,
      riskScore: jev.success ? jev.data.risks.risk.score : null,
      riskConfidence: jev.success ? jev.data.risks.risk.confidence : null,
      waterRiskLevel: levels.water,
      waterRiskConfidence: jev.success ? jev.data.risks.water.confidence : null,
      heatRiskLevel: levels.heat,
      heatRiskConfidence: jev.success ? jev.data.risks.heat.confidence : null,
      overallRiskLevel: overall.level,
      overallRiskType: overall.type,
      action,
      actionConfidence: jev.success ? jev.data.actionConfidence : null,
      probabilities: jev.success
        ? JSON.stringify({
            risk: jev.data.risks.risk.probabilities,
            water: jev.data.risks.water.probabilities,
            heat: jev.data.risks.heat.probabilities,
            action: jev.data.actionProbabilities,
          })
        : null,
      decidedBy,
      model: jev.success ? jev.data.model : null,
      costUsd: jev.success ? jev.data.costUsd : null,
      recommendation: recommendation?.content ?? null,
      recommendationModel: recommendation?.model ?? null,
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .run();

  return {
    success: true,
    data: {
      fieldLabel,
      windowEnd,
      levels,
      overall,
      action,
      decidedBy,
      confidence: jev.success
        ? jev.data.risks[JEV_QUESTION_BY_TYPE[overall.type]].confidence
        : null,
      recommended: recommendation !== null,
      fallbackReason: jev.success ? null : jev.error,
    },
  };
};
