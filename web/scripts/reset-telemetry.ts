/**
 * Clears station readings and automated decisions so a demo starts clean.
 * Farms, fields and photo analyses from earlier phases are kept.
 *
 * Usage: bun run telemetry:reset
 */
import { sqlite } from "@/shared/db/client";

const decisions = sqlite.prepare("DELETE FROM risk_evaluations").run().changes;
const readings = sqlite.prepare("DELETE FROM sensor_readings").run().changes;
console.log(
  `Telemetria limpa: ${readings} leituras e ${decisions} decisões removidas.`,
);
sqlite.close();
