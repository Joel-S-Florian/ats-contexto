"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { labels, vacancyStatuses } from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { Badge, EmptyState, PageHeader, statusTone } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Row {
  id: string;
  title: string;
  department: string;
  status: (typeof vacancyStatuses)[number];
  workMode: keyof typeof labels.workMode;
  province: string;
  level: keyof typeof labels.level;
  openings: number;
}

export default function VacanciesPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<"all" | Row["status"]>("all");
  const canWrite = me.role === "admin" || me.role === "recruiter";

  useEffect(() => {
    api<Row[]>("/vacancies")
      .then(setRows)
      .catch((e: ApiError) => toast.error(e.message));
  }, []);

  const visible = useMemo(
    () => (rows ?? []).filter((r) => filter === "all" || r.status === filter),
    [rows, filter],
  );
  const count = (s: Row["status"]) => (rows ?? []).filter((r) => r.status === s).length;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Vacantes"
        subtitle="Define el perfil, el embudo y publica para recibir postulaciones."
        action={
          canWrite && (
            <Link href="/vacantes/nueva" className="btn-primary">
              <Plus size={16} />
              Nueva vacante
            </Link>
          )
        }
      />

      <div
        className="rise mb-4 flex flex-wrap gap-1.5"
        style={{ "--i": 1 } as React.CSSProperties}
        role="tablist"
      >
        {(["all", ...vacancyStatuses] as const).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={filter === s}
            onClick={() => setFilter(s)}
            className={`press rounded-lg px-3 py-1.5 text-sm font-medium ${filter === s ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            {s === "all" ? "Todas" : labels.status[s]}
            {rows && (
              <span className="ml-1.5 text-xs opacity-70">
                {s === "all" ? rows.length : count(s)}
              </span>
            )}
          </button>
        ))}
      </div>

      <section className="rounded-card border border-border bg-surface shadow-sm">
        {!rows ? (
          <div className="space-y-3 p-5">
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
            <div className="skeleton h-14" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Briefcase size={20} />}
            title={rows.length ? "No hay vacantes con este estado" : "Aún no hay vacantes"}
            hint={
              canWrite && !rows.length
                ? "Crea la primera para empezar a recibir postulaciones."
                : undefined
            }
          />
        ) : (
          <ul>
            {visible.map((v, i) => (
              <li
                key={v.id}
                style={{ "--i": i } as React.CSSProperties}
                className="rise border-b border-border last:border-0"
              >
                <Link
                  href={`/vacantes/${v.id}`}
                  className="press flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                      <span>{v.department}</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={12} />
                        {v.province} · {labels.workMode[v.workMode]}
                      </span>
                      <span>{labels.level[v.level]}</span>
                      <span>
                        {v.openings} {v.openings === 1 ? "plaza" : "plazas"}
                      </span>
                    </p>
                  </div>
                  <Badge tone={statusTone[v.status]}>{labels.status[v.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
