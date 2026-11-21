import "server-only";
import {
  getEnvironmentAlerts,
  getEnvironmentOverview,
  getFieldSeries,
} from "@/shared/db/queries/environment";
import { AlertFeed } from "../components/alert-feed";
import { FieldCard } from "../components/field-card";
import { FieldSeriesChart } from "../components/field-series-chart";
import { formatDateTime, RISK_ORDER } from "../components/labels";
import { StatusSummary } from "../components/status-summary";

export async function EnvironmentServer() {
  const overview = await getEnvironmentOverview();

  if (!overview.referenceTime) {
    return (
      <p className="rounded-2xl bg-agro-surface p-6 text-sm text-agro-ink-2">
        Nenhuma leitura de estação ainda. Suba o broker, rode o worker (
        <code>bun run worker</code>) e depois o simulador.
      </p>
    );
  }

  const [series, alerts] = await Promise.all([
    getFieldSeries(overview.referenceTime),
    getEnvironmentAlerts(),
  ]);

  const worstField =
    [...overview.fields].sort(
      (a, b) =>
        RISK_ORDER.indexOf(a.risk?.level ?? "low") -
        RISK_ORDER.indexOf(b.risk?.level ?? "low"),
    )[0] ?? overview.fields[0];

  return (
    <>
      <p className="-mt-4 text-sm text-agro-ink-3">
        Última leitura das estações: {formatDateTime(overview.referenceTime)}
      </p>

      <StatusSummary fields={overview.fields} />

      <section>
        <h2 className="mb-3 border-0 pb-0 text-lg font-semibold text-agro-ink">
          Talhões
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {overview.fields.map((field) => (
            <FieldCard key={field.fieldId} data={field} />
          ))}
        </div>
      </section>

      <FieldSeriesChart
        options={overview.fields.map((f) => ({
          fieldId: f.fieldId,
          label: `${f.farm} / ${f.field}`,
        }))}
        series={series}
        defaultFieldId={worstField.fieldId}
      />

      <AlertFeed alerts={alerts} />
    </>
  );
}
