import { MAX_CV_BYTES, educationLevels, labels } from "@ats/shared/labels";
import { css } from "./styles";

// ---------- Utilidades ----------
const icons: Record<string, string> = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  briefcase:
    '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  upload:
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  alert:
    '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
};
const icon = (n: string, cls = "") =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[n]}</svg>`;
// Todo dato que viene de la API se escapa antes de insertarse como HTML.
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

interface Job {
  id: string;
  title: string;
  department: string;
  summary: string;
  responsibilities: string;
  benefits: string;
  requirementsRequired: string;
  requirementsDesirable: string;
  level: keyof typeof labels.level;
  employmentType: keyof typeof labels.employmentType;
  workMode: keyof typeof labels.workMode;
  province: string;
  municipality?: string | null;
  requiredSkills: string[];
  desirableSkills: string[];
  salaryMin?: number;
  salaryMax?: number;
  minYears: number;
}
interface Notice {
  version: string;
  title: string;
  body: string[];
}

// ---------- Configuración desde el <script> ----------
const script = (document.currentScript ??
  document.querySelector("script[data-key]")) as HTMLScriptElement | null;
const cfg = {
  key: script?.dataset.key ?? "",
  api: (script?.dataset.api ?? "").replace(/\/$/, ""),
  mode: script?.dataset.mode === "general" ? "general" : "jobs",
  sitekey: script?.dataset.turnstileSitekey,
  target: script?.dataset.target ?? "careers-widget",
};

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(cfg.api + path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "x-public-key": cfg.key },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      (data as { issues?: string[]; error?: string }).issues?.join(". ") ??
        (data as { error?: string }).error ??
        "Error inesperado",
    );
  return data as T;
}

// ---------- Estado y vistas ----------
type View =
  | { name: "list" }
  | { name: "detail"; job: Job }
  | { name: "apply"; job?: Job }
  | { name: "done"; code: string };

function mount(host: HTMLElement) {
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const app = document.createElement("div");
  app.className = "w auto-dark";
  root.append(style, app);

  const state = {
    view: (cfg.mode === "general" ? { name: "apply" } : { name: "list" }) as View,
    jobs: null as Job[] | null,
    total: 0,
    notice: null as Notice | null,
    filters: { q: "", mode: "", type: "", level: "" },
  };
  let searchTimer: number | undefined;

  const go = (view: View) => {
    state.view = view;
    render();
    host.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  };

  async function loadJobs() {
    state.jobs = null;
    renderList(); // solo la lista: re-renderizar la barra de filtros haria perder el foco del buscador
    const p = new URLSearchParams({ pageSize: "50" });
    Object.entries(state.filters).forEach(([k, v]) => v && p.set(k === "q" ? "q" : k, v));
    try {
      const r = await http<{ items: Job[]; total: number }>(`/public/v1/jobs?${p}`);
      state.jobs = r.items;
      state.total = r.total;
    } catch (e) {
      state.jobs = [];
      app.querySelector(".list-area")!.innerHTML =
        `<div class="err">${icon("alert")}<span>${esc((e as Error).message)}</span></div>`;
      return;
    }
    renderList();
  }

  function filterBar() {
    const opt = (o: Record<string, string>, cur: string, all: string) =>
      `<option value="">${all}</option>` +
      Object.entries(o)
        .map(([v, l]) => `<option value="${v}"${cur === v ? " selected" : ""}>${esc(l)}</option>`)
        .join("");
    const f = state.filters;
    return `<div class="bar">
      <div class="search">${icon("search")}<input type="search" data-f="q" placeholder="Buscar por puesto o skill" aria-label="Buscar vacantes" value="${esc(f.q)}"></div>
      <select data-f="mode" aria-label="Modalidad">${opt(labels.workMode, f.mode, "Modalidad")}</select>
      <select data-f="type" aria-label="Tipo de empleo">${opt(labels.employmentType, f.type, "Tipo de empleo")}</select>
      <select data-f="level" aria-label="Nivel">${opt(labels.level, f.level, "Nivel")}</select>
    </div>`;
  }

  function renderList() {
    const area = app.querySelector(".list-area");
    if (!area) return;
    if (!state.jobs)
      return void (area.innerHTML =
        '<div class="skel"></div><div class="skel"></div><div class="skel"></div>');
    if (!state.jobs.length) {
      area.innerHTML = `<div class="empty"><p>No encontramos vacantes con esos filtros.</p></div>
        <div class="cta" style="text-align:center"><button class="btn ghost" data-act="general">Enviar postulación general</button></div>`;
      return;
    }
    area.innerHTML =
      state.jobs
        .map(
          (j, i) => `<button class="card" style="--i:${i}" data-act="open" data-id="${esc(j.id)}">
        <h3>${esc(j.title)}</h3>
        <div class="meta"><span>${icon("briefcase")}${esc(j.department)}</span><span>${icon("pin")}${esc(j.province)} · ${esc(labels.workMode[j.workMode])}</span><span>${esc(labels.employmentType[j.employmentType])}</span></div>
        <div class="tags">${j.requiredSkills
          .slice(0, 4)
          .map((s) => `<span class="tag">${esc(s)}</span>`)
          .join("")}</div></button>`,
        )
        .join("") +
      `<div class="cta" style="text-align:center"><button class="btn ghost" data-act="general">¿No ves tu vacante? Envía tu postulación general</button></div>`;
  }

  const section = (title: string, text?: string) =>
    text?.trim() ? `<section><h3>${title}</h3><p>${esc(text)}</p></section>` : "";

  function detailView(j: Job) {
    const salary =
      j.salaryMin != null
        ? `<span>RD$ ${j.salaryMin.toLocaleString("es-DO")}${j.salaryMax ? " – " + j.salaryMax.toLocaleString("es-DO") : ""}</span>`
        : "";
    return `<div class="view detail"><button class="back" data-act="list">${icon("back")}Volver a las vacantes</button>
      <h2>${esc(j.title)}</h2>
      <div class="meta"><span>${icon("briefcase")}${esc(j.department)}</span><span>${icon("pin")}${esc([j.municipality, j.province].filter(Boolean).join(", "))} · ${esc(labels.workMode[j.workMode])}</span><span>${esc(labels.employmentType[j.employmentType])}</span><span>${esc(labels.level[j.level])}</span>${salary}</div>
      ${section("Resumen", j.summary)}${section("Responsabilidades", j.responsibilities)}${section("Requisitos", j.requirementsRequired)}${section("Deseable", j.requirementsDesirable)}${section("Beneficios", j.benefits)}
      ${j.requiredSkills.length ? `<section><h3>Skills</h3><div class="tags">${[...j.requiredSkills, ...j.desirableSkills].map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</div></section>` : ""}
      <div class="cta"><button class="btn" data-act="apply">Postularme</button></div></div>`;
  }

  function applyView(j?: Job) {
    const n = state.notice;
    return `<div class="view">${cfg.mode === "jobs" ? `<button class="back" data-act="${j ? "detail" : "list"}">${icon("back")}Volver</button>` : ""}
      <h2 style="font-size:20px;font-weight:700">${j ? "Postularme a " + esc(j.title) : "Postulación general"}</h2>
      ${j ? "" : '<p class="hint" style="margin-top:4px">Tu CV quedará en nuestra base de talento para futuras vacantes.</p>'}
      <form novalidate>
        <label class="full">Nombre completo<div class="c"><input name="fullName" required autocomplete="name"></div></label>
        <label>Correo electrónico<div class="c"><input name="email" type="email" required autocomplete="email"></div></label>
        <label>Teléfono<div class="c"><input name="phone" type="tel" required autocomplete="tel"></div></label>
        <label>Ubicación<div class="c"><input name="location" required placeholder="Provincia o municipio" autocomplete="address-level1"></div></label>
        <label>Nivel educativo<div class="c"><select name="educationLevel" required style="width:100%"><option value="">Selecciona</option>${educationLevels.map((l) => `<option>${esc(l)}</option>`).join("")}</select></div></label>
        <label>Años de experiencia<div class="c"><input name="yearsExperience" type="number" min="0" max="60" required></div></label>
        <label>Skills<div class="c"><input name="skills" required placeholder="Ej.: Excel, Atención al cliente"></div><span class="hint">Sepáralas con comas.</span></label>
        <label>Idiomas <span class="hint" style="display:inline">(opcional)</span><div class="c"><input name="languages" placeholder="Español, Inglés"></div></label>
        <label>Modalidad preferida <span class="hint" style="display:inline">(opcional)</span><div class="c"><select name="preferredMode" style="width:100%"><option value="">Sin preferencia</option>${Object.entries(
          labels.workMode,
        )
          .map(([v, l]) => `<option value="${v}">${esc(l)}</option>`)
          .join("")}</select></div></label>
        <label>Disponibilidad <span class="hint" style="display:inline">(opcional)</span><div class="c"><input name="availability" placeholder="Ej.: Inmediata"></div></label>
        <label class="full">Portafolio o perfil profesional <span class="hint" style="display:inline">(opcional)</span><div class="c"><input name="portfolioUrl" type="url" placeholder="https://"></div></label>
        <label class="full">Tu CV (PDF o Word, máx. 5 MB)
          <div class="c"><span class="drop">${icon("upload")}<span class="fname">Arrastra tu archivo o haz clic para elegirlo</span><input name="cv" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></span></div></label>
        <div class="full"><details><summary>${esc(n?.title ?? "Aviso de tratamiento de datos")}</summary>${(n?.body ?? []).map((p) => `<p>${esc(p)}</p>`).join("")}</details></div>
        <label class="full consent"><input type="checkbox" name="consent"><span>He leído y acepto el aviso de tratamiento de datos.</span></label>
        ${cfg.sitekey ? '<div class="full" data-captcha></div>' : ""}
        <div class="full" data-error aria-live="polite"></div>
        <div class="full"><button class="btn" type="submit">Enviar postulación</button></div>
      </form></div>`;
  }

  function doneView(code: string) {
    return `<div class="view done"><div class="ok">${icon("check")}</div><h2 style="font-size:20px">¡Recibimos tu postulación!</h2>
      <p style="color:var(--muted);margin-top:6px">Te enviamos un correo de confirmación. Guarda tu código de seguimiento:</p><span class="code">${esc(code)}</span>
      ${cfg.mode === "jobs" ? '<div class="cta"><button class="btn ghost" data-act="list">Ver más vacantes</button></div>' : ""}</div>`;
  }

  function render() {
    const v = state.view;
    if (v.name === "list") {
      app.innerHTML = `<div class="view">${filterBar()}<div class="list-area"></div></div>`;
      if (state.jobs) renderList();
      else void loadJobs();
    } else if (v.name === "detail") app.innerHTML = detailView(v.job);
    else if (v.name === "apply") {
      app.innerHTML = applyView(v.job);
      bindForm(v.job);
      if (cfg.sitekey) renderCaptcha();
    } else app.innerHTML = doneView(v.code);
  }

  // ---------- Captcha (Cloudflare Turnstile) ----------
  let captchaToken = "";
  function renderCaptcha() {
    const slot = app.querySelector<HTMLElement>("[data-captcha]");
    const w = window as unknown as { turnstile?: { render: (el: HTMLElement, o: object) => void } };
    const draw = () =>
      w.turnstile?.render(slot!, {
        sitekey: cfg.sitekey,
        callback: (t: string) => (captchaToken = t),
      });
    if (w.turnstile) return draw();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.onload = draw;
    document.head.append(s);
  }

  // ---------- Formulario ----------
  function bindForm(job?: Job) {
    const form = app.querySelector("form")!;
    const file = form.querySelector<HTMLInputElement>('input[type="file"]')!;
    const drop = form.querySelector<HTMLElement>(".drop")!;
    const fname = form.querySelector<HTMLElement>(".fname")!;
    const errBox = form.querySelector<HTMLElement>("[data-error]")!;
    const showErr = (m: string) =>
      (errBox.innerHTML = m ? `<div class="err">${icon("alert")}<span>${esc(m)}</span></div>` : "");

    file.addEventListener(
      "change",
      () =>
        (fname.textContent =
          file.files?.[0]?.name ?? "Arrastra tu archivo o haz clic para elegirlo"),
    );
    ["dragenter", "dragover"].forEach((e) =>
      drop.addEventListener(e, (ev) => (ev.preventDefault(), drop.classList.add("over"))),
    );
    ["dragleave", "drop"].forEach((e) =>
      drop.addEventListener(e, () => drop.classList.remove("over")),
    );
    drop.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const f = (ev as DragEvent).dataTransfer?.files?.[0];
      if (f) {
        const dt = new DataTransfer();
        dt.items.add(f);
        file.files = dt.files;
        file.dispatchEvent(new Event("change"));
      }
    });

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      showErr("");
      const fd = new FormData(form);
      const cv = file.files?.[0];
      if (!cv) return showErr("Adjunta tu CV en PDF o Word (.docx).");
      if (!/\.(pdf|docx)$/i.test(cv.name))
        return showErr("El CV debe ser un archivo PDF o Word (.docx).");
      if (cv.size > MAX_CV_BYTES) return showErr("El CV supera el tamaño máximo de 5 MB.");
      if (!form.checkValidity()) return (form.reportValidity(), undefined);
      if (!fd.get("consent")) return showErr("Debes aceptar el aviso de tratamiento de datos.");
      if (cfg.sitekey && !captchaToken) return showErr("Completa la verificación de seguridad.");

      fd.set("consent", "true");
      fd.set("noticeVersion", state.notice?.version ?? "");
      fd.set("captchaToken", cfg.sitekey ? captchaToken : "dev-ok");
      if (job) fd.set("vacancyId", job.id);
      for (const [k, v] of [...fd.entries()]) if (v === "") fd.delete(k);

      const btn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
      btn.disabled = true;
      btn.innerHTML = `${icon("loader", "spin")}Enviando`;
      try {
        const r = await http<{ trackingId: string }>("/public/v1/applications", {
          method: "POST",
          body: fd,
        });
        go({ name: "done", code: r.trackingId });
      } catch (e) {
        showErr((e as Error).message);
        btn.disabled = false;
        btn.textContent = "Enviar postulación";
      }
    });
  }

  // ---------- Eventos (delegación) ----------
  app.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    const cur = state.view;
    if (act === "list") go({ name: "list" });
    else if (act === "open")
      go({ name: "detail", job: state.jobs!.find((j) => j.id === el.dataset.id)! });
    else if (act === "apply" && cur.name === "detail") go({ name: "apply", job: cur.job });
    else if (act === "detail" && cur.name === "apply" && cur.job)
      go({ name: "detail", job: cur.job });
    else if (act === "general") go({ name: "apply" });
  });
  const onFilter = (e: Event) => {
    const el = e.target as HTMLInputElement;
    const k = el.dataset.f as keyof typeof state.filters | undefined;
    if (!k) return;
    state.filters[k] = el.value;
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => void loadJobs(), k === "q" ? 300 : 0);
  };
  app.addEventListener("input", onFilter);
  app.addEventListener("change", onFilter);

  http<Notice>("/public/v1/notice")
    .then((n) => ((state.notice = n), state.view.name === "apply" && render()))
    .catch(() => undefined);
  render();
}

function boot() {
  if (!cfg.key || !cfg.api)
    return console.error("[widget] Falta data-key o data-api en el script del widget.");
  let host = document.getElementById(cfg.target);
  if (!host) {
    host = document.createElement("div");
    host.id = cfg.target;
    script?.after(host);
  }
  mount(host);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
