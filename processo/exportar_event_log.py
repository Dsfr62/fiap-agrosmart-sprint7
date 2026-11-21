"""Transforma o event log do worker (JSONL) em CSV e XES, prontos para a mineração de processos.

Uso:
    python processo/exportar_event_log.py data/event-log.jsonl --saida processo/saida

Gera:
    event-log.csv           todos os eventos (caso, atividade, instante, recurso e atributos)
    event-log.xes           o mesmo log no formato XES (padrão IEEE da mineração de processos)
    exemplo-event-log.csv   um recorte pequeno, com até 3 casos de cada variante, para o relatório

Cada caso é uma leitura de sensor (talhão + instante da leitura); as atividades são os passos
por onde ela passou dentro da plataforma (capítulo 9 da fase 7: caso, atividade e instante).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

CORE = ["case_id", "atividade", "instante", "recurso", "talhao", "origem"]


def load(path: Path) -> pd.DataFrame:
    rows = []
    with path.open(encoding="utf-8") as handle:
        for number, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                print(f"linha {number} ignorada (incompleta)", file=sys.stderr)
    if not rows:
        sys.exit(f"{path} não tem eventos")
    df = pd.DataFrame(rows)
    df["instante"] = pd.to_datetime(df["instante"], utc=True, format="ISO8601")
    df = df.sort_values(["case_id", "instante"], kind="stable").reset_index(drop=True)
    ordered = [c for c in CORE if c in df.columns] + [c for c in df.columns if c not in CORE]
    return df[ordered]


def sample(df: pd.DataFrame, per_variant: int = 3) -> pd.DataFrame:
    traces = df.groupby("case_id", sort=False)["atividade"].agg(" > ".join)
    chosen = traces.groupby(traces).head(per_variant).index
    return df[df["case_id"].isin(chosen)]


def write_xes(df: pd.DataFrame, path: Path) -> None:
    import pm4py

    core = df[[c for c in CORE if c in df.columns]].copy()
    for column in ("recurso", "talhao", "origem"):
        if column in core.columns:
            core[column] = core[column].fillna("").astype(str)
    log = pm4py.format_dataframe(
        core, case_id="case_id", activity_key="atividade", timestamp_key="instante"
    )
    pm4py.write_xes(log, str(path))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("jsonl", type=Path)
    parser.add_argument("--saida", type=Path, default=Path("processo/saida"))
    parser.add_argument("--sem-xes", action="store_true", help="não gera o XES (não precisa do pm4py)")
    args = parser.parse_args()

    df = load(args.jsonl)
    args.saida.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.saida / "event-log.csv", index=False)
    sample(df).to_csv(args.saida / "exemplo-event-log.csv", index=False)
    print(
        f"{len(df)} eventos, {df['case_id'].nunique()} casos e {df['atividade'].nunique()} atividades"
        f" em {args.saida / 'event-log.csv'}"
    )
    if not args.sem_xes:
        write_xes(df, args.saida / "event-log.xes")
        print(f"XES em {args.saida / 'event-log.xes'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
