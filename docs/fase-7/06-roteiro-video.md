# 6. Roteiro do vídeo final (5 a 8 minutos)

O enunciado pede, no vídeo final: a demonstração da plataforma, a explicação do fluxo, a análise do processo e o funcionamento completo. O pitch é outro vídeo, de até 5 minutos (ver o fim desta página).

**Antes de gravar:** Docker aberto, `cd web && bun run demo` rodando há uns 3 minutos (para já ter decisões), o navegador em tela cheia e o repositório aberto numa aba. Com a chave da OpenRouter no `web/.env.local`, as decisões saem pelo Jev e aparece a recomendação escrita pela IA; sem ela, saem pelas regras (dizer isso no vídeo).

| Tempo | Tela | O que falar |
|---|---|---|
| 0:00 a 0:30 | Painel `/ambiente` | O problema: a doença e a falta de água aparecem na lavoura antes de alguém ver. O AgroSmart acompanha cada talhão de hora em hora e diz o que fazer. Os sensores aqui são simulados. |
| 0:30 a 1:30 | `/arquitetura` (diagrama final) | O caminho do dado: estação, broker MQTT, worker, banco, avaliador (Jev ou regras), painel. Em volta, o pipeline DevSecOps e o monitoramento. |
| 1:30 a 2:30 | `/ambiente/leituras` | Entrada: as mensagens chegando ao vivo, uma por estação a cada 15 minutos simulados. Mostrar uma mensagem (temperatura, umidade do ar e do solo, luz). |
| 2:30 a 3:30 | `/ambiente/decisoes` | Processamento e automação: abrir uma decisão de risco alto, mostrar o resumo das 24 horas que foi avaliado, o risco fúngico, hídrico e térmico, a ação escolhida e quem decidiu. |
| 3:30 a 4:00 | `/ambiente` | Saída: o painel com os alertas e a evolução no tempo. |
| 4:00 a 5:00 | `/monitoramento` e um terminal | Monitoramento: tudo verde; parar o Mosquitto (`docker stop`) e mostrar o broker fora e o worker sem conexão (leva uns 15 segundos); religar. Mostrar o `/api/health` no navegador. |
| 5:00 a 5:45 | GitHub, aba Actions | O pipeline: build e testes, SonarQube (Quality Gate), Trivy (o portão de vulnerabilidades), execução ponta a ponta. Abrir o Summary de uma execução verde. |
| 5:45 a 7:15 | Figuras da análise de processo | O event log (cada leitura é um caso), a rede descoberta pelo Heuristics Miner, as variantes (o caminho mais comum e os desvios), o gargalo (onde a leitura mais espera) e as melhorias propostas. É a parte da Marina. |
| 7:15 a 7:45 | Painel | Fecho: o que a plataforma faz hoje, o que é simulado e o próximo passo (estação real, calibrar os limites com um agrônomo). |

Dicas: gravar a tela em 1080p, sem música por cima da fala, link público no YouTube (testar numa aba anônima antes de mandar).

## Pitch (até 5 minutos, vídeo separado)

O enunciado pede: problema resolvido, solução proposta, diferencial competitivo, público-alvo e proposta de valor, com slides. Base de conteúdo: o problema e a persona do AgroSmart de 08/09 e o modelo de negócio da fase 5. Sugestão de tempo: problema 1 min, solução 1 min, diferencial 1 min, público e proposta de valor 1 min, fecho 30 s.
