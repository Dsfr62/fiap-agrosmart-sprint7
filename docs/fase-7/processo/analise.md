### Análise do processo (mineração de processos com pm4py)

- **2352 eventos**, **1008 casos** (cada caso é uma leitura de sensor) e **9 atividades**.
- **84 casos (8.3%) dispararam uma avaliação de risco**; os outros só foram gravados (histórico ou hora já avaliada).
- **5 variantes** de caminho.
- Fitness do log na rede de Petri (token replay): **1.0**; casos que cabem inteiros no modelo: **100.0%**.

**Variantes (os caminhos mais comuns)**

| Casos | % | Mediana do caso | Caminho |
|---:|---:|---:|---|
| 924 | 91.7% | 1 ms | Mensagem recebida → Leitura gravada |
| 24 | 2.4% | 84 ms | Mensagem recebida → Leitura gravada → Avaliação enfileirada → Avaliação iniciada → Risco avaliado pelas regras (plano B) → Decisão: avisar o produtor |
| 24 | 2.4% | 154 ms | Mensagem recebida → Leitura gravada → Avaliação enfileirada → Avaliação iniciada → Risco avaliado pelas regras (plano B) → Decisão: irrigar |
| 24 | 2.4% | 193 ms | Mensagem recebida → Leitura gravada → Avaliação enfileirada → Avaliação iniciada → Risco avaliado pelas regras (plano B) → Decisão: nenhuma ação |
| 12 | 1.2% | 60 ms | Mensagem recebida → Leitura gravada → Avaliação enfileirada → Avaliação iniciada → Risco avaliado pelas regras (plano B) → Decisão: chamar o agrônomo |

**Esperas entre atividades (as maiores médias primeiro)**

| De | Para | Vezes | Média | Mediana | p95 | Máxima |
|---|---|---:|---:|---:|---:|---:|
| Avaliação enfileirada | Avaliação iniciada | 84 | 117 ms | 114 ms | 302 ms | 380 ms |
| Avaliação iniciada | Risco avaliado pelas regras (plano B) | 84 | 32 ms | 28 ms | 75 ms | 248 ms |
| Mensagem recebida | Leitura gravada | 1008 | 1 ms | 1 ms | 1 ms | 72 ms |
| Leitura gravada | Avaliação enfileirada | 84 | 1 ms | 1 ms | 1 ms | 1 ms |
| Risco avaliado pelas regras (plano B) | Decisão: avisar o produtor | 24 | 1 ms | 1 ms | 1 ms | 1 ms |
| Risco avaliado pelas regras (plano B) | Decisão: chamar o agrônomo | 12 | 1 ms | 1 ms | 1 ms | 1 ms |
| Risco avaliado pelas regras (plano B) | Decisão: irrigar | 24 | 1 ms | 1 ms | 1 ms | 1 ms |
| Risco avaliado pelas regras (plano B) | Decisão: nenhuma ação | 24 | 1 ms | 1 ms | 1 ms | 1 ms |

**Onde olhar**

- Maior espera média: **Avaliação enfileirada → Avaliação iniciada**, 117 ms em média (302 ms no p95).
- Fila do avaliador: até **6** avaliações esperando juntas (média 3.1).
- Quem decidiu: Jev 0, regras (plano B) 84 (100% pelo plano B).
- Desvios do caminho feliz: leitura repetida (ignorada) 0, mensagem descartada (inválida) 0, leitura não gravada (erro) 0, avaliação ignorada 0, erro na avaliação 0.
- Figuras geradas: rede-heuristica.png, rede-de-petri.png, dfg-desempenho.png.

