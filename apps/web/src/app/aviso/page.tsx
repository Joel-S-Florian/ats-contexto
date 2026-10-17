"use client";
import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/app-shell";
import { Badge, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Notice {
  version?: string;
  label?: string;
  title: string;
  body: string[];
  createdAt?: string;
}

/** Aviso de tratamiento de datos que ve el candidato: versionado, y cada postulación guarda qué versión aceptó. */
export default function NoticePage() {
  const { me } = useAuth();
  const [current, setCurrent] = useState<Notice | null>(null);
  const [versions, setVersions] = useState<Notice[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ current: Notice; versions: Notice[] }>("/admin/notice-versions");
    setCurrent(r.current);
    setVersions(r.versions);
    setTitle(r.current.title);
    setText(r.current.body.join("\n\n"));
  }, []);
  useEffect(() => {
    if (me.isSuperAdmin) load().catch((e: ApiError) => toast.error(e.message));
  }, [load, me.isSuperAdmin]);

  async function publish() {
    setBusy(true);
    try {
      await api("/admin/notice-versions", {
        method: "POST",
        body: {
          title,
          body: text
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean),
        },
      });
      toast.success("Nueva versión publicada");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setBusy(false);
  }

  if (!me.isSuperAdmin)
    return <p className="text-sm text-muted">No tienes acceso a esta sección.</p>;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Aviso de tratamiento de datos"
        subtitle="Cada cambio crea una versión nueva. Los formularios con la versión anterior piden recargar."
        action={current && <Badge tone="accent">Vigente: {current.version}</Badge>}
      />
      <section
        className="rise space-y-3 rounded-card border border-border bg-surface p-5 shadow-sm"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        <label className="block text-sm font-medium">
          Título
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field mt-1.5"
          />
        </label>
        <label className="block text-sm font-medium">
          Texto (separa los párrafos con una línea en blanco)
          <textarea
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="field mt-1.5"
          />
        </label>
        <p className="text-xs text-muted">
          Debe informar quién es el responsable, para qué se usan los datos, que pueden tratarse con
          herramientas automatizadas (incluida IA) con revisión humana, el plazo de conservación y
          cómo ejercer acceso, rectificación y eliminación.
        </p>
        <div className="flex justify-end">
          <button
            onClick={publish}
            disabled={busy || !title.trim() || !text.trim()}
            className="btn-primary"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}Publicar
            nueva versión
          </button>
        </div>
      </section>
      <section
        className="rise mt-5 rounded-card border border-border bg-surface p-5 shadow-sm"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <FileText size={16} className="text-muted" />
          Historial de versiones
        </h2>
        {versions.length === 0 ? (
          <p className="text-sm text-muted">
            Se está usando el texto base. Publica una versión para personalizarlo.
          </p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {versions.map((v) => (
              <li key={v.label} className="flex items-center justify-between py-2">
                <span className="font-medium">{v.label}</span>
                <span className="text-xs text-muted">
                  {v.createdAt &&
                    new Date(v.createdAt).toLocaleString("es-DO", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
