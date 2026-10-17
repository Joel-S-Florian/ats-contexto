"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, GripVertical, Loader2, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  discardStatuses,
  stageTypeLabels,
  statusLabels,
  statusStage,
  type ApplicationStatus,
  type StageType,
} from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { CandidateDrawer } from "@/components/candidate-drawer";
import { ScoreChip } from "@/components/screening";
import { Badge, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Card {
  id: string;
  status: ApplicationStatus;
  screening: { overall: number | null; recommendation: string; mode: string } | null;
  candidate: { fullName: string; location: string; yearsExperience: number };
}
interface Pipeline {
  id: string;
  stages: { id: string; name: string; type: StageType; enabled: boolean }[];
}

/** Estado al que va una tarjeta cuando se suelta en una columna de cada tipo de etapa. */
const dropStatus: Partial<Record<StageType, ApplicationStatus>> = {
  screening: "shortlisted",
  interview: "interview",
  assessment: "assessment",
  selection: "selection",
};

export default function BoardPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const canMove = me.role === "admin" || me.role === "recruiter";
  const [title, setTitle] = useState("");
  const [stages, setStages] = useState<Pipeline["stages"]>([]);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [discard, setDiscard] = useState<{ id: string; reason: string; busy: boolean } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [v, pipes, apps] = await Promise.all([
        api<{ title: string; pipelineId: string }>(`/vacancies/${id}`),
        api<Pipeline[]>("/pipelines"),
        api<Card[]>(`/applications?vacancyId=${id}`),
      ]);
      setTitle(v.title);
      setStages((pipes.find((p) => p.id === v.pipelineId)?.stages ?? []).filter((s) => s.enabled));
      setCards(apps);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
  }, [id]);
  useEffect(() => void load(), [load]);

  const byStage = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const s of stages) m.set(s.id, []);
    for (const c of cards ?? []) {
      const type = statusStage[c.status];
      const col = stages.find((s) => s.type === type);
      if (col) m.get(col.id)!.push(c);
    }
    for (const list of m.values())
      list.sort((a, b) => (b.screening?.overall ?? -1) - (a.screening?.overall ?? -1));
    return m;
  }, [cards, stages]);
  const discarded = (cards ?? []).filter(
    (c) => discardStatuses.includes(c.status) || c.status === "on_hold",
  );

  async function move(cardId: string, status: ApplicationStatus, reason?: string) {
    const prev = cards;
    setCards((cs) => cs?.map((c) => (c.id === cardId ? { ...c, status } : c)) ?? cs); // optimista: la tarjeta se mueve al instante
    try {
      await api(`/applications/${cardId}/move`, { method: "POST", body: { status, reason } });
    } catch (e) {
      setCards(prev);
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
  }

  const renderCard = (c: Card, i: number) => (
    <li
      key={c.id}
      style={{ "--i": Math.min(i, 8) } as React.CSSProperties}
      draggable={canMove}
      onDragStart={() => setDragging(c.id)}
      onDragEnd={() => {
        setDragging(null);
        setOver(null);
      }}
      className={`rise group cursor-pointer rounded-xl border border-border bg-surface p-3 shadow-sm transition-[opacity,box-shadow,transform] duration-200 hover:shadow-md ${dragging === c.id ? "scale-[0.98] opacity-40" : ""}`}
      onClick={() => setOpen(c.id)}
    >
      <div className="flex items-start gap-2">
        {canMove && (
          <GripVertical
            size={14}
            className="mt-0.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{c.candidate.fullName}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <MapPin size={11} />
            {c.candidate.location}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ScoreChip s={c.screening} />
            {statusLabels[c.status] &&
              !["interview", "assessment", "selection"].includes(c.status) && (
                <Badge>{statusLabels[c.status]}</Badge>
              )}
          </div>
        </div>
      </div>
    </li>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link
        href={`/vacantes/${id}`}
        className="press mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
      >
        <ArrowLeft size={14} />
        Volver a la vacante
      </Link>
      <PageHeader
        title={title || "Embudo"}
        subtitle={
          canMove
            ? "Arrastra las tarjetas entre columnas o ábrelas para ver el detalle."
            : "Candidatos de esta vacante por etapa."
        }
      />

      {!cards ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-64 !rounded-[var(--radius-lg)]" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages
              .filter((s) => s.type !== "hiring" || (byStage.get(s.id)?.length ?? 0) > 0 || true)
              .map((s) => {
                const list = byStage.get(s.id) ?? [];
                const target = dropStatus[s.type];
                const active = over === s.id && target !== undefined;
                return (
                  <section
                    key={s.id}
                    onDragOver={(e) => {
                      if (!canMove || !target) return;
                      e.preventDefault();
                      setOver(s.id);
                    }}
                    onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
                    onDrop={() => {
                      if (dragging && target) void move(dragging, target);
                      setOver(null);
                    }}
                    className={`w-72 shrink-0 rounded-2xl border p-3 transition-colors duration-200 ${active ? "border-accent bg-accent-soft" : "border-border bg-surface-2/60"}`}
                    aria-label={s.name}
                  >
                    <header className="mb-3 flex items-center justify-between px-1">
                      <h2 className="text-sm font-semibold">{s.name}</h2>
                      <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
                        {list.length}
                      </span>
                    </header>
                    <ul className="min-h-24 space-y-2">
                      {list.map(renderCard)}
                      {list.length === 0 && (
                        <li className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted">
                          {s.type === "hiring"
                            ? "La contratación se confirma desde la ficha"
                            : `Sin candidatos en ${stageTypeLabels[s.type].toLowerCase()}`}
                        </li>
                      )}
                    </ul>
                  </section>
                );
              })}
          </div>

          <section
            onDragOver={(e) => {
              if (!canMove) return;
              e.preventDefault();
              setOver("discard");
            }}
            onDragLeave={() => setOver((o) => (o === "discard" ? null : o))}
            onDrop={() => {
              if (dragging) setDiscard({ id: dragging, reason: "", busy: false });
              setOver(null);
            }}
            className={`mt-2 rounded-2xl border p-4 transition-colors duration-200 ${over === "discard" ? "border-danger bg-danger-soft" : "border-dashed border-border"}`}
          >
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Trash2 size={14} className="text-muted" />
              Descartados y en espera ({discarded.length})
            </h2>
            <p className="mb-3 text-xs text-muted">
              Suelta aquí para descartar (se pedirá el motivo). Nada se borra: abre la ficha para
              revertir.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {discarded.map(renderCard)}
            </ul>
          </section>
        </>
      )}

      {discard && (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-black/30 p-4"
          onClick={() => setDiscard(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              setDiscard({ ...discard, busy: true });
              await move(discard.id, "not_selected", discard.reason);
              setDiscard(null);
            }}
            className="rise w-full max-w-sm rounded-card border border-border bg-surface p-5 shadow-md"
          >
            <h3 className="text-sm font-semibold">Descartar candidato</h3>
            <p className="mt-1 text-xs text-muted">
              Queda visible y se puede revertir. Escribe el motivo.
            </p>
            <input
              autoFocus
              value={discard.reason}
              onChange={(e) => setDiscard({ ...discard, reason: e.target.value })}
              placeholder="Motivo"
              className="field mt-3"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDiscard(null)} className="btn-ghost">
                Cancelar
              </button>
              <button
                disabled={discard.reason.trim().length < 3 || discard.busy}
                className="btn-danger"
              >
                {discard.busy && <Loader2 size={14} className="animate-spin" />}
                Descartar
              </button>
            </div>
          </form>
        </div>
      )}

      {open && <CandidateDrawer id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}
