import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform } from "@ats/db";
import { NOTICE_VERSION } from "@ats/shared";
import { verifyWebhook } from "@ats/shared/webhook";
import { makePdf, multipart } from "./test-files.js";
import { setupTestApp, validVacancy } from "./test-helpers.js";
import { csvCell } from "./routes/hiring.js";
import { isBlockedIp } from "./services/ssrf.js";
import { MAX_ATTEMPTS, RETRY_DELAYS_MS } from "./services/webhooks.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;
let app: ReturnType<Awaited<ReturnType<typeof setupTestApp>>["build"]>;
let nowMs = Date.now();
const clock = () => new Date(nowMs);
const advance = (ms: number) => (nowMs += ms);

interface Hit {
  url: string;
  headers: Record<string, string>;
  body: string;
}
const hits: Hit[] = [];
let receiver: { status: number; throws: boolean } = { status: 200, throws: false };
const fakeFetch = (async (url: string, init: RequestInit) => {
  hits.push({
    url: String(url),
    headers: init.headers as Record<string, string>,
    body: String(init.body),
  });
  if (receiver.throws) throw new Error("ECONNREFUSED");
  return new Response("ok", { status: receiver.status });
}) as unknown as typeof fetch;

let adminA: string, recA: string, mgrA: string, mgr2A: string, adminB: string;
let vacancy: string,
  autoVacancy: string,
  secret = "",
  endpointId = "";
let n = 0;
const CV =
  "Desarrollador con 5 años de experiencia. Node.js, PostgreSQL y TypeScript. Implementé una API de pagos y lideré un proyecto.";
const call = (
  cookie: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, payload, headers: { cookie } });
const open = (method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
  app.inject({ method, url, payload });

async function apply(vacancyId: string, name = "Marta Cruz Beltre") {
  const f = {
    vacancyId,
    fullName: name,
    email: `marta${n++}@correo.test`,
    phone: "8095551212",
    location: "Santo Domingo",
    educationLevel: "Grado universitario",
    yearsExperience: "5",
    skills: "Node.js, PostgreSQL, TypeScript",
    consent: "true",
    noticeVersion: NOTICE_VERSION,
    captchaToken: "dev-ok",
  };
  const m = multipart(f, { name: "cv.pdf", data: makePdf(CV) });
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
      include: { candidate: true },
    }),
  );
}
const state = (id: string) =>
  withPlatform(t.prisma, (tx) =>
    tx.application.findUniqueOrThrow({
      where: { id },
      include: { history: { orderBy: { createdAt: "asc" } } },
    }),
  );
const toSelected = async (id: string) => {
  await call(recA, "POST", `/applications/${id}/move`, { status: "selection" });
  return call(recA, "POST", `/applications/${id}/selection`, {
    decision: "selected",
    reason: "Excelente entrevista",
  });
};
const hire = (cookie: string, id: string, body: object = { confirm: true }) =>
  call(cookie, "POST", `/applications/${id}/hire`, body);

beforeAll(async () => {
  t = await setupTestApp(5452);
  app = t.build({ clock, webhookFetch: fakeFetch });
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
  const pipe = await call(adminA, "POST", "/pipelines", {
    name: "Completo",
    stages: [
      { name: "Preselección", type: "screening" },
      { name: "Entrevista", type: "interview" },
      {
        name: "Evaluación",
        type: "assessment",
        transition: { mode: "assessment_result", minScore: 50 },
      },
      { name: "Selección", type: "selection" },
      { name: "Contratación", type: "hiring" },
    ],
  });
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
          pipelineId: pipe.json().id,
          ...over,
        }),
      )
    ).json();
    await t.call(adminA, "POST", `/vacancies/${v.id}/status`, { status: "published" });
    return v.id as string;
  };
  vacancy = await mk({
    title: "Desarrollador Backend",
    department: "Tecnología",
    ownerId: t.ids["mgr-a@x.com"],
  });
  autoVacancy = await mk({ title: "Auto", autoSelect: true });
}, 120_000);
afterAll(async () => {
  await app?.close();
  await t?.stop();
});

describe("endpoints de webhook y protección SSRF", () => {
  it("solo el admin los gestiona; el secreto se ve una vez y se guarda cifrado", async () => {
    expect((await call(recA, "GET", "/webhook-endpoints")).statusCode).toBe(403);
    const res = await call(adminA, "POST", "/webhook-endpoints", {
      url: "https://93.184.216.34/hooks/contratados",
    });
    expect(res.statusCode).toBe(201);
    secret = res.json().secret;
    endpointId = res.json().id;
    expect(secret).toMatch(/^whsec_/);
    const list = (await call(adminA, "GET", "/webhook-endpoints")).json();
    expect(JSON.stringify(list)).not.toContain(secret);
    const row = await withPlatform(t.prisma, (tx) =>
      tx.webhookEndpoint.findUniqueOrThrow({ where: { id: endpointId } }),
    );
    expect(row.secretEnc.startsWith("v1:")).toBe(true);
    expect(row.secretEnc).not.toContain(secret);
    expect((await call(adminB, "GET", "/webhook-endpoints")).json()).toEqual([]);
    expect(
      (await call(adminB, "PATCH", `/webhook-endpoints/${endpointId}`, { active: false }))
        .statusCode,
    ).toBe(404);
  });

  it("rechaza destinos internos, sin https, con credenciales o metadatos de nube", async () => {
    for (const url of [
      "https://10.0.0.5/x",
      "https://192.168.1.10/x",
      "https://172.16.0.1/x",
      "https://169.254.169.254/latest/meta-data",
      "https://127.0.0.1/x",
      "https://localhost/x",
      "https://[::1]/x",
      "http://93.184.216.34/x",
      "https://user:pw@93.184.216.34/x",
      "ftp://93.184.216.34/x",
      "no es una url",
    ]) {
      const r = await call(adminA, "POST", "/webhook-endpoints", { url });
      expect(r.statusCode, url).toBe(422);
    }
    expect(
      [
        "10.1.2.3",
        "172.31.255.1",
        "192.168.0.1",
        "127.0.0.1",
        "169.254.1.1",
        "100.64.0.1",
        "::1",
        "fd00::1",
        "fe80::1",
        "::ffff:10.0.0.1",
      ].every(isBlockedIp),
    ).toBe(true);
    expect(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"].some(isBlockedIp)).toBe(false);
  });

  it("el evento de prueba sale firmado y un receptor puede validarlo", async () => {
    hits.length = 0;
    receiver = { status: 200, throws: false };
    const r = await call(adminA, "POST", `/webhook-endpoints/${endpointId}/test`);
    expect(r.json().result).toBe("success");
    const h = hits[0]!;
    expect(h.url).toBe("https://93.184.216.34/hooks/contratados");
    expect(h.headers["x-ats-event"]).toBe("candidate.hired");
    expect(
      verifyWebhook({
        secret,
        body: h.body,
        signature: h.headers["x-ats-signature"],
        timestamp: h.headers["x-ats-timestamp"],
        nowSeconds: Math.floor(nowMs / 1000),
      }),
    ).toEqual({ ok: true });
  });

  it("la verificación rechaza firma inválida, cuerpo alterado, secreto equivocado y envíos viejos (replay)", () => {
    const h = hits[0]!;
    const base = {
      body: h.body,
      signature: h.headers["x-ats-signature"],
      timestamp: h.headers["x-ats-timestamp"],
      nowSeconds: Math.floor(nowMs / 1000),
    };
    expect(verifyWebhook({ ...base, secret })).toEqual({ ok: true });
    expect(verifyWebhook({ ...base, secret: "whsec_otro" })).toMatchObject({
      reason: "bad_signature",
    });
    expect(
      verifyWebhook({ ...base, secret, body: h.body.replace("PRUEBA", "HACK") }),
    ).toMatchObject({ reason: "bad_signature" });
    expect(verifyWebhook({ ...base, secret, nowSeconds: base.nowSeconds + 3600 })).toMatchObject({
      reason: "stale_timestamp",
    });
    expect(verifyWebhook({ ...base, secret, signature: undefined })).toMatchObject({
      reason: "missing_headers",
    });
  });

  it("rotar el secreto invalida el anterior", async () => {
    const r = (await call(adminA, "POST", `/webhook-endpoints/${endpointId}/rotate-secret`)).json();
    expect(r.secret).not.toBe(secret);
    hits.length = 0;
    await call(adminA, "POST", `/webhook-endpoints/${endpointId}/test`);
    const h = hits[0]!;
    const args = {
      body: h.body,
      signature: h.headers["x-ats-signature"],
      timestamp: h.headers["x-ats-timestamp"],
      nowSeconds: Math.floor(nowMs / 1000),
    };
    expect(verifyWebhook({ ...args, secret })).toMatchObject({ ok: false });
    expect(verifyWebhook({ ...args, secret: r.secret })).toEqual({ ok: true });
    secret = r.secret;
  });
});

describe("selección", () => {
  it("decide una persona; el responsable asignado puede, el no asignado no; los descartes llevan motivo", async () => {
    const a = await apply(vacancy);
    expect(
      (await call(recA, "POST", `/applications/${a.id}/selection`, { decision: "not_selected" }))
        .statusCode,
    ).toBe(422);
    expect(
      (await call(mgr2A, "POST", `/applications/${a.id}/selection`, { decision: "selected" }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call(adminB, "POST", `/applications/${a.id}/selection`, { decision: "selected" }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await call(mgrA, "POST", `/applications/${a.id}/selection/comments`, {
          stance: "favor",
          body: "Lo recomiendo",
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await call(mgrA, "POST", `/applications/${a.id}/selection`, {
          decision: "selected",
          reason: "Buen perfil",
        })
      ).statusCode,
    ).toBe(200);
    const s = await state(a.id);
    expect(s.status).toBe("selected");
    expect(s.history.at(-1)).toMatchObject({
      toStatus: "selected",
      automatic: false,
      actorId: t.ids["mgr-a@x.com"],
    });
    const info = (await call(adminA, "GET", `/applications/${a.id}/selection`)).json();
    expect(info.comments[0]).toMatchObject({ stance: "favor", body: "Lo recomiendo" });
    expect(info.decisions[0]).toMatchObject({ decision: "selected", automatic: false });
  });
  it("no seleccionados: queda visible con motivo y puede ponerse en espera", async () => {
    const a = await apply(vacancy);
    expect(
      (await call(recA, "POST", `/applications/${a.id}/selection`, { decision: "on_hold" }))
        .statusCode,
    ).toBe(200);
    expect((await state(a.id)).status).toBe("on_hold");
    await call(recA, "POST", `/applications/${a.id}/selection`, {
      decision: "not_selected",
      reason: "Eligieron otro perfil",
    });
    expect((await state(a.id)).status).toBe("not_selected");
  });
});

describe("contratación y entrega al exterior", () => {
  it("exige estar seleccionado y confirmación explícita", async () => {
    const a = await apply(vacancy);
    expect((await hire(recA, a.id)).statusCode).toBe(409); // aún no seleccionada
    await toSelected(a.id);
    expect((await hire(recA, a.id, {})).statusCode).toBe(400);
    expect((await hire(recA, a.id, { confirm: false })).statusCode).toBe(400);
    expect((await hire(mgrA, a.id)).statusCode).toBe(403);
    expect((await hire(adminB, a.id)).statusCode).toBe(404);
  });

  it("confirma: registra la contratación, envía el correo y el webhook firmado con carga versionada", async () => {
    const a = await apply(vacancy, "Carolina Díaz Núñez");
    await toSelected(a.id);
    hits.length = 0;
    receiver = { status: 200, throws: false };
    const res = await hire(recA, a.id, { confirm: true, startDate: "2026-11-16" });
    expect(res.statusCode).toBe(201);
    const s = await state(a.id);
    expect(s.status).toBe("hired");
    expect(s.history.at(-1)).toMatchObject({
      toStatus: "hired",
      automatic: false,
      actorId: t.ids["rec-a@x.com"],
    });

    expect(hits).toHaveLength(1);
    const h = hits[0]!;
    expect(
      verifyWebhook({
        secret,
        body: h.body,
        signature: h.headers["x-ats-signature"],
        timestamp: h.headers["x-ats-timestamp"],
        nowSeconds: Math.floor(nowMs / 1000),
      }),
    ).toEqual({ ok: true });
    const payload = JSON.parse(h.body);
    expect(payload).toMatchObject({
      schema_version: "1.0",
      event: "candidate.hired",
      data: {
        internal_reference: a.trackingId,
        start_date: "2026-11-16",
        candidate: { full_name: "Carolina Díaz Núñez", email: a.candidate.email },
        position: { title: "Desarrollador Backend", department: "Tecnología" },
      },
    });
    expect(payload.id).toMatch(/^evt_/);
    const hireRow = await withPlatform(t.prisma, (tx) =>
      tx.hire.findUniqueOrThrow({ where: { applicationId: a.id } }),
    );
    expect(hireRow.payload).toEqual(payload.data); // lo guardado es exactamente lo entregado

    const welcome = t.mails.findLast(
      (m) => m.to === a.candidate.email && m.subject.includes("Bienvenid"),
    );
    expect(welcome?.text).toContain("Carolina");
    expect((await hire(recA, a.id)).statusCode).toBe(409); // no se contrata dos veces
  });

  it("reintenta con espera exponencial, se ve en el panel y se puede reenviar", async () => {
    const a = await apply(vacancy);
    await toSelected(a.id);
    hits.length = 0;
    receiver = { status: 500, throws: false };
    await hire(recA, a.id);
    expect(hits).toHaveLength(1);
    const del = async () =>
      (await call(adminA, "GET", "/webhook-deliveries?status=pending")).json() as {
        id: string;
        attempts: number;
        lastStatus: number | null;
        nextAttemptAt: string;
      }[];
    let d = (await del())[0]!;
    expect(d).toMatchObject({ attempts: 1, lastStatus: 500 });
    expect(new Date(d.nextAttemptAt).getTime() - nowMs).toBe(RETRY_DELAYS_MS[0]);

    expect((await app.webhooks.processDue(clock())).attempted).toBe(0); // todavía no toca
    advance(RETRY_DELAYS_MS[0]! + 1);
    expect((await app.webhooks.processDue(clock())).attempted).toBe(1);
    d = (await del())[0]!;
    expect(d.attempts).toBe(2);
    expect(new Date(d.nextAttemptAt).getTime() - nowMs).toBe(RETRY_DELAYS_MS[1]); // la espera crece

    // red caída: también se reintenta; al agotar los intentos queda fallida
    receiver = { status: 200, throws: true };
    for (let i = 2; i < MAX_ATTEMPTS; i++) {
      advance(RETRY_DELAYS_MS[i - 1]! + 1);
      await app.webhooks.processDue(clock());
    }
    const failed = (await call(adminA, "GET", "/webhook-deliveries?status=failed")).json() as {
      id: string;
      attempts: number;
      lastError: string;
    }[];
    const f = failed.find((x) => x.attempts === MAX_ATTEMPTS)!;
    expect(f.lastError).toContain("No se pudo conectar");
    // el receptor se recupera: reenvío manual
    receiver = { status: 200, throws: false };
    expect((await call(adminA, "POST", `/webhook-deliveries/${f.id}/resend`)).json().result).toBe(
      "success",
    );
    expect((await call(adminB, "POST", `/webhook-deliveries/${f.id}/resend`)).statusCode).toBe(404);
  });

  it("una redirección no se sigue y una URL que pasa a ser interna se bloquea al enviar", async () => {
    receiver = { status: 302, throws: false };
    const a = await apply(vacancy);
    await toSelected(a.id);
    await hire(recA, a.id);
    const pend = (await call(adminA, "GET", "/webhook-deliveries?status=pending")).json() as {
      lastError: string;
    }[];
    expect(pend.some((p) => p.lastError.includes("HTTP 302"))).toBe(true);
    // el destino cambia a una IP interna directamente en la base (como si el DNS se hubiera movido)
    await withPlatform(t.prisma, (tx) =>
      tx.webhookEndpoint.update({
        where: { id: endpointId },
        data: { url: "https://10.0.0.9/hook" },
      }),
    );
    advance(RETRY_DELAYS_MS[0]! + 1);
    hits.length = 0;
    await app.webhooks.processDue(clock());
    expect(hits).toHaveLength(0); // nunca se intentó la conexión
    const failed = (await call(adminA, "GET", "/webhook-deliveries?status=failed")).json() as {
      lastError: string;
    }[];
    expect(failed.some((x) => x.lastError.includes("direcciones internas"))).toBe(true);
    await withPlatform(t.prisma, (tx) =>
      tx.webhookEndpoint.update({
        where: { id: endpointId },
        data: { url: "https://93.184.216.34/hooks/contratados" },
      }),
    );
    receiver = { status: 200, throws: false };
  });
});

describe("selección automática (interruptor por vacante)", () => {
  async function exam(applicationId: string) {
    const tpl = (
      await call(recA, "POST", "/assessment-templates", {
        name: `Rápido ${n++}`,
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
      })
    ).json().id as string;
    await call(recA, "POST", `/applications/${applicationId}/assessments`, { templateId: tpl });
    const app0 = await withPlatform(t.prisma, (tx) =>
      tx.application.findUniqueOrThrow({
        where: { id: applicationId },
        include: { candidate: true },
      }),
    );
    const token = /\/examen\/([\w-]+)/.exec(
      t.mails.findLast((m) => m.to === app0.candidate.email && m.subject.startsWith("Evaluación"))!
        .text,
    )![1]!;
    const q = (await open("POST", `/exam/${token}/start`)).json().questions[0];
    await open("POST", `/exam/${token}/submit`, { answers: { [q.id]: true } });
  }

  it("por defecto está apagado: aprobar el examen lleva a Selección, no decide solo", async () => {
    const a = await apply(vacancy);
    await exam(a.id);
    const s = await state(a.id);
    expect(s.status).toBe("selection");
    expect(
      await withPlatform(t.prisma, (tx) =>
        tx.selectionDecision.count({ where: { applicationId: a.id } }),
      ),
    ).toBe(0);
  });

  it("solo un administrador lo enciende; encendido, la decisión es automática y contratar sigue pidiendo confirmación", async () => {
    const v = (await call(adminA, "GET", `/vacancies/${autoVacancy}`)).json();
    expect(v.autoSelect).toBe(true);
    expect(
      (await call(recA, "PATCH", `/vacancies/${vacancy}`, { autoSelect: true })).statusCode,
    ).toBe(403);
    expect(
      (await t.call(recA, "POST", "/vacancies", validVacancy({ autoSelect: true }))).statusCode,
    ).toBe(403);
    const a = await apply(autoVacancy);
    await exam(a.id);
    const s = await state(a.id);
    expect(s.status).toBe("selected");
    expect(s.history.at(-1)).toMatchObject({
      toStatus: "selected",
      automatic: true,
      actorId: null,
    });
    const d = await withPlatform(t.prisma, (tx) =>
      tx.selectionDecision.findFirstOrThrow({ where: { applicationId: a.id } }),
    );
    expect(d).toMatchObject({ automatic: true, decidedBy: null, decision: "selected" });
    expect(d.reason).toContain("Selección automática");
    expect(
      await withPlatform(t.prisma, (tx) => tx.hire.count({ where: { applicationId: a.id } })),
    ).toBe(0); // no contrata sola
  });

  it("con la confirmación automática del tenant también activada, contrata y notifica", async () => {
    expect(
      (await call(recA, "PATCH", "/settings/hiring", { autoConfirmHire: true })).statusCode,
    ).toBe(403);
    expect(
      (await call(adminA, "PATCH", "/settings/hiring", { autoConfirmHire: true })).statusCode,
    ).toBe(200);
    const a = await apply(autoVacancy);
    hits.length = 0;
    await exam(a.id);
    await app.notifications.processDue(clock());
    await app.webhooks.processDue(clock());
    const s = await state(a.id);
    expect(s.status).toBe("hired");
    expect(s.history.at(-1)).toMatchObject({ toStatus: "hired", automatic: true });
    expect(hits.some((h) => JSON.parse(h.body).data.internal_reference === a.trackingId)).toBe(
      true,
    );
    expect(t.mails.some((m) => m.to === a.candidate.email && m.subject.includes("Bienvenid"))).toBe(
      true,
    );
    await call(adminA, "PATCH", "/settings/hiring", { autoConfirmHire: false });
  });
});

describe("exportación y seguimiento", () => {
  it("exporta en JSON y CSV, neutraliza fórmulas y deja rastro; solo roles autorizados del mismo tenant", async () => {
    const a = await apply(vacancy, '=HYPERLINK("http://evil.test","clic")');
    await toSelected(a.id);
    await hire(recA, a.id);
    const json = (await call(recA, "GET", "/hires/export?format=json")).json();
    expect(json.schema_version).toBe("1.0");
    expect(json.hires.length).toBeGreaterThan(1);
    const csv = await call(adminA, "GET", "/hires/export?format=csv");
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("hire_id,hired_at,start_date,full_name");
    expect(csv.body).toContain("\"'=HYPERLINK(");
    expect(csv.body).not.toMatch(/,=HYPERLINK/);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect((await call(mgrA, "GET", "/hires/export")).statusCode).toBe(403);
    expect((await call(adminB, "GET", "/hires/export?format=json")).json().hires).toEqual([]);
    const audit = await withPlatform(t.prisma, (tx) =>
      tx.auditLog.count({ where: { action: "hires.exported" } }),
    );
    expect(audit).toBeGreaterThanOrEqual(2);
  });

  it("métricas: embudo, tiempo promedio y origen; protegidas por rol y por tenant", async () => {
    const m = (await call(adminA, "GET", "/metrics?days=30")).json();
    expect(m.totals.applications).toBeGreaterThan(5);
    expect(m.totals.hires).toBeGreaterThanOrEqual(3);
    expect(m.funnel[0]).toMatchObject({ key: "received", rate: 100 });
    expect(m.funnel.find((f: { key: string }) => f.key === "hired").count).toBeGreaterThanOrEqual(
      3,
    );
    expect(m.avgDaysToHire).not.toBeNull();
    expect(m.sources.reduce((s: number, x: { count: number }) => s + x.count, 0)).toBe(
      m.totals.applications,
    );
    expect((await call(mgrA, "GET", "/metrics")).statusCode).toBe(403);
    expect((await call(adminB, "GET", "/metrics")).json().totals).toMatchObject({
      applications: 0,
      hires: 0,
    });
  });
});
