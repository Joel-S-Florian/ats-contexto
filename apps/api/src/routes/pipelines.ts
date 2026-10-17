import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withTenant, type PrismaClient } from "@ats/db";
import { defaultStages, pipelineInputSchema, validateStages } from "@ats/shared";
import { HttpError, requirePermission } from "../auth/plugin.js";
import type { PlanService } from "../services/plans.js";
import { createPipeline, ensureDefaultPipeline, pipelineSelect } from "../services/pipelines.js";

const idParam = z.object({ id: z.string().uuid() });

function assertValid(stages: Parameters<typeof validateStages>[0]) {
  const problems = validateStages(stages);
  if (problems.length) throw new HttpError(422, problems.join(" "));
}

export function pipelineRoutes(
  app: FastifyInstance,
  {
    prisma,
    authenticate,
    planSvc,
  }: { prisma: PrismaClient; authenticate: preHandlerAsyncHookHandler; planSvc: PlanService },
) {
  app.get("/pipelines", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "vacancies:read");
    return withTenant(prisma, tenantId, async (tx) => {
      await ensureDefaultPipeline(tx, tenantId);
      return tx.pipeline.findMany({
        select: pipelineSelect,
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      });
    });
  });

  app.post("/pipelines", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "pipelines:manage");
    const body = pipelineInputSchema.parse(req.body);
    assertValid(body.stages);
    await withTenant(prisma, tenantId, async (tx) => {
      await planSvc.assertFeature(tx, tenantId, (plan) => {
        if (plan.features.pipelines === "fixed")
          return "Tu plan usa la plantilla de embudo fija: puedes activar o desactivar etapas, pero no crear otro embudo.";
        return null;
      });
      const { plan } = await planSvc.planOf(tx, tenantId);
      if (
        plan.features.pipelines === "configurable" &&
        (await tx.pipeline.count({ where: { tenantId } })) >= 1
      )
        throw new HttpError(
          403,
          "Tu plan incluye un embudo configurable. El plan Empresa permite varias plantillas.",
          "plan_feature",
        );
    });
    const created = await withTenant(prisma, tenantId, async (tx) => {
      const p = await createPipeline(tx, tenantId, body.name, body.stages);
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "pipeline.created", target: p.id },
      });
      return tx.pipeline.findUniqueOrThrow({ where: { id: p.id }, select: pipelineSelect });
    });
    reply.code(201).send(created);
  });

  // Reemplaza las etapas completas (orden, activacion y reglas). shortcut: sin migrar postulaciones existentes (Fase 3+).
  app.put("/pipelines/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "pipelines:manage");
    const { id } = idParam.parse(req.params);
    const body = pipelineInputSchema.parse(req.body);
    assertValid(body.stages);
    await withTenant(prisma, tenantId, async (tx) => {
      const { plan } = await planSvc.planOf(tx, tenantId);
      const same =
        body.stages.length === defaultStages.length &&
        body.stages.every((s, i) => s.type === defaultStages[i]!.type);
      if (plan.features.pipelines === "fixed" && !same)
        throw new HttpError(
          403,
          "Tu plan usa la plantilla fija: solo puedes activar o desactivar etapas y cambiar sus nombres.",
          "plan_feature",
        );
    });
    return withTenant(prisma, tenantId, async (tx) => {
      const current = await tx.pipeline.findFirst({ where: { id, tenantId } });
      if (!current) throw new HttpError(404, "Embudo no encontrado");
      await tx.pipelineStage.deleteMany({ where: { pipelineId: id } });
      await tx.pipeline.update({
        where: { id },
        data: {
          name: body.name,
          stages: {
            create: body.stages.map((s, position) => ({
              tenantId,
              position,
              name: s.name,
              type: s.type,
              enabled: s.enabled,
              config: s.config as object,
              transition: s.transition,
            })),
          },
        },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "pipeline.updated", target: id },
      });
      return tx.pipeline.findUniqueOrThrow({ where: { id }, select: pipelineSelect });
    });
  });

  app.post("/pipelines/:id/default", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "pipelines:manage");
    const { id } = idParam.parse(req.params);
    await withTenant(prisma, tenantId, async (tx) => {
      if (!(await tx.pipeline.findFirst({ where: { id, tenantId } })))
        throw new HttpError(404, "Embudo no encontrado");
      await tx.pipeline.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
      await tx.pipeline.update({ where: { id }, data: { isDefault: true } });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "pipeline.default_set", target: id },
      });
    });
    reply.code(204).send();
  });
}
