import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { withPlatform } from "@ats/db";
import { NOTICE_VERSION } from "@ats/shared";
import { setupTestApp, validVacancy } from "./test-helpers.js";

// --- Generadores de archivos de prueba ---
const CV_TEXT =
  "Juan Perez desarrollador backend con cinco anos de experiencia en Node.js y PostgreSQL en Santo Domingo";

function makePdf(text: string): Buffer {
  const stream = text ? `BT /F1 12 Tf 50 700 Td (${text}) Tj ET` : "";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

function makeDocx(text: string): Buffer {
  return Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "_rels/.rels": strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      ),
      "word/document.xml": strToU8(
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      ),
    }),
  );
}

function multipart(
  fields: Record<string, string>,
  file?: { name: string; data: Buffer; field?: string },
) {
  const boundary = "----ats" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields))
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
    );
  if (file)
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? "cv"}"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      file.data,
      Buffer.from("\r\n"),
    );
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// --- Suite ---
let t: Awaited<ReturnType<typeof setupTestApp>>;
let vacancyId: string;
let vacancyB: string;
let draftId: string;
let adminA: string;
let adminB: string;
let mgrA: string;
let n = 0;

const baseFields = (over: Record<string, string> = {}) => ({
  fullName: "Juan Perez Gomez",
  email: `juan${n++}@correo.test`,
  phone: "8095551234",
  location: "Santo Domingo",
  educationLevel: "Grado universitario",
  yearsExperience: "5",
  skills: "Node.js, PostgreSQL",
  languages: "Español, Inglés",
  consent: "true",
  noticeVersion: NOTICE_VERSION,
  captchaToken: "dev-ok",
  ...over,
});

function post(
  fields: Record<string, string>,
  file?: Parameters<typeof multipart>[1],
  headers: Record<string, string> = {},
) {
  const m = multipart(fields, file);
  return t.app.inject({
    method: "POST",
    url: "/public/v1/applications",
    payload: m.payload,
    headers: {
      "content-type": m.contentType,
      "x-public-key": t.keys.a,
      origin: t.origins.a,
      ...headers,
    },
    remoteAddress: "203.0.113.77",
  });
}
const pdf = { name: "cv.pdf", data: makePdf(CV_TEXT) };
const count = (where: object) => withPlatform(t.prisma, (tx) => tx.application.count({ where }));

beforeAll(async () => {
  t = await setupTestApp(5447);
  await t.addUser("admin-a@x.com", "admin", t.tenants.a);
  await t.addUser("mgr-a@x.com", "area_manager", t.tenants.a);
  await t.addUser("admin-b@x.com", "admin", t.tenants.b);
  adminA = (await t.login("admin-a@x.com")).cookie;
  mgrA = (await t.login("mgr-a@x.com")).cookie;
  adminB = (await t.login("admin-b@x.com")).cookie;
  const mk = async (cookie: string, over: Record<string, unknown>, publish = true) => {
    const v = (await t.call(cookie, "POST", "/vacancies", validVacancy(over))).json();
    if (publish) await t.call(cookie, "POST", `/vacancies/${v.id}/status`, { status: "published" });
    return v.id as string;
  };
  vacancyId = await mk(adminA, { title: "Backend", ownerId: t.ids["mgr-a@x.com"] });
  draftId = await mk(adminA, { title: "Borrador" }, false);
  vacancyB = await mk(adminB, { title: "De B" });
}, 120_000);
afterAll(() => t?.stop());

describe("recepción y procesamiento", () => {
  it("recibe una postulación a una vacante, extrae el texto y confirma por correo", async () => {
    const fields = baseFields({ vacancyId });
    const res = await post(fields, pdf);
    expect(res.statusCode).toBe(202);
    const { trackingId } = res.json();
    await t.app.queue.drain();

    const app = await withPlatform(t.prisma, (tx) =>
      tx.application.findUniqueOrThrow({
        where: { trackingId },
        include: { documents: true, consents: true, history: true, candidate: true },
      }),
    );
    expect(app).toMatchObject({
      vacancyId,
      status: "received",
      processing: "ready",
      tenantId: t.tenants.a,
    });
    expect(app.documents[0]).toMatchObject({
      extractStatus: "ready",
      mimeType: "application/pdf",
      scanStatus: "clean",
    });
    expect(app.documents[0]!.extractedText).toContain("desarrollador backend");
    expect(app.documents[0]!.storageKey).not.toContain("cv.pdf"); // nombre generado por el sistema
    expect(app.consents[0]).toMatchObject({
      noticeVersion: NOTICE_VERSION,
      ipTruncated: "203.0.113.0",
    });
    expect(app.history[0]).toMatchObject({ toStatus: "received", automatic: true });
    expect(app.candidate.skills).toEqual(["Node.js", "PostgreSQL"]);
    expect(t.mails.findLast((m) => m.to === fields.email)?.text).toContain(trackingId);
  });

  it("acepta .docx y la postulación general (bolsa de talento, sin vacante)", async () => {
    const res = await post(baseFields(), { name: "cv.docx", data: makeDocx(CV_TEXT) });
    expect(res.statusCode).toBe(202);
    await t.app.queue.drain();
    const app = await withPlatform(t.prisma, (tx) =>
      tx.application.findUniqueOrThrow({
        where: { trackingId: res.json().trackingId },
        include: { documents: true },
      }),
    );
    expect(app.vacancyId).toBeNull();
    expect(app.documents[0]!.extractedText).toContain("desarrollador backend");
  });

  it("es idempotente: reenviar el formulario no duplica la postulación", async () => {
    const fields = baseFields({ vacancyId });
    const first = await post(fields, pdf);
    const again = await post(fields, pdf);
    expect(again.statusCode).toBe(200);
    expect(again.json().trackingId).toBe(first.json().trackingId);
    expect(await count({ candidate: { email: fields.email } })).toBe(1);
  });

  it("un PDF sin texto queda no legible y pasa a revisión manual, sin descartarse", async () => {
    const res = await post(baseFields({ vacancyId }), { name: "scan.pdf", data: makePdf("") });
    expect(res.statusCode).toBe(202);
    await t.app.queue.drain();
    const app = await withPlatform(t.prisma, (tx) =>
      tx.application.findUniqueOrThrow({
        where: { trackingId: res.json().trackingId },
        include: { history: true },
      }),
    );
    expect(app).toMatchObject({ processing: "unreadable", status: "in_review" });
    expect(app.history.at(-1)).toMatchObject({ toStatus: "in_review", automatic: true });
  });
});

describe("validación y seguridad de la recepción", () => {
  it("rechaza orígenes no permitidos y envíos sin origen", async () => {
    expect((await post(baseFields(), pdf, { origin: "https://evil.com" })).statusCode).toBe(403);
    expect((await post(baseFields(), pdf, { origin: t.origins.b })).statusCode).toBe(403);
    const m = multipart(baseFields(), pdf);
    const noOrigin = await t.app.inject({
      method: "POST",
      url: "/public/v1/applications",
      payload: m.payload,
      headers: { "content-type": m.contentType, "x-public-key": t.keys.a },
    });
    expect(noOrigin.statusCode).toBe(403);
    expect((await post(baseFields(), pdf, { "x-public-key": "pk_nope" })).statusCode).toBe(401);
  });

  it("exige consentimiento, captcha y campos válidos", async () => {
    const noConsent = await post(baseFields({ consent: "false" }), pdf);
    expect(noConsent.statusCode).toBe(400);
    expect(noConsent.json().issues.join()).toMatch(/aviso de tratamiento/);
    expect((await post(baseFields({ captchaToken: "bot" }), pdf)).statusCode).toBe(400);
    expect((await post(baseFields({ email: "no-es-correo" }), pdf)).statusCode).toBe(400);
    expect((await post(baseFields({ skills: "" }), pdf)).statusCode).toBe(400);
    expect((await post(baseFields({ noticeVersion: "vieja" }), pdf)).statusCode).toBe(409);
    expect((await post(baseFields())).statusCode).toBe(400); // sin CV
  });

  it("rechaza archivos falsificados por firma, aunque tengan extensión válida", async () => {
    const fake = await post(baseFields(), {
      name: "cv.pdf",
      data: Buffer.from("esto es texto plano, no un PDF"),
    });
    expect(fake.statusCode).toBe(415);
    const exe = await post(baseFields(), {
      name: "cv.docx",
      data: Buffer.concat([Buffer.from("MZ"), Buffer.alloc(200)]),
    });
    expect(exe.statusCode).toBe(415);
    const zip = await post(baseFields(), {
      name: "cv.docx",
      data: Buffer.from(zipSync({ "otro.txt": strToU8("hola") })),
    });
    expect(zip.statusCode).toBe(415);
    const html = await post(baseFields(), {
      name: "cv.pdf",
      data: Buffer.from("<script>alert(1)</script>"),
    });
    expect(html.statusCode).toBe(415);
  });

  it("rechaza archivos con virus y archivos mayores a 5 MB", async () => {
    const eicar = String.raw`X5O!P%@AP[4PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`;
    const infected = await post(baseFields(), {
      name: "cv.pdf",
      data: Buffer.concat([makePdf(CV_TEXT), Buffer.from(`\n%${eicar}`)]),
    });
    expect(infected.statusCode).toBe(422);
    const big = await post(baseFields(), {
      name: "cv.pdf",
      data: Buffer.concat([makePdf(CV_TEXT), Buffer.alloc(5 * 1024 * 1024 + 10, 32)]),
    });
    expect(big.statusCode).toBe(413);
  });

  it("no acepta vacantes no publicadas ni de otro tenant", async () => {
    expect((await post(baseFields({ vacancyId: draftId }), pdf)).statusCode).toBe(404);
    expect((await post(baseFields({ vacancyId: vacancyB }), pdf)).statusCode).toBe(404);
  });

  it("limita la tasa de envíos por IP y clave", async () => {
    const limited = t.build({ publicRateLimit: 2 });
    const send = () => {
      const m = multipart(baseFields(), pdf);
      return limited.inject({
        method: "POST",
        url: "/public/v1/applications",
        payload: m.payload,
        headers: { "content-type": m.contentType, "x-public-key": t.keys.a, origin: t.origins.a },
        remoteAddress: "198.51.100.9",
      });
    };
    expect((await send()).statusCode).toBe(202);
    expect((await send()).statusCode).toBe(202);
    expect((await send()).statusCode).toBe(429);
    await limited.queue.drain();
  });

  it("si falla el antivirus no acepta el archivo (falla cerrado)", async () => {
    const broken = t.build({
      scanner: {
        scan: async () => {
          throw new Error("clamd caído");
        },
      },
    });
    const m = multipart(baseFields(), pdf);
    const res = await broken.inject({
      method: "POST",
      url: "/public/v1/applications",
      payload: m.payload,
      headers: { "content-type": m.contentType, "x-public-key": t.keys.a, origin: t.origins.a },
    });
    expect(res.statusCode).toBe(503);
  });
});

describe("estado público", () => {
  it("devuelve solo el estado mínimo, sin datos personales, y solo con la clave del tenant", async () => {
    const { trackingId } = (await post(baseFields({ vacancyId }), pdf)).json();
    const ok = await t.app.inject({
      url: `/public/v1/applications/${trackingId}/status`,
      headers: { "x-public-key": t.keys.a },
    });
    expect(ok.statusCode).toBe(200);
    expect(Object.keys(ok.json()).sort()).toEqual(["status", "updatedAt"]);
    const other = await t.app.inject({
      url: `/public/v1/applications/${trackingId}/status`,
      headers: { "x-public-key": t.keys.b },
    });
    expect(other.statusCode).toBe(404);
  });
});

describe("panel: postulaciones y aislamiento", () => {
  it("el admin ve postulaciones con el texto extraído y queda auditado", async () => {
    const list = (await t.call(adminA, "GET", "/applications")).json() as {
      id: string;
      candidate: { fullName: string };
      vacancyTitle: string | null;
    }[];
    expect(list.length).toBeGreaterThan(3);
    const detail = await t.call(adminA, "GET", `/applications/${list[0]!.id}`);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().documents[0].extractedText).toBeTruthy();
    const logs = await withPlatform(t.prisma, (tx) =>
      tx.auditLog.count({ where: { tenantId: t.tenants.a, action: "application.viewed" } }),
    );
    expect(logs).toBeGreaterThan(0);
  });
  it("el tenant B no ve ni abre postulaciones de A", async () => {
    expect((await t.call(adminB, "GET", "/applications")).json()).toEqual([]);
    const id = ((await t.call(adminA, "GET", "/applications")).json() as { id: string }[])[0]!.id;
    expect((await t.call(adminB, "GET", `/applications/${id}`)).statusCode).toBe(404);
  });
  it("el responsable de área solo ve postulaciones de sus vacantes, no la bolsa general", async () => {
    const list = (await t.call(mgrA, "GET", "/applications")).json() as {
      vacancyId: string | null;
    }[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => a.vacancyId === vacancyId)).toBe(true);
    const general = (
      (await t.call(adminA, "GET", "/applications?scope=general")).json() as { id: string }[]
    )[0]!;
    expect((await t.call(mgrA, "GET", `/applications/${general.id}`)).statusCode).toBe(404);
  });
});

describe("claves públicas", () => {
  it("solo el admin gestiona claves; valida orígenes; revocar corta el acceso", async () => {
    expect((await t.call(mgrA, "GET", "/api-keys")).statusCode).toBe(403);
    expect(
      (
        await t.call(adminA, "POST", "/api-keys", {
          label: "X",
          allowedOrigins: ["http://sitio-inseguro.com"],
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await t.call(adminA, "POST", "/api-keys", { label: "X", allowedOrigins: ["*"] })).statusCode,
    ).toBe(400);
    const created = await t.call(adminA, "POST", "/api-keys", {
      label: "Nueva",
      allowedOrigins: ["https://careers.acme.do/", "http://localhost:3100"],
    });
    expect(created.statusCode).toBe(201);
    const key = created.json();
    expect(key.publicKey).toMatch(/^pk_live_/);
    expect(key.allowedOrigins).toEqual(["https://careers.acme.do", "http://localhost:3100"]);
    const use = () =>
      t.app.inject({
        url: "/public/v1/jobs",
        headers: { "x-public-key": key.publicKey, origin: "https://careers.acme.do" },
      });
    expect((await use()).statusCode).toBe(200);
    expect((await t.call(adminB, "DELETE", `/api-keys/${key.id}`)).statusCode).toBe(404);
    expect((await t.call(adminA, "DELETE", `/api-keys/${key.id}`)).statusCode).toBe(204);
    expect((await use()).statusCode).toBe(401);
  });
});
