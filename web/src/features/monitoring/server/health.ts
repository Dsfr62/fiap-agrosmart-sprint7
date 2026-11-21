/**
 * Saúde e indicadores da plataforma, usados por /api/health, /api/metrics e /monitoramento.
 *
 * Cada componente recebe um estado: "ok", "atencao" (funciona, mas algo parou de chegar)
 * ou "fora". O banco fora derruba tudo; o resto deixa a plataforma "degradada".
 */
import net from "node:net";
import { readWorkerStatus } from "@/features/monitoring/server/process-files";
import { sqlite } from "@/shared/db/client";
import { env } from "@/shared/lib/env";

export type ComponentState = "ok" | "atencao" | "fora";

export interface ComponentCheck {
  estado: ComponentState;
  detalhe: string;
  latenciaMs?: number;
  idadeSegundos?: number | null;
}

export interface HealthReport {
  status: "ok" | "degradado" | "fora";
  versao: string;
  verificadoEm: string;
  noArSegundos: number;
  componentes: {
    banco: ComponentCheck;
    broker: ComponentCheck;
    worker: ComponentCheck;
    leituras: ComponentCheck;
    decisoes: ComponentCheck;
  };
}

export const APP_VERSION = process.env.AGROSMART_VERSION ?? "fase-7";

/** Limites (em segundos) de quando um sinal parado vira atenção. */
const WORKER_OK_S = 30;
const WORKER_ATTENTION_S = 120;
const READINGS_OK_S = 15 * 60;
const DECISIONS_OK_S = 2 * 60 * 60;

const ageSeconds = (ms: number | null, now: number): number | null =>
  ms === null ? null : Math.max(0, Math.round((now - ms) / 1000));

const formatAge = (seconds: number | null): string => {
  if (seconds === null) return "nunca";
  if (seconds < 120) return `há ${seconds} s`;
  if (seconds < 7200) return `há ${Math.round(seconds / 60)} min`;
  return `há ${Math.round(seconds / 3600)} h`;
};

const checkDatabase = (): ComponentCheck => {
  const began = performance.now();
  try {
    sqlite.prepare("SELECT 1").get();
    return {
      estado: "ok",
      detalhe: "SQLite respondendo",
      latenciaMs: Math.round((performance.now() - began) * 10) / 10,
    };
  } catch (error) {
    return { estado: "fora", detalhe: `SQLite sem resposta: ${String(error)}` };
  }
};

/** Abre uma conexão TCP com o broker MQTT e fecha: só confere que ele atende. */
const checkBroker = (timeoutMs = 1000): Promise<ComponentCheck> => {
  let host = "localhost";
  let port = 1883;
  try {
    const url = new URL(env.MQTT_URL);
    host = url.hostname;
    port = Number(url.port || 1883);
  } catch {
    return Promise.resolve({
      estado: "fora",
      detalhe: `MQTT_URL inválida: ${env.MQTT_URL}`,
    });
  }
  const began = performance.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (check: ComponentCheck): void => {
      socket.destroy();
      resolve(check);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () =>
      finish({
        estado: "ok",
        detalhe: `Mosquitto atendendo em ${host}:${port}`,
        latenciaMs: Math.round(performance.now() - began),
      }),
    );
    socket.once("timeout", () =>
      finish({
        estado: "fora",
        detalhe: `sem resposta de ${host}:${port} em ${timeoutMs} ms`,
      }),
    );
    socket.once("error", (error) =>
      finish({
        estado: "fora",
        detalhe: `${host}:${port} recusou: ${error.message}`,
      }),
    );
  });
};

const checkWorker = (now: number): ComponentCheck => {
  const status = readWorkerStatus();
  if (!status)
    return {
      estado: "fora",
      detalhe: "o worker nunca deu sinal",
      idadeSegundos: null,
    };
  const age = ageSeconds(Date.parse(status.updatedAt), now);
  const estado: ComponentState =
    age !== null && age <= WORKER_OK_S && status.brokerConnected
      ? "ok"
      : age !== null && age <= WORKER_ATTENTION_S
        ? "atencao"
        : "fora";
  const broker = status.brokerConnected
    ? "conectado ao broker"
    : "sem conexão com o broker";
  return {
    estado,
    detalhe: `último sinal ${formatAge(age)}, ${broker}, fila de ${status.queue} avaliação(ões)`,
    idadeSegundos: age,
  };
};

const lastTimestamp = (sql: string): number | null => {
  const row = sqlite.prepare(sql).get() as { ultimo: number | null };
  return row?.ultimo ?? null;
};

const checkFreshness = (
  label: string,
  lastMs: number | null,
  okSeconds: number,
  now: number,
): ComponentCheck => {
  const age = ageSeconds(lastMs, now);
  if (age === null)
    return {
      estado: "atencao",
      detalhe: `nenhum(a) ${label} ainda`,
      idadeSegundos: null,
    };
  return {
    estado: age <= okSeconds ? "ok" : "atencao",
    detalhe: `último(a) ${label} ${formatAge(age)}`,
    idadeSegundos: age,
  };
};

export const getHealth = async (): Promise<HealthReport> => {
  const now = Date.now();
  const banco = checkDatabase();
  const broker = await checkBroker();
  const worker = checkWorker(now);
  let leituras: ComponentCheck = { estado: "fora", detalhe: "banco fora" };
  let decisoes: ComponentCheck = { estado: "fora", detalhe: "banco fora" };
  if (banco.estado !== "fora") {
    leituras = checkFreshness(
      "leitura recebida",
      lastTimestamp("SELECT MAX(received_at) AS ultimo FROM sensor_readings"),
      READINGS_OK_S,
      now,
    );
    decisoes = checkFreshness(
      "decisão da automação",
      lastTimestamp("SELECT MAX(created_at) AS ultimo FROM risk_evaluations"),
      DECISIONS_OK_S,
      now,
    );
  }
  const componentes = { banco, broker, worker, leituras, decisoes };
  const estados = Object.values(componentes).map((c) => c.estado);
  const status =
    banco.estado === "fora"
      ? "fora"
      : estados.every((e) => e === "ok")
        ? "ok"
        : "degradado";
  return {
    status,
    versao: APP_VERSION,
    verificadoEm: new Date(now).toISOString(),
    noArSegundos: Math.round(process.uptime()),
    componentes,
  };
};

export interface MetricsReport {
  geradoEm: string;
  leituras: {
    total: number;
    ultimaHora: number;
    ultimas24h: number;
    porTalhao: Array<{
      talhao: string;
      total: number;
      ultimaRecebida: string | null;
    }>;
  };
  decisoes: {
    total: number;
    ultimas24h: number;
    porAcao: Record<string, number>;
    porQuemDecidiu: Record<string, number>;
    taxaPlanoB: number | null;
    alertas: number;
    recomendacoesIA: number;
    custoJevUsd: number;
  };
  worker: {
    mensagens: number;
    gravadas: number;
    repetidas: number;
    descartadas: number;
    avaliacoes: number;
    avaliacoesIgnoradas: number;
    erros: number;
    fila: number;
    duracaoMediaAvaliacaoMs: number | null;
    iniciadoEm: string | null;
  } | null;
}

const count = (sql: string, ...params: unknown[]): number =>
  (sqlite.prepare(sql).get(...params) as { n: number }).n;

const groupCount = (sql: string): Record<string, number> => {
  const rows = sqlite.prepare(sql).all() as Array<{ chave: string; n: number }>;
  return Object.fromEntries(rows.map((r) => [r.chave, r.n]));
};

export const getMetrics = (): MetricsReport => {
  const now = Date.now();
  const hourAgo = now - 3_600_000;
  const dayAgo = now - 24 * 3_600_000;

  const porTalhao = (
    sqlite
      .prepare(
        `SELECT fa.name || ' / ' || f.name AS talhao, COUNT(r.id) AS total, MAX(r.received_at) AS ultima
         FROM fields f
         JOIN farms fa ON fa.id = f.farm_id
         LEFT JOIN sensor_readings r ON r.field_id = f.id
         GROUP BY f.id
         ORDER BY talhao`,
      )
      .all() as Array<{ talhao: string; total: number; ultima: number | null }>
  ).map((r) => ({
    talhao: r.talhao,
    total: r.total,
    ultimaRecebida: r.ultima ? new Date(r.ultima).toISOString() : null,
  }));

  const totalDecisoes = count("SELECT COUNT(*) AS n FROM risk_evaluations");
  const porQuemDecidiu = groupCount(
    "SELECT decided_by AS chave, COUNT(*) AS n FROM risk_evaluations GROUP BY decided_by",
  );
  const status = readWorkerStatus();

  return {
    geradoEm: new Date(now).toISOString(),
    leituras: {
      total: count("SELECT COUNT(*) AS n FROM sensor_readings"),
      ultimaHora: count(
        "SELECT COUNT(*) AS n FROM sensor_readings WHERE received_at >= ?",
        hourAgo,
      ),
      ultimas24h: count(
        "SELECT COUNT(*) AS n FROM sensor_readings WHERE received_at >= ?",
        dayAgo,
      ),
      porTalhao,
    },
    decisoes: {
      total: totalDecisoes,
      ultimas24h: count(
        "SELECT COUNT(*) AS n FROM risk_evaluations WHERE created_at >= ?",
        dayAgo,
      ),
      porAcao: groupCount(
        "SELECT action AS chave, COUNT(*) AS n FROM risk_evaluations GROUP BY action",
      ),
      porQuemDecidiu,
      taxaPlanoB: totalDecisoes
        ? Math.round(((porQuemDecidiu.rule ?? 0) / totalDecisoes) * 1000) / 10
        : null,
      alertas: count(
        `SELECT COUNT(*) AS n FROM risk_evaluations
         WHERE COALESCE(overall_risk_level, risk_level) IN ('high', 'critical')`,
      ),
      recomendacoesIA: count(
        "SELECT COUNT(*) AS n FROM risk_evaluations WHERE recommendation IS NOT NULL",
      ),
      custoJevUsd:
        (
          sqlite
            .prepare(
              "SELECT COALESCE(SUM(cost_usd), 0) AS n FROM risk_evaluations",
            )
            .get() as { n: number }
        ).n ?? 0,
    },
    worker: status
      ? {
          mensagens: status.messages,
          gravadas: status.stored,
          repetidas: status.duplicates,
          descartadas: status.discarded,
          avaliacoes: status.evaluations,
          avaliacoesIgnoradas: status.evaluationsSkipped,
          erros: status.errors,
          fila: status.queue,
          duracaoMediaAvaliacaoMs: status.avgEvaluationMs,
          iniciadoEm: status.startedAt,
        }
      : null,
  };
};
