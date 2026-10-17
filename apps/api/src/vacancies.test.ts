import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestApp, validVacancy } from "./test-helpers.js";

let t: Awaited<ReturnType<typeof setupTestApp>>;
let adminA: string;
let recA: string;
let mgrA: string;
let adminB: string;
let vacancyA: string;

beforeAll(async () => {
  t = await setupTestApp(5446);
  await t.addUser("admin-a@x.com", "admin", t.tenants.a);
  await t.addUser("rec-a@x.com", "recruiter", t.tenants.a);
  await t.addUser("mgr-a@x.com", "area_manager", t.tenants.a);
  await t.addUser("admin-b@x.com", "admin", t.tenants.b);
  adminA = (await t.login("admin-a@x.com")).cookie;
  recA = (await t.login("rec-a@x.com")).cookie;
  mgrA = (await t.login("mgr-a@x.com")).cookie;
  adminB = (await t.login("admin-b@x.com")).cookie;
}, 120_000);
afterAll(() => t?.stop());

describe("CRUD y permisos", () => {
  it("el reclutador crea una vacante con el embudo por defecto", async () => {
    const res = await t.call(recA, "POST", "/vacancies", validVacancy());
    expect(res.statusCode).toBe(201);
    vacancyA = res.json().id;
    expect(res.json()).toMatchObject({
      status: "draft",
      requiredSkills: ["Node.js", "PostgreSQL"],
      desirableSkills: ["Docker"],
    });
    const pipelines = (await t.call(adminA, "GET", "/pipelines")).json();
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0].stages.map((s: { type: string }) => s.type)).toEqual([
      "screening",
      "interview",
      "assessment",
      "selection",
      "hiring",
    ]);
  });
  it("el responsable de área no crea vacantes; sin sesión 401", async () => {
    expect((await t.call(mgrA, "POST", "/vacancies", validVacancy())).statusCode).toBe(403);
    expect((await t.app.inject("/vacancies")).statusCode).toBe(401);
  });
  it("valida la entrada con mensajes en español", async () => {
    const res = await t.call(
      recA,
      "POST",
      "/vacancies",
      validVacancy({ salaryMin: 90000, salaryMax: 50000 }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json().issues.join()).toMatch(/salario mínimo/);
  });
  it("PATCH parcial no pisa los campos no enviados", async () => {
    const res = await t.call(recA, "PATCH", `/vacancies/${vacancyA}`, { title: "Backend Senior" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      title: "Backend Senior",
      benefits: "Seguro médico",
      requiredSkills: ["Node.js", "PostgreSQL"],
      workMode: "hybrid",
    });
  });
  it("rechaza personas asignadas que no son del tenant y embudos ajenos", async () => {
    const bId = t.ids["admin-b@x.com"]!;
    expect(
      (await t.call(recA, "POST", "/vacancies", validVacancy({ ownerId: bId }))).statusCode,
    ).toBe(422);
    const foreign = (await t.call(adminB, "GET", "/pipelines")).json()[0].id;
    expect(
      (await t.call(recA, "POST", "/vacancies", validVacancy({ pipelineId: foreign }))).statusCode,
    ).toBe(422);
  });
});

describe("aislamiento entre tenants", () => {
  it("el tenant B no ve, edita ni cambia el estado de vacantes de A", async () => {
    expect((await t.call(adminB, "GET", "/vacancies")).json()).toEqual([]);
    expect((await t.call(adminB, "GET", `/vacancies/${vacancyA}`)).statusCode).toBe(404);
    expect(
      (await t.call(adminB, "PATCH", `/vacancies/${vacancyA}`, { title: "x".repeat(5) }))
        .statusCode,
    ).toBe(404);
    expect(
      (await t.call(adminB, "POST", `/vacancies/${vacancyA}/status`, { status: "published" }))
        .statusCode,
    ).toBe(404);
  });
  it("el tenant B no modifica embudos de A", async () => {
    const pid = (await t.call(adminA, "GET", "/pipelines")).json()[0].id;
    const body = { name: "X", stages: [{ name: "Contratación", type: "hiring" }] };
    expect((await t.call(adminB, "PUT", `/pipelines/${pid}`, body)).statusCode).toBe(404);
    expect((await t.call(adminB, "POST", `/pipelines/${pid}/default`)).statusCode).toBe(404);
  });
  it("el responsable de área solo ve las vacantes asignadas", async () => {
    expect((await t.call(mgrA, "GET", "/vacancies")).json()).toEqual([]);
    const assigned = await t.call(
      recA,
      "POST",
      "/vacancies",
      validVacancy({ title: "Asignada", ownerId: t.ids["mgr-a@x.com"] }),
    );
    const list = (await t.call(mgrA, "GET", "/vacancies")).json();
    expect(list.map((v: { title: string }) => v.title)).toEqual(["Asignada"]);
    expect((await t.call(mgrA, "GET", `/vacancies/${assigned.json().id}`)).statusCode).toBe(200);
    expect((await t.call(mgrA, "GET", `/vacancies/${vacancyA}`)).statusCode).toBe(404);
  });
});

describe("embudos", () => {
  it("solo el administrador edita embudos", async () => {
    const pid = (await t.call(adminA, "GET", "/pipelines")).json()[0].id;
    const body = { name: "E", stages: [{ name: "Contratación", type: "hiring" }] };
    expect((await t.call(recA, "PUT", `/pipelines/${pid}`, body)).statusCode).toBe(403);
  });
  it("rechaza órdenes inválidos y acepta un embudo propio (dos entrevistas, sin examen)", async () => {
    const bad = {
      name: "Malo",
      stages: [
        { name: "Eval", type: "assessment" },
        { name: "Entrevista", type: "interview" },
        { name: "Contratación", type: "hiring" },
      ],
    };
    expect((await t.call(adminA, "POST", "/pipelines", bad)).statusCode).toBe(422);
    const good = {
      name: "Operativo",
      stages: [
        { name: "Preselección", type: "screening" },
        { name: "Entrevista RRHH", type: "interview" },
        { name: "Entrevista jefe", type: "interview" },
        { name: "Contratación", type: "hiring" },
      ],
    };
    const res = await t.call(adminA, "POST", "/pipelines", good);
    expect(res.statusCode).toBe(201);
    expect(res.json().stages.map((s: { position: number }) => s.position)).toEqual([0, 1, 2, 3]);
    const v = await t.call(
      recA,
      "POST",
      "/vacancies",
      validVacancy({ title: "Con embudo propio", pipelineId: res.json().id }),
    );
    expect(v.statusCode).toBe(201);
    expect(v.json().pipelineId).toBe(res.json().id);
  });
});

describe("publicación y transiciones", () => {
  it("no publica una vacante incompleta", async () => {
    const draft = (
      await t.call(
        recA,
        "POST",
        "/vacancies",
        validVacancy({ title: "Sin requisitos", requiredSkills: [], requirementsRequired: "" }),
      )
    ).json();
    const res = await t.call(recA, "POST", `/vacancies/${draft.id}/status`, {
      status: "published",
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/requisito obligatorio/);
  });
  it("respeta el orden de estados y no edita vacantes cerradas", async () => {
    const v = (await t.call(recA, "POST", "/vacancies", validVacancy({ title: "Ciclo" }))).json();
    expect(
      (await t.call(recA, "POST", `/vacancies/${v.id}/status`, { status: "paused" })).statusCode,
    ).toBe(409);
    expect(
      (await t.call(recA, "POST", `/vacancies/${v.id}/status`, { status: "published" })).statusCode,
    ).toBe(200);
    expect(
      (await t.call(recA, "POST", `/vacancies/${v.id}/status`, { status: "closed" })).statusCode,
    ).toBe(200);
    expect(
      (await t.call(recA, "POST", `/vacancies/${v.id}/status`, { status: "published" })).statusCode,
    ).toBe(409);
    expect((await t.call(recA, "PATCH", `/vacancies/${v.id}`, { title: "Nuevo" })).statusCode).toBe(
      409,
    );
  });
});

describe("API pública /public/v1/jobs", () => {
  const publish = async (cookie: string, over: Record<string, unknown>) => {
    const v = (await t.call(cookie, "POST", "/vacancies", validVacancy(over))).json();
    await t.call(cookie, "POST", `/vacancies/${v.id}/status`, { status: "published" });
    return v.id as string;
  };
  let remoteId: string;
  let bId: string;

  beforeAll(async () => {
    await publish(recA, {
      title: "Contador",
      department: "Finanzas",
      workMode: "onsite",
      province: "Santiago",
      municipality: null,
      level: "senior",
      employmentType: "part_time",
      requiredSkills: ["Excel"],
      desirableSkills: [],
    });
    remoteId = await publish(recA, {
      title: "Diseñador UX",
      department: "Producto",
      workMode: "remote",
      province: "Santo Domingo",
      level: "junior",
      requiredSkills: ["Figma"],
      showSalary: true,
      salaryMin: 60000,
      salaryMax: 80000,
    });
    bId = await publish(adminB, { title: "Vacante de B" });
  });

  const get = (qs: string) =>
    t.app.inject({ url: `/public/v1/jobs?${qs}`, headers: { "x-public-key": t.keys.a } });
  const detail = (url: string, key = t.keys.a) =>
    t.app.inject({ url, headers: { "x-public-key": key } });
  const titles = (res: { json: () => { items: { title: string }[] } }) =>
    res
      .json()
      .items.map((i) => i.title)
      .sort();

  it("solo lista vacantes publicadas del tenant, sin borradores ni de otras empresas", async () => {
    const res = await get("");
    expect(res.statusCode).toBe(200);
    expect(titles(res)).toEqual(["Contador", "Diseñador UX"]);
    expect(res.json().company).toBe("Empresa A");
    expect(JSON.stringify(res.json())).not.toContain("Vacante de B");
  });
  it("filtra por texto (título y skills), ubicación, modalidad, tipo, nivel y departamento", async () => {
    expect(titles(await get("q=figma"))).toEqual(["Diseñador UX"]);
    expect(titles(await get("q=contad"))).toEqual(["Contador"]);
    expect(titles(await get("location=santiago"))).toEqual(["Contador"]);
    expect(titles(await get("mode=remote"))).toEqual(["Diseñador UX"]);
    expect(titles(await get("type=part_time"))).toEqual(["Contador"]);
    expect(titles(await get("level=junior"))).toEqual(["Diseñador UX"]);
    expect(titles(await get("department=finanzas"))).toEqual(["Contador"]);
    expect(titles(await get("since=2999-01-01"))).toEqual([]);
  });
  it("pagina y valida parámetros", async () => {
    const p1 = (await get("pageSize=1&page=1")).json();
    expect(p1).toMatchObject({ total: 2, pageSize: 1 });
    expect(p1.items).toHaveLength(1);
    expect((await get("mode=nave")).statusCode).toBe(400);
    expect((await t.app.inject("/public/v1/jobs")).statusCode).toBe(401);
    expect((await detail("/public/v1/jobs", "pk_nope")).statusCode).toBe(401);
  });
  it("no filtra datos internos y respeta el salario oculto", async () => {
    const body = JSON.stringify((await get("")).json());
    for (const k of ["ownerId", "evaluator", "knockout", "scoring", "pipelineId", "tenantId"])
      expect(body).not.toContain(k);
    const items = (await get("")).json().items as { title: string; salaryMin?: number }[];
    expect(items.find((i) => i.title === "Diseñador UX")?.salaryMin).toBe(60000);
    expect(items.find((i) => i.title === "Contador")).not.toHaveProperty("salaryMin");
  });
  it("detalle y JSON-LD solo de vacantes publicadas del tenant indicado", async () => {
    expect((await detail(`/public/v1/jobs/${remoteId}`)).statusCode).toBe(200);
    expect((await detail(`/public/v1/jobs/${remoteId}`, t.keys.b)).statusCode).toBe(404);
    expect((await detail(`/public/v1/jobs/${bId}`)).statusCode).toBe(404);
    const ld = await detail(`/public/v1/jobs/${remoteId}/jsonld`);
    expect(ld.headers["content-type"]).toMatch(/application\/ld\+json/);
    expect(ld.json()).toMatchObject({
      "@type": "JobPosting",
      title: "Diseñador UX",
      jobLocationType: "TELECOMMUTE",
      hiringOrganization: { name: "Empresa A" },
    });
    expect(ld.json().baseSalary.value.minValue).toBe(60000);
  });
  it("una vacante pausada o vencida desaparece de la búsqueda", async () => {
    await t.call(recA, "POST", `/vacancies/${remoteId}/status`, { status: "paused" });
    expect(titles(await get("q=figma"))).toEqual([]);
    expect((await detail(`/public/v1/jobs/${remoteId}`)).statusCode).toBe(404);
  });
  it("CORS: solo se refleja un origen autorizado por alguna clave activa", async () => {
    const ok = await t.app.inject({
      url: "/public/v1/jobs",
      headers: { origin: t.origins.a, "x-public-key": t.keys.a },
    });
    expect(ok.headers["access-control-allow-origin"]).toBe(t.origins.a);
    expect(ok.headers["access-control-allow-credentials"]).toBeUndefined();
    const evil = await t.app.inject({
      url: "/public/v1/jobs",
      headers: { origin: "https://evil.com", "x-public-key": t.keys.a },
    });
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
    expect(evil.statusCode).toBe(403);
    // la clave de A no sirve desde el origen de B
    expect(
      (
        await t.app.inject({
          url: "/public/v1/jobs",
          headers: { origin: t.origins.b, "x-public-key": t.keys.a },
        })
      ).statusCode,
    ).toBe(403);
    const priv = await t.app.inject({ url: "/vacancies", headers: { origin: "https://evil.com" } });
    expect(priv.headers["access-control-allow-origin"]).not.toBe("https://evil.com");
  });
});
