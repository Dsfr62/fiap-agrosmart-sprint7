import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";
import { SidebarInset } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AutoRefresh } from "@/features/environment/components/auto-refresh";
import { EnvironmentServer } from "@/features/environment/server/get-environment";

export const dynamic = "force-dynamic";

function EnvironmentSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-[130px] rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[260px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function EnvironmentPage() {
  noStore();
  return (
    <SidebarInset className="bg-agro-bg">
      <AutoRefresh intervalMs={10_000} />
      <div className="flex flex-1 flex-col gap-6 p-4 pb-24 sm:p-6 md:pb-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-agro-ink">
              Ambiente
            </h1>
            <p className="mt-1 text-sm text-agro-ink-2">
              Estações IoT dos talhões e decisões automáticas de risco
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/ambiente/leituras"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-agro-surface px-4 text-sm font-semibold text-agro-success shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
            >
              Leituras ao vivo →
            </Link>
            <Link
              href="/ambiente/decisoes"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-agro-surface px-4 text-sm font-semibold text-agro-success shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
            >
              Histórico de decisões do Jev →
            </Link>
          </div>
        </header>
        <Suspense fallback={<EnvironmentSkeleton />}>
          <EnvironmentServer />
        </Suspense>
      </div>
    </SidebarInset>
  );
}
