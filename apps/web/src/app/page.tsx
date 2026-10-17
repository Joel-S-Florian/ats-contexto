"use client";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Handshake,
  Inbox,
  MessagesSquare,
  UserCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/components/app-shell";
import { SystemStatus } from "@/components/system-status";
import { api } from "@/lib/api";

const stages = [
  { name: "Postulación", icon: FileText },
  { name: "Preselección", icon: ClipboardList },
  { name: "Entrevista", icon: MessagesSquare },
  { name: "Evaluación", icon: ClipboardCheck },
  { name: "Selección", icon: UserCheck },
  { name: "Contratación", icon: Handshake },
  { name: "Seguimiento", icon: Activity },
];

/** Número que sube hasta su valor; sin animación si el usuario prefiere menos movimiento. */
function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(value);
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / 700, 1);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <>{n}</>;
}

interface Stats {
  published: number;
  drafts: number;
  applications: number;
  toReview: number;
  pool: number;
}

export default function Home() {
  const { me } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!me.role) return;
    Promise.all([
      api<{ status: string }[]>("/vacancies"),
      api<{ status: string; vacancyId: string | null }[]>("/applications"),
    ])
      .then(([v, a]) =>
        setStats({
          published: v.filter((x) => x.status === "published").length,
          drafts: v.filter((x) => x.status === "draft").length,
          applications: a.length,
          toReview: a.filter((x) => x.status === "in_review" || x.status === "received").length,
          pool: a.filter((x) => !x.vacancyId).length,
        }),
      )
      .catch(() => setStats(null));
  }, [me.role]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  const kpis = stats && [
    {
      label: "Vacantes publicadas",
      value: stats.published,
      hint: `${stats.drafts} en borrador`,
      icon: Briefcase,
    },
    { label: "Postulaciones", value: stats.applications, hint: "Recibidas en total", icon: Inbox },
    {
      label: "Por revisar",
      value: stats.toReview,
      hint: "Esperan una decisión",
      icon: ClipboardList,
    },
    { label: "Bolsa de talento", value: stats.pool, hint: "Postulaciones generales", icon: Users },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="rise mb-8">
        <p className="text-sm text-muted">{greeting},</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          <span className="text-gradient">{me.name}</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Así va tu proceso de contratación hoy.</p>
      </header>

      {me.role && (
        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis
            ? kpis.map(({ label, value, hint, icon: Icon }, i) => (
                <div
                  key={label}
                  style={{ "--i": i } as React.CSSProperties}
                  className="rise lift rounded-card border border-border bg-surface p-4 shadow-sm"
                >
                  <span className="kpi-icon flex size-9 items-center justify-center rounded-lg">
                    <Icon size={18} />
                  </span>
                  <p className="mt-4 text-3xl font-semibold tabular-nums tracking-tight">
                    <CountUp value={value} />
                  </p>
                  <p className="mt-0.5 text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted">{hint}</p>
                </div>
              ))
            : [0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-36 !rounded-[var(--radius-lg)]" />
              ))}
        </section>
      )}

      <section className="mb-6 rounded-card border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold">Embudo por defecto</h2>
        <p className="mb-4 text-xs text-muted">
          Cada empresa puede ajustar etapas por vacante en Embudos.
        </p>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {stages.map(({ name, icon: Icon }, i) => (
            <li
              key={name}
              style={{ "--i": i } as React.CSSProperties}
              className="rise lift flex flex-col items-start gap-3 rounded-xl border border-border bg-bg p-3"
            >
              <span className="kpi-icon flex size-8 items-center justify-center rounded-lg">
                <Icon size={16} />
              </span>
              <span className="text-sm font-medium">{name}</span>
              <span className="text-xs text-muted">Etapa {i + 1}</span>
            </li>
          ))}
        </ol>
      </section>

      {(me.role === "admin" || me.isSuperAdmin) && <SystemStatus />}
    </div>
  );
}
