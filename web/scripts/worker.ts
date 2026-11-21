/**
 * AgroSmart ingestion worker (Fase 6, com o acompanhamento da Fase 7).
 *
 * Subscribes to every station topic, stores readings and, once per simulated
 * hour per field, runs the risk evaluation. Readings older than the worker's
 * start (simulator backfill) are only stored, so history does not trigger a
 * burst of model calls.
 *
 * Fase 7: cada leitura vira um caso no event log (data/event-log.jsonl), com as
 * atividades por onde passou, e o estado do worker vai para data/worker-status.json
 * a cada 5 s (sinal de vida, contadores e fila). A cada minuto, uma linha [monitor].
 *
 * Usage: bun run worker   (start it BEFORE the simulator so backfill is captured)
 */
import mqtt from "mqtt";
import {
  createEventLogWriter,
  type WorkerStatus,
  writeWorkerStatus,
} from "@/features/monitoring/server/process-files";
import { evaluateField } from "@/features/telemetry/server/evaluate-field";
import { parseStationReading } from "@/features/telemetry/server/reading-schema";
import { storeReading } from "@/features/telemetry/server/store-reading";

const BROKER_URL = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const TOPIC = "agrosmart/+/+/telemetria";
const HOUR_MS = 3_600_000;
const STATUS_EVERY_MS = 5_000;
const MONITOR_EVERY_MS = 60_000;

const RISK_LABEL_PT = {
  low: "baixo",
  moderate: "moderado",
  high: "ALTO",
  critical: "CRÍTICO",
};

const ACTION_ACTIVITY = {
  none: "Decisão: nenhuma ação",
  notify: "Decisão: avisar o produtor",
  irrigate: "Decisão: irrigar",
  suggest_agronomist: "Decisão: chamar o agrônomo",
  generate_report: "Decisão: gerar relatório",
} as const;

const startedAt = Date.now();
const lastEvaluatedHour = new Map<string, number>();
const logEvent = createEventLogWriter();
let stored = 0;
let evaluations = Promise.resolve();
let invalidCount = 0;
let evaluationMsTotal = 0;

const status: WorkerStatus = {
  pid: process.pid,
  startedAt: new Date(startedAt).toISOString(),
  updatedAt: new Date(startedAt).toISOString(),
  brokerUrl: BROKER_URL,
  brokerConnected: false,
  messages: 0,
  stored: 0,
  duplicates: 0,
  discarded: 0,
  evaluations: 0,
  evaluationsSkipped: 0,
  errors: 0,
  queue: 0,
  lastMessageAt: null,
  lastEvaluationAt: null,
  avgEvaluationMs: null,
};

const saveStatus = (): void => {
  status.updatedAt = new Date().toISOString();
  try {
    writeWorkerStatus(status);
  } catch (error) {
    console.error("Falha ao gravar o estado do worker:", error);
  }
};

const formatTime = (date: Date): string =>
  date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const runEvaluation = async (
  caseId: string,
  fieldId: string,
  windowEnd: Date,
): Promise<void> => {
  const began = Date.now();
  logEvent({
    caseId,
    activity: "Avaliação iniciada",
    at: new Date(began),
    resource: "avaliador",
    attributes: { talhao: fieldId, fila: status.queue },
  });
  const result = await evaluateField(fieldId, windowEnd);
  const finished = new Date();
  const elapsed = finished.getTime() - began;
  status.queue = Math.max(0, status.queue - 1);
  if (!result.success) {
    status.evaluationsSkipped += 1;
    logEvent({
      caseId,
      activity: "Avaliação ignorada",
      at: finished,
      resource: "avaliador",
      attributes: { talhao: fieldId, motivo: result.error },
    });
    console.warn(`  avaliação ${fieldId} ignorada: ${result.error}`);
    return;
  }
  const e = result.data;
  status.evaluations += 1;
  status.lastEvaluationAt = finished.toISOString();
  evaluationMsTotal += elapsed;
  status.avgEvaluationMs = Math.round(evaluationMsTotal / status.evaluations);

  logEvent({
    caseId,
    activity:
      e.decidedBy === "jev"
        ? "Risco avaliado pelo Jev"
        : "Risco avaliado pelas regras (plano B)",
    at: finished,
    resource: e.decidedBy === "jev" ? "Jev" : "regras",
    attributes: {
      talhao: fieldId,
      risco_fungico: e.levels.fungal,
      risco_hidrico: e.levels.water,
      risco_termico: e.levels.heat,
      risco_geral: e.overall.level,
      duracao_ms: elapsed,
    },
  });
  logEvent({
    caseId,
    activity: ACTION_ACTIVITY[e.action],
    at: finished,
    resource: "avaliador",
    attributes: { talhao: fieldId, acao: e.action },
  });
  if (e.recommended) {
    logEvent({
      caseId,
      activity: "Recomendação escrita pela IA",
      at: finished,
      resource: "LLM",
      attributes: { talhao: fieldId },
    });
  }

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
  status.brokerConnected = true;
  saveStatus();
  client.subscribe(TOPIC, { qos: 1 }, (error) => {
    if (error) {
      console.error(`Falha ao assinar ${TOPIC}: ${error.message}`);
      process.exit(1);
    }
    console.log(`Worker AgroSmart — assinando ${TOPIC} em ${BROKER_URL}`);
  });
});

client.on("close", () => {
  status.brokerConnected = false;
});

client.on("error", (error) => {
  status.errors += 1;
  console.error(`Erro MQTT: ${error.message}`);
});

client.on("message", (_topic, payload) => {
  const receivedAt = new Date();
  status.messages += 1;
  status.lastMessageAt = receivedAt.toISOString();

  const parsed = parseStationReading(payload.toString());
  if (!parsed.success) {
    invalidCount += 1;
    status.discarded += 1;
    const caseId = `mensagem-invalida-${invalidCount}`;
    logEvent({
      caseId,
      activity: "Mensagem recebida",
      at: receivedAt,
      resource: "broker MQTT",
    });
    logEvent({
      caseId,
      activity: "Mensagem descartada (inválida)",
      at: new Date(),
      resource: "worker",
      attributes: { motivo: parsed.error },
    });
    console.warn(`Mensagem descartada: ${parsed.error}`);
    return;
  }
  const reading = parsed.data;
  const caseId = `${reading.fieldId}@${reading.ts.toISOString()}`;
  const origin = reading.ts.getTime() < startedAt ? "historico" : "ao_vivo";
  const base = { talhao: reading.fieldId, origem: origin };
  logEvent({
    caseId,
    activity: "Mensagem recebida",
    at: receivedAt,
    resource: "broker MQTT",
    attributes: base,
  });

  const saved = storeReading(reading, receivedAt);
  if (!saved.success) {
    status.errors += 1;
    logEvent({
      caseId,
      activity: "Leitura não gravada (erro)",
      at: new Date(),
      resource: "banco",
      attributes: { ...base, motivo: saved.error },
    });
    console.warn(`Leitura de ${reading.fieldId} não gravada: ${saved.error}`);
    return;
  }
  if (!saved.data.inserted) {
    status.duplicates += 1;
    logEvent({
      caseId,
      activity: "Leitura repetida (ignorada)",
      at: new Date(),
      resource: "banco",
      attributes: base,
    });
    return;
  }
  stored += 1;
  status.stored = stored;
  logEvent({
    caseId,
    activity: "Leitura gravada",
    at: new Date(),
    resource: "banco",
    attributes: base,
  });
  if (stored > 0 && stored % 500 === 0)
    console.log(`  ${stored} leituras gravadas`);

  if (origin === "historico") return;
  const hour = Math.floor(reading.ts.getTime() / HOUR_MS);
  if (lastEvaluatedHour.get(reading.fieldId) === hour) return;
  lastEvaluatedHour.set(reading.fieldId, hour);

  status.queue += 1;
  logEvent({
    caseId,
    activity: "Avaliação enfileirada",
    at: new Date(),
    resource: "avaliador",
    attributes: { ...base, fila: status.queue },
  });
  evaluations = evaluations
    .then(() => runEvaluation(caseId, reading.fieldId, reading.ts))
    .catch((error: unknown) => {
      status.errors += 1;
      status.queue = Math.max(0, status.queue - 1);
      logEvent({
        caseId,
        activity: "Erro na avaliação",
        at: new Date(),
        resource: "avaliador",
        attributes: { ...base, motivo: String(error) },
      });
      console.error(`Erro na avaliação de ${reading.fieldId}:`, error);
    });
});

const statusTimer = setInterval(saveStatus, STATUS_EVERY_MS);
const monitorTimer = setInterval(() => {
  const lastMessage = status.lastMessageAt
    ? `${Math.round((Date.now() - Date.parse(status.lastMessageAt)) / 1000)} s`
    : "nenhuma";
  console.log(
    `[monitor] broker ${status.brokerConnected ? "conectado" : "DESCONECTADO"}` +
      ` · ${status.messages} mensagens · ${status.stored} leituras gravadas` +
      ` · ${status.duplicates} repetidas · ${status.discarded} descartadas` +
      ` · ${status.evaluations} avaliações (média ${status.avgEvaluationMs ?? "-"} ms)` +
      ` · fila ${status.queue} · erros ${status.errors} · última mensagem há ${lastMessage}`,
  );
}, MONITOR_EVERY_MS);

const shutdown = (): void => {
  clearInterval(statusTimer);
  clearInterval(monitorTimer);
  status.brokerConnected = false;
  saveStatus();
  console.log(
    `\nEncerrando worker (${stored} leituras gravadas nesta execução).`,
  );
  client.end(false, {}, () => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
