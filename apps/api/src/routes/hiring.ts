import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withTenant, type PrismaClient } from "@ats/db";
import { HttpError, requirePermission } from "../auth/plugin.js";
import { encryptSecret, newWebhookSecret } from "../services/secrets.js";
import type { SelectionService } from "../services/selection.js";
import { UnsafeUrlError, assertSafeUrl, type SsrfOptions } from "../services/ssrf.js";
import type { WebhookService } from "../services/webhooks.js";
import type { NotificationService } from "../services/notifications.js";
import { visibleApplication } from "./candidates.js";

type Deps = {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  selection: SelectionService;
  webhooks: WebhookService;
  notifications: NotificationService;
  appSecret: string;
  ssrf: SsrfOptions;
};
const idParam = z.object({ id: z.string().uuid() });
const EVENTS = ["candidate.hired"] as const;

/** Neutraliza fórmulas de hoja de cálculo (=, +, -, @) en campos controlados por candidatos al exportar CSV. */
// BOM para que Excel abra el CSV en UTF-8 (tildes y eñes). Se arma con el código para que no se pierda al editar.
const BOM = String.fromCharCode(0xfeff);

export const csvCell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function hiringRoutes(
  app: FastifyInstance,
  { prisma, authenticate, selection, webhooks, notifications, appSecret, ssrf }: Deps,
) {
  // ------------------------------------------------------------------ selección
  app.post(
    "/applications/:id/selection/comments",
    { preHandler: authenticate },
    async (req, reply) => {
      const { tenantId, userId, role } = requirePermission(req, "notes:write");
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          stance: z.enum(["favor", "against", "neutral"]),
          body: z.string().trim().min(1).max(1000),
        })
        .parse(req.body);
      await withTenant(prisma, tenantId, async (tx) => {
        if (!(await visibleApplication(tx, tenantId, id, role, userId)))
          throw new HttpError(404, "Postulación no encontrada");
        await tx.selectionComment.create({
          data: { tenantId, applicationId: id, authorId: userId, ...body },
        });
      });
      reply.code(201).send();
    },
  );

  app.get("/applications/:id/selection", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "candidates:read");
    const { id } = idParam.parse(req.params);
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      const [comments, decisions, hire] = await Promise.all([
        tx.selectionComment.findMany({
          where: { applicationId: id, tenantId },
          orderBy: { createdAt: "asc" },
        }),
        tx.selectionDecision.findMany({
          where: { applicationId: id, tenantId },
          orderBy: { createdAt: "desc" },
        }),
        tx.hire.findFirst({ where: { applicationId: id, tenantId } }),
      ]);
      const ids = [
        ...new Set([
          ...comments.map((c) => c.authorId),
          ...decisions.flatMap((d) => (d.decidedBy ? [d.decidedBy] : [])),
        ]),
      ];
      const name = new Map(
        (
          await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
        ).map((u) => [u.id, u.name]),
      );
      return {
        comments: comments.map((c) => ({
          id: c.id,
          stance: c.stance,
          body: c.body,
          author: name.get(c.authorId) ?? "Usuario",
          createdAt: c.createdAt,
        })),
        decisions: decisions.map((d) => ({
          id: d.id,
          decision: d.decision,
          automatic: d.automatic,
          reason: d.reason,
          author: d.decidedBy ? (name.get(d.decidedBy) ?? "Usuario") : null,
          createdAt: d.createdAt,
        })),
        hire: hire && {
          id: hire.id,
          hiredAt: hire.hiredAt,
          startDate: hire.startDate,
          automatic: hire.automatic,
        },
      };
    });
  });

  app.post("/applications/:id/selection", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId, role } = requirePermission(req, "selection:decide");
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        decision: z.enum(["selected", "not_selected", "on_hold"]),
        reason: z.string().trim().max(500).default(""),
      })
      .parse(req.body);
    if (body.decision === "not_selected" && body.reason.length < 3)
      throw new HttpError(422, "Escribe el motivo de no selección.");
    return withTenant(prisma, tenantId, async (tx) => {
      const a = await visibleApplication(tx, tenantId, id, role, userId);
      if (!a) throw new HttpError(404, "Postulación no encontrada");
      if (a.status === "hired") throw new HttpError(409, "La postulación ya está contratada.");
      await selection.decide(tx, {
        tenantId,
        applicationId: id,
        status: a.status,
        decision: body.decision,
        reason: body.reason || "Decisión de selección.",
        actorId: userId,
        automatic: false,
      });
      if (body.decision === "not_selected") await notifications.onNotSelected(tx, tenantId, id);
      else if (a.status === "not_selected") await notifications.cancelPending(tx, tenantId, id);
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: "selection.decided",
          target: `${id}:${body.decision}`,
        },
      });
      return { id, status: body.decision };
    });
  });

  // ------------------------------------------------------------------ contratación
  app.post("/applications/:id/hire", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId, role } = requirePermission(req, "hiring:confirm");
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        confirm: z.literal(true, { message: "Confirma la contratación explícitamente" }),
        startDate: z.coerce.date().optional(),
      })
      .parse(req.body);
    const hireId = await withTenant(prisma, tenantId, async (tx) => {
      if (!(await visibleApplication(tx, tenantId, id, role, userId)))
        throw new HttpError(404, "Postulación no encontrada");
      const h = await selection.hire(tx, {
        tenantId,
        applicationId: id,
        actorId: userId,
        automatic: false,
        startDate: body.startDate,
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "hire.confirmed", target: id },
      });
      return h;
    });
    // El correo y el webhook salen enseguida; si fallan, los reintentos los gestiona su propio procesador.
    await notifications.processDue();
    await webhooks.processDue();
    reply.code(201).send({ hireId });
  });

  app.get("/hires", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "hires:export");
    const q = z
      .object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() })
      .parse(req.query);
    return withTenant(prisma, tenantId, (tx) =>
      tx.hire.findMany({
        where: { tenantId, hiredAt: { gte: q.from, lte: q.to } },
        orderBy: { hiredAt: "desc" },
        take: 1000,
        select: { id: true, hiredAt: true, startDate: true, automatic: true, payload: true },
      }),
    );
  });

  // Exportación manual en JSON o CSV; queda en auditoría.
  app.get("/hires/export", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "hires:export");
    const q = z
      .object({
        format: z.enum(["json", "csv"]).default("json"),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
      .parse(req.query);
    const rows = await withTenant(prisma, tenantId, async (tx) => {
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "hires.exported", target: q.format },
      });
      return tx.hire.findMany({
        where: { tenantId, hiredAt: { gte: q.from, lte: q.to } },
        orderBy: { hiredAt: "desc" },
        take: 5000,
      });
    });
    const data = rows.map(
      (r) =>
        r.payload as {
          hire_id: string;
          hired_at: string;
          start_date: string | null;
          internal_reference: string;
          candidate: { full_name: string; email: string; phone: string };
          position: {
            title: string | null;
            department: string | null;
            employment_type: string | null;
            work_mode: string | null;
            location: string | null;
          };
        },
    );
    if (q.format === "json") {
      return reply
        .header("content-disposition", 'attachment; filename="contratados.json"')
        .send({ schema_version: "1.0", exported_at: new Date().toISOString(), hires: data });
    }
    const cols = [
      "hire_id",
      "hired_at",
      "start_date",
      "full_name",
      "email",
      "phone",
      "position",
      "department",
      "employment_type",
      "work_mode",
      "location",
      "internal_reference",
    ];
    const lines = data.map((d) =>
      [
        d.hire_id,
        d.hired_at,
        d.start_date,
        d.candidate.full_name,
        d.candidate.email,
        d.candidate.phone,
        d.position.title,
        d.position.department,
        d.position.employment_type,
        d.position.work_mode,
        d.position.location,
        d.internal_reference,
      ]
        .map(csvCell)
        .join(","),
    );
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="contratados.csv"')
      .send(`${BOM}${cols.join(",")}\r\n${lines.join("\r\n")}\r\n`);
  });

  // ------------------------------------------------------------------ ajustes de contratación
  app.get("/settings/hiring", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "users:manage");
    return withTenant(prisma, tenantId, async (tx) => ({
      autoConfirmHire: (await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }))
        .autoConfirmHire,
    }));
  });
  app.patch("/settings/hiring", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "users:manage");
    const body = z.object({ autoConfirmHire: z.boolean() }).parse(req.body);
    return withTenant(prisma, tenantId, async (tx) => {
      await tx.tenant.update({ where: { id: tenantId }, data: body });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          action: "settings.hiring_updated",
          target: String(body.autoConfirmHire),
        },
      });
      return body;
    });
  });

  // ------------------------------------------------------------------ API de contratados: endpoints de webhook
  const safeUrl = async (url: string) => {
    try {
      return (await assertSafeUrl(url, ssrf)).toString();
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new HttpError(422, e.message);
      throw e;
    }
  };
  const view = (e: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
    createdAt: Date;
    rotatedAt: Date | null;
  }) => ({
    id: e.id,
    url: e.url,
    events: e.events,
    active: e.active,
    createdAt: e.createdAt,
    rotatedAt: e.rotatedAt,
  });

  app.get("/webhook-endpoints", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "integrations:manage");
    return withTenant(prisma, tenantId, async (tx) =>
      (
        await tx.webhookEndpoint.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } })
      ).map(view),
    );
  });

  app.post("/webhook-endpoints", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "integrations:manage");
    const body = z
      .object({
        url: z.string().trim().max(500),
        events: z.array(z.enum(EVENTS)).min(1).default(["candidate.hired"]),
      })
      .parse(req.body);
    const url = await safeUrl(body.url);
    const secret = newWebhookSecret();
    const ep = await withTenant(prisma, tenantId, async (tx) => {
      const e = await tx.webhookEndpoint.create({
        data: { tenantId, url, events: body.events, secretEnc: encryptSecret(secret, appSecret) },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "webhook.created", target: e.id },
      });
      return e;
    });
    reply.code(201).send({ ...view(ep), secret }); // el secreto se muestra solo esta vez
  });

  app.patch("/webhook-endpoints/:id", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "integrations:manage");
    const { id } = idParam.parse(req.params);
    const body = z
      .object({ active: z.boolean().optional(), url: z.string().trim().max(500).optional() })
      .parse(req.body);
    const url = body.url ? await safeUrl(body.url) : undefined;
    return withTenant(prisma, tenantId, async (tx) => {
      if (!(await tx.webhookEndpoint.findFirst({ where: { id, tenantId } })))
        throw new HttpError(404, "Endpoint no encontrado");
      const e = await tx.webhookEndpoint.update({
        where: { id },
        data: { active: body.active, url },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "webhook.updated", target: id },
      });
      return view(e);
    });
  });

  app.delete("/webhook-endpoints/:id", { preHandler: authenticate }, async (req, reply) => {
    const { tenantId, userId } = requirePermission(req, "integrations:manage");
    const { id } = idParam.parse(req.params);
    await withTenant(prisma, tenantId, async (tx) => {
      if (!(await tx.webhookEndpoint.findFirst({ where: { id, tenantId } })))
        throw new HttpError(404, "Endpoint no encontrado");
      await tx.webhookEndpoint.update({ where: { id }, data: { active: false } }); // se desactiva: el historial de entregas se conserva
      await tx.webhookDelivery.updateMany({
        where: { endpointId: id, status: "pending" },
        data: { status: "failed", lastError: "Endpoint eliminado", nextAttemptAt: null },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "webhook.deleted", target: id },
      });
    });
    reply.code(204).send();
  });

  app.post("/webhook-endpoints/:id/rotate-secret", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "integrations:manage");
    const { id } = idParam.parse(req.params);
    const secret = newWebhookSecret();
    await withTenant(prisma, tenantId, async (tx) => {
      if (!(await tx.webhookEndpoint.findFirst({ where: { id, tenantId } })))
        throw new HttpError(404, "Endpoint no encontrado");
      await tx.webhookEndpoint.update({
        where: { id },
        data: { secretEnc: encryptSecret(secret, appSecret), rotatedAt: new Date() },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "webhook.secret_rotated", target: id },
      });
    });
    return { id, secret };
  });

  // Evento de prueba: sale por el mismo camino que uno real (firma, reintentos) pero con datos sintéticos.
  app.post("/webhook-endpoints/:id/test", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "integrations:manage");
    const { id } = idParam.parse(req.params);
    const deliveryId = await withTenant(prisma, tenantId, async (tx) => {
      const ep = await tx.webhookEndpoint.findFirst({ where: { id, tenantId } });
      if (!ep) throw new HttpError(404, "Endpoint no encontrado");
      const now = new Date();
      const d = await tx.webhookDelivery.create({
        data: {
          tenantId,
          endpointId: id,
          eventId: `evt_test_${now.getTime()}`,
          event: "candidate.hired",
          nextAttemptAt: now,
          payload: {
            schema_version: "1.0",
            id: `evt_test_${now.getTime()}`,
            event: "candidate.hired",
            occurred_at: now.toISOString(),
            data: {
              hire_id: "00000000-0000-4000-8000-000000000000",
              internal_reference: "PRUEBA",
              hired_at: now.toISOString(),
              start_date: null,
              candidate: {
                full_name: "Persona de Prueba",
                email: "prueba@example.com",
                phone: "8095550000",
              },
              position: {
                vacancy_id: null,
                title: "Puesto de prueba",
                department: "Pruebas",
                employment_type: "full_time",
                work_mode: "onsite",
                location: "Santo Domingo",
              },
            },
          },
        },
      });
      return d.id;
    });
    const result = await webhooks.attempt(deliveryId, tenantId);
    return { deliveryId, result };
  });

  app.get("/webhook-deliveries", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "integrations:manage");
    const q = z
      .object({
        endpointId: z.string().uuid().optional(),
        status: z.enum(["pending", "success", "failed"]).optional(),
      })
      .parse(req.query);
    return withTenant(prisma, tenantId, (tx) =>
      tx.webhookDelivery.findMany({
        where: { tenantId, endpointId: q.endpointId, status: q.status },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          endpointId: true,
          event: true,
          eventId: true,
          status: true,
          attempts: true,
          nextAttemptAt: true,
          lastStatus: true,
          lastError: true,
          deliveredAt: true,
          createdAt: true,
        },
      }),
    );
  });

  app.post("/webhook-deliveries/:id/resend", { preHandler: authenticate }, async (req) => {
    const { tenantId, userId } = requirePermission(req, "integrations:manage");
    const { id } = idParam.parse(req.params);
    await withTenant(prisma, tenantId, async (tx) => {
      const d = await tx.webhookDelivery.findFirst({ where: { id, tenantId } });
      if (!d) throw new HttpError(404, "Entrega no encontrada");
      await tx.webhookDelivery.update({
        where: { id },
        data: { status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null },
      });
      await tx.auditLog.create({
        data: { tenantId, actorId: userId, action: "webhook.resent", target: id },
      });
    });
    return { id, result: await webhooks.attempt(id, tenantId) };
  });
}
