"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, Save, Workflow, XCircle } from "lucide-react";
import { toast } from "sonner";
import { employmentTypes, experienceLevels, jobCategories, labels, workModes } from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { Suggestions } from "@/components/suggestions";
import { Badge, Field, PageHeader, TagInput, statusTone } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export interface VacancyForm {
  title: string;
  department: string;
  summary: string;
  responsibilities: string;
  benefits: string;
  requirementsRequired: string;
  requirementsDesirable: string;
  category: (typeof jobCategories)[number];
  level: (typeof experienceLevels)[number];
  minYears: number;
  minEducation: string;
  languages: string[];
  employmentType: (typeof employmentTypes)[number];
  workMode: (typeof workModes)[number];
  province: string;
  municipality: string;
  salaryMin: number | null;
  salaryMax: number | null;
  showSalary: boolean;
  openings: number;
  closesAt: string;
  pipelineId: string;
  ownerId: string;
  requiredSkills: string[];
  desirableSkills: string[];
}
type Saved = Partial<VacancyForm> & {
  id: string;
  status: keyof typeof labels.status;
  closesAt?: string | null;
  minEducation?: string | null;
  municipality?: string | null;
  ownerId?: string | null;
};
interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
}
interface Member {
  id: string;
  name: string;
  role: string;
}

const empty: VacancyForm = {
  title: "",
  department: "",
  summary: "",
  responsibilities: "",
  benefits: "",
  requirementsRequired: "",
  requirementsDesirable: "",
  category: "general",
  level: "junior",
  minYears: 0,
  minEducation: "",
  languages: ["Español"],
  employmentType: "full_time",
  workMode: "onsite",
  province: "",
  municipality: "",
  salaryMin: null,
  salaryMax: null,
  showSalary: false,
  openings: 1,
  closesAt: "",
  pipelineId: "",
  ownerId: "",
  requiredSkills: [],
  desirableSkills: [],
};

const Section = ({
  title,
  i,
  children,
}: {
  title: string;
  i: number;
  children: React.ReactNode;
}) => (
  <section
    style={{ "--i": i } as React.CSSProperties}
    className="rise rounded-card border border-border bg-surface p-5 shadow-sm"
  >
    <h2 className="mb-4 text-sm font-semibold">{title}</h2>
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  </section>
);

const Select = <T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Record<string, string>;
}) => (
  <select value={value} onChange={(e) => onChange(e.target.value as T)} className="field">
    {Object.entries(options).map(([v, l]) => (
      <option key={v} value={v}>
        {l}
      </option>
    ))}
  </select>
);

export function VacancyEditor({ id }: { id?: string }) {
  const router = useRouter();
  const { me } = useAuth();
  const [form, setForm] = useState<VacancyForm>(empty);
  const [status, setStatus] = useState<Saved["status"]>("draft");
  const [loaded, setLoaded] = useState(!id);
  const [saving, setSaving] = useState(false);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const canWrite = me.role === "admin" || me.role === "recruiter";
  const closed = status === "closed";
  const set = <K extends keyof VacancyForm>(k: K, v: VacancyForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api<Pipeline[]>("/pipelines")
      .then((p) => {
        setPipelines(p);
        if (!id) setForm((f) => ({ ...f, pipelineId: p.find((x) => x.isDefault)?.id ?? "" }));
      })
      .catch(() => undefined);
    if (me.role === "admin")
      api<Member[]>("/users")
        .then(setMembers)
        .catch(() => undefined);
    if (id)
      api<Saved>(`/vacancies/${id}`)
        .then((v) => {
          setStatus(v.status);
          setForm({
            ...empty,
            ...v,
            minEducation: v.minEducation ?? "",
            municipality: v.municipality ?? "",
            ownerId: v.ownerId ?? "",
            closesAt: v.closesAt ? v.closesAt.slice(0, 10) : "",
          } as VacancyForm);
          setLoaded(true);
        })
        .catch((e: ApiError) => toast.error(e.message));
  }, [id, me.role]);

  const payload = () => ({
    ...form,
    minEducation: form.minEducation || null,
    municipality: form.municipality || null,
    ownerId: form.ownerId || null,
    closesAt: form.closesAt || null,
    pipelineId: form.pipelineId || undefined,
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (id) {
        await api(`/vacancies/${id}`, { method: "PATCH", body: payload() });
        toast.success("Vacante guardada");
      } else {
        const v = await api<{ id: string }>("/vacancies", { method: "POST", body: payload() });
        toast.success("Vacante creada como borrador");
        router.replace(`/vacantes/${v.id}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error inesperado");
    }
    setSaving(false);
  }

  async function changeStatus(next: Saved["status"]) {
    try {
      await api(`/vacancies/${id}/status`, { method: "POST", body: { status: next } });
      setStatus(next);
      toast.success(`Vacante ${labels.status[next].toLowerCase()}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error inesperado");
    }
  }

  if (!loaded)
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="skeleton h-10 w-64" />
        <div className="skeleton h-64" />
      </div>
    );

  return (
    <form onSubmit={save} className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={id ? form.title || "Vacante" : "Nueva vacante"}
        subtitle={id ? undefined : "Se guarda como borrador; publícala cuando esté lista."}
        action={
          id && (
            <div className="flex items-center gap-2">
              <Link href={`/vacantes/${id}/embudo`} className="btn-ghost">
                <Workflow size={16} />
                Ver embudo
              </Link>
              <Badge tone={statusTone[status]}>{labels.status[status]}</Badge>
            </div>
          )
        }
      />
      <fieldset disabled={!canWrite || closed} className="space-y-5">
        <Section title="Datos del puesto" i={1}>
          <Field label="Título" className="sm:col-span-2">
            <input
              required
              minLength={3}
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Departamento">
            <input
              required
              value={form.department}
              onChange={(e) => set("department", e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Categoría" hint="Define los pesos de puntaje por defecto.">
            <Select
              value={form.category}
              onChange={(v) => set("category", v)}
              options={labels.category}
            />
          </Field>
          <Field label="Resumen" className="sm:col-span-2">
            <textarea
              required
              rows={3}
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Responsabilidades" className="sm:col-span-2">
            <textarea
              rows={4}
              value={form.responsibilities}
              onChange={(e) => set("responsibilities", e.target.value)}
              className="field"
            />
          </Field>
        </Section>

        <Section title="Perfil buscado" i={2}>
          <Field label="Nivel">
            <Select value={form.level} onChange={(v) => set("level", v)} options={labels.level} />
          </Field>
          <Field label="Años mínimos de experiencia">
            <input
              type="number"
              min={0}
              max={50}
              value={form.minYears}
              onChange={(e) => set("minYears", Number(e.target.value))}
              className="field"
            />
          </Field>
          <Field label="Formación mínima">
            <input
              value={form.minEducation}
              onChange={(e) => set("minEducation", e.target.value)}
              placeholder="Ej.: Licenciatura en Informática"
              className="field"
            />
          </Field>
          <Field label="Idiomas requeridos">
            <TagInput
              value={form.languages}
              onChange={(v) => set("languages", v)}
              placeholder="Escribe y presiona Enter"
            />
          </Field>
          <Field
            label="Skills obligatorias"
            hint="Entran al filtro y al puntaje."
            className="sm:col-span-2"
          >
            <TagInput
              value={form.requiredSkills}
              onChange={(v) => set("requiredSkills", v)}
              placeholder="Ej.: Node.js"
            />
          </Field>
          <Field label="Skills deseables" className="sm:col-span-2">
            <TagInput
              value={form.desirableSkills}
              onChange={(v) => set("desirableSkills", v)}
              placeholder="Ej.: Docker"
            />
          </Field>
          <Field label="Requisitos obligatorios" className="sm:col-span-2">
            <textarea
              rows={3}
              value={form.requirementsRequired}
              onChange={(e) => set("requirementsRequired", e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Requisitos deseables" className="sm:col-span-2">
            <textarea
              rows={3}
              value={form.requirementsDesirable}
              onChange={(e) => set("requirementsDesirable", e.target.value)}
              className="field"
            />
          </Field>
        </Section>

        <Section title="Condiciones" i={3}>
          <Field label="Tipo de empleo">
            <Select
              value={form.employmentType}
              onChange={(v) => set("employmentType", v)}
              options={labels.employmentType}
            />
          </Field>
          <Field label="Modalidad">
            <Select
              value={form.workMode}
              onChange={(v) => set("workMode", v)}
              options={labels.workMode}
            />
          </Field>
          <Field label="Provincia">
            <input
              required
              value={form.province}
              onChange={(e) => set("province", e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Municipio">
            <input
              value={form.municipality}
              onChange={(e) => set("municipality", e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Salario mínimo (DOP)">
            <input
              type="number"
              min={0}
              value={form.salaryMin ?? ""}
              onChange={(e) =>
                set("salaryMin", e.target.value === "" ? null : Number(e.target.value))
              }
              className="field"
            />
          </Field>
          <Field label="Salario máximo (DOP)">
            <input
              type="number"
              min={0}
              value={form.salaryMax ?? ""}
              onChange={(e) =>
                set("salaryMax", e.target.value === "" ? null : Number(e.target.value))
              }
              className="field"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.showSalary}
              onChange={(e) => set("showSalary", e.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            Mostrar el salario en la página de empleo
          </label>
          <Field label="Beneficios" className="sm:col-span-2">
            <textarea
              rows={3}
              value={form.benefits}
              onChange={(e) => set("benefits", e.target.value)}
              className="field"
            />
          </Field>
        </Section>

        <Section title="Proceso" i={4}>
          <Field label="Plazas">
            <input
              type="number"
              min={1}
              value={form.openings}
              onChange={(e) => set("openings", Number(e.target.value))}
              className="field"
            />
          </Field>
          <Field label="Fecha de cierre">
            <input
              type="date"
              value={form.closesAt}
              onChange={(e) => set("closesAt", e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Embudo">
            <select
              value={form.pipelineId}
              onChange={(e) => set("pipelineId", e.target.value)}
              className="field"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? " (predeterminado)" : ""}
                </option>
              ))}
            </select>
          </Field>
          {me.role === "admin" && (
            <Field label="Responsable de área">
              <select
                value={form.ownerId}
                onChange={(e) => set("ownerId", e.target.value)}
                className="field"
              >
                <option value="">Sin asignar</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Section>
      </fieldset>

      {id && canWrite && !closed && <Suggestions vacancyId={id} />}

      {canWrite && !closed && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-2 rounded-card border border-border bg-surface/90 p-3 shadow-md backdrop-blur">
          {id && status !== "published" && (
            <button type="button" onClick={() => changeStatus("published")} className="btn-ghost">
              <Play size={16} />
              Publicar
            </button>
          )}
          {id && status === "published" && (
            <button type="button" onClick={() => changeStatus("paused")} className="btn-ghost">
              <Pause size={16} />
              Pausar
            </button>
          )}
          {id && (
            <button
              type="button"
              onClick={() =>
                confirm("¿Cerrar la vacante? No se podrá reabrir.") && changeStatus("closed")
              }
              className="btn-danger"
            >
              <XCircle size={16} />
              Cerrar
            </button>
          )}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar
          </button>
        </div>
      )}
    </form>
  );
}
