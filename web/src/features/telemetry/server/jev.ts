import { env } from "@/shared/lib/env";
import { ACTIONS, type Action, RISK_LEVELS, type RiskLevel } from "./rules";

/** Pinned so calibrated thresholds don't drift with new releases. */
export const JEV_MODEL = "typesafe/jev-1.13";
const TIMEOUT_MS = 10_000;

const STATE_CONTEXT =
  "The state summarises the last 24 hours of an environmental station in a crop field " +
  "and the latest leaf photo analysis of that field. ";

const RISK_QUESTIONS = {
  risk: {
    instructions:
      STATE_CONTEXT +
      "Rate the risk of fungal leaf disease developing or spreading in this field over the " +
      "next 48 hours. Many hours of air humidity at or above 90% at 15-25 °C " +
      "(favorableWetHours), rain, and an existing infection raise the risk.",
    criteria: [
      "low: environment unfavourable to fungal leaf disease and no relevant infection detected",
      "moderate: some humid hours or a mild infection; monitoring is enough",
      "high: long humid periods at mild temperatures or rain; infection likely to start or spread",
      "critical: persistent leaf wetness conditions plus existing infection; spread is imminent",
    ],
  },
  water: {
    instructions:
      STATE_CONTEXT +
      "Rate the crop's water stress over the next 48 hours. Low soil moisture " +
      "(soilMoisturePct, drySoilHours at or below 20%), a falling trend, heat, strong sun " +
      "(strongSunHours) and no rain raise the risk.",
    criteria: [
      "low: soil moisture adequate; no water stress",
      "moderate: soil drying; monitor and plan irrigation",
      "high: soil near the wilting range; irrigation needed soon",
      "critical: soil dry for many hours; irrigate now to avoid yield loss",
    ],
  },
  heat: {
    instructions:
      STATE_CONTEXT +
      "Rate the crop's heat stress over the next 48 hours. Hours at or above 32 °C " +
      "(hotHours), high maximum temperature and strong sun raise the risk.",
    criteria: [
      "low: temperatures within the comfortable range",
      "moderate: brief hot periods; monitor",
      "high: several hours above 32 °C; heat stress likely",
      "critical: long hot periods with strong sun; heat damage likely",
    ],
  },
} as const;

type RiskQuestion = keyof typeof RISK_QUESTIONS;

const ACTION_CRITERIA: Record<Action, string> = {
  none: "No action needed; conditions are normal or every risk is low.",
  notify: "Notify the farmer in the app to keep monitoring this field.",
  irrigate: "Irrigate this field because the soil is drying or already dry.",
  suggest_agronomist:
    "Recommend an agronomist field visit because disease is likely or already spreading.",
  generate_report:
    "Generate a detailed report for the cooperative's technical team.",
};

const ACTION_INSTRUCTIONS =
  "Given the same state, choose the single most important action the farm " +
  "monitoring system should take now.";

export interface JevRisk {
  level: RiskLevel;
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface JevDecision {
  risks: Record<RiskQuestion, JevRisk>;
  action: Action;
  actionConfidence: number;
  actionProbabilities: Record<string, number>;
  model: string;
  costUsd: number | null;
}

interface ScoreAnswer {
  score?: number;
  probabilities?: Record<string, number>;
  confidence?: number;
}

interface DecisionsResponse {
  model?: string;
  answers?: Partial<Record<RiskQuestion, ScoreAnswer>> & {
    action?: {
      choice?: string;
      probabilities?: Record<string, number>;
      confidence?: number;
    };
  };
  usage?: { cost?: number };
}

const argmaxIndex = (probabilities: Record<string, number>): number =>
  Number(
    Object.entries(probabilities).sort(([, a], [, b]) => b - a)[0]?.[0] ?? -1,
  );

const toRisk = (answer: ScoreAnswer | undefined): JevRisk | null => {
  if (!answer?.probabilities) return null;
  const level = RISK_LEVELS[argmaxIndex(answer.probabilities)];
  if (!level) return null;
  return {
    level,
    score: answer.score ?? RISK_LEVELS.indexOf(level),
    confidence: answer.confidence ?? 0,
    probabilities: Object.fromEntries(
      Object.entries(answer.probabilities).map(([index, p]) => [
        RISK_LEVELS[Number(index)],
        p,
      ]),
    ),
  };
};

/**
 * Asks Jev (System One model) in a single call for the field's fungal, water
 * and heat risk plus the next action, via the OpenRouter Decisions API.
 * Network or contract failures return an error Result so the caller can fall
 * back to threshold rules.
 */
export const decideWithJev = async (
  state: Record<string, unknown>,
): Promise<
  { success: true; data: JevDecision } | { success: false; error: string }
> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(
      new URL("/api/alpha/decisions", env.OPENROUTER_BASE_URL),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: JEV_MODEL,
          state,
          questions: {
            ...Object.fromEntries(
              Object.entries(RISK_QUESTIONS).map(([key, question]) => [
                key,
                { type: "score", ...question },
              ]),
            ),
            action: {
              type: "choice",
              instructions: ACTION_INSTRUCTIONS,
              criteria: ACTION_CRITERIA,
            },
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return { success: false, error: `Jev respondeu HTTP ${response.status}` };
    }

    const payload = (await response.json()) as DecisionsResponse;
    const risk = toRisk(payload.answers?.risk);
    const water = toRisk(payload.answers?.water);
    const heat = toRisk(payload.answers?.heat);
    const action = payload.answers?.action;
    const chosenAction = ACTIONS.find((name) => name === action?.choice);

    if (!risk || !water || !heat || !action || !chosenAction) {
      return {
        success: false,
        error: "Jev retornou resposta fora do contrato",
      };
    }

    return {
      success: true,
      data: {
        risks: { risk, water, heat },
        action: chosenAction,
        actionConfidence: action.confidence ?? 0,
        actionProbabilities: action.probabilities ?? {},
        model: payload.model ?? JEV_MODEL,
        costUsd: payload.usage?.cost ?? null,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "falha desconhecida ao chamar o Jev",
    };
  } finally {
    clearTimeout(timeout);
  }
};
