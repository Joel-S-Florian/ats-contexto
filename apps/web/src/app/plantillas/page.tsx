"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Loader2, Mail, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { templateVariables } from "@ats/shared";
import { useAuth } from "@/components/app-shell";
import { Badge, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

interface Template {
  key: string;
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
  custom: boolean;
}
interface Preview {
  subject: string;
  html: string;
  unknown: string[];
}

export default function TemplatesPage() {
  const { me } = useAuth();
  const canEdit = me.role === "admin";
  const [list, setList] = useState<Template[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Template | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(
    async (select?: string) => {
      const l = await api<Template[]>("/email-templates");
      setList(l);
      const t = l.find((x) => x.key === (select ?? sel)) ?? l[0];
      setSel(t?.key ?? null);
      setDraft(t ?? null);
    },
    [sel],
  );
  useEffect(() => {
    load().catch((e: ApiError) => toast.error(e.message));
    // carga inicial solamente
  }, []);

  // Vista previa en vivo, con retraso corto para no llamar a la API en cada tecla.
  useEffect(() => {
    if (!draft) return;
    const id = setTimeout(() => {
      api<Preview>("/email-templates/preview", {
        method: "POST",
        body: { subject: draft.subject, body: draft.body },
      })
        .then(setPreview)
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(id);
  }, [draft?.subject, draft?.body, draft]);

  function insert(v: string) {
    const el = bodyRef.current;
    if (!el || !draft) return;
    const at = el.selectionStart ?? draft.body.length;
    setDraft({
      ...draft,
      body: `${draft.body.slice(0, at)}{{${v}}}${draft.body.slice(el.selectionEnd ?? at)}`,
    });
    el.focus();
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      await api(`/email-templates/${draft.key}`, {
        method: "PUT",
        body: { subject: draft.subject, body: draft.body, enabled: draft.enabled },
      });
      toast.success("Plantilla guardada");
      await load(draft.key);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setBusy(false);
  }
  async function reset() {
    if (!draft || !confirm("¿Restablecer la plantilla original?")) return;
    await api(`/email-templates/${draft.key}`, { method: "DELETE" });
    toast.success("Plantilla restablecida");
    await load(draft.key);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Plantillas de correo"
        subtitle="Los mensajes que reciben los candidatos. Usa variables y revisa la vista previa antes de guardar."
      />
      {!list || !draft ? (
        <div className="skeleton h-80" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[220px_1fr_1fr]">
          <nav className="rise space-y-1" aria-label="Plantillas">
            {list.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setSel(t.key);
                  setDraft(t);
                }}
                className={`press flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ${t.key === sel ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
              >
                <span className="truncate">{t.name}</span>
                {t.custom && <Badge tone="accent">Propia</Badge>}
              </button>
            ))}
          </nav>

          <section
            className="rise space-y-3 rounded-card border border-border bg-surface p-5 shadow-sm"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            <label className="block text-sm font-medium">
              Asunto
              <input
                value={draft.subject}
                disabled={!canEdit}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="field mt-1.5"
              />
            </label>
            <label className="block text-sm font-medium">
              Mensaje
              <textarea
                ref={bodyRef}
                rows={12}
                value={draft.body}
                disabled={!canEdit}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="field mt-1.5 font-mono !text-[13px]"
              />
            </label>
            {canEdit && (
              <div className="flex flex-wrap gap-1">
                {templateVariables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insert(v)}
                    className="press rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
                  >{`{{${v}}}`}</button>
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.enabled}
                disabled={!canEdit}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                className="size-4 accent-[var(--accent)]"
              />
              Enviar este correo automáticamente
            </label>
            {canEdit && (
              <div className="flex justify-between">
                <button onClick={reset} disabled={!draft.custom} className="btn-ghost">
                  <RotateCcw size={14} />
                  Restablecer
                </button>
                <button onClick={save} disabled={busy} className="btn-primary">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  Guardar
                </button>
              </div>
            )}
          </section>

          <section
            className="rise rounded-card border border-border bg-surface p-5 shadow-sm"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Eye size={16} className="text-muted" />
              Vista previa
            </h2>
            {preview && (
              <>
                <p className="flex items-center gap-2 border-b border-border pb-3 text-sm font-medium">
                  <Mail size={14} className="text-muted" />
                  {preview.subject}
                </p>
                {/* El HTML lo genera el servidor escapando cada variable; solo contiene <p> y <br>. */}
                <div
                  className="prose-email mt-3 space-y-3 text-sm"
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
                {preview.unknown.length > 0 && (
                  <p className="mt-3 rounded-lg bg-warning-soft p-2 text-xs text-warning">
                    Variables desconocidas: {preview.unknown.map((u) => `{{${u}}}`).join(", ")}
                  </p>
                )}
              </>
            )}
            <p className="mt-4 text-xs text-muted">
              La vista previa usa datos de ejemplo, nunca de candidatos reales.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
