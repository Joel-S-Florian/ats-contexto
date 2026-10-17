import { features, how, problem, trust } from "@/content/es";
import { Icon } from "./icons";
import { Reveal } from "./reveal";

const Heading = ({
  eyebrow,
  title,
  subtitle,
  id,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  id: string;
}) => (
  <Reveal className="mx-auto mb-12 max-w-2xl text-center">
    {eyebrow && (
      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">{eyebrow}</p>
    )}
    <h2 id={id} className="text-3xl font-semibold sm:text-4xl">
      {title}
    </h2>
    <p className="mt-4 text-lg text-muted">{subtitle}</p>
  </Reveal>
);

export function Problem() {
  return (
    <section aria-labelledby="problema" className="mx-auto max-w-6xl px-5 py-20">
      <Heading id="problema" title={problem.title} subtitle={problem.subtitle} />
      <ul className="grid gap-5 md:grid-cols-3">
        {problem.items.map((it, i) => (
          <Reveal
            as="li"
            key={it.title}
            delay={i}
            className="lift rounded-2xl border border-border bg-surface p-6 shadow-sm"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
              <Icon name={it.icon} />
            </span>
            <h3 className="mt-5 text-lg font-semibold">{it.title}</h3>
            <p className="mt-2 text-muted">{it.text}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export function How() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="como"
      className="border-y border-border bg-surface"
    >
      <div className="mx-auto max-w-6xl px-5 py-20">
        <Heading id="como" eyebrow="Cómo funciona" title={how.title} subtitle={how.subtitle} />
        <ol className="grid gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {how.steps.map((s, i) => (
            <Reveal as="li" key={s.title} delay={i % 3} className="relative">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white"
                  style={{ background: "var(--gradient)" }}
                >
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="text-sm font-semibold text-muted">Paso {i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-muted">{s.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section id="funcionalidades" aria-labelledby="func" className="mx-auto max-w-6xl px-5 py-20">
      <Heading
        id="func"
        eyebrow="Funcionalidades"
        title={features.title}
        subtitle={features.subtitle}
      />
      <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.items.map((it, i) => (
          <Reveal
            as="li"
            key={it.title}
            delay={i % 3}
            className="lift group rounded-2xl border border-border bg-surface p-6 shadow-sm"
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent-soft text-accent transition-transform duration-300 group-hover:scale-110">
              <Icon name={it.icon} />
            </span>
            <h3 className="mt-5 text-lg font-semibold">{it.title}</h3>
            <p className="mt-2 text-muted">{it.text}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

export function Trust() {
  return (
    <section
      id="confianza"
      aria-labelledby="conf"
      className="relative overflow-hidden text-white"
      style={{ background: "linear-gradient(135deg, #1b1747 0%, #3b2d9e 55%, #5846e6 100%)" }}
    >
      <div
        className="absolute -right-32 -top-32 size-96 rounded-full bg-white/10 blur-3xl"
        aria-hidden
      />
      <div className="relative mx-auto max-w-6xl px-5 py-20">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">
            Confianza y privacidad
          </p>
          <h2 id="conf" className="text-3xl font-semibold sm:text-4xl">
            {trust.title}
          </h2>
          <p className="mt-4 text-lg text-white/75">{trust.subtitle}</p>
        </Reveal>
        <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {trust.items.map((it, i) => (
            <Reveal
              as="li"
              key={it.title}
              delay={i % 3}
              className="rounded-2xl border border-white/15 bg-white/[0.07] p-6 backdrop-blur transition-colors duration-300 hover:bg-white/[0.12]"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-white/15">
                <Icon name={it.icon} />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{it.title}</h3>
              <p className="mt-2 text-white/75">{it.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
