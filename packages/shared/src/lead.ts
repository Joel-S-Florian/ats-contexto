import { z } from "zod";

export const leadSizes = ["1-10", "11-50", "51-200", "201+"] as const;
export const leadStatuses = [
  "new",
  "contacted",
  "demo_scheduled",
  "converted",
  "discarded",
] as const;
export const leadStatusLabels = {
  new: "Nuevo",
  contacted: "Contactado",
  demo_scheduled: "Demo agendada",
  converted: "Convertido",
  discarded: "Descartado",
} as const;

/** Versión del aviso de privacidad de la landing que acepta quien solicita la demo. */
export const LEAD_CONSENT_VERSION = "landing-2026-10-v1";

/** Formulario de solicitud de demo (docs/01 sección 7). `website` es un señuelo para bots: debe llegar vacío. */
export const leadFormSchema = z.object({
  name: z.string().trim().min(2, "Escribe tu nombre").max(120),
  company: z.string().trim().min(2, "Escribe el nombre de tu empresa").max(160),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  size: z.enum(leadSizes, { message: "Selecciona el tamaño de tu empresa" }),
  message: z.string().trim().max(1000).default(""),
  consent: z.literal(true, { message: "Debes aceptar la política de privacidad" }),
  captchaToken: z.string().min(1, "Verificación requerida"),
  website: z.string().max(200).optional(),
});
export type LeadForm = z.infer<typeof leadFormSchema>;
