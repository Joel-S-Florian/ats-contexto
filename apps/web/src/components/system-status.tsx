"use client";
import { CheckCircle2, XCircle, Database, Server, HardDrive } from "lucide-react";
import { useEffect, useState } from "react";

type Health = { status: string; services: Record<string, "ok" | "down"> };
const labels: Record<string, { name: string; icon: typeof Server }> = {
  database: { name: "Base de datos", icon: Database },
  redis: { name: "Cola (Redis)", icon: HardDrive },
};

export function SystemStatus() {
  const [state, setState] = useState<{ loading: boolean; data?: Health }>({ loading: true });
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    fetch(`${url}/health`)
      .then((r) => r.json() as Promise<Health>)
      .then((data) => setState({ loading: false, data }))
      .catch(() => setState({ loading: false }));
  }, []);

  const rows = state.data ? Object.entries(state.data.services) : [];
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Server size={16} className="text-muted" />
        Estado del sistema
      </h2>
      {state.loading ? (
        <div className="space-y-3">
          <div className="skeleton h-9" />
          <div className="skeleton h-9" />
        </div>
      ) : !state.data ? (
        <p className="flex items-center gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          <XCircle size={16} />
          No se pudo contactar la API.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(([key, s], i) => {
            const { name, icon: Icon } = labels[key] ?? { name: key, icon: Server };
            const ok = s === "ok";
            return (
              <li
                key={key}
                style={{ "--i": i } as React.CSSProperties}
                className="rise flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <Icon size={16} className="text-muted" />
                  {name}
                </span>
                <span
                  className={`flex items-center gap-1.5 font-medium ${ok ? "text-success" : "text-danger"}`}
                >
                  {ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {ok ? "Operativo" : "Sin conexión"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
