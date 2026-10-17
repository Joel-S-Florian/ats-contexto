import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withTenant, type PrismaClient, type Tx } from "@ats/db";
import {
  discardStatuses,
  moveInputSchema,
  noteInputSchema,
  statusLabels,
  statusStage,
  type ApplicationStatus,
} from "@ats/shared";
import { HttpError, requirePermission } from "../auth/plugin.js";
import type { BlobStore } from "../ports/storage.js";
import type { NotificationService } from "../services/notifications.js";
import { signClaim, verifyClaim } from "../services/signed.js";

type Deps = {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  store: BlobStore;
  secret: string;
  notifications: NotificationService;
};
const idParam = z.object({ id: z.string().uuid() });
export const FILE_URL_TTL_MS = 60_000;

/** Postulaciones que la persona puede ver: el responsable de área, solo las de vacantes asignadas. */
export async function visibleApplication(
  tx: Tx,
  tenantId: string,
  id: string,
  role: string | undefined,
  userId: string,
) {
  const a = await tx.application.findFirst({ where: { id, tenantId } });
  if (!a) return null;
  if (role !== "area_manager") return a;
  if (!a.vacancyId) return null;
  const mine = await tx.vacancy.findFirst({
    where: {
      id: a.vacancyId,
      tenantId,
      OR: [{ ownerId: userId }, { evaluators: { some: { userId } } }],
    },
    select: { id: true },
  });
  return mine ? a : null;
}

export function candidateRoutes(
  app: FastifyInstance,
  { prisma, authenticate, store, secret, notifications }: Deps,
) {
  // Mover manualmente: RRHH puede llevar a cualquier persona a cualquier etapa; cada cambio queda en el historial.
  app.post("/applications/:id/move", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "applications:move");
    const { id } = idParam.parse(req.params);
    const body = moveInputSchema.parse(req.body);
    if (discardStatuses.includes(body.status) && (body.reason ?? "").length < 3)
      throw new HttpError(422, "Escribe el motivo del descarte.");
    return withTenant(prisma, tenantId, async (tx) => {
      const a = await visibleApplication(tx, tenantId, id, role, userId);
      if (!a) throw new HttpError(404, "Postulación no encontrada");
      if (a.status === "hired") throw new HttpError(409, "La postulación ya está contratada.");
      if (a.status === body.status) return { id, status: a.status };
      const stage = statusStage[body.status];
      if (a.vacancyId && stage && stage !== "screening") {
        const v = await tx.vacancy.findFirst({
          where: { id: a.vacancyId },
          select: { pipelineId: true },
        });
        const active =
          v &&
          (await tx.pipelineStage.count({
            where: { pipelineId: v.pipelineId, type: stage, enabled: true },
          }));
        if (!active)
          throw new HttpError(
            422,
            `La etapa "${statusLabels[body.status]}" no está activa en el embudo de esta vacante.`,
          );
      }
      await tx.application.update({ where: { id }, data: { status: body.status } });
      if (body.status === "not_selected") await notifications.onNotSelected(tx, tenantId, id);
      else if (a.status === "not_selected") await notifications.cancelPending(tx, tenantId, id);
      await tx.applicationStageHistory.create({
        data: {
          tenantId,
          applicationId: id,
          fromStatus: a.status,
          toStatus: body.status,
          actorId: userId,
          automatic: false,
          reason: body.reason || `Movida manualmente a "${statusLabels[body.status]}".`,
        },
      });
      return { id, status: body.status };
    });
  });

  // Revertir un descarte (automático o manual): vuelve a revisión, con registro de quién y por qué.
  app.post("/applications/:id/revert", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "applications:move");
    const { id } = idParam.parse(req.params);
    const { reason } = z
      .object({ reason: z.string().trim().max(500).optional() })
      .parse(req.body ?? {});
    return withTenant(prisma, tenantId, async (tx) => {
      const a = await visibleApplication(tx, tenantId, id, role, userId);
      if (!a) throw new HttpError(404, "Postulación no encontrada");
      if (!discardStatuses.includes(a.status as ApplicationStatus))
        throw new HttpError(409, "La postulación no está descartada.");
      await tx.application.update({ where: { id }, data: { status: "in_review" } });
      await notifications.cancelPending(tx, tenantId, id); // si el aviso de rechazo estaba programado, ya no corresponde
      await tx.applicationStageHistory.create({
        data: {
          tenantId,
          applicationId: id,
          fromStatus: a.status,
          toStatus: "in_review",
          actorId: userId,
          automatic: false,
          reason: `Descarte revertido${reason ? `: ${reason}` : "."}`,
        },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "application.discard_reverted", target: id },
      });
      return { id, status: "in_review" };
    });
  });

  app.get("/applications/:id/notes", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "candidates:read");
    const { id } = idParam.parse(req.params);
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      const notes = await tx.applicationNote.findMany({
        where: { applicationId: id, tenantId },
        orderBy: { createdAt: "desc" },
      });
      const authors = await tx.user.findMany({
        where: { id: { in: [...new Set(notes.map((n) => n.authorId))] } },
        select: { id: true, name: true },
      });
      const name = new Map(authors.map((a) => [a.id, a.name]));
      return notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt,
        author: name.get(n.authorId) ?? "Usuario",
      }));
    });
  });

  app.post("/applications/:id/notes", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId, role } = requirePermission(req, "notes:write");
    const { id } = idParam.parse(req.params);
    const { body } = noteInputSchema.parse(req.body);
    const note = await withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      return tx.applicationNote.create({
        data: { tenantId, applicationId: id, authorId: userId, body },
      });
    });
    reply.code(201).send({ id: note.id });
  });

  // URL firmada de corta duración para el CV; generarla queda en el registro de auditoría (docs/04 sección 5).
  app.get("/applications/:id/documents/:docId/url", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "candidates:read");
    const { id, docId } = z
      .object({ id: z.string().uuid(), docId: z.string().uuid() })
      .parse(req.params);
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      const doc = await tx.document.findFirst({
        where: { id: docId, applicationId: id, tenantId },
      });
      if (!doc) throw new HttpError(404, "Documento no encontrado");
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "document.accessed", target: docId },
      });
      const token = signClaim(
        { doc: doc.id, tenant: tenantId, exp: Date.now() + FILE_URL_TTL_MS },
        secret,
      );
      return { url: `/files/${token}`, expiresInSeconds: FILE_URL_TTL_MS / 1000 };
    });
  });

  // El token ya autoriza (tenant + documento + vencimiento). El archivo se sirve como descarga, nunca se interpreta en el navegador.
  app.get("/files/:token", async (req, reply) => {
    const { token } = z.object({ token: z.string().max(600) }).parse(req.params);
    const claim = verifyClaim(token, secret);
    if (!claim) throw new HttpError(403, "El enlace venció o no es válido");
    const doc = await withTenant(prisma, claim.tenant, (tx) =>
      tx.document.findFirst({ where: { id: claim.doc, tenantId: claim.tenant } }),
    );
    if (!doc) throw new HttpError(404, "Documento no encontrado");
    const ext = doc.mimeType.includes("pdf") ? "pdf" : "docx";
    reply
      .header("content-type", doc.mimeType)
      .header("content-disposition", `attachment; filename="cv-${doc.id.slice(0, 8)}.${ext}"`)
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "private, no-store")
      .send(await store.get(doc.storageKey));
  });
}
