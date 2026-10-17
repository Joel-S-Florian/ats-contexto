import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withPlatform } from "@ats/db";
import { NOTICE_VERSION } from "@ats/shared";
import { makePdf, multipart } from "./test-files.js";
import { setupTestApp, validVacancy } from "./test-helpers.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;
let app: ReturnType<Awaited<ReturnType<typeof setupTestApp>>["build"]>;
let nowMs = Date.now();
const clock = () => new Date(nowMs);
const advance = (minutes: number) => (nowMs += minutes * 60_000);

let adminA: string;
let recA: string;
let mgrA: string;
let adminB: string;
let vacancy: string;
let noExamVacancy: string;
let mixedTemplate: string;
let closedTemplate: string;
let n = 0;
const CV =
  "Desarrollador con 5 años de experiencia. Node.js, PostgreSQL y TypeScript. Implementé una API de pagos y lideré un proyecto.";

const call = (
  cookie: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, payload, headers: { cookie } });
const open = (method: "GET" | "POST" | "PUT", url: string, payload?: object) =>
  app.inject({ method, url, payload });

async function apply(vacancyId: string) {
  const f = {
    vacancyId,
    fullName: "Elena Marte Peña",
    email: `elena${n++}@correo.test`,
    phone: "8095559999",
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
const tokenFor = (email: string) =>
  /\/examen\/([\w-]+)/.exec(
    t.mails.findLast((m) => m.to === email && m.subject.startsWith("Evaluación"))!.text,
  )![1]!;
const appOf = (id: string) =>
  withPlatform(t.prisma, (tx) =>
    tx.application.findUniqueOrThrow({ where: { id }, include: { history: true } }),
  );

const mixed = {
  name: "Examen general",
  description: "Conocimientos básicos",
  timeLimitMin: 30,
  passingScore: 60,
  modules: [
    {
      title: "Lógica",
      questions: [
        {
          type: "multiple_choice",
          prompt: "¿Cuánto es 2 + 2?",
          options: ["3", "4", "5"],
          correctAnswer: 1,
          points: 1,
        },
        {
          type: "multiple_choice",
          prompt: "¿Capital de República Dominicana?",
          options: ["Santiago", "Santo Domingo"],
          correctAnswer: 1,
          points: 1,
        },
        { type: "true_false", prompt: "El sol sale por el este.", correctAnswer: true, points: 1 },
      ],
    },
    {
      title: "Redacción",
      questions: [
        { type: "short_answer", prompt: "Describe tu mayor logro profesional.", points: 2 },
      ],
    },
  ],
};
const closed = {
  name: "Solo cerradas",
  timeLimitMin: 10,
  passingScore: 50,
  modules: [
    {
      title: "Único",
      questions: [
        { type: "true_false", prompt: "Node.js usa JavaScript.", correctAnswer: true, points: 1 },
        {
          type: "multiple_choice",
          prompt: "¿Qué es SQL?",
          options: ["Un lenguaje de consultas", "Un navegador"],
          correctAnswer: 0,
          points: 1,
        },
      ],
    },
  ],
};

/** Responde correctamente todas las cerradas de un examen en curso. */
async function questionsOf(token: string) {
  const r = (await open("POST", `/exam/${token}/start`)).json();
  return r.questions as { id: string; type: string; prompt: string; options: string[] }[];
}
const correct = (qs: { id: string; prompt: string }[]) => {
  const key: Record<string, number | boolean> = {
    "¿Cuánto es 2 + 2?": 1,
    "¿Capital de República Dominicana?": 1,
    "El sol sale por el este.": true,
    "Node.js usa JavaScript.": true,
    "¿Qué es SQL?": 0,
  };
  return Object.fromEntries(qs.filter((q) => q.prompt in key).map((q) => [q.id, key[q.prompt]!]));
};

beforeAll(async () => {
  t = await setupTestApp(5451);
  app = t.build({ clock, examRateLimit: 1000 });
  await t.addUser("admin-a@x.com", "admin", t.tenants.a);
  await t.addUser("rec-a@x.com", "recruiter", t.tenants.a);
  await t.addUser("mgr-a@x.com", "area_manager", t.tenants.a);
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
    ["admin-a", "rec-a", "mgr-a", "admin-b"].map((u) => login(`${u}@x.com`)),
  );
  [adminA, recA, mgrA, adminB] = [c[0]!, c[1]!, c[2]!, c[3]!];
  const pipe = await call(adminA, "POST", "/pipelines", {
    name: "Con examen",
    stages: [
      { name: "Preselección", type: "screening" },
      { name: "Entrevista", type: "interview" },
      {
        name: "Evaluación",
        type: "assessment",
        transition: { mode: "assessment_result", minScore: 60 },
      },
      { name: "Selección", type: "selection" },
      { name: "Contratación", type: "hiring" },
    ],
  });
  const noExam = await call(adminA, "POST", "/pipelines", {
    name: "Sin examen",
    stages: [
      { name: "Preselección", type: "screening" },
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
          ...over,
        }),
      )
    ).json();
    await t.call(adminA, "POST", `/vacancies/${v.id}/status`, { status: "published" });
    return v.id as string;
  };
  vacancy = await mk({ title: "Con examen", pipelineId: pipe.json().id });
  noExamVacancy = await mk({ title: "Sin examen", pipelineId: noExam.json().id });
  mixedTemplate = (await call(recA, "POST", "/assessment-templates", mixed)).json().id;
  closedTemplate = (await call(recA, "POST", "/assessment-templates", closed)).json().id;
}, 120_000);
afterAll(async () => {
  await app?.close();
  await t?.stop();
});

describe("plantillas de examen", () => {
  it("valida preguntas y respeta permisos y aislamiento", async () => {
    const bad = {
      ...mixed,
      modules: [
        {
          title: "M",
          questions: [{ type: "multiple_choice", prompt: "¿Cuál?", options: ["a"], points: 1 }],
        },
      ],
    };
    expect((await call(recA, "POST", "/assessment-templates", bad)).statusCode).toBe(400);
    const tf = {
      ...mixed,
      modules: [
        { title: "M", questions: [{ type: "true_false", prompt: "¿Verdadero?", points: 1 }] },
      ],
    };
    expect((await call(recA, "POST", "/assessment-templates", tf)).statusCode).toBe(400);
    expect((await call(mgrA, "POST", "/assessment-templates", mixed)).statusCode).toBe(403);
    expect((await call(adminB, "GET", `/assessment-templates/${mixedTemplate}`)).statusCode).toBe(
      404,
    );
    expect(((await call(adminB, "GET", "/assessment-templates")).json() as unknown[]).length).toBe(
      0,
    );
    const d = (await call(recA, "GET", `/assessment-templates/${mixedTemplate}`)).json();
    expect(d.modules).toHaveLength(2);
    expect(d.modules[0].questions[0].correctAnswer).toBe(1);
  });
});

describe("enlace firmado, temporizador y calificación", () => {
  it("envía el enlace por correo, sin exponer la clave de respuestas, y el reloj lo controla el servidor", async () => {
    const a = await apply(vacancy);
    const inv = await call(recA, "POST", `/applications/${a.id}/assessments`, {
      templateId: mixedTemplate,
      expiresInHours: 48,
      message: "Tienes 30 minutos.",
    });
    expect(inv.statusCode).toBe(201);
    expect(inv.json().emailed).toBe("sent");
    expect((await appOf(a.id)).status).toBe("assessment");
    const token = tokenFor(a.candidate.email);
    // el token no se guarda en claro
    expect(
      await withPlatform(t.prisma, (tx) =>
        tx.assessmentAttempt.count({ where: { tokenHash: token } }),
      ),
    ).toBe(0);

    const intro = (await open("GET", `/exam/${token}`)).json();
    expect(intro).toMatchObject({ status: "invited", title: "Examen general", timeLimitMin: 30 });
    expect(intro.questions).toBeUndefined();

    const started = (await open("POST", `/exam/${token}/start`)).json();
    expect(started.status).toBe("in_progress");
    expect(started.remainingSeconds).toBe(1800);
    expect(started.questions).toHaveLength(4);
    expect(JSON.stringify(started)).not.toContain("correctAnswer");

    advance(5);
    const again = (await open("POST", `/exam/${token}/start`)).json(); // iniciar de nuevo no reinicia el reloj
    expect(again.remainingSeconds).toBe(1500);
  });

  it("califica cerradas en automático, deja la abierta para revisión y avanza según el puntaje mínimo", async () => {
    const a = await apply(vacancy);
    await call(recA, "POST", `/applications/${a.id}/assessments`, { templateId: mixedTemplate });
    const token = tokenFor(a.candidate.email);
    const qs = await questionsOf(token);
    const open1 = qs.find((q) => q.type === "short_answer")!;
    const save = await open("PUT", `/exam/${token}/answers`, { answers: correct(qs) });
    expect(save.json().saved).toBe(true);
    const sub = await open("POST", `/exam/${token}/submit`, {
      answers: { [open1.id]: "Lideré la migración de la plataforma de pagos." },
    });
    expect(sub.json()).toEqual({ status: "submitted", timedOut: false });

    // el candidato no ve su puntaje; RRHH ve que falta revisar
    const att = (await call(recA, "GET", `/applications/${a.id}/assessments`)).json().attempts[0];
    expect(att).toMatchObject({ status: "submitted", needsReview: true, finalScore: null });
    expect(att.openAnswers[0]).toMatchObject({
      answer: "Lideré la migración de la plataforma de pagos.",
      maxPoints: 2,
    });
    expect((await appOf(a.id)).status).toBe("assessment"); // aún sin avanzar

    // validaciones de la revisión
    const rev = (g: object) =>
      call(recA, "PUT", `/assessment-attempts/${att.id}/review`, { grades: g });
    expect((await rev({ [open1.id]: 9 })).statusCode).toBe(422);
    expect((await rev({})).statusCode).toBe(422);
    expect(
      (
        await call(adminB, "PUT", `/assessment-attempts/${att.id}/review`, {
          grades: { [open1.id]: 2 },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(mgrA, "PUT", `/assessment-attempts/${att.id}/review`, {
          grades: { [open1.id]: 2 },
        })
      ).statusCode,
    ).toBe(403);
    const ok = await rev({ [open1.id]: 2 });
    expect(ok.json().finalScore).toBe(100); // (3 + 2) / 5
    const after = await appOf(a.id);
    expect(after.status).toBe("selection");
    expect(after.history.at(-1)).toMatchObject({ toStatus: "selection", automatic: true });
    expect(after.history.at(-1)!.reason).toContain("mínimo 60");
    expect((await rev({ [open1.id]: 2 })).statusCode).toBe(409); // ya revisado
  });

  it("solo cerradas: puntaje inmediato; por debajo del mínimo queda en revisión, nunca se descarta", async () => {
    const a = await apply(vacancy);
    await call(recA, "POST", `/applications/${a.id}/assessments`, { templateId: closedTemplate });
    const token = tokenFor(a.candidate.email);
    const qs = await questionsOf(token);
    const wrong = Object.fromEntries(qs.map((q) => [q.id, q.type === "true_false" ? false : 1]));
    await open("POST", `/exam/${token}/submit`, { answers: wrong });
    const att = (await call(recA, "GET", `/applications/${a.id}/assessments`)).json().attempts[0];
    expect(att).toMatchObject({ finalScore: 0, needsReview: false });
    const after = await appOf(a.id);
    expect(after.status).toBe("in_review");
    expect(after.history.at(-1)!.reason).toContain("por debajo del mínimo");
  });

  it("es de un solo uso: no se puede reenviar ni volver a abrir", async () => {
    const a = await apply(vacancy);
    await call(recA, "POST", `/applications/${a.id}/assessments`, { templateId: closedTemplate });
    const token = tokenFor(a.candidate.email);
    const qs = await questionsOf(token);
    expect((await open("POST", `/exam/${token}/submit`, { answers: correct(qs) })).statusCode).toBe(
      200,
    );
    expect((await open("POST", `/exam/${token}/submit`, { answers: correct(qs) })).statusCode).toBe(
      409,
    );
    expect((await open("PUT", `/exam/${token}/answers`, { answers: correct(qs) })).statusCode).toBe(
      409,
    );
    const view = (await open("GET", `/exam/${token}`)).json();
    expect(view.status).toBe("submitted");
    expect(view.questions).toBeUndefined();
    expect((await open("POST", `/exam/${token}/start`)).json().questions).toBeUndefined();
  });

  it("el tiempo límite se aplica en el servidor: lo que llegue tarde no cuenta", async () => {
    const a = await apply(vacancy);
    await call(recA, "POST", `/applications/${a.id}/assessments`, { templateId: closedTemplate });
    const token = tokenFor(a.candidate.email);
    const qs = await questionsOf(token);
    const c = correct(qs);
    const [firstId] = Object.keys(c);
    await open("PUT", `/exam/${token}/answers`, { answers: { [firstId!]: c[firstId!] } }); // guardó 1 de 2
    advance(11); // el límite es de 10 minutos
    const late = await open("POST", `/exam/${token}/submit`, { answers: c }); // intenta enviar todo tarde
    expect(late.json()).toEqual({ status: "submitted", timedOut: true });
    const att = (await call(recA, "GET", `/applications/${a.id}/assessments`)).json().attempts[0];
    expect(att).toMatchObject({ timedOut: true, finalScore: 50 }); // solo cuenta lo guardado a tiempo
  });

  it("si el candidato no envía, el servidor cierra el intento con lo guardado al consultar", async () => {
    const a = await apply(vacancy);
    await call(recA, "POST", `/applications/${a.id}/assessments`, { templateId: closedTemplate });
    const token = tokenFor(a.candidate.email);
    await questionsOf(token);
    advance(12);
    expect((await open("GET", `/exam/${token}`)).json().status).toBe("submitted");
    expect((await open("PUT", `/exam/${token}/answers`, { answers: {} })).statusCode).toBe(409);
  });

  it("el enlace vence aunque no se haya abierto", async () => {
    const a = await apply(vacancy);
    await call(recA, "POST", `/applications/${a.id}/assessments`, {
      templateId: closedTemplate,
      expiresInHours: 1,
    });
    const token = tokenFor(a.candidate.email);
    advance(61);
    expect((await open("GET", `/exam/${token}`)).statusCode).toBe(410);
    expect((await open("POST", `/exam/${token}/start`)).statusCode).toBe(410);
  });

  it("rechaza tokens inválidos, claves de preguntas ajenas y respuestas mal formadas", async () => {
    expect((await open("GET", "/exam/token-que-no-existe-123")).statusCode).toBe(404);
    const a = await apply(vacancy);
    await call(recA, "POST", `/applications/${a.id}/assessments`, { templateId: closedTemplate });
    const token = tokenFor(a.candidate.email);
    const qs = await questionsOf(token);
    expect(
      (await open("PUT", `/exam/${token}/answers`, { answers: { "no-es-uuid": 1 } })).statusCode,
    ).toBe(400);
    const ghost = "00000000-0000-4000-8000-000000000000";
    await open("PUT", `/exam/${token}/answers`, { answers: { [ghost]: 1, [qs[0]!.id]: true } });
    const state = (await open("GET", `/exam/${token}`)).json();
    expect(Object.keys(state.answers)).toEqual([qs[0]!.id]); // la pregunta inexistente se ignora
  });

  it("limita la tasa de consultas por IP", async () => {
    const limited = t.build({ clock, examRateLimit: 3 });
    const hit = () =>
      limited.inject({ url: "/exam/token-que-no-existe-123", remoteAddress: "198.51.100.50" });
    expect([(await hit()).statusCode, (await hit()).statusCode, (await hit()).statusCode]).toEqual([
      404, 404, 404,
    ]);
    expect((await hit()).statusCode).toBe(429);
    await limited.close();
  });
});

describe("invitaciones y registros", () => {
  it("valida permisos, etapa activa, invitaciones duplicadas y borrado de plantillas usadas", async () => {
    const a = await apply(vacancy);
    expect(
      (
        await call(mgrA, "POST", `/applications/${a.id}/assessments`, {
          templateId: closedTemplate,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await call(adminB, "POST", `/applications/${a.id}/assessments`, {
          templateId: closedTemplate,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await call(recA, "POST", `/applications/${a.id}/assessments`, {
          templateId: closedTemplate,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await call(recA, "POST", `/applications/${a.id}/assessments`, {
          templateId: closedTemplate,
        })
      ).statusCode,
    ).toBe(409);
    const b = await apply(noExamVacancy);
    expect(
      (
        await call(recA, "POST", `/applications/${b.id}/assessments`, {
          templateId: closedTemplate,
        })
      ).statusCode,
    ).toBe(422);
    expect((await call(recA, "DELETE", `/assessment-templates/${closedTemplate}`)).statusCode).toBe(
      409,
    );
  });

  it("el responsable de área ve los puntajes pero no las respuestas abiertas", async () => {
    const a = await apply(vacancy);
    await call(recA, "POST", `/applications/${a.id}/assessments`, { templateId: mixedTemplate });
    const token = tokenFor(a.candidate.email);
    const qs = await questionsOf(token);
    const o = qs.find((q) => q.type === "short_answer")!;
    await open("POST", `/exam/${token}/submit`, {
      answers: { ...correct(qs), [o.id]: "Respuesta privada" },
    });
    const asMgr = await call(mgrA, "GET", `/applications/${a.id}/assessments`);
    expect(asMgr.statusCode).toBe(404); // no está asignado a esta vacante
    const asAdmin = (await call(adminA, "GET", `/applications/${a.id}/assessments`)).json();
    expect(asAdmin.attempts[0].openAnswers).toHaveLength(1);
  });

  it("registra la evaluación propia de la empresa y aplica el avance según su puntaje", async () => {
    const a = await apply(vacancy);
    await call(recA, "POST", `/applications/${a.id}/move`, { status: "assessment" });
    const rec = {
      description: "Prueba práctica de campo",
      performedAt: new Date(nowMs - 3600_000).toISOString(),
      method: "Presencial en planta",
      evaluators: ["Ing. Pérez", "Lic. Gómez"],
      result: "Aprobado con observaciones",
      score: 85,
      observations: "Buen manejo de herramientas.",
    };
    expect(
      (await call(mgrA, "POST", `/applications/${a.id}/external-assessments`, rec)).statusCode,
    ).toBe(403);
    expect(
      (
        await call(recA, "POST", `/applications/${a.id}/external-assessments`, {
          ...rec,
          evaluators: [],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call(recA, "POST", `/applications/${a.id}/external-assessments`, rec)).statusCode,
    ).toBe(201);
    const list = (await call(recA, "GET", `/applications/${a.id}/assessments`)).json();
    expect(list.external[0]).toMatchObject({
      description: "Prueba práctica de campo",
      score: 85,
      evaluators: ["Ing. Pérez", "Lic. Gómez"],
    });
    expect((await appOf(a.id)).status).toBe("selection");
    expect((await call(adminB, "GET", `/applications/${a.id}/assessments`)).statusCode).toBe(404);
  });
});
