"use client";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Gauge,
  Infinity as InfinityIcon,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/app-shell";
import { Badge, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Usage {
  plan: { key: string; name: string; priceUsd: number };
  status: string;
  period: string;
  items: {
    key: string;
    label: string;
    used: number;
    limit: number | null;
    percent: number | null;
  }[];
}

const hints: Record<string, string> = {
  activeVacancies: "Publicadas y pausadas.",
  applicationsPerMonth: "Se reinicia cada mes calendario.",
  users: "Incluye invitaciones pendientes.",
  aiAnalysesPerMonth: "Al agotarse, la preselección sigue con reglas, sin perder postulaciones.",
};
const barColor = (p: number | null) =>
  p === null
    ? "var(--accent)"
    : p >= 100
      ? "var(--danger)"
      : p >= 80
        ? "var(--warning)"
        : "var(--success)";

/** Consumo del plan contra sus límites, y privacidad (plazo de retención de datos). */
export default function UsagePage() {
  const { me } = useAuth();
  const [u, setU] = useState<Usage | null>(null);
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (me.role !== "admin") return;
    api<Usage>("/usage")
      .then(setU)
      .catch((e: ApiError) => toast.error(e.message));
    api<{ retentionMonths: number }>("/settings/privacy")
      .then((p) => setMonths(p.retentionMonths))
      .catch(() => undefined);
  }, [me.role]);

  async function saveRetention() {
    setBusy(true);
    try {
      await api("/settings/privacy", { method: "PATCH", body: { retentionMonths: months } });
      toast.success("Plazo de retención guardado");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setBusy(false);
  }

  if (me.role !== "admin")
    return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;
  const hot = u?.items.filter((i) => i.percent !== null && i.percent >= 80) ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Plan y uso"
        subtitle="Tu consumo del mes frente a los límites de tu plan."
        action={u && <Badge tone="accent">Plan {u.plan.name}</Badge>}
      />

      {hot.length > 0 && (
        <div className="rise mb-5 flex gap-3 rounded-card bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Estás cerca o en el límite de tu plan</p>
            <p className="mt-0.5 text-xs">
              {hot.map((h) => `${h.label} (${h.percent}%)`).join(" · ")}. Pide un cambio de plan al
              operador de la plataforma para ampliar tus límites.
            </p>
          </div>
        </div>
      )}

      <section
        className="rise grid gap-3 sm:grid-cols-2"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        {!u
          ? [0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-32 !rounded-[var(--radius-lg)]" />
            ))
          : u.items.map((i, k) => (
              <div
                key={i.key}
                style={{ "--i": k } as React.CSSProperties}
                className="rise rounded-card border border-border bg-surface p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium">{i.label}</p>
                  <Gauge size={16} className="text-muted" />
                </div>
                <p className="mt-3 flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-3xl font-semibold tracking-tight">{i.used}</span>
                  <span className="text-sm text-muted">
                    {i.limit === null ? (
                      <span className="inline-flex items-center gap-1">
                        de <InfinityIcon size={14} /> ilimitado
                      </span>
                    ) : (
                      `de ${i.limit}`
                    )}
                  </span>
                </p>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
                  role="progressbar"
                  aria-valuenow={i.percent ?? 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={i.label}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${i.percent === null ? 8 : Math.max(i.percent, i.used ? 3 : 0)}%`,
                      background: barColor(i.percent),
                      transformOrigin: "left",
                      animation: `bar-grow 800ms var(--ease-out) ${k * 80}ms both`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">{hints[i.key]}</p>
              </div>
            ))}
      </section>

      <section
        className="rise mt-6 rounded-card border border-border bg-surface p-5 shadow-sm"
        style={{ "--i": 3 } as React.CSSProperties}
      >
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck size={16} className="text-muted" />
          Privacidad y retención de datos
        </h2>
        <p className="mb-4 text-xs text-muted">
          Pasado este plazo sin actividad, los datos personales de los candidatos se anonimizan y
          los CV se eliminan. Las personas contratadas no se tocan: sus datos ya viven en tu sistema
          de RRHH.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            Meses de retención
            <input
              type="number"
              min={1}
              max={60}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="field mt-1.5 w-32"
            />
          </label>
          <button onClick={saveRetention} disabled={busy} className="btn-primary">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Guardar
          </button>
        </div>
        <p className="mt-4 text-xs text-muted">
          Para atender una solicitud de acceso o eliminación de una persona, abre su ficha en
          Candidatos y usa &ldquo;Exportar datos&rdquo; o &ldquo;Eliminar datos&rdquo;.
        </p>
      </section>
    </div>
  );
}
