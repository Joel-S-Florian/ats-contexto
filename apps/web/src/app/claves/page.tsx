"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/app-shell";
import { Badge, EmptyState, Field, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Key {
  id: string;
  label: string;
  publicKey: string;
  allowedOrigins: string[];
  revokedAt: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function Copy_({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copiar"
      className="btn-ghost !p-1.5"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export default function KeysPage() {
  const { me } = useAuth();
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(
    () =>
      api<Key[]>("/api-keys")
        .then(setKeys)
        .catch((e: ApiError) => toast.error(e.message)),
    [],
  );
  useEffect(() => {
    if (me.role === "admin") void load();
  }, [load, me.role]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setSaving(true);
    try {
      await api("/api-keys", {
        method: "POST",
        body: {
          label: d.get("label"),
          allowedOrigins: String(d.get("origins"))
            .split(/[\s,]+/)
            .filter(Boolean),
        },
      });
      toast.success("Clave creada");
      form.reset();
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error inesperado");
    }
    setSaving(false);
  }

  async function revoke(k: Key) {
    if (!confirm(`¿Revocar la clave "${k.label}"? El widget dejará de funcionar con ella.`)) return;
    try {
      await api(`/api-keys/${k.id}`, { method: "DELETE" });
      toast.success("Clave revocada");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error inesperado");
    }
  }

  if (me.role !== "admin")
    return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Widget y claves"
        subtitle="La clave pública identifica a tu empresa en el widget. Solo funciona desde los orígenes que autorices."
      />
      <form
        onSubmit={create}
        style={{ "--i": 1 } as React.CSSProperties}
        className="rise mb-6 grid gap-3 rounded-card border border-border bg-surface p-5 shadow-sm sm:grid-cols-[1fr_2fr_auto] sm:items-end"
      >
        <Field label="Nombre">
          <input name="label" required placeholder="Página de empleo" className="field" />
        </Field>
        <Field
          label="Orígenes permitidos"
          hint="Separados por coma o espacio. https obligatorio (excepto localhost)."
        >
          <input
            name="origins"
            required
            placeholder="https://empleo.miempresa.com"
            className="field"
          />
        </Field>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Crear
        </button>
      </form>

      <section className="rounded-card border border-border bg-surface shadow-sm">
        {!keys ? (
          <div className="space-y-3 p-5">
            <div className="skeleton h-16" />
          </div>
        ) : keys.length === 0 ? (
          <EmptyState icon={<KeyRound size={20} />} title="Aún no tienes claves" />
        ) : (
          <ul>
            {keys.map((k, i) => {
              const snippet = `<div id="careers-widget"></div>\n<script src="https://cdn.tudominio.com/widget.js"\n  data-key="${k.publicKey}"\n  data-api="${API_URL}"\n  data-mode="jobs"></script>`;
              return (
                <li
                  key={k.id}
                  style={{ "--i": i } as React.CSSProperties}
                  className="rise border-b border-border p-5 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{k.label}</p>
                    {k.revokedAt && <Badge tone="danger">Revocada</Badge>}
                    <code className="rounded bg-surface-2 px-2 py-0.5 text-xs">{k.publicKey}</code>
                    <Copy_ text={k.publicKey} />
                    {!k.revokedAt && (
                      <button
                        aria-label="Revocar"
                        onClick={() => revoke(k)}
                        className="btn-danger ml-auto !p-1.5"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {k.allowedOrigins.map((o) => (
                      <Badge key={o}>{o}</Badge>
                    ))}
                  </div>
                  {!k.revokedAt && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-muted">Código para incrustar</summary>
                      <div className="relative mt-2">
                        <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs">
                          {snippet}
                        </pre>
                        <div className="absolute right-2 top-2">
                          <Copy_ text={snippet} />
                        </div>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
