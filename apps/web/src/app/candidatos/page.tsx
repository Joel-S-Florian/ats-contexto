"use client";
import { useEffect, useMemo, useState } from "react";
import { FileText, Inbox, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Row {
  id: string;
  status: string;
  processing: string;
  createdAt: string;
  vacancyId: string | null;
  vacancyTitle: string | null;
  candidate: { fullName: string; email: string; location: string; yearsExperience: number };
}
interface Detail {
  id: string;
  status: string;
  processing: string;
  vacancy: { title: string } | null;
  candidate: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    educationLevel: string;
    yearsExperience: number;
    skills: string[];
    languages: string[];
    portfolioUrl: string | null;
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

const statusLabel: Record<string, string> = {
  received: "Recibida",
  in_review: "En revisión",
  screening: "Preselección",
  interview: "Entrevista",
  hired: "Contratada",
};
const processingLabel: Record<
  string,
  { text: string; tone: "neutral" | "success" | "warning" | "danger" }
> = {
  pending: { text: "En cola", tone: "neutral" },
  extracting: { text: "Procesando", tone: "neutral" },
  ready: { text: "Lista", tone: "success" },
  unreadable: { text: "CV no legible", tone: "warning" },
  failed: { text: "Error al procesar", tone: "danger" },
};
const fmt = (d: string) =>
  new Date(d).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });

export default function CandidatesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [scope, setScope] = useState<"all" | "vacancy" | "general">("all");
  const [open, setOpen] = useState<Detail | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    api<Row[]>(`/applications${scope === "all" ? "" : `?scope=${scope}`}`)
      .then(setRows)
      .catch((e: ApiError) => toast.error(e.message));
  }, [scope]);

  const tabs = useMemo(
    () =>
      [
        ["all", "Todas"],
        ["vacancy", "A una vacante"],
        ["general", "Bolsa general"],
      ] as const,
    [],
  );

  async function view(id: string) {
    setLoadingId(id);
    try {
      setOpen(await api<Detail>(`/applications/${id}`));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setLoadingId(null);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Candidatos"
        subtitle="Postulaciones recibidas desde el widget de tu página de empleo."
      />
      <div className="rise mb-4 flex gap-1.5" role="tablist">
        {tabs.map(([v, l]) => (
          <button
            key={v}
            role="tab"
            aria-selected={scope === v}
            onClick={() => {
              setRows(null);
              setScope(v);
            }}
            className={`press rounded-lg px-3 py-1.5 text-sm font-medium ${scope === v ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <section className="rounded-card border border-border bg-surface shadow-sm">
        {!rows ? (
          <div className="space-y-3 p-5">
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={20} />}
            title="Aún no hay postulaciones"
            hint="Aparecerán aquí cuando alguien postule desde el widget."
          />
        ) : (
          <ul>
            {rows.map((r, i) => {
              const p = processingLabel[r.processing] ?? processingLabel.pending!;
              return (
                <li
                  key={r.id}
                  style={{ "--i": i } as React.CSSProperties}
                  className="rise border-b border-border last:border-0"
                >
                  <button
                    onClick={() => view(r.id)}
                    className="press flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-surface-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.candidate.fullName}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                        <span>{r.vacancyTitle ?? "Bolsa general"}</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} />
                          {r.candidate.location}
                        </span>
                        <span>{r.candidate.yearsExperience} años de experiencia</span>
                        <span>{fmt(r.createdAt)}</span>
                      </p>
                    </div>
                    {loadingId === r.id && (
                      <Loader2 size={16} className="animate-spin text-muted" />
                    )}
                    <Badge tone={p.tone}>{p.text}</Badge>
                    <Badge tone="accent">{statusLabel[r.status] ?? r.status}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {open && (
        <div
          className="fixed inset-0 z-20 flex justify-end bg-black/30"
          onClick={() => setOpen(null)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="rise h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-6 shadow-md"
            role="dialog"
            aria-label="Detalle de la postulación"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{open.candidate.fullName}</h2>
                <p className="text-sm text-muted">{open.vacancy?.title ?? "Bolsa general"}</p>
              </div>
              <button aria-label="Cerrar" onClick={() => setOpen(null)} className="btn-ghost !p-2">
                <X size={16} />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {(
                [
                  ["Correo", open.candidate.email],
                  ["Teléfono", open.candidate.phone],
                  ["Ubicación", open.candidate.location],
                  ["Educación", open.candidate.educationLevel],
                  ["Experiencia", `${open.candidate.yearsExperience} años`],
                  ["Idiomas", open.candidate.languages.join(", ") || "-"],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="break-words font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {open.candidate.skills.map((s) => (
                <Badge key={s} tone="accent">
                  {s}
                </Badge>
              ))}
            </div>

            <h3 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold">
              <FileText size={16} className="text-muted" />
              Texto extraído del CV
            </h3>
            {open.documents.map((d) => (
              <div key={d.id} className="rounded-lg border border-border bg-bg p-3">
                <p className="mb-2 text-xs text-muted">{d.originalName}</p>
                {d.extractedText ? (
                  // Es dato no confiable: se muestra como texto plano, nunca como HTML.
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-sm">
                    {d.extractedText}
                  </pre>
                ) : (
                  <p className="text-sm text-warning">
                    No se pudo extraer texto de este archivo. Requiere revisión manual.
                  </p>
                )}
              </div>
            ))}

            <h3 className="mb-2 mt-6 text-sm font-semibold">Historial</h3>
            <ol className="space-y-2 border-l border-border pl-4">
              {open.history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p className="font-medium">
                    {statusLabel[h.toStatus] ?? h.toStatus}
                    {h.automatic && (
                      <span className="ml-2 text-xs font-normal text-muted">automático</span>
                    )}
                  </p>
                  <p className="text-muted">{h.reason}</p>
                  <p className="text-xs text-muted">{fmt(h.createdAt)}</p>
                </li>
              ))}
            </ol>
            {open.consents[0] && (
              <p className="mt-6 text-xs text-muted">
                Aviso de datos aceptado (versión {open.consents[0].noticeVersion}) el{" "}
                {fmt(open.consents[0].acceptedAt)}.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
