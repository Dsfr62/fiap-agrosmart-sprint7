import {
  RiContrastDrop2Line,
  RiDropLine,
  RiRainyLine,
  RiSunLine,
  RiTempHotLine,
} from "@remixicon/react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import type { FieldEnvironment } from "@/shared/db/queries/environment";
import {
  ACTION_LABEL,
  formatDateTime,
  formatNumber,
  RISK_LABEL,
  RISK_STYLE,
  RISK_TYPE_SHORT,
  RISK_TYPES,
} from "./labels";

interface FieldCardProps {
  data: FieldEnvironment;
}

interface MetricProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  note?: string;
  isAlert?: boolean;
}

function Metric({ icon: Icon, label, value, note, isAlert }: MetricProps) {
  return (
    <div className="rounded-xl bg-agro-bg p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-agro-ink-3">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums text-agro-ink">
        {value}
      </p>
      {note && (
        <p
          className={cn(
            "mt-0.5 text-xs",
            isAlert ? "font-semibold text-agro-warning" : "text-agro-ink-3",
          )}
        >
          {note}
        </p>
      )}
    </div>
  );
}

export function FieldCard({ data }: FieldCardProps) {
  const { latest, risk } = data;
  const isHumid = latest !== null && latest.airHumidityPct >= 90;
  const isHot = latest !== null && latest.temperatureC >= 32;
  const isDrySoil = latest !== null && latest.soilMoisturePct <= 20;

  return (
    <article className="flex flex-col rounded-2xl bg-agro-surface p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-agro-ink-3">{data.farm}</p>
          <h3 className="text-base font-semibold text-agro-ink">
            {data.field}
          </h3>
        </div>
        {risk ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-bold",
              RISK_STYLE[risk.level].badge,
            )}
          >
            Risco {RISK_LABEL[risk.level].toLowerCase()}
            {risk.level !== "low" &&
              ` · ${RISK_TYPE_SHORT[risk.type].toLowerCase()}`}
          </span>
        ) : (
          <span className="rounded-full bg-agro-muted px-2.5 py-1 text-xs font-bold text-agro-ink-3">
            Sem avaliação
          </span>
        )}
      </header>

      {risk && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RISK_TYPES.map((type) => (
            <span
              key={type}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                RISK_STYLE[risk.levels[type]].badge,
              )}
            >
              {RISK_TYPE_SHORT[type]}{" "}
              {RISK_LABEL[risk.levels[type]].toLowerCase()}
            </span>
          ))}
        </div>
      )}

      {latest ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Metric
              icon={RiTempHotLine}
              label="Temperatura"
              value={`${formatNumber(latest.temperatureC)} °C`}
              note={
                isHot
                  ? "≥ 32 °C: estresse por calor"
                  : latest.temperatureC >= 15 && latest.temperatureC <= 25
                    ? "Faixa favorável a fungos"
                    : undefined
              }
              isAlert={isHot}
            />
            <Metric
              icon={RiContrastDrop2Line}
              label="Umidade do ar"
              value={`${formatNumber(latest.airHumidityPct, 0)}%`}
              note={isHumid ? "≥ 90%: folha molhada" : "Abaixo de 90%"}
              isAlert={isHumid}
            />
            <Metric
              icon={RiDropLine}
              label="Umidade do solo"
              value={`${formatNumber(latest.soilMoisturePct)}%`}
              note={isDrySoil ? "≤ 20%: solo seco" : "Acima de 20%"}
              isAlert={isDrySoil}
            />
            <Metric
              icon={RiSunLine}
              label="Luminosidade"
              value={
                latest.luminosityLux === 0
                  ? "Noite"
                  : `${formatNumber(latest.luminosityLux / 1000)} mil lux`
              }
            />
          </div>

          <div className="mt-3 space-y-1 text-sm text-agro-ink-2">
            {risk?.favorableWetHours !== null &&
              risk?.favorableWetHours !== undefined && (
                <p>
                  <span className="font-semibold text-agro-ink">
                    {formatNumber(risk.favorableWetHours)} h
                  </span>{" "}
                  de folha úmida a 15–25 °C nas últimas 24 h
                </p>
              )}
            {risk?.drySoilHours ? (
              <p>
                <span className="font-semibold text-agro-ink">
                  {formatNumber(risk.drySoilHours)} h
                </span>{" "}
                com solo ≤ 20% nas últimas 24 h
              </p>
            ) : null}
            {risk?.hotHours ? (
              <p>
                <span className="font-semibold text-agro-ink">
                  {formatNumber(risk.hotHours)} h
                </span>{" "}
                acima de 32 °C nas últimas 24 h
              </p>
            ) : null}
            {risk && (
              <p>
                Ação:{" "}
                <span className="font-semibold text-agro-ink">
                  {ACTION_LABEL[risk.action]}
                </span>
                {" · "}
                {risk.decidedBy === "jev"
                  ? `Jev ${Math.round((risk.confidence ?? 0) * 100)}%`
                  : "regras (plano B)"}
              </p>
            )}
          </div>

          <footer className="mt-auto flex items-center justify-between gap-2 border-t border-agro-separator pt-3 text-xs text-agro-ink-3">
            <span>Leitura de {formatDateTime(latest.ts)}</span>
            {latest.event && (
              <span className="inline-flex items-center gap-1 rounded-full bg-agro-bg px-2 py-0.5 font-semibold text-agro-ink-2">
                <RiRainyLine className="size-3.5" />
                Chovendo
              </span>
            )}
          </footer>
        </>
      ) : (
        <p className="mt-3 text-sm text-agro-ink-3">
          Nenhuma leitura recebida desta estação.
        </p>
      )}
    </article>
  );
}
