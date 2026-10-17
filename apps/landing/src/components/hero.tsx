import { ArrowRight, Check, MapPin } from "lucide-react";
import { hero } from "@/content/es";

/** Vista de producto ilustrativa (HTML/SVG, sin imágenes): una ficha de candidato con su puntaje y el porqué. */
function ProductMock() {
  const r = 34;
  const c = 2 * Math.PI * r;
  const dims = [
    { label: "Habilidades requeridas", v: 92 },
    { label: "Experiencia relevante", v: 78 },
    { label: "Formación", v: 70 },
    { label: "Ubicación", v: 100 },
  ];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div
        className="float absolute -left-6 top-10 z-10 hidden rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium shadow-md sm:block"
        style={{ "--d": 0 } as React.CSSProperties}
      >
        <span className="mr-1.5 inline-block size-2 rounded-full bg-success" />
        Preseleccionada automáticamente
      </div>
      <div
        className="float absolute -right-4 bottom-16 z-10 hidden rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium shadow-md sm:block"
        style={{ "--d": 1.5 } as React.CSSProperties}
      >
        Entrevista agendada · viernes 10:00
      </div>
      <div
        className="rounded-2xl border border-border bg-surface p-5 shadow-md"
        style={{ boxShadow: "var(--shadow-md), 0 30px 60px -30px rgb(88 70 230 / .35)" }}
      >
        <div className="flex items-center gap-4">
          <div className="relative size-[84px] shrink-0">
            <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
              <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
              <circle
                cx="42"
                cy="42"
                r={r}
                fill="none"
                stroke="var(--success)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={c}
                className="ring-draw"
                style={{ "--len": c, "--off": c * 0.14 } as React.CSSProperties}
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-2xl font-semibold tabular-nums">
              86
            </span>
          </div>
          <div>
            <p className="font-semibold">María Fernández</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
              <MapPin size={12} />
              Santo Domingo · Desarrollo Backend
            </p>
            <span className="mt-2 inline-flex rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
              Avanzar
            </span>
          </div>
        </div>
        <ul className="mt-5 space-y-3">
          {dims.map((d, i) => (
            <li key={d.label}>
              <div className="flex justify-between text-xs">
                <span className="font-medium">{d.label}</span>
                <span className="tabular-nums text-muted">{d.v}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="bar-grow h-full rounded-full"
                  style={
                    {
                      width: `${d.v}%`,
                      background: "var(--gradient)",
                      "--d": i,
                    } as React.CSSProperties
                  }
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-lg bg-bg p-3 text-xs text-muted">
          Cumple 3 de 3 habilidades requeridas y supera la experiencia mínima. Decide siempre una
          persona.
        </p>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section id="inicio" className="mesh relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.1fr_1fr] md:pb-28 md:pt-20">
        <div>
          <p className="reveal in mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted shadow-sm">
            <span className="size-1.5 rounded-full bg-accent" />
            {hero.eyebrow}
          </p>
          <h1 className="text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
            Contrata mejor, con decisiones que{" "}
            <span className="text-gradient">puedes explicar.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted">{hero.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#demo" className="btn btn-primary">
              {hero.cta}
              <ArrowRight size={18} aria-hidden />
            </a>
            <a href="#como-funciona" className="btn btn-ghost">
              {hero.secondary}
            </a>
          </div>
          <ul className="mt-8 space-y-2 text-sm text-muted">
            {hero.proof.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <Check size={16} className="text-success" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <ProductMock />
      </div>
    </section>
  );
}
