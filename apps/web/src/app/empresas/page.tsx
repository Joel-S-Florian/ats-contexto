"use client";
import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { planKeys, plans, type PlanKey } from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { api, ApiError } from "@/lib/api";

function PlanControl({ t, onSaved }: { t: Tenant; onSaved: () => void }) {
  const [planKey, setPlanKey] = useState<PlanKey>(t.planKey);
  const [saving, setSaving] = useState(false);
  const dirty = planKey !== t.planKey;
  async function save() {
    setSaving(true);
    try {
      await api(`/admin/tenants/${t.id}/plan`, { method: "PATCH", body: { planKey } });
      toast.success("Plan asignado");
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setSaving(false);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Plan"
        value={planKey}
        onChange={(e) => setPlanKey(e.target.value as PlanKey)}
        className="field w-auto !py-1.5"
      >
        {planKeys.map((k) => (
          <option key={k} value={k}>
            {plans[k].name} · US$ {plans[k].priceUsd}
          </option>
        ))}
      </select>
      {dirty && (
        <button onClick={save} disabled={saving} className="btn-primary !px-3 !py-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : "Asignar"}
        </button>
      )}
    </div>
  );
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  planKey: PlanKey;
}

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default function TenantsPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<Tenant[] | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(
    () =>
      api<Tenant[]>("/admin/tenants")
        .then(setRows)
        .catch((e: ApiError) => toast.error(e.message)),
    [],
  );
  useEffect(() => {
    if (me.isSuperAdmin) void load();
  }, [load, me.isSuperAdmin]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setSaving(true);
    try {
      await api("/admin/tenants", {
        method: "POST",
        body: {
          name: d.get("name"),
          slug: d.get("slug"),
          adminEmail: d.get("adminEmail"),
          planKey: d.get("planKey"),
        },
      });
      toast.success("Empresa creada. Se envió la invitación al administrador.");
      form.reset();
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Error inesperado");
    }
    setSaving(false);
  }

  if (!me.isSuperAdmin)
    return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="rise mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
        <p className="mt-1 text-sm text-muted">
          Alta de clientes. El administrador recibe una invitación para crear su contraseña.
        </p>
      </header>

      <form
        onSubmit={create}
        style={stagger(1)}
        className="rise mb-6 grid gap-3 rounded-card border border-border bg-surface p-5 shadow-sm sm:grid-cols-[1fr_1fr_1fr_auto_auto] sm:items-end"
      >
        <label className="text-sm font-medium">
          Nombre
          <input name="name" required className="field mt-1.5" />
        </label>
        <label className="text-sm font-medium">
          Identificador
          <input
            name="slug"
            required
            pattern="[a-z0-9\-]{2,40}"
            placeholder="mi-empresa"
            className="field mt-1.5"
          />
        </label>
        <label className="text-sm font-medium">
          Correo del administrador
          <input name="adminEmail" type="email" required className="field mt-1.5" />
        </label>
        <label className="text-sm font-medium">
          Plan
          <select name="planKey" defaultValue="essential" className="field mt-1.5">
            {planKeys.map((k) => (
              <option key={k} value={k}>
                {plans[k].name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Crear
        </button>
      </form>

      <section className="rounded-card border border-border bg-surface shadow-sm">
        <h2 className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-semibold">
          <Building2 size={16} className="text-muted" />
          Clientes
        </h2>
        {!rows ? (
          <div className="space-y-3 p-5">
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
          </div>
        ) : (
          <ul>
            {rows.map((t, i) => (
              <li
                key={t.id}
                style={stagger(i)}
                className="rise flex items-center justify-between border-b border-border px-5 py-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted">{t.slug}</p>
                </div>
                <PlanControl t={t} onSaved={load} />
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${t.status === "active" ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
                >
                  {t.status === "active" ? "Activa" : "Suspendida"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
