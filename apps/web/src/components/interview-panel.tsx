"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CalendarX2, Loader2, MapPin, PhoneCall, Video } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Interview {
  id: string;
  scheduledAt: string;
  durationMin: number;
  mode: "onsite" | "virtual";
  location: string | null;
  meetingUrl: string | null;
  platform: string | null;
  status: "scheduled" | "cancelled" | "completed";
}
interface Comm {
  id: string;
  type: string;
  summary: string;
  author: string;
  createdAt: string;
}

const fmt = (d: string) =>
  new Date(d).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
const commLabel: Record<string, string> = { call: "Llamada", message: "Mensaje", other: "Otro" };

/** Entrevistas agendadas y registro de llamadas/mensajes manuales de una postulación. */
export function InterviewPanel({
  applicationId,
  canManage,
  onChanged,
}: {
  applicationId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [list, setList] = useState<Interview[]>([]);
  const [comms, setComms] = useState<Comm[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"onsite" | "virtual">("virtual");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const [type, setType] = useState("call");

  const load = useCallback(async () => {
    const [i, c] = await Promise.all([
      api<Interview[]>(`/applications/${applicationId}/interviews`),
      api<Comm[]>(`/applications/${applicationId}/communications`),
    ]);
    setList(i);
    setComms(c);
  }, [applicationId]);
  useEffect(() => void load().catch(() => undefined), [load]);

  async function schedule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await api<{ emailed: string }>(`/applications/${applicationId}/interviews`, {
        method: "POST",
        body: {
          scheduledAt: new Date(String(f.get("when"))).toISOString(),
          durationMin: Number(f.get("duration")),
          mode,
          location: mode === "onsite" ? String(f.get("where")) : undefined,
          meetingUrl: mode === "virtual" && f.get("where") ? String(f.get("where")) : undefined,
          platform: f.get("platform") ? String(f.get("platform")) : undefined,
          messageToCandidate: f.get("message") ? String(f.get("message")) : undefined,
        },
      });
      toast.success(
        r.emailed === "sent"
          ? "Entrevista agendada y correo enviado"
          : "Entrevista agendada (el correo no se pudo enviar)",
      );
      setOpen(false);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error inesperado");
    }
    setBusy(false);
  }

  async function cancel(id: string) {
    if (!confirm("¿Cancelar la entrevista? Se avisará al candidato.")) return;
    try {
      await api(`/interviews/${id}/cancel`, { method: "POST" });
      toast.success("Entrevista cancelada");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error inesperado");
    }
  }

  async function logComm(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api(`/applications/${applicationId}/communications`, {
        method: "POST",
        body: { type, summary },
      });
      setSummary("");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error inesperado");
    }
  }

  return (
    <>
      <div className="mb-2 mt-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock size={16} className="text-muted" />
          Entrevistas
        </h3>
        {canManage && (
          <button onClick={() => setOpen((o) => !o)} className="btn-ghost !px-2.5 !py-1 text-xs">
            {open ? "Cerrar" : "Agendar"}
          </button>
        )}
      </div>

      {open && (
        <form
          onSubmit={schedule}
          className="rise mb-3 grid gap-2 rounded-xl border border-border bg-bg p-3 sm:grid-cols-2"
        >
          <label className="text-xs font-medium">
            Fecha y hora
            <input name="when" type="datetime-local" required className="field mt-1 !py-1.5" />
          </label>
          <label className="text-xs font-medium">
            Duración (min)
            <input
              name="duration"
              type="number"
              min={15}
              max={480}
              defaultValue={45}
              className="field mt-1 !py-1.5"
            />
          </label>
          <div className="flex gap-1.5 sm:col-span-2">
            {(["virtual", "onsite"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`press flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-accent-soft text-accent" : "bg-surface text-muted"}`}
              >
                {m === "virtual" ? "Virtual" : "Presencial"}
              </button>
            ))}
          </div>
          <label className="text-xs font-medium sm:col-span-2">
            {mode === "virtual"
              ? "Enlace de la reunión (opcional si hay calendario conectado)"
              : "Lugar"}
            <input
              name="where"
              required={mode === "onsite"}
              type={mode === "virtual" ? "url" : "text"}
              placeholder={mode === "virtual" ? "https://" : "Oficina central, piso 3"}
              className="field mt-1 !py-1.5"
            />
          </label>
          <label className="text-xs font-medium">
            Plataforma
            <input name="platform" placeholder="Google Meet" className="field mt-1 !py-1.5" />
          </label>
          <label className="text-xs font-medium">
            Mensaje para el candidato
            <input name="message" placeholder="Opcional" className="field mt-1 !py-1.5" />
          </label>
          <button disabled={busy} className="btn-primary sm:col-span-2">
            {busy && <Loader2 size={14} className="animate-spin" />}
            Agendar y avisar al candidato
          </button>
        </form>
      )}

      <ul className="space-y-2">
        {list.map((i) => (
          <li
            key={i.id}
            className="rise flex items-start gap-3 rounded-lg border border-border p-3 text-sm"
          >
            <span className="kpi-icon mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
              {i.mode === "virtual" ? <Video size={16} /> : <MapPin size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {fmt(i.scheduledAt)}{" "}
                <span className="font-normal text-muted">· {i.durationMin} min</span>
              </p>
              <p className="truncate text-xs text-muted">
                {i.mode === "virtual" ? (i.meetingUrl ?? "Virtual") : i.location}
                {i.platform ? ` · ${i.platform}` : ""}
              </p>
            </div>
            <Badge tone={i.status === "scheduled" ? "success" : "neutral"}>
              {i.status === "scheduled"
                ? "Programada"
                : i.status === "cancelled"
                  ? "Cancelada"
                  : "Realizada"}
            </Badge>
            {canManage && i.status === "scheduled" && (
              <button
                aria-label="Cancelar entrevista"
                onClick={() => cancel(i.id)}
                className="btn-danger !p-1.5"
              >
                <CalendarX2 size={14} />
              </button>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-muted">Sin entrevistas todavía.</li>}
      </ul>

      <h3 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold">
        <PhoneCall size={16} className="text-muted" />
        Comunicaciones
      </h3>
      {canManage && (
        <form onSubmit={logComm} className="flex gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Tipo"
            className="field w-auto !py-1.5"
          >
            <option value="call">Llamada</option>
            <option value="message">Mensaje</option>
            <option value="other">Otro</option>
          </select>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="¿Qué se habló?"
            className="field !py-1.5"
          />
          <button disabled={!summary.trim()} className="btn-ghost !px-3">
            Registrar
          </button>
        </form>
      )}
      <ul className="mt-3 space-y-2">
        {comms.map((c) => (
          <li key={c.id} className="rounded-lg bg-surface-2 p-3 text-sm">
            <p>
              <Badge>{commLabel[c.type] ?? c.type}</Badge> {c.summary}
            </p>
            <p className="mt-1 text-xs text-muted">
              {c.author} · {fmt(c.createdAt)}
            </p>
          </li>
        ))}
        {comms.length === 0 && (
          <li className="text-sm text-muted">Sin comunicaciones registradas.</li>
        )}
      </ul>
    </>
  );
}
