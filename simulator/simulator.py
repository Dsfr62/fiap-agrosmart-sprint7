"""AgroSmart environmental station simulator (Fase 6).

Simulates one station per field (talhão). Each station reads air temperature,
air humidity, soil moisture and luminosity at the same instant and publishes a
single combined reading to an MQTT broker.

Timestamps come from a simulated clock, so history can be backfilled and time
can be accelerated for demos.

Usage:
    python simulator.py --backfill-hours 48 --speed 360 --scenario surto
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import paho.mqtt.client as mqtt

TIMEZONE = ZoneInfo("America/Sao_Paulo")
TOPIC_TEMPLATE = "agrosmart/{farm_id}/{field_id}/telemetria"
QOS = 1

# Same farms/fields created by web/src/shared/db/seed.ts.
FIELDS: list[tuple[str, str]] = [
    ("seed:fazenda-alfa", "seed:alfa-talhao-1"),
    ("seed:fazenda-alfa", "seed:alfa-talhao-2"),
    ("seed:fazenda-alfa", "seed:alfa-talhao-3"),
    ("seed:fazenda-beta", "seed:beta-talhao-1"),
    ("seed:fazenda-beta", "seed:beta-talhao-2"),
    ("seed:fazenda-gama", "seed:gama-talhao-1"),
    ("seed:fazenda-gama", "seed:gama-talhao-2"),
]

# "surto" keeps nights humid for longer and rains more often (fungal disease);
# "seca" is hotter, drier, rainless and dries the soil faster (water and heat
# stress). Used to demo the automation.
SCENARIOS: dict[str, dict[str, float]] = {
    "normal": {
        "humidity_offset": 0.0,
        "rain_chance_per_hour": 0.02,
        "temp_offset": 0.0,
        "evaporation_factor": 1.0,
        "soil_start_min": 28.0,
        "soil_start_max": 35.0,
    },
    "surto": {
        "humidity_offset": 8.0,
        "rain_chance_per_hour": 0.06,
        "temp_offset": 0.0,
        "evaporation_factor": 1.0,
        "soil_start_min": 28.0,
        "soil_start_max": 35.0,
    },
    "seca": {
        "humidity_offset": -20.0,
        "rain_chance_per_hour": 0.0,
        "temp_offset": 6.0,
        "evaporation_factor": 2.5,
        "soil_start_min": 19.0,
        "soil_start_max": 24.0,
    },
}

# "misto" gives each farm its own condition so all risk types show at once.
MIXED_SCENARIO = "misto"
MIXED_BY_FARM: dict[str, str] = {
    "seed:fazenda-alfa": "surto",
    "seed:fazenda-beta": "seca",
    "seed:fazenda-gama": "normal",
}


@dataclass
class Station:
    """Mutable state of one simulated station (one per field)."""

    farm_id: str
    field_id: str
    temp_offset: float
    temp_drift: float
    soil_moisture: float
    cloud_factor: float
    rain_hours_left: float = 0.0

    @property
    def station_id(self) -> str:
        return "est-" + self.field_id.split(":", 1)[-1]

    @property
    def topic(self) -> str:
        return TOPIC_TEMPLATE.format(farm_id=self.farm_id, field_id=self.field_id)


def station_params(farm_id: str, scenario: str) -> dict[str, float]:
    """Scenario parameters for one station; "misto" resolves per farm."""
    if scenario == MIXED_SCENARIO:
        return SCENARIOS[MIXED_BY_FARM.get(farm_id, "normal")]
    return SCENARIOS[scenario]


def create_stations(rng: random.Random, scenario: str = "normal") -> list[Station]:
    """Creates one station per seed field with a small microclimate offset."""
    stations = []
    for farm_id, field_id in FIELDS:
        params = station_params(farm_id, scenario)
        stations.append(
            Station(
                farm_id=farm_id,
                field_id=field_id,
                temp_offset=rng.uniform(-1.5, 1.5),
                temp_drift=0.0,
                soil_moisture=rng.uniform(params["soil_start_min"], params["soil_start_max"]),
                cloud_factor=rng.uniform(0.7, 1.0),
            )
        )
    return stations


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def daily_wave(ts: datetime) -> float:
    """Day/night cycle: +1 at 15h (warmest), -1 at 3h (coolest)."""
    hour = ts.hour + ts.minute / 60
    return math.sin(2 * math.pi * (hour - 9) / 24)


def sunlight(ts: datetime) -> float:
    """0 at night, 1 at solar noon; daylight between 6h and 18h."""
    hour = ts.hour + ts.minute / 60
    if hour <= 6 or hour >= 18:
        return 0.0
    return math.sin(math.pi * (hour - 6) / 12)


def next_reading(
    station: Station,
    ts: datetime,
    step_hours: float,
    scenario: str,
    rng: random.Random,
) -> dict[str, object]:
    """Advances the station state by one step and returns the reading payload."""
    params = station_params(station.farm_id, scenario)

    if station.rain_hours_left > 0:
        station.rain_hours_left = max(0.0, station.rain_hours_left - step_hours)
    elif rng.random() < params["rain_chance_per_hour"] * step_hours:
        station.rain_hours_left = rng.uniform(1.0, 4.0)
    is_raining = station.rain_hours_left > 0

    wave = daily_wave(ts)

    station.temp_drift = clamp(station.temp_drift + rng.uniform(-0.2, 0.2), -2.0, 2.0)
    temperature = 23.0 + params["temp_offset"] + 7.0 * wave
    temperature += station.temp_offset + station.temp_drift
    temperature += rng.uniform(-0.3, 0.3)
    if is_raining:
        temperature -= 3.0

    if is_raining:
        air_humidity = rng.uniform(95.0, 99.0)
    else:
        air_humidity = 70.0 - 25.0 * wave + params["humidity_offset"]
        air_humidity += rng.uniform(-2.0, 2.0)

    station.cloud_factor = clamp(station.cloud_factor + rng.uniform(-0.05, 0.05), 0.5, 1.0)
    light = sunlight(ts) * 90_000 * station.cloud_factor * (0.15 if is_raining else 1.0)
    luminosity = light * rng.uniform(0.97, 1.03) if light > 0 else 0.0

    if is_raining:
        station.soil_moisture += 1.5 * step_hours
    else:
        evaporation = 0.08 + 0.12 * max(0.0, temperature - 15.0) / 15.0
        station.soil_moisture -= evaporation * params["evaporation_factor"] * step_hours
    station.soil_moisture = clamp(station.soil_moisture, 15.0, 45.0)

    return {
        "stationId": station.station_id,
        "fieldId": station.field_id,
        "ts": ts.isoformat(timespec="seconds"),
        "temperatureC": round(temperature, 1),
        "airHumidityPct": round(clamp(air_humidity, 20.0, 100.0), 1),
        "soilMoisturePct": round(station.soil_moisture, 1),
        "luminosityLux": round(clamp(luminosity, 0.0, 100_000.0)),
        "event": "chuva" if is_raining else None,
    }


def format_reading(reading: dict[str, object]) -> str:
    event = f"  [{reading['event']}]" if reading["event"] else ""
    return (
        f"  {reading['stationId']:<18} {reading['temperatureC']:>5} °C"
        f"  ar {reading['airHumidityPct']:>5}%"
        f"  solo {reading['soilMoisturePct']:>4}%"
        f"  {reading['luminosityLux']:>6} lux{event}"
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulador de estações AgroSmart (Fase 6)")
    parser.add_argument("--broker-host", default=os.getenv("MQTT_HOST", "localhost"))
    parser.add_argument("--broker-port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    parser.add_argument("--interval-min", type=int, default=15,
                        help="minutos simulados entre leituras (padrão: 15)")
    parser.add_argument("--speed", type=float, default=60.0,
                        help="segundos simulados por segundo real (1 = tempo real; padrão: 60)")
    parser.add_argument("--backfill-hours", type=float, default=0.0,
                        help="horas de histórico publicadas de imediato antes do modo ao vivo")
    parser.add_argument("--count", type=int, default=None,
                        help="leituras ao vivo por estação (omitir = sem fim; 0 = só backfill)")
    parser.add_argument(
        "--scenario", choices=[*sorted(SCENARIOS), MIXED_SCENARIO], default="normal"
    )
    parser.add_argument("--seed", type=int, default=None, help="semente para dados reproduzíveis")
    args = parser.parse_args(argv)
    if args.speed <= 0:
        parser.error("--speed deve ser maior que zero")
    if args.interval_min <= 0:
        parser.error("--interval-min deve ser maior que zero")
    return args


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    rng = random.Random(args.seed)
    stations = create_stations(rng, args.scenario)
    step = timedelta(minutes=args.interval_min)
    step_hours = step.total_seconds() / 3600

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"agrosmart-simulator-{os.getpid()}",
    )
    try:
        client.connect(args.broker_host, args.broker_port)
    except OSError as error:
        print(f"Broker MQTT indisponível em {args.broker_host}:{args.broker_port}: {error}",
              file=sys.stderr)
        return 1
    client.loop_start()

    print(f"Simulador AgroSmart — {len(stations)} estações, cenário '{args.scenario}'")
    print(f"  broker {args.broker_host}:{args.broker_port} | leitura a cada "
          f"{args.interval_min} min simulados | velocidade {args.speed:g}x")

    now = datetime.now(TIMEZONE).replace(second=0, microsecond=0)
    clock = now - timedelta(hours=args.backfill_hours)

    try:
        pending: list[mqtt.MQTTMessageInfo] = []
        while clock < now:
            for station in stations:
                reading = next_reading(station, clock, step_hours, args.scenario, rng)
                pending.append(client.publish(station.topic, json.dumps(reading), qos=QOS))
            clock += step
        for info in pending:
            info.wait_for_publish(timeout=10)
        if pending:
            print(f"Backfill: {len(pending)} leituras publicadas (até {clock:%d/%m %H:%M})")

        live = 0
        while args.count is None or live < args.count:
            print(f"[{clock:%d/%m %H:%M}]")
            for station in stations:
                reading = next_reading(station, clock, step_hours, args.scenario, rng)
                info = client.publish(station.topic, json.dumps(reading), qos=QOS)
                info.wait_for_publish(timeout=10)
                print(format_reading(reading))
            live += 1
            clock += step
            if args.count is None or live < args.count:
                time.sleep(step.total_seconds() / args.speed)
    except KeyboardInterrupt:
        print("\nSimulador interrompido.")
    finally:
        client.loop_stop()
        client.disconnect()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
