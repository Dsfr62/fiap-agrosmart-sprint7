import { RiArrowLeftLine } from "@remixicon/react";
import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { SidebarInset } from "@/components/ui/sidebar";
import { DecisionFilters } from "@/features/environment/components/decision-filters";
import { DecisionHistory } from "@/features/environment/components/decision-history";
import {
  type DecisionHistoryFilters,
  getDecisionHistory,
  getFieldOptions,
  type RiskLevel,
} from "@/shared/db/queries/environment";

export const dynamic = "force-dynamic";

const RISK_VALUES: RiskLevel[] = ["low", "moderate", "high", "critical"];
/** Keeps the DOM small: each row carries a full detail panel. */
const PAGE_SIZE = 30;

interface DecisionsPageProps {
  searchParams: Promise<{
    talhao?: string;
    risco?: string;
    por?: string;
    pagina?: string;
  }>;
}

export default async function DecisionsPage({
  searchParams,
}: DecisionsPageProps) {
  noStore();
  const params = await searchParams;
  const fieldOptions = await getFieldOptions();

  const filters: DecisionHistoryFilters = {
    fieldId: fieldOptions.some((o) => o.fieldId === params.talhao)
      ? params.talhao
      : undefined,
    riskLevel: RISK_VALUES.find((level) => level === params.risco),
    decidedBy:
      params.por === "jev" || params.por === "rule" ? params.por : undefined,
  };
  const items = await getDecisionHistory(filters);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(
    pageCount,
    Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1),
  );
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageHref = (target: number): string => {
    const query = new URLSearchParams();
    if (filters.fieldId) query.set("talhao", filters.fieldId);
    if (filters.riskLevel) query.set("risco", filters.riskLevel);
    if (filters.decidedBy) query.set("por", filters.decidedBy);
    query.set("pagina", String(target));
    return `/ambiente/decisoes?${query.toString()}`;
  };

  const byJev = items.filter((i) => i.decidedBy === "jev");
  const withRecommendation = items.filter((i) => i.recommendation).length;
  const totalCost = items.reduce((sum, i) => sum + (i.costUsd ?? 0), 0);
  const avgConfidence = byJev.length
    ? byJev.reduce((sum, i) => sum + (i.riskConfidence ?? 0), 0) / byJev.length
    : null;

  const stats = [
    { label: "Decisões", value: String(items.length) },
    {
      label: "Pelo Jev",
      value: items.length
        ? `${Math.round((byJev.length / items.length) * 100)}%`
        : "—",
    },
    {
      label: "Confiança média",
      value:
        avgConfidence === null ? "—" : `${Math.round(avgConfidence * 100)}%`,
    },
    { label: "Com recomendação da IA", value: String(withRecommendation) },
    {
      label: "Custo do Jev",
      value: `US$ ${totalCost.toFixed(4).replace(".", ",")}`,
    },
  ];

  return (
    <SidebarInset className="bg-agro-bg">
      <div className="flex flex-1 flex-col gap-5 p-4 pb-24 sm:p-6 md:pb-6">
        <header>
          <Link
            href="/ambiente"
            className="inline-flex items-center gap-1 text-sm font-semibold text-agro-success"
          >
            <RiArrowLeftLine className="size-4" />
            Ambiente
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-agro-ink">
            Histórico de decisões
          </h1>
          <p className="mt-1 text-sm text-agro-ink-2">
            Todas as avaliações automáticas, de hora em hora por talhão: o que
            foi enviado ao Jev, o que ele respondeu e o que o sistema fez. Toque
            numa linha para ver os detalhes.
          </p>
        </header>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
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
            </div>
          ))}
        </dl>

        <DecisionFilters fieldOptions={fieldOptions} current={filters} />
        <DecisionHistory items={pageItems} />
        {pageCount > 1 && (
          <nav
            aria-label="Paginação"
            className="flex items-center justify-between gap-2 text-sm"
          >
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-xl bg-agro-surface px-4 py-2 font-semibold text-agro-success shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
              >
                ← Mais recentes
              </Link>
            ) : (
              <span />
            )}
            <span className="text-agro-ink-3">
              Página {page} de {pageCount} · {items.length} decisões
            </span>
            {page < pageCount ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-xl bg-agro-surface px-4 py-2 font-semibold text-agro-success shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
              >
                Mais antigas →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </SidebarInset>
  );
}
