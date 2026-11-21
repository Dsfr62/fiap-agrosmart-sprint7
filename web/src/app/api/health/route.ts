import { NextResponse } from "next/server";
import { getHealth } from "@/features/monitoring/server/health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Saúde da plataforma: banco, broker MQTT, worker, leituras e decisões.
 * Responde 200 com status "ok" ou "degradado" e 503 só quando o banco está fora,
 * para o healthcheck do container não derrubar o app por causa de outra peça.
 */
export async function GET() {
  const report = await getHealth();
  return NextResponse.json(report, {
    status: report.status === "fora" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
