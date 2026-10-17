"use client";
import { useEffect, useState } from "react";
import { BellOff, BellRing, Clock, Hand, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Notice = "manual" | "auto_delay" | "none";
const options: { value: Notice; title: string; hint: string; icon: typeof Hand }[] = [
  {
    value: "manual",
    title: "Manual",
    hint: "Tú decides cuándo y a quién avisar. Es lo recomendado.",
    icon: Hand,
  },
  {
    value: "auto_delay",
    title: "Automático con retraso",
    hint: "Se avisa solo, pasado el tiempo que indiques; se cancela si revisas el descarte.",
    icon: Clock,
  },
  {
    value: "none",
    title: "Sin aviso",
    hint: "No se envía ninguna notificación de rechazo.",
    icon: BellOff,
  },
];

export default function SettingsPage() {
  const { me } = useAuth();
  const [notice, setNotice] = useState<Notice>("manual");
  const [hours, setHours] = useState(24);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoHire, setAutoHire] = useState(false);

  useEffect(() => {
    if (me.role !== "admin") return;
    api<{ rejectionNotice: Notice; rejectionDelayHours: number }>("/settings/notifications")
      .then((s) => {
        setNotice(s.rejectionNotice);
        setHours(s.rejectionDelayHours);
        setLoaded(true);
      })
      .catch((e: ApiError) => toast.error(e.message));
    api<{ autoConfirmHire: boolean }>("/settings/hiring")
      .then((h) => setAutoHire(h.autoConfirmHire))
      .catch(() => undefined);
  }, [me.role]);

  async function save() {
    setBusy(true);
    try {
      await api("/settings/notifications", {
        method: "PATCH",
        body: { rejectionNotice: notice, rejectionDelayHours: hours },
      });
      toast.success("Configuración guardada");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setBusy(false);
  }

  if (me.role !== "admin")
    return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Configuración" subtitle="Preferencias de tu empresa." />
      <section
        className="rise rounded-card border border-border bg-surface p-5 shadow-sm"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <BellRing size={16} className="text-muted" />
          Aviso a quienes no son seleccionados
        </h2>
        <p className="mb-4 text-xs text-muted">
          Define qué pasa cuando una persona pasa a &ldquo;No seleccionada&rdquo;.
        </p>
        {!loaded ? (
          <div className="skeleton h-40" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
              {options.map(({ value, title, hint, icon: Icon }) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={notice === value}
                  onClick={() => setNotice(value)}
                  className={`press rounded-xl border p-4 text-left transition-colors ${notice === value ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
                >
                  <Icon size={18} className={notice === value ? "text-accent" : "text-muted"} />
                  <p className="mt-2 text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs text-muted">{hint}</p>
                </button>
              ))}
            </div>
            {notice === "auto_delay" && (
              <label className="rise mt-4 block text-sm font-medium">
                Enviar después de (horas)
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={hours}
                  onChange={(e) => setHours(Number(e.target.value))}
                  className="field mt-1.5 w-32"
                />
              </label>
            )}
            <div className="mt-5 flex justify-end">
              <button onClick={save} disabled={busy} className="btn-primary">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Guardar
              </button>
            </div>
          </>
        )}
      </section>

      <section
        className="rise mt-5 rounded-card border border-border bg-surface p-5 shadow-sm"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        <h2 className="mb-1 text-sm font-semibold">Contratación</h2>
        <label className="mt-3 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={autoHire}
            onChange={async (e) => {
              const v = e.target.checked;
              setAutoHire(v);
              try {
                await api("/settings/hiring", { method: "PATCH", body: { autoConfirmHire: v } });
                toast.success("Configuración guardada");
              } catch {
                setAutoHire(!v);
                toast.error("No se pudo guardar");
              }
            }}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            <b>Confirmar la contratación automáticamente</b>
            <br />
            <span className="text-xs text-muted">
              Solo aplica a vacantes con selección automática: quien queda seleccionado se contrata
              sin confirmación manual y se envía el webhook. Apagado por defecto.
            </span>
          </span>
        </label>
      </section>
    </div>
  );
}
