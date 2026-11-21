# 3. Pipeline DevSecOps

O pipeline roda sozinho a cada push na `main` do GitHub e faz, em ordem, o que o capítulo 10 da fase 7 pede de um ambiente DevSecOps: **build, testes, análise de qualidade, imagens em container e análise de vulnerabilidades**. No fim, roda a plataforma de ponta a ponta para provar que a entrada (sensores) vira saída (decisões).

- Configuração no GitHub Actions: [`.github/workflows/devsecops.yml`](../../.github/workflows/devsecops.yml)
- O mesmo pipeline no Jenkins: [`Jenkinsfile`](../../Jenkinsfile), com o laboratório em [`devsecops/docker-compose.yml`](../../devsecops/docker-compose.yml)
- Qualidade: [`sonar-project.properties`](../../sonar-project.properties) e o resumo em [`devsecops/sonar_resumo.py`](../../devsecops/sonar_resumo.py)
- Vulnerabilidades: o resumo e o portão em [`devsecops/trivy_resumo.py`](../../devsecops/trivy_resumo.py)
- Execução: a conferência em [`devsecops/execucao_resumo.py`](../../devsecops/execucao_resumo.py)

## As cinco etapas

| Etapa | O que faz | Ferramenta | Para se o quê falhar |
|---|---|---|---|
| 1. Build e testes do app web | instala as dependências pelo lockfile, roda o lint, confere os tipos, roda os testes da automação e gera o build de produção | Bun, Biome, TypeScript, `node:test`, Next.js | erro de lint, de tipo, teste vermelho ou build quebrado |
| 2. Testes do Python | testa o simulador de sensores e confere que a API de visão sobe e responde ao `/health` | pytest, FastAPI | teste vermelho ou API que não sobe |
| 3. Qualidade do código | sobe o SonarQube num container dentro do próprio pipeline, analisa web, worker, API e simulador e publica o Quality Gate e as métricas | SonarQube, sonar-scanner | a análise não terminar |
| 4. Containers e vulnerabilidades | monta as imagens Docker da web e da API (build em etapas) e passa o Trivy nas duas e nos Dockerfiles | Docker Compose, Trivy | imagem que não monta |
| 5. Execução ponta a ponta | sobe o broker MQTT, o banco e o worker; o simulador publica 24 horas de histórico e 12 horas ao vivo, aceleradas; confere que as leituras viraram decisões (o histórico só é gravado; a decisão sai das leituras ao vivo, como no campo) | Mosquitto, Node.js, Python | menos de 100 leituras ou de 10 decisões |

As etapas 1 e 2 correm em paralelo; a 4 só começa se as duas passarem.

## Segurança dentro do pipeline

- A senha e a chave do SonarQube são criadas dentro do job, mascaradas no log, e morrem com ele: nenhum segredo fica no repositório.
- O pipeline só tem permissão de leitura no repositório (`permissions: contents: read`).
- As versões das imagens (SonarQube, scanner, Trivy) são fixas, para o resultado não mudar sozinho.
- As dependências se instalam pelo lockfile congelado: o build falha se alguém mudar uma versão sem registrar.

## Onde ver a execução

Na aba **Actions** do repositório, execução "DevSecOps". O **Summary** de cada execução mostra o resultado das cinco etapas em tabelas, e os relatórios completos ficam nos artefatos (`relatorio-sonarqube`, `relatorios-trivy`, `execucao-ponta-a-ponta`).

## Resultado medido (21/11/2026)

Execução verde nas cinco etapas: https://github.com/Dsfr62/fiap-agrosmart-sprint7/actions/runs/44963438354

**Qualidade (SonarQube):** Quality Gate **OK**; 13.247 linhas analisadas; **0 bugs e 0 vulnerabilidades**; nota **A** de confiabilidade, segurança e manutenibilidade; 87 code smells; 4,4% de linhas duplicadas; 4 pontos sensíveis de segurança para revisar (expressões regulares que podem ficar lentas com texto malicioso).

**Vulnerabilidades (Trivy), antes e depois:**

| Alvo | CRITICAL antes | CRITICAL depois | CRITICAL com correção depois | HIGH com correção depois |
|---|---:|---:|---:|---:|
| Imagem da API (`agrosmart-api`) | 6 | 1 | **0** | 3 |
| Imagem da web (`agrosmart-web`) | 6 | 1 | **0** | **0** |
| Dockerfiles (configuração) | 0 falhas | 0 falhas | | |

O **portão** da etapa 4 para o pipeline se aparecer vulnerabilidade CRITICAL que já tenha correção publicada. A CRITICAL que sobra em cada imagem é do sistema Debian (libxml2 e zlib) e ainda não tem correção. Os 3 HIGH com correção que sobram na API são do Starlette, que só sai com uma versão nova do FastAPI.

**Execução ponta a ponta:** 1.008 leituras de 7 talhões (24 h de histórico e 12 h ao vivo) viraram **84 decisões** (24 avisos, 24 irrigações, 12 chamadas ao agrônomo, 24 sem ação). Sem a chave da OpenRouter no pipeline, todas saíram pelas regras de limiar (plano B). O app de produção subiu, o `/api/health` respondeu **ok** nos cinco componentes ([health.json](health.json), [metrics.json](metrics.json)) e as telas foram fotografadas ([prints](prints/)).

**O que o pipeline achou e foi corrigido:**

| Achado | Etapa | Correção |
|---|---|---|
| 15 erros de lint no código herdado (formatação, imports sem uso, supressões inúteis, área de upload sem teclado) | 1 | corrigidos; a área de upload abre com Enter e espaço |
| A imagem Docker da web da Sprint 6 nunca montava (o `better-sqlite3` precisa de compilador, e a base Bun Alpine não tem) | 4 | imagem em Node 22 Debian, sem root, com healthcheck |
| O worker só decide nas leituras ao vivo (o histórico só é gravado) | 5 | o ensaio publica 24 h de histórico e 12 h ao vivo |
| 10 vulnerabilidades CRITICAL com correção (Pillow 11.2.1 e Next.js 16.2.4) | 4 | Pillow 13.0.0 e Next.js 16.4.6; atualização do Debian; npm fora da imagem final |
| HIGH com correção no python-multipart e no sharp | 4 | python-multipart 0.0.30 e sharp 0.35.5 |
| 3 "bugs" de CSS que eram falso positivo (a regra não conhece o `@theme` e o `@custom-variant` do Tailwind 4) | 3 | exceção só dessa regra e só no `globals.css`, com o motivo no `sonar-project.properties` |

**O que fica em aberto:** os 3 HIGH do Starlette (pedem atualizar o FastAPI e testar a API de visão) e a revisão dos 4 pontos sensíveis de segurança.
