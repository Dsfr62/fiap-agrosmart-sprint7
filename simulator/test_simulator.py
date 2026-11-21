import random
from datetime import datetime, timedelta

from simulator import MIXED_SCENARIO, SCENARIOS, TIMEZONE, create_stations, next_reading

START = datetime(2026, 10, 1, 0, 0, tzinfo=TIMEZONE)
STEP = timedelta(minutes=15)


def simulate(scenario: str, hours: int, seed: int = 7) -> list[dict[str, object]]:
    rng = random.Random(seed)
    stations = create_stations(rng, scenario)
    readings = []
    ts = START
    for _ in range(hours * 4):
        for station in stations:
            readings.append(next_reading(station, ts, STEP.total_seconds() / 3600, scenario, rng))
        ts += STEP
    return readings


def test_readings_stay_in_physical_ranges():
    for scenario in [*SCENARIOS, MIXED_SCENARIO]:
        for reading in simulate(scenario, 72):
            assert 5 <= reading["temperatureC"] <= 40
            assert 20 <= reading["airHumidityPct"] <= 100
            assert 15 <= reading["soilMoisturePct"] <= 45
            assert 0 <= reading["luminosityLux"] <= 100_000


def test_no_light_at_night():
    for reading in simulate("normal", 48):
        hour = datetime.fromisoformat(reading["ts"]).hour
        if hour < 6 or hour >= 18:
            assert reading["luminosityLux"] == 0


def test_payload_contract():
    reading = simulate("normal", 1)[0]
    assert set(reading) == {
        "stationId",
        "fieldId",
        "ts",
        "temperatureC",
        "airHumidityPct",
        "soilMoisturePct",
        "luminosityLux",
        "event",
    }
    assert datetime.fromisoformat(reading["ts"]).utcoffset() is not None


def test_surto_keeps_air_humid_longer():
    def humid_share(scenario: str) -> float:
        readings = simulate(scenario, 72)
        return sum(reading["airHumidityPct"] >= 90 for reading in readings) / len(readings)

    assert humid_share("surto") > humid_share("normal")


def test_seca_is_hotter_and_dries_the_soil():
    def mean(scenario: str, key: str) -> float:
        readings = simulate(scenario, 48)
        return sum(reading[key] for reading in readings) / len(readings)

    assert mean("seca", "temperatureC") > mean("normal", "temperatureC") + 4
    assert mean("seca", "soilMoisturePct") < mean("normal", "soilMoisturePct") - 8
    assert all(reading["event"] is None for reading in simulate("seca", 48))


def test_misto_gives_each_farm_its_condition():
    readings = simulate(MIXED_SCENARIO, 48)

    def mean_soil(prefix: str) -> float:
        values = [r["soilMoisturePct"] for r in readings if r["fieldId"].startswith(prefix)]
        return sum(values) / len(values)

    assert mean_soil("seed:beta") < mean_soil("seed:alfa") - 8
