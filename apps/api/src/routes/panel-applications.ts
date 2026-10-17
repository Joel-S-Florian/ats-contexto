import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withTenant, type PrismaClient, type Tx } from "@ats/db";
import { HttpError, requirePermission } from "../auth/plugin.js";
import { newPublicKey, normalizeOrigin } from "../services/keys.js";
import type { ScreeningService } from "../services/screening.js";

type Deps = { prisma: PrismaClient; authenticate: preHandlerAsyncHookHandler };
const idParam = z.object({ id: z.string().uuid() });

export function apiKeyRoutes(app: FastifyInstance, { prisma, authenticate }: Deps) {
  const origins = z
    .array(z.string())
    .max(20)
    .transform((l) => [...new Set(l.map(normalizeOrigin))]);
  const select = {
    id: true,
    label: true,
    kind: true,
    publicKey: true,
    allowedOrigins: true,
    revokedAt: true,
    createdAt: true,
  } as const;

  app.get("/api-keys", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "users:manage");
    return withTenant(prisma, tenantId, (tx) =>
      tx.apiKey.findMany({ where: { tenantId }, select, orderBy: { createdAt: "desc" } }),
    );
  });

  app.post("/api-keys", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "users:manage");
    const body = z
      .object({ label: z.string().trim().min(1).max(80), allowedOrigins: origins })
      .parse(req.body);
    const key = await withTenant(prisma, tenantId, async (tx) => {
      const k = await tx.apiKey.create({
        data: {
          tenantId,
          kind: "public",
          label: body.label,
          publicKey: newPublicKey(),
          allowedOrigins: body.allowedOrigins,
        },
        select,
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "api_key.created", target: k.id },
      });
      return k;
    });
    reply.code(201).send(key);
  });

  app.patch("/api-keys/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "users:manage");
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        label: z.string().trim().min(1).max(80).optional(),
        allowedOrigins: origins.optional(),
      })
      .parse(req.body);
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await tx.apiKey.findFirst({ where: { id, tenantId } })))
        throw new HttpError(404, "Clave no encontrada");
      const k = await tx.apiKey.update({ where: { id }, data: body, select });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "api_key.updated", target: id },
      });
      return k;
    });
  });

  app.delete("/api-keys/:id", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "users:manage");
    const { id } = idParam.parse(req.params);
    await withTenant(prisma, tenantId, async (tx) => {
      if (!(await tx.apiKey.findFirst({ where: { id, tenantId } })))
        throw new HttpError(404, "Clave no encontrada");
      await tx.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "api_key.revoked", target: id },
      });
    });
    reply.code(204).send();
  });
}

export function panelApplicationRoutes(
  app: FastifyInstance,
  { prisma, authenticate, screening }: Deps & { screening: ScreeningService },
) {
  // El responsable de área solo ve postulaciones a vacantes que tiene asignadas; la bolsa general no le corresponde.
  const scopeFor = async (tx: Tx, tenantId: string, role: string | undefined, userId: string) => {
    if (role !== "area_manager") return {};
    const mine = await tx.vacancy.findMany({
      where: { tenantId, OR: [{ ownerId: userId }, { evaluators: { some: { userId } } }] },
      select: { id: true },
    });
    return { vacancyId: { in: mine.map((v) => v.id) } };
  };

  app.get("/applications", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "candidates:read");
    const q = z
      .object({
        vacancyId: z.string().uuid().optional(),
        scope: z.enum(["vacancy", "general"]).optional(),
      })
      .parse(req.query);
    return withTenant(prisma, tenantId, async (tx) => {
      const scope = await scopeFor(tx, tenantId, role, userId);
      const rows = await tx.application.findMany({
        where: {
          tenantId,
          ...(q.vacancyId ? { vacancyId: q.vacancyId } : {}),
          ...(q.scope === "general"
            ? { vacancyId: null }
            : q.scope === "vacancy"
              ? { vacancyId: { not: null } }
              : {}),
          ...scope,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          status: true,
          processing: true,
          createdAt: true,
          vacancyId: true,
          candidate: {
            select: { fullName: true, email: true, location: true, yearsExperience: true },
          },
        },
      });
      const vacancies = await tx.vacancy.findMany({
        where: { id: { in: rows.flatMap((r) => (r.vacancyId ? [r.vacancyId] : [])) } },
        select: { id: true, title: true },
      });
      const title = new Map(vacancies.map((v) => [v.id, v.title]));
      const results = await tx.screeningResult.findMany({
        where: { applicationId: { in: rows.map((r) => r.id) } },
        orderBy: { createdAt: "desc" },
        select: {
          applicationId: true,
          vacancyId: true,
          overall: true,
          recommendation: true,
          mode: true,
        },
      });
      const latest = new Map<string, (typeof results)[number]>();
      for (const s of results) if (!latest.has(s.applicationId)) latest.set(s.applicationId, s);
      return rows.map((r) => {
        const s = latest.get(r.id);
        return {
          ...r,
          vacancyTitle: r.vacancyId ? (title.get(r.vacancyId) ?? null) : null,
          screening: s
            ? { overall: s.overall, recommendation: s.recommendation, mode: s.mode }
            : null,
        };
      });
    });
  });

  // Re-ejecuta la preselección (por ejemplo tras cambiar pesos o el modo del tenant).
  app.post("/applications/:id/screen", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "vacancies:write");
    const { id } = idParam.parse(req.params);
    const result = await screening.screen(id, tenantId);
    await withTenant(prisma, tenantId, (tx) =>
      tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "application.rescreened", target: id },
      }),
    );
    return result;
  });

  // Bolsa de talento: candidatos de postulaciones generales afines a una vacante (prefiltro SQL + puntaje de los mejores N).
  app.get("/vacancies/:id/suggestions", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "vacancies:write");
    const { id } = idParam.parse(req.params);
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
      .parse(req.query);
    return screening.suggest(id, tenantId, limit);
  });

  // Consumo de IA del mes frente a la cuota del tenant.
  app.get("/screening/usage", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "users:manage");
    return withTenant(prisma, tenantId, async (tx) => {
      const month = new Date().toISOString().slice(0, 7);
      const [tenant, counter] = await Promise.all([
        tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
        tx.usageCounter.findUnique({ where: { tenantId_month: { tenantId, month } } }),
      ]);
      return {
        mode: tenant.screeningMode,
        quota: tenant.aiMonthlyQuota,
        used: counter?.aiAnalyses ?? 0,
        month,
      };
    });
  });

  app.get("/applications/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "candidates:read");
    const { id } = idParam.parse(req.params);
    return withTenant(prisma, tenantId, async (tx) => {
      const scope = await scopeFor(tx, tenantId, role, userId);
      const a = await tx.application.findFirst({
        where: { id, tenantId, ...scope },
        include: {
          candidate: true,
          documents: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              extractStatus: true,
              extractedText: true,
            },
          },
          history: { orderBy: { createdAt: "asc" } },
          consents: { select: { noticeVersion: true, acceptedAt: true } },
        },
      });
      if (!a) throw new HttpError(404, "Postulación no encontrada");
      // Ver datos personales y texto del CV queda registrado (docs/04 8.4).
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "application.viewed", target: id },
      });
      const vacancy = a.vacancyId
        ? await tx.vacancy.findFirst({
            where: { id: a.vacancyId },
            select: { id: true, title: true },
          })
        : null;
      // Último resultado contra la vacante de la postulación, con el "por qué" de cada dimensión.
      const screeningRow = a.vacancyId
        ? await tx.screeningResult.findFirst({
            where: { applicationId: id, vacancyId: a.vacancyId },
            orderBy: { createdAt: "desc" },
          })
        : null;
      return { ...a, vacancy, screening: screeningRow };
    });
  });
}
