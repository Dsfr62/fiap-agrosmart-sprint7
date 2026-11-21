# AgroSmart · Sprint 7 (fase 7): a plataforma como produto

FIAP, Engenharia de Software, 4º ano, turma 4ESOA, 2026.

O AgroSmart acompanha a lavoura com **estações de sensores simuladas** (temperatura, umidade do ar e do solo, luminosidade e chuva) e com a **análise de fotos de folhas**. A cada hora, a automação avalia o risco de doença fúngica, de falta de água e de calor em cada talhão e decide a ação: avisar, irrigar ou chamar o agrônomo. Tudo aparece num painel web.

A Sprint 6 deixou a plataforma funcionando. A Sprint 7 leva ela para perto de um produto de mercado: **pipeline DevSecOps, monitoramento, análise do processo com event log, vídeo final e pitch**.

## Onde está cada entrega da Sprint 7

| Entrega (peso) | Onde | Estado |
|---|---|---|
| Arquitetura final (15%) | `docs/fase-7/` (parte da Sprint 6 em [`docs/fase-6/01-arquitetura.md`](docs/fase-6/01-arquitetura.md)) | em construção |
| Execução da plataforma (20%) | etapa 5 do pipeline (1.008 leituras viraram 84 decisões); [prints das telas](docs/fase-7/prints/) | **pronta** |
| Pipeline DevSecOps (20%) | [`.github/workflows/devsecops.yml`](.github/workflows/devsecops.yml), [`Jenkinsfile`](Jenkinsfile), [`docs/fase-7/03-pipeline.md`](docs/fase-7/03-pipeline.md) | **verde nas 5 etapas** ([execução](https://github.com/Dsfr62/fiap-agrosmart-sprint7/actions/runs/44963438354)) |
| Monitoramento (10%) | tela `/monitoramento`, `/api/health`, `/api/metrics`; [`docs/fase-7/04-monitoramento.md`](docs/fase-7/04-monitoramento.md) | **pronto** |
| Análise de processo e demonstração (25%) | event log do worker e pm4py em [`processo/`](processo/); [`docs/fase-7/05-processo.md`](docs/fase-7/05-processo.md); roteiro do vídeo em [`docs/fase-7/06-roteiro-video.md`](docs/fase-7/06-roteiro-video.md) | event log e análise base prontos; faltam a análise do grupo e o vídeo |
| Pitch e produto (10%) | slides e vídeo de até 5 min | a fazer |

## Como rodar a demonstração

Requisitos: Docker rodando, [Bun](https://bun.sh) 1.2 ou mais novo, Node.js 22.9 ou mais novo e Python 3.10 ou mais novo. No Windows, use o WSL2.

```bash
git clone https://github.com/Dsfr62/fiap-agrosmart-sprint7.git
cd fiap-agrosmart-sprint7
cp web/.env.example web/.env.local     # a chave da OpenRouter é opcional
cd web
bun install
bun run demo
```

O `bun run demo` sobe o broker MQTT (no Docker), o banco, o worker com o avaliador, o app web e o simulador, e abre `http://localhost:3000/ambiente`. Em uns 2 minutos aparecem decisões e alertas. Sem a chave da OpenRouter, as decisões saem pelas regras de limiar (o plano B da automação) e sem o texto de recomendação escrito pela IA.

| Tela | Endereço |
|---|---|
| Painel do ambiente | http://localhost:3000/ambiente |
| Leituras chegando pelo MQTT | http://localhost:3000/ambiente/leituras |
| Histórico de decisões | http://localhost:3000/ambiente/decisoes |
| Monitoramento | http://localhost:3000/monitoramento |
| Arquitetura | http://localhost:3000/arquitetura |
| Análises de foto (fases anteriores) | http://localhost:3000/ |

## Pipeline DevSecOps

A cada push na `main`, o GitHub Actions roda cinco etapas, na ordem que o capítulo 10 da fase 7 ensina (o resultado medido está em [`docs/fase-7/03-pipeline.md`](docs/fase-7/03-pipeline.md)):

1. **Build e testes do app web:** dependências com o lockfile congelado, lint (Biome), tipos (TypeScript), testes da automação e o build de produção.
2. **Testes do Python:** simulador de sensores e API de visão.
3. **Qualidade do código:** o SonarQube sobe num container dentro do pipeline e analisa o código com o `sonar-scanner`.
4. **Containers e vulnerabilidades:** as imagens Docker da web e da API são montadas e o **Trivy** procura vulnerabilidades nelas e erros de configuração nos Dockerfiles. O pipeline para se aparecer vulnerabilidade CRITICAL que já tenha correção.
5. **Execução ponta a ponta:** sobe o broker MQTT, o banco e o worker, roda o simulador com 24 horas de histórico e 12 horas ao vivo (aceleradas), confere que as leituras viraram decisões, sobe o app, guarda o `/api/health` e o `/api/metrics`, fotografa as telas e roda a análise do processo com o pm4py.

O mesmo pipeline está no [`Jenkinsfile`](Jenkinsfile), para quem quiser rodar no Jenkins do laboratório (`devsecops/docker-compose.yml`). Detalhe em [`docs/fase-7/03-pipeline.md`](docs/fase-7/03-pipeline.md).

## O que é simulado

- **Os sensores são simulados** (`simulator/simulator.py`, com semente fixa para repetir os números). Não há estação física nem dado de campo.
- **Não houve validação com produtores nem agrônomos.** Os limiares de risco vêm de literatura e precisariam ser calibrados com um agrônomo.
- Os números de decisões e alertas mostram o comportamento do sistema sobre dados simulados, não resultado em lavoura real.

## Grupo

Bruno Reis Lago, Eduardo Sávio Fonseca Resende, Gustavo Vieira da Silva, João Guilherme Mazur Ferreira e Marina da Conceição Pereira.

## Créditos

- **Base:** a plataforma da Sprint 6 do grupo (nota 10), com o código de **Bruno Reis Lago**, sob a licença MIT ([`LICENSE`](LICENSE)). O README daquela entrega está em [`docs/historico/README-fases-2-a-6.md`](docs/historico/README-fases-2-a-6.md).
- **Bibliotecas e imagens de terceiros:** Next.js, Drizzle, Mosquitto, FastAPI, OpenCV, SonarQube, Trivy, Jenkins, cada uma com a própria licença.

## Ferramentas de IA usadas e para quê

- **Claude Code (Anthropic):** apoio ao Eduardo na Sprint 7 para escrever o pipeline, os scripts de resumo do SonarQube, do Trivy e da execução, o monitoramento (telas e rotas), o event log do worker, os scripts de análise com o pm4py e esta documentação. Tudo foi revisado e rodado no GitHub Actions antes de entrar.
- **Na Sprint 6:** a pasta `docs/superpowers/` guarda os planos feitos com apoio de IA na construção da plataforma.
- **Dentro do produto:** o modelo de decisão (Jev) e o LLM da recomendação são chamados pela OpenRouter. São parte da solução, não da escrita do código.
