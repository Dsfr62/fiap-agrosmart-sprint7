"""Espera a análise do SonarQube terminar e escreve o resultado em Markdown.

Uso (depois do sonar-scanner, na raiz do repositório):
    SONAR_HOST_URL=http://localhost:9000 SONAR_TOKEN=... python3 devsecops/sonar_resumo.py

Saída: o resumo em Markdown no terminal (o pipeline manda para o Summary do GitHub Actions)
e o JSON completo em relatorios/sonarqube.json. Só usa a biblioteca padrão do Python.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

HOST = os.environ.get("SONAR_HOST_URL", "http://localhost:9000").rstrip("/")
TOKEN = os.environ.get("SONAR_TOKEN", "")
REPORT_TASK = Path(".scannerwork/report-task.txt")
OUT = Path("relatorios/sonarqube.json")

METRICS = [
    ("ncloc", "Linhas de código"),
    ("bugs", "Bugs"),
    ("vulnerabilities", "Vulnerabilidades"),
    ("security_hotspots", "Pontos sensíveis de segurança"),
    ("code_smells", "Code smells"),
    ("duplicated_lines_density", "Linhas duplicadas (%)"),
    ("reliability_rating", "Nota de confiabilidade"),
    ("security_rating", "Nota de segurança"),
    ("sqale_rating", "Nota de manutenibilidade"),
]
RATINGS = {"1.0": "A", "2.0": "B", "3.0": "C", "4.0": "D", "5.0": "E"}


def get(path: str, **params: str) -> dict:
    url = f"{HOST}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url)
    credentials = base64.b64encode(f"{TOKEN}:".encode()).decode()
    request.add_header("Authorization", f"Basic {credentials}")
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def read_report_task() -> dict[str, str]:
    if not REPORT_TASK.exists():
        sys.exit(f"Não achei {REPORT_TASK}: o sonar-scanner rodou?")
    pairs = (line.split("=", 1) for line in REPORT_TASK.read_text().splitlines() if "=" in line)
    return {key: value for key, value in pairs}


def wait_for_task(task_id: str, timeout_s: int = 300) -> str:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        status = get("/api/ce/task", id=task_id)["task"]["status"]
        if status in {"SUCCESS", "FAILED", "CANCELED"}:
            return status
        time.sleep(3)
    return "TIMEOUT"


def main() -> int:
    task = read_report_task()
    project = task["projectKey"]
    status = wait_for_task(task["ceTaskId"])
    if status != "SUCCESS":
        print(f"A análise do SonarQube terminou com status {status}.")
        return 1

    gate = get("/api/qualitygates/project_status", projectKey=project)["projectStatus"]
    measures = get(
        "/api/measures/component",
        component=project,
        metricKeys=",".join(key for key, _ in METRICS),
    )["component"]["measures"]
    values = {m["metric"]: m.get("value", "") for m in measures}
    issues = get(
        "/api/issues/search", componentKeys=project, ps="1", facets="severities,types"
    )
    facets = {f["property"]: {v["val"]: v["count"] for v in f["values"]} for f in issues["facets"]}

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(
        json.dumps(
            {"projeto": project, "quality_gate": gate, "metricas": values, "issues": facets},
            ensure_ascii=False,
            indent=2,
        )
    )

    print("### Qualidade do código (SonarQube)")
    print()
    print(f"Quality Gate: **{gate['status']}** (projeto `{project}`)")
    print()
    print("| Métrica | Valor |")
    print("|---|---|")
    for key, label in METRICS:
        value = values.get(key, "")
        if key.endswith("_rating"):
            value = RATINGS.get(value, value)
        print(f"| {label} | {value} |")
    print()
    print("| Issues por severidade | Quantidade |")
    print("|---|---|")
    for severity, count in sorted(facets.get("severities", {}).items()):
        print(f"| {severity} | {count} |")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
