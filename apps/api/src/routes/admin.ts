import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withPlatform, withTenant, type PrismaClient, type Tx } from "@ats/db";
import { planKeys, plans } from "@ats/shared";
import { newToken, sha256 } from "../auth/crypto.js";
import { HttpError, requirePermission, requireSuperAdmin } from "../auth/plugin.js";
import type { PlanService } from "../services/plans.js";
import type { Mailer } from "../mailer.js";

const role = z.enum(["admin", "recruiter", "area_manager"]);
const email = z.string().email().toLowerCase();
const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export interface AdminDeps {
  planSvc: PlanService;
  prisma: PrismaClient;
  mailer: Mailer;
  webOrigin: string;
  authenticate: preHandlerAsyncHookHandler;
}

async function invite(
  tx: Tx,
  mailer: Mailer,
  webOrigin: string,
  tenantId: string,
  actorId: string,
  to: string,
  r: z.infer<typeof role>,
) {
  const token = newToken();
  await tx.invitation.create({
    data: {
      tenantId,
      email: to,
      role: r,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  await tx.auditLog.create({ data: { tenantId, actorId, action: "user.invited", target: r } });
  await mailer.send(to, "Invitación a la plataforma", `${webOrigin}/invitacion?token=${token}`);
}

export function adminRoutes(
  app: FastifyInstance,
  { prisma, mailer, webOrigin, authenticate, planSvc }: AdminDeps,
) {
  // --- Super administrador: camino de plataforma, siempre auditado ---
  app.post(
    "/admin/tenants",
    { preHandler: [authenticate, requireSuperAdmin] },
    async (req, reply) => {
      const body = z
        .object({
          name: z.string().min(1).max(120),
          slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
          adminEmail: email,
          planKey: z.enum(planKeys).default("essential"),
        })
        .parse(req.body);
      const plan = plans[body.planKey];
      const tenant = await withPlatform(prisma, async (tx) => {
        if (await tx.tenant.findUnique({ where: { slug: body.slug } }))
          throw new HttpError(409, "El identificador ya existe");
        const t = await tx.tenant.create({
          data: {
            name: body.name,
            slug: body.slug,
            planKey: body.planKey,
            screeningMode: plan.features.ai ? "ai" : "rules",
            aiMonthlyQuota: plan.limits.aiAnalysesPerMonth,
          },
        });
        await tx.subscription.create({
          data: { tenantId: t.id, planKey: body.planKey, assignedBy: req.auth!.userId },
        });
        await tx.auditLog.create({
          data: { tenantId: t.id, actorId: req.auth!.userId, action: "tenant.created" },
        });
        await invite(tx, mailer, webOrigin, t.id, req.auth!.userId, body.adminEmail, "admin");
        return t;
      });
      reply.code(201).send({ id: tenant.id, name: tenant.name, slug: tenant.slug });
    },
  );

  app.get("/admin/tenants", { preHandler: [authenticate, requireSuperAdmin] }, () =>
    withPlatform(prisma, (tx) =>
      tx.tenant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          screeningMode: true,
          aiMonthlyQuota: true,
          planKey: true,
        },
        orderBy: { createdAt: "desc" },
      }),
    ),
  );

  // Plan de IA de un tenant (asignacion manual hasta la Fase 9): modo de preseleccion y cuota mensual de analisis.
  app.patch(
    "/admin/tenants/:id/screening",
    { preHandler: [authenticate, requireSuperAdmin] },
    async (req) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = z
        .object({
          mode: z.enum(["rules", "ai"]),
          aiMonthlyQuota: z.number().int().min(0).max(1_000_000),
        })
        .parse(req.body);
      return withPlatform(prisma, async (tx) => {
        const current = await tx.tenant.findUnique({ where: { id } });
        if (!current) throw new HttpError(404, "Empresa no encontrada");
        if (body.mode === "ai" && !plans[current.planKey].features.ai)
          throw new HttpError(
            409,
            "El plan de esta empresa no incluye IA. Asigna primero un plan con IA.",
            "plan_feature",
          );
        const t = await tx.tenant.update({
          where: { id },
          data: { screeningMode: body.mode, aiMonthlyQuota: body.aiMonthlyQuota },
        });
        await tx.auditLog.create({
          data: {
            tenantId: id,
            actorId: req.auth!.userId,
            action: "tenant.screening_updated",
            target: `${body.mode}:${body.aiMonthlyQuota}`,
          },
        });
        return { id: t.id, mode: t.screeningMode, aiMonthlyQuota: t.aiMonthlyQuota };
      });
    },
  );

  // --- Administrador del tenant ---
  app.get("/users", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "users:manage");
    return withTenant(prisma, tenantId, async (tx) => {
      const ms = await tx.membership.findMany({
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      return ms.map((m) => ({ ...m.user, role: m.role }));
    });
  });

  app.post("/users/invitations", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "users:manage");
    const body = z.object({ email, role }).parse(req.body);
    await withTenant(prisma, tenantId, async (tx) => {
      await planSvc.assertCanAddUser(tx, tenantId);
      await invite(tx, mailer, webOrigin, tenantId, userId, body.email, body.role);
    });
    void planSvc.checkAlerts(tenantId).catch(() => undefined);
    reply.code(201).send();
  });

  app.patch("/users/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "users:manage");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z.object({ role }).parse(req.body);
    return withTenant(prisma, tenantId, async (tx) => {
      const m = await tx.membership.findFirst({ where: { tenantId, userId: id } });
      if (!m) throw new HttpError(404, "Usuario no encontrado");
      if (
        m.role === "admin" &&
        body.role !== "admin" &&
        (await tx.membership.count({ where: { tenantId, role: "admin" } })) < 2
      )
        throw new HttpError(409, "Debe quedar al menos un administrador");
      await tx.membership.update({ where: { id: m.id }, data: { role: body.role } });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "user.role_changed", target: body.role },
      });
      return { id, role: body.role };
    });
  });

  app.delete("/users/:id", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "users:manage");
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await withTenant(prisma, tenantId, async (tx) => {
      const m = await tx.membership.findFirst({ where: { tenantId, userId: id } });
      if (!m) throw new HttpError(404, "Usuario no encontrado");
      if (
        m.role === "admin" &&
        (await tx.membership.count({ where: { tenantId, role: "admin" } })) < 2
      )
        throw new HttpError(409, "Debe quedar al menos un administrador");
      await tx.membership.delete({ where: { id: m.id } });
      await tx.auditLog.create({ data: { tenantId, actorId: userId, action: "user.removed" } });
    });
    reply.code(204).send();
  });
}
