# 5. Análise de processo (mineração de processos)

A plataforma registra por onde cada leitura de sensor passa. Esse registro é o **event log**: com ele, a mineração de processos (capítulo 9 da fase 7, com o **pm4py**) descobre o fluxo real do sistema, mede onde ele espera e mostra os caminhos diferentes que uma leitura pode seguir.

Os números abaixo são da execução ponta a ponta do pipeline de 21/11/2026 ([execução](https://github.com/Dsfr62/fiap-agrosmart-sprint7/actions/runs/44963438354)): 7 talhões simulados, 24 horas de histórico e 12 horas ao vivo, aceleradas. **Os sensores são simulados**; o tempo de cada passo é medido de verdade, no próprio worker.

## O event log

O worker grava um evento a cada passo, em `data/event-log.jsonl` ([código](../../web/scripts/worker.ts)). O script [`processo/exportar_event_log.py`](../../processo/exportar_event_log.py) transforma em CSV e XES.

| Campo | O que é | Exemplo |
|---|---|---|
| `case_id` (caso) | uma leitura: o talhão e o instante da leitura | `seed:alfa-talhao-1@2026-11-20T23:47:00.000Z` |
| `atividade` | o passo que a leitura cumpriu | `Leitura gravada` |
| `instante` | quando o passo aconteceu, em milissegundos | `2026-11-21 23:47:45.974` |
| `recurso` | quem executou o passo | `broker MQTT`, `banco`, `avaliador`, `regras`, `Jev`, `LLM` |
| atributos | talhão, origem (histórico ou ao vivo), fila, riscos e ação | `origem = historico` |

As atividades possíveis:

| Atividade | Recurso | Quando acontece |
|---|---|---|
| Mensagem recebida | broker MQTT | toda mensagem que chega |
| Mensagem descartada (inválida) | worker | a mensagem não passa na validação |
| Leitura gravada | banco | a leitura entra no banco |
| Leitura repetida (ignorada) | banco | a mesma leitura chega de novo |
| Avaliação enfileirada | avaliador | a primeira leitura ao vivo de uma nova hora do talhão |
| Avaliação iniciada | avaliador | o avaliador pega a avaliação da fila |
| Risco avaliado pelo Jev ou pelas regras (plano B) | Jev ou regras | o risco fúngico, hídrico e térmico sai |
| Decisão: nenhuma ação, avisar o produtor, irrigar, chamar o agrônomo ou gerar relatório | avaliador | a ação escolhida |
| Recomendação escrita pela IA | LLM | risco alto, fora do intervalo de 6 h |

Exemplo do log, com até 3 casos de cada caminho: [`processo/exemplo-event-log.csv`](processo/exemplo-event-log.csv).

## O processo descoberto

**2.352 eventos, 1.008 casos e 9 atividades.** O Heuristics Miner (`pm4py.discover_heuristics_net`) desenhou este fluxo; o número em cada caixa é quantas vezes a atividade aconteceu:

![Rede heurística do processo](processo/rede-heuristica.png)

A mesma descoberta em rede de Petri ([figura](processo/rede-de-petri.png)) e a **conformidade por token replay** (`pm4py.fitness_token_based_replay`): **fitness 1,0**, com **100% dos casos** cabendo no modelo. Nesta execução, nenhum caso saiu do caminho previsto.

## Variantes: os caminhos que uma leitura percorre

| Casos | % | Mediana do caso | Caminho |
|---:|---:|---:|---|
| 924 | 91,7% | 1 ms | Mensagem recebida → Leitura gravada |
| 24 | 2,4% | 84 ms | ... → Avaliação enfileirada → Avaliação iniciada → Risco avaliado pelas regras → Decisão: avisar o produtor |
| 24 | 2,4% | 154 ms | ... → Risco avaliado pelas regras → Decisão: irrigar |
| 24 | 2,4% | 193 ms | ... → Risco avaliado pelas regras → Decisão: nenhuma ação |
| 12 | 1,2% | 60 ms | ... → Risco avaliado pelas regras → Decisão: chamar o agrônomo |

Só **84 leituras (8,3%)** dispararam uma avaliação: o sistema avalia cada talhão uma vez por hora, com a janela das últimas 24 horas, e o histórico só é gravado.

## Onde o processo espera (gargalos)

O mapa de desempenho (`pm4py.discover_performance_dfg`) pinta de vermelho a transição mais lenta:

![Mapa de desempenho do processo](processo/dfg-desempenho.png)

| De | Para | Vezes | Média | p95 |
|---|---|---:|---:|---:|
| Avaliação enfileirada | Avaliação iniciada | 84 | **117 ms** | 302 ms |
| Avaliação iniciada | Risco avaliado pelas regras | 84 | 32 ms | 75 ms |
| Mensagem recebida | Leitura gravada | 1.008 | 1 ms | 1 ms |

**O gargalo é a fila do avaliador, não a avaliação.** Uma avaliação leva 32 ms, mas espera 117 ms na fila (3,6 vezes mais), com até 6 avaliações esperando juntas. As avaliações correm uma de cada vez, e os 7 talhões viram a hora no mesmo instante: o sétimo espera os seis antes dele.

## Primeiras leituras e melhorias (base para a análise do grupo)

1. **Fila por talhão ou uma chamada só.** Hoje a fila é única. Avaliar os talhões em paralelo, ou mandar os 7 talhões numa chamada só ao Jev, tira a espera. Pesa mais com o Jev ligado: ele responde pela rede, em centenas de milissegundos, e a espera do sétimo talhão cresce na mesma proporção.
2. **Avaliar antes quando um limite crítico é cruzado.** Como 91,7% das leituras só são gravadas, uma mudança brusca (solo abaixo de 20%, por exemplo) pode esperar até a próxima hora para virar decisão. Uma leitura que cruza um limite crítico poderia disparar a avaliação na hora.
3. **Acompanhar o plano B.** Nesta execução, 100% das decisões saíram pelas regras, porque o pipeline não tem a chave da OpenRouter. Em produção, a taxa de plano B (já no `/api/metrics`) diz quando o Jev está fora.
4. **Testar os desvios.** O log prevê leitura repetida, mensagem inválida e erro na avaliação, mas nenhum apareceu. Um cenário com falhas injetadas mostraria se a conformidade continua alta quando a rede falha.

## Análise do grupo

Para saber se a leitura vale fora do pipeline, rodamos a demo numa máquina do grupo (`bun run demo`, cenário misto, 48 horas de histórico e umas 6 horas simuladas ao vivo, sem a chave da OpenRouter) em 24/11/2026 e passamos o event log pelos mesmos scripts. Deu **3.006 eventos, 1.433 casos, as mesmas 5 variantes e fitness 1,0**. As duas execuções contam a mesma história.

### Gargalos

| | Pipeline (21/11) | Demo local (24/11) |
|---|---:|---:|
| Avaliações | 84 | 35 |
| Espera na fila (média / p95) | 117 / 302 ms | 289 / 717 ms |
| Avaliação em si (média) | 32 ms | 85 ms |
| Espera dividida pela avaliação | 3,6 vezes | 3,4 vezes |
| Fila máxima | 6 | 7 |

**A espera cresce com a posição na fila.** Na demo local, os 7 talhões entram na fila em 18 ms, todos na virada da hora, e cada um espera os anteriores:

| Posição na fila | 1ª | 2ª | 3ª | 4ª | 5ª | 6ª | 7ª |
|---|---:|---:|---:|---:|---:|---:|---:|
| Espera média | 2 ms | 130 ms | 191 ms | 250 ms | 341 ms | 531 ms | 578 ms |

O gargalo é de **desenho, não de carga**: o worker encadeia as avaliações numa fila de atendente único ([`worker.ts`](../../web/scripts/worker.ts)). Hoje uma rodada inteira cabe em menos de 1,2 s porque a avaliação é rápida. Mas o tempo de cada avaliação depende da rede:

- Na demo local, mesmo sem chave, o worker chama o Jev, recebe **HTTP 401** e só então usa as regras (está no `worker.log`: "plano B: Jev respondeu HTTP 401"). É essa ida e volta que leva a avaliação de 32 para 85 ms.
- A chamada ao Jev pode esperar até **10 s** antes de desistir ([`jev.ts`](../../web/src/features/telemetry/server/jev.ts)). Quando o risco sai alto, a recomendação da IA roda **dentro da mesma avaliação** e pode esperar mais **30 s** ([`evaluate-field.ts`](../../web/src/features/telemetry/server/evaluate-field.ts), [`recommend.ts`](../../web/src/features/telemetry/server/recommend.ts)).

**Teste: a OpenRouter lenta.** Para medir o pior caso em vez de supor, rodamos a demo com `OPENROUTER_BASE_URL` apontando para um servidor local que aceita a conexão e não responde. É o caso da OpenRouter lenta sem cair. Em 5 minutos:

| | OpenRouter respondendo (401) | OpenRouter lenta |
|---|---:|---:|
| Avaliação de risco baixo ou moderado | 85 ms em média | **10 s** (o limite do Jev) |
| Avaliação de risco alto | | **40 s** (10 s do Jev + 30 s da recomendação) |
| Primeira rodada dos 7 talhões | < 1,2 s | **3 min 40 s** |
| Espera do 7º talhão na fila | 578 ms | **210 s** |
| Fila do avaliador | até 7 | **74 e subindo** |

Nenhuma avaliação falhou: todas terminaram pelo plano B e nenhum evento de erro foi gravado. Por isso o desvio não aparece nas variantes, só no tempo. Na velocidade da demo (1 hora simulada a cada 30 s), a fila nunca esvazia. Em tempo real, 7 talhões ainda cabem na hora, mas a decisão do último sai 3,5 minutos atrasada. Com ~31 s por avaliação em média, o avaliador dá conta de cerca de 115 talhões por hora; acima disso a fila cresce sem parar.

**O monitoramento não acusa.** Com a fila em 74, a tela `/monitoramento` e o `/api/health` continuavam em "Tudo funcionando" ([print](prints/demo-local/07-monitoramento-openrouter-lenta.png)). O único sinal é o "Tempo médio de uma avaliação", que foi para 31.016 ms.

### Variações

- **O caminho dominante é só gravar** (91,7% no pipeline e 97,6% na demo local). A diferença vem do histórico: 24 horas no pipeline e 48 na demo, e histórico nunca é avaliado. Entre as leituras ao vivo, a proporção é a mesma nas duas execuções: **1 em cada 4 dispara avaliação** (84 de 336 e 35 de 126). A estação manda uma leitura a cada 15 minutos e só a primeira da hora é avaliada.
- **As 4 variantes de decisão só mudam no último passo**, que leva 1 ms. A diferença de tempo entre elas vem de outro lugar: a ordem na fila é sempre a mesma (Alfa talhão 1 primeiro, Gama talhão 2 por último). "Nenhuma ação" parece a variante mais lenta (193 ms no pipeline e 476 ms na demo) porque cai nos talhões do fim da fila (posição média 6,7 na demo), não porque decidir seja mais difícil. Por consequência, **o mesmo talhão espera mais em toda rodada**.
- **A mistura de decisões segue o cenário simulado**, não o processo: 24, 24, 24 e 12 no pipeline; 15, 10, 7 e 3 na demo (avisar, irrigar, nenhuma ação e chamar o agrônomo).
- **Os desvios não aparecem.** Leitura repetida, mensagem inválida, erro na avaliação, avaliação ignorada e decisão pelo Jev ficaram em zero nas duas execuções, e 100% das decisões saíram pelo plano B. O fitness 1,0 mostra que o log é coerente com o modelo. Ele não prova que o sistema aguenta falhas, porque nenhuma falha aconteceu.

### Melhorias, por prioridade

1. **Avaliar os talhões em paralelo, com limite** (por exemplo, 4 ao mesmo tempo), ou mandar os talhões da mesma hora numa chamada só ao Jev. Com isso, a espera do último talhão cai de ~580 ms para perto do tempo de uma avaliação. Para medir: a transição "Avaliação enfileirada → Avaliação iniciada" no mapa de desempenho.
2. **Não chamar o Jev quando não há chave, e cortar o circuito quando ele falha.** Depois de algumas falhas seguidas, o avaliador usa as regras direto por alguns minutos. Isso tira a ida e volta do 401 e os 10 a 40 s por avaliação do teste com a OpenRouter lenta. A taxa de plano B, que já está no `/api/metrics`, mostra quando o circuito abriu. A recomendação também pode sair da fila: a decisão é gravada na hora e o texto da IA chega depois.
3. **Alerta de fila no monitoramento.** O worker passaria a "atenção" com, por exemplo, mais de 7 avaliações na fila (uma rodada inteira) ou espera acima de 1 minuto. Hoje a fila pode chegar a 74 com tudo verde.
4. **Avaliar na hora quando uma leitura cruza um limite crítico.** Hoje 3 em cada 4 leituras ao vivo só são gravadas, e uma queda brusca de umidade pode esperar até a próxima hora para virar decisão.
5. **Testar os desvios no pipeline:** um cenário com mensagem inválida, leitura repetida, o broker fora e o Jev lento, como o teste acima. Assim a conformidade passa a medir a robustez, e não só o caminho feliz.

Os prints da demo local, com a OpenRouter respondendo e com ela lenta, estão em [`prints/demo-local/`](prints/demo-local/).

## Como reproduzir

```bash
# depois de rodar a demo (bun run demo), na raiz do repositório:
python3 -m venv .venv && . .venv/bin/activate
pip install -r processo/requirements.txt      # pm4py e pandas; as figuras pedem o Graphviz instalado
python processo/exportar_event_log.py data/event-log.jsonl --saida processo/saida
python processo/analisar_processo.py processo/saida/event-log.csv --saida processo/saida
```
