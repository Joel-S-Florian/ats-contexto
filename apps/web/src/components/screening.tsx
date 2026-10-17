"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, ListChecks, ShieldAlert, XCircle } from "lucide-react";
import { Badge } from "@/components/ui";

export interface Screening {
  mode: "rules" | "ai";
  overall: number | null;
  recommendation: string;
  dimensions: { key: string; score: number; justification: string; evidence: string[] }[];
  matched: string[];
  missing: string[];
  reasons: string[];
  knockoutReasons: string[];
  riskFlags: { code: string; detail: string }[];
  confidence: string | null;
  notes: string[];
  promptVersion: string | null;
  weightsVersion: string;
}

export const dimensionLabels: Record<string, string> = {
  req_skills: "Habilidades requeridas",
  nice_skills: "Habilidades deseables",
  experience: "Experiencia relevante",
  education: "Formación y credenciales",
  location: "Ubicación y modalidad",
  languages: "Idiomas",
  evidence: "Evidencia de logros",
};

export const recommendationUi: Record<
  string,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  advance: { label: "Avanzar", tone: "success" },
  review: { label: "Revisar", tone: "warning" },
  low_fit: { label: "Baja compatibilidad", tone: "danger" },
  knocked_out: { label: "No cumple requisitos mínimos", tone: "danger" },
};

const color = (n: number) =>
  n >= 65 ? "var(--success)" : n >= 45 ? "var(--warning)" : "var(--danger)";

/** Anillo de puntaje que se dibuja al entrar (stroke-dashoffset), sin animar si se prefiere menos movimiento. */
export function ScoreRing({ value, size = 76 }: { value: number; size?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={7}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color(value)}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 900ms var(--ease-out)" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xl font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

export function ScoreChip({ s }: { s: { overall: number | null; recommendation: string } | null }) {
  if (!s) return null;
  const ui = recommendationUi[s.recommendation];
  return (
    <span className="inline-flex items-center gap-1.5">
      {s.overall !== null && (
        <span
          className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs font-semibold tabular-nums"
          style={{ color: color(s.overall) }}
        >
          {s.overall}
        </span>
      )}
      {ui && <Badge tone={ui.tone}>{ui.label}</Badge>}
    </span>
  );
}

/** El "por qué" de la preselección: dimensiones, justificaciones, evidencia y banderas. Todo se muestra como texto plano. */
export function ScreeningCard({ s }: { s: Screening }) {
  const ui = recommendationUi[s.recommendation];
  return (
    <section className="rise rounded-xl border border-border bg-bg p-4">
      <div className="flex items-center gap-4">
        {s.overall !== null ? (
          <ScoreRing value={s.overall} />
        ) : (
          <span className="grid size-[76px] shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
            <XCircle size={28} />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {ui && <Badge tone={ui.tone}>{ui.label}</Badge>}
            <Badge tone="neutral">
              <span className="inline-flex items-center gap-1">
                {s.mode === "ai" ? <Bot size={12} /> : <ListChecks size={12} />}
                {s.mode === "ai" ? "Análisis con IA" : "Reglas"}
              </span>
            </Badge>
            {s.confidence && (
              <Badge tone="neutral">
                Confianza{" "}
                {s.confidence === "high" ? "alta" : s.confidence === "low" ? "baja" : "media"}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Pesos {s.weightsVersion}
            {s.promptVersion ? ` · prompt ${s.promptVersion}` : ""} · decide siempre una persona
          </p>
        </div>
      </div>

      {s.riskFlags.length > 0 && (
        <div className="mt-4 flex gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">El CV contiene texto sospechoso; revísalo con cuidado.</p>
            <ul className="mt-1 list-disc pl-4 text-xs">
              {s.riskFlags.map((f) => (
                <li key={f.detail}>{f.detail}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {s.knockoutReasons.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg bg-danger-soft p-3 text-sm text-danger">
          {s.knockoutReasons.map((r) => (
            <li key={r} className="flex gap-2">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      )}

      {s.dimensions.length > 0 && (
        <ul className="mt-4 space-y-3">
          {s.dimensions.map((d, i) => (
            <li key={d.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{dimensionLabels[d.key] ?? d.key}</span>
                <span className="tabular-nums text-muted">{d.score}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${d.score}%`,
                    background: color(d.score),
                    transformOrigin: "left",
                    animation: `bar-grow 700ms var(--ease-out) ${i * 60}ms both`,
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">{d.justification}</p>
              {d.evidence.length > 0 && (
                <p className="mt-0.5 text-xs italic text-muted">
                  &ldquo;{d.evidence.join(" · ")}&rdquo;
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {(s.matched.length > 0 || s.missing.length > 0) && (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-success">
              <CheckCircle2 size={14} />
              Cumple
            </p>
            <div className="flex flex-wrap gap-1">
              {s.matched.map((m) => (
                <Badge key={m} tone="success">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-danger">
              <AlertTriangle size={14} />
              Falta
            </p>
            <div className="flex flex-wrap gap-1">
              {s.missing.map((m) => (
                <Badge key={m} tone="danger">
                  {m}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {s.reasons.length > 0 && (
        <ul className="mt-4 list-disc space-y-0.5 pl-5 text-sm">
          {s.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {s.notes.length > 0 && <p className="mt-3 text-xs text-muted">{s.notes.join(" ")}</p>}
    </section>
  );
}
