import { ArrowLeft } from "lucide-react";
import { legal } from "@/content/es";
import { Footer } from "./footer";

export function LegalPage({
  doc,
}: {
  doc: { title: string; sections: { h: string; p: string }[] };
}) {
  return (
    <>
      <main id="contenido" className="mx-auto max-w-3xl px-5 py-14">
        <a href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-accent">
          <ArrowLeft size={16} aria-hidden />
          Volver al inicio
        </a>
        <h1 className="text-4xl font-semibold">{doc.title}</h1>
        <p className="mt-4 rounded-xl bg-warning-soft p-4 text-sm text-warning">
          {legal.draftNotice}
        </p>
        {doc.sections.map((s) => (
          <section key={s.h} className="mt-8">
            <h2 className="text-xl font-semibold">{s.h}</h2>
            <p className="mt-2 text-muted">{s.p}</p>
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}
