import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform } from "@ats/db";
import { NOTICE_VERSION } from "@ats/shared";
import { signClaim } from "./services/signed.js";
import { makePdf, multipart } from "./test-files.js";
import { setupTestApp, validVacancy } from "./test-helpers.js";

const SECRET = "secreto-de-prueba-para-firmar-urls";
let t: Awaited<ReturnType<typeof setupTestApp>>;
let app: ReturnType<Awaited<ReturnType<typeof setupTestApp>>["build"]>;
let adminA: string;
let recA: string;
let mgrA: string;
let mgr2A: string;
let adminB: string;
let vacancy: string;
let noAssessmentVacancy: string;
let n = 0;

const CV =
  "Desarrollador con 5 años de experiencia. Node.js, PostgreSQL y TypeScript. Implementé una API de pagos y lideré un proyecto.";
const fields = (vacancyId: string, over: Record<string, string> = {}) => ({
  vacancyId,
  fullName: "Laura Beltre Cruz",
  email: `laura${n++}@correo.test`,
  phone: "8095557777",
  location: "Santo Domingo",
  educationLevel: "Grado universitario",
  yearsExperience: "5",
  skills: "Node.js, PostgreSQL, TypeScript",
  consent: "true",
  noticeVersion: NOTICE_VERSION,
  captchaToken: "dev-ok",
  ...over,
});
async function apply(vacancyId: string, over: Record<string, string> = {}) {
  const m = multipart(fields(vacancyId, over), { name: "cv.pdf", data: makePdf(CV) });
  const res = await app.inject({
    method: "POST",
    url: "/public/v1/applications",
    payload: m.payload,
    headers: { "content-type": m.contentType, "x-public-key": t.keys.a, origin: t.origins.a },
  });
  await app.queue.drain();
  return withPlatform(t.prisma, (tx) =>
    tx.application.findUniqueOrThrow({
      where: { trackingId: res.json().trackingId },
      include: { documents: true },
    }),
  );
}
const history = (id: string) =>
  withPlatform(t.prisma, (tx) =>
    tx.applicationStageHistory.findMany({
      where: { applicationId: id },
      orderBy: { createdAt: "asc" },
    }),
  );

beforeAll(async () => {
  t = await setupTestApp(5449);
  app = t.build({ signingSecret: SECRET });
  await t.addUser("admin-a@x.com", "admin", t.tenants.a);
  await t.addUser("rec-a@x.com", "recruiter", t.tenants.a);
  await t.addUser("mgr-a@x.com", "area_manager", t.tenants.a);
  await t.addUser("mgr2-a@x.com", "area_manager", t.tenants.a);
  await t.addUser("admin-b@x.com", "admin", t.tenants.b);
  const login = async (e: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: e, password: "contrasena-larga-1" },
    });
    return `sid=${r.cookies.find((c) => c.name === "sid")!.value}`;
  };
  const c = await Promise.all(
    ["admin-a", "rec-a", "mgr-a", "mgr2-a", "admin-b"].map((u) => login(`${u}@x.com`)),
  );
  [adminA, recA, mgrA, mgr2A, adminB] = [c[0]!, c[1]!, c[2]!, c[3]!, c[4]!];
  const mk = async (over: Record<string, unknown>) => {
    const v = (
      await t.call(
        adminA,
        "POST",
        "/vacancies",
        validVacancy({
          category: "technical",
          minYears: 3,
          requiredSkills: ["Node.js", "PostgreSQL", "TypeScript"],
          ...over,
        }),
      )
    ).json();
    await t.call(adminA, "POST", `/vacancies/${v.id}/status`, { status: "published" });
    return v.id as string;
  };
  vacancy = await mk({ title: "Con embudo completo", ownerId: t.ids["mgr-a@x.com"] });
  const pipe = await t.call(adminA, "POST", "/pipelines", {
    name: "Sin examen",
    stages: [
      { name: "Preselección", type: "screening" },
      { name: "Entrevista", type: "interview" },
      { name: "Contratación", type: "hiring" },
    ],
  });
  noAssessmentVacancy = await mk({ title: "Sin examen", pipelineId: pipe.json().id });
}, 120_000);
afterAll(async () => {
  await app?.close();
  await t?.stop();
});

const call = (cookie: string, method: "GET" | "POST", url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { cookie } });

describe("mover manualmente", () => {
  it("el reclutador mueve a cualquier etapa activa y queda historial manual con autor", async () => {
    const a = await apply(vacancy);
    const res = await call(recA, "POST", `/applications/${a.id}/move`, { status: "interview" });
    expect(res.json()).toMatchObject({ status: "interview" });
    const last = (await history(a.id)).at(-1)!;
    expect(last).toMatchObject({
      toStatus: "interview",
      automatic: false,
      actorId: t.ids["rec-a@x.com"],
    });
    // puede saltarse etapas: el embudo es una guía
    expect(
      (await call(recA, "POST", `/applications/${a.id}/move`, { status: "selection" })).statusCode,
    ).toBe(200);
  });

  it("el responsable de área no mueve; otro tenant no ve la postulación; no se puede forzar 'contratada'", async () => {
    const a = await apply(vacancy);
    expect(
      (await call(mgrA, "POST", `/applications/${a.id}/move`, { status: "interview" })).statusCode,
    ).toBe(403);
    expect(
      (await call(adminB, "POST", `/applications/${a.id}/move`, { status: "interview" }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call(recA, "POST", `/applications/${a.id}/move`, { status: "hired" })).statusCode,
    ).toBe(400);
    expect(
      (await call(recA, "POST", `/applications/${a.id}/move`, { status: "inventada" })).statusCode,
    ).toBe(400);
  });

  it("los descartes exigen motivo y no se puede ir a una etapa desactivada del embudo", async () => {
    const a = await apply(vacancy);
    expect(
      (await call(recA, "POST", `/applications/${a.id}/move`, { status: "not_selected" }))
        .statusCode,
    ).toBe(422);
    expect(
      (
        await call(recA, "POST", `/applications/${a.id}/move`, {
          status: "not_selected",
          reason: "Perfil no encaja con el equipo",
        })
      ).statusCode,
    ).toBe(200);
    const b = await apply(noAssessmentVacancy);
    const res = await call(recA, "POST", `/applications/${b.id}/move`, { status: "assessment" });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toContain("no está activa");
  });
});

describe("revertir descartes", () => {
  it("revierte un descarte automático o manual con registro de quién y por qué", async () => {
    const weak = await apply(vacancy, {
      skills: "Excel",
      yearsExperience: "0",
      educationLevel: "Secundaria",
      location: "Puerto Plata",
    });
    expect(weak.status).toBe("low_fit");
    const res = await call(recA, "POST", `/applications/${weak.id}/revert`, {
      reason: "Tiene experiencia relevante en el CV",
    });
    expect(res.json()).toMatchObject({ status: "in_review" });
    const last = (await history(weak.id)).at(-1)!;
    expect(last).toMatchObject({
      fromStatus: "low_fit",
      toStatus: "in_review",
      automatic: false,
      actorId: t.ids["rec-a@x.com"],
    });
    expect(last.reason).toContain("Descarte revertido");
    const audit = await withPlatform(t.prisma, (tx) =>
      tx.auditLog.count({ where: { action: "application.discard_reverted", target: weak.id } }),
    );
    expect(audit).toBe(1);
    expect((await call(recA, "POST", `/applications/${weak.id}/revert`)).statusCode).toBe(409); // ya no está descartada
  });
  it("solo roles autorizados y del mismo tenant", async () => {
    const weak = await apply(vacancy, {
      skills: "Excel",
      yearsExperience: "0",
      educationLevel: "Secundaria",
      location: "Puerto Plata",
    });
    expect((await call(mgrA, "POST", `/applications/${weak.id}/revert`)).statusCode).toBe(403);
    expect((await call(adminB, "POST", `/applications/${weak.id}/revert`)).statusCode).toBe(404);
  });
});

describe("notas", () => {
  it("RRHH y el responsable asignado escriben y leen; el no asignado y otro tenant no", async () => {
    const a = await apply(vacancy);
    expect(
      (
        await call(recA, "POST", `/applications/${a.id}/notes`, {
          body: "Buena entrevista telefónica",
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await call(mgrA, "POST", `/applications/${a.id}/notes`, { body: "Me parece sólido" }))
        .statusCode,
    ).toBe(201);
    const notes = (await call(adminA, "GET", `/applications/${a.id}/notes`)).json() as {
      body: string;
      author: string;
    }[];
    expect(notes.map((x) => x.body).sort()).toEqual([
      "Buena entrevista telefónica",
      "Me parece sólido",
    ]);
    expect(
      (await call(mgr2A, "POST", `/applications/${a.id}/notes`, { body: "x" })).statusCode,
    ).toBe(404);
    expect((await call(mgr2A, "GET", `/applications/${a.id}/notes`)).statusCode).toBe(404);
    expect((await call(adminB, "GET", `/applications/${a.id}/notes`)).statusCode).toBe(404);
    expect(
      (await call(recA, "POST", `/applications/${a.id}/notes`, { body: "  " })).statusCode,
    ).toBe(400);
  });
});

describe("descarga firmada del CV", () => {
  it("genera una URL de corta duración, la audita y entrega el archivo como descarga", async () => {
    const a = await apply(vacancy);
    const u = await call(recA, "GET", `/applications/${a.id}/documents/${a.documents[0]!.id}/url`);
    expect(u.statusCode).toBe(200);
    expect(u.json().expiresInSeconds).toBe(60);
    const file = await app.inject(u.json().url);
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-disposition"]).toContain("attachment");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const audit = await withPlatform(t.prisma, (tx) =>
      tx.auditLog.count({ where: { action: "document.accessed", target: a.documents[0]!.id } }),
    );
    expect(audit).toBe(1);
  });
  it("rechaza tokens manipulados, vencidos o de otro documento", async () => {
    const a = await apply(vacancy);
    const doc = a.documents[0]!;
    const good = signClaim({ doc: doc.id, tenant: t.tenants.a, exp: Date.now() + 60_000 }, SECRET);
    expect((await app.inject(`/files/${good}`)).statusCode).toBe(200);
    const expired = signClaim({ doc: doc.id, tenant: t.tenants.a, exp: Date.now() - 1 }, SECRET);
    expect((await app.inject(`/files/${expired}`)).statusCode).toBe(403);
    expect((await app.inject(`/files/${good.slice(0, -2)}xx`)).statusCode).toBe(403);
    const forged = signClaim(
      { doc: doc.id, tenant: t.tenants.a, exp: Date.now() + 60_000 },
      "otro-secreto",
    );
    expect((await app.inject(`/files/${forged}`)).statusCode).toBe(403);
    // un token del tenant B no abre un documento del tenant A (RLS + tenant en el token)
    const cross = signClaim({ doc: doc.id, tenant: t.tenants.b, exp: Date.now() + 60_000 }, SECRET);
    expect((await app.inject(`/files/${cross}`)).statusCode).toBe(404);
  });
  it("permisos: el no asignado y otro tenant no obtienen la URL", async () => {
    const a = await apply(vacancy);
    const url = `/applications/${a.id}/documents/${a.documents[0]!.id}/url`;
    expect((await call(mgr2A, "GET", url)).statusCode).toBe(404);
    expect((await call(adminB, "GET", url)).statusCode).toBe(404);
    expect((await call(mgrA, "GET", url)).statusCode).toBe(200);
  });
});
