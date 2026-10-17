import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withTenant, type PrismaClient } from "@ats/db";
import {
  renderTemplate,
  sampleVariables,
  templateKeys,
  templateLabels,
  type TemplateKey,
} from "@ats/shared";
import { HttpError, requirePermission } from "../auth/plugin.js";
import type { CalendarProvider } from "../ports/calendar.js";
import { formatDate, formatTime, loadTemplate, type EmailService } from "../services/email.js";
import { buildIcs } from "../services/ics.js";
import { visibleApplication } from "./candidates.js";

type Deps = {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  email: EmailService;
  calendar: CalendarProvider;
};
const idParam = z.object({ id: z.string().uuid() });
const keySchema = z.enum(templateKeys);

const interviewSchema = z
  .object({
    scheduledAt: z.coerce.date(),
    durationMin: z.number().int().min(15).max(480).default(45),
    mode: z.enum(["onsite", "virtual"]),
    location: z.string().trim().max(200).optional(),
    meetingUrl: z
      .string()
      .trim()
      .url()
      .max(300)
      .refine((u) => u.startsWith("https://"), "El enlace debe usar https")
      .optional(),
    platform: z.string().trim().max(60).optional(),
    participantIds: z.array(z.string().uuid()).max(10).default([]),
    messageToCandidate: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.scheduledAt.getTime() > Date.now(), {
    message: "La fecha de la entrevista debe ser futura",
    path: ["scheduledAt"],
  })
  .refine((v) => v.mode !== "onsite" || Boolean(v.location), {
    message: "Indica el lugar de la entrevista presencial",
    path: ["location"],
  });

export function communicationRoutes(
  app: FastifyInstance,
  { prisma, authenticate, email, calendar }: Deps,
) {
  // ---------- Plantillas de correo ----------
  app.get("/email-templates", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "templates:read");
    return withTenant(prisma, tenantId, async (tx) =>
      Promise.all(
        templateKeys.map(async (key) => {
          const t = await loadTemplate(tx, tenantId, key);
          return {
            key,
            name: templateLabels[key],
            subject: t.subject,
            body: t.body,
            enabled: t.enabled,
            custom: "id" in t,
          };
        }),
      ),
    );
  });

  app.put("/email-templates/:key", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "templates:manage");
    const key = keySchema.parse((req.params as { key: string }).key);
    const body = z
      .object({
        subject: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(5000),
        enabled: z.boolean().default(true),
      })
      .parse(req.body);
    const unknown = renderTemplate(body, {}).unknown;
    if (unknown.length)
      throw new HttpError(
        422,
        `Variables desconocidas: ${unknown.map((u) => `{{${u}}}`).join(", ")}`,
      );
    return withTenant(prisma, tenantId, async (tx) => {
      const t = await tx.emailTemplate.upsert({
        where: { tenantId_key: { tenantId, key } },
        create: { tenantId, key, name: templateLabels[key], ...body },
        update: body,
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "email_template.updated", target: key },
      });
      return { key, subject: t.subject, body: t.body, enabled: t.enabled };
    });
  });

  app.delete("/email-templates/:key", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "templates:manage");
    const key = keySchema.parse((req.params as { key: string }).key);
    await withTenant(prisma, tenantId, async (tx) => {
      await tx.emailTemplate.deleteMany({ where: { tenantId, key } });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "email_template.reset", target: key },
      });
    });
    reply.code(204).send();
  });

  // Vista previa con datos de ejemplo (nunca con datos reales de candidatos).
  app.post("/email-templates/preview", { preHandler: authenticate }, async (req) => {
    requirePermission(req, "templates:read");
    const body = z
      .object({ subject: z.string().max(200), body: z.string().max(5000) })
      .parse(req.body);
    return renderTemplate(body, sampleVariables);
  });

  // ---------- Envío manual de una plantilla, registro y comunicaciones ----------
  app.post("/applications/:id/email", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "interviews:manage");
    const { id } = idParam.parse(req.params);
    const { key } = z
      .object({ key: z.enum(["rejection", "application_received"]) })
      .parse(req.body);
    await withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
    });
    const result = await email.send({ tenantId, applicationId: id, key: key as TemplateKey });
    return { result };
  });

  app.get("/applications/:id/emails", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "candidates:read");
    const { id } = idParam.parse(req.params);
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      return tx.emailLog.findMany({
        where: { applicationId: id, tenantId },
        orderBy: { createdAt: "desc" },
        select: { id: true, templateKey: true, subject: true, status: true, createdAt: true },
      });
    });
  });

  app.post("/applications/:id/communications", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId, role } = requirePermission(req, "interviews:manage");
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        type: z.enum(["call", "message", "other"]),
        summary: z.string().trim().min(1).max(1000),
      })
      .parse(req.body);
    await withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      await tx.communication.create({
        data: { tenantId, applicationId: id, authorId: userId, ...body },
      });
    });
    reply.code(201).send();
  });

  app.get("/applications/:id/communications", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "candidates:read");
    const { id } = idParam.parse(req.params);
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      const rows = await tx.communication.findMany({
        where: { applicationId: id, tenantId },
        orderBy: { createdAt: "desc" },
      });
      const authors = await tx.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.authorId))] } },
        select: { id: true, name: true },
      });
      const name = new Map(authors.map((a) => [a.id, a.name]));
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        summary: r.summary,
        createdAt: r.createdAt,
        author: name.get(r.authorId) ?? "Usuario",
      }));
    });
  });

  // ---------- Configuración de aviso de rechazo ----------
  app.get("/settings/notifications", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "users:manage");
    return withTenant(prisma, tenantId, async (tx) => {
      const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      return { rejectionNotice: t.rejectionNotice, rejectionDelayHours: t.rejectionDelayHours };
    });
  });

  app.patch("/settings/notifications", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "users:manage");
    const body = z
      .object({
        rejectionNotice: z.enum(["manual", "auto_delay", "none"]),
        rejectionDelayHours: z.number().int().min(1).max(720).default(24),
      })
      .parse(req.body);
    return withTenant(prisma, tenantId, async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: body });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: "settings.notifications_updated",
          target: body.rejectionNotice,
        },
      });
      return body;
    });
  });

  // ---------- Entrevistas ----------
  const modeLabel = { onsite: "Presencial", virtual: "Virtual" } as const;

  async function inviteEmail(
    tenantId: string,
    i: {
      id: string;
      applicationId: string;
      scheduledAt: Date;
      durationMin: number;
      mode: "onsite" | "virtual";
      location: string | null;
      meetingUrl: string | null;
      platform: string | null;
      messageToCandidate: string | null;
    },
    cancel = false,
  ) {
    const info = await withTenant(prisma, tenantId, async (tx) => {
      const a = await tx.application.findFirstOrThrow({ where: { id: i.applicationId, tenantId } });
      const v = a.vacancyId ? await tx.vacancy.findFirst({ where: { id: a.vacancyId } }) : null;
      const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      return { title: v?.title ?? "Entrevista", company: t.name };
    });
    const where = i.mode === "virtual" ? (i.meetingUrl ?? "") : (i.location ?? "");
    const ics = buildIcs({
      uid: `${i.id}@ats`,
      start: i.scheduledAt,
      end: new Date(i.scheduledAt.getTime() + i.durationMin * 60_000),
      summary: `Entrevista - ${info.title} (${info.company})`,
      description: i.messageToCandidate ?? "",
      location: where,
      url: i.mode === "virtual" ? (i.meetingUrl ?? undefined) : undefined,
      cancel,
    });
    return email.send({
      tenantId,
      applicationId: i.applicationId,
      key: cancel ? "interview_cancelled" : "interview_invitation",
      vars: {
        fecha: formatDate(i.scheduledAt),
        hora: formatTime(i.scheduledAt),
        modalidad: modeLabel[i.mode],
        lugar: where,
        plataforma: i.platform ?? "",
        mensaje: i.messageToCandidate ?? "",
      },
      mail: {
        attachments: [
          {
            filename: "entrevista.ics",
            content: ics,
            contentType: `text/calendar; charset=utf-8; method=${cancel ? "CANCEL" : "REQUEST"}`,
          },
        ],
      },
    });
  }

  app.post("/applications/:id/interviews", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId, role } = requirePermission(req, "interviews:manage");
    const { id } = idParam.parse(req.params);
    const body = interviewSchema.parse(req.body);

    const ctx = await withTenant(prisma, tenantId, async (tx) => {
      const a = await visibleApplication(tx, tenantId, id, role, userId);
      if (!a) throw new HttpError(404, "Postulación no encontrada");
      if (body.participantIds.length) {
        const n = await tx.membership.count({
          where: { tenantId, userId: { in: body.participantIds } },
        });
        if (n !== new Set(body.participantIds).size)
          throw new HttpError(422, "Hay participantes que no pertenecen a la empresa.");
      }
      let title = "Entrevista";
      if (a.vacancyId) {
        const v = await tx.vacancy.findFirstOrThrow({ where: { id: a.vacancyId } });
        title = v.title;
        const active = await tx.pipelineStage.count({
          where: { pipelineId: v.pipelineId, type: "interview", enabled: true },
        });
        if (!active)
          throw new HttpError(
            422,
            'La etapa "Entrevista" no está activa en el embudo de esta vacante.',
          );
      }
      const candidate = await tx.candidate.findFirstOrThrow({ where: { id: a.candidateId } });
      return { a, title, candidateEmail: candidate.email };
    });

    // Calendario fuera de la transacción: es una llamada externa.
    let meetingUrl = body.meetingUrl;
    let eventId = "";
    {
      try {
        const ev = await calendar.createEvent({
          title: `Entrevista - ${ctx.title}`,
          description: body.messageToCandidate ?? "",
          start: body.scheduledAt,
          end: new Date(body.scheduledAt.getTime() + body.durationMin * 60_000),
          location: body.mode === "onsite" ? body.location : meetingUrl,
          attendees: [ctx.candidateEmail],
          wantsMeetingLink: body.mode === "virtual" && !meetingUrl,
        });
        eventId = ev.eventId;
        meetingUrl = meetingUrl ?? ev.meetingUrl;
      } catch {
        // Un calendario caído no debe impedir agendar: el candidato igual recibe el .ics.
      }
    }
    if (body.mode === "virtual" && !meetingUrl)
      throw new HttpError(
        422,
        "Agrega el enlace de la reunión virtual (no hay calendario conectado para generarlo).",
      );

    const interview = await withTenant(prisma, tenantId, async (tx) => {
      const i = await tx.interview.create({
        data: {
          tenantId,
          applicationId: id,
          scheduledAt: body.scheduledAt,
          durationMin: body.durationMin,
          mode: body.mode,
          location: body.location,
          meetingUrl,
          platform: body.platform,
          participantIds: body.participantIds,
          messageToCandidate: body.messageToCandidate,
          calendarEventId: eventId || null,
          createdBy: userId,
        },
      });
      if (["received", "screening", "shortlisted", "in_review"].includes(ctx.a.status)) {
        await tx.application.update({ where: { id }, data: { status: "interview" } });
        await tx.applicationStageHistory.create({
          data: {
            tenantId,
            applicationId: id,
            fromStatus: ctx.a.status,
            toStatus: "interview",
            actorId: userId,
            automatic: false,
            reason: "Entrevista agendada.",
          },
        });
      }
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "interview.scheduled", target: i.id },
      });
      return i;
    });
    const emailed = await inviteEmail(tenantId, interview);
    reply.code(201).send({ id: interview.id, meetingUrl: interview.meetingUrl, emailed });
  });

  app.get("/applications/:id/interviews", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "candidates:read");
    const { id } = idParam.parse(req.params);
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      return tx.interview.findMany({
        where: { applicationId: id, tenantId },
        orderBy: { scheduledAt: "asc" },
      });
    });
  });

  app.post("/interviews/:id/cancel", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "interviews:manage");
    const { id } = idParam.parse(req.params);
    const i = await withTenant(prisma, tenantId, async (tx) => {
      const row = await tx.interview.findFirst({ where: { id, tenantId } });
      if (!row) throw new HttpError(404, "Entrevista no encontrada");
      if (!(await visibleApplication(tx, tenantId, row.applicationId, role, userId)))
        throw new HttpError(404, "Entrevista no encontrada");
      if (row.status !== "scheduled")
        throw new HttpError(409, "La entrevista ya no está programada.");
      const u = await tx.interview.update({ where: { id }, data: { status: "cancelled" } });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "interview.cancelled", target: id },
      });
      return u;
    });
    if (i.calendarEventId) await calendar.cancelEvent(i.calendarEventId).catch(() => undefined);
    const emailed = await inviteEmail(tenantId, i, true);
    return { id, status: "cancelled", emailed };
  });
}
