// Sin dependencias (ni zod): lo usa el widget, cuyo bundle debe ser ligero.
/** Etiquetas en español para el panel, la landing y el widget. */
export const labels = {
  status: { draft: "Borrador", published: "Publicada", paused: "Pausada", closed: "Cerrada" },
  category: {
    general: "General",
    technical: "Técnico / TI",
    operational: "Operativo / Servicio",
    administrative: "Administrativo",
    managerial: "Gerencial",
    junior: "Pasantía / Junior",
  },
  level: {
    internship: "Pasantía",
    junior: "Junior",
    semi_senior: "Semi-senior",
    senior: "Senior",
    managerial: "Gerencial",
  },
  employmentType: {
    full_time: "Tiempo completo",
    part_time: "Medio tiempo",
    contract: "Contrato",
    temporary: "Temporal",
    internship: "Pasantía",
  },
  workMode: { onsite: "Presencial", hybrid: "Híbrido", remote: "Remoto" },
} as const;

export const educationLevels = [
  "Secundaria",
  "Técnico",
  "Grado universitario",
  "Postgrado",
  "Maestría",
  "Doctorado",
] as const;

export const MAX_CV_BYTES = 5 * 1024 * 1024;
