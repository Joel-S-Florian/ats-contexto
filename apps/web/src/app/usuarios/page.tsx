"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, MailPlus, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/app-shell";
import { api, ApiError, roleLabels, type Role } from "@/lib/api";

interface Row {
  id: string;
  name: string;
  email: string;
  role: Role;
}

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default function UsersPage() {
  const { me } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(
    () =>
      api<Row[]>("/users")
        .then(setRows)
        .catch((e: ApiError) => toast.error(e.message)),
    [],
  );
  useEffect(() => {
    if (me.role === "admin") void load();
  }, [load, me.role]);

  async function run(action: () => Promise<unknown>, ok: string) {
    try {
      await action();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
  }

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setSending(true);
    await run(
      () =>
        api("/users/invitations", {
          method: "POST",
          body: { email: data.get("email"), role: data.get("role") },
        }),
      "Invitación enviada",
    );
    form.reset();
    setSending(false);
  }

  if (me.role !== "admin")
    return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="rise mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="mt-1 text-sm text-muted">
          Gestiona quién tiene acceso a tu empresa y con qué rol.
        </p>
      </header>

      <form
        onSubmit={invite}
        style={stagger(1)}
        className="rise mb-6 flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-end"
      >
        <label className="flex-1 text-sm font-medium">
          Invitar por correo
          <input
            name="email"
            type="email"
            required
            placeholder="persona@empresa.com"
            className="field mt-1.5"
          />
        </label>
        <label className="text-sm font-medium">
          Rol
          <select name="role" defaultValue="recruiter" className="field mt-1.5">
            {Object.entries(roleLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={sending} className="btn-primary">
          {sending ? <Loader2 size={16} className="animate-spin" /> : <MailPlus size={16} />}
          Invitar
        </button>
      </form>

      <section className="rounded-card border border-border bg-surface shadow-sm">
        <h2 className="flex items-center gap-2 border-b border-border px-5 py-3 text-sm font-semibold">
          <UserCog size={16} className="text-muted" />
          Equipo
        </h2>
        {!rows ? (
          <div className="space-y-3 p-5">
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
            <div className="skeleton h-10" />
          </div>
        ) : (
          <ul>
            {rows.map((u, i) => (
              <li
                key={u.id}
                style={stagger(i)}
                className="rise flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {u.name}
                    {u.id === me.id && <span className="ml-2 text-xs text-muted">(tú)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{u.email}</p>
                </div>
                <select
                  aria-label={`Rol de ${u.name}`}
                  value={u.role}
                  disabled={u.id === me.id}
                  onChange={(e) =>
                    run(
                      () =>
                        api(`/users/${u.id}`, { method: "PATCH", body: { role: e.target.value } }),
                      "Rol actualizado",
                    )
                  }
                  className="field w-auto"
                >
                  {Object.entries(roleLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <button
                  aria-label={`Quitar a ${u.name}`}
                  disabled={u.id === me.id}
                  onClick={() =>
                    confirm(`¿Quitar a ${u.name} de la empresa?`) &&
                    run(() => api(`/users/${u.id}`, { method: "DELETE" }), "Usuario eliminado")
                  }
                  className="btn-danger px-2.5"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
