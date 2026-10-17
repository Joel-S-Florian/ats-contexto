import { withTenant, type PrismaClient, type Tx } from "@ats/db";
import {
  defaultTemplates,
  renderTemplate,
  type TemplateKey,
  type TemplateVariable,
} from "@ats/shared";
import type { MailOptions, Mailer } from "../mailer.js";

const dateFmt = new Intl.DateTimeFormat("es-DO", {
  dateStyle: "full",
  timeZone: "America/Santo_Domingo",
});
const timeFmt = new Intl.DateTimeFormat("es-DO", {
  timeStyle: "short",
  timeZone: "America/Santo_Domingo",
});
export const formatDate = (d: Date) => dateFmt.format(d);
export const formatTime = (d: Date) => timeFmt.format(d);

export async function loadTemplate(tx: Tx, tenantId: string, key: TemplateKey) {
  const custom = await tx.emailTemplate.findUnique({ where: { tenantId_key: { tenantId, key } } });
  return custom ?? { ...defaultTemplates[key], enabled: true };
}

export type EmailResult = "sent" | "failed" | "skipped";

/**
 * Envía una plantilla a UNA postulación. Las variables salen solo de esa postulación y de su empresa, así que un
 * correo nunca puede traer datos de otra persona. El resultado queda en EmailLog (sin el cuerpo del mensaje).
 */
export function createEmailService(deps: { prisma: PrismaClient; mailer: Mailer }) {
  const { prisma, mailer } = deps;

  async function send(args: {
    tenantId: string;
    applicationId: string;
    key: TemplateKey;
    vars?: Partial<Record<TemplateVariable, string>>;
    mail?: MailOptions;
  }): Promise<EmailResult> {
    const ctx = await withTenant(prisma, args.tenantId, async (tx) => {
      const app = await tx.application.findFirst({
        where: { id: args.applicationId, tenantId: args.tenantId },
        include: { candidate: true },
      });
      if (!app) return null;
      const [tenant, vacancy, tpl] = await Promise.all([
        tx.tenant.findUniqueOrThrow({ where: { id: args.tenantId } }),
        app.vacancyId ? tx.vacancy.findFirst({ where: { id: app.vacancyId } }) : null,
        loadTemplate(tx, args.tenantId, args.key),
      ]);
      return { app, tenant, vacancy, tpl };
    });
    if (!ctx) return "skipped";
    const { app, tenant, vacancy, tpl } = ctx;
    const log = (status: EmailResult, subject: string, error?: string) =>
      withTenant(prisma, args.tenantId, (tx) =>
        tx.emailLog.create({
          data: {
            tenantId: args.tenantId,
            applicationId: app.id,
            toEmail: app.candidate.email,
            templateKey: args.key,
            subject,
            status,
            error,
          },
        }),
      );

    if (!tpl.enabled) {
      await log("skipped", tpl.subject, "Plantilla desactivada");
      return "skipped";
    }
    const r = renderTemplate(tpl, {
      nombre: app.candidate.fullName.split(" ")[0] ?? "",
      vacante: vacancy?.title ?? "nuestra bolsa de talento",
      empresa: tenant.name,
      codigo: app.trackingId,
      mensaje: "",
      ...args.vars,
    });
    try {
      await mailer.send(app.candidate.email, r.subject, r.text, { html: r.html, ...args.mail });
      await log("sent", r.subject);
      return "sent";
    } catch (e) {
      await log("failed", r.subject, (e as Error).message.slice(0, 200));
      return "failed";
    }
  }

  return { send };
}
export type EmailService = ReturnType<typeof createEmailService>;
