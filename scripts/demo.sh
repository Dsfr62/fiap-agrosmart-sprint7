#!/usr/bin/env bash
# AgroSmart Fase 6 — sobe a demonstração completa com um comando:
# broker MQTT (Docker), banco, worker de ingestão + avaliador, app web e simulador.
#
# Uso:   cd web && bun run demo        (ou ./scripts/demo.sh na raiz)
# Ajustes por variável de ambiente:
#   SPEED=120           segundos simulados por segundo real (120 → 1 h simulada a cada 30 s)
#   SCENARIO=misto      misto (cada fazenda numa condição) | surto | seca | normal
#   BACKFILL_HOURS=48   histórico publicado de imediato
#   RESET=1             1 limpa leituras e decisões anteriores; 0 mantém
#   OPEN_BROWSER=1      0 não abre o navegador ao final
# Ctrl+C encerra worker, simulador e app (o broker continua no Docker).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/data/demo-logs"
SPEED="${SPEED:-120}"
SCENARIO="${SCENARIO:-misto}"
BACKFILL_HOURS="${BACKFILL_HOURS:-48}"
RESET="${RESET:-1}"
OPEN_BROWSER="${OPEN_BROWSER:-1}"
URL="http://localhost:3000"
mkdir -p "$LOGS"

fail() {
  echo
  echo "ERRO: $1"
  exit 1
}

# ---------------------------------------------------------------- requisitos
echo "0/5 Conferindo requisitos"
command -v docker >/dev/null || fail "Docker não encontrado. Instale o Docker Desktop."
docker info >/dev/null 2>&1 || fail "Docker não está rodando. Abra o Docker Desktop e espere ficar pronto."
command -v bun >/dev/null || fail "Bun não encontrado. Instale em https://bun.sh"
command -v node >/dev/null || fail "Node.js não encontrado. Instale a versão 22.9 ou mais nova."
NODE_OK="$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);console.log(a>22||(a===22&&b>=9)?1:0)')"
[ "$NODE_OK" = "1" ] || fail "Node.js $(node --version) é antigo. Instale a versão 22.9 ou mais nova."
PYTHON="$(command -v python3 || command -v python || true)"
[ -n "$PYTHON" ] || fail "Python não encontrado. Instale o Python 3.10 ou mais novo."
"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
  || fail "Python $("$PYTHON" --version 2>&1) é antigo. Instale o 3.10 ou mais novo."
[ -d "$ROOT/web/node_modules" ] || fail "Dependências não instaladas. Rode 'bun install' dentro de web/."
if ! grep -qE '^OPENROUTER_API_KEY=.+' "$ROOT/web/.env.local" 2>/dev/null; then
  echo "    Aviso: web/.env.local sem OPENROUTER_API_KEY. A demo roda, mas as decisões"
  echo "    saem pelas regras (plano B) e sem recomendação da IA."
fi

cleanup() {
  echo
  echo "Encerrando worker, simulador e app..."
  kill $(jobs -p) 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------- broker
echo "1/5 Broker MQTT (Docker)"
if ! docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.dev.yml" \
  up -d mosquitto >"$LOGS/broker.log" 2>&1; then
  cat "$LOGS/broker.log"
  fail "não foi possível subir o broker (porta 1883 em uso?)."
fi

# ---------------------------------------------------------------- banco
cd "$ROOT/web"
echo "2/5 Banco de dados"
if [ ! -f "$ROOT/data/agrosmart.db" ]; then
  bun run db:migrate >/dev/null && bun run seed >/dev/null
else
  bun run db:migrate >/dev/null
fi
if [ "$RESET" = "1" ]; then
  bun run telemetry:reset
fi

# ---------------------------------------------------------------- worker
echo "3/5 Worker de ingestão + avaliador (log: data/demo-logs/worker.log)"
./node_modules/.bin/tsx --env-file-if-exists=.env.local scripts/worker.ts \
  >"$LOGS/worker.log" 2>&1 &
for _ in $(seq 1 20); do
  grep -q "assinando" "$LOGS/worker.log" 2>/dev/null && break
  sleep 1
done
if ! grep -q "assinando" "$LOGS/worker.log" 2>/dev/null; then
  tail -20 "$LOGS/worker.log"
  fail "o worker não conectou ao broker."
fi

# ---------------------------------------------------------------- app web
echo "4/5 App web"
if curl -s -o /dev/null "$URL/ambiente"; then
  echo "    já está rodando em $URL"
else
  ./node_modules/.bin/next dev >"$LOGS/web.log" 2>&1 &
  for _ in $(seq 1 90); do
    curl -s -o /dev/null "$URL/ambiente" && break
    sleep 1
  done
  curl -s -o /dev/null "$URL/ambiente" || {
    tail -20 "$LOGS/web.log"
    fail "o app web não respondeu em $URL (porta 3000 em uso?)."
  }
fi

# ---------------------------------------------------------------- simulador
echo "5/5 Simulador (cenário $SCENARIO, ${SPEED}x, log: data/demo-logs/simulator.log)"
VENV="$ROOT/simulator/.venv"
venv_python() {
  if [ -x "$VENV/bin/python" ]; then echo "$VENV/bin/python"; else echo "$VENV/Scripts/python.exe"; fi
}
if [ ! -x "$(venv_python)" ]; then
  "$PYTHON" -m venv "$VENV"
  "$(venv_python)" -m pip install -q --disable-pip-version-check -r "$ROOT/simulator/requirements.txt"
fi
"$(venv_python)" "$ROOT/simulator/simulator.py" \
  --backfill-hours "$BACKFILL_HOURS" --speed "$SPEED" --scenario "$SCENARIO" \
  >"$LOGS/simulator.log" 2>&1 &

echo
echo "Demo no ar. Abra no navegador:"
echo "  $URL/ambiente            dashboard"
echo "  $URL/ambiente/leituras   mensagens MQTT chegando"
echo "  $URL/ambiente/decisoes   decisões do Jev"
echo "  $URL/arquitetura         diagramas"
echo "Espere ~2 min para aparecerem decisões e alertas. Ctrl+C para encerrar."
if [ "$OPEN_BROWSER" = "1" ]; then
  if command -v open >/dev/null; then
    open "$URL/ambiente"
  elif command -v xdg-open >/dev/null; then
    xdg-open "$URL/ambiente" >/dev/null 2>&1 || true
  fi
fi
wait
