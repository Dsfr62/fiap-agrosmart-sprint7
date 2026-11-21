/**
 * Exports the processed dataset: one row per field per evaluated hour with the
 * 24 h window aggregates and the automated decision.
 *
 * Usage: bun run export:processed [output.csv]
 */
import { writeFileSync } from "node:fs";
import { asc, eq } from "drizzle-orm";
import { db, sqlite } from "@/shared/db/client";
import { fields, riskEvaluations } from "@/shared/db/schema";

const output =
  process.argv[2] ?? "../docs/fase-6/exemplo-dataset-processado.csv";

const rows = db
  .select({
    fieldId: riskEvaluations.fieldId,
    field: fields.name,
    windowEnd: riskEvaluations.windowEnd,
    aggregates: riskEvaluations.aggregates,
    riskLevel: riskEvaluations.riskLevel,
    riskConfidence: riskEvaluations.riskConfidence,
    waterRiskLevel: riskEvaluations.waterRiskLevel,
    heatRiskLevel: riskEvaluations.heatRiskLevel,
    overallRiskLevel: riskEvaluations.overallRiskLevel,
    overallRiskType: riskEvaluations.overallRiskType,
    action: riskEvaluations.action,
    decidedBy: riskEvaluations.decidedBy,
    recommended: riskEvaluations.recommendation,
  })
  .from(riskEvaluations)
  .innerJoin(fields, eq(riskEvaluations.fieldId, fields.id))
  .orderBy(asc(riskEvaluations.windowEnd), asc(riskEvaluations.fieldId))
  .all();

const header = [
  "field_id",
  "window_end",
  "readings",
  "temperature_min_c",
  "temperature_avg_c",
  "temperature_max_c",
  "air_humidity_avg_pct",
  "air_humidity_max_pct",
  "soil_moisture_avg_pct",
  "soil_moisture_change_pct",
  "humid_hours",
  "favorable_wet_hours",
  "longest_humid_run_hours",
  "rain_hours",
  "humid_hours_trend",
  "dry_soil_hours",
  "hot_hours",
  "strong_sun_hours",
  "daylight_lux_avg",
  "latest_photo_affected_pct",
  "risk_level",
  "risk_confidence",
  "water_risk_level",
  "heat_risk_level",
  "overall_risk_level",
  "overall_risk_type",
  "action",
  "decided_by",
  "has_recommendation",
];

const lines = rows.map((row) => {
  const a = JSON.parse(row.aggregates);
  return [
    row.fieldId,
    row.windowEnd.toISOString(),
    a.readings,
    a.temperatureC.min,
    a.temperatureC.avg,
    a.temperatureC.max,
    a.airHumidityPct.avg,
    a.airHumidityPct.max,
    a.soilMoisturePct.avg,
    a.soilMoisturePct.change,
    a.humidHours,
    a.favorableWetHours,
    a.longestHumidRunHours,
    a.rainHours,
    a.humidHoursTrend ?? "",
    a.drySoilHours ?? "",
    a.hotHours ?? "",
    a.strongSunHours ?? "",
    a.daylightLuxAvg ?? "",
    a.latest_photo_analysis?.affectedPct ?? "",
    row.riskLevel,
    row.riskConfidence ?? "",
    row.waterRiskLevel ?? "",
    row.heatRiskLevel ?? "",
    row.overallRiskLevel ?? row.riskLevel,
    row.overallRiskType ?? "fungal",
    row.action,
    row.decidedBy,
    row.recommended ? "yes" : "no",
  ].join(",");
});

writeFileSync(output, `${[header.join(","), ...lines].join("\n")}\n`);
console.log(`${rows.length} linhas exportadas para ${output}`);
sqlite.close();
