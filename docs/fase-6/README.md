# AgroSmart — Fase 6: Plataforma Inteligente Integrada

Turma **4ESOA-2026**

| Integrante |
|---|
| Bruno Reis Lago |
| Eduardo Sávio |
| Gabriel Oliveira de Mattos |
| Gustavo Vieira da Silva |

O AgroSmart monitora a lavoura com **estações IoT simuladas** (temperatura, umidade do ar e do solo, luminosidade e chuva) e com a **análise de fotos de folhas** das fases anteriores. A cada hora, um modelo de IA (Jev, *System One*) avalia três riscos por talhão (**doença fúngica, estresse hídrico e estresse térmico**) e decide a ação: avisar, irrigar ou chamar o agrônomo. Quando o risco é alto, um LLM escreve a recomendação de manejo. Tudo aparece num dashboard web.

## Entregas

| # | Entrega (peso) | Onde está |
|---|---|---|
| 1 | Arquitetura da solução (20%) | [`01-arquitetura.md`](01-arquitetura.md): diagramas em [`diagrams/`](diagrams/) e descrição de cada componente |
| 2 | Coleta de dados do ambiente (20%) | [`02-coleta.md`](02-coleta.md): sensores, captura da simulação [`captura-simulacao.png`](captura-simulacao.png), dados gerados [`exemplo-telemetria.jsonl`](exemplo-telemetria.jsonl) |
| 3 | Processamento e preparação dos dados (20%) | [`03-processamento.md`](03-processamento.md): código, fluxo de dados, dataset processado [`exemplo-dataset-processado.csv`](exemplo-dataset-processado.csv) |
| 4 | Automação inteligente (20%) | [`04-automacao.md`](04-automacao.md): lógica de decisão, exemplos reais de saída |
| 5 | Dashboard analítico (20%) | [`05-dashboard.md`](05-dashboard.md): indicadores e capturas em [`prints/`](prints/) |
| 6 | Demonstração em vídeo (20%) | Link em `LINK-VIDEO.txt` (raiz do zip); roteiro em [`06-roteiro-video.md`](06-roteiro-video.md) |

## Como rodar

Requisitos: Docker, [Bun](https://bun.sh), Python 3.10+ e uma chave da OpenRouter em `web/.env.local` (`OPENROUTER_API_KEY=...`).

```bash
cd web
bun install
bun run demo
```

O comando sobe o broker MQTT, o banco, o worker com o avaliador, o app web e o simulador, e abre `http://localhost:3000/ambiente`. Ctrl+C encerra.

| Tela | Endereço |
|---|---|
| Dashboard de ambiente | `/ambiente` |
| Mensagens MQTT chegando | `/ambiente/leituras` |
| Histórico de decisões do Jev | `/ambiente/decisoes` |
| Arquitetura | `/arquitetura` |
| Análises de foto (fases anteriores) | `/` |

## Estrutura do zip

| Pasta ou arquivo | Conteúdo |
|---|---|
| `README.md` | este índice |
| `LINK-VIDEO.txt` | link do vídeo de demonstração |
| `entregas/` | documentos, diagramas, prints e exemplos de dados (cópia de `docs/fase-6/`) |
| `codigo/` | código-fonte completo, só arquivos versionados: sem chaves, sem `node_modules`, sem banco |
