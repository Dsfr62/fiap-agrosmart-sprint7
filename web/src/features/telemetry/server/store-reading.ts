import { randomUUID } from "node:crypto";
import { db } from "@/shared/db/client";
import { sensorReadings } from "@/shared/db/schema";
import type { StationReading } from "./reading-schema";

/**
 * Persists one station reading. Duplicates (same field and instant, possible
 * with MQTT QoS 1) are ignored by the unique index.
 */
export const storeReading = (
  reading: StationReading,
  receivedAt: Date,
):
  | { success: true; data: { inserted: boolean } }
  | { success: false; error: string } => {
  try {
    const result = db
      .insert(sensorReadings)
      .values({ id: randomUUID(), ...reading, receivedAt })
      .onConflictDoNothing()
      .run();
    return { success: true, data: { inserted: result.changes > 0 } };
  } catch (error) {
    // Unknown fieldId fails the foreign key: a bad station config, not a crash.
    return {
      success: false,
      error: error instanceof Error ? error.message : "falha ao gravar leitura",
    };
  }
};
