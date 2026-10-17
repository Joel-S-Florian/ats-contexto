import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@ats/db";
import { LEAD_CONSENT_VERSION, leadFormSchema, leadStatuses } from "@ats/shared";
import { HttpError, requireSuperAdmin } from "../auth/plugin.js";
import type { Mailer } from "../mailer.js";
import type { CaptchaVerifier } from "../ports/captcha.js";
import { truncateIp } from "./applications-public.js";

type Deps = {
  prisma: PrismaClient;
  authenticate: preHandlerAsyncHookHandler;
  captcha: CaptchaVerifier;
  mailer: Mailer;
  operatorEmail?: string;
  rateLimit: number;
};
const DUPLICATE_WINDOW_MS = 24 * 3600_000;

export function leadRoutes(
  app: FastifyInstance,
  { prisma, authenticate, captcha, mailer, operatorEmail, rateLimit }: Deps,
) {
  // Solicitud de demo desde la landing: captcha, límite de tasa por IP, consentimiento y aviso al operador.
  app.post(
    "/public/v1/leads",
    { config: { rateLimit: { max: rateLimit, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const form = leadFormSchema.parse(req.body);
      // Señuelo para bots: parece aceptado, pero no se guarda ni se avisa a nadie.
      if (form.website) return reply.code(201).send({ ok: true });
      if (!(await captcha.verify(form.captchaToken, req.ip)))
        throw new HttpError(400, "No pudimos verificar que eres una persona. Intenta de nuevo.");

      const recent = await prisma.lead.findFirst({
        where: { email: form.email, createdAt: { gt: new Date(Date.now() - DUPLICATE_WINDOW_MS) } },
      });
      if (!recent) {
        await prisma.lead.create({
          data: {
            name: form.name,
            company: form.company,
            email: form.email,
            phone: form.phone,
            size: form.size,
            message: form.message,
            consentVersion: LEAD_CONSENT_VERSION,
            ipTruncated: truncateIp(req.ip),
          },
        });
        const summary = `Nueva solicitud de demo\n\nNombre: ${form.name}\nEmpresa: ${form.company}\nTamaño: ${form.size}\nCorreo: ${form.email}\nTeléfono: ${form.phone ?? "-"}\n\n${form.message || "(sin mensaje)"}`;
        if (operatorEmail)
          await mailer
            .send(operatorEmail, `Solicitud de demo: ${form.company}`, summary)
            .catch(() => undefined);
        await mailer
          .send(
            form.email,
            "Recibimos tu solicitud de demo",
            `Hola ${form.name.split(" ")[0]},\n\nRecibimos tu solicitud. Te escribiremos pronto para agendar la demo.\n\nGracias por tu interés.`,
          )
          .catch(() => undefined);
      }
      reply.code(201).send({ ok: true }); // misma respuesta si ya existía: no se revela si el correo estaba registrado
    },
  );

  // ---- Panel del super administrador ----
  app.get("/admin/leads", { preHandler: [authenticate, requireSuperAdmin] }, async (req) => {
    const { status } = z.object({ status: z.enum(leadStatuses).optional() }).parse(req.query);
    return prisma.lead.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 200 });
  });

  app.patch("/admin/leads/:id", { preHandler: [authenticate, requireSuperAdmin] }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = z
      .object({
        status: z.enum(leadStatuses).optional(),
        notes: z.string().trim().max(1000).optional(),
      })
      .parse(req.body);
    if (!(await prisma.lead.findUnique({ where: { id } })))
      throw new HttpError(404, "Solicitud no encontrada");
    return prisma.lead.update({ where: { id }, data: body });
  });
}
