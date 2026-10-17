import { Check, Infinity as InfinityIcon } from "lucide-react";
import { USD_TO_DOP_REFERENCE, planKeys, plans, type PlanKey } from "@ats/shared";
import { pricing } from "@/content/es";
import { Reveal } from "./reveal";

const n = (v: number) => v.toLocaleString("es-DO");

/** Planes y precios: se leen de @ats/shared, la misma fuente que usa el panel para sus límites. No se duplican cifras. */
export function Pricing() {
  return (
    <section id="planes" aria-labelledby="planes-t" className="border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">
            Planes y precios
          </p>
          <h2 id="planes-t" className="text-3xl font-semibold sm:text-4xl">
            {pricing.title}
          </h2>
          <p className="mt-4 text-lg text-muted">{pricing.subtitle}</p>
        </Reveal>
        <ul className="grid items-stretch gap-6 lg:grid-cols-3">
          {planKeys.map((k: PlanKey, i) => {
            const p = plans[k];
            const popular = k === pricing.popular;
            return (
              <Reveal
                as="li"
                key={k}
                delay={i}
                className={`relative flex flex-col rounded-2xl border p-7 ${popular ? "border-accent bg-surface shadow-md" : "border-border bg-bg"}`}
              >
                {popular && (
                  <span
                    className="absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ background: "var(--gradient)" }}
                  >
                    El más elegido
                  </span>
                )}
                <h3 className="text-xl font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-muted">{p.audience}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tabular-nums tracking-tight">
                    US$ {p.priceUsd}
                  </span>
                  <span className="text-muted">/ mes</span>
                </p>
                <p className="text-xs text-muted">
                  ≈ RD$ {n(p.priceUsd * USD_TO_DOP_REFERENCE)} (referencia)
                </p>
                <dl className="mt-6 grid grid-cols-2 gap-3 border-y border-border py-5 text-sm">
                  <div>
                    <dt className="text-xs text-muted">Vacantes activas</dt>
                    <dd className="font-semibold">
                      {p.limits.activeVacancies ?? (
                        <span className="inline-flex items-center gap-1">
                          <InfinityIcon size={14} aria-hidden />
                          Ilimitadas
                        </span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Postulaciones / mes</dt>
                    <dd className="font-semibold">{n(p.limits.applicationsPerMonth)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Usuarios</dt>
                    <dd className="font-semibold">{p.limits.users}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Análisis de IA / mes</dt>
                    <dd className="font-semibold">
                      {p.limits.aiAnalysesPerMonth === 0
                        ? "Sin IA"
                        : n(p.limits.aiAnalysesPerMonth)}
                    </dd>
                  </div>
                </dl>
                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex gap-2.5">
                      <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
                      {h}
                    </li>
                  ))}
                </ul>
                <a href="#demo" className={`btn mt-7 ${popular ? "btn-primary" : "btn-ghost"}`}>
                  {pricing.cta}
                </a>
              </Reveal>
            );
          })}
        </ul>
        <p className="mt-8 text-center text-sm text-muted">{pricing.note}</p>
      </div>
    </section>
  );
}
