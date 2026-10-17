import {
  AnalysisFailed,
  WEIGHTS_VERSION,
  analyzeWithAI,
  defaultThresholds,
  evaluateKnockouts,
  resolveWeights,
  scoreWithRules,
  type AIProvider,
  type CandidateProfile,
  type KnockoutRule,
  type RiskFlag,
  type ScreeningOutcome,
  type Thresholds,
  type VacancyProfile,
  type Weights,
} from "@ats/ai";
import { withPlatform, withTenant, type Prisma, type PrismaClient, type Tx } from "@ats/db";
import { HttpError } from "../auth/plugin.js";

export interface AiConfig {
  provider: AIProvider | null;
  /** Tope global de análisis de IA por día y por mes (toda la plataforma). */
  globalDailyCap: number;
  globalMonthlyCap: number;
  /** Precio en micro-USD por millón de tokens, para estimar el costo de cada llamada. */
  priceInMicrosPerM: number;
  priceOutMicrosPerM: number;
  /** Fallos consecutivos del proveedor que abren el corte de circuito, y cuánto dura. */
  breakerThreshold: number;
  breakerCooldownMs: number;
  limits?: Parameters<typeof analyzeWithAI>[0]["limits"];
}
export const defaultAiConfig: AiConfig = {
  provider: null,
  globalDailyCap: 5000,
  globalMonthlyCap: 100000,
  priceInMicrosPerM: 0,
  priceOutMicrosPerM: 0,
  breakerThreshold: 5,
  breakerCooldownMs: 60_000,
};

export type ScreenResult =
  | { kind: "skipped"; reason: string }
  | { kind: "knocked_out"; reasons: string[] }
  | { kind: "failed"; reason: string }
  | {
      kind: "done";
      mode: "rules" | "ai";
      overall: number;
      recommendation: string;
      fallbackReason?: string;
    };

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
const startOfDay = () => new Date(new Date().setUTCHours(0, 0, 0, 0));
const startOfMonth = () =>
  new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

type AppWithAll = Prisma.ApplicationGetPayload<{ include: { candidate: true; documents: true } }>;
type VacancyWithSkills = Prisma.VacancyGetPayload<{ include: { skills: true } }>;

export function toCandidateProfile(a: AppWithAll): CandidateProfile {
  const c = a.candidate;
  return {
    fullName: c.fullName,
    email: c.email,
    phone: c.phone,
    location: c.location,
    educationLevel: c.educationLevel,
    yearsExperience: c.yearsExperience,
    skills: c.skills,
    languages: c.languages,
    preferredMode: c.preferredMode,
    portfolioUrl: c.portfolioUrl,
  };
}

export function toVacancyProfile(v: VacancyWithSkills): VacancyProfile {
  return {
    title: v.title,
    category: v.category,
    minYears: v.minYears,
    minEducation: v.minEducation,
    languages: v.languages,
    workMode: v.workMode,
    province: v.province,
    municipality: v.municipality,
    requiredSkills: v.skills.filter((s) => s.kind === "required").map((s) => s.name),
    desirableSkills: v.skills.filter((s) => s.kind === "desirable").map((s) => s.name),
    requirementsRequired: v.requirementsRequired,
    knockoutRules: (v.knockoutRules as KnockoutRule[] | null) ?? [],
  };
}

function scoringConfig(v: VacancyWithSkills): { weights: Weights; thresholds: Thresholds } {
  const o = (v.scoringOverrides ?? {}) as {
    weights?: Partial<Weights>;
    thresholds?: Partial<Thresholds>;
  };
  return {
    weights: resolveWeights(v.category, o.weights),
    thresholds: { ...defaultThresholds, ...(o.thresholds ?? {}) },
  };
}

export function createScreeningService(deps: {
  prisma: PrismaClient;
  ai: AiConfig;
  onAiUsage?: (tenantId: string) => Promise<unknown>;
}) {
  const { prisma, ai, onAiUsage } = deps;
  // Corte de circuito en memoria (por proceso). shortcut: con varias instancias se mueve a Redis.
  const breaker = { failures: 0, openUntil: 0 };

  async function aiBlockedReason(
    tx: Tx,
    tenant: { id: string; screeningMode: string; aiMonthlyQuota: number },
  ): Promise<string | null> {
    if (tenant.screeningMode !== "ai") return null; // no se pidió IA: no es un bloqueo
    if (!ai.provider) return "No hay un proveedor de IA configurado.";
    if (Date.now() < breaker.openUntil)
      return "Corte de circuito activo por fallos del proveedor de IA.";
    const used = await tx.usageCounter.findUnique({
      where: { tenantId_month: { tenantId: tenant.id, month: monthKey() } },
    });
    if ((used?.aiAnalyses ?? 0) >= tenant.aiMonthlyQuota)
      return "Cuota mensual de análisis de IA agotada.";
    return null;
  }

  /** El tope global se cuenta entre todos los tenants, por eso va por el camino de plataforma. */
  async function globalCapReached(): Promise<boolean> {
    return withPlatform(prisma, async (tx) => {
      const [day, month] = await Promise.all([
        tx.aiUsage.count({ where: { result: "ok", createdAt: { gte: startOfDay() } } }),
        tx.aiUsage.count({ where: { result: "ok", createdAt: { gte: startOfMonth() } } }),
      ]);
      return day >= ai.globalDailyCap || month >= ai.globalMonthlyCap;
    });
  }

  async function recordUsage(
    tx: Tx,
    tenantId: string,
    applicationId: string,
    result: string,
    extra?: {
      provider: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
    },
  ) {
    const e = extra ?? {
      provider: ai.provider?.name ?? "none",
      model: "-",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
    await tx.aiUsage.create({
      data: {
        tenantId,
        applicationId,
        result,
        ...e,
        costMicros: Math.round(
          (e.inputTokens * ai.priceInMicrosPerM + e.outputTokens * ai.priceOutMicrosPerM) /
            1_000_000,
        ),
      },
    });
  }

  async function saveResult(
    tx: Tx,
    args: {
      tenantId: string;
      applicationId: string;
      vacancyId: string;
      outcome: ScreeningOutcome;
      riskFlags: RiskFlag[];
      ai?: { provider: string; model: string; promptVersion: string; inputHash: string };
    },
  ) {
    const { outcome: o } = args;
    await tx.screeningResult.create({
      data: {
        tenantId: args.tenantId,
        applicationId: args.applicationId,
        vacancyId: args.vacancyId,
        mode: o.mode,
        overall: o.overall,
        recommendation: o.recommendation,
        dimensions: o.dimensions as unknown as Prisma.InputJsonValue,
        matched: o.matchedRequirements,
        missing: o.missingRequirements,
        reasons: o.reasons,
        riskFlags: args.riskFlags as unknown as Prisma.InputJsonValue,
        confidence: o.confidence,
        notes: o.notes,
        weightsVersion: WEIGHTS_VERSION,
        ...(args.ai ?? {}),
      },
    });
  }

  const autoMovable = new Set([
    "received",
    "screening",
    "shortlisted",
    "in_review",
    "low_fit",
    "knocked_out",
  ]);

  async function move(
    tx: Tx,
    a: { id: string; tenantId: string; status: string },
    to: "shortlisted" | "in_review" | "low_fit" | "knocked_out",
    reason: string,
    processing: "ready" | "failed",
  ) {
    await tx.application.update({ where: { id: a.id }, data: { status: to, processing } });
    if (a.status !== to)
      await tx.applicationStageHistory.create({
        data: {
          tenantId: a.tenantId,
          applicationId: a.id,
          fromStatus: a.status as never,
          toStatus: to,
          automatic: true,
          reason,
        },
      });
  }

  /**
   * Preselecciona una postulación (docs/03). Orden: filtros eliminatorios (código) -> modo (ai si el plan, la cuota y
   * los topes lo permiten; si no, rules) -> puntaje total y recomendación en código -> avance automático con historial.
   * Con `targetVacancyId` puntúa contra otra vacante (sugerencias de la bolsa) sin tocar el estado de la postulación.
   */
  async function screen(
    applicationId: string,
    tenantId: string,
    opts: { targetVacancyId?: string } = {},
  ): Promise<ScreenResult> {
    // 1) Lectura. Las llamadas a la IA ocurren fuera de transacciones largas.
    const loaded = await withTenant(prisma, tenantId, async (tx) => {
      const app = await tx.application.findFirst({
        where: { id: applicationId, tenantId },
        include: { candidate: true, documents: true },
      });
      if (!app) return null;
      const vacancyId = opts.targetVacancyId ?? app.vacancyId;
      const vacancy = vacancyId
        ? await tx.vacancy.findFirst({
            where: { id: vacancyId, tenantId },
            include: { skills: true },
          })
        : null;
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      const blocked = vacancy ? await aiBlockedReason(tx, tenant) : null;
      return { app, vacancy, tenant, blocked };
    });
    if (!loaded) throw new HttpError(404, "Postulación no encontrada");
    const { app, vacancy, tenant } = loaded;
    if (!vacancy)
      return {
        kind: "skipped",
        reason: "La postulación es de la bolsa general: no tiene vacante contra la cual puntuar.",
      };
    const own = !opts.targetVacancyId || opts.targetVacancyId === app.vacancyId;
    const candidate = toCandidateProfile(app);
    const vProfile = toVacancyProfile(vacancy);
    const { weights, thresholds } = scoringConfig(vacancy);
    const cvText = app.documents.find((d) => d.extractStatus === "ready")?.extractedText ?? "";

    // 2) Filtros eliminatorios: siempre con reglas.
    const knock = evaluateKnockouts(candidate, vProfile);
    if (knock.length) {
      await withTenant(prisma, tenantId, async (tx) => {
        await tx.screeningResult.create({
          data: {
            tenantId,
            applicationId,
            vacancyId: vacancy.id,
            mode: "rules",
            overall: null,
            recommendation: "knocked_out",
            knockoutReasons: knock,
            weightsVersion: WEIGHTS_VERSION,
          },
        });
        if (own && autoMovable.has(app.status))
          await move(
            tx,
            app,
            "knocked_out",
            `No cumple requisitos mínimos: ${knock.join(" ")}`,
            "ready",
          );
      });
      return { kind: "knocked_out", reasons: knock };
    }

    // 3) Elegir modo. Cualquier límite o falla cae a `rules` (cuota/tope) o a revisión manual (salida inválida).
    let blocked = loaded.blocked;
    if (tenant.screeningMode === "ai" && !blocked && (await globalCapReached()))
      blocked = "Tope global de IA alcanzado; la IA está en pausa para todos.";
    if (tenant.screeningMode === "ai" && !blocked && !cvText)
      blocked = "El CV no tiene texto legible para analizar con IA.";
    const useAi = tenant.screeningMode === "ai" && !blocked;

    let outcome: ScreeningOutcome;
    let riskFlags: RiskFlag[] = [];
    let aiMeta:
      { provider: string; model: string; promptVersion: string; inputHash: string } | undefined;
    let fallbackReason: string | undefined;

    if (useAi) {
      const t0 = Date.now();
      try {
        const r = await analyzeWithAI({
          provider: ai.provider!,
          cvText,
          candidate,
          vacancy: vProfile,
          weights,
          thresholds,
          limits: ai.limits,
        });
        breaker.failures = 0;
        outcome = r.outcome;
        riskFlags = r.riskFlags;
        aiMeta = {
          provider: r.provider,
          model: r.model,
          promptVersion: r.promptVersion,
          inputHash: r.inputHash,
        };
        await withTenant(prisma, tenantId, async (tx) => {
          await recordUsage(tx, tenantId, applicationId, "ok", {
            provider: r.provider,
            model: r.model,
            ...r.usage,
            latencyMs: Date.now() - t0,
          });
          await tx.usageCounter.upsert({
            where: { tenantId_month: { tenantId, month: monthKey() } },
            create: { tenantId, month: monthKey(), aiAnalyses: 1 },
            update: { aiAnalyses: { increment: 1 } },
          });
        });
        void onAiUsage?.(tenantId)?.catch?.(() => undefined);
      } catch (e) {
        const failure =
          e instanceof AnalysisFailed ? e : new AnalysisFailed("Fallo inesperado", "provider");
        if (failure.kind === "provider" && ++breaker.failures >= ai.breakerThreshold)
          breaker.openUntil = Date.now() + ai.breakerCooldownMs;
        const reason = `El análisis de IA falló (${failure.kind === "invalid_output" ? "salida inválida" : "proveedor no disponible"}): revisión manual.`;
        await withTenant(prisma, tenantId, async (tx) => {
          await recordUsage(
            tx,
            tenantId,
            applicationId,
            failure.kind === "invalid_output" ? "invalid_output" : "provider_error",
            {
              provider: ai.provider!.name,
              model: "-",
              inputTokens: 0,
              outputTokens: 0,
              latencyMs: Date.now() - t0,
            },
          );
          // Nunca se descarta por un fallo técnico: queda visible para RRHH.
          if (own) await move(tx, app, "in_review", reason, "failed");
        });
        return { kind: "failed", reason };
      }
    } else {
      if (blocked) fallbackReason = blocked;
      outcome = scoreWithRules(candidate, vProfile, weights, thresholds);
      if (blocked) {
        outcome.notes.push(`${blocked} Se usó el modo de reglas.`);
        await withTenant(prisma, tenantId, (tx) =>
          recordUsage(
            tx,
            tenantId,
            applicationId,
            blocked!.includes("Cuota") ? "skipped_quota" : "skipped_cap",
          ),
        );
      }
    }

    // 4) Guardar y aplicar el avance automático. Un CV con señales de manipulación nunca avanza solo.
    const flagged = riskFlags.length > 0;
    let target: "shortlisted" | "in_review" | "low_fit" =
      outcome.recommendation === "advance"
        ? "shortlisted"
        : outcome.recommendation === "review"
          ? "in_review"
          : "low_fit";
    if (flagged && target === "shortlisted") target = "in_review";
    const why = `Preselección en modo ${outcome.mode === "ai" ? "IA" : "reglas"}: puntaje ${outcome.overall}/100, recomendación "${outcome.recommendation}".${flagged ? " El CV contiene texto sospechoso: requiere revisión de una persona." : ""}`;
    await withTenant(prisma, tenantId, async (tx) => {
      await saveResult(tx, {
        tenantId,
        applicationId,
        vacancyId: vacancy.id,
        outcome,
        riskFlags,
        ai: aiMeta,
      });
      if (own && autoMovable.has(app.status)) await move(tx, app, target, why, "ready");
    });
    return {
      kind: "done",
      mode: outcome.mode,
      overall: outcome.overall,
      recommendation: outcome.recommendation,
      fallbackReason,
    };
  }

  /**
   * Bolsa de talento (docs/03 sección 9): prefiltro barato por SQL (skills, ubicación) y puntuación solo de los mejores N.
   * Devuelve sugerencias; no cambia estados ni contacta a nadie.
   */
  async function suggest(vacancyId: string, tenantId: string, limit = 20) {
    const vacancy = await withTenant(prisma, tenantId, (tx) =>
      tx.vacancy.findFirst({ where: { id: vacancyId, tenantId }, include: { skills: true } }),
    );
    if (!vacancy) throw new HttpError(404, "Vacante no encontrada");
    const wanted = vacancy.skills
      .filter((s) => s.kind === "required")
      .map((s) => s.name.toLowerCase());
    const candidates = await withTenant(
      prisma,
      tenantId,
      (tx) =>
        tx.$queryRaw<{ application_id: string }[]>`
        SELECT a.id AS application_id
        FROM applications a JOIN candidates c ON c.id = a.candidate_id
        WHERE a.tenant_id = ${tenantId}::uuid AND a.vacancy_id IS NULL AND a.status <> 'withdrawn'
        ORDER BY
          (SELECT count(*) FROM unnest(c.skills) s WHERE lower(s) = ANY(${wanted}::text[])) DESC,
          (lower(c.location) LIKE '%' || lower(${vacancy.province}) || '%') DESC,
          a.created_at DESC
        LIMIT ${Math.min(limit, 50)}`,
    );
    const rows = [];
    for (const { application_id } of candidates) {
      const cached = await withTenant(prisma, tenantId, (tx) =>
        tx.screeningResult.findFirst({
          where: { tenantId, applicationId: application_id, vacancyId },
          orderBy: { createdAt: "desc" },
        }),
      );
      if (!cached) await screen(application_id, tenantId, { targetVacancyId: vacancyId });
      const r =
        cached ??
        (await withTenant(prisma, tenantId, (tx) =>
          tx.screeningResult.findFirst({
            where: { tenantId, applicationId: application_id, vacancyId },
            orderBy: { createdAt: "desc" },
          }),
        ));
      const app = await withTenant(prisma, tenantId, (tx) =>
        tx.application.findFirst({ where: { id: application_id }, include: { candidate: true } }),
      );
      if (r && app && r.overall !== null)
        rows.push({
          applicationId: application_id,
          candidate: {
            fullName: app.candidate.fullName,
            location: app.candidate.location,
            yearsExperience: app.candidate.yearsExperience,
          },
          mode: r.mode,
          overall: r.overall,
          recommendation: r.recommendation,
          reasons: r.reasons as string[],
        });
    }
    return rows.sort((a, b) => b.overall - a.overall);
  }

  return { screen, suggest };
}
export type ScreeningService = ReturnType<typeof createScreeningService>;
