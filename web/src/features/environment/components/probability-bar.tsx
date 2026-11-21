import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/shared/db/queries/environment";
import { RISK_LABEL, RISK_STYLE } from "./labels";

const LEVELS: RiskLevel[] = ["low", "moderate", "high", "critical"];

interface ProbabilityBarProps {
  probabilities: Partial<Record<RiskLevel, number>>;
  isDetailed?: boolean;
  /** Tooltip heading, e.g. the risk type the probabilities refer to. */
  title?: string;
}

/** How Jev split its probability across the risk levels. */
export function ProbabilityBar({
  probabilities,
  isDetailed = false,
  title = "Probabilidade de cada nível",
}: ProbabilityBarProps) {
  if (!isDetailed) {
    // CSS-only tooltip: rendered on the server, no client JS per row.
    return (
      <div className="group/bar relative py-1">
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-agro-muted"
          role="img"
          aria-label={`Probabilidades do Jev: ${LEVELS.map(
            (level) =>
              `${RISK_LABEL[level]} ${Math.round((probabilities[level] ?? 0) * 100)}%`,
          ).join(", ")}`}
        >
          {LEVELS.map((level) => (
            <span
              key={level}
              className={RISK_STYLE[level].bar}
              style={{ width: `${(probabilities[level] ?? 0) * 100}%` }}
            />
          ))}
        </div>
        <div
          aria-hidden
          className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-1 w-48 -translate-x-1/2 rounded-lg bg-agro-ink px-3 py-2 text-xs text-agro-surface opacity-0 shadow-lg transition-opacity group-hover/bar:visible group-hover/bar:opacity-100"
        >
          <div className="mb-1 font-semibold">{title}</div>
          {LEVELS.map((level) => (
            <div key={level} className="flex items-center gap-2">
              <span
                className={cn("size-2 rounded-full", RISK_STYLE[level].bar)}
              />
              <span className="flex-1">{RISK_LABEL[level]}</span>
              <span className="font-semibold tabular-nums">
                {Math.round((probabilities[level] ?? 0) * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {LEVELS.map((level) => {
        const pct = Math.round((probabilities[level] ?? 0) * 100);
        return (
          <div key={level} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-agro-ink-2">{RISK_LABEL[level]}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-agro-muted">
              <span
                className={cn("block h-full", RISK_STYLE[level].bar)}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="w-9 text-right font-semibold tabular-nums text-agro-ink">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
