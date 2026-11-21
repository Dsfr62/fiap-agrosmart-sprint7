import { cn } from "@/lib/utils";
import type {
  FieldEnvironment,
  RiskLevel,
} from "@/shared/db/queries/environment";
import {
  RISK_LABEL,
  RISK_ORDER,
  RISK_STYLE,
  RISK_TYPE_LABEL,
  RISK_TYPES,
} from "./labels";

interface StatusSummaryProps {
  fields: FieldEnvironment[];
}

const headline = (counts: Record<RiskLevel, number>, total: number): string => {
  if (counts.critical > 0)
    return `${counts.critical} de ${total} talhões em risco crítico`;
  if (counts.high > 0)
    return `${counts.high} de ${total} talhões em risco alto`;
  return "Nenhum talhão com risco relevante agora";
};

/** Answers "is everything fine?" before any scroll. */
export function StatusSummary({ fields }: StatusSummaryProps) {
  const counts: Record<RiskLevel, number> = {
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
  };
  for (const field of fields) {
    if (field.risk) counts[field.risk.level] += 1;
  }
  const worst = RISK_ORDER.find((level) => counts[level] > 0) ?? "low";
  const highByType = RISK_TYPES.map((type) => ({
    type,
    count: fields.filter(
      (f) =>
        f.risk &&
        (f.risk.levels[type] === "high" || f.risk.levels[type] === "critical"),
    ).length,
  }));

  return (
    <section className="rounded-2xl bg-agro-surface p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-1.5 size-3 shrink-0 rounded-full",
            RISK_STYLE[worst].bar,
          )}
          aria-hidden
        />
        <div>
          <p className="text-lg font-semibold text-agro-ink">
            {headline(counts, fields.length)}
          </p>
          <p className="mt-0.5 text-sm text-agro-ink-2">
            Maior risco de cada talhão nas próximas 48 h (doença fúngica,
            estresse hídrico ou térmico), avaliado a cada hora pelo Jev.
          </p>
          <p className="mt-1 text-sm text-agro-ink-2">
            {highByType
              .map(
                ({ type, count }) =>
                  `${RISK_TYPE_LABEL[type]}: ${count} em alto/crítico`,
              )
              .join(" · ")}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {RISK_ORDER.map((level) => (
          <span
            key={level}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-semibold",
              RISK_STYLE[level].badge,
            )}
          >
            {RISK_LABEL[level]} · {counts[level]}
          </span>
        ))}
      </div>
    </section>
  );
}
