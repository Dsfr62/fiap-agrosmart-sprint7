# 3. Processamento e Preparação dos Dados

As leituras das estações chegam ao broker MQTT como JSON bruto. O **worker de ingestão** transforma esse fluxo em dados prontos para análise, em três etapas: validar e organizar cada leitura, guardá-la sem duplicatas e resumir as últimas 24 h de cada talhão em indicadores compactos.

## Fluxo de dados

```
estação ──MQTT──> broker ──> worker
                               1. leitura: JSON → validação (zod) → tipos corretos (data, números)
                               2. organização: grava em sensor_readings, ligada ao talhão; duplicata ignorada
                               3. transformação: a cada hora simulada, janela de 24 h → agregados
                                  └──> risk_evaluations.aggregates ──> automação (item 4) e dashboard
                               4. exportação: agregados por talhão por hora → CSV
```

## Código

| Arquivo | Papel |
|---|---|
| [`web/scripts/worker.ts`](../../web/scripts/worker.ts) | Processo que assina `agrosmart/+/+/telemetria`, grava cada leitura e dispara a avaliação horária |
| [`web/src/features/telemetry/server/reading-schema.ts`](../../web/src/features/telemetry/server/reading-schema.ts) | Contrato da mensagem: valida campos, faixas e o instante (ISO com fuso) |
| [`web/src/features/telemetry/server/store-reading.ts`](../../web/src/features/telemetry/server/store-reading.ts) | Grava a leitura; a chave única `(talhão, instante)` descarta a duplicata que o QoS 1 pode gerar |
| [`web/src/features/telemetry/server/aggregate.ts`](../../web/src/features/telemetry/server/aggregate.ts) | Transforma a janela de 24 h em indicadores |
| [`web/scripts/export-processed.ts`](../../web/scripts/export-processed.ts) | Exporta o dataset processado em CSV |
| [`web/src/shared/db/schema.ts`](../../web/src/shared/db/schema.ts) + [`web/drizzle/0002_orange_mathemanic.sql`](../../web/drizzle/0002_orange_mathemanic.sql) | Tabelas `sensor_readings` e `risk_evaluations` e a migração |

## Organização: tabela `sensor_readings`

Uma linha por leitura de estação, ligada ao cadastro de talhões (`fields`) das fases anteriores.

| Coluna | Conteúdo |
|---|---|
| `field_id` | Talhão (chave estrangeira para `fields`) |
| `station_id` | Estação que mediu |
| `ts` | Instante da captura no relógio da estação |
| `temperature_c`, `air_humidity_pct`, `soil_moisture_pct`, `luminosity_lux` | Medições |
| `event` | Evento em curso (`chuva`) ou vazio |
| `received_at` | Quando o worker recebeu (permite medir atraso) |

Índice único em `(field_id, ts)`: a mesma leitura entregue duas vezes não vira duas linhas.

## Transformação: indicadores da janela de 24 h

| Indicador | Como é calculado | Por que importa |
|---|---|---|
| `readings`, `coveredHours` | Quantidade de leituras e horas cobertas (leituras × intervalo mediano) | Mostra se a janela está completa |
| `temperatureC` mín / méd / máx | Sobre todas as leituras da janela | Faixa térmica do dia |
| `airHumidityPct` méd / máx | Idem | Nível geral de umidade |
| `humidHours` | Horas com umidade do ar ≥ 90% | Substituto do molhamento foliar |
| `favorableWetHours` | Horas úmidas com temperatura entre 15 e 25 °C | Condição que favorece fungos foliares: principal entrada da automação |
| `longestHumidRunHours` | Maior sequência contínua de horas úmidas | Infecção depende de molhamento contínuo, não somado |
| `rainHours` | Horas com evento de chuva | Chuva espalha esporos |
| `soilMoisturePct` méd / última / variação | Umidade do solo e quanto mudou na janela | Estresse hídrico ou excesso de água |
| `humidHoursTrend` | Horas úmidas da janela menos as das 24 h anteriores | Diz se a situação está piorando ou melhorando |
| `drySoilHours` | Horas com umidade do solo ≤ 20% | Principal entrada do estresse hídrico |
| `hotHours` | Horas com temperatura ≥ 32 °C | Principal entrada do estresse térmico |
| `strongSunHours`, `daylightLuxAvg` | Horas com luz ≥ 50 mil lux e luz média do dia | Sol forte acelera a evaporação e o aquecimento |
| `latest_photo_analysis` | Última análise de foto do talhão (praga, % afetada, há quantos dias) | Junta o dado do ambiente com a infecção já medida pelas fases anteriores |

## Exemplo do dataset processado

[`exemplo-dataset-processado.csv`](exemplo-dataset-processado.csv): uma linha por talhão por hora avaliada, com os agregados acima, os três riscos e a decisão tomada. Gerado a partir de uma execução do simulador no cenário `misto` (48 h de histórico + avaliação ao vivo): Alfa em surto úmido, Beta em seca, Gama normal.

**105 linhas**, 29 colunas. Maior risco por tipo e nível: fúngico `critical` 15, fúngico `high` 32, fúngico `moderate` 28, hídrico `critical` 30.

Última avaliação de um talhão de cada fazenda:

| Talhão | Fim da janela | Folha úmida 15–25 °C (h) | Solo ≤ 20% (h) | ≥ 32 °C (h) | Solo médio (%) | Fúngico | Hídrico | Térmico | Ação |
|---|---|---|---|---|---|---|---|---|---|
| alfa-talhao-1 | 11/10 07:12 | 8 | 0 | 0 | 38.1 | `critical` | `low` | `low` | `suggest_agronomist` |
| beta-talhao-2 | 11/10 07:12 | 0 | 24 | 10.8 | 15 | `low` | `critical` | `high` | `irrigate` |
| gama-talhao-1 | 11/10 07:12 | 4.8 | 0 | 0 | 21.7 | `moderate` | `moderate` | `low` | `notify` |

## Como executar

```bash
cd web
bun install && bun run db:migrate && bun run seed   # banco com talhões das fases anteriores
bun run worker                                       # antes do simulador, para capturar o histórico
# em outro terminal: simulador (ver 02-coleta.md)
bun run export:processed                             # gera o CSV do dataset processado
bun run test:telemetry                               # testes da validação, agregação e regras
```
