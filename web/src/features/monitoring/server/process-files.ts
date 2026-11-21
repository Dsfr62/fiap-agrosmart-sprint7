/**
 * Arquivos de acompanhamento que o worker grava ao lado do banco (pasta de DB_PATH):
 *
 * - event-log.jsonl: um evento por linha, do jeito que a mineração de processos pede
 *   (caso, atividade, instante, recurso e atributos). Cada leitura de sensor é um caso.
 * - worker-status.json: o estado do worker (sinal de vida, contadores, fila), lido
 *   pelo /api/health, pelo /api/metrics e pela tela /monitoramento.
 */
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { env } from "@/shared/lib/env";

export const EVENT_LOG_FILE = "event-log.jsonl";
export const WORKER_STATUS_FILE = "worker-status.json";

export const dataDir = (): string => path.dirname(path.resolve(env.DB_PATH));

type AttributeValue = string | number | boolean | null;

export interface ProcessEvent {
  caseId: string;
  activity: string;
  at: Date;
  resource: string;
  attributes?: Record<string, AttributeValue>;
}

export interface WorkerStatus {
  pid: number;
  startedAt: string;
  updatedAt: string;
  brokerUrl: string;
  brokerConnected: boolean;
  messages: number;
  stored: number;
  duplicates: number;
  discarded: number;
  evaluations: number;
  evaluationsSkipped: number;
  errors: number;
  queue: number;
  lastMessageAt: string | null;
  lastEvaluationAt: string | null;
  avgEvaluationMs: number | null;
}

/**
 * Devolve a função que grava um evento no event log. Dois eventos do mesmo caso no
 * mesmo milissegundo ficam separados por 1 ms, para a ordem do código valer na análise.
 */
export const createEventLogWriter = (
  dir = dataDir(),
): ((event: ProcessEvent) => void) => {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, EVENT_LOG_FILE);
  const lastByCase = new Map<string, number>();
  return (event) => {
    const previous = lastByCase.get(event.caseId) ?? 0;
    const ms = Math.max(event.at.getTime(), previous + 1);
    lastByCase.set(event.caseId, ms);
    if (lastByCase.size > 5000) lastByCase.clear();
    const line = {
      case_id: event.caseId,
      atividade: event.activity,
      instante: new Date(ms).toISOString(),
      recurso: event.resource,
      ...event.attributes,
    };
    appendFileSync(file, `${JSON.stringify(line)}\n`);
  };
};

/** Grava o estado do worker de uma vez (arquivo temporário e troca), sem leitura pela metade. */
export const writeWorkerStatus = (
  status: WorkerStatus,
  dir = dataDir(),
): void => {
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, WORKER_STATUS_FILE);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(status, null, 2));
  renameSync(temp, file);
};

export const readWorkerStatus = (dir = dataDir()): WorkerStatus | null => {
  const file = path.join(dir, WORKER_STATUS_FILE);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as WorkerStatus;
  } catch {
    return null;
  }
};

/** Os últimos eventos do event log (lê só o fim do arquivo). */
export const readRecentEvents = (
  limit: number,
  dir = dataDir(),
): Array<Record<string, AttributeValue>> => {
  const file = path.join(dir, EVENT_LOG_FILE);
  if (!existsSync(file)) return [];
  const TAIL_BYTES = 128 * 1024;
  const size = statSync(file).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  const lines = buffer.toString("utf8").trimEnd().split("\n").slice(-limit);
  const events: Array<Record<string, AttributeValue>> = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // linha incompleta (o worker escrevendo agora): ignora
    }
  }
  return events.reverse();
};
