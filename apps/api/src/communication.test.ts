import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withPlatform } from "@ats/db";
import { NOTICE_VERSION } from "@ats/shared";
import type { CalendarProvider } from "./ports/calendar.js";
import { googleCalendar } from "./ports/calendar.js";
import { buildIcs } from "./services/ics.js";
import { makePdf, multipart } from "./test-files.js";
import { setupTestApp, validVacancy } from "./test-helpers.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;
let app: ReturnType<Awaited<ReturnType<typeof setupTestApp>>["build"]>;
let adminA: string;
let recA: string;
let mgrA: string;
let mgr2A: string;
let adminB: string;
let vacancy: string;
let noInterviewVacancy: string;
let n = 0;
const created: string[] = [];
const cancelled: string[] = [];
const fakeCalendar: CalendarProvider & { fail: boolean } = {
  fail: false,
  async createEvent(e) {
    if (this.fail) throw new Error("calendario caído");
    created.push(e.title);
    return {
      eventId: "evt-1",
      meetingUrl: e.wantsMeetingLink ? "https://meet.google.com/abc-defg-hij" : undefined,
    };
  },
  async cancelEvent(id) {
    cancelled.push(id);
  },
};

const CV =
  "Desarrollador con 5 años de experiencia. Node.js, PostgreSQL y TypeScript. Implementé una API de pagos y lideré un proyecto.";
async function apply(vacancyId: string, name = "Rosa Almonte Peña") {
  const f = {
    vacancyId,
    fullName: name,
    email: `rosa${n++}@correo.test`,
    phone: "8095558888",
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
const call = (
  cookie: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) => app.inject({ method, url, payload, headers: { cookie } });
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
const invite = (cookie: string, appId: string, over: object = {}) =>
  call(cookie, "POST", `/applications/${appId}/interviews`, {
    scheduledAt: inDays(3),
    durationMin: 45,
    mode: "virtual",
    meetingUrl: "https://meet.example.com/xyz",
    platform: "Google Meet",
    messageToCandidate: "Trae tu cédula",
    ...over,
  });

beforeAll(async () => {
  t = await setupTestApp(5450);
  app = t.build({ calendar: fakeCalendar });
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
  vacancy = await mk({ title: "Desarrollador Backend", ownerId: t.ids["mgr-a@x.com"] });
  const pipe = await t.call(adminA, "POST", "/pipelines", {
    name: "Directo",
    stages: [
      { name: "Preselección", type: "screening" },
      { name: "Contratación", type: "hiring" },
    ],
  });
  noInterviewVacancy = await mk({ title: "Sin entrevista", pipelineId: pipe.json().id });
}, 120_000);
afterAll(async () => {
  await app?.close();
  await t?.stop();
});

describe("utilidades puras", () => {
  it("buildIcs genera una invitación válida y escapa el contenido", () => {
    const ics = buildIcs({
      uid: "u1@ats",
      start: new Date("2026-11-02T14:00:00Z"),
      end: new Date("2026-11-02T14:45:00Z"),
      summary: "Entrevista, Backend; ronda 1",
      description: "Línea 1\nLínea 2",
      location: "Oficina, piso 2",
    });
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("DTSTART:20261102T140000Z");
    expect(ics).toContain("SUMMARY:Entrevista\\, Backend\\; ronda 1");
    expect(ics).toContain("DESCRIPTION:Línea 1\\nLínea 2");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(
      buildIcs({
        uid: "u1@ats",
        start: new Date(),
        end: new Date(),
        summary: "x",
        description: "",
        cancel: true,
      }),
    ).toContain("METHOD:CANCEL");
  });
  it("el adaptador de Google Calendar arma la solicitud con enlace de Meet y cancela eventos", async () => {
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("oauth2"))
        return new Response(JSON.stringify({ access_token: "tok" }));
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify({ id: "ev9", hangoutLink: "https://meet.google.com/aaa-bbbb-ccc" }),
      );
    });
    const g = googleCalendar({
      clientId: "c",
      clientSecret: "s",
      refreshToken: "r",
      fetch: f as unknown as typeof fetch,
    });
    const r = await g.createEvent({
      title: "T",
      description: "D",
      start: new Date(),
      end: new Date(Date.now() + 3600_000),
      attendees: ["a@x.com"],
      wantsMeetingLink: true,
    });
    expect(r).toEqual({ eventId: "ev9", meetingUrl: "https://meet.google.com/aaa-bbbb-ccc" });
    const post = f.mock.calls.find(([u]) => String(u).includes("/events?"))!;
    expect(String(post[0])).toContain("conferenceDataVersion=1");
    expect(
      JSON.parse(post[1]!.body as string).conferenceData.createRequest.conferenceSolutionKey.type,
    ).toBe("hangoutsMeet");
    await g.cancelEvent("ev9");
    expect(f.mock.calls.at(-1)![1]!.method).toBe("DELETE");
  });
});

describe("plantillas de correo", () => {
  it("lista las plantillas por defecto; solo el admin edita; variables desconocidas se rechazan", async () => {
    const list = (await call(recA, "GET", "/email-templates")).json() as {
      key: string;
      custom: boolean;
    }[];
    expect(list.map((x) => x.key)).toContain("interview_invitation");
    expect(list.every((x) => !x.custom)).toBe(true);
    const body = {
      subject: "Hola {{nombre}}",
      body: "Tu entrevista es el {{fecha}} a las {{hora}}.",
      enabled: true,
    };
    expect(
      (await call(recA, "PUT", "/email-templates/interview_invitation", body)).statusCode,
    ).toBe(403);
    expect(
      (
        await call(adminA, "PUT", "/email-templates/interview_invitation", {
          ...body,
          body: "Hola {{inventada}}",
        })
      ).statusCode,
    ).toBe(422);
    expect(
      (await call(adminA, "PUT", "/email-templates/interview_invitation", body)).statusCode,
    ).toBe(200);
    expect((await call(adminA, "PUT", "/email-templates/clave_rara", body)).statusCode).toBe(400);
    // otro tenant no ve la personalización
    const b = (await call(adminB, "GET", "/email-templates")).json() as {
      key: string;
      subject: string;
    }[];
    expect(b.find((x) => x.key === "interview_invitation")!.subject).not.toBe("Hola {{nombre}}");
  });
  it("la vista previa usa datos de ejemplo y no interpreta HTML", async () => {
    const r = (
      await call(recA, "POST", "/email-templates/preview", {
        subject: "Hola {{nombre}}",
        body: "<b>{{vacante}}</b> {{x}}",
      })
    ).json();
    expect(r.subject).toBe("Hola María");
    expect(r.html).toContain("&lt;b&gt;");
    expect(r.html).not.toContain("<b>");
    expect(r.unknown).toEqual(["x"]);
  });
  it("restablecer vuelve a la plantilla por defecto", async () => {
    expect((await call(adminA, "DELETE", "/email-templates/interview_invitation")).statusCode).toBe(
      204,
    );
    const list = (await call(adminA, "GET", "/email-templates")).json() as {
      key: string;
      custom: boolean;
    }[];
    expect(list.find((x) => x.key === "interview_invitation")!.custom).toBe(false);
  });
});

describe("entrevistas", () => {
  it("agenda una entrevista virtual: mueve la postulación, envía el correo con .ics y lo registra sin guardar el cuerpo", async () => {
    const a = await apply(vacancy);
    const res = await invite(recA, a.id);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      meetingUrl: "https://meet.example.com/xyz",
      emailed: "sent",
    });
    const after = await withPlatform(t.prisma, (tx) =>
      tx.application.findUniqueOrThrow({ where: { id: a.id }, include: { history: true } }),
    );
    expect(after.status).toBe("interview");
    expect(after.history.at(-1)).toMatchObject({
      toStatus: "interview",
      automatic: false,
      actorId: t.ids["rec-a@x.com"],
    });
    const mail = t.mails.findLast(
      (m) => m.to === a.candidate.email && m.subject.startsWith("Entrevista"),
    )!;
    expect(mail.text).toContain("Rosa");
    expect(mail.text).toContain("https://meet.example.com/xyz");
    expect(mail.text).toContain("Trae tu cédula");
    expect(mail.attachments![0]).toMatchObject({ filename: "entrevista.ics" });
    expect(mail.attachments![0]!.content).toContain("METHOD:REQUEST");
    const logs = (await call(adminA, "GET", `/applications/${a.id}/emails`)).json() as {
      templateKey: string;
      status: string;
    }[];
    expect(logs.find((l) => l.templateKey === "interview_invitation")).toMatchObject({
      status: "sent",
    });
    expect(JSON.stringify(logs)).not.toContain("meet.example.com"); // el registro no guarda el cuerpo
    expect(created).toContain("Entrevista - Desarrollador Backend");
  });

  it("genera el enlace con el calendario si no se aporta uno, y un calendario caído no impide agendar", async () => {
    const a = await apply(vacancy);
    const r = await invite(recA, a.id, { meetingUrl: undefined });
    expect(r.statusCode).toBe(201);
    expect(r.json().meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    const b = await apply(vacancy);
    fakeCalendar.fail = true;
    expect((await invite(recA, b.id)).statusCode).toBe(201); // trae su propio enlace
    expect((await invite(recA, b.id, { meetingUrl: undefined })).statusCode).toBe(422); // sin enlace y sin calendario
    fakeCalendar.fail = false;
  });

  it("valida fecha futura, lugar presencial, participantes y etapa activa", async () => {
    const a = await apply(vacancy);
    expect((await invite(recA, a.id, { scheduledAt: inDays(-1) })).statusCode).toBe(400);
    expect((await invite(recA, a.id, { mode: "onsite", meetingUrl: undefined })).statusCode).toBe(
      400,
    );
    expect(
      (
        await invite(recA, a.id, {
          mode: "onsite",
          location: "Oficina central, piso 3",
          meetingUrl: undefined,
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await invite(recA, a.id, { participantIds: [t.ids["admin-b@x.com"]] })).statusCode,
    ).toBe(422);
    const b = await apply(noInterviewVacancy);
    expect((await invite(recA, b.id)).statusCode).toBe(422);
  });

  it("permisos y aislamiento: el responsable de área lee pero no agenda; otro tenant no ve nada", async () => {
    const a = await apply(vacancy);
    expect((await invite(mgrA, a.id)).statusCode).toBe(403);
    const ok = await invite(recA, a.id);
    expect((await call(mgrA, "GET", `/applications/${a.id}/interviews`)).statusCode).toBe(200);
    expect((await call(mgr2A, "GET", `/applications/${a.id}/interviews`)).statusCode).toBe(404);
    expect((await call(adminB, "GET", `/applications/${a.id}/interviews`)).statusCode).toBe(404);
    expect((await invite(adminB, a.id)).statusCode).toBe(404);
    expect((await call(adminB, "POST", `/interviews/${ok.json().id}/cancel`)).statusCode).toBe(404);
  });

  it("cancela: cierra el evento de calendario y avisa al candidato con METHOD:CANCEL", async () => {
    const a = await apply(vacancy);
    const i = (await invite(recA, a.id)).json();
    const res = await call(recA, "POST", `/interviews/${i.id}/cancel`);
    expect(res.json()).toMatchObject({ status: "cancelled", emailed: "sent" });
    expect(cancelled).toContain("evt-1");
    const mail = t.mails.findLast((m) => m.to === a.candidate.email)!;
    expect(mail.subject).toContain("cancelada");
    expect(mail.attachments![0]!.content).toContain("METHOD:CANCEL");
    expect((await call(recA, "POST", `/interviews/${i.id}/cancel`)).statusCode).toBe(409);
  });

  it("el correo de un candidato nunca incluye datos de otro", async () => {
    const x = await apply(vacancy, "Ximena Vargas Soto");
    const y = await apply(vacancy, "Yeison Tavarez Luna");
    await invite(recA, x.id);
    await invite(recA, y.id);
    const mx = t.mails.findLast(
      (m) => m.to === x.candidate.email && m.subject.startsWith("Entrevista"),
    )!;
    expect(mx.text).toContain("Ximena");
    expect(mx.text + mx.html).not.toContain("Yeison");
    expect(mx.text + mx.html).not.toContain(y.candidate.email);
  });
});

describe("aviso de rechazo configurable", () => {
  const notSelected = (id: string) =>
    call(recA, "POST", `/applications/${id}/move`, {
      status: "not_selected",
      reason: "Otro perfil se ajusta mejor",
    });
  const setNotice = (cookie: string, rejectionNotice: string, rejectionDelayHours = 24) =>
    call(cookie, "PATCH", "/settings/notifications", { rejectionNotice, rejectionDelayHours });
  const rejectionMails = (email: string) =>
    t.mails.filter((m) => m.to === email && m.subject.startsWith("Sobre tu postulación"));

  it("solo el admin cambia la configuración; por defecto es manual y no envía nada solo", async () => {
    expect(
      (await call(recA, "PATCH", "/settings/notifications", { rejectionNotice: "none" }))
        .statusCode,
    ).toBe(403);
    expect((await call(adminA, "GET", "/settings/notifications")).json()).toMatchObject({
      rejectionNotice: "manual",
    });
    const a = await apply(vacancy);
    await notSelected(a.id);
    expect(await app.notifications.processDue(new Date(Date.now() + 99 * 3600_000))).toBe(0);
    expect(rejectionMails(a.candidate.email)).toHaveLength(0);
    // el envío manual sí funciona y queda registrado
    expect(
      (await call(recA, "POST", `/applications/${a.id}/email`, { key: "rejection" })).json(),
    ).toEqual({ result: "sent" });
    expect(rejectionMails(a.candidate.email)).toHaveLength(1);
  });

  it("automático con retraso: se programa, no sale antes de tiempo y se cancela si se revierte", async () => {
    expect((await setNotice(adminA, "auto_delay", 2)).statusCode).toBe(200);
    const a = await apply(vacancy);
    await notSelected(a.id);
    expect(await app.notifications.processDue(new Date(Date.now() + 30 * 60_000))).toBe(0);
    expect(
      await app.notifications.processDue(new Date(Date.now() + 3 * 3600_000)),
    ).toBeGreaterThanOrEqual(1);
    expect(rejectionMails(a.candidate.email)).toHaveLength(1);

    const b = await apply(vacancy);
    await notSelected(b.id);
    await call(recA, "POST", `/applications/${b.id}/revert`);
    await app.notifications.processDue(new Date(Date.now() + 9 * 3600_000));
    expect(rejectionMails(b.candidate.email)).toHaveLength(0);
    const sched = await withPlatform(t.prisma, (tx) =>
      tx.scheduledEmail.findFirst({ where: { applicationId: b.id } }),
    );
    expect(sched!.cancelledAt).not.toBeNull();
  });

  it("sin notificación: no se programa nada", async () => {
    await setNotice(adminA, "none");
    const a = await apply(vacancy);
    await notSelected(a.id);
    expect(
      await withPlatform(t.prisma, (tx) =>
        tx.scheduledEmail.count({ where: { applicationId: a.id } }),
      ),
    ).toBe(0);
    await setNotice(adminA, "manual");
  });
});

describe("comunicaciones manuales", () => {
  it("registra llamadas y mensajes; el responsable de área solo lee", async () => {
    const a = await apply(vacancy);
    expect(
      (
        await call(recA, "POST", `/applications/${a.id}/communications`, {
          type: "call",
          summary: "Se confirmó disponibilidad",
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await call(mgrA, "POST", `/applications/${a.id}/communications`, {
          type: "call",
          summary: "x",
        })
      ).statusCode,
    ).toBe(403);
    const list = (await call(mgrA, "GET", `/applications/${a.id}/communications`)).json() as {
      summary: string;
      author: string;
    }[];
    expect(list[0]).toMatchObject({ summary: "Se confirmó disponibilidad" });
    expect((await call(adminB, "GET", `/applications/${a.id}/communications`)).statusCode).toBe(
      404,
    );
    expect(
      (
        await call(recA, "POST", `/applications/${a.id}/communications`, {
          type: "fax",
          summary: "x",
        })
      ).statusCode,
    ).toBe(400);
  });
});
