"use client";
import { useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { demo } from "@/content/es";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_URL;

/** Solicitud de demo -> POST /public/v1/leads. Sin registro autoservicio ni pago en línea. */
export function DemoForm() {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    setError("");
    try {
      const res = await fetch(`${API}/public/v1/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          company: f.get("company"),
          email: f.get("email"),
          phone: f.get("phone") || undefined,
          size: f.get("size"),
          message: f.get("message") || "",
          consent: f.get("consent") === "on",
          // Con Turnstile, aquí va el token del widget; en desarrollo el servidor acepta "dev-ok".
          captchaToken: "dev-ok",
          website: f.get("website") ?? "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] };
      if (!res.ok)
        throw new Error(data.issues?.join(". ") ?? data.error ?? "No pudimos enviar tu solicitud.");
      setState("done");
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "No pudimos conectar con el servidor. Inténtalo de nuevo."
          : (err as Error).message,
      );
      setState("idle");
    }
  }

  return (
    <section id="demo" aria-labelledby="demo-t" className="mx-auto max-w-6xl px-5 py-20">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-accent">Demo</p>
          <h2 id="demo-t" className="text-3xl font-semibold sm:text-4xl">
            {demo.title}
          </h2>
          <p className="mt-4 text-lg text-muted">{demo.subtitle}</p>
          <ul className="mt-6 space-y-3">
            {demo.points.map((p) => (
              <li key={p} className="flex items-center gap-3">
                <CheckCircle2 size={18} className="text-success" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
          {DEMO_URL && (
            <div className="mt-8 rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <p className="font-semibold">{demo.live.title}</p>
              <p className="mt-1 text-sm text-muted">{demo.live.text}</p>
              <a
                href={DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost mt-4 !py-2 text-sm"
              >
                {demo.live.cta}
                <ExternalLink size={14} aria-hidden />
              </a>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-7 shadow-md">
          {state === "done" ? (
            <div role="status" className="py-10 text-center">
              <CheckCircle2 size={44} className="mx-auto text-success" aria-hidden />
              <p className="mt-4 text-lg font-semibold">{demo.success}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium">
                Nombre
                <input
                  name="name"
                  required
                  minLength={2}
                  autoComplete="name"
                  className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 transition-shadow focus:outline-none focus:ring-4 focus:ring-accent-soft"
                />
              </label>
              <label className="text-sm font-medium">
                Empresa
                <input
                  name="company"
                  required
                  minLength={2}
                  autoComplete="organization"
                  className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 transition-shadow focus:outline-none focus:ring-4 focus:ring-accent-soft"
                />
              </label>
              <label className="text-sm font-medium">
                Correo de trabajo
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 transition-shadow focus:outline-none focus:ring-4 focus:ring-accent-soft"
                />
              </label>
              <label className="text-sm font-medium">
                Teléfono <span className="font-normal text-muted">(opcional)</span>
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 transition-shadow focus:outline-none focus:ring-4 focus:ring-accent-soft"
                />
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                Tamaño de la empresa
                <select
                  name="size"
                  required
                  defaultValue=""
                  className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 focus:outline-none focus:ring-4 focus:ring-accent-soft"
                >
                  <option value="" disabled>
                    Selecciona
                  </option>
                  {demo.sizes.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium sm:col-span-2">
                ¿Qué te gustaría resolver?{" "}
                <span className="font-normal text-muted">(opcional)</span>
                <textarea
                  name="message"
                  rows={3}
                  maxLength={1000}
                  className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 transition-shadow focus:outline-none focus:ring-4 focus:ring-accent-soft"
                />
              </label>
              {/* Señuelo para bots: las personas no lo ven ni lo llenan. */}
              <div aria-hidden className="absolute -left-[9999px]">
                <label>
                  No llenar
                  <input name="website" tabIndex={-1} autoComplete="off" />
                </label>
              </div>
              <label className="flex items-start gap-3 text-sm sm:col-span-2">
                <input
                  name="consent"
                  type="checkbox"
                  required
                  className="mt-1 size-4 accent-[var(--accent)]"
                />
                <span>
                  {demo.consent}{" "}
                  <a
                    href="/privacidad"
                    className="font-medium text-accent underline underline-offset-2"
                  >
                    Leer política
                  </a>
                </span>
              </label>
              <div aria-live="polite" className="sm:col-span-2">
                {error && (
                  <p className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
                    {error}
                  </p>
                )}
              </div>
              <button disabled={state === "sending"} className="btn btn-primary sm:col-span-2">
                {state === "sending" ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                ) : null}
                Solicitar demo
                {state !== "sending" && <ArrowRight size={18} aria-hidden />}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
