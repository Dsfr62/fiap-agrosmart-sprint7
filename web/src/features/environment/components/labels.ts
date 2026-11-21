import type {
  EnvironmentAction,
  RiskLevel,
  RiskType,
} from "@/shared/db/queries/environment";

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "Baixo",
  moderate: "Moderado",
  high: "Alto",
  critical: "Crítico",
};

/** State carries colour; everything else stays neutral (AgroSat principle). */
export const RISK_STYLE: Record<RiskLevel, { badge: string; bar: string }> = {
  low: {
    badge: "bg-agro-success-tint text-agro-success",
    bar: "bg-agro-success",
  },
  moderate: {
    badge: "bg-agro-warning-tint text-agro-warning",
    bar: "bg-agro-warning/60",
  },
  high: { badge: "bg-agro-warning text-white", bar: "bg-agro-warning" },
  critical: { badge: "bg-agro-critical text-white", bar: "bg-agro-critical" },
};

export const ACTION_LABEL: Record<EnvironmentAction, string> = {
  none: "Sem ação",
  notify: "Avisar o produtor",
  irrigate: "Irrigar",
  suggest_agronomist: "Visita do agrônomo",
  generate_report: "Relatório técnico",
};

export const RISK_TYPE_LABEL: Record<RiskType, string> = {
  fungal: "Doença fúngica",
  water: "Estresse hídrico",
  heat: "Estresse térmico",
};

export const RISK_TYPE_SHORT: Record<RiskType, string> = {
  fungal: "Fungo",
  water: "Hídrico",
  heat: "Calor",
};

export const RISK_TYPES: RiskType[] = ["fungal", "water", "heat"];

export const RISK_ORDER: RiskLevel[] = ["critical", "high", "moderate", "low"];

export const formatDateTime = (date: Date): string =>
  date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatNumber = (value: number, digits = 1): string =>
  value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
