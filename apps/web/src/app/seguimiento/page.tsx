"use client";
import { useEffect, useState } from "react";
import { Clock, Handshake, Inbox, UserX } from "lucide-react";
import { toast } from "sonner";
import { statusLabels, type ApplicationStatus } from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Metrics {
  days: number;
  totals: { applications: number; hires: number; discarded: number };
  funnel: { key: string; label: string; count: number; rate: number }[];
  avgDaysInStatus: Record<string, number | null>;
  avgDaysToHire: number | null;
  sources: { key: string; label: string; count: number }[];
}

/** Seguimiento: embudo de conversión, tiempo por etapa y origen de las postulaciones. */
export default function TrackingPage() {
  const { me } = useAuth();
  const [days, setDays] = useState(90);
  const [m, setM] = useState<Metrics | null>(null);
  const allowed = me.role === "admin" || me.role === "recruiter";

  useEffect(() => {
    if (!allowed) return;
    setM(null);
    api<Metrics>(`/metrics?days=${days}`)
      .then(setM)
      .catch((e: ApiError) => toast.error(e.message));
  }, [days, allowed]);

  if (!allowed) return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;
  const cards = m && [
    { label: "Postulaciones", value: m.totals.applications, icon: Inbox },
    { label: "Contrataciones", value: m.totals.hires, icon: Handshake },
    { label: "Descartadas", value: m.totals.discarded, icon: UserX },
    { label: "Días promedio hasta contratar", value: m.avgDaysToHire ?? "-", icon: Clock },
  ];
  const totalSources = m ? m.sources.reduce((s, x) => s + x.count, 0) || 1 : 1;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Seguimiento"
        subtitle="Cómo avanza tu proceso de contratación."
        action={
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Periodo"
            className="field w-auto !py-1.5"
          >
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
            <option value={365}>Último año</option>
          </select>
        }
      />
      {!m ? (
        <div className="skeleton h-64 !rounded-[var(--radius-lg)]" />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards!.map(({ label, value, icon: Icon }, i) => (
              <div
                key={label}
                style={{ "--i": i } as React.CSSProperties}
                className="rise rounded-card border border-border bg-surface p-4 shadow-sm"
              >
                <span className="kpi-icon flex size-9 items-center justify-center rounded-lg">
                  <Icon size={18} />
                </span>
                <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            ))}
          </section>

          <section
            className="rise mb-5 rounded-card border border-border bg-surface p-5 shadow-sm"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            <h2 className="mb-4 text-sm font-semibold">Embudo de conversión</h2>
            <ul className="space-y-3">
              {m.funnel.map((f, i) => (
                <li key={f.key}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{f.label}</span>
                    <span className="tabular-nums text-muted">
                      {f.count} · {f.rate}%
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(f.rate, f.count ? 2 : 0)}%`,
                        background: "var(--gradient)",
                        transformOrigin: "left",
                        animation: `bar-grow 700ms var(--ease-out) ${i * 70}ms both`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <section
              className="rise rounded-card border border-border bg-surface p-5 shadow-sm"
              style={{ "--i": 3 } as React.CSSProperties}
            >
              <h2 className="mb-3 text-sm font-semibold">Tiempo promedio por etapa (días)</h2>
              <ul className="divide-y divide-border text-sm">
                {Object.entries(m.avgDaysInStatus)
                  .filter(([, v]) => v !== null)
                  .map(([k, v]) => (
                    <li key={k} className="flex justify-between py-2">
                      <span>{statusLabels[k as ApplicationStatus] ?? k}</span>
                      <span className="tabular-nums text-muted">{v}</span>
                    </li>
                  ))}
                {Object.values(m.avgDaysInStatus).every((v) => v === null) && (
                  <li className="py-6 text-center text-muted">
                    Aún no hay movimientos suficientes.
                  </li>
                )}
              </ul>
            </section>
            <section
              className="rise rounded-card border border-border bg-surface p-5 shadow-sm"
              style={{ "--i": 4 } as React.CSSProperties}
            >
              <h2 className="mb-3 text-sm font-semibold">Origen de las postulaciones</h2>
              <ul className="space-y-3 text-sm">
                {m.sources.map((s) => (
                  <li key={s.key}>
                    <div className="flex justify-between">
                      <span>{s.label}</span>
                      <span className="tabular-nums text-muted">{s.count}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(s.count / totalSources) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
