import { z } from "zod";

export const vacancyStatuses = ["draft", "published", "paused", "closed"] as const;
export const jobCategories = [
  "general",
  "technical",
  "operational",
  "administrative",
  "managerial",
  "junior",
] as const;
export const experienceLevels = [
  "internship",
  "junior",
  "semi_senior",
  "senior",
  "managerial",
] as const;
export const employmentTypes = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
] as const;
export const workModes = ["onsite", "hybrid", "remote"] as const;

export { labels } from "./labels";

const text = (max: number) => z.string().trim().max(max);

export const vacancyInputSchema = z
  .object({
    title: text(160).min(3),
    department: text(120).min(1),
    summary: text(2000).min(1),
    responsibilities: text(8000).default(""),
    benefits: text(4000).default(""),
    requirementsRequired: text(8000).default(""),
    requirementsDesirable: text(8000).default(""),
    category: z.enum(jobCategories).default("general"),
    level: z.enum(experienceLevels),
    minYears: z.number().int().min(0).max(50).default(0),
    minEducation: text(120).nullish(),
    languages: z.array(text(40)).max(10).default([]),
    employmentType: z.enum(employmentTypes),
    workMode: z.enum(workModes),
    province: text(80).min(1),
    municipality: text(80).nullish(),
    salaryMin: z.number().int().min(0).nullish(),
    salaryMax: z.number().int().min(0).nullish(),
    showSalary: z.boolean().default(false),
    openings: z.number().int().min(1).max(500).default(1),
    /** Seleccion automatica por examen aprobado. Apagado por defecto; solo un administrador puede cambiarlo. */
    autoSelect: z.boolean().default(false),
    closesAt: z.coerce.date().nullish(),
    pipelineId: z.string().uuid().optional(),
    ownerId: z.string().uuid().nullish(),
    evaluatorIds: z.array(z.string().uuid()).max(20).default([]),
    requiredSkills: z.array(text(60).min(1)).max(30).default([]),
    desirableSkills: z.array(text(60).min(1)).max(30).default([]),
    knockoutRules: z
      .array(
        z.object({
          field: z.enum(["minYears", "education", "location", "language"]),
          value: z.union([z.string(), z.number()]),
        }),
      )
      .max(10)
      .default([]),
  })
  .refine((v) => v.salaryMin == null || v.salaryMax == null || v.salaryMin <= v.salaryMax, {
    message: "El salario mínimo no puede superar al máximo",
    path: ["salaryMin"],
  });
export type VacancyInput = z.infer<typeof vacancyInputSchema>;

// PATCH: el servidor mezcla el cuerpo parcial con la vacante actual y valida el resultado completo con vacancyInputSchema
// (un .partial() de zod aplicaria los valores por defecto y pisaria campos no enviados).
export const vacancyPatchSchema = z.record(z.string(), z.unknown());

/** Filtros de la búsqueda pública (docs/01-producto.md 4.2). */
export const jobSearchSchema = z.object({
  key: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  location: z.string().trim().max(80).optional(),
  mode: z.enum(workModes).optional(),
  type: z.enum(employmentTypes).optional(),
  level: z.enum(experienceLevels).optional(),
  department: z.string().trim().max(120).optional(),
  since: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type JobSearch = z.infer<typeof jobSearchSchema>;
