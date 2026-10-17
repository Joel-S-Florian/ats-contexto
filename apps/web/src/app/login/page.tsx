"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Briefcase, Loader2, LogIn } from "lucide-react";
import { api, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api("/auth/login", {
        method: "POST",
        body: { email: form.get("email"), password: form.get("password") },
      });
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo conectar con el servidor");
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="rise w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-contrast shadow-md">
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
      </div>
    </div>
  );
}
