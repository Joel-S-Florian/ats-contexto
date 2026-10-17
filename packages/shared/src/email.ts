// Plantillas de correo por defecto (español, República Dominicana) y variables disponibles.
export const templateKeys = [
  "application_received",
  "interview_invitation",
  "interview_cancelled",
  "assessment_invite",
  "rejection",
  "hired",
] as const;
export type TemplateKey = (typeof templateKeys)[number];

export const templateVariables = [
  "nombre",
  "vacante",
  "empresa",
  "fecha",
  "hora",
  "modalidad",
  "lugar",
  "enlace",
  "plataforma",
  "mensaje",
  "codigo",
] as const;
export type TemplateVariable = (typeof templateVariables)[number];

export const templateLabels: Record<TemplateKey, string> = {
  application_received: "Postulación recibida",
  interview_invitation: "Invitación a entrevista",
  interview_cancelled: "Entrevista cancelada",
  assessment_invite: "Invitación a evaluación",
  rejection: "Aviso de no selección",
  hired: "Bienvenida al contratado",
};

export const defaultTemplates: Record<TemplateKey, { subject: string; body: string }> = {
  application_received: {
    subject: "Recibimos tu postulación a {{vacante}}",
    body: "Hola {{nombre}},\n\nRecibimos tu postulación a {{vacante}} en {{empresa}}. Nuestro equipo revisará tu perfil y te contactaremos si avanzas en el proceso.\n\nTu código de seguimiento es: {{codigo}}\n\nGracias por tu interés.\n{{empresa}}",
  },
  interview_invitation: {
    subject: "Entrevista para {{vacante}} - {{fecha}}",
    body: "Hola {{nombre}},\n\nTe invitamos a una entrevista para {{vacante}} en {{empresa}}.\n\nFecha: {{fecha}}\nHora: {{hora}}\nModalidad: {{modalidad}}\nLugar o enlace: {{lugar}}\n{{mensaje}}\n\nAdjuntamos una invitación de calendario. Si no puedes asistir, responde este correo para reprogramar.\n\n{{empresa}}",
  },
  interview_cancelled: {
    subject: "Entrevista cancelada - {{vacante}}",
    body: "Hola {{nombre}},\n\nLa entrevista para {{vacante}} programada el {{fecha}} a las {{hora}} fue cancelada. Te escribiremos para coordinar una nueva fecha.\n\n{{empresa}}",
  },
  assessment_invite: {
    subject: "Evaluación para {{vacante}}",
    body: "Hola {{nombre}},\n\nComo parte del proceso para {{vacante}} en {{empresa}}, te pedimos completar una evaluación.\n\nAccede con este enlace personal (de un solo uso y con vencimiento): {{enlace}}\n\n{{mensaje}}\n\nMucho éxito.\n{{empresa}}",
  },
  rejection: {
    subject: "Sobre tu postulación a {{vacante}}",
    body: "Hola {{nombre}},\n\nGracias por postularte a {{vacante}} en {{empresa}} y por el tiempo que dedicaste al proceso. En esta ocasión decidimos continuar con otros perfiles.\n\nConservaremos tu información para futuras oportunidades. Te deseamos mucho éxito.\n\n{{empresa}}",
  },
  hired: {
    subject: "¡Bienvenido/a a {{empresa}}!",
    body: "Hola {{nombre}},\n\nNos alegra confirmarte que fuiste seleccionado/a para {{vacante}} en {{empresa}}. Pronto nos pondremos en contacto con los siguientes pasos.\n\n{{mensaje}}\n\n{{empresa}}",
  },
};

/** Valores de ejemplo para la vista previa. */
export const sampleVariables: Record<TemplateVariable, string> = {
  nombre: "María",
  vacante: "Desarrollador Backend",
  empresa: "Empresa Demo",
  fecha: "viernes, 24 de octubre de 2026",
  hora: "10:00 a. m.",
  modalidad: "Virtual",
  lugar: "https://meet.example.com/abc-defg-hij",
  enlace: "https://empresa.example.com/examen/xxxxx",
  plataforma: "Google Meet",
  mensaje: "Trae tu cédula.",
  codigo: "PLh5ohcqETRGqWwnE3TjBw",
};

export interface RenderResult {
  subject: string;
  text: string;
  html: string;
  unknown: string[];
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/**
 * Sustituye {{variables}}. Solo se reemplazan las conocidas; el resto se deja tal cual y se reporta en `unknown`.
 * En el HTML cada valor se escapa: el nombre o el mensaje de una persona nunca se interpreta como marcado.
 */
export function renderTemplate(
  tpl: { subject: string; body: string },
  vars: Partial<Record<TemplateVariable, string>>,
): RenderResult {
  const unknown = new Set<string>();
  const fill = (s: string, escape: boolean) =>
    s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name: string) => {
      if (!(templateVariables as readonly string[]).includes(name)) {
        unknown.add(name);
        return m;
      }
      const v = vars[name as TemplateVariable] ?? "";
      return escape ? esc(v) : v;
    });
  const text = fill(tpl.body, false)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const html = fill(esc(tpl.body).replace(/&#39;/g, "'"), true)
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return {
    subject: fill(tpl.subject, false).replace(/[\r\n]+/g, " "),
    text,
    html,
    unknown: [...unknown],
  };
}
