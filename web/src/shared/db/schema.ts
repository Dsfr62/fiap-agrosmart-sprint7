import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const farms = sqliteTable(
  "farms",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    farmNameIdx: uniqueIndex("farms_name_idx").on(table.name),
  }),
);

export const fields = sqliteTable(
  "fields",
  {
    id: text("id").primaryKey(),
    farmId: text("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    fieldsFarmIdx: index("fields_farm_idx").on(table.farmId),
  }),
);

export const analyses = sqliteTable(
  "analyses",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull().unique(),
    imageSha256: text("image_sha256").notNull().unique(),
    source: text("source").notNull().default("upload"),
    fieldId: text("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    pestType: text("pest_type").notNull().default("nao_identificado"),
    pestTypeAi: text("pest_type_ai"),
    pestTypeConfidence: real("pest_type_confidence"),
    pestTypeReasoning: text("pest_type_reasoning"),
    pestTypeModel: text("pest_type_model"),
    severity: text("severity").notNull(),
    severityLabelPt: text("severity_label_pt").notNull(),
    affectedPct: real("affected_pct").notNull(),
    leafPixels: integer("leaf_pixels").notNull(),
    diseasedPixels: integer("diseased_pixels").notNull(),
    originalPath: text("original_path"),
    annotatedPath: text("annotated_path"),
    thumbnailPath: text("thumbnail_path"),
    warnings: text("warnings"),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    analysesFieldCapturedIdx: index("analyses_field_captured_idx").on(
      table.fieldId,
      table.capturedAt,
    ),
    analysesCapturedIdx: index("analyses_captured_idx").on(table.capturedAt),
    analysesSeverityIdx: index("analyses_severity_idx").on(table.severity),
    analysesPestCapturedIdx: index("analyses_pest_captured_idx").on(
      table.pestType,
      table.capturedAt,
    ),
    analysesShaIdx: uniqueIndex("analyses_sha_idx").on(table.imageSha256),
    analysesRequestIdx: uniqueIndex("analyses_request_idx").on(table.requestId),
  }),
);

export const recommendations = sqliteTable(
  "recommendations",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => analyses.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    model: text("model").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    recommendationsAnalysisIdx: index("recommendations_analysis_idx").on(
      table.analysisId,
    ),
  }),
);

export const llmCache = sqliteTable("llm_cache", {
  key: text("key").primaryKey(),
  text: text("text").notNull(),
  model: text("model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const sensorReadings = sqliteTable(
  "sensor_readings",
  {
    id: text("id").primaryKey(),
    fieldId: text("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    stationId: text("station_id").notNull(),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    temperatureC: real("temperature_c").notNull(),
    airHumidityPct: real("air_humidity_pct").notNull(),
    soilMoisturePct: real("soil_moisture_pct").notNull(),
    luminosityLux: integer("luminosity_lux").notNull(),
    event: text("event"),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    sensorReadingsFieldTsIdx: uniqueIndex("sensor_readings_field_ts_idx").on(
      table.fieldId,
      table.ts,
    ),
    sensorReadingsTsIdx: index("sensor_readings_ts_idx").on(table.ts),
  }),
);

export const riskEvaluations = sqliteTable(
  "risk_evaluations",
  {
    id: text("id").primaryKey(),
    fieldId: text("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "restrict" }),
    windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
    windowEnd: integer("window_end", { mode: "timestamp_ms" }).notNull(),
    aggregates: text("aggregates").notNull(),
    riskLevel: text("risk_level", {
      enum: ["low", "moderate", "high", "critical"],
    }).notNull(),
    riskScore: real("risk_score"),
    riskConfidence: real("risk_confidence"),
    action: text("action", {
      enum: [
        "none",
        "notify",
        "irrigate",
        "suggest_agronomist",
        "generate_report",
      ],
    }).notNull(),
    waterRiskLevel: text("water_risk_level", {
      enum: ["low", "moderate", "high", "critical"],
    }),
    waterRiskConfidence: real("water_risk_confidence"),
    heatRiskLevel: text("heat_risk_level", {
      enum: ["low", "moderate", "high", "critical"],
    }),
    heatRiskConfidence: real("heat_risk_confidence"),
    overallRiskLevel: text("overall_risk_level", {
      enum: ["low", "moderate", "high", "critical"],
    }),
    overallRiskType: text("overall_risk_type", {
      enum: ["fungal", "water", "heat"],
    }),
    actionConfidence: real("action_confidence"),
    probabilities: text("probabilities"),
    decidedBy: text("decided_by", { enum: ["jev", "rule"] }).notNull(),
    model: text("model"),
    costUsd: real("cost_usd"),
    recommendation: text("recommendation"),
    recommendationModel: text("recommendation_model"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    riskEvaluationsFieldWindowIdx: uniqueIndex(
      "risk_evaluations_field_window_idx",
    ).on(table.fieldId, table.windowEnd),
    riskEvaluationsWindowIdx: index("risk_evaluations_window_idx").on(
      table.windowEnd,
    ),
  }),
);

export const uploadsAudit = sqliteTable("uploads_audit", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  ipHash: text("ip_hash").notNull(),
  uaHash: text("ua_hash").notNull(),
  sha256: text("sha256").notNull(),
  bytes: integer("bytes").notNull(),
  sniffedMime: text("sniffed_mime").notNull(),
  result: text("result").notNull(),
  errorCode: text("error_code"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
