import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mockProvider } from "@ats/ai";
import { withPlatform } from "@ats/db";
import { NOTICE_VERSION, plans } from "@ats/shared";
import { makePdf, multipart } from "./test-files.js";
import { setupTestApp, validVacancy } from "./test-helpers.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;
let app: ReturnType<Awaited<ReturnType<typeof setupTestApp>>["build"]>;
let root: string, adminA: string, recA: string, adminB: string;
let noticeVersion = NOTICE_VERSION;
let n = 0;
const month = new Date().toISOString().slice(0, 7);
const CV =
  "Desarrollador con 5 años de experiencia. Node.js, PostgreSQL y TypeScript. Implementé una API de pagos y lideré un proyecto.";

const call = (
  cookie: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, payload, headers: { cookie } });
const setPlan = (tenantId: string, planKey: string, extra: object = {}) =>
  call(root, "PATCH", `/admin/tenants/${tenantId}/plan`, { planKey, ...extra });

async function post(
  key: string,
  origin: string,
  vacancyId: string | undefined,
  over: Record<string, string> = {},
  text = CV,
) {
  const f = {
    ...(vacancyId ? { vacancyId } : {}),
    fullName: "Rafael Montás Reyes",
    email: `rafael${n++}@correo.test`,
    phone: "8095554545",
    location: "Santo Domingo",
    educationLevel: "Grado universitario",
    yearsExperience: "5",
    skills: "Node.js, PostgreSQL, TypeScript",
    consent: "true",
    noticeVersion,
    captchaToken: "dev-ok",
    ...over,
  };
  const m = multipart(f, { name: "cv.pdf", data: makePdf(text) });
  return app.inject({
    method: "POST",
    url: "/public/v1/applications",
    payload: m.payload,
    headers: { "content-type": m.contentType, "x-public-key": key, origin },
  });
}
const applyA = async (vacancyId?: string, over: Record<string, string> = {}) => {
  const res = await post(t.keys.a, t.origins.a, vacancyId, over);
  await app.queue.drain();
  return res;
};
const row = (trackingId: string) =>
  withPlatform(t.prisma, (tx) =>
    tx.application.findUniqueOrThrow({
      where: { trackingId },
      include: { candidate: true, documents: true },
    }),
  );
const setCounter = (tenantId: string, data: { applications?: number; aiAnalyses?: number }) =>
  withPlatform(t.prisma, (tx) =>
    tx.usageCounter.upsert({
      where: { tenantId_month: { tenantId, month } },
      create: { tenantId, month, ...data },
      update: data,
    }),
  );

beforeAll(async () => {
  t = await setupTestApp(5453);
  app = t.build({ ai: { provider: mockProvider() } });
  await t.addUser("root@x.com", null, undefined, true);
  await t.addUser("admin-a@x.com", "admin", t.tenants.a);
  await t.addUser("rec-a@x.com", "recruiter", t.tenants.a);
  await t.addUser("admin-b@x.com", "admin", t.tenants.b);
  const login = async (e: string) => {
    const r = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: e, password: "contrasena-larga-1" },
    });
    return `sid=${r.cookies.find((c) => c.name === "sid")!.value}`;
  };
  [root, adminA, recA, adminB] = (await Promise.all(
    ["root", "admin-a", "rec-a", "admin-b"].map((u) => login(`${u}@x.com`)),
  )) as [string, string, string, string];
}, 120_000);
afterAll(async () => {
  await app?.close();
  await t?.stop();
});

const mkVacancy = async (cookie: string, title: string, publish = true) => {
  const v = (
    await call(
      cookie,
      "POST",
      "/vacancies",
      validVacancy({
        title,
        category: "technical",
        minYears: 3,
        requiredSkills: ["Node.js", "PostgreSQL", "TypeScript"],
      }),
    )
  ).json();
  const s = publish
    ? await call(cookie, "POST", `/vacancies/${v.id}/status`, { status: "published" })
    : null;
  return { id: v.id as string, publish: s };
};

describe("asignación de planes y uso", () => {
  it("solo el operador asigna planes; la asignación ajusta IA y cuota; otros tenants no cambian", async () => {
    expect(
      (await call(adminA, "PATCH", `/admin/tenants/${t.tenants.a}/plan`, { planKey: "essential" }))
        .statusCode,
    ).toBe(403);
    expect(
      (await call(root, "PATCH", `/admin/tenants/${t.tenants.a}/plan`, { planKey: "gratis" }))
        .statusCode,
    ).toBe(400);
    const res = await call(root, "PATCH", `/admin/tenants/${t.tenants.b}/plan`, {
      planKey: "professional",
      extraAiAnalyses: 100,
    });
    expect(res.json()).toMatchObject({
      planKey: "professional",
      aiMonthlyQuota: plans.professional.limits.aiAnalysesPerMonth + 100,
    });
    const b = await withPlatform(t.prisma, (tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: t.tenants.b } }),
    );
    expect(b).toMatchObject({ planKey: "professional", screeningMode: "ai", aiMonthlyQuota: 400 });
    expect((await setPlan(t.tenants.a, "essential")).statusCode).toBe(200);
    const a = await withPlatform(t.prisma, (tx) =>
      tx.tenant.findUniqueOrThrow({ where: { id: t.tenants.a } }),
    );
    expect(a).toMatchObject({ planKey: "essential", screeningMode: "rules", aiMonthlyQuota: 0 });
  });

  it("el administrador ve su consumo contra los límites; los demás roles no", async () => {
    const u = (await call(adminA, "GET", "/usage")).json();
    expect(u.plan).toMatchObject({ key: "essential", name: "Esencial" });
    expect(u.items.map((i: { key: string; limit: number }) => [i.key, i.limit])).toEqual([
      ["activeVacancies", 3],
      ["applicationsPerMonth", 100],
      ["users", 2],
      ["aiAnalysesPerMonth", 0],
    ]);
    expect((await call(recA, "GET", "/usage")).statusCode).toBe(403);
    const all = (await call(root, "GET", "/admin/usage")).json() as {
      slug: string;
      plan: string;
    }[];
    expect(all.find((x) => x.slug === "b")!.plan).toBe("Profesional");
    expect((await call(adminA, "GET", "/admin/usage")).statusCode).toBe(403);
  });
});

describe("límites del plan Esencial", () => {
  it("vacantes activas: el cuarto publicar se rechaza con mensaje claro; cerrar libera un cupo; los borradores no cuentan", async () => {
    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) ids.push((await mkVacancy(adminA, `Vacante ${i}`)).id);
    const fourth = await mkVacancy(adminA, "Vacante 4");
    expect(fourth.publish!.statusCode).toBe(403);
    expect(fourth.publish!.json()).toMatchObject({ code: "plan_limit" });
    expect(fourth.publish!.json().error).toContain("Esencial permite 3");
    await call(adminA, "POST", `/vacancies/${ids[0]}/status`, { status: "closed" });
    expect(
      (await call(adminA, "POST", `/vacancies/${fourth.id}/status`, { status: "published" }))
        .statusCode,
    ).toBe(200);
    // pausar y reactivar no consume otro cupo
    expect(
      (await call(adminA, "POST", `/vacancies/${fourth.id}/status`, { status: "paused" }))
        .statusCode,
    ).toBe(200);
    expect(
      (await call(adminA, "POST", `/vacancies/${fourth.id}/status`, { status: "published" }))
        .statusCode,
    ).toBe(200);
  });

  it("usuarios: no se pueden invitar más allá del límite (cuentan las invitaciones pendientes)", async () => {
    const res = await call(adminA, "POST", "/users/invitations", {
      email: "extra@x.com",
      role: "recruiter",
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: "plan_limit" });
    expect(res.json().error).toContain("Esencial permite 2");
    // el plan Empresa del otro tenant sí lo permite
    expect(
      (await call(adminB, "POST", "/users/invitations", { email: "otro@x.com", role: "recruiter" }))
        .statusCode,
    ).toBe(201);
  });

  it("funciones: sin IA, sin webhooks, un solo examen y embudo fijo", async () => {
    expect(
      (
        await call(root, "PATCH", `/admin/tenants/${t.tenants.a}/screening`, {
          mode: "ai",
          aiMonthlyQuota: 10,
        })
      ).statusCode,
    ).toBe(409);

    const wh = await call(adminA, "POST", "/webhook-endpoints", {
      url: "https://93.184.216.34/hook",
    });
    expect(wh.statusCode).toBe(403);
    expect(wh.json()).toMatchObject({ code: "plan_feature" });

    const exam = {
      name: "Examen 1",
      timeLimitMin: 10,
      passingScore: 50,
      modules: [
        {
          title: "M",
          questions: [
            {
              type: "true_false",
              prompt: "Node.js usa JavaScript.",
              correctAnswer: true,
              points: 1,
            },
          ],
        },
      ],
    };
    expect((await call(recA, "POST", "/assessment-templates", exam)).statusCode).toBe(201);
    const second = await call(recA, "POST", "/assessment-templates", { ...exam, name: "Examen 2" });
    expect(second.statusCode).toBe(403);
    expect(second.json().error).toContain("1 plantilla");

    const pipes = (await call(adminA, "GET", "/pipelines")).json();
    expect(
      (
        await call(adminA, "POST", "/pipelines", {
          name: "Otro",
          stages: [
            { name: "Preselección", type: "screening" },
            { name: "Contratación", type: "hiring" },
          ],
        })
      ).statusCode,
    ).toBe(403);
    const same = pipes[0].stages.map((s: { name: string; type: string; enabled: boolean }) => ({
      name: s.name,
      type: s.type,
      enabled: s.type === "assessment" ? false : s.enabled,
    }));
    expect(
      (
        await call(adminA, "PUT", `/pipelines/${pipes[0].id}`, {
          name: pipes[0].name,
          stages: same,
        })
      ).statusCode,
    ).toBe(200); // activar/desactivar etapas sí
    const changed = [...same, { name: "Extra", type: "custom", enabled: true }];
    expect(
      (
        await call(adminA, "PUT", `/pipelines/${pipes[0].id}`, {
          name: "x",
          stages: [changed[0], changed[4]],
        })
      ).statusCode,
    ).toBe(403); // cambiar la estructura no
  });

  it("postulaciones del mes: avisa al 80 % y al 100 % (una vez) y luego rechaza con un mensaje para el candidato", async () => {
    const vac = (await call(adminA, "GET", "/vacancies?status=published")).json()[0].id as string;
    await setCounter(t.tenants.a, { applications: 79 });
    const alerts = () =>
      t.mails.filter(
        (m) => m.to === "admin-a@x.com" && m.subject.startsWith("Uso del plan: Postulaciones"),
      );

    expect((await applyA(vac)).statusCode).toBe(202); // 80
    await vi.waitFor(() => expect(alerts()).toHaveLength(1)); // el aviso sale en segundo plano
    expect(alerts()[0]!.subject).toContain("80%");
    expect((await applyA(vac)).statusCode).toBe(202); // 81: no repite el aviso
    await new Promise((r) => setTimeout(r, 300));
    expect(alerts()).toHaveLength(1);

    await setCounter(t.tenants.a, { applications: 99 });
    expect((await applyA(vac)).statusCode).toBe(202); // 100
    await vi.waitFor(() => expect(alerts().at(-1)!.subject).toContain("100%"));
    const blocked = await applyA(vac);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ code: "applications_closed" });
    expect(blocked.json().error).not.toContain("plan"); // al candidato no se le habla del plan
    // el mismo candidato reenviando no cuenta como una nueva postulación
    const dupEmail = "repetido@correo.test";
    await setCounter(t.tenants.a, { applications: 50 });
    const first = await applyA(vac, { email: dupEmail });
    await setCounter(t.tenants.a, { applications: 100 });
    expect((await applyA(vac, { email: dupEmail })).statusCode).toBe(200); // duplicado: devuelve la existente
    expect(first.statusCode).toBe(202);
  });

  it("subir de plan levanta los límites al instante", async () => {
    await setPlan(t.tenants.a, "enterprise");
    const v = await mkVacancy(adminA, "Vacante extra");
    expect(v.publish!.statusCode).toBe(200);
    expect(
      (
        await call(adminA, "POST", "/users/invitations", {
          email: "ahora@x.com",
          role: "recruiter",
        })
      ).statusCode,
    ).toBe(201);
  });
});

describe("planes con IA: cuota agotada cae a reglas y avisa", () => {
  it("al 100 % de análisis de IA la preselección sigue con reglas y se avisa al administrador", async () => {
    await setPlan(t.tenants.a, "professional");
    await setCounter(t.tenants.a, { applications: 0, aiAnalyses: 300 });
    const vac = (await call(adminA, "GET", "/vacancies?status=published")).json()[0].id as string;
    const res = await applyA(vac);
    expect(res.statusCode).toBe(202);
    const a = await row(res.json().trackingId);
    const sr = await withPlatform(t.prisma, (tx) =>
      tx.screeningResult.findFirst({ where: { applicationId: a.id } }),
    );
    expect(sr).toMatchObject({ mode: "rules" });
    expect(JSON.stringify(sr!.notes)).toContain("Cuota mensual");
    // y el administrador recibe el aviso de que el cupo de IA se agotó (explica que sigue con reglas)
    await vi.waitFor(() =>
      expect(
        t.mails.find(
          (m) => m.to === "admin-a@x.com" && m.subject.includes("Análisis de IA del mes al 100%"),
        )?.text,
      ).toContain("con reglas"),
    );
  });
});

describe("retención, exportación y eliminación", () => {
  let vac: string;
  const old = (id: string, months: number) =>
    withPlatform(t.prisma, (tx) =>
      tx.application.update({
        where: { id },
        data: { updatedAt: new Date(Date.now() - months * 31 * 86400_000) },
      }),
    );

  beforeAll(async () => {
    await setPlan(t.tenants.a, "enterprise");
    await setCounter(t.tenants.a, { applications: 0, aiAnalyses: 0 });
    vac = (await call(adminA, "GET", "/vacancies?status=published")).json()[0].id;
  });

  it("la tarea de retención anonimiza datos vencidos y conserva lo estadístico; respeta a los contratados y los plazos por empresa", async () => {
    const oldOne = await row(
      (await applyA(vac, { fullName: "Vieja Postulante Pérez" })).json().trackingId,
    );
    const recent = await row(
      (await applyA(vac, { fullName: "Reciente Postulante Cruz" })).json().trackingId,
    );
    const hired = await row(
      (await applyA(vac, { fullName: "Contratada Antigua Soto" })).json().trackingId,
    );
    await call(recA, "POST", `/applications/${oldOne.id}/notes`, {
      body: "Nota con datos personales",
    });
    const blobKey = oldOne.documents[0]!.storageKey;
    await call(recA, "POST", `/applications/${hired.id}/move`, { status: "selection" });
    await call(recA, "POST", `/applications/${hired.id}/selection`, {
      decision: "selected",
      reason: "ok",
    });
    await call(recA, "POST", `/applications/${hired.id}/hire`, { confirm: true });
    await old(oldOne.id, 14);
    await old(hired.id, 14);

    const r = await app.privacy.processRetention();
    expect(r.anonymized).toBeGreaterThanOrEqual(1);

    const o = await row(oldOne.trackingId);
    expect(o.candidate).toMatchObject({
      fullName: "Candidato anonimizado",
      phone: "",
      location: "",
      skills: [],
    });
    expect(o.candidate.email).toContain("@anonimizado.invalid");
    expect(o.candidate.anonymizedAt).not.toBeNull();
    expect(o.documents[0]).toMatchObject({ extractedText: null, storageKey: "deleted" });
    await expect(t.storeGet(blobKey)).rejects.toThrow(); // el archivo se borró de verdad
    expect(
      await withPlatform(t.prisma, (tx) =>
        tx.applicationNote.count({ where: { applicationId: oldOne.id } }),
      ),
    ).toBe(0);
    expect(o.status).toBe(oldOne.status); // el estado y el historial se conservan
    const sr = await withPlatform(t.prisma, (tx) =>
      tx.screeningResult.findFirst({ where: { applicationId: oldOne.id } }),
    );
    expect(JSON.stringify(sr!.dimensions)).not.toContain("Node.js 5");
    expect(sr!.overall).not.toBeNull();

    expect((await row(recent.trackingId)).candidate.fullName).toBe("Reciente Postulante Cruz");
    expect((await row(hired.trackingId)).candidate.fullName).toBe("Contratada Antigua Soto");
    expect(
      await withPlatform(t.prisma, (tx) =>
        tx.auditLog.count({ where: { action: "retention.anonymized" } }),
      ),
    ).toBeGreaterThanOrEqual(1);
  });

  it("el plazo es configurable por empresa y solo lo cambia el administrador", async () => {
    expect(
      (await call(recA, "PATCH", "/settings/privacy", { retentionMonths: 3 })).statusCode,
    ).toBe(403);
    expect(
      (await call(adminA, "PATCH", "/settings/privacy", { retentionMonths: 0 })).statusCode,
    ).toBe(400);
    expect((await call(adminA, "GET", "/settings/privacy")).json()).toEqual({
      retentionMonths: 12,
    });
    await call(adminA, "PATCH", "/settings/privacy", { retentionMonths: 2 });
    const mid = await row(
      (await applyA(vac, { fullName: "Tres Meses Atrás Díaz" })).json().trackingId,
    );
    await old(mid.id, 3);
    await app.privacy.processRetention();
    expect((await row(mid.trackingId)).candidate.fullName).toBe("Candidato anonimizado");
    await call(adminA, "PATCH", "/settings/privacy", { retentionMonths: 12 });
  });

  it("exporta todos los datos de una persona en JSON; roles y tenant restringidos; queda auditado", async () => {
    const a = await row(
      (await applyA(vac, { fullName: "Exportable Persona Gil" })).json().trackingId,
    );
    await call(recA, "POST", `/applications/${a.id}/communications`, {
      type: "call",
      summary: "x",
    });
    const ok = await call(recA, "GET", `/candidates/${a.candidateId}/export`);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-disposition"]).toContain("attachment");
    const d = ok.json();
    expect(d).toMatchObject({
      schema_version: "1.0",
      candidate: { full_name: "Exportable Persona Gil" },
    });
    expect(d.applications[0]).toMatchObject({ tracking_id: a.trackingId });
    expect(d.applications[0].history.length).toBeGreaterThan(0);
    expect(d.applications[0].documents[0].extracted_text).toContain("Node.js");
    expect(d.applications[0].consents[0].notice_version).toBe(NOTICE_VERSION);
    expect((await call(adminB, "GET", `/candidates/${a.candidateId}/export`)).statusCode).toBe(404);
    expect(
      await withPlatform(t.prisma, (tx) =>
        tx.auditLog.count({ where: { action: "candidate.exported", target: a.candidateId } }),
      ),
    ).toBe(1);
  });

  it("elimina los datos a pedido: solo el administrador, no a contratados, una sola vez y sin cruzar tenants", async () => {
    const a = await row(
      (await applyA(vac, { fullName: "Eliminable Persona Rey" })).json().trackingId,
    );
    expect((await call(recA, "DELETE", `/candidates/${a.candidateId}`)).statusCode).toBe(403);
    expect((await call(adminB, "DELETE", `/candidates/${a.candidateId}`)).statusCode).toBe(404);
    const res = await call(adminA, "DELETE", `/candidates/${a.candidateId}`);
    expect(res.json()).toEqual({ applications: 1, files: 1 });
    await expect(t.storeGet(a.documents[0]!.storageKey)).rejects.toThrow();
    expect((await row(a.trackingId)).candidate.fullName).toBe("Candidato anonimizado");
    expect((await call(adminA, "DELETE", `/candidates/${a.candidateId}`)).statusCode).toBe(409);
    const exported = (await call(adminA, "GET", `/candidates/${a.candidateId}/export`)).json();
    expect(exported.candidate.anonymized_at).not.toBeNull();
    expect(JSON.stringify(exported)).not.toContain("Eliminable");

    const h = await row(
      (await applyA(vac, { fullName: "Contratado Intocable Paz" })).json().trackingId,
    );
    await call(recA, "POST", `/applications/${h.id}/move`, { status: "selection" });
    await call(recA, "POST", `/applications/${h.id}/selection`, {
      decision: "selected",
      reason: "ok",
    });
    await call(recA, "POST", `/applications/${h.id}/hire`, { confirm: true });
    const refused = await call(adminA, "DELETE", `/candidates/${h.candidateId}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: "candidate_hired" });
  });
});

describe("aviso de tratamiento de datos versionado", () => {
  it("el super admin publica una versión nueva; la anterior deja de aceptarse en el formulario", async () => {
    const cur = (await app.inject("/public/v1/notice")).json();
    expect(cur.version).toBe(NOTICE_VERSION);
    expect(
      (
        await call(adminA, "POST", "/admin/notice-versions", {
          title: "Nuevo aviso",
          body: ["Texto del aviso nuevo para pruebas."],
        })
      ).statusCode,
    ).toBe(403);
    const created = await call(root, "POST", "/admin/notice-versions", {
      title: "Aviso de tratamiento de datos",
      body: ["Primer párrafo del aviso actualizado.", "Segundo párrafo."],
    });
    expect(created.statusCode).toBe(201);
    const next = (await app.inject("/public/v1/notice")).json();
    expect(next.version).toBe(created.json().label);
    expect(next.body).toHaveLength(2);

    const vac = (await call(adminA, "GET", "/vacancies?status=published")).json()[0].id as string;
    const stale = await post(t.keys.a, t.origins.a, vac, { noticeVersion: NOTICE_VERSION });
    expect(stale.statusCode).toBe(409);
    noticeVersion = next.version;
    const fresh = await applyA(vac);
    expect(fresh.statusCode).toBe(202);
    const a = await row(fresh.json().trackingId);
    const consent = await withPlatform(t.prisma, (tx) =>
      tx.consentRecord.findFirstOrThrow({ where: { applicationId: a.id } }),
    );
    expect(consent.noticeVersion).toBe(next.version); // queda registrado qué texto aceptó
    const list = (await call(root, "GET", "/admin/notice-versions")).json();
    expect(list.versions).toHaveLength(1);
  });
});
