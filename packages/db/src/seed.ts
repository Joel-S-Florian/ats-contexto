import argon2 from "argon2";
import { withPlatform, type PrismaClient } from "./index.js";

/** Datos sintéticos de desarrollo: super admin y dos tenants para probar aislamiento. Contraseña: "demo-demo-1234". */
export async function seed(prisma: PrismaClient) {
  const passwordHash = await argon2.hash("demo-demo-1234", { type: argon2.argon2id });
  await withPlatform(prisma, async (tx) => {
    if (await tx.user.findUnique({ where: { email: "root@demo.test" } })) return;
    await tx.user.create({
      data: { email: "root@demo.test", name: "Operador", passwordHash, isSuperAdmin: true },
    });
    const people: [string, string, "admin" | "recruiter" | "area_manager"][] = [
      ["demo", "Empresa Demo", "admin"],
      ["norte", "Distribuidora Norte", "admin"],
    ];
    for (const [slug, name] of people) {
      const tenant = await tx.tenant.create({ data: { name, slug } });
      for (const role of ["admin", "recruiter", "area_manager"] as const) {
        const u = await tx.user.create({
          data: { email: `${role}@${slug}.test`, name: `${role} ${slug}`, passwordHash },
        });
        await tx.membership.create({ data: { tenantId: tenant.id, userId: u.id, role } });
      }
    }
  });
}
