"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Briefcase, Loader2, LogIn, Zap } from "lucide-react";
import { api, ApiError } from "@/lib/api";

// Solo desarrollo: cuentas del seed (packages/db/src/seed.ts). Next elimina este bloque en el build de produccion.
const QUICK =
  process.env.NODE_ENV !== "production"
    ? [
        { label: "Administrador", email: "admin@demo.test" },
        { label: "Reclutador", email: "recruiter@demo.test" },
        { label: "Responsable de área", email: "area_manager@demo.test" },
        { label: "Operador (super admin)", email: "root@demo.test" },
      ]
    : [];

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(email: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: { email, password } });
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor");
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void signIn(String(form.get("email")), String(form.get("password")));
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside
        className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{ background: "var(--gradient)" }}
      >
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-black/20 blur-3xl" />
        <div className="relative flex items-center gap-2 font-semibold">
          <Briefcase size={20} />
          Reclutamiento
        </div>
        <div className="relative max-w-md">
          <h2 className="rise text-4xl font-semibold leading-tight tracking-tight">
            Contrata mejor, con decisiones que puedes explicar.
          </h2>
          <p className="rise mt-4 text-white/80" style={{ "--i": 2 } as React.CSSProperties}>
            Recibe postulaciones desde tu página de empleo, deja que el sistema preseleccione y
            dedica tu tiempo a los mejores candidatos.
          </p>
        </div>
        <p className="relative text-sm text-white/60">
          Cada puntaje trae su justificación. Siempre decide una persona.
        </p>
      </aside>
      <div className="grid place-items-center px-4 py-10">
        <div className="rise w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="brand-mark flex size-12 items-center justify-center rounded-2xl">
              <Briefcase size={22} />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Iniciar sesión</h1>
              <p className="mt-1 text-sm text-muted">
                Accede al panel de reclutamiento de tu empresa.
              </p>
            </div>
          </div>
          <form
            onSubmit={onSubmit}
            className="space-y-4 rounded-card border border-border bg-surface p-6 shadow-sm"
          >
            <label className="block text-sm font-medium">
              Correo electrónico
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                className="field mt-1.5"
              />
            </label>
            <label className="block text-sm font-medium">
              Contraseña
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="field mt-1.5"
              />
            </label>
            <div aria-live="polite">
              {error && (
                <p className="rise flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  <AlertCircle size={16} className="shrink-0" />
                  {error}
                </p>
              )}
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              Entrar
            </button>
          </form>
          {QUICK.length > 0 && (
            <div
              className="rise mt-4 rounded-card border border-dashed border-border p-4"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <Zap size={14} />
                Acceso rápido de desarrollo
              </p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK.map((q) => (
                  <button
                    key={q.email}
                    type="button"
                    disabled={loading}
                    onClick={() => signIn(q.email, "demo-demo-1234")}
                    className="btn-ghost !px-2 !py-2 text-xs"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
