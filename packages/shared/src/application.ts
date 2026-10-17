import { z } from "zod";
import { workModes } from "./vacancy";

/** Versión del aviso de tratamiento de datos que ve el candidato (docs/04 sección 8.1). Se versiona en la Fase 9. */
export const NOTICE_VERSION = "2026-10-v1";
export const noticeText = {
  version: NOTICE_VERSION,
  title: "Aviso de tratamiento de datos",
  body: [
    "La empresa que publica esta vacante es la responsable de tus datos; la plataforma de reclutamiento los procesa en su nombre.",
    "Usaremos tu información únicamente para evaluar tu postulación.",
    "Tus datos y tu CV podrán ser procesados con herramientas automatizadas, incluidas herramientas de inteligencia artificial. Una persona revisa las decisiones.",
    "Conservaremos tus datos por un máximo de 12 meses desde tu última actividad, salvo que la empresa indique otro plazo.",
    "Puedes solicitar acceso, rectificación o eliminación de tus datos escribiendo a la empresa.",
  ],
};

import { educationLevels } from "./labels";
export { educationLevels, MAX_CV_BYTES } from "./labels";

const text = (max: number) => z.string().trim().max(max);
const list = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30),
  );

/** Campos del formulario de postulación (docs/01-producto.md 4.3), tal como llegan en multipart. */
export const applicationFormSchema = z.object({
  vacancyId: z.string().uuid().optional(),
  fullName: text(160).min(3, "Escribe tu nombre completo"),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(200),
  phone: text(40).min(7, "Teléfono inválido"),
  location: text(120).min(2, "Indica tu ubicación"),
  educationLevel: z.enum(educationLevels, { message: "Selecciona tu nivel educativo" }),
  yearsExperience: z.coerce.number().int().min(0).max(60),
  skills: list.pipe(z.array(text(60)).min(1, "Agrega al menos una skill")),
  languages: list,
  preferredMode: z.enum(workModes).optional(),
  availability: text(120).optional(),
  portfolioUrl: z
    .string()
    .trim()
    .url("Enlace inválido")
    .max(300)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  consent: z.literal("true", { message: "Debes aceptar el aviso de tratamiento de datos" }),
  noticeVersion: z.string().min(1),
  captchaToken: z.string().min(1, "Verificación requerida"),
});
export type ApplicationForm = z.infer<typeof applicationFormSchema>;

export const publicStatusLabels: Record<string, string> = {
  received: "Recibida",
  in_review: "En revisión",
  finished: "Proceso finalizado",
};
