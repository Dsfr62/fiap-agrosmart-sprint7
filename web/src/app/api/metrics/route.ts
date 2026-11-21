import { NextResponse } from "next/server";
import { getMetrics } from "@/features/monitoring/server/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Indicadores de funcionamento: leituras, decisões, plano B, alertas e o worker. */
export async function GET() {
  return NextResponse.json(getMetrics(), {
    headers: { "Cache-Control": "no-store" },
  });
}
