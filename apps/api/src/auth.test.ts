import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrisma, migrateAndGrant, startEmbedded, withPlatform, type Role } from "@ats/db";
import { buildApp } from "./app.js";
import { hashPassword } from "./auth/crypto.js";

const PW = "contrasena-larga-1";
const mails: { to: string; text: string }[] = [];
const mailer = {
  send: async (to: string, _s: string, text: string) => void mails.push({ to, text }),
};
const tokenFrom = (to: string) =>
  new URL(mails.findLast((m) => m.to === to)!.text).searchParams.get("token")!;

let stop: () => Promise<void>;
let prisma: ReturnType<typeof createPrisma>;
let app: ReturnType<typeof buildApp>;
let tenantA: string;
let tenantB: string;
const ids: Record<string, string> = {};

async function addUser(email: string, role: Role | null, tenantId?: string, isSuperAdmin = false) {
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
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, payload, headers: { cookie } });

beforeAll(async () => {
  const e = await startEmbedded(join(tmpdir(), `ats-pg-api-${process.pid}`), 5445);
  stop = e.stop;
  await e.createDb("t");
  await migrateAndGrant(e.adminUrl("t"));
  prisma = createPrisma(e.appUrl("t"));
  app = buildApp({
    webOrigin: "http://localhost:3000",
    checks: {},
    logger: false,
    prisma,
    mailer,
    loginRateLimit: 1000,
  });
  await withPlatform(prisma, async (tx) => {
    tenantA = (await tx.tenant.create({ data: { name: "A", slug: "a", planKey: "enterprise" } }))
      .id;
    tenantB = (await tx.tenant.create({ data: { name: "B", slug: "b", planKey: "enterprise" } }))
      .id;
  });
  await addUser("root@x.com", null, undefined, true);
  await addUser("admin-a@x.com", "admin", tenantA);
  await addUser("rec-a@x.com", "recruiter", tenantA);
  await addUser("admin-b@x.com", "admin", tenantB);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await stop?.();
});

describe("login", () => {
  it("entra con credenciales correctas y fija cookie HttpOnly", async () => {
    const { res } = await login("admin-a@x.com");
    expect(res.statusCode).toBe(200);
    expect(res.cookies[0]).toMatchObject({ name: "sid", httpOnly: true, sameSite: "Lax" });
    expect(res.json()).toMatchObject({ role: "admin", tenantId: tenantA });
  });
  it("rechaza contraseña incorrecta y correo inexistente con el mismo mensaje", async () => {
    const a = await login("admin-a@x.com", "mala-contrasena");
    const b = await login("nadie@x.com");
    expect(a.res.statusCode).toBe(401);
    expect(b.res.json()).toEqual(a.res.json());
  });
  it("logout invalida la sesión", async () => {
    const { cookie } = await login("rec-a@x.com");
    await call(cookie, "POST", "/auth/logout");
    expect((await call(cookie, "GET", "/auth/me")).statusCode).toBe(401);
  });
});

describe("autorización por rol", () => {
  it("sin sesión: 401", async () => {
    expect((await app.inject("/users")).statusCode).toBe(401);
  });
  it("reclutador no gestiona usuarios", async () => {
    const { cookie } = await login("rec-a@x.com");
    expect((await call(cookie, "GET", "/users")).statusCode).toBe(403);
    expect(
      (await call(cookie, "POST", "/users/invitations", { email: "n@x.com", role: "recruiter" }))
        .statusCode,
    ).toBe(403);
  });
  it("ni admin ni reclutador gestionan tenants", async () => {
    for (const u of ["admin-a@x.com", "rec-a@x.com"]) {
      const { cookie } = await login(u);
      expect(
        (
          await call(cookie, "POST", "/admin/tenants", {
            name: "C",
            slug: "cc",
            adminEmail: "c@x.com",
          })
        ).statusCode,
      ).toBe(403);
      expect((await call(cookie, "GET", "/admin/tenants")).statusCode).toBe(403);
    }
  });
  it("el super admin no administra usuarios de un tenant", async () => {
    const { cookie } = await login("root@x.com");
    expect((await call(cookie, "GET", "/users")).statusCode).toBe(403);
  });
});

describe("aislamiento entre tenants", () => {
  it("el admin solo lista usuarios de su tenant", async () => {
    const { cookie } = await login("admin-a@x.com");
    const list = (await call(cookie, "GET", "/users")).json() as { email: string }[];
    expect(list.map((u) => u.email).sort()).toEqual(["admin-a@x.com", "rec-a@x.com"]);
  });
  it("no puede cambiar ni eliminar usuarios de otro tenant", async () => {
    const { cookie } = await login("admin-a@x.com");
    expect(
      (await call(cookie, "PATCH", `/users/${ids["admin-b@x.com"]}`, { role: "recruiter" }))
        .statusCode,
    ).toBe(404);
    expect((await call(cookie, "DELETE", `/users/${ids["admin-b@x.com"]}`)).statusCode).toBe(404);
  });
  it("no puede quitar al último administrador", async () => {
    const { cookie } = await login("admin-b@x.com");
    expect((await call(cookie, "DELETE", `/users/${ids["admin-b@x.com"]}`)).statusCode).toBe(409);
    expect(
      (await call(cookie, "PATCH", `/users/${ids["admin-b@x.com"]}`, { role: "recruiter" }))
        .statusCode,
    ).toBe(409);
  });
});

describe("alta de tenant e invitaciones", () => {
  it("super admin crea tenant, el admin acepta la invitación y entra", async () => {
    const root = (await login("root@x.com")).cookie;
    const created = await call(root, "POST", "/admin/tenants", {
      name: "Nueva",
      slug: "nueva",
      adminEmail: "dueno@x.com",
    });
    expect(created.statusCode).toBe(201);
    const token = tokenFrom("dueno@x.com");
    const accept = await app.inject({
      method: "POST",
      url: "/auth/invitations/accept",
      payload: { token, name: "Dueno", password: PW },
    });
    expect(accept.statusCode).toBe(204);
    expect((await login("dueno@x.com")).res.json()).toMatchObject({
      role: "admin",
      tenantId: created.json().id,
    });
    const again = await app.inject({
      method: "POST",
      url: "/auth/invitations/accept",
      payload: { token, name: "X", password: PW },
    });
    expect(again.statusCode).toBe(400);
  });
  it("el admin invita a un reclutador y queda auditado", async () => {
    const { cookie } = await login("admin-a@x.com");
    expect(
      (
        await call(cookie, "POST", "/users/invitations", {
          email: "nuevo@x.com",
          role: "recruiter",
        })
      ).statusCode,
    ).toBe(201);
    const logs = await withPlatform(prisma, (tx) =>
      tx.auditLog.findMany({ where: { tenantId: tenantA, action: "user.invited" } }),
    );
    expect(logs).toHaveLength(1);
  });
});

describe("recuperación de contraseña", () => {
  it("restablece con enlace de un solo uso y cierra sesiones", async () => {
    const { cookie } = await login("rec-a@x.com");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/auth/password/forgot",
          payload: { email: "rec-a@x.com" },
        })
      ).statusCode,
    ).toBe(204);
    const token = tokenFrom("rec-a@x.com");
    const reset = await app.inject({
      method: "POST",
      url: "/auth/password/reset",
      payload: { token, password: "otra-contrasena-2" },
    });
    expect(reset.statusCode).toBe(204);
    expect((await call(cookie, "GET", "/auth/me")).statusCode).toBe(401);
    expect((await login("rec-a@x.com", "otra-contrasena-2")).res.statusCode).toBe(200);
    const reuse = await app.inject({
      method: "POST",
      url: "/auth/password/reset",
      payload: { token, password: "tercera-contrasena-3" },
    });
    expect(reuse.statusCode).toBe(400);
  });
  it("no revela si el correo existe", async () => {
    const before = mails.length;
    const res = await app.inject({
      method: "POST",
      url: "/auth/password/forgot",
      payload: { email: "fantasma@x.com" },
    });
    expect(res.statusCode).toBe(204);
    expect(mails.length).toBe(before);
  });
});
