"use client";
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Attempt {
  id: string;
  template: string;
  passingScore: number;
  status: "invited" | "in_progress" | "submitted" | "expired";
  expiresAt: string;
  submittedAt: string | null;
  timedOut: boolean;
  finalScore: number | null;
  needsReview: boolean;
  openAnswers: {
    questionId: string;
    prompt: string;
    answer: string;
    maxPoints: number;
    points: number | null;
  }[];
}
interface External {
  id: string;
  description: string;
  performedAt: string;
  method: string;
  evaluators: string[];
  result: string;
  score: number | null;
  observations: string;
}

const fmt = (d: string) =>
  new Date(d).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
const statusText = {
  invited: "Enviada",
  in_progress: "En curso",
  submitted: "Entregada",
  expired: "Vencida",
} as const;

/** Evaluación generalista (examen por enlace) y registro de evaluaciones propias de la empresa. */
export function AssessmentPanel({
  applicationId,
  canManage,
  onChanged,
}: {
  applicationId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [external, setExternal] = useState<External[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [tpl, setTpl] = useState("");
  const [busy, setBusy] = useState(false);
  const [grades, setGrades] = useState<Record<string, Record<string, number>>>({});
  const [showExt, setShowExt] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ attempts: Attempt[]; external: External[] }>(
      `/applications/${applicationId}/assessments`,
    );
    setAttempts(r.attempts);
    setExternal(r.external);
  }, [applicationId]);
  useEffect(() => {
    void load().catch(() => undefined);
    if (canManage)
      api<{ id: string; name: string }[]>("/assessment-templates")
        .then((t) => {
          setTemplates(t);
          setTpl(t[0]?.id ?? "");
        })
        .catch(() => undefined);
  }, [load, canManage]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setBusy(false);
  }

  return (
    <>
      <h3 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold">
        <ClipboardCheck size={16} className="text-muted" />
        Evaluación
      </h3>
      {canManage && (
        <div className="flex gap-2">
          <select
            value={tpl}
            onChange={(e) => setTpl(e.target.value)}
            aria-label="Examen"
            className="field !py-1.5"
          >
            {templates.length === 0 && <option value="">Crea un examen en Evaluaciones</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            disabled={!tpl || busy}
            onClick={() =>
              run(
                () =>
                  api(`/applications/${applicationId}/assessments`, {
                    method: "POST",
                    body: { templateId: tpl },
                  }),
                "Examen enviado por correo",
              )
            }
            className="btn-primary !py-1.5"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}Enviar
          </button>
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {attempts.map((a) => (
          <li key={a.id} className="rise rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.template}</span>
              <Badge
                tone={
                  a.status === "submitted"
                    ? "success"
                    : a.status === "expired"
                      ? "danger"
                      : "neutral"
                }
              >
                {statusText[a.status]}
              </Badge>
              {a.timedOut && <Badge tone="warning">Se acabó el tiempo</Badge>}
              {a.finalScore !== null && (
                <Badge tone={a.finalScore >= a.passingScore ? "success" : "warning"}>
                  {a.finalScore}/100
                </Badge>
              )}
              {a.needsReview && <Badge tone="warning">Falta revisar</Badge>}
            </div>
            <p className="mt-1 text-xs text-muted">
              {a.submittedAt ? `Entregada ${fmt(a.submittedAt)}` : `Vence ${fmt(a.expiresAt)}`}
            </p>
            {a.openAnswers.length > 0 && (
              <div className="mt-3 space-y-3">
                {a.openAnswers.map((o) => (
                  <div key={o.questionId} className="rounded-lg bg-surface-2 p-3">
                    <p className="text-xs font-medium">{o.prompt}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{o.answer}</p>
                    <label className="mt-2 flex items-center gap-2 text-xs">
                      Puntos (máx. {o.maxPoints})
                      <input
                        type="number"
                        min={0}
                        max={o.maxPoints}
                        value={grades[a.id]?.[o.questionId] ?? o.points ?? ""}
                        onChange={(e) =>
                          setGrades((g) => ({
                            ...g,
                            [a.id]: { ...g[a.id], [o.questionId]: Number(e.target.value) },
                          }))
                        }
                        className="field w-20 !py-1"
                      />
                    </label>
                  </div>
                ))}
                <button
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        api(`/assessment-attempts/${a.id}/review`, {
                          method: "PUT",
                          body: { grades: grades[a.id] ?? {} },
                        }),
                      "Revisión guardada",
                    )
                  }
                  className="btn-primary !py-1.5"
                >
                  Guardar calificación
                </button>
              </div>
            )}
          </li>
        ))}
        {attempts.length === 0 && <li className="text-sm text-muted">Sin exámenes enviados.</li>}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs font-medium text-muted">Evaluaciones de la empresa</p>
        {canManage && (
          <button onClick={() => setShowExt((s) => !s)} className="btn-ghost !px-2.5 !py-1 text-xs">
            {showExt ? "Cerrar" : "Registrar"}
          </button>
        )}
      </div>
      {showExt && (
        <form
          className="rise mt-2 grid gap-2 rounded-xl border border-border bg-bg p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(async () => {
              await api(`/applications/${applicationId}/external-assessments`, {
                method: "POST",
                body: {
                  description: f.get("description"),
                  performedAt: new Date(String(f.get("when"))).toISOString(),
                  method: f.get("method"),
                  evaluators: String(f.get("evaluators"))
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  result: f.get("result"),
                  score: f.get("score") ? Number(f.get("score")) : undefined,
                  observations: String(f.get("observations") ?? ""),
                },
              });
              setShowExt(false);
            }, "Evaluación registrada");
          }}
        >
          <input
            name="description"
            required
            placeholder="Descripción del proceso"
            className="field !py-1.5 sm:col-span-2"
          />
          <input name="when" type="datetime-local" required className="field !py-1.5" />
          <input name="method" required placeholder="Cómo se realizó" className="field !py-1.5" />
          <input
            name="evaluators"
            required
            placeholder="Evaluadores (separados por coma)"
            className="field !py-1.5"
          />
          <input name="result" required placeholder="Resultado" className="field !py-1.5" />
          <input
            name="score"
            type="number"
            min={0}
            max={100}
            placeholder="Puntaje 0-100 (opcional)"
            className="field !py-1.5"
          />
          <input name="observations" placeholder="Observaciones" className="field !py-1.5" />
          <button disabled={busy} className="btn-primary sm:col-span-2">
            Guardar registro
          </button>
        </form>
      )}
      <ul className="mt-2 space-y-2">
        {external.map((x) => (
          <li key={x.id} className="rounded-lg bg-surface-2 p-3 text-sm">
            <p className="font-medium">
              {x.description} {x.score !== null && <Badge tone="accent">{x.score}/100</Badge>}
            </p>
            <p className="text-xs text-muted">
              {x.method} · {fmt(x.performedAt)} · {x.evaluators.join(", ")}
            </p>
            <p className="mt-1">
              {x.result}
              {x.observations ? ` — ${x.observations}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
