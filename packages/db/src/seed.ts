import argon2 from "argon2";
import { withPlatform, type PrismaClient } from "./index.js";
import { ensureDefaultPipeline } from "./pipelines.js";

type Demo = {
  title: string;
  department: string;
  summary: string;
  category: "general" | "technical" | "operational" | "administrative" | "managerial" | "junior";
  level: "internship" | "junior" | "semi_senior" | "senior" | "managerial";
  employmentType: "full_time" | "part_time" | "contract" | "temporary" | "internship";
  workMode: "onsite" | "hybrid" | "remote";
  province: string;
  municipality?: string;
  minYears: number;
  skills: string[];
  salary?: [number, number];
};

// Vacantes sintéticas de varias categorías para probar listado, filtros y (Fase 3) postulación.
const demoVacancies: Demo[] = [
  {
    title: "Desarrollador Backend Node.js",
    department: "Tecnología",
    summary: "Construirás y mantendrás APIs REST para nuestros productos digitales.",
    category: "technical",
    level: "semi_senior",
    employmentType: "full_time",
    workMode: "hybrid",
    province: "Distrito Nacional",
    municipality: "Piantini",
    minYears: 3,
    skills: ["Node.js", "PostgreSQL", "TypeScript"],
    salary: [90000, 130000],
  },
  {
    title: "Ejecutivo de Servicio al Cliente",
    department: "Operaciones",
    summary: "Atenderás consultas de clientes por teléfono y chat con enfoque en resolución.",
    category: "operational",
    level: "junior",
    employmentType: "full_time",
    workMode: "onsite",
    province: "Santiago",
    municipality: "Santiago de los Caballeros",
    minYears: 1,
    skills: ["Atención al cliente", "Excel básico"],
    salary: [28000, 38000],
  },
  {
    title: "Asistente Administrativo",
    department: "Administración",
    summary: "Apoyarás la gestión documental, agenda y compras de la oficina.",
    category: "administrative",
    level: "junior",
    employmentType: "part_time",
    workMode: "onsite",
    province: "Santo Domingo Este",
    minYears: 1,
    skills: ["Microsoft Office", "Organización"],
  },
  {
    title: "Gerente de Ventas Regional",
    department: "Comercial",
    summary: "Liderarás al equipo comercial de la región norte y su plan de ventas.",
    category: "managerial",
    level: "managerial",
    employmentType: "full_time",
    workMode: "hybrid",
    province: "Santiago",
    minYears: 7,
    skills: ["Liderazgo", "Gestión comercial", "CRM"],
    salary: [150000, 200000],
  },
  {
    title: "Pasante de Diseño UX",
    department: "Producto",
    summary: "Aprenderás junto al equipo de producto y apoyarás investigaciones y prototipos.",
    category: "junior",
    level: "internship",
    employmentType: "internship",
    workMode: "remote",
    province: "Distrito Nacional",
    minYears: 0,
    skills: ["Figma", "Investigación de usuarios"],
  },
];

/** Datos sintéticos de desarrollo: super admin y dos tenants para probar aislamiento. Contraseña: "demo-demo-1234". */
export async function seed(prisma: PrismaClient) {
  const passwordHash = await argon2.hash("demo-demo-1234", { type: argon2.argon2id });
  await withPlatform(prisma, async (tx) => {
    if (await tx.user.findUnique({ where: { email: "root@demo.test" } })) return;
    await tx.user.create({
      data: { email: "root@demo.test", name: "Operador", passwordHash, isSuperAdmin: true },
    });
    for (const [slug, name] of [
      ["demo", "Empresa Demo"],
      ["norte", "Distribuidora Norte"],
    ] as const) {
      const tenant = await tx.tenant.create({ data: { name, slug } });
      for (const role of ["admin", "recruiter", "area_manager"] as const) {
        const u = await tx.user.create({
          data: { email: `${role}@${slug}.test`, name: `${role} ${slug}`, passwordHash },
        });
        await tx.membership.create({ data: { tenantId: tenant.id, userId: u.id, role } });
      }
      const pipeline = await ensureDefaultPipeline(tx, tenant.id);
      // Solo la empresa de demostración trae vacantes publicadas; "norte" queda vacía para probar aislamiento.
      if (slug !== "demo") continue;
      // Clave publica fija de desarrollo para el sitio de pruebas (apps/demo-site). Nunca en produccion.
      await tx.apiKey.create({
        data: {
          tenantId: tenant.id,
          kind: "public",
          label: "Sitio de pruebas",
          publicKey: "pk_demo_local_0001",
          allowedOrigins: ["http://localhost:3100"],
        },
      });
      for (const d of demoVacancies) {
        await tx.vacancy.create({
          data: {
            tenantId: tenant.id,
            pipelineId: pipeline.id,
            title: d.title,
            department: d.department,
            summary: d.summary,
            requirementsRequired: `Mínimo ${d.minYears} año(s) de experiencia en funciones similares.`,
            benefits: "Seguro médico, bono de desempeño y capacitación continua.",
            category: d.category,
            level: d.level,
            employmentType: d.employmentType,
            workMode: d.workMode,
            province: d.province,
            municipality: d.municipality,
            minYears: d.minYears,
            languages: ["Español"],
            salaryMin: d.salary?.[0],
            salaryMax: d.salary?.[1],
            showSalary: Boolean(d.salary),
            status: "published",
            publishedAt: new Date(),
            skills: {
              create: d.skills.map((name) => ({
                tenantId: tenant.id,
                name,
                kind: "required" as const,
              })),
            },
          },
        });
      }
    }
  });
}
