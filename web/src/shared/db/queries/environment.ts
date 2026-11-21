import { and, asc, desc, eq, gt, lte, ne, sql } from "drizzle-orm";
import { db } from "../client";
import { farms, fields, riskEvaluations, sensorReadings } from "../schema";

export type RiskLevel = "low" | "moderate" | "high" | "critical";
export type EnvironmentAction =
  | "none"
  | "notify"
  | "irrigate"
  | "suggest_agronomist"
  | "generate_report";
export type RiskType = "fungal" | "water" | "heat";
export type RiskLevels = Record<RiskType, RiskLevel>;

export interface LatestReading {
  ts: Date;
  temperatureC: number;
  airHumidityPct: number;
  soilMoisturePct: number;
  luminosityLux: number;
  event: string | null;
}

export interface LatestRisk {
  /** Worst level among the risk types, and which type it is. */
  level: RiskLevel;
  type: RiskType;
  levels: RiskLevels;
  action: EnvironmentAction;
  decidedBy: "jev" | "rule";
  confidence: number | null;
  windowEnd: Date;
  humidHours: number | null;
  favorableWetHours: number | null;
  drySoilHours: number | null;
  hotHours: number | null;
}

export interface FieldEnvironment {
  fieldId: string;
  farm: string;
  field: string;
  latest: LatestReading | null;
  risk: LatestRisk | null;
}

export interface EnvironmentOverview {
  /** Time of the newest reading — the simulated clock may run ahead of the server. */
  referenceTime: Date | null;
  fields: FieldEnvironment[];
}

export interface SeriesPoint {
  hour: string;
  temperatureC: number;
  airHumidityPct: number;
  soilMoisturePct: number;
}

export interface EnvironmentAlert {
  id: string;
  fieldLabel: string;
  windowEnd: Date;
  riskLevel: RiskLevel;
  riskType: RiskType;
  action: EnvironmentAction;
  decidedBy: "jev" | "rule";
  confidence: number | null;
  favorableWetHours: number | null;
  drySoilHours: number | null;
  hotHours: number | null;
  recommendation: string | null;
}

const HOUR_MS = 3_600_000;

interface StoredAggregates {
  humidHours?: number;
  favorableWetHours?: number;
  drySoilHours?: number;
  hotHours?: number;
}

type EvaluationRow = typeof riskEvaluations.$inferSelect;

/** Risk levels of one evaluation; rows from before water/heat count as low. */
const risksOf = (e: EvaluationRow) => {
  const type: RiskType = e.overallRiskType ?? "fungal";
  const confidences: Record<RiskType, number | null> = {
    fungal: e.riskConfidence,
    water: e.waterRiskConfidence,
    heat: e.heatRiskConfidence,
  };
  return {
    level: e.overallRiskLevel ?? e.riskLevel,
    type,
    levels: {
      fungal: e.riskLevel,
      water: e.waterRiskLevel ?? "low",
      heat: e.heatRiskLevel ?? "low",
    } satisfies RiskLevels,
    confidence: confidences[type],
  };
};

const parseAggregates = (json: string): StoredAggregates => {
  try {
    return JSON.parse(json) as StoredAggregates;
  } catch {
    return {};
  }
};

export async function getEnvironmentOverview(): Promise<EnvironmentOverview> {
  const fieldRows = db
    .select({ fieldId: fields.id, field: fields.name, farm: farms.name })
    .from(fields)
    .innerJoin(farms, eq(fields.farmId, farms.id))
    .orderBy(asc(farms.name), asc(fields.name))
    .all();

  const result = fieldRows.map((row): FieldEnvironment => {
    const latest = db
      .select({
        ts: sensorReadings.ts,
        temperatureC: sensorReadings.temperatureC,
        airHumidityPct: sensorReadings.airHumidityPct,
        soilMoisturePct: sensorReadings.soilMoisturePct,
        luminosityLux: sensorReadings.luminosityLux,
        event: sensorReadings.event,
      })
      .from(sensorReadings)
      .where(eq(sensorReadings.fieldId, row.fieldId))
      .orderBy(desc(sensorReadings.ts))
      .limit(1)
      .get();

    const evaluation = db
      .select()
      .from(riskEvaluations)
      .where(eq(riskEvaluations.fieldId, row.fieldId))
      .orderBy(desc(riskEvaluations.windowEnd))
      .limit(1)
      .get();
    const aggregates = evaluation ? parseAggregates(evaluation.aggregates) : {};

    return {
      ...row,
      latest: latest ?? null,
      risk: evaluation
        ? {
            ...risksOf(evaluation),
            action: evaluation.action,
            decidedBy: evaluation.decidedBy,
            windowEnd: evaluation.windowEnd,
            humidHours: aggregates.humidHours ?? null,
            favorableWetHours: aggregates.favorableWetHours ?? null,
            drySoilHours: aggregates.drySoilHours ?? null,
            hotHours: aggregates.hotHours ?? null,
          }
        : null,
    };
  });

  const times = result.flatMap((f) =>
    f.latest ? [f.latest.ts.getTime()] : [],
  );
  return {
    referenceTime: times.length ? new Date(Math.max(...times)) : null,
    fields: result,
  };
}

/** Hourly averages per field over the 48 h before the reference time. */
export async function getFieldSeries(
  referenceTime: Date,
): Promise<Record<string, SeriesPoint[]>> {
  const rows = db
    .select({
      fieldId: sensorReadings.fieldId,
      ts: sensorReadings.ts,
      temperatureC: sensorReadings.temperatureC,
      airHumidityPct: sensorReadings.airHumidityPct,
      soilMoisturePct: sensorReadings.soilMoisturePct,
    })
    .from(sensorReadings)
    .where(
      and(
        gt(sensorReadings.ts, new Date(referenceTime.getTime() - 48 * HOUR_MS)),
        lte(sensorReadings.ts, referenceTime),
      ),
    )
    .orderBy(asc(sensorReadings.ts))
    .all();

  const buckets = new Map<string, Map<number, typeof rows>>();
  for (const row of rows) {
    const hour = Math.floor(row.ts.getTime() / HOUR_MS) * HOUR_MS;
    const byHour = buckets.get(row.fieldId) ?? new Map<number, typeof rows>();
    byHour.set(hour, [...(byHour.get(hour) ?? []), row]);
    buckets.set(row.fieldId, byHour);
  }

  const avg = (values: number[]): number =>
    Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;

  return Object.fromEntries(
    [...buckets].map(([fieldId, byHour]) => [
      fieldId,
      [...byHour].map(([hour, items]) => ({
        hour: new Date(hour).toISOString(),
        temperatureC: avg(items.map((i) => i.temperatureC)),
        airHumidityPct: avg(items.map((i) => i.airHumidityPct)),
        soilMoisturePct: avg(items.map((i) => i.soilMoisturePct)),
      })),
    ]),
  );
}

/** Newest automated decisions that asked for an action. */
export async function getEnvironmentAlerts(
  limit = 12,
): Promise<EnvironmentAlert[]> {
  const rows = db
    .select({
      evaluation: riskEvaluations,
      field: fields.name,
      farm: farms.name,
    })
    .from(riskEvaluations)
    .innerJoin(fields, eq(riskEvaluations.fieldId, fields.id))
    .innerJoin(farms, eq(fields.farmId, farms.id))
    .where(ne(riskEvaluations.action, "none"))
    .orderBy(desc(riskEvaluations.windowEnd), asc(farms.name), asc(fields.name))
    .limit(limit)
    .all();

  return rows.map(({ evaluation: e, field, farm }) => {
    const risk = risksOf(e);
    const aggregates = parseAggregates(e.aggregates);
    return {
      id: e.id,
      fieldLabel: `${farm} / ${field}`,
      windowEnd: e.windowEnd,
      riskLevel: risk.level,
      riskType: risk.type,
      action: e.action,
      decidedBy: e.decidedBy,
      confidence: risk.confidence,
      favorableWetHours: aggregates.favorableWetHours ?? null,
      drySoilHours: aggregates.drySoilHours ?? null,
      hotHours: aggregates.hotHours ?? null,
      recommendation: e.recommendation,
    };
  });
}

export interface DecisionState {
  temperatureC?: { min: number; avg: number; max: number };
  airHumidityPct?: { avg: number; max: number };
  soilMoisturePct?: { avg: number; last: number; change: number };
  humidHours?: number;
  favorableWetHours?: number;
  longestHumidRunHours?: number;
  rainHours?: number;
  humidHoursTrend?: number | null;
  hotHours?: number;
  drySoilHours?: number;
  strongSunHours?: number;
  daylightLuxAvg?: number;
  latest_photo_analysis?: {
    pestType: string;
    affectedPct: number;
    daysAgo: number;
  } | null;
}

export interface DecisionHistoryItem {
  id: string;
  fieldId: string;
  fieldLabel: string;
  windowEnd: Date;
  /** Worst level among the risk types (fungal, water, heat). */
  riskLevel: RiskLevel;
  riskType: RiskType;
  levels: RiskLevels;
  riskConfidence: number | null;
  action: EnvironmentAction;
  actionConfidence: number | null;
  decidedBy: "jev" | "rule";
  model: string | null;
  costUsd: number | null;
  probabilities: Partial<
    Record<RiskType, Partial<Record<RiskLevel, number>>>
  > | null;
  state: DecisionState;
  recommendation: string | null;
}

export interface DecisionHistoryFilters {
  fieldId?: string;
  riskLevel?: RiskLevel;
  decidedBy?: "jev" | "rule";
}

export async function getFieldOptions(): Promise<
  { fieldId: string; label: string }[]
> {
  return db
    .select({ fieldId: fields.id, field: fields.name, farm: farms.name })
    .from(fields)
    .innerJoin(farms, eq(fields.farmId, farms.id))
    .orderBy(asc(farms.name), asc(fields.name))
    .all()
    .map((row) => ({
      fieldId: row.fieldId,
      label: `${row.farm} / ${row.field}`,
    }));
}

/** Every automated decision (Jev or rules), newest first, optionally filtered. */
export async function getDecisionHistory(
  filters: DecisionHistoryFilters,
  limit = 500,
): Promise<DecisionHistoryItem[]> {
  const conditions = [
    filters.fieldId ? eq(riskEvaluations.fieldId, filters.fieldId) : undefined,
    filters.riskLevel
      ? sql`coalesce(${riskEvaluations.overallRiskLevel}, ${riskEvaluations.riskLevel}) = ${filters.riskLevel}`
      : undefined,
    filters.decidedBy
      ? eq(riskEvaluations.decidedBy, filters.decidedBy)
      : undefined,
  ].filter((condition) => condition !== undefined);

  const rows = db
    .select({
      evaluation: riskEvaluations,
      field: fields.name,
      farm: farms.name,
    })
    .from(riskEvaluations)
    .innerJoin(fields, eq(riskEvaluations.fieldId, fields.id))
    .innerJoin(farms, eq(fields.farmId, farms.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(riskEvaluations.windowEnd), asc(farms.name), asc(fields.name))
    .limit(limit)
    .all();

  return rows.map(({ evaluation: e, field, farm }) => {
    let probabilities: DecisionHistoryItem["probabilities"] = null;
    if (e.probabilities) {
      try {
        const parsed = JSON.parse(e.probabilities) as Partial<
          Record<"risk" | "water" | "heat", Partial<Record<RiskLevel, number>>>
        >;
        probabilities = {
          fungal: parsed.risk,
          water: parsed.water,
          heat: parsed.heat,
        };
      } catch {
        probabilities = null;
      }
    }
    const risk = risksOf(e);
    return {
      id: e.id,
      fieldId: e.fieldId,
      fieldLabel: `${farm} / ${field}`,
      windowEnd: e.windowEnd,
      riskLevel: risk.level,
      riskType: risk.type,
      levels: risk.levels,
      riskConfidence: risk.confidence,
      action: e.action,
      actionConfidence: e.actionConfidence,
      decidedBy: e.decidedBy,
      model: e.model,
      costUsd: e.costUsd,
      probabilities,
      state: parseAggregates(e.aggregates) as DecisionState,
      recommendation: e.recommendation,
    };
  });
}

export interface ReceivedMessage {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  receivedAt: Date;
}

export interface TelemetryActivity {
  totalReadings: number;
  lastMinute: number;
  activeStations: number;
  totalStations: number;
  lastReceivedAt: Date | null;
  messages: ReceivedMessage[];
}

const toStationIso = (date: Date): string => {
  const local = new Date(date.getTime() - 3 * HOUR_MS);
  return `${local.toISOString().slice(0, 19)}-03:00`;
};

/** Most recent messages as stored by the worker, plus ingestion activity. */
export async function getTelemetryActivity(
  limit = 40,
): Promise<TelemetryActivity> {
  const now = Date.now();
  const rows = db
    .select({
      reading: sensorReadings,
      farmId: fields.farmId,
    })
    .from(sensorReadings)
    .innerJoin(fields, eq(sensorReadings.fieldId, fields.id))
    .orderBy(desc(sensorReadings.receivedAt), desc(sensorReadings.ts))
    .limit(limit)
    .all();

  const all = db
    .select({
      fieldId: sensorReadings.fieldId,
      receivedAt: sensorReadings.receivedAt,
    })
    .from(sensorReadings)
    .all();
  const recent = all.filter((r) => now - r.receivedAt.getTime() <= 60_000);
  const lastReceived = all.reduce(
    (max, r) => Math.max(max, r.receivedAt.getTime()),
    0,
  );

  return {
    totalReadings: all.length,
    lastMinute: recent.length,
    activeStations: new Set(
      all
        .filter((r) => now - r.receivedAt.getTime() <= 120_000)
        .map((r) => r.fieldId),
    ).size,
    totalStations: db.select({ id: fields.id }).from(fields).all().length,
    lastReceivedAt: lastReceived ? new Date(lastReceived) : null,
    messages: rows.map(({ reading: r, farmId }) => ({
      id: r.id,
      topic: `agrosmart/${farmId}/${r.fieldId}/telemetria`,
      payload: {
        stationId: r.stationId,
        fieldId: r.fieldId,
        ts: toStationIso(r.ts),
        temperatureC: r.temperatureC,
        airHumidityPct: r.airHumidityPct,
        soilMoisturePct: r.soilMoisturePct,
        luminosityLux: r.luminosityLux,
        event: r.event,
      },
      receivedAt: r.receivedAt,
    })),
  };
}
