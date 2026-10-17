import { ChevronDown } from "lucide-react";
import { faq } from "@/content/es";
import { Reveal } from "./reveal";

/** Preguntas frecuentes con <details>: accesible por teclado y sin JavaScript. */
export function Faq() {
  return (
    <section id="preguntas" aria-labelledby="faq-t" className="mx-auto max-w-3xl px-5 py-20">
      <Reveal className="mb-10 text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">Preguntas</p>
        <h2 id="faq-t" className="text-3xl font-semibold sm:text-4xl">
          {faq.title}
        </h2>
      </Reveal>
      <div className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-sm">
        {faq.items.map((it) => (
          <details key={it.q} className="group px-6">
            <summary className="flex items-center justify-between gap-4 py-5 font-medium">
              {it.q}
              <ChevronDown size={18} className="chev shrink-0 text-muted" aria-hidden />
            </summary>
            <div className="pb-5 text-muted">{it.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
