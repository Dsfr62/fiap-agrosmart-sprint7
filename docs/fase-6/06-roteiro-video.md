# 6. Roteiro do vídeo de demonstração (3 a 5 min)

O vídeo precisa mostrar a solução **funcionando e integrada**: visão geral, arquitetura, coleta de dados, automação e dashboard. Este roteiro dura cerca de **4 min 30 s** e acontece **inteiro no navegador**, com a demo rodando ao vivo.

## Antes de gravar (2 min)

1. Num terminal, na pasta `agrosmart-fase-6/web`, rode **um comando só**:

   ```bash
   bun run demo
   ```

   Ele sobe o broker MQTT, o banco, o worker com o avaliador, o app e o simulador, e abre o navegador. O simulador roda no cenário `misto`, com cada fazenda numa condição: Alfa úmida, Beta em seca e Gama normal. Cada hora simulada passa em 30 s. Minimize o terminal: ele não aparece no vídeo.
2. Espere **cerca de 2 minutos**, para o dashboard já ter decisões e alertas com recomendação.
3. Deixe estas abas abertas, nesta ordem:
   - `http://localhost:3000/arquitetura`
   - `http://localhost:3000/ambiente/leituras`
   - `http://localhost:3000/ambiente/decisoes`
   - `http://localhost:3000/ambiente`
4. **Desative a extensão React DevTools** (ou grave numa janela anônima). Ela deixa a página mais lenta e mostra avisos que não são do app.

Ao terminar a gravação, volte ao terminal e aperte **Ctrl+C**.

## Cenas

| Tempo | Na tela | O que falar |
|---|---|---|
| **0:00 – 0:30**<br>Visão geral | `/ambiente`, rolando devagar | "Este é o AgroSmart, na Fase 6. Nas fases anteriores o sistema analisava fotos de folhas para medir a infecção. Agora ele também monitora o **ambiente** de cada talhão com estações IoT e decide **sozinho** três riscos (doença fúngica, falta de água e calor) e o que fazer. Tudo que vou mostrar está rodando ao vivo; cada fazenda está numa condição diferente: a Alfa úmida, a Beta em seca." |
| **0:30 – 1:10**<br>Arquitetura | `/arquitetura`: as 5 camadas e o diagrama | "A arquitetura tem cinco camadas. **Fontes**: as estações simuladas e as fotos enviadas pelo produtor. **Ingestão**: as estações publicam num broker MQTT, o Mosquitto, e um worker grava as leituras. **Processamento**: a API de visão das fases anteriores e a agregação das últimas 24 horas. **Automação**: o Jev avalia três riscos e escolhe a ação, com regras como plano B e um LLM para a recomendação. **Visualização**: os dashboards. É um núcleo em monólito modular, o app web, com serviços satélites ao redor, compartilhando o banco. Em verde, o que é novo nesta fase." |
| **1:10 – 1:50**<br>Coleta | `/ambiente/leituras` | "Esta é a coleta ao vivo. Cada talhão tem uma estação que mede temperatura, umidade do ar, umidade do solo e luminosidade, e simula eventos de chuva. Cada cartão é uma mensagem MQTT que acabou de chegar: em verde, o tópico `agrosmart/fazenda/talhão/telemetria`; embaixo, o JSON. O horário vem da própria estação, o que nos permite acelerar o tempo: aqui, uma hora passa em 30 segundos. No topo: 7 de 7 estações transmitindo e as mensagens por minuto." *(Espere uma atualização: novas mensagens aparecem.)* |
| **1:50 – 3:00**<br>Processamento e automação | `/ambiente/decisoes`: abra uma linha crítica | "A cada hora simulada, o worker resume as últimas 24 horas de cada talhão: **horas de folha molhada entre 15 e 25 °C** (fungo), **horas com solo abaixo de 20%** (falta de água) e **horas acima de 32 °C** (calor). Esse é o estado enviado ao **Jev**, um modelo *System One*: ele não gera texto; numa só chamada, devolve o nível de cada risco e a ação, com probabilidade." *(Passe o mouse na barra de probabilidades.)* "Aqui, um talhão da Alfa: o Jev concentrou a probabilidade de fungo em crítico, e a ação foi visita do agrônomo." *(Abra uma linha da Fazenda Beta.)* "Já na Beta, o risco crítico é hídrico, e a ação é irrigar. E aqui o custo: menos de um centésimo de centavo de dólar por decisão; avaliar 7 talhões de hora em hora custa centavos por mês. Como o risco é crítico, um LLM escreveu a recomendação de manejo, **sem produto nem dose**, porque isso exige receituário agronômico. Se o Jev cair, regras de limiar assumem, e um cooldown evita pagar por recomendações repetidas." *(Filtre por "Crítico" para mostrar o filtro.)* |
| **3:00 – 4:10**<br>Dashboard | `/ambiente`: resumo → cartões → gráfico → alertas | "No topo, um relance responde se está tudo bem: quantos talhões estão em cada nível de risco e de que tipo. Cada cartão mostra o maior risco e as três etiquetas: fungo, hídrico e calor. A última leitura aparece com unidade e contexto: na Alfa, a umidade do ar acima de 90% aparece como folha molhada; na Beta, o solo abaixo de 20% aparece como solo seco. Abaixo, as horas de cada indicador, a ação decidida e a confiança do Jev." *(Desça até o gráfico.)* "As últimas 48 horas do talhão: na Alfa, as noites acima da linha de 90% explicam o fungo." *(Troque para um talhão da Beta.)* "Na Beta, o solo colado abaixo da linha de 20% explica a seca." *(Desça até os alertas.)* "E o feed de alertas com a recomendação da IA." *(Espere uma atualização e mostre um cartão mudando.)* "O dashboard se atualiza sozinho a cada 10 segundos." |
| **4:10 – 4:30**<br>Fechamento | Menu lateral: Dashboard (fotos) → Ambiente | "Tudo isso convive no mesmo app com as análises de foto das fases anteriores. O dado sai da estação, passa pelo broker, é processado, vira decisão automática e aparece aqui, sem ninguém clicar. Essa é a base para a entrega final na Fase 7." |

## Dicas

- Grave em 1080p, com o navegador em tela cheia.
- Se o Jev estiver fora do ar na hora, as decisões aparecem como "Regras (plano B)". Isso também é uma demonstração válida: comente que o sistema continua decidindo.
- Para mostrar no celular, use o modo responsivo do navegador (F12 → ícone de celular).
- Se passar de 5 min, encurte a cena de arquitetura.
