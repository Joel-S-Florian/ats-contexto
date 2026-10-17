// Llena un entorno de desarrollo con datos de ejemplo usando la API real (no toca la BD directamente).
// Uso: pnpm --filter @ats/api populate   (API en :4000, tras `pnpm db:dev`)
import { makePdf } from "../src/test-files.js";

const API = process.env.API_URL ?? "http://localhost:4000";
const WEB = "http://localhost:3000";
const SITE = "http://localhost:3100";
const PK = "pk_demo_local_0001";

let cookie = "";
async function api(method: string, path: string, body?: unknown) {
  const r = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", origin: WEB, cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 200)}`);
  return { data, res: r };
}
const tryApi = async (...a: Parameters<typeof api>) => {
  try {
    return (await api(...a)).data;
  } catch (e) {
    console.log("  omitido:", (e as Error).message);
    return null;
  }
};

const login = async (email: string) => {
  cookie = "";
  const { res } = await api("POST", "/auth/login", { email, password: "demo-demo-1234" });
  cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
};

const pick = <T>(a: readonly T[], i: number) => a[i % a.length]!;
const names = ["María", "José", "Ana", "Luis", "Carla", "Pedro", "Yesenia", "Rafael", "Laura", "Miguel", "Rosa", "Carlos", "Sofía", "Juan", "Daniela", "Andrés", "Karina", "Víctor", "Paola", "Ramón"];
const last = ["Fernández", "Pérez", "Rodríguez", "Martínez", "De la Cruz", "Santana", "Peña", "Reyes", "Gómez", "Báez", "Almonte", "Sosa", "Núñez", "Jiménez", "Castillo"];
const places = ["Santo Domingo", "Santiago", "La Vega", "San Cristóbal", "Punta Cana", "Puerto Plata", "San Pedro de Macorís"];
const edu = ["Secundaria", "Técnico", "Grado universitario", "Postgrado", "Maestría"];

const extraVacancies = [
  { title: "Analista de Datos", department: "Tecnología", summary: "Construirás tableros y análisis para las áreas de negocio.", level: "semi_senior", employmentType: "full_time", workMode: "remote", province: "Distrito Nacional", requiredSkills: ["SQL", "Excel", "Power BI"], minYears: 2 },
  { title: "Contador General", department: "Finanzas", summary: "Cierre mensual, impuestos y conciliaciones.", level: "senior", employmentType: "full_time", workMode: "onsite", province: "Santiago", requiredSkills: ["Contabilidad", "DGII", "Excel"], minYears: 4 },
  { title: "Diseñador Gráfico", department: "Mercadeo", summary: "Piezas para redes, impresos y campañas.", level: "junior", employmentType: "contract", workMode: "hybrid", province: "Distrito Nacional", requiredSkills: ["Photoshop", "Illustrator", "Figma"], minYears: 1 },
  { title: "Supervisor de Almacén", department: "Logística", summary: "Control de inventario y despachos.", level: "semi_senior", employmentType: "full_time", workMode: "onsite", province: "Santo Domingo Oeste", requiredSkills: ["Inventario", "Logística", "Liderazgo"], minYears: 3 },
  { title: "Coordinador de Recursos Humanos", department: "RRHH", summary: "Apoyo en reclutamiento, nómina y clima.", level: "semi_senior", employmentType: "full_time", workMode: "hybrid", province: "Distrito Nacional", requiredSkills: ["Reclutamiento", "Nómina", "Legislación laboral"], minYears: 3 },
];

type V = { id: string; title: string; status: string };
const itemsOf = <T>(d: unknown) => ((d as { items?: T[] }).items ?? d) as T[];

async function main() {
  await login("admin@demo.test");
  const have = new Set(itemsOf<V>((await api("GET", "/vacancies")).data).map((v) => v.title));
  for (const v of extraVacancies) {
    if (have.has(v.title)) continue;
    const { data } = await api("POST", "/vacancies", { ...v, benefits: "Seguro médico y bono anual" });
    await tryApi("POST", `/vacancies/${data.id}/status`, { status: "published" });
    console.log("vacante:", v.title);
  }
  const vacancies = itemsOf<V>((await api("GET", "/vacancies")).data).filter(
    (v) => v.status === "published",
  );

  // Postulaciones por el endpoint publico, con calidad variable (puntajes altos, medios y descartes).
  const { data: notice } = await api("GET", "/public/v1/notice");
  let n = 0;
  for (const v of vacancies) {
    const { data: det } = await api("GET", `/vacancies/${v.id}`);
    const req: string[] =
      det.requiredSkills ??
      (det.skills ?? []).filter((s: { kind: string }) => s.kind === "required").map((s: { name: string }) => s.name);
    for (let i = 0; i < 9; i++, n++) {
      const quality = i % 3; // 0 fuerte, 1 medio, 2 debil
      const skills = quality === 0 ? req : quality === 1 ? req.slice(0, Math.max(1, req.length - 1)) : ["Ofimática"];
      const name = `${pick(names, n * 3 + i)} ${pick(last, n * 7 + i)}`;
      const years = quality === 0 ? 5 + (i % 4) : quality === 1 ? 2 : 0;
      const slug = name.normalize("NFD").replace(/[^a-zA-Z ]/g, "").toLowerCase().replace(/ /g, ".");
      const f: Record<string, string> = {
        vacancyId: v.id,
        fullName: name,
        email: `${slug}.${n}@ejemplo.test`,
        phone: `809555${String(1000 + n).slice(-4)}`,
        location: pick(places, n),
        educationLevel: pick(edu, quality === 0 ? 2 + (i % 3) : i),
        yearsExperience: String(years),
        skills: skills.join(", "),
        languages: "Español, Inglés",
        consent: "true",
        noticeVersion: notice.version,
        captchaToken: "dev-ok",
      };
      const fd = new FormData();
      for (const [k, val] of Object.entries(f)) fd.set(k, val);
      const cvText = `${name} profesional con ${years} anos de experiencia. Habilidades: ${skills.join(", ")}. Ubicada en ${f.location}. Educacion: ${f.educationLevel}.`;
      fd.set("cv", new Blob([new Uint8Array(makePdf(cvText))], { type: "application/pdf" }), "cv.pdf");
      const r = await fetch(`${API}/public/v1/applications`, {
        method: "POST",
        headers: { "x-public-key": PK, origin: SITE },
        body: fd,
      });
      if (!r.ok) {
        console.log("postulacion fallo:", r.status, (await r.text()).slice(0, 120));
        if (r.status === 429) break;
      }
    }
    console.log("postulaciones:", v.title);
  }

  // Tiempo para la extraccion y la preseleccion (cola en memoria).
  await new Promise((r) => setTimeout(r, 8000));

  // Avanzar candidatos por el embudo con acciones de personas.
  const rows = itemsOf<{ id: string; status: string }>((await api("GET", "/applications")).data);
  console.log("postulaciones en el sistema:", rows.length);
  const cand = rows.filter((a) => ["shortlisted", "in_review", "screening", "received"].includes(a.status));
  const notes = [
    "Buen perfil, conversar sobre disponibilidad.",
    "Referencia positiva de un contacto del equipo.",
    "Pretensión salarial dentro del rango.",
    "Dudas sobre experiencia en el sector; validar en entrevista.",
  ];
  let k = 0;
  for (const a of cand.slice(0, 24)) {
    await tryApi("POST", `/applications/${a.id}/notes`, { body: pick(notes, k) });
    if (k % 6 === 5) {
      await tryApi("POST", `/applications/${a.id}/move`, { status: "low_fit", reason: "No alcanza la experiencia mínima requerida." });
    } else if (k < 14) {
      await tryApi("POST", `/applications/${a.id}/move`, { status: "interview", reason: "Avanza a entrevista." });
      await tryApi("POST", `/applications/${a.id}/interviews`, {
        scheduledAt: new Date(Date.now() + (2 + k) * 86400000).toISOString(),
        durationMin: 45,
        mode: k % 2 ? "virtual" : "onsite",
        ...(k % 2
          ? { meetingUrl: "https://meet.example.com/abc-defg", platform: "Meet" }
          : { location: "Oficina principal, Piantini" }),
        participantIds: [],
        messageToCandidate: "Te esperamos.",
      });
      if (k < 8) {
        await tryApi("POST", `/applications/${a.id}/move`, { status: "selection", reason: "Entrevista satisfactoria." });
        if (k < 3) {
          await tryApi("POST", `/applications/${a.id}/selection`, { decision: "selected", reason: "Mejor ajuste al puesto." });
          if (k < 2)
            await tryApi("POST", `/applications/${a.id}/hire`, {
              confirm: true,
              startDate: new Date(Date.now() + 14 * 86400000).toISOString(),
            });
        } else if (k === 3) {
          await tryApi("POST", `/applications/${a.id}/selection`, { decision: "on_hold", reason: "A la espera de presupuesto." });
        } else if (k === 4) {
          await tryApi("POST", `/applications/${a.id}/selection`, { decision: "not_selected", reason: "Se eligió a otra persona con más experiencia." });
        }
      }
    }
    k++;
  }

  // La segunda empresa tambien recibe algo, para ver el panel de otro tenant.
  await login("admin@norte.test");
  if (itemsOf<V>((await api("GET", "/vacancies")).data).length === 0) {
    for (const v of extraVacancies.slice(0, 2)) {
      const { data } = await api("POST", "/vacancies", { ...v, benefits: "Seguro médico" });
      await tryApi("POST", `/vacancies/${data.id}/status`, { status: "published" });
    }
    console.log("vacantes de Distribuidora Norte creadas");
  }
  console.log("Listo.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
