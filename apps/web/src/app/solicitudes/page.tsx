"use client";
import { useCallback, useEffect, useState } from "react";
import { Building2, Inbox, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { leadStatusLabels, leadStatuses } from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

type Status = (typeof leadStatuses)[number];
interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string | null;
  size: string;
  message: string;
  status: Status;
  notes: string;
  createdAt: string;
}
const tone = {
  new: "accent",
  contacted: "neutral",
  demo_scheduled: "warning",
  converted: "success",
  discarded: "danger",
} as const;

/** Solicitudes de demo captadas en la landing comercial (solo el operador de la plataforma). */
export default function LeadsPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState<"all" | Status>("all");

  const load = useCallback(
    () =>
      api<Lead[]>(`/admin/leads${filter === "all" ? "" : `?status=${filter}`}`)
        .then(setRows)
        .catch((e: ApiError) => toast.error(e.message)),
    [filter],
  );
  useEffect(() => {
    if (me.isSuperAdmin) void load();
  }, [load, me.isSuperAdmin]);

  async function update(id: string, body: { status?: Status; notes?: string }) {
    try {
      await api(`/admin/leads/${id}`, { method: "PATCH", body });
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
  }

  if (!me.isSuperAdmin)
    return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Solicitudes de demo"
        subtitle="Interesados que llegaron desde la landing. Al convertir uno, crea su empresa en Empresas."
      />
      <div className="rise mb-4 flex flex-wrap gap-1.5" role="tablist">
        {(["all", ...leadStatuses] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={filter === s}
            onClick={() => {
              setRows(null);
              setFilter(s);
            }}
            className={`press rounded-lg px-3 py-1.5 text-sm font-medium ${filter === s ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            {s === "all" ? "Todas" : leadStatusLabels[s]}
          </button>
        ))}
      </div>
      <section className="rounded-card border border-border bg-surface shadow-sm">
        {!rows ? (
          <div className="skeleton m-5 h-20" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={20} />}
            title="No hay solicitudes aquí"
            hint="Llegarán cuando alguien llene el formulario de la landing."
          />
        ) : (
          <ul>
            {rows.map((l, i) => (
              <li
                key={l.id}
                style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
                className="rise border-b border-border p-5 last:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{l.company}</p>
                  <Badge tone={tone[l.status]}>{leadStatusLabels[l.status]}</Badge>
                  <span className="text-xs text-muted">
                    {new Date(l.createdAt).toLocaleString("es-DO", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  <select
                    aria-label="Estado"
                    value={l.status}
                    onChange={(e) => update(l.id, { status: e.target.value as Status })}
                    className="field ml-auto w-auto !py-1"
                  >
                    {leadStatuses.map((s) => (
                      <option key={s} value={s}>
                        {leadStatusLabels[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Building2 size={12} />
                    {l.name} · {l.size} personas
                  </span>
                  <a
                    href={`mailto:${l.email}`}
                    className="inline-flex items-center gap-1 hover:text-fg"
                  >
                    <Mail size={12} />
                    {l.email}
                  </a>
                  {l.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={12} />
                      {l.phone}
                    </span>
                  )}
                </p>
                {l.message && <p className="mt-2 text-sm">{l.message}</p>}
                <input
                  defaultValue={l.notes}
                  onBlur={(e) =>
                    e.target.value !== l.notes && update(l.id, { notes: e.target.value })
                  }
                  placeholder="Notas internas"
                  aria-label="Notas internas"
                  className="field mt-3 !py-1.5"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
