import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWindow, type WindowReading } from "./aggregate";
import { parseStationReading } from "./reading-schema";
import {
  applyActionFloor,
  decideByRules,
  heatRiskByRules,
  overallRisk,
  waterRiskByRules,
} from "./rules";

const START = new Date("2026-10-10T00:00:00-03:00").getTime();
const STEP_MS = 15 * 60_000;

/** 24 h of readings every 15 min; `humidIndexes` get 95% air humidity. */
const day = (humidCount: number, temperatureC = 20): WindowReading[] =>
  Array.from({ length: 96 }, (_, i) => ({
    ts: new Date(START + i * STEP_MS),
    temperatureC,
    airHumidityPct: i < humidCount ? 95 : 60,
    soilMoisturePct: 30 - i * 0.01,
    luminosityLux: 0,
    event: i < 4 ? "chuva" : null,
  }));

describe("aggregateWindow", () => {
  it("returns null for an empty window", () => {
    assert.equal(aggregateWindow([]), null);
  });

  it("converts humid readings into hours using the reading interval", () => {
    const aggregates = aggregateWindow(day(40));
    assert.ok(aggregates);
    assert.equal(aggregates.readings, 96);
    assert.equal(aggregates.coveredHours, 24);
    assert.equal(aggregates.humidHours, 10);
    assert.equal(aggregates.longestHumidRunHours, 10);
    assert.equal(aggregates.rainHours, 1);
    assert.equal(aggregates.humidHoursTrend, null);
  });

  it("only counts humid hours at 15-25 °C as favourable", () => {
    assert.equal(aggregateWindow(day(40, 20))?.favorableWetHours, 10);
    assert.equal(aggregateWindow(day(40, 30))?.favorableWetHours, 0);
  });

  it("reports the humid-hours trend against the previous window", () => {
    assert.equal(aggregateWindow(day(40), day(16))?.humidHoursTrend, 6);
  });
});

describe("decideByRules", () => {
  const withWetHours = (hours: number) => {
    const aggregates = aggregateWindow(day(hours * 4));
    assert.ok(aggregates);
    return decideByRules(aggregates);
  };

  it("maps favourable wet hours to risk levels and actions", () => {
    assert.deepEqual(withWetHours(2), { riskLevel: "low", action: "none" });
    assert.deepEqual(withWetHours(3), {
      riskLevel: "moderate",
      action: "none",
    });
    assert.deepEqual(withWetHours(6), { riskLevel: "high", action: "notify" });
    assert.deepEqual(withWetHours(10), {
      riskLevel: "critical",
      action: "suggest_agronomist",
    });
  });
});

describe("applyActionFloor", () => {
  const calm = { fungal: "low", water: "low", heat: "low" } as const;

  it("raises weak actions to the minimum each risk demands", () => {
    assert.equal(
      applyActionFloor({ ...calm, fungal: "high" }, "none"),
      "notify",
    );
    assert.equal(
      applyActionFloor({ ...calm, fungal: "critical" }, "notify"),
      "suggest_agronomist",
    );
    assert.equal(
      applyActionFloor({ ...calm, water: "high" }, "none"),
      "irrigate",
    );
    assert.equal(
      applyActionFloor({ ...calm, heat: "critical" }, "none"),
      "notify",
    );
  });

  it("keeps actions already at or above the floor", () => {
    assert.equal(applyActionFloor(calm, "none"), "none");
    assert.equal(
      applyActionFloor({ ...calm, water: "critical" }, "suggest_agronomist"),
      "suggest_agronomist",
    );
  });
});

describe("water and heat rules", () => {
  const withSoil = (soilPct: number, temperatureC = 20) =>
    aggregateWindow(
      day(0, temperatureC).map((r) => ({ ...r, soilMoisturePct: soilPct })),
    );

  it("rates water stress from dry soil", () => {
    const wet = withSoil(30);
    const dry = withSoil(16);
    assert.ok(wet && dry);
    assert.equal(waterRiskByRules(wet), "low");
    assert.equal(waterRiskByRules(dry), "critical");
    assert.equal(dry.drySoilHours, 24);
  });

  it("rates heat stress from hours at or above 32 °C", () => {
    const mild = withSoil(30, 25);
    const hot = withSoil(30, 34);
    assert.ok(mild && hot);
    assert.equal(heatRiskByRules(mild), "low");
    assert.equal(heatRiskByRules(hot), "critical");
    assert.equal(hot.hotHours, 24);
  });

  it("reports the worst risk and its type", () => {
    assert.deepEqual(
      overallRisk({ fungal: "moderate", water: "critical", heat: "high" }),
      { level: "critical", type: "water" },
    );
  });
});

describe("parseStationReading", () => {
  const valid = {
    stationId: "est-alfa-talhao-1",
    fieldId: "seed:alfa-talhao-1",
    ts: "2026-10-10T16:13:00-03:00",
    temperatureC: 24.6,
    airHumidityPct: 95.8,
    soilMoisturePct: 30.7,
    luminosityLux: 0,
    event: "chuva",
  };

  it("accepts the simulator contract and parses the timestamp", () => {
    const result = parseStationReading(JSON.stringify(valid));
    assert.ok(result.success);
    assert.equal(result.data.ts.toISOString(), "2026-10-10T19:13:00.000Z");
  });

  it("rejects invalid JSON and out-of-contract payloads", () => {
    assert.equal(parseStationReading("{").success, false);
    assert.equal(
      parseStationReading(JSON.stringify({ ...valid, airHumidityPct: 140 }))
        .success,
      false,
    );
    assert.equal(
      parseStationReading(JSON.stringify({ ...valid, ts: "ontem" })).success,
      false,
    );
  });
});
