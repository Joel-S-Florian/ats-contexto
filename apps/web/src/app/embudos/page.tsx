"use client";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Plus,
  Save,
  Star,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { stageTypeLabels, stageTypes, validateStages, type StageInput } from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Pipeline {
  id: string;
  name: string;
  isDefault: boolean;
  stages: (StageInput & { id: string })[];
}
type Draft = { name: string; stages: (StageInput & { key: string })[] };

let keySeq = 0;
const toDraft = (p: Pipeline): Draft => ({
  name: p.name,
  stages: p.stages.map((s) => ({ ...s, key: s.id })),
});
const newStage = (): Draft["stages"][number] => ({
  key: `n${keySeq++}`,
  name: "Nueva etapa",
  type: "custom",
  enabled: true,
  config: {},
  transition: { mode: "manual" },
});

export default function PipelinesPage() {
  const { me } = useAuth();
  const [list, setList] = useState<Pipeline[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const canEdit = me.role === "admin";

  const load = useCallback(
    async (select?: string) => {
      const p = await api<Pipeline[]>("/pipelines");
      setList(p);
      const target = p.find((x) => x.id === (select ?? selected)) ?? p[0];
      setSelected(target?.id ?? null);
      setDraft(target ? toDraft(target) : null);
    },
    [selected],
  );
  useEffect(() => {
    load().catch((e: ApiError) => toast.error(e.message));
    // carga inicial solamente
  }, []);

  const problems = draft ? validateStages(draft.stages) : [];
  const move = (i: number, d: -1 | 1) =>
    setDraft((cur) => {
      if (!cur) return cur;
      const stages = [...cur.stages];
      const j = i + d;
      if (j < 0 || j >= stages.length) return cur;
      [stages[i], stages[j]] = [stages[j]!, stages[i]!];
      return { ...cur, stages };
    });
  const patch = (i: number, p: Partial<StageInput>) =>
    setDraft(
      (cur) => cur && { ...cur, stages: cur.stages.map((s, k) => (k === i ? { ...s, ...p } : s)) },
    );

  // La nueva etapa se inserta antes de Contratación para no invalidar el orden.
  const addStage = () =>
    setDraft((cur) => {
      if (!cur) return cur;
      const at = cur.stages.at(-1)?.type === "hiring" ? cur.stages.length - 1 : cur.stages.length;
      return { ...cur, stages: [...cur.stages.slice(0, at), newStage(), ...cur.stages.slice(at)] };
    });

  async function save() {
    if (!draft || !selected) return;
    setSaving(true);
    try {
      const body = { name: draft.name, stages: draft.stages.map(({ key: _k, ...s }) => s) };
      await api(`/pipelines/${selected}`, { method: "PUT", body });
      toast.success("Embudo guardado");
      await load(selected);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setSaving(false);
  }

  async function create() {
    try {
      const p = await api<Pipeline>("/pipelines", {
        method: "POST",
        body: {
          name: "Nuevo embudo",
          stages: [
            { name: "Preselección", type: "screening" },
            { name: "Contratación", type: "hiring" },
          ],
        },
      });
      await load(p.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
  }

  async function makeDefault() {
    if (!selected) return;
    await api(`/pipelines/${selected}/default`, { method: "POST" });
    toast.success("Embudo predeterminado actualizado");
    await load(selected);
  }

  const current = list?.find((p) => p.id === selected);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Embudos"
        subtitle="Las etapas son configurables: activa, ordena o agrega las que necesite cada tipo de vacante."
        action={
          canEdit && (
            <button onClick={create} className="btn-ghost">
              <Plus size={16} />
              Nuevo embudo
            </button>
          )
        }
      />
      {!list ? (
        <div className="skeleton h-64" />
      ) : !current || !draft ? (
        <EmptyState icon={<Workflow size={20} />} title="No hay embudos" />
      ) : (
        <div className="grid gap-5 md:grid-cols-[220px_1fr]">
          <nav className="rise space-y-1" aria-label="Embudos">
            {list.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelected(p.id);
                  setDraft(toDraft(p));
                }}
                className={`press flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ${p.id === selected ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
              >
                <span className="truncate">{p.name}</span>
                {p.isDefault && <Star size={14} className="shrink-0" />}
              </button>
            ))}
          </nav>

          <section
            className="rise space-y-4 rounded-card border border-border bg-surface p-5 shadow-sm"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <div className="flex flex-wrap items-center gap-3">
              <input
                aria-label="Nombre del embudo"
                value={draft.name}
                disabled={!canEdit}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="field max-w-xs font-medium"
              />
              {current.isDefault ? (
                <Badge tone="accent">Predeterminado</Badge>
              ) : (
                canEdit && (
                  <button onClick={makeDefault} className="btn-ghost">
                    <Star size={16} />
                    Hacer predeterminado
                  </button>
                )
              )}
            </div>

            <ol className="space-y-2">
              {draft.stages.map((s, i) => (
                <li
                  key={s.key}
                  className={`rise flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5 transition-opacity ${s.enabled ? "bg-bg" : "bg-surface-2 opacity-60"}`}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  <input
                    aria-label="Nombre de la etapa"
                    value={s.name}
                    disabled={!canEdit}
                    onChange={(e) => patch(i, { name: e.target.value })}
                    className="field min-w-32 flex-1 !py-1.5"
                  />
                  <select
                    aria-label="Tipo de etapa"
                    value={s.type}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patch(i, {
                        type: e.target.value as StageInput["type"],
                        transition: { mode: "manual" },
                      })
                    }
                    className="field w-auto !py-1.5"
                  >
                    {stageTypes.map((t) => (
                      <option key={t} value={t}>
                        {stageTypeLabels[t]}
                      </option>
                    ))}
                  </select>
                  {s.type === "screening" && (
                    <select
                      aria-label="Avance"
                      value={s.transition.mode}
                      disabled={!canEdit}
                      onChange={(e) =>
                        patch(i, {
                          transition:
                            e.target.value === "score_threshold"
                              ? { mode: "score_threshold", min: 70 }
                              : { mode: "manual" },
                        })
                      }
                      className="field w-auto !py-1.5"
                    >
                      <option value="manual">Avance manual</option>
                      <option value="score_threshold">Avance por umbral</option>
                    </select>
                  )}
                  {s.type === "assessment" && (
                    <select
                      aria-label="Avance"
                      value={s.transition.mode}
                      disabled={!canEdit}
                      onChange={(e) =>
                        patch(i, {
                          transition:
                            e.target.value === "assessment_result"
                              ? { mode: "assessment_result", minScore: 60 }
                              : { mode: "manual" },
                        })
                      }
                      className="field w-auto !py-1.5"
                    >
                      <option value="manual">Avance manual</option>
                      <option value="assessment_result">Por resultado del examen</option>
                    </select>
                  )}
                  {s.transition.mode !== "manual" && (
                    <input
                      aria-label="Puntaje mínimo"
                      type="number"
                      min={0}
                      max={100}
                      disabled={!canEdit}
                      value={
                        s.transition.mode === "score_threshold"
                          ? s.transition.min
                          : s.transition.minScore
                      }
                      onChange={(e) =>
                        patch(i, {
                          transition:
                            s.transition.mode === "score_threshold"
                              ? { mode: "score_threshold", min: Number(e.target.value) }
                              : { mode: "assessment_result", minScore: Number(e.target.value) },
                        })
                      }
                      className="field w-20 !py-1.5"
                    />
                  )}
                  {canEdit && (
                    <div className="ml-auto flex items-center gap-1">
                      <label className="mr-1 flex items-center gap-1.5 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={s.enabled}
                          onChange={(e) => patch(i, { enabled: e.target.checked })}
                          className="size-4 accent-[var(--accent)]"
                        />
                        Activa
                      </label>
                      <button
                        aria-label="Subir"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="btn-ghost !p-1.5"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        aria-label="Bajar"
                        disabled={i === draft.stages.length - 1}
                        onClick={() => move(i, 1)}
                        className="btn-ghost !p-1.5"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        aria-label="Quitar etapa"
                        disabled={draft.stages.length === 1}
                        onClick={() =>
                          setDraft({ ...draft, stages: draft.stages.filter((_, k) => k !== i) })
                        }
                        className="btn-danger !p-1.5"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>

            <div aria-live="polite">
              {problems.length > 0 && (
                <ul className="rise space-y-1 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                  {problems.map((p) => (
                    <li key={p} className="flex items-start gap-2">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && problems.length === 0 && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <Check size={16} />
                  El orden de etapas es válido.
                </p>
              )}
            </div>

            {canEdit && (
              <div className="flex justify-between">
                <button onClick={() => addStage()} className="btn-ghost">
                  <Plus size={16} />
                  Agregar etapa
                </button>
                <button
                  onClick={save}
                  disabled={saving || problems.length > 0}
                  className="btn-primary"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar embudo
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
