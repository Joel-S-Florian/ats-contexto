"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, MessageSquarePlus, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { discardStatuses, manualStatuses, statusLabels, type ApplicationStatus } from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { InterviewPanel } from "@/components/interview-panel";
import { ScreeningCard, type Screening } from "@/components/screening";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Detail {
  id: string;
  status: ApplicationStatus;
  processing: string;
  vacancy: { title: string } | null;
  screening: Screening | null;
  candidate: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    educationLevel: string;
    yearsExperience: number;
    skills: string[];
    languages: string[];
  };
  documents: {
    id: string;
    originalName: string;
    extractStatus: string;
    extractedText: string | null;
  }[];
  history: {
    id: string;
    toStatus: string;
    reason: string;
    automatic: boolean;
    createdAt: string;
  }[];
  consents: { noticeVersion: string; acceptedAt: string }[];
}
interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: string;
}

const fmt = (d: string) =>
  new Date(d).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Ficha del candidato: datos, puntaje con su por qué, CV, historial, notas y acciones manuales (según el rol). */
export function CandidateDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { me } = useAuth();
  const canMove = me.role === "admin" || me.role === "recruiter";
  const [d, setD] = useState<Detail | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<ApplicationStatus | "">("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const [detail, n] = await Promise.all([
        api<Detail>(`/applications/${id}`),
        api<Note[]>(`/applications/${id}/notes`),
      ]);
      setD(detail);
      setNotes(n);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
      onClose();
    }
  }, [id, onClose]);
  useEffect(() => void load(), [load]);

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

  const isDiscard = target !== "" && discardStatuses.includes(target);
  const discarded = d && discardStatuses.includes(d.status);

  async function download(docId: string) {
    try {
      const r = await api<{ url: string }>(`/applications/${id}/documents/${docId}/url`);
      window.open(`${API}${r.url}`, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
  }

  return (
    <div
      className="fixed inset-0 z-20 flex justify-end bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="drawer h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-6 shadow-md"
        role="dialog"
        aria-label="Detalle de la postulación"
      >
        {!d ? (
          <div className="space-y-3">
            <div className="skeleton h-8 w-48" />
            <div className="skeleton h-40" />
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{d.candidate.fullName}</h2>
                <p className="text-sm text-muted">{d.vacancy?.title ?? "Bolsa general"}</p>
                <div className="mt-2 flex gap-1.5">
                  <Badge tone={discarded ? "danger" : "accent"}>{statusLabels[d.status]}</Badge>
                </div>
              </div>
              <button aria-label="Cerrar" onClick={onClose} className="btn-ghost !p-2">
                <X size={16} />
              </button>
            </div>

            {canMove && (
              <div className="mb-6 rounded-xl border border-border bg-bg p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Mover a"
                    value={target}
                    onChange={(e) => setTarget(e.target.value as ApplicationStatus)}
                    className="field w-auto !py-1.5"
                  >
                    <option value="">Mover a…</option>
                    {manualStatuses
                      .filter((s) => s !== d.status)
                      .map((s) => (
                        <option key={s} value={s}>
                          {statusLabels[s]}
                        </option>
                      ))}
                  </select>
                  {discarded && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api(`/applications/${id}/revert`, {
                              method: "POST",
                              body: { reason: reason || undefined },
                            }),
                          "Descarte revertido",
                        )
                      }
                      className="btn-ghost !py-1.5"
                    >
                      <Undo2 size={14} />
                      Revertir descarte
                    </button>
                  )}
                </div>
                {(target || discarded) && (
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={isDiscard ? "Motivo (obligatorio)" : "Motivo (opcional)"}
                    className="field mt-2 !py-1.5"
                  />
                )}
                {target && (
                  <button
                    disabled={busy || (isDiscard && reason.trim().length < 3)}
                    onClick={() =>
                      run(async () => {
                        await api(`/applications/${id}/move`, {
                          method: "POST",
                          body: { status: target, reason: reason || undefined },
                        });
                        setTarget("");
                        setReason("");
                      }, "Postulación movida")
                    }
                    className="btn-primary mt-2 !py-1.5"
                  >
                    {busy && <Loader2 size={14} className="animate-spin" />}
                    Confirmar movimiento
                  </button>
                )}
              </div>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {(
                [
                  ["Correo", d.candidate.email],
                  ["Teléfono", d.candidate.phone],
                  ["Ubicación", d.candidate.location],
                  ["Educación", d.candidate.educationLevel],
                  ["Experiencia", `${d.candidate.yearsExperience} años`],
                  ["Idiomas", d.candidate.languages.join(", ") || "-"],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="break-words font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {d.candidate.skills.map((s) => (
                <Badge key={s} tone="accent">
                  {s}
                </Badge>
              ))}
            </div>

            {d.screening ? (
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Preselección</h3>
                  {canMove && (
                    <button
                      onClick={() =>
                        run(
                          () => api(`/applications/${id}/screen`, { method: "POST" }),
                          "Preselección actualizada",
                        )
                      }
                      disabled={busy}
                      className="btn-ghost !px-2.5 !py-1 text-xs"
                    >
                      Volver a evaluar
                    </button>
                  )}
                </div>
                <ScreeningCard s={d.screening} />
              </div>
            ) : (
              d.vacancy &&
              canMove && (
                <button
                  onClick={() =>
                    run(
                      () => api(`/applications/${id}/screen`, { method: "POST" }),
                      "Preselección lista",
                    )
                  }
                  disabled={busy}
                  className="btn-primary mt-6"
                >
                  Evaluar ahora
                </button>
              )
            )}

            <h3 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold">
              <FileText size={16} className="text-muted" />
              CV
            </h3>
            {d.documents.map((doc) => (
              <div key={doc.id} className="rounded-lg border border-border bg-bg p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted">{doc.originalName}</p>
                  <button
                    onClick={() => download(doc.id)}
                    className="btn-ghost !px-2.5 !py-1 text-xs"
                  >
                    <Download size={12} />
                    Descargar
                  </button>
                </div>
                {doc.extractedText ? (
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-sm">
                    {doc.extractedText}
                  </pre>
                ) : (
                  <p className="text-sm text-warning">
                    No se pudo extraer texto de este archivo. Requiere revisión manual.
                  </p>
                )}
              </div>
            ))}

            <InterviewPanel
              applicationId={id}
              canManage={canMove}
              onChanged={() => {
                void load();
                onChanged();
              }}
            />

            <h3 className="mb-2 mt-6 text-sm font-semibold">Notas</h3>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api(`/applications/${id}/notes`, { method: "POST", body: { body: note } });
                  setNote("");
                }, "Nota agregada");
              }}
            >
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Escribe una nota interna"
                className="field !py-1.5"
              />
              <button
                disabled={busy || !note.trim()}
                className="btn-ghost !px-3"
                aria-label="Agregar nota"
              >
                <MessageSquarePlus size={16} />
              </button>
            </form>
            <ul className="mt-3 space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rise rounded-lg bg-surface-2 p-3 text-sm">
                  <p>{n.body}</p>
                  <p className="mt-1 text-xs text-muted">
                    {n.author} · {fmt(n.createdAt)}
                  </p>
                </li>
              ))}
              {notes.length === 0 && <li className="text-sm text-muted">Sin notas todavía.</li>}
            </ul>

            <h3 className="mb-2 mt-6 text-sm font-semibold">Historial</h3>
            <ol className="space-y-2 border-l border-border pl-4">
              {[...d.history].reverse().map((h) => (
                <li key={h.id} className="text-sm">
                  <p className="font-medium">
                    {statusLabels[h.toStatus as ApplicationStatus] ?? h.toStatus}
                    <span className="ml-2 text-xs font-normal text-muted">
                      {h.automatic ? "automático" : "manual"}
                    </span>
                  </p>
                  <p className="text-muted">{h.reason}</p>
                  <p className="text-xs text-muted">{fmt(h.createdAt)}</p>
                </li>
              ))}
            </ol>
            {d.consents[0] && (
              <p className="mt-6 text-xs text-muted">
                Aviso de datos aceptado (versión {d.consents[0].noticeVersion}) el{" "}
                {fmt(d.consents[0].acceptedAt)}.
              </p>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
