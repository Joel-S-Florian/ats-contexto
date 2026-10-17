import type { HiredEventData } from "@ats/shared/webhook";
import type { Prisma, Tx } from "@ats/db";
import { HttpError } from "../auth/plugin.js";
import type { WebhookService } from "./webhooks.js";

export type Decision = "selected" | "not_selected" | "on_hold";

/**
 * Selección y contratación (docs/01 4.7-4.9). Decide una persona por defecto; la selección automática es un interruptor
 * por vacante (apagado por defecto) y siempre queda marcada como automática en la decisión y en el historial.
 */
export function createSelectionService(deps: { webhooks: WebhookService }) {
  const { webhooks } = deps;

  async function decide(
    tx: Tx,
    a: {
      tenantId: string;
      applicationId: string;
      status: string;
      decision: Decision;
      reason: string;
      actorId: string | null;
      automatic: boolean;
    },
  ) {
    await tx.application.update({ where: { id: a.applicationId }, data: { status: a.decision } });
    await tx.selectionDecision.create({
      data: {
        tenantId: a.tenantId,
        applicationId: a.applicationId,
        decision: a.decision,
        decidedBy: a.actorId,
        automatic: a.automatic,
        reason: a.reason,
      },
    });
    await tx.applicationStageHistory.create({
      data: {
        tenantId: a.tenantId,
        applicationId: a.applicationId,
        fromStatus: a.status as never,
        toStatus: a.decision,
        actorId: a.actorId,
        automatic: a.automatic,
        reason: a.reason,
      },
    });
  }

  /** Contrata: exige que la persona esté seleccionada; guarda exactamente lo entregado al exterior y dispara el webhook. */
  async function hire(
    tx: Tx,
    a: {
      tenantId: string;
      applicationId: string;
      actorId: string | null;
      automatic: boolean;
      startDate?: Date | null;
    },
  ) {
    const app = await tx.application.findFirst({
      where: { id: a.applicationId, tenantId: a.tenantId },
      include: { candidate: true },
    });
    if (!app) throw new HttpError(404, "Postulación no encontrada");
    if (app.status === "hired") throw new HttpError(409, "La postulación ya está contratada.");
    if (app.status !== "selected")
      throw new HttpError(409, "Solo se puede contratar a una persona seleccionada.");
    const v = app.vacancyId ? await tx.vacancy.findFirst({ where: { id: app.vacancyId } }) : null;
    const hiredAt = new Date();
    const created = await tx.hire.create({
      data: {
        tenantId: a.tenantId,
        applicationId: app.id,
        candidateId: app.candidateId,
        vacancyId: app.vacancyId,
        hiredBy: a.actorId,
        automatic: a.automatic,
        startDate: a.startDate ?? null,
        hiredAt,
        payload: {},
      },
    });
    const data: HiredEventData = {
      hire_id: created.id,
      internal_reference: app.trackingId,
      hired_at: hiredAt.toISOString(),
      start_date: a.startDate ? a.startDate.toISOString().slice(0, 10) : null,
      candidate: {
        full_name: app.candidate.fullName,
        email: app.candidate.email,
        phone: app.candidate.phone,
      },
      position: {
        vacancy_id: v?.id ?? null,
        title: v?.title ?? null,
        department: v?.department ?? null,
        employment_type: v?.employmentType ?? null,
        work_mode: v?.workMode ?? null,
        location: v ? [v.municipality, v.province].filter(Boolean).join(", ") : null,
      },
    };
    await tx.hire.update({
      where: { id: created.id },
      data: { payload: data as unknown as Prisma.InputJsonValue },
    });
    await tx.application.update({ where: { id: app.id }, data: { status: "hired" } });
    await tx.applicationStageHistory.create({
      data: {
        tenantId: a.tenantId,
        applicationId: app.id,
        fromStatus: "selected",
        toStatus: "hired",
        actorId: a.actorId,
        automatic: a.automatic,
        reason: a.automatic
          ? "Contratación confirmada automáticamente (configuración de la empresa)."
          : "Contratación confirmada.",
      },
    });
    await webhooks.emit(tx, a.tenantId, "candidate.hired", data);
    // Aviso al contratado: se programa y lo envía el procesador de correos diferidos (ya con la contratación confirmada).
    await tx.scheduledEmail.create({
      data: {
        tenantId: a.tenantId,
        applicationId: app.id,
        templateKey: "hired",
        sendAt: new Date(),
      },
    });
    return created.id;
  }

  /** Selección automática por examen aprobado (interruptor por vacante). Contratar sigue requiriendo confirmación salvo autoConfirmHire. */
  async function autoSelect(
    tx: Tx,
    a: { tenantId: string; applicationId: string; status: string; reason: string },
  ) {
    await decide(tx, { ...a, decision: "selected", actorId: null, automatic: true });
    const t = await tx.tenant.findUniqueOrThrow({ where: { id: a.tenantId } });
    if (t.autoConfirmHire)
      await hire(tx, {
        tenantId: a.tenantId,
        applicationId: a.applicationId,
        actorId: null,
        automatic: true,
      });
  }

  return { decide, hire, autoSelect };
}
export type SelectionService = ReturnType<typeof createSelectionService>;
