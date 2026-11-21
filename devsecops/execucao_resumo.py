"""Confere a execução ponta a ponta e escreve o resumo em Markdown.

Lê o banco SQLite que o worker gravou (leituras dos sensores e decisões da automação),
confere que a entrada virou saída e mostra um exemplo de cada lado.

Uso:
    python3 devsecops/execucao_resumo.py data/agrosmart.db --min-leituras 100 --min-decisoes 10

Sai com código 1 se faltar leitura ou decisão. Só usa a biblioteca padrão do Python.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


def when(ms: int | None) -> str:
    if ms is None:
        return ""
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%d/%m %H:%M UTC")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("banco", type=Path)
    parser.add_argument("--min-leituras", type=int, default=1)
    parser.add_argument("--min-decisoes", type=int, default=1)
    parser.add_argument("--json", type=Path, default=Path("relatorios/execucao.json"))
    args = parser.parse_args()

    db = sqlite3.connect(f"file:{args.banco}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    one = lambda sql: db.execute(sql).fetchone()[0]  # noqa: E731
    rows = lambda sql: [dict(r) for r in db.execute(sql).fetchall()]  # noqa: E731

    readings = one("SELECT COUNT(*) FROM sensor_readings")
    decisions = one("SELECT COUNT(*) FROM risk_evaluations")
    by_field = rows(
        """SELECT fa.name AS fazenda, f.name AS talhao, COUNT(r.id) AS leituras,
                  MIN(r.ts) AS primeira, MAX(r.ts) AS ultima
           FROM sensor_readings r JOIN fields f ON f.id = r.field_id JOIN farms fa ON fa.id = f.farm_id
           GROUP BY r.field_id ORDER BY fa.name, f.name"""
    )
    by_source = rows("SELECT decided_by AS quem, COUNT(*) AS n FROM risk_evaluations GROUP BY 1 ORDER BY 2 DESC")
    by_action = rows("SELECT action AS acao, COUNT(*) AS n FROM risk_evaluations GROUP BY 1 ORDER BY 2 DESC")
    by_level = rows(
        "SELECT COALESCE(overall_risk_level, risk_level) AS nivel, COUNT(*) AS n FROM risk_evaluations GROUP BY 1 ORDER BY 2 DESC"
    )
    example_in = rows(
        """SELECT station_id, ts, temperature_c, air_humidity_pct, soil_moisture_pct, luminosity_lux, event
           FROM sensor_readings ORDER BY ts DESC LIMIT 1"""
    )
    example_out = rows(
        """SELECT f.name AS talhao, e.window_end, e.risk_level AS risco_fungico, e.water_risk_level AS risco_hidrico,
                  e.heat_risk_level AS risco_termico, e.overall_risk_type AS tipo, e.action AS acao,
                  e.decided_by AS quem, e.aggregates
           FROM risk_evaluations e JOIN fields f ON f.id = e.field_id
           ORDER BY CASE COALESCE(e.overall_risk_level, e.risk_level)
                      WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'moderate' THEN 2 ELSE 3 END,
                    e.window_end DESC
           LIMIT 1"""
    )

    args.json.parent.mkdir(exist_ok=True)
    args.json.write_text(
        json.dumps(
            {
                "leituras": readings,
                "decisoes": decisions,
                "por_talhao": by_field,
                "por_quem_decidiu": by_source,
                "por_acao": by_action,
                "por_nivel": by_level,
                "exemplo_entrada": example_in,
                "exemplo_saida": example_out,
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    print("### Execução ponta a ponta (sensores, MQTT, worker, automação)")
    print()
    print(f"- Leituras gravadas: **{readings}**")
    print(f"- Decisões da automação: **{decisions}**")
    print()
    print("| Fazenda | Talhão | Leituras | Primeira | Última |")
    print("|---|---|---|---|---|")
    for r in by_field:
        print(f"| {r['fazenda']} | {r['talhao']} | {r['leituras']} | {when(r['primeira'])} | {when(r['ultima'])} |")
    print()
    for title, data, key in (
        ("Quem decidiu", by_source, "quem"),
        ("Ação decidida", by_action, "acao"),
        ("Nível de risco geral", by_level, "nivel"),
    ):
        print(f"| {title} | Decisões |")
        print("|---|---|")
        for r in data:
            print(f"| {r[key]} | {r['n']} |")
        print()
    if example_in:
        print("**Exemplo de entrada** (última leitura gravada):")
        print("```json")
        print(json.dumps(example_in[0], ensure_ascii=False, indent=2))
        print("```")
    if example_out:
        out = dict(example_out[0])
        out["aggregates"] = json.loads(out["aggregates"]) if out.get("aggregates") else None
        print("**Exemplo de saída** (a decisão de maior risco):")
        print("```json")
        print(json.dumps(out, ensure_ascii=False, indent=2))
        print("```")

    ok = readings >= args.min_leituras and decisions >= args.min_decisoes
    if not ok:
        print(
            f"\n**Falhou:** esperava pelo menos {args.min_leituras} leituras e {args.min_decisoes} decisões."
        )
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
