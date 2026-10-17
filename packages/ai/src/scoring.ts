import { z } from "zod";

/** docs/03 sección 4.1 */
export const dimensionKeys = [
  "req_skills",
  "nice_skills",
  "experience",
  "education",
  "location",
  "languages",
  "evidence",
] as const;
export type DimensionKey = (typeof dimensionKeys)[number];
export type Weights = Record<DimensionKey, number>;
export type Category =
  "general" | "technical" | "operational" | "administrative" | "managerial" | "junior";

export const dimensionLabels: Record<DimensionKey, string> = {
  req_skills: "Habilidades requeridas",
  nice_skills: "Habilidades deseables",
  experience: "Experiencia relevante",
  education: "Formación y credenciales",
  location: "Ubicación y modalidad",
  languages: "Idiomas",
  evidence: "Evidencia de logros",
};

/** Versión de la tabla de pesos y umbrales; sube con cada cambio (se guarda en cada resultado). */
export const WEIGHTS_VERSION = "w1";

/** docs/03 sección 4.2. Cada categoría suma 100. */
export const defaultWeights: Record<Category, Weights> = {
  general: {
    req_skills: 35,
    nice_skills: 10,
    experience: 25,
    education: 10,
    location: 10,
    languages: 5,
    evidence: 5,
  },
  technical: {
    req_skills: 40,
    nice_skills: 10,
    experience: 20,
    education: 10,
    location: 5,
    languages: 5,
    evidence: 10,
  },
  operational: {
    req_skills: 25,
    nice_skills: 5,
    experience: 30,
    education: 5,
    location: 20,
    languages: 5,
    evidence: 10,
  },
  administrative: {
    req_skills: 30,
    nice_skills: 10,
    experience: 25,
    education: 15,
    location: 10,
    languages: 5,
    evidence: 5,
  },
  managerial: {
    req_skills: 25,
    nice_skills: 5,
    experience: 35,
    education: 10,
    location: 5,
    languages: 5,
    evidence: 15,
  },
  junior: {
    req_skills: 30,
    nice_skills: 10,
    experience: 5,
    education: 25,
    location: 10,
    languages: 5,
    evidence: 15,
  },
};

export interface Thresholds {
  advance: number;
  review: number;
}
export const defaultThresholds: Thresholds = { advance: 65, review: 45 };

export type Recommendation = "advance" | "review" | "low_fit";

export const recommend = (overall: number, t: Thresholds = defaultThresholds): Recommendation =>
  overall >= t.advance ? "advance" : overall >= t.review ? "review" : "low_fit";

/**
 * Puntaje total calculado SIEMPRE en código (regla no negociable 4).
 * Las dimensiones que no aplican (score ausente) redistribuyen su peso entre las demás.
 */
export function computeOverall(
  scores: Partial<Record<DimensionKey, number>>,
  weights: Weights,
): number {
  let sum = 0;
  let total = 0;
  for (const k of dimensionKeys) {
    const s = scores[k];
    if (s === undefined || weights[k] <= 0) continue;
    sum += Math.min(100, Math.max(0, s)) * weights[k];
    total += weights[k];
  }
  return total === 0 ? 0 : Math.round(sum / total);
}

export const weightsSchema = z.record(z.enum(dimensionKeys), z.number().min(0).max(100));

/** Pesos efectivos: preset de la categoría con ajustes opcionales de la vacante. */
export function resolveWeights(category: Category, overrides?: Partial<Weights> | null): Weights {
  return { ...defaultWeights[category], ...(overrides ?? {}) };
}

/** Resultado común de ambos modos (docs/03 sección 2). */
export interface DimensionResult {
  key: DimensionKey;
  score: number;
  justification: string;
  evidence: string[];
}
export interface ScreeningOutcome {
  mode: "rules" | "ai";
  overall: number;
  recommendation: Recommendation;
  dimensions: DimensionResult[];
  matchedRequirements: string[];
  missingRequirements: string[];
  reasons: string[];
  confidence: "low" | "medium" | "high";
  notes: string[];
}

/** Arma el resultado final a partir de dimensiones ya validadas. */
export function finalize(
  mode: "rules" | "ai",
  dimensions: DimensionResult[],
  extra: Pick<
    ScreeningOutcome,
    "matchedRequirements" | "missingRequirements" | "reasons" | "confidence" | "notes"
  >,
  weights: Weights,
  thresholds: Thresholds = defaultThresholds,
): ScreeningOutcome {
  const scores: Partial<Record<DimensionKey, number>> = {};
  for (const d of dimensions) scores[d.key] = d.score;
  const overall = computeOverall(scores, weights);
  return { mode, overall, recommendation: recommend(overall, thresholds), dimensions, ...extra };
}
