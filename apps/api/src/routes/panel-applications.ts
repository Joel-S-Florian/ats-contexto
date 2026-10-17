import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withTenant, type PrismaClient, type Tx } from "@ats/db";
import { HttpError, requirePermission } from "../auth/plugin.js";
import { newPublicKey, normalizeOrigin } from "../services/keys.js";

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

export function panelApplicationRoutes(app: FastifyInstance, { prisma, authenticate }: Deps) {
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
      return rows.map((r) => ({
        ...r,
        vacancyTitle: r.vacancyId ? (title.get(r.vacancyId) ?? null) : null,
      }));
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
      return { ...a, vacancy };
    });
  });
}
