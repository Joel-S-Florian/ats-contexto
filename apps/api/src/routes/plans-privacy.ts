import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withPlatform, withTenant, type PrismaClient } from "@ats/db";
import { planKeys, plans } from "@ats/shared";
import { HttpError, requirePermission, requireSuperAdmin } from "../auth/plugin.js";
import type { PlanService } from "../services/plans.js";
import type { PrivacyService } from "../services/privacy.js";
import type { NoticeService } from "../services/notice.js";

type Deps = {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  planSvc: PlanService;
  privacy: PrivacyService;
  notice: NoticeService;
};
const idParam = z.object({ id: z.string().uuid() });

export function plansPrivacyRoutes(
  app: FastifyInstance,
  { prisma, authenticate, planSvc, privacy, notice }: Deps,
) {
  // ------------------------------------------------------------------ uso y planes
  app.get("/usage", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "users:manage");
    return withTenant(prisma, tenantId, async (tx) => {
      const u = await planSvc.usage(tx, tenantId);
      const sub = await tx.subscription.findUnique({ where: { tenantId } });
      return {
        plan: { key: u.plan.key, name: u.plan.name, priceUsd: u.plan.priceUsd },
        status: sub?.status ?? "active",
        items: u.items,
        period: new Date().toISOString().slice(0, 7),
      };
    });
  });

  app.get("/admin/usage", { preHandler: [authenticate, requireSuperAdmin] }, () =>
    planSvc.allTenantsUsage(),
  );

  // Asignación manual del plan (la pasarela de pago está pendiente). Ajusta el modo de preselección y la cuota de IA al plan.
  app.patch(
    "/admin/tenants/:id/plan",
    { preHandler: [authenticate, requireSuperAdmin] },
    async (req) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          planKey: z.enum(planKeys),
          status: z.enum(["active", "past_due", "canceled"]).default("active"),
          extraAiAnalyses: z.number().int().min(0).max(1_000_000).default(0),
          notes: z.string().trim().max(500).default(""),
        })
        .parse(req.body);
      const plan = plans[body.planKey];
      return withPlatform(prisma, async (tx) => {
        if (!(await tx.tenant.findUnique({ where: { id } })))
          throw new HttpError(404, "Empresa no encontrada");
        const extra = plan.features.ai ? body.extraAiAnalyses : 0;
        await tx.subscription.upsert({
          where: { tenantId: id },
          create: {
            tenantId: id,
            planKey: body.planKey,
            status: body.status,
            extraAiAnalyses: extra,
            notes: body.notes,
            assignedBy: req.auth!.userId,
          },
          update: {
            planKey: body.planKey,
            status: body.status,
            extraAiAnalyses: extra,
            notes: body.notes,
            assignedBy: req.auth!.userId,
          },
        });
        await tx.tenant.update({
          where: { id },
          data: {
            planKey: body.planKey,
            screeningMode: plan.features.ai ? "ai" : "rules",
            aiMonthlyQuota: plan.limits.aiAnalysesPerMonth + extra,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: id,
            actorId: req.auth!.userId,
            action: "tenant.plan_assigned",
            target: `${body.planKey}:${body.status}`,
          },
        });
        return {
          id,
          planKey: body.planKey,
          status: body.status,
          aiMonthlyQuota: plan.limits.aiAnalysesPerMonth + extra,
        };
      });
    },
  );

  // ------------------------------------------------------------------ privacidad
  app.get("/settings/privacy", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "users:manage");
    return withTenant(prisma, tenantId, async (tx) => ({
      retentionMonths: (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }))
        .retentionMonths,
    }));
  });

  app.patch("/settings/privacy", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "users:manage");
    const body = z.object({ retentionMonths: z.number().int().min(1).max(60) }).parse(req.body);
    return withTenant(prisma, tenantId, async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: body });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: "settings.retention_updated",
          target: String(body.retentionMonths),
        },
      });
      return body;
    });
  });

  app.get("/candidates/:id/export", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "candidates:export");
    const { id } = idParam.parse(req.params);
    const data = await withTenant(prisma, tenantId, async (tx) => {
      const out = await privacy.exportCandidate(tx, tenantId, id);
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "candidate.exported", target: id },
      });
      return out;
    });
    return reply
      .header("content-disposition", `attachment; filename="datos-${id.slice(0, 8)}.json"`)
      .send(data);
  });

  app.delete("/candidates/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "candidates:erase");
    const { id } = idParam.parse(req.params);
    return privacy.erase(tenantId, id, userId);
  });

  // Tarea de retención a demanda (también corre sola cada día).
  app.post("/admin/retention/run", { preHandler: [authenticate, requireSuperAdmin] }, () =>
    privacy.processRetention(),
  );

  // ------------------------------------------------------------------ aviso de tratamiento de datos
  app.get("/admin/notice-versions", { preHandler: [authenticate, requireSuperAdmin] }, async () => {
    const rows = await prisma.noticeVersion.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return {
      current: await notice.current(),
      versions: rows.map((r) => ({
        label: r.label,
        title: r.title,
        body: r.body,
        createdAt: r.createdAt,
      })),
    };
  });

  app.post(
    "/admin/notice-versions",
    { preHandler: [authenticate, requireSuperAdmin] },
    async (req, reply) => {
      const body = z
        .object({
          title: z.string().trim().min(3).max(120),
          body: z.array(z.string().trim().min(3).max(1000)).min(1).max(12),
        })
        .parse(req.body);
      const count = await prisma.noticeVersion.count();
      const label = `${new Date().toISOString().slice(0, 7)}-v${count + 2}`; // la versión base del código es la v1
      const row = await prisma.noticeVersion.create({
        data: { label, title: body.title, body: body.body, createdBy: req.auth!.userId },
      });
      reply.code(201).send({ label: row.label });
    },
  );
}
