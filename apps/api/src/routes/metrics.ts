import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { withTenant, type PrismaClient } from "@ats/db";
import { requirePermission } from "../auth/plugin.js";

const DAY = 86_400_000;

/** Seguimiento (docs/01 4.9): tiempo por etapa, embudo de conversión y origen de los candidatos. */
export function metricsRoutes(
  app: FastifyInstance,
  { prisma, authenticate }: { prisma: PrismaClient; authenticate: preHandlerAsyncHookHandler },
) {
  app.get("/metrics", { preHandler: authenticate }, async (req) => {
    const { tenantId } = requirePermission(req, "metrics:read");
    const { days, vacancyId } = z
      .object({
        days: z.coerce.number().int().min(1).max(730).default(90),
        vacancyId: z.string().uuid().optional(),
      })
      .parse(req.query);
    const since = new Date(Date.now() - days * DAY);

    return withTenant(prisma, tenantId, async (tx) => {
      const apps = await tx.application.findMany({
        where: { tenantId, createdAt: { gte: since }, ...(vacancyId ? { vacancyId } : {}) },
        select: { id: true, status: true, vacancyId: true, source: true, createdAt: true },
      });
      const ids = apps.map((a) => a.id);
      const history = await tx.applicationStageHistory.findMany({
        where: { tenantId, applicationId: { in: ids } },
        orderBy: { createdAt: "asc" },
        select: { applicationId: true, toStatus: true, createdAt: true },
      });

      // Etapas por las que pasó cada postulación (alcanzó) y tiempo en cada estado hasta el siguiente movimiento.
      const reached = new Map<string, Set<string>>();
      const spent = new Map<string, number[]>();
      const byApp = new Map<string, typeof history>();
      for (const h of history)
        byApp.set(h.applicationId, [...(byApp.get(h.applicationId) ?? []), h]);
      for (const [, hs] of byApp) {
        hs.forEach((h, i) => {
          reached.set(h.toStatus, (reached.get(h.toStatus) ?? new Set()).add(h.applicationId));
          const next = hs[i + 1];
          if (next)
            spent.set(h.toStatus, [
              ...(spent.get(h.toStatus) ?? []),
              (next.createdAt.getTime() - h.createdAt.getTime()) / DAY,
            ]);
        });
      }
      const avg = (xs: number[]) =>
        xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
      const count = (s: string) => reached.get(s)?.size ?? 0;
      const total = apps.length;
      const funnel = [
        { key: "received", label: "Postulaciones", count: total },
        { key: "shortlisted", label: "Preseleccionadas", count: count("shortlisted") },
        { key: "interview", label: "Entrevista", count: count("interview") },
        { key: "assessment", label: "Evaluación", count: count("assessment") },
        { key: "selected", label: "Seleccionadas", count: count("selected") },
        { key: "hired", label: "Contratadas", count: count("hired") },
      ].map((f) => ({ ...f, rate: total ? Math.round((f.count / total) * 100) : 0 }));

      const hires = await tx.hire.findMany({
        where: { tenantId, hiredAt: { gte: since } },
        select: { applicationId: true, hiredAt: true },
      });
      const created = new Map(apps.map((a) => [a.id, a.createdAt]));
      const toHire = hires.flatMap((h) =>
        created.has(h.applicationId)
          ? [(h.hiredAt.getTime() - created.get(h.applicationId)!.getTime()) / DAY]
          : [],
      );

      const source = { widget_vacancy: 0, widget_pool: 0 };
      for (const a of apps) {
        if (a.vacancyId) source.widget_vacancy++;
        else source.widget_pool++;
      }

      return {
        days,
        totals: {
          applications: total,
          hires: hires.length,
          discarded: apps.filter((a) =>
            ["knocked_out", "low_fit", "not_selected"].includes(a.status),
          ).length,
        },
        funnel,
        avgDaysInStatus: Object.fromEntries([...spent].map(([k, v]) => [k, avg(v)])),
        avgDaysToHire: avg(toHire),
        sources: [
          { key: "vacancy", label: "Postulación a una vacante", count: source.widget_vacancy },
          { key: "pool", label: "Bolsa general", count: source.widget_pool },
        ],
      };
    });
  });
}
