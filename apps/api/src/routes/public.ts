import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { withTenant, type Prisma, type PrismaClient } from "@ats/db";
import { jobSearchSchema } from "@ats/shared";
import { HttpError } from "../auth/plugin.js";
import { resolvePublicKey } from "../services/keys.js";

const publishedNow = (tenantId: string): Prisma.VacancyWhereInput => ({
  tenantId,
  status: "published",
  OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
});

const publicSelect = {
  id: true,
  title: true,
  department: true,
  summary: true,
  responsibilities: true,
  benefits: true,
  requirementsRequired: true,
  requirementsDesirable: true,
  level: true,
  minYears: true,
  minEducation: true,
  languages: true,
  employmentType: true,
  workMode: true,
  province: true,
  municipality: true,
  salaryMin: true,
  salaryMax: true,
  showSalary: true,
  publishedAt: true,
  closesAt: true,
  skills: { select: { name: true, kind: true } },
} satisfies Prisma.VacancySelect;

type PublicRow = Prisma.VacancyGetPayload<{ select: typeof publicSelect }>;

/** Nunca expone responsables, evaluadores, reglas eliminatorias, pesos ni el salario si la vacante lo oculta. */
function toPublic(v: PublicRow) {
  const { skills, salaryMin, salaryMax, showSalary, ...rest } = v;
  return {
    ...rest,
    requiredSkills: skills.filter((s) => s.kind === "required").map((s) => s.name),
    desirableSkills: skills.filter((s) => s.kind === "desirable").map((s) => s.name),
    ...(showSalary ? { salaryMin, salaryMax, salaryCurrency: "DOP" } : {}),
  };
}

const schemaOrgType = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  internship: "INTERN",
} as const;

export function publicRoutes(app: FastifyInstance, { prisma }: { prisma: PrismaClient }) {
  app.get("/public/v1/jobs", async (req) => {
    const q = jobSearchSchema.parse(req.query);
    const tenant = await resolvePublicKey(prisma, req);
    const and: Prisma.VacancyWhereInput[] = [];
    if (q.q) {
      const contains = { contains: q.q, mode: "insensitive" as const };
      and.push({
        OR: [{ title: contains }, { summary: contains }, { skills: { some: { name: contains } } }],
      });
    }
    if (q.location) {
      const contains = { contains: q.location, mode: "insensitive" as const };
      and.push({ OR: [{ province: contains }, { municipality: contains }] });
    }
    if (q.department) and.push({ department: { equals: q.department, mode: "insensitive" } });
    if (q.since) and.push({ publishedAt: { gte: q.since } });
    const where: Prisma.VacancyWhereInput = {
      ...publishedNow(tenant.id),
      workMode: q.mode,
      employmentType: q.type,
      level: q.level,
      AND: and,
    };
    return withTenant(prisma, tenant.id, async (tx) => {
      const [total, rows] = await Promise.all([
        tx.vacancy.count({ where }),
        tx.vacancy.findMany({
          where,
          select: publicSelect,
          orderBy: { publishedAt: "desc" },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ]);
      return {
        company: tenant.name,
        page: q.page,
        pageSize: q.pageSize,
        total,
        items: rows.map(toPublic),
      };
    });
  });

  const detail = async (req: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const tenant = await resolvePublicKey(prisma, req);
    const v = await withTenant(prisma, tenant.id, (tx) =>
      tx.vacancy.findFirst({ where: { id, ...publishedNow(tenant.id) }, select: publicSelect }),
    );
    if (!v) throw new HttpError(404, "Vacante no encontrada");
    return { tenant, v };
  };

  app.get("/public/v1/jobs/:id", async (req) => {
    const { tenant, v } = await detail(req);
    return { company: tenant.name, ...toPublic(v) };
  });

  // Datos estructurados JobPosting (schema.org) para que la empresa los incruste y Google indexe la vacante.
  app.get("/public/v1/jobs/:id/jsonld", async (req, reply) => {
    const { tenant, v } = await detail(req);
    const description = [v.summary, v.responsibilities, v.requirementsRequired, v.benefits]
      .filter(Boolean)
      .join("\n\n");
    const ld = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: v.title,
      description,
      datePosted: v.publishedAt?.toISOString(),
      ...(v.closesAt ? { validThrough: v.closesAt.toISOString() } : {}),
      employmentType: schemaOrgType[v.employmentType],
      hiringOrganization: { "@type": "Organization", name: tenant.name },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressRegion: v.province,
          addressLocality: v.municipality ?? undefined,
          addressCountry: "DO",
        },
      },
      ...(v.workMode === "remote" ? { jobLocationType: "TELECOMMUTE" } : {}),
      ...(v.showSalary && v.salaryMin != null
        ? {
            baseSalary: {
              "@type": "MonetaryAmount",
              currency: "DOP",
              value: {
                "@type": "QuantitativeValue",
                minValue: v.salaryMin,
                maxValue: v.salaryMax ?? v.salaryMin,
                unitText: "MONTH",
              },
            },
          }
        : {}),
    };
    reply.type("application/ld+json").send(ld);
  });
}
