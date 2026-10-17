import type { CandidateProfile, VacancyProfile } from "./rules";

export const techVacancy: VacancyProfile = {
  title: "Desarrollador Backend",
  category: "technical",
  minYears: 3,
  minEducation: "Grado universitario",
  languages: ["Español"],
  workMode: "hybrid",
  province: "Distrito Nacional",
  municipality: "Piantini",
  requiredSkills: ["Node.js", "PostgreSQL", "TypeScript"],
  desirableSkills: ["Docker", "AWS"],
  requirementsRequired: "Experiencia construyendo APIs REST.",
  knockoutRules: [],
};

export const person = (over: Partial<CandidateProfile> = {}): CandidateProfile => ({
  fullName: "Ana María Pérez Gómez",
  email: "ana.perez@correo.test",
  phone: "809-555-1234",
  location: "Distrito Nacional",
  educationLevel: "Grado universitario",
  yearsExperience: 4,
  skills: ["Node.js", "PostgreSQL", "TypeScript", "Docker"],
  languages: ["Español", "Inglés"],
  ...over,
});

const ten = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Conjunto dorado sintético (docs/03 sección 10): 30 perfiles con la recomendación esperada. */
export const goldenSet: {
  name: string;
  c: Partial<CandidateProfile>;
  expect: "advance" | "review" | "low_fit";
}[] = [
  // 10 sólidos
  ...ten.map((i) => ({
    name: `solido-${i}`,
    c: {
      yearsExperience: 3 + (i % 6),
      skills: ["Node.js", "PostgreSQL", "TypeScript", ...(i % 2 ? ["Docker"] : ["AWS"])],
      educationLevel: i % 3 ? "Grado universitario" : "Maestría",
    },
    expect: "advance" as const,
  })),
  // 10 intermedios: faltan skills o experiencia, ubicación distinta
  ...ten.map((i) => ({
    name: `medio-${i}`,
    c: {
      yearsExperience: 1 + (i % 2),
      skills: i % 2 ? ["Node.js", "Docker"] : ["TypeScript", "PostgreSQL"],
      location: i % 3 ? "Santiago" : "Distrito Nacional",
      educationLevel: i % 4 ? "Técnico" : "Grado universitario",
    },
    expect: "review" as const,
  })),
  // 10 débiles
  ...ten.map((i) => ({
    name: `debil-${i}`,
    c: {
      yearsExperience: i % 2,
      skills: i % 3 ? ["Excel"] : ["Photoshop", "Excel"],
      educationLevel: "Secundaria",
      location: "Puerto Plata",
      languages: ["Francés"],
    },
    expect: "low_fit" as const,
  })),
];
