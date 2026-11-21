import type {
  DecisionHistoryFilters,
  RiskLevel,
} from "@/shared/db/queries/environment";
import { RISK_LABEL, RISK_ORDER } from "./labels";

interface DecisionFiltersProps {
  fieldOptions: { fieldId: string; label: string }[];
  current: DecisionHistoryFilters;
}

const selectClass =
  "h-10 rounded-xl border border-agro-separator bg-agro-surface px-3 text-sm text-agro-ink";

/** Plain GET form: filters live in the URL and work without client JS. */
export function DecisionFilters({
  fieldOptions,
  current,
}: DecisionFiltersProps) {
  return (
    <form
      method="get"
      className="flex flex-col gap-2 rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)] sm:flex-row sm:flex-wrap sm:items-end"
    >
      <label className="flex flex-col gap-1 text-xs font-semibold text-agro-ink-3">
        Talhão
        <select
          name="talhao"
          defaultValue={current.fieldId ?? ""}
          className={selectClass}
        >
          <option value="">Todos</option>
          {fieldOptions.map((option) => (
            <option key={option.fieldId} value={option.fieldId}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-agro-ink-3">
        Risco
        <select
          name="risco"
          defaultValue={current.riskLevel ?? ""}
          className={selectClass}
        >
          <option value="">Todos</option>
          {RISK_ORDER.map((level: RiskLevel) => (
            <option key={level} value={level}>
              {RISK_LABEL[level]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-agro-ink-3">
        Decidido por
        <select
          name="por"
          defaultValue={current.decidedBy ?? ""}
          className={selectClass}
        >
          <option value="">Todos</option>
          <option value="jev">Jev</option>
          <option value="rule">Regras (plano B)</option>
        </select>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="h-10 rounded-xl bg-agro-success px-4 text-sm font-semibold text-white"
        >
          Filtrar
        </button>
        <a
          href="/ambiente/decisoes"
          className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-semibold text-agro-ink-2"
        >
          Limpar
        </a>
      </div>
    </form>
  );
}
