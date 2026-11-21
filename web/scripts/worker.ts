/**
 * AgroSmart ingestion worker (Fase 6).
 *
 * Subscribes to every station topic, stores readings and, once per simulated
 * hour per field, runs the risk evaluation. Readings older than the worker's
 * start (simulator backfill) are only stored, so history does not trigger a
 * burst of model calls.
 *
 * Usage: bun run worker   (start it BEFORE the simulator so backfill is captured)
 */
import mqtt from "mqtt";
import { evaluateField } from "@/features/telemetry/server/evaluate-field";
import { parseStationReading } from "@/features/telemetry/server/reading-schema";
import { storeReading } from "@/features/telemetry/server/store-reading";

const BROKER_URL = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const TOPIC = "agrosmart/+/+/telemetria";
const HOUR_MS = 3_600_000;

const RISK_LABEL_PT = {
  low: "baixo",
  moderate: "moderado",
  high: "ALTO",
  critical: "CRÍTICO",
};

const startedAt = Date.now();
const lastEvaluatedHour = new Map<string, number>();
let stored = 0;
let evaluations = Promise.resolve();

const formatTime = (date: Date): string =>
  date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const runEvaluation = async (
  fieldId: string,
  windowEnd: Date,
): Promise<void> => {
  const result = await evaluateField(fieldId, windowEnd);
  if (!result.success) {
    console.warn(`  avaliação ${fieldId} ignorada: ${result.error}`);
    return;
  }
  const e = result.data;
  const confidence =
    e.confidence !== null ? ` ${Math.round(e.confidence * 100)}%` : "";
  const fallback = e.fallbackReason ? ` (plano B: ${e.fallbackReason})` : "";
  console.log(
    `[${formatTime(e.windowEnd)}] ${e.fieldLabel.padEnd(22)}` +
      ` fungo ${RISK_LABEL_PT[e.levels.fungal]} · hídrico ${RISK_LABEL_PT[e.levels.water]}` +
      ` · calor ${RISK_LABEL_PT[e.levels.heat]}` +
      ` · ação ${e.action} · por ${e.decidedBy}${confidence}` +
      `${e.recommended ? " · recomendação gerada" : ""}${fallback}`,
  );
};

const client = mqtt.connect(BROKER_URL, {
  clientId: `agrosmart-worker-${process.pid}`,
});

client.on("connect", () => {
  client.subscribe(TOPIC, { qos: 1 }, (error) => {
    if (error) {
      console.error(`Falha ao assinar ${TOPIC}: ${error.message}`);
      process.exit(1);
    }
    console.log(`Worker AgroSmart — assinando ${TOPIC} em ${BROKER_URL}`);
  });
});

client.on("error", (error) => {
  console.error(`Erro MQTT: ${error.message}`);
});

client.on("message", (_topic, payload) => {
  const parsed = parseStationReading(payload.toString());
  if (!parsed.success) {
    console.warn(`Mensagem descartada: ${parsed.error}`);
    return;
  }
  const reading = parsed.data;
  const saved = storeReading(reading, new Date());
  if (!saved.success) {
    console.warn(`Leitura de ${reading.fieldId} não gravada: ${saved.error}`);
    return;
  }
  if (saved.data.inserted) stored += 1;
  if (stored > 0 && stored % 500 === 0)
    console.log(`  ${stored} leituras gravadas`);

  if (reading.ts.getTime() < startedAt) return;
  const hour = Math.floor(reading.ts.getTime() / HOUR_MS);
  if (lastEvaluatedHour.get(reading.fieldId) === hour) return;
  lastEvaluatedHour.set(reading.fieldId, hour);

  evaluations = evaluations
    .then(() => runEvaluation(reading.fieldId, reading.ts))
    .catch((error: unknown) => {
      console.error(`Erro na avaliação de ${reading.fieldId}:`, error);
    });
});

const shutdown = (): void => {
  console.log(
    `\nEncerrando worker (${stored} leituras gravadas nesta execução).`,
  );
  client.end(false, {}, () => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
