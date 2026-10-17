"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Play, ShieldCheck } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Question {
  id: string;
  type: "multiple_choice" | "true_false" | "short_answer";
  prompt: string;
  options: string[];
  points: number;
  module: string;
}
interface Exam {
  status: "invited" | "in_progress" | "submitted" | "expired";
  company?: string;
  title?: string;
  description?: string;
  timeLimitMin?: number;
  expiresAt?: string;
  remainingSeconds?: number;
  questions?: Question[];
  answers?: Record<string, number | boolean | string>;
}
type Answers = Record<string, number | boolean | string>;

async function http<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as T };
}
const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Página del candidato: acceso solo por enlace personal. El tiempo restante lo manda el servidor. */
export default function ExamPage() {
  const { token } = useParams<{ token: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = useRef<Answers>({});
  const submitted = useRef(false);

  const apply = useCallback((e: Exam) => {
    setExam(e);
    if (e.answers) setAnswers(e.answers);
    if (e.remainingSeconds !== undefined) setRemaining(e.remainingSeconds);
  }, []);

  useEffect(() => {
    http<Exam>(`/exam/${token}`).then(({ status, data }) => {
      if (status === 404) return setInvalid(true);
      apply(status === 410 ? { ...data, status: "expired" } : data);
    });
  }, [token, apply]);

  // Cuenta regresiva local; se corrige con el valor del servidor en cada guardado.
  useEffect(() => {
    if (exam?.status !== "in_progress") return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [exam?.status]);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    const r = await http<{ status: string }>(`/exam/${token}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers: { ...answers, ...dirty.current } }),
    });
    setBusy(false);
    if (r.status === 200 || r.status === 409)
      setExam({ status: "submitted", title: exam?.title, company: exam?.company });
    else {
      submitted.current = false;
      setError("No pudimos enviar tus respuestas. Revisa tu conexión e inténtalo de nuevo.");
    }
  }, [answers, exam?.company, exam?.title, token]);

  // Al llegar a cero se envía solo lo que ya está respondido.
  useEffect(() => {
    if (exam?.status === "in_progress" && remaining === 0) void submit();
  }, [remaining, exam?.status, submit]);

  // Autoguardado con retraso corto.
  useEffect(() => {
    if (exam?.status !== "in_progress" || Object.keys(dirty.current).length === 0) return;
    const id = setTimeout(async () => {
      const batch = dirty.current;
      dirty.current = {};
      const r = await http<{ remainingSeconds?: number }>(`/exam/${token}/answers`, {
        method: "PUT",
        body: JSON.stringify({ answers: batch }),
      });
      if (r.status === 200 && r.data.remainingSeconds !== undefined)
        setRemaining(r.data.remainingSeconds);
      else if (r.status !== 200) dirty.current = { ...batch, ...dirty.current };
    }, 800);
    return () => clearTimeout(id);
  }, [answers, exam?.status, token]);

  const set = (id: string, v: number | boolean | string) => {
    dirty.current[id] = v;
    setAnswers((a) => ({ ...a, [id]: v }));
  };

  async function start() {
    setBusy(true);
    const r = await http<Exam>(`/exam/${token}/start`, { method: "POST" });
    setBusy(false);
    if (r.status === 200) apply(r.data);
    else setError("No se pudo iniciar el examen.");
  }

  const shell = (children: React.ReactNode) => (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="rise w-full max-w-2xl">{children}</div>
    </div>
  );

  if (invalid)
    return shell(
      <div className="rounded-card border border-border bg-surface p-8 text-center shadow-sm">
        <AlertCircle className="mx-auto text-danger" />
        <h1 className="mt-3 text-lg font-semibold">Este enlace no es válido</h1>
        <p className="mt-1 text-sm text-muted">
          Revisa el correo que recibiste o escribe a la empresa.
        </p>
      </div>,
    );
  if (!exam) return shell(<div className="skeleton h-64 !rounded-[var(--radius-lg)]" />);

  if (exam.status === "expired")
    return shell(
      <div className="rounded-card border border-border bg-surface p-8 text-center shadow-sm">
        <Clock className="mx-auto text-warning" />
        <h1 className="mt-3 text-lg font-semibold">El enlace venció</h1>
        <p className="mt-1 text-sm text-muted">
          Pide a la empresa que te envíe una nueva invitación.
        </p>
      </div>,
    );
  if (exam.status === "submitted")
    return shell(
      <div className="rounded-card border border-border bg-surface p-8 text-center shadow-sm">
        <span className="ok mx-auto mb-4 grid size-14 place-items-center rounded-full bg-success-soft text-success">
          <CheckCircle2 size={28} />
        </span>
        <h1 className="text-lg font-semibold">¡Gracias! Recibimos tus respuestas</h1>
        <p className="mt-1 text-sm text-muted">
          {exam.company} revisará tu evaluación y te contactará. Ya puedes cerrar esta página.
        </p>
      </div>,
    );

  if (exam.status === "invited")
    return shell(
      <div className="rounded-card border border-border bg-surface p-8 shadow-sm">
        <p className="text-sm text-muted">{exam.company}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{exam.title}</h1>
        {exam.description && <p className="mt-2 text-sm text-muted">{exam.description}</p>}
        <ul className="mt-6 space-y-3 text-sm">
          <li className="flex gap-3">
            <Clock size={18} className="shrink-0 text-accent" />
            Tienes <b>{exam.timeLimitMin} minutos</b> desde que presiones Comenzar. El tiempo lo
            controla el servidor y no se detiene.
          </li>
          <li className="flex gap-3">
            <ShieldCheck size={18} className="shrink-0 text-accent" />
            Este enlace es personal y de un solo uso: no podrás reabrirlo después de enviar.
          </li>
          <li className="flex gap-3">
            <CheckCircle2 size={18} className="shrink-0 text-accent" />
            Tus respuestas se guardan solas. Si se acaba el tiempo, se envía lo que alcanzaste a
            responder.
          </li>
        </ul>
        {error && <p className="mt-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
        <button onClick={start} disabled={busy} className="btn-primary mt-6 w-full">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}Comenzar
          examen
        </button>
      </div>,
    );

  const qs = exam.questions ?? [];
  const modules = [...new Set(qs.map((q) => q.module))];
  const answered = qs.filter((q) => answers[q.id] !== undefined && answers[q.id] !== "").length;
  const total = (exam.timeLimitMin ?? 1) * 60;
  const low = remaining <= 60;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24">
      <header className="glass sticky top-0 z-10 -mx-4 mb-6 flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{exam.title}</p>
          <p className="text-xs text-muted">
            {answered} de {qs.length} respondidas
          </p>
        </div>
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-lg font-semibold tabular-nums ${low ? "bg-danger-soft text-danger" : "bg-surface-2"}`}
          style={low ? { animation: "pulse-soft 1s ease-in-out infinite" } : undefined}
          role="timer"
          aria-live="off"
        >
          <Clock size={16} />
          {mmss(remaining)}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-2">
          <div
            className="h-full bg-accent transition-[width] duration-1000 ease-linear"
            style={{ width: `${(remaining / total) * 100}%` }}
          />
        </div>
      </header>

      {modules.map((m) => (
        <section key={m} className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{m}</h2>
          <ol className="space-y-4">
            {qs
              .filter((q) => q.module === m)
              .map((q) => (
                <li
                  key={q.id}
                  className="rise rounded-card border border-border bg-surface p-5 shadow-sm"
                >
                  <p className="text-sm font-medium">{q.prompt}</p>
                  <p className="mb-3 text-xs text-muted">
                    {q.points} {q.points === 1 ? "punto" : "puntos"}
                  </p>
                  {q.type === "short_answer" ? (
                    <textarea
                      rows={4}
                      maxLength={2000}
                      value={String(answers[q.id] ?? "")}
                      onChange={(e) => set(q.id, e.target.value)}
                      className="field"
                    />
                  ) : (
                    <div className="space-y-2" role="radiogroup" aria-label={q.prompt}>
                      {(q.type === "true_false" ? ["Verdadero", "Falso"] : q.options).map(
                        (label, i) => {
                          const value = q.type === "true_false" ? i === 0 : i;
                          const on = answers[q.id] === value;
                          return (
                            <button
                              key={label}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              onClick={() => set(q.id, value)}
                              className={`press flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${on ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
                            >
                              <span
                                className={`grid size-4 shrink-0 place-items-center rounded-full border ${on ? "border-accent" : "border-border"}`}
                              >
                                {on && <span className="size-2 rounded-full bg-accent" />}
                              </span>
                              {label}
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}
                </li>
              ))}
          </ol>
        </section>
      ))}

      {error && <p className="mb-4 rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/90 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <p className="text-xs text-muted">Se guarda automáticamente</p>
          <button
            onClick={() => {
              if (
                answered === qs.length ||
                confirm(`Te faltan ${qs.length - answered} pregunta(s). ¿Enviar de todas formas?`)
              )
                void submit();
            }}
            disabled={busy}
            className="btn-primary"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}Enviar respuestas
          </button>
        </div>
      </div>
    </div>
  );
}
