import { z } from "zod";

export const stageTypes = [
  "screening",
  "interview",
  "assessment",
  "selection",
  "hiring",
  "custom",
] as const;
export type StageType = (typeof stageTypes)[number];

export const stageTypeLabels: Record<StageType, string> = {
  screening: "Preselección",
  interview: "Entrevista",
  assessment: "Evaluación",
  selection: "Selección",
  hiring: "Contratación",
  custom: "Personalizada",
};

export const transitionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("manual") }),
  z.object({ mode: z.literal("score_threshold"), min: z.number().min(0).max(100) }),
  z.object({ mode: z.literal("assessment_result"), minScore: z.number().min(0).max(100) }),
]);

export const stageInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(stageTypes),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
  transition: transitionSchema.default({ mode: "manual" }),
});
export const pipelineInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  stages: z.array(stageInputSchema).min(1).max(20),
});
export type StageInput = z.infer<typeof stageInputSchema>;
export type PipelineInput = z.infer<typeof pipelineInputSchema>;

/** Plantilla por defecto (docs/01-producto.md 2.2). La postulación es la entrada; no es una etapa configurable. */
export const defaultStages: StageInput[] = [
  {
    name: "Preselección",
    type: "screening",
    enabled: true,
    config: {},
    transition: { mode: "manual" },
  },
  {
    name: "Entrevista",
    type: "interview",
    enabled: true,
    config: {},
    transition: { mode: "manual" },
  },
  {
    name: "Evaluación",
    type: "assessment",
    enabled: true,
    config: {},
    transition: { mode: "manual" },
  },
  {
    name: "Selección",
    type: "selection",
    enabled: true,
    config: {},
    transition: { mode: "manual" },
  },
  {
    name: "Contratación",
    type: "hiring",
    enabled: true,
    config: {},
    transition: { mode: "manual" },
  },
];

const rank: Record<Exclude<StageType, "custom">, number> = {
  screening: 0,
  interview: 1,
  assessment: 2,
  selection: 3,
  hiring: 4,
};

/**
 * Reglas de transición de etapas: el orden de las etapas tipadas respeta
 * Preselección, Entrevista, Evaluación, Selección, Contratación (se permiten repetidas, p. ej. dos entrevistas,
 * y omitidas, p. ej. sin examen). Debe haber una sola Contratación y es la última etapa activa.
 * Devuelve la lista de problemas en español; vacía si es válido.
 */
export function validateStages(
  stages: Pick<StageInput, "type" | "enabled" | "transition">[],
): string[] {
  const errors: string[] = [];
  const active = stages.filter((s) => s.enabled);
  const typed = active.filter((s) => s.type !== "custom");

  for (let i = 1; i < typed.length; i++) {
    const prev = typed[i - 1]!.type as keyof typeof rank;
    const cur = typed[i]!.type as keyof typeof rank;
    if (rank[cur] < rank[prev])
      errors.push(
        `La etapa "${stageTypeLabels[cur]}" no puede ir después de "${stageTypeLabels[prev]}".`,
      );
  }
  const hiring = active.filter((s) => s.type === "hiring");
  if (hiring.length !== 1) errors.push("Debe haber exactamente una etapa activa de Contratación.");
  else if (active[active.length - 1]!.type !== "hiring")
    errors.push("La Contratación debe ser la última etapa.");

  stages.forEach((s) => {
    if (s.transition.mode === "assessment_result" && s.type !== "assessment")
      errors.push("El avance por resultado de examen solo aplica a etapas de Evaluación.");
    if (s.transition.mode === "score_threshold" && s.type !== "screening")
      errors.push("El avance por umbral de puntaje solo aplica a la Preselección.");
  });
  return [...new Set(errors)];
}
