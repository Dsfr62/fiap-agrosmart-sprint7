# 4. Monitoramento e execução automatizada

A plataforma roda sozinha: o simulador publica as leituras, o worker grava e avalia de hora em hora, o painel mostra. O monitoramento responde a três perguntas de quem opera o sistema: **está tudo de pé? os dados continuam chegando? a automação está decidindo?**

## O que foi implementado

| Peça | O que mostra | Onde |
|---|---|---|
| Tela **Monitoramento** | o estado de cada componente (verde, atenção ou fora), os indicadores e os últimos eventos do processo; atualiza a cada 10 s | `/monitoramento` ([código](../../web/src/app/monitoramento/page.tsx)) |
| **`GET /api/health`** | o mesmo estado em JSON: banco, broker MQTT, worker, leituras e decisões, com a idade do último sinal de cada um | [`web/src/app/api/health/route.ts`](../../web/src/app/api/health/route.ts) |
| **`GET /api/metrics`** | os indicadores em JSON: leituras (total, última hora, por talhão), decisões (por ação, por quem decidiu, plano B, alertas, recomendações da IA) e os contadores do worker | [`web/src/app/api/metrics/route.ts`](../../web/src/app/api/metrics/route.ts) |
| **Sinal de vida do worker** | a cada 5 s o worker grava o próprio estado (`data/worker-status.json`): conexão com o broker, mensagens, leituras gravadas, repetidas, descartadas, avaliações, fila, erros e o tempo médio de uma avaliação | [`web/scripts/worker.ts`](../../web/scripts/worker.ts) |
| **Log do worker** | uma linha `[monitor]` por minuto com os mesmos contadores, mais uma linha por decisão | `data/demo-logs/worker.log` na demo |
| **Healthcheck dos containers** | a web chama o próprio `/api/health`; a API de visão, o `/health`; o Mosquitto responde a uma assinatura | `web/Dockerfile`, `api/Dockerfile`, `docker-compose.yml` |
| **Pipeline** | a cada push, a execução ponta a ponta sobe o sistema, guarda o `/api/health` e o `/api/metrics` e tira os prints das telas | etapa 5 do [pipeline](03-pipeline.md) |

## Como cada componente é julgado

| Componente | Funcionando | Atenção | Fora do ar |
|---|---|---|---|
| Banco de dados | responde a uma consulta | | não responde (o `/api/health` devolve 503) |
| Broker MQTT | aceita conexão TCP em até 1 s | | recusa ou não responde |
| Worker | sinal de vida há até 30 s e conectado ao broker | sinal entre 30 s e 2 min, ou sem broker | sem sinal há mais de 2 min |
| Leituras | a última chegou há até 15 min | parou há mais de 15 min, ou nunca chegou | banco fora |
| Decisões | a última saiu há até 2 h | parou há mais de 2 h, ou nunca saiu | banco fora |

O estado geral é **ok** quando tudo está verde, **degradado** quando algo pede atenção e **fora** só quando o banco cai. Assim o healthcheck do container não derruba o app web porque outra peça parou: o app continua mostrando o que já tem e avisa o que parou.

## Como acompanhar o sistema

1. Abrir `/monitoramento`: em 10 segundos dá para ver se as leituras continuam chegando e se a automação decidiu algo.
2. Para outra ferramenta ler, `curl http://localhost:3000/api/health` e `/api/metrics`.
3. No terminal da demo, `tail -f data/demo-logs/worker.log` mostra as decisões e a linha `[monitor]` de cada minuto.
4. No GitHub, a aba **Actions** mostra se o último push passou nas cinco etapas.

Para testar o alarme na demonstração: `docker stop` no container do Mosquitto. Em uns 15 s (o worker grava o estado a cada 5 s e a tela atualiza a cada 10 s) ela mostra o broker **fora do ar** e o worker em **atenção**, sem conexão; ao religar, os dois voltam ao verde.

## O que fica de fora, e por quê

Prometheus e Grafana fariam o mesmo papel com mais recursos, mas não fazem parte do conteúdo do curso (a fase 7 trabalha o monitoramento pelo Jenkins e pelos logs). Os indicadores já saem em JSON no `/api/metrics`, prontos para uma ferramenta dessas ler no futuro.
