"""Resume os relatórios JSON do Trivy em Markdown.

Uso:
    python3 devsecops/trivy_resumo.py relatorios/trivy-*.json
    python3 devsecops/trivy_resumo.py --bloquear CRITICAL relatorios/trivy-*.json

Com --bloquear, sai com código 1 se houver vulnerabilidade daquela severidade que já
tenha correção publicada (é a regra do portão do pipeline). Só usa a biblioteca padrão.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]


def summarize(path: Path) -> tuple[Counter, Counter, list[dict], Counter]:
    data = json.loads(path.read_text())
    total: Counter = Counter()
    fixable: Counter = Counter()
    misconfig: Counter = Counter()
    worst: list[dict] = []
    for result in data.get("Results") or []:
        for vuln in result.get("Vulnerabilities") or []:
            severity = vuln.get("Severity", "UNKNOWN")
            total[severity] += 1
            if vuln.get("FixedVersion"):
                fixable[severity] += 1
            if severity in {"CRITICAL", "HIGH"}:
                worst.append(
                    {
                        "severidade": severity,
                        "id": vuln.get("VulnerabilityID", ""),
                        "pacote": vuln.get("PkgName", ""),
                        "instalada": vuln.get("InstalledVersion", ""),
                        "corrigida": vuln.get("FixedVersion", "") or "sem correção",
                    }
                )
        for item in result.get("Misconfigurations") or []:
            if item.get("Status") == "FAIL":
                misconfig[item.get("Severity", "UNKNOWN")] += 1
    worst.sort(key=lambda v: (SEVERITIES.index(v["severidade"]), v["corrigida"] == "sem correção"))
    return total, fixable, worst, misconfig


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bloquear", choices=SEVERITIES, default=None)
    parser.add_argument("relatorios", nargs="+", type=Path)
    args = parser.parse_args()

    blocked = 0
    print("### Vulnerabilidades e configuração (Trivy)")
    print()
    print("| Relatório | " + " | ".join(SEVERITIES) + " | Com correção (CRITICAL/HIGH) | Configuração com falha |")
    print("|---|" + "---|" * len(SEVERITIES) + "---|---|")
    details: list[tuple[str, list[dict]]] = []
    for path in args.relatorios:
        total, fixable, worst, misconfig = summarize(path)
        cells = " | ".join(str(total.get(s, 0)) for s in SEVERITIES)
        fix = f"{fixable.get('CRITICAL', 0)}/{fixable.get('HIGH', 0)}"
        bad_config = sum(misconfig.values())
        print(f"| `{path.name}` | {cells} | {fix} | {bad_config} |")
        details.append((path.name, worst))
        if args.bloquear:
            blocked += fixable.get(args.bloquear, 0)

    for name, worst in details:
        if not worst:
            continue
        print()
        print(f"<details><summary>{name}: as {min(len(worst), 15)} mais graves</summary>")
        print()
        print("| Severidade | ID | Pacote | Instalada | Corrigida em |")
        print("|---|---|---|---|---|")
        for v in worst[:15]:
            print(f"| {v['severidade']} | {v['id']} | {v['pacote']} | {v['instalada']} | {v['corrigida']} |")
        print()
        print("</details>")

    print()
    if args.bloquear:
        if blocked:
            print(f"**Portão:** {blocked} vulnerabilidade(s) {args.bloquear} com correção publicada. O pipeline para aqui.")
            return 1
        print(f"**Portão:** nenhuma vulnerabilidade {args.bloquear} com correção publicada. Passou.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
