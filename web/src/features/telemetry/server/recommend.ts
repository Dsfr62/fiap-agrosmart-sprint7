import { env } from "@/shared/lib/env";
import type { WindowAggregates } from "./aggregate";
import type { Action, RiskLevel, RiskLevels } from "./rules";

const TIMEOUT_MS = 30_000;
const MAX_TOKENS = 400;

const RISK_LABEL_PT: Record<RiskLevel, string> = {
  low: "baixo",
  moderate: "moderado",
  high: "alto",
  critical: "crítico",
};

const SYSTEM_PROMPT = `Você é um engenheiro agrônomo consultor de uma cooperativa agropecuária.

Você recebe o resumo das últimas 24 horas de uma estação ambiental instalada num talhão, a última análise de foto de folha desse talhão e os níveis de risco calculados pelo sistema: doença fúngica, estresse hídrico (solo seco) e estresse térmico (calor).

SUA TAREFA
Escrever uma recomendação de manejo curta para o produtor.

REGRAS
- Baseie-se exclusivamente nos números fornecidos. Não invente dados.
- Cite os números que sustentam a recomendação (horas de umidade alta, temperatura, chuva, infecção na foto).
- Nunca prescreva produto comercial, dose ou intervalo de aplicação: isso exige receituário agronômico do responsável em campo.
- Trate primeiro o risco mais alto. Indique o tipo de manejo (ex.: vistoria e manejo preventivo para fungos; irrigação e horário de irrigação para solo seco; reduzir estresse por calor) e se a visita de um agrônomo é recomendada.
- Português do Brasil, tom técnico e direto, no máximo 120 palavras. Sem saudação, sem emoji.`;

export interface RiskRecommendationInput {
  fieldLabel: string;
  levels: RiskLevels;
  action: Action;
  aggregates: WindowAggregates;
  latestPhoto: {
    pestType: string;
    affectedPct: number;
    daysAgo: number;
  } | null;
}

const buildUserPrompt = ({
  fieldLabel,
  levels,
  action,
  aggregates: a,
  latestPhoto,
}: RiskRecommendationInput): string => `TALHÃO: ${fieldLabel}
RISCOS CALCULADOS: doença fúngica ${RISK_LABEL_PT[levels.fungal]}, estresse hídrico ${RISK_LABEL_PT[levels.water]}, estresse térmico ${RISK_LABEL_PT[levels.heat]} (ação sugerida pelo sistema: ${action})

ÚLTIMAS 24 H
- Temperatura: mín ${a.temperatureC.min} °C, média ${a.temperatureC.avg} °C, máx ${a.temperatureC.max} °C
- Umidade do ar: média ${a.airHumidityPct.avg}%, máxima ${a.airHumidityPct.max}%
- Horas com umidade do ar >= 90%: ${a.humidHours} h (maior sequência: ${a.longestHumidRunHours} h)
- Horas úmidas entre 15 e 25 °C: ${a.favorableWetHours} h
- Horas de chuva: ${a.rainHours} h
- Umidade do solo: média ${a.soilMoisturePct.avg}%, atual ${a.soilMoisturePct.last}%, variação ${a.soilMoisturePct.change} pontos; ${a.drySoilHours} h com solo <= 20%
- Horas com temperatura >= 32 °C: ${a.hotHours} h; horas de sol forte: ${a.strongSunHours} h

ÚLTIMA ANÁLISE DE FOTO
${
  latestPhoto
    ? `- Praga: ${latestPhoto.pestType}, área afetada ${latestPhoto.affectedPct}%, há ${latestPhoto.daysAgo} dias`
    : "- Nenhuma foto analisada neste talhão."
}`;

/** Writes the management recommendation text for a high-risk evaluation. */
export const generateRiskRecommendation = async (
  input: RiskRecommendationInput,
): Promise<
  | { success: true; data: { content: string; model: string } }
  | { success: false; error: string }
> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      `${env.OPENROUTER_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: env.OPENROUTER_MODEL,
          max_tokens: MAX_TOKENS,
          temperature: 0.2,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(input) },
          ],
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `OpenRouter respondeu HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { success: false, error: "OpenRouter retornou resposta vazia" };
    }
    return { success: true, data: { content, model: env.OPENROUTER_MODEL } };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "falha desconhecida ao chamar o LLM",
    };
  } finally {
    clearTimeout(timeout);
  }
};
