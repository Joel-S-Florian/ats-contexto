import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrisma, migrateAndGrant, startEmbedded, withPlatform, type Role } from "@ats/db";
import { buildApp } from "./app.js";
import { hashPassword } from "./auth/crypto.js";

export const PW = "contrasena-larga-1";

/** Levanta Postgres embebido con dos tenants (a, b) y la app lista para `inject`. */
export async function setupTestApp(port: number) {
  const e = await startEmbedded(join(tmpdir(), `ats-pg-api-${process.pid}-${port}`), port);
  await e.createDb("t");
  await migrateAndGrant(e.adminUrl("t"));
  const prisma = createPrisma(e.appUrl("t"));
  const mails: { to: string; text: string }[] = [];
  const mailer = {
    send: async (to: string, _s: string, text: string) => void mails.push({ to, text }),
  };
  const app = buildApp({
    webOrigin: "http://localhost:3000",
    checks: {},
    logger: false,
    prisma,
    mailer,
    loginRateLimit: 1000,
  });
  const ids: Record<string, string> = {};
  const tenants = await withPlatform(prisma, async (tx) => ({
    a: (await tx.tenant.create({ data: { name: "Empresa A", slug: "a" } })).id,
    b: (await tx.tenant.create({ data: { name: "Empresa B", slug: "b" } })).id,
  }));

  async function addUser(
    email: string,
    role: Role | null,
    tenantId?: string,
    isSuperAdmin = false,
  ) {
    const passwordHash = await hashPassword(PW);
    return withPlatform(prisma, async (tx) => {
      const u = await tx.user.create({ data: { email, name: email, passwordHash, isSuperAdmin } });
      if (role && tenantId) await tx.membership.create({ data: { tenantId, userId: u.id, role } });
      ids[email] = u.id;
      return u;
    });
  }
  async function login(email: string, password = PW) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    const cookie = res.cookies.find((c) => c.name === "sid");
    return { res, cookie: cookie ? `sid=${cookie.value}` : "" };
  }
  const call = (
    cookie: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    url: string,
    payload?: object,
  ) => app.inject({ method, url, payload, headers: { cookie } });

  return {
    app,
    prisma,
    mails,
    ids,
    tenants,
    addUser,
    login,
    call,
    stop: async () => {
      await app.close();
      await prisma.$disconnect();
      await e.stop();
    },
  };
}

export const validVacancy = (over: Record<string, unknown> = {}) => ({
  title: "Desarrollador Backend",
  department: "Tecnología",
  summary: "Construir y mantener APIs.",
  level: "semi_senior",
  employmentType: "full_time",
  workMode: "hybrid",
  province: "Santo Domingo",
  municipality: "Distrito Nacional",
  requiredSkills: ["Node.js", "PostgreSQL"],
  desirableSkills: ["Docker"],
  benefits: "Seguro médico",
  ...over,
});
