import { z } from "zod";

export const questionTypes = ["multiple_choice", "true_false", "short_answer"] as const;
export const questionTypeLabels = {
  multiple_choice: "Selección múltiple",
  true_false: "Verdadero / Falso",
  short_answer: "Respuesta corta",
} as const;

const questionSchema = z
  .object({
    type: z.enum(questionTypes),
    prompt: z.string().trim().min(3, "Escribe la pregunta").max(1000),
    options: z.array(z.string().trim().min(1).max(300)).max(8).default([]),
    correctAnswer: z.union([z.number().int().min(0), z.boolean()]).nullish(),
    points: z.number().int().min(1).max(100).default(1),
  })
  .superRefine((q, ctx) => {
    if (q.type === "multiple_choice") {
      if (q.options.length < 2)
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "La selección múltiple necesita al menos 2 opciones",
        });
      if (typeof q.correctAnswer !== "number" || q.correctAnswer >= q.options.length)
        ctx.addIssue({
          code: "custom",
          path: ["correctAnswer"],
          message: "Indica cuál es la opción correcta",
        });
    }
    if (q.type === "true_false" && typeof q.correctAnswer !== "boolean")
      ctx.addIssue({
        code: "custom",
        path: ["correctAnswer"],
        message: "Indica si la afirmación es verdadera o falsa",
      });
  });

export const assessmentTemplateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(""),
  timeLimitMin: z.number().int().min(1).max(480),
  passingScore: z.number().int().min(0).max(100).default(60),
  modules: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        questions: z.array(questionSchema).min(1).max(100),
      }),
    )
    .min(1)
    .max(20),
});
export type AssessmentTemplateInput = z.infer<typeof assessmentTemplateSchema>;

export interface SnapshotQuestion {
  id: string;
  type: (typeof questionTypes)[number];
  prompt: string;
  options: string[];
  correctAnswer: number | boolean | null;
  points: number;
  module: string;
}

export type Answers = Record<string, number | boolean | string>;

/** Califica las cerradas con la clave guardada en el servidor. Las abiertas quedan para revisión manual. */
export function gradeClosed(questions: SnapshotQuestion[], answers: Answers) {
  let autoPoints = 0;
  let totalPoints = 0;
  let needsReview = false;
  for (const q of questions) {
    totalPoints += q.points;
    if (q.type === "short_answer") {
      if (typeof answers[q.id] === "string" && String(answers[q.id]).trim()) needsReview = true;
      continue;
    }
    if (answers[q.id] !== undefined && answers[q.id] === q.correctAnswer) autoPoints += q.points;
  }
  return { autoPoints, totalPoints, needsReview };
}

/** Puntaje 0-100 con los puntos automáticos y los asignados manualmente a las abiertas. */
export function scoreOf(
  autoPoints: number,
  manualPoints: Record<string, number>,
  totalPoints: number,
) {
  if (totalPoints === 0) return 0;
  const manual = Object.values(manualPoints).reduce((a, b) => a + b, 0);
  return Math.min(100, Math.round(((autoPoints + manual) / totalPoints) * 100));
}
