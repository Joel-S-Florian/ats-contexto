// Fuente única de planes, límites y precios (docs/05). La usan la API (límites reales), el panel (uso) y la landing (precios).
// Las cifras son una propuesta de partida y deben validarse antes de publicarse (docs/05 sección 7).

export const planKeys = ["essential", "professional", "enterprise"] as const;
export type PlanKey = (typeof planKeys)[number];

/** `null` = ilimitado. */
export interface PlanLimits {
  activeVacancies: number | null;
  applicationsPerMonth: number;
  users: number;
  aiAnalysesPerMonth: number;
}

export interface Plan {
  key: PlanKey;
  name: string;
  audience: string;
  priceUsd: number;
  limits: PlanLimits;
  features: {
    ai: boolean;
    talentPool: "tags" | "ai";
    pipelines: "fixed" | "configurable" | "multiple";
    assessmentTemplates: number | null;
    webhooks: "none" | "single" | "multiple";
    reports: "basic" | "advanced";
    support: "email" | "priority";
  };
  highlights: string[];
}

export const plans: Record<PlanKey, Plan> = {
  essential: {
    key: "essential",
    name: "Esencial",
    audience: "Pymes pequeñas",
    priceUsd: 25,
    limits: { activeVacancies: 3, applicationsPerMonth: 100, users: 2, aiAnalysesPerMonth: 0 },
    features: {
      ai: false,
      talentPool: "tags",
      pipelines: "fixed",
      assessmentTemplates: 1,
      webhooks: "none",
      reports: "basic",
      support: "email",
    },
    highlights: [
      "Widget para tu página de empleo",
      "Preselección por reglas, sin IA",
      "Entrevistas, agenda y correos",
      "1 examen generalista",
      "Exportación de contratados (JSON y CSV)",
    ],
  },
  professional: {
    key: "professional",
    name: "Profesional",
    audience: "Pymes en crecimiento",
    priceUsd: 79,
    limits: { activeVacancies: 15, applicationsPerMonth: 500, users: 5, aiAnalysesPerMonth: 300 },
    features: {
      ai: true,
      talentPool: "ai",
      pipelines: "configurable",
      assessmentTemplates: null,
      webhooks: "single",
      reports: "basic",
      support: "email",
    },
    highlights: [
      "Preselección con IA y justificación",
      "300 análisis de IA al mes",
      "Sugerencias de la bolsa de talento",
      "Embudo configurable",
      "Webhook de contratados",
    ],
  },
  enterprise: {
    key: "enterprise",
    name: "Empresa",
    audience: "Empresas grandes",
    priceUsd: 199,
    limits: {
      activeVacancies: null,
      applicationsPerMonth: 2000,
      users: 15,
      aiAnalysesPerMonth: 1500,
    },
    features: {
      ai: true,
      talentPool: "ai",
      pipelines: "multiple",
      assessmentTemplates: null,
      webhooks: "multiple",
      reports: "advanced",
      support: "priority",
    },
    highlights: [
      "Vacantes activas ilimitadas",
      "1,500 análisis de IA al mes",
      "Varias plantillas de embudo",
      "Webhooks a múltiples destinos",
      "Reportes avanzados y soporte prioritario",
    ],
  },
};

export const limitLabels = {
  activeVacancies: "Vacantes activas",
  applicationsPerMonth: "Postulaciones del mes",
  users: "Usuarios",
  aiAnalysesPerMonth: "Análisis de IA del mes",
} as const;
export type LimitKey = keyof PlanLimits;

/** Aviso al administrador cuando el consumo llega a este porcentaje (docs/05 sección 5). */
export const ALERT_THRESHOLD = 80;

/** Referencia USD -> DOP solo para mostrar; el cobro real depende de la pasarela (pendiente). */
export const USD_TO_DOP_REFERENCE = 60;
