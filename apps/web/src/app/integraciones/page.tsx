"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Loader2,
  PlugZap,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/app-shell";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  rotatedAt: string | null;
}
interface Delivery {
  id: string;
  endpointId: string;
  event: string;
  status: "pending" | "success" | "failed";
  attempts: number;
  nextAttemptAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
}
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const fmt = (d: string) =>
  new Date(d).toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "short" });
const tone = { pending: "warning", success: "success", failed: "danger" } as const;
const label = { pending: "Pendiente", success: "Entregada", failed: "Fallida" } as const;

function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copiar"
      className="btn-ghost !p-1.5"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

/** API de contratados: destinos de webhook firmados, entregas con reintentos y exportación. */
export default function IntegrationsPage() {
  const { me } = useAuth();
  const [eps, setEps] = useState<Endpoint[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [e, d] = await Promise.all([
      api<Endpoint[]>("/webhook-endpoints"),
      api<Delivery[]>("/webhook-deliveries"),
    ]);
    setEps(e);
    setDeliveries(d);
  }, []);
  useEffect(() => {
    if (me.role === "admin") load().catch((e: ApiError) => toast.error(e.message));
  }, [load, me.role]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setBusy(false);
  }

  async function download(format: "json" | "csv") {
    const res = await fetch(`${API}/hires/export?format=${format}`, { credentials: "include" });
    if (!res.ok) return toast.error("No se pudo exportar");
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `contratados.${format}`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (me.role !== "admin")
    return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Integraciones"
        subtitle="Envía a tu nómina o sistema de RRHH a cada persona contratada, con un webhook firmado."
        action={
          <div className="flex gap-2">
            <button onClick={() => download("json")} className="btn-ghost">
              <Download size={14} />
              JSON
            </button>
            <button onClick={() => download("csv")} className="btn-ghost">
              <Download size={14} />
              CSV
            </button>
          </div>
        }
      />

      {secret && (
        <div className="rise mb-5 rounded-card border border-accent bg-accent-soft p-4">
          <p className="text-sm font-medium">
            Copia el secreto de firma ahora: no se volverá a mostrar.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1.5 text-xs">
              {secret.value}
            </code>
            <CopyButton text={secret.value} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Valida cada envío con HMAC SHA-256 de <code>{"{timestamp}.{cuerpo}"}</code> y rechaza
            marcas de tiempo con más de 5 minutos de diferencia. Hay un receptor de ejemplo en el
            sitio de pruebas.
          </p>
          <button onClick={() => setSecret(null)} className="btn-ghost mt-3 !py-1">
            Ya lo guardé
          </button>
        </div>
      )}

      <form
        className="rise mb-5 flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-sm sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget;
          const url = String(new FormData(f).get("url"));
          void run(async () => {
            const r = await api<{ id: string; secret: string }>("/webhook-endpoints", {
              method: "POST",
              body: { url },
            });
            setSecret({ id: r.id, value: r.secret });
            f.reset();
          }, "Destino creado");
        }}
      >
        <label className="flex-1 text-sm font-medium">
          URL del receptor (https)
          <input
            name="url"
            required
            placeholder="https://nomina.miempresa.com/webhooks/ats"
            className="field mt-1.5"
          />
        </label>
        <button disabled={busy} className="btn-primary">
          <Plus size={16} />
          Agregar destino
        </button>
      </form>

      <section className="rounded-card border border-border bg-surface shadow-sm">
        <h2 className="border-b border-border px-5 py-3 text-sm font-semibold">Destinos</h2>
        {!eps ? (
          <div className="skeleton m-5 h-12" />
        ) : eps.length === 0 ? (
          <EmptyState
            icon={<PlugZap size={20} />}
            title="Aún no tienes destinos"
            hint="Agrega la URL de tu sistema para recibir el evento candidate.hired."
          />
        ) : (
          <ul>
            {eps.map((e, i) => (
              <li
                key={e.id}
                style={{ "--i": i } as React.CSSProperties}
                className="rise flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.url}</p>
                  <p className="text-xs text-muted">
                    {e.events.join(", ")}
                    {e.rotatedAt ? ` · secreto rotado ${fmt(e.rotatedAt)}` : ""}
                  </p>
                </div>
                <Badge tone={e.active ? "success" : "neutral"}>
                  {e.active ? "Activo" : "Desactivado"}
                </Badge>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await api<{ result: string }>(`/webhook-endpoints/${e.id}/test`, {
                        method: "POST",
                      });
                      toast[r.result === "success" ? "success" : "error"](
                        r.result === "success"
                          ? "El receptor respondió correctamente"
                          : "El receptor no respondió bien; se reintentará",
                      );
                    })
                  }
                  className="btn-ghost !px-2.5 !py-1 text-xs"
                >
                  <Send size={12} />
                  Probar
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    confirm("¿Rotar el secreto? El anterior dejará de funcionar.") &&
                    run(async () => {
                      const r = await api<{ secret: string }>(
                        `/webhook-endpoints/${e.id}/rotate-secret`,
                        { method: "POST" },
                      );
                      setSecret({ id: e.id, value: r.secret });
                    })
                  }
                  className="btn-ghost !px-2.5 !py-1 text-xs"
                >
                  <RefreshCw size={12} />
                  Rotar secreto
                </button>
                <button
                  aria-label="Eliminar"
                  disabled={busy}
                  onClick={() =>
                    confirm("¿Eliminar este destino?") &&
                    run(
                      () => api(`/webhook-endpoints/${e.id}`, { method: "DELETE" }),
                      "Destino eliminado",
                    )
                  }
                  className="btn-danger !p-1.5"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5 rounded-card border border-border bg-surface shadow-sm">
        <h2 className="flex items-center justify-between border-b border-border px-5 py-3 text-sm font-semibold">
          Entregas recientes
          <button onClick={() => load()} className="btn-ghost !px-2.5 !py-1 text-xs">
            <RefreshCw size={12} />
            Actualizar
          </button>
        </h2>
        {deliveries.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">Sin entregas todavía.</p>
        ) : (
          <ul>
            {deliveries.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-0"
              >
                <Badge tone={tone[d.status]}>{label[d.status]}</Badge>
                <span className="font-medium">{d.event}</span>
                <span className="text-xs text-muted">
                  {d.attempts} {d.attempts === 1 ? "intento" : "intentos"}
                  {d.lastStatus ? ` · HTTP ${d.lastStatus}` : ""} · {fmt(d.createdAt)}
                </span>
                {d.status === "pending" && d.nextAttemptAt && (
                  <span className="text-xs text-muted">próximo intento {fmt(d.nextAttemptAt)}</span>
                )}
                {d.lastError && d.status !== "success" && (
                  <span className="w-full text-xs text-danger">{d.lastError}</span>
                )}
                {d.status !== "success" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api(`/webhook-deliveries/${d.id}/resend`, { method: "POST" }),
                        "Reenvío intentado",
                      )
                    }
                    className="btn-ghost ml-auto !px-2.5 !py-1 text-xs"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                    Reenviar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
