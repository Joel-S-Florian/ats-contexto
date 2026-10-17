"use client";
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Clock, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { questionTypeLabels, questionTypes } from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { EmptyState, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type QType = (typeof questionTypes)[number];
interface Q {
  type: QType;
  prompt: string;
  options: string[];
  correctAnswer: number | boolean | null;
  points: number;
}
interface Mod {
  title: string;
  questions: Q[];
}
interface Draft {
  id?: string;
  name: string;
  description: string;
  timeLimitMin: number;
  passingScore: number;
  modules: Mod[];
}
interface Row {
  id: string;
  name: string;
  timeLimitMin: number;
  passingScore: number;
  modules: { id: string; questions: { id: string }[] }[];
}

const blankQ = (type: QType = "multiple_choice"): Q => ({
  type,
  prompt: "",
  options: type === "multiple_choice" ? ["", ""] : [],
  correctAnswer: type === "true_false" ? true : type === "multiple_choice" ? 0 : null,
  points: 1,
});
const blank = (): Draft => ({
  name: "",
  description: "",
  timeLimitMin: 30,
  passingScore: 60,
  modules: [{ title: "Módulo 1", questions: [blankQ()] }],
});

export default function AssessmentsPage() {
  const { me } = useAuth();
  const canEdit = me.role === "admin" || me.role === "recruiter";
  const [list, setList] = useState<Row[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api<Row[]>("/assessment-templates")
        .then(setList)
        .catch((e: ApiError) => toast.error(e.message)),
    [],
  );
  useEffect(() => {
    if (canEdit) void load();
  }, [load, canEdit]);

  async function edit(id: string) {
    const t = await api<
      Draft & { modules: { title: string; questions: (Q & { options: string[] })[] }[] }
    >(`/assessment-templates/${id}`);
    setDraft({ ...t, id });
  }
  const setQ = (mi: number, qi: number, p: Partial<Q>) =>
    setDraft(
      (d) =>
        d && {
          ...d,
          modules: d.modules.map((m, i) =>
            i !== mi
              ? m
              : { ...m, questions: m.questions.map((q, j) => (j === qi ? { ...q, ...p } : q)) },
          ),
        },
    );

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const body = {
        name: draft.name,
        description: draft.description,
        timeLimitMin: draft.timeLimitMin,
        passingScore: draft.passingScore,
        modules: draft.modules,
      };
      if (draft.id) await api(`/assessment-templates/${draft.id}`, { method: "PUT", body });
      else await api("/assessment-templates", { method: "POST", body });
      toast.success("Examen guardado");
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setBusy(false);
  }
  async function remove(id: string) {
    if (!confirm("¿Eliminar este examen?")) return;
    try {
      await api(`/assessment-templates/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
  }

  if (!canEdit) return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;

  if (draft)
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          title={draft.id ? "Editar examen" : "Nuevo examen"}
          subtitle="Las preguntas cerradas se califican solas; las cortas las revisa una persona."
        />
        <section className="rise grid gap-3 rounded-card border border-border bg-surface p-5 shadow-sm sm:grid-cols-3">
          <label className="text-sm font-medium sm:col-span-3">
            Nombre
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="field mt-1.5"
            />
          </label>
          <label className="text-sm font-medium sm:col-span-3">
            Descripción (la ve el candidato)
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="field mt-1.5"
            />
          </label>
          <label className="text-sm font-medium">
            Tiempo límite (min)
            <input
              type="number"
              min={1}
              value={draft.timeLimitMin}
              onChange={(e) => setDraft({ ...draft, timeLimitMin: Number(e.target.value) })}
              className="field mt-1.5"
            />
          </label>
          <label className="text-sm font-medium">
            Puntaje mínimo (%)
            <input
              type="number"
              min={0}
              max={100}
              value={draft.passingScore}
              onChange={(e) => setDraft({ ...draft, passingScore: Number(e.target.value) })}
              className="field mt-1.5"
            />
          </label>
        </section>

        {draft.modules.map((m, mi) => (
          <section
            key={mi}
            className="rise rounded-card border border-border bg-surface p-5 shadow-sm"
          >
            <div className="mb-4 flex gap-2">
              <input
                aria-label="Título del módulo"
                value={m.title}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    modules: draft.modules.map((x, i) =>
                      i === mi ? { ...x, title: e.target.value } : x,
                    ),
                  })
                }
                className="field font-medium"
              />
              {draft.modules.length > 1 && (
                <button
                  aria-label="Quitar módulo"
                  onClick={() =>
                    setDraft({ ...draft, modules: draft.modules.filter((_, i) => i !== mi) })
                  }
                  className="btn-danger !px-2.5"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <ol className="space-y-4">
              {m.questions.map((q, qi) => (
                <li key={qi} className="rounded-xl border border-border bg-bg p-4">
                  <div className="flex flex-wrap gap-2">
                    <select
                      aria-label="Tipo"
                      value={q.type}
                      onChange={(e) => setQ(mi, qi, blankQ(e.target.value as QType))}
                      className="field w-auto !py-1.5"
                    >
                      {questionTypes.map((t) => (
                        <option key={t} value={t}>
                          {questionTypeLabels[t]}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Puntos"
                      type="number"
                      min={1}
                      value={q.points}
                      onChange={(e) => setQ(mi, qi, { points: Number(e.target.value) })}
                      className="field w-20 !py-1.5"
                      title="Puntos"
                    />
                    <button
                      aria-label="Quitar pregunta"
                      disabled={m.questions.length === 1}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          modules: draft.modules.map((x, i) =>
                            i === mi
                              ? { ...x, questions: x.questions.filter((_, j) => j !== qi) }
                              : x,
                          ),
                        })
                      }
                      className="btn-danger ml-auto !p-1.5"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <textarea
                    aria-label="Pregunta"
                    rows={2}
                    value={q.prompt}
                    placeholder="Escribe la pregunta"
                    onChange={(e) => setQ(mi, qi, { prompt: e.target.value })}
                    className="field mt-2"
                  />
                  {q.type === "multiple_choice" && (
                    <div className="mt-2 space-y-1.5">
                      {q.options.map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`c-${mi}-${qi}`}
                            checked={q.correctAnswer === oi}
                            onChange={() => setQ(mi, qi, { correctAnswer: oi })}
                            className="size-4 accent-[var(--accent)]"
                            aria-label="Opción correcta"
                          />
                          <input
                            value={o}
                            placeholder={`Opción ${oi + 1}`}
                            onChange={(e) =>
                              setQ(mi, qi, {
                                options: q.options.map((x, k) => (k === oi ? e.target.value : x)),
                              })
                            }
                            className="field !py-1.5"
                          />
                          {q.options.length > 2 && (
                            <button
                              aria-label="Quitar opción"
                              onClick={() =>
                                setQ(mi, qi, {
                                  options: q.options.filter((_, k) => k !== oi),
                                  correctAnswer: 0,
                                })
                              }
                              className="btn-ghost !p-1.5"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      {q.options.length < 8 && (
                        <button
                          onClick={() => setQ(mi, qi, { options: [...q.options, ""] })}
                          className="text-xs font-medium text-accent"
                        >
                          + Agregar opción
                        </button>
                      )}
                      <p className="text-xs text-muted">Marca la opción correcta.</p>
                    </div>
                  )}
                  {q.type === "true_false" && (
                    <div className="mt-2 flex gap-2">
                      {[true, false].map((v) => (
                        <button
                          key={String(v)}
                          type="button"
                          onClick={() => setQ(mi, qi, { correctAnswer: v })}
                          className={`press flex-1 rounded-lg border px-3 py-1.5 text-sm ${q.correctAnswer === v ? "border-accent bg-accent-soft text-accent" : "border-border"}`}
                        >
                          {v ? "Verdadero" : "Falso"} es lo correcto
                        </button>
                      ))}
                    </div>
                  )}
                  {q.type === "short_answer" && (
                    <p className="mt-2 text-xs text-muted">
                      Sin clave: la revisa una persona y asigna los puntos.
                    </p>
                  )}
                </li>
              ))}
            </ol>
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  modules: draft.modules.map((x, i) =>
                    i === mi ? { ...x, questions: [...x.questions, blankQ()] } : x,
                  ),
                })
              }
              className="btn-ghost mt-3"
            >
              <Plus size={14} />
              Agregar pregunta
            </button>
          </section>
        ))}

        <div className="flex flex-wrap justify-between gap-2">
          <button
            onClick={() =>
              setDraft({
                ...draft,
                modules: [
                  ...draft.modules,
                  { title: `Módulo ${draft.modules.length + 1}`, questions: [blankQ()] },
                ],
              })
            }
            className="btn-ghost"
          >
            <Plus size={14} />
            Agregar módulo
          </button>
          <div className="flex gap-2">
            <button onClick={() => setDraft(null)} className="btn-ghost">
              Cancelar
            </button>
            <button onClick={save} disabled={busy} className="btn-primary">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Guardar
              examen
            </button>
          </div>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Evaluaciones"
        subtitle="Exámenes generalistas que el candidato responde desde un enlace personal."
        action={
          <button onClick={() => setDraft(blank())} className="btn-primary">
            <Plus size={16} />
            Nuevo examen
          </button>
        }
      />
      <section className="rounded-card border border-border bg-surface shadow-sm">
        {!list ? (
          <div className="skeleton m-5 h-16" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck size={20} />}
            title="Aún no tienes exámenes"
            hint="Crea uno y envíalo desde la ficha de un candidato."
          />
        ) : (
          <ul>
            {list.map((t, i) => (
              <li
                key={t.id}
                style={{ "--i": i } as React.CSSProperties}
                className="rise flex items-center gap-3 border-b border-border px-5 py-4 last:border-0"
              >
                <button onClick={() => edit(t.id)} className="press min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="mt-0.5 flex gap-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} />
                      {t.timeLimitMin} min
                    </span>
                    <span>{t.modules.reduce((n, m) => n + m.questions.length, 0)} preguntas</span>
                    <span>Mínimo {t.passingScore}%</span>
                  </p>
                </button>
                <button
                  aria-label="Eliminar"
                  onClick={() => remove(t.id)}
                  className="btn-danger !p-1.5"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
