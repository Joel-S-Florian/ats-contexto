import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withTenant, type PrismaClient } from "@ats/db";
import { vacancyInputSchema, vacancyPatchSchema, vacancyStatuses } from "@ats/shared";
import { HttpError, requirePermission } from "../auth/plugin.js";
import {
  assertPublishable,
  assertTransition,
  resolvePipelineId,
  toInput,
  toVacancyDto,
  vacancyData,
  vacancyInclude,
  writeRelations,
} from "../services/vacancies.js";

const idParam = z.object({ id: z.string().uuid() });

export function vacancyRoutes(
  app: FastifyInstance,
  { prisma, authenticate }: { prisma: PrismaClient; authenticate: preHandlerAsyncHookHandler },
) {
  app.get("/vacancies", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "vacancies:read");
    const { status } = z.object({ status: z.enum(vacancyStatuses).optional() }).parse(req.query);
    return withTenant(prisma, tenantId, async (tx) => {
      const rows = await tx.vacancy.findMany({
        where: {
          tenantId,
          status,
          // El responsable de área solo ve las vacantes que tiene asignadas.
          ...(role === "area_manager"
            ? { OR: [{ ownerId: userId }, { evaluators: { some: { userId } } }] }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          department: true,
          status: true,
          workMode: true,
          province: true,
          level: true,
          openings: true,
          publishedAt: true,
          createdAt: true,
        },
      });
      return rows;
    });
  });

  app.get("/vacancies/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "vacancies:read");
    const { id } = idParam.parse(req.params);
    return withTenant(prisma, tenantId, async (tx) => {
      const v = await tx.vacancy.findFirst({ where: { id, tenantId }, include: vacancyInclude });
      const assigned = v && (v.ownerId === userId || v.evaluators.some((e) => e.userId === userId));
      if (!v || (role === "area_manager" && !assigned))
        throw new HttpError(404, "Vacante no encontrada");
      return toVacancyDto(v);
    });
  });

  app.post("/vacancies", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId, role } = requirePermission(req, "vacancies:write");
    const input = vacancyInputSchema.parse(req.body);
    if (input.autoSelect && role !== "admin")
      throw new HttpError(403, "Solo un administrador puede activar la selección automática.");
    const created = await withTenant(prisma, tenantId, async (tx) => {
      const pipelineId = await resolvePipelineId(tx, tenantId, input.pipelineId);
      const v = await tx.vacancy.create({ data: { ...vacancyData(input), tenantId, pipelineId } });
      await writeRelations(tx, tenantId, v.id, input);
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "vacancy.created", target: v.id },
      });
      return toVacancyDto(
        await tx.vacancy.findUniqueOrThrow({ where: { id: v.id }, include: vacancyInclude }),
      );
    });
    reply.code(201).send(created);
  });

  app.patch("/vacancies/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "vacancies:write");
    const { id } = idParam.parse(req.params);
    const patch = vacancyPatchSchema.parse(req.body);
    return withTenant(prisma, tenantId, async (tx) => {
      const current = await tx.vacancy.findFirst({
        where: { id, tenantId },
        include: vacancyInclude,
      });
      if (!current) throw new HttpError(404, "Vacante no encontrada");
      if (current.status === "closed")
        throw new HttpError(409, "Una vacante cerrada no se puede editar.");
      // El estado cambia solo por /status; se ignora aqui para no saltarse las reglas de transicion.
      const { status: _ignored, ...fields } = patch;
      const input = vacancyInputSchema.parse({ ...toInput(toVacancyDto(current)), ...fields });
      if (input.autoSelect !== current.autoSelect && role !== "admin")
        throw new HttpError(403, "Solo un administrador puede cambiar la selección automática.");
      const pipelineId = await resolvePipelineId(tx, tenantId, input.pipelineId);
      if (current.status === "published")
        await assertPublishable(
          tx,
          {
            pipelineId,
            requirementsRequired: input.requirementsRequired,
            closesAt: input.closesAt ?? null,
          },
          input.requiredSkills.length,
        );
      await tx.vacancy.update({ where: { id }, data: { ...vacancyData(input), pipelineId } });
      await writeRelations(tx, tenantId, id, input);
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "vacancy.updated", target: id },
      });
      return toVacancyDto(
        await tx.vacancy.findUniqueOrThrow({ where: { id }, include: vacancyInclude }),
      );
    });
  });

  app.post("/vacancies/:id/status", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "vacancies:write");
    const { id } = idParam.parse(req.params);
    const { status } = z.object({ status: z.enum(vacancyStatuses) }).parse(req.body);
    return withTenant(prisma, tenantId, async (tx) => {
      const v = await tx.vacancy.findFirst({ where: { id, tenantId }, include: { skills: true } });
      if (!v) throw new HttpError(404, "Vacante no encontrada");
      assertTransition(v.status, status);
      if (status === "published")
        await assertPublishable(tx, v, v.skills.filter((s) => s.kind === "required").length);
      await tx.vacancy.update({
        where: { id },
        data: {
          status,
          publishedAt: status === "published" ? (v.publishedAt ?? new Date()) : v.publishedAt,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: "vacancy.status_changed",
          target: `${id}:${status}`,
        },
      });
      return { id, status };
    });
  });
}
