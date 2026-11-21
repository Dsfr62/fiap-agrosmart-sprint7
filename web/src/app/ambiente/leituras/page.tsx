import { RiArrowLeftLine, RiRadioButtonLine } from "@remixicon/react";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { SidebarInset } from "@/components/ui/sidebar";
import { AutoRefresh } from "@/features/environment/components/auto-refresh";
import { formatDateTime } from "@/features/environment/components/labels";
import { cn } from "@/lib/utils";
import { getTelemetryActivity } from "@/shared/db/queries/environment";

export const dynamic = "force-dynamic";

const formatClock = (date: Date): string =>
  date.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function LiveReadingsPage() {
  noStore();
  const activity = await getTelemetryActivity();
  const secondsSinceLast = activity.lastReceivedAt
    ? Math.round((Date.now() - activity.lastReceivedAt.getTime()) / 1000)
    : null;
  const isLive = secondsSinceLast !== null && secondsSinceLast <= 30;

  const stats = [
    {
      label: "Estações transmitindo",
      value: `${activity.activeStations} de ${activity.totalStations}`,
      note: "nos últimos 2 min",
    },
    {
      label: "Mensagens no último minuto",
      value: String(activity.lastMinute),
      note: "recebidas pelo worker",
    },
    {
      label: "Leituras gravadas",
      value: activity.totalReadings.toLocaleString("pt-BR"),
      note: "sem duplicatas (talhão + instante)",
    },
    {
      label: "Última mensagem",
      value:
        secondsSinceLast === null
          ? "—"
          : secondsSinceLast < 60
            ? `há ${secondsSinceLast} s`
            : `às ${formatClock(activity.lastReceivedAt as Date)}`,
      note: "relógio do servidor",
    },
  ];

  return (
    <SidebarInset className="bg-agro-bg">
      <AutoRefresh intervalMs={5_000} />
      <div className="flex flex-1 flex-col gap-5 p-4 pb-24 sm:p-6 md:pb-6">
        <header>
          <Link
            href="/ambiente"
            className="inline-flex items-center gap-1 text-sm font-semibold text-agro-success"
          >
            <RiArrowLeftLine className="size-4" />
            Ambiente
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-agro-ink">
              Leituras ao vivo
            </h1>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                isLive
                  ? "bg-agro-success-tint text-agro-success"
                  : "bg-agro-muted text-agro-ink-3",
              )}
            >
              <RiRadioButtonLine className="size-3.5" />
              {isLive ? "Recebendo" : "Sem mensagens recentes"}
            </span>
          </div>
          <p className="mt-1 text-sm text-agro-ink-2">
            Cada estação publica uma mensagem por leitura no broker MQTT; o
            worker assina{" "}
            <code className="rounded bg-agro-surface px-1">
              agrosmart/+/+/telemetria
            </code>
            , valida e grava. Abaixo, as últimas mensagens recebidas,
            atualizadas a cada 5 s.
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
            >
              <dt className="text-xs font-semibold text-agro-ink-3">
                {stat.label}
              </dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-agro-ink">
                {stat.value}
              </dd>
              <dd className="text-xs text-agro-ink-3">{stat.note}</dd>
            </div>
          ))}
        </dl>

        {activity.messages.length === 0 ? (
          <p className="rounded-2xl bg-agro-surface p-6 text-sm text-agro-ink-2">
            Nenhuma mensagem recebida ainda. Rode <code>bun run demo</code>.
          </p>
        ) : (
          <ul className="grid gap-2 xl:grid-cols-2">
            {activity.messages.map((message) => (
              <li
                key={message.id}
                className="overflow-hidden rounded-xl border border-agro-separator bg-agro-surface"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-agro-separator px-3 py-2">
                  <code className="break-all text-xs font-semibold text-agro-success">
                    {message.topic}
                  </code>
                  <span className="text-xs text-agro-ink-3">
                    recebida {formatDateTime(message.receivedAt)}:
                    {String(message.receivedAt.getSeconds()).padStart(2, "0")}
                  </span>
                </div>
                <pre className="overflow-x-auto bg-agro-ink p-3 text-xs leading-relaxed text-agro-surface">
                  {JSON.stringify(message.payload, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SidebarInset>
  );
}
