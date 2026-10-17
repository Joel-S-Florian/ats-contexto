import {
  finalize,
  type Category,
  type DimensionResult,
  type ScreeningOutcome,
  type Thresholds,
  type Weights,
  defaultThresholds,
} from "./scoring";

/** Datos estructurados del formulario (docs/01 4.3): lo único que usa el modo `rules`. */
export interface CandidateProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  educationLevel: string;
  yearsExperience: number;
  skills: string[];
  languages: string[];
  preferredMode?: "onsite" | "hybrid" | "remote" | null;
  portfolioUrl?: string | null;
}

export interface VacancyProfile {
  title: string;
  category: Category;
  minYears: number;
  minEducation?: string | null;
  languages: string[];
  workMode: "onsite" | "hybrid" | "remote";
  province: string;
  municipality?: string | null;
  requiredSkills: string[];
  desirableSkills: string[];
  requirementsRequired?: string;
  knockoutRules: KnockoutRule[];
}

export type KnockoutRule = {
  field: "minYears" | "education" | "location" | "language";
  value: string | number;
};

/** Minúsculas y sin tildes, para comparar "Atención" con "atencion". */
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const educationRank: Record<string, number> = {
  secundaria: 1,
  tecnico: 2,
  "grado universitario": 3,
  licenciatura: 3,
  postgrado: 4,
  maestria: 5,
  doctorado: 6,
};
export const eduRank = (s?: string | null) => {
  if (!s) return 0;
  const n = norm(s);
  const hit = Object.entries(educationRank).find(([k]) => n.includes(k));
  return hit ? hit[1] : 0;
};

const sameLocation = (c: string, v: VacancyProfile) => {
  const loc = norm(c);
  return [v.province, v.municipality]
    .filter(Boolean)
    .some((p) => loc.includes(norm(p!)) || norm(p!).includes(loc));
};

/**
 * Filtros eliminatorios (docs/03 sección 3). Se evalúan primero y siempre con código, también en modo `ai`.
 * Devuelve los motivos exactos; lista vacía si el candidato los cumple todos.
 */
export function evaluateKnockouts(c: CandidateProfile, v: VacancyProfile): string[] {
  const out: string[] = [];
  for (const r of v.knockoutRules) {
    if (r.field === "minYears" && c.yearsExperience < Number(r.value))
      out.push(`Requiere al menos ${r.value} años de experiencia y declaró ${c.yearsExperience}.`);
    if (r.field === "education" && eduRank(c.educationLevel) < eduRank(String(r.value)))
      out.push(`Requiere formación mínima de ${r.value} y declaró ${c.educationLevel}.`);
    if (r.field === "location" && !norm(c.location).includes(norm(String(r.value))))
      out.push(`Requiere residir en ${r.value} y declaró ${c.location}.`);
    if (r.field === "language" && !c.languages.some((l) => norm(l) === norm(String(r.value))))
      out.push(`Requiere el idioma ${r.value}, que no declaró.`);
  }
  return out;
}

const pct = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100);
const overlap = (have: string[], want: string[]) => {
  const h = new Set(have.map(norm));
  const matched = want.filter((w) => h.has(norm(w)));
  return { matched, missing: want.filter((w) => !h.has(norm(w))) };
};

/**
 * Modo `rules` (plan base): puntaje determinístico sobre campos estructurados, con explicaciones por plantilla.
 * `evidence` no se calcula (su peso se redistribuye).
 */
export function scoreWithRules(
  c: CandidateProfile,
  v: VacancyProfile,
  weights: Weights,
  thresholds: Thresholds = defaultThresholds,
): ScreeningOutcome {
  const dims: DimensionResult[] = [];
  const matchedReq: string[] = [];
  const missingReq: string[] = [];
  const reasons: string[] = [];

  if (v.requiredSkills.length) {
    const { matched, missing } = overlap(c.skills, v.requiredSkills);
    matchedReq.push(...matched);
    missingReq.push(...missing);
    dims.push({
      key: "req_skills",
      score: pct(matched.length / v.requiredSkills.length),
      justification: `Cumple ${matched.length} de ${v.requiredSkills.length} habilidades requeridas${missing.length ? `; faltan: ${missing.join(", ")}` : ""}.`,
      evidence: matched,
    });
  }
  if (v.desirableSkills.length) {
    const { matched } = overlap(c.skills, v.desirableSkills);
    dims.push({
      key: "nice_skills",
      score: pct(matched.length / v.desirableSkills.length),
      justification: `Cumple ${matched.length} de ${v.desirableSkills.length} habilidades deseables.`,
      evidence: matched,
    });
  }
  const expScore = v.minYears > 0 ? pct(c.yearsExperience / v.minYears) : 100;
  dims.push({
    key: "experience",
    score: expScore,
    justification:
      v.minYears > 0
        ? `Declara ${c.yearsExperience} años de experiencia frente a ${v.minYears} requeridos.`
        : `Declara ${c.yearsExperience} años de experiencia; la vacante no exige mínimo.`,
    evidence: [`${c.yearsExperience} años`],
  });
  if (v.minEducation) {
    const have = eduRank(c.educationLevel);
    const need = eduRank(v.minEducation);
    dims.push({
      key: "education",
      score: need === 0 ? 100 : pct(have / need),
      justification: `Nivel declarado: ${c.educationLevel}; formación mínima: ${v.minEducation}.`,
      evidence: [c.educationLevel],
    });
  }
  const here = sameLocation(c.location, v);
  const locScore = v.workMode === "remote" ? 100 : here ? 100 : v.workMode === "hybrid" ? 40 : 15;
  dims.push({
    key: "location",
    score: locScore,
    justification:
      v.workMode === "remote"
        ? "La vacante es remota; la ubicación no limita."
        : here
          ? `Reside en ${c.location}, compatible con ${v.province}.`
          : `Reside en ${c.location}; la vacante es ${v.workMode === "hybrid" ? "híbrida" : "presencial"} en ${v.province}.`,
    evidence: [c.location],
  });
  if (v.languages.length) {
    const { matched, missing } = overlap(c.languages, v.languages);
    dims.push({
      key: "languages",
      score: pct(matched.length / v.languages.length),
      justification: `Cumple ${matched.length} de ${v.languages.length} idiomas requeridos${missing.length ? `; falta: ${missing.join(", ")}` : ""}.`,
      evidence: matched,
    });
  }

  const byKey = Object.fromEntries(dims.map((d) => [d.key, d]));
  if (byKey.req_skills && byKey.req_skills.score >= 80)
    reasons.push("Cubre la mayoría de las habilidades requeridas.");
  if (byKey.req_skills && byKey.req_skills.score < 50)
    reasons.push("Le faltan varias habilidades requeridas.");
  if (expScore >= 100 && v.minYears > 0) reasons.push("Cumple o supera la experiencia mínima.");
  if (expScore < 60) reasons.push("Su experiencia declarada está por debajo de lo requerido.");
  if (byKey.location && byKey.location.score <= 40)
    reasons.push("La ubicación no coincide con la de la vacante.");

  return finalize(
    "rules",
    dims,
    {
      matchedRequirements: matchedReq,
      missingRequirements: missingReq,
      reasons: reasons.slice(0, 5),
      confidence: "medium",
      notes: [
        "Puntaje calculado solo con los datos del formulario; no se analizó el contenido del CV.",
      ],
    },
    weights,
    thresholds,
  );
}
