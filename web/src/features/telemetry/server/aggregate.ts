/** One stored reading as needed by the window aggregation. */
export interface WindowReading {
  ts: Date;
  temperatureC: number;
  airHumidityPct: number;
  soilMoisturePct: number;
  luminosityLux: number;
  event: string | null;
}

export interface WindowAggregates {
  readings: number;
  coveredHours: number;
  temperatureC: { min: number; avg: number; max: number };
  airHumidityPct: { avg: number; max: number };
  soilMoisturePct: { avg: number; last: number; change: number };
  /** Hours with air humidity >= 90% — proxy for leaf wetness. */
  humidHours: number;
  /** Humid hours at 15–25 °C, the range that favours fungal infection. */
  favorableWetHours: number;
  longestHumidRunHours: number;
  rainHours: number;
  /** Hours with air temperature >= 32 °C — heat stress. */
  hotHours: number;
  /** Hours with soil moisture <= 20% — water stress. */
  drySoilHours: number;
  /** Hours of strong sun (>= 50k lux) — drives evaporation and heating. */
  strongSunHours: number;
  /** Average luminosity during daylight readings, in lux. */
  daylightLuxAvg: number;
  /** humidHours minus the previous window's humidHours; null without history. */
  humidHoursTrend: number | null;
}

export const HUMID_THRESHOLD_PCT = 90;
export const HOT_THRESHOLD_C = 32;
export const DRY_SOIL_THRESHOLD_PCT = 20;
const STRONG_SUN_LUX = 50_000;
const FAVORABLE_MIN_C = 15;
const FAVORABLE_MAX_C = 25;
const DEFAULT_STEP_HOURS = 0.25;

const round1 = (value: number): number => Math.round(value * 10) / 10;

const average = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Median gap between consecutive readings, in hours. */
const stepHours = (readings: WindowReading[]): number => {
  const gaps = readings
    .slice(1)
    .map(
      (reading, i) =>
        (reading.ts.getTime() - readings[i].ts.getTime()) / 3_600_000,
    )
    .filter((gap) => gap > 0)
    .sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : DEFAULT_STEP_HOURS;
};

const isHumid = (reading: WindowReading): boolean =>
  reading.airHumidityPct >= HUMID_THRESHOLD_PCT;

const countHumidHours = (readings: WindowReading[], step: number): number =>
  readings.filter(isHumid).length * step;

/**
 * Summarises a time window of station readings into the compact indicators
 * sent to the decision model. Returns null when the window has no readings.
 */
export const aggregateWindow = (
  current: WindowReading[],
  previous: WindowReading[] = [],
): WindowAggregates | null => {
  if (current.length === 0) return null;

  const readings = [...current].sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const step = stepHours(readings);

  let run = 0;
  let longestRun = 0;
  for (const reading of readings) {
    run = isHumid(reading) ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
  }

  const temperatures = readings.map((r) => r.temperatureC);
  const humidities = readings.map((r) => r.airHumidityPct);
  const soil = readings.map((r) => r.soilMoisturePct);
  const humidHours = countHumidHours(readings, step);
  const daylight = readings.filter((r) => r.luminosityLux > 0);

  return {
    readings: readings.length,
    coveredHours: round1(readings.length * step),
    temperatureC: {
      min: round1(Math.min(...temperatures)),
      avg: round1(average(temperatures)),
      max: round1(Math.max(...temperatures)),
    },
    airHumidityPct: {
      avg: round1(average(humidities)),
      max: round1(Math.max(...humidities)),
    },
    soilMoisturePct: {
      avg: round1(average(soil)),
      last: soil[soil.length - 1],
      change: round1(soil[soil.length - 1] - soil[0]),
    },
    humidHours: round1(humidHours),
    favorableWetHours: round1(
      readings.filter(
        (r) =>
          isHumid(r) &&
          r.temperatureC >= FAVORABLE_MIN_C &&
          r.temperatureC <= FAVORABLE_MAX_C,
      ).length * step,
    ),
    longestHumidRunHours: round1(longestRun * step),
    rainHours: round1(readings.filter((r) => r.event !== null).length * step),
    hotHours: round1(
      readings.filter((r) => r.temperatureC >= HOT_THRESHOLD_C).length * step,
    ),
    drySoilHours: round1(
      readings.filter((r) => r.soilMoisturePct <= DRY_SOIL_THRESHOLD_PCT)
        .length * step,
    ),
    strongSunHours: round1(
      readings.filter((r) => r.luminosityLux >= STRONG_SUN_LUX).length * step,
    ),
    daylightLuxAvg: Math.round(
      daylight.length ? average(daylight.map((r) => r.luminosityLux)) : 0,
    ),
    humidHoursTrend: previous.length
      ? round1(humidHours - countHumidHours(previous, stepHours(previous)))
      : null,
  };
};
