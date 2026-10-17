import { Prisma, withPlatform, withTenant, type PrismaClient, type Tx } from "@ats/db";
import { HttpError } from "../auth/plugin.js";
import type { BlobStore } from "../ports/storage.js";

export const ANONYMOUS_NAME = "Candidato anonimizado";

/**
 * Privacidad operativa (docs/04 sección 8.3): retención, exportación y eliminación de los datos de una persona.
 * Anonimizar conserva lo estadístico (estados, puntajes, fechas) y quita todo dato personal y el contenido del CV.
 */
export function createPrivacyService(deps: {
  prisma: PrismaClient;
  store: BlobStore;
  clock?: () => Date;
}) {
  const { prisma, store } = deps;
  const clock = deps.clock ?? (() => new Date());

  /** Anonimiza a una persona dentro de la transacción y devuelve las llaves de archivos a borrar tras confirmar. */
  async function anonymize(
    tx: Tx,
    tenantId: string,
    candidateId: string,
  ): Promise<{ blobKeys: string[]; applications: number }> {
    const apps = await tx.application.findMany({
      where: { tenantId, candidateId },
      select: { id: true },
    });
    const ids = apps.map((a) => a.id);
    const docs = await tx.document.findMany({ where: { tenantId, applicationId: { in: ids } } });

    await tx.candidate.update({
      where: { id: candidateId },
      data: {
        fullName: ANONYMOUS_NAME,
        email: `anonimo-${candidateId}@anonimizado.invalid`,
        phone: "",
        location: "",
        educationLevel: "",
        skills: [],
        languages: [],
        availability: null,
        portfolioUrl: null,
        anonymizedAt: clock(),
      },
    });
    await tx.document.updateMany({
      where: { tenantId, applicationId: { in: ids } },
      data: { extractedText: null, originalName: "eliminado", storageKey: "deleted" },
    });
    await tx.applicationNote.deleteMany({ where: { tenantId, applicationId: { in: ids } } });
    await tx.selectionComment.deleteMany({ where: { tenantId, applicationId: { in: ids } } });
    await tx.communication.deleteMany({ where: { tenantId, applicationId: { in: ids } } });
    await tx.interview.updateMany({
      where: { tenantId, applicationId: { in: ids } },
      data: { messageToCandidate: null, location: null, meetingUrl: null },
    });
    await tx.emailLog.updateMany({
      where: { tenantId, applicationId: { in: ids } },
      data: { toEmail: "eliminado@anonimizado.invalid" },
    });
    await tx.scheduledEmail.updateMany({
      where: { tenantId, applicationId: { in: ids }, sentAt: null, cancelledAt: null },
      data: { cancelledAt: clock() },
    });
    await tx.consentRecord.updateMany({
      where: { tenantId, candidateId },
      data: { ipTruncated: null },
    });
    await tx.assessmentAttempt.updateMany({
      where: { tenantId, applicationId: { in: ids } },
      data: { answers: {}, snapshot: Prisma.DbNull },
    });
    await tx.externalAssessmentRecord.updateMany({
      where: { tenantId, applicationId: { in: ids } },
      data: { observations: "", description: "(eliminado)" },
    });

    // La evidencia del puntaje son fragmentos del CV: se quitan; el puntaje y las justificaciones se conservan.
    const results = await tx.screeningResult.findMany({
      where: { tenantId, applicationId: { in: ids } },
    });
    for (const r of results)
      await tx.screeningResult.update({
        where: { id: r.id },
        data: {
          dimensions: (r.dimensions as { evidence?: string[] }[]).map((d) => ({
            ...d,
            evidence: [],
          })) as Prisma.InputJsonValue,
          notes: [],
          matched: [],
          missing: [],
        },
      });
    return {
      blobKeys: docs.map((d) => d.storageKey).filter((k) => k !== "deleted"),
      applications: ids.length,
    };
  }

  async function dropBlobs(keys: string[]) {
    await Promise.all(keys.map((k) => store.delete(k).catch(() => undefined)));
  }

  /** Derecho de eliminación (iniciado por la empresa desde el panel). */
  async function erase(tenantId: string, candidateId: string, actorId: string) {
    const out = await withTenant(prisma, tenantId, async (tx) => {
      const c = await tx.candidate.findFirst({ where: { id: candidateId, tenantId } });
      if (!c) throw new HttpError(404, "Persona no encontrada");
      if (c.anonymizedAt)
        throw new HttpError(409, "Los datos de esta persona ya fueron eliminados.");
      if (await tx.hire.count({ where: { tenantId, candidateId } }))
        throw new HttpError(
          409,
          "La persona fue contratada: sus datos ya se entregaron a tu sistema de RRHH o nómina y deben gestionarse allí.",
          "candidate_hired",
        );
      const r = await anonymize(tx, tenantId, candidateId);
      await tx.auditLog.create({
        data: { tenantId, actorId, action: "candidate.erased", target: candidateId },
      });
      return r;
    });
    await dropBlobs(out.blobKeys);
    return { applications: out.applications, files: out.blobKeys.length };
  }

  /** Tarea programada: anonimiza a quienes llevan más que el plazo de retención sin actividad (12 meses por defecto, por tenant). */
  async function processRetention(now = clock()): Promise<{ anonymized: number }> {
    const tenants = await withPlatform(prisma, (tx) =>
      tx.tenant.findMany({ select: { id: true, retentionMonths: true } }),
    );
    let total = 0;
    for (const t of tenants) {
      const cutoff = new Date(now);
      cutoff.setUTCMonth(cutoff.getUTCMonth() - t.retentionMonths);
      const due = await withTenant(prisma, t.id, (tx) =>
        tx.candidate.findMany({
          where: {
            tenantId: t.id,
            anonymizedAt: null,
            applications: { none: { OR: [{ updatedAt: { gte: cutoff } }, { status: "hired" }] } },
          },
          select: { id: true },
          take: 200,
        }),
      );
      for (const c of due) {
        const out = await withTenant(prisma, t.id, (tx) => anonymize(tx, t.id, c.id));
        await dropBlobs(out.blobKeys);
        total++;
      }
      if (due.length)
        await withTenant(prisma, t.id, (tx) =>
          tx.auditLog.create({
            data: { tenantId: t.id, action: "retention.anonymized", target: String(due.length) },
          }),
        );
    }
    return { anonymized: total };
  }

  /** Acceso y portabilidad: todo lo que el sistema guarda de la persona, en JSON legible por máquina. */
  async function exportCandidate(tx: Tx, tenantId: string, candidateId: string) {
    const c = await tx.candidate.findFirst({ where: { id: candidateId, tenantId } });
    if (!c) throw new HttpError(404, "Persona no encontrada");
    const apps = await tx.application.findMany({
      where: { tenantId, candidateId },
      include: { documents: true, history: { orderBy: { createdAt: "asc" } }, consents: true },
    });
    const ids = apps.map((a) => a.id);
    const [screenings, interviews, attempts, external, emails, vacancies] = await Promise.all([
      tx.screeningResult.findMany({ where: { tenantId, applicationId: { in: ids } } }),
      tx.interview.findMany({ where: { tenantId, applicationId: { in: ids } } }),
      tx.assessmentAttempt.findMany({ where: { tenantId, applicationId: { in: ids } } }),
      tx.externalAssessmentRecord.findMany({ where: { tenantId, applicationId: { in: ids } } }),
      tx.emailLog.findMany({
        where: { tenantId, applicationId: { in: ids } },
        select: {
          applicationId: true,
          templateKey: true,
          subject: true,
          status: true,
          createdAt: true,
        },
      }),
      tx.vacancy.findMany({
        where: { tenantId, id: { in: apps.flatMap((a) => (a.vacancyId ? [a.vacancyId] : [])) } },
        select: { id: true, title: true },
      }),
    ]);
    const title = new Map(vacancies.map((v) => [v.id, v.title]));
    const by = <T extends { applicationId: string | null }>(rows: T[], id: string): T[] =>
      rows.filter((r) => r.applicationId === id);
    return {
      schema_version: "1.0",
      exported_at: clock().toISOString(),
      candidate: {
        id: c.id,
        full_name: c.fullName,
        email: c.email,
        phone: c.phone,
        location: c.location,
        education_level: c.educationLevel,
        years_experience: c.yearsExperience,
        skills: c.skills,
        languages: c.languages,
        preferred_mode: c.preferredMode,
        availability: c.availability,
        portfolio_url: c.portfolioUrl,
        created_at: c.createdAt,
        anonymized_at: c.anonymizedAt,
      },
      applications: apps.map((a) => ({
        id: a.id,
        tracking_id: a.trackingId,
        vacancy: a.vacancyId ? (title.get(a.vacancyId) ?? null) : null,
        status: a.status,
        created_at: a.createdAt,
        documents: a.documents.map((d) => ({
          name: d.originalName,
          mime_type: d.mimeType,
          size_bytes: d.sizeBytes,
          extracted_text: d.extractedText,
        })),
        history: a.history.map((h) => ({
          from: h.fromStatus,
          to: h.toStatus,
          automatic: h.automatic,
          reason: h.reason,
          at: h.createdAt,
        })),
        consents: a.consents.map((k) => ({
          notice_version: k.noticeVersion,
          accepted_at: k.acceptedAt,
        })),
        screening: by(screenings, a.id).map((s) => ({
          mode: s.mode,
          overall: s.overall,
          recommendation: s.recommendation,
          dimensions: s.dimensions,
          reasons: s.reasons,
          at: s.createdAt,
        })),
        interviews: by(interviews, a.id).map((i) => ({
          scheduled_at: i.scheduledAt,
          mode: i.mode,
          status: i.status,
        })),
        assessments: by(attempts, a.id).map((x) => ({
          status: x.status,
          final_score: x.finalScore,
          submitted_at: x.submittedAt,
        })),
        external_assessments: by(external, a.id).map((x) => ({
          description: x.description,
          performed_at: x.performedAt,
          result: x.result,
          score: x.score,
        })),
        emails: by(emails, a.id).map((e) => ({
          template: e.templateKey,
          subject: e.subject,
          status: e.status,
          at: e.createdAt,
        })),
      })),
    };
  }

  return { anonymize, erase, processRetention, exportCandidate };
}
export type PrivacyService = ReturnType<typeof createPrivacyService>;
