# 4. Automação Inteligente Baseada em Dados

A cada hora, para cada talhão, o sistema decide **sozinho** três riscos para as próximas 48 h e o que fazer a respeito:
- **doença fúngica:** folha molhada em temperatura amena;
- **estresse hídrico:** solo seco;
- **estresse térmico:** calor.

Quando algum risco é alto, ele também escreve a recomendação de manejo. Nenhuma etapa depende de alguém clicar num botão.

## A decisão automatizada

| Pergunta | Respostas possíveis | Quem responde |
|---|---|---|
| Qual o risco de **doença fúngica**? | `low`, `moderate`, `high`, `critical` | Jev (modelo *System One*), com probabilidade por nível |
| Qual o **estresse hídrico** (solo seco)? | idem | Jev |
| Qual o **estresse térmico** (calor)? | idem | Jev |
| Que **ação** o sistema deve tomar agora? | `none`, `notify` (avisar o produtor), `irrigate` (irrigar), `suggest_agronomist` (visita técnica), `generate_report` | Jev, com probabilidade por ação |
| O que fazer no campo? | Texto curto de manejo, sem produto nem dose | LLM, só quando algum risco é `high` ou `critical` |

As quatro perguntas vão **na mesma chamada** ao Jev, com o mesmo estado: os agregados das 24 h e a última análise de foto. O pior dos três riscos vira o **risco geral** do talhão, e o seu tipo é o que o dashboard destaca.

### Por que o Jev

O Jev, da TypeSafe, é um modelo *System One*: em vez de gerar texto, ele responde perguntas **tipadas** (nota numa escala, escolha entre opções, sim/não) e devolve a probabilidade de cada resposta. Isso encaixa numa decisão de software: o código recebe um valor fechado e decide o próximo passo.
- **Custo:** cerca de **US$ 0,00005 por decisão**, já com as quatro perguntas. Avaliar 7 talhões de hora em hora custa uns 25 centavos de dólar por mês. O Jev cobra só a entrada; a resposta é gratuita.
- **Acesso:** pela API de Decisões da OpenRouter (`POST /api/alpha/decisions`, modelo fixado em `typesafe/jev-1.13`), com a mesma chave que o projeto já usa.

### Decisão em camadas

```
a cada hora simulada, por talhão:
  agregados da janela de 24 h + última foto  ──>  Jev: risco fúngico, hídrico, térmico + ação (com probabilidades)
                                                   │
                     Jev fora do ar / timeout ─────┴──> regras de limiar para os três riscos (plano B)
  ação ajustada ao piso de cada risco (fungo alto → avisar, crítico → agrônomo; hídrico alto → irrigar; calor alto → avisar)
  pior risco high/critical  E  fora do cooldown de 6 h  ──>  LLM escreve a recomendação de manejo
  tudo gravado em risk_evaluations com decided_by = jev | rule
```

**Plano B (regras de limiar),** a evolução da "automação por regras" das fases anteriores, mantida como rede de segurança. Os limiares são parâmetros da simulação; em campo seriam calibrados com um agrônomo.

| Risco | `critical` | `high` | `moderate` |
|---|---|---|---|
| Fúngico (horas úmidas a 15–25 °C em 24 h) | ≥ 10 h | ≥ 6 h | ≥ 3 h |
| Hídrico | ≥ 12 h com solo ≤ 20%, ou solo atual ≤ 17% | ≥ 4 h com solo ≤ 20%, ou solo ≤ 20% | solo ≤ 23% |
| Térmico (horas ≥ 32 °C em 24 h) | ≥ 6 h | ≥ 3 h | ≥ 1 h |

Três salvaguardas completam o desenho:
- **Piso de ação:** o Jev responde cada pergunta em paralelo, sem que uma enxergue a outra. Por isso o sistema garante que a ação acompanhe o risco: fungo alto exige no mínimo `notify` e crítico, `suggest_agronomist`; hídrico alto ou crítico exige no mínimo `irrigate`; calor alto exige no mínimo `notify`. Uma ação mais forte escolhida pelo Jev é mantida, e as probabilidades originais ficam registradas.
- **Cooldown:** depois de uma recomendação, o talhão só ganha outra após 6 h, a menos que o risco geral **suba** de nível. Sem isso, uma noite úmida reavaliada de hora em hora pagaria o LLM várias vezes pela mesma situação.
- **Sem produto nem dose:** indicar agrotóxico exige receituário agronômico. O LLM é instruído a indicar o tipo de manejo (vistoria, irrigação, proteção contra calor) e a visita de um agrônomo.

## Código

| Arquivo | Papel |
|---|---|
| [`evaluate-field.ts`](../../web/src/features/telemetry/server/evaluate-field.ts) | Orquestra a avaliação de um talhão: janela → Jev ou regras → cooldown → LLM → grava |
| [`jev.ts`](../../web/src/features/telemetry/server/jev.ts) | Cliente da API de Decisões: perguntas tipadas e leitura das probabilidades |
| [`rules.ts`](../../web/src/features/telemetry/server/rules.ts) | Regras de limiar (plano B) |
| [`recommend.ts`](../../web/src/features/telemetry/server/recommend.ts) | Prompt e chamada ao LLM da recomendação |
| [`worker.ts`](../../web/scripts/worker.ts) | Dispara a avaliação na primeira leitura de cada nova hora do talhão |

Todos os arquivos `.ts` acima ficam em `web/src/features/telemetry/server/`, exceto o `worker.ts`, que fica em `web/scripts/`.

## Exemplo de saída gerada

Execução de referência: cenário `misto`, com 48 h de histórico e avaliação ao vivo com tempo acelerado. A Fazenda Alfa está em surto úmido, a Beta em seca e a Gama normal.

| Resultado | Valor |
|---|---|
| Decisões tomadas | 105 |
| Decididas pelo Jev / pelas regras | 105 / 0 |
| Recomendações escritas pelo LLM | 16 (as demais foram contidas pelo cooldown ou tinham risco abaixo de `high`) |
| Custo do Jev | US$ 0,0053 no total, US$ 0,000051 por decisão (quatro perguntas por chamada) |

| Maior risco | Nível | Ação | Decisões |
|---|---|---|---|
| fúngico | `moderate` | `none` | 20 |
| fúngico | `moderate` | `notify` | 8 |
| fúngico | `high` | `notify` | 32 |
| fúngico | `critical` | `suggest_agronomist` | 15 |
| hídrico | `critical` | `irrigate` | 15 |
| hídrico | `critical` | `suggest_agronomist` | 15 |

### Log do worker (uma hora simulada, os 7 talhões)

```
[11/10, 07:12] Fazenda Alfa / Talhão 1 fungo CRÍTICO · hídrico baixo · calor baixo · ação suggest_agronomist · por jev 73%
[11/10, 07:12] Fazenda Alfa / Talhão 2 fungo ALTO · hídrico baixo · calor baixo · ação notify · por jev 44%
[11/10, 07:12] Fazenda Alfa / Talhão 3 fungo ALTO · hídrico baixo · calor moderado · ação notify · por jev 51%
[11/10, 07:12] Fazenda Beta / Talhão 1 fungo moderado · hídrico CRÍTICO · calor ALTO · ação suggest_agronomist · por jev 95%
[11/10, 07:12] Fazenda Beta / Talhão 2 fungo baixo · hídrico CRÍTICO · calor ALTO · ação irrigate · por jev 60%
[11/10, 07:12] Fazenda Gama / Talhão 1 fungo moderado · hídrico moderado · calor baixo · ação notify · por jev 44%
[11/10, 07:12] Fazenda Gama / Talhão 2 fungo moderado · hídrico moderado · calor baixo · ação notify · por jev 71%
```

### Uma decisão completa (`risk_evaluations`)

Estado enviado ao Jev (agregados das 24 h + última foto):

```json
{
  "field": "Fazenda Beta / Talhão 2",
  "window_hours": 24,
  "readings": 96,
  "coveredHours": 24,
  "temperatureC": {
    "min": 23.1,
    "avg": 30.6,
    "max": 38
  },
  "airHumidityPct": {
    "avg": 50,
    "max": 76.5
  },
  "soilMoisturePct": {
    "avg": 15,
    "last": 15,
    "change": 0
  },
  "humidHours": 0,
  "favorableWetHours": 0,
  "longestHumidRunHours": 0,
  "rainHours": 0,
  "hotHours": 10.8,
  "drySoilHours": 24,
  "strongSunHours": 6.5,
  "daylightLuxAvg": 51628,
  "humidHoursTrend": 0,
  "latest_photo_analysis": {
    "pestType": "mancha_parda",
    "affectedPct": 0.57,
    "daysAgo": 1,
    "severity": "healthy"
  }
}
```

Resposta registrada:

```json
{
  "riskLevel (fúngico)": "low",
  "waterRiskLevel": "critical",
  "heatRiskLevel": "high",
  "overallRiskLevel": "critical",
  "overallRiskType": "water",
  "action": "irrigate",
  "actionConfidence": 0.57,
  "probabilities": {
    "risk": {
      "low": 0.62,
      "moderate": 0.38,
      "high": 0,
      "critical": 0
    },
    "water": {
      "low": 0,
      "moderate": 0.05,
      "high": 0.3,
      "critical": 0.65
    },
    "heat": {
      "low": 0,
      "moderate": 0,
      "high": 0.59,
      "critical": 0.41
    },
    "action": {
      "none": 0.16,
      "notify": 0.14,
      "irrigate": 0.66,
      "suggest_agronomist": 0.03,
      "generate_report": 0.01
    }
  },
  "decidedBy": "jev",
  "model": "typesafe/jev-1.13-20260917",
  "costUsd": 5.0316e-05
}
```

Recomendação escrita pelo LLM, sem produto nem dose:

> O risco crítico é o estresse hídrico, com umidade do solo em 15% nas últimas 24 horas e ausência de chuvas. Recomenda-se iniciar a irrigação imediatamente, priorizando horários de menor evapotranspiração para maximizar a eficiência.
>
> O estresse térmico é alto, com 10,8 horas de temperatura superior a 32 °C e máxima de 38 °C, o que agrava a demanda hídrica.
>
> Quanto ao risco fúngico, a análise de imagem indica 0,57% de área afetada por mancha-parda. Como as condições de umidade do ar (0 horas >= 90%) e temperatura não favoreceram a infecção, o risco permanece baixo. Recomenda-se vistoria técnica no talhão para monitorar a evolução da mancha e avaliar a necessidade de manejo preventivo. Visita de agrônomo recomendada.

## Testes

`bun run test:telemetry`: 12 testes cobrindo a validação do contrato, os indicadores da janela, as regras dos três riscos, o risco geral e o piso de ação. Provas de mutação confirmaram que os testes falham quando as regras de limiar (fúngica, hídrica, térmica), a faixa de temperatura favorável ou o piso de ação são alterados.
