"""Análise do processo da plataforma AgroSmart com mineração de processos (pm4py, capítulo 9).

Uso:
    python processo/analisar_processo.py processo/saida/event-log.csv --saida processo/saida

O que faz:
    1. Descobre o modelo do processo com o Heuristics Miner (rede heurística e rede de Petri).
    2. Mede o quanto o log cabe no modelo (fitness por token replay).
    3. Conta as variantes (os caminhos diferentes que uma leitura percorre).
    4. Mede o tempo dos casos e o tempo de espera entre atividades (onde estão os gargalos).
    5. Escreve um resumo em Markdown (analise.md), os números em JSON (analise.json)
       e as figuras (rede-heuristica.png, rede-de-petri.png, dfg-desempenho.png).

O resumo traz os números medidos. A leitura deles (gargalos, variações e melhorias) é o
trabalho de análise do grupo; o script só aponta onde olhar.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

CORE = ["case_id", "atividade", "instante"]


def ms(value: float | None) -> str:
    if value is None or pd.isna(value):
        return "—"
    if value < 1:
        return f"{value:.2f} ms"
    if value < 1000:
        return f"{value:.0f} ms"
    return f"{value / 1000:.1f} s"


def load(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["instante"] = pd.to_datetime(df["instante"], utc=True, format="ISO8601")
    return df.sort_values(["case_id", "instante"], kind="stable").reset_index(drop=True)


def variants(df: pd.DataFrame) -> pd.DataFrame:
    traces = df.groupby("case_id", sort=False)["atividade"].agg(" → ".join)
    durations = df.groupby("case_id")["instante"].agg(lambda s: (s.max() - s.min()).total_seconds() * 1000)
    table = pd.DataFrame({"variante": traces, "duracao_ms": durations})
    grouped = table.groupby("variante").agg(casos=("duracao_ms", "size"), mediana_ms=("duracao_ms", "median"))
    grouped["percentual"] = grouped["casos"] / grouped["casos"].sum() * 100
    return grouped.sort_values("casos", ascending=False)


def transitions(df: pd.DataFrame) -> pd.DataFrame:
    nxt = df.groupby("case_id")["atividade"].shift(-1)
    wait = (df.groupby("case_id")["instante"].shift(-1) - df["instante"]).dt.total_seconds() * 1000
    pairs = pd.DataFrame({"de": df["atividade"], "para": nxt, "espera_ms": wait}).dropna(subset=["para"])
    table = pairs.groupby(["de", "para"])["espera_ms"].agg(
        vezes="size", media_ms="mean", mediana_ms="median", p95_ms=lambda s: s.quantile(0.95), max_ms="max"
    )
    return table.sort_values("media_ms", ascending=False)


def mine(df: pd.DataFrame, out: Path) -> dict:
    """Heuristics Miner, rede de Petri, fitness e o DFG de desempenho (pm4py)."""
    import pm4py

    log = pm4py.format_dataframe(
        df[CORE].copy(), case_id="case_id", activity_key="atividade", timestamp_key="instante"
    )
    result: dict = {"figuras": [], "falhas": []}

    try:
        heuristics = pm4py.discover_heuristics_net(log, dependency_threshold=0.5)
        pm4py.save_vis_heuristics_net(heuristics, str(out / "rede-heuristica.png"))
        result["figuras"].append("rede-heuristica.png")
    except Exception as error:  # noqa: BLE001 - registra e segue para as outras figuras
        result["falhas"].append(f"rede heurística: {error}")

    try:
        net, initial, final = pm4py.discover_petri_net_heuristics(log, dependency_threshold=0.5)
        pm4py.save_vis_petri_net(net, initial, final, str(out / "rede-de-petri.png"))
        result["figuras"].append("rede-de-petri.png")
        fitness = pm4py.fitness_token_based_replay(log, net, initial, final)
        result["fitness"] = {
            "log_fitness": round(float(fitness.get("log_fitness", 0)), 4),
            "perc_fit_traces": round(float(fitness.get("perc_fit_traces", 0)), 2),
        }
    except Exception as error:  # noqa: BLE001
        result["falhas"].append(f"rede de Petri e fitness: {error}")

    try:
        dfg, start, end = pm4py.discover_performance_dfg(log)
        pm4py.save_vis_performance_dfg(dfg, start, end, str(out / "dfg-desempenho.png"))
        result["figuras"].append("dfg-desempenho.png")
    except Exception as error:  # noqa: BLE001
        result["falhas"].append(f"DFG de desempenho: {error}")

    durations = pm4py.get_all_case_durations(log)
    result["duracao_casos_pm4py_s"] = {
        "media": round(sum(durations) / len(durations), 4) if durations else None,
        "maxima": round(max(durations), 4) if durations else None,
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("--saida", type=Path, default=Path("processo/saida"))
    parser.add_argument("--sem-pm4py", action="store_true", help="só as contas em pandas, sem figuras")
    args = parser.parse_args()
    args.saida.mkdir(parents=True, exist_ok=True)

    df = load(args.csv)
    var = variants(df)
    trans = transitions(df)
    cases = df["case_id"].nunique()
    activities = df["atividade"].value_counts()
    evaluated = df.loc[df["atividade"] == "Avaliação iniciada", "case_id"].nunique()
    queue = pd.to_numeric(df.loc[df["atividade"] == "Avaliação iniciada", "fila"], errors="coerce") if "fila" in df else pd.Series(dtype=float)
    deviations = {
        a: int(activities.get(a, 0))
        for a in (
            "Leitura repetida (ignorada)",
            "Mensagem descartada (inválida)",
            "Leitura não gravada (erro)",
            "Avaliação ignorada",
            "Erro na avaliação",
        )
    }
    by_source = {
        a: int(activities.get(a, 0))
        for a in ("Risco avaliado pelo Jev", "Risco avaliado pelas regras (plano B)")
    }
    mined = {} if args.sem_pm4py else mine(df, args.saida)

    bottleneck = trans.iloc[0] if len(trans) else None
    lines = [
        "### Análise do processo (mineração de processos com pm4py)",
        "",
        f"- **{len(df)} eventos**, **{cases} casos** (cada caso é uma leitura de sensor) e **{len(activities)} atividades**.",
        f"- **{evaluated} casos ({evaluated / cases * 100:.1f}%) dispararam uma avaliação de risco**; os outros só foram gravados (histórico ou hora já avaliada).",
        f"- **{len(var)} variantes** de caminho.",
    ]
    if mined.get("fitness"):
        f = mined["fitness"]
        lines.append(
            f"- Fitness do log na rede de Petri (token replay): **{f['log_fitness']}**; casos que cabem inteiros no modelo: **{f['perc_fit_traces']}%**."
        )
    lines += ["", "**Variantes (os caminhos mais comuns)**", "", "| Casos | % | Mediana do caso | Caminho |", "|---:|---:|---:|---|"]
    for variant, row in var.head(10).iterrows():
        lines.append(f"| {int(row['casos'])} | {row['percentual']:.1f}% | {ms(row['mediana_ms'])} | {variant} |")
    lines += ["", "**Esperas entre atividades (as maiores médias primeiro)**", "", "| De | Para | Vezes | Média | Mediana | p95 | Máxima |", "|---|---|---:|---:|---:|---:|---:|"]
    for (origin, target), row in trans.head(10).iterrows():
        lines.append(
            f"| {origin} | {target} | {int(row['vezes'])} | {ms(row['media_ms'])} | {ms(row['mediana_ms'])} | {ms(row['p95_ms'])} | {ms(row['max_ms'])} |"
        )
    lines += ["", "**Onde olhar**", ""]
    if bottleneck is not None:
        origin, target = trans.index[0]
        lines.append(f"- Maior espera média: **{origin} → {target}**, {ms(bottleneck['media_ms'])} em média ({ms(bottleneck['p95_ms'])} no p95).")
    if len(queue.dropna()):
        lines.append(f"- Fila do avaliador: até **{int(queue.max())}** avaliações esperando juntas (média {queue.mean():.1f}).")
    total_eval = sum(by_source.values())
    if total_eval:
        lines.append(
            f"- Quem decidiu: Jev {by_source['Risco avaliado pelo Jev']}, regras (plano B) {by_source['Risco avaliado pelas regras (plano B)']}"
            f" ({by_source['Risco avaliado pelas regras (plano B)'] / total_eval * 100:.0f}% pelo plano B)."
        )
    lines.append(
        "- Desvios do caminho feliz: "
        + ", ".join(f"{name.lower()} {count}" for name, count in deviations.items())
        + "."
    )
    if mined.get("figuras"):
        lines.append(f"- Figuras geradas: {', '.join(mined['figuras'])}.")
    for failure in mined.get("falhas", []):
        lines.append(f"- **Falhou:** {failure}")
    lines.append("")
    text = "\n".join(lines)

    (args.saida / "analise.md").write_text(text + "\n", encoding="utf-8")
    (args.saida / "analise.json").write_text(
        json.dumps(
            {
                "eventos": len(df),
                "casos": cases,
                "casos_avaliados": evaluated,
                "atividades": activities.to_dict(),
                "variantes": [
                    {"caminho": v.split(" → "), "casos": int(r["casos"]), "percentual": round(float(r["percentual"]), 2), "mediana_ms": float(r["mediana_ms"])}
                    for v, r in var.iterrows()
                ],
                "esperas": [
                    {"de": o, "para": t, **{k: float(v) for k, v in r.items()}} for (o, t), r in trans.iterrows()
                ],
                "quem_decidiu": by_source,
                "desvios": deviations,
                "pm4py": mined,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(text)
    return 1 if mined.get("falhas") else 0


if __name__ == "__main__":
    sys.exit(main())
