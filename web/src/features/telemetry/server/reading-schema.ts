import { z } from "zod";

/** Contract of one station message published on agrosmart/{farm}/{field}/telemetria. */
export const stationReadingSchema = z.object({
  stationId: z.string().min(1),
  fieldId: z.string().min(1),
  ts: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  temperatureC: z.number().min(-20).max(60),
  airHumidityPct: z.number().min(0).max(100),
  soilMoisturePct: z.number().min(0).max(100),
  luminosityLux: z.number().int().min(0).max(200_000),
  event: z.string().nullable(),
});

export type StationReading = z.infer<typeof stationReadingSchema>;

/** Parses a raw MQTT payload; business errors come back as a Result, never thrown. */
export const parseStationReading = (
  payload: string,
):
  | { success: true; data: StationReading }
  | { success: false; error: string } => {
  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return { success: false, error: "payload is not valid JSON" };
  }
  const parsed = stationReadingSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "invalid",
    };
  }
  return { success: true, data: parsed.data };
};
