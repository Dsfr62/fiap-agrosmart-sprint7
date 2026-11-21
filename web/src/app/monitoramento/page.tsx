import { unstable_noStore as noStore } from "next/cache";
import { SidebarInset } from "@/components/ui/sidebar";
import { AutoRefresh } from "@/features/environment/components/auto-refresh";
import { ACTION_LABEL } from "@/features/environment/components/labels";
import {
  type ComponentCheck,
  type ComponentState,
  getHealth,
  getMetrics,
} from "@/features/monitoring/server/health";
import { readRecentEvents } from "@/features/monitoring/server/process-files";
import type { EnvironmentAction } from "@/shared/db/queries/environment";

export const dynamic = "force-dynamic";

const COMPONENT_LABEL = {
  banco: "Banco de dados",
  broker: "Broker MQTT",
  worker: "Worker de ingestão e avaliador",
  leituras: "Leituras dos sensores",
  decisoes: "Decisões da automação",
} as const;

const STATE_LABEL: Record<ComponentState, string> = {
  ok: "Funcionando",
  atencao: "Atenção",
  fora: "Fora do ar",
};

const STATE_STYLE: Record<ComponentState, { dot: string; badge: string }> = {
  ok: {
    dot: "bg-agro-success",
    badge: "bg-agro-success-tint text-agro-success",
  },
  atencao: {
    dot: "bg-agro-warning",
    badge: "bg-agro-warning-tint text-agro-warning",
  },
  fora: {
    dot: "bg-agro-critical",
    badge: "bg-agro-critical-tint text-agro-critical",
  },
};

const OVERALL: Record<
  "ok" | "degradado" | "fora",
  { label: string; state: ComponentState }
> = {
  ok: { label: "Tudo funcionando", state: "ok" },
  degradado: { label: "Funcionando com atenção", state: "atencao" },
  fora: { label: "Fora do ar", state: "fora" },
};

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const formatTime = (iso: unknown): string =>
  typeof iso === "string" ? timeFmt.format(new Date(iso)) : "—";

const card =
  "rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]";

function ComponentRow({
  name,
  check,
}: {
  name: string;
  check: ComponentCheck;
}) {
  const style = STATE_STYLE[check.estado];
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${style.dot}`}
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-agro-ink">{name}</p>
        <p className="text-sm text-agro-ink-2">
          {check.detalhe}
          {check.latenciaMs !== undefined ? ` · ${check.latenciaMs} ms` : ""}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.badge}`}
      >
        {STATE_LABEL[check.estado]}
      </span>
    </li>
  );
}

export default async function MonitoringPage() {
  noStore();
  const health = await getHealth();
  const metrics = getMetrics();
  const events = readRecentEvents(12);
  const overall = OVERALL[health.status];

  const stats = [
    { label: "Leituras gravadas", value: metrics.leituras.total },
    { label: "Leituras na última hora", value: metrics.leituras.ultimaHora },
    { label: "Decisões da automação", value: metrics.decisoes.total },
    {
      label: "Alertas (risco alto ou crítico)",
      value: metrics.decisoes.alertas,
    },
    {
      label: "Decididas pelas regras (plano B)",
      value:
        metrics.decisoes.taxaPlanoB === null
          ? "—"
          : `${String(metrics.decisoes.taxaPlanoB).replace(".", ",")}%`,
    },
    {
      label: "Tempo médio de uma avaliação",
      value:
        metrics.worker?.duracaoMediaAvaliacaoMs == null
          ? "—"
          : `${metrics.worker.duracaoMediaAvaliacaoMs} ms`,
    },
  ];

  return (
    <SidebarInset className="bg-agro-bg">
      <AutoRefresh intervalMs={10_000} />
      <div className="flex flex-1 flex-col gap-5 p-4 pb-24 sm:p-6 md:pb-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-agro-ink">
            Monitoramento
          </h1>
          <p className="mt-1 text-sm text-agro-ink-2">
            O estado de cada peça da plataforma e os indicadores de
            funcionamento. Atualiza sozinho a cada 10 segundos. Os mesmos dados
            saem em <code>/api/health</code> e <code>/api/metrics</code>.
          </p>
        </header>

        <section className={card} aria-labelledby="estado-geral">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="estado-geral"
              className="flex items-center gap-2 text-lg font-bold text-agro-ink"
            >
              <span
                aria-hidden
                className={`size-3 rounded-full ${STATE_STYLE[overall.state].dot}`}
              />
              {overall.label}
            </h2>
            <p className="text-xs text-agro-ink-3">
              Verificado em {formatTime(health.verificadoEm)} · versão{" "}
              {health.versao}
            </p>
          </div>
          <ul className="mt-2 divide-y divide-agro-separator">
            {(
              Object.keys(COMPONENT_LABEL) as Array<
                keyof typeof COMPONENT_LABEL
              >
            ).map((key) => (
              <ComponentRow
                key={key}
                name={COMPONENT_LABEL[key]}
                check={health.componentes[key]}
              />
            ))}
          </ul>
        </section>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat) => (
            <div key={stat.label} className={card}>
              <dt className="text-xs font-semibold text-agro-ink-3">
                {stat.label}
              </dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-agro-ink">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className={card} aria-labelledby="por-acao">
            <h2 id="por-acao" className="font-bold text-agro-ink">
              Decisões por ação
            </h2>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-agro-separator">
                {Object.entries(metrics.decisoes.porAcao)
                  .sort((a, b) => b[1] - a[1])
                  .map(([action, n]) => (
                    <tr key={action}>
                      <td className="py-2 text-agro-ink-2">
                        {ACTION_LABEL[action as EnvironmentAction] ?? action}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums text-agro-ink">
                        {n}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          <section className={card} aria-labelledby="por-talhao">
            <h2 id="por-talhao" className="font-bold text-agro-ink">
              Leituras por talhão
            </h2>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-agro-separator">
                {metrics.leituras.porTalhao.map((row) => (
                  <tr key={row.talhao}>
                    <td className="py-2 text-agro-ink-2">{row.talhao}</td>
                    <td className="py-2 text-right text-xs text-agro-ink-3">
                      {formatTime(row.ultimaRecebida)}
                    </td>
                    <td className="py-2 pl-3 text-right font-semibold tabular-nums text-agro-ink">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section className={card} aria-labelledby="eventos">
          <h2 id="eventos" className="font-bold text-agro-ink">
            Últimos eventos do processo
          </h2>
          <p className="mt-1 text-sm text-agro-ink-2">
            O que o worker registrou no event log (cada leitura é um caso). É
            desse arquivo que sai a análise de processo.
          </p>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-agro-ink-3">
              Nenhum evento ainda: o worker está ligado?
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs text-agro-ink-3">
                  <tr>
                    <th className="py-2 font-semibold">Instante</th>
                    <th className="py-2 font-semibold">Talhão</th>
                    <th className="py-2 font-semibold">Atividade</th>
                    <th className="py-2 font-semibold">Recurso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-agro-separator">
                  {events.map((event) => (
                    <tr
                      key={`${event.case_id}-${event.atividade}-${event.instante}`}
                    >
                      <td className="py-2 tabular-nums text-agro-ink-3">
                        {formatTime(event.instante)}
                      </td>
                      <td className="py-2 text-agro-ink-2">
                        {String(event.talhao ?? "—")}
                      </td>
                      <td className="py-2 font-medium text-agro-ink">
                        {String(event.atividade)}
                      </td>
                      <td className="py-2 text-agro-ink-2">
                        {String(event.recurso)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={card} aria-labelledby="como-acompanhar">
          <h2 id="como-acompanhar" className="font-bold text-agro-ink">
            Como acompanhar o sistema
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-agro-ink-2">
            <li>
              Esta tela: estado de cada peça e indicadores, atualizados a cada
              10 segundos.
            </li>
            <li>
              <code>/api/health</code>: o mesmo estado em JSON, usado pelo
              healthcheck do container (503 só com o banco fora).
            </li>
            <li>
              <code>/api/metrics</code>: os indicadores em JSON, para outra
              ferramenta ler.
            </li>
            <li>
              Logs do worker: uma linha <code>[monitor]</code> por minuto com
              mensagens, leituras, avaliações, fila e erros.
            </li>
            <li>
              Pipeline no GitHub Actions: a cada push roda build, qualidade,
              vulnerabilidades e a execução ponta a ponta.
            </li>
          </ul>
        </section>
      </div>
    </SidebarInset>
  );
}
