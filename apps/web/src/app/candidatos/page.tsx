"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { statusLabels, type ApplicationStatus } from "@ats/shared";
import { CandidateDrawer } from "@/components/candidate-drawer";
import { ScoreChip } from "@/components/screening";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Row {
  id: string;
  status: ApplicationStatus;
  processing: string;
  createdAt: string;
  vacancyId: string | null;
  vacancyTitle: string | null;
  screening: { overall: number | null; recommendation: string; mode: string } | null;
  candidate: { fullName: string; email: string; location: string; yearsExperience: number };
}

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

type Tab = "all" | "vacancy" | "general" | "knocked_out" | "low_fit";
const tabs: [Tab, string][] = [
  ["all", "Todas"],
  ["vacancy", "A una vacante"],
  ["general", "Bolsa general"],
  ["knocked_out", "No cumple requisitos"],
  ["low_fit", "Baja compatibilidad"],
];

export default function CandidatesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "score">("recent");
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    const scope = tab === "vacancy" || tab === "general" ? `?scope=${tab}` : "";
    return api<Row[]>(`/applications${scope}`)
      .then(setRows)
      .catch((e: ApiError) => toast.error(e.message));
  }, [tab]);
  useEffect(() => void load(), [load]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = (rows ?? []).filter((r) =>
      tab === "knocked_out" || tab === "low_fit" ? r.status === tab : true,
    );
    if (needle)
      list = list.filter((r) =>
        [r.candidate.fullName, r.candidate.email, r.vacancyTitle ?? ""].some((s) =>
          s.toLowerCase().includes(needle),
        ),
      );
    if (sort === "score")
      list = [...list].sort((a, b) => (b.screening?.overall ?? -1) - (a.screening?.overall ?? -1));
    return list;
  }, [rows, tab, q, sort]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Candidatos"
        subtitle="Postulaciones recibidas desde el widget de tu página de empleo."
      />
      <div className="rise mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {tabs.map(([v, l]) => (
            <button
              key={v}
              role="tab"
              aria-selected={tab === v}
              onClick={() => {
                setRows(null);
                setTab(v);
              }}
              className={`press rounded-lg px-3 py-1.5 text-sm font-medium ${tab === v ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar"
              aria-label="Buscar candidatos"
              className="field w-44 !py-1.5 !pl-8"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "recent" | "score")}
            aria-label="Ordenar"
            className="field w-auto !py-1.5"
          >
            <option value="recent">Más recientes</option>
            <option value="score">Mayor puntaje</option>
          </select>
        </div>
      </div>

      {(tab === "knocked_out" || tab === "low_fit") && (
        <p className="rise mb-3 text-sm text-muted">
          {tab === "knocked_out"
            ? "Personas que no cumplen un filtro eliminatorio."
            : "Personas con puntaje bajo."}{" "}
          Nada se borra: abre una ficha para ver el motivo y revertir la decisión.
        </p>
      )}

      <section className="rounded-card border border-border bg-surface shadow-sm">
        {!rows ? (
          <div className="space-y-3 p-5">
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Inbox size={20} />}
            title="No hay postulaciones aquí"
            hint="Aparecerán cuando alguien postule desde el widget."
          />
        ) : (
          <ul>
            {visible.map((r, i) => {
              const p = processingLabel[r.processing] ?? processingLabel.pending!;
              return (
                <li
                  key={r.id}
                  style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                  className="rise border-b border-border last:border-0"
                >
                  <button
                    onClick={() => setOpen(r.id)}
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
                    <ScoreChip s={r.screening} />
                    <Badge tone={p.tone}>{p.text}</Badge>
                    <Badge
                      tone={
                        ["knocked_out", "low_fit", "not_selected", "withdrawn"].includes(r.status)
                          ? "danger"
                          : "accent"
                      }
                    >
                      {statusLabels[r.status] ?? r.status}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {open && <CandidateDrawer id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
