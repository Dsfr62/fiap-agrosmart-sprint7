import { cn } from "@/lib/utils";
import type { DecisionHistoryItem } from "@/shared/db/queries/environment";
import {
  ACTION_LABEL,
  formatDateTime,
  formatNumber,
  RISK_LABEL,
  RISK_STYLE,
  RISK_TYPE_LABEL,
  RISK_TYPE_SHORT,
  RISK_TYPES,
} from "./labels";
import { ProbabilityBar } from "./probability-bar";

interface DecisionHistoryProps {
  items: DecisionHistoryItem[];
}

const percent = (value: number | null): string =>
  value === null ? "—" : `${Math.round(value * 100)}%`;

function StateFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-agro-bg px-3 py-2">
      <dt className="text-xs text-agro-ink-3">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-agro-ink">
        {value}
      </dd>
    </div>
  );
}

/** 7 fields evaluated every hour for 30 days. */
const DECISIONS_PER_MONTH = 7 * 24 * 30;

const usd = (value: number, digits: number): string =>
  `US$ ${value.toFixed(digits).replace(".", ",")}`;

function CostCard({ item }: { item: DecisionHistoryItem }) {
  if (item.decidedBy === "rule" || item.costUsd === null) {
    return (
      <div className="rounded-xl border border-agro-separator p-4">
        <p className="text-xs font-semibold text-agro-ink-3">
          Custo da decisão
        </p>
        <p className="mt-1 text-2xl font-bold text-agro-ink">US$ 0</p>
        <p className="mt-1 text-xs text-agro-ink-2">
          Decidida pelas regras de limiar, sem chamada a modelo.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-agro-success/30 bg-agro-success-tint p-4">
      <p className="text-xs font-semibold text-agro-success">
        Custo desta decisão (Jev)
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-agro-ink">
        {usd(item.costUsd, 6)}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-agro-ink-2">
        <li>
          ≈ <strong>{usd(item.costUsd * 1000, 3)}</strong> a cada 1.000 decisões
        </li>
        <li>
          ≈ <strong>{usd(item.costUsd * DECISIONS_PER_MONTH, 2)}</strong> por
          mês avaliando 7 talhões de hora em hora
        </li>
        <li>
          O Jev cobra só a entrada (o estado ao lado); a resposta é gratuita.
        </li>
        {item.recommendation && (
          <li>
            A recomendação do LLM é cobrada à parte e não entra neste valor.
          </li>
        )}
      </ul>
    </div>
  );
}

function DecisionRow({ item }: { item: DecisionHistoryItem }) {
  const s = item.state;
  const photo = s.latest_photo_analysis;

  return (
    <details className="group rounded-xl border border-agro-separator bg-agro-surface">
      <summary className="grid cursor-pointer list-none grid-cols-2 items-center gap-x-3 gap-y-2 p-3 md:grid-cols-[110px_1.4fr_110px_1.2fr_1.3fr_90px]">
        <span className="text-xs tabular-nums text-agro-ink-3">
          {formatDateTime(item.windowEnd)}
        </span>
        <span className="text-right text-sm font-semibold text-agro-ink md:text-left">
          {item.fieldLabel}
        </span>
        <span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-bold",
              RISK_STYLE[item.riskLevel].badge,
            )}
          >
            {RISK_LABEL[item.riskLevel]}
          </span>
          <span className="ml-1.5 text-xs text-agro-ink-3">
            {RISK_TYPE_SHORT[item.riskType]}
          </span>
        </span>
        <span className="text-right text-sm text-agro-ink-2 md:text-left">
          {ACTION_LABEL[item.action]}
        </span>
        <span className="col-span-2 md:col-span-1">
          {item.probabilities?.[item.riskType] ? (
            <ProbabilityBar
              probabilities={item.probabilities[item.riskType] ?? {}}
              title={`Probabilidades · ${RISK_TYPE_LABEL[item.riskType]}`}
            />
          ) : (
            <span className="text-xs text-agro-ink-3">sem probabilidades</span>
          )}
        </span>
        <span className="col-span-2 text-xs font-semibold text-agro-ink-2 md:col-span-1 md:text-right">
          {item.decidedBy === "jev"
            ? `Jev ${percent(item.riskConfidence)}`
            : "Regras"}
          {item.recommendation ? " · IA" : ""}
        </span>
      </summary>

      <div className="grid gap-4 border-t border-agro-separator p-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-agro-ink">
            Estado enviado ao Jev (últimas 24 h)
          </h3>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StateFact
              label="Folha úmida 15–25 °C"
              value={`${formatNumber(s.favorableWetHours ?? 0)} h`}
            />
            <StateFact
              label="Horas com UR ≥ 90%"
              value={`${formatNumber(s.humidHours ?? 0)} h`}
            />
            <StateFact
              label="Maior sequência úmida"
              value={`${formatNumber(s.longestHumidRunHours ?? 0)} h`}
            />
            <StateFact
              label="Chuva"
              value={`${formatNumber(s.rainHours ?? 0)} h`}
            />
            <StateFact
              label="Temperatura mín / méd / máx"
              value={
                s.temperatureC
                  ? `${formatNumber(s.temperatureC.min)} / ${formatNumber(s.temperatureC.avg)} / ${formatNumber(s.temperatureC.max)} °C`
                  : "—"
              }
            />
            <StateFact
              label="Tendência vs 24 h antes"
              value={
                s.humidHoursTrend === null || s.humidHoursTrend === undefined
                  ? "sem histórico"
                  : `${s.humidHoursTrend > 0 ? "+" : ""}${formatNumber(s.humidHoursTrend)} h úmidas`
              }
            />
            <StateFact
              label="Horas com solo ≤ 20%"
              value={`${formatNumber(s.drySoilHours ?? 0)} h`}
            />
            <StateFact
              label="Horas ≥ 32 °C"
              value={`${formatNumber(s.hotHours ?? 0)} h`}
            />
            <StateFact
              label="Sol forte (≥ 50 mil lux)"
              value={`${formatNumber(s.strongSunHours ?? 0)} h`}
            />
            <StateFact
              label="Umidade do solo média"
              value={
                s.soilMoisturePct
                  ? `${formatNumber(s.soilMoisturePct.avg)}%`
                  : "—"
              }
            />
            <StateFact
              label="Última foto"
              value={
                photo
                  ? `${photo.pestType.replaceAll("_", " ")}, ${formatNumber(photo.affectedPct)}% afetada`
                  : "nenhuma"
              }
            />
          </dl>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-agro-ink-2">
              Ver JSON enviado
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-agro-ink p-3 text-xs text-agro-surface">
              {JSON.stringify(item.state, null, 2)}
            </pre>
          </details>
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-agro-ink">
              Resposta do {item.decidedBy === "jev" ? "Jev" : "plano B"}
            </h3>
            {item.probabilities ? (
              <div className="space-y-3">
                {RISK_TYPES.map((type) => (
                  <div key={type}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold text-agro-ink">
                        {RISK_TYPE_LABEL[type]}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-bold",
                          RISK_STYLE[item.levels[type]].badge,
                        )}
                      >
                        {RISK_LABEL[item.levels[type]]}
                      </span>
                    </div>
                    <ProbabilityBar
                      probabilities={item.probabilities?.[type] ?? {}}
                      isDetailed
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-agro-ink-2">
                Decidido pelas regras de limiar (Jev indisponível):{" "}
                {RISK_TYPES.map(
                  (type) =>
                    `${RISK_TYPE_SHORT[type]} ${RISK_LABEL[item.levels[type]].toLowerCase()}`,
                ).join(" · ")}
                .
              </div>
            )}
            <p className="mt-2 text-xs text-agro-ink-3">
              Ação: {ACTION_LABEL[item.action]} (confiança da ação{" "}
              {percent(item.actionConfidence)})
              {item.model ? ` · ${item.model}` : ""}
            </p>
          </div>
          <CostCard item={item} />
          {item.recommendation && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-agro-ink">
                Recomendação de manejo (LLM)
              </h3>
              <div className="whitespace-pre-line rounded-lg bg-agro-bg p-3 text-sm leading-relaxed text-agro-ink">
                {item.recommendation}
              </div>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

export function DecisionHistory({ items }: DecisionHistoryProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-agro-surface p-6 text-sm text-agro-ink-2">
        Nenhuma decisão encontrada com esses filtros.
      </p>
    );
  }

  return (
    <section className="space-y-2">
      <div className="hidden grid-cols-[110px_1.4fr_110px_1.2fr_1.3fr_90px] gap-x-3 px-3 text-xs font-semibold text-agro-ink-3 md:grid">
        <span>Horário</span>
        <span>Talhão</span>
        <span>Maior risco</span>
        <span>Ação</span>
        <span>Probabilidades do maior risco</span>
        <span className="text-right">Decidido por</span>
      </div>
      {items.map((item) => (
        <DecisionRow key={item.id} item={item} />
      ))}
    </section>
  );
}
