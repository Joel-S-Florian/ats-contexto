"use client";
import { useState } from "react";
import { Loader2, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ScoreChip } from "@/components/screening";
import { api, ApiError } from "@/lib/api";

interface Suggestion {
  applicationId: string;
  candidate: { fullName: string; location: string; yearsExperience: number };
  mode: string;
  overall: number;
  recommendation: string;
  reasons: string[];
}

/** Bolsa de talento: candidatos de postulaciones generales afines a esta vacante. RRHH decide si contacta. */
export function Suggestions({ vacancyId }: { vacancyId: string }) {
  const [rows, setRows] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setRows(await api<Suggestion[]>(`/vacancies/${vacancyId}/suggestions?limit=20`));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Error inesperado");
    }
    setLoading(false);
  }

  return (
    <section className="rise rounded-card border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={16} className="text-accent" />
            Sugeridos de la bolsa de talento
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Postulaciones generales afines a esta vacante. El sistema no contacta a nadie.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="btn-ghost">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {rows ? "Actualizar" : "Buscar sugeridos"}
        </button>
      </div>
      {rows && (
        <ul className="mt-4 divide-y divide-border">
          {rows.length === 0 && (
            <li className="py-6 text-center text-sm text-muted">
              No hay candidatos afines en la bolsa.
            </li>
          )}
          {rows.map((r, i) => (
            <li
              key={r.applicationId}
              style={{ "--i": i } as React.CSSProperties}
              className="rise flex flex-wrap items-center gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.candidate.fullName}</p>
                <p className="flex flex-wrap gap-x-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} />
                    {r.candidate.location}
                  </span>
                  <span>{r.candidate.yearsExperience} años de experiencia</span>
                </p>
                {r.reasons[0] && <p className="mt-0.5 text-xs text-muted">{r.reasons[0]}</p>}
              </div>
              <ScoreChip s={{ overall: r.overall, recommendation: r.recommendation }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
