import { withPlatform, withTenant, type PrismaClient, type Tx } from "@ats/db";
import type { EmailService } from "./email.js";

/**
 * Aviso de rechazo configurable por empresa (docs/01 4.7): manual (por defecto), automático con retraso o sin aviso.
 * El automático se programa y se cancela si el descarte se revierte antes de la hora de envío.
 */
export function createNotificationService(deps: { prisma: PrismaClient; email: EmailService }) {
  const { prisma, email } = deps;

  async function onNotSelected(tx: Tx, tenantId: string, applicationId: string) {
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (t.rejectionNotice !== "auto_delay") return;
    const pending = await tx.scheduledEmail.findFirst({
      where: { tenantId, applicationId, templateKey: "rejection", sentAt: null, cancelledAt: null },
    });
    if (pending) return;
    await tx.scheduledEmail.create({
      data: {
        tenantId,
        applicationId,
        templateKey: "rejection",
        sendAt: new Date(Date.now() + t.rejectionDelayHours * 3600_000),
      },
    });
  }

  async function cancelPending(tx: Tx, tenantId: string, applicationId: string) {
    await tx.scheduledEmail.updateMany({
      where: { tenantId, applicationId, sentAt: null, cancelledAt: null },
      data: { cancelledAt: new Date() },
    });
  }

  /** Envía los correos diferidos vencidos. Lo invoca un temporizador del servidor (y las pruebas). */
  async function processDue(now = new Date()): Promise<number> {
    const due = await withPlatform(prisma, (tx) =>
      tx.scheduledEmail.findMany({
        where: { sendAt: { lte: now }, sentAt: null, cancelledAt: null },
        take: 100,
      }),
    );
    let sent = 0;
    for (const s of due) {
      const still = await withTenant(prisma, s.tenantId, (tx) =>
        tx.application.findFirst({
          where: {
            id: s.applicationId,
            tenantId: s.tenantId,
            status: s.templateKey === "hired" ? "hired" : "not_selected",
          },
        }),
      );
      if (!still) {
        await withTenant(prisma, s.tenantId, (tx) =>
          tx.scheduledEmail.update({ where: { id: s.id }, data: { cancelledAt: new Date() } }),
        );
        continue;
      }
      const r = await email.send({
        tenantId: s.tenantId,
        applicationId: s.applicationId,
        key: s.templateKey as "rejection" | "hired",
      });
      if (r !== "failed") {
        await withTenant(prisma, s.tenantId, (tx) =>
          tx.scheduledEmail.update({ where: { id: s.id }, data: { sentAt: new Date() } }),
        );
        if (r === "sent") sent++;
      }
    }
    return sent;
  }

  return { onNotSelected, cancelPending, processDue };
}
export type NotificationService = ReturnType<typeof createNotificationService>;
