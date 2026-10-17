import { withTenant, type PrismaClient } from "@ats/db";
import type { Mailer } from "../mailer.js";
import type { BlobStore } from "../ports/storage.js";
import type { JobHandler } from "../ports/queue.js";
import { extractCvText, isReadable } from "./files.js";

/**
 * Trabajo asíncrono tras la recepción: extrae el texto del CV y deja la postulación lista para preselección (Fase 4).
 * Un fallo nunca descarta a la persona: queda en revisión manual con el motivo en el historial.
 */
export function createIngestHandler(deps: {
  prisma: PrismaClient;
  store: BlobStore;
  mailer: Mailer;
  screen?: (applicationId: string, tenantId: string) => Promise<unknown>;
}): JobHandler {
  const { prisma, store, mailer, screen } = deps;
  return async ({ applicationId, tenantId }) => {
    const info = await withTenant(prisma, tenantId, async (tx) => {
      await tx.application.update({
        where: { id: applicationId },
        data: { processing: "extracting" },
      });
      return tx.document.findFirstOrThrow({ where: { applicationId, tenantId } });
    });

    let text = "";
    let outcome: "ready" | "unreadable" | "failed" = "ready";
    try {
      text = await extractCvText(
        await store.get(info.storageKey),
        info.mimeType.includes("pdf") ? "pdf" : "docx",
      );
      if (!isReadable(text)) outcome = "unreadable";
    } catch {
      outcome = "failed";
    }

    await withTenant(prisma, tenantId, async (tx) => {
      await tx.document.update({
        where: { id: info.id },
        data: { extractedText: outcome === "ready" ? text : null, extractStatus: outcome },
      });
      const app = await tx.application.update({
        where: { id: applicationId },
        data: { processing: outcome, ...(outcome === "ready" ? {} : { status: "in_review" }) },
      });
      if (outcome !== "ready")
        await tx.applicationStageHistory.create({
          data: {
            tenantId,
            applicationId,
            fromStatus: "received",
            toStatus: "in_review",
            automatic: true,
            reason:
              outcome === "unreadable"
                ? "No se pudo leer texto del CV (posible PDF escaneado): revisión manual."
                : "Error al procesar el CV: revisión manual.",
          },
        });
      return app;
    });

    // Preselección automática (Fase 4). Un fallo aquí no pierde la postulación: queda recibida y visible.
    if (outcome === "ready" && screen) await screen(applicationId, tenantId).catch(() => undefined);

    const target = await withTenant(prisma, tenantId, (tx) =>
      tx.application.findFirstOrThrow({
        where: { id: applicationId, tenantId },
        include: { candidate: true },
      }),
    );
    await mailer.send(
      target.candidate.email,
      "Recibimos tu postulación",
      `Hola ${target.candidate.fullName.split(" ")[0]}, recibimos tu postulación. Código de seguimiento: ${target.trackingId}`,
    );
  };
}
