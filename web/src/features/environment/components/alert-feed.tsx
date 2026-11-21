import { RiAlarmWarningLine } from "@remixicon/react";
import { cn } from "@/lib/utils";
import type { EnvironmentAlert } from "@/shared/db/queries/environment";
import {
  ACTION_LABEL,
  formatDateTime,
  formatNumber,
  RISK_LABEL,
  RISK_STYLE,
  RISK_TYPE_LABEL,
} from "./labels";

interface AlertFeedProps {
  alerts: EnvironmentAlert[];
}

export function AlertFeed({ alerts }: AlertFeedProps) {
  const firstWithRecommendation = alerts.find((a) => a.recommendation)?.id;

  return (
    <section className="rounded-2xl bg-agro-surface p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2">
        <RiAlarmWarningLine className="size-5 text-agro-ink-2" />
        <h2 className="border-0 pb-0 text-lg font-semibold text-agro-ink">
          Alertas e recomendações
        </h2>
      </div>
      <p className="mt-0.5 text-sm text-agro-ink-2">
        Decisões automáticas que pediram uma ação. A recomendação de manejo é
        escrita pela IA quando o risco é alto ou crítico.
      </p>

      {alerts.length === 0 ? (
        <p className="mt-4 rounded-xl bg-agro-bg p-4 text-sm text-agro-ink-3">
          Nenhum alerta até agora.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className="flex overflow-hidden rounded-xl border border-agro-separator"
            >
              <span
                className={cn(
                  "w-1.5 shrink-0",
                  RISK_STYLE[alert.riskLevel].bar,
                )}
                aria-hidden
              />
              <div className="min-w-0 flex-1 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-agro-ink">
                    {alert.fieldLabel}
                  </p>
                  <span className="text-xs text-agro-ink-3">
                    {formatDateTime(alert.windowEnd)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-agro-ink-2">
                  <span
                    className={cn(
                      "mr-2 rounded-full px-2 py-0.5 text-xs font-bold",
                      RISK_STYLE[alert.riskLevel].badge,
                    )}
                  >
                    {RISK_LABEL[alert.riskLevel]}
                  </span>
                  <span className="mr-2 font-semibold text-agro-ink">
                    {RISK_TYPE_LABEL[alert.riskType]}
                  </span>
                  {ACTION_LABEL[alert.action]}
                  {alert.riskType === "fungal" &&
                    alert.favorableWetHours !== null &&
                    ` · ${formatNumber(alert.favorableWetHours)} h de folha úmida`}
                  {alert.riskType === "water" &&
                    alert.drySoilHours !== null &&
                    ` · ${formatNumber(alert.drySoilHours)} h de solo seco`}
                  {alert.riskType === "heat" &&
                    alert.hotHours !== null &&
                    ` · ${formatNumber(alert.hotHours)} h acima de 32 °C`}
                  {" · "}
                  {alert.decidedBy === "jev"
                    ? `Jev ${Math.round((alert.confidence ?? 0) * 100)}%`
                    : "regras (plano B)"}
                </p>
                {alert.recommendation && (
                  <details
                    className="group mt-2"
                    open={alert.id === firstWithRecommendation}
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-agro-success">
                      Ver recomendação de manejo
                    </summary>
                    <p className="mt-2 whitespace-pre-line rounded-lg bg-agro-bg p-3 text-sm leading-relaxed text-agro-ink">
                      {alert.recommendation}
                    </p>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
