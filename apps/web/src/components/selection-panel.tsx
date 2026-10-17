"use client";
import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Bot,
  Handshake,
  Loader2,
  MessageSquareQuote,
  PauseCircle,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Info {
  comments: {
    id: string;
    stance: "favor" | "against" | "neutral";
    body: string;
    author: string;
    createdAt: string;
  }[];
  decisions: {
    id: string;
    decision: string;
    automatic: boolean;
    reason: string;
    author: string | null;
    createdAt: string;
  }[];
  hire: { id: string; hiredAt: string; startDate: string | null; automatic: boolean } | null;
}
const fmt = (d: string) =>
  new Date(d).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
const decisionLabel: Record<string, string> = {
  selected: "Seleccionada",
  not_selected: "No seleccionada",
  on_hold: "En espera",
};
const stanceUi = {
  favor: { icon: ThumbsUp, label: "A favor", tone: "success" },
  against: { icon: ThumbsDown, label: "En contra", tone: "danger" },
  neutral: { icon: MessageSquareQuote, label: "Neutral", tone: "neutral" },
} as const;

/** Selección (decisión humana por defecto, con comentarios de evaluadores) y confirmación explícita de la contratación. */
export function SelectionPanel({
  applicationId,
  status,
  canDecide,
  canHire,
  onChanged,
}: {
  applicationId: string;
  status: string;
  canDecide: boolean;
  canHire: boolean;
  onChanged: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [stance, setStance] = useState<"favor" | "against" | "neutral">("favor");
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [hiring, setHiring] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [start, setStart] = useState("");

  const load = useCallback(
    () =>
      api<Info>(`/applications/${applicationId}/selection`)
        .then(setInfo)
        .catch(() => undefined),
    [applicationId],
  );
  useEffect(() => void load(), [load, status]);

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
  const decide = (decision: string) =>
    run(
      () =>
        api(`/applications/${applicationId}/selection`, {
          method: "POST",
          body: { decision, reason },
        }).then(() => setReason("")),
      "Decisión registrada",
    );
  const inSelection = [
    "selection",
    "selected",
    "on_hold",
    "not_selected",
    "interview",
    "assessment",
    "shortlisted",
    "in_review",
  ].includes(status);

  if (!info) return null;
  return (
    <>
      <h3 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold">
        <UserCheck size={16} className="text-muted" />
        Selección
      </h3>

      {info.hire && (
        <p className="rise mb-3 flex items-center gap-2 rounded-lg bg-success-soft p-3 text-sm text-success">
          <BadgeCheck size={16} />
          Contratada el {fmt(info.hire.hiredAt)}
          {info.hire.startDate ? ` · inicia ${info.hire.startDate.slice(0, 10)}` : ""}
          {info.hire.automatic ? " (confirmación automática)" : ""}.
        </p>
      )}

      <ul className="space-y-2">
        {info.decisions.map((d) => (
          <li
            key={d.id}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm"
          >
            <Badge
              tone={
                d.decision === "selected"
                  ? "success"
                  : d.decision === "on_hold"
                    ? "warning"
                    : "danger"
              }
            >
              {decisionLabel[d.decision] ?? d.decision}
            </Badge>
            {d.automatic && (
              <Badge tone="accent">
                <span className="inline-flex items-center gap-1">
                  <Bot size={11} />
                  Automática
                </span>
              </Badge>
            )}
            <span className="text-muted">
              {d.author ? `${d.author} · ` : ""}
              {fmt(d.createdAt)}
            </span>
            <p className="w-full">{d.reason}</p>
          </li>
        ))}
      </ul>

      <ul className="mt-2 space-y-2">
        {info.comments.map((c) => {
          const s = stanceUi[c.stance];
          return (
            <li key={c.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge tone={s.tone}>
                  <span className="inline-flex items-center gap-1">
                    <s.icon size={11} />
                    {s.label}
                  </span>
                </Badge>
                <span className="text-xs text-muted">
                  {c.author} · {fmt(c.createdAt)}
                </span>
              </div>
              <p className="mt-1">{c.body}</p>
            </li>
          );
        })}
      </ul>

      {inSelection && status !== "hired" && (
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api(`/applications/${applicationId}/selection/comments`, {
                method: "POST",
                body: { stance, body: comment },
              });
              setComment("");
            }, "Comentario agregado");
          }}
        >
          <select
            value={stance}
            onChange={(e) => setStance(e.target.value as typeof stance)}
            aria-label="Postura"
            className="field w-auto !py-1.5"
          >
            <option value="favor">A favor</option>
            <option value="against">En contra</option>
            <option value="neutral">Neutral</option>
          </select>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comentario para la decisión"
            className="field min-w-40 flex-1 !py-1.5"
          />
          <button disabled={busy || !comment.trim()} className="btn-ghost !py-1.5">
            Comentar
          </button>
        </form>
      )}

      {canDecide && inSelection && status !== "hired" && (
        <div className="mt-3 rounded-xl border border-border bg-bg p-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (obligatorio para no seleccionar)"
            className="field !py-1.5"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              disabled={busy}
              onClick={() => decide("selected")}
              className="btn-primary !py-1.5"
            >
              <UserCheck size={14} />
              Seleccionar
            </button>
            <button disabled={busy} onClick={() => decide("on_hold")} className="btn-ghost !py-1.5">
              <PauseCircle size={14} />
              En espera
            </button>
            <button
              disabled={busy || reason.trim().length < 3}
              onClick={() => decide("not_selected")}
              className="btn-danger !py-1.5"
            >
              <UserX size={14} />
              No seleccionar
            </button>
          </div>
        </div>
      )}

      {canHire && status === "selected" && (
        <div className="mt-3">
          {!hiring ? (
            <button onClick={() => setHiring(true)} className="btn-primary w-full">
              <Handshake size={16} />
              Confirmar contratación…
            </button>
          ) : (
            <div className="rise rounded-xl border border-accent bg-accent-soft p-4">
              <p className="text-sm font-medium">Contratar a esta persona</p>
              <p className="mt-1 text-xs text-muted">
                Se enviará el correo de bienvenida y se entregarán sus datos a la nómina o al
                sistema de RRHH de la empresa (webhook y exportación).
              </p>
              <label className="mt-3 block text-xs font-medium">
                Fecha de inicio (opcional)
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="field mt-1 !py-1.5"
                />
              </label>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirm}
                  onChange={(e) => setConfirm(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                Confirmo la contratación
              </label>
              <div className="mt-3 flex gap-2">
                <button
                  disabled={!confirm || busy}
                  onClick={() =>
                    run(
                      () =>
                        api(`/applications/${applicationId}/hire`, {
                          method: "POST",
                          body: { confirm: true, startDate: start || undefined },
                        }).then(() => setHiring(false)),
                      "Contratación confirmada",
                    )
                  }
                  className="btn-primary"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}Contratar
                </button>
                <button onClick={() => setHiring(false)} className="btn-ghost">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
