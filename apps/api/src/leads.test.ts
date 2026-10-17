import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp } from "./test-helpers.js";

const LANDING = "https://landing.test";
let t: Awaited<ReturnType<typeof setupTestApp>>;
let app: ReturnType<Awaited<ReturnType<typeof setupTestApp>>["build"]>;
let root = "";
let adminA = "";
let n = 0;

const form = (over: Record<string, unknown> = {}) => ({
  name: "Laura Gómez",
  company: "Distribuidora Caribe",
  email: `laura${n++}@empresa.test`,
  phone: "8095550000",
  size: "11-50",
  message: "Queremos automatizar la preselección.",
  consent: true,
  captchaToken: "dev-ok",
  ...over,
});
const send = (body: object, origin: string | undefined = LANDING, a = app) =>
  a.inject({
    method: "POST",
    url: "/public/v1/leads",
    payload: body,
    headers: origin ? { origin } : {},
    remoteAddress: "203.0.113.20",
  });
const call = (cookie: string, method: "GET" | "PATCH", url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { cookie } });

beforeAll(async () => {
  t = await setupTestApp(5454);
  app = t.build({
    landingOrigin: LANDING,
    operatorEmail: "operador@plataforma.test",
    leadRateLimit: 100,
  });
  await t.addUser("root@x.com", null, undefined, true);
  await t.addUser("admin-a@x.com", "admin", t.tenants.a);
  const login = async (e: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: e, password: "contrasena-larga-1" },
    });
    return `sid=${r.cookies.find((c) => c.name === "sid")!.value}`;
  };
  root = await login("root@x.com");
  adminA = await login("admin-a@x.com");
}, 120_000);
afterAll(async () => {
  await app?.close();
  await t?.stop();
});

describe("POST /public/v1/leads", () => {
  it("crea la solicitud, avisa al operador y confirma al interesado", async () => {
    const body = form({ email: "ana@empresa.test" });
    const res = await send(body);
    expect(res.statusCode).toBe(201);
    expect(res.headers["access-control-allow-origin"]).toBe(LANDING);
    const lead = await t.prisma.lead.findFirstOrThrow({ where: { email: "ana@empresa.test" } });
    expect(lead).toMatchObject({
      company: "Distribuidora Caribe",
      status: "new",
      size: "11-50",
      ipTruncated: "203.0.113.0",
    });
    expect(lead.consentVersion).toMatch(/^landing-/);
    const op = t.mails.find((m) => m.to === "operador@plataforma.test");
    expect(op?.subject).toContain("Distribuidora Caribe");
    expect(op?.text).toContain("ana@empresa.test");
    expect(
      t.mails.some((m) => m.to === "ana@empresa.test" && m.subject.includes("Recibimos")),
    ).toBe(true);
  });

  it("valida campos, consentimiento y captcha", async () => {
    expect((await send(form({ name: "A" }))).statusCode).toBe(400);
    expect((await send(form({ email: "no-es-correo" }))).statusCode).toBe(400);
    expect((await send(form({ size: "1000000" }))).statusCode).toBe(400);
    const noConsent = await send(form({ consent: false }));
    expect(noConsent.statusCode).toBe(400);
    expect(noConsent.json().issues.join()).toMatch(/política de privacidad/);
    expect((await send(form({ captchaToken: "bot" }))).statusCode).toBe(400);
    expect((await send(form({ message: "x".repeat(1001) }))).statusCode).toBe(400);
  });

  it("solo acepta navegadores desde la landing (CORS) y no filtra el origen a otros", async () => {
    const evil = await send(form(), "https://evil.test");
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
    const pre = await app.inject({
      method: "OPTIONS",
      url: "/public/v1/leads",
      headers: {
        origin: LANDING,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers["access-control-allow-origin"]).toBe(LANDING);
  });

  it("el señuelo anti-bots simula éxito pero no guarda ni avisa; un reenvío no duplica", async () => {
    const before = await t.prisma.lead.count();
    const mailsBefore = t.mails.length;
    const bot = await send(form({ website: "http://spam.test", email: "bot@spam.test" }));
    expect(bot.statusCode).toBe(201);
    expect(await t.prisma.lead.count()).toBe(before);
    expect(t.mails.length).toBe(mailsBefore);
    const e = "repetido@empresa.test";
    await send(form({ email: e }));
    const second = await send(form({ email: e, name: "Otro Nombre" }));
    expect(second.statusCode).toBe(201);
    expect(await t.prisma.lead.count({ where: { email: e } })).toBe(1);
  });

  it("limita la tasa por IP", async () => {
    const limited = t.build({ landingOrigin: LANDING, leadRateLimit: 2 });
    const hit = () => send(form(), LANDING, limited).then((r) => r.statusCode);
    expect([await hit(), await hit(), await hit()]).toEqual([201, 201, 429]);
    await limited.close();
  });

  it("un fallo del correo del operador no hace perder la solicitud", async () => {
    const broken = t.build({
      landingOrigin: LANDING,
      operatorEmail: "op@x.test",
      mailer: {
        send: async () => {
          throw new Error("SMTP caído");
        },
      },
    });
    const res = await send(form({ email: "sobrevive@empresa.test" }), LANDING, broken);
    expect(res.statusCode).toBe(201);
    expect(await t.prisma.lead.count({ where: { email: "sobrevive@empresa.test" } })).toBe(1);
    await broken.close();
  });
});

describe("lista de solicitudes del super administrador", () => {
  it("solo el super admin ve y cambia el estado; admins de empresa y anónimos no", async () => {
    expect((await app.inject("/admin/leads")).statusCode).toBe(401);
    expect((await call(adminA, "GET", "/admin/leads")).statusCode).toBe(403);
    const list = (await call(root, "GET", "/admin/leads")).json() as {
      id: string;
      email: string;
      status: string;
    }[];
    expect(list.length).toBeGreaterThan(2);
    const id = list.find((l) => l.email === "ana@empresa.test")!.id;
    expect(
      (await call(adminA, "PATCH", `/admin/leads/${id}`, { status: "contacted" })).statusCode,
    ).toBe(403);
    const upd = await call(root, "PATCH", `/admin/leads/${id}`, {
      status: "demo_scheduled",
      notes: "Demo el jueves",
    });
    expect(upd.json()).toMatchObject({ status: "demo_scheduled", notes: "Demo el jueves" });
    expect(
      (await call(root, "PATCH", `/admin/leads/${id}`, { status: "inventado" })).statusCode,
    ).toBe(400);
    expect(
      (
        await call(root, "PATCH", "/admin/leads/00000000-0000-4000-8000-000000000000", {
          status: "converted",
        })
      ).statusCode,
    ).toBe(404);
    const filtered = (await call(root, "GET", "/admin/leads?status=demo_scheduled")).json() as {
      id: string;
    }[];
    expect(filtered.map((l) => l.id)).toEqual([id]);
  });
});
