import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenant, type PrismaClient } from "@ats/db";
import { applicationFormSchema } from "@ats/shared";
import { HttpError } from "../auth/plugin.js";
import type { PlanService } from "../services/plans.js";
import type { NoticeService } from "../services/notice.js";
import type { CaptchaVerifier } from "../ports/captcha.js";
import type { JobQueue } from "../ports/queue.js";
import type { VirusScanner } from "../ports/scanner.js";
import type { BlobStore } from "../ports/storage.js";
import { detectCvType, mimeOf } from "../services/files.js";
import { resolvePublicKey } from "../services/keys.js";

export interface PublicApplicationDeps {
  prisma: PrismaClient;
  store: BlobStore;
  scanner: VirusScanner;
  captcha: CaptchaVerifier;
  queue: () => JobQueue;
  rateLimit: number;
  planSvc: PlanService;
  notice: NoticeService;
}

/** IP truncada para el registro de consentimiento (docs/04 8.1): IPv4 a /24, IPv6 a los primeros 3 grupos. */
export function truncateIp(ip: string | undefined): string | null {
  if (!ip) return null;
  if (ip.includes(":") && !ip.includes(".")) return ip.split(":").slice(0, 3).join(":") + "::";
  const v4 = ip.replace(/^::ffff:/, "").split(".");
  return v4.length === 4 ? `${v4[0]}.${v4[1]}.${v4[2]}.0` : null;
}

const DUPLICATE_WINDOW_MS = 30 * 24 * 3600_000;

export function publicApplicationRoutes(app: FastifyInstance, deps: PublicApplicationDeps) {
  const { prisma, store, scanner, captcha, queue, planSvc, notice } = deps;

  app.get("/public/v1/notice", async () => notice.current());

  app.post(
    "/public/v1/applications",
    {
      config: {
        rateLimit: {
          max: deps.rateLimit,
          timeWindow: "1 hour",
          keyGenerator: (req: { ip: string; headers: Record<string, unknown> }) =>
            `${req.ip}:${String(req.headers["x-public-key"] ?? "")}`,
        },
      },
    },
    async (req, reply) => {
      const tenant = await resolvePublicKey(prisma, req, { requireOrigin: true });

      const fields: Record<string, string> = {};
      let cv: { buffer: Buffer; filename: string } | undefined;
      for await (const part of req.parts()) {
        if (part.type === "file") {
          if (part.fieldname !== "cv" || cv) {
            part.file.resume();
            continue;
          }
          const buffer = await part.toBuffer();
          if (part.file.truncated)
            throw new HttpError(413, "El CV supera el tamaño máximo de 5 MB");
          cv = { buffer, filename: part.filename };
        } else fields[part.fieldname] = String(part.value);
      }
      if (!cv || cv.buffer.length === 0)
        throw new HttpError(400, "Adjunta tu CV en PDF o Word (.docx)");

      const form = applicationFormSchema.parse(fields);
      if (form.noticeVersion !== (await notice.current()).version)
        throw new HttpError(409, "El aviso de datos cambió; recarga el formulario");
      if (!(await captcha.verify(form.captchaToken, req.ip)))
        throw new HttpError(400, "No pudimos verificar que eres una persona. Intenta de nuevo.");

      const type = detectCvType(cv.buffer);
      if (!type)
        throw new HttpError(415, "El CV debe ser un PDF o un documento de Word (.docx) válido");
      let verdict: "clean" | "infected";
      try {
        verdict = await scanner.scan(cv.buffer);
      } catch {
        throw new HttpError(503, "No pudimos verificar el archivo ahora. Intenta más tarde.");
      }
      if (verdict === "infected")
        throw new HttpError(422, "El archivo no pasó la verificación de seguridad");

      const result = await withTenant(prisma, tenant.id, async (tx) => {
        if (form.vacancyId) {
          const v = await tx.vacancy.findFirst({
            where: {
              id: form.vacancyId,
              tenantId: tenant.id,
              status: "published",
              OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
            },
          });
          if (!v) throw new HttpError(404, "La vacante ya no está disponible");
        }
        const data = {
          fullName: form.fullName,
          phone: form.phone,
          location: form.location,
          educationLevel: form.educationLevel,
          yearsExperience: form.yearsExperience,
          skills: form.skills,
          languages: form.languages,
          preferredMode: form.preferredMode,
          availability: form.availability,
          portfolioUrl: form.portfolioUrl,
        };
        const candidate = await tx.candidate.upsert({
          where: { tenantId_email: { tenantId: tenant.id, email: form.email } },
          create: { tenantId: tenant.id, email: form.email, ...data },
          update: data,
        });
        // Idempotencia razonable: reenviar el formulario no duplica la postulación.
        const dup = await tx.application.findFirst({
          where: {
            tenantId: tenant.id,
            candidateId: candidate.id,
            vacancyId: form.vacancyId ?? null,
            status: { not: "withdrawn" },
            createdAt: { gt: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
          },
        });
        if (dup)
          return { trackingId: dup.trackingId, duplicate: true as const, applicationId: dup.id };
        await planSvc.assertCanReceiveApplication(tx, tenant.id);

        await planSvc.countApplication(tx, tenant.id);
        const trackingId = randomBytes(16).toString("base64url");
        const application = await tx.application.create({
          data: {
            tenantId: tenant.id,
            candidateId: candidate.id,
            vacancyId: form.vacancyId ?? null,
            trackingId,
          },
        });
        const storageKey = `${tenant.id}/${application.id}/${randomUUID()}.${type}`; // nombre generado; el original solo es metadato
        await store.put(storageKey, cv.buffer);
        await tx.document.create({
          data: {
            tenantId: tenant.id,
            applicationId: application.id,
            storageKey,
            originalName: cv.filename.slice(0, 200),
            mimeType: mimeOf[type],
            sizeBytes: cv.buffer.length,
            sha256: createHash("sha256").update(cv.buffer).digest("hex"),
            scanStatus: "clean",
          },
        });
        await tx.consentRecord.create({
          data: {
            tenantId: tenant.id,
            candidateId: candidate.id,
            applicationId: application.id,
            noticeVersion: form.noticeVersion,
            ipTruncated: truncateIp(req.ip),
          },
        });
        await tx.applicationStageHistory.create({
          data: {
            tenantId: tenant.id,
            applicationId: application.id,
            toStatus: "received",
            automatic: true,
            reason: "Postulación recibida desde el widget",
          },
        });
        return { trackingId, duplicate: false as const, applicationId: application.id };
      });

      if (!result.duplicate) {
        void planSvc.checkAlerts(tenant.id).catch(() => undefined); // aviso al 80 % / 100 % en segundo plano
        await queue().enqueue({ applicationId: result.applicationId, tenantId: tenant.id });
      }
      reply.code(result.duplicate ? 200 : 202).send({ trackingId: result.trackingId });
    },
  );

  // Estado mínimo, sin datos personales.
  app.get("/public/v1/applications/:trackingId/status", async (req) => {
    const { trackingId } = z.object({ trackingId: z.string().min(10).max(64) }).parse(req.params);
    const tenant = await resolvePublicKey(prisma, req);
    const a = await withTenant(prisma, tenant.id, (tx) =>
      tx.application.findFirst({ where: { trackingId, tenantId: tenant.id } }),
    );
    if (!a) throw new HttpError(404, "Postulación no encontrada");
    const finished = ["hired", "not_selected", "withdrawn"].includes(a.status);
    return {
      status: finished ? "finished" : a.status === "received" ? "received" : "in_review",
      updatedAt: a.updatedAt,
    };
  });
}
